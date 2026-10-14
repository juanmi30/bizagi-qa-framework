/**
 * Plan funcional AFI (Fase 2D): acciones y assertions que vienen del DISEÑO QA.
 * No es preparación: nunca pasa por el resolver ni por POLITICAS_AFI.
 *
 * Contrato JSON puro (pensado para que un agente lo genere): sin funciones, RegExp,
 * selectores, Locator ni Page. Capacidades de CP04 P04-P06 (2D) y de Información de contacto desktop (4D).
 * Campos, componentes y fuentes son catálogos cerrados: el driver los mapea a la UI.
 */

import { REGISTRO_CAMPOS_FUNCIONALES, definicionCampo, type CapacidadControl, type IdCampoRegistrado, type RegistroCampos } from './aplicacion/campos';
import { EXPECTATIVAS_POR_ENTIDAD, TIPOS_ENTIDAD, type Expectativa, type ReferenciaEntidad, type TipoEntidad } from './aplicacion/superficies';

/**
 * Campos que un plan funcional puede nombrar: PROYECCIÓN del Field Registry (aplicacion/campos.ts, Fase 4J).
 * Añadir un campo es declararlo allí; el validador y el driver lo consultan sin cambios aquí.
 */
export const CAMPOS_CONTACTO_FUNCIONAL = Object.freeze(Object.keys(REGISTRO_CAMPOS_FUNCIONALES)) as readonly IdCampoRegistrado[];
export type CampoContactoFuncional = IdCampoRegistrado;

/** Componentes visuales con nombre (Fase 4D). El driver los mapea a la UI; el plan nunca aporta selectores. */
export const COMPONENTES_FUNCIONALES_AFI = ['alerta-territorial', 'subtitulo-localizacion-vivienda'] as const;
export type ComponenteFuncionalAfi = typeof COMPONENTES_FUNCIONALES_AFI[number];

/**
 * Fuentes autoritativas de catálogo (Fase 4D): qué campo pueden describir y qué campo filtra.
 * El proveedor (cómo se lee la fuente) es del framework; el plan solo nombra el id.
 */
export const FUENTES_AUTORITATIVAS_AFI = {
  'parametrica-ciudad-nacional': {
    campos: ['ciudadVivienda'],
    filtros: ['departamento'],
  },
} as const satisfies Record<string, { campos: readonly CampoContactoFuncional[]; filtros: readonly CampoContactoFuncional[] }>;
export type FuenteAutoritativaAfi = keyof typeof FUENTES_AUTORITATIVAS_AFI;

export const NORMALIZACIONES = ['texto-es'] as const;
export type NormalizacionAfi = typeof NORMALIZACIONES[number];
export const RELACIONES_POSICION = ['debajo-de', 'encima-de'] as const;
/** Regiones canónicas de la pantalla (4D.1). Solo las que pide un requisito actual. */
export const REGIONES_COMPONENTE = ['superior'] as const;
export type RegionComponenteAfi = typeof REGIONES_COMPONENTE[number];
export const ESTADOS_CAMPO = ['editable', 'solo-lectura'] as const;
export const COMPARACIONES_VALOR = ['exacta', 'texto-es'] as const;
export const RELACIONES_FUENTE = ['igual'] as const;
/** Búsqueda en autocomplete (4E). Solo lo que un requisito actual define. */
export const COINCIDENCIAS_BUSQUEDA = ['contiene'] as const;
export const DIACRITICOS_BUSQUEDA = ['sensibles'] as const;
/** Sin valor por defecto: el tratamiento de mayúsculas lo declara el diseño/requerimiento, nunca el framework. */
export const MAYUSCULAS_BUSQUEDA = ['sensibles', 'insensibles'] as const;
export interface ReglaBusqueda {
  coincidencia: typeof COINCIDENCIAS_BUSQUEDA[number];
  diacriticos: typeof DIACRITICOS_BUSQUEDA[number];
  mayusculas: typeof MAYUSCULAS_BUSQUEDA[number];
}

