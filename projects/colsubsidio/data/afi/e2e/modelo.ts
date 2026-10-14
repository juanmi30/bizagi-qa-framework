/**
 * Resultados de la ejecución de un caso E2E (cualquier CP/HU). Puro. La DEFINICIÓN del caso vive en la sección `e2e` del
 * .afi.json (./contrato.ts) y su compilación en ./compilador.ts; aquí solo están los estados y el veredicto.
 */
import type { ClasificacionGapE2E } from './compilador';

export type EstadoPasoE2E = 'PASS' | 'FAIL' | 'BLOCKED' | 'PARTIAL';

export interface ResultadoVerificacion {
  tipo: string;
  estado: EstadoPasoE2E;
  /** Detalle seguro (textos públicos, conteos, nombres de clases de error; nunca valores del actor). */
  detalle: string;
  clasificacion?: ClasificacionGapE2E;
}

export interface ResultadoPasoE2E {
  paso: number;
  dispositivo: 'desktop' | 'mobile';
  estado: EstadoPasoE2E;
  verificaciones: ResultadoVerificacion[];
}

/** Estado de un paso a partir de sus verificaciones: FAIL > BLOCKED > PARTIAL > PASS. */
export function estadoPaso(vs: readonly ResultadoVerificacion[]): EstadoPasoE2E {
  if (!vs.length) return 'BLOCKED';
  if (vs.some(v => v.estado === 'FAIL')) return 'FAIL';
  if (vs.every(v => v.estado === 'BLOCKED')) return 'BLOCKED';
  if (vs.some(v => v.estado !== 'PASS')) return 'PARTIAL';
  return 'PASS';
}

/** Veredicto global: E2E PASS solo si TODOS los pasos pasan. */
export function veredictoE2E(pasos: readonly ResultadoPasoE2E[]): 'E2E PASS' | 'FAIL' | 'PARTIAL/BLOCKED' {
  if (pasos.length && pasos.every(p => p.estado === 'PASS')) return 'E2E PASS';
  if (pasos.some(p => p.estado === 'FAIL')) return 'FAIL';
  return 'PARTIAL/BLOCKED';
}
