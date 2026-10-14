import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as yaml from 'js-yaml';
import { casoMatriz } from './matriz';
import { referencias, type Registro } from './datos';
import { cargarPopups } from './popups';
import { cargarPresentacion } from './presentacion';

/**
 * Escenario declarativo SDE (escenarios/*.yaml). Un escenario ejecuta UN CP de la matriz con
 * capabilities genéricas; datos y expectativas viven aquí, no en el runner. El validador es
 * ESTRICTO: una capability, verificación o clave desconocida es un error (no se ignora en
 * silencio), para que nunca parezca soportado algo que el motor no hace.
 */

export interface CampoSde {
  campo: string;
  valor: string;
  tipo?: 'texto' | 'lista' | 'radio' | 'area';
}

export type Verificacion =
  | { visible: string }
  | { no_visible: string }
  | { campo_visible: string }
  | { campo_no_visible: string }
  | { texto_exacto: string }
  | { etiquetas: string[] }
  | { solo_lectura: string[] }
  | { editable: string[] }
  | { obligatorio: string[] }
  | { botones_exactos: string[] }
  | { valor: { campo: string; igual: string } }
  | { actividad: string }
  // Presentación (reunión QA 2026-10-14): orden relativo de campos, campos opcionales (verificar con el campo VACÍO),
  // reglas ortográficas del proyecto sobre los textos visibles, y expectativas del catálogo data/expectativas-presentacion.yaml.
  | { orden: string[] }
  | { opcional: string[] }
  | { ortografia: 'visible' }
  | { expectativa: string };

export const VERIFICACIONES = ['visible', 'no_visible', 'campo_visible', 'campo_no_visible', 'texto_exacto', 'etiquetas', 'solo_lectura', 'editable', 'obligatorio', 'botones_exactos', 'valor', 'actividad', 'orden', 'opcional', 'ortografia', 'expectativa'] as const;

export interface PasoSde {
  matriz: number[];
  hacer: string;
  verificar?: Verificacion[];
  /** Datasets que SOLO este paso necesita: si faltan, el paso queda BLOCKED y el escenario continúa. */
  requiere?: string[];
  /**
   * Solo en pasos "verificar" (no cambian la pantalla): si una verificación no se cumple, el paso queda FAIL y el CP también,
   * pero el recorrido CONTINÚA (un defecto de presentación no impide observar el resto del flujo de negocio).
   */
  no_bloqueante?: boolean;
  [k: string]: unknown;
}

export interface EscenarioSde {
  id: string;              // HU06-CP05 (debe existir en la matriz)
  titulo: string;
  etiquetas: string[];
  actores: string[];
  datasets: string[];
  cleanup: { politica: 'CLEANUP_NOT_APPLICABLE' | 'REVERSIBLE'; razon: string };
  pasos: PasoSde[];
  archivo: string;
  /** Solo en escenarios/_variantes: secuencia distinta de la aprobada en la matriz (nunca cuenta para cobertura). */
  variante?: { descripcion: string; difiere_en: string[] };
}