export type OperacionFuncionalAfi =
  /** 'exacta': texto completo; 'contiene': subcadena (sin distinguir mayúsculas). */
  | { tipo: 'texto-ausente'; texto: string; coincidencia: 'exacta' | 'contiene'; evidencia?: string }
  /** Abre el catálogo y exige al menos una opción fuera de `excluir`, comparando con normalizarTextoCatalogo. */
  | { tipo: 'catalogo-opcion-fuera-de'; campo: CampoContactoFuncional; excluir: readonly string[]; normalizacion: NormalizacionAfi; evidencia?: string }
  | { tipo: 'catalogo-no-vacio'; campo: CampoContactoFuncional; evidencia?: string }
  /**
   * Exige exactamente una opción coincidente y la elige. Sin `normalizacion`: texto literal (semántica v1 original).
   * Con `normalizacion`: exactamente una opción cuya forma normalizada coincida; se elige ESA opción observada.
   */
  | { tipo: 'seleccionar-exacto'; campo: CampoContactoFuncional; valor: string; normalizacion?: NormalizacionAfi }
  /** Cierra el catálogo abierto sin seleccionar. */
  | { tipo: 'cerrar-catalogo'; campo: CampoContactoFuncional }
  // ---- Fase 4D ----
  | { tipo: 'componente-visible'; componente: ComponenteFuncionalAfi; evidencia?: string }
  | { tipo: 'componente-posicion'; componente: ComponenteFuncionalAfi; relacion: typeof RELACIONES_POSICION[number]; referencia: ComponenteFuncionalAfi; evidencia?: string }
  /** El componente está en una región canónica de la pantalla (regla del framework, ver REGLAS_REGION). */
  | { tipo: 'componente-region'; componente: ComponenteFuncionalAfi; region: RegionComponenteAfi; evidencia?: string }
  | { tipo: 'campo-estado'; campo: CampoContactoFuncional; estado: typeof ESTADOS_CAMPO[number]; evidencia?: string }
  /** Exactamente una de las dos formas: { valor, comparacion } o { vacio: true }. */
  | { tipo: 'campo-valor'; campo: CampoContactoFuncional; valor: string; comparacion: typeof COMPARACIONES_VALOR[number]; evidencia?: string }
  | { tipo: 'campo-valor'; campo: CampoContactoFuncional; vacio: true; evidencia?: string }
  /** Acción: limpia y teclea el texto. Sin assertion implícita. */
  | { tipo: 'escribir'; campo: CampoContactoFuncional; texto: string }
  /** Assertion con acción: teclea carácter a carácter y exige que el valor no cambie con ninguno. */
  | { tipo: 'entrada-rechazada'; campo: CampoContactoFuncional; texto: string; evidencia?: string }
  /** Acción: el campo pierde el foco sin navegar, guardar ni elegir opción. */
  | { tipo: 'salir-del-campo'; campo: CampoContactoFuncional }
  /** Compara el catálogo abierto con la fuente, filtrada por el valor ACTUAL de otro campo. */
  | {
    tipo: 'catalogo-segun-fuente'; campo: CampoContactoFuncional; fuente: FuenteAutoritativaAfi; filtroDesdeCampo: CampoContactoFuncional;
    relacion: typeof RELACIONES_FUENTE[number]; normalizacion: NormalizacionAfi; evidencia?: string;
  }
  /**
   * Assertion SIN mutación sobre las sugerencias ya abiertas tras escribir: no vacías, todas en la fuente
   * (pertenencia con `normalizacion`) y todas cumpliendo la regla de búsqueda respecto de `textoBusqueda`.
   */
  | ({
    tipo: 'sugerencias-segun-fuente'; campo: CampoContactoFuncional; fuente: FuenteAutoritativaAfi; filtroDesdeCampo: CampoContactoFuncional;
    normalizacion: NormalizacionAfi; textoBusqueda: string; evidencia?: string;
  } & ReglaBusqueda);

export type TipoOperacionFuncional = OperacionFuncionalAfi['tipo'];

/**
 * (4R.1) Condición observable de un paso: la representación verificable SUFICIENTE de su `esperado` cuando el hecho no
 * está en el Portal. Solo SEMÁNTICA (entidad registrada + expectativa): nunca proveedor, superficie, nombre visible,
 * selector, endpoint ni credenciales. El compilador la resuelve: entidad -> superficies efectivas -> vínculo -> proveedor.
 */
export interface CondicionPasoAfi { entidad: ReferenciaEntidad; expectativa: Expectativa }

export interface PasoFuncionalAfi {
  /** Id del paso certificado (P04, P05...). */
  id: string;
  /** Resultado esperado literal del diseño QA. */
  esperado: string;
  /** Puede quedar vacía SOLO si el paso tiene condiciones (su esperado no se observa en el Portal). */
  operaciones: OperacionFuncionalAfi[];
  /** (4R.1) Opcional y aditiva: condiciones observables del mismo esperado. */
  condiciones?: CondicionPasoAfi[];
}

export interface PlanFuncionalAfi {
  caso: string;
  pasos: PasoFuncionalAfi[];
}

