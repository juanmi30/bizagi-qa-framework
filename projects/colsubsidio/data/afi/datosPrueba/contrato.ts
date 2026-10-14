import { VARIABLES_ACTOR, actorDesdeEntorno } from '../actores';
import { CAMPOS_AFI, type CampoAfi, type OrigenDato, type PerfilActorAfi, type Sensibilidad } from '../modelo';
import { POLITICAS_AFI } from '../politicas';
import { piiEnContenido, piiEnMetadato } from '../aplicacion/sensibilidad';

/**
 * TEST DATA REQUIREMENTS & ACTOR SLOTS (Fase 4P). Capa pura: contratos, clasificación de campos, identidad semántica
 * y SECRET REFS deterministas.
 *
 *   HU/caso -> TestDataRequirement (condición lógica) -> ActorSlot (clase de actor reutilizable) -> campos requeridos
 *           -> secretRef (nombre de variable derivado por el framework) -> preflight -> diagnóstico para el analista
 *
 * Nunca maneja VALORES: solo nombres de campos, condiciones lógicas y nombres de variables. Un ActorSlot identifica una
 * CLASE de actor de prueba, no una persona; no está atado a una HU, un caso ni un número de caso.
 */

export const ESQUEMA_REQUISITO_DATOS = 'afi-test-data-requirement/v1';
export const ESQUEMA_REGISTRO_DATOS = 'afi-test-data-registry/v1';

/** Perfiles con actor (fuente: el mapeo vigente de actores.ts). */
export const PERFILES_DATOS = Object.keys(VARIABLES_ACTOR) as PerfilActorAfi[];

export type MotivoDatos =
  | 'ESQUEMA' | 'PERFIL' | 'ID_INVALIDO' | 'CONDICIONES' | 'CAMPO' | 'CAMPO_NO_SECRETO' | 'CAMPO_NO_PEDIBLE' | 'FUENTE_CAMPO' | 'SIN_OCURRENCIAS'
  | 'PII' | 'DEFINE_ENV' | 'CONTENIDO' | 'VALOR_EN_REGISTRO' | 'COLISION_SECRET_REF' | 'REFERENCIA' | 'DUPLICADO' | 'HISTORIAL';
export interface ProblemaDatos { motivo: MotivoDatos; detalle: string }

export type CodigoDatos = 'REQUISITO_INVALIDO' | 'SLOT_INVALIDO' | 'REGISTRO_INVALIDO' | 'SECRET_REF_INVALIDA' | 'COLISION_SECRET_REF' | 'LOTE_INVALIDO'
  | 'DECISIONES_INVALIDAS' | 'REVISION_CONFLICTO' | 'HASH_DISTINTO' | 'POSIBLE_DUPLICADO_SIN_RESOLVER' | 'RUTA_PROHIBIDA'
  | 'ACTOR_NO_REGISTRADO' | 'SECRETOS_FALTANTES' | 'ENTRADA_INVALIDA' | 'GATE_EVIDENCIA_PII' | 'RELACION_SUJETOS';

/** Error de datos de prueba. El mensaje nunca contiene valores (solo nombres de campos, ids y nombres de variables). */
export class DatosPruebaError extends Error {
  constructor(readonly codigo: CodigoDatos, readonly problemas: readonly ProblemaDatos[]) {
    super(`${codigo}:\n${problemas.map(p => `- ${p.motivo}: ${p.detalle}`).join('\n')}`);
    this.name = 'DatosPruebaError';
  }
}

// ---------- 4. Dos dimensiones: SENSIBILIDAD del dato vs RESOLUCIÓN (mecanismo) (4Q) ----------

/** Sensibilidad del dato (qué tan privado es): la de POLITICAS_AFI. No decide por sí sola si hace falta un secreto. */
export const sensibilidadCampo = (c: CampoAfi): Sensibilidad => POLITICAS_AFI[c].sensibilidad;
export const esSensible = (c: CampoAfi) => sensibilidadCampo(c) !== 'public';

/** Cómo obtiene el framework el valor (qué mecanismo hace falta). */
export const RESOLUCIONES_DATOS = ['ACTOR_SECRET', 'ACTOR_BASE', 'SHARED', 'PUBLIC_CASE', 'DERIVED', 'AUXILIARY'] as const;
export type ResolucionDatos = typeof RESOLUCIONES_DATOS[number];

/** Compatibilidad con la precedencia vigente del resolver (test-case / actor / derived / auxiliary / DataGap). */
export const SEMANTICA_RESOLUCION: Readonly<Record<ResolucionDatos, { significado: string; origenEquivalente: OrigenDato; requiereSecreto: boolean }>> = {
  ACTOR_SECRET: { significado: 'Valor propio del actor de prueba: lo aporta un secreto del entorno. Nunca en el caso, el registro, el manifest ni un log.', origenEquivalente: 'actor', requiereSecreto: true },
  ACTOR_BASE: { significado: 'Valor público del actor: metadatos del perfil o actor base del MISMO perfil. No es un secreto nuevo.', origenEquivalente: 'actor', requiereSecreto: false },
  SHARED: { significado: 'Secreto compartido declarado (p. ej. un buzón QA). SOLO si un humano lo decide para ese actor; nunca automático.', origenEquivalente: 'actor', requiereSecreto: true },
  PUBLIC_CASE: { significado: 'Valor que pertenece al CASO (datosCaso), p. ej. porque el caso lo certifica. No es secreto.', origenEquivalente: 'test-case', requiereSecreto: false },
  DERIVED: { significado: 'Se calcula desde otro dato ya resuelto: no lleva secreto propio.', origenEquivalente: 'derived', requiereSecreto: false },
  AUXILIARY: { significado: 'Preparación auxiliar segura del framework (consentimientos, primera opción válida): no lleva secreto.', origenEquivalente: 'auxiliary', requiereSecreto: false },
};

/** Contexto que cambia la resolución de un campo. */
export interface ContextoResolucionDatos {
  /**
   * El caso CERTIFICA el valor del campo (assertion): el valor pertenece al CASO y sigue el contrato funcional vigente
   * (si no es representable, DataGap). Nunca una opción arbitraria y nunca un secreto de datos de prueba automático.
   */
  asertado?: boolean;
}

