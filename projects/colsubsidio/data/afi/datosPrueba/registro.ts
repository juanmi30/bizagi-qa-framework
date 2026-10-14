import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import registroPersistido from '../../../knowledge/test-data-registry.json';
import { actorDesdeEntorno, VARIABLES_ACTOR } from '../actores';
import { CAMPOS_AFI, type ActorAfi, type CampoAfi, type PerfilActorAfi, type ValorCampo } from '../modelo';
import { POLITICAS_AFI } from '../politicas';
import { piiEnMetadato } from '../aplicacion/sensibilidad';
import {
  SUJETO_PRINCIPAL,
  CAMPOS_ACTOR_BASE, CAMPOS_AUTO_RESOLUBLES, CAMPOS_COMPARTIBLES, CAMPOS_CONDICIONABLES, CAMPOS_IDENTIDAD_ACTOR, CAMPOS_PEDIBLES,
  DatosPruebaError, ESQUEMA_REGISTRO_DATOS, ESQUEMA_REQUISITO_DATOS, ESTADOS_SLOT, ETIQUETAS_CAMPO, FORMA_REQUISITO, ID_REQUISITO, PREFIJO_SECRET_ACTOR,
  esCampoPersona, etiquetaDato, evaluarCondicionCampo, type CampoDato, type CampoPersona,
  PREFIJO_SECRET_SHARED, RESOLUCIONES_DATOS, SEMANTICA_RESOLUCION, clasificarCampo, clavesDeValor, colisionesSecretRef, relacionActores, secretRefActor,
  idDatosValido, secretRefShared, secretRefsDeSlot, sensibilidadCampo, validarCompartido, validarRequisito, validarSlot,
  type ActorSlot, type CampoSlot, type CompartidoDeclarado, type CondicionActor, type OcurrenciaDatos, type ProblemaDatos, type TestDataRequirement,
} from './contrato';

/**
 * TEST DATA REGISTRY (Fase 4P): almacén declarativo versionado SEPARADO del Application Model
 * (knowledge/test-data-registry.json). Guarda SOLO actor slots (perfil, condiciones, campos y su política de fuente),
 * secretos compartidos DECLARADOS y auditoría. Nunca valores, nunca nombres de variables, nunca copia del .env.
 *
 * Resolución por capas de un campo de un actor con actorRef (fail-closed):
 *   1. secreto específico del slot (AFI_ACTOR_<SLOT>_<CAMPO>)
 *   2. secreto compartido declarado (AFI_SHARED_<REF>) o actor base del MISMO perfil, solo si el slot lo permite
 *   3. derived  -> 4. auxiliary   (el resolver vigente, sin cambios)   -> 5. DataGap
 * Sin coincidencias aproximadas, sin datos de otro perfil, sin reutilizar un secreto específico sin política explícita.
 */

