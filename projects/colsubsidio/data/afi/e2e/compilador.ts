import { entidadesDelModelo } from '../aplicacion/modeloAplicacion';
import { resolverCondicion, testabilidadCanonica, type TestabilidadCompilacion } from '../aplicacion/resolucionObservacion';
import {
  ESQUEMA_REQUISITO_DATOS, ID_REQUISITO, SUJETO_PRINCIPAL, clasificarCampo, esCampoPersona, esPedible, esPedibleParticipante,
  validarRequisito, type CampoDato, type CondicionActor, type TestDataRequirement,
} from '../datosPrueba/contrato';
import { REGISTRO_DATOS_PRUEBA_AFI, diagnosticarRequisito, type RegistroDatosPrueba } from '../datosPrueba/registro';
import type { CampoAfi, EtapaAfi, PerfilActorAfi, PoliticaCampo } from '../modelo';
import { POLITICAS_AFI, politicasDelPerfil } from '../politicas';
import {
  CLAVES_EXPECTATIVA_PANTALLA, type DatoE2E, type DefinicionE2E, type ExpectativaPantallaE2E, type FidelidadE2E, type TipoVerificacionE2E, type VerificacionE2EDef,
} from './contrato';
import { derivarRecorrido, type ProblemaRuta, type RutaE2E } from './recorrido';

/**
 * COMPILADOR E2E (puro): a partir de la sección e2e de un .afi.json deriva
 *  - verificaciones EJECUTABLES por el ejecutor genérico, o el GAP que lo impide (clasificado por el framework, nunca por el caso);
 *  - los testDataRequirements de cada sujeto (§7: solo resolucion TEST_DATA) y su diagnóstico contra el Test Data Registry.
 */

export type ClasificacionGapE2E = 'CAPABILITY_GAP' | 'KNOWLEDGE_GAP' | 'OBSERVABILITY_GAP' | 'TEST_DATA_GAP';
/**
 * Causa RAÍZ reutilizable de un gap (capability, proveedor, entidad o dato faltante), independiente del caso que la revela.
 * `bloquea`: 'recorrido' si impide físicamente avanzar/llegar a la pantalla; 'asercion' si solo impide comprobar algo.
 */
export interface RaizGapE2E { id: string; bloquea: 'recorrido' | 'asercion' }
export interface GapE2E { ubicacion: string; clasificacion: ClasificacionGapE2E; motivo: string; raiz: RaizGapE2E; requiere?: string[] }

/** Pantallas que el recorrido genérico sabe OBSERVAR hoy (alcance del runner), por id semántico. */
export const PANTALLAS_OBSERVABLES: Readonly<Record<string, { momento: { etapa: EtapaAfi } | 'punto-funcional'; perfiles?: readonly PerfilActorAfi[] }>> = {
  'pantalla-ingresa-informacion-empresa': { momento: { etapa: 'informacion-empresa' }, perfiles: ['empresa'] },
  'informacion-contacto': { momento: 'punto-funcional' },
};
/** Punto desde el que el recorrido DERIVADO (Knowledge) continúa: la pantalla que el runner entrega como punto funcional. */
export const ORIGEN_RECORRIDO = Object.entries(PANTALLAS_OBSERVABLES).find(([, v]) => v.momento === 'punto-funcional')![0];
/** Claves de expectativa de pantalla que el evaluador sabe comprobar hoy (el resto es CAPABILITY_GAP derivado). */
export const EXPECTATIVAS_PANTALLA_SOPORTADAS = ['titulo', 'etiquetasPresentes', 'etiquetasAusentes', 'migaContiene'] as const;

/**
 * Cuándo se observa una verificación: en el recorrido del runner (etapa / punto funcional) o en una pantalla de la ruta
 * derivada, tras `despuesDe` acciones del caso sobre ella (0 = al llegar).
 */
export type MomentoE2E = { etapa: EtapaAfi } | 'punto-funcional' | { pantalla: string; despuesDe: number };

/** `indice`: posición de la verificación DECLARADA en el paso (una declarada puede compilar a varias entradas). */
export type VerificacionCompilada =
  | { estado: 'EJECUTABLE'; tipo: TipoVerificacionE2E; def: VerificacionE2EDef; momento?: MomentoE2E; expectativa?: ExpectativaPantallaE2E; indice?: number }
  | { estado: 'GAP'; tipo: TipoVerificacionE2E | 'datos'; gap: GapE2E; indice?: number };

export interface PasoE2ECompilado {
  paso: number; accion: string; esperado: string; dispositivo: 'desktop' | 'mobile'; verificaciones: VerificacionCompilada[];
  /** Documental (trazabilidad de la fuente): no participa en la ejecución ni en los gaps. */
  notaFuente?: string;
  fidelidad?: FidelidadE2E[];
}

/** (A2) ¿El actor que recorre el Portal demuestra las precondiciones del escenario? Nunca se asume. */
export interface ActorDemostradoE2E { requerido: boolean; actorRef: string | null; demostrado: boolean; faltantes: string[]; motivo?: string }

/** (C) Fidelidad semántica: lo aproximado o no representable es visible y nunca cuenta como exacto. */
export interface MetricasFidelidadE2E {
  pasos: number; pasosValidos: number;
  semanticasExactas: number; semanticasAproximadas: number; semanticasNoRepresentables: number;
  detalle: { paso: number; dispositivo: 'desktop' | 'mobile'; representacion: FidelidadE2E['representacion']; fragmento: string; motivo: string; origen: 'declarada' | 'detectada' }[];
}