/**
 * Resolución que necesita un campo (SHARED nunca sale de aquí: es una decisión humana sobre un ACTOR_SECRET compartible).
 * Un campo que el framework resuelve fielmente (DERIVED o AUXILIARY) NO genera necesidad de secreto aunque su sensibilidad
 * sea pii, ni siquiera si una condición lo menciona. Un campo certificado por el caso nunca se resuelve con una opción arbitraria.
 */
export function clasificarCampo(campo: CampoAfi, ctx: ContextoResolucionDatos = {}): Exclude<ResolucionDatos, 'SHARED'> {
  const p = POLITICAS_AFI[campo];
  if (ctx.asertado) return 'PUBLIC_CASE';
  if (p.derivacion && !p.delActor) return 'DERIVED';
  if (p.auxiliar) return 'AUXILIARY';
  if (p.delActor) return p.sensibilidad !== 'public' ? 'ACTOR_SECRET' : 'ACTOR_BASE';
  return 'PUBLIC_CASE';
}

/**
 * FUENTE CANÓNICA ÚNICA (parche 4Q): campos que requieren APROVISIONAR un dato externo del actor (ACTOR_SECRET). Es lo que
 * el manifest publica como testData.camposPedibles, lo ÚNICO que acepta TestDataRequirement.camposRequeridos y lo ÚNICO que
 * puede ser un secreto propio o compartido de un ActorSlot.
 */
export const CAMPOS_PEDIBLES: readonly CampoAfi[] = CAMPOS_AFI.filter(c => clasificarCampo(c) === 'ACTOR_SECRET');
export const esPedible = (c: CampoAfi) => CAMPOS_PEDIBLES.includes(c);

/** Campos que identifican al actor: nunca compartibles ni con fallback a otro actor; forman parte de su identidad. */
export const CAMPOS_IDENTIDAD_ACTOR = ['numeroIdentificacion'] as const satisfies readonly CampoAfi[];
const esIdentidad = (c: CampoAfi) => (CAMPOS_IDENTIDAD_ACTOR as readonly CampoAfi[]).includes(c);

/**
 * COMPARTIBLE significa "el framework PERMITE compartir este secreto si un humano lo decide para un actor", NUNCA "el
 * framework lo comparte automáticamente". Evidencia de compatibilidad (no verdad de negocio): el entorno vigente usa la
 * misma variable en dos o más perfiles. Solo campos pedibles; la identidad nunca. Fail-closed: sin decisión, secreto propio.
 */
export const CAMPOS_COMPARTIBLES: readonly CampoAfi[] = CAMPOS_PEDIBLES.filter(campo => {
  if (esIdentidad(campo)) return false;
  const variables = PERFILES_DATOS.map(p => VARIABLES_ACTOR[p][campo]).filter((v): v is string => !!v);
  return new Set(variables).size < variables.length;
});
export const esCompartible = (c: CampoAfi) => CAMPOS_COMPARTIBLES.includes(c);

/** Campos que pertenecen al actor (pueden describirse en una condición lógica; aportarlos depende de CAMPOS_PEDIBLES). */
export const esCampoDeActor = (c: CampoAfi) => POLITICAS_AFI[c].delActor;

/** Agrupación publicada al agente: qué puede mencionarse en una condición, qué se provisiona y qué resuelve solo el framework. */
export const CAMPOS_CONDICIONABLES: readonly CampoAfi[] = CAMPOS_AFI.filter(esCampoDeActor);
export const CAMPOS_AUTO_RESOLUBLES: readonly CampoAfi[] = CAMPOS_AFI.filter(c => ['DERIVED', 'AUXILIARY'].includes(clasificarCampo(c)));
export const CAMPOS_ACTOR_BASE: readonly CampoAfi[] = CAMPOS_AFI.filter(c => clasificarCampo(c) === 'ACTOR_BASE');

/**
 * Fuente por defecto de un campo pedido al convertir un requisito en ActorSlot, derivada de la resolución canónica:
 * pedible -> secreto PROPIO del slot. SHARED o BASE solo por decisión humana. Cualquier otra combinación: fail-closed.
 */
export function fuentePorDefecto(campo: CampoDato, participante = false): 'slot' {
  if (participante && esPedibleParticipante(campo)) return 'slot';
  if (!esCampoPersona(campo) && esPedible(campo) && clasificarCampo(campo) === 'ACTOR_SECRET') return 'slot';
  throw new DatosPruebaError('REQUISITO_INVALIDO', [{ motivo: 'CAMPO_NO_PEDIBLE', detalle: `${campo} no es pedible: no puede ser secreto de un actor` }]);
}

/** El actor base del perfil (actorDesdeEntorno) puede aportar el campo: metadato público o variable vigente. */
export const baseLoAporta = (perfil: PerfilActorAfi, c: CampoAfi) => c in VARIABLES_ACTOR[perfil] || c in actorDesdeEntorno(perfil, {}).datos;

/** Etiquetas para el analista (no desarrollador). */
export const ETIQUETAS_CAMPO: Readonly<Record<CampoAfi, string>> = {
  tipoAportante: 'Tipo de aportante', tipoAfiliado: 'Tipo de afiliado', tipoEmpleador: 'Tipo de empleador', naturaleza: 'Naturaleza',
  claseEmpleador: 'Clase de empleador', tipoIdentificacion: 'Tipo de identificación', numeroIdentificacion: 'Número de identificación',
  correo: 'Correo electrónico', confirmacionCorreo: 'Confirmación del correo', recibioAyudaAsesor: 'Recibió ayuda de asesor',
  autorizaDatos: 'Autorización de tratamiento de datos', autorizaIntimidad: 'Autorización de intimidad',
  razonSocial: 'Razón social de la empresa', codigoCiiu: 'Código CIIU', actividadEconomicaEmpresa: 'Actividad económica de la empresa',
  fechaInicioActividad: 'Fecha de inicio de la actividad económica', valorNomina: 'Valor total de la nómina',
  numeroTrabajadores: 'Número de trabajadores', afiliadoPrimeraVez: '¿Afiliado por primera vez?',
  cajaCompensacionAnterior: 'Caja de compensación anterior', numeroCelular: 'Número de celular',
  numeroTelefonoFijo: 'Número de teléfono fijo', fondoPensiones: 'Fondo de pensiones', actividad: 'Actividad económica',
  ingresoMensual: 'Ingreso mensual', nacionalidad: 'Nacionalidad', estadoCivil: 'Estado civil', salarioBasico: 'Salario básico',
  departamento: 'Departamento', ciudadVivienda: 'Ciudad de vivienda', localidad: 'Localidad', barrio: 'Barrio', viaPrincipal: 'Vía principal',
  letrasVp: 'Letras de la vía principal', sectorVp: 'Sector de la vía principal', letrasVg: 'Letras de la vía generadora',
  numeroVp: 'Número de la vía principal', numeroVg: 'Número de la vía generadora', numeroPredio: 'Número de predio',
};

