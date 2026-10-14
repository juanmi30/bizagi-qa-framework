import { escribirZip, leerZip, type EntradaZip } from '../../../../../shared/utils/zip';
import { atributoXml, elementosXml, escaparXml, hijosXml, primerElementoXml, textoParrafoDocx, textoXml, type ElementoXml } from '../../../../../shared/utils/xml';
import type { SoporteCertificacionAfi } from './plan';

/**
 * Render DOCX del soporte (Fase 4H) usando la plantilla corporativa como TEMPLATE (estrategia A):
 * se abre una copia y se reemplaza SOLO el contenido variable. Se conservan byte a byte estilos, tema,
 * numeración, pie de página, portada, control de versiones, tamaño de página y márgenes.
 *  - Cuerpo: tablas de identificación rellenas, índice (TOC) regenerado y la sección de placeholders
 *    "[Nombre Área/...]" reemplazada por el caso: Título 1/2/3 y "Paso N. / Resultado del paso / imagen".
 *  - Encabezado: [Logo Cliente] -> logo declarado; [NOMBRE DEL ÁREA/...] -> texto declarado.
 *  - Propiedades: sin autores de la plantilla; el índice queda marcado para actualizarse al abrir en Word.
 * Si la plantilla no tiene la estructura esperada, falla (nunca genera un documento a medias).
 */

export class PlantillaSoporteError extends Error {
  constructor(detalle: string) {
    super(`La plantilla de soporte no tiene la estructura esperada: ${detalle}`);
    this.name = 'PlantillaSoporteError';
  }
}

export interface RecursosSoporteDocx {
  template: Buffer;
  logoCliente: Buffer;
  /** PNG por nombre de archivo del paquete 4G (solo los seleccionados en el plan). */
  imagenes: ReadonlyMap<string, Buffer>;
}

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const REL_IMAGEN = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const EMU_POR_TWIP = 635;
/** Tamaño del logo de cliente en el encabezado: el mismo ancho que usa el soporte histórico de QA. */
const ANCHO_LOGO_EMU = 1_054_273;

// ---------- Construcción de WordprocessingML ----------

/** Texto como runs: los saltos de línea del diseño se conservan como <w:br/>. */
function runs(texto: string, negrita = false): string {
  const rPr = negrita ? '<w:rPr><w:b/><w:bCs/></w:rPr>' : '';
  return texto.split(/\r?\n/).map((linea, i) => `<w:r>${rPr}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${escaparXml(linea)}</w:t></w:r>`).join('');
}
const juntos = '<w:pPr><w:keepNext/><w:keepLines/></w:pPr>';
const parrafo = (contenido = '', pPr = '') => `<w:p>${pPr}${contenido}</w:p>`;
const pPrDe = (xml: string, p: ElementoXml) => { const e = hijosXml(xml, p.inicioContenido, p.finContenido).find(h => h.nombre === 'w:pPr'); return e ? textoXml(xml, e) : ''; };

function dibujo(rid: string, id: number, nombre: string, cx: number, cy: number, descripcion: string): string {
  return `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>`
    + `<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${escaparXml(nombre)}" descr="${escaparXml(descripcion)}"/>`
    + `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS_A}" noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `<a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}"><pic:pic xmlns:pic="${NS_PIC}">`
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="${escaparXml(nombre)}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}

// ---------- Presentación de evidencias (4H.1) ----------

/** Márgenes izquierdo+derecho de celda por defecto de la plantilla (Tablanormal: 108 twips por lado). */
const MARGEN_CELDA_EMU = 2 * 108 * EMU_POR_TWIP;
const EMU_POR_PT = 12_700;
/** Normal de la plantilla: 9 pt; interlineado estimado de forma conservadora. */
const ALTO_LINEA_EMU = Math.round(9 * 1.6 * EMU_POR_PT);
const ALTO_LEYENDA_EMU = Math.round(8 * 1.8 * EMU_POR_PT);
/** Holgura sobre el alto útil: la estimación de texto nunca es exacta. */
const HOLGURA = 0.9;

export interface GeometriaPagina { anchoUtil: number; altoUtil: number }
export interface DisposicionEvidencias { modo: 'unica' | 'lado-a-lado' | 'vertical'; medidas: { cx: number; cy: number }[] }

