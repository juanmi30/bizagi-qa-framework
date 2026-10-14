import { createHash } from 'node:crypto';
import {
  ModeloAplicacionError, construirModeloAplicacion, extensionDesdeAlmacen, validarAlmacenModelo,
  type AlmacenModeloAplicacion, type ModeloAplicacion,
} from './modeloAplicacion';
import {
  CLAVES_SALIDA_INTAKE, ID_PROPUESTA, PropuestaError, aplicarPropuestasAprobadas, canonico, claveEntidad, claveNormalizada,
  contenidoProhibido, deduplicarPropuestas, hashPropuesta, recibirPropuestasDelAgente, referenciasDeEntidad, resolverClasificacion,
  revisarPropuesta,
  type EntidadPropuesta, type KnowledgeProposal, type PosibleDuplicado, type ProblemaPropuesta, type RechazoIntake,
  type RevisionPropuesta, type SalidaIntakeConocimiento, type SolicitudClasificacion,
} from './propuestas';
import { enmascarar, piiEnMetadato } from './sensibilidad';
import { TIPOS_ENTIDAD, type TipoEntidad } from './superficies';

/**
 * LOTE DE REVISIÓN DE CONOCIMIENTO (Fase 4O). Capa pura: la E/S vive en intakeDisco.ts.
 *
 *   salida del agente (NO confiable) --preparar--> artefacto de revisión (determinista; sin decisiones)
 *   artefacto + archivo de decisiones HUMANAS --aplicar--> nueva revisión del almacén (o conflicto, sin escribir nada)
 *
 * Garantías: el agente nunca escribe el modelo; cada decisión cita proposalId + hash del contenido + revisionBase;
 * una revisión vieja nunca se aplica en silencio; el lote es atómico; clasificar NO es aprobar.
 */

export const ESQUEMA_REVISION = 'afi-knowledge-review/v1';
export const ESQUEMA_DECISIONES = 'afi-knowledge-decisions/v1';
export const DECISIONES_HUMANAS = ['APPROVED', 'REJECTED', 'NEEDS_CHANGES'] as const;
export type DecisionHumana = typeof DECISIONES_HUMANAS[number];
/** Revisor: rol o alias abstracto (sin autenticación todavía); nunca un nombre ni una dirección electrónica. */
export const REVISOR_VALIDO = /^[a-z][a-z0-9-]{1,39}$/;

export type CodigoIntake =
  | 'ENTRADA_INVALIDA' | 'ARTEFACTO_INVALIDO' | 'DECISIONES_INVALIDAS' | 'LOTE_DISTINTO' | 'REVISION_CONFLICTO'
  | 'HASH_DISTINTO' | 'CLASIFICACION_INVALIDA' | 'CONFLICTO_APLICACION' | 'ALMACEN_INVALIDO';

export class IntakeError extends Error {
  constructor(readonly codigo: CodigoIntake, readonly problemas: readonly string[]) {
    super(`${codigo}:\n${problemas.map(p => `- ${p}`).join('\n')}`);
    this.name = 'IntakeError';
  }
}

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');
export const hashAlmacen = (a: AlmacenModeloAplicacion) => sha256(canonico(a));
export const hashSolicitud = (s: SolicitudClasificacion) => sha256(canonico({ id: s.id, descripcion: s.descripcion, alternativas: s.alternativas, fuente: s.origen.fuente, evidencia: s.evidenciaSemantica }));
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------- Artefacto de revisión ----------

export interface PropuestaEnRevision {
  proposalId: string;
  /** Identidad del contenido: la decisión humana debe citarlo. */
  hash: string;
  entidad: string;
  /** proposalIds del MISMO lote de los que depende (sus referencias). */
  dependeDe: string[];
  propuesta: KnowledgeProposal;
}
export interface SolicitudEnRevision { solicitudId: string; hash: string; alternativas: TipoEntidad[]; solicitud: SolicitudClasificacion }
export interface RechazoEnRevision { seccion: typeof CLAVES_SALIDA_INTAKE[number]; indice: number; referencia?: string; problemas: ProblemaPropuesta[] }

