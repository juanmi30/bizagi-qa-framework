import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { escribirZip, leerZip, type EntradaZip } from '../../../shared/utils/zip';
import { atributoXml, elementosXml, escaparXml, hijosXml, primerElementoXml, textoParrafoDocx, textoXml, type ElementoXml } from '../../../shared/utils/xml';
import { dimensionesPng, disponerEvidencias, geometriaCeldaLogo, type GeometriaPagina } from '../../colsubsidio/data/afi/soporte/docx';

/**
 * Soporte de certificación cliente: UN documento Word por HISTORIA DE USUARIO con todos sus CP (formato de la plantilla
 * corporativa usada en Afiliaciones de Colsubsidio: «Repita esta sección para cada caso de prueba probado»).
 * Dos capacidades separadas: la ejecución (Playwright) produce reportes y capturas; esto SOLO lee lo ya guardado
 * (no abre Bizagi) y es reproducible aunque los casos hayan vencido. Reutiliza la plantilla y las utilidades del
 * generador AFI (estrategia: copia de la plantilla y reemplazo solo del contenido variable).
 */

export interface PasoTranscrito { estado: string; resultado: string }
export interface CasoConfig {
  cp: string; numeroCaso: string; configuracion: string; fuentes: string[];
  transcritos?: { fuente: string; pasos: Record<string, PasoTranscrito> };
  observaciones?: string[];
  validacionPosterior?: { pasos: number[]; texto: string };
}
export interface ConfigSoporteHu {
  hu: string; salida: string; template: string; logoCliente: string | null; cliente: string; proyecto: string; nombrePruebas: string;
  iteracion: string; fechaInicio: string; fechaFinalizacion: string; seccion: string; encabezado: string; casos: CasoConfig[];
}
export interface PasoSoporte {
  n: number; accion: string; esperado: string; estado: string; obtenido: string; fuente: string; capturas: string[]; validacionPosterior?: string;
}
export interface CasoSoporte { cp: string; titulo: string; numeroCaso: string; configuracion: string; pasos: PasoSoporte[]; observaciones: string[]; resumen: Record<string, number> }

interface ReporteJson { unico?: string; numero_caso?: string; pasos: { indice: number; estado: string; detalle: string; evidencia?: string }[]; matriz: { n: number; estado: string; cubierto_por?: number[] }[] }

/** Texto observado legible: sin marcas internas ni nombres de variables (los valores de QA no van al documento). */
const DESCRIPCION_DATO: Record<string, string> = {
  BIZAGI_BASE_URL: 'URL del ambiente QA', SDE_PROCESO_RADICACION: 'proceso de radicación de QA', SDE_PROCESO_CATEGORIA: 'categoría del proceso',
  SDE_SUCURSAL: 'Sucursal de QA', SDE_GEN_RAMO: 'Ramo de Generales de QA', SDE_RUTA_RAMO: 'Ramo de QA', SDE_AUTOS_RAMO: 'Ramo de QA',
  'INI-INDIVIDUAL-RUTA.criterio_valor': 'número de póliza de QA',
};
export function textoObservado(detalle: string): string {
  return detalle.replace(/«(?:env|dato|config):([^»]*)»/g, (_m, k: string) => `[${DESCRIPCION_DATO[k] ?? 'dato de QA'}]`)
    .replace(/\s*\|\s*/g, ' · ').replace(/\s+/g, ' ').trim();
}

/**
 * Resultado por paso de la matriz. Fuentes en orden: la PRIMERA es la corrida del CP; las siguientes (continuaciones)
 * reemplazan solo los pasos que realmente ejecutaron (cubierto_por no vacío); los «transcritos» reemplazan al final y
 * declaran su origen. Nunca se inventa un estado: si ninguna fuente cubre el paso, queda como lo dejó la primera.
 */
