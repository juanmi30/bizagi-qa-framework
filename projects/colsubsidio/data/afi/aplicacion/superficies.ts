/**
 * MODELO MULTI-SUPERFICIE DE TESTABILIDAD (Fase 4L). Capa pura.
 *
 *   REQUISITO -> CONDICIÓN OBSERVABLE -> SUPERFICIE -> PROVEEDOR DE OBSERVACIÓN -> EVIDENCIA
 *
 * - La CONDICIÓN (qué debe cumplirse: entidad + expectativa) pertenece al caso.
 * - El PROVEEDOR (cómo obtener el hecho: DOM, API, traza, bandeja...) pertenece al framework. Solo MIDE y devuelve un
 *   hecho neutro; el veredicto lo calcula este módulo comparando el hecho con la expectativa. Así una misma condición
 *   puede observarse mañana por otra fuente sin reescribir el caso.
 */

// ---------- 1. Taxonomía cerrada de entidades ----------

export const TIPOS_ENTIDAD = ['pantalla-ui', 'campo-ui', 'transicion-ui', 'actividad', 'ruta', 'integracion', 'variable', 'notificacion'] as const;
export type TipoEntidad = typeof TIPOS_ENTIDAD[number];

export const DESCRIPCION_ENTIDAD: Readonly<Record<TipoEntidad, string>> = {
  'pantalla-ui': 'Pantalla de la interfaz, reconocida por firma semántica.',
  'campo-ui': 'Control de la interfaz (Field Registry). Un dato interno del proceso NO es un campo UI.',
  'transicion-ui': 'Paso de navegación entre dos pantallas de la interfaz (desde -> hacia). NO es una ruta del proceso BPM.',
  actividad: 'Estado, actividad o subproceso del proceso BPM.',
  ruta: 'Ruta o transición del proceso BPM entre actividades. NO es una pantalla.',
  integracion: 'Llamada a un sistema externo: si fue invocada y, si lo fue, su resultado. NO es una transición visual.',
  variable: 'Dato del proceso o de una integración, no visible como control.',
  notificacion: 'Mensaje emitido hacia un canal externo.',
};

// ---------- Expectativas semánticas (QUÉ), cerradas por tipo de entidad ----------

export type ValorPrimitivo = string | number | boolean | null;

export type Expectativa =
  | { tipo: 'visible' } | { tipo: 'no-visible' }
  | { tipo: 'alcanzada' } | { tipo: 'no-alcanzada' }
  | { tipo: 'tomada' } | { tipo: 'no-tomada' }
  | { tipo: 'resultado'; igual: 'exito' | 'error' }
  /** Invocación (separada del resultado): una integración puede no invocarse (p. ej. el dato ya estaba en otra fuente). */
  | { tipo: 'invocada' } | { tipo: 'no-invocada' }
  | { tipo: 'valor'; igual: ValorPrimitivo }
  | { tipo: 'emitida' } | { tipo: 'no-emitida' };
export type TipoExpectativa = Expectativa['tipo'];

export const EXPECTATIVAS_POR_ENTIDAD: Readonly<Record<TipoEntidad, readonly TipoExpectativa[]>> = {
  'pantalla-ui': ['visible', 'no-visible'],
  'campo-ui': ['valor'],
  'transicion-ui': ['tomada', 'no-tomada'],
  actividad: ['alcanzada', 'no-alcanzada'],
  ruta: ['tomada', 'no-tomada'],
  integracion: ['resultado', 'invocada', 'no-invocada'],
  variable: ['valor'],
  notificacion: ['emitida', 'no-emitida'],
};

/** Dominio CERRADO de `igual` por tipo de expectativa (ausente = la expectativa no lleva `igual`). */
export const DOMINIO_IGUAL: Readonly<Partial<Record<TipoExpectativa, readonly string[] | 'literal'>>> = { resultado: ['exito', 'error'], valor: 'literal' };

export interface ReferenciaEntidad { tipo: TipoEntidad; id: string }

/** Condición observable del CASO: sin mecanismo, selector, API ni fuente. */
export interface CondicionObservable {
  id: string;
  entidad: ReferenciaEntidad;
  expectativa: Expectativa;
}

// ---------- 2. Superficies ----------

export const SUPERFICIES = {
  'portal-ui': { entidades: ['pantalla-ui', 'campo-ui', 'transicion-ui'], descripcion: 'Interfaz web del Portal.' },
  'proceso-bpm': { entidades: ['actividad', 'ruta', 'variable'], descripcion: 'Estado interno del proceso BPM (actividades, rutas, datos del caso).' },
  integracion: { entidades: ['integracion', 'variable'], descripcion: 'Intercambios con sistemas externos y sus datos.' },
  notificacion: { entidades: ['notificacion'], descripcion: 'Mensajes emitidos a canales externos.' },
} as const satisfies Record<string, { entidades: readonly TipoEntidad[]; descripcion: string }>;
export type SuperficieObservacion = keyof typeof SUPERFICIES;