export const ACCIONES_HISTORIAL_DATOS = ['alta', 'reutilizacion', 'correccion', 'provision'] as const;
export interface EntradaHistorialDatos {
  revision: number; fecha: string; slot: string; accion: typeof ACCIONES_HISTORIAL_DATOS[number]; propuesta: string; hash: string; revisor: string; requisitos: string[];
  /** Lote de revisión de datos (4Q) que produjo la entrada: permite reconocer una reaplicación (YA_APLICADO). */
  lote?: string;
}
export const ID_LOTE_DATOS = /^kd-[0-9a-f]{16}$/;
export interface RegistroDatosPrueba {
  schemaVersion: typeof ESQUEMA_REGISTRO_DATOS;
  revision: number;
  slots: ActorSlot[];
  compartidos: CompartidoDeclarado[];
  historial: EntradaHistorialDatos[];
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const REVISOR = /^[a-z][a-z0-9-]{1,39}$/;
const NOMBRE_ENV = /\bAFI_[A-Z0-9_]{2,}|process\.env/;

/** Referencias de secreto (nombre -> origen) que produce el registro: base para detectar colisiones. */
function referenciasRegistro(r: RegistroDatosPrueba): { refs: { secretRef: string; origen: string }[]; problemas: ProblemaDatos[] } {
  const refs: { secretRef: string; origen: string }[] = [];
  const problemas: ProblemaDatos[] = [];
  const intentar = (f: () => string, origen: string) => {
    try { refs.push({ secretRef: f(), origen }); } catch (e) { problemas.push(...(e instanceof DatosPruebaError ? e.problemas : [{ motivo: 'ID_INVALIDO' as const, detalle: origen }])); }
  };
  for (const s of r.slots) for (const c of s.campos) if (c.fuente === 'slot') intentar(() => secretRefActor(s.id, c.campo), `${s.id}.${c.campo}`);
  for (const c of r.compartidos) intentar(() => secretRefShared(c.id), `compartido ${c.id}`);
  return { refs, problemas };
}

/** Validación completa del registro (fail-closed). */
export function validarRegistroDatosPrueba(r: unknown): RegistroDatosPrueba {
  const p: ProblemaDatos[] = [];
  const fallar = () => { throw new DatosPruebaError('REGISTRO_INVALIDO', p); };
  if (!esObjeto(r)) { p.push({ motivo: 'ESQUEMA', detalle: 'el registro debe ser un objeto' }); fallar(); }
  const x = r as Record<string, unknown>;
  for (const k of Object.keys(x)) if (!['schemaVersion', 'revision', 'slots', 'compartidos', 'historial'].includes(k)) p.push({ motivo: 'ESQUEMA', detalle: `${k.slice(0, 30)} no admitido` });
  if (x.schemaVersion !== ESQUEMA_REGISTRO_DATOS) p.push({ motivo: 'ESQUEMA', detalle: 'schemaVersion desconocido' });
  if (!Number.isInteger(x.revision) || (x.revision as number) < 1) p.push({ motivo: 'ESQUEMA', detalle: 'revision: entero >= 1' });
  for (const k of ['slots', 'compartidos', 'historial']) if (!Array.isArray(x[k])) p.push({ motivo: 'ESQUEMA', detalle: `${k}: lista requerida` });
  if (p.length) fallar();
  // Nunca valores ni nombres de variables (ni siquiera nombres: los deriva el framework).
  for (const k of clavesDeValor(x)) p.push({ motivo: 'VALOR_EN_REGISTRO', detalle: `${k.slice(0, 40)}: el registro nunca guarda valores` });
  if (NOMBRE_ENV.test(JSON.stringify(x))) p.push({ motivo: 'VALOR_EN_REGISTRO', detalle: 'el registro no guarda nombres de variables: se derivan' });
  const reg = x as unknown as RegistroDatosPrueba;
  const ids = new Set<string>();
  reg.slots.forEach((s, i) => {
    p.push(...validarSlot(s, `slots[${i}]`));
    if (ids.has(s?.id)) p.push({ motivo: 'DUPLICADO', detalle: `slot ${s.id} repetido` });
    ids.add(s?.id);
  });
  const compartidos = new Map<string, CompartidoDeclarado>();
  reg.compartidos.forEach((c, i) => {
    p.push(...validarCompartido(c, `compartidos[${i}]`));
    if (compartidos.has(c?.id)) p.push({ motivo: 'DUPLICADO', detalle: `compartido ${c.id} repetido` });
    compartidos.set(c?.id, c);
  });
  if (p.length) fallar();
  for (const s of reg.slots) for (const c of s.campos) if (c.fuente === 'shared') {
    const d = compartidos.get(c.sharedRef!);
    if (!d) p.push({ motivo: 'REFERENCIA', detalle: `${s.id}.${c.campo}: compartido ${c.sharedRef} no declarado` });
    else if (d.campo !== c.campo) p.push({ motivo: 'REFERENCIA', detalle: `${s.id}.${c.campo}: el compartido ${c.sharedRef} es de ${d.campo}` });
  }
  const { refs, problemas } = referenciasRegistro(reg);
  p.push(...problemas, ...colisionesSecretRef(refs));
  reg.historial.forEach((h, i) => {
    const r2 = `historial[${i}]`;
    if (!esObjeto(h)) { p.push({ motivo: 'HISTORIAL', detalle: `${r2}: objeto` }); return; }
    for (const k of Object.keys(h)) if (!['revision', 'fecha', 'slot', 'accion', 'propuesta', 'hash', 'revisor', 'requisitos', 'lote'].includes(k)) p.push({ motivo: 'HISTORIAL', detalle: `${r2}.${k.slice(0, 30)} no admitido` });
    if (h.lote !== undefined && (typeof h.lote !== 'string' || !ID_LOTE_DATOS.test(h.lote))) p.push({ motivo: 'HISTORIAL', detalle: `${r2}.lote` });
    if (!Number.isInteger(h.revision) || h.revision < 2 || h.revision > reg.revision) p.push({ motivo: 'HISTORIAL', detalle: `${r2}.revision fuera de rango` });
    if (typeof h.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(h.fecha)) p.push({ motivo: 'HISTORIAL', detalle: `${r2}.fecha AAAA-MM-DD` });
    if (!ids.has(h.slot)) p.push({ motivo: 'HISTORIAL', detalle: `${r2}.slot desconocido` });
    if (!(ACCIONES_HISTORIAL_DATOS as readonly string[]).includes(h.accion)) p.push({ motivo: 'HISTORIAL', detalle: `${r2}.accion` });
    if (typeof h.hash !== 'string' || !/^[0-9a-f]{64}$/.test(h.hash)) p.push({ motivo: 'HISTORIAL', detalle: `${r2}.hash` });
    if (typeof h.revisor !== 'string' || !REVISOR.test(h.revisor)) p.push({ motivo: 'HISTORIAL', detalle: `${r2}.revisor: rol o alias` });
    if (typeof h.propuesta !== 'string' || !ID_REQUISITO.test(h.propuesta)) p.push({ motivo: 'HISTORIAL', detalle: `${r2}.propuesta` });
    if (!Array.isArray(h.requisitos) || !h.requisitos.every(q => typeof q === 'string' && ID_REQUISITO.test(q))) p.push({ motivo: 'HISTORIAL', detalle: `${r2}.requisitos` });
  });
  if (piiEnMetadato(JSON.stringify(reg.historial.map(({ hash: _h, lote: _l, ...resto }) => resto)))) p.push({ motivo: 'PII', detalle: 'posible PII en el historial' });
  if (p.length) fallar();
  return reg;
}

/** Registro aprobado del proyecto. */
export const REGISTRO_DATOS_PRUEBA_AFI: RegistroDatosPrueba = validarRegistroDatosPrueba(registroPersistido as unknown);

// ---------- 10. Estados ----------

export const ESTADOS_DATOS = ['READY', 'MISSING_SECRET', 'NEEDS_PROVISIONING', 'NEEDS_REVIEW'] as const;
export type EstadoDatos = typeof ESTADOS_DATOS[number];
export const SIGNIFICADO_ESTADO_DATOS: Readonly<Record<EstadoDatos, string>> = {
  READY: 'Todos los datos del actor son resolvibles: el caso puede ejecutarse.',
  MISSING_SECRET: 'El actor lógico está definido y provisionado, pero falta configurar uno o más valores en el entorno (.env).',
  NEEDS_PROVISIONING: 'La condición del actor está definida, pero QA todavía debe conseguir/identificar un actor que la cumpla. No es un bug técnico.',
  NEEDS_REVIEW: 'Ambigüedad de actor, campo o reutilización: requiere una decisión humana en el Test Data Registry.',
};

export type MotivoRevisionDatos =
  | 'actor-no-registrado' | 'perfil-distinto' | 'sin-actor-aprobado' | 'posible-duplicado' | 'campos-no-cubiertos' | 'reutilizacion-no-permitida' | 'requisito-invalido'
  /** 4S: un participante usado como actor principal (o al revés). */
  | 'sujeto-distinto';

/** Diagnóstico máquina SIN valores: puede incluir NOMBRES de variables, nunca su contenido. */
export interface DiagnosticoDatosPrueba {
  actorRef: string | null;
  status: EstadoDatos;
  requisito?: string;
  /** Ausente solo en un participante sin perfil (4S). */
  perfil?: PerfilActorAfi;
  /** 4S: sujeto secundario del caso. */
  sujeto?: 'participante';
  /** 4S: rol con el que un CASO usa al participante (solo en el diagnóstico de un caso). */
  rol?: string;
  condiciones: CondicionActor[];
  missingFields: CampoDato[];
  /** Variables que el actor usa (solo nombres). */
  secretRefs: string[];
  /** Variables a configurar para los campos faltantes (solo nombres). */
  missingSecretRefs: string[];
  occurrences: OcurrenciaDatos[];
  motivos: { motivo: MotivoRevisionDatos; detalle: string }[];
  /**
   * 4Q: el registro dice pendiente-provisionar pero todos los secretos ya están PRESENTES. Sigue siendo NEEDS_PROVISIONING
   * (nunca se promueve solo): falta que un humano confirme que el actor cumple las condiciones de negocio.
   */
  confirmacionPendiente?: true;
}

type Entorno = Readonly<Record<string, string | undefined>>;

/** Valor de un campo del slot por capas 1-2 (PRIVADO: nunca sale de este módulo salvo dentro del ActorAfi). */
function valorCampoSlot(slot: ActorSlot, c: CampoSlot, entorno: Entorno): ValorCampo | undefined {
  if (c.fuente === 'shared') return entorno[secretRefShared(c.sharedRef!)]?.trim() || undefined;
  // 4S: un participante no tiene actor base (validarSlot lo impide); fail-closed si apareciera.
  const base = () => (slot.perfil && slot.sujeto !== 'participante' && !esCampoPersona(c.campo) ? actorDesdeEntorno(slot.perfil, entorno).datos[c.campo] : undefined);
  if (c.fuente === 'base') return base();
  const especifico = entorno[secretRefActor(slot.id, c.campo)]?.trim();
  if (especifico) return especifico;
  return c.fallbackBase ? base() : undefined;
}

const unicas = (o: readonly OcurrenciaDatos[]) => [...new Map(o.map(x => [JSON.stringify([x.hu, x.caso ?? '', x.paso ?? '']), x])).values()];

/** Nombre a configurar para un campo (capa principal; base: la variable vigente del perfil). */
function refPrincipal(slot: ActorSlot, c: CampoSlot): string | undefined {
  if (c.fuente === 'shared') return secretRefShared(c.sharedRef!);
  if (c.fuente === 'base') return slot.perfil && !esCampoPersona(c.campo) ? VARIABLES_ACTOR[slot.perfil][c.campo] : undefined;
  return secretRefActor(slot.id, c.campo);
}

/** Estado de un slot contra el entorno: solo PRESENCIA, nunca contenido. */
export function diagnosticarSlot(slot: ActorSlot, entorno: Entorno, extra: readonly OcurrenciaDatos[] = []): DiagnosticoDatosPrueba {
  const secretRefs = secretRefsDeSlot(slot).filter(r => r.capa !== 'base' || r.secretRef.startsWith('AFI_')).map(r => r.secretRef);
  // (§7) Un campo condicional solo se exige si su condición APLICA (evaluada en memoria con el valor del campo referido).
  // Si el campo referido aún no tiene valor, ese campo ya falta y la condición no se puede decidir: no se exige dos veces.
  const aplica = (c: CampoSlot) => {
    if (!c.cuando) return true;
    const ref = slot.campos.find(x => x.campo === c.cuando!.campo && !x.cuando);
    const v = ref ? valorCampoSlot(slot, ref, entorno) : undefined;
    return evaluarCondicionCampo(c.cuando, typeof v === 'string' ? v : v === undefined ? undefined : String(v)) === true;
  };
  const faltan = slot.campos.filter(c => aplica(c) && valorCampoSlot(slot, c, entorno) === undefined);
  const pendiente = slot.estado === 'pendiente-provisionar';
  // Sin provisionar: lo que habrá que configurar cuando QA consiga el actor (sus secretos específicos) + lo que ya falta.
  const campos = pendiente ? slot.campos.filter(c => (c.fuente === 'slot' && (!c.cuando || aplica(c))) || faltan.includes(c)) : faltan;
  return {
    actorRef: slot.id,
    status: pendiente ? 'NEEDS_PROVISIONING' : faltan.length ? 'MISSING_SECRET' : 'READY',
    ...(slot.perfil ? { perfil: slot.perfil } : {}),
    ...(slot.sujeto ? { sujeto: slot.sujeto } : {}),
    condiciones: slot.condiciones.map(c => ({ ...c })),
    missingFields: campos.map(c => c.campo),
    secretRefs,
    // Alineado con missingFields (mismo índice).
    missingSecretRefs: campos.map(c => refPrincipal(slot, c) ?? '(metadato público del perfil)'),
    occurrences: unicas([...slot.origen.ocurrencias, ...extra]),
    motivos: [],
    ...(pendiente && !faltan.length ? { confirmacionPendiente: true as const } : {}),
  };
}

const revision = (actorRef: string | null, perfil: PerfilActorAfi | undefined, condiciones: CondicionActor[], ocurrencias: readonly OcurrenciaDatos[],
  motivos: DiagnosticoDatosPrueba['motivos'], requisito?: string, sujeto?: 'participante'): DiagnosticoDatosPrueba => ({
  actorRef, status: 'NEEDS_REVIEW', ...(requisito ? { requisito } : {}), ...(perfil ? { perfil } : {}), ...(sujeto ? { sujeto } : {}),
  condiciones, missingFields: [], secretRefs: [], missingSecretRefs: [], occurrences: unicas(ocurrencias), motivos,
});

/** actorRef de un caso: slot registrado del MISMO perfil; si no, NEEDS_REVIEW. */
export function diagnosticarActorRef(actorRef: string, perfil: PerfilActorAfi, registro: RegistroDatosPrueba, entorno: Entorno, ocurrencia?: OcurrenciaDatos): DiagnosticoDatosPrueba {
  const extra = ocurrencia ? [ocurrencia] : [];
  const slot = registro.slots.find(s => s.id === actorRef);
  if (!slot) return revision(actorRef, perfil, [], extra, [{ motivo: 'actor-no-registrado', detalle: `"${actorRef}" no es un actor aprobado del Test Data Registry` }]);
  // 4S: un participante nunca es el actor principal del caso.
  if (slot.sujeto === 'participante') {
    return revision(actorRef, perfil, slot.condiciones, extra, [{ motivo: 'sujeto-distinto', detalle: `"${actorRef}" es un participante: no puede ser el actor principal (declárelo en participantes)` }]);
  }
  if (slot.perfil !== perfil) {
    return revision(actorRef, perfil, slot.condiciones, extra, [{ motivo: 'perfil-distinto', detalle: `"${actorRef}" es de perfil ${slot.perfil}; el caso requiere ${perfil}` }]);
  }
  return diagnosticarSlot(slot, entorno, extra);
}

/** Estado de un REQUISITO (intake): qué slot lo cubre, o por qué requiere revisión. */
export function diagnosticarRequisito(req: TestDataRequirement, registro: RegistroDatosPrueba, entorno: Entorno): DiagnosticoDatosPrueba {
  const problemas = validarRequisito(req);
  if (problemas.length) {
    return revision(null, req.perfil, [], [], [{ motivo: 'requisito-invalido', detalle: [...new Set(problemas.map(p => p.motivo))].join(', ') }], typeof req.id === 'string' ? req.id : undefined);
  }
  const conds = req.condiciones.map(c => ({ ...c }));
  const participante = req.rol !== undefined;
  const ocurrencias = req.ocurrencias.map(o => ({ ...o, ...(participante ? { rol: req.rol } : {}) }));
  const rev = (motivo: MotivoRevisionDatos, detalle: string, actorRef: string | null = null) =>
    revision(actorRef, req.perfil, conds, ocurrencias, [{ motivo, detalle }], req.id, participante ? 'participante' : undefined);
  // Una decisión humana explícita (el requisito ya figura en el origen de un slot) prevalece sobre la identidad.
  const mapeados = registro.slots.filter(s => s.origen.requisitos.includes(req.id));
  let slot: ActorSlot | undefined;
  if (mapeados.length > 1) return rev('posible-duplicado', `el requisito figura en varios actores: ${mapeados.map(s => s.id).join(', ')}`);
  if (mapeados.length === 1) slot = mapeados[0];
  else {
    const firma = { perfil: req.perfil, ...(participante ? { sujeto: 'participante' as const } : {}), condiciones: req.condiciones, campos: [...req.camposRequeridos, ...(req.camposCondicionales ?? []).map(c => c.campo)] };
    const de = (s: ActorSlot) => ({ perfil: s.perfil, sujeto: s.sujeto, condiciones: s.condiciones, campos: s.campos.map(c => c.campo) });
    const iguales = registro.slots.filter(s => relacionActores(firma, de(s)) === 'IGUAL');
    const posibles = registro.slots.filter(s => relacionActores(firma, de(s)) === 'POSIBLE_DUPLICADO');
    if (iguales.length > 1) return rev('posible-duplicado', `varios actores con la misma identidad: ${iguales.map(s => s.id).join(', ')}`);
    if (!iguales.length) {
      return posibles.length ? rev('posible-duplicado', `parecido a ${posibles.map(s => s.id).join(', ')}: confirmar si es el mismo actor`)
        : rev('sin-actor-aprobado', 'la clase de actor está definida pero no hay un actor aprobado en el Test Data Registry');
    }
    slot = iguales[0];
    if (!req.reutilizable && slot.origen.requisitos.some(x => x !== req.id)) return rev('reutilizacion-no-permitida', `requiere un actor propio y ${slot.id} ya lo usan otros requisitos`, slot.id);
  }
  if ((slot.sujeto === 'participante') !== participante) {
    return rev('sujeto-distinto', `${slot.id} es ${slot.sujeto === 'participante' ? 'un participante' : 'un actor principal'}; el requisito ${participante ? 'declara un rol' : 'es del actor principal'}`, slot.id);
  }
  if (slot.perfil !== req.perfil) return rev('perfil-distinto', `${slot.id} es de perfil ${slot.perfil ?? '(sin perfil)'}`, slot.id);
  const sinCubrir = [...req.camposRequeridos, ...(req.camposCondicionales ?? []).map(c => c.campo)].filter(c => !slot!.campos.some(x => x.campo === c));
  if (sinCubrir.length) return rev('campos-no-cubiertos', `${slot.id} no declara ${sinCubrir.join(', ')}`, slot.id);
  return { ...diagnosticarSlot(slot, entorno, ocurrencias), requisito: req.id };
}

// ---------- 7/13. Compatibilidad y preflight ----------

/** Opciones de presentación: el proyecto se usa solo para mostrar comandos concretos al analista. */
export interface OpcionesTextoDatos { proyecto?: string }

/** El caso no puede ejecutarse por sus datos de prueba. Mensaje = diagnóstico humano, sin valores. */
export class DatosPruebaNoListosError extends Error {
  constructor(readonly diagnostico: DiagnosticoDatosPrueba, opciones: OpcionesTextoDatos = {}) {
    super(textoDiagnosticoDatos(diagnostico, opciones));
    this.name = 'DatosPruebaNoListosError';
  }
}

export interface DefinicionConActor { perfil: PerfilActorAfi; actorRef?: string; hu: string; caso: string }
export type PreflightDatos = { modo: 'perfil' } | { modo: 'actor-slot'; diagnostico: DiagnosticoDatosPrueba };

/**
 * ANTES de abrir navegador. Sin actorRef: compatibilidad (actor por perfil; los gaps los reporta el compilador como
 * hasta ahora). Con actorRef: resuelve el slot, valida perfil y verifica la PRESENCIA de cada secreto.
 */
export function preflightDatosPrueba(def: DefinicionConActor, registro: RegistroDatosPrueba = REGISTRO_DATOS_PRUEBA_AFI, entorno: Entorno): PreflightDatos {
  if (def.actorRef === undefined) return { modo: 'perfil' };
  return { modo: 'actor-slot', diagnostico: diagnosticarActorRef(def.actorRef, def.perfil, registro, entorno, { hu: def.hu, caso: def.caso }) };
}

/** Actor de un slot READY: datos públicos del perfil + capas 1-2. Los valores solo viven en el ActorAfi (nunca se imprime). */
export function actorDesdeSlot(slot: ActorSlot, entorno: Entorno, opciones: OpcionesTextoDatos = {}): ActorAfi {
  const d = diagnosticarSlot(slot, entorno);
  if (d.status !== 'READY') throw new DatosPruebaNoListosError(d, opciones);
  if (!slot.perfil || slot.sujeto === 'participante') throw new DatosPruebaError('ACTOR_NO_REGISTRADO', [{ motivo: 'REFERENCIA', detalle: `${slot.id} es un participante, no un actor principal` }]);
  const datos: ActorAfi['datos'] = { ...actorDesdeEntorno(slot.perfil, {}).datos };
  for (const c of slot.campos) if (!esCampoPersona(c.campo)) datos[c.campo] = valorCampoSlot(slot, c, entorno);
  return { id: slot.id, perfil: slot.perfil, datos };
}

/** Actor de un caso: sin actorRef, el actor por perfil vigente; con actorRef, el slot (o DatosPruebaNoListosError). */
export function actorParaCaso(def: DefinicionConActor, registro: RegistroDatosPrueba = REGISTRO_DATOS_PRUEBA_AFI, entorno: Entorno, opciones: OpcionesTextoDatos = {}): ActorAfi {
  const pf = preflightDatosPrueba(def, registro, entorno);
  if (pf.modo === 'perfil') return actorDesdeEntorno(def.perfil, entorno);
  if (pf.diagnostico.status !== 'READY') throw new DatosPruebaNoListosError(pf.diagnostico, opciones);
  return actorDesdeSlot(registro.slots.find(s => s.id === def.actorRef)!, entorno, opciones);
}

// ---------- 4S. Participantes secundarios de un caso ----------

/** Un participante del CASO: rol semántico (lo define el diseño QA) + slot que lo provee. */
export interface ParticipanteCaso { rol: string; actorRef: string }
/** Relación entre sujetos que el diseño QA EXIGE ("principal" = actor principal). Sin relación no se infiere nada. */
export const TIPOS_RELACION_SUJETOS = ['mismo-sujeto', 'distinto-sujeto'] as const;
export interface RelacionSujetos { tipo: typeof TIPOS_RELACION_SUJETOS[number]; sujetos: [string, string] }
export interface DefinicionConParticipantes extends DefinicionConActor { participantes?: readonly ParticipanteCaso[]; relaciones?: readonly RelacionSujetos[] }
/** Participante materializado: valores SOLO en memoria (nunca se imprimen ni se serializan). */
/** `persona`: nombres/apellidos del participante (solo en memoria; nunca se imprimen ni se serializan). */
export interface ParticipanteAfi { rol: string; actorRef: string; datos: ActorAfi['datos']; persona: Partial<Record<CampoPersona, string>> }

/**
 * Participante de un caso: debe ser un slot de PARTICIPANTE; solo puede apuntar al slot del actor principal si el caso
 * declara explícitamente que es el MISMO sujeto que el principal.
 */
export function diagnosticarParticipante(
  p: ParticipanteCaso, registro: RegistroDatosPrueba, entorno: Entorno, ocurrencia?: OcurrenciaDatos, mismoQuePrincipal = false,
): DiagnosticoDatosPrueba {
  const extra = ocurrencia ? [{ ...ocurrencia, rol: p.rol }] : [];
  const slot = registro.slots.find(s => s.id === p.actorRef);
  if (!slot) return { ...revision(p.actorRef, undefined, [], extra, [{ motivo: 'actor-no-registrado', detalle: `"${p.actorRef}" no es un sujeto aprobado del Test Data Registry` }], undefined, 'participante'), rol: p.rol };
  if (slot.sujeto !== 'participante' && !mismoQuePrincipal) {
    return { ...revision(p.actorRef, slot.perfil, slot.condiciones, extra, [{ motivo: 'sujeto-distinto', detalle: `"${p.actorRef}" es un actor principal: el rol ${p.rol} necesita un participante (o declarar mismo-sujeto con el principal)` }], undefined, 'participante'), rol: p.rol };
  }
  return { ...diagnosticarSlot(slot, entorno, extra), rol: p.rol };
}

/**
 * PREFLIGHT de participantes (sin navegador): cada participante READY y las relaciones declaradas cumplidas. "distinto-sujeto"
 * se verifica también por VALOR de identidad, en memoria (dos slots distintos podrían apuntar a la misma persona); el
 * error solo nombra roles. "mismo-sujeto" exige el mismo slot (lo valida el contrato del caso). Sin relación: nada.
 */
export function participantesParaCaso(
  def: DefinicionConParticipantes, registro: RegistroDatosPrueba = REGISTRO_DATOS_PRUEBA_AFI, entorno: Entorno, principal?: ActorAfi, opciones: OpcionesTextoDatos = {},
): ParticipanteAfi[] {
  const relaciones = def.relaciones ?? [];
  const conPrincipal = (rol: string) => relaciones.some(r => r.tipo === 'mismo-sujeto' && r.sujetos.includes(rol) && r.sujetos.includes(SUJETO_PRINCIPAL));
  const participantes = (def.participantes ?? []).map(p => {
    const d = diagnosticarParticipante(p, registro, entorno, { hu: def.hu, caso: def.caso }, conPrincipal(p.rol) && p.actorRef === def.actorRef);
    if (d.status !== 'READY') throw new DatosPruebaNoListosError(d, opciones);
    const slot = registro.slots.find(s => s.id === p.actorRef)!;
    const datos: ActorAfi['datos'] = {};
    const persona: ParticipanteAfi['persona'] = {};
    for (const c of slot.campos) {
      const v = valorCampoSlot(slot, c, entorno);
      if (esCampoPersona(c.campo)) { if (typeof v === 'string') persona[c.campo] = v; } else datos[c.campo] = v;
    }
    return { rol: p.rol, actorRef: p.actorRef, datos, persona };
  });
  const sujeto = (rol: string) => (rol === SUJETO_PRINCIPAL
    ? { actorRef: def.actorRef, datos: principal?.datos ?? {} }
    : participantes.find(p => p.rol === rol));
  const problemas: ProblemaDatos[] = [];
  for (const r of relaciones) {
    const [a, b] = r.sujetos.map(sujeto);
    if (!a || !b) { problemas.push({ motivo: 'REFERENCIA', detalle: `relación ${r.tipo} con un sujeto no declarado (${r.sujetos.join(', ')})` }); continue; }
    if (r.tipo === 'mismo-sujeto' && a.actorRef !== b.actorRef) problemas.push({ motivo: 'REFERENCIA', detalle: `${r.sujetos.join(' y ')} deben ser el mismo sujeto: usan actores distintos` });
    if (r.tipo === 'distinto-sujeto') {
      if (a.actorRef !== undefined && a.actorRef === b.actorRef) problemas.push({ motivo: 'REFERENCIA', detalle: `${r.sujetos.join(' y ')} deben ser sujetos distintos: usan el mismo actor` });
      else {
        // Identidad por VALOR (en memoria): dos slots distintos no deben resolver a la misma persona.
        const iguales = CAMPOS_IDENTIDAD_ACTOR.filter(c => a.datos[c] !== undefined && a.datos[c] === b.datos[c]);
        if (iguales.length) problemas.push({ motivo: 'REFERENCIA', detalle: `${r.sujetos.join(' y ')} deben ser sujetos distintos, pero su ${iguales.map(etiqueta).join(', ')} coincide (revise el .env)` });
      }
    }
  }
  if (problemas.length) throw new DatosPruebaError('RELACION_SUJETOS', problemas);
  return participantes;
}

// ---------- 11. Diagnóstico humano (analista no desarrollador) ----------

const etiqueta = (c: CampoDato) => etiquetaDato(c);
const necesario = (o: readonly OcurrenciaDatos[]) => (o.length ? o.map(x => `  ${[x.hu, x.caso, x.paso, x.rol ? `rol ${x.rol}` : undefined].filter(Boolean).join(' · ')}`) : ['  (sin casos registrados)']);
const cumplir = (d: DiagnosticoDatosPrueba) => [
  d.sujeto === 'participante' ? `  • participante (sujeto secundario del caso${d.perfil ? `, perfil ${d.perfil}` : ''})` : `  • perfil ${d.perfil}`,
  ...d.condiciones.map(c => `  • ${c.descripcion}`),
];
/** 4S: el analista ve si falta el actor principal o un participante (y con qué rol, si lo hay). */
const encabezadoSujeto = (d: DiagnosticoDatosPrueba) => (d.sujeto === 'participante' ? `Participante${d.rol ? ` (rol ${d.rol})` : ''}:` : 'Actor:');
const cli = (o: OpcionesTextoDatos) => `node tools/afi.mjs ${o.proyecto ?? '<proyecto>'}`;

/** Estado legible para el analista (incluye la confirmación de provisión pendiente). */
export function estadoLegible(d: DiagnosticoDatosPrueba): string {
  if (d.confirmacionPendiente) return 'REQUIERE CONFIRMACIÓN DE PROVISIÓN';
  return { READY: 'LISTO', MISSING_SECRET: 'FALTAN SECRETOS', NEEDS_PROVISIONING: 'REQUIERE ACTOR', NEEDS_REVIEW: 'REQUIERE REVISIÓN' }[d.status];
}

/**
 * Texto para el analista: QUÉ falta y QUÉ hacer, sin exigir conocer el registro interno. Muestra NOMBRES de variables;
 * nunca valor, longitud, prefijo ni últimos dígitos.
 */
export function textoDiagnosticoDatos(d: DiagnosticoDatosPrueba, opciones: OpcionesTextoDatos = {}): string {
  const actor = [encabezadoSujeto(d), `  ${d.actorRef ?? `(requisito ${d.requisito ?? '?'})`}`];
  const lineasEnv = d.missingFields.flatMap((c, i) => [`  # ${etiqueta(c)}`, `  ${d.missingSecretRefs[i]}=`]);
  const confirmar = `  ${cli(opciones)} datos provisionado ${d.actorRef} --revisor=<su-alias>`;
  if (d.status === 'READY') return ['DATOS DE PRUEBA — LISTOS', ...actor, 'Necesario para:', ...necesario(d.occurrences)].join('\n');
  if (d.status === 'MISSING_SECRET') {
    return ['DATOS DE PRUEBA — FALTANTES', ...actor, 'Necesario para:', ...necesario(d.occurrences), 'Debe cumplir:', ...cumplir(d),
      'Falta:', ...d.missingFields.map(c => `  ${etiqueta(c)}`),
      `Agregue ${d.missingFields.length > 1 ? 'estos valores' : 'este valor'} al .env del proyecto (nunca en el caso, el registro ni Git):`, ...lineasEnv,
      'Después ejecute:', `  ${cli(opciones)} datos estado`].join('\n');
  }
  if (d.status === 'NEEDS_PROVISIONING' && d.confirmacionPendiente) {
    return ['DATOS DE PRUEBA — REQUIERE CONFIRMACIÓN DE PROVISIÓN', ...actor, 'Necesario para:', ...necesario(d.occurrences),
      'Los datos necesarios ya están configurados; falta confirmar que el actor cumple las condiciones de negocio:', ...cumplir(d),
      'Si las cumple, confirme la provisión:', confirmar].join('\n');
  }
  if (d.status === 'NEEDS_PROVISIONING') {
    return ['DATOS DE PRUEBA — REQUIERE ACTOR', ...actor, 'Necesario para:', ...necesario(d.occurrences),
      'Busque/solicite a QA un actor que cumpla:', ...cumplir(d), 'Cuando lo tenga:',
      '  1. configure en el .env del proyecto:', ...lineasEnv.map(l => `  ${l}`), '  2. confirme la provisión:', `  ${confirmar}`].join('\n');
  }
  return ['DATOS DE PRUEBA — REQUIERE REVISIÓN', ...actor, 'Necesario para:', ...necesario(d.occurrences),
    ...(d.condiciones.length ? ['Debe cumplir:', ...cumplir(d)] : []), 'Motivo:', ...d.motivos.map(m => `  • ${m.motivo}: ${m.detalle}`),
    'Requiere una decisión en una revisión de datos de prueba (datos preparar / datos aplicar).'].join('\n');
}

/** `datos estado`: resumen primero, luego detalle por actor. Solo PRESENCIA de variables, nunca contenido. */
export function textoEstadoDatos(registro: RegistroDatosPrueba, entorno: Entorno, opciones: OpcionesTextoDatos = {}): { texto: string; diagnosticos: DiagnosticoDatosPrueba[]; resumen: Record<string, number> } {
  const diagnosticos = registro.slots.map(s => diagnosticarSlot(s, entorno));
  const n = (f: (d: DiagnosticoDatosPrueba) => boolean) => diagnosticos.filter(f).length;
  const resumen = {
    actores: diagnosticos.length, ready: n(d => d.status === 'READY'), faltanSecretos: n(d => d.status === 'MISSING_SECRET'),
    requierenActor: n(d => d.status === 'NEEDS_PROVISIONING' && !d.confirmacionPendiente), confirmacionPendiente: n(d => !!d.confirmacionPendiente),
    revision: n(d => d.status === 'NEEDS_REVIEW'),
  };
  // 4S: el conteo de participantes solo aparece si existen (salida idéntica para registros solo con actores principales).
  const participantes = diagnosticos.filter(d => d.sujeto === 'participante').length;
  const texto = [
    `DATOS DE PRUEBA — ESTADO (Test Data Registry, revisión ${registro.revision})`,
    `Actores: ${resumen.actores}`, ...(participantes ? [`Participantes (sujetos secundarios): ${participantes}`] : []),
    `READY: ${resumen.ready}`, `Faltan secretos: ${resumen.faltanSecretos}`, `Requieren actor: ${resumen.requierenActor}`,
    `Requieren confirmación de provisión: ${resumen.confirmacionPendiente}`, `Revisión: ${resumen.revision}`,
    ...diagnosticos.flatMap(d => ['', textoDiagnosticoDatos(d, opciones)]),
  ].join('\n');
  return { texto, diagnosticos, resumen };
}

/** Roles con los que un caso usa a un participante (de sus ocurrencias). */
const rolesEn = (d: DiagnosticoDatosPrueba, caso: string) => {
  const roles = [...new Set(d.occurrences.filter(o => [o.hu, o.caso].filter(Boolean).join(' · ') === caso && o.rol).map(o => o.rol!))];
  return roles.length ? ` (rol ${roles.join(', ')})` : '';
};

/** `datos requeridos`: qué actor necesita cada caso (agrupado por caso). */
export function textoRequeridosDatos(registro: RegistroDatosPrueba, entorno: Entorno, filtro?: string, opciones: OpcionesTextoDatos = {}): { texto: string; casos: { caso: string; actores: DiagnosticoDatosPrueba[] }[] } {
  const casos = new Map<string, DiagnosticoDatosPrueba[]>();
  for (const s of registro.slots) {
    const d = diagnosticarSlot(s, entorno);
    for (const o of d.occurrences) {
      if (filtro && o.caso !== filtro && o.hu !== filtro) continue;
      const k = [o.hu, o.caso].filter(Boolean).join(' · ');
      if (!(casos.get(k) ?? []).some(x => x.actorRef === d.actorRef)) casos.set(k, [...(casos.get(k) ?? []), d]);
    }
  }
  const lista = [...casos].sort(([a], [b]) => a.localeCompare(b)).map(([caso, actores]) => ({ caso, actores }));
  if (!lista.length) return { texto: `Sin actores de prueba registrados${filtro ? ` para ${filtro}` : ''} en el Test Data Registry.`, casos: [] };
  const texto = lista.flatMap(({ caso, actores }) => [
    `CASO ${caso}`,
    ...actores.flatMap(d => [
      d.sujeto === 'participante'
        ? `  Necesita el participante ${d.actorRef}${rolesEn(d, caso)} — ${estadoLegible(d)}`
        : `  Necesita el actor ${d.actorRef} — ${estadoLegible(d)}`,
      '  Debe cumplir:', ...cumplir(d).map(l => `  ${l}`),
    ]),
    '',
  ]).concat([`Detalle y próximos pasos: ${cli(opciones)} datos estado`]).join('\n');
  return { texto, casos: lista };
}

// ---------- 17/18. Plantilla de variables (solo nombres) ----------

export const ARCHIVO_PLANTILLA_ENV = '.env.test-data.example';

/** Ruta de la plantilla junto al .env del proyecto. Nunca el .env real. */
export function rutaPlantillaEnv(dirProyecto: string, nombre = ARCHIVO_PLANTILLA_ENV): string {
  if (basename(nombre) !== nombre || nombre === '.env' || !nombre.endsWith('.example')) {
    throw new DatosPruebaError('RUTA_PROHIBIDA', [{ motivo: 'ESQUEMA', detalle: 'la plantilla solo se escribe como *.example junto al proyecto; nunca el .env real' }]);
  }
  return join(dirProyecto, nombre);
}

/**
 * Determinista (orden por id), regenerable desde el registro aprobado. SOLO líneas para secretos propios del actor y
 * compartidos declarados (una vez); nunca para derived, auxiliary, base/público ni un compartido ya listado.
 */
export function plantillaEnvDatosPrueba(registro: RegistroDatosPrueba = REGISTRO_DATOS_PRUEBA_AFI): string {
  const l: string[] = [
    '# Datos de prueba — variables de actores (generado; no editar a mano). SOLO nombres:',
    '# copie las líneas necesarias al .env del proyecto y complete allí los valores. Nunca en Git.',
    '# Regenerar: node tools/afi.mjs <proyecto> datos plantilla-env --escribir',
  ];
  for (const c of [...registro.compartidos].sort((a, b) => a.id.localeCompare(b.id))) {
    l.push('', `# Compartido: ${c.id} — ${c.descripcion}`, `# Campo: ${etiqueta(c.campo)}`, `${secretRefShared(c.id)}=`);
  }
  for (const s of [...registro.slots].sort((a, b) => a.id.localeCompare(b.id))) {
    const propios = s.campos.filter(c => c.fuente === 'slot');
    if (!propios.length) continue;
    const quien = s.sujeto === 'participante' ? `Participante: ${s.id} (sujeto secundario${s.perfil ? `, perfil ${s.perfil}` : ''}` : `Actor: ${s.id} (perfil ${s.perfil}`;
    l.push('', `# ${quien}${s.estado === 'pendiente-provisionar' ? '; pendiente de provisionar' : ''})`, `# Debe cumplir: ${s.condiciones.map(c => c.descripcion).join('; ')}`);
    for (const c of propios) {
      const base = c.fallbackBase && s.perfil && !esCampoPersona(c.campo) ? VARIABLES_ACTOR[s.perfil][c.campo] : undefined;
      const condicion = c.cuando ? ` (solo si ${etiqueta(c.cuando.campo)} ${c.cuando.operador} ${Array.isArray(c.cuando.valor) ? c.cuando.valor.join(' | ') : c.cuando.valor})` : '';
      l.push(`# Campo: ${etiqueta(c.campo)}${condicion}${base ? ` (si se omite, se usa la variable vigente ${base})` : ''}`, `${secretRefActor(s.id, c.campo)}=`);
    }
  }
  return `${l.join('\n')}\n`;
}

// ---------- 4Q H. Confirmación de provisión (auditada, sin valores) ----------

export type EstadoProvision = 'PROVISIONADO' | 'YA_PROVISIONADO';
export interface ResultadoProvision { estado: EstadoProvision; registro: RegistroDatosPrueba; actorRef: string; revisionAntes: number; revisionDespues: number }

/**
 * Marca un actor como provisionado tras comprobar que TODOS sus secretos están PRESENTES en el entorno (nunca los lee
 * para mostrarlos). Solo cambia metadata de provisión + historial. Si faltan, rechaza indicando los NOMBRES que faltan.
 */
export function confirmarProvision(registro: RegistroDatosPrueba, actorRef: string, revisor: string, fecha: string, entorno: Entorno): ResultadoProvision {
  const mal = (codigo: 'ACTOR_NO_REGISTRADO' | 'SECRETOS_FALTANTES' | 'DECISIONES_INVALIDAS', detalles: string[]): never => {
    throw new DatosPruebaError(codigo, detalles.map(detalle => ({ motivo: 'REFERENCIA' as const, detalle })));
  };
  if (!REVISOR.test(revisor)) mal('DECISIONES_INVALIDAS', ['--revisor requerido: rol o alias en minúsculas (sin nombres ni correos)']);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) mal('DECISIONES_INVALIDAS', ['fecha AAAA-MM-DD requerida']);
  // Un argumento que no tiene forma de id de actor no se repite (podría ser un valor pegado por error).
  if (!idDatosValido(actorRef)) mal('ACTOR_NO_REGISTRADO', ['el argumento no es un id de actor (kebab-case); no se muestra por seguridad']);
  const slot = registro.slots.find(s => s.id === actorRef);
  if (!slot) return mal('ACTOR_NO_REGISTRADO', [`"${actorRef}" no es un actor del Test Data Registry (ver datos estado)`]);
  if (slot.estado === 'provisionado') return { estado: 'YA_PROVISIONADO', registro, actorRef, revisionAntes: registro.revision, revisionDespues: registro.revision };
  const d = diagnosticarSlot({ ...slot, estado: 'provisionado' }, entorno);
  if (d.status !== 'READY') mal('SECRETOS_FALTANTES', d.missingSecretRefs.map((ref, i) => `falta ${ref} (${etiqueta(d.missingFields[i])})`));
  const revision = registro.revision + 1;
  const final: RegistroDatosPrueba = {
    ...registro, revision,
    slots: registro.slots.map(s => (s.id === actorRef ? { ...s, estado: 'provisionado' as const } : s)),
    historial: [...registro.historial, {
      revision, fecha, slot: actorRef, accion: 'provision', propuesta: `prov-${actorRef}`,
      hash: createHash('sha256').update(JSON.stringify({ actorRef, revision, estado: 'provisionado' })).digest('hex'), revisor, requisitos: [...slot.origen.requisitos],
    }],
  };
  validarRegistroDatosPrueba(JSON.parse(JSON.stringify(final)));
  return { estado: 'PROVISIONADO', registro: final, actorRef, revisionAntes: registro.revision, revisionDespues: revision };
}