/** Alto estimado (EMU) de los párrafos de un paso: caracteres por línea deducidos del ancho útil (conservador). */
export function altoTextoPaso(textos: readonly string[], anchoUtil: number): number {
  const porLinea = Math.max(20, Math.floor(anchoUtil / EMU_POR_PT / 6));
  const lineas = textos.reduce((n, t) => n + t.split(/\r?\n/).reduce((m, l) => m + Math.max(1, Math.ceil(l.length / porLinea)), 0), 0);
  return lineas * ALTO_LINEA_EMU;
}

/**
 * Disposición DETERMINISTA de las evidencias de un paso, sin recortar ni deformar (proporción exacta).
 *  - 1 imagen: ancho útil completo (máx. 60 % del alto útil).
 *  - 2 imágenes: se evalúan "lado a lado" (dos columnas) y "vertical" (una columna, ancho reducido para que
 *    texto + ambas imágenes + leyendas quepan en UNA página). Gana la que da imágenes más anchas (legibilidad);
 *    empate -> lado a lado (más compacta). Con capturas apaisadas suele ganar vertical; con verticales, lado a lado.
 */
export function disponerEvidencias(imagenes: readonly { ancho: number; alto: number }[], g: GeometriaPagina, altoTexto: number): DisposicionEvidencias {
  const escalar = (img: { ancho: number; alto: number }, cx: number, altoMax: number) => {
    let ancho = Math.floor(cx), alto = Math.round(ancho * img.alto / img.ancho);
    if (alto > altoMax) { alto = Math.floor(altoMax); ancho = Math.round(alto * img.ancho / img.alto); }
    return { cx: ancho, cy: alto };
  };
  if (imagenes.length === 1) return { modo: 'unica', medidas: [escalar(imagenes[0], g.anchoUtil, g.altoUtil * 0.6)] };
  if (imagenes.length !== 2) throw new Error(`Se admiten 1 o 2 evidencias por paso (hay ${imagenes.length}).`);
  const disponible = g.altoUtil * HOLGURA - altoTexto;
  const lado = imagenes.map(img => escalar(img, g.anchoUtil / 2 - MARGEN_CELDA_EMU, disponible - ALTO_LEYENDA_EMU));
  const porImagen = (disponible - 2 * ALTO_LEYENDA_EMU) / 2;
  // Mismo ancho para ambas en vertical (bloque alineado): el que permita la más alta.
  const anchoVertical = Math.min(g.anchoUtil - MARGEN_CELDA_EMU, ...imagenes.map(i => porImagen * i.ancho / i.alto));
  const vertical = imagenes.map(img => escalar(img, anchoVertical, porImagen));
  const minimo = (m: { cx: number }[]) => Math.min(...m.map(x => x.cx));
  return minimo(vertical) > minimo(lado) ? { modo: 'vertical', medidas: vertical } : { modo: 'lado-a-lado', medidas: lado };
}

/** "paso 5" · "pasos 2 a 10" · "pasos 2 a 5, 7 y 9". */
export function formatearPasos(numeros: readonly number[]): string {
  const orden = [...new Set(numeros)].sort((a, b) => a - b);
  const tramos: string[] = [];
  for (let i = 0; i < orden.length;) {
    let j = i;
    while (j + 1 < orden.length && orden[j + 1] === orden[j] + 1) j++;
    tramos.push(j > i ? `${orden[i]} a ${orden[j]}` : `${orden[i]}`);
    i = j + 1;
  }
  const lista = tramos.length > 1 ? `${tramos.slice(0, -1).join(', ')} y ${tramos.at(-1)}` : tramos[0] ?? '';
  return `${orden.length === 1 ? 'paso' : 'pasos'} ${lista}`;
}

/**
 * Geometría EFECTIVA de la celda del logo (4H.1.1). La plantilla declara anchos distintos en la rejilla
 * (w:tblGrid/w:gridCol) y en el ancho preferido de la celda (w:tcW). Word puede autoajustar, pero LibreOffice
 * respeta la rejilla: el render real cortó el logo. Por seguridad se usa lo MÁS RESTRICTIVO:
 *  - rejilla: suma de los gridCol que ocupa la celda (índice de rejilla = gridSpan acumulado de las celdas previas);
 *  - tcW (pct sobre tblW, o dxa) como límite adicional si existe.
 * Ancho interior = ancho - márgenes izquierdo/derecho de la celda (tcMar > tblCellMar > 108 twips por defecto).
 * Alto mínimo = filas que la celda abarca (vMerge).
 */