export interface DiagnosticoRequisitoE2E { requisito: string; sujeto: string; status: string; motivos: string[]; actorRef?: string | null }

/** Rango [min, max]: max incluye los datos condicionales cuya aplicabilidad solo se conoce con el valor (nunca leído al compilar). */
export interface RangoE2E { min: number; max: number }
/**
 * Métrica de Test Data por requisito, sin mezclar dos cifras distintas:
 *  - camposCaso: campos que el caso exige (cada campo cuenta por separado aunque compartan infraestructura/secreto);
 *  - nuevos: los que QA aún debe aportar (excluye los ya declarados por el actor aprobado y provisionado que se reutiliza).
 */
export interface MetricaDatosRequisito {
  requisito: string; sujeto: string; actorRef: string | null;
  camposCaso: RangoE2E; disponibles: CampoDato[]; nuevos: CampoDato[]; nuevosCondicionales: CampoDato[]; nuevosRango: RangoE2E;
  /** Campos que exige el TRÁNSITO por la ruta derivada y el caso no declaró (incluidos en camposCaso). */
  transito: CampoDato[];
}
export interface MetricasDatosE2E {
  porRequisito: MetricaDatosRequisito[];
  camposCaso: RangoE2E; disponibles: number; nuevos: RangoE2E;
  /** Datos TEST_DATA declarados que Test Data no puede provisionar (ya contados como gaps; no suman a los totales). */
  noProvisionables: string[];
}

export interface PlanE2ECompilado {
  pasos: PasoE2ECompilado[];
  /** Requisitos de datos de prueba derivados (sin valores), uno por sujeto con datos TEST_DATA. */
  requisitos: TestDataRequirement[];
  diagnosticosDatos: DiagnosticoRequisitoE2E[];
  metricasDatos: MetricasDatosE2E;
  /** Ruta derivada desde Knowledge más allá del punto funcional. */
  recorrido: RutaE2E;
  actor: ActorDemostradoE2E;
  fidelidad: MetricasFidelidadE2E;
  gaps: GapE2E[];
  /** Sin ningún gap (ni de pasos ni de datos). */
  ejecutable: boolean;
}

export interface ContextoCompilacionE2E {
  hu: string; caso: string; perfil: PerfilActorAfi; actorRef?: string;
  registro?: RegistroDatosPrueba;
  /** Solo PRESENCIA de secretos (nunca contenido) para el diagnóstico de Test Data. */
  entorno?: Readonly<Record<string, string | undefined>>;
  testabilidad?: TestabilidadCompilacion;
  /** Solo pruebas: políticas alternativas (por defecto POLITICAS_AFI, la autoridad sobre `generable`). */
  politicas?: Readonly<Record<CampoAfi, PoliticaCampo>>;
}

const gap = (tipo: VerificacionCompilada['tipo'], ubicacion: string, clasificacion: ClasificacionGapE2E, motivo: string, raiz: RaizGapE2E, requiere?: string[]): VerificacionCompilada =>
  ({ estado: 'GAP', tipo, gap: { ubicacion, clasificacion, motivo, raiz, ...(requiere?.length ? { requiere } : {}) } });
const recorrido = (id: string): RaizGapE2E => ({ id, bloquea: 'recorrido' });
const asercion = (id: string): RaizGapE2E => ({ id, bloquea: 'asercion' });
/** Superficie del proveedor de observación que necesita cada tipo de entidad (un proveedor sirve a todas sus entidades). */
const SUPERFICIE_OBSERVACION: Readonly<Record<string, string>> = {
  integracion: 'integraciones', actividad: 'proceso-bpm', ruta: 'proceso-bpm', variable: 'proceso-bpm', notificacion: 'notificaciones', 'pantalla-ui': 'portal-ui', 'campo-ui': 'portal-ui',
};
/** Acciones sin las cuales el recorrido no puede continuar (el resto solo impide una aserción). */
const ACCIONES_DE_RECORRIDO: readonly string[] = ['avanzar', 'consultar-persona', 'diligenciar-obligatorios', 'cargar-documentos', 'aprobar-solicitud'];

const idRequisito = (hu: string, caso: string, sujeto: string) =>
  `${hu}-${caso}-${sujeto}`.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

