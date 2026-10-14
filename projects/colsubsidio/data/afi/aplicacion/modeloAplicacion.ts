import almacenPersistido from '../../../knowledge/application-model.json';
import { REGISTRO_CAMPOS_FUNCIONALES, camposDelRegistro, type RegistroCampos } from './campos';
import { PANTALLAS_AFI } from './pantallas';
import { piiEnContenido, piiEnMetadato } from './sensibilidad';
import { superficiesDeEntidad, type ReferenciaEntidad, type SuperficieObservacion, type TipoEntidad } from './superficies';

/**
 * APPLICATION MODEL EXTENDIDO (Fase 4L). Engloba el modelo 4J sin reemplazarlo:
 *
 *   Application Model
 *    ├─ ui            pantallas (PANTALLAS_AFI) + campos (Field Registry)   <- fuentes 4J, se proyectan
 *    ├─ proceso       actividades + rutas
 *    ├─ integraciones (+ sus datos observables)
 *    ├─ variables     datos de proceso/integración (NO son campos UI)
 *    └─ notificaciones
 *
 * Todo lo que no es UI es DECLARATIVO: registrar una actividad, ruta, integración, variable o notificación no toca
 * runtime. Hoy esas colecciones están VACÍAS a propósito: no se registra conocimiento de ninguna HU concreta.
 */

export interface ActividadModelo { id: string; descripcion: string }
/** desde/hacia solo si están determinados (pendientes de enriquecimiento si no). */
export interface RutaModelo { id: string; desde?: string; hacia?: string; descripcion: string }
export interface IntegracionModelo { id: string; descripcion: string }
export interface VariableModelo {
  id: string;
  descripcion: string;
  /** De qué depende: una actividad/proceso o una integración registrada. */
  ambito?: { tipo: 'proceso' } | { tipo: 'integracion'; integracion: string };
  /** Superficies por las que PODRÍA observarse (la elección del mecanismo es del framework). */
  superficies: readonly SuperficieObservacion[];
}
export interface NotificacionModelo { id: string; descripcion: string; canal?: string }
/**
 * Pantalla o campo UI declarados (4N): conocidos por el modelo; sus firmas/localización pueden quedar pendientes.
 * Atributos SEMÁNTICOS de navegación (nunca selectores; se completan por propuesta `completar`):
 *  - pantalla: `titulo` (encabezado visible que la reconoce), `etapa` (se prepara con las políticas de esa etapa),
 *    `consulta` (texto del botón que consulta a la persona capturada en la pantalla);
 *  - campo: `etiqueta` (texto visible del control), `dato` (campo de dominio/persona que captura), `obligatorio` (si | no).
 */
export interface PantallaDeclarada { id: string; descripcion: string; senales?: readonly string[]; titulo?: string; etapa?: string; consulta?: string }
export interface CampoDeclarado { id: string; descripcion: string; pantalla?: string; control?: string; etiqueta?: string; dato?: string; obligatorio?: 'si' | 'no' }
/**
 * (Ruta semántica) Navegación entre dos pantallas: `avance` es el texto visible del botón que la dispara; `condicion`, la
 * condición de negocio (texto) bajo la cual existe. El grafo de transiciones permite DERIVAR qué pantallas atravesar.
 */
export interface TransicionDeclarada { id: string; descripcion: string; desde: string; hacia: string; avance?: string; condicion?: string }

export interface ExtensionModeloAplicacion {
  pantallas?: readonly PantallaDeclarada[];
  campos?: readonly CampoDeclarado[];
  transiciones?: readonly TransicionDeclarada[];
  actividades?: readonly ActividadModelo[];
  rutas?: readonly RutaModelo[];
  integraciones?: readonly IntegracionModelo[];
  variables?: readonly VariableModelo[];
  notificaciones?: readonly NotificacionModelo[];
}

