import type { TipoOperacionFuncional } from '../funcional';
import type { DisenoCasoQa } from './disenoQa';
import { POLITICA_SELECCION_AFI, seleccionarEvidenciasPaso, type EvidenciaCandidata, type MotivoDescarte } from './seleccion';

/**
 * Soporte de certificación cliente AFI (Fase 4H): modelo intermedio PURO (sin DOCX ni Playwright).
 * Une tres fuentes separadas:
 *  - diseño QA (texto de acción y esperado, orden original) -> ÚNICA fuente textual;
 *  - ejecución (<caso>-resultado.json: veredicto por paso y número de caso real);
 *  - evidencia 4G (<caso>-evidencias.json + PNG) -> selección curada.
 * Las operaciones funcionales nunca son fuente del texto del paso.
 */

// ---------- Metadata corporativa (pública, declarativa, por HU) ----------

export interface MetaCasoSoporte {
  /** Hoja del libro de diseño QA. */
  hoja: string;
  /** Variante cuyos pasos se certifican; la acción del diseño debe empezar por [VARIANTE]. */
  variante: 'DESKTOP';
  /** Identificador EXTERNO del caso (tracker del cliente). No existe en el repo ni en el diseño: se declara aquí. */
  idExterno?: string;
}

export interface MetaSoporteAfi {
  version: 1;
  hu: string;
  cliente: string;
  proyecto: string;
  nombrePruebas: string;
  iteracion: string;
  fechaInicio: string;
  fechaFinalizacion: string;
  /** Título 1 de la sección de casos (p. ej. el área probada). */
  seccion: string;
  /** Texto del encabezado en lugar de [NOMBRE DEL ÁREA/PROYECTO/...]. */
  encabezado: string;
  /** Logo del cliente (archivo junto a la metadata). Reemplaza [Logo Cliente] del encabezado. */
  logoCliente: string;
  /** Rutas relativas a la raíz del repositorio (valores por defecto del CLI). */
  diseno: string;
  template: string;
  casos: Record<string, MetaCasoSoporte>;
}

const CAMPOS_TEXTO = ['hu', 'cliente', 'proyecto', 'nombrePruebas', 'iteracion', 'fechaInicio', 'fechaFinalizacion', 'seccion', 'encabezado', 'logoCliente', 'diseno', 'template'] as const;

export class MetaSoporteInvalidaError extends Error {
  constructor(readonly problemas: readonly string[]) {
    super(`Metadata de soporte inválida:\n${problemas.map(p => `- ${p}`).join('\n')}`);
    this.name = 'MetaSoporteInvalidaError';
  }
}

export function validarMetaSoporte(meta: unknown): MetaSoporteAfi {
  const p: string[] = [];
  const m = meta as Record<string, unknown>;
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new MetaSoporteInvalidaError(['debe ser un objeto']);
  if (m.version !== 1) p.push('version debe ser 1');
  for (const k of CAMPOS_TEXTO) if (typeof m[k] !== 'string' || !(m[k] as string).trim()) p.push(`${k}: texto requerido`);
  if (typeof m.logoCliente === 'string' && /[\\/]|\.\./.test(m.logoCliente)) p.push('logoCliente: solo un nombre de archivo junto a la metadata');
  for (const k of Object.keys(m)) if (![...CAMPOS_TEXTO, 'version', 'casos', '$comentario'].includes(k)) p.push(`${k}: propiedad no admitida`);
  const casos = m.casos as Record<string, Record<string, unknown>> | undefined;
  if (!casos || typeof casos !== 'object' || !Object.keys(casos).length) p.push('casos: requerido');
  else for (const [id, c] of Object.entries(casos)) {
    if (typeof c?.hoja !== 'string' || !c.hoja.trim()) p.push(`casos.${id}.hoja: requerido`);
    if (c?.variante !== 'DESKTOP') p.push(`casos.${id}.variante: solo DESKTOP en esta versión`);
    if (c?.idExterno !== undefined && (typeof c.idExterno !== 'string' || !/^\w[\w-]*$/.test(c.idExterno))) p.push(`casos.${id}.idExterno: identificador simple`);
    for (const k of Object.keys(c ?? {})) if (!['hoja', 'variante', 'idExterno'].includes(k)) p.push(`casos.${id}.${k}: propiedad no admitida`);
  }
  if (p.length) throw new MetaSoporteInvalidaError(p);
  return m as unknown as MetaSoporteAfi;
}