export const superficiesDeEntidad = (tipo: TipoEntidad): SuperficieObservacion[] =>
  (Object.keys(SUPERFICIES) as SuperficieObservacion[]).filter(s => (SUPERFICIES[s].entidades as readonly TipoEntidad[]).includes(tipo));

// ---------- 3. Proveedor de observación (CÓMO) ----------

/** Hecho neutro medido por un proveedor. Nunca un veredicto. */
export type Medicion =
  | { tipo: 'presencia'; presente: boolean }
  | { tipo: 'valor'; existe: boolean; valor?: ValorPrimitivo }
  | { tipo: 'resultado'; resultado: 'exito' | 'error' | 'sin-ejecutar' };

/** Referencia a la evidencia que respalda la medición (portable: ids, nunca rutas ni PII). */
export interface EvidenciaObservacion { tipo: string; referencia: string }

export interface ContextoObservacion {
  caso: string;
  ejecucion: string;
  /**
   * (4R) Correlación RUNTIME con el caso Bizagi creado por ESTA ejecución (respuesta de creación / histórico).
   * Nunca proviene del actor, de los datos de prueba ni del caso declarativo.
   */
  casoBizagi?: string;
}

/** (4R) Claves admitidas: cualquier otra (p. ej. un actorRef o el estado de provisión) se rechaza. */
const CLAVES_CONTEXTO: readonly string[] = ['caso', 'ejecucion', 'casoBizagi'];

/**
 * (4R) Por qué una observación NO produjo medición. Ninguno es un veredicto funcional:
 *  - infraestructura: red, timeout, fuente caída o no propagada;
 *  - autenticacion: la fuente rechazó la identidad/credencial;
 *  - dato-ausente: la fuente respondió pero no permite concluir (sin correlación, instantánea sin el hecho...);
 *  - error-proveedor: fallo inesperado del proveedor o medición incompatible con la expectativa.
 */
export const MOTIVOS_NO_OBSERVABLE = ['infraestructura', 'autenticacion', 'dato-ausente', 'error-proveedor'] as const;
export type MotivoNoObservable = typeof MOTIVOS_NO_OBSERVABLE[number];

/** (4R) Un proveedor lanza este error para declarar un motivo. Su mensaje es fijo: nunca arrastra detalles de la fuente. */
export class ObservacionNoDisponibleError extends Error {
  constructor(readonly motivo: MotivoNoObservable) { super(`Observación no disponible: ${motivo}`); this.name = 'ObservacionNoDisponibleError'; }
}

export type ResultadoObserve =
  | { medicion: Medicion; evidencia: EvidenciaObservacion }
  /** (4R) La fuente no permite medir ahora: NO_OBSERVABLE, nunca FAIL. */
  | { noObservable: MotivoNoObservable };

export interface ObservationProvider {
  readonly id: string;
  readonly superficie: SuperficieObservacion;
  /** Fail-closed: solo lo que el proveedor sabe medir de verdad. */
  supports(entidad: ReferenciaEntidad): boolean;
  /**
   * (4R) Expectativas que el proveedor CERTIFICA honestamente. Ausente = todas las del tipo (compatibilidad 4L).
   * Una fuente de instantánea (lo presente ahora) declara solo las positivas: su ausencia no demuestra la negación.
   */
  readonly expectativas?: readonly TipoExpectativa[];
  observe(entidad: ReferenciaEntidad, contexto: ContextoObservacion): Promise<ResultadoObserve>;
}

/** (4R) ¿El proveedor puede certificar ESA expectativa sobre ESA entidad? (supports + expectativas declaradas). */
export function proveedorCertifica(
  p: Pick<ObservationProvider, 'supports' | 'expectativas'>, entidad: ReferenciaEntidad, expectativa: TipoExpectativa,
): boolean {
  return p.supports(entidad) && (!p.expectativas || p.expectativas.includes(expectativa));
}

/** (4R) Medición compatible con la expectativa: lo contrario es un error del proveedor, nunca un FAIL funcional. */
export function medicionCompatible(e: Expectativa, m: Medicion): boolean {
  switch (e.tipo) {
    case 'resultado': return m.tipo === 'resultado';
    case 'valor': return m.tipo === 'valor';
    default: return m.tipo === 'presencia';
  }
}

export class ContextoObservacionInvalidoError extends Error {
  constructor(detalle: string) { super(`Contexto de observación inválido: ${detalle}`); this.name = 'ContextoObservacionInvalidoError'; }
}