export interface ModeloAplicacion {
  ui: { pantallas: string[]; campos: string[]; transiciones: string[] };
  /** Pantallas/campos/transiciones declarados en el almacén (subconjunto de ui), con sus datos pendientes de enriquecimiento. */
  uiDeclarada: { pantallas: PantallaDeclarada[]; campos: CampoDeclarado[]; transiciones: TransicionDeclarada[] };
  proceso: { actividades: ActividadModelo[]; rutas: RutaModelo[] };
  integraciones: IntegracionModelo[];
  variables: VariableModelo[];
  notificaciones: NotificacionModelo[];
}

export class ModeloAplicacionError extends Error {
  constructor(readonly problemas: readonly string[]) {
    super(`Application Model inválido:\n${problemas.map(p => `- ${p}`).join('\n')}`);
    this.name = 'ModeloAplicacionError';
  }
}

/** Construye y valida el modelo: UI proyectada de 4J + extensiones declarativas. */
export function construirModeloAplicacion(extension: ExtensionModeloAplicacion = {}, registro: RegistroCampos = REGISTRO_CAMPOS_FUNCIONALES): ModeloAplicacion {
  const modelo: ModeloAplicacion = {
    ui: {
      pantallas: [...Object.keys(PANTALLAS_AFI), ...(extension.pantallas ?? []).map(x => x.id)],
      campos: [...camposDelRegistro(registro).map(c => c.id), ...(extension.campos ?? []).map(x => x.id)],
      transiciones: (extension.transiciones ?? []).map(x => x.id),
    },
    uiDeclarada: { pantallas: [...(extension.pantallas ?? [])], campos: [...(extension.campos ?? [])], transiciones: [...(extension.transiciones ?? [])] },
    proceso: { actividades: [...(extension.actividades ?? [])], rutas: [...(extension.rutas ?? [])] },
    integraciones: [...(extension.integraciones ?? [])],
    variables: [...(extension.variables ?? [])],
    notificaciones: [...(extension.notificaciones ?? [])],
  };
  const p: string[] = [];
  // Un id pertenece a UN solo tipo: evita que una ruta se tome por pantalla o una variable por campo.
  const vistos = new Map<string, TipoEntidad>();
  for (const [tipo, id] of entidadesDelModelo(modelo)) {
    if (!/^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z][A-Za-z0-9]*$/.test(id)) p.push(`${tipo} ${id}: id semántico inválido`);
    const previo = vistos.get(id);
    if (previo) p.push(`${id}: declarado como ${previo} y como ${tipo}`);
    vistos.set(id, tipo);
  }
  const pantallas = new Set(modelo.ui.pantallas);
  for (const t of modelo.uiDeclarada.transiciones) {
    for (const extremo of [t.desde, t.hacia]) if (!pantallas.has(extremo)) p.push(`transicion-ui ${t.id}: pantalla desconocida ${extremo}`);
    if (t.desde === t.hacia) p.push(`transicion-ui ${t.id}: desde y hacia son la misma pantalla`);
  }
  const actividades = new Set(modelo.proceso.actividades.map(a => a.id));
  for (const r of modelo.proceso.rutas) for (const extremo of [r.desde, r.hacia]) if (extremo !== undefined && !actividades.has(extremo)) p.push(`ruta ${r.id}: actividad desconocida ${extremo}`);
  const integraciones = new Set(modelo.integraciones.map(i => i.id));
  for (const v of modelo.variables) {
    if (v.ambito?.tipo === 'integracion' && !integraciones.has(v.ambito.integracion)) p.push(`variable ${v.id}: integración desconocida ${v.ambito.integracion}`);
    if (!v.superficies.length) p.push(`variable ${v.id}: sin superficie`);
    for (const s of v.superficies) if (!superficiesDeEntidad('variable').includes(s)) p.push(`variable ${v.id}: la superficie ${s} no observa variables`);
  }
  for (const n of modelo.notificaciones) if (n.canal !== undefined && !n.canal.trim()) p.push(`notificacion ${n.id}: canal vacío`);
  if (p.length) throw new ModeloAplicacionError(p);
  return modelo;
}

