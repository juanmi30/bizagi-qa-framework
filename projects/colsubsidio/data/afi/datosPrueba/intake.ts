import { createHash } from 'node:crypto';
import { enmascarar, piiEnMetadato } from '../aplicacion/sensibilidad';
import type { CampoAfi, PerfilActorAfi } from '../modelo';
import {
  DatosPruebaError, ESTADOS_SLOT, ID_REQUISITO, claveIdentidadActor, clavesDeValor, fuentePorDefecto, idDatosValido, idSlotSugerido, relacionActores, validarCamposSlot,
  validarCompartido, validarCondiciones, validarRequisito,
  type ActorSlot, type CampoDato, type CampoSlot, type CompartidoDeclarado, type CondicionActor, type EstadoSlot, type OcurrenciaDatos, type ProblemaDatos,
  type TestDataRequirement,
} from './contrato';
import { diagnosticarRequisito, validarRegistroDatosPrueba, type EntradaHistorialDatos, type RegistroDatosPrueba } from './registro';

/**
 * INTAKE DE DATOS DE PRUEBA DEL AGENTE (Fase 4P). Mismo patrón que el intake de conocimiento (4N/4O), sin duplicar su
 * arquitectura: el agente nunca escribe slots.
 *
 *   testDataRequirements (NO confiable) --recibir--> lote: reutilizaciones exactas + propuestas de ActorSlot PENDING_REVIEW
 *                                                    + posibles duplicados (decisión humana) + rechazos saneados
 *   lote + decisiones HUMANAS --aplicar--> nueva revisión del Test Data Registry (o error, sin aplicar nada)
 *
 * La revisión humana puede: aprobar, rechazar o pedir cambios; corregir id, condiciones y campos (incluidas las políticas
 * de fallback/compartido); marcar dos requisitos como el MISMO actor (mismoActorQue); confirmar que son actores DISTINTOS
 * (actoresDistintosDe); declarar secretos compartidos; fijar el estado de provisión.
 */

