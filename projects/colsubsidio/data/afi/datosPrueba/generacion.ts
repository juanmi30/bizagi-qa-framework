import { createHash } from 'node:crypto';

/**
 * Generación SINTÉTICA determinista (AFI-TEST-DATA §7.3) para datos FILLER autorizados como GENERATED. Pura y reproducible:
 * el mismo dominio + la misma semilla dan siempre el mismo valor; nunca "la primera opción" ni un extremo del rango.
 * La semilla la compone quien genera (p. ej. HU + CP + versión + campo); aquí solo se consume.
 */

/** Índice estable en [0, n) a partir de la semilla (sha256). */
export function indiceDeterminista(semilla: string, n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new Error('dominio vacío');
  return parseInt(createHash('sha256').update(semilla).digest('hex').slice(0, 12), 16) % n;
}

/**
 * Opción de un dominio OBSERVADO. El dominio se ordena (es) para que el valor no dependa del orden en que el Portal lo
 * presente; se descartan textos vacíos o de marcador ("Selecciona…").
 */
export function opcionDeDominio(dominio: readonly string[], semilla: string): string {
  const validas = [...new Set(dominio.map(o => o.replace(/\s+/g, ' ').trim()))].filter(o => o && !/^(Selecciona|Seleccione)\b/i.test(o))
    .sort((a, b) => a.localeCompare(b, 'es'));
  return validas[indiceDeterminista(semilla, validas.length)];
}

/** Entero en [min, max] (ambos incluidos). Para no usar extremos, quien llama fija un rango interior al permitido. */
export function enteroEnRango(min: number, max: number, semilla: string): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new Error('rango inválido');
  return min + indiceDeterminista(semilla, max - min + 1);
}
