import { capacidad } from '../capacidadesPreparacion';
import { esCampoPersona, esPedible, esPedibleParticipante, SUJETO_PRINCIPAL, type CampoDato } from '../datosPrueba/contrato';
import { ETAPAS_AFI, type CampoAfi, type EtapaAfi, type PerfilActorAfi, type PoliticaCampo } from '../modelo';
import { PANTALLAS_AFI } from '../aplicacion/pantallas';
import type { ModeloAplicacion, PantallaDeclarada } from '../aplicacion/modeloAplicacion';
import { POLITICAS_AFI, politicasDelPerfil } from '../politicas';
import type { DefinicionE2E } from './contrato';

/**
 * RECORRIDO DERIVADO (puro). El caso declara a qué pantallas quiere llegar y qué hace en ellas; el compilador DERIVA desde
 * Knowledge (transicion-ui) qué pantallas atravesar desde el último punto que el runner ya alcanza, qué exige cada una
 * para dejarla (preparación por políticas de su etapa, formulario ligado a un sujeto o documentos) y qué falta (Knowledge,
 * capability o Test Data). No conoce ningún perfil, pantalla ni CP concretos: todo sale del modelo y de las políticas.
 */

export type ClasificacionRuta = 'CAPABILITY_GAP' | 'KNOWLEDGE_GAP' | 'TEST_DATA_GAP';
export interface ProblemaRuta { pantalla: string; clasificacion: ClasificacionRuta; motivo: string; raiz: { id: string; bloquea: 'recorrido' | 'asercion' }; requiere?: string[] }

/** Campo de un formulario de pantalla (Knowledge): etiqueta visible + dato que captura. Nunca un selector. */
export interface CampoFormulario { campo: string; etiqueta: string; control: string; dato?: CampoDato; obligatorio: boolean }

export type PreparacionPantalla =
  /** Se diligencia con las políticas de la etapa (driver de etapa existente). */
  | { tipo: 'etapa'; etapa: EtapaAfi }
  /** Formulario ligado a UN sujeto (principal o participante); `consulta` si identifica y consulta a una persona. */
  | { tipo: 'formulario'; sujeto: string; campos: CampoFormulario[]; consulta?: string }
  /** Carga de archivos permitidos. */
  | { tipo: 'documentos'; campos: CampoFormulario[] }
  | { tipo: 'ninguna' };

/** Acción del caso sobre una pantalla del recorrido, en el orden de los pasos del diseño. */
export interface AccionEnPantalla { accion: 'consultar-persona' | 'diligenciar-obligatorios' | 'cargar-documentos' | 'avanzar'; paso: number; dispositivo: 'desktop' | 'mobile' }

export interface PantallaRuta {
  pantalla: string;
  /** La primera: el punto funcional que entrega el runner (no se espera su llegada, solo se deja). */
  origen?: true;
  /** Encabezado con el que se reconoce la llegada (Knowledge `titulo` o firma 4J). */
  titulo?: string;
  preparacion: PreparacionPantalla;
  /** Transición que la deja hacia la siguiente pantalla de la ruta (ausente en la última). */
  salida?: { transicion: string; hacia: string; avance?: string; condicion?: string };
  /** Secuencia de acciones a ejecutar en la pantalla: las del caso (en orden de pasos) o, en tránsito, las por defecto. */
  acciones: AccionEnPantalla['accion'][];
}

export interface RutaE2E {
  origen: string;
  /** Pantallas en orden, empezando por el origen (que hay que dejar). */
  pantallas: PantallaRuta[];
  /** Problemas que impiden LLEGAR a cada pantalla (acumulados: lo que bloquea X bloquea lo posterior). */
  bloqueosHasta: Record<string, ProblemaRuta[]>;
  /** Problemas que impiden OPERAR/dejar cada pantalla (preparación, acciones). */
  bloqueosEn: Record<string, ProblemaRuta[]>;
  /** Todos los problemas, una vez cada uno. */
  problemas: ProblemaRuta[];
  /** Datos que el tránsito exige y el caso no declaró (se derivan a Test Data). */
  datosTransito: { sujeto: string; campo: CampoDato; pantalla: string }[];
}

