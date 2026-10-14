import type { TipoOperacionFuncional } from './funcional';
import type { CampoAfi } from './modelo';
import { POLITICAS_AFI } from './politicas';

/**
 * Política de evidencias AFI (Fase 4G). Capa pura: sin Playwright, sin process.env.
 * La política pertenece al FRAMEWORK: ni el contrato del caso (DefinicionCasoAfi v1) ni el agente
 * que lo genera deciden qué se captura. Es configuración de ejecución.
 *
 * - EvidenciaCliente: screenshot de viewport tomado justo después de una assertion, con máscara PII
 *   verificada. Apta para reporte/certificación y portable.
 * - EvidenciaTecnica: JSON del runner, traza, video y trace de Playwright. Uso interno; nunca entra
 *   automáticamente al paquete cliente.
 */

/** off: sin capa de evidencias. cliente: screenshots cliente (QA real). tecnica: video/trace siempre. todo: ambas (depuración). */
export const MODOS_EVIDENCIA_AFI = ['off', 'cliente', 'tecnica', 'todo'] as const;
export type ModoEvidenciaAfi = typeof MODOS_EVIDENCIA_AFI[number];
export const MODO_EVIDENCIA_POR_DEFECTO: ModoEvidenciaAfi = 'cliente';

/** Valor de control (CLI/entorno) -> modo. Vacío = por defecto; desconocido = error (nunca se adivina). */
export function modoEvidenciaAfi(valor: string | undefined): ModoEvidenciaAfi {
  if (valor === undefined || valor.trim() === '') return MODO_EVIDENCIA_POR_DEFECTO;
  const modo = valor.trim().toLowerCase();
  if (!(MODOS_EVIDENCIA_AFI as readonly string[]).includes(modo)) {
    throw new Error(`Modo de evidencia desconocido ${JSON.stringify(valor.slice(0, 20))}. Modos: ${MODOS_EVIDENCIA_AFI.join(', ')}.`);
  }
  return modo as ModoEvidenciaAfi;
}
export const capturaCliente = (modo: ModoEvidenciaAfi): boolean => modo === 'cliente' || modo === 'todo';
export const capturaTecnica = (modo: ModoEvidenciaAfi): boolean => modo === 'tecnica' || modo === 'todo';

/**
 * Clase de cada operación del catálogo funcional (exhaustivo: una operación nueva no compila sin clasificarse).
 * - interaccion: cambia el estado (escribe, elige, cierra, pierde foco). Nunca se captura.
 * - assertion: observa y demuestra un estado (abrir un catálogo para leerlo es parte de observar).
 * - mixta: provoca una entrada y afirma el estado resultante; se captura el estado afirmado.
 */
export type ClaseOperacionAfi = 'interaccion' | 'assertion' | 'mixta';
export const CLASE_OPERACION_AFI: Readonly<Record<TipoOperacionFuncional, ClaseOperacionAfi>> = Object.freeze({
  'texto-ausente': 'assertion',
  'catalogo-opcion-fuera-de': 'assertion',
  'catalogo-no-vacio': 'assertion',
  // Su comprobación (exactamente una coincidencia) es precondición de la selección, no un estado demostrado.
  'seleccionar-exacto': 'interaccion',
  'cerrar-catalogo': 'interaccion',
  'componente-visible': 'assertion',
  'componente-posicion': 'assertion',
  'componente-region': 'assertion',
  'campo-estado': 'assertion',
  'campo-valor': 'assertion',
  escribir: 'interaccion',
  'entrada-rechazada': 'mixta',
  'salir-del-campo': 'interaccion',
  'catalogo-segun-fuente': 'assertion',
  'sugerencias-segun-fuente': 'assertion',
});

/** Se captura evidencia cliente de esta operación (con cualquier veredicto: PASS, o FAIL best-effort). */
export function debeCapturarCliente(modo: ModoEvidenciaAfi, tipo: TipoOperacionFuncional): boolean {
  return capturaCliente(modo) && CLASE_OPERACION_AFI[tipo] !== 'interaccion';
}

/** Token seguro para nombres de archivo: nunca lleva valores funcionales (solo prefijo, id de paso y tipo de operación). */
const token = (s: string, max: number) => s.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max) || 'x';

/** Nombre determinista: CP02-P07-01-sugerencias-segun-fuente.png (sufijo -FAIL si la assertion falló). */
export function nombreEvidenciaCliente(prefijo: string, paso: string, orden: number, tipo: TipoOperacionFuncional, status: 'PASS' | 'FAIL'): string {
  return `${token(prefijo, 20)}-${token(paso, 20)}-${String(orden).padStart(2, '0')}-${tipo}${status === 'FAIL' ? '-FAIL' : ''}.png`;
}

/** Campos cuyo valor NUNCA puede verse en evidencia cliente (todo lo que no es 'public' en las políticas). */
export function camposSensiblesAfi(): CampoAfi[] {
  return (Object.keys(POLITICAS_AFI) as CampoAfi[]).filter(c => POLITICAS_AFI[c].sensibilidad !== 'public');
}

