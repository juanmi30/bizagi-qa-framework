import { createHash } from 'node:crypto';
import { CAPACIDADES_CONTROL, type ControlCampo } from './campos';
import { clasificarIncorporacion, type DiagnosticoCondicion } from './gaps';
import {
  construirModeloAplicacion, extensionDesdeAlmacen, resolverEntidad,
  type AlmacenModeloAplicacion, type ModeloAplicacion,
} from './modeloAplicacion';
import { piiEnContenido, piiEnMetadato } from './sensibilidad';
import { DESCRIPCION_ENTIDAD, TIPOS_ENTIDAD, superficiesDeEntidad, type SuperficieObservacion, type TipoEntidad } from './superficies';
import { esCampoDato } from '../datosPrueba/contrato';
import { ETAPAS_AFI } from '../modelo';

/**
 * DECLARATIVE KNOWLEDGE INTAKE (Fase 4N). Capa pura.
 *
 *   KNOWLEDGE_GAP -> KnowledgeProposal -> validación -> PENDING_REVIEW -> APPROVED | REJECTED | NEEDS_CHANGES
 *                 -> (solo APPROVED) almacén declarativo -> Application Model -> re-diagnóstico
 *
 * - Una propuesta = UNA entidad atómica de UN tipo. El agente solo PROPONE; nunca escribe el modelo.
 * - Incorporar una entidad es un cambio DECLARATIVO (no runtime) y nunca crea proveedores.
 * - El modelo sabe QUÉ EXISTE. Las expectativas (X == null, X == "Activo") pertenecen a condiciones/casos y las reglas
 *   (cuándo aplica una consecuencia) a su propio almacén: ninguna de las dos se convierte en entidad.
 */

export const ESQUEMA_PROPUESTA = 'afi-knowledge-proposal/v1';
export const ESTADOS_PROPUESTA = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_CHANGES'] as const;
export type EstadoPropuesta = typeof ESTADOS_PROPUESTA[number];

// ---------- 1/2. Contrato: unión discriminada por tipo ----------

export type EntidadPropuesta =
  | { tipo: 'pantalla-ui'; id: string; descripcion: string; senales?: string[]; titulo?: string; etapa?: string; consulta?: string }
  | { tipo: 'campo-ui'; id: string; descripcion: string; pantalla?: string; control?: ControlCampo; etiqueta?: string; dato?: string; obligatorio?: 'si' | 'no' }
  | { tipo: 'transicion-ui'; id: string; descripcion: string; desde: string; hacia: string; avance?: string; condicion?: string }
  | { tipo: 'actividad'; id: string; descripcion: string }
  | { tipo: 'ruta'; id: string; descripcion: string; desde?: string; hacia?: string }
  | { tipo: 'integracion'; id: string; descripcion: string }
  | { tipo: 'variable'; id: string; descripcion: string; superficies: SuperficieObservacion[]; ambito?: { tipo: 'proceso' } | { tipo: 'integracion'; integracion: string } }
  | { tipo: 'notificacion'; id: string; descripcion: string; canal?: string };

/** Datos declarativos propios de cada tipo. Solo lo que el tipo necesita; el resto invalida la propuesta. */
export const DATOS_POR_TIPO: Readonly<Record<TipoEntidad, { requeridos: readonly string[]; opcionales: readonly string[] }>> = {
  'pantalla-ui': { requeridos: ['tipo', 'id', 'descripcion'], opcionales: ['senales', 'titulo', 'etapa', 'consulta'] },
  'campo-ui': { requeridos: ['tipo', 'id', 'descripcion'], opcionales: ['pantalla', 'control', 'etiqueta', 'dato', 'obligatorio'] },
  'transicion-ui': { requeridos: ['tipo', 'id', 'descripcion', 'desde', 'hacia'], opcionales: ['avance', 'condicion'] },
  actividad: { requeridos: ['tipo', 'id', 'descripcion'], opcionales: [] },
  ruta: { requeridos: ['tipo', 'id', 'descripcion'], opcionales: ['desde', 'hacia'] },
  integracion: { requeridos: ['tipo', 'id', 'descripcion'], opcionales: [] },
  variable: { requeridos: ['tipo', 'id', 'descripcion', 'superficies'], opcionales: ['ambito'] },
  notificacion: { requeridos: ['tipo', 'id', 'descripcion'], opcionales: ['canal'] },
};

/**
 * Referencias de cada tipo a otras entidades (4O). Única fuente para validar referencias, calcular dependencias
 * dentro de un lote y publicar el contrato. Hoy apuntan solo a tipos SIN referencias: el grafo es acíclico por
 * construcción, pero la aplicación ordena y detecta ciclos de forma genérica.
 */
export const REFERENCIAS_POR_TIPO: Readonly<Record<TipoEntidad, readonly { campo: string; tipo: TipoEntidad }[]>> = {
  'pantalla-ui': [],
  'campo-ui': [{ campo: 'pantalla', tipo: 'pantalla-ui' }],
  'transicion-ui': [{ campo: 'desde', tipo: 'pantalla-ui' }, { campo: 'hacia', tipo: 'pantalla-ui' }],
  actividad: [],
  ruta: [{ campo: 'desde', tipo: 'actividad' }, { campo: 'hacia', tipo: 'actividad' }],
  integracion: [],
  variable: [{ campo: 'ambito.integracion', tipo: 'integracion' }],
  notificacion: [],
};

/** Forma de la propuesta y de sus partes (4O): la validación y el contrato publicado derivan de aquí. */
export const FORMA_PROPUESTA = {
  requeridos: ['schemaVersion', 'proposalId', 'entidad', 'origen', 'evidenciaSemantica', 'estado', 'revisiones'],
  opcionales: ['alias', 'operacion'],
  origen: { requeridos: ['fuente', 'ocurrencias'], opcionales: [] },
  ocurrencia: { requeridos: ['hu'], opcionales: ['caso', 'paso', 'condicion'] },
} as const;
export const FORMA_SOLICITUD = {
  requeridos: ['schemaVersion', 'solicitudId', 'id', 'descripcion', 'alternativas', 'origen', 'evidenciaSemantica', 'estado'],
  opcionales: [],
} as const;
/**
 * Operación de la propuesta. Por defecto CREA una entidad nueva. `completar` (enriquecimiento) AÑADE atributos opcionales
 * ausentes a una entidad YA registrada en el almacén (misma descripción): nunca cambia ni borra lo aprobado.
 */