export function geometriaCeldaLogo(header: string, parrafoLogo: ElementoXml, anchoTextoTwips: number): { anchoInterior: number; altoMinimo: number; anchoRejilla: number; anchoPreferido?: number } {
  const tabla = elementosXml(header, 'w:tbl').find(t => t.inicio <= parrafoLogo.inicio && t.fin >= parrafoLogo.fin);
  if (!tabla) throw new PlantillaSoporteError('el logo del encabezado no está en una tabla');
  const medida = (e: ElementoXml | undefined, base: number) => {
    if (!e) return undefined;
    const w = Number(atributoXml(header, e, 'w:w')), tipo = atributoXml(header, e, 'w:type');
    return tipo === 'pct' ? base * w / 5000 : tipo === 'dxa' ? w : undefined;
  };
  const anchoTabla = medida(elementosXml(header, 'w:tblW', tabla.inicio, tabla.fin)[0], anchoTextoTwips) ?? anchoTextoTwips;
  const filas = elementosXml(header, 'w:tr', tabla.inicio, tabla.fin);
  const iFila = filas.findIndex(f => f.inicio <= parrafoLogo.inicio && f.fin >= parrafoLogo.fin);
  const celdas = (f: ElementoXml) => elementosXml(header, 'w:tc', f.inicio, f.fin);
  const iCelda = celdas(filas[iFila]).findIndex(c => c.inicio <= parrafoLogo.inicio && c.fin >= parrafoLogo.fin);
  const celda = celdas(filas[iFila])[iCelda];
  // Solo las propiedades PROPIAS de la celda (no las de tablas anidadas).
  const tcPr = hijosXml(header, celda.inicioContenido, celda.finContenido).find(h => h.nombre === 'w:tcPr');
  const propia = (nombre: string, c: ElementoXml = celda) => {
    const pr = c === celda ? tcPr : hijosXml(header, c.inicioContenido, c.finContenido).find(h => h.nombre === 'w:tcPr');
    return pr ? hijosXml(header, pr.inicioContenido, pr.finContenido).find(h => h.nombre === nombre) : undefined;
  };
  const span = (c: ElementoXml) => { const g = propia('w:gridSpan', c); return g ? Number(atributoXml(header, g, 'w:val')) || 1 : 1; };
  const rejilla = elementosXml(header, 'w:gridCol', tabla.inicio, tabla.fin).map(g => Number(atributoXml(header, g, 'w:w')));
  const inicioRejilla = celdas(filas[iFila]).slice(0, iCelda).reduce((n, c) => n + span(c), 0);
  const columnas = rejilla.slice(inicioRejilla, inicioRejilla + span(celda));
  if (!columnas.length || columnas.some(w => !Number.isFinite(w) || w <= 0)) throw new PlantillaSoporteError('la rejilla de la tabla del encabezado no cubre la celda del logo');
  const anchoRejilla = columnas.reduce((a, w) => a + w, 0);
  const anchoPreferido = medida(propia('w:tcW'), anchoTabla);
  const ancho = Math.min(anchoRejilla, anchoPreferido ?? Infinity);
  // Márgenes de celda: los de la celda, si no los de la tabla, si no el valor por defecto de la plantilla.
  const margen = (lado: 'left' | 'right') => {
    const fuentes = [propia('w:tcMar'), elementosXml(header, 'w:tblCellMar', tabla.inicio, tabla.fin)[0]];
    for (const f of fuentes) {
      const e = f && (elementosXml(header, `w:${lado}`, f.inicio, f.fin)[0] ?? elementosXml(header, `w:${lado === 'left' ? 'start' : 'end'}`, f.inicio, f.fin)[0]);
      if (e) return Number(atributoXml(header, e, 'w:w')) || 0;
    }
    return 108;
  };
  let altoTwips = 0;
  for (let k = iFila; k < filas.length; k++) {
    if (k > iFila) {
      const c = celdas(filas[k])[iCelda];
      if (!c || !/<w:vMerge\/>|<w:vMerge w:val="continue"\/>/.test(textoXml(header, c))) break;
    }
    const alto = elementosXml(header, 'w:trHeight', filas[k].inicio, filas[k].fin)[0];
    altoTwips += alto ? Number(atributoXml(header, alto, 'w:val')) : 0;
  }
  return {
    anchoInterior: Math.floor((ancho - margen('left') - margen('right')) * EMU_POR_TWIP), altoMinimo: altoTwips * EMU_POR_TWIP,
    anchoRejilla, ...(anchoPreferido !== undefined ? { anchoPreferido } : {}),
  };
}