export interface ResumenRevision {
  knowledgeGapsRecibidos: number;
  propuestasRecibidas: number;
  validas: number;
  rechazadas: number;
  unicas: number;
  posiblesDuplicados: number;
  clasificacionesRecibidas: number;
  clasificacionesPendientes: number;
  entidadesPrevistas: number;
  revisionBase: number;
  runtimeChanges: 0;
}

export interface ArtefactoRevision {
  schemaVersion: typeof ESQUEMA_REVISION;
  batchId: string;
  /** Revisión del almacén contra la que se preparó: aplicar contra otra es conflicto. */
  revisionBase: number;
  hashAlmacenBase: string;
  hashEntrada: string;
  nota: string[];
  propuestas: PropuestaEnRevision[];
  rechazadas: RechazoEnRevision[];
  posiblesDuplicados: PosibleDuplicado[];
  solicitudesClasificacion: SolicitudEnRevision[];
  resumen: ResumenRevision;
}

const NOTA = [
  'Artefacto generado por la CLI a partir de una salida de agente NO confiable. No contiene decisiones.',
  'Las decisiones se toman en el archivo de decisiones separado (proposalId + hash + revisionBase). Aprobar una pantalla o campo UI la vuelve conocida, no operable.',
];

/** Referencia segura para citar un elemento rechazado (nunca copia su contenido). */
function referenciaSegura(v: unknown, clave: 'proposalId' | 'solicitudId'): string | undefined {
  const x = esObjeto(v) ? v[clave] : undefined;
  return typeof x === 'string' && ID_PROPUESTA.test(x) && !piiEnMetadato(x) ? x : undefined;
}
const sanear = (r: RechazoIntake, seccion: RechazoEnRevision['seccion'], v: unknown): RechazoEnRevision => ({
  seccion, indice: r.indice,
  ...(referenciaSegura(v, seccion === 'knowledgeProposals' ? 'proposalId' : 'solicitudId') ? { referencia: referenciaSegura(v, seccion === 'knowledgeProposals' ? 'proposalId' : 'solicitudId') } : {}),
  problemas: r.problemas.map(p => ({ motivo: p.motivo, detalle: enmascarar(p.detalle) })),
});

/** Valida la forma de la salida del agente: SOLO knowledgeProposals (requerida) y classificationRequests. */
export function validarSalidaIntake(salida: unknown): SalidaIntakeConocimiento {
  if (!esObjeto(salida)) throw new IntakeError('ENTRADA_INVALIDA', ['la salida de intake debe ser un objeto JSON']);
  const ajenas = Object.keys(salida).filter(k => !(CLAVES_SALIDA_INTAKE as readonly string[]).includes(k));
  const p: string[] = ajenas.map(k => `clave no admitida ${enmascarar(k).slice(0, 40)}`);
  if (!Array.isArray(salida.knowledgeProposals)) p.push('knowledgeProposals: lista requerida (puede estar vacía)');
  if (salida.classificationRequests !== undefined && !Array.isArray(salida.classificationRequests)) p.push('classificationRequests: lista');
  if (p.length) throw new IntakeError('ENTRADA_INVALIDA', p);
  return salida as unknown as SalidaIntakeConocimiento;
}

/**
 * PREPARAR: valida, deduplica y detecta posibles duplicados SIN tocar el almacén. Determinista: la misma salida contra
 * el mismo almacén produce exactamente el mismo artefacto (sin fechas ni rutas).
 */
