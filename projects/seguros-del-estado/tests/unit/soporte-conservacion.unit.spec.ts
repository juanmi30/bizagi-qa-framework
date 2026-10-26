import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { deflateSync } from 'node:zlib';
import { leerZip } from '../../../../shared/utils/zip';
import { generarSoporteHu, RUTA_CAPTURAS, RUTA_SOPORTES, RUTAS_LIMPIADAS_POR_PLAYWRIGHT } from '../../sde/certificacion';
import { DIR_SALIDA, guardarCaptura } from '../../sde/registro';

/**
 * Conservación de evidencias y soportes (cierre de la demo HU06, 21/10). Sin Bizagi. La imagen usada aquí es una
 * IMAGEN DE PRUEBA SINTÉTICA (2×2 px) que vive solo en el directorio temporal de la prueba: nunca en un soporte oficial.
 */
const RAIZ = resolve(__dirname, '..', '..', '..', '..');
const dentro = (hijo: string, padre: string) => { const r = relative(padre, hijo); return r === '' || (!r.startsWith('..') && !r.includes(':')); };
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

/** PNG sintético válido de 2×2 (para probar la inserción). */
function pngSintetico(): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (tipo: string, datos: Buffer) => { const t = Buffer.concat([Buffer.from(tipo), datos]); const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([l, t, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const filas = Buffer.from([0, 255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 0, 255]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(filas)), chunk('IEND', Buffer.alloc(0))]);
}

test.describe('Conservación de capturas y soportes @unit', () => {
  test('soportes y capturas quedan fuera de lo que limpia Playwright (outputDir y reporte HTML)', () => {
    const config = readFileSync(resolve(RAIZ, 'playwright.config.ts'), 'utf8');
    expect(config).toContain("outputDir: resolve(__dirname, 'test-results', project, 'artifacts')");
    expect(config).toContain('outputFolder: `test-results/${project}/html-report`');
    for (const limpiada of RUTAS_LIMPIADAS_POR_PLAYWRIGHT) {
      for (const persistente of [RUTA_SOPORTES, RUTA_CAPTURAS]) expect(dentro(resolve(RAIZ, ...persistente), resolve(RAIZ, ...limpiada))).toBe(false);
    }
    expect(resolve(DIR_SALIDA, 'capturas')).toBe(resolve(RAIZ, ...RUTA_CAPTURAS)); // guardarCaptura escribe en la ruta persistente
  });

  test('cada corrida archiva sus capturas en su propia carpeta: nada se sobrescribe', () => {
    const cp = 'UNIT-PRUEBA-SINTETICA';
    const [a, b] = [guardarCaptura(cp, 'corridaA', 'paso01', pngSintetico()), guardarCaptura(cp, 'corridaB', 'paso01', pngSintetico())];
    try {
      expect(a).not.toBe(b);
      expect(existsSync(a) && existsSync(b)).toBe(true);
      expect(a.split(sep)).toContain(`${cp}_corridaA`);
    } finally { // solo se borra lo que creó esta prueba
      for (const d of [`${cp}_corridaA`, `${cp}_corridaB`]) rmSync(resolve(DIR_SALIDA, 'capturas', d), { recursive: true, force: true });
    }
  });

  test('generar dos veces: dos carpetas nuevas con UN docx cada una, fuentes intactas y captura disponible insertada', ({}, info) => {
    const raiz = info.outputPath('repo');
    const proyecto = resolve(raiz, 'projects', 'p');
    for (const d of ['certificacion', 'fuentes', 'ev']) mkdirSync(resolve(proyecto, d), { recursive: true });
    mkdirSync(resolve(raiz, 'tpl'), { recursive: true });
    copyFileSync(resolve(RAIZ, 'projects/colsubsidio/templates/soporte-certificacion-cliente-referencia.docx'), resolve(raiz, 'tpl/plantilla.docx'));
    writeFileSync(resolve(proyecto, 'fuentes/matriz.json'), JSON.stringify({ casos: [{ id: 'HU99-CP01', titulo: 'Caso sintético', pasos: [{ n: 1, accion: 'a', esperado: 'e' }, { n: 2, accion: 'b', esperado: 'f' }] }] }));
    writeFileSync(resolve(proyecto, 'ev/rep.json'), JSON.stringify({ unico: 'u1', pasos: [{ indice: 1, estado: 'PASS', detalle: 'ok', evidencia: 'HU99-CP01_p01' }],
      matriz: [{ n: 1, estado: 'NOT_AUTOMATED', cubierto_por: [] }, { n: 2, estado: 'PASS', cubierto_por: [1] }] }));
    writeFileSync(resolve(proyecto, 'certificacion/HU99.json'), JSON.stringify({ hu: 'HU99', salida: 'HU99.docx', template: 'tpl/plantilla.docx', logoCliente: null,
      cliente: 'C', proyecto: 'P', nombrePruebas: 'N', iteracion: 'I', fechaInicio: 'A', fechaFinalizacion: 'B', seccion: 'S', encabezado: 'E',
      casos: [{ cp: 'HU99-CP01', numeroCaso: '1', configuracion: 'c', fuentes: ['ev/rep.json'] }] }));
    const capturas = resolve(raiz, ...RUTA_CAPTURAS, 'HU99-CP01_u1');
    mkdirSync(capturas, { recursive: true });
    writeFileSync(resolve(capturas, 'HU99-CP01_p01.png'), pngSintetico()); // IMAGEN DE PRUEBA SINTÉTICA
    const fuentes = [resolve(proyecto, 'ev/rep.json'), resolve(capturas, 'HU99-CP01_p01.png'), resolve(raiz, 'tpl/plantilla.docx')];
    const antes = fuentes.map(sha);
    const ahora = new Date('2026-10-21T08:00:00Z');
    const r1 = generarSoporteHu({ raiz, dirProyecto: proyecto, hu: 'HU99', ahora });
    const r2 = generarSoporteHu({ raiz, dirProyecto: proyecto, hu: 'HU99', ahora });
    expect(r1.docx).not.toBe(r2.docx);
    for (const r of [r1, r2]) {
      expect(readdirSync(resolve(r.docx, '..')).filter((f) => f.endsWith('.docx'))).toEqual(['HU99.docx']);
      expect(dentro(r.docx, resolve(raiz, ...RUTA_SOPORTES))).toBe(true);
    }
    expect(fuentes.map(sha)).toEqual(antes);                                   // la generación no toca las fuentes
    expect(existsSync(r1.docx)).toBe(true);                                    // la segunda generación no borró la primera
    const partes = leerZip(readFileSync(r1.docx)).map((e) => e.nombre);
    expect(partes).toContain('word/media/sde-evidencia-001.png');              // la captura disponible se insertó
    expect(r1.casos[0].pasos[1].capturas).toHaveLength(1);
    expect(r1.casos[0].pasos[0].capturas).toHaveLength(0);                     // sin captura: queda PENDIENTE, no se inventa
  });
});
