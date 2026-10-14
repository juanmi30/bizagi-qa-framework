import { DOMINIO_IGUAL, EXPECTATIVAS_POR_ENTIDAD, TIPOS_ENTIDAD, type Expectativa, type ReferenciaEntidad, type TipoEntidad } from '../aplicacion/superficies';
import { SUJETO_PRINCIPAL, esCampoDato, idDatosValido, rolParticipanteValido, type CampoDato } from '../datosPrueba/contrato';
import { POLITICAS_AFI } from '../politicas';

/**
 * CONTRATO E2E DECLARATIVO (sección `e2e` de un .afi.json). Puro. Lo produce el agente (Gemini) a partir del diseño QA; el
 * framework lo valida con claves CERRADAS, lo compila (deriva Test Data y gaps) y lo ejecuta con el harness genérico.
 *
 * El archivo expresa SOLO lo que el caso pide: sujetos, precondiciones, datos (uso/resolución/aplicabilidad, AFI-TEST-DATA §7)
 * y pasos con verificaciones observables por ids SEMÁNTICOS (Knowledge). Nunca declara gaps, selectores, ids DOM ni valores
 * secretos: los gaps los deriva el compilador.
 */

export const VERSION_E2E = 1;

// ---------- Datos (AFI-TEST-DATA §7) ----------
export const USOS_DATO = ['ASSERTION', 'SCENARIO', 'FILLER'] as const;
export type UsoDato = typeof USOS_DATO[number];
export const RESOLUCIONES_DATO = ['TEST_DATA', 'CASE_LITERAL', 'GENERATED', 'SYSTEM'] as const;
export type ResolucionDato = typeof RESOLUCIONES_DATO[number];
export const FUENTES_SISTEMA = ['RUES', 'Registraduria', 'Bizagi', 'Portal'] as const;
export const OPERADORES_CUANDO = ['igual', 'distinto', 'en'] as const;

export interface CuandoDato { campo: CampoDato; sujeto?: string; operador: typeof OPERADORES_CUANDO[number]; valor: string | string[] }
export type AplicabilidadDato = 'siempre' | { cuando: CuandoDato } | { siPresenta: { pantalla: string; campo: string } };

export interface DatoE2E {
  campo: CampoDato;
  /** "principal" o el rol de un sujeto declarado. */
  sujeto: string;
  uso: UsoDato[];
  resolucion: ResolucionDato;
  /** Solo CASE_LITERAL (público). */
  valor?: string;
  /** Solo SYSTEM. */
  fuenteSistema?: typeof FUENTES_SISTEMA[number];
  aplicabilidad: AplicabilidadDato;
}

/** `pantalla`: pantalla (id Knowledge) donde se CAPTURA a este sujeto; permite derivar sus datos de tránsito. */
export interface SujetoE2E { rol: string; actorRef?: string; pantalla?: string }
export interface RelacionE2E { tipo: 'distinto-sujeto' | 'mismo-sujeto'; sujetos: [string, string] }
export interface PrecondicionE2E { sujeto: string; id: string; descripcion: string }

// ---------- Verificaciones (lo observable que el CP espera) ----------
export const CLAVES_EXPECTATIVA_PANTALLA = [
  'titulo', 'etiquetasPresentes', 'etiquetasAusentes', 'migaContiene', 'camposVisiblesExactos', 'camposAusentes', 'campos', 'spinner', 'alerta',
] as const;
export interface ExpectativaCampoUi {
  campo: string; editable?: boolean; vacio?: boolean; precargado?: boolean; error?: boolean; tooltip?: string; placeholder?: string | null; visible?: boolean;
}
export interface ExpectativaPantallaE2E {
  titulo?: { texto: string; unico?: true };
  etiquetasPresentes?: string[];
  etiquetasAusentes?: string[];
  migaContiene?: string;
  /** Ids Knowledge (campo-ui): exactamente estos campos visibles. */
  camposVisiblesExactos?: string[];
  camposAusentes?: string[];
  campos?: ExpectativaCampoUi[];
  spinner?: { texto: string };
  alerta?: { titulo?: string; mensaje: string };
}

export const ACCIONES_E2E = [
  'avanzar', 'consultar-persona', 'diligenciar-obligatorios', 'descargar-formulario', 'cargar-documentos', 'consultar-bizagi', 'aprobar-solicitud',
] as const;
export type AccionE2E = typeof ACCIONES_E2E[number];

export type VerificacionE2EDef =
  | { tipo: 'bizagi-acceso'; rolRequerido?: string }
  | { tipo: 'parametrica-columnas'; entidad: string; busqueda?: string; columnas: string[]; tiposDato?: Record<string, string> }
  | { tipo: 'parametrica-mensajes'; entidad: string; busqueda?: string; columnaMensaje: string; mensajes: { descripcion: string; texto: string }[] }
  | { tipo: 'portal-apertura' }
  | { tipo: 'portal-caso-creado' }
  | { tipo: 'pantalla'; pantalla: string; expectativa: ExpectativaPantallaE2E }
  | { tipo: 'condicion'; entidad: ReferenciaEntidad; expectativa: Expectativa }
  | { tipo: 'accion'; accion: AccionE2E; sujeto?: string; pantalla?: string; hasta?: string; detalle?: string }
  | { tipo: 'diseno'; referencia: string };
