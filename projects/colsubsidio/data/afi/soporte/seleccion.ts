import type { TipoOperacionFuncional } from '../funcional';

/**
 * Selección DETERMINISTA de evidencia por paso (Fase 4H), sin IA. 4G conserva todas las capturas;
 * aquí se elige una vista curada: una principal y, como máximo, una suplementaria.
 *
 * Fuerza probatoria (mayor = demuestra más del resultado esperado con una sola imagen):
 *  - Contenido contrastado con una fuente autoritativa: el catálogo completo según fuente (60) prueba más que un
 *    subconjunto de sugerencias (55).
 *  - Entrada rechazada / texto ausente (50): prueban una restricción, no solo un estado.
 *  - Catálogo con opciones fuera de una lista / no vacío (45/40): contenido, pero sin fuente.
 *  - Estado de un campo: valor o editable/solo lectura (30). Empatan: ambos muestran el mismo control.
 *  - Estructura visual: posición relativa (20) > región (15) > visible (10); la posición relativa contiene la
 *    presencia y la ubicación a la vez.
 *  - Las interacciones nunca tienen captura cliente (null).
 *
 * Reglas:
 *  A. Empate de fuerza: gana la ÚLTIMA ejecutada (representa el resultado final del paso).
 *  B. La principal es la de mayor fuerza, aunque otra se haya tomado después.
 *  C. Suplementaria: la última restante cuya imagen NO es idéntica (sha256) a la principal: muestra el otro
 *     estado de una transición. Imágenes idénticas se descartan: no aportan nada.
 *  D. Nunca se selecciona una captura FAIL.
 */

export const POLITICA_SELECCION_AFI = 'fuerza-probatoria-v1';

export const FUERZA_PROBATORIA_AFI: Readonly<Record<TipoOperacionFuncional, number | null>> = Object.freeze({
  'catalogo-segun-fuente': 60,
  'sugerencias-segun-fuente': 55,
  'entrada-rechazada': 50,
  'texto-ausente': 50,
  'catalogo-opcion-fuera-de': 45,
  'catalogo-no-vacio': 40,
  'campo-valor': 30,
  'campo-estado': 30,
  'componente-posicion': 20,
  'componente-region': 15,
  'componente-visible': 10,
  'seleccionar-exacto': null,
  'cerrar-catalogo': null,
  escribir: null,
  'salir-del-campo': null,
});

export interface EvidenciaCandidata {
  archivo: string;
  operacion: TipoOperacionFuncional;
  status: 'PASS' | 'FAIL';
  /** Índice de la operación dentro del paso (orden de ejecución). */
  indiceOperacion: number;
  /** Orden de la captura dentro del paso. */
  orden: number;
  /** Hash del contenido de la imagen, para descartar duplicados exactos. */
  sha256: string;
}

export type MotivoDescarte = 'status-fail' | 'duplicado-identico' | 'excedente' | 'operacion-sin-fuerza';

export interface SeleccionEvidenciaPaso {
  principal?: EvidenciaCandidata;
  suplementarias: EvidenciaCandidata[];
  descartadas: { archivo: string; motivo: MotivoDescarte }[];
}

const cronologico = (a: EvidenciaCandidata, b: EvidenciaCandidata) => a.indiceOperacion - b.indiceOperacion || a.orden - b.orden;

export function seleccionarEvidenciasPaso(candidatas: readonly EvidenciaCandidata[], maxSuplementarias = 1): SeleccionEvidenciaPaso {
  const descartadas: SeleccionEvidenciaPaso['descartadas'] = [];
  const validas: EvidenciaCandidata[] = [];
  for (const c of [...candidatas].sort(cronologico)) {
    if (c.status !== 'PASS') descartadas.push({ archivo: c.archivo, motivo: 'status-fail' });
    else if (FUERZA_PROBATORIA_AFI[c.operacion] === null || FUERZA_PROBATORIA_AFI[c.operacion] === undefined) descartadas.push({ archivo: c.archivo, motivo: 'operacion-sin-fuerza' });
    else validas.push(c);
  }
  if (!validas.length) return { suplementarias: [], descartadas };
  // A/B: mayor fuerza; empate -> la última (>= al recorrer en orden cronológico).
  let principal = validas[0];
  for (const c of validas) if (FUERZA_PROBATORIA_AFI[c.operacion]! >= FUERZA_PROBATORIA_AFI[principal.operacion]!) principal = c;
  // C: de la más reciente a la más antigua, primeras imágenes distintas de las ya elegidas.
  const suplementarias: EvidenciaCandidata[] = [];
  const hashes = new Set([principal.sha256]);
  for (const c of validas.filter(v => v !== principal).reverse()) {
    if (hashes.has(c.sha256)) descartadas.push({ archivo: c.archivo, motivo: 'duplicado-identico' });
    else if (suplementarias.length < maxSuplementarias) { suplementarias.push(c); hashes.add(c.sha256); }
    else descartadas.push({ archivo: c.archivo, motivo: 'excedente' });
  }
  return { principal, suplementarias: suplementarias.sort(cronologico), descartadas: descartadas.sort((a, b) => a.archivo.localeCompare(b.archivo)) };
}
