import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { leerZip } from '../../../../shared/utils/zip';
import { generarSoporteHu, type CasoSoporte } from '../../sde/certificacion';
import { registrarFin, registrarInicio } from '../../sde/ejecuciones';
import type { ReporteCp } from '../../sde/modelo';

/**
 * Regresión del soporte Word HU06 con los REPORTES REALES versionados (sanitizados) de las corridas del 20/10 (708–713,
 * con continuaciones) y del 21/10 (773/776/780/782/783). Sin Bizagi. Las capturas son IMÁGENES DE PRUEBA SINTÉTICAS (2×2)
 * colocadas donde la ejecución guardaría las reales, solo en el directorio temporal de la prueba.
 * Compara estructura, riqueza y trazabilidad; NO exige cifras PASS/FAIL iguales entre corridas.
 */
const RAIZ = resolve(__dirname, '..', '..', '..', '..');
const DIR = resolve(RAIZ, 'projects/seguros-del-estado');
const EV20 = resolve(DIR, 'docs/evidencia/corrida-HU06-20261020T234442Z');
const EV21 = resolve(DIR, 'docs/evidencia/cierre-HU06-20261021T185643Z');
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

function png(): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const x = Buffer.concat([Buffer.from(t), d]); const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(x)); return Buffer.concat([l, x, c]); };
  const h = Buffer.alloc(13); h.writeUInt32BE(2, 0); h.writeUInt32BE(2, 4); h[8] = 8; h[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', h), chunk('IDAT', deflateSync(Buffer.alloc(14))), chunk('IEND', Buffer.alloc(0))]);
}

/** Repo temporal con la configuración, matriz y plantilla reales, y las ejecuciones reales archivadas como lo hace la corrida. */
function repo(dir: string) {
  const raiz = resolve(dir, 'repo');
  const proyecto = resolve(raiz, 'projects/seguros-del-estado');
  const sde = resolve(raiz, 'test-results/seguros-del-estado/sde');
  for (const d of ['certificacion', 'fuentes', 'docs/evidencia']) mkdirSync(resolve(proyecto, d), { recursive: true });
  mkdirSync(resolve(sde, 'ejecuciones'), { recursive: true });
  mkdirSync(resolve(raiz, 'projects/colsubsidio/templates'), { recursive: true });
  copyFileSync(resolve(RAIZ, 'projects/colsubsidio/templates/soporte-certificacion-cliente-referencia.docx'), resolve(raiz, 'projects/colsubsidio/templates/soporte-certificacion-cliente-referencia.docx'));
  copyFileSync(resolve(DIR, 'certificacion/HU06.json'), resolve(proyecto, 'certificacion/HU06.json'));
  copyFileSync(resolve(DIR, 'fuentes/matriz.json'), resolve(proyecto, 'fuentes/matriz.json'));
  // Fuentes de la certificación declarada (702–706), por si un CP no tuviera ejecución archivada.
  for (const f of readdirSync(resolve(DIR, 'docs/evidencia')).filter((x) => x.endsWith('.json'))) copyFileSync(resolve(DIR, 'docs/evidencia', f), resolve(proyecto, 'docs/evidencia', f));
  const capturas = (prefijo: string, r: ReporteCp) => {
    const d = resolve(sde, 'capturas', `${prefijo}${r.cp}_${r.unico}`);
    mkdirSync(d, { recursive: true });
    for (const p of r.pasos) if (p.evidencia) writeFileSync(resolve(d, `${p.evidencia}.png`), png());
  };
  // 20/10: reportes y registros de ejecución versionados tal cual.
  for (const f of readdirSync(EV20).filter((x) => x.endsWith('.json'))) {
    copyFileSync(resolve(EV20, f), resolve(sde, f));
    capturas(f.startsWith('CONTINUACION_') ? 'CONTINUACION_' : '', JSON.parse(readFileSync(resolve(EV20, f), 'utf8')));
  }
  for (const f of readdirSync(resolve(EV20, 'ejecuciones'))) copyFileSync(resolve(EV20, 'ejecuciones', f), resolve(sde, 'ejecuciones', f));
  // 21/10: reportes versionados; el registro se crea como lo hace verticales.ts (inicio → reporte → fin).
  for (const f of readdirSync(EV21).filter((x) => /^HU06-CP0\d_/.test(x))) {
    const r = JSON.parse(readFileSync(resolve(EV21, f), 'utf8')) as ReporteCp;
    copyFileSync(resolve(EV21, f), resolve(sde, f));
    capturas('', r);
    registrarInicio({ raiz, cp: r.cp, unico: r.unico, corrida: 'cierre-HU06-20261021T185643Z', inicio: new Date(r.inicio) });
    registrarFin({ raiz, reporte: r, rutaReporte: resolve(sde, f) });
  }
  return { raiz, proyecto };
}