export function consolidarCaso(raiz: string, dirProyecto: string, c: CasoConfig, matriz: { titulo: string; pasos: { n: number; accion: string; esperado: string }[] }): CasoSoporte {
  const porPaso = new Map<number, { estado: string; obtenido: string; fuente: string; capturas: string[] }>();
  c.fuentes.forEach((f, k) => {
    const ruta = resolve(dirProyecto, f);
    if (!existsSync(ruta)) throw new Error(`No existe la fuente ${f} de ${c.cp}.`);
    const r = JSON.parse(readFileSync(ruta, 'utf8')) as ReporteJson;
    const pasos = new Map(r.pasos.map((p) => [p.indice, p]));
    for (const m of r.matriz) {
      const cubre = m.cubierto_por ?? [];
      if (k > 0 && !cubre.length) continue; // una continuación solo aporta lo que ejecutó
      const detalles = cubre.map((i) => pasos.get(i)).filter((p): p is NonNullable<typeof p> => !!p && p.estado !== 'NOT_RUN');
      const obtenido = detalles.map((p) => textoObservado(p.detalle)).filter(Boolean).join(' · ') || (cubre.length ? 'No ejecutado en esta corrida.' : 'Paso agregado del CP (objetivo): su estado resulta de los demás pasos.');
      const capturas = detalles.map((p) => p.evidencia && r.unico ? resolve(raiz, ...RUTA_CAPTURAS, `${f.includes('CONTINUACION_') ? 'CONTINUACION_' : ''}${c.cp}_${r.unico}`, `${p.evidencia}.png`) : '').filter((x) => x && existsSync(x));
      porPaso.set(m.n, { estado: m.estado, obtenido, fuente: f.replace(/^docs\/evidencia\//, ''), capturas });
    }
  });
  for (const [n, t] of Object.entries(c.transcritos?.pasos ?? {})) {
    porPaso.set(Number(n), { estado: t.estado, obtenido: t.resultado, fuente: `transcripción de consola: ${c.transcritos!.fuente.replace(/^docs\/evidencia\//, '')}`, capturas: [] });
  }
  const pasos = matriz.pasos.map((p) => {
    const r = porPaso.get(p.n) ?? { estado: 'NOT_RUN', obtenido: 'Sin resultado en las fuentes declaradas.', fuente: '—', capturas: [] };
    const v = c.validacionPosterior?.pasos.includes(p.n) ? c.validacionPosterior.texto : undefined;
    return { n: p.n, accion: p.accion, esperado: p.esperado, ...r, ...(v ? { validacionPosterior: v } : {}) };
  });
  const resumen: Record<string, number> = {};
  for (const p of pasos) resumen[p.estado] = (resumen[p.estado] ?? 0) + 1;
  return { cp: c.cp, titulo: matriz.titulo, numeroCaso: c.numeroCaso, configuracion: c.configuracion, pasos, observaciones: c.observaciones ?? [], resumen };
}

const ESTADOS: Record<string, string> = {
  PASS: 'PASS — resultado observado igual al esperado',
  FAIL: 'FAIL — resultado observado distinto del esperado (por confirmar con QA)',
  BLOCKED: 'BLOCKED — no ejecutado por un bloqueo',
  NOT_AUTOMATED: 'NOT_AUTOMATED — pendiente de definición o revisión manual',
  NOT_RUN: 'NO EJECUTADO',
  UI_PASS: 'PASS (verificado en la interfaz)',
};

// ---------- WordprocessingML ----------
const EMU_POR_TWIP = 635;
const REL_IMAGEN = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const runs = (texto: string, negrita = false, extra = '') => texto.split(/\r?\n/).map((l, i) =>
  `<w:r>${negrita || extra ? `<w:rPr>${negrita ? '<w:b/><w:bCs/>' : ''}${extra}</w:rPr>` : ''}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${escaparXml(l)}</w:t></w:r>`).join('');
const parrafo = (contenido = '', pPr = '') => `<w:p>${pPr}${contenido}</w:p>`;
const juntos = '<w:pPr><w:keepNext/><w:keepLines/></w:pPr>';
const etiquetaValor = (etiqueta: string, valor: string, pPr = '') => parrafo(runs(`${etiqueta}: `, true) + runs(valor), pPr);
const pPrDe = (xml: string, p: ElementoXml) => { const e = hijosXml(xml, p.inicioContenido, p.finContenido).find((h) => h.nombre === 'w:pPr'); return e ? textoXml(xml, e) : ''; };
const textoDe = (xml: string, e: ElementoXml) => elementosXml(xml, 'w:p', e.inicio, e.fin).map((p) => textoParrafoDocx(xml, p)).join('\n');
function reemplazarRangos(xml: string, cambios: { inicio: number; fin: number; por: string }[]): string {
  let r = xml;
  for (const c of [...cambios].sort((a, b) => b.inicio - a.inicio)) r = r.slice(0, c.inicio) + c.por + r.slice(c.fin);
  return r;
}
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

/** Renderiza el soporte de la HU con todos sus CP, sobre una COPIA de la plantilla (estructura, estilos, pie y portada intactos). */
export function renderizarSoporteHu(cfg: ConfigSoporteHu, casos: CasoSoporte[], recursos: { template: Buffer; logoCliente?: Buffer }): Buffer {
  const entradas = leerZip(recursos.template);
  const partes = new Map(entradas.map((e) => [e.nombre, e.datos]));
  const parte = (n: string) => { const d = partes.get(n); if (!d) throw new Error(`Plantilla sin ${n}`); return d.toString('utf8'); };
  let doc = parte('word/document.xml');
  let rels = parte('word/_rels/document.xml.rels');
  let header = parte('word/header1.xml');
  let headerRels = partes.has('word/_rels/header1.xml.rels') ? parte('word/_rels/header1.xml.rels')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const idsRel = new Set([...rels.matchAll(/Id="([^"]+)"/g), ...headerRels.matchAll(/Id="([^"]+)"/g)].map((m) => m[1]));
  let nRel = 0;
  const nuevoRel = () => { let id: string; do id = `rIdSde${++nRel}`; while (idsRel.has(id)); idsRel.add(id); return id; };
  let docPr = Math.max(0, ...[...doc.matchAll(/<wp:docPr id="(\d+)"/g), ...header.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => Number(m[1]))) + 1000;
  let bookmark = Math.max(0, ...[...doc.matchAll(/<w:bookmarkStart w:id="(\d+)"/g)].map((m) => Number(m[1]))) + 1;
  const medias: EntradaZip[] = [];
  const nuevaMedia = (base: string, datos: Buffer) => { const nombre = `word/media/${base}.png`; medias.push({ nombre, datos }); return nombre.slice('word/'.length); };

  const sect = primerElementoXml(doc, 'w:sectPr');
  const pgSz = sect && elementosXml(doc, 'w:pgSz', sect.inicio, sect.fin)[0];
  const pgMar = sect && elementosXml(doc, 'w:pgMar', sect.inicio, sect.fin)[0];
  if (!pgSz || !pgMar) throw new Error('Plantilla sin tamaño de página/márgenes');
  const num = (e: ElementoXml, a: string) => Number(atributoXml(doc, e, a));
  const anchoTextoTwips = num(pgSz, 'w:w') - num(pgMar, 'w:left') - num(pgMar, 'w:right');
  const geometria: GeometriaPagina = { anchoUtil: anchoTextoTwips * EMU_POR_TWIP, altoUtil: (num(pgSz, 'w:h') - num(pgMar, 'w:top') - num(pgMar, 'w:bottom')) * EMU_POR_TWIP };

  const body = primerElementoXml(doc, 'w:body');
  if (!body) throw new Error('Plantilla sin w:body');
  const hijos = hijosXml(doc, body.inicioContenido, body.finContenido);
  const idx = (pred: (e: ElementoXml, i: number) => boolean, que: string) => { const i = hijos.findIndex(pred); if (i < 0) throw new Error(`Plantilla: no se encontró ${que}`); return i; };
  const xmlDe = (e: ElementoXml) => textoXml(doc, e);
  const iToc = idx((e) => e.nombre === 'w:p' && /<w:instrText[^>]*>\s*TOC\s/.test(xmlDe(e)), 'el índice');
  const iTocFin = idx((e, i) => i > iToc && e.nombre === 'w:p' && xmlDe(e).includes('w:fldCharType="end"') && !xmlDe(e).includes('PAGEREF'), 'el fin del índice');
  const iProyecto = idx((e) => e.nombre === 'w:tbl' && textoDe(doc, e).includes('Nombre del Cliente'), 'Identificación del Proyecto');
  const iPruebas = idx((e) => e.nombre === 'w:tbl' && textoDe(doc, e).includes('Iteración o Etapa'), 'Identificación de las Pruebas');
  const iSeccion = idx((e) => e.nombre === 'w:p' && xmlDe(e).includes('w:val="Ttulo1"') && textoParrafoDocx(doc, e).startsWith('[Nombre'), 'la sección de casos');
  const iSect = idx((e) => e.nombre === 'w:sectPr', 'sectPr');
  const cambios: { inicio: number; fin: number; por: string }[] = [];

  { // Identificación del Proyecto: cliente | proyecto
    const t = hijos[iProyecto];
    const ps = elementosXml(doc, 'w:p', ...(() => { const f = elementosXml(doc, 'w:tr', t.inicio, t.fin)[1]; return [f.inicio, f.fin] as const; })());
    [cfg.cliente, cfg.proyecto].forEach((v, i) => cambios.push({ inicio: ps[i].inicio, fin: ps[i].fin, por: parrafo(runs(v), pPrDe(doc, ps[i])) }));
  }
  { // Identificación de las Pruebas
    const valores: Record<string, string> = { Nombre: cfg.nombrePruebas, 'Iteración o Etapa': cfg.iteracion, 'Fecha Inicio': cfg.fechaInicio, 'Fecha Finalización': cfg.fechaFinalizacion };
    const t = hijos[iPruebas];
    for (const fila of elementosXml(doc, 'w:tr', t.inicio, t.fin)) {
      const celdas = elementosXml(doc, 'w:tc', fila.inicio, fila.fin);
      const etiqueta = celdas[0] && textoDe(doc, celdas[0]).trim();
      if (celdas.length !== 2 || !(etiqueta in valores)) continue;
      const p = elementosXml(doc, 'w:p', celdas[1].inicio, celdas[1].fin)[0];
      cambios.push({ inicio: p.inicio, fin: p.fin, por: parrafo(runs(valores[etiqueta]), pPrDe(doc, p).replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '')) });
    }
  }

  // Sección de casos: Título 1 (sección) y, por CP, Título 2 (caso) y Título 3 (número del caso), como en el soporte de Afiliaciones.
  const indice: { estilo: string; ancla: string; texto: string }[] = [];
  const titulo = (estilo: string, texto: string, saltoAntes = false) => {
    const id = bookmark++, ancla = `_TocSde${id}`;
    indice.push({ estilo: estilo.replace('Ttulo', 'TDC'), ancla, texto });
    return `<w:p><w:pPr><w:pStyle w:val="${estilo}"/>${saltoAntes ? '<w:pageBreakBefore/>' : ''}</w:pPr><w:bookmarkStart w:id="${id}" w:name="${ancla}"/>${runs(texto)}<w:bookmarkEnd w:id="${id}"/></w:p>`;
  };
  let nImg = 0;
  let cuerpo = titulo('Ttulo1', cfg.seccion);
  casos.forEach((c, k) => {
    const pass = c.resumen.PASS ?? 0;
    const resumen = Object.entries(c.resumen).map(([e, n]) => `${e} ${n}`).join(' · ');
    cuerpo += titulo('Ttulo2', `${c.cp.replace(/^HU\d+-/, '')} - ${c.titulo}`, k > 0)
      + titulo('Ttulo3', `Número del caso: ${c.numeroCaso}`)
      + etiquetaValor('Configuración utilizada', c.configuracion)
      + etiquetaValor('Resultado de la ejecución automatizada', `${pass} PASS de ${c.pasos.length} pasos de la matriz (${resumen}). No constituye aprobación funcional: la aprobación corresponde a QA.`)
      + parrafo();
    for (const p of c.pasos) {
      cuerpo += parrafo(`<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Paso ${p.n}</w:t></w:r>${runs(`. ${p.accion}`)}`, juntos)
        + parrafo(runs('Resultado del paso', true), juntos)
        + etiquetaValor('Resultado esperado', p.esperado, juntos)
        + etiquetaValor('Resultado obtenido', p.obtenido, juntos)
        + etiquetaValor('Estado', ESTADOS[p.estado] ?? p.estado, juntos)
        + (p.validacionPosterior ? etiquetaValor('Validación posterior', p.validacionPosterior, juntos) : '');
      const captura = p.capturas.at(-1);
      if (captura) {
        const datos = readFileSync(captura);
        const { ancho, alto } = dimensionesPng(datos);
        const { cx, cy } = disponerEvidencias([{ ancho, alto }], geometria, 0).medidas[0];
        const rid = nuevoRel();
        const destino = nuevaMedia(`sde-evidencia-${String(++nImg).padStart(3, '0')}`, datos);
        rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="${REL_IMAGEN}" Target="${destino}"/></Relationships>`);
        cuerpo += etiquetaValor('Evidencia', `captura de la ejecución (${p.fuente})`, juntos) + parrafo(dibujo(rid, docPr++, `Evidencia ${nImg}`, cx, cy, `${c.cp} paso ${p.n}`), '<w:pPr><w:jc w:val="center"/></w:pPr>');
      } else {
        cuerpo += etiquetaValor('Evidencia', `${p.fuente}. Captura: PENDIENTE (no se conserva la captura de esta ejecución; el analista puede complementarla).`);
      }
      cuerpo += parrafo();
    }
    cuerpo += parrafo(runs('Observaciones del analista', true))
      + c.observaciones.map((o) => parrafo(runs(`• ${o}`))).join('')
      + parrafo(runs('[Espacio para observaciones del analista QA]', false, '<w:color w:val="808080"/>'))
      + parrafo(runs('Aprobación funcional QA: ', true) + runs('pendiente (no se registra aprobación ni firma en este soporte generado).'));
  });
  cambios.push({ inicio: hijos[iSeccion].inicio, fin: hijos[iSect].inicio, por: cuerpo });

  { // Índice: mismas entradas iniciales de la plantilla + títulos reales; se marca para actualizarse al abrir en Word.
    const originales = hijos.slice(iToc, iTocFin);
    const xp = xmlDe(originales[0]);
    const hasta = xp.indexOf('w:fldCharType="separate"');
    const finPPr = xp.indexOf('</w:pPr>');
    const inicioCab = xp.slice(Math.max(finPPr, 0)).search(/<w:r[\s>]/) + Math.max(finPPr, 0);
    const cabecera = xp.slice(inicioCab, xp.indexOf('</w:r>', hasta) + '</w:r>'.length).replace('w:fldCharType="begin"/>', 'w:fldCharType="begin" w:dirty="true"/>');
    const pPrNivel = (estilo: string) => { const e = originales.find((o) => xmlDe(o).includes(`w:val="${estilo}"`)); if (!e) throw new Error(`Índice sin nivel ${estilo}`); return pPrDe(doc, e); };
    const anclas = [...xp.matchAll(/w:anchor="([^"]+)"/g), ...originales.slice(1).flatMap((o) => [...xmlDe(o).matchAll(/w:anchor="([^"]+)"/g)])].map((m) => m[1]);
    const entrada = (estilo: string, ancla: string, texto: string, conCabecera = false) => `<w:p>${pPrNivel(estilo)}${conCabecera ? cabecera : ''}`
      + `<w:hyperlink w:anchor="${ancla}" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hipervnculo"/><w:noProof/></w:rPr><w:t xml:space="preserve">${escaparXml(texto)}</w:t></w:r>`
      + '<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:tab/></w:r><w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>'
      + `<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:instrText xml:space="preserve"> PAGEREF ${ancla} \\h </w:instrText></w:r>`
      + '<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r>'
      + '<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:t>4</w:t></w:r><w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink></w:p>';
    const toc = entrada('TDC1', anclas[0], 'Identificación del Proyecto', true) + entrada('TDC1', anclas[1], 'Identificación de las Pruebas')
      + indice.map((i) => entrada(i.estilo, i.ancla, i.texto)).join('');
    cambios.push({ inicio: originales[0].inicio, fin: originales[originales.length - 1].fin, por: toc });
  }
  doc = reemplazarRangos(doc, cambios);

  { // Encabezado: nombre del área/proyecto; el logo del cliente solo si se declara (si no, el marcador queda visible: pendiente).
    const ps = elementosXml(header, 'w:p');
    const logo = ps.find((p) => textoParrafoDocx(header, p).trim() === '[Logo Cliente]');
    const nombre = ps.find((p) => textoParrafoDocx(header, p).trim().startsWith('[NOMBRE DEL'));
    if (!logo || !nombre) throw new Error('Encabezado sin [Logo Cliente] o [NOMBRE DEL ...]');
    const repl = [{ inicio: nombre.inicio, fin: nombre.fin, por: parrafo(runs(cfg.encabezado), pPrDe(header, nombre)) }];
    if (recursos.logoCliente) {
      const { ancho, alto } = dimensionesPng(recursos.logoCliente);
      const celda = geometriaCeldaLogo(header, logo, anchoTextoTwips);
      const m = disponerEvidencias([{ ancho, alto }], { anchoUtil: Math.min(1_054_273, celda.anchoInterior), altoUtil: celda.altoMinimo / 0.6 }, 0).medidas[0];
      const rid = nuevoRel();
      headerRels = headerRels.replace('</Relationships>', `<Relationship Id="${rid}" Type="${REL_IMAGEN}" Target="${nuevaMedia('sde-logo-cliente', recursos.logoCliente)}"/></Relationships>`);
      repl.push({ inicio: logo.inicio, fin: logo.fin, por: parrafo(dibujo(rid, docPr++, 'Logo cliente', m.cx, m.cy, 'Logo del cliente'), pPrDe(header, logo)) });
    }
    header = reemplazarRangos(header, repl);
  }

  let settings = parte('word/settings.xml');
  if (!settings.includes('<w:updateFields')) {
    const i = Math.min(...['<w:hdrShapeDefaults', '<w:footnotePr', '<w:endnotePr', '<w:compat', '<w:docVars', '<w:rsids', '<m:mathPr', '<w:themeFontLang', '<w:clrSchemeMapping', '</w:settings>'].map((t) => settings.indexOf(t)).filter((x) => x >= 0));
    settings = settings.slice(0, i) + '<w:updateFields w:val="true"/>' + settings.slice(i);
  }
  const core = parte('docProps/core.xml').replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator></dc:creator>')
    .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy></cp:lastModifiedBy>')
    .replace(/<dc:title>[^<]*<\/dc:title>|<dc:title\/>/, `<dc:title>${escaparXml(`Soportes Certificación Cliente - ${cfg.hu}`)}</dc:title>`);
  let tipos = parte('[Content_Types].xml');
  if (!/Extension="png"/i.test(tipos)) tipos = tipos.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default ');
  const nuevas = new Map<string, string>([['word/document.xml', doc], ['word/_rels/document.xml.rels', rels], ['word/header1.xml', header],
    ['word/_rels/header1.xml.rels', headerRels], ['word/settings.xml', settings], ['docProps/core.xml', core], ['[Content_Types].xml', tipos]]);
  const salida: EntradaZip[] = entradas.map((e) => ({ nombre: e.nombre, datos: nuevas.has(e.nombre) ? Buffer.from(nuevas.get(e.nombre)!, 'utf8') : e.datos }));
  if (!partes.has('word/_rels/header1.xml.rels')) salida.push({ nombre: 'word/_rels/header1.xml.rels', datos: Buffer.from(headerRels, 'utf8') });
  return escribirZip([...salida, ...medias]);
}

/**
 * Ubicaciones PERSISTENTES (relativas a la raíz del repo). Playwright solo vacía su outputDir
 * (test-results/<p>/artifacts) y el reporte HTML (test-results/<p>/html-report): estas carpetas quedan fuera.
 */
export const RUTA_SOPORTES = ['test-results', 'seguros-del-estado', 'soportes'] as const;
export const RUTA_CAPTURAS = ['test-results', 'seguros-del-estado', 'sde', 'capturas'] as const;
export const RUTAS_LIMPIADAS_POR_PLAYWRIGHT = [['test-results', 'seguros-del-estado', 'artifacts'], ['test-results', 'seguros-del-estado', 'html-report']] as const;

/**
 * Genera el soporte de una HU desde resultados guardados. Solo LEE las fuentes (reportes, capturas, plantilla) y escribe en
 * una carpeta NUEVA <soportes>/<HU>/<fecha-hora>/ (un DOCX + el plan JSON); nunca sobrescribe ni borra nada.
 */
export function generarSoporteHu(o: { raiz: string; dirProyecto: string; hu: string; ahora?: Date }): { docx: string; plan: string; casos: CasoSoporte[] } {
    if (!/^HU\d+$/.test(o.hu)) throw new Error(`HU inválida: ${o.hu}`);
  const cfg = JSON.parse(readFileSync(resolve(o.dirProyecto, 'certificacion', `${o.hu}.json`), 'utf8')) as ConfigSoporteHu;
  const matriz = JSON.parse(readFileSync(resolve(o.dirProyecto, 'fuentes', 'matriz.json'), 'utf8')) as { casos: { id: string; titulo: string; pasos: { n: number; accion: string; esperado: string }[] }[] };
  const casos = cfg.casos.map((c) => {
    const m = matriz.casos.find((x) => x.id === c.cp);
    if (!m) throw new Error(`${c.cp} no está en la matriz.`);
    return consolidarCaso(o.raiz, o.dirProyecto, c, m);
  });
  const template = readFileSync(resolve(o.raiz, cfg.template));
  const logoCliente = cfg.logoCliente ? readFileSync(resolve(o.dirProyecto, 'certificacion', cfg.logoCliente)) : undefined;
  const base = resolve(o.raiz, ...RUTA_SOPORTES, cfg.hu);
  let salida = resolve(base, (o.ahora ?? new Date()).toISOString().replace(/[:.]/g, '-'));
  for (let k = 2; existsSync(salida); k++) salida = resolve(base, `${(o.ahora ?? new Date()).toISOString().replace(/[:.]/g, '-')}-${k}`);
  mkdirSync(salida, { recursive: true });
  const docx = resolve(salida, cfg.salida);
  writeFileSync(docx, renderizarSoporteHu(cfg, casos, { template, ...(logoCliente ? { logoCliente } : {}) }));
  const plan = resolve(salida, `${cfg.hu}-soporte-plan.json`);
  writeFileSync(plan, JSON.stringify(casos, null, 2) + '\n', 'utf8');
  return { docx, plan, casos };
}