export type TipoVerificacionE2E = VerificacionE2EDef['tipo'];

/**
 * Fidelidad semántica DECLARADA de un fragmento del diseño: lo que las verificaciones no expresan con exactitud.
 * `fragmento` es texto LITERAL de accion o esperado del paso. Nunca cuenta como equivalencia exacta.
 */
export const REPRESENTACIONES_FIDELIDAD = ['aproximada', 'no-representable'] as const;
export interface FidelidadE2E { fragmento: string; representacion: typeof REPRESENTACIONES_FIDELIDAD[number]; motivo: string }

export interface PasoE2EDef {
  paso: number; accion: string; esperado: string; dispositivo?: 'desktop' | 'mobile'; verificaciones: VerificacionE2EDef[];
  /** Puramente DOCUMENTAL (p. ej. columna de observaciones del Excel): trazabilidad, nunca ejecución, gaps ni aserciones. */
  notaFuente?: string;
  fidelidad?: FidelidadE2E[];
}

export interface DefinicionE2E {
  version: typeof VERSION_E2E;
  /** Trazabilidad con la fuente (p. ej. la hoja del diseño QA). */
  hoja?: string;
  sujetos?: SujetoE2E[];
  relaciones?: RelacionE2E[];
  precondiciones?: PrecondicionE2E[];
  datos: DatoE2E[];
  pasos: PasoE2EDef[];
}