export function compilarPlanE2E(e2e: DefinicionE2E, ctx: ContextoCompilacionE2E): PlanE2ECompilado {
  const t = ctx.testabilidad ?? testabilidadCanonica();
  const registro = ctx.registro ?? REGISTRO_DATOS_PRUEBA_AFI;
  const entidades = entidadesDelModelo(t.modelo);
  const existe = (tipo: string, id: string) => entidades.some(([ti, i]) => ti === tipo && i === id);

  // ---------- Ruta derivada (Knowledge) ----------
  const ruta = derivarRecorrido(e2e, {
    perfil: ctx.perfil, modelo: t.modelo, ...(ctx.politicas ? { politicas: ctx.politicas } : {}),
    origen: ORIGEN_RECORRIDO, alcanzadasPorRunner: Object.keys(PANTALLAS_OBSERVABLES),
  });

  // ---------- Pasos ----------
  // Acciones del caso ya ejecutadas sobre cada pantalla de la ruta (en orden de pasos): fija el momento de observación.
  const hechas = new Map<string, number>();
  const pasos = e2e.pasos.map((p): PasoE2ECompilado => {
    const ubic = (j: number) => `paso ${p.paso}${p.dispositivo === 'mobile' ? ' (mobile)' : ''} · verificación ${j + 1}`;
    const vs = p.verificaciones.flatMap((v, j): VerificacionCompilada[] => compilarVerificacion(v, ubic(j), ctx.perfil, existe, t, p.paso, ruta, hechas, e2e).map(x => ({ ...x, indice: j })));
    return { paso: p.paso, accion: p.accion, esperado: p.esperado, dispositivo: p.dispositivo ?? 'desktop', verificaciones: vs,
      ...(p.notaFuente ? { notaFuente: p.notaFuente } : {}), ...(p.fidelidad ? { fidelidad: p.fidelidad } : {}) };
  });
  const gapsRuta: GapE2E[] = ruta.problemas.map(p => ({ ubicacion: `recorrido · ${p.pantalla}`, clasificacion: p.clasificacion, motivo: p.motivo, raiz: p.raiz, ...(p.requiere ? { requiere: p.requiere } : {}) }));

  // ---------- Actor del recorrido ----------
  const actor = demostrarActor(e2e, ctx, registro);
  const gapsActor: GapE2E[] = actor.demostrado ? [] : [{ ubicacion: 'actor · principal', clasificacion: 'TEST_DATA_GAP', motivo: actor.motivo!,
    raiz: recorrido('test-data:actor-no-demostrado:principal'), requiere: ['un actor aprobado cuyas condiciones incluyan TODAS las precondiciones del principal'] }];

  // ---------- Datos -> testDataRequirements (incluidos los de tránsito) ----------
  const transito: DatoE2E[] = ruta.datosTransito.map(d => ({ campo: d.campo, sujeto: d.sujeto, uso: ['FILLER'], resolucion: 'TEST_DATA', aplicabilidad: 'siempre' }));
  const { requisitos, gapsDatos } = derivarRequisitos({ ...e2e, datos: [...e2e.datos, ...transito] }, ctx, registro);
  const diagnosticosDatos: DiagnosticoRequisitoE2E[] = requisitos.map(r => {
    const d = diagnosticarRequisito(r, registro, ctx.entorno ?? {});
    return {
      requisito: r.id, sujeto: r.rol ?? SUJETO_PRINCIPAL, status: d.status, actorRef: d.actorRef ?? null,
      motivos: [...d.motivos.map(m => `${m.motivo}: ${m.detalle}`), ...(d.missingFields.length ? [`faltan: ${d.missingFields.join(', ')}`] : [])],
    };
  });
  for (const d of diagnosticosDatos.filter(x => x.status !== 'READY')) {
    gapsDatos.push({ ubicacion: `datos · ${d.sujeto}`, clasificacion: 'TEST_DATA_GAP', motivo: `requisito ${d.requisito}: ${d.status}${d.motivos.length ? ` (${d.motivos.join('; ')})` : ''}`,
      raiz: recorrido(`test-data:provision:${d.sujeto}`) });
  }
  const gaps = [...pasos.flatMap(p => p.verificaciones.filter((v): v is Extract<VerificacionCompilada, { estado: 'GAP' }> => v.estado === 'GAP').map(v => v.gap)),
    ...gapsRuta, ...gapsActor, ...gapsDatos];
  const metricasDatos = medirDatos(e2e, requisitos, ctx, registro, gapsDatos, ruta);
  return { pasos, requisitos, diagnosticosDatos, metricasDatos, recorrido: ruta, actor, fidelidad: medirFidelidad(e2e), gaps, ejecutable: gaps.length === 0 };
}

/**
 * (A2) El principal exige un actor DEMOSTRADO si el caso declara precondiciones suyas o datos de escenario: sus condiciones
 * aprobadas deben incluir TODAS las precondiciones. Sin actorRef, el actor base del perfil no demuestra nada.
 */
function demostrarActor(e2e: DefinicionE2E, ctx: ContextoCompilacionE2E, registro: RegistroDatosPrueba): ActorDemostradoE2E {
  const precondiciones = (e2e.precondiciones ?? []).filter(p => p.sujeto === SUJETO_PRINCIPAL).map(p => p.id);
  const requerido = precondiciones.length > 0 || e2e.datos.some(d => d.sujeto === SUJETO_PRINCIPAL && d.uso.includes('SCENARIO'));
  const slot = ctx.actorRef ? registro.slots.find(s => s.id === ctx.actorRef) : undefined;
  if (!requerido) return { requerido, actorRef: ctx.actorRef ?? null, demostrado: true, faltantes: [] };
  if (!slot) {
    return { requerido, actorRef: ctx.actorRef ?? null, demostrado: false, faltantes: precondiciones,
      motivo: ctx.actorRef ? `El actor ${ctx.actorRef} no está en el Test Data Registry.` : 'El caso declara un escenario pero no actorRef: el actor base del perfil no demuestra sus precondiciones.' };
  }
  const tiene = new Set(slot.condiciones.map(c => c.id));
  const faltantes = precondiciones.filter(p => !tiene.has(p));
  return { requerido, actorRef: slot.id, demostrado: !faltantes.length, faltantes,
    ...(faltantes.length ? { motivo: `El actor ${slot.id} no demuestra las precondiciones: ${faltantes.join(', ')}.` } : {}) };
}