export const ESQUEMA_PROPUESTA_SLOT = 'afi-actor-slot-proposal/v1';
export const ESQUEMA_LOTE_DATOS = 'afi-test-data-review/v1';
export const ESQUEMA_DECISIONES_DATOS = 'afi-test-data-decisions/v1';
export const CLAVE_SALIDA_DATOS = 'testDataRequirements';
/** Claves de la otra dimensión (conocimiento) toleradas en la misma salida: se ignoran aquí. */
const CLAVES_TOLERADAS = ['knowledgeProposals', 'classificationRequests'];

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const canonico = (v: unknown): string => JSON.stringify(v, (_k, x) => (esObjeto(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x));
const REVISOR = /^[a-z][a-z0-9-]{1,39}$/;

export interface PropuestaSlot {
  schemaVersion: typeof ESQUEMA_PROPUESTA_SLOT;
  proposalId: string;
  /** 4S: `sujeto: 'participante'` si el requisito declara un rol; perfil solo si aplica. */
  slot: Pick<ActorSlot, 'id' | 'perfil' | 'sujeto' | 'condiciones' | 'campos'>;
  requisitos: string[];
  ocurrencias: OcurrenciaDatos[];
  reutilizable: boolean;
  /** (§7) Requisitos que deben resolverse con un sujeto DISTINTO (relación distinto-sujeto del caso). */
  distintoDe?: string[];
  estado: 'PENDING_REVIEW';
}
export interface PosibleDuplicadoDatos { a: string; b: string; motivo: 'condiciones-relacionadas' | 'reutilizacion-no-permitida' | 'campos-no-cubiertos' }

export interface LoteDatosPrueba {
  schemaVersion: typeof ESQUEMA_LOTE_DATOS;
  batchId: string;
  revisionBase: number;
  hashRegistroBase: string;
  nota: string[];
  propuestas: { proposalId: string; hash: string; propuesta: PropuestaSlot }[];
  /** Identidad canónica EXACTA con un actor aprobado: se reutiliza sin crear slot (se registra al aplicar). */
  reutilizados: { requisito: string; slot: string; ocurrencias: OcurrenciaDatos[] }[];
  /** a: proposalId; b: proposalId del lote o id de un actor existente. Requieren decisión humana. */
  posiblesDuplicados: PosibleDuplicadoDatos[];
  rechazados: { indice: number; referencia?: string; problemas: ProblemaDatos[] }[];
  resumen: { requisitosRecibidos: number; validos: number; rechazados: number; reutilizados: number; propuestas: number; posiblesDuplicados: number; revisionBase: number; runtimeChanges: 0 };
}

export const hashRegistro = (r: RegistroDatosPrueba) => sha256(canonico(r));
export const hashPropuestaSlot = (p: PropuestaSlot) => sha256(canonico({ slot: p.slot, requisitos: p.requisitos, reutilizable: p.reutilizable,
  ...(p.distintoDe ? { distintoDe: p.distintoDe } : {}) }));

const firmaDe = (x: { perfil?: PerfilActorAfi; sujeto?: 'participante'; rol?: string; condiciones: readonly CondicionActor[]; campos: readonly (CampoSlot | CampoDato)[] }) =>
  ({ perfil: x.perfil, sujeto: x.sujeto, rol: x.rol, condiciones: x.condiciones, campos: x.campos.map(c => (typeof c === 'string' ? c : c.campo)) });
/** Firma de un REQUISITO: con rol es un participante (4S). */
const firmaRequisito = (r: TestDataRequirement) =>
  firmaDe({ perfil: r.perfil, ...(r.rol ? { sujeto: 'participante' as const, rol: r.rol } : {}), condiciones: r.condiciones, campos: [...r.camposRequeridos, ...(r.camposCondicionales ?? []).map(c => c.campo)] });

/** Ocurrencias de un requisito; las de un participante llevan su rol (trazabilidad para el analista, nunca identidad). */
const ocurrenciasDe = (r: TestDataRequirement): OcurrenciaDatos[] => r.ocurrencias.map(o => ({ ...o, ...(r.rol ? { rol: r.rol } : {}) }));

/** Última barrera antes de devolver un artefacto durable: sin PII (los hashes no cuentan). */
function verificarSinPii(v: unknown, codigo: 'LOTE_INVALIDO' | 'DECISIONES_INVALIDAS') {
  const t = JSON.stringify(v, (k, x) => (['hash', 'hashRegistroBase', 'batchId'].includes(k) ? undefined : x));
  if (piiEnMetadato(t)) throw new DatosPruebaError(codigo, [{ motivo: 'PII', detalle: 'posible PII en el artefacto: no se produce' }]);
}

/** RECIBIR (puro, determinista): valida, reutiliza lo idéntico y agrupa lo nuevo en propuestas PENDING_REVIEW. */
export function recibirRequisitosDelAgente(salida: unknown, registro: RegistroDatosPrueba): LoteDatosPrueba {
  if (!esObjeto(salida) || !Array.isArray(salida[CLAVE_SALIDA_DATOS])) {
    throw new DatosPruebaError('LOTE_INVALIDO', [{ motivo: 'ESQUEMA', detalle: `se espera { "${CLAVE_SALIDA_DATOS}": [...] }` }]);
  }
  const ajenas = Object.keys(salida).filter(k => k !== CLAVE_SALIDA_DATOS && !CLAVES_TOLERADAS.includes(k));
  if (ajenas.length) throw new DatosPruebaError('LOTE_INVALIDO', ajenas.map(k => ({ motivo: 'ESQUEMA' as const, detalle: `clave no admitida ${enmascarar(k).slice(0, 30)}` })));
  const entrada = salida[CLAVE_SALIDA_DATOS] as unknown[];
  const rechazados: LoteDatosPrueba['rechazados'] = [];
  const validos: TestDataRequirement[] = [];
  const ids = new Set<string>();
  entrada.forEach((x, indice) => {
    const problemas = validarRequisito(x);
    const id = esObjeto(x) && typeof x.id === 'string' && ID_REQUISITO.test(x.id) && !piiEnMetadato(x.id) ? x.id : undefined;
    if (!problemas.length && ids.has(id!)) problemas.push({ motivo: 'DUPLICADO', detalle: 'id de requisito repetido en la salida' });
    if (problemas.length) {
      rechazados.push({ indice, ...(id ? { referencia: id } : {}), problemas: problemas.map(p => ({ motivo: p.motivo, detalle: enmascarar(p.detalle) })) });
      return;
    }
    ids.add(id!);
    validos.push(x as unknown as TestDataRequirement);
  });

  const reutilizados: LoteDatosPrueba['reutilizados'] = [];
  const nuevos: TestDataRequirement[] = [];
  const contraExistentes: { req: string; slot: string; motivo: PosibleDuplicadoDatos['motivo'] }[] = [];
  for (const r of validos) {
    const d = diagnosticarRequisito(r, registro, {});
    // 4S: un participante solo se reutiliza por una decisión humana previa (requisito ya mapeado a un slot), nunca por identidad.
    if (d.status !== 'NEEDS_REVIEW' && d.actorRef) { reutilizados.push({ requisito: r.id, slot: d.actorRef, ocurrencias: ocurrenciasDe(r) }); continue; }
    nuevos.push(r);
    const firma = firmaRequisito(r);
    for (const s of registro.slots) {
      const rel = relacionActores(firma, firmaDe(s));
      if (rel === 'POSIBLE_DUPLICADO') contraExistentes.push({ req: r.id, slot: s.id, motivo: 'condiciones-relacionadas' });
      else if (rel === 'IGUAL') contraExistentes.push({ req: r.id, slot: s.id, motivo: d.motivos[0]?.motivo === 'campos-no-cubiertos' ? 'campos-no-cubiertos' : 'reutilizacion-no-permitida' });
    }
  }

  // Agrupar lo nuevo por identidad canónica EXACTA; un requisito no reutilizable siempre va solo.
  const grupos = new Map<string, TestDataRequirement[]>();
  const vetados: [string, string][] = [];
  for (const r of nuevos) {
    // 4S: cada participante va SOLO (mismo rol + mismas condiciones no implica el mismo sujeto): lo decide un humano.
    const k = r.rol ? `${claveIdentidadActor(firmaRequisito(r))}#${r.id}` : claveIdentidadActor(firmaRequisito(r));
    const mismo = grupos.get(k);
    if (mismo && (!r.reutilizable || mismo.some(x => !x.reutilizable))) {
      const k2 = `${k}#${r.id}`;
      grupos.set(k2, [r]);
      vetados.push([mismo[0].id, r.id]);
    } else grupos.set(k, [...(mismo ?? []), r]);
  }
  const usados = new Set(registro.slots.map(s => s.id));
  const porRequisito = new Map<string, string>();
  const propuestas: LoteDatosPrueba['propuestas'] = [...grupos.values()].map(g => {
    const r0 = g[0];
    const sugeridos = new Set(g.map(r => r.actorSugerido).filter(Boolean));
    let id = sugeridos.size === 1 ? [...sugeridos][0]! : idSlotSugerido(firmaRequisito(r0));
    for (let n = 2; usados.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
    usados.add(id);
    // Fuente derivada de la resolución canónica: un campo pedible es secreto PROPIO del actor. SHARED/BASE solo por
    // decisión humana; cualquier otra combinación lanza (fail-closed).
    const participante = r0.rol !== undefined;
    const campos: CampoSlot[] = [...new Set(g.flatMap(r => r.camposRequeridos))].map(campo => ({ campo, fuente: fuentePorDefecto(campo, participante) }));
    // (§7) Condicionales: secreto propio del slot que solo se exige cuando su condición aplica.
    for (const r of g) for (const c of r.camposCondicionales ?? []) {
      if (!campos.some(x => x.campo === c.campo)) campos.push({ campo: c.campo, fuente: fuentePorDefecto(c.campo, participante), cuando: JSON.parse(JSON.stringify(c.cuando)) });
    }
    const distintoDe = [...new Set(g.flatMap(r => r.distintoDe ?? []))];
    const propuesta: PropuestaSlot = {
      schemaVersion: ESQUEMA_PROPUESTA_SLOT, proposalId: `ps-${id}`,
      slot: {
        id, ...(r0.perfil ? { perfil: r0.perfil } : {}), ...(r0.rol ? { sujeto: 'participante' as const } : {}),
        condiciones: r0.condiciones.map(c => ({ ...c })), campos,
      },
      requisitos: g.map(r => r.id), ocurrencias: g.flatMap(ocurrenciasDe), reutilizable: g.every(r => r.reutilizable),
      ...(distintoDe.length ? { distintoDe } : {}),
      estado: 'PENDING_REVIEW',
    };
    for (const r of g) porRequisito.set(r.id, propuesta.proposalId);
    return { proposalId: propuesta.proposalId, hash: hashPropuestaSlot(propuesta), propuesta };
  });

  const posibles: PosibleDuplicadoDatos[] = [];
  const agregar = (x: PosibleDuplicadoDatos) => { if (!posibles.some(y => y.a === x.a && y.b === x.b)) posibles.push(x); };
  for (const c of contraExistentes) agregar({ a: porRequisito.get(c.req)!, b: c.slot, motivo: c.motivo });
  for (const [a, b] of vetados) agregar({ a: porRequisito.get(a)!, b: porRequisito.get(b)!, motivo: 'reutilizacion-no-permitida' });
  propuestas.forEach((x, i) => propuestas.slice(i + 1).forEach(y => {
    if (relacionActores(firmaDe(x.propuesta.slot), firmaDe(y.propuesta.slot)) === 'POSIBLE_DUPLICADO') agregar({ a: x.proposalId, b: y.proposalId, motivo: 'condiciones-relacionadas' });
  }));

  const hashRegistroBase = hashRegistro(registro);
  const lote: LoteDatosPrueba = {
    schemaVersion: ESQUEMA_LOTE_DATOS,
    batchId: `kd-${sha256(`${sha256(canonico(salida[CLAVE_SALIDA_DATOS]))}:${hashRegistroBase}`).slice(0, 16)}`,
    revisionBase: registro.revision, hashRegistroBase,
    nota: [
      'Artefacto generado a partir de una salida de agente NO confiable. No contiene decisiones ni valores.',
      'Los nombres de variables los deriva el framework al aprobar; las decisiones van en el archivo de decisiones separado.',
    ],
    propuestas, reutilizados, posiblesDuplicados: posibles, rechazados,
    resumen: {
      requisitosRecibidos: entrada.length, validos: validos.length, rechazados: rechazados.length, reutilizados: reutilizados.length,
      propuestas: propuestas.length, posiblesDuplicados: posibles.length, revisionBase: registro.revision, runtimeChanges: 0,
    },
  };
  verificarSinPii(lote, 'LOTE_INVALIDO');
  return lote;
}

// ---------- 16. Decisiones humanas ----------

export const DECISIONES_SLOT = ['APPROVED', 'REJECTED', 'NEEDS_CHANGES'] as const;
export interface DecisionSlot {
  proposalId: string;
  hash: string;
  decision: typeof DECISIONES_SLOT[number] | null;
  revisor?: string;
  comentario?: string;
  /** Al aprobar: corrige id, condiciones o campos (políticas slot/shared/base/fallbackBase). */
  correcciones?: { id?: string; condiciones?: CondicionActor[]; campos?: CampoSlot[] };
  /** Al aprobar: estos requisitos usan el MISMO actor (id de un actor existente o proposalId aprobado del lote). */
  mismoActorQue?: string;
  /** Confirma que NO son el mismo actor (resuelve un posible duplicado). */
  actoresDistintosDe?: string[];
  /** Provisión declarada (por defecto pendiente-provisionar). */
  estado?: EstadoSlot;
}
export interface ArchivoDecisionesDatos {
  schemaVersion: typeof ESQUEMA_DECISIONES_DATOS;
  batchId: string;
  revisionBase: number;
  decisiones: DecisionSlot[];
  /** Secretos compartidos a declarar (p. ej. un buzón QA). */
  compartidos?: CompartidoDeclarado[];
}

/** Plantilla SIN decisiones: nunca decide por el humano. */
export function plantillaDecisionesDatos(l: LoteDatosPrueba): ArchivoDecisionesDatos {
  return {
    schemaVersion: ESQUEMA_DECISIONES_DATOS, batchId: l.batchId, revisionBase: l.revisionBase,
    decisiones: l.propuestas.map(p => ({ proposalId: p.proposalId, hash: p.hash, decision: null, revisor: '', comentario: '' })), compartidos: [],
  };
}

export interface ResultadoAplicacionDatos {
  estado: 'APLICABLE' | 'SIN_CAMBIOS' | 'YA_APLICADO';
  batchId: string;
  registro: RegistroDatosPrueba;
  altas: string[];
  reutilizaciones: { requisito: string; slot: string }[];
  rechazadas: string[];
  cambiosSolicitados: string[];
  sinDecision: string[];
  revisionAntes: number;
  revisionDespues: number;
}

const CLAVES_DECISION = ['proposalId', 'hash', 'decision', 'revisor', 'comentario', 'correcciones', 'mismoActorQue', 'actoresDistintosDe', 'estado'];

/**
 * APLICAR (puro): integridad del lote, revisión base, hashes y decisiones; los posibles duplicados de lo aprobado deben
 * estar resueltos; el registro final completo se valida antes de devolverlo. Todo o nada.
 */
export function aplicarDecisionesDatos(loteCrudo: unknown, decisionesCrudas: unknown, registro: RegistroDatosPrueba, fecha: string): ResultadoAplicacionDatos {
  const mal = (codigo: 'LOTE_INVALIDO' | 'DECISIONES_INVALIDAS' | 'REVISION_CONFLICTO' | 'HASH_DISTINTO' | 'POSIBLE_DUPLICADO_SIN_RESOLVER', detalles: string[]): never => {
    throw new DatosPruebaError(codigo, detalles.map(d => ({ motivo: 'ESQUEMA' as const, detalle: enmascarar(d) })));
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) mal('DECISIONES_INVALIDAS', ['fecha AAAA-MM-DD requerida']);
  if (!esObjeto(loteCrudo) || loteCrudo.schemaVersion !== ESQUEMA_LOTE_DATOS || !Array.isArray(loteCrudo.propuestas) || !Array.isArray(loteCrudo.reutilizados) || !Array.isArray(loteCrudo.posiblesDuplicados)) {
    mal('LOTE_INVALIDO', ['artefacto de revisión de datos desconocido']);
  }
  const lote = loteCrudo as unknown as LoteDatosPrueba;
  // Idempotencia (4Q): el historial registra el lote que produjo cada cambio; reaplicar no duplica ni sobrescribe.
  if (typeof lote.batchId === 'string' && registro.historial.some(h => h.lote === lote.batchId)) {
    return {
      estado: 'YA_APLICADO', batchId: lote.batchId, registro, altas: [], reutilizaciones: [], rechazadas: [], cambiosSolicitados: [], sinDecision: [],
      revisionAntes: registro.revision, revisionDespues: registro.revision,
    };
  }
  if (lote.revisionBase !== registro.revision || lote.hashRegistroBase !== hashRegistro(registro)) {
    mal('REVISION_CONFLICTO', [`el lote se preparó sobre la revisión ${String(lote.revisionBase)} y el registro está en la ${registro.revision}: vuelve a recibir los requisitos`]);
  }
  const alterados = lote.propuestas.filter(p => !esObjeto(p) || p.hash !== hashPropuestaSlot(p.propuesta) || p.proposalId !== p.propuesta?.proposalId).map(p => `${String(p?.proposalId)}: contenido distinto de su hash`);
  if (alterados.length) mal('HASH_DISTINTO', alterados);

  const d = decisionesCrudas as ArchivoDecisionesDatos;
  if (!esObjeto(d) || d.schemaVersion !== ESQUEMA_DECISIONES_DATOS || !Array.isArray(d.decisiones)) mal('DECISIONES_INVALIDAS', ['schemaVersion de decisiones desconocido']);
  if (d.batchId !== lote.batchId || d.revisionBase !== lote.revisionBase) mal('REVISION_CONFLICTO', ['las decisiones son de otro lote o de otra revisión']);
  const p: string[] = [];
  for (const k of Object.keys(d)) if (!['schemaVersion', 'batchId', 'revisionBase', 'decisiones', 'compartidos'].includes(k)) p.push(`clave no admitida ${k.slice(0, 30)}`);
  // Las decisiones nunca llevan valores ni nombres de variables (4Q).
  for (const k of clavesDeValor(d)) p.push(`${k.slice(0, 40)}: las decisiones nunca llevan valores`);
  if (/\bAFI_[A-Z0-9_]{2,}|process\.env/.test(JSON.stringify(d))) p.push('las decisiones no llevan nombres de variables: los deriva el framework');
  const porId = new Map(lote.propuestas.map(x => [x.proposalId, x]));
  const decisiones = new Map<string, DecisionSlot>();
  for (const x of d.decisiones) {
    if (!esObjeto(x)) { p.push('decisión mal formada'); continue; }
    const id = String(x.proposalId).slice(0, 80);
    for (const k of Object.keys(x)) if (!CLAVES_DECISION.includes(k)) p.push(`${id}: clave no admitida ${k.slice(0, 30)}`);
    if (decisiones.has(id)) p.push(`${id}: decisión repetida`);
    const ref = porId.get(id);
    if (!ref) { p.push(`${id}: no es una propuesta de este lote`); continue; }
    decisiones.set(id, x);
    if (x.decision === null) continue;
    if (!(DECISIONES_SLOT as readonly unknown[]).includes(x.decision)) p.push(`${id}: decisión APPROVED, REJECTED o NEEDS_CHANGES`);
    if (x.hash !== ref.hash) p.push(`${id}: la decisión cita otro contenido (hash)`);
    if (typeof x.revisor !== 'string' || !REVISOR.test(x.revisor)) p.push(`${id}: revisor requerido (rol o alias en minúsculas)`);
    if (x.comentario !== undefined && (typeof x.comentario !== 'string' || piiEnMetadato(x.comentario))) p.push(`${id}: comentario no permitido`);
    if (x.decision !== 'APPROVED' && (x.correcciones || x.mismoActorQue || x.estado)) p.push(`${id}: correcciones, mismoActorQue y estado solo al aprobar`);
    if (x.mismoActorQue !== undefined && (x.correcciones || x.estado)) p.push(`${id}: mismoActorQue no admite correcciones ni estado (el actor ya existe)`);
    if (x.estado !== undefined && !(ESTADOS_SLOT as readonly unknown[]).includes(x.estado)) p.push(`${id}: estado ${ESTADOS_SLOT.join(' | ')}`);
    if (x.actoresDistintosDe !== undefined && (!Array.isArray(x.actoresDistintosDe) || !x.actoresDistintosDe.every(v => typeof v === 'string'))) p.push(`${id}: actoresDistintosDe: lista de ids`);
    if (x.correcciones !== undefined) {
      const c = x.correcciones;
      if (!esObjeto(c) || Object.keys(c).some(k => !['id', 'condiciones', 'campos'].includes(k))) p.push(`${id}: correcciones { id?, condiciones?, campos? }`);
      else {
        if (c.id !== undefined && !idDatosValido(c.id)) p.push(`${id}: correcciones.id kebab-case`);
        if (c.condiciones !== undefined) p.push(...validarCondiciones(c.condiciones, `${id}.correcciones.condiciones`).map(q => q.detalle));
        if (c.campos !== undefined) {
          p.push(...validarCamposSlot(ref.propuesta.slot.perfil, c.campos, `${id}.correcciones.campos`, ref.propuesta.slot.sujeto === 'participante').map(q => q.detalle));
        }
      }
    }
  }
  const compartidosNuevos = d.compartidos ?? [];
  if (!Array.isArray(compartidosNuevos)) p.push('compartidos: lista');
  else compartidosNuevos.forEach((c, i) => p.push(...validarCompartido(c, `compartidos[${i}]`).map(q => q.detalle)));
  if (p.length) mal('DECISIONES_INVALIDAS', p);

  const aprobadas = lote.propuestas.filter(x => decisiones.get(x.proposalId)?.decision === 'APPROVED');
  const aprobada = (id: string) => aprobadas.some(x => x.proposalId === id);
  // mismoActorQue: actor existente o propuesta aprobada del lote que crea su propio actor.
  const destinoDe = new Map<string, string>();
  for (const x of aprobadas) {
    const dec = decisiones.get(x.proposalId)!;
    if (dec.mismoActorQue === undefined) continue;
    const t = dec.mismoActorQue;
    if (registro.slots.some(s => s.id === t)) destinoDe.set(x.proposalId, t);
    else if (aprobada(t) && decisiones.get(t)!.mismoActorQue === undefined && t !== x.proposalId) destinoDe.set(x.proposalId, t);
    else p.push(`${x.proposalId}: mismoActorQue debe ser un actor existente o una propuesta APROBADA del lote que crea su actor`);
  }
  if (p.length) mal('DECISIONES_INVALIDAS', p);
  // Posibles duplicados con al menos un lado aprobado: deben estar resueltos (mismo actor o actores distintos).
  const distintos = (a: string, b: string) => !!decisiones.get(a)?.actoresDistintosDe?.includes(b) || !!decisiones.get(b)?.actoresDistintosDe?.includes(a);
  const sinResolver = lote.posiblesDuplicados.filter(({ a, b }) => {
    const ladoB = porId.has(b) ? aprobada(b) : true; // un actor existente siempre "está"
    if (!aprobada(a) || !ladoB) return false;
    return destinoDe.get(a) !== b && destinoDe.get(b) !== a && !distintos(a, b);
  });
  if (sinResolver.length) mal('POSIBLE_DUPLICADO_SIN_RESOLVER', sinResolver.map(x => `${x.a} / ${x.b} (${x.motivo}): marque mismoActorQue o actoresDistintosDe`));

  // Construcción del registro nuevo.
  const slots: ActorSlot[] = registro.slots.map(s => JSON.parse(JSON.stringify(s)));
  const historial: EntradaHistorialDatos[] = [...registro.historial];
  const revision = registro.revision + 1;
  const reutilizaciones: ResultadoAplicacionDatos['reutilizaciones'] = [];
  /**
   * `condiciones` (4S-R.1): solo con mismoActorQue (decisión humana explícita). El requisito puede declarar una precondición de
   * negocio que el actor existente aún no tenía (p. ej. descubierta en QA real): se añade por id, nunca se reemplaza ni se borra.
   * Una condición NUEVA invalida la provisión: nadie ha confirmado que el actor la cumpla (tener sus secretos no lo prueba), así
   * que vuelve a pendiente-provisionar hasta `datos provisionado`. Solo campos nuevos conservan la provisión (el estado efectivo
   * ya será MISSING_SECRET mientras falten sus valores).
   */
  const unir = (s: ActorSlot, requisitos: readonly string[], ocurrencias: readonly OcurrenciaDatos[], campos: readonly CampoSlot[] = [], condiciones: readonly CondicionActor[] = []) => {
    s.origen.requisitos = [...new Set([...s.origen.requisitos, ...requisitos])];
    const nuevas = condiciones.filter(c => !s.condiciones.some(x => x.id === c.id));
    for (const c of nuevas) s.condiciones.push({ ...c });
    if (nuevas.length) s.estado = 'pendiente-provisionar';
    const vistas = new Set(s.origen.ocurrencias.map(o => canonico(o)));
    for (const o of ocurrencias) if (!vistas.has(canonico(o))) { s.origen.ocurrencias.push({ ...o }); vistas.add(canonico(o)); }
    for (const c of campos) if (!s.campos.some(x => x.campo === c.campo)) s.campos.push({ campo: c.campo, fuente: 'slot', ...(c.cuando ? { cuando: JSON.parse(JSON.stringify(c.cuando)) } : {}) });
  };
  for (const r of lote.reutilizados) {
    const s = slots.find(x => x.id === r.slot);
    if (!s) mal('LOTE_INVALIDO', [`reutilización hacia un actor inexistente ${r.slot}`]);
    unir(s!, [r.requisito], r.ocurrencias);
    reutilizaciones.push({ requisito: r.requisito, slot: r.slot });
    historial.push({ revision, fecha, slot: r.slot, accion: 'reutilizacion', propuesta: r.requisito, hash: sha256(canonico(r)), revisor: 'identidad-canonica', requisitos: [r.requisito], lote: lote.batchId });
  }
  const idFinal = new Map<string, string>();
  const altas: string[] = [];
  for (const x of aprobadas.filter(y => !destinoDe.has(y.proposalId))) {
    const dec = decisiones.get(x.proposalId)!;
    const c = dec.correcciones ?? {};
    const slot: ActorSlot = {
      id: c.id ?? x.propuesta.slot.id,
      ...(x.propuesta.slot.perfil ? { perfil: x.propuesta.slot.perfil } : {}),
      ...(x.propuesta.slot.sujeto ? { sujeto: x.propuesta.slot.sujeto } : {}),
      condiciones: (c.condiciones ?? x.propuesta.slot.condiciones).map(y => ({ ...y })),
      campos: (c.campos ?? x.propuesta.slot.campos).map(y => ({ ...y })),
      origen: { requisitos: [...x.propuesta.requisitos], ocurrencias: x.propuesta.ocurrencias.map(o => ({ ...o })) },
      estado: dec.estado ?? 'pendiente-provisionar',
    };
    const igual = slots.find(s => relacionActores(firmaDe(s), firmaDe(slot)) === 'IGUAL');
    if (igual) mal('DECISIONES_INVALIDAS', [`${x.proposalId}: tras las correcciones es idéntico a ${igual.id}: use mismoActorQue`]);
    slots.push(slot);
    idFinal.set(x.proposalId, slot.id);
    altas.push(slot.id);
    historial.push({ revision, fecha, slot: slot.id, accion: c.id || c.condiciones || c.campos ? 'correccion' : 'alta', propuesta: x.proposalId, hash: x.hash, revisor: dec.revisor!, requisitos: [...x.propuesta.requisitos], lote: lote.batchId });
  }
  for (const [pid, destino] of destinoDe) {
    const x = porId.get(pid)!;
    const id = idFinal.get(destino) ?? destino;
    const s = slots.find(y => y.id === id)!;
    // 4S: un participante nunca se convierte en el actor principal (ni al revés), ni siquiera por mismoActorQue.
    if ((s.sujeto === 'participante') !== (x.propuesta.slot.sujeto === 'participante')) {
      mal('DECISIONES_INVALIDAS', [`${pid}: mismoActorQue ${id} mezcla un participante con un actor principal (nunca se convierten entre sí)`]);
    }
    if (s.perfil !== x.propuesta.slot.perfil) mal('DECISIONES_INVALIDAS', [`${pid}: mismoActorQue ${id} es de otro perfil (nunca datos de otro perfil)`]);
    unir(s, x.propuesta.requisitos, x.propuesta.ocurrencias, x.propuesta.slot.campos, x.propuesta.slot.condiciones);
    reutilizaciones.push(...x.propuesta.requisitos.map(requisito => ({ requisito, slot: id })));
    historial.push({ revision, fecha, slot: id, accion: 'reutilizacion', propuesta: pid, hash: x.hash, revisor: decisiones.get(pid)!.revisor!, requisitos: [...x.propuesta.requisitos], lote: lote.batchId });
  }
  const compartidos = [...registro.compartidos.map(c => ({ ...c })), ...compartidosNuevos.map(c => ({ ...c }))];
  const cambios = historial.length > registro.historial.length || compartidosNuevos.length > 0;
  const final: RegistroDatosPrueba = cambios ? { ...registro, revision, slots, compartidos, historial } : registro;
  try {
    validarRegistroDatosPrueba(JSON.parse(JSON.stringify(final)));
  } catch (e) {
    if (e instanceof DatosPruebaError) throw new DatosPruebaError('DECISIONES_INVALIDAS', e.problemas.map(q => ({ ...q, detalle: enmascarar(q.detalle) })));
    throw e;
  }
  const con = (x: typeof DECISIONES_SLOT[number]) => lote.propuestas.filter(y => decisiones.get(y.proposalId)?.decision === x).map(y => y.proposalId);
  const resultado: ResultadoAplicacionDatos = {
    estado: cambios ? 'APLICABLE' : 'SIN_CAMBIOS', batchId: lote.batchId, registro: final, altas, reutilizaciones,
    rechazadas: con('REJECTED'), cambiosSolicitados: con('NEEDS_CHANGES'),
    sinDecision: lote.propuestas.filter(y => !decisiones.get(y.proposalId)?.decision).map(y => y.proposalId),
    revisionAntes: registro.revision, revisionDespues: final.revision,
  };
  verificarSinPii({ altas, reutilizaciones }, 'DECISIONES_INVALIDAS');
  return resultado;
}