export function prepararLoteRevision(salidaCruda: unknown, almacen: AlmacenModeloAplicacion): ArtefactoRevision {
  const salida = validarSalidaIntake(salidaCruda);
  const modelo = construirModeloAplicacion(extensionDesdeAlmacen(almacen));
  const recibido = recibirPropuestasDelAgente(salida, modelo);
  const entrada = salida.knowledgeProposals;
  const solicitudesEntrada = salida.classificationRequests ?? [];
  const rechazadas: RechazoEnRevision[] = recibido.rechazadas.map(r => sanear(r, 'knowledgeProposals', entrada[r.indice]));

  // proposalId único en el lote (fail-closed: el segundo se rechaza; el contenido no se copia).
  const vistos = new Set<string>();
  const aceptadas: KnowledgeProposal[] = [];
  for (const p of recibido.aceptadas) {
    if (vistos.has(p.proposalId)) {
      rechazadas.push({ seccion: 'knowledgeProposals', indice: entrada.indexOf(p), referencia: p.proposalId, problemas: [{ motivo: 'ESQUEMA', detalle: 'proposalId repetido en la salida' }] });
      continue;
    }
    vistos.add(p.proposalId);
    aceptadas.push(p);
  }
  const solicitudes: SolicitudClasificacion[] = [];
  const rechazoSolicitudes: RechazoEnRevision[] = recibido.solicitudesRechazadas.map(r => sanear(r, 'classificationRequests', solicitudesEntrada[r.indice]));
  for (const s of recibido.solicitudes) {
    if (vistos.has(s.solicitudId)) {
      rechazoSolicitudes.push({ seccion: 'classificationRequests', indice: solicitudesEntrada.indexOf(s), referencia: s.solicitudId, problemas: [{ motivo: 'ESQUEMA', detalle: 'solicitudId repetido o igual a un proposalId' }] });
      continue;
    }
    vistos.add(s.solicitudId);
    solicitudes.push(s);
  }
  rechazadas.push(...rechazoSolicitudes);
  rechazadas.sort((a, b) => a.seccion.localeCompare(b.seccion) || a.indice - b.indice);

  const dedup = deduplicarPropuestas(aceptadas);
  // Una solicitud cuyo nombre coincide con una propuesta del lote también es un posible duplicado (decisión humana).
  const posiblesDuplicados = [...dedup.posiblesDuplicados];
  for (const s of solicitudes) for (const u of dedup.unicas) {
    const claves = new Set([u.entidad.id, ...(u.alias ?? [])].map(claveNormalizada));
    if (claves.has(claveNormalizada(s.id))) posiblesDuplicados.push({ propuestas: [u.proposalId, s.solicitudId], motivo: 'tipo-distinto' });
  }
  const porClave = new Map<string, string[]>();
  for (const u of dedup.unicas) {
    const k = claveEntidad(u.entidad.tipo, u.entidad.id);
    porClave.set(k, [...(porClave.get(k) ?? []), u.proposalId]);
  }
  const propuestas: PropuestaEnRevision[] = dedup.unicas.map(p => ({
    proposalId: p.proposalId,
    hash: hashPropuesta(p),
    entidad: claveEntidad(p.entidad.tipo, p.entidad.id),
    dependeDe: [...new Set(referenciasDeEntidad(p.entidad).flatMap(r => porClave.get(claveEntidad(r.tipo, r.id)) ?? []))],
    propuesta: p,
  }));
  const solicitudesClasificacion = solicitudes.map(s => ({ solicitudId: s.solicitudId, hash: hashSolicitud(s), alternativas: [...s.alternativas], solicitud: s }));

  const hashEntrada = sha256(canonico(salida));
  const hashAlmacenBase = hashAlmacen(almacen);
  const gaps = new Set([...aceptadas.map(p => claveEntidad(p.entidad.tipo, p.entidad.id)), ...solicitudes.map(s => `?:${s.id}`)]);
  const artefacto: ArtefactoRevision = {
    schemaVersion: ESQUEMA_REVISION,
    batchId: `kr-${sha256(`${hashEntrada}:${hashAlmacenBase}`).slice(0, 16)}`,
    revisionBase: almacen.revision,
    hashAlmacenBase,
    hashEntrada,
    nota: [...NOTA],
    propuestas,
    rechazadas,
    posiblesDuplicados,
    solicitudesClasificacion,
    resumen: {
      knowledgeGapsRecibidos: gaps.size,
      propuestasRecibidas: entrada.length,
      validas: aceptadas.length,
      rechazadas: entrada.length - aceptadas.length,
      unicas: dedup.unicas.length,
      posiblesDuplicados: posiblesDuplicados.length,
      clasificacionesRecibidas: solicitudesEntrada.length,
      clasificacionesPendientes: solicitudes.length,
      entidadesPrevistas: new Set(dedup.unicas.map(p => claveEntidad(p.entidad.tipo, p.entidad.id))).size,
      revisionBase: almacen.revision,
      runtimeChanges: 0,
    },
  };
  verificarSinPii(artefacto, 'ARTEFACTO_INVALIDO');
  return artefacto;
}