// ---------- 23. Métricas (sin valores) ----------

export function medirDatosPrueba(e: {
  requisitos: readonly TestDataRequirement[];
  registroAntes: RegistroDatosPrueba;
  registroDespues: RegistroDatosPrueba;
  entorno: Entorno;
  /** Estados por pasada (p. ej. tras cada configuración del entorno). */
  pasadas?: readonly (readonly EstadoDatos[])[];
}) {
  const d = e.requisitos.map(r => diagnosticarRequisito(r, e.registroDespues, e.entorno));
  const usos = new Map<string, number>();
  for (const x of d) if (x.actorRef && x.status !== 'NEEDS_REVIEW') usos.set(x.actorRef, (usos.get(x.actorRef) ?? 0) + 1);
  const antes = new Set(e.registroAntes.slots.map(s => s.id));
  const usados = e.registroDespues.slots.filter(s => usos.has(s.id));
  const secretos = new Set(usados.flatMap(s => secretRefsDeSlot(s).filter(r => r.capa !== 'base').map(r => r.secretRef)));
  const porShared = new Map<string, number>();
  for (const s of usados) for (const c of new Set(s.campos.filter(c => c.fuente === 'shared').map(c => c.sharedRef!))) porShared.set(c, (porShared.get(c) ?? 0) + 1);
  const n = (s: EstadoDatos) => d.filter(x => x.status === s).length;
  const i = e.pasadas?.findIndex(p => p.length > 0 && p.every(s => s === 'READY'));
  return {
    requisitosDetectados: e.requisitos.length,
    actorSlotsUnicos: usados.length,
    slotsReutilizados: usados.filter(s => antes.has(s.id) || (usos.get(s.id) ?? 0) > 1).length,
    slotsNuevos: usados.filter(s => !antes.has(s.id)).length,
    ready: n('READY'), missingSecret: n('MISSING_SECRET'), needsProvisioning: n('NEEDS_PROVISIONING'), needsReview: n('NEEDS_REVIEW'),
    secretsRequeridos: secretos.size,
    sharedReutilizados: [...porShared.values()].filter(v => v > 1).length,
    runtimeChanges: 0 as const,
    ...(i !== undefined && i >= 0 ? { pasadasHastaReady: i + 1 } : {}),
  };
}