/** (C) Pasos exactos / con aproximación / con algo no representable. `detalle` libre en una acción = aproximación detectada. */
function medirFidelidad(e2e: DefinicionE2E): MetricasFidelidadE2E {
  const detalle: MetricasFidelidadE2E['detalle'] = [];
  for (const p of e2e.pasos) {
    const disp = p.dispositivo ?? 'desktop';
    for (const f of p.fidelidad ?? []) detalle.push({ paso: p.paso, dispositivo: disp, ...f, origen: 'declarada' });
    for (const v of p.verificaciones) if (v.tipo === 'accion' && v.detalle) {
      detalle.push({ paso: p.paso, dispositivo: disp, representacion: 'aproximada', fragmento: v.detalle, motivo: `semántica en texto libre (detalle de ${v.accion}), no estructurada`, origen: 'detectada' });
    }
  }
  const de = (p: DefinicionE2E['pasos'][number]) => detalle.filter(d => d.paso === p.paso && d.dispositivo === (p.dispositivo ?? 'desktop'));
  return {
    pasos: e2e.pasos.length, pasosValidos: e2e.pasos.length,
    semanticasExactas: e2e.pasos.filter(p => !de(p).length).length,
    semanticasAproximadas: e2e.pasos.filter(p => de(p).length && de(p).every(d => d.representacion === 'aproximada')).length,
    semanticasNoRepresentables: e2e.pasos.filter(p => de(p).some(d => d.representacion === 'no-representable')).length,
    detalle,
  };
}

/** Slot aprobado y provisionado que un sujeto reutiliza (principal: actorRef del caso; participante: actorRef del sujeto). */
function slotReutilizado(sujeto: string, e2e: DefinicionE2E, ctx: ContextoCompilacionE2E, registro: RegistroDatosPrueba) {
  const ref = sujeto === SUJETO_PRINCIPAL ? ctx.actorRef : (e2e.sujetos ?? []).find(s => s.rol === sujeto)?.actorRef;
  const slot = ref ? registro.slots.find(s => s.id === ref) : undefined;
  return slot && slot.estado === 'provisionado' ? slot : undefined;
}

function medirDatos(e2e: DefinicionE2E, requisitos: readonly TestDataRequirement[], ctx: ContextoCompilacionE2E, registro: RegistroDatosPrueba, gapsDatos: readonly GapE2E[], ruta: RutaE2E): MetricasDatosE2E {
  const porRequisito = requisitos.map((r): MetricaDatosRequisito => {
    const sujeto = r.rol ?? SUJETO_PRINCIPAL;
    const slot = slotReutilizado(sujeto, e2e, ctx, registro);
    const declarados = new Set<string>((slot?.campos ?? []).map(c => c.campo));
    const condicionales = (r.camposCondicionales ?? []).map(c => c.campo);
    const todos = [...r.camposRequeridos, ...condicionales];
    const nuevos = r.camposRequeridos.filter(c => !declarados.has(c));
    const nuevosCondicionales = condicionales.filter(c => !declarados.has(c));
    return {
      requisito: r.id, sujeto, actorRef: slot?.id ?? null,
      camposCaso: { min: r.camposRequeridos.length, max: todos.length },
      disponibles: todos.filter(c => declarados.has(c)), nuevos, nuevosCondicionales,
      nuevosRango: { min: nuevos.length, max: nuevos.length + nuevosCondicionales.length },
      transito: ruta.datosTransito.filter(d => d.sujeto === sujeto).map(d => d.campo),
    };
  });
  const suma = (f: (m: MetricaDatosRequisito) => RangoE2E): RangoE2E =>
    porRequisito.reduce((a, m) => ({ min: a.min + f(m).min, max: a.max + f(m).max }), { min: 0, max: 0 });
  return {
    porRequisito, camposCaso: suma(m => m.camposCaso), disponibles: porRequisito.reduce((n, m) => n + m.disponibles.length, 0), nuevos: suma(m => m.nuevosRango),
    noProvisionables: gapsDatos.filter(g => g.raiz.id.startsWith('test-data:no-provisionable:')).map(g => g.ubicacion.replace(/^datos · /, '')),
  };
}

// ---------- Agrupación por causa raíz y métricas de autonomía (independientes del caso) ----------

export interface GrupoGapRaiz {
  raiz: string; clasificacion: ClasificacionGapE2E; bloquea: RaizGapE2E['bloquea'];
  /** Verificaciones/datos que se desbloquean al cerrar la raíz, por caso. */
  ubicaciones: { caso: string; ubicacion: string }[];
  casos: string[];
  /** Primer paso (en orden de recorrido) donde aparece: prioriza lo que desbloquea navegación temprana. */
  primerPaso: number;
  prioridad: 'P1' | 'P2' | 'P3';
  motivo: string;
}
/** Una observación que el diseño pide pero nunca será objetivamente verificable (aceptada, no se "cierra"). */
const RAICES_NO_CERRABLES = ['observacion:conformidad-diseno'];