/** Observación serializable de una operación. Solo datos públicos. */
export interface ResultadoOperacionAfi {
  tipo: TipoOperacionFuncional;
  campo?: CampoContactoFuncional;
  valorEsperado?: string;
  resultado: 'PASS' | 'FAIL';
  observado: Record<string, string | number | boolean>;
}

// ---------- Validación estática ----------

/** Propiedades permitidas por operación: cualquier otra (selector, regex, callback...) invalida el plan. */
export const CONTRATO:Record<TipoOperacionFuncional, { requeridas: readonly string[]; opcionales: readonly string[] }> = {
  'texto-ausente': { requeridas: ['texto', 'coincidencia'], opcionales: ['evidencia'] },
  'catalogo-opcion-fuera-de': { requeridas: ['campo', 'excluir', 'normalizacion'], opcionales: ['evidencia'] },
  'catalogo-no-vacio': { requeridas: ['campo'], opcionales: ['evidencia'] },
  'seleccionar-exacto': { requeridas: ['campo', 'valor'], opcionales: ['normalizacion'] },
  'cerrar-catalogo': { requeridas: ['campo'], opcionales: [] },
  'componente-visible': { requeridas: ['componente'], opcionales: ['evidencia'] },
  'componente-posicion': { requeridas: ['componente', 'relacion', 'referencia'], opcionales: ['evidencia'] },
  'componente-region': { requeridas: ['componente', 'region'], opcionales: ['evidencia'] },
  'campo-estado': { requeridas: ['campo', 'estado'], opcionales: ['evidencia'] },
  // Dos formas excluyentes; la exclusión la valida validarPlanFuncionalAfi.
  'campo-valor': { requeridas: ['campo'], opcionales: ['valor', 'comparacion', 'vacio', 'evidencia'] },
  escribir: { requeridas: ['campo', 'texto'], opcionales: [] },
  'entrada-rechazada': { requeridas: ['campo', 'texto'], opcionales: ['evidencia'] },
  'salir-del-campo': { requeridas: ['campo'], opcionales: [] },
  'catalogo-segun-fuente': { requeridas: ['campo', 'fuente', 'filtroDesdeCampo', 'relacion', 'normalizacion'], opcionales: ['evidencia'] },
  'sugerencias-segun-fuente': {
    requeridas: ['campo', 'fuente', 'filtroDesdeCampo', 'normalizacion', 'textoBusqueda', 'coincidencia', 'diacriticos', 'mayusculas'],
    opcionales: ['evidencia'],
  },
};

export interface ProblemaPlanFuncional {
  /** Ruta dentro del plan, p. ej. pasos[1].operaciones[0].campo */
  ruta: string;
  /** capability: el framework no sabe ejecutarlo; invalido: el plan está mal formado. */
  clase: 'capability' | 'invalido';
  mensaje: string;
}

/** El diseño pide algo que AFI no sabe ejecutar. Distinto de DataGapError (falta un dato). */
export class CapabilityGapError extends Error {
  constructor(readonly problemas: readonly ProblemaPlanFuncional[]) {
    super(`CapabilityGap en el plan funcional:\n${problemas.map(p => `- ${p.ruta}: ${p.mensaje}`).join('\n')}`);
    this.name = 'CapabilityGapError';
  }
}