// ---------- Entradas de ejecución/evidencia (formas mínimas que se leen) ----------

export interface EvidenciaManifiesto {
  paso: string; archivo: string; operacion: TipoOperacionFuncional; status: 'PASS' | 'FAIL';
  indiceOperacion: number; orden: number; clasificacion: string; tipo: string;
}
export interface ManifiestoEntrada {
  caso: string; hu: string; resultado: 'PASS' | 'FAIL'; resultadoArchivo: string;
  evidencia: { estado: string };
  pasos: { id: string; esperado: string; resultado?: 'PASS' | 'FAIL' }[];
  evidencias: EvidenciaManifiesto[];
}
export interface ResultadoEntrada {
  metadata?: { caso?: string; hu?: string };
  numeroCaso?: string;
  resultado: 'PASS' | 'FAIL';
  pasosFuncionales: { id: string; esperado: string; resultado: 'PASS' | 'FAIL' }[];
}
/** Imagen del paquete ya verificada (existe, es PNG). */
export interface ImagenPaquete { sha256: string; ancho: number; alto: number }

// ---------- Modelo intermedio ----------

export type EstadoSoporte = 'GENERABLE' | 'SOPORTE_NO_GENERABLE' | 'BLOQUEADO_POR_EVIDENCIA' | 'INCONSISTENTE';

export type CodigoProblemaSoporte =
  | 'CASO_NO_CONFIGURADO' | 'MANIFIESTO_OTRO_CASO' | 'RESULTADO_OTRO_CASO' | 'HU_DISTINTA' | 'RESULTADO_INCONSISTENTE'
  | 'NUMERO_CASO_INVALIDO' | 'DISENO_SIN_OBJETIVO' | 'PASO_ID_INVALIDO' | 'PASO_NO_EN_DISENO' | 'PASO_ES_OBJETIVO'
  | 'VARIANTE_DISTINTA' | 'DRIFT_ESPERADO' | 'PASOS_INCONSISTENTES' | 'ORDEN_INCONSISTENTE' | 'EVIDENCIA_PASO_DESCONOCIDO'
  | 'PASO_NO_PASS' | 'EVIDENCIA_INCOMPLETA' | 'PASO_SIN_EVIDENCIA' | 'IMAGEN_FALTANTE';

export interface ProblemaSoporte { codigo: CodigoProblemaSoporte; paso?: string; detalle: string }

export interface ImagenSoporte { archivo: string; operacion: TipoOperacionFuncional; sha256: string; ancho: number; alto: number }

export interface PasoSoporteAfi {
  idAfi: string;
  numeroDiseno: number;
  accion: string;
  esperado: string;
  resultado: 'PASS' | 'FAIL';
  principal?: ImagenSoporte;
  suplementarias: ImagenSoporte[];
  /** Orden de las imágenes en el documento: cronológico (una transición se lee antes -> después). */
  ordenDocumento: string[];
  /**
   * Leyendas de las imágenes (solo con 2), en el orden del documento. Derivadas sin interpretar el contenido:
   * misma operación observada en dos momentos -> "Estado previo" / "Resultado final"; si no, "Evidencia 1" / "Evidencia 2".
   */
  leyendas?: string[];
  descartadas: { archivo: string; motivo: MotivoDescarte }[];
}

export interface CoberturaSoporte {
  /** completa: todos los pasos ejecutables del diseño están en esta ejecución; parcial: el diseño tiene pasos fuera de ella. */
  estado: 'completa' | 'parcial';
  variante: 'DESKTOP';
  /** Números de paso del diseño incluidos (sin el objetivo, que es documental). */
  pasosIncluidos: number[];
  pasosNoIncluidos: number[];
}

