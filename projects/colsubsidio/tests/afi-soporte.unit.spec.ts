import { test, expect, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { elementosXml, hijosXml, textoXml } from '../../../shared/utils/xml';
import { join, resolve } from 'node:path';
import { escribirZip, leerZip } from '../../../shared/utils/zip';
import { leerHojaXlsx } from '../../../shared/utils/xlsx';
import { actorDesdeEntorno } from '../data/afi/actores';
import type { CampoAfi } from '../data/afi/modelo';
import { POLITICAS_AFI } from '../data/afi/politicas';
import { DisenoQaError, leerDisenoCasoQa, type DisenoCasoQa } from '../data/afi/soporte/disenoQa';
import {
  PlantillaSoporteError, altoTextoPaso, dimensionesPng, disponerEvidencias, formatearPasos, geometriaCeldaLogo, renderizarSoporteDocx,
} from '../data/afi/soporte/docx';
import { RutaSoporteError, generarSoporteAfi } from '../data/afi/soporte/generar';
import {
  construirPlanSoporte, leyendasEvidencias, normalizarTextoComparable, validarMetaSoporte,
  type EntradaPlanSoporte, type ImagenPaquete, type ManifiestoEntrada, type ResultadoEntrada, type SoporteCertificacionAfi,
} from '../data/afi/soporte/plan';
import { FUERZA_PROBATORIA_AFI, seleccionarEvidenciasPaso, type EvidenciaCandidata } from '../data/afi/soporte/seleccion';

/**
 * Fase 4H: soporte de certificación cliente determinista. Aceptación con fuentes REALES:
 * el Excel de diseño vigente, el paquete 4G real de CP02 (tests/fixtures/soporte-cp02) y la plantilla corporativa.
 */

const RAIZ = resolve(__dirname, '../../..');
const EXCEL = join(RAIZ, '20260910_CLS_AFI_HU 14.12_V2_Casos_Prueba.xlsx');
const TEMPLATE = join(RAIZ, 'projects/colsubsidio/templates/soporte-certificacion-cliente-referencia.docx');
const META = join(RAIZ, 'projects/colsubsidio/resources/hu14-12/soporte-meta.json');
const LOGO = join(RAIZ, 'projects/colsubsidio/resources/hu14-12/logo-cliente-colsubsidio.png');
const FIXTURE = join(__dirname, 'fixtures/soporte-cp02');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v));

interface Fuentes { libro: Buffer; diseno: DisenoCasoQa; manifiesto: ManifiestoEntrada; resultado: ResultadoEntrada; imagenes: Map<string, ImagenPaquete>; bytes: Map<string, Buffer> }
let cache: Fuentes | undefined;
async function fuentes(): Promise<Fuentes> {
  if (cache) return cache;
  const libro = await readFile(EXCEL);
  const manifiesto = JSON.parse(await readFile(join(FIXTURE, 'CP02-evidencias.json'), 'utf8'));
  const resultado = JSON.parse(await readFile(join(FIXTURE, 'CP02-resultado.json'), 'utf8'));
  const imagenes = new Map<string, ImagenPaquete>(), bytes = new Map<string, Buffer>();
  for (const f of (await readdir(FIXTURE)).filter(f => f.endsWith('.png'))) {
    const b = await readFile(join(FIXTURE, f));
    imagenes.set(f, { sha256: sha(b), ...dimensionesPng(b) });
    bytes.set(f, b);
  }
  cache = { libro, diseno: leerDisenoCasoQa(libro, 'CP02'), manifiesto, resultado, imagenes, bytes };
  return cache;
}
async function entrada(cambiar: (e: EntradaPlanSoporte) => void = () => undefined): Promise<EntradaPlanSoporte> {
  const f = await fuentes();
  const e: EntradaPlanSoporte = {
    proyecto: 'colsubsidio', caso: 'CP02', meta: validarMetaSoporte(JSON.parse(await readFile(META, 'utf8'))),
    diseno: copia(f.diseno), fuenteDiseno: { archivo: 'diseno.xlsx', hoja: 'CP02', sha256: sha(f.libro) },
    manifiesto: copia(f.manifiesto), resultado: copia(f.resultado), imagenes: new Map(f.imagenes), paquete: 'soporte-cp02',
  };
  cambiar(e);
  return e;
}
const plan = async (cambiar?: (e: EntradaPlanSoporte) => void) => construirPlanSoporte(await entrada(cambiar));
const codigos = (p: SoporteCertificacionAfi) => p.problemas.map(x => [x.codigo, x.paso ?? '']);
async function render(p: SoporteCertificacionAfi, template?: Buffer): Promise<Buffer> {
  const f = await fuentes();
  return renderizarSoporteDocx(p, { template: template ?? await readFile(TEMPLATE), logoCliente: await readFile(LOGO), imagenes: f.bytes });
}
const partesDocx = (docx: Buffer) => new Map(leerZip(docx).map(e => [e.nombre, e.datos]));
const textoPlano = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join('')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/**
 * Valores SENSIBLES (no public según POLITICAS_AFI) del actor QA real del entorno: solo en memoria, nunca se imprimen.
 * Los public (p. ej. tipoAportante "Independiente") aparecen legítimamente en el texto del diseño QA.
 */
function valoresActor(): string[] {
  try {
    const actor = actorDesdeEntorno('independiente', process.env);
    return (Object.entries(actor.datos) as [CampoAfi, unknown][])
      .filter(([campo, v]) => POLITICAS_AFI[campo].sensibilidad !== 'public' && typeof v === 'string' && v.trim().length >= 4)
      .map(([, v]) => v as string);
  } catch { return []; }
}