/** Última barrera antes de escribir un artefacto: sin PII (los identificadores criptográficos no cuentan). */
function verificarSinPii(v: unknown, codigo: CodigoIntake) {
  const texto = JSON.stringify(v, (k, x) => (['hash', 'hashAlmacenBase', 'hashEntrada', 'batchId', 'lote'].includes(k) ? undefined : x));
  if (piiEnMetadato(texto)) throw new IntakeError(codigo, ['posible PII en el artefacto: no se escribe']);
}

/**
 * Integridad del artefacto al APLICAR (pudo editarse a mano): esquema, hashes recalculados y propuestas que siguen
 * siendo válidas y PENDING_REVIEW contra el modelo base.
 */
export function validarArtefactoRevision(a: unknown, modelo: ModeloAplicacion): ArtefactoRevision {
  const p: string[] = [];
  if (!esObjeto(a) || a.schemaVersion !== ESQUEMA_REVISION) throw new IntakeError('ARTEFACTO_INVALIDO', ['schemaVersion de artefacto de revisión desconocido']);
  if (typeof a.batchId !== 'string' || !/^kr-[0-9a-f]{16}$/.test(a.batchId)) p.push('batchId inválido');
  if (!Number.isInteger(a.revisionBase)) p.push('revisionBase requerido');
  if (!Array.isArray(a.propuestas) || !Array.isArray(a.solicitudesClasificacion) || !Array.isArray(a.posiblesDuplicados)) p.push('listas requeridas');
  if (p.length) throw new IntakeError('ARTEFACTO_INVALIDO', p);
  const art = a as unknown as ArtefactoRevision;
  for (const x of art.propuestas) {
    if (!esObjeto(x) || !esObjeto(x.propuesta) || x.proposalId !== x.propuesta.proposalId) { p.push('propuesta mal formada'); continue; }
    if (x.hash !== hashPropuesta(x.propuesta)) p.push(`${x.proposalId}: el contenido no coincide con su hash (artefacto editado)`);
  }
  for (const s of art.solicitudesClasificacion) if (!esObjeto(s) || !esObjeto(s.solicitud) || s.hash !== hashSolicitud(s.solicitud) || s.solicitudId !== s.solicitud.solicitudId) p.push(`${String(s?.solicitudId)}: solicitud alterada`);
  if (p.length) throw new IntakeError('HASH_DISTINTO', p);
  const re = recibirPropuestasDelAgente({ knowledgeProposals: art.propuestas.map(x => x.propuesta), classificationRequests: art.solicitudesClasificacion.map(s => s.solicitud) }, modelo);
  if (re.rechazadas.length || re.solicitudesRechazadas.length) {
    throw new IntakeError('ARTEFACTO_INVALIDO', [...re.rechazadas, ...re.solicitudesRechazadas].flatMap(r => r.problemas.map(x => `${x.motivo}: ${enmascarar(x.detalle)}`)));
  }
  return art;
}

// ---------- Decisiones humanas ----------

export interface DecisionPropuesta {
  proposalId: string;
  /** Hash del contenido revisado (copiado del artefacto). Si la propuesta cambió, la decisión no vale. */
  hash: string;
  /** null = sin decidir todavía (la propuesta sigue PENDING_REVIEW). */
  decision: DecisionHumana | null;
  revisor?: string;
  comentario?: string;
  /** Al aprobar las dos partes de un POSSIBLE_DUPLICATE, confirma explícitamente que no lo son. */
  noEsDuplicadoDe?: string[];
  /** Solo informativo (plantilla): debe coincidir con el artefacto si está. */
  entidad?: string;
}
export interface DecisionClasificacion {
  solicitudId: string;
  hash: string;
  /** UNO de las alternativas; null = sin clasificar. */
  tipo: TipoEntidad | null;
  /** Datos propios del tipo elegido (p. ej. superficies de una variable). Nunca tipo/id/descripcion. */
  datos?: Record<string, unknown>;
  revisor?: string;
  /** Solo informativo (plantilla). */
  alternativas?: TipoEntidad[];
}
export interface ArchivoDecisiones {
  schemaVersion: typeof ESQUEMA_DECISIONES;
  batchId: string;
  revisionBase: number;
  decisiones: DecisionPropuesta[];
  clasificaciones: DecisionClasificacion[];
}