const huellas = (dir: string): Record<string, string> => {
  const r: Record<string, string> = {};
  const v = (d: string) => { for (const h of readdirSync(d, { withFileTypes: true })) { const p = resolve(d, h.name); if (h.isDirectory()) v(p); else r[p] = sha(p); } };
  v(dir);
  return r;
};
const textoDocx = (f: string) => leerZip(readFileSync(f)).find((e) => e.nombre === 'word/document.xml')!.datos.toString('utf8').replace(/<[^>]+>/g, '');
const de = (casos: CasoSoporte[], cp: string) => casos.find((c) => c.cp === cp)!;

test.describe('Regresión del soporte HU06 con reportes reales versionados @unit', () => {
  test('últimas ejecuciones (21/10): estructura, 108 pasos, causas, observaciones por caso sin mezclar, NOT_AUTOMATED, capturas y aprobación pendiente', ({}, info) => {
    const { raiz, proyecto } = repo(info.outputPath());
    const fuentes = huellas(resolve(raiz, 'test-results/seguros-del-estado/sde'));
    const g = generarSoporteHu({ raiz, dirProyecto: proyecto, hu: 'HU06', ahora: new Date('2026-10-22T08:00:00Z') });
    const t = textoDocx(g.docx);
    // (1) cinco CP con sus casos nuevos; (2) 108 pasos
    expect(g.seleccion.map((s) => [s.cp, s.numeroCaso])).toEqual([['HU06-CP01', '782'], ['HU06-CP02', '776'], ['HU06-CP03', '780'], ['HU06-CP04', '783'], ['HU06-CP05', '773']]);
    expect(g.casos.reduce((n, c) => n + c.pasos.length, 0)).toBe(108);
    for (const cp of ['CP01', 'CP02', 'CP03', 'CP04', 'CP05']) expect(t).toContain(`${cp} - `);
    // (3) esperado y obtenido en cada paso
    for (const c of g.casos) for (const p of c.pasos) { expect(p.esperado.length, `${c.cp} P${p.n}`).toBeGreaterThan(0); expect(p.obtenido.length, `${c.cp} P${p.n}`).toBeGreaterThan(0); }
    expect((t.match(/Resultado esperado: /g) ?? []).length).toBe(108);
    expect((t.match(/Resultado obtenido: /g) ?? []).length).toBe(108);
    // (4) causas diferenciadas: producto por confirmar frente a excepción sin clasificar (cierre de CP04)
    expect(de(g.casos, 'HU06-CP04').pasos.find((p) => p.n === 19)!.causas).toEqual(['NO_CLASIFICADO']);
    expect(de(g.casos, 'HU06-CP03').pasos.find((p) => p.n === 23)!.causas).toEqual(['PRODUCTO_POR_CONFIRMAR']);
    expect(t).toContain('Causa: excepción sin clasificar: requiere revisión humana; no se atribuye al producto');
    expect(t).toContain('Causa: comportamiento observado distinto del esperado: posible defecto del producto, por confirmar con QA');
    // (5) observaciones por CP: automáticas del propio caso + notas registradas de ESE caso, separadas
    for (const c of g.casos) {
      expect(c.observacionesAutomaticas!.length, c.cp).toBeGreaterThan(0);
      expect(c.observacionesAutomaticas!.every((o) => o.includes(`caso ${c.numeroCaso}`)), c.cp).toBe(true);
    }
    expect((t.match(/Hallazgos de la ejecución \(generados automáticamente/g) ?? []).length).toBe(5);
    for (const n of ['782', '776', '780', '783', '773']) expect(t).toContain(`Notas registradas para el caso ${n}:`);
    // (10) sin mezclar casos: ninguna nota de 708–713 entra en el soporte de los casos nuevos (solo un aviso de antecedentes)
    expect(t).not.toContain('ERROR DE LA AUTOMATIZACIÓN');                       // nota exclusiva del caso 712
    expect(t).not.toContain('Notas registradas para el caso 712');
    expect(de(g.casos, 'HU06-CP03').antecedentes!.join()).toMatch(/otros casos de este CP \(712\); no se aplican al caso 780/);
    // CP02 776: sin incidente P-21a en este caso (y así lo dicen sus notas); CP05: P6 pendiente y P8/P9 sustentados con la gráfica
    expect(de(g.casos, 'HU06-CP02').pasos.some((p) => p.incidentes?.length)).toBe(false);
    expect(de(g.casos, 'HU06-CP05').observacionesAutomaticas!.join()).toMatch(/NOT_AUTOMATED \(caso 773\): P1, P6|NOT_AUTOMATED \(caso 773\): P6/);
    // (7) NOT_AUTOMATED no desaparece
    expect(de(g.casos, 'HU06-CP01').pasos.filter((p) => p.estado === 'NOT_AUTOMATED').map((p) => p.n)).toEqual([4, 28]);
    // (9) capturas disponibles incrustadas: una imagen por paso con captura
    const conCaptura = g.casos.reduce((n, c) => n + c.pasos.filter((p) => p.capturas.length).length, 0);
    expect(conCaptura).toBeGreaterThan(90);
    expect(leerZip(readFileSync(g.docx)).filter((e) => e.nombre.startsWith('word/media/sde-evidencia')).length).toBe(conCaptura);
    // (11) aprobación pendiente, sin firmas inventadas; espacio del analista
    expect((t.match(/Aprobación funcional QA: pendiente/g) ?? []).length).toBe(5);
    expect((t.match(/\[Espacio para observaciones del analista QA\]/g) ?? []).length).toBe(5);
    expect(t).not.toMatch(/aprobado por|firmado por/i);
    // (12) los archivos de origen quedan intactos
    expect(huellas(resolve(raiz, 'test-results/seguros-del-estado/sde'))).toEqual(fuentes);
  });

  test('corrida histórica 20/10 (708–713): P-21a documentado como incidente aparte con el paso en PASS, BLOCKED identificados, nota del 712 solo allí; cada generación es un archivo nuevo', ({}, info) => {
    const { raiz, proyecto } = repo(info.outputPath());
    const g1 = generarSoporteHu({ raiz, dirProyecto: proyecto, hu: 'HU06', corrida: 'corrida-HU06-20261020T234442Z', ahora: new Date('2026-10-22T08:00:00Z') });
    const g2 = generarSoporteHu({ raiz, dirProyecto: proyecto, hu: 'HU06', corrida: 'corrida-HU06-20261020T234442Z', ahora: new Date('2026-10-22T08:00:00Z') });
    expect(g1.seleccion.map((s) => s.numeroCaso)).toEqual(['710', '711', '712', '713', '708']);
    // (6) P-21a: incidente registrado aparte en 711, sin cambiar el estado del paso
    const conIncidente = de(g1.casos, 'HU06-CP02').pasos.filter((p) => p.incidentes?.length);
    expect(conIncidente.length).toBeGreaterThan(0);
    expect(conIncidente.every((p) => p.estado === 'PASS')).toBe(true);
    expect(conIncidente[0].incidentes!.join()).toMatch(/P-21a/);
    const t = textoDocx(g1.docx);
    expect(t).toContain('Incidente registrado aparte (no cambia el estado del paso)');
    // (8) BLOCKED identificados (CP04 713, P20–P22 tras P-21a)
    expect(de(g1.casos, 'HU06-CP04').pasos.filter((p) => p.estado === 'BLOCKED').map((p) => p.n)).toEqual(expect.arrayContaining([20, 21, 22]));
    expect(de(g1.casos, 'HU06-CP04').observacionesAutomaticas!.join()).toMatch(/No ejecutados por bloqueo \(caso 713\)/);
    // La nota del error de dato de 712 está en su soporte (y solo con el caso 712)
    expect(t).toContain('ERROR DE LA AUTOMATIZACIÓN');
    expect(de(g1.casos, 'HU06-CP03').observaciones.join()).toContain('(caso 712)');
    // Nunca se sobrescribe: dos generaciones con la misma hora → dos carpetas, cada una con UN docx
    expect(g1.docx).not.toBe(g2.docx);
    for (const g of [g1, g2]) { expect(existsSync(g.docx)).toBe(true); expect(readdirSync(resolve(g.docx, '..')).filter((f) => f.endsWith('.docx'))).toHaveLength(1); }
  });
});