// =====================================================================================
test.describe('A. diseño QA (Excel vigente)', () => {
  test('lee título, objetivo y pasos con texto EXACTO; conserva "Chí"', async () => {
    const { diseno, manifiesto } = await fuentes();
    expect(diseno.titulo.startsWith('CP02 - AFI - HU 14.12 – Verificación de flujo con Departamento CUNDINAMARCA')).toBe(true);
    expect(diseno.descripcion.startsWith('Certificar el flujo para aportante Independiente seleccionando "Cundinamarca"')).toBe(true);
    expect(diseno.pasos[0]).toMatchObject({ numero: 1, accion: 'Objetivo:', esperado: diseno.descripcion });
    expect(diseno.pasos.map(p => p.numero)).toEqual(Array.from({ length: 35 }, (_, i) => i + 1));
    // P02-P10: el esperado ejecutado es EXACTAMENTE el del diseño vigente.
    for (const p of manifiesto.pasos) expect(diseno.pasos.find(d => d.numero === Number(p.id.slice(1)))!.esperado).toBe(p.esperado);
    const p7 = diseno.pasos.find(p => p.numero === 7)!;
    expect(p7.accion).toBe('[DESKTOP] Digitar caracteres alfabéticos en el campo "Ciudad de vivienda" (ej. "Chí").');
    expect(p7.esperado).toContain('coincidan con "Chí" (ej. "Chía")');
    expect(p7.esperado).not.toContain('"Chi"');
    expect(diseno.pasos.find(p => p.numero === 5)!.accion).toContain('"@#$%&*"');
  });

  test('hoja inexistente -> DisenoQaError hoja-inexistente', async () => {
    const { libro } = await fuentes();
    const error = (() => { try { leerDisenoCasoQa(libro, 'CP99'); } catch (e) { return e as DisenoQaError; } })();
    expect(error).toBeInstanceOf(DisenoQaError);
    expect(error!.motivo).toBe('hoja-inexistente');
  });

  test('lector XLSX: shared strings con rich text (sin fonética), inlineStr y estructura inválida', () => {
    const libro = (filas: string) => escribirZip([
      { nombre: 'xl/workbook.xml', datos: Buffer.from('<workbook xmlns:r="r"><sheets><sheet name="CPX" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { nombre: 'xl/_rels/workbook.xml.rels', datos: Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>') },
      { nombre: 'xl/sharedStrings.xml', datos: Buffer.from('<sst><si><r><t>Tí</t></r><r><t xml:space="preserve">tulo &amp; más</t></r><rPh><t>FONETICA</t></rPh></si><si><t>Paso</t></si></sst>') },
      { nombre: 'xl/worksheets/sheet1.xml', datos: Buffer.from(`<worksheet><sheetData>${filas}</sheetData></worksheet>`) },
    ]);
    const is = (ref: string, t: string) => `<c r="${ref}" t="inlineStr"><is><t>${t}</t></is></c>`;
    const valido = libro(`<row r="1"><c r="B1" t="s"><v>0</v></c></row><row r="2">${is('B2', 'Descripción:')}${is('C2', 'Objetivo X')}</row>`
      + `<row r="3"><c r="B3" t="s"><v>1</v></c>${is('C3', 'Acción')}${is('D3', 'Resultado Esperado')}</row>`
      + `<row r="4"><c r="B4"><v>1</v></c>${is('C4', 'Objetivo:')}${is('D4', 'Objetivo X')}</row>`
      + `<row r="5"><c r="B5"><v>2</v></c>${is('C5', '[DESKTOP] Hacer &quot;algo&quot;_x000D_')}${is('D5', 'Pasa')}</row>`);
    expect(leerHojaXlsx(valido, 'CPX').celdas.get('B1')).toBe('Título & más');
    expect(leerDisenoCasoQa(valido, 'CPX')).toEqual({
      hoja: 'CPX', titulo: 'Título & más', descripcion: 'Objetivo X',
      pasos: [{ numero: 1, accion: 'Objetivo:', esperado: 'Objetivo X', fila: 4 }, { numero: 2, accion: '[DESKTOP] Hacer "algo"\r', esperado: 'Pasa', fila: 5 }],
    });
    const sinEncabezado = libro(`<row r="1">${is('B1', 'Título')}</row>`);
    expect(() => leerDisenoCasoQa(sinEncabezado, 'CPX')).toThrow(/sin-encabezado/);
    const duplicado = libro(`<row r="1">${is('B1', 'T')}</row><row r="2">${is('B2', 'Descripción:')}${is('C2', 'D')}</row>`
      + `<row r="3">${is('B3', 'Paso')}${is('C3', 'Acción')}${is('D3', 'Resultado Esperado')}</row>`
      + `<row r="4"><c r="B4"><v>2</v></c>${is('C4', 'a')}${is('D4', 'b')}</row><row r="5"><c r="B5"><v>2</v></c>${is('C5', 'a')}${is('D5', 'b')}</row>`);
    expect(() => leerDisenoCasoQa(duplicado, 'CPX')).toThrow(/paso-duplicado/);
  });
});