// ---------- Validación estricta (claves cerradas) ----------
export interface ProblemaE2E { ruta: string; mensaje: string }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const listaTextos = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(texto);
const idKebab = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(v) && v.length <= 80;
const cerrar = (o: Record<string, unknown>, permitidas: readonly string[], ruta: string, error: (r: string, m: string) => void) => {
  for (const k of Object.keys(o)) if (!permitidas.includes(k)) error(`${ruta}.${k}`.replace(/^\./, ''), 'clave no admitida por el contrato E2E');
};
/** Un literal del caso nunca puede ser un selector, código, URL ni un nombre de variable. */
/** Nombre de variable de entorno: solo MAYÚSCULAS/dígitos por segmento (AFI_X_Y); "AFI_Consulta…" es un nombre de negocio. */
const literalSeguro = (v: string) => !/[#[\]{}<>$]|https?:\/\/|\bAFI_[A-Z0-9]+(?:_[A-Z0-9]+)+\b|xpath|getBy|locator\(|=>/.test(v);

const CLAVES_VERIFICACION: Record<TipoVerificacionE2E, readonly string[]> = {
  'bizagi-acceso': ['tipo', 'rolRequerido'],
  'parametrica-columnas': ['tipo', 'entidad', 'busqueda', 'columnas', 'tiposDato'],
  'parametrica-mensajes': ['tipo', 'entidad', 'busqueda', 'columnaMensaje', 'mensajes'],
  'portal-apertura': ['tipo'],
  'portal-caso-creado': ['tipo'],
  pantalla: ['tipo', 'pantalla', 'expectativa'],
  condicion: ['tipo', 'entidad', 'expectativa'],
  accion: ['tipo', 'accion', 'sujeto', 'pantalla', 'hasta', 'detalle'],
  diseno: ['tipo', 'referencia'],
};
export const TIPOS_VERIFICACION_E2E = Object.keys(CLAVES_VERIFICACION) as TipoVerificacionE2E[];
/** Expectativa de condición: tipo admitido por el tipo de ENTIDAD y `igual` solo dentro de su dominio cerrado. */
function validarExpectativaCondicion(tipoEntidad: unknown, ex: unknown, r: string, error: (r: string, m: string) => void): void {
  const admitidas = (TIPOS_ENTIDAD as readonly unknown[]).includes(tipoEntidad) ? EXPECTATIVAS_POR_ENTIDAD[tipoEntidad as TipoEntidad] : [];
  if (!esObjeto(ex) || !admitidas.includes(ex.tipo as never)) {
    return error(`${r}.expectativa`, `{ tipo: ${admitidas.join(' | ') || '(según el tipo de entidad)'} } para ${String(tipoEntidad)}`);
  }
  const dominio = DOMINIO_IGUAL[ex.tipo as keyof typeof DOMINIO_IGUAL];
  cerrar(ex, dominio ? ['tipo', 'igual'] : ['tipo'], `${r}.expectativa`, error);
  if (!dominio) return;
  if (dominio === 'literal') {
    const ok = ex.igual === null || typeof ex.igual === 'number' || typeof ex.igual === 'boolean' || (typeof ex.igual === 'string' && literalSeguro(ex.igual));
    if (!ok) error(`${r}.expectativa.igual`, 'valor literal público');
  } else if (!dominio.includes(ex.igual as string)) error(`${r}.expectativa.igual`, `${dominio.join(' | ')} (dominio cerrado)`);
}

/** ¿El campo es público (puede ser literal del caso)? Los de persona y los no públicos, nunca. */
export const campoPublico = (c: CampoDato) => esCampoDato(c) && Object.prototype.hasOwnProperty.call(POLITICAS_AFI, c)
  && POLITICAS_AFI[c as keyof typeof POLITICAS_AFI].sensibilidad === 'public';

export function validarE2E(e: unknown, def: { actorRef?: unknown }): ProblemaE2E[] {
  const problemas: ProblemaE2E[] = [];
  const error = (ruta: string, mensaje: string) => problemas.push({ ruta: `e2e${ruta ? `.${ruta}` : ''}`, mensaje });
  if (!esObjeto(e)) { error('', 'debe ser un objeto'); return problemas; }
  cerrar(e, ['version', 'hoja', 'sujetos', 'relaciones', 'precondiciones', 'datos', 'pasos'], '', error);
  if (e.version !== VERSION_E2E) error('version', `se espera ${VERSION_E2E}`);
  if (e.hoja !== undefined && !texto(e.hoja)) error('hoja', 'texto');

  // Sujetos: "principal" (actor del caso) + roles declarados.
  const roles = new Set<string>([SUJETO_PRINCIPAL]);
  if (e.sujetos !== undefined) {
    if (!Array.isArray(e.sujetos) || !e.sujetos.length) error('sujetos', 'si se declara, lista no vacía de { rol, actorRef? }');
    else e.sujetos.forEach((s: unknown, i) => {
      const r = `sujetos[${i}]`;
      if (!esObjeto(s)) return error(r, 'objeto { rol, actorRef? }');
      cerrar(s, ['rol', 'actorRef', 'pantalla'], r, error);
      if (s.pantalla !== undefined && !idKebab(s.pantalla)) error(`${r}.pantalla`, 'id semántico de pantalla (Knowledge)');
      if (!rolParticipanteValido(s.rol)) return error(`${r}.rol`, `rol kebab-case distinto de "${SUJETO_PRINCIPAL}"`);
      if (roles.has(s.rol)) return error(`${r}.rol`, 'rol repetido');
      if (s.actorRef !== undefined && !idDatosValido(s.actorRef)) error(`${r}.actorRef`, 'id semántico de actor (kebab-case)');
      roles.add(s.rol);
    });
  }
  const sujetoValido = (v: unknown) => typeof v === 'string' && roles.has(v);

  if (e.relaciones !== undefined) {
    if (!Array.isArray(e.relaciones) || !e.relaciones.length) error('relaciones', 'si se declara, lista no vacía');
    else e.relaciones.forEach((x: unknown, i) => {
      const r = `relaciones[${i}]`;
      if (!esObjeto(x)) return error(r, 'objeto { tipo, sujetos }');
      cerrar(x, ['tipo', 'sujetos'], r, error);
      if (!['distinto-sujeto', 'mismo-sujeto'].includes(String(x.tipo))) error(`${r}.tipo`, 'distinto-sujeto | mismo-sujeto');
      if (!Array.isArray(x.sujetos) || x.sujetos.length !== 2 || x.sujetos[0] === x.sujetos[1] || !x.sujetos.every(sujetoValido)) error(`${r}.sujetos`, 'dos sujetos declarados distintos');
    });
  }

  if (e.precondiciones !== undefined) {
    if (!Array.isArray(e.precondiciones) || !e.precondiciones.length) error('precondiciones', 'si se declara, lista no vacía');
    else e.precondiciones.forEach((x: unknown, i) => {
      const r = `precondiciones[${i}]`;
      if (!esObjeto(x)) return error(r, 'objeto { sujeto, id, descripcion }');
      cerrar(x, ['sujeto', 'id', 'descripcion'], r, error);
      if (!sujetoValido(x.sujeto)) error(`${r}.sujeto`, 'sujeto declarado');
      if (!idDatosValido(x.id)) error(`${r}.id`, 'kebab-case semántico');
      if (!texto(x.descripcion) || x.descripcion.length > 200 || !literalSeguro(x.descripcion)) error(`${r}.descripcion`, 'texto de negocio (máx. 200)');
    });
  }

  // Datos: tres dimensiones ortogonales y combinaciones legales (§7.1).
  const declarados = new Map<string, DatoE2E>();
  if (!Array.isArray(e.datos)) error('datos', 'lista requerida (puede estar vacía)');
  else e.datos.forEach((d: unknown, i) => {
    const r = `datos[${i}]`;
    if (!esObjeto(d)) return error(r, 'objeto { campo, sujeto, uso, resolucion, aplicabilidad }');
    cerrar(d, ['campo', 'sujeto', 'uso', 'resolucion', 'valor', 'fuenteSistema', 'aplicabilidad'], r, error);
    if (!esCampoDato(d.campo)) error(`${r}.campo`, 'campo desconocido (modelo AFI o de persona)');
    if (!sujetoValido(d.sujeto)) error(`${r}.sujeto`, '"principal" o un rol declarado en sujetos');
    const clave = `${String(d.sujeto)}:${String(d.campo)}`;
    if (declarados.has(clave)) error(r, 'dato repetido para el mismo sujeto');
    const uso = d.uso;
    if (!Array.isArray(uso) || !uso.every(u => (USOS_DATO as readonly unknown[]).includes(u)) || new Set(uso).size !== uso.length) error(`${r}.uso`, `lista de ${USOS_DATO.join(' | ')} sin repetir`);
    if (!(RESOLUCIONES_DATO as readonly unknown[]).includes(d.resolucion)) error(`${r}.resolucion`, RESOLUCIONES_DATO.join(' | '));
    const usos = Array.isArray(uso) ? uso as string[] : [];
    if (usos.includes('FILLER') && usos.length > 1) error(`${r}.uso`, 'FILLER excluye ASSERTION y SCENARIO');
    if (!usos.length && d.resolucion !== 'SYSTEM') error(`${r}.uso`, 'solo SYSTEM admite uso vacío');
    if (d.resolucion === 'GENERATED' && !(usos.length === 1 && usos[0] === 'FILLER')) error(`${r}.resolucion`, 'GENERATED exige uso ["FILLER"]');
    if (d.resolucion === 'SYSTEM' && usos.some(u => u !== 'ASSERTION')) error(`${r}.uso`, 'SYSTEM admite solo [] o ["ASSERTION"]');
    if (d.resolucion === 'CASE_LITERAL') {
      if (!texto(d.valor) || !literalSeguro(d.valor)) error(`${r}.valor`, 'CASE_LITERAL exige un valor literal público');
      else if (esCampoDato(d.campo) && !campoPublico(d.campo)) error(`${r}.valor`, 'un campo secreto o de persona nunca es literal del caso');
    } else if (d.valor !== undefined) error(`${r}.valor`, `${String(d.resolucion)} no lleva valor`);
    if (d.resolucion === 'SYSTEM') { if (!(FUENTES_SISTEMA as readonly unknown[]).includes(d.fuenteSistema)) error(`${r}.fuenteSistema`, FUENTES_SISTEMA.join(' | ')); }
    else if (d.fuenteSistema !== undefined) error(`${r}.fuenteSistema`, 'solo con SYSTEM');
    const a = d.aplicabilidad;
    if (a === 'siempre') { /* ok */ } else if (esObjeto(a) && Object.keys(a).length === 1 && esObjeto(a.cuando)) {
      const c = a.cuando;
      cerrar(c, ['campo', 'sujeto', 'operador', 'valor'], `${r}.aplicabilidad.cuando`, error);
      if (!esCampoDato(c.campo)) error(`${r}.aplicabilidad.cuando.campo`, 'campo desconocido');
      if (c.sujeto !== undefined && !sujetoValido(c.sujeto)) error(`${r}.aplicabilidad.cuando.sujeto`, 'sujeto declarado');
      if (!(OPERADORES_CUANDO as readonly unknown[]).includes(c.operador)) error(`${r}.aplicabilidad.cuando.operador`, OPERADORES_CUANDO.join(' | '));
      const vs = Array.isArray(c.valor) ? c.valor : [c.valor];
      if ((c.operador === 'en') !== Array.isArray(c.valor) || !vs.length || !vs.every(v => texto(v) && literalSeguro(v))) error(`${r}.aplicabilidad.cuando.valor`, 'literal público (lista solo con "en")');
    } else if (esObjeto(a) && Object.keys(a).length === 1 && esObjeto(a.siPresenta)) {
      cerrar(a.siPresenta, ['pantalla', 'campo'], `${r}.aplicabilidad.siPresenta`, error);
      if (!idKebab(a.siPresenta.pantalla) || !idKebab(a.siPresenta.campo)) error(`${r}.aplicabilidad.siPresenta`, 'ids semánticos de Knowledge { pantalla, campo }');
    } else error(`${r}.aplicabilidad`, '"siempre" | { cuando } | { siPresenta }');
    declarados.set(clave, d as unknown as DatoE2E);
  });
  // Una condición referencia un dato DECLARADO (del mismo u otro sujeto); nunca un campo inventado.
  for (const [clave, d] of declarados) {
    if (typeof d.aplicabilidad === 'object' && 'cuando' in d.aplicabilidad) {
      const c = d.aplicabilidad.cuando;
      if (!declarados.has(`${c.sujeto ?? d.sujeto}:${c.campo}`)) error(`datos(${clave}).aplicabilidad.cuando`, 'referencia un dato no declarado en e2e.datos');
    }
  }

  // Pasos y verificaciones (sin gaps: los deriva el compilador).
  if (!Array.isArray(e.pasos) || !e.pasos.length) { error('pasos', 'lista no vacía requerida'); return problemas; }
  const numeros = new Set<string>();
  e.pasos.forEach((p: unknown, i) => {
    const r = `pasos[${i}]`;
    if (!esObjeto(p)) return error(r, 'objeto { paso, accion, esperado, dispositivo?, verificaciones }');
    cerrar(p, ['paso', 'accion', 'esperado', 'dispositivo', 'verificaciones', 'notaFuente', 'fidelidad'], r, error);
    if (p.notaFuente !== undefined && (!texto(p.notaFuente) || p.notaFuente.length > 2000)) error(`${r}.notaFuente`, 'texto documental (máx. 2000)');
    if (p.fidelidad !== undefined) {
      if (!Array.isArray(p.fidelidad) || !p.fidelidad.length) error(`${r}.fidelidad`, 'si se declara, lista no vacía');
      else p.fidelidad.forEach((f: unknown, j) => {
        const rf = `${r}.fidelidad[${j}]`;
        if (!esObjeto(f)) return error(rf, '{ fragmento, representacion, motivo }');
        cerrar(f, ['fragmento', 'representacion', 'motivo'], rf, error);
        if (!(REPRESENTACIONES_FIDELIDAD as readonly unknown[]).includes(f.representacion)) error(`${rf}.representacion`, REPRESENTACIONES_FIDELIDAD.join(' | '));
        if (!texto(f.motivo)) error(`${rf}.motivo`, 'texto');
        if (!texto(f.fragmento) || !(String(p.accion).includes(f.fragmento) || String(p.esperado).includes(f.fragmento))) {
          error(`${rf}.fragmento`, 'texto LITERAL de la accion o del esperado del paso');
        }
      });
    }
    if (!Number.isInteger(p.paso) || (p.paso as number) < 1) error(`${r}.paso`, 'entero positivo');
    const disp = p.dispositivo ?? 'desktop';
    if (!['desktop', 'mobile'].includes(String(disp))) error(`${r}.dispositivo`, 'desktop | mobile');
    const k = `${String(p.paso)}:${String(disp)}`;
    if (numeros.has(k)) error(`${r}.paso`, 'paso repetido para el mismo dispositivo'); else numeros.add(k);
    if (!texto(p.accion) || !texto(p.esperado)) error(r, 'accion y esperado: texto literal del diseño QA');
    if (!Array.isArray(p.verificaciones) || !p.verificaciones.length) return error(`${r}.verificaciones`, 'lista no vacía');
    p.verificaciones.forEach((v: unknown, j) => validarVerificacion(v, `${r}.verificaciones[${j}]`, sujetoValido, error));
  });
  void def;
  return problemas;
}

function validarVerificacion(v: unknown, r: string, sujetoValido: (s: unknown) => boolean, error: (r: string, m: string) => void): void {
  if (!esObjeto(v)) return error(r, 'objeto { tipo, ... }');
  const tipo = v.tipo as TipoVerificacionE2E;
  if (!Object.prototype.hasOwnProperty.call(CLAVES_VERIFICACION, tipo)) return error(`${r}.tipo`, `tipo desconocido; admitidos: ${TIPOS_VERIFICACION_E2E.join(', ')}`);
  cerrar(v, CLAVES_VERIFICACION[tipo], r, error);
  switch (tipo) {
    case 'bizagi-acceso': if (v.rolRequerido !== undefined && !texto(v.rolRequerido)) error(`${r}.rolRequerido`, 'texto'); break;
    case 'parametrica-columnas':
      if (!texto(v.entidad) || !listaTextos(v.columnas)) error(r, 'entidad y columnas requeridas');
      if (v.busqueda !== undefined && !texto(v.busqueda)) error(`${r}.busqueda`, 'texto');
      if (v.tiposDato !== undefined && (!esObjeto(v.tiposDato) || !Object.values(v.tiposDato).every(texto))) error(`${r}.tiposDato`, '{ columna: tipo }');
      break;
    case 'parametrica-mensajes':
      if (!texto(v.entidad) || !texto(v.columnaMensaje) || !Array.isArray(v.mensajes) || !v.mensajes.length) error(r, 'entidad, columnaMensaje y mensajes requeridos');
      else v.mensajes.forEach((m: unknown, k) => {
        if (!esObjeto(m) || !texto(m.descripcion) || !texto(m.texto)) error(`${r}.mensajes[${k}]`, '{ descripcion, texto }');
        else cerrar(m, ['descripcion', 'texto'], `${r}.mensajes[${k}]`, error);
      });
      if (v.busqueda !== undefined && !texto(v.busqueda)) error(`${r}.busqueda`, 'texto');
      break;
    case 'pantalla': {
      if (!idKebab(v.pantalla)) error(`${r}.pantalla`, 'id semántico de pantalla (Knowledge), nunca un selector');
      const x = v.expectativa;
      if (!esObjeto(x) || !Object.keys(x).length) { error(`${r}.expectativa`, 'objeto no vacío'); break; }
      cerrar(x, CLAVES_EXPECTATIVA_PANTALLA, `${r}.expectativa`, error);
      if (x.titulo !== undefined && (!esObjeto(x.titulo) || !texto(x.titulo.texto) || (x.titulo.unico !== undefined && x.titulo.unico !== true))) error(`${r}.expectativa.titulo`, '{ texto, unico?: true }');
      for (const k of ['etiquetasPresentes', 'etiquetasAusentes'] as const) if (x[k] !== undefined && !listaTextos(x[k])) error(`${r}.expectativa.${k}`, 'lista de textos');
      for (const k of ['camposVisiblesExactos', 'camposAusentes'] as const) if (x[k] !== undefined && (!Array.isArray(x[k]) || !(x[k] as unknown[]).length || !(x[k] as unknown[]).every(idKebab))) error(`${r}.expectativa.${k}`, 'ids Knowledge (campo-ui)');
      if (x.migaContiene !== undefined && !texto(x.migaContiene)) error(`${r}.expectativa.migaContiene`, 'texto');
      if (x.campos !== undefined) {
        if (!Array.isArray(x.campos) || !x.campos.length) error(`${r}.expectativa.campos`, 'lista no vacía');
        else x.campos.forEach((c: unknown, k) => {
          if (!esObjeto(c) || !idKebab(c.campo)) return error(`${r}.expectativa.campos[${k}]`, '{ campo: id Knowledge, ... }');
          cerrar(c, ['campo', 'editable', 'vacio', 'precargado', 'error', 'tooltip', 'placeholder', 'visible'], `${r}.expectativa.campos[${k}]`, error);
        });
      }
      if (x.spinner !== undefined && (!esObjeto(x.spinner) || !texto(x.spinner.texto))) error(`${r}.expectativa.spinner`, '{ texto }');
      if (x.alerta !== undefined && (!esObjeto(x.alerta) || !texto(x.alerta.mensaje))) error(`${r}.expectativa.alerta`, '{ titulo?, mensaje }');
      break;
    }
    case 'condicion': {
      const en = v.entidad, ex = v.expectativa;
      if (!esObjeto(en) || !(TIPOS_ENTIDAD as readonly unknown[]).includes(en.tipo) || !idKebab(en.id)) error(`${r}.entidad`, `{ tipo: ${TIPOS_ENTIDAD.join(' | ')}, id }`);
      else cerrar(en, ['tipo', 'id'], `${r}.entidad`, error);
      validarExpectativaCondicion(esObjeto(en) ? en.tipo : undefined, ex, r, error);
      break;
    }
    case 'accion':
      if (!(ACCIONES_E2E as readonly unknown[]).includes(v.accion)) error(`${r}.accion`, ACCIONES_E2E.join(' | '));
      if (v.sujeto !== undefined && !sujetoValido(v.sujeto)) error(`${r}.sujeto`, 'sujeto declarado');
      for (const k of ['pantalla', 'hasta'] as const) if (v[k] !== undefined && !idKebab(v[k])) error(`${r}.${k}`, 'id semántico de pantalla (Knowledge)');
      if (v.detalle !== undefined && (!texto(v.detalle) || !literalSeguro(v.detalle))) error(`${r}.detalle`, 'texto de negocio');
      break;
    case 'diseno': if (!texto(v.referencia)) error(`${r}.referencia`, 'texto (p. ej. "figma")'); break;
    default: break;
  }
}

/**
 * FORMA COMPLETA del contrato E2E (única fuente publicada). Hojas: descripción con tipo/dominio; `[nodo]` = lista de nodo;
 * `{ '|': [...] }` = alternativas; claves terminadas en `?` = opcionales. El validador comparte estas claves (prueba de consistencia).
 */
export const FORMA_E2E = {
  e2e: {
    version: `${VERSION_E2E} (fijo)`,
    'hoja?': 'texto: hoja/caso del diseño QA (trazabilidad)',
    'sujetos?': [{ rol: 'kebab-case, distinto de "principal", único', 'actorRef?': 'id de un actor de testData.actores', 'pantalla?': 'id pantalla-ui donde se captura a este sujeto' }],
    'relaciones?': [{ tipo: 'distinto-sujeto | mismo-sujeto', sujetos: '[sujeto, sujeto] ("principal" o un rol declarado), distintos' }],
    'precondiciones?': [{ sujeto: '"principal" o rol declarado', id: 'kebab-case semántico', descripcion: 'condición de negocio (máx. 200, sin selectores ni valores secretos)' }],
    datos: [{
      campo: 'campo del modelo AFI (testData.campos) o de persona (primerNombre, segundoNombre, primerApellido, segundoApellido)',
      sujeto: '"principal" o rol declarado',
      uso: 'lista sin repetir de ASSERTION | SCENARIO | FILLER ([] solo con SYSTEM)',
      resolucion: 'TEST_DATA | CASE_LITERAL | GENERATED | SYSTEM',
      'valor?': 'solo CASE_LITERAL: literal público',
      'fuenteSistema?': 'solo SYSTEM: RUES | Registraduria | Bizagi | Portal',
      aplicabilidad: { '|': ['"siempre"', { cuando: { campo: 'dato declarado del mismo sujeto (o de `sujeto`)', 'sujeto?': 'sujeto del dato referido', operador: 'igual | distinto | en', valor: 'literal público; lista solo con "en"' } }, { siPresenta: { pantalla: 'id pantalla-ui', campo: 'id campo-ui' } }] },
    }],
    pasos: [{
      paso: 'entero >= 1 (número del diseño; único por dispositivo)',
      accion: 'texto LITERAL del diseño QA',
      esperado: 'texto LITERAL del diseño QA (incluidas erratas)',
      'dispositivo?': 'desktop (por defecto) | mobile',
      'notaFuente?': 'texto documental de la fuente (p. ej. observaciones del Excel); no ejecuta ni genera gaps',
      'fidelidad?': [{ fragmento: 'texto LITERAL de accion o esperado', representacion: 'aproximada | no-representable', motivo: 'por qué las verificaciones no lo expresan exactamente' }],
      verificaciones: '[verificacion] no vacía (ver verificaciones)',
    }],
  },
  verificaciones: {
    'bizagi-acceso': { tipo: '"bizagi-acceso"', 'rolRequerido?': 'texto' },
    'parametrica-columnas': { tipo: '"parametrica-columnas"', entidad: 'nombre visible de la paramétrica', 'busqueda?': 'texto', columnas: 'lista de textos exactos', 'tiposDato?': '{ columna: tipo } (texto)' },
    'parametrica-mensajes': { tipo: '"parametrica-mensajes"', entidad: 'texto', 'busqueda?': 'texto', columnaMensaje: 'texto', mensajes: [{ descripcion: 'texto', texto: 'texto EXACTO esperado' }] },
    'portal-apertura': { tipo: '"portal-apertura"' },
    'portal-caso-creado': { tipo: '"portal-caso-creado"' },
    pantalla: { tipo: '"pantalla"', pantalla: 'id pantalla-ui', expectativa: 'expectativaPantalla (al menos una clave)' },
    condicion: { tipo: '"condicion"', entidad: { tipo: TIPOS_ENTIDAD.join(' | '), id: 'id Knowledge' }, expectativa: 'expectativaCondicion (según entidad.tipo)' },
    accion: { tipo: '"accion"', accion: ACCIONES_E2E.join(' | '), 'sujeto?': 'sujeto declarado', 'pantalla?': 'id pantalla-ui donde ocurre', 'hasta?': 'id pantalla-ui destino (avanzar)', 'detalle?': 'texto de negocio (no estructurado: cuenta como aproximación)' },
    diseno: { tipo: '"diseno"', referencia: 'texto (p. ej. "figma")' },
  },
  expectativaPantalla: {
    'titulo?': { texto: 'encabezado exacto', 'unico?': 'true' },
    'etiquetasPresentes?': 'lista de textos visibles exactos',
    'etiquetasAusentes?': 'lista de textos que NO deben verse (tampoco como placeholder)',
    'migaContiene?': 'segmento exacto de la miga de pan',
    'camposVisiblesExactos?': 'lista de ids campo-ui: exactamente esos visibles',
    'camposAusentes?': 'lista de ids campo-ui',
    'campos?': [{ campo: 'id campo-ui', 'editable?': 'boolean', 'vacio?': 'boolean', 'precargado?': 'boolean', 'error?': 'boolean', 'tooltip?': 'texto exacto', 'placeholder?': 'texto | null', 'visible?': 'boolean' }],
    'spinner?': { texto: 'texto exacto' },
    'alerta?': { 'titulo?': 'texto', mensaje: 'texto exacto' },
  },
  expectativaCondicion: {
    tipo: 'según entidad.tipo (ver expectativasPorEntidad)',
    'igual?': 'solo resultado (exito | error) y valor (literal público); el resto NO lleva igual',
  },
} as const;

/** Ejemplos mínimos VÁLIDOS (sintéticos) para los puntos donde el esquema solo sería ambiguo. */
export const EJEMPLOS_E2E = {
  datoCondicional: { campo: 'cajaCompensacionAnterior', sujeto: 'principal', uso: ['SCENARIO'], resolucion: 'TEST_DATA', aplicabilidad: { cuando: { campo: 'afiliadoPrimeraVez', operador: 'igual', valor: 'No' } } },
  datoSistema: { campo: 'primerNombre', sujeto: 'persona-ejemplo', uso: ['ASSERTION'], resolucion: 'SYSTEM', fuenteSistema: 'Bizagi', aplicabilidad: 'siempre' },
  integracionNoInvocada: { tipo: 'condicion', entidad: { tipo: 'integracion', id: 'integracion-ejemplo' }, expectativa: { tipo: 'no-invocada' } },
  integracionResultado: { tipo: 'condicion', entidad: { tipo: 'integracion', id: 'integracion-ejemplo' }, expectativa: { tipo: 'resultado', igual: 'exito' } },
  pantallaCampos: { tipo: 'pantalla', pantalla: 'pantalla-ejemplo', expectativa: { camposVisiblesExactos: ['campo-ejemplo-a', 'campo-ejemplo-b'], campos: [{ campo: 'campo-ejemplo-a', vacio: true }] } },
  accionConSujeto: { tipo: 'accion', accion: 'consultar-persona', sujeto: 'persona-ejemplo', pantalla: 'pantalla-ejemplo' },
  pasoConFidelidad: {
    paso: 3, accion: 'Consulte la persona', esperado: 'Se precargan los nombres correctamente y el campo nombre completo no es visible',
    verificaciones: [{ tipo: 'pantalla', pantalla: 'pantalla-ejemplo', expectativa: { camposAusentes: ['campo-ejemplo-c'] } }],
    fidelidad: [{ fragmento: 'Se precargan los nombres correctamente', representacion: 'aproximada', motivo: 'se verifica la precarga, no la igualdad con el valor de la fuente' }],
    notaFuente: 'Observación del diseño conservada como trazabilidad.',
  },
} as const;

/** Publicación del contrato para el agente (manifest). */
export function publicarContratoE2E() {
  return {
    version: VERSION_E2E,
    seccion: 'e2e (opcional en .afi.json; con e2e, funcional es opcional)',
    claves: ['version', 'hoja', 'sujetos', 'relaciones', 'precondiciones', 'datos', 'pasos'],
    datos: {
      claves: ['campo', 'sujeto', 'uso', 'resolucion', 'valor', 'fuenteSistema', 'aplicabilidad'],
      uso: [...USOS_DATO], resolucion: [...RESOLUCIONES_DATO], fuenteSistema: [...FUENTES_SISTEMA],
      aplicabilidad: ['"siempre"', '{ cuando: { campo, sujeto?, operador: igual|distinto|en, valor } }', '{ siPresenta: { pantalla, campo } } (solo si la regla funcional no está aprobada)'],
      reglas: [
        'FILLER excluye ASSERTION y SCENARIO.',
        'GENERATED exige uso ["FILLER"] y una autorización generable en la política del campo; sin ella el compilador deriva un gap.',
        'CASE_LITERAL exige un campo público y su valor; un secreto o dato externo nunca es literal.',
        'TEST_DATA y GENERATED nunca llevan valor: el compilador deriva los testDataRequirements.',
        'SYSTEM no lleva valor y admite uso [] o ["ASSERTION"].',
        'Obligatorio en la UI no implica obligatorio en Test Data (AFI-TEST-DATA §7).',
      ],
    },
    verificaciones: Object.fromEntries(Object.entries(CLAVES_VERIFICACION).map(([t, ks]) => [t, ks.filter(k => k !== 'tipo')])),
    expectativaPantalla: [...CLAVES_EXPECTATIVA_PANTALLA],
    acciones: [...ACCIONES_E2E],
    forma: FORMA_E2E,
    dominios: {
      uso: [...USOS_DATO], resolucion: [...RESOLUCIONES_DATO], fuenteSistema: [...FUENTES_SISTEMA], operadorCuando: [...OPERADORES_CUANDO],
      dispositivo: ['desktop', 'mobile'], relacion: ['distinto-sujeto', 'mismo-sujeto'], representacionFidelidad: [...REPRESENTACIONES_FIDELIDAD],
      tiposVerificacion: [...TIPOS_VERIFICACION_E2E], acciones: [...ACCIONES_E2E], tiposEntidad: [...TIPOS_ENTIDAD],
      expectativasPorEntidad: Object.fromEntries(TIPOS_ENTIDAD.map(t => [t, [...EXPECTATIVAS_POR_ENTIDAD[t]]])),
      igualPorExpectativa: Object.fromEntries(Object.entries(DOMINIO_IGUAL).map(([k, v]) => [k, v === 'literal' ? 'literal público' : [...(v as readonly string[])]])),
    },
    ejemplos: EJEMPLOS_E2E,
    reglas: [
      'Pantallas y campos por id SEMÁNTICO de Knowledge (aplicacion.entidades); nunca selectores ni ids DOM.',
      'El archivo NO declara gaps: el compilador deriva CAPABILITY/KNOWLEDGE/OBSERVABILITY/TEST_DATA comparando con capabilities, Knowledge, proveedores y Test Data.',
      'Textos esperados copiados EXACTAMENTE del diseño QA (incluidas sus erratas).',
      'No declares las pantallas intermedias ni sus datos de tránsito: el compilador deriva la ruta desde Knowledge (transiciones) y los datos que exige.',
      'Si un sujeto se captura en una pantalla que el caso no menciona, declara sujetos[].pantalla para que el compilador sepa a quién usar al atravesarla.',
      'Lo que las verificaciones no expresan con exactitud se declara en fidelidad (aproximada | no-representable) con el fragmento literal; nunca se omite en silencio.',
      'Una integración que NO debe invocarse: expectativa { "tipo": "no-invocada" }; nunca un valor libre en igual.',
      'Observaciones de la fuente que no son requisitos van en notaFuente (documental).',
    ],
  };
}