// ---------- 15. Publicación al agente (manifest) ----------

/** Sección `testData` del manifest: derivada de las fuentes canónicas. Sin valores ni nombres de variables concretos. */
export function publicarContratoDatosPrueba(registro: RegistroDatosPrueba = REGISTRO_DATOS_PRUEBA_AFI) {
  return {
    schemaVersion: ESQUEMA_REQUISITO_DATOS,
    registro: ESQUEMA_REGISTRO_DATOS,
    salida: {
      clave: 'testDataRequirements',
      formato: 'Lista testDataRequirements del envelope ÚNICO de intake (ver agentIntake). Dimensión independiente del conocimiento: '
        + 'una misma entidad de negocio puede producir un KNOWLEDGE_GAP de aplicación Y un requisito de datos de ejecución.',
    },
    /** Dos dimensiones distintas: la sensibilidad del dato NO decide por sí sola si hace falta un secreto. */
    sensibilidad: {
      significado: 'Qué tan privado es el dato (public | pii | secret). Un dato pii que el framework resuelve solo (derived/auxiliary) no genera secreto.',
      porCampo: Object.fromEntries(CAMPOS_AFI.map(c => [c, sensibilidadCampo(c)])),
    },
    resoluciones: RESOLUCIONES_DATOS.map(r => ({
      resolucion: r, ...SEMANTICA_RESOLUCION[r],
      camposPorDefecto: r === 'SHARED' ? [] : CAMPOS_AFI.filter(c => clasificarCampo(c) === r),
    })),
    campos: {
      condicionables: { significado: 'Propiedades del actor que una condición lógica puede mencionar. Mencionarlas NO crea un secreto ni las vuelve pedibles.', campos: [...CAMPOS_CONDICIONABLES] },
      requierenSecreto: { significado: 'Datos que deben PROVISIONARSE (secreto del actor que QA debe conseguir). Idéntico a camposPedibles.', campos: [...CAMPOS_PEDIBLES] },
      autoResolubles: { significado: 'El framework los resuelve solo (derived/auxiliary). Nunca van en camposRequeridos; pueden mencionarse en una condición.', campos: [...CAMPOS_AUTO_RESOLUBLES] },
      actorBase: { significado: 'Públicos del actor (metadatos del perfil): no son secretos.', campos: [...CAMPOS_ACTOR_BASE] },
      compartibles: {
        significado: 'El framework PERMITE compartir el secreto si un humano lo decide para un actor; NUNCA lo comparte automáticamente.',
        campos: [...CAMPOS_COMPARTIBLES],
      },
    },
    /** Campos que un requisito puede listar sin justificación adicional (los que exigen aportación de datos del actor). */
    camposPedibles: [...CAMPOS_PEDIBLES],
    camposIdentidad: [...CAMPOS_IDENTIDAD_ACTOR],
    estados: ESTADOS_DATOS.map(estado => ({ estado, significado: SIGNIFICADO_ESTADO_DATOS[estado] })),
    resolucion: [
      'secreto específico del actor (slot)', 'secreto compartido o actor base del MISMO perfil, solo si un humano lo declara para el slot',
      'derived', 'auxiliary seguro', 'DataGap',
    ],
    secretRef: {
      generadoPor: 'framework',
      convencion: `${PREFIJO_SECRET_ACTOR}<ACTOR>_<CAMPO> y ${PREFIJO_SECRET_SHARED}<REF>: mayúsculas, sin tildes, separadores -> "_"`,
    },
    contractShape: {
      requisito: {
        requeridos: [...FORMA_REQUISITO.requeridos], opcionales: [...FORMA_REQUISITO.opcionales],
        valoresFijos: { schemaVersion: ESQUEMA_REQUISITO_DATOS },
        condicion: '{ "id": kebab-case semántico, "descripcion": condición de negocio sin valores }',
        ocurrencia: { requeridos: [...FORMA_REQUISITO.ocurrencia.requeridos], opcionales: [...FORMA_REQUISITO.ocurrencia.opcionales] },
      },
      actorRef: 'DefinicionCasoAfi.actorRef? = id de un actor de "actores" (mismo perfil). Sin actorRef, el caso usa el actor del perfil.',
      estadosSlot: [...ESTADOS_SLOT],
    },
    /** 4S: sujetos secundarios de un caso. */
    participantes: {
      significado: 'Un caso puede necesitar, además del actor principal (aportante), cero o más PARTICIPANTES secundarios, cada uno con '
        + 'un ROL semántico definido por el diseño QA, sus propias condiciones, sus propios campos y su propio aprovisionamiento.',
      requisito: 'Requisito con "rol" (kebab-case, nunca "principal"): es un participante; "perfil" solo si aplica. Sin "rol": el actor principal (perfil obligatorio).',
      caso: 'DefinicionCasoAfi.participantes?: [{ rol, actorRef }] (actorRef = sujeto aprobado) y relaciones?: [{ tipo: mismo-sujeto | distinto-sujeto, '
        + `sujetos: [rol|"${SUJETO_PRINCIPAL}", rol|"${SUJETO_PRINCIPAL}"] }].`,
      tiposRelacion: [...TIPOS_RELACION_SUJETOS],
      consumoRuntime: false,
      capabilityGap: 'Ninguna operación ni etapa de preparación consume aún un participante: los participantes se modelan, provisionan y verifican '
        + 'antes de ejecutar, pero un paso que necesite diligenciar o comparar datos de un participante sigue siendo CAPABILITY_GAP.',
    },
    actores: registro.slots.map(s => ({ id: s.id, ...(s.perfil ? { perfil: s.perfil } : {}), ...(s.sujeto ? { sujeto: s.sujeto } : {}), condiciones: s.condiciones.map(c => ({ ...c })) })),
    reglas: [
      'Dato SECRET = valor personal del actor (identificación, correo, teléfonos, salario...). Nunca lo generes, pidas ni copies.',
      'Expresa QUÉ actor se necesita: perfil + condiciones de negocio ("titular con estado inactivo"). Las condiciones SÍ deben aparecer.',
      'Nunca escribas nombres de variables de entorno ni secretRef: el framework los deriva de actor + campo.',
      'actorRef es semántico y reutilizable: si un actor de "actores" cumple EXACTAMENTE las condiciones y el perfil, úsalo.',
      'camposRequeridos contiene SOLO campos de camposPedibles: datos que deben provisionarse para ejecutar. Cualquier otro campo se rechaza.',
      'Una condición lógica puede mencionar una propiedad auto-resoluble (campos.autoResolubles) si define la clase de actor; eso NO la '
        + 'convierte en camposRequeridos ni en un secreto.',
      'Si el caso CERTIFICA el valor de un campo auto-resoluble, ese valor pertenece al CASO (contrato funcional); si no es representable, '
        + 'es un DataGap, nunca un secreto de datos de prueba ni una opción arbitraria.',
      'reutilizable=false solo si el caso consume o altera el actor (no puede compartirlo con otro caso).',
      'Compartir un secreto (p. ej. un buzón QA) es SIEMPRE una decisión humana en la revisión; no lo propongas como hecho.',
      'El agente solo PROPONE requisitos: crear o aprobar actores es una revisión humana.',
      'Una matriz humana de datos se usa solo por su columna de prerrequisito/condición; la columna de valores reales nunca se envía al agente.',
      'Participantes (4S): un sujeto secundario del caso (p. ej. otra persona además del aportante) va en un requisito PROPIO con "rol"; '
        + 'nunca lo conviertas en el actor principal ni en una condición del aportante.',
      'Mismo rol + mismas condiciones NO significa el mismo sujeto. Declara relaciones mismo-sujeto / distinto-sujeto SOLO si el diseño QA las exige; '
        + 'sin relación no se infiere igualdad ni diferencia.',
    ],
    noPublicado: 'Valores, nombres de variables concretos y estado del entorno nunca se publican.',
  };
}
