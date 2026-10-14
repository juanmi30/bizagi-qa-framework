import {
  resolverCondicion, testabilidadCanonica, type CondicionResuelta, type GapCondicion, type TestabilidadCompilacion,
} from './aplicacion/resolucionObservacion';
import { CapabilityGapPreparacionError, problemasCapacidadPreparacion } from './capacidadesPreparacion';
import { SUJETO_PRINCIPAL, idDatosValido, rolParticipanteValido } from './datosPrueba/contrato';
import { TIPOS_RELACION_SUJETOS, type ParticipanteCaso, type RelacionSujetos } from './datosPrueba/registro';
import { CapabilityGapError, exigirPlanFuncionalValido, validarPlanFuncionalAfi, type PlanFuncionalAfi, type ProblemaPlanFuncional } from './funcional';
import {
  CAMPOS_AFI, ETAPAS_AFI,
  type ActorAfi, type CampoAfi, type DiagnosticoResolucion, type EtapaAfi, type MotivoGap, type OrigenDato, type PerfilActorAfi, type ValorCaso,
} from './modelo';
import { POLITICAS_AFI } from './politicas';
import { resolverEtapa, type PlanPreparacion } from './resolver';
import { validarE2E, type DefinicionE2E } from './e2e/contrato';

/**
 * Contrato canónico de caso AFI (Fase 3A): lo que un agente producirá desde el diseño QA.
 * Solo DATOS JSON: sin TypeScript, Playwright, selectores, funciones, RegExp ni process.env.
 *
 * El contrato NO controla (es del framework): retries, workers, cleanup, ledger, credenciales,
 * URLs, timeouts de infraestructura, locators/selectores, login ni navegación resiliente.
 * Tampoco contiene PII: el actor se materializa en ejecución desde el perfil lógico.
 */

export const VERSION_CASO_AFI = 1;
export const PERFILES_CASO_AFI = ['empresa', 'pensionado', 'facultativo', 'independiente'] as const satisfies readonly PerfilActorAfi[];

export interface DefinicionCasoAfi {
  version: typeof VERSION_CASO_AFI;
  hu: string;
  caso: string;
  nombre: string;
  /** Opcional y reproducible: sin rutas locales, timestamps ni ambiente. */
  fuente?: { tipo: 'diseno-qa'; referencia?: string };
  /** Perfil lógico; el ActorAfi (con PII) lo resuelve el runner. */
  perfil: PerfilActorAfi;
  /**
   * Opcional (4P): actor lógico del Test Data Registry (clase de actor reutilizable del MISMO perfil). Sin actorRef se usa
   * el actor del perfil. Nunca un secretRef, un nombre de variable ni un valor: el framework resuelve el slot.
   */
  actorRef?: string;
  /**
   * (4S) Opcional: sujetos SECUNDARIOS del caso, cada uno con un rol semántico del diseño QA y el sujeto aprobado que lo
   * provee. Solo declara QUIÉNES hacen falta: cuándo se usa cada uno lo decidiría una operación que lo referencie
   * explícitamente (aún no existe: CAPABILITY_GAP).
   */
  participantes?: ParticipanteCaso[];
  /** (4S) Opcional: relaciones que el diseño QA EXIGE entre sujetos ("principal" = actor principal). Sin relación, nada se infiere. */
  relaciones?: RelacionSujetos[];
  preparacion: {
    /** Solo valores/reglas que pertenecen al CASO. Nunca PII ni lo que ya resuelven actor/derived/auxiliary. */
    datosCaso: Partial<Record<CampoAfi, ValorCaso>>;
    /** Campos cuyo valor es resultado esperado; no se infiere de datosCaso. */
    camposAsercion: CampoAfi[];
    /** Etapas a preparar, en el orden de ETAPAS_AFI. */
    etapas: EtapaAfi[];
  };
  /** Plan funcional en "Información de contacto". Opcional SOLO si el caso declara `e2e`. */
  funcional?: PlanFuncionalAfi;
  /** (E2E) Recorrido y verificaciones declarativas del caso completo (data/afi/e2e/contrato.ts). */
  e2e?: DefinicionE2E;
}

// ---------- Validación desde unknown ----------

export interface ProblemaDefinicionCaso {
  ruta: string;
  /** contrato: definición mal formada; capability: el plan funcional pide algo que AFI no ejecuta. */
  clase: 'contrato' | 'capability';
  mensaje: string;
}

