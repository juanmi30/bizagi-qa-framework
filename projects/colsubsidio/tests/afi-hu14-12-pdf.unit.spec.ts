import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { verificarRuralUrbano } from '../helpers/pdfFormulario';

/** PDF mínimo con bordes y texto independientes del lector que se prueba. */
function formulario(valorRural: string, encabezadoMunicipio = 'MUNICIPIO'): Buffer {
  const etiquetas = ['DIRECCION DE VIVIENDA', encabezadoMunicipio, 'RURAL/URBANO', 'DEPARTAMENTO', 'TELEFONO'];
  const columnas = [10, 210, 300, 390, 500, 590];
  const ordenes = [
    ...columnas.map(x => `${x} 500 m ${x} 460 l S`),
    ...[500, 480, 460].map(y => `10 ${y} m 590 ${y} l S`),
    ...etiquetas.map((s, i) => `BT /F1 8 Tf ${columnas[i] + 5} 486 Td (${s}) Tj ET`),
    `BT /F1 8 Tf 215 466 Td (BOGOTA) Tj ET`,
    `BT /F1 8 Tf 395 466 Td (BOGOTA) Tj ET`,
    ...(valorRural ? [`BT /F1 8 Tf 305 466 Td (${valorRural}) Tj ET`] : []),
  ].join('\n');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(ordenes)} >>\nstream\n${ordenes}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objetos.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objetos[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test.describe('Lector estructural del formulario — sin ambiente real', () => {
  test.describe.configure({ retries: 0 });
  test('acepta celda vacía con encabezados y bordes correctos', async ({}, info) => {
    const ruta = info.outputPath('vacio.pdf');
    await writeFile(ruta, formulario(''));
    await verificarRuralUrbano(ruta, info);
  });
  test('rechaza valor dentro de la celda Rural/Urbano', async ({}, info) => {
    const ruta = info.outputPath('ocupado.pdf');
    await writeFile(ruta, formulario('URBANO'));
    await expect(verificarRuralUrbano(ruta, info)).rejects.toThrow('LA CELDA');
  });
  test('rechaza una fila que no corresponde a la estructura certificada', async ({}, info) => {
    const ruta = info.outputPath('otra-fila.pdf');
    await writeFile(ruta, formulario('', 'OTRO CAMPO'));
    await expect(verificarRuralUrbano(ruta, info)).rejects.toThrow('Estructura de la fila');
  });
});