/** (4R) El contexto solo transporta identidad de ejecución y correlación runtime: nada del actor ni de la provisión. */
export function validarContexto(c: ContextoObservacion): void {
  for (const k of Object.keys(c ?? {})) if (!CLAVES_CONTEXTO.includes(k)) throw new ContextoObservacionInvalidoError(`clave no admitida ${k.slice(0, 30)}`);
  if (c.casoBizagi !== undefined && !/^\d+$/.test(c.casoBizagi)) throw new ContextoObservacionInvalidoError('casoBizagi debe ser un número de caso');
}

/** Formato común de resultado/evidencia para toda superficie. */
export interface ResultadoObservacion {
  condicion: string;
  entidad: ReferenciaEntidad;
  expectativa: Expectativa;
  resultado: 'PASS' | 'FAIL' | 'NO_OBSERVABLE';
  superficie?: SuperficieObservacion;
  proveedor?: string;
  /** (4R) Una medición de valor se publica SIN el valor observado (posible PII): el veredicto ya lo resume. */
  medicion?: Medicion;
  evidencia?: EvidenciaObservacion;
  /**
   * Solo NO_OBSERVABLE: qué falta. provider-superficie conserva TODAS las superficies efectivas candidatas;
   * conocimiento-declarativo = la entidad no está registrada (sin superficies efectivas).
   */
  gap?: { clase: 'provider-superficie' | 'conocimiento-declarativo'; superficiesCandidatas: SuperficieObservacion[]; capacidad: string };
  /** (4R) Solo NO_OBSERVABLE con proveedor: cada intento y su motivo. No es un gap de capacidad ni un FAIL. */
  noObservado?: { intentos: { superficie: SuperficieObservacion; proveedor: string; motivo: MotivoNoObservable }[] };
}

export class CondicionInvalidaError extends Error {
  constructor(detalle: string) { super(`Condición observable inválida: ${detalle}`); this.name = 'CondicionInvalidaError'; }
}

/** La expectativa debe corresponder al tipo de entidad (una ruta no puede estar "visible"). */
export function validarCondicion(c: CondicionObservable): void {
  if (!(TIPOS_ENTIDAD as readonly string[]).includes(c.entidad?.tipo)) throw new CondicionInvalidaError(`${c.id}: tipo de entidad desconocido`);
  if (!c.entidad.id?.trim()) throw new CondicionInvalidaError(`${c.id}: entidad sin id`);
  if (!EXPECTATIVAS_POR_ENTIDAD[c.entidad.tipo].includes(c.expectativa?.tipo)) {
    throw new CondicionInvalidaError(`${c.id}: la expectativa "${c.expectativa?.tipo}" no aplica a ${c.entidad.tipo}`);
  }
}

/** Veredicto = comparación GENÉRICA de la expectativa (caso) con la medición (proveedor). */
export function evaluarExpectativa(e: Expectativa, m: Medicion): 'PASS' | 'FAIL' {
  const ok = (() => {
    switch (e.tipo) {
      case 'visible': case 'alcanzada': case 'tomada': case 'emitida': case 'invocada': return m.tipo === 'presencia' && m.presente;
      case 'no-visible': case 'no-alcanzada': case 'no-tomada': case 'no-emitida': case 'no-invocada': return m.tipo === 'presencia' && !m.presente;
      case 'resultado': return m.tipo === 'resultado' && m.resultado === e.igual;
      case 'valor': return m.tipo === 'valor' && m.existe && m.valor === e.igual;
    }
  })();
  return ok ? 'PASS' : 'FAIL';
}

// (observarCondicion vive en observacion.ts: necesita el Application Model para las superficies efectivas.)

// ---------- Proveedores PRODUCTIVOS y publicación (4M) ----------

/** Alcance que un proveedor CERTIFICA: tipos de entidad y expectativas (fail-closed: lo demás no). */
export interface AlcanceProveedor { tipos: readonly TipoEntidad[]; expectativas: readonly TipoExpectativa[] }

/** (4R.1) Proveedor con implementación real: superficie, alcance y claves de su localización (esquema del vínculo). */
export interface DescriptorProveedor extends AlcanceProveedor {
  superficie: SuperficieObservacion;
  /** Claves EXACTAS de su localización (esquema cerrado). */
  localizacion: readonly string[];
  descripcion: string;
}