/** Parámetros por capability: obligatorios y opcionales. */
export const CAPACIDADES: Record<string, { req: string[]; opt: string[] }> = {
  iniciar_sesion: { req: ['actor'], opt: [] },
  nuevo_caso: { req: ['proceso'], opt: ['categoria'] },
  diligenciar: { req: ['campos'], opt: [] },
  adjuntar: { req: ['campo', 'archivo'], opt: ['tipo_documental'] },
  // Grilla de documentos Bizagi (edición en línea): Adicionar → Tipo Documental → Guardar fila → subir archivo.
  // secuencia: matriz (por defecto: tipo → guardar → archivo) | guardar_primero (secuencia observada en el producto, exige
  // "refrescar_con" { campo, valor_temporal, valor }: la grilla no se actualiza sola tras guardar la fila).
  adjuntar_en_grilla: { req: ['grilla', 'archivo'], opt: ['tipo_documental', 'secuencia', 'refrescar_con'] },
  verificar: { req: [], opt: [] },
  pulsar: { req: ['boton'], opt: ['capturar_numero_caso', 'esperar_hasta', 'maximo_minutos'] },
  verificar_ruta: { req: ['actor', 'llega_a'], opt: ['no_llega_a', 'maximo_minutos'] },
  abrir_caso: { req: ['actor', 'actividad'], opt: ['maximo_minutos'] },
  tabla_verificar: { req: ['tabla'], opt: ['columnas', 'minimo_filas'] },
  // "formulario": id del pop-up en data/popups-calibrados.yaml; la barrera H3 decide en ejecución si puede abrirse.
  tabla_abrir_fila: { req: ['tabla', 'fila', 'formulario'], opt: [] },          // abre el pop-up de edición de la fila N (1..n)
  tabla_agregar: { req: ['tabla', 'formulario'], opt: [] },                     // abre el pop-up de adición
  dialogo_confirmar: { req: ['espera'], opt: ['fila_resultante'] }, // espera: cierra | permanece_abierto
  dialogo_cancelar: { req: [], opt: [] },                         // cierra el pop-up SIN guardar y verifica que no cambió la tabla
  tabla_eliminar_fila: { req: ['tabla'], opt: ['fila', 'fila_con'] },   // fila N | fila_con { columna: valor } (única)
  // UI-06: selecciona UNA fila (por número o por valores exactos) y exige que quede exactamente una seleccionada.
  tabla_seleccionar_fila: { req: ['tabla'], opt: ['fila', 'fila_con'] },
  // UI-04: abre una pestaña por su texto exacto, exige que quede activa y (opcional) que muestre los textos dados.
  abrir_pestana: { req: ['pestana'], opt: ['contiene'] },
  // UI-05: prueba negativa. Teclea como un usuario y compara lo que el formulario MUESTRA y/o el mensaje de validación,
  // sin fallar por la post-condición normal de diligenciar (el valor puede quedar truncado o rechazado a propósito).
  intentar_diligenciar: { req: ['campo', 'valor'], opt: ['esperado_mostrado', 'mensaje'] },
  integracion: { req: ['nombre', 'esperado'], opt: [] },
  no_automatizado: { req: ['razon'], opt: [] },
};

export class EscenarioError extends Error {
  constructor(readonly archivo: string, readonly problemas: string[]) {
    super(`Escenario SDE "${archivo}" inválido:\n  • ${problemas.join('\n  • ')}`);
    this.name = 'EscenarioError';
  }
}

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

function validarVerificaciones(v: unknown, donde: string, problemas: string[], permitirExpectativa = true): void {
  if (v == null) return;
  if (!Array.isArray(v)) { problemas.push(`${donde}: "verificar" debe ser una lista`); return; }
  v.forEach((item, i) => {
    const claves = item && typeof item === 'object' ? Object.keys(item) : [];
    if (claves.length !== 1 || !(VERIFICACIONES as readonly string[]).includes(claves[0])) {
      problemas.push(`${donde}, verificación #${i + 1}: debe tener exactamente una clave de: ${VERIFICACIONES.join(', ')} (recibí ${JSON.stringify(claves)})`);
      return;
    }
    const val = (item as Record<string, unknown>)[claves[0]];
    const listas = ['etiquetas', 'solo_lectura', 'editable', 'obligatorio', 'botones_exactos', 'orden', 'opcional'];
    if (listas.includes(claves[0]) && !(Array.isArray(val) && val.length > 0 && val.every(esTexto)))
      problemas.push(`${donde}, verificación "${claves[0]}": debe ser una lista no vacía de textos`);
    if (['visible', 'no_visible', 'campo_visible', 'campo_no_visible', 'texto_exacto', 'actividad'].includes(claves[0]) && !esTexto(val))
      problemas.push(`${donde}, verificación "${claves[0]}": debe ser un texto`);
    if (claves[0] === 'orden' && Array.isArray(val) && val.length < 2) problemas.push(`${donde}, verificación "orden": requiere al menos 2 campos`);
    if (claves[0] === 'ortografia' && val !== 'visible') problemas.push(`${donde}, verificación "ortografia": el único ámbito soportado es "visible"`);
    if (claves[0] === 'expectativa') {
      const cat = cargarPresentacion().expectativas;
      if (!permitirExpectativa) problemas.push(`${donde}: una expectativa no puede contener otra expectativa`);
      else if (!esTexto(val) || !cat[val]) problemas.push(`${donde}, verificación "expectativa": "${val}" no existe en data/expectativas-presentacion.yaml`);
      else {
        const e = cat[val];
        if (e.estado === 'aprobada') validarVerificaciones(e.verificar, `${donde} (expectativa ${val})`, problemas, false);
      }
    }
    if (claves[0] === 'valor') {
      const o = val as Record<string, unknown>;
      if (!o || !esTexto(o.campo) || !esTexto(o.igual)) problemas.push(`${donde}, verificación "valor": requiere { campo, igual }`);
    }
  });
}