// ---------- 5b. Campos de PERSONA de participantes y condiciones de aplicabilidad (diseño §7) ----------

/**
 * Datos de PERSONA de un participante (representante legal, contacto, responsable...). No son campos de preparación del
 * aportante (no tienen política de pantalla): solo existen como datos provisionables de un participante.
 */
export const CAMPOS_PERSONA = ['primerNombre', 'segundoNombre', 'primerApellido', 'segundoApellido'] as const;
export type CampoPersona = typeof CAMPOS_PERSONA[number];
/** Campo de un dato de prueba: del modelo AFI o de persona (participantes). */
export type CampoDato = CampoAfi | CampoPersona;
export const esCampoPersona = (c: unknown): c is CampoPersona => (CAMPOS_PERSONA as readonly unknown[]).includes(c);
export const esCampoDato = (c: unknown): c is CampoDato => esCampoPersona(c) || (CAMPOS_AFI as readonly unknown[]).includes(c);
/**
 * Lo que un PARTICIPANTE puede provisionar: no tiene actor base ni políticas propias, así que su tipo de identificación
 * (público, pero propio de esa persona) también es un dato provisionado.
 */
export const CAMPOS_PEDIBLES_PARTICIPANTE: readonly CampoDato[] = ['tipoIdentificacion', 'numeroIdentificacion', 'correo', ...CAMPOS_PERSONA];
export const esPedibleParticipante = (c: unknown): c is CampoDato => (CAMPOS_PEDIBLES_PARTICIPANTE as readonly unknown[]).includes(c);
const ETIQUETAS_PERSONA: Readonly<Record<CampoPersona, string>> = {
  primerNombre: 'Primer nombre', segundoNombre: 'Segundo nombre', primerApellido: 'Primer apellido', segundoApellido: 'Segundo apellido',
};
export const etiquetaDato = (c: CampoDato): string => (esCampoPersona(c) ? ETIQUETAS_PERSONA[c] : ETIQUETAS_CAMPO[c]);

/** Condición SEMÁNTICA de aplicabilidad de un dato: compara otro campo del MISMO sujeto con un literal público. */
export const OPERADORES_CONDICION = ['igual', 'distinto', 'en'] as const;
export type OperadorCondicion = typeof OPERADORES_CONDICION[number];
export interface CondicionCampo { campo: CampoDato; operador: OperadorCondicion; valor: string | string[] }

export function validarCondicionCampo(c: unknown, ruta: string, disponibles: readonly CampoDato[]): ProblemaDatos[] {
  if (!esObjeto(c)) return [{ motivo: 'ESQUEMA', detalle: `${ruta}: { campo, operador, valor }` }];
  const p: ProblemaDatos[] = [];
  for (const k of Object.keys(c)) if (!['campo', 'operador', 'valor'].includes(k)) p.push({ motivo: 'ESQUEMA', detalle: `${ruta}.${k.slice(0, 30)} no admitido` });
  if (!esCampoDato(c.campo) || !disponibles.includes(c.campo)) p.push({ motivo: 'CAMPO', detalle: `${ruta}.campo: debe ser un campo incondicional del mismo sujeto` });
  if (!(OPERADORES_CONDICION as readonly unknown[]).includes(c.operador)) p.push({ motivo: 'ESQUEMA', detalle: `${ruta}.operador: ${OPERADORES_CONDICION.join(' | ')}` });
  const valores = Array.isArray(c.valor) ? c.valor : [c.valor];
  if ((c.operador === 'en') !== Array.isArray(c.valor) || !valores.length || !valores.every(v => texto(v) && v.length <= 80)) {
    p.push({ motivo: 'ESQUEMA', detalle: `${ruta}.valor: literal público (lista solo con "en")` });
  }
  p.push(...contenidoNoPermitido({ condicion: c.valor }));
  return p;
}

/** Evalúa la condición con el valor (en memoria) del campo referido; undefined si ese valor aún no se conoce. */
export function evaluarCondicionCampo(c: CondicionCampo, valor: string | undefined): boolean | undefined {
  if (valor === undefined) return undefined;
  const n = (t: string) => t.replace(/\s+/g, ' ').trim();
  const vs = (Array.isArray(c.valor) ? c.valor : [c.valor]).map(n);
  if (c.operador === 'en') return vs.includes(n(valor));
  return c.operador === 'igual' ? n(valor) === vs[0] : n(valor) !== vs[0];
}

// ---------- 6. Secret refs deterministas ----------

