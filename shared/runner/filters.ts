/**
 * Filtros de escenarios compartidos por plantillas y grabados.
 * El runner (tools/run.mjs) pasa los parámetros como variables de entorno:
 *   FUENTE_ESCENARIO = plantillas | grabados | ''   (de --fuente)
 *   ESCENARIO_FILTRO = texto a buscar | ''          (de --escenario)
 */

/** Quita tildes y pasa a minúsculas, para comparar sin importar mayúsculas/acentos. */
export function normaliza(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** ¿Se debe registrar esta fuente ('plantillas' o 'grabados') según --fuente? */
export function fuentePermitida(origen: 'plantillas' | 'grabados'): boolean {
  const f = process.env.FUENTE_ESCENARIO;
  return !f || normaliza(f) === origen;
}

/** ¿Coincide alguno de los "nombres" del escenario con --escenario? */
export function escenarioPermitido(candidatos: Array<string | undefined>): boolean {
  const e = process.env.ESCENARIO_FILTRO;
  if (!e) return true;
  const n = normaliza(e);
  return candidatos.some((c) => c != null && normaliza(c).includes(n));
}