export const OPERACIONES_PROPUESTA = ['completar'] as const;
/** Tipos cuyas entidades del almacén admiten `completar` (sus atributos semánticos de navegación quedan pendientes al crearlas). */
export const TIPOS_COMPLETABLES: readonly TipoEntidad[] = ['pantalla-ui', 'campo-ui'];

/** Ids de propuesta/solicitud: metadatos cortos, sin espacios. */
export const ID_PROPUESTA = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export interface OcurrenciaPropuesta { hu: string; caso?: string; paso?: string; condicion?: string }

export interface RevisionPropuesta {
  decision: Exclude<EstadoPropuesta, 'PENDING_REVIEW'>;
  /** Identidad ABSTRACTA del revisor (rol o alias), sin autenticación todavía. */
  revisor: string;
  fecha: string;
  version: number;
  comentario?: string;
  /** Identidad del contenido revisado: si la propuesta cambia después, la aprobación deja de valer. */
  hash: string;
}

export interface KnowledgeProposal {
  schemaVersion: typeof ESQUEMA_PROPUESTA;
  proposalId: string;
  entidad: EntidadPropuesta;
  /** Nombres con los que apareció en las fuentes (ayudan a detectar duplicados; nunca fusionan solos). */
  alias?: string[];
  origen: { fuente: string; ocurrencias: OcurrenciaPropuesta[] };
  /** Por qué existe esta entidad según las fuentes (texto público, sin PII). */
  evidenciaSemantica: string;
  /** Ausente = crear. `completar` = añadir atributos opcionales ausentes a una entidad del almacén. */
  operacion?: typeof OPERACIONES_PROPUESTA[number];
  estado: EstadoPropuesta;
  revisiones: RevisionPropuesta[];
}

// ---------- 9. Ambigüedad de tipo: solicitud de clasificación (no es una propuesta) ----------

/** El agente no puede decidir el tipo: se pide a un humano que elija UNO de estas alternativas excluyentes. */
export interface SolicitudClasificacion {
  schemaVersion: typeof ESQUEMA_PROPUESTA;
  solicitudId: string;
  id: string;
  descripcion: string;
  alternativas: TipoEntidad[];
  origen: KnowledgeProposal['origen'];
  evidenciaSemantica: string;
  estado: 'NEEDS_CLASSIFICATION';
}

// ---------- 3. Validación fail-closed ----------

export type MotivoRechazo =
  | 'ESQUEMA' | 'NO_ES_ENTIDAD' | 'NO_ATOMICA' | 'TIPO_DESCONOCIDO' | 'ID_INVALIDO' | 'ESTRUCTURA' | 'SIN_FUENTE' | 'SIN_EVIDENCIA'
  | 'SIN_OCURRENCIAS' | 'PII' | 'SELECTOR' | 'CODIGO' | 'PROVEEDOR' | 'INSTRUCCION' | 'ESTADO_INVALIDO' | 'YA_REGISTRADA'
  | 'CONFLICTO_TIPO' | 'REFERENCIA_DESCONOCIDA' | 'DEPENDENCIA_RECHAZADA' | 'NO_REGISTRADA' | 'SOBRESCRITURA';
export interface ProblemaPropuesta { motivo: MotivoRechazo; detalle: string }