/** Leyendas genéricas de un par de evidencias, en orden cronológico (ver PasoSoporteAfi.leyendas). */
export function leyendasEvidencias(operaciones: readonly TipoOperacionFuncional[]): string[] | undefined {
  if (operaciones.length !== 2) return undefined;
  return operaciones[0] === operaciones[1] ? ['Estado previo', 'Resultado final'] : ['Evidencia 1', 'Evidencia 2'];
}

export interface SoporteCertificacionAfi {
  version: 1;
  estado: EstadoSoporte;
  motivo?: 'caso-funcional-fallido' | 'evidencia-incompleta' | 'inconsistencia-estructural';
  problemas: ProblemaSoporte[];
  proyecto: string;
  hu: string;
  caso: string;
  variante: 'DESKTOP';
  idExterno?: string;
  titulo: string;
  numeroCaso?: string;
  resultado: 'PASS' | 'FAIL';
  fuenteDiseno: { archivo: string; hoja: string; sha256: string };
  evidencia: { paquete: string; manifiesto: string; estado: string; politicaSeleccion: string };
  metadata: Pick<MetaSoporteAfi, 'cliente' | 'proyecto' | 'nombrePruebas' | 'iteracion' | 'fechaInicio' | 'fechaFinalizacion' | 'seccion' | 'encabezado'>;
  /** Paso 1 del diseño: contenido documental, NO automatizado y sin screenshot. */
  objetivo: { numeroDiseno: number; accion: string; texto: string; automatizado: false };
  pasos: PasoSoporteAfi[];
  /** Pasos del diseño que esta ejecución no cubre (transparencia de alcance). */
  pasosDisenoNoIncluidos: number[];
  /**
   * Alcance REAL de esta ejecución frente al caso QA completo (4H.1). "parcial" no invalida el soporte:
   * el documento debe declararlo. Nunca afirma nada sobre el resultado de los pasos no incluidos.
   */
  cobertura: CoberturaSoporte;
}

/**
 * Diferencias textuales AUTORIZADAS entre el esperado ejecutado y el del diseño: forma Unicode, comillas y guiones
 * tipográficos, espacios. Cualquier otra diferencia es drift y bloquea el soporte.
 */