export function agruparGapsRaiz(planes: readonly { caso: string; plan: PlanE2ECompilado }[]): GrupoGapRaiz[] {
  const grupos = new Map<string, GrupoGapRaiz>();
  for (const { caso, plan } of planes) {
    const pasoDe = new Map<GapE2E, number>();
    for (const p of plan.pasos) for (const v of p.verificaciones) if (v.estado === 'GAP') pasoDe.set(v.gap, p.paso);
    for (const g of plan.gaps) {
      const k = `${g.clasificacion}|${g.raiz.id}`;
      const grupo = grupos.get(k) ?? { raiz: g.raiz.id, clasificacion: g.clasificacion, bloquea: g.raiz.bloquea, ubicaciones: [], casos: [], primerPaso: Infinity, prioridad: 'P2', motivo: g.motivo };
      grupo.ubicaciones.push({ caso, ubicacion: g.ubicacion });
      if (!grupo.casos.includes(caso)) grupo.casos.push(caso);
      // Los datos se necesitan desde el inicio del recorrido.
      grupo.primerPaso = Math.min(grupo.primerPaso, pasoDe.get(g) ?? 0);
      if (g.raiz.bloquea === 'recorrido') grupo.bloquea = 'recorrido';
      grupos.set(k, grupo);
    }
  }
  const lista = [...grupos.values()].map(g => ({ ...g, prioridad: (RAICES_NO_CERRABLES.includes(g.raiz) ? 'P3' : g.bloquea === 'recorrido' ? 'P1' : 'P2') as GrupoGapRaiz['prioridad'] }));
  return lista.sort((a, b) => a.prioridad.localeCompare(b.prioridad) || a.primerPaso - b.primerPaso || b.ubicaciones.length - a.ubicaciones.length || a.raiz.localeCompare(b.raiz));
}

export interface MetricasAutonomiaE2E {
  pasos: number; pasosTotalmenteEjecutables: number;
  /** Por verificación DECLARADA: completa (todas sus entradas ejecutables), parcial o bloqueada; y si la bloquea el recorrido. */
  declaradas: number; declaradasEjecutables: number; declaradasParciales: number; declaradasBloqueadasPorRecorrido: number;
  verificaciones: number; verificacionesCompiladas: number; verificacionesEjecutables: number; pctEjecutables: number;
  gapsDerivados: number; gapsRaiz: number; capabilitiesRaiz: string[];
  testDataCamposCaso: RangoE2E; testDataNuevos: RangoE2E;
}
export function metricasAutonomia(plan: PlanE2ECompilado): MetricasAutonomiaE2E {
  const vs = plan.pasos.flatMap(p => p.verificaciones);
  const ejecutables = vs.filter(v => v.estado === 'EJECUTABLE').length;
  const raices = agruparGapsRaiz([{ caso: '-', plan }]);
  const declaradas = plan.pasos.flatMap(p => [...new Set(p.verificaciones.map(v => v.indice ?? -1))].map(i => p.verificaciones.filter(v => (v.indice ?? -1) === i)));
  return {
    pasos: plan.pasos.length, pasosTotalmenteEjecutables: plan.pasos.filter(p => p.verificaciones.every(v => v.estado === 'EJECUTABLE')).length,
    declaradas: declaradas.length,
    declaradasEjecutables: declaradas.filter(d => d.every(v => v.estado === 'EJECUTABLE')).length,
    declaradasParciales: declaradas.filter(d => d.some(v => v.estado === 'EJECUTABLE') && d.some(v => v.estado === 'GAP')).length,
    declaradasBloqueadasPorRecorrido: declaradas.filter(d => d.some(v => v.estado === 'GAP' && v.gap.raiz.bloquea === 'recorrido')).length,
    verificaciones: vs.length, verificacionesCompiladas: vs.length, verificacionesEjecutables: ejecutables,
    pctEjecutables: vs.length ? Math.round((ejecutables / vs.length) * 1000) / 10 : 0,
    gapsDerivados: plan.gaps.length, gapsRaiz: raices.length, capabilitiesRaiz: raices.filter(g => g.clasificacion === 'CAPABILITY_GAP').map(g => g.raiz),
    testDataCamposCaso: plan.metricasDatos.camposCaso, testDataNuevos: plan.metricasDatos.nuevos,
  };
}

/** Gap de una verificación bloqueada por la ruta: misma raíz que el problema que la bloquea (cerrar la raíz la desbloquea). */
const bloqueada = (tipo: VerificacionCompilada['tipo'], ubic: string, destino: string, p: ProblemaRuta): VerificacionCompilada =>
  gap(tipo, ubic, p.clasificacion, `No se llega a operar "${destino}": ${p.motivo}`, p.raiz, p.requiere);

