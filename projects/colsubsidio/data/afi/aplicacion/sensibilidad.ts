/**
 * DETECCIÓN CONTEXTUAL DE PII en conocimiento declarativo (Fase 4O). Capa pura.
 *
 * Dos contextos con heurísticas distintas:
 *  A. CONTENIDO SEMÁNTICO (descripción, evidencia, alias, señales...): estricta. Ninguna secuencia larga de dígitos,
 *     teléfono agrupado ni monto con separadores de miles tiene razón de estar en la descripción de una entidad.
 *  B. METADATOS DE FUENTE (fuente, hu/caso/paso/condición, ids de propuesta): los documentos reales llevan fechas
 *     compactas en el nombre, versiones e identificadores documentales. Se permiten fechas plausibles e
 *     identificadores con prefijo alfabético; se bloquean direcciones electrónicas, números sueltos largos y
 *     números precedidos de una palabra que los declara personales.
 *
 * Es una heurística: fail-closed ante lo dudoso en A; en B el objetivo es no rechazar metadatos documentales legítimos.
 */

const EMAIL = /[\w.+-]+@[\w-]+\.\w/;

const PII_CONTENIDO: readonly RegExp[] = [
  EMAIL,
  /\d{7,}/,
  /\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/,
  /\b\d{1,3}(?:[.,]\d{3}){2,}\b/,
];

/** Palabras que convierten un número cercano en dato personal, sea cual sea su forma. */
const PALABRA_PERSONAL = /(c[eé]dula|\bcc\b|\bnit\b|tel[eé]fono|\btel\b|celular|m[oó]vil|identificaci[oó]n|documento|pasaporte|salario|ingreso)[^a-z0-9]{0,3}\d{5,}/i;

/** YYYYMMDD, opcionalmente seguido de hhmm o hhmmss. */
export function fechaCompactaPlausible(d: string): boolean {
  if (![8, 12, 14].includes(d.length)) return false;
  const [anio, mes, dia, hora, min, seg] = [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8), d.slice(8, 10), d.slice(10, 12), d.slice(12, 14)].map(Number);
  if (anio < 1990 || anio > 2099 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  if (d.length >= 12 && (hora > 23 || min > 59)) return false;
  return d.length < 14 || seg <= 59;
}

/** A. Contenido semántico: estricto. */
export function piiEnContenido(texto: string): boolean {
  return PII_CONTENIDO.some(re => re.test(texto));
}

/** B. Metadatos de fuente: permite fechas compactas e identificadores documentales (REQ-NNNNNNN, RQNNNNNNN, v2). */
export function piiEnMetadato(texto: string): boolean {
  if (EMAIL.test(texto) || PALABRA_PERSONAL.test(texto)) return true;
  for (const m of texto.matchAll(/\d{7,}/g)) {
    if (fechaCompactaPlausible(m[0])) continue;
    // Identificador documental: el número va pegado (o con guion) a un prefijo alfabético.
    if (/[A-Za-z]{2,}-?$/.test(texto.slice(0, m.index))) continue;
    return true;
  }
  return false;
}

/** Enmascara lo que PODRÍA ser personal antes de copiar un detalle a un artefacto durable. */
export function enmascarar(texto: string): string {
  return texto.replace(new RegExp(EMAIL.source + '[\\w.-]*', 'g'), '[email]').replace(/\d{5,}/g, '[num]').slice(0, 160);
}