export class PlanFuncionalInvalidoError extends Error {
  constructor(readonly problemas: readonly ProblemaPlanFuncional[]) {
    super(`Plan funcional inválido:\n${problemas.map(p => `- ${p.ruta}: ${p.mensaje}`).join('\n')}`);
    this.name = 'PlanFuncionalInvalidoError';
  }
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const textoNoVacio = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
/** Los mensajes citan nombres del contrato, acotados: el plan puede venir de un agente. */
const citar = (v: unknown) => JSON.stringify(String(v).slice(0, 60));

/**
 * Capacidad de control que cada operación exige al campo que nombra (null: no nombra campo).
 * Es la ÚNICA regla de aplicabilidad: un campo nuevo del registro es utilizable por toda operación cuya capacidad
 * ofrezca su control (aplicacion/campos.ts CAPACIDADES_CONTROL), sin editar la operación.
 */
export const CAPACIDAD_REQUERIDA: Readonly<Record<TipoOperacionFuncional, CapacidadControl | null>> = Object.freeze({
  'texto-ausente': null,
  'catalogo-opcion-fuera-de': 'catalogo',
  'catalogo-no-vacio': 'catalogo',
  'seleccionar-exacto': 'catalogo',
  'cerrar-catalogo': 'catalogo',
  'componente-visible': null,
  'componente-posicion': null,
  'componente-region': null,
  'campo-estado': 'estado',
  'campo-valor': 'valor',
  escribir: 'texto',
  'entrada-rechazada': 'texto',
  'salir-del-campo': 'estado',
  'catalogo-segun-fuente': 'catalogo',
  'sugerencias-segun-fuente': 'sugerencias',
});

/** Validación pura, sin UI. Acumula todos los problemas. `registro`: Field Registry (por defecto el canónico). */
export function validarPlanFuncionalAfi(plan: unknown, registro: RegistroCampos = REGISTRO_CAMPOS_FUNCIONALES): ProblemaPlanFuncional[] {
  const campoConocido = (v: unknown) => typeof v === 'string' && definicionCampo(registro, v) !== undefined;
  const problemas: ProblemaPlanFuncional[] = [];
  const invalido = (ruta: string, mensaje: string) => problemas.push({ ruta, clase: 'invalido', mensaje });
  const capability = (ruta: string, mensaje: string) => problemas.push({ ruta, clase: 'capability', mensaje });

  if (!esObjeto(plan)) { invalido('plan', 'debe ser un objeto'); return problemas; }
  if (!textoNoVacio(plan.caso)) invalido('caso', 'falta el identificador del caso');
  if (!Array.isArray(plan.pasos) || !plan.pasos.length) { invalido('pasos', 'debe ser una lista no vacía'); return problemas; }

  const ids = new Set<string>();
  plan.pasos.forEach((paso: unknown, i) => {
    const rp = `pasos[${i}]`;
    if (!esObjeto(paso)) { invalido(rp, 'debe ser un objeto'); return; }
    if (!textoNoVacio(paso.id)) invalido(`${rp}.id`, 'paso sin id');
    else if (ids.has(paso.id)) invalido(`${rp}.id`, `id de paso duplicado ${citar(paso.id)}`);
    else ids.add(paso.id);
    if (!textoNoVacio(paso.esperado)) invalido(`${rp}.esperado`, 'falta el resultado esperado');
    // (4R.1) Paso cerrado: una clave desconocida (o unas condiciones mal escritas) nunca se ignora en silencio.
    for (const k of Object.keys(paso)) if (!(CLAVES_PASO as readonly string[]).includes(k)) invalido(`${rp}.${k}`, 'propiedad no admitida por el paso');
    const conCondiciones = Array.isArray(paso.condiciones) && paso.condiciones.length > 0;
    if (paso.condiciones !== undefined) validarCondiciones(paso.condiciones, `${rp}.condiciones`, invalido);
    if (!Array.isArray(paso.operaciones) || (!paso.operaciones.length && !conCondiciones)) { invalido(`${rp}.operaciones`, 'debe ser una lista no vacía'); return; }

    paso.operaciones.forEach((op: unknown, j) => {
      const ro = `${rp}.operaciones[${j}]`;
      if (!esObjeto(op)) { invalido(ro, 'debe ser un objeto'); return; }
      const contrato = typeof op.tipo === 'string' && Object.prototype.hasOwnProperty.call(CONTRATO, op.tipo)
        ? CONTRATO[op.tipo as TipoOperacionFuncional] : undefined;
      if (!contrato) { capability(`${ro}.tipo`, `La operación ${citar(op.tipo)} no está soportada por AFI.`); return; }

      for (const clave of Object.keys(op)) {
        if (clave !== 'tipo' && !contrato.requeridas.includes(clave) && !contrato.opcionales.includes(clave)) {
          invalido(`${ro}.${clave}`, `propiedad no admitida por ${op.tipo}`);
        }
      }
      for (const clave of contrato.requeridas) if (op[clave] === undefined) invalido(`${ro}.${clave}`, 'requerido');

      if ('campo' in op && !campoConocido(op.campo)) {
        capability(`${ro}.campo`, `El campo ${citar(op.campo)} no está soportado por el plan funcional AFI.`);
      } else if ('campo' in op) {
        // Aplicabilidad genérica: el control del campo debe ofrecer la capacidad que la operación exige.
        const requerida = CAPACIDAD_REQUERIDA[op.tipo as TipoOperacionFuncional];
        const campo = definicionCampo(registro, op.campo as string)!;
        if (requerida && !campo.capacidades.includes(requerida)) {
          capability(`${ro}.campo`, `La operación ${citar(op.tipo)} no aplica al campo ${citar(op.campo)} (control ${campo.control}).`);
        }
      }
      if ('evidencia' in op && !textoNoVacio(op.evidencia)) invalido(`${ro}.evidencia`, 'nombre de evidencia vacío');
      /** Enum cerrado: un valor desconocido es capability (AFI no lo sabe ejecutar). */
      const enumerado = (clave: string, valores: readonly unknown[], que: string) => {
        if (op[clave] !== undefined && !valores.includes(op[clave])) capability(`${ro}.${clave}`, `${que} ${citar(op[clave])} no está soportado por AFI.`);
      };
      const componente = (clave: string) => enumerado(clave, COMPONENTES_FUNCIONALES_AFI, 'El componente');
      const texto = (clave: string) => { if (op[clave] !== undefined && !textoNoVacio(op[clave])) invalido(`${ro}.${clave}`, `${clave} vacío`); };
      switch (op.tipo) {
        case 'texto-ausente':
          if (op.texto !== undefined && !textoNoVacio(op.texto)) invalido(`${ro}.texto`, 'texto vacío');
          if (op.coincidencia !== undefined && op.coincidencia !== 'exacta' && op.coincidencia !== 'contiene') {
            capability(`${ro}.coincidencia`, `La coincidencia ${citar(op.coincidencia)} no está soportada por AFI.`);
          }
          break;
        case 'catalogo-opcion-fuera-de':
          if (op.excluir !== undefined && (!Array.isArray(op.excluir) || !op.excluir.length || !op.excluir.every(textoNoVacio))) {
            invalido(`${ro}.excluir`, 'debe ser una lista no vacía de textos');
          }
          if (op.normalizacion !== undefined && op.normalizacion !== 'texto-es') {
            capability(`${ro}.normalizacion`, `La normalización ${citar(op.normalizacion)} no está soportada por AFI.`);
          }
          break;
        case 'seleccionar-exacto':
          if (op.valor !== undefined && !textoNoVacio(op.valor)) invalido(`${ro}.valor`, 'valor vacío');
          enumerado('normalizacion', NORMALIZACIONES, 'La normalización');
          break;
        case 'componente-visible':
          componente('componente');
          break;
        case 'componente-posicion':
          componente('componente');
          componente('referencia');
          enumerado('relacion', RELACIONES_POSICION, 'La relación');
          if (op.componente !== undefined && op.componente === op.referencia) invalido(`${ro}.referencia`, 'la referencia debe ser otro componente');
          break;
        case 'componente-region':
          componente('componente');
          enumerado('region', REGIONES_COMPONENTE, 'La región');
          break;
        case 'campo-estado':
          enumerado('estado', ESTADOS_CAMPO, 'El estado');
          break;
        case 'campo-valor': {
          const conValor = op.valor !== undefined, conVacio = op.vacio !== undefined;
          // Forma ambigua: se reporta solo la exclusión (las demás reglas dependen de la forma).
          if (conValor && conVacio) { invalido(`${ro}.vacio`, 'valor y vacio son excluyentes'); break; }
          if (!conValor && !conVacio) invalido(ro, 'requiere valor (con comparacion) o vacio: true');
          if (conValor) {
            texto('valor');
            if (op.comparacion === undefined) invalido(`${ro}.comparacion`, 'requerido junto con valor');
            enumerado('comparacion', COMPARACIONES_VALOR, 'La comparación');
          }
          if (conVacio) {
            if (op.vacio !== true) invalido(`${ro}.vacio`, 'solo admite true');
            if (op.comparacion !== undefined) invalido(`${ro}.comparacion`, 'no aplica con vacio');
          }
          break;
        }
        case 'escribir':
        case 'entrada-rechazada':
          texto('texto');
          break;
        case 'catalogo-segun-fuente':
          validarFuente();
          enumerado('relacion', RELACIONES_FUENTE, 'La relación');
          break;
        case 'sugerencias-segun-fuente':
          validarFuente();
          texto('textoBusqueda');
          enumerado('coincidencia', COINCIDENCIAS_BUSQUEDA, 'La coincidencia');
          enumerado('diacriticos', DIACRITICOS_BUSQUEDA, 'El tratamiento de diacríticos');
          enumerado('mayusculas', MAYUSCULAS_BUSQUEDA, 'El tratamiento de mayúsculas');
          break;
      }

      /** Fuente, filtro y normalización comunes a las operaciones según fuente autoritativa. */
      function validarFuente(): void {
        const o = op as Record<string, unknown>;
        const fuente = typeof o.fuente === 'string' && Object.prototype.hasOwnProperty.call(FUENTES_AUTORITATIVAS_AFI, o.fuente)
          ? FUENTES_AUTORITATIVAS_AFI[o.fuente as FuenteAutoritativaAfi] : undefined;
        if (o.fuente !== undefined && !fuente) capability(`${ro}.fuente`, `La fuente ${citar(o.fuente)} no está soportada por AFI.`);
        enumerado('normalizacion', NORMALIZACIONES, 'La normalización');
        const filtroConocido = campoConocido(o.filtroDesdeCampo);
        if (o.filtroDesdeCampo !== undefined && !filtroConocido) {
          capability(`${ro}.filtroDesdeCampo`, `El campo ${citar(o.filtroDesdeCampo)} no está soportado por el plan funcional AFI.`);
        }
        if (o.campo !== undefined && o.campo === o.filtroDesdeCampo) invalido(`${ro}.filtroDesdeCampo`, 'el filtro debe ser otro campo');
        else if (fuente && filtroConocido && campoConocido(o.campo)) {
          if (!(fuente.campos as readonly unknown[]).includes(o.campo)) capability(`${ro}.campo`, `La fuente ${citar(o.fuente)} no describe el campo ${citar(o.campo)}.`);
          if (!(fuente.filtros as readonly unknown[]).includes(o.filtroDesdeCampo)) {
            capability(`${ro}.filtroDesdeCampo`, `La fuente ${citar(o.fuente)} no se filtra por ${citar(o.filtroDesdeCampo)}.`);
          }
        }
      }
    });
  });
  return problemas;
}

const ID_ENTIDAD = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z][A-Za-z0-9]*$/;