export interface ContextoRecorrido {
  perfil: PerfilActorAfi;
  modelo: ModeloAplicacion;
  politicas?: Readonly<Record<CampoAfi, PoliticaCampo>>;
  /** Pantalla desde la que el runner ya entrega el control (punto funcional). */
  origen: string;
  /** Pantallas que el runner ya alcanza por sí mismo (no requieren ruta). */
  alcanzadasPorRunner: readonly string[];
}

const recorrido = (id: string) => ({ id, bloquea: 'recorrido' as const });
const ACCIONES_DE_PANTALLA = ['consultar-persona', 'diligenciar-obligatorios', 'cargar-documentos', 'avanzar'] as const;

export function derivarRecorrido(e2e: DefinicionE2E, ctx: ContextoRecorrido): RutaE2E {
  // Políticas del perfil del caso (incluye variantes observadas: otra etapa o familia para ese perfil).
  const politicas = politicasDelPerfil(ctx.perfil, ctx.politicas ?? POLITICAS_AFI);
  const declaradas = new Map(ctx.modelo.uiDeclarada.pantallas.map(p => [p.id, p]));
  const registrada = (id: string) => ctx.modelo.ui.pantallas.includes(id);

  // ---- 1. Destinos: pantallas del caso más allá de lo que el runner alcanza ----
  const destinos = new Set<string>();
  const acciones = new Map<string, AccionEnPantalla[]>();
  for (const p of e2e.pasos) for (const v of p.verificaciones) {
    if (v.tipo === 'pantalla') destinos.add(v.pantalla);
    if (v.tipo === 'accion') {
      if (v.hasta) destinos.add(v.hasta);
      const donde = v.pantalla ?? (v.sujeto ? (e2e.sujetos ?? []).find(s => s.rol === v.sujeto)?.pantalla : undefined);
      if (donde) destinos.add(donde);
      if (donde && (ACCIONES_DE_PANTALLA as readonly string[]).includes(v.accion) && !(v.accion === 'avanzar' && v.hasta && !v.pantalla)) {
        acciones.set(donde, [...(acciones.get(donde) ?? []), { accion: v.accion as AccionEnPantalla['accion'], paso: p.paso, dispositivo: p.dispositivo ?? 'desktop' }]);
      }
    }
  }
  for (const s of e2e.sujetos ?? []) if (s.pantalla) destinos.add(s.pantalla);
  for (const d of [...destinos]) if (!registrada(d) || d === ctx.origen || ctx.alcanzadasPorRunner.includes(d)) destinos.delete(d);

  // ---- 2. Grafo (Knowledge) y caminos mínimos desde el origen ----
  const salientes = new Map<string, typeof ctx.modelo.uiDeclarada.transiciones>();
  for (const t of ctx.modelo.uiDeclarada.transiciones) salientes.set(t.desde, [...(salientes.get(t.desde) ?? []), t]);
  const previo = new Map<string, { desde: string; t: typeof ctx.modelo.uiDeclarada.transiciones[number] }>();
  const cola = [ctx.origen], vistos = new Set([ctx.origen]);
  while (cola.length) {
    const x = cola.shift()!;
    for (const t of salientes.get(x) ?? []) if (!vistos.has(t.hacia)) { vistos.add(t.hacia); previo.set(t.hacia, { desde: x, t }); cola.push(t.hacia); }
  }
  const camino = (d: string): string[] => { const c: string[] = []; for (let x = d; x !== ctx.origen; x = previo.get(x)!.desde) c.unshift(x); return c; };

  const problemas: ProblemaRuta[] = [];
  const bloqueosHasta: Record<string, ProblemaRuta[]> = {}, bloqueosEn: Record<string, ProblemaRuta[]> = {};
  const datosTransito: RutaE2E['datosTransito'] = [];
  const nuevo = (p: ProblemaRuta) => { const igual = problemas.find(x => x.raiz.id === p.raiz.id && x.pantalla === p.pantalla); if (igual) return igual; problemas.push(p); return p; };

  // Destinos inalcanzables según Knowledge.
  const alcanzables = [...destinos].filter(d => vistos.has(d));
  for (const d of [...destinos].filter(x => !vistos.has(x))) {
    const sinSalida = !(salientes.get(ctx.origen) ?? []).length;
    bloqueosHasta[d] = [nuevo({
      pantalla: d, clasificacion: 'KNOWLEDGE_GAP',
      motivo: sinSalida ? `Knowledge no registra ninguna transición desde "${ctx.origen}": no se puede derivar la ruta hasta "${d}".`
        : `Knowledge no registra una secuencia de transiciones desde "${ctx.origen}" hasta "${d}".`,
      raiz: recorrido(sinSalida ? `knowledge:transicion-ui:desde:${ctx.origen}` : `knowledge:transicion-ui:hacia:${d}`),
      requiere: ['proponer transicion-ui (desde, hacia, avance) por el mecanismo formal de Knowledge'],
    })];
  }
  // La ruta lineal: el camino al destino más lejano debe contener a los demás (un solo recorrido por ejecución).
  const ordenados = alcanzables.sort((a, b) => camino(b).length - camino(a).length);
  const principal = ordenados.length ? camino(ordenados[0]) : [];
  for (const d of ordenados.slice(1).filter(x => !principal.includes(x))) {
    bloqueosHasta[d] = [nuevo({ pantalla: d, clasificacion: 'CAPABILITY_GAP', motivo: `"${d}" está en otra rama del grafo: un recorrido no visita dos ramas.`, raiz: recorrido('capability:recorrido-ramificado') })];
  }

  // ---- 3. Qué exige cada pantalla de la ruta (incluido el origen, que hay que dejar) ----
  const secuencia = [ctx.origen, ...principal];
  const pantallas: PantallaRuta[] = [];
  // Sujeto que ocupa una pantalla: declarado (sujetos[].pantalla) o el de una acción del caso sobre ella.
  const sujetoDePantalla = (s: string): string | undefined => {
    const declarado = (e2e.sujetos ?? []).find(x => x.pantalla === s)?.rol;
    if (declarado) return declarado;
    for (const p of e2e.pasos) for (const v of p.verificaciones) if (v.tipo === 'accion' && v.pantalla === s && v.sujeto && v.accion !== 'avanzar') return v.sujeto;
    return undefined;
  };
  const declaradoPor = (sujeto: string, campo: CampoDato) => e2e.datos.find(d => d.sujeto === sujeto && d.campo === campo);

  for (let i = 0; i < secuencia.length; i++) {
    const s = secuencia[i], siguiente = secuencia[i + 1];
    const decl: PantallaDeclarada | undefined = declaradas.get(s);
    const titulo = decl?.titulo ?? tituloFirma(s);
    const en: ProblemaRuta[] = [];
    // Reconocer la LLEGADA (el origen ya lo entrega el runner).
    if (i > 0 && !titulo) en.push(nuevo({ pantalla: s, clasificacion: 'KNOWLEDGE_GAP', motivo: `"${s}" no tiene un encabezado (titulo) con el que reconocer la llegada.`,
      raiz: recorrido(`knowledge:pantalla-ui:${s}:titulo`), requiere: [`completar pantalla-ui ${s} con titulo`] }));
    const llegada = [...en];
    // Preparación necesaria para DEJARLA (solo si hay que seguir) o para las acciones del caso en ella.
    const accionesCaso = (acciones.get(s) ?? []).map(a => a.accion);
    const hayQueSeguir = !!siguiente || accionesCaso.length > 0;
    const preparacion = hayQueSeguir ? prepararPantalla(s, decl, ctx, politicas, sujetoDePantalla(s), declaradoPor, en, nuevo, datosTransito) : { tipo: 'ninguna' as const };
    let salida: PantallaRuta['salida'];
    if (siguiente) {
      const t = previo.get(siguiente)!.t;
      salida = { transicion: t.id, hacia: siguiente, ...(t.avance ? { avance: t.avance } : {}), ...(t.condicion ? { condicion: t.condicion } : {}) };
      if (!t.avance) en.push(nuevo({ pantalla: s, clasificacion: 'KNOWLEDGE_GAP', motivo: `La transición ${t.id} no declara el texto del botón que avanza (avance).`,
        raiz: recorrido(`knowledge:transicion-ui:${t.id}:avance`) }));
    }
    const porDefecto: PantallaRuta['acciones'] = preparacion.tipo === 'documentos' ? ['cargar-documentos', 'avanzar']
      : preparacion.tipo === 'formulario' ? [...(preparacion.consulta ? ['consultar-persona' as const] : []), 'diligenciar-obligatorios', 'avanzar']
      : preparacion.tipo === 'etapa' ? ['diligenciar-obligatorios', 'avanzar'] : [];
    const secuenciaAcciones = accionesCaso.length ? [...accionesCaso, ...(siguiente && accionesCaso.at(-1) !== 'avanzar' ? ['avanzar' as const] : [])] : siguiente ? porDefecto : [];
    pantallas.push({ pantalla: s, ...(i === 0 ? { origen: true as const } : {}), ...(titulo ? { titulo } : {}), preparacion, ...(salida ? { salida } : {}), acciones: secuenciaAcciones });
    bloqueosEn[s] = en.filter(p => !llegada.includes(p));
    if (i > 0) bloqueosHasta[s] = [...(bloqueosHasta[secuencia[i - 1]] ?? []), ...(bloqueosEn[secuencia[i - 1]] ?? []), ...llegada];
  }
  return { origen: ctx.origen, pantallas, bloqueosHasta, bloqueosEn, problemas, datosTransito };
}