export function entidadesDelModelo(m: ModeloAplicacion): [TipoEntidad, string][] {
  return [
    ...m.ui.pantallas.map(id => ['pantalla-ui', id] as [TipoEntidad, string]),
    ...m.ui.campos.map(id => ['campo-ui', id] as [TipoEntidad, string]),
    ...m.ui.transiciones.map(id => ['transicion-ui', id] as [TipoEntidad, string]),
    ...m.proceso.actividades.map(a => ['actividad', a.id] as [TipoEntidad, string]),
    ...m.proceso.rutas.map(r => ['ruta', r.id] as [TipoEntidad, string]),
    ...m.integraciones.map(i => ['integracion', i.id] as [TipoEntidad, string]),
    ...m.variables.map(v => ['variable', v.id] as [TipoEntidad, string]),
    ...m.notificaciones.map(n => ['notificacion', n.id] as [TipoEntidad, string]),
  ];
}

/**
 * Resuelve una referencia contra el modelo con su TIPO. Si el id existe con otro tipo, es un error de clase de
 * entidad (p. ej. una ruta usada como pantalla, un dato interno usado como campo UI), no una entidad faltante.
 */
export function resolverEntidad(m: ModeloAplicacion, ref: ReferenciaEntidad): { estado: 'registrada' } | { estado: 'no-registrada' } | { estado: 'tipo-incorrecto'; tipoReal: TipoEntidad } {
  const todas = entidadesDelModelo(m);
  if (todas.some(([t, id]) => t === ref.tipo && id === ref.id)) return { estado: 'registrada' };
  const otra = todas.find(([, id]) => id === ref.id);
  return otra ? { estado: 'tipo-incorrecto', tipoReal: otra[0] } : { estado: 'no-registrada' };
}

/**
 * Superficies AUTORIZADAS para observar ESA entidad (4M), única fuente para diagnosticar y observar:
 *  - variable: EXACTAMENTE las declaradas en VariableModelo.superficies;
 *  - resto de tipos: las superficies de su tipo (una por tipo hoy);
 *  - entidad no registrada o de otro tipo: ninguna (fail-closed).
 * Un proveedor fuera de estas superficies no puede observar la entidad aunque su supports() lo acepte.
 */
export function superficiesEfectivas(m: ModeloAplicacion, ref: ReferenciaEntidad): SuperficieObservacion[] {
  if (resolverEntidad(m, ref).estado !== 'registrada') return [];
  if (ref.tipo === 'variable') {
    const declaradas = m.variables.find(v => v.id === ref.id)!.superficies;
    return superficiesDeEntidad('variable').filter(s => declaradas.includes(s));
  }
  return superficiesDeEntidad(ref.tipo);
}

// ---------- Almacén declarativo versionado (4N) ----------

/**
 * Fuente de las entidades NUEVAS: knowledge/application-model.json. Solo se modifica aplicando propuestas APROBADAS
 * (propuestas.ts). Las entidades 4J (PANTALLAS_AFI, Field Registry) siguen temporalmente en TypeScript; la migración
 * es progresiva: una entidad TS se mueve al almacén cuando se toque, nunca en bloque.
 */
export interface AlmacenModeloAplicacion {
  schemaVersion: 'afi-application-model/v1';
  /** Revisión monotónica del almacén. */
  revision: number;
  entidades: {
    pantallas: PantallaDeclarada[];
    campos: CampoDeclarado[];
    actividades: ActividadModelo[];
    rutas: RutaModelo[];
    integraciones: IntegracionModelo[];
    variables: VariableModelo[];
    notificaciones: NotificacionModelo[];
    /** Opcional (compatibilidad): un almacén sin transiciones equivale a ninguna. */
    transiciones?: TransicionDeclarada[];
  };
  /** Auditoría mínima: qué propuesta aprobada añadió cada entidad. */
  historial: EntradaHistorialModelo[];
  /**
   * (4R.1) Vínculos técnicos APROBADOS entidad -> proveedor de observación. Sección SEPARADA de las entidades: la entidad
   * conserva solo su significado; cómo se localiza en una fuente vive aquí (validación semántica: vinculos.ts).
   * Opcional: un almacén sin la sección equivale a ninguno.
   */
  vinculosObservacion?: VinculoObservacion[];
  historialVinculos?: EntradaHistorialVinculo[];
}

