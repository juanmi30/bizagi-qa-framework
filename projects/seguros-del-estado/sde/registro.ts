import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HistorialCasos } from '../../../shared/utils/HistorialCasos';
import type { ReporteCp } from './modelo';

/**
 * Salidas LOCALES de la ejecución SDE (test-results/ está ignorado):
 *  - test-results/seguros-del-estado/historico-casos.json (HistorialCasos COMPARTIDO, modo "portal"):
 *    cada caso real creado por la automatización, para trazabilidad, `npm run resumen` y para no
 *    confundirlo con casos de otros equipos. SDE no tiene cleanup físico (CLEANUP_NOT_APPLICABLE).
 *  - sde/<CP>_<unico>.json: reporte por CP ya sanitizado (sin valores de .env).
 */
export const DIR_SALIDA = resolve(__dirname, '..', '..', '..', 'test-results', 'seguros-del-estado', 'sde');

/**
 * Evidencia histórica VERSIONADA (copia sanitizada de reportes relevantes). test-results/ no viaja con Git: tras
 * clonar, las métricas de ejecución se reconstruyen solo con esta carpeta.
 */
export const DIR_EVIDENCIA_VERSIONADA = resolve(__dirname, '..', 'docs', 'evidencia');

/** Bloqueo exclusivo de las ejecuciones reales de SDE (H6): una a la vez, aunque se pase --workers o se abran dos terminales. */
export const RUTA_BLOQUEO_EJECUCION_REAL = resolve(DIR_SALIDA, '..', '.ejecucion-real.lock');

export async function registrarCasoCreado(
  entrada: { cp: string; numero: string; actor: string; unico: string; cleanup: string },
  directorioBase = resolve(__dirname, '..', '..', '..'),
): Promise<void> {
  await new HistorialCasos({ proyecto: 'seguros-del-estado', directorioBase }).registrar({
    numeroCaso: entrada.numero,
    escenario: `${entrada.cp} [${entrada.actor}] ${entrada.unico} ${entrada.cleanup}`,
    modoCreacion: 'portal',
  });
}

/** `prefijo` (p. ej. "VARIANTE_") separa reportes que NO son evidencia del CP: las métricas solo leen "<CP>_*.json". */
export function guardarReporte(r: ReporteCp, prefijo = ''): string {
  mkdirSync(DIR_SALIDA, { recursive: true });
  const ruta = resolve(DIR_SALIDA, `${prefijo}${r.cp}_${r.unico}.json`);
  writeFileSync(ruta, JSON.stringify(r, null, 2) + '\n', 'utf8');
  return ruta;
}

/** Resumen legible (una línea por paso de matriz) para el reporte HTML / consola. */
export function resumenTexto(r: ReporteCp): string {
  const lineas = [
    `${r.cp} — ${r.estado}: ${r.motivo}`,
    `Caso: ${r.numero_caso ?? '—'} | Actividades observadas: ${r.actividades_observadas.join(' → ') || '—'}`,
    ...r.bloqueos.map((b) => `BLOQUEO: ${b}`),
    ...r.matriz.map((m) => `  P${String(m.n).padStart(2, '0')} [${m.estado}] ${m.accion.slice(0, 90)}`),
    ...(r.pasos.some((p) => p.causa) ? ['Causas por paso: ' + r.pasos.filter((p) => p.causa).map((p) => `#${p.indice} ${p.estado}=${p.causa}`).join(', ')] : []),
    `Cleanup: ${r.cleanup.politica} — ${r.cleanup.razon}`,
  ];
  return lineas.join('\n');
}