// =====================================================================================
test.describe('B. join diseño <-> ejecución <-> evidencia', () => {
  test('corrida real CP02: GENERABLE, correspondencia Pnn <-> paso nn, texto del diseño', async () => {
    const p = await plan();
    expect([p.estado, p.problemas]).toEqual(['GENERABLE', []]);
    expect(p.pasos.map(x => [x.idAfi, x.numeroDiseno, x.resultado])).toEqual(
      [2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => [`P${String(n).padStart(2, '0')}`, n, 'PASS']));
    expect(p.pasosDisenoNoIncluidos).toEqual(Array.from({ length: 25 }, (_, i) => i + 11));
  });

  test('el orden del diseño en la hoja no importa: la correspondencia es explícita por número', async () => {
    const normal = await plan();
    const invertido = await plan(e => { e.diseno.pasos.reverse(); });
    expect(invertido.pasos).toEqual(normal.pasos);
  });

  test('paso faltante en el diseño -> INCONSISTENTE PASO_NO_EN_DISENO', async () => {
    const p = await plan(e => { e.diseno.pasos = e.diseno.pasos.filter(x => x.numero !== 7); });
    expect([p.estado, codigos(p)]).toEqual(['INCONSISTENTE', [['PASO_NO_EN_DISENO', 'P07']]]);
  });

  test('drift del esperado -> INCONSISTENTE; diferencias tipográficas autorizadas no son drift', async () => {
    const drift = await plan(e => { const x = e.resultado.pasosFuncionales.find(p => p.id === 'P07')!; x.esperado = x.esperado.replace(/Chí/g, 'Chi'); });
    expect([drift.estado, codigos(drift)]).toEqual(['INCONSISTENTE', [['DRIFT_ESPERADO', 'P07']]]);
    const tipografico = await plan(e => { const x = e.resultado.pasosFuncionales.find(p => p.id === 'P04')!; x.esperado = x.esperado.replace(/ /g, '  '); });
    expect(tipografico.estado).toBe('GENERABLE');
    expect(normalizarTextoComparable('“Chí”  –  x')).toBe('"Chí" - x');
    expect(normalizarTextoComparable('Chí')).toBe(normalizarTextoComparable('Chí')); // NFC
  });

  test('manifest de otro caso / HU / variante -> INCONSISTENTE', async () => {
    expect(codigos(await plan(e => { e.manifiesto.caso = 'CP01'; }))).toEqual([['MANIFIESTO_OTRO_CASO', '']]);
    expect(codigos(await plan(e => { e.manifiesto.hu = 'AFI HU 99'; }))).toEqual([['HU_DISTINTA', '']]);
    expect(codigos(await plan(e => { e.diseno.pasos.find(p => p.numero === 3)!.accion = '[MOBILE] x'; }))).toEqual([['VARIANTE_DISTINTA', 'P03']]);
    expect(codigos(await plan(e => { e.resultado.numeroCaso = undefined; }))).toEqual([['NUMERO_CASO_INVALIDO', '']]);
  });

  test('resultado FAIL -> SOPORTE_NO_GENERABLE caso-funcional-fallido y no se emite DOCX', async () => {
    const p = await plan(e => {
      e.resultado.resultado = 'FAIL'; e.manifiesto.resultado = 'FAIL';
      e.resultado.pasosFuncionales.find(x => x.id === 'P10')!.resultado = 'FAIL';
    });
    expect([p.estado, p.motivo]).toEqual(['SOPORTE_NO_GENERABLE', 'caso-funcional-fallido']);
    await expect(render(p)).rejects.toThrow('Soporte no generable (SOPORTE_NO_GENERABLE)');
  });

  test('evidencia incompleta, paso sin evidencia o imagen faltante -> BLOQUEADO_POR_EVIDENCIA', async () => {
    const parcial = await plan(e => { e.manifiesto.evidencia.estado = 'parcial'; });
    expect([parcial.estado, parcial.motivo, codigos(parcial)]).toEqual(['BLOQUEADO_POR_EVIDENCIA', 'evidencia-incompleta', [['EVIDENCIA_INCOMPLETA', '']]]);
    const sinP05 = await plan(e => { e.manifiesto.evidencias = e.manifiesto.evidencias.filter(x => x.paso !== 'P05'); });
    expect([sinP05.estado, codigos(sinP05)]).toEqual(['BLOQUEADO_POR_EVIDENCIA', [['PASO_SIN_EVIDENCIA', 'P05']]]);
    const faltante = await plan(e => { (e.imagenes as Map<string, ImagenPaquete>).delete('CP02-P07-01-sugerencias-segun-fuente.png'); });
    expect(codigos(faltante)).toEqual([['IMAGEN_FALTANTE', 'P07'], ['PASO_SIN_EVIDENCIA', 'P07']]);
    await expect(render(faltante)).rejects.toThrow('BLOQUEADO_POR_EVIDENCIA');
  });
});