export const PREFIJO_SECRET_ACTOR = 'AFI_ACTOR_';
export const PREFIJO_SECRET_SHARED = 'AFI_SHARED_';
/** Portable: mayúsculas, dígitos y guion bajo; empieza por letra; sin guiones bajos dobles ni finales. */
export const FORMA_SECRET_REF = /^AFI_(ACTOR|SHARED)_[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
export const MAX_SECRET_REF = 100;

/** Normaliza para un nombre de variable: sin tildes, camelCase separado, cualquier separador -> "_", MAYÚSCULAS. */
export function normalizarParaEnv(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

function exigirSecretRef(nombre: string, origen: string): string {
  if (!FORMA_SECRET_REF.test(nombre) || nombre.length > MAX_SECRET_REF) {
    throw new DatosPruebaError('SECRET_REF_INVALIDA', [{ motivo: 'ID_INVALIDO', detalle: `${origen} no produce un nombre de variable portable` }]);
  }
  return nombre;
}

/** AFI_ACTOR_<ACTOR_SLOT>_<CAMPO>. El agente expresa actor + campo; el nombre lo deriva SIEMPRE el framework. */
export const secretRefActor = (slot: string, campo: CampoDato) =>
  exigirSecretRef(`${PREFIJO_SECRET_ACTOR}${normalizarParaEnv(slot)}_${normalizarParaEnv(campo)}`, `${slot}.${campo}`);
/** AFI_SHARED_<SHARED_REF>. */
export const secretRefShared = (sharedRef: string) => exigirSecretRef(`${PREFIJO_SECRET_SHARED}${normalizarParaEnv(sharedRef)}`, sharedRef);

/** Colisiones: dos orígenes distintos que producen el MISMO nombre de variable. */
export function colisionesSecretRef(refs: readonly { secretRef: string; origen: string }[]): ProblemaDatos[] {
  const por = new Map<string, Set<string>>();
  for (const r of refs) por.set(r.secretRef, new Set([...(por.get(r.secretRef) ?? []), r.origen]));
  return [...por].filter(([, o]) => o.size > 1).map(([ref, o]) => ({ motivo: 'COLISION_SECRET_REF' as const, detalle: `${ref} lo producen ${[...o].sort().join(' y ')}` }));
}

// ---------- Contenido permitido ----------

/** Ids semánticos de slots, condiciones y shared refs: kebab-case corto. */
export const ID_DATOS = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const MAX_ID_DATOS = 60;
/** Ids de requisito: metadatos cortos sin espacios. */
export const ID_REQUISITO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
export const idDatosValido = (v: unknown): v is string => typeof v === 'string' && ID_DATOS.test(v) && v.length <= MAX_ID_DATOS;

/** El agente/registro nunca nombra variables ni secretos: los nombres de env son del framework. */
const DEFINE_ENV = /\bAFI_[A-Z0-9_]{2,}|process\.env|\$\{|\bsecret_?ref\b|\.env\b/i;
const CONTENIDO_PROHIBIDO: RegExp[] = [
  /=>|\bfunction\b|<\/?[a-z]+[\s>]|\beval\(/,
  /#[a-z][\w-]*|\[[a-z-]+\s*=|xpath|getBy|locator\(|querySelector/i,
  /https?:\/\//i,
];
/** Claves que delatan un intento de guardar o pedir VALORES o nombres de env. */
export const CLAVES_VALOR = /^(valor(es)?|values?|secret(o|os|s)?|secret_?refs?|env|entorno|variables?|dato(s)?_?real(es)?)$/i;

const texto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Escaneo de contenido: semántico (estricto) y metadatos (documentales). */
export function contenidoNoPermitido(semantico: unknown, metadatos: unknown = null): ProblemaDatos[] {
  const a = JSON.stringify(semantico ?? null), b = JSON.stringify(metadatos ?? null);
  const r: ProblemaDatos[] = [];
  if (DEFINE_ENV.test(a) || DEFINE_ENV.test(b)) r.push({ motivo: 'DEFINE_ENV', detalle: 'los nombres de variables y secretos los deriva el framework; nunca se escriben' });
  if (piiEnContenido(a) || piiEnMetadato(b)) r.push({ motivo: 'PII', detalle: 'posible dato personal: solo condiciones lógicas, sin valores' });
  if (CONTENIDO_PROHIBIDO.some(re => re.test(a) || re.test(b))) r.push({ motivo: 'CONTENIDO', detalle: 'código, selectores o URLs no permitidos' });
  return r;
}

/** Recorre claves anidadas buscando claves de valor (CLAVES_VALOR). */
export function clavesDeValor(v: unknown, ruta = ''): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => clavesDeValor(x, `${ruta}[${i}]`));
  if (!esObjeto(v)) return [];
  return Object.entries(v).flatMap(([k, x]) => [...(CLAVES_VALOR.test(k) ? [`${ruta}${ruta ? '.' : ''}${k}`] : []), ...clavesDeValor(x, `${ruta}${ruta ? '.' : ''}${k}`)]);
}

// ---------- 1. Condiciones lógicas ----------

/** Condición SEMÁNTICA de negocio que el actor debe cumplir (p. ej. "titular con estado inactivo"). Nunca un valor. */
export interface CondicionActor { id: string; descripcion: string }

export function validarCondiciones(v: unknown, ruta: string): ProblemaDatos[] {
  const p: ProblemaDatos[] = [];
  if (!Array.isArray(v) || !v.length) return [{ motivo: 'CONDICIONES', detalle: `${ruta}: lista no vacía de condiciones { id, descripcion }` }];
  const vistos = new Set<string>();
  v.forEach((c, i) => {
    const r = `${ruta}[${i}]`;
    if (!esObjeto(c)) { p.push({ motivo: 'CONDICIONES', detalle: `${r}: objeto { id, descripcion }` }); return; }
    for (const k of Object.keys(c)) if (!['id', 'descripcion'].includes(k)) p.push({ motivo: 'ESQUEMA', detalle: `${r}.${k.slice(0, 30)} no admitido` });
    if (!idDatosValido(c.id)) p.push({ motivo: 'ID_INVALIDO', detalle: `${r}.id: kebab-case semántico (máx. ${MAX_ID_DATOS})` });
    else if (vistos.has(c.id)) p.push({ motivo: 'CONDICIONES', detalle: `${r}.id repetido ${c.id}` });
    else vistos.add(c.id);
    if (!texto(c.descripcion) || c.descripcion.length > 200) p.push({ motivo: 'CONDICIONES', detalle: `${r}.descripcion: texto (máx. 200)` });
  });
  return p;
}

// ---------- 3. Identidad semántica ----------

/** (4S) `sujeto`: 'participante' para sujetos secundarios; ausente = actor principal. `rol` solo sugiere ids. */
export interface FirmaActor { perfil?: PerfilActorAfi; sujeto?: 'participante'; rol?: string; condiciones: readonly CondicionActor[]; campos: readonly CampoDato[] }

const canon = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const idsCondicion = (f: FirmaActor) => [...new Set(f.condiciones.map(c => c.id))].sort();

/**
 * Identidad de una CLASE de actor: perfil + conjunto canónico de condiciones + campos de identidad requeridos. NO depende
 * de las descripciones (texto libre) ni del orden. (4S) Un participante vive en otro espacio de identidad: nunca coincide
 * con un actor principal (el formato del principal no cambia).
 */
export function claveIdentidadActor(f: FirmaActor): string {
  const base = `${f.perfil ?? '-'}|${idsCondicion(f).join('+')}|${CAMPOS_IDENTIDAD_ACTOR.filter(c => (f.campos as readonly string[]).includes(c)).join('+')}`;
  return f.sujeto === 'participante' ? `participante:${base}` : base;
}

/**
 * IGUAL: misma identidad canónica (reutilizable). POSIBLE_DUPLICADO: mismo perfil y condiciones que se contienen, o
 * condiciones distintas con el mismo nombre normalizado o la misma descripción normalizada: decide un humano.
 * Nunca se fusionan condiciones "parecidas" automáticamente.
 * (4S) Principal y participante son siempre DISTINTOS. Entre participantes nunca hay IGUAL: mismo rol + mismas condiciones
 * NO implica el mismo sujeto (como mucho POSIBLE_DUPLICADO; un humano decide mismoActorQue o actoresDistintosDe).
 */
export function relacionActores(a: FirmaActor, b: FirmaActor): 'IGUAL' | 'POSIBLE_DUPLICADO' | 'DISTINTO' {
  if ((a.sujeto === 'participante') !== (b.sujeto === 'participante')) return 'DISTINTO';
  if (a.perfil !== b.perfil) return 'DISTINTO';
  if (claveIdentidadActor(a) === claveIdentidadActor(b)) return a.sujeto === 'participante' ? 'POSIBLE_DUPLICADO' : 'IGUAL';
  const ia = idsCondicion(a), ib = idsCondicion(b);
  if (ia.every(x => ib.includes(x)) || ib.every(x => ia.includes(x))) return 'POSIBLE_DUPLICADO';
  for (const x of a.condiciones) for (const y of b.condiciones) {
    if (x.id !== y.id && (canon(x.id) === canon(y.id) || canon(x.descripcion) === canon(y.descripcion))) return 'POSIBLE_DUPLICADO';
  }
  return 'DISTINTO';
}

/** Id de slot sugerido de forma determinista: perfil + condiciones canónicas (un humano puede corregirlo). */
export function idSlotSugerido(f: FirmaActor): string {
  // 4S: un participante se nombra por su rol (o "participante"); el principal, por su perfil (sin cambios).
  const base = [f.sujeto === 'participante' ? f.rol ?? 'participante' : f.perfil, ...idsCondicion(f)].join('-');
  return base.length <= MAX_ID_DATOS ? base : base.slice(0, MAX_ID_DATOS).replace(/-+[a-z0-9]*$/, '');
}

// ---------- 1. TestDataRequirement ----------

/** (4S) `rol`: el sujeto de esa ocurrencia es un PARTICIPANTE con ese rol semántico (trazabilidad, nunca identidad). */
export interface OcurrenciaDatos { hu: string; caso?: string; paso?: string; rol?: string }

/**
 * (4S) Rol reservado para el actor principal del caso en las relaciones entre sujetos. Los roles de participantes son
 * ids semánticos libres (kebab-case) que define el diseño QA; el framework no conoce ninguno.
 */
export const SUJETO_PRINCIPAL = 'principal';
export const rolParticipanteValido = (v: unknown): v is string => idDatosValido(v) && v !== SUJETO_PRINCIPAL;

/**
 * QUÉ dato necesita un caso: condiciones lógicas + campos. Sin valores, sin nombres de env.
 *  - sin `rol`: el ACTOR PRINCIPAL (aportante); `perfil` obligatorio (modelo 4P, sin cambios);
 *  - con `rol` (4S): un PARTICIPANTE secundario del caso con ese rol semántico; `perfil` solo si aplica.
 */
export interface TestDataRequirement {
  schemaVersion: typeof ESQUEMA_REQUISITO_DATOS;
  id: string;
  perfil?: PerfilActorAfi;
  /** (4S) Rol semántico del participante; ausente = actor principal. */
  rol?: string;
  condiciones: CondicionActor[];
  camposRequeridos: CampoDato[];
  /** (§7) Datos que solo se exigen cuando su condición semántica aplica (la condición referencia un campo de camposRequeridos). */
  camposCondicionales?: { campo: CampoDato; cuando: CondicionCampo }[];
  /** (§7) Ids de otros requisitos del MISMO lote que deben resolverse con un sujeto DISTINTO (relación distinto-sujeto). */
  distintoDe?: string[];
  ocurrencias: OcurrenciaDatos[];
  /** false: el caso necesita un actor PROPIO (no puede compartir slot con otro requisito). */
  reutilizable: boolean;
  /** Id semántico de actor sugerido (opcional): actor + campo es lo único que expresa el agente. */
  actorSugerido?: string;
}

export const FORMA_REQUISITO = {
  requeridos: ['schemaVersion', 'id', 'condiciones', 'camposRequeridos', 'ocurrencias', 'reutilizable'],
  /** perfil: obligatorio SIN rol (actor principal); opcional con rol (participante). */
  opcionales: ['perfil', 'rol', 'actorSugerido', 'camposCondicionales', 'distintoDe'],
  ocurrencia: { requeridos: ['hu'], opcionales: ['caso', 'paso', 'rol'] },
} as const;

export function validarCamposRequeridos(v: unknown, ruta: string, participante = false): ProblemaDatos[] {
  if (!Array.isArray(v) || !v.length) return [{ motivo: 'CAMPO', detalle: `${ruta}: lista no vacía de campos del actor` }];
  const p: ProblemaDatos[] = [];
  const vistos = new Set<string>();
  for (const c of v) {
    if (!esCampoDato(c)) { p.push({ motivo: 'CAMPO', detalle: `${ruta}: campo desconocido ${JSON.stringify(String(c).slice(0, 30))}` }); continue; }
    if (vistos.has(c)) p.push({ motivo: 'CAMPO', detalle: `${ruta}: campo repetido ${c}` });
    vistos.add(c);
    // Un participante provisiona su identificación, correo y nombres (no tiene actor base); el resto, como el principal.
    if (participante && esPedibleParticipante(c)) continue;
    if (esCampoPersona(c)) { p.push({ motivo: 'CAMPO_NO_PEDIBLE', detalle: `${ruta}: ${c} solo es provisionable para un participante` }); continue; }
    // Fail-closed: SOLO la fuente canónica (testData.camposPedibles). Una propiedad auto-resoluble puede ir en una
    // condición lógica, nunca aquí: camposRequeridos son datos que deben PROVISIONARSE.
    if (!esPedible(c as CampoAfi)) p.push({ motivo: 'CAMPO_NO_PEDIBLE', detalle: `${ruta}: ${c} es ${clasificarCampo(c as CampoAfi)}: no se provisiona (si define la clase de actor, va en una condición)` });
  }
  return p;
}

export function validarOcurrencias(v: unknown, ruta: string): ProblemaDatos[] {
  if (!Array.isArray(v) || !v.length) return [{ motivo: 'SIN_OCURRENCIAS', detalle: `${ruta}: al menos una ocurrencia { hu, caso?, paso? }` }];
  const p: ProblemaDatos[] = [];
  v.forEach((o, i) => {
    if (!esObjeto(o) || !texto(o.hu)) { p.push({ motivo: 'SIN_OCURRENCIAS', detalle: `${ruta}[${i}]: requiere hu` }); return; }
    for (const k of Object.keys(o)) {
      if (![...FORMA_REQUISITO.ocurrencia.requeridos, ...FORMA_REQUISITO.ocurrencia.opcionales].includes(k as never)) p.push({ motivo: 'ESQUEMA', detalle: `${ruta}[${i}].${k.slice(0, 30)} no admitido` });
      else if (typeof o[k] !== 'string' || !o[k]) p.push({ motivo: 'ESQUEMA', detalle: `${ruta}[${i}].${k}: texto` });
    }
    if (o.rol !== undefined && !rolParticipanteValido(o.rol)) p.push({ motivo: 'ID_INVALIDO', detalle: `${ruta}[${i}].rol: kebab-case semántico, distinto de "${SUJETO_PRINCIPAL}"` });
  });
  return p;
}

/** Validación fail-closed de un requisito (entrada NO confiable del agente). */
export function validarRequisito(r: unknown): ProblemaDatos[] {
  if (!esObjeto(r)) return [{ motivo: 'ESQUEMA', detalle: 'el requisito debe ser un objeto' }];
  const p: ProblemaDatos[] = [];
  // Excepción ÚNICA: el literal PÚBLICO de una condición de aplicabilidad (lo valida validarCondicionCampo), nunca un dato del actor.
  for (const k of clavesDeValor(r).filter(x => !/^camposCondicionales\[\d+\]\.cuando\.valor$/.test(x))) {
    p.push({ motivo: 'DEFINE_ENV', detalle: `${k.slice(0, 40)}: un requisito nunca lleva valores ni nombres de variables` });
  }
  for (const k of Object.keys(r)) {
    if (![...FORMA_REQUISITO.requeridos, ...FORMA_REQUISITO.opcionales].includes(k as never) && !CLAVES_VALOR.test(k)) p.push({ motivo: 'ESQUEMA', detalle: `${k.slice(0, 30)} no pertenece al requisito` });
  }
  if (r.schemaVersion !== ESQUEMA_REQUISITO_DATOS) p.push({ motivo: 'ESQUEMA', detalle: `schemaVersion ${ESQUEMA_REQUISITO_DATOS} requerido` });
  if (typeof r.id !== 'string' || !ID_REQUISITO.test(r.id)) p.push({ motivo: 'ID_INVALIDO', detalle: 'id: letras, dígitos, punto, guion o guion bajo (máx. 80)' });
  // 4S: sin rol = actor principal (perfil obligatorio, como en 4P); con rol = participante (perfil solo si aplica).
  if (r.rol !== undefined && !rolParticipanteValido(r.rol)) p.push({ motivo: 'ID_INVALIDO', detalle: `rol: kebab-case semántico, distinto de "${SUJETO_PRINCIPAL}"` });
  if ((r.rol === undefined || r.perfil !== undefined) && !(PERFILES_DATOS as unknown[]).includes(r.perfil)) {
    p.push({ motivo: 'PERFIL', detalle: r.perfil === undefined ? 'perfil requerido para el actor principal (sin rol)' : `perfil desconocido ${JSON.stringify(String(r.perfil).slice(0, 30))}` });
  }
  if (Array.isArray(r.ocurrencias) && r.ocurrencias.some(o => esObjeto(o) && o.rol !== undefined && o.rol !== r.rol)) {
    p.push({ motivo: 'ESQUEMA', detalle: 'ocurrencias[].rol debe coincidir con el rol del requisito (o omitirse)' });
  }
  p.push(...validarCondiciones(r.condiciones, 'condiciones'));
  p.push(...validarCamposRequeridos(r.camposRequeridos, 'camposRequeridos', r.rol !== undefined));
  if (r.camposCondicionales !== undefined) {
    const base = Array.isArray(r.camposRequeridos) ? r.camposRequeridos.filter(esCampoDato) : [];
    if (!Array.isArray(r.camposCondicionales) || !r.camposCondicionales.length) p.push({ motivo: 'ESQUEMA', detalle: 'camposCondicionales: si se declara, lista no vacía de { campo, cuando }' });
    else r.camposCondicionales.forEach((x, i) => {
      const ruta = `camposCondicionales[${i}]`;
      if (!esObjeto(x)) { p.push({ motivo: 'ESQUEMA', detalle: `${ruta}: { campo, cuando }` }); return; }
      for (const k of Object.keys(x)) if (!['campo', 'cuando'].includes(k)) p.push({ motivo: 'ESQUEMA', detalle: `${ruta}.${k.slice(0, 30)} no admitido` });
      p.push(...validarCamposRequeridos([x.campo], `${ruta}.campo`, r.rol !== undefined));
      if (base.includes(x.campo as CampoDato)) p.push({ motivo: 'CAMPO', detalle: `${ruta}.campo: ya es incondicional` });
      p.push(...validarCondicionCampo(x.cuando, `${ruta}.cuando`, base));
    });
  }
  if (r.distintoDe !== undefined && (!Array.isArray(r.distintoDe) || !r.distintoDe.length
    || !r.distintoDe.every(x => typeof x === 'string' && ID_REQUISITO.test(x) && x !== r.id))) {
    p.push({ motivo: 'ESQUEMA', detalle: 'distintoDe: ids de otros requisitos (nunca el propio)' });
  }
  p.push(...validarOcurrencias(r.ocurrencias, 'ocurrencias'));
  if (typeof r.reutilizable !== 'boolean') p.push({ motivo: 'ESQUEMA', detalle: 'reutilizable: booleano' });
  if (r.actorSugerido !== undefined && !idDatosValido(r.actorSugerido)) p.push({ motivo: 'ID_INVALIDO', detalle: 'actorSugerido: kebab-case semántico' });
  p.push(...contenidoNoPermitido({ condiciones: r.condiciones, actor: r.actorSugerido, rol: r.rol }, { id: r.id, ocurrencias: r.ocurrencias }));
  return p;
}

// ---------- 2. ActorSlot ----------

/**
 * De dónde sale el valor de un campo del slot (capas 1-2 de la resolución):
 *  - slot:   secreto ESPECÍFICO del slot (AFI_ACTOR_<SLOT>_<CAMPO>); con fallbackBase, si falta, el actor base del perfil;
 *  - shared: secreto COMPARTIDO declarado (AFI_SHARED_<REF>), solo para campos compartibles;
 *  - base:   el actor base del MISMO perfil (actorDesdeEntorno), solo para campos compartibles o públicos del actor.
 */
export type FuenteCampoSlot = 'slot' | 'shared' | 'base';
export interface CampoSlot {
  campo: CampoDato; fuente: FuenteCampoSlot; sharedRef?: string; fallbackBase?: true;
  /** (§7) Solo se exige cuando la condición aplica (referencia otro campo incondicional del mismo slot). */
  cuando?: CondicionCampo;
}

/** Provisión declarativa (sin secretos): QA aún debe conseguir un actor que cumpla las condiciones, o ya lo hizo. */
export const ESTADOS_SLOT = ['pendiente-provisionar', 'provisionado'] as const;
export type EstadoSlot = typeof ESTADOS_SLOT[number];

/**
 * Una CLASE de actor de prueba (no una persona), reutilizable entre HU y casos.
 * (4S) `sujeto: 'participante'`: clase de sujeto SECUNDARIO de un caso (no el aportante). Su rol lo fija cada caso que lo
 * usa (el mismo slot puede servir a roles distintos en casos distintos); `perfil` solo si aplica; sus campos solo pueden
 * venir de secretos propios (slot) o compartidos declarados, nunca del actor base de un perfil.
 */
export interface ActorSlot {
  id: string;
  perfil?: PerfilActorAfi;
  sujeto?: 'participante';
  condiciones: CondicionActor[];
  campos: CampoSlot[];
  /** Metadatos: requisitos y ocurrencias que lo usan (trazabilidad, nunca identidad). */
  origen: { requisitos: string[]; ocurrencias: OcurrenciaDatos[] };
  estado: EstadoSlot;
}

/** Secreto compartido declarado (p. ej. buzón QA): un campo compartible y un id semántico. */
export interface CompartidoDeclarado { id: string; campo: CampoAfi; descripcion: string }

/** (4S) `participante`: sin capa base (ni fallbackBase): un sujeto secundario nunca toma datos del actor base de un perfil. */
export function validarCamposSlot(perfil: PerfilActorAfi | undefined, v: unknown, ruta: string, participante = false): ProblemaDatos[] {
  if (!Array.isArray(v) || !v.length) return [{ motivo: 'CAMPO', detalle: `${ruta}: lista no vacía de { campo, fuente }` }];
  const p: ProblemaDatos[] = [];
  const vistos = new Set<string>();
  v.forEach((x, i) => {
    const r = `${ruta}[${i}]`;
    if (!esObjeto(x)) { p.push({ motivo: 'CAMPO', detalle: `${r}: objeto { campo, fuente, sharedRef?, fallbackBase? }` }); return; }
    for (const k of Object.keys(x)) if (!['campo', 'fuente', 'sharedRef', 'fallbackBase', 'cuando'].includes(k)) p.push({ motivo: 'ESQUEMA', detalle: `${r}.${k.slice(0, 30)} no admitido` });
    const c = x.campo;
    if (!esCampoDato(c)) { p.push({ motivo: 'CAMPO', detalle: `${r}.campo desconocido` }); return; }
    if (vistos.has(c)) p.push({ motivo: 'CAMPO', detalle: `${r}: campo repetido ${c}` });
    vistos.add(c);
    if (x.cuando !== undefined) {
      const incondicionales = v.filter(y => esObjeto(y) && y.cuando === undefined && esCampoDato(y.campo)).map(y => (y as { campo: CampoDato }).campo);
      p.push(...validarCondicionCampo(x.cuando, `${r}.cuando`, incondicionales.filter(y => y !== c)));
    }
    // (§7) Participante: su identificación, correo y nombres son secretos propios del slot.
    if (participante && esPedibleParticipante(c)) {
      if (x.fuente !== 'slot' || x.fallbackBase !== undefined || x.sharedRef !== undefined) {
        if (!(x.fuente === 'shared' && esCompartible(c as CampoAfi) && idDatosValido(x.sharedRef))) p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}: un participante provisiona ${c} como secreto propio (slot) o compartido` });
      }
      return;
    }
    if (esCampoPersona(c)) { p.push({ motivo: 'CAMPO_NO_PEDIBLE', detalle: `${r}: ${c} solo existe en participantes` }); return; }
    const campo = c as CampoAfi;
    if (!esCampoDeActor(campo)) { p.push({ motivo: 'CAMPO_NO_SECRETO', detalle: `${r}: ${campo} es ${clasificarCampo(campo)}: no lleva secreto` }); return; }
    // Fuente canónica: solo un campo PEDIBLE puede ser secreto del slot (slot/shared/base compartible); un público del
    // actor solo base. Un auto-resoluble (derived/auxiliary) nunca entra al slot aunque su sensibilidad sea pii.
    const secreto = esPedible(campo);
    if (!secreto && clasificarCampo(campo) !== 'ACTOR_BASE') {
      p.push({ motivo: 'CAMPO_NO_PEDIBLE', detalle: `${r}: ${campo} es ${clasificarCampo(campo)}: lo resuelve el framework, no puede ser dato del actor` });
      return;
    }
    if (x.fuente === 'slot') {
      if (!secreto) p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}: ${campo} es público: fuente base, nunca un secreto del slot` });
      if (x.fallbackBase !== undefined && (x.fallbackBase !== true || !esCompartible(campo))) p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}: fallbackBase solo para campos compartibles` });
      if (x.fallbackBase === true && (participante || !perfil)) p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}: un participante no tiene actor base (sin fallbackBase)` });
      else if (x.fallbackBase === true && !baseLoAporta(perfil!, campo)) p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}: el actor base de ${perfil} no aporta ${campo}` });
    } else if (x.fuente === 'shared') {
      if (!esCompartible(campo)) p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}: ${campo} no es compartible` });
      if (!idDatosValido(x.sharedRef)) p.push({ motivo: 'REFERENCIA', detalle: `${r}.sharedRef requerido (kebab-case)` });
      if (x.fallbackBase !== undefined) p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}: fallbackBase solo con fuente slot` });
    } else if (x.fuente === 'base') {
      if (participante || !perfil) { p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}: un participante no tiene actor base: fuente slot o shared` }); return; }
      if (secreto && !esCompartible(campo)) p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}: ${campo} no es compartible: requiere un secreto del slot` });
      if (!baseLoAporta(perfil, campo)) p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}: el actor base de ${perfil} no aporta ${campo}` });
      if (x.fallbackBase !== undefined) p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}: fallbackBase solo con fuente slot` });
    } else p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}.fuente: slot | shared | base` });
    if (x.fuente !== 'shared' && x.sharedRef !== undefined) p.push({ motivo: 'FUENTE_CAMPO', detalle: `${r}: sharedRef solo con fuente shared` });
  });
  return p;
}