/** Campos sensibles sin selector de máscara conocido: si hay alguno, la máscara no está garantizada (fail-closed). */
export function camposSensiblesSinMascara(selectores: Partial<Record<CampoAfi, readonly string[]>>): CampoAfi[] {
  return camposSensiblesAfi().filter(c => !selectores[c]?.length);
}

/**
 * Valores sensibles a vigilar en pantalla (en memoria, nunca serializados). Solo textos con al menos
 * 4 caracteres: valores más cortos (o booleanos) no identifican a nadie y darían falsos positivos.
 */
export function valoresSensiblesVigilables(valores: Iterable<unknown>): string[] {
  const unicos = new Set<string>();
  for (const v of valores) if (typeof v === 'string' && v.trim().length >= 4) unicos.add(v.trim());
  return [...unicos];
}

// ---------- Resultado y manifest ----------

export type EstadoEvidenciaAfi = 'completa' | 'parcial' | 'error' | 'desactivada';
export type MotivoIncidenciaEvidencia =
  /** Hay campos sensibles sin selector de máscara: no se puede garantizar el masking. */
  | 'mascara-incompleta'
  /** Un valor sensible del caso está visible fuera de las máscaras: la captura se rechaza. */
  | 'pii-visible-sin-mascara'
  /** Falló la verificación o el screenshot (página cerrada, selector inválido, E/S...). */
  | 'captura-fallida';

/**
 * Resumen de evidencias dentro del resultado de ejecución. Independiente del resultado funcional:
 * una evidencia 'parcial' o 'error' NUNCA convierte un PASS funcional en FAIL.
 */
export interface ResumenEvidenciaAfi {
  modo: ModoEvidenciaAfi;
  estado: EstadoEvidenciaAfi;
  capturasCliente: number;
  adjuntosTecnicos: number;
  erroresCaptura: number;
  /** Nombre del manifest (relativo al paquete); ausente con modo off. */
  manifiesto?: string;
}

/** 'completa' si toda assertion ejecutada tiene su captura; 'parcial' si faltan algunas; 'error' si faltan todas. */
export function estadoEvidencia(modo: ModoEvidenciaAfi, capturas: number, errores: number): EstadoEvidenciaAfi {
  if (!capturaCliente(modo)) return 'desactivada';
  if (!errores) return 'completa';
  return capturas ? 'parcial' : 'error';
}

export interface EvidenciaClienteAfi {
  /** Orden global reproducible de la corrida (1..n), en lugar de timestamps. */
  secuencia: number;
  paso: string;
  esperado: string;
  /** Orden de la captura dentro del paso (01, 02...). */
  orden: number;
  /** Índice de la operación dentro del paso (0-based), para relacionarla con la ejecución funcional. */
  indiceOperacion: number;
  operacion: TipoOperacionFuncional;
  claseOperacion: Exclude<ClaseOperacionAfi, 'interaccion'>;
  status: 'PASS' | 'FAIL';
  clasificacion: 'cliente';
  tipo: 'screenshot';
  alcance: 'viewport';
  archivo: string;
  contentType: 'image/png';
  /** Cantidad de selectores de máscara PII aplicados. */
  mascarasPii: number;
}

export interface IncidenciaEvidenciaAfi {
  secuencia: number;
  paso: string;
  indiceOperacion: number;
  operacion: TipoOperacionFuncional;
  status: 'PASS' | 'FAIL';
  estado: 'EVIDENCE_ERROR';
  motivo: MotivoIncidenciaEvidencia;
  /** Seguro: tipo de error o conteos. Nunca mensajes con valores. */
  detalle?: string;
}

export interface EvidenciaTecnicaAfi {
  clasificacion: 'tecnica';
  tipo: 'json' | 'video' | 'trace';
  /** Archivo adjunto por el runner (json). Video/trace los gestiona Playwright al cerrar el contexto. */
  archivo?: string;
  contentType?: string;
  gestion: 'runner' | 'playwright';
  /** Política efectiva de Playwright para video/trace (p. ej. retain-on-failure). */
  politica?: string;
}

/** Resultado funcional de un caso/paso. NO_OBSERVABLE (4R.1): no certificado, nunca PASS ni FAIL. */
export type ResultadoFuncionalAfi = 'PASS' | 'FAIL' | 'NO_OBSERVABLE';

export interface ManifiestoEvidenciasAfi {
  version: 1;
  hu: string;
  caso: string;
  nombre: string;
  /** Resultado FUNCIONAL del caso (el de <prefijo>-resultado.json). */
  resultado: ResultadoFuncionalAfi;
  resultadoArchivo: string;
  evidencia: ResumenEvidenciaAfi;
  politica: { modo: ModoEvidenciaAfi; captura: 'assertion'; alcance: 'viewport'; mascaraPii: 'politicas-afi'; camposSinMascara: string[] };
  pasos: { id: string; esperado: string; resultado?: ResultadoFuncionalAfi }[];
  evidencias: EvidenciaClienteAfi[];
  incidencias: IncidenciaEvidenciaAfi[];
  tecnica: EvidenciaTecnicaAfi[];
}