/** (4R.1) Cómo una entidad registrada se localiza en la fuente de UN proveedor. Esquema cerrado (vinculos.ts). */
export interface VinculoObservacion {
  entidad: ReferenciaEntidad;
  superficie: SuperficieObservacion;
  proveedor: string;
  /** Configuración específica del proveedor: solo las claves que su catálogo declara, texto plano. */
  localizacion: Readonly<Record<string, string>>;
}

export interface EntradaHistorialVinculo { revision: number; fecha: string; vinculo: string; hash: string; revisor: string; lote: string }

export interface EntradaHistorialModelo {
  revision: number; fecha: string; entidad: string; tipo: TipoEntidad; propuesta: string; hash: string; revisor: string;
  /** Lote de revisión (4O) que la aplicó: permite reconocer una reaplicación. */
  lote?: string;
}

export function validarAlmacenModelo(a: AlmacenModeloAplicacion): AlmacenModeloAplicacion {
  const p: string[] = [];
  if (a?.schemaVersion !== 'afi-application-model/v1') p.push('schemaVersion desconocido');
  if (!Number.isInteger(a?.revision) || a.revision < 1) p.push('revision debe ser un entero >= 1');
  for (const k of ['pantallas', 'campos', 'actividades', 'rutas', 'integraciones', 'variables', 'notificaciones'] as const) {
    if (!Array.isArray(a?.entidades?.[k])) p.push(`entidades.${k}: lista requerida`);
  }
  if (a?.entidades?.transiciones !== undefined && !Array.isArray(a.entidades.transiciones)) p.push('entidades.transiciones: debe ser una lista');
  if (!Array.isArray(a?.historial)) p.push('historial: lista requerida');
  for (const k of ['vinculosObservacion', 'historialVinculos'] as const) if (a?.[k] !== undefined && !Array.isArray(a[k])) p.push(`${k}: debe ser una lista`);
  if (a?.vinculosObservacion && piiEnContenido(JSON.stringify(a.vinculosObservacion))) p.push('posible PII en los vínculos de observación');
  // Sin PII (4O, contextual): el contenido declarativo con la heurística estricta; la auditoría como metadato y SIN
  // los identificadores criptográficos (un sha256 hexadecimal o un id de lote no son PII).
  const auditoria = (a?.historial ?? []).map(({ hash: _hash, lote: _lote, ...resto }) => resto);
  if (piiEnContenido(JSON.stringify(a?.entidades ?? {})) || piiEnMetadato(JSON.stringify(auditoria))) p.push('posible PII en el almacén');
  if (p.length) throw new ModeloAplicacionError(p);
  return a;
}

export const extensionDesdeAlmacen = (a: AlmacenModeloAplicacion): ExtensionModeloAplicacion => ({ ...validarAlmacenModelo(a).entidades });

/** Vista publicable del modelo (manifest): solo lo registrado/aprobado, sin detalles internos. */
export function publicarModelo(m: ModeloAplicacion) {
  return {
    pantallas: m.ui.pantallas,
    campos: m.ui.campos,
    transiciones: m.ui.transiciones,
    actividades: m.proceso.actividades.map(a => a.id),
    rutas: m.proceso.rutas.map(r => r.id),
    integraciones: m.integraciones.map(i => i.id),
    variables: m.variables.map(v => ({ id: v.id, superficies: [...v.superficies] })),
    notificaciones: m.notificaciones.map(n => n.id),
  };
}

/** Almacén aprobado del proyecto (hoy vacío: no se registra conocimiento de ninguna HU concreta). */
export const ALMACEN_APLICACION_AFI: AlmacenModeloAplicacion = validarAlmacenModelo(almacenPersistido as AlmacenModeloAplicacion);

/** Modelo canónico: UI de 4J + entidades APROBADAS del almacén declarativo. */
export const MODELO_APLICACION_AFI: ModeloAplicacion = construirModeloAplicacion(extensionDesdeAlmacen(ALMACEN_APLICACION_AFI));