function validarCampos(v: unknown, donde: string, problemas: string[]): void {
  if (!Array.isArray(v) || v.length === 0) { problemas.push(`${donde}: "campos" debe ser una lista no vacía`); return; }
  v.forEach((c, i) => {
    const o = c as Record<string, unknown>;
    if (!esTexto(o?.campo) || !esTexto(o?.valor)) problemas.push(`${donde}, campo #${i + 1}: requiere "campo" y "valor" (texto)`);
    if (o?.tipo != null && !['texto', 'lista', 'radio', 'area'].includes(o.tipo as string))
      problemas.push(`${donde}, campo #${i + 1}: tipo "${o.tipo}" no soportado (texto | lista | radio | area)`);
    const extra = Object.keys(o ?? {}).filter((k) => !['campo', 'valor', 'tipo'].includes(k));
    if (extra.length) problemas.push(`${donde}, campo #${i + 1}: claves desconocidas ${extra.join(', ')}`);
  });
}

/**
 * BLOQUES reutilizables (escenarios/_bloques/<nombre>.yaml): secuencias de pasos comunes a una familia de CP, con
 * parámetros ${param:nombre}. Un paso `{ incluir: <nombre>, con: { ... } }` se expande ANTES de validar, así cada paso
 * expandido pasa por el mismo validador estricto. Un texto que es exactamente "${param:x}" se reemplaza por el valor tal
 * cual (permite listas y números, p. ej. "matriz"). Parámetros faltantes, sobrantes o sin usar son errores.
 */
export interface Bloque { descripcion: string; parametros: string[]; pasos: Record<string, unknown>[] }

const PARAM = /\$\{param:([A-Za-z0-9_]+)\}/g;

function sustituir(v: unknown, con: Record<string, unknown>, usados: Set<string>): unknown {
  if (typeof v === 'string') {
    const solo = /^\$\{param:([A-Za-z0-9_]+)\}$/.exec(v);
    if (solo && solo[1] in con) { usados.add(solo[1]); return con[solo[1]]; }
    return v.replace(PARAM, (todo, n: string) => (n in con ? (usados.add(n), String(con[n])) : todo));
  }
  if (Array.isArray(v)) return v.map((x) => sustituir(x, con, usados));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sustituir(x, con, usados)]));
  return v;
}

