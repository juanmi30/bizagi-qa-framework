import { posix } from 'node:path';
import { leerZip } from './zip';
import { atributoXml, contenidoXml, desescaparXml, elementosXml, hijosXml, primerElementoXml, type ElementoXml } from './xml';

/**
 * Lector XLSX de SOLO LECTURA y determinista (valores de celda como texto). Sin dependencias ni Excel/COM.
 * Cubre lo que usa un diseño de pruebas: shared strings (con rich text, sin fonética), inlineStr, números,
 * booleanos y fórmulas con valor cacheado. No evalúa fórmulas ni aplica formatos numéricos.
 */

export class HojaXlsxInexistenteError extends Error {
  constructor(readonly hoja: string, readonly disponibles: readonly string[]) {
    super(`La hoja "${hoja}" no existe en el libro. Hojas: ${disponibles.join(', ')}.`);
    this.name = 'HojaXlsxInexistenteError';
  }
}

export interface HojaXlsx {
  nombre: string;
  /** Referencia (A1) -> valor como texto, solo celdas con valor. */
  celdas: ReadonlyMap<string, string>;
}

/** Excel escapa caracteres de control como _xHHHH_ (y un "_" literal como _x005F_). */
const desescaparExcel = (s: string) => s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

/** Texto de un <si>/<is>: sus <t> directos y los de cada run <r>; nunca la fonética <rPh>. */
function textoRico(xml: string, e: ElementoXml): string {
  let texto = '';
  for (const hijo of hijosXml(xml, e.inicioContenido, e.finContenido)) {
    if (hijo.nombre === 't') texto += desescaparExcel(desescaparXml(contenidoXml(xml, hijo)));
    else if (hijo.nombre === 'r') for (const t of elementosXml(xml, 't', hijo.inicioContenido, hijo.finContenido)) texto += desescaparExcel(desescaparXml(contenidoXml(xml, t)));
  }
  return texto;
}

export function coordenadaCelda(ref: string): { columna: number; fila: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`Referencia de celda inválida: ${ref}`);
  const columna = [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  return { columna, fila: Number(m[2]) };
}

export function nombresHojasXlsx(libro: Buffer): string[] {
  const partes = new Map(leerZip(libro).map(e => [e.nombre, e.datos.toString('utf8')]));
  const wb = partes.get('xl/workbook.xml');
  if (!wb) throw new Error('El archivo no es un libro XLSX (falta xl/workbook.xml).');
  return elementosXml(wb, 'sheet').map(s => atributoXml(wb, s, 'name') ?? '');
}

export function leerHojaXlsx(libro: Buffer, nombreHoja: string): HojaXlsx {
  const partes = new Map(leerZip(libro).map(e => [e.nombre, e.datos.toString('utf8')]));
  const wb = partes.get('xl/workbook.xml');
  const rels = partes.get('xl/_rels/workbook.xml.rels');
  if (!wb || !rels) throw new Error('El archivo no es un libro XLSX (falta xl/workbook.xml o sus relaciones).');
  const hojas = elementosXml(wb, 'sheet');
  const hoja = hojas.find(s => atributoXml(wb, s, 'name') === nombreHoja);
  if (!hoja) throw new HojaXlsxInexistenteError(nombreHoja, hojas.map(s => atributoXml(wb, s, 'name') ?? ''));
  const rid = atributoXml(wb, hoja, 'r:id');
  const rel = elementosXml(rels, 'Relationship').find(r => atributoXml(rels, r, 'Id') === rid);
  const destino = rel && atributoXml(rels, rel, 'Target');
  if (!destino) throw new Error(`La hoja "${nombreHoja}" no tiene relación con su parte XML.`);
  const ruta = destino.startsWith('/') ? destino.slice(1) : posix.normalize(posix.join('xl', destino));
  const sheet = partes.get(ruta);
  if (!sheet) throw new Error(`Falta la parte ${ruta} de la hoja "${nombreHoja}".`);

  const ss = partes.get('xl/sharedStrings.xml');
  const compartidos = ss ? elementosXml(ss, 'si').map(si => textoRico(ss, si)) : [];
  const celdas = new Map<string, string>();
  const datos = primerElementoXml(sheet, 'sheetData');
  if (datos) {
    for (const c of elementosXml(sheet, 'c', datos.inicioContenido, datos.finContenido)) {
      const ref = atributoXml(sheet, c, 'r');
      if (!ref) throw new Error(`Celda sin referencia en la hoja "${nombreHoja}".`);
      const tipo = atributoXml(sheet, c, 't');
      const hijos = hijosXml(sheet, c.inicioContenido, c.finContenido);
      const v = hijos.find(h => h.nombre === 'v');
      const is = hijos.find(h => h.nombre === 'is');
      let valor: string | undefined;
      if (tipo === 'inlineStr') valor = is ? textoRico(sheet, is) : undefined;
      else if (v) {
        const crudo = desescaparXml(contenidoXml(sheet, v));
        if (tipo === 's') {
          valor = compartidos[Number(crudo)];
          if (valor === undefined) throw new Error(`Celda ${ref}: índice de shared string inexistente.`);
        } else valor = tipo === 'str' ? desescaparExcel(crudo) : crudo;
      }
      if (valor !== undefined && valor !== '') celdas.set(ref, valor);
    }
  }
  return { nombre: nombreHoja, celdas };
}