/** Dimensiones de un PNG (IHDR). */
export function dimensionesPng(png: Buffer): { ancho: number; alto: number } {
  if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47 || png.toString('ascii', 12, 16) !== 'IHDR') throw new Error('No es un PNG válido.');
  return { ancho: png.readUInt32BE(16), alto: png.readUInt32BE(20) };
}

/** Reemplaza rangos (de atrás hacia adelante para no invalidar índices). */
function reemplazarRangos(xml: string, cambios: { inicio: number; fin: number; por: string }[]): string {
  let r = xml;
  for (const c of [...cambios].sort((a, b) => b.inicio - a.inicio)) r = r.slice(0, c.inicio) + c.por + r.slice(c.fin);
  return r;
}

const textoDe = (xml: string, e: ElementoXml) => elementosXml(xml, 'w:p', e.inicio, e.fin).map(p => textoParrafoDocx(xml, p)).join('\n');

export function renderizarSoporteDocx(plan: SoporteCertificacionAfi, recursos: RecursosSoporteDocx): Buffer {
  if (plan.estado !== 'GENERABLE') throw new Error(`Soporte no generable (${plan.estado}): no se emite documento de certificación.`);
  const entradas = leerZip(recursos.template);
  const partes = new Map(entradas.map(e => [e.nombre, e.datos]));
  const parte = (nombre: string) => { const d = partes.get(nombre); if (!d) throw new PlantillaSoporteError(`falta ${nombre}`); return d.toString('utf8'); };
  let doc = parte('word/document.xml');
  let rels = parte('word/_rels/document.xml.rels');
  let header = parte('word/header1.xml');
  let headerRels = partes.has('word/_rels/header1.xml.rels') ? parte('word/_rels/header1.xml.rels')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const estilos = parte('word/styles.xml');
  for (const estilo of ['Ttulo1', 'Ttulo2', 'Ttulo3']) if (!estilos.includes(`w:styleId="${estilo}"`)) throw new PlantillaSoporteError(`falta el estilo ${estilo}`);
  if (!/xmlns:wp="/.test(doc.slice(0, 4000)) || !/xmlns:r="/.test(doc.slice(0, 4000))) throw new PlantillaSoporteError('document.xml sin namespaces wp/r');

  // ---- Identificadores libres (relaciones, docPr, bookmarks, media) ----
  const idsRel = new Set([...rels.matchAll(/Id="([^"]+)"/g), ...headerRels.matchAll(/Id="([^"]+)"/g)].map(m => m[1]));
  let nRel = 0;
  const nuevoRel = () => { let id: string; do id = `rIdAfi${++nRel}`; while (idsRel.has(id)); idsRel.add(id); return id; };
  let docPr = Math.max(0, ...[...doc.matchAll(/<wp:docPr id="(\d+)"/g), ...header.matchAll(/<wp:docPr id="(\d+)"/g)].map(m => Number(m[1]))) + 1000;
  let bookmark = Math.max(0, ...[...doc.matchAll(/<w:bookmarkStart w:id="(\d+)"/g)].map(m => Number(m[1]))) + 1;
  const nuevasMedias: EntradaZip[] = [];
  const nuevaMedia = (base: string, datos: Buffer) => {
    let nombre = `word/media/${base}.png`, k = 1;
    while (partes.has(nombre) || nuevasMedias.some(m => m.nombre === nombre)) nombre = `word/media/${base}-${++k}.png`;
    nuevasMedias.push({ nombre, datos });
    return nombre.slice('word/'.length);
  };

  // ---- Geometría útil de la página (márgenes de la plantilla) ----
  const sect = primerElementoXml(doc, 'w:sectPr');
  const pgSz = sect && elementosXml(doc, 'w:pgSz', sect.inicio, sect.fin)[0];
  const pgMar = sect && elementosXml(doc, 'w:pgMar', sect.inicio, sect.fin)[0];
  if (!pgSz || !pgMar) throw new PlantillaSoporteError('sin tamaño de página/márgenes');
  const n = (e: ElementoXml, a: string) => Number(atributoXml(doc, e, a));
  const anchoTextoTwips = n(pgSz, 'w:w') - n(pgMar, 'w:left') - n(pgMar, 'w:right');
  const geometria: GeometriaPagina = {
    anchoUtil: anchoTextoTwips * EMU_POR_TWIP,
    altoUtil: (n(pgSz, 'w:h') - n(pgMar, 'w:top') - n(pgMar, 'w:bottom')) * EMU_POR_TWIP,
  };

  // ---- Cuerpo ----
  const body = primerElementoXml(doc, 'w:body');
  if (!body) throw new PlantillaSoporteError('sin w:body');
  const hijos = hijosXml(doc, body.inicioContenido, body.finContenido);
  const indice = (pred: (e: ElementoXml, i: number) => boolean, que: string) => {
    const i = hijos.findIndex(pred);
    if (i < 0) throw new PlantillaSoporteError(`no se encontró ${que}`);
    return i;
  };
  const xmlDe = (e: ElementoXml) => textoXml(doc, e);
  const iToc = indice(e => e.nombre === 'w:p' && /<w:instrText[^>]*>\s*TOC\s/.test(xmlDe(e)), 'el campo TOC');
  const iTocFin = indice((e, i) => i > iToc && e.nombre === 'w:p' && xmlDe(e).includes('w:fldCharType="end"') && !xmlDe(e).includes('PAGEREF'), 'el fin del campo TOC');
  const iProyecto = indice(e => e.nombre === 'w:tbl' && textoDe(doc, e).includes('Nombre del Cliente'), 'la tabla Identificación del Proyecto');
  const iPruebas = indice(e => e.nombre === 'w:tbl' && textoDe(doc, e).includes('Iteración o Etapa'), 'la tabla Identificación de las Pruebas');
  const iSeccion = indice(e => e.nombre === 'w:p' && xmlDe(e).includes('w:val="Ttulo1"') && textoParrafoDocx(doc, e).startsWith('[Nombre'), 'la sección de placeholders del caso');
  const iSect = indice(e => e.nombre === 'w:sectPr', 'sectPr');
  if (!(iToc < iTocFin && iTocFin < iProyecto && iProyecto < iPruebas && iPruebas < iSeccion && iSeccion < iSect)) throw new PlantillaSoporteError('orden de secciones inesperado');

  const cambios: { inicio: number; fin: number; por: string }[] = [];

  // Tabla Identificación del Proyecto: la segunda fila recibe cliente | proyecto.
  {
    const t = hijos[iProyecto];
    const fila = elementosXml(doc, 'w:tr', t.inicio, t.fin)[1];
    const ps = fila ? elementosXml(doc, 'w:p', fila.inicio, fila.fin) : [];
    if (ps.length !== 2) throw new PlantillaSoporteError('la tabla Identificación del Proyecto no tiene la fila de valores');
    [plan.metadata.cliente, plan.metadata.proyecto].forEach((v, i) => cambios.push({ inicio: ps[i].inicio, fin: ps[i].fin, por: parrafo(runs(v), pPrDe(doc, ps[i])) }));
  }
  // Tabla Identificación de las Pruebas: valor en la celda derecha de cada etiqueta (sin el gris del placeholder).
  {
    const t = hijos[iPruebas];
    const valores: Record<string, string> = {
      Nombre: plan.metadata.nombrePruebas, 'Iteración o Etapa': plan.metadata.iteracion,
      'Fecha Inicio': plan.metadata.fechaInicio, 'Fecha Finalización': plan.metadata.fechaFinalizacion,
    };
    const pendientes = new Set(Object.keys(valores));
    for (const fila of elementosXml(doc, 'w:tr', t.inicio, t.fin)) {
      const celdas = elementosXml(doc, 'w:tc', fila.inicio, fila.fin);
      const etiqueta = celdas[0] && textoDe(doc, celdas[0]).trim();
      if (celdas.length !== 2 || !pendientes.has(etiqueta)) continue;
      const p = elementosXml(doc, 'w:p', celdas[1].inicio, celdas[1].fin)[0];
      const pPr = pPrDe(doc, p).replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '');
      cambios.push({ inicio: p.inicio, fin: p.fin, por: parrafo(runs(valores[etiqueta]), pPr) });
      pendientes.delete(etiqueta);
    }
    if (pendientes.size) throw new PlantillaSoporteError(`sin fila para ${[...pendientes].join(', ')}`);
  }

  // Sección del caso: reemplaza los placeholders (Título 1 hasta antes de sectPr).
  const marcadores = { seccion: '_TocAfiSeccion', caso: '_TocAfiCaso', numero: '_TocAfiNumero' };
  const titulo = (estilo: string, nombre: string, texto: string) => {
    const id = bookmark++;
    return `<w:p><w:pPr><w:pStyle w:val="${estilo}"/></w:pPr><w:bookmarkStart w:id="${id}" w:name="${nombre}"/>${runs(texto)}<w:bookmarkEnd w:id="${id}"/></w:p>`;
  };
  const paso = (numero: number, accion: string, esperado: string, imagenes: string) =>
    parrafo(`<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Paso ${numero}</w:t></w:r>${runs(`. ${accion}`)}`, juntos)
    + parrafo('', juntos) + parrafo(runs('Resultado del paso', true), juntos)
    + parrafo(runs(esperado), imagenes ? juntos : '') + (imagenes ? parrafo('', juntos) + imagenes : '') + parrafo();
  // Cobertura REAL de esta ejecución (solo desde el plan). El título y el objetivo QA se conservan tal cual.
  const cob = plan.cobertura;
  const variante = cob.variante.charAt(0) + cob.variante.slice(1).toLowerCase();
  const cobertura = parrafo(runs('Cobertura de esta ejecución: ', true) + runs(`${variante} — ${formatearPasos(cob.pasosIncluidos)}.`))
    + (cob.estado === 'parcial'
      ? parrafo(runs('No incluidos en esta ejecución: ', true) + runs(`${formatearPasos(cob.pasosNoIncluidos)} del diseño de prueba.`))
        + parrafo(runs('Este soporte documenta únicamente los pasos incluidos en esta ejecución.'))
      : '');
  let caso = titulo('Ttulo1', marcadores.seccion, plan.metadata.seccion)
    + titulo('Ttulo2', marcadores.caso, plan.titulo)
    + titulo('Ttulo3', marcadores.numero, `Número del caso: ${plan.numeroCaso}`)
    + cobertura
    + parrafo()
    // Paso 1: objetivo documental, sin screenshot ni marca de automatización.
    + paso(plan.objetivo.numeroDiseno, plan.objetivo.accion, plan.objetivo.texto, '');
  let nImagen = 0;
  const bordesNulos = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="nil"/>`).join('');
  const leyenda = (texto: string) => parrafo(`<w:r><w:rPr><w:i/><w:iCs/><w:color w:val="595959"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">${escaparXml(texto)}</w:t></w:r>`, '<w:pPr><w:jc w:val="center"/></w:pPr>');
  for (const p of plan.pasos) {
    const porArchivo = new Map([p.principal!, ...p.suplementarias].map(i => [i.archivo, i]));
    const elegidas = p.ordenDocumento.map(archivo => {
      const img = porArchivo.get(archivo), datos = recursos.imagenes.get(archivo);
      if (!img || !datos) throw new Error(`Falta la imagen seleccionada ${archivo} (paso ${p.idAfi}).`);
      const real = dimensionesPng(datos);
      if (real.ancho !== img.ancho || real.alto !== img.alto) throw new Error(`La imagen ${archivo} no coincide con el plan.`);
      return { img, datos };
    });
    const altoTexto = altoTextoPaso([`Paso ${p.numeroDiseno}. ${p.accion}`, '', 'Resultado del paso', p.esperado, ''], geometria.anchoUtil);
    const disposicion = disponerEvidencias(elegidas.map(e => e.img), geometria, altoTexto);
    const dibujos = elegidas.map(({ img, datos }, k) => {
      const rid = nuevoRel();
      const destino = nuevaMedia(`afi-evidencia-${String(++nImagen).padStart(2, '0')}`, datos);
      rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="${REL_IMAGEN}" Target="${destino}"/></Relationships>`);
      const { cx, cy } = disposicion.medidas[k];
      return dibujo(rid, docPr++, `Evidencia ${nImagen}`, cx, cy, img.archivo);
    });
    let bloque: string;
    if (disposicion.modo === 'unica') bloque = parrafo(dibujos[0], '<w:pPr><w:jc w:val="center"/></w:pPr>');
    else {
      // Dos evidencias: una tabla sin bordes de UNA fila indivisible (cantSplit). Con el texto del paso encadenado
      // (keepNext), ninguna imagen puede quedar sola en otra página; la leyenda repite el número del paso.
      const leyendas = p.leyendas ?? ['Evidencia 1', 'Evidencia 2'];
      const contenido = dibujos.map((d, k) => parrafo(d, '<w:pPr><w:keepNext/><w:jc w:val="center"/></w:pPr>') + leyenda(`Paso ${p.numeroDiseno} · ${leyendas[k]}`));
      const anchoTabla = anchoTextoTwips;
      const columnas = disposicion.modo === 'lado-a-lado' ? [Math.floor(anchoTabla / 2), anchoTabla - Math.floor(anchoTabla / 2)] : [anchoTabla];
      const celda = (w: number, xml: string) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${xml}</w:tc>`;
      const celdas = disposicion.modo === 'lado-a-lado' ? contenido.map((c, k) => celda(columnas[k], c)).join('') : celda(columnas[0], contenido.join(''));
      bloque = `<w:tbl><w:tblPr><w:tblW w:w="${anchoTabla}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${bordesNulos}</w:tblBorders>`
        + '<w:tblLayout w:type="fixed"/><w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>'
        + `<w:tblGrid>${columnas.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
        + `<w:tr><w:trPr><w:cantSplit/></w:trPr>${celdas}</w:tr></w:tbl>`;
    }
    caso += paso(p.numeroDiseno, p.accion, p.esperado, bloque);
  }
  cambios.push({ inicio: hijos[iSeccion].inicio, fin: hijos[iSect].inicio, por: caso });

  // Índice: mismas entradas que la plantilla, con los títulos reales; se marca para actualizar al abrir.
  {
    const originales = hijos.slice(iToc, iTocFin);
    const primero = originales[0];
    const xp = xmlDe(primero);
    const hasta = xp.indexOf('w:fldCharType="separate"');
    // Runs con o sin atributos (w:rsidR...): primer run después de las propiedades del párrafo.
    const finPPr = xp.indexOf('</w:pPr>');
    const cabeceraInicio = xp.slice(Math.max(finPPr, 0)).search(/<w:r[\s>]/) + Math.max(finPPr, 0);
    if (hasta < 0 || cabeceraInicio < Math.max(finPPr, 0)) throw new PlantillaSoporteError('campo TOC sin separador');
    const cabecera = xp.slice(cabeceraInicio, xp.indexOf('</w:r>', hasta) + '</w:r>'.length).replace('w:fldCharType="begin"/>', 'w:fldCharType="begin" w:dirty="true"/>');
    const pPrNivel = (estilo: string) => {
      const e = originales.find(o => xmlDe(o).includes(`w:val="${estilo}"`));
      if (!e) throw new PlantillaSoporteError(`índice sin nivel ${estilo}`);
      return pPrDe(doc, e);
    };
    const anclas = [...xp.matchAll(/w:anchor="([^"]+)"/g), ...originales.slice(1).flatMap(o => [...xmlDe(o).matchAll(/w:anchor="([^"]+)"/g)])].map(m => m[1]);
    // Página cacheada por la plantilla para su primer título (todos los títulos del caso empiezan en esa página).
    const pagina = xp.match(/w:fldCharType="separate"\/><\/w:r><w:r(?:\s[^>]*)?>(?:<w:rPr>(?:(?!<\/w:r>)[\s\S])*?<\/w:rPr>)?<w:t>(\d+)<\/w:t>/)?.[1] ?? '';
    const entrada = (estilo: string, ancla: string, texto: string, conCabecera = false) => `<w:p>${pPrNivel(estilo)}${conCabecera ? cabecera : ''}`
      + `<w:hyperlink w:anchor="${ancla}" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hipervnculo"/><w:noProof/></w:rPr><w:t xml:space="preserve">${escaparXml(texto.replace(/\s*\n\s*/g, ' '))}</w:t></w:r>`
      + '<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:tab/></w:r><w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>'
      + `<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:instrText xml:space="preserve"> PAGEREF ${ancla} \\h </w:instrText></w:r>`
      + '<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r>'
      + `<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:t>${pagina}</w:t></w:r><w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink></w:p>`;
    if (anclas.length < 2) throw new PlantillaSoporteError('índice sin entradas de identificación');
    const toc = entrada('TDC1', anclas[0], 'Identificación del Proyecto', true) + entrada('TDC1', anclas[1], 'Identificación de las Pruebas')
      + entrada('TDC1', marcadores.seccion, plan.metadata.seccion) + entrada('TDC2', marcadores.caso, plan.titulo)
      + entrada('TDC3', marcadores.numero, `Número del caso: ${plan.numeroCaso}`);
    cambios.push({ inicio: originales[0].inicio, fin: originales[originales.length - 1].fin, por: toc });
  }
  doc = reemplazarRangos(doc, cambios);

  // ---- Encabezado ----
  {
    const ps = elementosXml(header, 'w:p');
    const logo = ps.find(p => textoParrafoDocx(header, p).trim() === '[Logo Cliente]');
    const nombre = ps.find(p => textoParrafoDocx(header, p).trim().startsWith('[NOMBRE DEL'));
    if (!logo || !nombre) throw new PlantillaSoporteError('encabezado sin [Logo Cliente] o [NOMBRE DEL ...]');
    const { ancho, alto } = dimensionesPng(recursos.logoCliente);
    // Tamaño del soporte histórico; solo se reduce si la geometría de la celda demuestra desbordamiento.
    const celda = geometriaCeldaLogo(header, logo, anchoTextoTwips);
    const medidaLogo = disponerEvidencias([{ ancho, alto }], { anchoUtil: Math.min(ANCHO_LOGO_EMU, celda.anchoInterior), altoUtil: celda.altoMinimo / 0.6 }, 0).medidas[0];
    const rid = nuevoRel();
    const destino = nuevaMedia('afi-logo-cliente', recursos.logoCliente);
    headerRels = headerRels.replace('</Relationships>', `<Relationship Id="${rid}" Type="${REL_IMAGEN}" Target="${destino}"/></Relationships>`);
    header = reemplazarRangos(header, [
      { inicio: logo.inicio, fin: logo.fin, por: parrafo(dibujo(rid, docPr++, 'Logo cliente', medidaLogo.cx, medidaLogo.cy, 'Logo del cliente'), pPrDe(header, logo)) },
      { inicio: nombre.inicio, fin: nombre.fin, por: parrafo(runs(plan.metadata.encabezado), pPrDe(header, nombre)) },
    ]);
    if (!/xmlns:wp="/.test(header.slice(0, 4000))) throw new PlantillaSoporteError('header1.xml sin namespace wp');
  }

  // ---- Configuración y propiedades ----
  let settings = parte('word/settings.xml');
  if (!settings.includes('<w:updateFields')) {
    const antes = ['<w:hdrShapeDefaults', '<w:footnotePr', '<w:endnotePr', '<w:compat', '<w:docVars', '<w:rsids', '<m:mathPr', '<w:themeFontLang', '<w:clrSchemeMapping', '</w:settings>']
      .map(t => settings.indexOf(t)).filter(i => i >= 0);
    const i = Math.min(...antes);
    settings = settings.slice(0, i) + '<w:updateFields w:val="true"/>' + settings.slice(i);
  }
  if (!settings.includes('<w:removePersonalInformation')) {
    const zoom = settings.match(/<w:zoom\b[^>]*\/>/);
    const i = zoom ? settings.indexOf(zoom[0]) + zoom[0].length : settings.indexOf('>', settings.indexOf('<w:settings')) + 1;
    settings = settings.slice(0, i) + '<w:removePersonalInformation/>' + settings.slice(i);
  }
  let core = parte('docProps/core.xml');
  core = core.replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator></dc:creator>')
    .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy></cp:lastModifiedBy>')
    .replace(/<dc:title>[^<]*<\/dc:title>|<dc:title\/>/, `<dc:title>${escaparXml(`Soportes Certificación Cliente - ${plan.caso}`)}</dc:title>`)
    .replace(/<cp:revision>[^<]*<\/cp:revision>/, '<cp:revision>1</cp:revision>');
  let tipos = parte('[Content_Types].xml');
  if (!/Extension="png"/i.test(tipos)) tipos = tipos.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default ');

  const nuevas = new Map<string, string>([
    ['word/document.xml', doc], ['word/_rels/document.xml.rels', rels], ['word/header1.xml', header],
    ['word/_rels/header1.xml.rels', headerRels], ['word/settings.xml', settings], ['docProps/core.xml', core], ['[Content_Types].xml', tipos],
  ]);
  const salida: EntradaZip[] = entradas.map(e => ({ nombre: e.nombre, datos: nuevas.has(e.nombre) ? Buffer.from(nuevas.get(e.nombre)!, 'utf8') : e.datos }));
  if (!partes.has('word/_rels/header1.xml.rels')) salida.push({ nombre: 'word/_rels/header1.xml.rels', datos: Buffer.from(headerRels, 'utf8') });
  return escribirZip([...salida, ...nuevasMedias]);
}
