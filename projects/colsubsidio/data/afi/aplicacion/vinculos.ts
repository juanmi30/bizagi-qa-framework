import { createHash } from 'node:crypto';
import { IntakeError, REVISOR_VALIDO, hashAlmacen } from './intakeLote';
import {
  ALMACEN_APLICACION_AFI, MODELO_APLICACION_AFI, resolverEntidad, superficiesEfectivas, validarAlmacenModelo,
  type AlmacenModeloAplicacion, type ModeloAplicacion, type VinculoObservacion,
} from './modeloAplicacion';
import { canonico, contenidoProhibido } from './propuestas';
import {
  CATALOGO_PROVEEDORES, PROVEEDORES_PRODUCTIVOS, TIPOS_ENTIDAD,
  type ReferenciaEntidad, type TipoEntidad,
} from './superficies';

// El catálogo y su descriptor viven en superficies.ts (fuente única del alcance, también para la publicación).
export { CATALOGO_PROVEEDORES, type DescriptorProveedor } from './superficies';

/**
 * VÍNCULOS DE OBSERVACIÓN (Fase 4R.1). Capa pura.
 *
 *   ENTIDAD  (Application Model): tipo + id + significado.
 *   VÍNCULO  (esta capa):         entidad + superficie + proveedor + localización propia de ESE proveedor.
 *
 * Un vínculo es conocimiento técnico DECLARATIVO: nunca código, selectores, URLs ni PII. Entra solo por revisión humana
 * (prepararRevisionVinculos -> decisiones con hash -> aplicarDecisionesVinculos) y se persiste en una sección propia del
 * almacén. Que un proveedor tenga implementación ("disponible") NO lo hace productivo: eso es PROVEEDORES_PRODUCTIVOS.
 */

// ---------- Estado de un proveedor del catálogo ----------

export type EstadoProveedor = 'productivo' | 'disponible' | 'desconocido';

/** productivo = validado en QA real y registrado; disponible = implementado (solo inyectable explícitamente). */
export function estadoProveedor(id: string, productivos: readonly { id: string }[] = PROVEEDORES_PRODUCTIVOS): EstadoProveedor {
  if (productivos.some(p => p.id === id)) return 'productivo';
  return Object.prototype.hasOwnProperty.call(CATALOGO_PROVEEDORES, id) ? 'disponible' : 'desconocido';
}

export const idVinculo = (v: Pick<VinculoObservacion, 'entidad' | 'proveedor'>) => `${v.entidad.tipo}:${v.entidad.id}@${v.proveedor}`;

// ---------- Validación fail-closed ----------

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const citar = (v: unknown) => JSON.stringify(String(v).slice(0, 40));
const MAX_LOCALIZACION = 120;

/** Problemas de UN vínculo contra el modelo (sin considerar los demás). Vacío = válido. */
export function problemasVinculo(v: unknown, modelo: ModeloAplicacion): string[] {
  const p: string[] = [];
  if (!esObjeto(v)) return ['el vínculo debe ser un objeto'];
  for (const k of Object.keys(v)) if (!['entidad', 'superficie', 'proveedor', 'localizacion'].includes(k)) p.push(`clave no admitida ${citar(k)}`);
  const e = v.entidad;
  if (!esObjeto(e) || Object.keys(e).some(k => k !== 'tipo' && k !== 'id') || typeof e.tipo !== 'string' || typeof e.id !== 'string') {
    p.push('entidad: { tipo, id } requerido');
    return p;
  }
  if (!(TIPOS_ENTIDAD as readonly string[]).includes(e.tipo)) { p.push(`tipo de entidad desconocido ${citar(e.tipo)}`); return p; }
  const ref: ReferenciaEntidad = { tipo: e.tipo as TipoEntidad, id: e.id };
  const r = resolverEntidad(modelo, ref);
  if (r.estado === 'no-registrada') p.push(`entidad no registrada ${citar(ref.id)}`);
  if (r.estado === 'tipo-incorrecto') p.push(`${citar(ref.id)} es ${r.tipoReal}, no ${ref.tipo}`);
  const d = typeof v.proveedor === 'string' && Object.prototype.hasOwnProperty.call(CATALOGO_PROVEEDORES, v.proveedor) ? CATALOGO_PROVEEDORES[v.proveedor] : undefined;
  if (!d) { p.push(`proveedor sin implementación ${citar(v.proveedor)}`); return p; }
  if (v.superficie !== d.superficie) p.push(`el proveedor observa ${d.superficie}, no ${citar(v.superficie)}`);
  else if (r.estado === 'registrada' && !superficiesEfectivas(modelo, ref).includes(d.superficie)) p.push(`${d.superficie} no es superficie efectiva de ${citar(ref.id)}`);
  if (!d.tipos.includes(ref.tipo)) p.push(`el proveedor no localiza entidades ${ref.tipo}`);
  const l = v.localizacion;
  if (!esObjeto(l)) { p.push('localizacion: objeto requerido'); return p; }
  for (const k of Object.keys(l)) if (!d.localizacion.includes(k)) p.push(`localizacion.${k.slice(0, 30)}: no admitida por el proveedor`);
  for (const k of d.localizacion) {
    const x = l[k];
    if (typeof x !== 'string' || !x.trim() || x.length > MAX_LOCALIZACION || /[\r\n]/.test(x)) p.push(`localizacion.${k}: texto de una línea, no vacío, máximo ${MAX_LOCALIZACION}`);
  }
  for (const motivo of contenidoProhibido(l, null)) p.push(`localizacion: contenido prohibido (${motivo})`);
  return p;
}

