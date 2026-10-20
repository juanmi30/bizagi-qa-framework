import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { leerZip } from '../../../../shared/utils/zip';
import { consolidarCaso, renderizarSoporteHu, textoObservado, type ConfigSoporteHu } from '../../sde/certificacion';

/** Soporte de certificación por HU (un Word con varios CP) desde resultados guardados. Datos sintéticos; sin QA. */
const RAIZ = resolve(__dirname, '..', '..', '..', '..');
const matriz = { titulo: 'SDE - CEL - HU99 - Caso sintético', pasos: [1, 2, 3, 4].map((n) => ({ n, accion: `Acción ${n}`, esperado: `Esperado ${n}` })) };
const reporte = (unico: string, matrizEst: [number, string, number[]][], pasos: [number, string, string][]) => ({
  unico, pasos: pasos.map(([indice, estado, detalle]) => ({ indice, estado, detalle })), matriz: matrizEst.map(([n, estado, cubierto_por]) => ({ n, estado, cubierto_por })),
});

test.describe('Soporte de certificación por HU @unit', () => {
  test('consolidación: la corrida base, las continuaciones solo donde ejecutaron y los transcritos con su fuente', ({}, info) => {
    const dir = info.outputPath('p');
    mkdirSync(resolve(dir, 'ev'), { recursive: true });
    writeFileSync(resolve(dir, 'ev/base.json'), JSON.stringify(reporte('u1', [[1, 'NOT_AUTOMATED', []], [2, 'PASS', [1]], [3, 'BLOCKED', [2]], [4, 'BLOCKED', [3]]],
      [[1, 'PASS', 'base 2 «env:SDE_SUCURSAL»'], [2, 'BLOCKED', 'barrera'], [3, 'BLOCKED', 'barrera']])));
    writeFileSync(resolve(dir, 'ev/CONTINUACION_x.json'), JSON.stringify(reporte('u2', [[1, 'NOT_AUTOMATED', []], [2, 'NOT_AUTOMATED', []], [3, 'PASS', [1]], [4, 'NOT_AUTOMATED', []]],
      [[1, 'PASS', 'continuación 3']])));
    const c = consolidarCaso(RAIZ, dir, { cp: 'HU99-CP01', numeroCaso: '1', configuracion: 'c', fuentes: ['ev/base.json', 'ev/CONTINUACION_x.json'],
      transcritos: { fuente: 'consola', pasos: { 4: { estado: 'FAIL', resultado: 'transcrito 4' } } } }, matriz);
    expect(c.pasos.map((p) => [p.n, p.estado])).toEqual([[1, 'NOT_AUTOMATED'], [2, 'PASS'], [3, 'PASS'], [4, 'FAIL']]);
    expect(c.pasos[1].obtenido).toBe('base 2 [Sucursal de QA]');      // sin valores del .env
    expect(c.pasos[2].fuente).toBe('ev/CONTINUACION_x.json');
    expect(c.pasos[3].fuente).toMatch(/^transcripción de consola/);
    expect(c.pasos.every((p) => p.capturas.length === 0)).toBe(true);  // sin capturas: quedan pendientes, no se inventan
    expect(c.resumen).toEqual({ NOT_AUTOMATED: 1, PASS: 2, FAIL: 1 });
  });

  test('un solo Word con todos los CP sobre la plantilla corporativa, sin aprobaciones inventadas', () => {
    const cfg = { hu: 'HU99', salida: 'x.docx', template: '', logoCliente: null, cliente: 'Cliente', proyecto: 'Proyecto', nombrePruebas: 'N', iteracion: 'I',
      fechaInicio: 'A', fechaFinalizacion: 'B', seccion: 'Sección', encabezado: 'ENC', casos: [] } as ConfigSoporteHu;
    const caso = (cp: string) => ({ cp, titulo: `Título ${cp}`, numeroCaso: '9', configuracion: 'conf', observaciones: ['obs'], resumen: { PASS: 1 },
      pasos: [{ n: 1, accion: 'a', esperado: 'e', estado: 'PASS', obtenido: 'o', fuente: 'f', capturas: [] }] });
    const template = readFileSync(resolve(RAIZ, 'projects/colsubsidio/templates/soporte-certificacion-cliente-referencia.docx'));
    const docx = renderizarSoporteHu(cfg, [caso('HU99-CP01'), caso('HU99-CP02')], { template });
    const partes = new Map(leerZip(docx).map((e) => [e.nombre, e.datos.toString('utf8')]));
    const doc = partes.get('word/document.xml')!;
    for (const t of ['CP01 - Título HU99-CP01', 'CP02 - Título HU99-CP02', 'Número del caso: 9', 'Captura: PENDIENTE', 'Aprobación funcional QA']) expect(doc).toContain(t);
    expect(doc).not.toContain('[Nombre del caso de prueba]');          // placeholders de la plantilla reemplazados
    expect((doc.match(/<w:pageBreakBefore\/>/g) ?? []).length).toBe(1); // cada CP desde el segundo empieza en página nueva
    expect(partes.get('word/header1.xml')).toContain('ENC');
    expect(partes.get('word/footer1.xml')).toContain('Gattaca');          // pie de la plantilla intacto
    expect(textoObservado('a «env:DESCONOCIDA» b')).toBe('a [dato de QA] b');
  });
});