/** Catálogo de proveedores IMPLEMENTADOS: fuente ÚNICA de su alcance. Implementado no implica productivo. */
export const CATALOGO_PROVEEDORES: Readonly<Record<string, DescriptorProveedor>> = Object.freeze({
  'tareas-pendientes-bizagi': {
    superficie: 'proceso-bpm',
    tipos: ['actividad'],
    expectativas: ['alcanzada'],
    localizacion: ['nombreTarea'],
    descripcion: 'Tareas pendientes AHORA del caso de la ejecución (Work Portal, Admin → Casos). Instantánea: solo certifica alcanzada.',
  },
});

/** Proveedor tal como se publica y diagnostica: id, superficie y (si se conoce) su alcance certificado. */
export type ProveedorPublicable = Pick<ObservationProvider, 'id' | 'superficie'> & { alcance?: AlcanceProveedor };

/**
 * Ids de los proveedores PRODUCTIVOS: implementados Y validados en QA real. Promover uno es un cambio RUNTIME
 * (clasificarIncorporacion) revisable; su alcance NO se declara aquí: sale de CATALOGO_PROVEEDORES.
 *  - tareas-pendientes-bizagi: 4R.2, dos corridas reales independientes (caso propio, correlación, actividad.alcanzada
 *    PASS, cleanup PASS). Productivo SOLO en su alcance de catálogo (actividad.alcanzada).
 * Los proveedores en memoria de las pruebas nunca se registran aquí. Productivo != entidad observable: hace falta un
 * vínculo aprobado (vinculos.ts) para que una condición concreta sea observable.
 */
export const IDS_PROVEEDORES_PRODUCTIVOS = Object.freeze(['tareas-pendientes-bizagi'] as const);

export const PROVEEDORES_PRODUCTIVOS: readonly ProveedorPublicable[] = Object.freeze(IDS_PROVEEDORES_PRODUCTIVOS.map(id => {
  const d = CATALOGO_PROVEEDORES[id];
  return Object.freeze({ id, superficie: d.superficie, alcance: Object.freeze({ tipos: d.tipos, expectativas: d.expectativas }) });
}));

/**
 * Mecanismos productivos PREVIOS a 4L que ya observan una superficie sin implementar ObservationProvider.
 * portal-ui: las operaciones funcionales del runner v1 (lo que publican funcional.operaciones).
 */
export const MECANISMOS_PREVIOS: Readonly<Partial<Record<SuperficieObservacion, string>>> = Object.freeze({
  'portal-ui': 'funcional.operaciones (runner v1): solo lo que esas operaciones garantizan',
});

/**
 * Estado publicable de cada superficie: qué observa y con qué proveedores PRODUCTIVOS cuenta.
 * (4R) `cobertura`: por proveedor, EXACTAMENTE las (entidad, expectativas) que certifica dentro de la superficie
 * (su alcance; sin alcance declarado = todo lo de la superficie, compatibilidad 4L). Estado:
 *  - con-proveedor: la unión de coberturas cubre TODAS las observaciones de la superficie;
 *  - parcial: cubre solo una parte (nunca se afirma la superficie completa por un proveedor parcial);
 *  - solo-mecanismo-previo / sin-proveedor: como antes.
 */
export function publicarSuperficies(proveedores: readonly ProveedorPublicable[] = PROVEEDORES_PRODUCTIVOS) {
  return (Object.keys(SUPERFICIES) as SuperficieObservacion[]).map(superficie => {
    const propios = proveedores.filter(p => p.superficie === superficie);
    const observaciones = SUPERFICIES[superficie].entidades.map(entidad => ({ entidad, expectativas: [...EXPECTATIVAS_POR_ENTIDAD[entidad]] }));
    const cobertura = propios.map(p => ({
      proveedor: p.id,
      observaciones: observaciones
        .filter(o => !p.alcance || p.alcance.tipos.includes(o.entidad))
        .map(o => ({ entidad: o.entidad, expectativas: o.expectativas.filter(e => !p.alcance || p.alcance.expectativas.includes(e)) }))
        .filter(o => o.expectativas.length),
    }));
    const cubiertas = new Set(cobertura.flatMap(c => c.observaciones.flatMap(o => o.expectativas.map(e => `${o.entidad}.${e}`))));
    const total = observaciones.flatMap(o => o.expectativas.map(e => `${o.entidad}.${e}`));
    const previo = MECANISMOS_PREVIOS[superficie];
    return {
      superficie,
      descripcion: SUPERFICIES[superficie].descripcion,
      observaciones,
      proveedores: propios.map(p => p.id),
      ...(propios.length ? { cobertura } : {}),
      ...(previo ? { mecanismoPrevio: previo } : {}),
      estado: !propios.length ? (previo ? 'solo-mecanismo-previo' as const : 'sin-proveedor' as const)
        : total.every(x => cubiertas.has(x)) ? 'con-proveedor' as const : 'parcial' as const,
    };
  });
}
