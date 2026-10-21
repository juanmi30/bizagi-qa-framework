import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { escribirZip, leerZip, type EntradaZip } from '../../../shared/utils/zip';
import { atributoXml, elementosXml, escaparXml, hijosXml, primerElementoXml, textoParrafoDocx, textoXml, type ElementoXml } from '../../../shared/utils/xml';
import { dimensionesPng, disponerEvidencias, geometriaCeldaLogo, type GeometriaPagina } from '../../colsubsidio/data/afi/soporte/docx';
import { seleccionarUltimas } from './ejecuciones';
import { peorEstado, type EstadoPaso } from './modelo';

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
  /**
   * Notas del analista para una ejecución archivada concreta, por NÚMERO DE CASO: solo se aplican si el soporte usa ese caso.
   * Explican el resultado (p. ej. un error de dato de la automatización); nunca cambian los estados registrados.
   */
  porCaso?: Record<string, { configuracion?: string; observaciones?: string[] }>;
}
export interface ConfigSoporteHu {
  hu: string; salida: string; template: string; logoCliente: string | null; cliente: string; proyecto: string; nombrePruebas: string;
  iteracion: string; fechaInicio: string; fechaFinalizacion: string; seccion: string; encabezado: string; casos: CasoConfig[];
}
export interface PasoSoporte {
  n: number; accion: string; esperado: string; estado: string; obtenido: string; fuente: string; capturas: string[]; validacionPosterior?: string;
  /** Causas registradas por la ejecución para el estado del paso (PRODUCTO_POR_CONFIRMAR, AUTOMATIZACION, DATO, ...). */
  causas?: string[];
  /** Incidentes registrados aparte del resultado del paso (p. ej. P-21a): no cambian su estado. */
  incidentes?: string[];
  /** Acciones del escenario que sustentan el paso (p. ej. verificar_recorrido_grafico). */
  acciones?: string[];
}
/** De dónde salió el resultado del CP (trazabilidad en el Word y en el plan). */
export interface OrigenCaso {
  tipo: 'archivada' | 'declarada' | 'sin-ejecucion'; numeroCaso: string | null; fecha: string | null; corrida: string | null; unico: string | null; fuentes: string[];
}
export interface CasoSoporte {
  /** `observaciones`: notas registradas (configuración del soporte) que corresponden a ESTE caso; nunca de otro caso. */
  cp: string; titulo: string; numeroCaso: string; configuracion: string; pasos: PasoSoporte[]; observaciones: string[]; resumen: Record<string, number>;
  origen?: OrigenCaso; advertencias?: string[];
  /** Hallazgos derivados automáticamente de los pasos de ESTE caso (separados de las notas registradas). */
  observacionesAutomaticas?: string[];
  /** Referencia a notas de otros casos del mismo CP, que no se copian. */
  antecedentes?: string[];
}