/** Plantilla SIN decisiones (todas null): el humano la completa. Nunca contiene decisiones inventadas. */
export function plantillaDecisiones(a: ArtefactoRevision): ArchivoDecisiones {
  return {
    schemaVersion: ESQUEMA_DECISIONES, batchId: a.batchId, revisionBase: a.revisionBase,
    decisiones: a.propuestas.map(x => ({ proposalId: x.proposalId, entidad: x.entidad, hash: x.hash, decision: null, revisor: '', comentario: '' })),
    clasificaciones: a.solicitudesClasificacion.map(s => ({ solicitudId: s.solicitudId, alternativas: [...s.alternativas], hash: s.hash, tipo: null, datos: {}, revisor: '' })),
  };
}

const CLAVES_DECISION = ['proposalId', 'hash', 'decision', 'revisor', 'comentario', 'noEsDuplicadoDe', 'entidad'];
const CLAVES_CLASIFICACION = ['solicitudId', 'hash', 'tipo', 'datos', 'revisor', 'alternativas'];

function validarArchivoDecisiones(d: unknown, a: ArtefactoRevision): ArchivoDecisiones {
  if (!esObjeto(d) || d.schemaVersion !== ESQUEMA_DECISIONES) throw new IntakeError('DECISIONES_INVALIDAS', ['schemaVersion de decisiones desconocido']);
  if (d.batchId !== a.batchId) throw new IntakeError('LOTE_DISTINTO', [`las decisiones son del lote ${String(d.batchId).slice(0, 24)}, el artefacto es ${a.batchId}`]);
  if (d.revisionBase !== a.revisionBase) throw new IntakeError('REVISION_CONFLICTO', [`decisiones sobre revisionBase ${String(d.revisionBase)}, artefacto sobre ${a.revisionBase}`]);
  const p: string[] = [];
  for (const k of Object.keys(d)) if (!['schemaVersion', 'batchId', 'revisionBase', 'decisiones', 'clasificaciones'].includes(k)) p.push(`clave no admitida ${k.slice(0, 30)}`);
  if (!Array.isArray(d.decisiones) || !Array.isArray(d.clasificaciones)) p.push('decisiones y clasificaciones: listas requeridas');
  if (p.length) throw new IntakeError('DECISIONES_INVALIDAS', p);
  const vistos = new Set<string>();
  for (const x of d.decisiones as unknown[]) {
    if (!esObjeto(x)) { p.push('decisión mal formada'); continue; }
    const id = String(x.proposalId).slice(0, 80);
    for (const k of Object.keys(x)) if (!CLAVES_DECISION.includes(k)) p.push(`${id}: clave no admitida ${k.slice(0, 30)}`);
    if (vistos.has(id)) p.push(`${id}: decisión repetida`);
    vistos.add(id);
    const ref = a.propuestas.find(y => y.proposalId === x.proposalId);
    if (!ref) { p.push(`${id}: no es una propuesta válida de este lote`); continue; }
    if (x.entidad !== undefined && x.entidad !== ref.entidad) p.push(`${id}: entidad informativa no coincide`);
    if (x.decision === null) continue;
    if (!(DECISIONES_HUMANAS as readonly unknown[]).includes(x.decision)) p.push(`${id}: decisión ${String(x.decision).slice(0, 20)} (APPROVED, REJECTED o NEEDS_CHANGES)`);
    if (typeof x.revisor !== 'string' || !REVISOR_VALIDO.test(x.revisor)) p.push(`${id}: revisor requerido (rol o alias en minúsculas, sin nombres ni direcciones electrónicas)`);
    if (x.comentario !== undefined && typeof x.comentario !== 'string') p.push(`${id}: comentario debe ser texto`);
    if (typeof x.comentario === 'string' && contenidoProhibido(x.comentario, '').length) p.push(`${id}: el comentario contiene contenido no permitido`);
    if (x.noEsDuplicadoDe !== undefined && (!Array.isArray(x.noEsDuplicadoDe) || !x.noEsDuplicadoDe.every(v => typeof v === 'string'))) p.push(`${id}: noEsDuplicadoDe: lista de proposalId`);
  }
  const vistas = new Set<string>();
  for (const x of d.clasificaciones as unknown[]) {
    if (!esObjeto(x)) { p.push('clasificación mal formada'); continue; }
    const id = String(x.solicitudId).slice(0, 80);
    for (const k of Object.keys(x)) if (!CLAVES_CLASIFICACION.includes(k)) p.push(`${id}: clave no admitida ${k.slice(0, 30)}`);
    if (vistas.has(id)) p.push(`${id}: clasificación repetida (se elige UN tipo)`);
    vistas.add(id);
    const ref = a.solicitudesClasificacion.find(y => y.solicitudId === x.solicitudId);
    if (!ref) { p.push(`${id}: no es una solicitud de este lote`); continue; }
    if (x.tipo === null) continue;
    if (!(TIPOS_ENTIDAD as readonly unknown[]).includes(x.tipo) || !ref.alternativas.includes(x.tipo as TipoEntidad)) p.push(`${id}: el tipo elegido debe ser UNA de las alternativas (${ref.alternativas.join(', ')})`);
    if (typeof x.revisor !== 'string' || !REVISOR_VALIDO.test(x.revisor)) p.push(`${id}: revisor requerido`);
    if (x.datos !== undefined && !esObjeto(x.datos)) p.push(`${id}: datos debe ser un objeto`);
    if (esObjeto(x.datos) && ['tipo', 'id', 'descripcion'].some(k => k in (x.datos as object))) p.push(`${id}: datos no redefine tipo, id ni descripcion`);
  }
  if (p.length) throw new IntakeError('DECISIONES_INVALIDAS', p);
  return d as unknown as ArchivoDecisiones;
}