/** Encabezado de la firma 4J (pantallas en TypeScript) si tiene uno. */
function tituloFirma(id: string): string | undefined {
  const p = (PANTALLAS_AFI as Readonly<Record<string, typeof PANTALLAS_AFI[keyof typeof PANTALLAS_AFI]>>)[id];
  const e = p?.senales.find(x => x.tipo === 'encabezado');
  return e && e.tipo === 'encabezado' ? e.textos[0] : undefined;
}

function prepararPantalla(
  s: string, decl: PantallaDeclarada | undefined, ctx: ContextoRecorrido, politicas: Readonly<Record<CampoAfi, PoliticaCampo>>,
  sujeto: string | undefined, declaradoPor: (sujeto: string, campo: CampoDato) => DefinicionE2E['datos'][number] | undefined,
  en: ProblemaRuta[], nuevo: (p: ProblemaRuta) => ProblemaRuta, datosTransito: RutaE2E['datosTransito'],
): PreparacionPantalla {
  const etapa = (ETAPAS_AFI as readonly string[]).includes(s) ? s as EtapaAfi : decl?.etapa as EtapaAfi | undefined;
  const campos = ctx.modelo.uiDeclarada.campos.filter(c => c.pantalla === s);
  if (etapa) {
    // Políticas de la etapa: obligatorias para avanzar y aplicables al perfil.
    const deEtapa = (Object.keys(politicas) as CampoAfi[]).filter(c => politicas[c].etapa === etapa && politicas[c].obligatorioParaAvanzar !== false);
    const deOtroPerfil = (c: CampoAfi) => !!politicas[c].perfiles && !politicas[c].perfiles!.includes(ctx.perfil);
    // Obligatorio para avanzar pero establecido solo para otros perfiles: la política del perfil no existe (no se asume).
    // Uno no verificado y de otro perfil simplemente no aplica a este perfil.
    const otroPerfil = deEtapa.filter(c => deOtroPerfil(c) && politicas[c].obligatorioParaAvanzar === true);
    const aplicables = deEtapa.filter(c => !deOtroPerfil(c));
    if (otroPerfil.length) en.push(nuevo({ pantalla: s, clasificacion: 'KNOWLEDGE_GAP',
      motivo: `Las políticas de la etapa ${etapa} (${otroPerfil.join(', ')}) no están establecidas para el perfil ${ctx.perfil}.`,
      raiz: recorrido(`knowledge:politica:${etapa}:${ctx.perfil}`), requiere: [`evidencia para extender las políticas de ${etapa} al perfil ${ctx.perfil}`] }));
    // El driver se elige por política + capacidad: la familia de control de la capacidad debe ser la de la política efectiva.
    const sinDriver = aplicables.filter(c => capacidad(etapa, c, 'ruta')?.control !== politicas[c].control);
    if (sinDriver.length) en.push(nuevo({ pantalla: s, clasificacion: 'CAPABILITY_GAP', motivo: `El driver de preparación no sabe diligenciar ${sinDriver.join(', ')} en ${etapa}.`,
      raiz: recorrido(`capability:preparar-etapa:${etapa}`) }));
    for (const c of aplicables) if (politicas[c].delActor && esPedible(c) && !declaradoPor(SUJETO_PRINCIPAL, c)) datosTransito.push({ sujeto: SUJETO_PRINCIPAL, campo: c, pantalla: s });
    return { tipo: 'etapa', etapa };
  }
  if (!campos.length) {
    en.push(nuevo({ pantalla: s, clasificacion: 'KNOWLEDGE_GAP', motivo: `Knowledge no declara los campos de "${s}" ni una etapa que la prepare: no se sabe cómo dejarla.`,
      raiz: recorrido(`knowledge:formulario:${s}`), requiere: [`registrar los campo-ui de ${s} (etiqueta, dato, obligatorio) o completar su etapa`] }));
    return { tipo: 'ninguna' };
  }
  const formulario: CampoFormulario[] = [];
  for (const c of campos) {
    if (!c.etiqueta && (c.dato || c.obligatorio === 'si' || c.control === 'archivo')) {
      en.push(nuevo({ pantalla: s, clasificacion: 'KNOWLEDGE_GAP', motivo: `El campo ${c.id} no tiene etiqueta visible en Knowledge.`, raiz: recorrido(`knowledge:campo-ui:${c.id}:etiqueta`) }));
      continue;
    }
    if (c.etiqueta) formulario.push({ campo: c.id, etiqueta: c.etiqueta, control: c.control ?? 'text', ...(c.dato ? { dato: c.dato as CampoDato } : {}), obligatorio: c.obligatorio === 'si' });
  }
  const archivos = formulario.filter(c => c.control === 'archivo');
  if (archivos.length) {
    for (const a of archivos.filter(x => x.obligatorio)) en.push(nuevo({ pantalla: s, clasificacion: 'TEST_DATA_GAP',
      motivo: `"${a.etiqueta}" exige un archivo permitido: Test Data aún no provisiona archivos ni hay autorización generable para generarlos.`,
      raiz: recorrido('test-data:archivo-documento'), requiere: ['provisión de archivos permitidos (o autorización archivo-sintetico con evidencia)'] }));
    return { tipo: 'documentos', campos: archivos };
  }
  const conDato = formulario.filter(c => c.dato);
  if (!conDato.length) {
    en.push(nuevo({ pantalla: s, clasificacion: 'KNOWLEDGE_GAP', motivo: `Ningún campo de "${s}" declara el dato que captura.`, raiz: recorrido(`knowledge:formulario:${s}`) }));
    return { tipo: 'ninguna' };
  }
  const esPersona = conDato.some(c => c.dato === 'tipoIdentificacion') && conDato.some(c => c.dato === 'numeroIdentificacion') && conDato.some(c => esCampoPersona(c.dato));
  const quien = sujeto ?? (esPersona ? undefined : SUJETO_PRINCIPAL);
  if (!quien) {
    en.push(nuevo({ pantalla: s, clasificacion: 'TEST_DATA_GAP', motivo: `"${s}" captura una persona y el caso no declara qué sujeto la ocupa (sujetos[].pantalla).`,
      raiz: recorrido(`test-data:sujeto-de-pantalla:${s}`) }));
    return { tipo: 'ninguna' };
  }
  if (esPersona && !decl?.consulta) en.push(nuevo({ pantalla: s, clasificacion: 'KNOWLEDGE_GAP', motivo: `"${s}" identifica a una persona pero Knowledge no declara el botón de consulta.`,
    raiz: recorrido(`knowledge:pantalla-ui:${s}:consulta`) }));
  // Datos obligatorios del formulario que el caso no declaró: tránsito -> Test Data (si es provisionable).
  for (const c of conDato.filter(x => x.obligatorio)) {
    if (declaradoPor(quien, c.dato!)) continue;
    const pedible = quien === SUJETO_PRINCIPAL ? !esCampoPersona(c.dato) && esPedible(c.dato as CampoAfi) : esPedibleParticipante(c.dato);
    if (pedible) datosTransito.push({ sujeto: quien, campo: c.dato!, pantalla: s });
    else en.push(nuevo({ pantalla: s, clasificacion: 'TEST_DATA_GAP', motivo: `"${c.etiqueta}" es obligatorio en ${s} y ${c.dato} no es provisionable para ${quien}.`,
      raiz: recorrido(`test-data:no-provisionable:${quien === SUJETO_PRINCIPAL ? ctx.perfil : 'participante'}:${s}`) }));
  }
  return { tipo: 'formulario', sujeto: quien, campos: conDato, ...(esPersona && decl?.consulta ? { consulta: decl.consulta } : {}) };
}