/** (4R.2) Esquema cerrado de pasos y condiciones: fuente ÚNICA del validador y del manifest. */
export const CLAVES_PASO = ['id', 'esperado', 'operaciones', 'condiciones'] as const;
export const CLAVES_CONDICION = ['entidad', 'expectativa'] as const;
export const CLAVES_ENTIDAD_CONDICION = ['tipo', 'id'] as const;
/** Parámetro `igual` por tipo de expectativa (las demás expectativas solo llevan `tipo`). */
export const IGUAL_POR_EXPECTATIVA = {
  resultado: { valores: ['exito', 'error'] as const, descripcion: 'Resultado de la llamada: "exito" o "error".' },
  valor: { descripcion: 'Valor primitivo esperado (texto, número, booleano o null). Nunca PII.' },
} as const;

/** (4R.1) Estructura de las condiciones: esquema cerrado; la resolución semántica (modelo, vínculos) es del compilador. */
function validarCondiciones(condiciones: unknown, ruta: string, invalido: (ruta: string, mensaje: string) => void): void {
  if (!Array.isArray(condiciones) || !condiciones.length) { invalido(ruta, 'si se declara, debe ser una lista no vacía'); return; }
  const vistas = new Set<string>();
  condiciones.forEach((c: unknown, i) => {
    const rc = `${ruta}[${i}]`;
    if (!esObjeto(c)) { invalido(rc, 'debe ser un objeto'); return; }
    for (const k of Object.keys(c)) if (!(CLAVES_CONDICION as readonly string[]).includes(k)) invalido(`${rc}.${k}`, 'propiedad no admitida: solo entidad y expectativa (el proveedor lo resuelve el framework)');
    const e = c.entidad, x = c.expectativa;
    if (!esObjeto(e) || Object.keys(e).some(k => !(CLAVES_ENTIDAD_CONDICION as readonly string[]).includes(k))) { invalido(`${rc}.entidad`, 'debe ser { tipo, id }'); return; }
    if (!(TIPOS_ENTIDAD as readonly unknown[]).includes(e.tipo)) { invalido(`${rc}.entidad.tipo`, `tipo de entidad desconocido ${citar(e.tipo)}`); return; }
    if (typeof e.id !== 'string' || !ID_ENTIDAD.test(e.id)) { invalido(`${rc}.entidad.id`, 'id semántico requerido'); return; }
    if (!esObjeto(x) || !EXPECTATIVAS_POR_ENTIDAD[e.tipo as TipoEntidad].includes(x.tipo as never)) {
      invalido(`${rc}.expectativa`, `expectativa no aplicable a ${String(e.tipo)}`); return;
    }
    const conIgual = Object.prototype.hasOwnProperty.call(IGUAL_POR_EXPECTATIVA, x.tipo as string);
    for (const k of Object.keys(x)) if (k !== 'tipo' && !(conIgual && k === 'igual')) invalido(`${rc}.expectativa.${k}`, 'propiedad no admitida');
    if (x.tipo === 'resultado' && !(IGUAL_POR_EXPECTATIVA.resultado.valores as readonly unknown[]).includes(x.igual)) invalido(`${rc}.expectativa.igual`, 'debe ser "exito" o "error"');
    if (x.tipo === 'valor' && !(x.igual === null || ['string', 'number', 'boolean'].includes(typeof x.igual))) invalido(`${rc}.expectativa.igual`, 'debe ser un valor primitivo');
    const clave = JSON.stringify([e.tipo, e.id, x.tipo]);
    if (vistas.has(clave)) invalido(rc, 'condición duplicada en el paso');
    vistas.add(clave);
  });
}