const ID_SEMANTICO = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z][A-Za-z0-9]*$/;
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const RESERVADAS_REGLA = ['predicado', 'consecuencias', 'expectativa'];
/** Contenido prohibido en conocimiento declarativo, en cualquier contexto (la PII es contextual: sensibilidad.ts). */
const PROHIBIDO: [MotivoRechazo, RegExp][] = [
  ['SELECTOR', /#[a-z][\w-]*|\[[a-z-]+\s*=|formcontrolname|xpath|\bcss=|getBy|locator\(|querySelector|document\./i],
  ['CODIGO', /=>|\bfunction\b|\bimport\s|\brequire\(|\$\{|<\/?[a-z]+[\s>]|\beval\(|\bnew\s+[A-Z]/],
  ['PROVEEDOR', /\bprovider|\bproveedor|\bimplementa|\bprograma[rd]/i],
  ['INSTRUCCION', /\b(npm|npx|node|curl|wget|powershell|bash|sudo|rm)\b|https?:\/\/|\.(js|ts|sh|ps1)\b/i],
];

/**
 * Contenido prohibido con PII CONTEXTUAL (4O): `semantico` (descripción, evidencia, alias, datos de la entidad) con la
 * heurística estricta; `metadatos` (fuente, ocurrencias, ids) admitiendo fechas compactas e ids documentales.
 */
export function contenidoProhibido(semantico: unknown, metadatos: unknown): MotivoRechazo[] {
  const a = JSON.stringify(semantico ?? null), b = JSON.stringify(metadatos ?? null);
  const r: MotivoRechazo[] = [];
  if (piiEnContenido(a) || piiEnMetadato(b)) r.push('PII');
  for (const [motivo, re] of PROHIBIDO) if (re.test(a) || re.test(b)) r.push(motivo);
  return r;
}

export const claveEntidad = (tipo: TipoEntidad, id: string) => `${tipo}:${id}`;

/** Contexto de validación de un LOTE: entidades propuestas en el mismo lote que pueden satisfacer referencias. */
export interface OpcionesValidacion { disponibles?: ReadonlySet<string> }

const valorEn = (e: Record<string, unknown>, ruta: string): unknown =>
  ruta.split('.').reduce<unknown>((v, k) => (esObjeto(v) ? v[k] : undefined), e);

/** Referencias declaradas por la entidad (solo las presentes: las ausentes quedan pendientes de enriquecimiento). */
export function referenciasDeEntidad(e: EntidadPropuesta): { campo: string; tipo: TipoEntidad; id: string }[] {
  return REFERENCIAS_POR_TIPO[e.tipo].flatMap(r => {
    const v = valorEn(e as unknown as Record<string, unknown>, r.campo);
    return typeof v === 'string' ? [{ ...r, id: v }] : [];
  });
}

const clavesAjenas = (o: Record<string, unknown>, forma: { requeridos: readonly string[]; opcionales: readonly string[] }) =>
  Object.keys(o).filter(k => ![...forma.requeridos, ...forma.opcionales].includes(k));

/** Validación estructural y semántica de una propuesta contra el modelo actual (y, en un lote, sus entidades hermanas). */
export function validarPropuesta(p: unknown, modelo: ModeloAplicacion, opciones: OpcionesValidacion = {}): ProblemaPropuesta[] {
  const r: ProblemaPropuesta[] = [];
  const mal = (motivo: MotivoRechazo, detalle: string) => r.push({ motivo, detalle });
  if (!esObjeto(p)) return [{ motivo: 'ESQUEMA', detalle: 'la propuesta debe ser un objeto' }];
  if (RESERVADAS_REGLA.some(k => k in p)) mal('NO_ES_ENTIDAD', 'reglas y expectativas no se proponen como entidades');
  if (p.schemaVersion !== ESQUEMA_PROPUESTA) mal('ESQUEMA', 'schemaVersion desconocido');
  if (typeof p.proposalId !== 'string' || !ID_PROPUESTA.test(p.proposalId)) mal('ESQUEMA', 'proposalId requerido: letras, dígitos, punto, guion o guion bajo');
  const e = p.entidad;
  if (Array.isArray(e) || esObjeto(p.entidades)) { mal('NO_ATOMICA', 'una propuesta declara UNA entidad'); return r; }
  for (const k of clavesAjenas(p, FORMA_PROPUESTA)) if (!RESERVADAS_REGLA.includes(k)) mal('ESTRUCTURA', `${k.slice(0, 30)} no pertenece a la propuesta`);
  if (!esObjeto(e)) { mal('ESQUEMA', 'entidad requerida'); return r; }
  if ('predicado' in e || 'consecuencias' in e || 'expectativa' in e || 'valor' in e) mal('NO_ES_ENTIDAD', 'la entidad no lleva reglas ni valores esperados');
  const tipo = e.tipo;
  if (Array.isArray(tipo) || (typeof tipo === 'string' && (/[/|,]| o | y /.test(tipo) || TIPOS_ENTIDAD.filter(t => tipo.includes(t)).length > 1))) {
    mal('NO_ATOMICA', `tipo compuesto ${JSON.stringify(tipo).slice(0, 40)}: usar una solicitud de clasificación`);
    return r;
  }
  if (!(TIPOS_ENTIDAD as readonly unknown[]).includes(tipo)) { mal('TIPO_DESCONOCIDO', `tipo ${String(tipo).slice(0, 30)}`); return r; }
  const t = tipo as TipoEntidad;
  const datos = DATOS_POR_TIPO[t];
  for (const k of clavesAjenas(e, datos)) mal('ESTRUCTURA', `${k.slice(0, 30)} no pertenece a ${t}`);
  for (const k of datos.requeridos) if (e[k] === undefined || (typeof e[k] === 'string' && !texto(e[k]))) mal('ESTRUCTURA', `${k} requerido para ${t}`);
  for (const k of [...datos.requeridos, ...datos.opcionales]) if (k !== 'superficies' && k !== 'senales' && k !== 'ambito' && e[k] !== undefined && typeof e[k] !== 'string') mal('ESTRUCTURA', `${k}: texto`);
  if (typeof e.id !== 'string' || !ID_SEMANTICO.test(e.id)) mal('ID_INVALIDO', `id semántico inválido ${JSON.stringify(e.id).slice(0, 40)}`);
  // Datos por tipo.
  if (t === 'variable') {
    const s = e.superficies;
    if (!Array.isArray(s) || !s.length) mal('ESTRUCTURA', 'una variable declara sus superficies candidatas');
    else for (const x of s) if (!superficiesDeEntidad('variable').includes(x as SuperficieObservacion)) mal('ESTRUCTURA', `la superficie ${String(x).slice(0, 30)} no observa variables`);
    const a = e.ambito;
    if (a !== undefined && !(esObjeto(a) && ((a.tipo === 'proceso' && Object.keys(a).length === 1) || (a.tipo === 'integracion' && typeof a.integracion === 'string' && Object.keys(a).length === 2)))) {
      mal('ESTRUCTURA', 'ambito: { tipo: "proceso" } o { tipo: "integracion", integracion }');
    }
  }
  if (t === 'pantalla-ui' && e.senales !== undefined && (!Array.isArray(e.senales) || !e.senales.every(texto))) mal('ESTRUCTURA', 'senales: lista de textos');
  if (t === 'campo-ui' && e.control !== undefined && !Object.keys(CAPACIDADES_CONTROL).includes(String(e.control))) mal('ESTRUCTURA', `control desconocido ${String(e.control).slice(0, 20)}`);
  if (t === 'campo-ui' && e.dato !== undefined && !esCampoDato(e.dato)) mal('ESTRUCTURA', `dato desconocido ${String(e.dato).slice(0, 30)}: campo del modelo AFI o de persona`);
  if (t === 'campo-ui' && e.obligatorio !== undefined && !['si', 'no'].includes(String(e.obligatorio))) mal('ESTRUCTURA', 'obligatorio: si | no');
  if (t === 'pantalla-ui' && e.etapa !== undefined && !(ETAPAS_AFI as readonly unknown[]).includes(e.etapa)) mal('ESTRUCTURA', `etapa desconocida ${String(e.etapa).slice(0, 30)}`);
  if (t === 'transicion-ui' && e.desde === e.hacia) mal('ESTRUCTURA', 'una transición une dos pantallas distintas');
  // Referencias: pueden faltar (pendientes de enriquecimiento), pero nunca apuntar a algo que no esté registrado
  // o propuesto en el mismo lote.
  for (const ref of REFERENCIAS_POR_TIPO[t]) {
    const v = valorEn(e, ref.campo);
    if (v === undefined) continue;
    const ok = typeof v === 'string'
      && (resolverEntidad(modelo, { tipo: ref.tipo, id: v }).estado === 'registrada' || !!opciones.disponibles?.has(claveEntidad(ref.tipo, v)));
    if (!ok) mal('REFERENCIA_DESCONOCIDA', `${ref.campo} ${String(v).slice(0, 40)} no está registrada ni propuesta como ${ref.tipo}`);
  }
  // Origen y evidencia.
  const o = p.origen;
  if (!esObjeto(o) || !texto(o.fuente)) mal('SIN_FUENTE', 'la propuesta debe citar la fuente que la justifica');
  if (!esObjeto(o) || !Array.isArray(o.ocurrencias) || !o.ocurrencias.length || !o.ocurrencias.every(x => esObjeto(x) && texto(x.hu))) {
    mal('SIN_OCURRENCIAS', 'al menos una ocurrencia con su hu');
  }
  if (esObjeto(o)) {
    for (const k of clavesAjenas(o, FORMA_PROPUESTA.origen)) mal('ESTRUCTURA', `origen.${k.slice(0, 30)} no admitido`);
    if (Array.isArray(o.ocurrencias)) for (const x of o.ocurrencias) if (esObjeto(x)) {
      for (const k of clavesAjenas(x, FORMA_PROPUESTA.ocurrencia)) mal('ESTRUCTURA', `ocurrencia.${k.slice(0, 30)} no admitido`);
      for (const k of FORMA_PROPUESTA.ocurrencia.opcionales) if (x[k] !== undefined && typeof x[k] !== 'string') mal('ESTRUCTURA', `ocurrencia.${k}: texto`);
    }
  }
  if (!texto(p.evidenciaSemantica)) mal('SIN_EVIDENCIA', 'evidencia semántica requerida');
  if (p.alias !== undefined && (!Array.isArray(p.alias) || !p.alias.every(texto))) mal('ESTRUCTURA', 'alias: lista de textos');
  // Estado y revisiones coherentes.
  if (!(ESTADOS_PROPUESTA as readonly unknown[]).includes(p.estado)) mal('ESTADO_INVALIDO', `estado ${String(p.estado).slice(0, 20)}`);
  if (!Array.isArray(p.revisiones)) mal('ESQUEMA', 'revisiones: lista requerida');
  // Contenido prohibido: PII contextual (semántico vs metadatos de fuente) y código/selectores/instrucciones en todo.
  for (const motivo of contenidoProhibido({ e, alias: p.alias, ev: p.evidenciaSemantica }, { o, id: p.proposalId })) mal(motivo, `contenido no permitido (${motivo})`);
  // `completar`: solo añade atributos opcionales AUSENTES a una entidad del almacén (misma descripción). Nunca crea ni pisa.
  if (p.operacion !== undefined) {
    if (p.operacion !== 'completar') { mal('ESTRUCTURA', `operacion desconocida ${String(p.operacion).slice(0, 20)}`); return r; }
    if (!TIPOS_COMPLETABLES.includes(t)) { mal('ESTRUCTURA', `${t} no admite completar`); return r; }
    const declaradas = (t === 'pantalla-ui' ? modelo.uiDeclarada.pantallas : modelo.uiDeclarada.campos) as unknown as readonly Record<string, unknown>[];
    const actual = declaradas.find(x => x.id === e.id);
    if (!actual) { mal('NO_REGISTRADA', `${String(e.id).slice(0, 40)} no está en el almacén como ${t}: completar solo enriquece entidades aprobadas`); return r; }
    if (actual.descripcion !== e.descripcion) mal('SOBRESCRITURA', 'la descripción debe ser idéntica a la aprobada');
    const nuevos = datos.opcionales.filter(k => e[k] !== undefined);
    if (!nuevos.length) mal('ESTRUCTURA', 'completar debe aportar al menos un atributo opcional');
    for (const k of nuevos) if (actual[k] !== undefined) mal('SOBRESCRITURA', `${k} ya está aprobado: completar nunca lo cambia`);
    return r;
  }
  // Nunca sobrescribir en silencio.
  if (typeof e.id === 'string') {
    const reg = resolverEntidad(modelo, { tipo: t, id: e.id });
    if (reg.estado === 'registrada') mal('YA_REGISTRADA', `${e.id} ya está registrada como ${t}`);
    if (reg.estado === 'tipo-incorrecto') mal('CONFLICTO_TIPO', `${e.id} ya existe como ${reg.tipoReal}`);
  }
  return r;
}

// ---------- 8. Entrada desde el agente (modo intake, machine-readable) ----------

/** Salida ADICIONAL del agente en modo intake; no reemplaza su bloque humano KNOWLEDGE_GAP. */
export interface SalidaIntakeConocimiento { knowledgeProposals: unknown[]; classificationRequests?: unknown[] }
export const CLAVES_SALIDA_INTAKE = ['knowledgeProposals', 'classificationRequests'] as const;

export interface RechazoIntake { indice: number; problemas: ProblemaPropuesta[] }

/**
 * El agente solo PROPONE: toda propuesta entra como PENDING_REVIEW sin revisiones; cualquier otra cosa se rechaza.
 * Las referencias se validan contra el modelo + las entidades del MISMO lote; si la propuesta de la que depende otra
 * se rechaza, la dependiente también (DEPENDENCIA_RECHAZADA), hasta un punto fijo.
 */
export function recibirPropuestasDelAgente(salida: SalidaIntakeConocimiento, modelo: ModeloAplicacion): {
  aceptadas: KnowledgeProposal[]; rechazadas: RechazoIntake[];
  solicitudes: SolicitudClasificacion[]; solicitudesRechazadas: RechazoIntake[];
} {
  const entrada = Array.isArray(salida?.knowledgeProposals) ? salida.knowledgeProposals : [];
  const clave = (p: unknown) => (esObjeto(p) && esObjeto(p.entidad) && typeof p.entidad.id === 'string' && (TIPOS_ENTIDAD as readonly unknown[]).includes(p.entidad.tipo)
    ? claveEntidad(p.entidad.tipo as TipoEntidad, p.entidad.id) : undefined);
  const validar = (p: unknown, disponibles: ReadonlySet<string>): ProblemaPropuesta[] => {
    const problemas = validarPropuesta(p, modelo, { disponibles });
    if (esObjeto(p) && (p.estado !== 'PENDING_REVIEW' || (Array.isArray(p.revisiones) && p.revisiones.length))) {
      problemas.push({ motivo: 'ESTADO_INVALIDO', detalle: 'el agente solo propone: estado PENDING_REVIEW y sin revisiones' });
    }
    return problemas;
  };
  // Punto fijo: las referencias solo pueden apoyarse en entidades de propuestas del lote que NO fueron rechazadas.
  const todas = new Set(entrada.map(clave).filter((x): x is string => !!x));
  let disponibles = todas;
  let problemas = entrada.map(p => validar(p, disponibles));
  for (;;) {
    const siguientes = new Set(entrada.flatMap((p, i) => (problemas[i].length ? [] : [clave(p)!])));
    if (siguientes.size === disponibles.size) break;
    disponibles = siguientes;
    problemas = entrada.map(p => validar(p, disponibles));
  }
  const aceptadas: KnowledgeProposal[] = [], rechazadas: RechazoIntake[] = [];
  entrada.forEach((p, indice) => {
    if (!problemas[indice].length) { aceptadas.push(p as unknown as KnowledgeProposal); return; }
    // Una referencia a una hermana del lote que fue rechazada se reporta como tal, no como entidad desconocida.
    const huerfana = esObjeto(p) && esObjeto(p.entidad) && (TIPOS_ENTIDAD as readonly unknown[]).includes(p.entidad.tipo)
      && referenciasDeEntidad(p.entidad as unknown as EntidadPropuesta).some(r => todas.has(claveEntidad(r.tipo, r.id)) && !disponibles.has(claveEntidad(r.tipo, r.id)));
    rechazadas.push({ indice, problemas: problemas[indice].map(x => (huerfana && x.motivo === 'REFERENCIA_DESCONOCIDA'
      ? { motivo: 'DEPENDENCIA_RECHAZADA' as const, detalle: `${x.detalle}: la propuesta de la que depende fue rechazada` } : x)) });
  });
  const solicitudes: SolicitudClasificacion[] = [], solicitudesRechazadas: RechazoIntake[] = [];
  (Array.isArray(salida?.classificationRequests) ? salida.classificationRequests : []).forEach((s, indice) => {
    const p = validarSolicitudClasificacion(s, modelo);
    if (p.length) solicitudesRechazadas.push({ indice, problemas: p });
    else solicitudes.push(s as SolicitudClasificacion);
  });
  return { aceptadas, rechazadas, solicitudes, solicitudesRechazadas };
}

/** Construye la propuesta de UNA entidad a partir de un diagnóstico KNOWLEDGE_GAP (los datos del tipo los aporta quien propone). */
export function propuestaDesdeKnowledgeGap(
  d: DiagnosticoCondicion,
  datos: Omit<EntidadPropuesta, 'tipo' | 'id'> & Partial<Pick<EntidadPropuesta, 'id'>>,
  meta: { proposalId: string; fuente: string; ocurrencia: OcurrenciaPropuesta; evidenciaSemantica: string; alias?: string[] },
): KnowledgeProposal {
  if (d.estado !== 'KNOWLEDGE_GAP') throw new Error(`Solo un KNOWLEDGE_GAP genera propuestas (diagnóstico: ${d.estado}).`);
  return {
    schemaVersion: ESQUEMA_PROPUESTA, proposalId: meta.proposalId,
    entidad: { ...datos, tipo: d.entidad.tipo, id: d.entidad.id } as EntidadPropuesta,
    ...(meta.alias ? { alias: meta.alias } : {}),
    origen: { fuente: meta.fuente, ocurrencias: [meta.ocurrencia] },
    evidenciaSemantica: meta.evidenciaSemantica, estado: 'PENDING_REVIEW', revisiones: [],
  };
}

/**
 * La clasificación humana resuelve a UN tipo de las alternativas y produce una propuesta NORMAL (PENDING_REVIEW).
 * Clasificar NO es aprobar: la propuesta resultante vuelve a revisión.
 */
export function resolverClasificacion(
  s: SolicitudClasificacion,
  tipo: TipoEntidad,
  datos: Omit<EntidadPropuesta, 'tipo' | 'id' | 'descripcion'>,
  proposalId: string,
): KnowledgeProposal {
  if (s.estado !== 'NEEDS_CLASSIFICATION') throw new Error('La solicitud ya no está pendiente de clasificación.');
  if (!s.alternativas.includes(tipo)) throw new Error(`El tipo ${tipo} no es una de las alternativas (${s.alternativas.join(', ')}).`);
  return {
    schemaVersion: ESQUEMA_PROPUESTA, proposalId,
    entidad: { ...datos, tipo, id: s.id, descripcion: s.descripcion } as EntidadPropuesta,
    origen: s.origen, evidenciaSemantica: s.evidenciaSemantica, estado: 'PENDING_REVIEW', revisiones: [],
  };
}

/** Validación fail-closed de una solicitud de clasificación (entrada NO confiable). */
export function validarSolicitudClasificacion(s: unknown, modelo?: ModeloAplicacion): ProblemaPropuesta[] {
  const r: ProblemaPropuesta[] = [];
  const mal = (motivo: MotivoRechazo, detalle: string) => r.push({ motivo, detalle });
  if (!esObjeto(s)) return [{ motivo: 'ESQUEMA', detalle: 'la solicitud debe ser un objeto' }];
  for (const k of clavesAjenas(s, FORMA_SOLICITUD)) mal('ESTRUCTURA', `${k.slice(0, 30)} no pertenece a la solicitud`);
  if (s.schemaVersion !== ESQUEMA_PROPUESTA) mal('ESQUEMA', 'schemaVersion desconocido');
  if (typeof s.solicitudId !== 'string' || !ID_PROPUESTA.test(s.solicitudId)) mal('ESQUEMA', 'solicitudId requerido');
  if (s.estado !== 'NEEDS_CLASSIFICATION') mal('ESTADO_INVALIDO', 'estado NEEDS_CLASSIFICATION');
  const alt = Array.isArray(s.alternativas) ? s.alternativas : [];
  if (alt.length < 2 || new Set(alt).size !== alt.length) mal('ESTRUCTURA', 'al menos dos alternativas distintas');
  for (const t of alt) if (!(TIPOS_ENTIDAD as readonly unknown[]).includes(t)) mal('TIPO_DESCONOCIDO', `tipo desconocido ${String(t).slice(0, 30)}`);
  if (typeof s.id !== 'string' || !ID_SEMANTICO.test(s.id)) mal('ID_INVALIDO', 'id semántico inválido');
  if (!texto(s.descripcion)) mal('ESTRUCTURA', 'descripcion requerida');
  const o = s.origen;
  if (!esObjeto(o) || !texto(o.fuente)) mal('SIN_FUENTE', 'fuente requerida');
  if (!esObjeto(o) || !Array.isArray(o.ocurrencias) || !o.ocurrencias.length || !o.ocurrencias.every(x => esObjeto(x) && texto(x.hu))) mal('SIN_OCURRENCIAS', 'al menos una ocurrencia con su hu');
  if (!texto(s.evidenciaSemantica)) mal('SIN_EVIDENCIA', 'evidencia semántica requerida');
  for (const motivo of contenidoProhibido({ id: s.id, d: s.descripcion, ev: s.evidenciaSemantica }, { o, id: s.solicitudId })) mal(motivo, `contenido no permitido (${motivo})`);
  // Un id ya registrado no es un KNOWLEDGE_GAP, con ningún tipo ('no-registrada' solo si no existe como ninguno).
  if (modelo && typeof s.id === 'string' && resolverEntidad(modelo, { tipo: 'actividad', id: s.id }).estado !== 'no-registrada') mal('YA_REGISTRADA', `${s.id} ya existe en el modelo`);
  return r;
}

// ---------- 4. Normalización y deduplicación ----------

const PREFIJOS = new Set(['ruta', 'camino', 'actividad', 'pantalla', 'variable', 'integracion', 'notificacion', 'campo', 'de', 'del', 'la', 'el']);

/** Clave determinista: minúsculas, sin tildes, sin palabras de tipo. "camino Continua", "ruta-continua" -> "continua". */
export function claveNormalizada(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    .split(/[^a-z0-9]+/).filter(p => p && !PREFIJOS.has(p)).join('-');
}

export const canonico = (v: unknown): string => JSON.stringify(v, (_k, x) => (esObjeto(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x));

export interface PosibleDuplicado { propuestas: [string, string]; motivo: 'nombre-similar' | 'datos-distintos' | 'tipo-distinto' }

/**
 * Fusiona SOLO lo inequívoco: mismo tipo + mismo id + mismos datos declarativos (se unen ocurrencias y alias).
 * Nombres similares, mismo id con datos distintos o misma clave con otro tipo -> POSSIBLE_DUPLICATE para decisión humana.
 */
export function deduplicarPropuestas(propuestas: readonly KnowledgeProposal[]): { unicas: KnowledgeProposal[]; posiblesDuplicados: PosibleDuplicado[] } {
  const unicas: KnowledgeProposal[] = [];
  const posiblesDuplicados: PosibleDuplicado[] = [];
  for (const p of propuestas) {
    const igual = unicas.find(u => u.entidad.tipo === p.entidad.tipo && u.entidad.id === p.entidad.id && canonico(u.entidad) === canonico(p.entidad));
    if (igual) {
      const clave = (o: OcurrenciaPropuesta) => canonico(o);
      const vistas = new Set(igual.origen.ocurrencias.map(clave));
      igual.origen = { ...igual.origen, ocurrencias: [...igual.origen.ocurrencias, ...p.origen.ocurrencias.filter(o => !vistas.has(clave(o)))] };
      const alias = [...new Set([...(igual.alias ?? []), ...(p.alias ?? [])])];
      if (alias.length) igual.alias = alias;
      continue;
    }
    const claves = (x: KnowledgeProposal) => new Set([x.entidad.id, ...(x.alias ?? [])].map(claveNormalizada));
    for (const u of unicas) {
      const comparten = [...claves(p)].some(k => claves(u).has(k));
      if (u.entidad.id === p.entidad.id && u.entidad.tipo === p.entidad.tipo) posiblesDuplicados.push({ propuestas: [u.proposalId, p.proposalId], motivo: 'datos-distintos' });
      else if (comparten && u.entidad.tipo !== p.entidad.tipo) posiblesDuplicados.push({ propuestas: [u.proposalId, p.proposalId], motivo: 'tipo-distinto' });
      else if (comparten) posiblesDuplicados.push({ propuestas: [u.proposalId, p.proposalId], motivo: 'nombre-similar' });
    }
    unicas.push({ ...p, origen: { ...p.origen, ocurrencias: [...p.origen.ocurrencias] }, ...(p.alias ? { alias: [...p.alias] } : {}) });
  }
  return { unicas, posiblesDuplicados };
}

// ---------- 5. Revisión humana ----------

/** Identidad del contenido de la propuesta (lo que se aprueba). */
export function hashPropuesta(p: KnowledgeProposal): string {
  return createHash('sha256').update(canonico({ entidad: p.entidad, fuente: p.origen.fuente, evidencia: p.evidenciaSemantica, ...(p.operacion ? { operacion: p.operacion } : {}) })).digest('hex');
}

export class PropuestaError extends Error {
  constructor(detalle: string, readonly problemas: readonly ProblemaPropuesta[] = []) {
    super(`Propuesta de conocimiento: ${detalle}${problemas.length ? `\n${problemas.map(p => `- ${p.motivo}: ${p.detalle}`).join('\n')}` : ''}`);
    this.name = 'PropuestaError';
  }
}

export function revisarPropuesta(
  p: KnowledgeProposal,
  decision: RevisionPropuesta['decision'],
  revision: { revisor: string; fecha: string; comentario?: string },
  modelo: ModeloAplicacion,
  opciones: OpcionesValidacion = {},
): KnowledgeProposal {
  if (p.estado !== 'PENDING_REVIEW') throw new PropuestaError(`solo se revisa una propuesta PENDING_REVIEW (está ${p.estado})`);
  if (!texto(revision.revisor) || !/^\d{4}-\d{2}-\d{2}$/.test(revision.fecha)) throw new PropuestaError('revisor y fecha AAAA-MM-DD requeridos');
  if (decision === 'APPROVED') {
    const problemas = validarPropuesta(p, modelo, opciones);
    if (problemas.length) throw new PropuestaError('no se aprueba una propuesta inválida', problemas);
  }
  return {
    ...p, estado: decision,
    revisiones: [...p.revisiones, { decision, revisor: revision.revisor, fecha: revision.fecha, version: p.revisiones.length + 1, hash: hashPropuesta(p), ...(revision.comentario ? { comentario: revision.comentario } : {}) }],
  };
}

/** Una propuesta NEEDS_CHANGES corregida vuelve a PENDING_REVIEW (y a validación). */
export function corregirPropuesta(p: KnowledgeProposal, cambios: Partial<Pick<KnowledgeProposal, 'entidad' | 'evidenciaSemantica' | 'alias'>>, modelo: ModeloAplicacion): KnowledgeProposal {
  if (p.estado !== 'NEEDS_CHANGES') throw new PropuestaError(`solo se corrige una propuesta NEEDS_CHANGES (está ${p.estado})`);
  const nueva: KnowledgeProposal = { ...p, ...cambios, estado: 'PENDING_REVIEW' };
  const problemas = validarPropuesta(nueva, modelo);
  if (problemas.length) throw new PropuestaError('la corrección sigue siendo inválida', problemas);
  return nueva;
}

// ---------- 6. Aplicación declarativa ----------

const COLECCION: Readonly<Record<TipoEntidad, keyof AlmacenModeloAplicacion['entidades']>> = {
  'pantalla-ui': 'pantallas', 'campo-ui': 'campos', 'transicion-ui': 'transiciones', actividad: 'actividades', ruta: 'rutas',
  integracion: 'integraciones', variable: 'variables', notificacion: 'notificaciones',
};

/**
 * Orden topológico genérico (Kahn, estable respecto al orden de entrada). `dependeDe(n)` devuelve claves de otros nodos
 * del conjunto; lo que no pertenece al conjunto se ignora (se resuelve contra el modelo base). Ciclo -> error.
 */
export function ordenarPorDependencias<T>(nodos: readonly T[], clave: (n: T) => string, dependeDe: (n: T) => readonly string[]): T[] {
  const porClave = new Map(nodos.map(n => [clave(n), n]));
  const pendientes = new Map(nodos.map(n => [clave(n), new Set(dependeDe(n).filter(d => porClave.has(d) && d !== clave(n)))]));
  for (const n of nodos) if (dependeDe(n).includes(clave(n))) throw new PropuestaError(`dependencia imposible: ${clave(n)} depende de sí misma`);
  const orden: T[] = [];
  while (pendientes.size) {
    const listos = [...pendientes].filter(([, d]) => !d.size).map(([k]) => k);
    if (!listos.length) throw new PropuestaError(`ciclo de dependencias entre ${[...pendientes.keys()].join(', ')}`);
    for (const k of listos) {
      orden.push(porClave.get(k)!);
      pendientes.delete(k);
      for (const d of pendientes.values()) d.delete(k);
    }
  }
  return orden;
}

/**
 * Incorpora SOLO propuestas APPROVED (cuyo contenido no cambió desde la aprobación) a una nueva revisión del almacén.
 * Conserva las entidades existentes, rechaza conflictos (todo el lote falla: nunca parcial), no crea proveedores
 * y no toca runtime. Devuelve el almacén nuevo y el modelo reconstruido.
 * 4O: dependencias dentro del lote (ruta -> actividades, campo -> pantalla, variable -> integración) se aplican en orden
 * topológico; depender de una propuesta del lote NO aprobada falla; `lote` queda en el historial.
 */
export function aplicarPropuestasAprobadas(almacen: AlmacenModeloAplicacion, propuestas: readonly KnowledgeProposal[], fecha: string, opciones: { lote?: string } = {}) {
  const ignoradas = propuestas.filter(p => p.estado !== 'APPROVED').map(p => ({ proposalId: p.proposalId, estado: p.estado }));
  const noAprobadas = new Set(propuestas.filter(p => p.estado !== 'APPROVED').map(p => claveEntidad(p.entidad.tipo, p.entidad.id)));
  // Un `completar` y la creación de la misma entidad nunca comparten clave (el completar depende de que exista).
  const clave = (p: KnowledgeProposal) => `${p.operacion ?? 'crear'}|${claveEntidad(p.entidad.tipo, p.entidad.id)}`;
  const depende = (p: KnowledgeProposal) => [
    ...referenciasDeEntidad(p.entidad).map(r => `crear|${claveEntidad(r.tipo, r.id)}`),
    ...(p.operacion === 'completar' ? [`crear|${claveEntidad(p.entidad.tipo, p.entidad.id)}`] : []),
  ];
  let modelo = construirModeloAplicacion(extensionDesdeAlmacen(almacen));
  const aprobadasEntrada = propuestas.filter(p => p.estado === 'APPROVED');
  for (const p of aprobadasEntrada) for (const dd of depende(p)) {
    const d = dd.slice(dd.indexOf('|') + 1);
    const [tipo, id] = [d.slice(0, d.indexOf(':')) as TipoEntidad, d.slice(d.indexOf(':') + 1)];
    if (noAprobadas.has(d) && resolverEntidad(modelo, { tipo, id }).estado !== 'registrada') {
      throw new PropuestaError(`${p.proposalId}: depende de ${id}, propuesta en el lote pero no aprobada`);
    }
  }
  const claves = aprobadasEntrada.map(clave);
  if (new Set(claves).size !== claves.length) throw new PropuestaError('dos propuestas aprobadas declaran la misma entidad');
  const aprobadas = ordenarPorDependencias(aprobadasEntrada, clave, depende);
  const revision = almacen.revision + 1;
  const nuevo: AlmacenModeloAplicacion = {
    ...almacen,
    entidades: Object.fromEntries(Object.entries(almacen.entidades).map(([k, v]) => [k, [...v]])) as AlmacenModeloAplicacion['entidades'],
    historial: [...almacen.historial],
  };
  for (const p of aprobadas) {
    const ultima = p.revisiones.at(-1);
    if (ultima?.decision !== 'APPROVED') throw new PropuestaError(`${p.proposalId}: APPROVED sin revisión de aprobación`);
    if (ultima.hash !== hashPropuesta(p)) throw new PropuestaError(`${p.proposalId}: el contenido cambió después de aprobarse`);
    // Revalidación contra el modelo ya ampliado por las anteriores del lote (conflictos entre propuestas incluidos).
    const problemas = validarPropuesta(p, modelo);
    if (problemas.length) throw new PropuestaError(`${p.proposalId}: conflicto al aplicar`, problemas);
    const { tipo, ...datos } = p.entidad;
    const coleccion = (nuevo.entidades[COLECCION[tipo]] ??= []) as unknown as Record<string, unknown>[];
    if (p.operacion === 'completar') {
      const i = coleccion.findIndex(x => x.id === datos.id);
      coleccion[i] = { ...coleccion[i], ...datos };
    } else coleccion.push(datos);
    nuevo.historial.push({
      revision, fecha, entidad: p.entidad.id, tipo, propuesta: p.proposalId, hash: ultima.hash, revisor: ultima.revisor,
      ...(opciones.lote ? { lote: opciones.lote } : {}),
    });
    modelo = construirModeloAplicacion(extensionDesdeAlmacen({ ...nuevo, revision }));
  }
  const final = aprobadas.length ? { ...nuevo, revision } : almacen;
  return {
    almacen: final, modelo, aplicadas: aprobadas.map(p => p.proposalId), ignoradas,
    /** Registrar entidades es conocimiento declarativo: nunca runtime ni proveedores. */
    cambio: { declarativo: aprobadas.length > 0, runtime: aprobadas.some(p => clasificarIncorporacion({ tipo: 'entidad', entidad: p.entidad.tipo }) === 'runtime') },
  };
}

// ---------- 14. Métricas de intake ----------

/** Pasadas de diagnóstico hasta que una condición deja KNOWLEDGE_GAP (1-based); undefined si no avanzó. */
export function generacionesHastaSiguienteCapa(estados: readonly DiagnosticoCondicion['estado'][]): number | undefined {
  const i = estados.findIndex((e, k) => k > 0 && estados[k - 1] === 'KNOWLEDGE_GAP' && e !== 'KNOWLEDGE_GAP');
  return i < 0 ? undefined : i + 1;
}

export function medirIntake(e: {
  knowledgeGapsDetectados: number;
  propuestasGeneradas: readonly KnowledgeProposal[];
  dedup: { unicas: readonly KnowledgeProposal[]; posiblesDuplicados: readonly PosibleDuplicado[] };
  almacenAntes: AlmacenModeloAplicacion;
  almacenDespues: AlmacenModeloAplicacion;
  pasadas?: readonly DiagnosticoCondicion['estado'][];
}) {
  const n = (estado: EstadoPropuesta) => e.dedup.unicas.filter(p => p.estado === estado).length;
  const contar = (a: AlmacenModeloAplicacion) => Object.values(a.entidades).reduce((s, v) => s + v.length, 0);
  const generaciones = e.pasadas ? generacionesHastaSiguienteCapa(e.pasadas) : undefined;
  return {
    knowledgeGapsDetectados: e.knowledgeGapsDetectados,
    propuestasGeneradas: e.propuestasGeneradas.length,
    propuestasUnicas: e.dedup.unicas.length,
    aprobadas: n('APPROVED'),
    rechazadas: n('REJECTED'),
    pendientes: n('PENDING_REVIEW') + n('NEEDS_CHANGES'),
    posiblesDuplicados: e.dedup.posiblesDuplicados.length,
    entidadesAnadidas: contar(e.almacenDespues) - contar(e.almacenAntes),
    cambiosRuntime: 0,
    ...(generaciones !== undefined ? { generacionesHastaSiguienteCapa: generaciones } : {}),
  };
}

// ---------- 4O. Contrato de intake publicado al agente (derivado de las constantes de este módulo) ----------

/** Sección `knowledgeIntake` del manifest: el agente la usa para emitir su bloque machine-readable. */
export function publicarContratoIntake() {
  return {
    schemaVersion: ESQUEMA_PROPUESTA,
    enabled: true,
    salida: {
      claves: [...CLAVES_SALIDA_INTAKE],
      formato: 'Listas knowledgeProposals y classificationRequests del envelope ÚNICO de intake (ver agentIntake), ADICIONAL a los bloques humanos KNOWLEDGE_GAP.',
    },
    entityTypes: TIPOS_ENTIDAD.map(tipo => ({
      tipo,
      descripcion: DESCRIPCION_ENTIDAD[tipo],
      requeridos: [...DATOS_POR_TIPO[tipo].requeridos],
      opcionales: [...DATOS_POR_TIPO[tipo].opcionales],
      referencias: REFERENCIAS_POR_TIPO[tipo].map(r => ({ ...r })),
      ...(tipo === 'variable' ? { superficiesPermitidas: superficiesDeEntidad('variable'), ambito: ['{ "tipo": "proceso" }', '{ "tipo": "integracion", "integracion": "<id>" }'] } : {}),
      ...(tipo === 'campo-ui' ? { controlesPermitidos: Object.keys(CAPACIDADES_CONTROL), obligatorio: ['si', 'no'], dato: 'campo del modelo AFI o de persona (testData.campos / camposPedibles)' } : {}),
      ...(tipo === 'pantalla-ui' ? { etapasPermitidas: [...ETAPAS_AFI], titulo: 'encabezado visible que reconoce la pantalla', consulta: 'texto del botón que consulta a la persona' } : {}),
      ...(tipo === 'transicion-ui' ? { avance: 'texto visible del botón que lleva de desde a hacia', condicion: 'condición de negocio (texto) bajo la que existe' } : {}),
    })),
    proposalShape: {
      requeridos: [...FORMA_PROPUESTA.requeridos],
      opcionales: [...FORMA_PROPUESTA.opcionales],
      valoresFijos: { schemaVersion: ESQUEMA_PROPUESTA, estado: 'PENDING_REVIEW', revisiones: [] as never[] },
      proposalId: 'Único en la salida; letras, dígitos, punto, guion o guion bajo (máx. 80).',
      entidad: 'Un objeto con "tipo" (exactamente uno de entityTypes) y SOLO los requeridos/opcionales de ese tipo. id semántico: kebab-case o camelCase.',
      origen: { requeridos: [...FORMA_PROPUESTA.origen.requeridos], ocurrencia: { requeridos: [...FORMA_PROPUESTA.ocurrencia.requeridos], opcionales: [...FORMA_PROPUESTA.ocurrencia.opcionales] } },
      evidenciaSemantica: 'Por qué las fuentes muestran que la entidad existe (texto público, sin PII).',
      alias: 'Nombres con los que aparece en las fuentes (opcional; ayuda a detectar duplicados).',
      operacion: `Opcional: "completar" añade atributos opcionales AUSENTES a una entidad YA aprobada (${TIPOS_COMPLETABLES.join(', ')}), con su id y descripción idénticos. Sin operacion: crear.`,
    },
    classificationRequestShape: {
      requeridos: [...FORMA_SOLICITUD.requeridos],
      valoresFijos: { schemaVersion: ESQUEMA_PROPUESTA, estado: 'NEEDS_CLASSIFICATION' },
      alternativas: 'Dos o más tipos distintos de entityTypes entre los que un humano elegirá UNO.',
    },
    rules: [
      'Solo para una condición cuyo diagnóstico FINAL es KNOWLEDGE_GAP. Nunca para INFORMACION_INSUFICIENTE, TESTABILITY_GAP, CAPABILITY_GAP ni una condición representable.',
      'Una propuesta = UNA entidad con exactamente UN tipo de entityTypes. Nunca tipos compuestos, listas de tipos ni varias entidades.',
      'Si una frase del caso contiene dos entidades, emite dos propuestas atómicas.',
      'Si no puedes decidir el tipo, emite una classificationRequest (no una propuesta).',
      'estado siempre PENDING_REVIEW y revisiones siempre []. Nunca autoapruebes ni escribas el modelo: revisar y aplicar es humano.',
      'Reglas, predicados, expectativas y valores esperados NO son entidades: la entidad dice QUÉ existe, no qué valor debe tener.',
      'origen.fuente, al menos una ocurrencia con hu y evidenciaSemantica son obligatorias.',
      'Una referencia (desde/hacia, pantalla, ambito.integracion) solo apunta a una entidad de testabilidad.modelo o propuesta en la MISMA salida; si no se conoce, omítela.',
      'Una entidad ya registrada no se propone: no es un KNOWLEDGE_GAP. Para aportarle un atributo opcional ausente, usa operacion "completar".',
      'Sin PII, selectores, código, URLs, comandos ni proveedores en ningún campo.',
      'Aprobar una pantalla o campo UI la vuelve CONOCIDA, no operable ni reconocible: no inventes señales técnicas ni controles.',
    ],
  };
}