/** La definición no cumple el contrato. Distinto de DataGapError y de CapabilityGapError. */
export class DefinicionCasoAfiError extends Error {
  constructor(readonly problemas: readonly ProblemaDefinicionCaso[]) {
    super(`Definición de caso AFI inválida:\n${problemas.map(p => `- ${p.ruta}: ${p.mensaje}`).join('\n')}`);
    this.name = 'DefinicionCasoAfiError';
  }
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const textoNoVacio = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const citar = (v: unknown) => JSON.stringify(String(v).slice(0, 60));
const esCampo = (v: unknown): v is CampoAfi => typeof v === 'string' && (CAMPOS_AFI as readonly string[]).includes(v);
const esEtapa = (v: unknown): v is EtapaAfi => typeof v === 'string' && (ETAPAS_AFI as readonly string[]).includes(v);

/** Estrategias que el resolver acepta desde el caso; mismo contrato estricto que EstrategiaAuxiliar. */
const ESTRATEGIAS: Record<string, { requeridas: Record<string, (v: unknown) => boolean>; opcionales?: Record<string, (v: unknown) => boolean> }> = {
  'first-valid-option': { requeridas: { orden: v => v === 'catalogo' || v === 'alfabetico' } },
  'first-valid-autocomplete': { requeridas: {}, opcionales: { inicioAlfabetico: v => v === true } },
  'deterministic-text': { requeridas: { valor: textoNoVacio, motivo: textoNoVacio } },
  'deterministic-number': { requeridas: { valor: v => textoNoVacio(v) && /^\d+$/.test(v), motivo: textoNoVacio } },
  'boolean-required': { requeridas: { valor: v => v === true, motivo: textoNoVacio } },
};

function claves(obj: Record<string, unknown>, permitidas: readonly string[], ruta: string, error: (r: string, m: string) => void): void {
  for (const k of Object.keys(obj)) if (!permitidas.includes(k)) error(`${ruta}${ruta ? '.' : ''}${k}`, 'propiedad no admitida por el contrato');
}

/**
 * (4S) Participantes y relaciones. Fail-closed y SIN inferencias: dos sujetos que comparten actor (mismo slot = misma
 * persona) exigen una relación mismo-sujeto declarada; mismo-sujeto exige el mismo actor; distinto-sujeto, actores distintos.
 * La existencia, el tipo de slot y la preparación de cada sujeto los verifica el preflight de datos de prueba.
 */
function validarSujetos(def: Record<string, unknown>, error: (r: string, m: string) => void): void {
  const roles = new Map<string, string>();
  if (def.participantes !== undefined) {
    if (!Array.isArray(def.participantes) || !def.participantes.length) error('participantes', 'si se declara, lista no vacía de { rol, actorRef }');
    else def.participantes.forEach((p: unknown, i) => {
      const r = `participantes[${i}]`;
      if (!esObjeto(p)) return error(r, 'debe ser { rol, actorRef }');
      claves(p, ['rol', 'actorRef'], r, error);
      if (!rolParticipanteValido(p.rol)) return error(`${r}.rol`, `rol semántico kebab-case, distinto de "${SUJETO_PRINCIPAL}"`);
      if (roles.has(p.rol)) return error(`${r}.rol`, `rol repetido ${citar(p.rol)}`);
      if (!idDatosValido(p.actorRef)) return error(`${r}.actorRef`, 'id semántico de sujeto (kebab-case); nunca un valor ni un nombre de variable');
      roles.set(p.rol, p.actorRef);
    });
  }
  const actorDe = (s: string) => (s === SUJETO_PRINCIPAL ? (typeof def.actorRef === 'string' ? def.actorRef : undefined) : roles.get(s));
  const declarados = new Map<string, string>();
  if (def.relaciones !== undefined) {
    if (!Array.isArray(def.relaciones) || !def.relaciones.length) error('relaciones', 'si se declara, lista no vacía de { tipo, sujetos }');
    else def.relaciones.forEach((x: unknown, i) => {
      const r = `relaciones[${i}]`;
      if (!esObjeto(x)) return error(r, 'debe ser { tipo, sujetos }');
      claves(x, ['tipo', 'sujetos'], r, error);
      if (!(TIPOS_RELACION_SUJETOS as readonly unknown[]).includes(x.tipo)) return error(`${r}.tipo`, `${TIPOS_RELACION_SUJETOS.join(' | ')}`);
      const s = x.sujetos;
      if (!Array.isArray(s) || s.length !== 2 || s[0] === s[1] || !s.every(v => v === SUJETO_PRINCIPAL || roles.has(v as string))) {
        return error(`${r}.sujetos`, `dos sujetos distintos: "${SUJETO_PRINCIPAL}" o roles declarados en participantes`);
      }
      const par = [...s].sort().join('|');
      if (declarados.has(par)) return error(r, `relación repetida o contradictoria entre ${s.join(' y ')}`);
      declarados.set(par, x.tipo as string);
      const [a, b] = (s as string[]).map(actorDe);
      if (x.tipo === 'mismo-sujeto' && (a === undefined || a !== b)) error(r, `mismo-sujeto exige que ${s.join(' y ')} usen el mismo actor`);
      if (x.tipo === 'distinto-sujeto' && a !== undefined && a === b) error(r, `distinto-sujeto exige actores distintos para ${s.join(' y ')}`);
    });
  }
  // Sin relación declarada no hay igualdad silenciosa: compartir actor (la misma persona) exige mismo-sujeto.
  const sujetos = [...(typeof def.actorRef === 'string' && roles.size ? [SUJETO_PRINCIPAL] : []), ...roles.keys()];
  sujetos.forEach((a, i) => sujetos.slice(i + 1).forEach(b => {
    if (actorDe(a) !== undefined && actorDe(a) === actorDe(b) && declarados.get([a, b].sort().join('|')) !== 'mismo-sujeto') {
      error('relaciones', `${a} y ${b} usan el mismo actor: declare la relación mismo-sujeto (o use actores distintos)`);
    }
  }));
}

/** Validación pura. Acumula todos los problemas (contrato + plan funcional). */
export function validarDefinicionCasoAfi(def: unknown): ProblemaDefinicionCaso[] {
  const problemas: ProblemaDefinicionCaso[] = [];
  const error = (ruta: string, mensaje: string) => problemas.push({ ruta, clase: 'contrato', mensaje });

  if (!esObjeto(def)) { error('definicion', 'debe ser un objeto JSON'); return problemas; }
  claves(def, ['version', 'hu', 'caso', 'nombre', 'fuente', 'perfil', 'actorRef', 'participantes', 'relaciones', 'preparacion', 'funcional', 'e2e'], '', error);
  if (def.version !== VERSION_CASO_AFI) { error('version', `versión no soportada ${citar(def.version)}; se espera ${VERSION_CASO_AFI}`); return problemas; }
  for (const k of ['hu', 'caso', 'nombre'] as const) if (!textoNoVacio(def[k])) error(k, 'requerido, texto no vacío');
  if (!(PERFILES_CASO_AFI as readonly unknown[]).includes(def.perfil)) error('perfil', `perfil no soportado ${citar(def.perfil)}`);
  // Id semántico de actor: nunca un nombre de variable, un secretRef ni un valor (eso lo deriva el framework).
  if (def.actorRef !== undefined && !idDatosValido(def.actorRef)) error('actorRef', 'id semántico de actor (kebab-case); nunca un valor ni un nombre de variable');

  validarSujetos(def, error);

  if (def.fuente !== undefined) {
    if (!esObjeto(def.fuente)) error('fuente', 'debe ser un objeto');
    else {
      claves(def.fuente, ['tipo', 'referencia'], 'fuente', error);
      if (def.fuente.tipo !== 'diseno-qa') error('fuente.tipo', 'solo se admite "diseno-qa"');
      if (def.fuente.referencia !== undefined && !textoNoVacio(def.fuente.referencia)) error('fuente.referencia', 'texto vacío');
    }
  }

  const p = def.preparacion;
  if (!esObjeto(p)) error('preparacion', 'requerida, debe ser un objeto');
  else {
    claves(p, ['datosCaso', 'camposAsercion', 'etapas'], 'preparacion', error);

    // Etapas: conocidas, sin duplicados, en el orden del catálogo.
    const etapas: EtapaAfi[] = [];
    if (!Array.isArray(p.etapas) || !p.etapas.length) error('preparacion.etapas', 'lista no vacía requerida');
    else p.etapas.forEach((e: unknown, i) => {
      const ruta = `preparacion.etapas[${i}]`;
      if (!esEtapa(e)) return error(ruta, `etapa desconocida ${citar(e)}`);
      if (etapas.includes(e)) return error(ruta, `etapa duplicada ${citar(e)}`);
      if (etapas.length && ETAPAS_AFI.indexOf(e) < ETAPAS_AFI.indexOf(etapas[etapas.length - 1])) {
        error(ruta, `orden inválido: ${citar(e)} va antes de ${citar(etapas[etapas.length - 1])}`);
      }
      etapas.push(e);
    });
    // Un campo de una etapa no declarada sería ignorado en silencio por el resolver.
    const enEtapa = (campo: CampoAfi, ruta: string) => {
      if (etapas.length && !etapas.includes(POLITICAS_AFI[campo].etapa)) error(ruta, `pertenece a la etapa ${citar(POLITICAS_AFI[campo].etapa)}, no declarada`);
    };

    if (!esObjeto(p.datosCaso)) error('preparacion.datosCaso', 'requerido, debe ser un objeto plano');
    else for (const [campo, valor] of Object.entries(p.datosCaso)) {
      const ruta = `preparacion.datosCaso.${campo}`;
      if (!esCampo(campo)) { error(ruta, 'campo desconocido en las políticas de Afiliaciones'); continue; }
      enEtapa(campo, ruta);
      if (typeof valor === 'string' || typeof valor === 'boolean') {
        if (typeof valor === 'string' && !valor.trim()) error(ruta, 'valor vacío');
        // PII nunca en la definición: los valores sensibles vienen del actor en ejecución.
        if (POLITICAS_AFI[campo].sensibilidad !== 'public') error(ruta, `campo ${POLITICAS_AFI[campo].sensibilidad}: el valor debe venir del actor, no de la definición`);
      } else if (esObjeto(valor) && Object.keys(valor).length === 1 && esObjeto(valor.estrategia)) {
        const est = valor.estrategia;
        if (typeof est.tipo !== 'string' || !Object.prototype.hasOwnProperty.call(ESTRATEGIAS, est.tipo)) { error(`${ruta}.estrategia.tipo`, `estrategia desconocida ${citar(est.tipo)}`); continue; }
        const contrato = ESTRATEGIAS[est.tipo];
        // Una estrategia determinística lleva un valor literal: prohibida en campos sensibles.
        if (/^deterministic-/.test(est.tipo) && POLITICAS_AFI[campo].sensibilidad !== 'public') {
          error(`${ruta}.estrategia.tipo`, `estrategia con valor literal no admitida en campo ${POLITICAS_AFI[campo].sensibilidad}`);
        }
        claves(est, ['tipo', ...Object.keys(contrato.requeridas), ...Object.keys(contrato.opcionales ?? {})], `${ruta}.estrategia`, error);
        for (const [k, ok] of Object.entries(contrato.requeridas)) if (!ok(est[k])) error(`${ruta}.estrategia.${k}`, 'valor inválido o ausente');
        for (const [k, ok] of Object.entries(contrato.opcionales ?? {})) if (est[k] !== undefined && !ok(est[k])) error(`${ruta}.estrategia.${k}`, 'valor inválido');
      } else error(ruta, 'debe ser texto, booleano o { estrategia }');
    }

    if (!Array.isArray(p.camposAsercion)) error('preparacion.camposAsercion', 'requerido, lista de campos');
    else {
      const vistos = new Set<string>();
      p.camposAsercion.forEach((c: unknown, i) => {
        const ruta = `preparacion.camposAsercion[${i}]`;
        if (!esCampo(c)) return error(ruta, `campo desconocido ${citar(c)}`);
        if (vistos.has(c)) return error(ruta, `campo duplicado ${citar(c)}`);
        vistos.add(c);
        enEtapa(c, ruta);
      });
    }
  }

  if (def.funcional === undefined) { if (def.e2e === undefined) error('funcional', 'requerido (opcional solo si el caso declara e2e)'); }
  else for (const f of validarPlanFuncionalAfi(def.funcional) as ProblemaPlanFuncional[]) {
    problemas.push({ ruta: `funcional.${f.ruta}`, clase: f.clase === 'capability' ? 'capability' : 'contrato', mensaje: f.mensaje });
  }
  if (def.e2e !== undefined) for (const p of validarE2E(def.e2e, def)) problemas.push({ ruta: p.ruta, clase: 'contrato', mensaje: p.mensaje });
  return problemas;
}

/**
 * Lanza DefinicionCasoAfiError si el contrato está mal formado (incluido un plan funcional mal formado);
 * si el contrato es correcto pero pide capabilities no soportadas, CapabilityGapError.
 */
export function exigirDefinicionCasoAfiValida(def: unknown): asserts def is DefinicionCasoAfi {
  const problemas = validarDefinicionCasoAfi(def);
  if (problemas.some(p => p.clase === 'contrato')) throw new DefinicionCasoAfiError(problemas);
  if (problemas.length && (def as { funcional?: unknown }).funcional !== undefined) exigirPlanFuncionalValido((def as { funcional: unknown }).funcional);
}

// ---------- Compilación pura ----------

export interface GapCompilado {
  etapa: EtapaAfi;
  campo: string;
  motivo: MotivoGap;
  fuentesEsperadas: readonly OrigenDato[];
}

export interface CasoAfiCompilado {
  metadata: Pick<DefinicionCasoAfi, 'version' | 'hu' | 'caso' | 'nombre' | 'fuente'>;
  perfil: PerfilActorAfi;
  /** Id lógico del actor (sin PII). */
  actorId: string;
  preparacion: {
    orden: EtapaAfi[];
    /** Contienen valores reales para el runner: NO serializar; usar diagnosticoCasoCompilado(). */
    etapas: Partial<Record<EtapaAfi, PlanPreparacion>>;
    gaps: GapCompilado[];
  };
  /** Validado: solo capabilities soportadas. El compilador no lo ejecuta. */
  funcional: PlanFuncionalAfi;
  /** El caso declara una sección e2e (su plan funcional puede estar vacío). */
  e2e: boolean;
  /** (4S) Sujetos secundarios declarados (solo rol + actor; nunca valores). Ninguna operación los consume aún. */
  participantes: ParticipanteCaso[];
  relaciones: RelacionSujetos[];
  /**
   * (4R.1) Condiciones observables resueltas a proveedor + superficie, y las que NO son observables (gaps).
   * Nunca contiene la localización del vínculo ni nada del actor.
   */
  observacion: ObservacionCompilada;
  /**
   * true solo con: contrato válido, actor del perfil, plan funcional con capabilities soportadas,
   * TODAS las resoluciones de preparación materializables por AfiDataUi, cero data gaps y cero gaps de observación.
   * (Los dos primeros problemas de capability lanzan; data gaps y gaps de observación dejan false.)
   */
  ejecutable: boolean;
}

export interface ObservacionCompilada {
  condiciones: CondicionResuelta[];
  gaps: GapCondicion[];
  /** true si alguna condición usa un proveedor NO productivo habilitado explícitamente: el resultado no certifica. */
  validacion: boolean;
}

export interface OpcionesCompilacion {
  /** Modelo, vínculos aprobados y proveedores habilitados. Por defecto los canónicos (solo productivos). */
  testabilidad?: TestabilidadCompilacion;
}

/**
 * Pura: sin process.env, Playwright ni archivos; el actor lo entrega el llamador.
 * Problemas estructurales LANZAN: DefinicionCasoAfiError (contrato), CapabilityGapError (funcional),
 * CapabilityGapPreparacionError (resolución que AfiDataUi no materializa).
 * Los data gaps de TODAS las etapas se ACUMULAN y dejan ejecutable=false.
 * El resultado queda congelado y marcado (esCompiladoAfi) para el runner.
 */
export function compilarCasoAfi(definicion: unknown, actor: ActorAfi, opciones: OpcionesCompilacion = {}): CasoAfiCompilado {
  exigirDefinicionCasoAfiValida(definicion);
  if (actor.perfil !== definicion.perfil) {
    throw new Error(`El actor "${actor.id}" es de perfil ${actor.perfil}; la definición requiere ${definicion.perfil}`);
  }
  // Copia: el compilado no comparte objetos con la entrada del agente.
  const def: DefinicionCasoAfi = JSON.parse(JSON.stringify(definicion));
  const contexto = { actor, datosCaso: def.preparacion.datosCaso, aserciones: def.preparacion.camposAsercion };
  const etapas: Partial<Record<EtapaAfi, PlanPreparacion>> = {};
  const gaps: GapCompilado[] = [];
  for (const etapa of def.preparacion.etapas) {
    const plan = resolverEtapa(etapa, contexto);
    etapas[etapa] = plan;
    for (const g of plan.gaps) gaps.push({ etapa, campo: g.campo, motivo: g.motivo, fuentesEsperadas: g.fuentesEsperadas });
  }
  // Capability de preparación: toda resolución debe ser materializable por AfiDataUi (misma fuente pura).
  // Es framework incompleto, no dato faltante: LANZA, no se esconde como ejecutable=false.
  const sinCapacidad = def.preparacion.etapas.flatMap(e => problemasCapacidadPreparacion(e, etapas[e]!));
  if (sinCapacidad.length) throw new CapabilityGapPreparacionError(sinCapacidad);
  const observacion = compilarObservacion(def, opciones.testabilidad ?? testabilidadCanonica());
  const { version, hu, caso, nombre, fuente } = def;
  const compilado: CasoAfiCompilado = {
    metadata: { version, hu, caso, nombre, ...(fuente ? { fuente } : {}) },
    perfil: def.perfil,
    actorId: actor.id,
    preparacion: { orden: [...def.preparacion.etapas], etapas, gaps },
    // E2E sin plan funcional: el recorrido se detiene en el punto funcional (lo que sigue lo declara e2e).
    funcional: def.funcional ?? { caso: def.caso, pasos: [] },
    e2e: def.e2e !== undefined,
    participantes: (def.participantes ?? []).map(p => ({ ...p })),
    relaciones: (def.relaciones ?? []).map(r => ({ tipo: r.tipo, sujetos: [r.sujetos[0], r.sujetos[1]] as [string, string] })),
    observacion,
    ejecutable: gaps.length === 0 && observacion.gaps.length === 0,
  };
  congelar(compilado);
  COMPILADOS.add(compilado);
  return compilado;
}

/** (4R.1) Resuelve cada condición; una entidad de otra clase es un error de CONTRATO (lanza), el resto se acumula. */
function compilarObservacion(def: DefinicionCasoAfi, t: TestabilidadCompilacion): ObservacionCompilada {
  const condiciones: CondicionResuelta[] = [], gaps: GapCondicion[] = [], invalidas: ProblemaDefinicionCaso[] = [];
  (def.funcional?.pasos ?? []).forEach((paso, i) => (paso.condiciones ?? []).forEach((c, j) => {
    const r = resolverCondicion(paso.id, j, c, t);
    if (r.estado === 'INVALIDA') invalidas.push({ ruta: `funcional.pasos[${i}].condiciones[${j}].entidad`, clase: 'contrato', mensaje: r.motivo });
    else if (r.estado === 'REPRESENTABLE') condiciones.push(r);
    else gaps.push(r);
  }));
  if (invalidas.length) throw new DefinicionCasoAfiError(invalidas);
  return { condiciones, gaps, validacion: condiciones.some(c => c.validacion) };
}

/** Solo objetos producidos por compilarCasoAfi; congelados, así que no se pueden adulterar después. */
const COMPILADOS = new WeakSet<object>();
export function esCompiladoAfi(c: unknown): c is CasoAfiCompilado {
  return typeof c === 'object' && c !== null && COMPILADOS.has(c);
}

function congelar(v: unknown): void {
  if (typeof v !== 'object' || v === null || Object.isFrozen(v)) return;
  Object.freeze(v);
  for (const hijo of Object.values(v)) congelar(hijo);
}

export interface DiagnosticoCasoCompilado {
  metadata: CasoAfiCompilado['metadata'];
  perfil: PerfilActorAfi;
  actorId: string;
  ejecutable: boolean;
  preparacion: {
    etapa: EtapaAfi; resoluciones: DiagnosticoResolucion[]; gaps: { campo: string; motivo: MotivoGap }[];
    /** (4S-R.1) Solo si existen: campos según estado sin dato (DataGap únicamente si la pantalla lo exige). */
    condicionales?: { campo: string; motivo: MotivoGap }[];
  }[];
  gaps: GapCompilado[];
  funcional: PlanFuncionalAfi;
  observacion: ObservacionCompilada;
}

/** Única forma segura de reportar un compilado: PII redactada por ResolucionCampo.diagnostico(). */
export function diagnosticoCasoCompilado(c: CasoAfiCompilado): DiagnosticoCasoCompilado {
  return {
    metadata: c.metadata, perfil: c.perfil, actorId: c.actorId, ejecutable: c.ejecutable,
    preparacion: c.preparacion.orden.map(etapa => ({
      etapa,
      resoluciones: c.preparacion.etapas[etapa]!.resoluciones.map(r => r.diagnostico()),
      gaps: c.preparacion.etapas[etapa]!.gaps.map(g => ({ campo: g.campo, motivo: g.motivo })),
      ...(c.preparacion.etapas[etapa]!.condicionales?.length
        ? { condicionales: c.preparacion.etapas[etapa]!.condicionales!.map(g => ({ campo: g.campo, motivo: g.motivo })) } : {}),
    })),
    gaps: c.preparacion.gaps,
    funcional: c.funcional,
    observacion: c.observacion,
  };
}

// Re-exportados para que el llamador distinga los tipos de problema desde un solo módulo.
export { CapabilityGapError, CapabilityGapPreparacionError };