/** Lanza antes de tocar el Portal: CapabilityGapError si algo no es ejecutable, si no PlanFuncionalInvalidoError. */
export function exigirPlanFuncionalValido(plan: unknown, registro: RegistroCampos = REGISTRO_CAMPOS_FUNCIONALES): asserts plan is PlanFuncionalAfi {
  const problemas = validarPlanFuncionalAfi(plan, registro);
  if (!problemas.length) return;
  if (problemas.some(p => p.clase === 'capability')) throw new CapabilityGapError(problemas);
  throw new PlanFuncionalInvalidoError(problemas);
}

// ---------- Normalización y evaluación pura ----------

/** 'texto-es': sin tildes, solo letras, mayúsculas. "BOGOTÁ, D.C." = "Bogota DC" = "BOGOTADC". */
export function normalizarTextoCatalogo(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/gi, '').toUpperCase();
}

type OperacionCatalogo = Extract<OperacionFuncionalAfi, { tipo: 'catalogo-opcion-fuera-de' | 'catalogo-no-vacio' | 'seleccionar-exacto' }>;

/** Evalúa una operación de catálogo sobre las opciones observadas. Sin UI. */
export function evaluarCatalogo(op: OperacionCatalogo, opciones: readonly string[]): ResultadoOperacionAfi {
  const base = { tipo: op.tipo, campo: op.campo };
  const veredicto = (cumple: boolean) => (cumple ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL';
  switch (op.tipo) {
    case 'catalogo-no-vacio':
      return { ...base, resultado: veredicto(opciones.length > 0), observado: { cantidadOpciones: opciones.length, condicionCumplida: opciones.length > 0 } };
    case 'catalogo-opcion-fuera-de': {
      const excluidas = new Set(op.excluir.map(normalizarTextoCatalogo));
      const fuera = opciones.filter(o => !excluidas.has(normalizarTextoCatalogo(o))).length;
      return { ...base, resultado: veredicto(fuera > 0), observado: { cantidadOpciones: opciones.length, cantidadFuera: fuera, condicionCumplida: fuera > 0 } };
    }
    case 'seleccionar-exacto': {
      if (!op.normalizacion) {
        // Semántica v1 original, sin cambios: texto literal.
        const coincidencias = opciones.filter(o => o === op.valor).length;
        return { ...base, valorEsperado: op.valor, resultado: veredicto(coincidencias === 1), observado: { coincidenciasExactas: coincidencias } };
      }
      const buscado = normalizarTextoCatalogo(op.valor);
      const coincidentes = opciones.filter(o => normalizarTextoCatalogo(o) === buscado);
      return {
        ...base, valorEsperado: op.valor, resultado: veredicto(coincidentes.length === 1),
        observado: {
          normalizacion: op.normalizacion, coincidenciasNormalizadas: coincidentes.length,
          ...(coincidentes.length === 1 ? { valorSeleccionado: coincidentes[0] } : {}),
        },
      };
    }
  }
}

// ---------- Búsqueda en autocomplete (4E) ----------

/**
 * ¿La sugerencia cumple la regla de búsqueda respecto del texto?
 * - Ambas cadenas se llevan a Unicode NFC: "í" precompuesta y "i" + tilde combinante son la MISMA letra.
 *   NFC compone, nunca elimina diacríticos: "cafe" no contiene "fé".
 * - contiene: subcadena literal tras NFC (sin recortar espacios ni quitar puntuación).
 * - mayusculas: la declara el caso. "insensibles" compara en mayúsculas (locale es); "sensibles", tal cual.
 */
export function cumpleBusqueda(sugerencia: string, texto: string, regla: ReglaBusqueda): boolean {
  const preparar = (s: string) => {
    const nfc = s.normalize('NFC');
    return regla.mayusculas === 'insensibles' ? nfc.toLocaleUpperCase('es').normalize('NFC') : nfc;
  };
  switch (regla.coincidencia) {
    case 'contiene': return preparar(sugerencia).includes(preparar(texto));
  }
}

/**
 * Sugerencias visibles frente a la fuente: semántica de SUBCONJUNTO no vacío (no exige todas las coincidencias).
 * Pertenencia a la fuente con `normalizacion` (identidad del registro); búsqueda con `regla` (sin quitar tildes).
 */
export function evaluarSugerencias(sugerencias: readonly string[], esperadas: readonly string[], texto: string, regla: ReglaBusqueda, normalizacion: NormalizacionAfi): {
  cumple: boolean; fueraDeFuente: string[]; noCumplenBusqueda: string[];
} {
  const identidad = (s: string) => (normalizacion === 'texto-es' ? normalizarTextoCatalogo(s) : s);
  const fuente = new Set(esperadas.map(identidad));
  const fueraDeFuente = sugerencias.filter(s => !fuente.has(identidad(s)));
  const noCumplenBusqueda = sugerencias.filter(s => !cumpleBusqueda(s, texto, regla));
  return { cumple: sugerencias.length > 0 && !fueraDeFuente.length && !noCumplenBusqueda.length, fueraDeFuente, noCumplenBusqueda };
}

// ---------- Regiones canónicas (4D.1) ----------

/**
 * Regla canónica por región. "superior": el CENTRO vertical del componente, medido desde el inicio de la
 * página, está en la mitad superior de la PRIMERA pantalla (alto del viewport real del contexto).
 * - Centro (no borde ni caja completa): tolera cambios de alto por saltos de línea y no deja pasar un
 *   componente alto que empieza arriba pero ocupa la pantalla.
 * - Mitad: única partición que "superior" implica sin inventar un centro/inferior que ningún requisito pide.
 * - Desde el inicio de la página (no desde el scroll actual): el resultado no depende de acciones previas
 *   del plan que hayan desplazado la pantalla.
 */
export const REGLAS_REGION: Record<RegionComponenteAfi, { id: string; descripcion: string }> = {
  superior: {
    id: 'centro-vertical-en-mitad-superior-de-la-primera-pantalla',
    descripcion: 'El centro vertical del componente, medido desde el inicio de la página, está en la mitad superior '
      + 'de la primera pantalla (alto del viewport del contexto de ejecución). El límite es inclusivo.',
  },
};

export interface EvaluacionRegion {
  cumple: boolean;
  motivo?: 'viewport-no-disponible' | 'geometria-no-disponible';
  centroY?: number;
  limiteY?: number;
}

/** Evaluación pura. `caja.top` en coordenadas de página (independiente del scroll). Sin viewport válido: FAIL. */
export function evaluarRegionComponente(
  region: RegionComponenteAfi,
  caja: { top: number; height: number } | null,
  viewport: { width: number; height: number } | null,
): EvaluacionRegion {
  const valido = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (!viewport || !valido(viewport.width) || !valido(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    return { cumple: false, motivo: 'viewport-no-disponible' };
  }
  if (!caja || !valido(caja.top) || !valido(caja.height) || caja.height < 0) return { cumple: false, motivo: 'geometria-no-disponible' };
  const centroY = caja.top + caja.height / 2;
  switch (region) {
    case 'superior': {
      const limiteY = viewport.height / 2;
      return { cumple: centroY >= 0 && centroY <= limiteY, centroY, limiteY };
    }
  }
}

/** Opción a elegir tras un seleccionar-exacto PASS: la observada (con normalización puede diferir del valor pedido). */
export function opcionSeleccionada(resultado: ResultadoOperacionAfi): string | undefined {
  if (resultado.tipo !== 'seleccionar-exacto' || resultado.resultado !== 'PASS') return undefined;
  const real = resultado.observado.valorSeleccionado;
  return typeof real === 'string' ? real : resultado.valorEsperado;
}

/** Igualdad de catálogos como MULTICONJUNTO normalizado: duplicados cuentan. Devuelve textos originales. */
export function compararCatalogos(observadas: readonly string[], esperadas: readonly string[], normalizacion: NormalizacionAfi): {
  igual: boolean; faltantes: string[]; sobrantes: string[];
} {
  const norma = (s: string) => (normalizacion === 'texto-es' ? normalizarTextoCatalogo(s) : s);
  const pendientes = new Map<string, string[]>();
  for (const e of esperadas) pendientes.set(norma(e), [...(pendientes.get(norma(e)) ?? []), e]);
  const sobrantes: string[] = [];
  for (const o of observadas) {
    const cola = pendientes.get(norma(o));
    if (cola?.length) cola.shift(); else sobrantes.push(o);
  }
  const faltantes = [...pendientes.values()].flat();
  return { igual: !faltantes.length && !sobrantes.length, faltantes, sobrantes };
}