// ---------- Aplicar ----------

export interface ResultadoAplicacionLote {
  estado: 'APLICABLE' | 'SIN_CAMBIOS' | 'YA_APLICADO';
  batchId: string;
  revisionAntes: number;
  revisionDespues: number;
  almacen: AlmacenModeloAplicacion;
  modelo: ModeloAplicacion;
  entidadesAnadidas: { entidad: string; proposalId: string }[];
  decisiones: (Pick<RevisionPropuesta, 'decision' | 'revisor' | 'fecha' | 'hash' | 'comentario'> & { proposalId: string })[];
  sinDecision: string[];
  clasificadas: { solicitudId: string; tipo: TipoEntidad; revisor: string; proposalId: string }[];
  /** Propuestas NUEVAS nacidas de clasificaciones: PENDING_REVIEW en un artefacto de revisión de seguimiento. */
  seguimiento?: ArtefactoRevision;
  metricas: {
    knowledgeGapsRecibidos: number; propuestasRecibidas: number; validas: number; rechazadasValidacion: number; unicas: number;
    posiblesDuplicados: number; clasificacionesPendientes: number; clasificadas: number;
    aprobadas: number; rechazadas: number; cambiosSolicitados: number; sinDecision: number;
    entidadesPrevistas: number; revisionAntes: number; revisionDespues: number; runtimeChanges: 0;
  };
}

/**
 * APLICAR (puro): comprueba lote, revisionBase, hashes y decisiones; aplica SOLO lo APPROVED (orden por dependencias,
 * atómico) y valida el almacén final completo. No escribe: devuelve el almacén que se escribiría.
 * Reaplicar un lote ya incorporado -> YA_APLICADO (sin duplicar ni sobrescribir). Revisión distinta -> REVISION_CONFLICTO.
 */