const normalizarLocalizacion = (l: Readonly<Record<string, string>>) =>
  canonico(Object.fromEntries(Object.entries(l).map(([k, x]) => [k, x.trim().replace(/\s+/g, ' ').toLowerCase()])));

/**
 * Conjunto coherente: cada vínculo válido, como máximo UNO por entidad+proveedor y ninguna localización compartida por
 * dos entidades del mismo proveedor (un mismo hecho de la fuente certificaría dos cosas distintas).
 */
export function problemasConjuntoVinculos(vinculos: readonly unknown[], modelo: ModeloAplicacion): string[] {
  const p: string[] = [];
  const porId = new Map<string, number>(), porLocalizacion = new Map<string, string>();
  vinculos.forEach((v, i) => {
    const propios = problemasVinculo(v, modelo);
    p.push(...propios.map(x => `vinculo[${i}]: ${x}`));
    if (propios.length) return;
    const vin = v as VinculoObservacion, id = idVinculo(vin);
    if (porId.has(id)) p.push(`vinculo[${i}]: ${id} ya vinculado en vinculo[${porId.get(id)}] (contradictorio o duplicado)`);
    else porId.set(id, i);
    const clave = `${vin.proveedor}|${normalizarLocalizacion(vin.localizacion)}`;
    const otra = porLocalizacion.get(clave);
    if (otra && otra !== id) p.push(`vinculo[${i}]: misma localización que ${otra} en ${vin.proveedor} (ambiguo)`);
    else porLocalizacion.set(clave, id);
  });
  return p;
}

export class VinculosInvalidosError extends Error {
  constructor(readonly problemas: readonly string[]) {
    super(`Vínculos de observación inválidos:\n${problemas.map(p => `- ${p}`).join('\n')}`);
    this.name = 'VinculosInvalidosError';
  }
}

/** Vínculos aprobados del almacén, validados contra el modelo (fail-closed: un almacén incoherente no carga). */
export function vinculosAprobados(almacen: AlmacenModeloAplicacion, modelo: ModeloAplicacion): readonly VinculoObservacion[] {
  const lista = almacen.vinculosObservacion ?? [];
  const p = problemasConjuntoVinculos(lista, modelo);
  if (p.length) throw new VinculosInvalidosError(p);
  return Object.freeze(lista.map(v => Object.freeze({ ...v, entidad: Object.freeze({ ...v.entidad }), localizacion: Object.freeze({ ...v.localizacion }) })));
}

/** Vínculo aprobado de ESA entidad para ESE proveedor, si existe. */
export const vinculoDe = (vinculos: readonly VinculoObservacion[], ref: ReferenciaEntidad, proveedor: string) =>
  vinculos.find(v => v.entidad.tipo === ref.tipo && v.entidad.id === ref.id && v.proveedor === proveedor);

/** Vínculos aprobados del proyecto. */
export const VINCULOS_OBSERVACION_AFI: readonly VinculoObservacion[] = vinculosAprobados(ALMACEN_APLICACION_AFI, MODELO_APLICACION_AFI);

// ---------- Revisión humana: preparar -> decidir -> aplicar ----------

export const ESQUEMA_REVISION_VINCULOS = 'afi-binding-review/v1';
export const ESQUEMA_DECISIONES_VINCULOS = 'afi-binding-decisions/v1';
const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');
export const hashVinculo = (v: VinculoObservacion) => sha256(canonico(v));