export function validarSlot(s: unknown, ruta = 'slot'): ProblemaDatos[] {
  if (!esObjeto(s)) return [{ motivo: 'ESQUEMA', detalle: `${ruta}: objeto` }];
  const p: ProblemaDatos[] = [];
  for (const k of Object.keys(s)) if (!['id', 'perfil', 'sujeto', 'condiciones', 'campos', 'origen', 'estado'].includes(k)) p.push({ motivo: 'ESQUEMA', detalle: `${ruta}.${k.slice(0, 30)} no admitido` });
  if (!idDatosValido(s.id)) p.push({ motivo: 'ID_INVALIDO', detalle: `${ruta}.id: kebab-case semántico (máx. ${MAX_ID_DATOS})` });
  if (s.sujeto !== undefined && s.sujeto !== 'participante') p.push({ motivo: 'ESQUEMA', detalle: `${ruta}.sujeto: solo "participante" (ausente = actor principal)` });
  const participante = s.sujeto === 'participante';
  // 4S: el actor principal exige perfil (4P); un participante solo si aplica.
  const perfilOk = (PERFILES_DATOS as unknown[]).includes(s.perfil);
  if (!perfilOk && (!participante || s.perfil !== undefined)) p.push({ motivo: 'PERFIL', detalle: `${ruta}.perfil desconocido` });
  p.push(...validarCondiciones(s.condiciones, `${ruta}.condiciones`));
  if (perfilOk || (participante && s.perfil === undefined)) p.push(...validarCamposSlot(s.perfil as PerfilActorAfi | undefined, s.campos, `${ruta}.campos`, participante));
  // Las ocurrencias con rol pertenecen a participantes.
  if (!participante && esObjeto(s.origen) && Array.isArray(s.origen.ocurrencias) && s.origen.ocurrencias.some(o => esObjeto(o) && o.rol !== undefined)) {
    p.push({ motivo: 'ESQUEMA', detalle: `${ruta}.origen.ocurrencias: rol solo en participantes` });
  }
  if (!(ESTADOS_SLOT as readonly unknown[]).includes(s.estado)) p.push({ motivo: 'ESQUEMA', detalle: `${ruta}.estado: ${ESTADOS_SLOT.join(' | ')}` });
  const o = s.origen;
  if (!esObjeto(o) || !Array.isArray(o.requisitos) || !o.requisitos.every(x => typeof x === 'string' && ID_REQUISITO.test(x)) || !Array.isArray(o.ocurrencias)) {
    p.push({ motivo: 'ESQUEMA', detalle: `${ruta}.origen: { requisitos: id[], ocurrencias: [] }` });
  } else {
    for (const k of Object.keys(o)) if (!['requisitos', 'ocurrencias'].includes(k)) p.push({ motivo: 'ESQUEMA', detalle: `${ruta}.origen.${k.slice(0, 30)} no admitido` });
    if (o.ocurrencias.length) p.push(...validarOcurrencias(o.ocurrencias, `${ruta}.origen.ocurrencias`));
  }
  p.push(...contenidoNoPermitido({ id: s.id, condiciones: s.condiciones }, s.origen));
  return p;
}