export function aplicarDecisiones(artefactoCrudo: unknown, decisionesCrudas: unknown, almacen: AlmacenModeloAplicacion, fecha: string): ResultadoAplicacionLote {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new IntakeError('DECISIONES_INVALIDAS', ['fecha AAAA-MM-DD requerida']);
  const modeloBase = construirModeloAplicacion(extensionDesdeAlmacen(almacen));
  // Idempotencia: el historial registra el lote que añadió cada entidad.
  const batchPrevio = esObjeto(artefactoCrudo) ? artefactoCrudo.batchId : undefined;
  if (typeof batchPrevio === 'string' && almacen.historial.some(h => h.lote === batchPrevio)) {
    return {
      estado: 'YA_APLICADO', batchId: batchPrevio, revisionAntes: almacen.revision, revisionDespues: almacen.revision, almacen, modelo: modeloBase,
      entidadesAnadidas: [], decisiones: [], sinDecision: [], clasificadas: [],
      metricas: vacias(almacen.revision),
    };
  }
  if (!esObjeto(artefactoCrudo) || artefactoCrudo.revisionBase !== almacen.revision || artefactoCrudo.hashAlmacenBase !== hashAlmacen(almacen)) {
    throw new IntakeError('REVISION_CONFLICTO', [
      `el artefacto se preparó sobre la revisión ${esObjeto(artefactoCrudo) ? String(artefactoCrudo.revisionBase) : '?'} y el almacén está en la ${almacen.revision}`
      + (esObjeto(artefactoCrudo) && artefactoCrudo.revisionBase === almacen.revision ? ' (misma revisión, contenido distinto)' : '')
      + ': vuelve a preparar el lote contra la revisión actual',
    ]);
  }
  const a = validarArtefactoRevision(artefactoCrudo, modeloBase);
  const d = validarArchivoDecisiones(decisionesCrudas, a);

  // Hash de cada decisión = hash del artefacto = hash recalculado del contenido.
  const hashMal = [
    ...d.decisiones.filter(x => x.decision !== null && x.hash !== a.propuestas.find(y => y.proposalId === x.proposalId)!.hash).map(x => `${x.proposalId}: la decisión cita otro contenido`),
    ...d.clasificaciones.filter(x => x.tipo !== null && x.hash !== a.solicitudesClasificacion.find(y => y.solicitudId === x.solicitudId)!.hash).map(x => `${x.solicitudId}: la clasificación cita otro contenido`),
  ];
  if (hashMal.length) throw new IntakeError('HASH_DISTINTO', hashMal);

  const decididas = d.decisiones.filter((x): x is DecisionPropuesta & { decision: DecisionHumana; revisor: string } => x.decision !== null);
  const aprobadas = decididas.filter(x => x.decision === 'APPROVED');
  const aprobadasIds = new Set(aprobadas.map(x => x.proposalId));
  // Aprobar ambos lados de un POSSIBLE_DUPLICATE exige confirmarlo explícitamente.
  const sinConfirmar = a.posiblesDuplicados.filter(({ propuestas: [x, y] }) => aprobadasIds.has(x) && aprobadasIds.has(y)
    && !aprobadas.some(z => (z.proposalId === x && z.noEsDuplicadoDe?.includes(y)) || (z.proposalId === y && z.noEsDuplicadoDe?.includes(x))));
  if (sinConfirmar.length) {
    throw new IntakeError('DECISIONES_INVALIDAS', sinConfirmar.map(x => `${x.propuestas.join(' / ')}: posible duplicado (${x.motivo}) aprobado dos veces; confirma con noEsDuplicadoDe o rechaza uno`));
  }

  const disponibles = new Set(a.propuestas.filter(x => aprobadasIds.has(x.proposalId)).map(x => x.entidad));
  let revisadas: KnowledgeProposal[];
  try {
    revisadas = a.propuestas.map(x => {
      const dec = decididas.find(y => y.proposalId === x.proposalId);
      return dec ? revisarPropuesta(x.propuesta, dec.decision, { revisor: dec.revisor, fecha, ...(dec.comentario ? { comentario: dec.comentario } : {}) }, modeloBase, { disponibles }) : x.propuesta;
    });
  } catch (e) {
    throw new IntakeError('CONFLICTO_APLICACION', [e instanceof Error ? enmascarar(e.message) : 'revisión inválida']);
  }
  let aplicado: ReturnType<typeof aplicarPropuestasAprobadas>;
  try {
    aplicado = aplicarPropuestasAprobadas(almacen, revisadas, fecha, { lote: a.batchId });
  } catch (e) {
    if (e instanceof PropuestaError) throw new IntakeError('CONFLICTO_APLICACION', [enmascarar(e.message)]);
    // El almacén resultante (entidades + auditoría) no supera su propia validación: no se escribe.
    if (e instanceof ModeloAplicacionError) throw new IntakeError('ALMACEN_INVALIDO', [enmascarar(e.message)]);
    throw e;
  }
  if (aplicado.cambio.runtime) throw new IntakeError('CONFLICTO_APLICACION', ['una entidad requeriría cambios de runtime']);
  // Almacén final completo validado ANTES de devolverlo para escribir.
  try {
    validarAlmacenModelo(aplicado.almacen);
    construirModeloAplicacion(extensionDesdeAlmacen(aplicado.almacen));
  } catch (e) {
    throw new IntakeError('ALMACEN_INVALIDO', [e instanceof Error ? enmascarar(e.message) : 'almacén inválido']);
  }

  // Clasificaciones -> propuestas NORMALES PENDING_REVIEW en un artefacto de seguimiento. Clasificar no es aprobar.
  const clasif = d.clasificaciones.filter((x): x is DecisionClasificacion & { tipo: TipoEntidad; revisor: string } => x.tipo !== null);
  const clasificadas = clasif.map(x => ({ solicitudId: x.solicitudId, tipo: x.tipo, revisor: x.revisor, proposalId: `${x.solicitudId}.${x.tipo}` }));
  let seguimiento: ArtefactoRevision | undefined;
  if (clasif.length) {
    const nuevas = clasif.map(x => resolverClasificacion(
      a.solicitudesClasificacion.find(y => y.solicitudId === x.solicitudId)!.solicitud, x.tipo,
      (x.datos ?? {}) as Omit<EntidadPropuesta, 'tipo' | 'id' | 'descripcion'>, `${x.solicitudId}.${x.tipo}`,
    ));
    seguimiento = prepararLoteRevision({ knowledgeProposals: nuevas }, aplicado.almacen);
    if (seguimiento.rechazadas.length) {
      throw new IntakeError('CLASIFICACION_INVALIDA', seguimiento.rechazadas.flatMap(r => r.problemas.map(x => `${r.referencia ?? r.indice}: ${x.motivo} ${x.detalle}`)));
    }
  }

  const decisiones = revisadas.filter(p => p.revisiones.length).map(p => {
    const { decision, revisor, fecha: f, hash, comentario } = p.revisiones.at(-1)!;
    return { proposalId: p.proposalId, decision, revisor, fecha: f, hash, ...(comentario ? { comentario } : {}) };
  });
  const cuenta = (x: DecisionHumana) => decididas.filter(y => y.decision === x).length;
  const r = a.resumen;
  const resultado: ResultadoAplicacionLote = {
    estado: aplicado.aplicadas.length ? 'APLICABLE' : 'SIN_CAMBIOS',
    batchId: a.batchId,
    revisionAntes: almacen.revision,
    revisionDespues: aplicado.almacen.revision,
    almacen: aplicado.almacen,
    modelo: aplicado.modelo,
    entidadesAnadidas: aplicado.aplicadas.map(id => ({ proposalId: id, entidad: a.propuestas.find(x => x.proposalId === id)!.entidad })),
    decisiones,
    sinDecision: a.propuestas.filter(x => !decididas.some(y => y.proposalId === x.proposalId)).map(x => x.proposalId),
    clasificadas,
    ...(seguimiento ? { seguimiento } : {}),
    metricas: {
      knowledgeGapsRecibidos: r.knowledgeGapsRecibidos, propuestasRecibidas: r.propuestasRecibidas, validas: r.validas,
      rechazadasValidacion: r.rechazadas, unicas: r.unicas, posiblesDuplicados: r.posiblesDuplicados,
      clasificacionesPendientes: a.solicitudesClasificacion.length - clasif.length, clasificadas: clasif.length,
      aprobadas: cuenta('APPROVED'), rechazadas: cuenta('REJECTED'), cambiosSolicitados: cuenta('NEEDS_CHANGES'),
      sinDecision: a.propuestas.length - decididas.length, entidadesPrevistas: aplicado.aplicadas.length,
      revisionAntes: almacen.revision, revisionDespues: aplicado.almacen.revision, runtimeChanges: 0,
    },
  };
  verificarSinPii({ decisiones: resultado.decisiones, clasificadas, entidades: resultado.entidadesAnadidas }, 'DECISIONES_INVALIDAS');
  return resultado;
}

function vacias(revision: number): ResultadoAplicacionLote['metricas'] {
  return {
    knowledgeGapsRecibidos: 0, propuestasRecibidas: 0, validas: 0, rechazadasValidacion: 0, unicas: 0, posiblesDuplicados: 0,
    clasificacionesPendientes: 0, clasificadas: 0, aprobadas: 0, rechazadas: 0, cambiosSolicitados: 0, sinDecision: 0,
    entidadesPrevistas: 0, revisionAntes: revision, revisionDespues: revision, runtimeChanges: 0,
  };
}