export function expandirBloques(pasos: Record<string, unknown>[], dirBloques: string, problemas: string[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  pasos.forEach((p, i) => {
    if (p?.incluir == null) { out.push(p); return; }
    const donde = `paso #${i + 1} (incluir ${p.incluir})`;
    const extra = Object.keys(p).filter((k) => !['incluir', 'con'].includes(k));
    if (extra.length) problemas.push(`${donde}: claves no soportadas ${extra.join(', ')} (solo "incluir" y "con")`);
    const archivo = resolve(dirBloques, `${p.incluir}.yaml`);
    if (!esTexto(p.incluir) || !existsSync(archivo)) { problemas.push(`${donde}: no existe el bloque escenarios/_bloques/${p.incluir}.yaml`); return; }
    const b = yaml.load(readFileSync(archivo, 'utf8')) as Bloque;
    if (!Array.isArray(b?.pasos) || !Array.isArray(b?.parametros)) { problemas.push(`${donde}: el bloque debe declarar "parametros" y "pasos"`); return; }
    const con = (p.con ?? {}) as Record<string, unknown>;
    const faltan = b.parametros.filter((x) => !(x in con));
    const sobran = Object.keys(con).filter((x) => !b.parametros.includes(x));
    if (faltan.length) problemas.push(`${donde}: faltan parámetros ${faltan.join(', ')}`);
    if (sobran.length) problemas.push(`${donde}: parámetros desconocidos ${sobran.join(', ')}`);
    const usados = new Set<string>();
    const expandidos = b.pasos.map((x) => sustituir(x, con, usados) as Record<string, unknown>);
    const sinUsar = b.parametros.filter((x) => !usados.has(x));
    if (sinUsar.length) problemas.push(`bloque ${p.incluir}: parámetros declarados sin usar ${sinUsar.join(', ')}`);
    const quedan = JSON.stringify(expandidos).match(PARAM);
    if (quedan) problemas.push(`${donde}: quedaron referencias sin resolver ${[...new Set(quedan)].join(', ')}`);
    out.push(...expandidos);
  });
  return out;
}

export function cargarEscenario(ruta: string, registro: Registro): EscenarioSde {
  const archivo = ruta.split(/[\\/]/).pop() ?? ruta;
  let d: Record<string, unknown>;
  try {
    d = yaml.load(readFileSync(ruta, 'utf8')) as Record<string, unknown>;
  } catch (e) {
    throw new EscenarioError(archivo, [`YAML inválido: ${(e as Error).message.split('\n')[0]}`]);
  }
  const problemas: string[] = [];
  const raiz = ['id', 'titulo', 'etiquetas', 'actores', 'datasets', 'cleanup', 'pasos', 'variante'];
  const extraRaiz = Object.keys(d ?? {}).filter((k) => !raiz.includes(k));
  if (extraRaiz.length) problemas.push(`claves desconocidas en la raíz: ${extraRaiz.join(', ')}`);

  let pasosMatriz = new Set<number>();
  if (!esTexto(d?.id)) problemas.push('falta "id" (ej. HU06-CP05)');
  else {
    try { pasosMatriz = new Set(casoMatriz(d.id as string).pasos.map((p) => p.n)); }
    catch (e) { problemas.push((e as Error).message); }
  }
  if (!esTexto(d?.titulo)) problemas.push('falta "titulo"');
  const actores = (d?.actores ?? []) as string[];
  if (!Array.isArray(actores) || actores.length === 0) problemas.push('falta "actores"');
  for (const a of actores) if (!registro.actores[a]) problemas.push(`actor "${a}" no existe en data/datasets.yaml`);
  const datasets = (d?.datasets ?? []) as string[];
  if (!Array.isArray(datasets)) problemas.push('"datasets" debe ser lista');
  for (const ds of datasets) if (!registro.datasets[ds]) problemas.push(`dataset "${ds}" no existe en data/datasets.yaml`);
  const cleanup = d?.cleanup as Record<string, unknown> | undefined;
  if (!cleanup || !['CLEANUP_NOT_APPLICABLE', 'REVERSIBLE'].includes(cleanup.politica as string) || !esTexto(cleanup.razon))
    problemas.push('falta "cleanup" { politica: CLEANUP_NOT_APPLICABLE | REVERSIBLE, razon }');

  const variante = d?.variante as { descripcion?: unknown; difiere_en?: unknown } | undefined;
  if (variante != null && !(esTexto(variante.descripcion) && Array.isArray(variante.difiere_en) && variante.difiere_en.length > 0 && variante.difiere_en.every(esTexto)))
    problemas.push('"variante" requiere { descripcion, difiere_en: [textos] } (qué difiere de la matriz aprobada)');
  // Los bloques viven en escenarios/_bloques (también para los escenarios de escenarios/_variantes).
  const dirBloques = existsSync(resolve(dirname(ruta), '_bloques')) ? resolve(dirname(ruta), '_bloques') : resolve(dirname(ruta), '..', '_bloques');
  const pasos = Array.isArray(d?.pasos) ? expandirBloques(d.pasos as Record<string, unknown>[], dirBloques, problemas) : undefined;
  if (!Array.isArray(pasos) || pasos.length === 0) problemas.push('falta "pasos"');
  else pasos.forEach((p, i) => {
    const donde = `paso #${i + 1}`;
    const cap = CAPACIDADES[p?.hacer as string];
    if (!cap) { problemas.push(`${donde}: capability "${p?.hacer}" no existe. Disponibles: ${Object.keys(CAPACIDADES).join(', ')}`); return; }
    const m = p.matriz;
    if (!Array.isArray(m) || m.length === 0 || !m.every((n) => typeof n === 'number'))
      problemas.push(`${donde}: "matriz" debe listar los números de paso del Excel que cubre`);
    else for (const n of m) if (pasosMatriz.size && !pasosMatriz.has(n)) problemas.push(`${donde}: el paso ${n} no existe en la matriz de ${d.id}`);
    for (const r of cap.req) if (p[r] == null) problemas.push(`${donde} (${p.hacer}): falta "${r}"`);
    const permitidas = ['matriz', 'hacer', 'verificar', 'requiere', ...(p.hacer === 'verificar' ? ['no_bloqueante'] : []), ...cap.req, ...cap.opt];
    if (p.no_bloqueante != null && typeof p.no_bloqueante !== 'boolean') problemas.push(`${donde}: "no_bloqueante" debe ser true o false`);
    if (p.requiere != null) {
      if (!Array.isArray(p.requiere) || !(p.requiere as unknown[]).every(esTexto)) problemas.push(`${donde}: "requiere" debe ser una lista de datasets`);
      else for (const ds of p.requiere as string[]) if (!registro.datasets[ds]) problemas.push(`${donde}: dataset requerido "${ds}" no existe en data/datasets.yaml`);
    }
    if (p.hacer === 'verificar_ruta' && !(esTexto(p.llega_a) || (Array.isArray(p.llega_a) && (p.llega_a as unknown[]).length > 0 && (p.llega_a as unknown[]).every(esTexto))))
      problemas.push(`${donde}: "llega_a" debe ser una actividad o una lista de actividades aceptables`);
    const extra = Object.keys(p).filter((k) => !permitidas.includes(k));
    if (extra.length) problemas.push(`${donde} (${p.hacer}): claves no soportadas ${extra.join(', ')}`);
    if (p.hacer === 'verificar' && !Array.isArray(p.verificar)) problemas.push(`${donde}: "verificar" requiere la lista "verificar"`);
    if (p.actor != null && !actores.includes(p.actor as string)) problemas.push(`${donde}: actor "${p.actor}" no está en "actores" del escenario`);
    if (p.campos != null) validarCampos(p.campos, donde, problemas);
    validarVerificaciones(p.verificar, donde, problemas);
    if (p.hacer === 'dialogo_confirmar' && !['cierra', 'permanece_abierto'].includes(p.espera as string))
      problemas.push(`${donde}: "espera" debe ser "cierra" o "permanece_abierto"`);
    if (p.fila != null && p.fila !== 'ultima' && !(Number.isInteger(p.fila) && (p.fila as number) >= 1))
      problemas.push(`${donde}: "fila" debe ser un entero >= 1 o "ultima"`);
    for (const k of ['fila_resultante', 'fila_con']) {
      if (p[k] != null && (typeof p[k] !== 'object' || Array.isArray(p[k]) || Object.keys(p[k] as object).length === 0))
        problemas.push(`${donde}: "${k}" debe ser un mapa no vacío { columna: valor }`);
    }
    if (['tabla_eliminar_fila', 'tabla_seleccionar_fila'].includes(p.hacer as string) && (p.fila == null) === (p.fila_con == null))
      problemas.push(`${donde}: indique exactamente uno de "fila" o "fila_con"`);
    if (['tabla_abrir_fila', 'tabla_agregar'].includes(p.hacer as string) && esTexto(p.formulario) && !cargarPopups()[p.formulario as string])
      problemas.push(`${donde}: el formulario "${p.formulario}" no existe en data/popups-calibrados.yaml`);
    if (p.hacer === 'adjuntar_en_grilla') {
      if (p.secuencia != null && !['matriz', 'guardar_primero'].includes(p.secuencia as string)) problemas.push(`${donde}: "secuencia" debe ser "matriz" o "guardar_primero"`);
      const r = p.refrescar_con as Record<string, unknown> | undefined;
      const refrescoValido = !!r && esTexto(r.campo) && esTexto(r.valor_temporal) && esTexto(r.valor) && Object.keys(r).length === 3;
      if (p.secuencia === 'guardar_primero' && !refrescoValido) problemas.push(`${donde}: "guardar_primero" exige "refrescar_con" { campo, valor_temporal, valor }`);
      if (p.secuencia !== 'guardar_primero' && r != null) problemas.push(`${donde}: "refrescar_con" solo aplica a secuencia "guardar_primero"`);
    }
    if (p.hacer === 'intentar_diligenciar') {
      if (p.esperado_mostrado == null && p.mensaje == null) problemas.push(`${donde}: indique "esperado_mostrado" y/o "mensaje" (qué debe observarse)`);
      if (p.esperado_mostrado != null && typeof p.esperado_mostrado !== 'string') problemas.push(`${donde}: "esperado_mostrado" debe ser texto ("" = el campo queda vacío)`);
      if (p.mensaje != null && !esTexto(p.mensaje)) problemas.push(`${donde}: "mensaje" debe ser un texto`);
    }
    if (p.hacer === 'abrir_pestana' && p.contiene != null && !(Array.isArray(p.contiene) && (p.contiene as unknown[]).length > 0 && (p.contiene as unknown[]).every(esTexto)))
      problemas.push(`${donde}: "contiene" debe ser una lista no vacía de textos`);
  });

  // Todo ${dato:ID.prop} debe pertenecer a un dataset declarado (en el escenario o en el "requiere" de su paso).
  const porPaso = new Set((Array.isArray(pasos) ? pasos : []).flatMap((p) => (Array.isArray(p?.requiere) ? p.requiere as string[] : [])));
  for (const ref of referencias(pasos)) {
    if (!ref.startsWith('dato:')) continue;
    const [id, prop] = ref.slice(5).split('.');
    if (!datasets.includes(id) && !porPaso.has(id)) problemas.push(`referencia \${${ref}}: el dataset "${id}" no está declarado en "datasets"`);
    else if (!registro.datasets[id]?.propiedades.some((x) => x.nombre === prop)) problemas.push(`referencia \${${ref}}: "${prop}" no es propiedad de ${id}`);
  }

  if (problemas.length) throw new EscenarioError(archivo, problemas);
  return {
    id: d.id as string, titulo: d.titulo as string, etiquetas: (d.etiquetas as string[]) ?? [],
    actores, datasets, cleanup: cleanup as EscenarioSde['cleanup'], pasos: pasos as PasoSde[], archivo,
    ...(variante ? { variante: variante as EscenarioSde['variante'] } : {}),
  };
}

export const DIR_ESCENARIOS = resolve(__dirname, '..', 'escenarios');
/** Variantes diagnósticas (secuencia del producto ≠ matriz). Se ejecutan aparte y sus reportes no cuentan como CP. */
export const DIR_VARIANTES = resolve(DIR_ESCENARIOS, '_variantes');

export function listarEscenarios(dir = DIR_ESCENARIOS): string[] {
  if (!existsSync(dir)) return [];
  // Orden NUMÉRICO del prefijo (1-, 2-, …, 10-): es el orden de ejecución de los verticales.
  return readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f) && !f.startsWith('_'))
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).map((f) => resolve(dir, f));
}