interface ReporteJson {
  unico?: string; numero_caso?: string; estado?: string; motivo?: string;
  pasos: { indice: number; hacer?: string; estado: string; detalle: string; evidencia?: string; causa?: string; incidente?: { causa: string; detalle: string } }[];
  matriz: { n: number; estado: string; cubierto_por?: number[] }[];
}
/** Pasos con los que una continuación accede al caso (tests/continuacion.real.spec.ts): no son pasos de la matriz. */
const ACCESO_CONTINUACION = new Set(['iniciar_sesion', 'abrir_caso']);

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
  const porPaso = new Map<number, { estado: string; obtenido: string; fuente: string; capturas: string[]; causas?: string[]; incidentes?: string[]; acciones?: string[] }>();
  c.fuentes.forEach((f, k) => {
    const ruta = resolve(dirProyecto, f);
    if (!existsSync(ruta)) throw new Error(`No existe la fuente ${f} de ${c.cp}.`);
    const r = JSON.parse(readFileSync(ruta, 'utf8')) as ReporteJson;
    const pasos = new Map(r.pasos.map((p) => [p.indice, p]));
    for (const m of r.matriz) {
      let cubre = m.cubierto_por ?? [];
      let estado = m.estado;
      if (k > 0) {
        // Una continuación solo aporta los pasos de la matriz que EJECUTÓ: sin contar su acceso (iniciar sesión y abrir el caso,
        // que se anotan en el primer paso del tramo) ni lo que quedó NOT_RUN. Si no ejecutó nada del paso, se conserva lo anterior.
        cubre = cubre.filter((i) => { const p = pasos.get(i); return !!p && !ACCESO_CONTINUACION.has(p.hacer ?? '') && p.estado !== 'NOT_RUN'; });
        if (!cubre.length) continue;
        estado = peorEstado(cubre.map((i) => pasos.get(i)!.estado as EstadoPaso));
      }
      const detalles = cubre.map((i) => pasos.get(i)).filter((p): p is NonNullable<typeof p> => !!p && p.estado !== 'NOT_RUN');
      const obtenido = detalles.map((p) => textoObservado(p.detalle)).filter(Boolean).join(' · ') || (cubre.length ? 'No ejecutado en esta corrida.' : 'Paso agregado del CP (objetivo): su estado resulta de los demás pasos.');
      const capturas = detalles.map((p) => p.evidencia && r.unico ? resolve(raiz, ...RUTA_CAPTURAS, `${f.includes('CONTINUACION_') ? 'CONTINUACION_' : ''}${c.cp}_${r.unico}`, `${p.evidencia}.png`) : '').filter((x) => x && existsSync(x));
      const etiqueta = isAbsolute(f) ? relative(raiz, f).split(sep).join('/') : f.replace(/^docs\/evidencia\//, '');
      const causas = [...new Set(detalles.filter((p) => p.estado === estado && p.causa).map((p) => p.causa!))];
      const incidentes = detalles.filter((p) => p.incidente).map((p) => `${p.incidente!.causa}: ${textoObservado(p.incidente!.detalle)}`);
      const acciones = [...new Set(detalles.map((p) => p.hacer ?? '').filter(Boolean))];
      porPaso.set(m.n, { estado, obtenido, fuente: etiqueta, capturas, ...(causas.length ? { causas } : {}), ...(incidentes.length ? { incidentes } : {}), ...(acciones.length ? { acciones } : {}) });
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

const fechaLegible = (iso: string | null) => (iso ? `${iso.replace('T', ' ').slice(0, 16)} UTC` : 'sin fecha');
export function textoOrigen(o: OrigenCaso): string {
  if (o.tipo === 'sin-ejecucion') return 'Sin ejecución seleccionable para este CP: sus pasos quedan como NO EJECUTADO (no se inventan resultados).';
  if (o.tipo === 'archivada') {
    const [base, ...cont] = o.fuentes;
    return `Caso Bizagi ${o.numeroCaso} · inicio ${fechaLegible(o.fecha)} · corrida de suite ${o.corrida ?? 'sin identificador'} · seleccionada automáticamente (última ejecución finalizada del CP) · reporte ${base}`
      + (cont.length ? ` · continuaciones del mismo caso (solo reemplazan los pasos que ejecutaron): ${cont.join(', ')}` : '');
  }
  return `Caso Bizagi ${o.numeroCaso} · última evidencia del ${fechaLegible(o.fecha)} · certificación declarada (reportes sanitizados: ${o.fuentes.join(', ')})`;
}

const ESTADOS: Record<string, string> = {
  PASS: 'PASS — resultado observado igual al esperado',
  FAIL: 'FAIL — el paso no cumplió lo esperado; ver la causa (por confirmar con QA)',
  BLOCKED: 'BLOCKED — no ejecutado por un bloqueo',
  NOT_AUTOMATED: 'NOT_AUTOMATED — pendiente de definición o revisión manual',
  NOT_RUN: 'NO EJECUTADO',
  UI_PASS: 'PASS (verificado en la interfaz)',
};

/** Causa registrada por la ejecución (modelo.ts CausaPaso), en lenguaje del analista. Distingue producto de automatización y datos. */
export const CAUSAS: Record<string, string> = {
  PRODUCTO_POR_CONFIRMAR: 'comportamiento observado distinto del esperado: posible defecto del producto, por confirmar con QA',
  AUTOMATIZACION: 'la automatización no pudo operar o verificar el control (selector, etiqueta o calibración); no es un defecto del producto',
  AMBIENTE: 'problema del ambiente (red, permisos o servicio); no es un defecto del producto',
  CONFIGURACION: 'configuración local incompleta; no es un defecto del producto',
  CONCURRENCIA: 'otra ejecución real estaba en curso; no se ejecutó',
  DATO: 'dato de prueba faltante o incorrecto; no es un defecto del producto',
  INTEGRACION_NO_VERIFICADA: 'integración sin traza accesible: no verificada',
  NO_AUTOMATIZADO: 'sin criterio objetivo automatizable: requiere revisión humana',
  POLITICA_SOLO_LECTURA: 'la política de solo lectura impidió la acción',
  ASIGNACION: 'la actividad no estaba disponible para el analista de pruebas',
  NO_CLASIFICADO: 'excepción sin clasificar: requiere revisión humana; no se atribuye al producto',
};
const textoCausas = (c: string[]) => c.map((x) => CAUSAS[x] ?? x).join('; ');
const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const listaPasos = (ps: PasoSoporte[]) => ps.map((p) => `P${p.n}`).join(', ');

/**
 * Hallazgos derivados automáticamente de los pasos de UN caso (cada línea cita el caso): FAIL con su causa, incidentes
 * separados, BLOCKED, NOT_AUTOMATED (revisión humana), pasos sustentados con la ruta/Consulta Gráfica y pasos sin captura.
 * No interpreta ni confirma defectos: resume lo que la ejecución registró.
 */
export function observacionesAutomaticas(c: CasoSoporte, estadoReportado?: { estado?: string; motivo?: string }): string[] {
  const caso = `caso ${c.numeroCaso}`;
  const o: string[] = [];
  if (estadoReportado?.estado) o.push(`Estado global reportado por la automatización (${caso}): ${estadoReportado.estado}${estadoReportado.motivo ? ` — ${recortar(textoObservado(estadoReportado.motivo), 420).replace(/[.\s]+$/, '')}` : ''}. No constituye aprobación funcional.`);
  for (const p of c.pasos.filter((x) => x.estado === 'FAIL')) {
    o.push(p.causas?.length
      ? `P${p.n} (${caso}): FAIL — ${textoCausas(p.causas)}. Observado: ${recortar(p.obtenido, 260)}`
      : `P${p.n} (${caso}): FAIL — objetivo agregado del CP: refleja el resultado de los demás pasos.`);
  }
  for (const p of c.pasos.filter((x) => x.incidentes?.length)) {
    for (const i of p.incidentes!) o.push(`P${p.n} (${caso}): incidente registrado aparte; el paso conserva su estado ${p.estado}. ${recortar(i, 300)}`);
  }
  const bloqueados = c.pasos.filter((x) => x.estado === 'BLOCKED');
  if (bloqueados.length) o.push(`No ejecutados por bloqueo (${caso}): ${bloqueados.map((p) => `P${p.n}${p.causas?.length ? ` (${p.causas.join(', ')})` : ''}`).join(', ')}.`);
  const manuales = c.pasos.filter((x) => x.estado === 'NOT_AUTOMATED');
  if (manuales.length) o.push(`Requieren revisión humana, NOT_AUTOMATED (${caso}): ${listaPasos(manuales)}.`);
  const grafica = c.pasos.filter((x) => x.estado === 'PASS' && x.acciones?.some((a) => /recorrido_grafico|verificar_ruta/.test(a)));
  if (grafica.length) o.push(`Sustentados con la ruta del caso y la Consulta Gráfica (${caso}): ${listaPasos(grafica)}.`);
  const sinCaptura = c.pasos.filter((x) => !x.capturas.length);
  if (sinCaptura.length) o.push(`Sin captura en este soporte (${caso}): ${listaPasos(sinCaptura)}.`);
  return o;
}

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
      + (c.origen ? etiquetaValor('Ejecución utilizada', textoOrigen(c.origen)) : '')
      + (c.advertencias ?? []).map((a) => etiquetaValor('Advertencia de selección', a)).join('')
      + etiquetaValor('Resultado de la ejecución automatizada', `${pass} PASS de ${c.pasos.length} pasos de la matriz (${resumen}). No constituye aprobación funcional: la aprobación corresponde a QA.`)
      + parrafo();
    for (const p of c.pasos) {
      cuerpo += parrafo(`<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Paso ${p.n}</w:t></w:r>${runs(`. ${p.accion}`)}`, juntos)
        + parrafo(runs('Resultado del paso', true), juntos)
        + etiquetaValor('Resultado esperado', p.esperado, juntos)
        + etiquetaValor('Resultado obtenido', p.obtenido, juntos)
        + etiquetaValor('Estado', ESTADOS[p.estado] ?? p.estado, juntos)
        + (p.estado !== 'PASS' && p.causas?.length ? etiquetaValor('Causa', textoCausas(p.causas), juntos) : '')
        + (p.incidentes ?? []).map((i) => etiquetaValor('Incidente registrado aparte (no cambia el estado del paso)', i, juntos)).join('')
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
    const auto = c.observacionesAutomaticas ?? [];
    cuerpo += parrafo(runs('Observaciones del analista', true))
      + (auto.length ? parrafo(runs(`Hallazgos de la ejecución (generados automáticamente del reporte del caso ${c.numeroCaso}; no son aprobación ni confirmación de defecto):`, false, '<w:i/><w:iCs/>'))
        + auto.map((o) => parrafo(runs(`• ${o}`))).join('') : '')
      + (c.observaciones.length ? parrafo(runs(`Notas registradas para el caso ${c.numeroCaso}:`, false, '<w:i/><w:iCs/>')) : '')
      + c.observaciones.map((o) => parrafo(runs(`• ${o}`))).join('')
      + (c.antecedentes ?? []).map((a) => parrafo(runs(a, false, '<w:color w:val="808080"/>'))).join('')
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

/** Lo elegido para cada CP: para la consola, el plan JSON y la simulación de limpieza (referencias). */
export interface SeleccionSoporte {
  cp: string; origen: OrigenCaso['tipo']; numeroCaso: string | null; unico: string | null; corrida: string | null; fecha: string | null;
  continuaciones: string[]; advertencias: string[];
}

/**
 * Genera el soporte de una HU desde resultados guardados. Solo LEE las fuentes (reportes, capturas, plantilla) y escribe en
 * una carpeta NUEVA <soportes>/<HU>/<fecha-hora>/ (un DOCX + el plan JSON); nunca sobrescribe ni borra nada.
 * Selección por CP: la ejecución ARCHIVADA más reciente y seleccionable (sde/ejecuciones) si es posterior a la certificación
 * declarada en certificacion/<HU>.json; si no, la declarada. Con `corrida`, solo las ejecuciones de esa corrida de suite.
 */
export function generarSoporteHu(o: { raiz: string; dirProyecto: string; hu: string; ahora?: Date; corrida?: string }): { docx: string; plan: string; casos: CasoSoporte[]; seleccion: SeleccionSoporte[] } {
  if (!/^HU\d+$/.test(o.hu)) throw new Error(`HU inválida: ${o.hu}`);
  const cfg = JSON.parse(readFileSync(resolve(o.dirProyecto, 'certificacion', `${o.hu}.json`), 'utf8')) as ConfigSoporteHu;
  const matriz = JSON.parse(readFileSync(resolve(o.dirProyecto, 'fuentes', 'matriz.json'), 'utf8')) as { casos: { id: string; titulo: string; pasos: { n: number; accion: string; esperado: string }[] }[] };
  const leer = (f: string) => {
    const r = resolve(o.dirProyecto, f);
    if (!existsSync(r)) throw new Error(`No existe la fuente ${f}.`);
    return JSON.parse(readFileSync(r, 'utf8')) as ReporteJson & { inicio?: string; fin?: string };
  };
  const declarada = new Map(cfg.casos.map((c) => {
    const fechas = c.fuentes.map((f) => { const r = leer(f); return Date.parse(r.fin || r.inicio || ''); }).filter(Number.isFinite);
    return [c.cp, { fecha: fechas.length ? Math.max(...fechas) : null, unico: c.fuentes.length ? leer(c.fuentes[0]).unico ?? null : null }];
  }));
  const posteriorA = Object.fromEntries([...declarada].filter(([, d]) => d.fecha != null).map(([cp, d]) => [cp, d.fecha!]));
  const elegidas = new Map(seleccionarUltimas({ raiz: o.raiz, cps: cfg.casos.map((c) => c.cp), ...(o.corrida ? { corrida: o.corrida } : { posteriorA }) }).map((s) => [s.cp, s]));
  const seleccion: SeleccionSoporte[] = [];
  const casos = cfg.casos.map((c) => {
    const m = matriz.casos.find((x) => x.id === c.cp);
    if (!m) throw new Error(`${c.cp} no está en la matriz.`);
    const sel = elegidas.get(c.cp)!;
    const e = sel.elegida;
    let caso: CasoSoporte;
    if (e) { // ejecución archivada: sus datos, sin observaciones/transcripciones/validaciones del caso declarado (son de otro caso)
      // + sus continuaciones del mismo caso, en orden: cada una reemplaza solo los pasos que realmente ejecutó.
      const reportes = [e, ...sel.continuaciones].map((x) => x.reporte!);
      const notas = c.porCaso?.[e.numero_caso!];
      caso = consolidarCaso(o.raiz, o.dirProyecto, { cp: c.cp, numeroCaso: e.numero_caso!, configuracion: notas?.configuracion ?? c.configuracion,
        fuentes: reportes.map((r) => resolve(o.raiz, r)), observaciones: notas?.observaciones ?? [] }, m);
      caso.origen = { tipo: 'archivada', numeroCaso: e.numero_caso, fecha: e.inicio, corrida: e.corrida_suite, unico: e.unico, fuentes: reportes };
      const base = JSON.parse(readFileSync(resolve(o.raiz, e.reporte!), 'utf8')) as ReporteJson;
      caso.observacionesAutomaticas = observacionesAutomaticas(caso, { estado: base.estado, motivo: base.motivo });
      const otros = Object.keys(c.porCaso ?? {}).filter((k) => k !== e.numero_caso);
      if (otros.length) caso.antecedentes = [`Hay notas registradas para otros casos de este CP (${otros.join(', ')}); no se aplican al caso ${e.numero_caso}. Están en certificacion/${cfg.hu}.json y en los soportes de esos casos.`];
    } else if (o.corrida || !c.fuentes.length) {
      caso = consolidarCaso(o.raiz, o.dirProyecto, { cp: c.cp, numeroCaso: '—', configuracion: c.configuracion, fuentes: [] }, m);
      caso.origen = { tipo: 'sin-ejecucion', numeroCaso: null, fecha: null, corrida: o.corrida ?? null, unico: null, fuentes: [] };
      if (!o.corrida) sel.advertencias.push(`${c.cp} no tiene ejecución utilizable: la sección queda sin resultados.`);
    } else {
      const d = declarada.get(c.cp)!;
      caso = consolidarCaso(o.raiz, o.dirProyecto, c, m);
      caso.observacionesAutomaticas = observacionesAutomaticas(caso);
      caso.origen = { tipo: 'declarada', numeroCaso: c.numeroCaso, fecha: d.fecha != null ? new Date(d.fecha).toISOString() : null, corrida: null, unico: d.unico,
        fuentes: c.fuentes.map((f) => f.replace(/^docs\/evidencia\//, '')) };
    }
    caso.advertencias = sel.advertencias;
    const or = caso.origen!;
    seleccion.push({ cp: c.cp, origen: or.tipo, numeroCaso: or.numeroCaso, unico: or.unico, corrida: or.corrida, fecha: or.fecha,
      continuaciones: e ? sel.continuaciones.map((x) => x.unico) : [], advertencias: sel.advertencias });
    return caso;
  });
  const template = readFileSync(resolve(o.raiz, cfg.template));
  const logoCliente = cfg.logoCliente ? readFileSync(resolve(o.dirProyecto, 'certificacion', cfg.logoCliente)) : undefined;
  const base = resolve(o.raiz, ...RUTA_SOPORTES, cfg.hu);
  const marca = (o.ahora ?? new Date()).toISOString().replace(/[:.]/g, '-');
  let salida = resolve(base, marca);
  for (let k = 2; existsSync(salida); k++) salida = resolve(base, `${marca}-${k}`);
  mkdirSync(salida, { recursive: true });
  const docx = resolve(salida, cfg.salida);
  writeFileSync(docx, renderizarSoporteHu(cfg, casos, { template, ...(logoCliente ? { logoCliente } : {}) }));
  const plan = resolve(salida, `${cfg.hu}-soporte-plan.json`);
  writeFileSync(plan, JSON.stringify({ hu: cfg.hu, corrida: o.corrida ?? null, seleccion, casos }, null, 2) + '\n', 'utf8');
  return { docx, plan, casos, seleccion };
}