export function validarCompartido(c: unknown, ruta = 'compartido'): ProblemaDatos[] {
  if (!esObjeto(c)) return [{ motivo: 'ESQUEMA', detalle: `${ruta}: objeto { id, campo, descripcion }` }];
  const p: ProblemaDatos[] = [];
  for (const k of Object.keys(c)) if (!['id', 'campo', 'descripcion'].includes(k)) p.push({ motivo: 'ESQUEMA', detalle: `${ruta}.${k.slice(0, 30)} no admitido` });
  if (!idDatosValido(c.id)) p.push({ motivo: 'ID_INVALIDO', detalle: `${ruta}.id: kebab-case semántico` });
  if (typeof c.campo !== 'string' || !esCompartible(c.campo as CampoAfi)) p.push({ motivo: 'FUENTE_CAMPO', detalle: `${ruta}.campo: debe ser compartible (${CAMPOS_COMPARTIBLES.join(', ')})` });
  if (!texto(c.descripcion) || c.descripcion.length > 200) p.push({ motivo: 'ESQUEMA', detalle: `${ruta}.descripcion: texto (máx. 200)` });
  p.push(...contenidoNoPermitido({ id: c.id, descripcion: c.descripcion }));
  return p;
}

/** Nombres de variable que usa un slot (solo nombres). La capa base usa las variables VIGENTES del perfil. */
export function secretRefsDeSlot(s: ActorSlot): { campo: CampoDato; secretRef: string; capa: FuenteCampoSlot; alternativa?: string }[] {
  return s.campos.map(c => {
    if (c.fuente === 'shared') return { campo: c.campo, secretRef: secretRefShared(c.sharedRef!), capa: 'shared' as const };
    // 4S: un participante no tiene capa base (validarSlot lo garantiza).
    const base = s.perfil && s.sujeto !== 'participante' && !esCampoPersona(c.campo) ? VARIABLES_ACTOR[s.perfil][c.campo] : undefined;
    if (c.fuente === 'base') return { campo: c.campo, secretRef: base ?? '(metadato público del perfil)', capa: 'base' as const };
    return { campo: c.campo, secretRef: secretRefActor(s.id, c.campo), capa: 'slot' as const, ...(c.fallbackBase && base ? { alternativa: base } : {}) };
  });
}