export interface ArtefactoRevisionVinculos {
  schemaVersion: typeof ESQUEMA_REVISION_VINCULOS;
  batchId: string;
  revisionBase: number;
  hashAlmacenBase: string;
  /** Válidos, PENDING_REVIEW: nadie (tampoco el agente) puede marcarlos aprobados aquí. */
  vinculos: { bindingId: string; hash: string; vinculo: VinculoObservacion }[];
  /** Rechazados al preparar: solo índice y motivos (nunca se copia su contenido). */
  rechazados: { indice: number; problemas: string[] }[];
}

export interface DecisionesVinculos {
  schemaVersion: typeof ESQUEMA_DECISIONES_VINCULOS;
  batchId: string;
  revisionBase: number;
  decisiones: { bindingId: string; hash: string; decision: 'APPROVED' | 'REJECTED' | null; revisor: string | null; comentario?: string }[];
}

/**
 * PREPARAR (puro, nunca modifica el almacén). Entrada: { observationBindings: [VinculoObservacion...] } y nada más
 * (un estado, una decisión o cualquier otra clave se rechaza: un agente no puede auto-aprobar).
 */
export function prepararRevisionVinculos(entrada: unknown, almacen: AlmacenModeloAplicacion, modelo: ModeloAplicacion): ArtefactoRevisionVinculos {
  if (!esObjeto(entrada) || Object.keys(entrada).some(k => k !== 'observationBindings') || !Array.isArray(entrada.observationBindings)) {
    throw new IntakeError('ENTRADA_INVALIDA', ['se espera exactamente { "observationBindings": [...] }']);
  }
  const aprobados = vinculosAprobados(almacen, modelo);
  const vinculos: ArtefactoRevisionVinculos['vinculos'] = [], rechazados: ArtefactoRevisionVinculos['rechazados'] = [];
  entrada.observationBindings.forEach((v: unknown, indice) => {
    const propios = problemasVinculo(v, modelo);
    // Coherencia con lo YA aprobado y con los anteriores del lote.
    const conjunto = propios.length ? propios : problemasConjuntoVinculos([...aprobados, ...vinculos.map(x => x.vinculo), v], modelo);
    if (conjunto.length) { rechazados.push({ indice, problemas: conjunto.map(x => x.replace(/^vinculo\[\d+\]: /, '')) }); return; }
    const vin = JSON.parse(JSON.stringify(v)) as VinculoObservacion;
    vinculos.push({ bindingId: idVinculo(vin), hash: hashVinculo(vin), vinculo: vin });
  });
  const hashAlmacenBase = hashAlmacen(almacen);
  const batchId = `kb-${sha256(canonico({ revisionBase: almacen.revision, hashAlmacenBase, hashes: vinculos.map(v => v.hash) })).slice(0, 16)}`;
  return { schemaVersion: ESQUEMA_REVISION_VINCULOS, batchId, revisionBase: almacen.revision, hashAlmacenBase, vinculos, rechazados };
}

export const plantillaDecisionesVinculos = (a: ArtefactoRevisionVinculos): DecisionesVinculos => ({
  schemaVersion: ESQUEMA_DECISIONES_VINCULOS, batchId: a.batchId, revisionBase: a.revisionBase,
  decisiones: a.vinculos.map(v => ({ bindingId: v.bindingId, hash: v.hash, decision: null, revisor: null })),
});

export interface ResultadoVinculos {
  estado: 'APLICABLE' | 'SIN_CAMBIOS' | 'YA_APLICADO';
  batchId: string;
  revisionAntes: number;
  revisionDespues: number;
  almacen: AlmacenModeloAplicacion;
  aprobados: string[];
  rechazados: string[];
  sinDecision: string[];
}