export function normalizarTextoComparable(s: string): string {
  return s.normalize('NFC').replace(/[“”„«»]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-').replace(/[ \s]+/g, ' ').trim();
}

export interface EntradaPlanSoporte {
  proyecto: string;
  caso: string;
  meta: MetaSoporteAfi;
  diseno: DisenoCasoQa;
  fuenteDiseno: { archivo: string; hoja: string; sha256: string };
  manifiesto: ManifiestoEntrada;
  resultado: ResultadoEntrada;
  /** Imágenes presentes y válidas del paquete, por nombre de archivo. */
  imagenes: ReadonlyMap<string, ImagenPaquete>;
  /** Nombre de la carpeta del paquete (identifica la corrida). */
  paquete: string;
}

const ID_PASO = /^P(\d+)$/;

export function construirPlanSoporte(e: EntradaPlanSoporte): SoporteCertificacionAfi {
  const problemas: ProblemaSoporte[] = [];
  const problema = (codigo: CodigoProblemaSoporte, detalle: string, paso?: string) => problemas.push({ codigo, detalle, ...(paso ? { paso } : {}) });
  const { meta, diseno, manifiesto: m, resultado: r } = e;
  const conf = meta.casos[e.caso];
  if (!conf) problema('CASO_NO_CONFIGURADO', `El caso ${e.caso} no está en la metadata de soporte.`);
  const variante = conf?.variante ?? 'DESKTOP';

  // Identidad: todo debe hablar del mismo caso y la misma HU.
  if (m.caso !== e.caso) problema('MANIFIESTO_OTRO_CASO', `El manifest es del caso ${m.caso}, no de ${e.caso}.`);
  if (r.metadata?.caso !== e.caso) problema('RESULTADO_OTRO_CASO', `El resultado es del caso ${r.metadata?.caso}, no de ${e.caso}.`);
  if (m.hu !== meta.hu || (r.metadata?.hu !== undefined && r.metadata.hu !== meta.hu)) problema('HU_DISTINTA', `HU del manifest/resultado distinta de ${meta.hu}.`);
  if (m.resultado !== r.resultado) problema('RESULTADO_INCONSISTENTE', `Manifest ${m.resultado} y resultado ${r.resultado} no coinciden.`);
  if (!r.numeroCaso || !/^\d+$/.test(r.numeroCaso)) problema('NUMERO_CASO_INVALIDO', 'El resultado no tiene un número de caso de ejecución válido.');

  // Paso 1 del diseño = objetivo documental.
  const primero = diseno.pasos.find(p => p.numero === 1);
  if (!primero || normalizarTextoComparable(primero.accion).toLowerCase() !== 'objetivo:') problema('DISENO_SIN_OBJETIVO', `El paso 1 de la hoja ${diseno.hoja} no es "Objetivo:".`);

  // Pasos ejecutados: manifest y resultado deben declarar exactamente los mismos, en el mismo orden.
  const ejecutados = r.pasosFuncionales;
  if (JSON.stringify(ejecutados.map(p => p.id)) !== JSON.stringify(m.pasos.map(p => p.id))) {
    problema('PASOS_INCONSISTENTES', 'Los pasos del manifest y del resultado no coinciden.');
  }
  const conocidos = new Set(ejecutados.map(p => p.id));
  for (const ev of m.evidencias) if (!conocidos.has(ev.paso)) problema('EVIDENCIA_PASO_DESCONOCIDO', `Evidencia ${ev.archivo} de un paso no ejecutado.`, ev.paso);

  const pasos: PasoSoporteAfi[] = [];
  let anterior = 0;
  for (const ejecutado of ejecutados) {
    const id = ejecutado.id;
    // Correspondencia EXPLÍCITA: Pnn <-> paso nn del diseño, confirmada por variante y esperado (nunca por posición).
    const match = id.match(ID_PASO);
    if (!match) { problema('PASO_ID_INVALIDO', `Id de paso "${id.slice(0, 20)}" no tiene la forma Pnn.`, id); continue; }
    const numero = Number(match[1]);
    if (numero === 1) { problema('PASO_ES_OBJETIVO', 'El paso 1 del diseño es el objetivo: no es ejecutable.', id); continue; }
    const deDiseno = diseno.pasos.find(p => p.numero === numero);
    if (!deDiseno) { problema('PASO_NO_EN_DISENO', `El diseño (hoja ${diseno.hoja}) no tiene el paso ${numero}.`, id); continue; }
    if (!deDiseno.accion.trimStart().startsWith(`[${variante}]`)) problema('VARIANTE_DISTINTA', `El paso ${numero} del diseño no es de la variante ${variante}.`, id);
    if (normalizarTextoComparable(deDiseno.esperado) !== normalizarTextoComparable(ejecutado.esperado)) {
      problema('DRIFT_ESPERADO', `El esperado ejecutado del paso ${numero} no coincide con el diseño QA vigente.`, id);
    }
    if (numero <= anterior) problema('ORDEN_INCONSISTENTE', `El paso ${numero} se ejecutó después del ${anterior}.`, id);
    anterior = numero;
    if (r.resultado === 'PASS' && ejecutado.resultado !== 'PASS') problema('PASO_NO_PASS', `Caso PASS con el paso ${id} ${ejecutado.resultado}.`, id);

    // Evidencia: solo capturas cliente cuya imagen exista y sea válida.
    const candidatas: EvidenciaCandidata[] = [];
    for (const ev of m.evidencias.filter(x => x.paso === id && x.clasificacion === 'cliente' && x.tipo === 'screenshot')) {
      const img = e.imagenes.get(ev.archivo);
      if (!img) { problema('IMAGEN_FALTANTE', `Falta o no es PNG válido: ${ev.archivo}.`, id); continue; }
      candidatas.push({ archivo: ev.archivo, operacion: ev.operacion, status: ev.status, indiceOperacion: ev.indiceOperacion, orden: ev.orden, sha256: img.sha256 });
    }
    const sel = seleccionarEvidenciasPaso(candidatas);
    const imagen = (c: EvidenciaCandidata): ImagenSoporte => ({ archivo: c.archivo, operacion: c.operacion, sha256: c.sha256, ancho: e.imagenes.get(c.archivo)!.ancho, alto: e.imagenes.get(c.archivo)!.alto });
    if (!sel.principal) problema('PASO_SIN_EVIDENCIA', `El paso ${id} no tiene evidencia cliente PASS.`, id);
    const elegidas = [...(sel.principal ? [sel.principal] : []), ...sel.suplementarias]
      .sort((a, b) => a.indiceOperacion - b.indiceOperacion || a.orden - b.orden);
    pasos.push({
      idAfi: id, numeroDiseno: numero, accion: deDiseno.accion, esperado: deDiseno.esperado, resultado: ejecutado.resultado,
      ...(sel.principal ? { principal: imagen(sel.principal) } : {}),
      suplementarias: sel.suplementarias.map(imagen), ordenDocumento: elegidas.map(c => c.archivo),
      ...(elegidas.length === 2 ? { leyendas: leyendasEvidencias(elegidas.map(c => c.operacion)) } : {}),
      descartadas: sel.descartadas,
    });
  }
  if (m.evidencia.estado !== 'completa') problema('EVIDENCIA_INCOMPLETA', `La evidencia 4G de la corrida está "${m.evidencia.estado}".`);

  const DE_EVIDENCIA: CodigoProblemaSoporte[] = ['EVIDENCIA_INCOMPLETA', 'PASO_SIN_EVIDENCIA', 'IMAGEN_FALTANTE'];
  const estructurales = problemas.filter(p => !DE_EVIDENCIA.includes(p.codigo));
  const estado: EstadoSoporte = estructurales.length ? 'INCONSISTENTE'
    : r.resultado !== 'PASS' ? 'SOPORTE_NO_GENERABLE'
      : problemas.length ? 'BLOQUEADO_POR_EVIDENCIA' : 'GENERABLE';
  const motivo = estado === 'INCONSISTENTE' ? 'inconsistencia-estructural' as const
    : estado === 'SOPORTE_NO_GENERABLE' ? 'caso-funcional-fallido' as const
      : estado === 'BLOQUEADO_POR_EVIDENCIA' ? 'evidencia-incompleta' as const : undefined;

  const incluidos = new Set([1, ...pasos.map(p => p.numeroDiseno)]);
  const noIncluidos = diseno.pasos.map(p => p.numero).filter(n => !incluidos.has(n)).sort((a, b) => a - b);
  return {
    version: 1, estado, ...(motivo ? { motivo } : {}), problemas,
    proyecto: e.proyecto, hu: meta.hu, caso: e.caso, variante,
    ...(conf?.idExterno ? { idExterno: conf.idExterno } : {}),
    titulo: conf?.idExterno ? `${conf.idExterno} - ${diseno.titulo}` : diseno.titulo,
    ...(r.numeroCaso && /^\d+$/.test(r.numeroCaso) ? { numeroCaso: r.numeroCaso } : {}),
    resultado: r.resultado,
    fuenteDiseno: e.fuenteDiseno,
    evidencia: { paquete: e.paquete, manifiesto: `${e.caso}-evidencias.json`, estado: m.evidencia.estado, politicaSeleccion: POLITICA_SELECCION_AFI },
    metadata: {
      cliente: meta.cliente, proyecto: meta.proyecto, nombrePruebas: meta.nombrePruebas, iteracion: meta.iteracion,
      fechaInicio: meta.fechaInicio, fechaFinalizacion: meta.fechaFinalizacion, seccion: meta.seccion, encabezado: meta.encabezado,
    },
    objetivo: { numeroDiseno: 1, accion: primero?.accion ?? '', texto: primero?.esperado ?? '', automatizado: false },
    pasos,
    pasosDisenoNoIncluidos: noIncluidos,
    cobertura: {
      estado: noIncluidos.length ? 'parcial' : 'completa', variante,
      pasosIncluidos: pasos.map(p => p.numeroDiseno), pasosNoIncluidos: noIncluidos,
    },
  };
}