function compilarVerificacion(
  v: VerificacionE2EDef, ubic: string, perfil: PerfilActorAfi, existe: (tipo: string, id: string) => boolean, t: TestabilidadCompilacion, paso: number,
  ruta: RutaE2E, hechas: Map<string, number>, e2e: DefinicionE2E,
): VerificacionCompilada[] {
  const enRuta = (x: string) => Object.prototype.hasOwnProperty.call(ruta.bloqueosHasta, x);
  switch (v.tipo) {
    case 'bizagi-acceso':
      return [{ estado: 'EJECUTABLE', tipo: v.tipo, def: v },
        ...(v.rolRequerido ? [gap(v.tipo, ubic, 'OBSERVABILITY_GAP', `El rol "${v.rolRequerido}" del usuario no es observable por la UI de Bizagi.`, asercion('observacion:rol-usuario-bizagi'))] : [])];
    case 'parametrica-columnas':
      return [{ estado: 'EJECUTABLE', tipo: v.tipo, def: v },
        ...(v.tiposDato && Object.keys(v.tiposDato).length ? [gap(v.tipo, ubic, 'OBSERVABILITY_GAP', 'Los tipos de dato de las columnas no son visibles en la grilla de la entidad; requieren el modelo de datos de Bizagi.',
          asercion('observacion:modelo-datos-bizagi'))] : [])];
    case 'parametrica-mensajes':
    case 'portal-apertura':
    case 'portal-caso-creado':
      return [{ estado: 'EJECUTABLE', tipo: v.tipo, def: v }];
    case 'pantalla': {
      if (!existe('pantalla-ui', v.pantalla)) return [gap(v.tipo, ubic, 'KNOWLEDGE_GAP', `La pantalla "${v.pantalla}" no está registrada en el Application Model.`,
        recorrido(`knowledge:pantalla-ui:${v.pantalla}`), [`registrar pantalla-ui ${v.pantalla}`])];
      const campos = [...(v.expectativa.camposVisiblesExactos ?? []), ...(v.expectativa.camposAusentes ?? []), ...(v.expectativa.campos ?? []).map(c => c.campo)];
      const sinRegistrar = [...new Set(campos.filter(c => !existe('campo-ui', c)))];
      const salida: VerificacionCompilada[] = sinRegistrar.map(c =>
        gap(v.tipo, ubic, 'KNOWLEDGE_GAP', `Campo no registrado en el Application Model: ${c}.`, asercion(`knowledge:campo-ui:${c}`), [`registrar campo-ui ${c}`]));
      const alcance = PANTALLAS_OBSERVABLES[v.pantalla];
      let momento: MomentoE2E;
      if (alcance && (!alcance.perfiles || alcance.perfiles.includes(perfil))) momento = alcance.momento;
      else if (enRuta(v.pantalla)) {
        const b = ruta.bloqueosHasta[v.pantalla];
        if (b.length) return [...salida, bloqueada(v.tipo, ubic, v.pantalla, b[0])];
        momento = { pantalla: v.pantalla, despuesDe: hechas.get(v.pantalla) ?? 0 };
      } else {
        return [...salida, gap(v.tipo, ubic, 'CAPABILITY_GAP', `El recorrido genérico no alcanza "${v.pantalla}" para el perfil ${perfil}.`, recorrido(`capability:recorrido:${v.pantalla}`))];
      }
      const claves = (Object.keys(v.expectativa) as (typeof CLAVES_EXPECTATIVA_PANTALLA[number])[]);
      const noSoportadas = claves.filter(k => !(EXPECTATIVAS_PANTALLA_SOPORTADAS as readonly string[]).includes(k));
      const soportada = Object.fromEntries(claves.filter(k => !noSoportadas.includes(k)).map(k => [k, v.expectativa[k]])) as ExpectativaPantallaE2E;
      for (const k of noSoportadas) salida.push(gap(v.tipo, ubic, 'CAPABILITY_GAP', `Verificación de pantalla no soportada aún: ${k}.`, asercion(`capability:expectativa-pantalla:${k}`)));
      if (Object.keys(soportada).length) salida.unshift({ estado: 'EJECUTABLE', tipo: v.tipo, def: v, momento, expectativa: soportada });
      return salida;
    }
    case 'condicion': {
      const r = resolverCondicion(`P${paso}`, 0, { entidad: v.entidad, expectativa: v.expectativa }, t);
      const nombre = `${v.entidad.tipo} ${v.entidad.id} ${v.expectativa.tipo}`;
      const entidad = `${v.entidad.tipo}:${v.entidad.id}`;
      if (r.estado === 'INVALIDA') return [gap(v.tipo, ubic, 'KNOWLEDGE_GAP', `${nombre}: ${r.motivo}`, asercion(`knowledge:${entidad}`))];
      if (r.estado === 'KNOWLEDGE_GAP') return [gap(v.tipo, ubic, 'KNOWLEDGE_GAP', `${nombre}: entidad no registrada en Knowledge.`, asercion(`knowledge:${entidad}`), [r.capacidad])];
      if (r.estado === 'CAPABILITY_GAP') return [gap(v.tipo, ubic, 'CAPABILITY_GAP', `${nombre}: ${r.capacidad}.`, asercion(`capability:${r.capacidad}`))];
      if (r.estado === 'TESTABILITY_GAP') return [gap(v.tipo, ubic, 'OBSERVABILITY_GAP', `${nombre}: sin observación productiva (${r.motivo}).`,
        asercion(`observacion:proveedor-${SUPERFICIE_OBSERVACION[v.entidad.tipo] ?? v.entidad.tipo}`), [r.capacidad])];
      return [gap(v.tipo, ubic, 'CAPABILITY_GAP', `${nombre}: observable con ${'proveedor' in r ? r.proveedor : '?'}, pero el ejecutor E2E aún no ejecuta condiciones observables.`,
        asercion('capability:ejecutor-condiciones-observables'))];
    }
    case 'accion': {
      const pantallas = [v.pantalla, v.hasta].filter((x): x is string => !!x);
      const desconocidas = pantallas.filter(x => !existe('pantalla-ui', x));
      if (desconocidas.length) return [gap(v.tipo, ubic, 'KNOWLEDGE_GAP', `Pantallas no registradas: ${desconocidas.join(', ')}.`, recorrido(`knowledge:pantalla-ui:${desconocidas[0]}`))];
      // Acciones del recorrido: se ejecutan como parte de la ruta derivada (una primitiva genérica por acción).
      const donde = v.pantalla ?? (v.accion === 'avanzar' ? undefined : (e2e.sujetos ?? []).find(s => s.rol === v.sujeto)?.pantalla);
      if (v.accion === 'avanzar' && v.hasta && !v.pantalla && enRuta(v.hasta)) {
        const b = ruta.bloqueosHasta[v.hasta];
        return b.length ? [bloqueada(v.tipo, ubic, v.hasta, b[0])] : [{ estado: 'EJECUTABLE', tipo: v.tipo, def: v, momento: { pantalla: v.hasta, despuesDe: 0 } }];
      }
      if (donde && (['consultar-persona', 'diligenciar-obligatorios', 'cargar-documentos', 'avanzar'] as string[]).includes(v.accion) && enRuta(donde)) {
        const n = hechas.get(donde) ?? 0;
        hechas.set(donde, n + 1);
        const b = [...ruta.bloqueosHasta[donde], ...(ruta.bloqueosEn[donde] ?? [])];
        if (v.accion === 'avanzar' && !ruta.pantallas.find(x => x.pantalla === donde)?.salida) {
          return [gap(v.tipo, ubic, 'KNOWLEDGE_GAP', `Knowledge no registra una transición que deje "${donde}".`, recorrido(`knowledge:transicion-ui:desde:${donde}`))];
        }
        return b.length ? [bloqueada(v.tipo, ubic, donde, b[0])] : [{ estado: 'EJECUTABLE', tipo: v.tipo, def: v, momento: { pantalla: donde, despuesDe: n } }];
      }
      // "avanzar hasta X" es la misma capacidad que alcanzar X; el resto de acciones es UNA capacidad sin importar sujeto o pantalla.
      const raiz = v.accion === 'avanzar' && v.hasta ? `capability:recorrido:${v.hasta}` : v.accion === 'avanzar' ? `capability:accion:avanzar@${v.pantalla ?? '-'}` : `capability:accion:${v.accion}`;
      return [gap(v.tipo, ubic, 'CAPABILITY_GAP', `La acción "${v.accion}"${v.sujeto ? ` (sujeto ${v.sujeto})` : ''}${v.hasta ? ` hasta "${v.hasta}"` : v.pantalla ? ` en "${v.pantalla}"` : ''} no está soportada por el ejecutor E2E.`,
        ACCIONES_DE_RECORRIDO.includes(v.accion) ? recorrido(raiz) : asercion(raiz))];
    }
    case 'diseno':
      return [gap(v.tipo, ubic, 'OBSERVABILITY_GAP', `La conformidad con el diseño de referencia (${v.referencia}) no es objetivamente verificable; se verifican las propiedades funcionales declaradas.`,
        asercion('observacion:conformidad-diseno'))];
  }
}

