/**
 * Utilidades XML mínimas para OOXML (sin dependencias). No es un parser general: recorre etiquetas
 * respetando comillas en atributos, ignora declaraciones/comentarios/instrucciones y asume XML bien formado,
 * como el que producen Word y Excel. Suficiente para localizar elementos y extraer texto de forma determinista.
 */

export interface ElementoXml {
  nombre: string;
  /** Rango del elemento completo [inicio, fin). */
  inicio: number;
  fin: number;
  /** Rango del contenido (vacío si el elemento se autocierra). */
  inicioContenido: number;
  finContenido: number;
}

const ETIQUETA = /<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>/g;

/** Hijos directos dentro del rango [desde, hasta). */
export function hijosXml(xml: string, desde = 0, hasta = xml.length): ElementoXml[] {
  const hijos: ElementoXml[] = [];
  const re = new RegExp(ETIQUETA.source, 'g');
  re.lastIndex = desde;
  let profundidad = 0;
  let actual: { nombre: string; inicio: number; inicioContenido: number } | undefined;
  for (let m = re.exec(xml); m && m.index < hasta; m = re.exec(xml)) {
    if (!m[2]) continue; // comentario, declaración, CDATA
    const [texto, cierre, nombre, , autocierre] = m;
    if (cierre) {
      profundidad--;
      if (profundidad === 0 && actual) {
        if (actual.nombre !== nombre) throw new Error(`XML mal formado: se esperaba </${actual.nombre}> y llegó </${nombre}>.`);
        hijos.push({ ...actual, fin: m.index + texto.length, finContenido: m.index });
        actual = undefined;
      }
      if (profundidad < 0) break; // cierre del contenedor
    } else if (autocierre) {
      if (profundidad === 0) hijos.push({ nombre, inicio: m.index, fin: m.index + texto.length, inicioContenido: m.index + texto.length, finContenido: m.index + texto.length });
    } else {
      if (profundidad === 0) actual = { nombre, inicio: m.index, inicioContenido: m.index + texto.length };
      profundidad++;
    }
  }
  if (actual) throw new Error(`XML mal formado: <${actual.nombre}> sin cerrar.`);
  return hijos;
}

/** Todas las apariciones de un elemento (a cualquier profundidad), en orden de documento, sin anidar consigo mismo. */
export function elementosXml(xml: string, nombre: string, desde = 0, hasta = xml.length): ElementoXml[] {
  const encontrados: ElementoXml[] = [];
  const visitar = (d: number, h: number) => {
    for (const e of hijosXml(xml, d, h)) {
      if (e.nombre === nombre) encontrados.push(e);
      else if (e.finContenido > e.inicioContenido) visitar(e.inicioContenido, e.finContenido);
    }
  };
  visitar(desde, hasta);
  return encontrados;
}

export function primerElementoXml(xml: string, nombre: string): ElementoXml | undefined {
  return elementosXml(xml, nombre)[0];
}

export const contenidoXml = (xml: string, e: ElementoXml) => xml.slice(e.inicioContenido, e.finContenido);
export const textoXml = (xml: string, e: ElementoXml) => xml.slice(e.inicio, e.fin);

export function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function desescaparXml(texto: string): string {
  return texto.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[e];
  });
}

/** Valor de un atributo en la etiqueta de apertura del elemento. */
export function atributoXml(xml: string, e: ElementoXml, atributo: string): string | undefined {
  const apertura = xml.slice(e.inicio, e.inicioContenido || e.fin);
  const m = apertura.match(new RegExp(`\\s${atributo.replace(/[.:]/g, '\\$&')}="([^"]*)"`));
  return m ? desescaparXml(m[1]) : undefined;
}

/** Texto visible de un párrafo WordprocessingML: w:t, w:tab y w:br, en orden. */
export function textoParrafoDocx(xml: string, parrafo: ElementoXml = { nombre: 'w:p', inicio: 0, fin: xml.length, inicioContenido: 0, finContenido: xml.length }): string {
  const trozo = xml.slice(parrafo.inicioContenido, parrafo.finContenido);
  let texto = '';
  for (const m of trozo.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>|<w:instrText[^>]*>[^<]*<\/w:instrText>/g)) {
    if (m[0].startsWith('<w:instrText')) continue;
    texto += m[1] !== undefined ? desescaparXml(m[1]) : m[0].startsWith('<w:tab') ? '\t' : '\n';
  }
  return texto;
}