// =====================================================================================
test.describe('C. selección de evidencia', () => {
  const c = (archivo: string, operacion: EvidenciaCandidata['operacion'], indiceOperacion: number, extra: Partial<EvidenciaCandidata> = {}): EvidenciaCandidata =>
    ({ archivo, operacion, status: 'PASS', indiceOperacion, orden: indiceOperacion + 1, sha256: archivo, ...extra });

  test('determinista e independiente del orden de entrada; una principal y máximo una suplementaria', () => {
    const cands = [c('a', 'campo-estado', 0), c('b', 'catalogo-segun-fuente', 1), c('c', 'sugerencias-segun-fuente', 2), c('d', 'campo-valor', 3)];
    const s = seleccionarEvidenciasPaso(cands);
    expect(seleccionarEvidenciasPaso([...cands].reverse())).toEqual(s);
    expect([s.principal?.archivo, s.suplementarias.map(x => x.archivo)]).toEqual(['b', ['d']]);
    expect(s.descartadas).toEqual([{ archivo: 'a', motivo: 'excedente' }, { archivo: 'c', motivo: 'excedente' }]);
  });

  test('empate de fuerza -> la última; imágenes idénticas se descartan', () => {
    const s = seleccionarEvidenciasPaso([c('x1', 'campo-valor', 1, { sha256: 'h' }), c('x2', 'campo-estado', 2, { sha256: 'h' })]);
    expect([s.principal?.archivo, s.suplementarias, s.descartadas]).toEqual(['x2', [], [{ archivo: 'x1', motivo: 'duplicado-identico' }]]);
  });

  test('nunca una captura FAIL (ni principal ni suplementaria)', () => {
    const s = seleccionarEvidenciasPaso([c('fuerte', 'catalogo-segun-fuente', 0, { status: 'FAIL' }), c('debil', 'componente-visible', 1)]);
    expect([s.principal?.archivo, s.suplementarias]).toEqual(['debil', []]);
    expect(seleccionarEvidenciasPaso([c('f', 'campo-valor', 0, { status: 'FAIL' })]).principal).toBeUndefined();
  });

  test('toda operación del catálogo tiene fuerza declarada; la política no conoce casos', async () => {
    const fuente = (await readFile(resolve(__dirname, '../data/afi/soporte/seleccion.ts'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(fuente).not.toMatch(/CP0\d|['"]P\d\d['"]|Cundinamarca|Chía/);
    expect(Object.values(FUERZA_PROBATORIA_AFI).filter(v => v === null)).toHaveLength(4);
  });

  test('corrida real CP02: criterios de QA (P02, P06, P07, P08, P09)', async () => {
    const p = await plan();
    const de = (id: string) => p.pasos.find(x => x.idAfi === id)!;
    const resumen = (id: string) => [de(id).principal?.archivo, de(id).suplementarias.map(x => x.archivo)];
    expect(resumen('P02')).toEqual(['CP02-P02-02-componente-posicion.png', []]); // la otra es idéntica
    expect(resumen('P06')).toEqual(['CP02-P06-02-campo-valor.png', ['CP02-P06-01-campo-valor.png']]); // vacío tras blur + antes
    expect(de('P06').ordenDocumento).toEqual(['CP02-P06-01-campo-valor.png', 'CP02-P06-02-campo-valor.png']);
    expect(resumen('P07')).toEqual(['CP02-P07-01-sugerencias-segun-fuente.png', []]);
    expect(resumen('P08')).toEqual(['CP02-P08-02-catalogo-segun-fuente.png', ['CP02-P08-03-campo-valor.png']]);
    expect(resumen('P09')).toEqual(['CP02-P09-02-campo-estado.png', []]);
    for (const x of p.pasos) expect(x.ordenDocumento.length).toBeLessThanOrEqual(2);
  });
});

// =====================================================================================
test.describe('D. soporte-plan', () => {
  test('número de caso de la ejecución, texto QA intacto, sin rutas absolutas ni PII', async () => {
    const p = await plan();
    const { diseno } = await fuentes();
    expect(p.numeroCaso).toBe('312267');
    expect(p.titulo).toBe(`228501 - ${diseno.titulo}`);
    expect(p.objetivo).toEqual({ numeroDiseno: 1, accion: 'Objetivo:', texto: diseno.descripcion, automatizado: false });
    for (const x of p.pasos) {
      const d = diseno.pasos.find(y => y.numero === x.numeroDiseno)!;
      expect([x.accion, x.esperado]).toEqual([d.accion, d.esperado]);
    }
    const texto = JSON.stringify(p);
    // Unidad de disco (C:\ o C:/) sin confundir "https://" del texto QA.
    expect(texto).not.toMatch(/(^|[^A-Za-z])[A-Za-z]:[\\/]|\\\\|\/(Users|home|tmp)\/|AppData/);
    expect(texto).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    for (const v of valoresActor()) expect(texto.includes(v), 'valor del actor en el plan').toBe(false);
    expect(JSON.parse(texto)).toEqual(p); // portable
  });
});

// =====================================================================================
test.describe('E. DOCX', () => {
  async function xmlValido(page: Page, xml: string): Promise<boolean> {
    return page.evaluate(x => !new DOMParser().parseFromString(x, 'application/xml').getElementsByTagName('parsererror').length, xml);
  }

  test('OOXML válido, textos del diseño, imágenes seleccionadas, plantilla y encabezado conservados', async ({ page }) => {
    const p = await plan();
    const { bytes, diseno } = await fuentes();
    const templateAntes = sha(await readFile(TEMPLATE));
    const docx = await render(p);
    expect(sha(await readFile(TEMPLATE))).toBe(templateAntes); // la referencia no se modifica
    const partes = partesDocx(docx);
    const plantilla = partesDocx(await readFile(TEMPLATE));

    // XML bien formado (parser estricto del navegador) en todas las partes XML.
    for (const [nombre, datos] of partes) if (/\.(xml|rels)$/.test(nombre)) expect(await xmlValido(page, datos.toString('utf8')), nombre).toBe(true);

    // Identidad visual: estilos, tema, numeración, fuentes, pie y logo corporativo byte a byte.
    for (const n of ['word/styles.xml', 'word/theme/theme1.xml', 'word/numbering.xml', 'word/fontTable.xml', 'word/footer1.xml', 'word/media/image1.png', 'word/footnotes.xml', 'word/endnotes.xml']) {
      expect(partes.get(n)!.equals(plantilla.get(n)!), n).toBe(true);
    }
    const doc = partes.get('word/document.xml')!.toString('utf8');
    const sect = (x: string) => x.slice(x.indexOf('<w:sectPr'), x.indexOf('</w:sectPr>'));
    expect(sect(doc)).toBe(sect(plantilla.get('word/document.xml')!.toString('utf8'))); // página, márgenes, header/footer refs
    const header = partes.get('word/header1.xml')!.toString('utf8');
    expect(textoPlano(header)).toBe('HU - 223169SOPORTES CERTIFICACIÓN CLIENTE');
    expect(header).toContain('r:embed="rId1"'); // logo Gattaca de la plantilla
    const headerRels = partes.get('word/_rels/header1.xml.rels')!.toString('utf8');
    expect(headerRels).toContain('Target="media/image1.png"');
    expect(partes.get('word/media/afi-logo-cliente.png')!.equals(await readFile(LOGO))).toBe(true);
    expect(textoPlano(partes.get('word/footer1.xml')!.toString('utf8'))).toContain('Gattaca Outsourcing SAS');

    // Contenido: textos EXACTOS del diseño, número de caso de la ejecución, sin placeholders de la plantilla.
    const texto = textoPlano(doc);
    for (const v of ['Colsubsidio', 'HU - 223169', 'CLS – Afiliaciones – Historias de usuario', 'Cambio', 'SP 37', 'SP 38', 'Afiliaciones', p.titulo, 'Número del caso: 312267', 'Paso 1. Objetivo:', diseno.descripcion]) {
      expect(texto, v).toContain(v);
    }
    for (const x of p.pasos) expect(texto).toContain(`Paso ${x.numeroDiseno}. ${x.accion}Resultado del paso${x.esperado}`);
    expect(texto).not.toMatch(/\[(Nombre|Documente|Sprint|Iteración|Número de caso|Incluya|Nota)/);
    expect(texto.match(/Resultado del paso/g)).toHaveLength(10);
    // El orden de los pasos es el del diseño.
    const posiciones = [1, ...p.pasos.map(x => x.numeroDiseno)].map(n => texto.indexOf(`Paso ${n}. `));
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));

    // Imágenes: exactamente las seleccionadas, en orden, con proporción conservada y dentro del ancho útil.
    const seleccionadas = p.pasos.flatMap(x => x.ordenDocumento);
    const medias = [...partes.keys()].filter(n => /^word\/media\/afi-evidencia-\d+\.png$/.test(n)).sort();
    expect(medias.map(n => sha(partes.get(n)!))).toEqual(seleccionadas.map(a => sha(bytes.get(a)!)));
    const extents = [...doc.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map(m => [Number(m[1]), Number(m[2])]);
    expect(extents).toHaveLength(seleccionadas.length);
    extents.forEach(([cx, cy], i) => {
      const { ancho, alto } = dimensionesPng(bytes.get(seleccionadas[i])!);
      expect(cx).toBeLessThanOrEqual(5_400_040);
      expect(Math.abs(cy / cx - alto / ancho)).toBeLessThan(0.001);
    });

    // Nada técnico ni del host.
    expect([...partes.keys()].filter(n => /\.(json|webm|zip|trace)$/i.test(n) || /evidencias|resultado|traza/i.test(n))).toEqual([]);
    const todo = [...partes].filter(([n]) => /\.(xml|rels)$/.test(n)).map(([, d]) => d.toString('utf8')).join('\n');
    expect(todo).not.toMatch(/[A-Za-z]:\\|\\Users\\|\/Users\/|AppData|test-results|trazaTecnica/);
    expect(todo).not.toMatch(/[\w.+-]+@[\w-]+\.(com|co|org|net|test)\b/);
    for (const v of valoresActor()) expect(todo.includes(v), 'valor del actor en el DOCX').toBe(false);
    const core = partes.get('docProps/core.xml')!.toString('utf8');
    expect(core).toContain('<dc:creator></dc:creator>');
    expect(core).toContain('<cp:lastModifiedBy></cp:lastModifiedBy>');
    // Índice: se actualiza al abrir en Word.
    const settings = partes.get('word/settings.xml')!.toString('utf8');
    expect(settings.indexOf('<w:updateFields w:val="true"/>')).toBeLessThan(settings.indexOf('<w:hdrShapeDefaults'));
    expect(doc).toContain('w:fldCharType="begin" w:dirty="true"/>');
  });

  test('determinista: mismas entradas -> mismos bytes', async () => {
    const p = await plan();
    expect((await render(p)).equals(await render(p))).toBe(true);
  });

  test('plantilla sin la estructura esperada -> PlantillaSoporteError (no documento a medias)', async () => {
    const plantilla = leerZip(await readFile(TEMPLATE)).map(e => e.nombre === 'word/header1.xml'
      ? { ...e, datos: Buffer.from(e.datos.toString('utf8').replace('[Logo Cliente]', 'Logo')) } : e);
    await expect(render(await plan(), escribirZip(plantilla))).rejects.toThrow(PlantillaSoporteError);
  });

  test('generación completa: rutas desde la raíz, salida en test-results y confinamiento al repositorio', async () => {
    const r = await generarSoporteAfi({ raiz: RAIZ, proyecto: 'colsubsidio', caso: 'CP02', meta: 'projects/colsubsidio/resources/hu14-12/soporte-meta.json', evidencias: 'projects/colsubsidio/tests/fixtures/soporte-cp02' });
    expect(r).toMatchObject({
      salida: 'test-results/colsubsidio/soportes/CP02/soporte-cp02',
      planArchivo: 'test-results/colsubsidio/soportes/CP02/soporte-cp02/CP02-soporte-plan.json',
      docx: 'test-results/colsubsidio/soportes/CP02/soporte-cp02/CP02-Soportes-Certificacion-Cliente.docx',
    });
    expect(r.plan.estado).toBe('GENERABLE');
    expect(JSON.parse(await readFile(join(RAIZ, r.planArchivo), 'utf8'))).toEqual(r.plan);
    await expect(generarSoporteAfi({ raiz: RAIZ, proyecto: 'colsubsidio', caso: 'CP02', meta: 'projects/colsubsidio/resources/hu14-12/soporte-meta.json', evidencias: '../fuera' }))
      .rejects.toThrow(RutaSoporteError);
  });
});

// =====================================================================================
// 4H.1: integridad de alcance y acabado visual
const A4 = { anchoUtil: 8504 * 635, altoUtil: (16838 - 2 * 1417) * 635 };
/** Hijos de primer nivel del cuerpo desde el título de la sección del caso: párrafos y tablas completos, en orden. */
function bloquesCaso(doc: string): string[] {
  const body = elementosXml(doc, 'w:body')[0];
  const hijos = hijosXml(doc, body.inicioContenido, body.finContenido).map(h => textoXml(doc, h));
  return hijos.slice(hijos.findIndex(h => h.includes('w:name="_TocAfiSeccion"')));
}
const soloCompleto = (e: EntradaPlanSoporte) => { e.diseno.pasos = e.diseno.pasos.filter(p => p.numero <= 10); };

test.describe('4H.1 A. cobertura de la ejecución', () => {
  test('CP02 real: parcial, Desktop, pasos 2-10 incluidos y 11-35 no incluidos; GENERABLE se mantiene', async () => {
    const p = await plan();
    expect(p.estado).toBe('GENERABLE');
    expect(p.cobertura).toEqual({
      estado: 'parcial', variante: 'DESKTOP',
      pasosIncluidos: [2, 3, 4, 5, 6, 7, 8, 9, 10], pasosNoIncluidos: Array.from({ length: 25 }, (_, i) => i + 11),
    });
    expect(p.pasosDisenoNoIncluidos).toEqual(p.cobertura.pasosNoIncluidos);
  });

  test('completa cuando el diseño no tiene pasos fuera de la ejecución', async () => {
    const p = await plan(soloCompleto);
    expect(p.cobertura).toMatchObject({ estado: 'completa', pasosNoIncluidos: [] });
  });

  test('rangos de pasos y ausencia de casos concretos en la lógica de cobertura/presentación', async () => {
    expect(formatearPasos([5])).toBe('paso 5');
    expect(formatearPasos([10, 2, 3, 4, 5, 6, 7, 8, 9])).toBe('pasos 2 a 10');
    expect(formatearPasos([2, 3, 4, 5, 7, 9])).toBe('pasos 2 a 5, 7 y 9');
    for (const f of ['plan.ts', 'docx.ts']) {
      const fuente = (await readFile(resolve(__dirname, `../data/afi/soporte/${f}`), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(fuente, f).not.toMatch(/CP0\d|['"`]P\d\d['"`]|Cundinamarca|Chía|\b(11|35)\b/);
    }
  });
});

test.describe('4H.1 B. el documento declara la cobertura', () => {
  test('cobertura parcial explícita junto al número de caso; título y objetivo QA verbatim; sin pasos no ejecutados', async () => {
    const p = await plan();
    const { diseno } = await fuentes();
    const doc = partesDocx(await render(p)).get('word/document.xml')!.toString('utf8');
    const texto = textoPlano(doc);
    const numero = texto.indexOf('Número del caso: 312267'), cobertura = texto.indexOf('Cobertura de esta ejecución: Desktop — pasos 2 a 10.');
    const noIncluidos = texto.indexOf('No incluidos en esta ejecución: pasos 11 a 35 del diseño de prueba.');
    const alcance = texto.indexOf('Este soporte documenta únicamente los pasos incluidos en esta ejecución.');
    expect([numero, cobertura, noIncluidos, alcance].every(i => i >= 0)).toBe(true);
    expect(numero < cobertura && cobertura < noIncluidos && noIncluidos < alcance && alcance < texto.indexOf('Paso 1. Objetivo:')).toBe(true);
    // Título y objetivo QA intactos (incluido "(Desktop y Mobile)"): la cobertura se declara aparte.
    expect(texto).toContain(`228501 - ${diseno.titulo}`);
    expect(diseno.titulo).toContain('(Desktop y Mobile)');
    expect(texto).toContain(`Paso 1. Objetivo:Resultado del paso${diseno.descripcion}`);
    // Nada afirma resultado de pasos no incluidos.
    expect(texto).not.toMatch(/Paso (1[1-9]|2\d|3[0-5])\. /);
    expect(texto).not.toMatch(/\b(PASS|FAIL|aprobad|fallid|pendiente)/i);
  });

  test('cobertura completa: solo la línea de cobertura', async () => {
    const texto = textoPlano(partesDocx(await render(await plan(soloCompleto))).get('word/document.xml')!.toString('utf8'));
    expect(texto).toContain('Cobertura de esta ejecución: Desktop — pasos 2 a 10.');
    expect(texto).not.toContain('No incluidos en esta ejecución');
    expect(texto).not.toContain('Este soporte documenta únicamente');
  });
});

test.describe('4H.1 C. múltiples evidencias', () => {
  const apaisada = { ancho: 1365, alto: 900 }, vertical = { ancho: 400, alto: 824 };

  test('disposición determinista: única a ancho completo; 2 apaisadas -> vertical reducida; 2 verticales -> lado a lado', () => {
    const texto = altoTextoPaso(['Paso 6. ' + 'x'.repeat(230), '', 'Resultado del paso', 'y'.repeat(220), ''], A4.anchoUtil);
    const unica = disponerEvidencias([apaisada], A4, texto);
    expect(unica).toEqual({ modo: 'unica', medidas: [{ cx: A4.anchoUtil, cy: Math.round(A4.anchoUtil * 900 / 1365) }] });
    for (const [imgs, modo] of [[[apaisada, apaisada], 'vertical'], [[vertical, vertical], 'lado-a-lado']] as const) {
      const d = disponerEvidencias(imgs, A4, texto);
      expect(d.modo).toBe(modo);
      d.medidas.forEach((m, k) => {
        expect(Math.abs(m.cy / m.cx - imgs[k].alto / imgs[k].ancho)).toBeLessThan(0.002); // proporción exacta
        expect(m.cx).toBeLessThanOrEqual(modo === 'vertical' ? A4.anchoUtil : A4.anchoUtil / 2);
      });
      // Texto + imágenes (+ leyendas) caben en UNA página.
      const altoImagenes = modo === 'vertical' ? d.medidas[0].cy + d.medidas[1].cy : Math.max(...d.medidas.map(m => m.cy));
      expect(texto + altoImagenes).toBeLessThan(A4.altoUtil * 0.9);
      // Ambas legibles: más anchas que la alternativa (la mitad del ancho útil en lado a lado).
      if (modo === 'vertical') expect(d.medidas[0].cx).toBeGreaterThan(A4.anchoUtil / 2);
    }
    expect(disponerEvidencias([apaisada, apaisada], A4, texto)).toEqual(disponerEvidencias([apaisada, apaisada], A4, texto));
    expect(() => disponerEvidencias([apaisada, apaisada, apaisada], A4, texto)).toThrow('1 o 2 evidencias');
  });

  test('leyendas genéricas: misma operación = transición; distinta = Evidencia 1/2; una imagen sin leyenda', async () => {
    expect(leyendasEvidencias(['campo-valor', 'campo-valor'])).toEqual(['Estado previo', 'Resultado final']);
    expect(leyendasEvidencias(['catalogo-segun-fuente', 'campo-valor'])).toEqual(['Evidencia 1', 'Evidencia 2']);
    expect(leyendasEvidencias(['campo-valor'])).toBeUndefined();
    const p = await plan();
    const de = (id: string) => p.pasos.find(x => x.idAfi === id)!;
    expect(de('P06').leyendas).toEqual(['Estado previo', 'Resultado final']); // "Zxyw" -> vacío
    expect(de('P08').leyendas).toEqual(['Evidencia 1', 'Evidencia 2']);
    expect(de('P10').leyendas).toEqual(['Evidencia 1', 'Evidencia 2']);
    expect(de('P07').leyendas).toBeUndefined();
  });

  test('OOXML: 2 imágenes en una fila indivisible encadenada al texto del paso; nunca huérfanas', async () => {
    const p = await plan();
    const doc = partesDocx(await render(p)).get('word/document.xml')!.toString('utf8');
    const bloques = bloquesCaso(doc);
    const tablas = bloques.map((b, i) => ({ b, i })).filter(x => x.b.startsWith('<w:tbl>'));
    const dobles = p.pasos.filter(x => x.ordenDocumento.length === 2);
    expect(tablas).toHaveLength(dobles.length);
    tablas.forEach(({ b, i }, k) => {
      const paso = dobles[k];
      expect(b.match(/<w:drawing>/g)).toHaveLength(2);
      expect(b.match(/<w:tr>/g)).toHaveLength(1);
      expect(b).toContain('<w:cantSplit/>');
      expect(textoPlano(b)).toBe(paso.leyendas!.map(l => `Paso ${paso.numeroDiseno} · ${l}`).join(''));
      // Los 5 párrafos anteriores (Paso N., vacío, Resultado del paso, esperado, vacío) mantienen el bloque unido.
      const previos = bloques.slice(i - 5, i);
      expect(textoPlano(previos[0]).startsWith(`Paso ${paso.numeroDiseno}. `)).toBe(true);
      for (const x of previos) expect(x).toContain('<w:keepNext/>');
      // Dentro de la página: anchos por celda y proporción exacta.
      const anchos = [...b.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(m => Number(m[1]));
      expect(anchos.reduce((a, c) => a + c, 0)).toBe(8504);
      const extents = [...b.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map(m => [Number(m[1]), Number(m[2])]);
      extents.forEach(([cx, cy]) => {
        expect(cx).toBeLessThanOrEqual(Math.max(...anchos) * 635 - 2 * 108 * 635);
        expect(Math.abs(cy / cx - 900 / 1365)).toBeLessThan(0.002);
      });
    });
    // Pasos con una imagen: párrafo propio, fuera de tabla (layout 4H).
    const unicas = bloques.filter(b => b.startsWith('<w:p') && b.includes('<w:drawing>'));
    expect(unicas).toHaveLength(p.pasos.filter(x => x.ordenDocumento.length === 1).length);
    expect(p.pasos.every(x => x.ordenDocumento.length <= 2)).toBe(true);
  });
});

test.describe('4H.1 D. índice y finalización', () => {
  test('updateFields activo y el finalizador sin LibreOffice falla claro sin tocar el DOCX', async () => {
    const docx = await render(await plan());
    expect(partesDocx(docx).get('word/settings.xml')!.toString('utf8')).toContain('<w:updateFields w:val="true"/>');
    const carpeta = join(RAIZ, 'test-results', 'colsubsidio', 'soportes', '_prueba-finalizador');
    await mkdir(carpeta, { recursive: true });
    const archivo = join(carpeta, 'soporte.docx');
    await writeFile(archivo, docx);
    const herramienta = join(RAIZ, 'tools', 'afi-soporte-render.mjs');
    const correr = (...a: string[]) => spawnSync(process.execPath, [herramienta, 'test-results/colsubsidio/soportes/_prueba-finalizador/soporte.docx', ...a], { cwd: RAIZ, encoding: 'utf8' });
    const r = correr('--actualizar', '--soffice', 'no/existe/soffice');
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('LibreOffice no está disponible en "no/existe/soffice": no se finaliza el documento');
    expect(r.stderr).toContain('El DOCX no se modificó');
    expect(sha(await readFile(archivo))).toBe(sha(docx));
    expect(existsSync(join(carpeta, 'soporte-finalizado.docx'))).toBe(false);
    expect(existsSync(join(carpeta, 'render'))).toBe(false);
    expect(correr('--sobrescribir').status).toBe(2); // sobrescribir solo con --actualizar
  });
});

test.describe('4H.1.1 logo del cliente: ancho EFECTIVO de la celda', () => {
  const logoGenerado = (header: string) => {
    const dibujo = elementosXml(header, 'w:drawing').map(d => textoXml(header, d)).find(d => d.includes('name="Logo cliente"'))!;
    const [cx, cy] = dibujo.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)!.slice(1).map(Number);
    return { dibujo, cx, cy };
  };

  test('plantilla real: tblGrid (1255 tw) más estrecho que tcW (27,5 %): el logo cabe en la rejilla, sin crop ni deformación', async () => {
    const plantilla = partesDocx(await readFile(TEMPLATE)).get('word/header1.xml')!.toString('utf8');
    const parrafo = elementosXml(plantilla, 'w:p').find(x => textoXml(plantilla, x).includes('[Logo Cliente]'))!;
    const celda = geometriaCeldaLogo(plantilla, parrafo, 8504);
    // La discrepancia que cortó el logo en LibreOffice.
    expect(celda.anchoRejilla).toBe(1255);
    expect(celda.anchoPreferido!).toBeGreaterThan(celda.anchoRejilla);
    expect(celda.anchoInterior).toBe((1255 - 2 * 108) * 635);
    const { dibujo, cx, cy } = logoGenerado(partesDocx(await render(await plan())).get('word/header1.xml')!.toString('utf8'));
    const { ancho, alto } = dimensionesPng(await readFile(LOGO));
    expect(cx).toBeLessThanOrEqual(celda.anchoInterior); // cabe en la rejilla (no solo en tcW)
    expect(cx).toBeLessThan(1_054_273); // reducido respecto del tamaño histórico
    expect(cy).toBeLessThanOrEqual(celda.altoMinimo);
    expect(Math.abs(cy / cx - alto / ancho)).toBeLessThan(0.002);
    expect(dibujo).not.toContain('a:srcRect');
    // La tabla corporativa no se modifica: misma rejilla y mismos anchos preferidos.
    const tabla = (x: string) => x.slice(x.indexOf('<w:tblGrid>'), x.indexOf('</w:tblGrid>'));
    const header = partesDocx(await render(await plan())).get('word/header1.xml')!.toString('utf8');
    expect(tabla(header)).toBe(tabla(plantilla));
    expect(header.match(/<w:tcW [^>]*>/g)).toEqual(plantilla.match(/<w:tcW [^>]*>/g));
  });

  test('sintético: gridSpan, rejilla < tcW y márgenes de celda propios -> gana lo más restrictivo', () => {
    const header = (celdas: string, grid = '<w:gridCol w:w="600"/><w:gridCol w:w="700"/><w:gridCol w:w="5000"/>', mar = '') =>
      `<w:hdr><w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${mar}</w:tblPr><w:tblGrid>${grid}</w:tblGrid><w:tr><w:trPr><w:trHeight w:val="900"/></w:trPr>${celdas}</w:tr></w:tbl></w:hdr>`;
    const logo = '<w:p><w:r><w:t>[Logo Cliente]</w:t></w:r></w:p>';
    const geo = (x: string) => geometriaCeldaLogo(x, elementosXml(x, 'w:p').find(p => textoXml(x, p).includes('[Logo'))!, 8504);
    // Celda 1 con gridSpan=2 -> rejilla 600+700 = 1300 tw; tcW 40 % (3402 tw) es más ancho: gana la rejilla.
    const a = header(`<w:tc><w:tcPr><w:tcW w:w="2000" w:type="pct"/><w:gridSpan w:val="2"/></w:tcPr>${logo}</w:tc><w:tc><w:tcPr><w:tcW w:w="3000" w:type="pct"/></w:tcPr><w:p/></w:tc>`);
    expect(geo(a)).toMatchObject({ anchoRejilla: 1300, anchoInterior: (1300 - 216) * 635, altoMinimo: 900 * 635 });
    // Celda después de una con gridSpan: su índice de rejilla es 2 (5000 tw); tcW dxa 1000 es más estrecho: gana tcW.
    const b = header(`<w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr>${logo}</w:tc>`);
    expect(geo(b)).toMatchObject({ anchoRejilla: 5000, anchoPreferido: 1000, anchoInterior: (1000 - 216) * 635 });
    // Márgenes de la tabla (tblCellMar) y de la celda (tcMar, prevalece).
    const c = header(`<w:tc><w:tcPr><w:tcMar><w:left w:w="50" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tcMar></w:tcPr>${logo}</w:tc>`,
      '<w:gridCol w:w="1200"/>', '<w:tblCellMar><w:left w:w="300" w:type="dxa"/><w:right w:w="300" w:type="dxa"/></w:tblCellMar>');
    expect(geo(c).anchoInterior).toBe((1200 - 100) * 635);
    // Rejilla que no cubre la celda: la plantilla es inválida, no se adivina.
    expect(() => geo(header(`<w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p/></w:tc><w:tc>${logo}</w:tc>`, '<w:gridCol w:w="600"/><w:gridCol w:w="700"/>'))).toThrow(PlantillaSoporteError);
  });

  test('render con una plantilla cuya rejilla es aún más estrecha: el logo se reduce hasta caber, sin deformarse', async () => {
    const plantilla = leerZip(await readFile(TEMPLATE)).map(e => e.nombre === 'word/header1.xml'
      ? { ...e, datos: Buffer.from(e.datos.toString('utf8').replace('<w:gridCol w:w="1255"/>', '<w:gridCol w:w="800"/>')) } : e);
    const header = partesDocx(await render(await plan(), escribirZip(plantilla))).get('word/header1.xml')!.toString('utf8');
    const { cx, cy } = logoGenerado(header);
    const { ancho, alto } = dimensionesPng(await readFile(LOGO));
    expect(cx).toBe((800 - 216) * 635);
    expect(Math.abs(cy / cx - alto / ancho)).toBeLessThan(0.002);
  });
});