/** §7: solo resolucion TEST_DATA produce requisitos; CASE_LITERAL, SYSTEM y GENERATED nunca. */
function derivarRequisitos(e2e: DefinicionE2E, ctx: ContextoCompilacionE2E, registro: RegistroDatosPrueba): { requisitos: TestDataRequirement[]; gapsDatos: GapE2E[] } {
  const gapsDatos: GapE2E[] = [];
  const g = (d: DatoE2E, clasificacion: ClasificacionGapE2E, motivo: string, raiz: RaizGapE2E, requiere?: string[]) =>
    gapsDatos.push({ ubicacion: `datos · ${d.sujeto}.${d.campo}`, clasificacion, motivo, raiz, ...(requiere ? { requiere } : {}) });
  const etapaDe = (d: DatoE2E) => (esCampoPersona(d.campo) ? 'persona' : (ctx.politicas ?? POLITICAS_AFI)[d.campo]?.etapa ?? '-');
  const porSujeto = new Map<string, { requeridos: CampoDato[]; condicionales: NonNullable<TestDataRequirement['camposCondicionales']> }>();
  const sujeto = (s: string) => { if (!porSujeto.has(s)) porSujeto.set(s, { requeridos: [], condicionales: [] }); return porSujeto.get(s)!; };
  const participante = (s: string) => s !== SUJETO_PRINCIPAL;

  for (const d of e2e.datos) {
    if (d.resolucion === 'GENERATED') {
      const pol = !esCampoPersona(d.campo) ? politicasDelPerfil(ctx.perfil, ctx.politicas ?? POLITICAS_AFI)[d.campo] : undefined;
      const aut = pol?.generable;
      if (!aut || participante(d.sujeto) || !aut.perfiles.includes(ctx.perfil)) {
        g(d, 'KNOWLEDGE_GAP', `"${d.campo}" se declaró GENERATED, pero no existe una autorización generable para el perfil ${participante(d.sujeto) ? `del sujeto ${d.sujeto}` : ctx.perfil} en las políticas/Knowledge.`,
          recorrido(`knowledge:generable:${d.campo}`), ['política generable con perfil, etapa, estrategia, restricciones y evidencia (AFI-TEST-DATA §7.3)', 'o clasificarlo como TEST_DATA']);
      }
      continue;
    }
    if (d.resolucion !== 'TEST_DATA') continue; // CASE_LITERAL y SYSTEM nunca producen secretos.
    const pedible = participante(d.sujeto) ? esPedibleParticipante(d.campo) : !esCampoPersona(d.campo) && esPedible(d.campo);
    if (!pedible) {
      g(d, 'TEST_DATA_GAP', `"${d.campo}" no es provisionable para ${participante(d.sujeto) ? `el participante ${d.sujeto}` : `el actor principal (${ctx.perfil})`}`
        + `${!esCampoPersona(d.campo) && !participante(d.sujeto) ? `: la política lo resuelve como ${clasificarCampo(d.campo)}` : ''}.`,
      recorrido(`test-data:no-provisionable:${participante(d.sujeto) ? 'participante' : ctx.perfil}:${etapaDe(d)}`), ['modelar el campo como dato del actor para este perfil (política)']);
      continue;
    }
    const a = d.aplicabilidad;
    if (a === 'siempre') sujeto(d.sujeto).requeridos.push(d.campo);
    else if ('siPresenta' in a) g(d, 'KNOWLEDGE_GAP', `"${d.campo}" depende de la presencia de ${a.siPresenta.campo} en ${a.siPresenta.pantalla}: falta la regla funcional aprobada (condición semántica).`,
      recorrido(`knowledge:regla-funcional:${a.siPresenta.pantalla}.${a.siPresenta.campo}`));
    else {
      const c = a.cuando;
      const ref = e2e.datos.find(x => x.sujeto === (c.sujeto ?? d.sujeto) && x.campo === c.campo);
      if ((c.sujeto ?? d.sujeto) !== d.sujeto) g(d, 'TEST_DATA_GAP', `La condición de "${d.campo}" referencia otro sujeto (${c.sujeto}); Test Data solo evalúa condiciones del mismo sujeto.`, recorrido('capability:test-data-condicion-entre-sujetos'));
      else if (!ref || ref.resolucion !== 'TEST_DATA' || ref.aplicabilidad !== 'siempre') g(d, 'TEST_DATA_GAP', `La condición de "${d.campo}" referencia "${c.campo}", que no es un dato TEST_DATA incondicional del mismo sujeto.`, recorrido('capability:test-data-condicion-sobre-dato-no-incondicional'));
      else sujeto(d.sujeto).condicionales.push({ campo: d.campo, cuando: { campo: c.campo, operador: c.operador, valor: Array.isArray(c.valor) ? [...c.valor] : c.valor } });
    }
  }

  const slotActor = ctx.actorRef ? registro.slots.find(s => s.id === ctx.actorRef) : undefined;
  const precond = (s: string): CondicionActor[] => (e2e.precondiciones ?? []).filter(p => p.sujeto === s).map(p => ({ id: p.id, descripcion: p.descripcion }));
  const ids = new Map<string, string>();
  for (const s of porSujeto.keys()) ids.set(s, idRequisito(ctx.hu, ctx.caso, s));
  const requisitos: TestDataRequirement[] = [];
  for (const [s, campos] of porSujeto) {
    const id = ids.get(s)!;
    if (!campos.requeridos.length) {
      gapsDatos.push({ ubicacion: `datos · ${s}`, clasificacion: 'TEST_DATA_GAP', motivo: `El sujeto ${s} solo tiene datos condicionales; se requiere al menos un dato incondicional.`, raiz: recorrido(`test-data:requisito-no-representable:${s}`) });
      continue;
    }
    const base = !participante(s) && slotActor ? slotActor.condiciones.map(c => ({ ...c })) : [];
    const condiciones = [...base, ...precond(s).filter(c => !base.some(b => b.id === c.id))];
    if (!condiciones.length) {
      gapsDatos.push({ ubicacion: `datos · ${s}`, clasificacion: 'TEST_DATA_GAP', motivo: `El sujeto ${s} no declara precondiciones: un requisito de datos necesita al menos una condición de negocio.`, raiz: recorrido(`test-data:requisito-no-representable:${s}`) });
      continue;
    }
    const sujetoDecl = (e2e.sujetos ?? []).find(x => x.rol === s);
    const distintoDe = (e2e.relaciones ?? []).filter(r => r.tipo === 'distinto-sujeto' && r.sujetos.includes(s))
      .map(r => r.sujetos.find(x => x !== s)!).filter(o => o !== SUJETO_PRINCIPAL && ids.has(o) && participante(s)).map(o => ids.get(o)!);
    const req: TestDataRequirement = {
      schemaVersion: ESQUEMA_REQUISITO_DATOS, id,
      ...(participante(s) ? { rol: s } : { perfil: ctx.perfil }),
      condiciones, camposRequeridos: [...new Set(campos.requeridos)],
      ...(campos.condicionales.length ? { camposCondicionales: campos.condicionales } : {}),
      ...(distintoDe.length ? { distintoDe: [...new Set(distintoDe)] } : {}),
      ocurrencias: [{ hu: ctx.hu, caso: ctx.caso, ...(participante(s) ? { rol: s } : {}) }],
      reutilizable: true,
      ...(participante(s) ? (sujetoDecl?.actorRef ? { actorSugerido: sujetoDecl.actorRef } : {}) : ctx.actorRef ? { actorSugerido: ctx.actorRef } : {}),
    };
    const problemas = validarRequisito(req);
    if (problemas.length || !ID_REQUISITO.test(id)) {
      gapsDatos.push({ ubicacion: `datos · ${s}`, clasificacion: 'TEST_DATA_GAP', motivo: `El requisito derivado no es representable: ${problemas.map(p => p.detalle).join('; ')}`,
        raiz: recorrido(`test-data:requisito-no-representable:${s}`) });
      continue;
    }
    requisitos.push(req);
  }
  for (const r of (e2e.relaciones ?? []).filter(x => x.tipo === 'mismo-sujeto')) {
    gapsDatos.push({ ubicacion: `relaciones · ${r.sujetos.join('/')}`, clasificacion: 'TEST_DATA_GAP', motivo: 'La relación mismo-sujeto aún no se traduce a Test Data desde E2E.',
      raiz: recorrido('capability:test-data-mismo-sujeto') });
  }
  return { requisitos, gapsDatos };
}

/** Envelope de intake con los requisitos derivados (para `datos preparar`; nunca valores). */
export function envelopeDatosE2E(plan: PlanE2ECompilado) {
  return { schemaVersion: 'afi-agent-intake/v1', knowledgeProposals: [], classificationRequests: [], testDataRequirements: plan.requisitos };
}