/** APLICAR (puro): lote, revisionBase, hash del almacén y de cada vínculo; solo APPROVED con revisor; atómico. */
export function aplicarDecisionesVinculos(
  artefactoCrudo: unknown, decisionesCrudas: unknown, almacen: AlmacenModeloAplicacion, modelo: ModeloAplicacion, fecha: string,
): ResultadoVinculos {
  if (!esObjeto(artefactoCrudo) || artefactoCrudo.schemaVersion !== ESQUEMA_REVISION_VINCULOS || !Array.isArray(artefactoCrudo.vinculos)) {
    throw new IntakeError('ARTEFACTO_INVALIDO', ['artefacto de revisión de vínculos desconocido']);
  }
  const a = artefactoCrudo as unknown as ArtefactoRevisionVinculos;
  const base = { batchId: a.batchId, revisionAntes: almacen.revision, aprobados: [], rechazados: [], sinDecision: [] };
  if ((almacen.historialVinculos ?? []).some(h => h.lote === a.batchId)) return { ...base, estado: 'YA_APLICADO', revisionDespues: almacen.revision, almacen };
  if (a.revisionBase !== almacen.revision || a.hashAlmacenBase !== hashAlmacen(almacen)) {
    throw new IntakeError('REVISION_CONFLICTO', [`el lote se preparó sobre la revisión ${String(a.revisionBase)} y el almacén está en la ${almacen.revision} (o cambió)`]);
  }
  for (const v of a.vinculos) if (v.hash !== hashVinculo(v.vinculo) || v.bindingId !== idVinculo(v.vinculo)) throw new IntakeError('HASH_DISTINTO', [`${String(v.bindingId).slice(0, 80)}: el artefacto fue modificado`]);
  const d = decisionesCrudas as DecisionesVinculos;
  if (!esObjeto(d) || d.schemaVersion !== ESQUEMA_DECISIONES_VINCULOS || !Array.isArray(d.decisiones)) throw new IntakeError('DECISIONES_INVALIDAS', ['archivo de decisiones de vínculos desconocido']);
  if (Object.keys(d).some(k => !['schemaVersion', 'batchId', 'revisionBase', 'decisiones'].includes(k))) throw new IntakeError('DECISIONES_INVALIDAS', ['clave no admitida']);
  if (d.batchId !== a.batchId) throw new IntakeError('LOTE_DISTINTO', ['las decisiones son de otro lote']);
  if (d.revisionBase !== a.revisionBase) throw new IntakeError('REVISION_CONFLICTO', ['decisiones sobre otra revisionBase']);
  const p: string[] = [], aprobados: VinculoObservacion[] = [], ids = { aprobados: [] as string[], rechazados: [] as string[] };
  const decididos = new Set<string>();
  for (const x of d.decisiones) {
    const v = a.vinculos.find(y => y.bindingId === x?.bindingId);
    if (!v) { p.push(`decisión sobre un vínculo que no está en el lote ${citar(x?.bindingId)}`); continue; }
    if (decididos.has(v.bindingId)) { p.push(`${v.bindingId}: decidido dos veces`); continue; }
    decididos.add(v.bindingId);
    if (Object.keys(x).some(k => !['bindingId', 'hash', 'decision', 'revisor', 'comentario'].includes(k))) p.push(`${v.bindingId}: clave no admitida`);
    if (x.decision === null) continue;
    if (x.hash !== v.hash) { p.push(`${v.bindingId}: el hash decidido no coincide con el revisado`); continue; }
    if (x.decision !== 'APPROVED' && x.decision !== 'REJECTED') { p.push(`${v.bindingId}: decisión desconocida`); continue; }
    if (typeof x.revisor !== 'string' || !REVISOR_VALIDO.test(x.revisor)) { p.push(`${v.bindingId}: revisor inválido`); continue; }
    if (x.decision === 'APPROVED') { aprobados.push(v.vinculo); ids.aprobados.push(v.bindingId); } else ids.rechazados.push(v.bindingId);
  }
  if (p.length) throw new IntakeError('DECISIONES_INVALIDAS', p);
  const sinDecision = a.vinculos.map(v => v.bindingId).filter(id => !ids.aprobados.includes(id) && !ids.rechazados.includes(id));
  if (!aprobados.length) return { ...base, estado: 'SIN_CAMBIOS', revisionDespues: almacen.revision, almacen, ...ids, sinDecision };
  const conjunto = [...(almacen.vinculosObservacion ?? []), ...aprobados];
  const conflictos = problemasConjuntoVinculos(conjunto, modelo);
  if (conflictos.length) throw new IntakeError('CONFLICTO_APLICACION', conflictos);
  const revision = almacen.revision + 1;
  const decisionDe = (id: string) => d.decisiones.find(x => x.bindingId === id)!;
  const nuevo = validarAlmacenModelo({
    ...almacen, revision, vinculosObservacion: conjunto,
    historialVinculos: [...(almacen.historialVinculos ?? []), ...aprobados.map(v => {
      const id = idVinculo(v);
      return { revision, fecha, vinculo: id, hash: hashVinculo(v), revisor: decisionDe(id).revisor!, lote: a.batchId };
    })],
  });
  return { ...base, estado: 'APLICABLE', revisionDespues: revision, almacen: nuevo, ...ids, sinDecision };
}
