import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { leerZip } from '../../../../shared/utils/zip';
import { generarSoporteHu } from '../../sde/certificacion';
import * as ejecuciones from '../../sde/ejecuciones';
import { registrarFin, registrarInicio, registrarInterrupcion, RUTA_EJECUCIONES, seleccionarUltimas, simularLimpieza } from '../../sde/ejecuciones';
import type { ReporteCp } from '../../sde/modelo';

/**
 * Flujo HU completa → conservación → selección de la última ejecución por CP → UN Word por HU (complemento del 21/10).
 * Sin Bizagi: repositorio temporal sintético por prueba (HU99). Las imágenes son IMÁGENES DE PRUEBA SINTÉTICAS (2×2 px)
 * que solo existen en el directorio temporal de la prueba.
 */
const RAIZ = resolve(__dirname, '..', '..', '..', '..');
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

function pngSintetico(rojo: number): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (tipo: string, datos: Buffer) => { const t = Buffer.concat([Buffer.from(tipo), datos]); const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([l, t, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const filas = Buffer.from([0, rojo, 0, 0, rojo, 0, 0, 0, rojo, 0, 0, rojo, 0, 0]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(filas)), chunk('IEND', Buffer.alloc(0))]);
}

const CPS = ['HU99-CP01', 'HU99-CP02', 'HU99-CP03'];
/** Repo temporal: plantilla corporativa, matriz de 3 CP (2 pasos) y certificación DECLARADA con reportes del 20/10. */
function repo(dir: string) {
  const raiz = resolve(dir, 'repo');
  const proyecto = resolve(raiz, 'projects', 'p');
  for (const d of ['certificacion', 'fuentes', 'ev']) mkdirSync(resolve(proyecto, d), { recursive: true });
  mkdirSync(resolve(raiz, 'tpl'), { recursive: true });
  copyFileSync(resolve(RAIZ, 'projects/colsubsidio/templates/soporte-certificacion-cliente-referencia.docx'), resolve(raiz, 'tpl/plantilla.docx'));
  writeFileSync(resolve(proyecto, 'fuentes/matriz.json'), JSON.stringify({ casos: CPS.map((id) => ({ id, titulo: `Caso ${id}`, pasos: [{ n: 1, accion: 'a', esperado: 'e' }, { n: 2, accion: 'b', esperado: 'f' }] })) }));
  CPS.forEach((cp, i) => writeFileSync(resolve(proyecto, `ev/${cp}.json`), JSON.stringify({ cp, unico: `decl${i}`, inicio: '2026-10-20T11:00:00.000Z', fin: '2026-10-20T12:00:00.000Z', numero_caso: `70${i}`,
    pasos: [{ indice: 1, estado: 'PASS', detalle: 'declarado' }], matriz: [{ n: 1, estado: 'PASS', cubierto_por: [1] }, { n: 2, estado: 'PASS', cubierto_por: [1] }] })));
  writeFileSync(resolve(proyecto, 'certificacion/HU99.json'), JSON.stringify({ hu: 'HU99', salida: 'HU99.docx', template: 'tpl/plantilla.docx', logoCliente: null,
    cliente: 'C', proyecto: 'P', nombrePruebas: 'N', iteracion: 'I', fechaInicio: 'A', fechaFinalizacion: 'B', seccion: 'S', encabezado: 'E',
    casos: CPS.map((cp, i) => ({ cp, numeroCaso: `70${i}`, configuracion: 'conf', fuentes: [`ev/${cp}.json`], observaciones: [`observación del caso declarado 70${i}`] })) }));
  return { raiz, proyecto };
}

/** Simula una corrida de un CP tal como la registra verticales.ts: inicio → reporte original → fin (o interrupción). */
function corrida(raiz: string, o: { cp: string; unico: string; inicio: string; caso: string | null; corrida: string; estados?: [string, string];
  fin?: 'finalizada' | 'interrumpida' | 'en-curso'; bloqueos?: string[]; captura?: Buffer; continuacionDe?: string }) {
  const pre = o.continuacionDe ? 'CONTINUACION_' : '';
  registrarInicio({ raiz, cp: o.cp, unico: o.unico, corrida: o.corrida, inicio: new Date(o.inicio), ...(o.continuacionDe ? { continuacionDe: o.continuacionDe } : {}) });
  if (o.captura) {
    const d = resolve(raiz, 'test-results/seguros-del-estado/sde/capturas', `${pre}${o.cp}_${o.unico}`);
    mkdirSync(d, { recursive: true });
    writeFileSync(resolve(d, `${o.cp}_p01.png`), o.captura);
  }
  if (o.fin === 'en-curso') return;
  if (o.fin === 'interrumpida') return registrarInterrupcion({ raiz, cp: o.cp, unico: o.unico, numeroCaso: o.caso, motivo: 'excepción sintética' });
  const [e1, e2] = o.estados ?? ['PASS', 'PASS'];
  const reporte = { cp: o.cp, escenario: 'x', inicio: o.inicio, fin: o.inicio, unico: o.unico, estado: e2 === 'FAIL' ? 'FAIL' : 'REAL_PASS', motivo: 'm', numero_caso: o.caso,
    actividades_observadas: [], bloqueos: o.bloqueos ?? [], cleanup: { politica: 'x', razon: 'y' },
    pasos: [{ indice: 1, hacer: 'h', matriz: [1], estado: e1, detalle: `paso 1 caso ${o.caso}`, ...(o.captura ? { evidencia: `${o.cp}_p01` } : {}) }, { indice: 2, hacer: 'h', matriz: [2], estado: e2, detalle: `paso 2 caso ${o.caso}` }],
    matriz: [{ n: 1, accion: 'a', esperado: 'e', estado: e1, cubierto_por: [1] }, { n: 2, accion: 'b', esperado: 'f', estado: e2, cubierto_por: [2] }] } as unknown as ReporteCp;
  // Una continuación solo ejecuta el paso 2 de la matriz (el 1 no lo cubre): así lo reporta continuacion.real.spec.ts.
  if (o.continuacionDe) { reporte.pasos = [{ ...reporte.pasos[0], matriz: [2], estado: e2 as ReporteCp['pasos'][0]['estado'], detalle: `continuación paso 2 caso ${o.caso}` }]; reporte.matriz[0].cubierto_por = []; reporte.matriz[1].cubierto_por = [1]; }
  const ruta = resolve(raiz, 'test-results/seguros-del-estado/sde', `${pre}${o.cp}_${o.unico}.json`);
  writeFileSync(ruta, JSON.stringify(reporte));
  registrarFin({ raiz, reporte, rutaReporte: ruta });
}

const huellas = (dir: string): Record<string, string> => {
  const r: Record<string, string> = {};
  const visitar = (d: string) => { for (const h of readdirSync(d)) { const p = resolve(d, h); if (statSync(p).isDirectory()) visitar(p); else r[p] = sha(p); } };
  visitar(dir);
  return r;
};
const docxDe = (r: { docx: string }) => new Map(leerZip(readFileSync(r.docx)).map((e) => [e.nombre, e.datos]));
const seccion = (casos: { cp: string }[], cp: string) => JSON.stringify(casos.find((c) => c.cp === cp));

test.describe('Ejecución por HU, conservación y selección de la última ejecución por CP @unit', () => {
  test('(1) la suite HU06 reconoce exactamente sus 5 CP, en orden, sin variantes y en un worker; el runner asigna un identificador de corrida', ({}, info) => {
    const listar = (...args: string[]) => spawnSync(process.execPath, ['tools/run.mjs', 'seguros-del-estado', ...args, '--list'], { cwd: RAIZ, encoding: 'utf8', timeout: 120_000 }).stdout;
    const suite = listar('--grep', '@hu06', '--grep-invert', '@variante');
    expect([...suite.matchAll(/\[SDE\] (HU06-CP\d\d) /g)].map((m) => m[1])).toEqual(['HU06-CP05', 'HU06-CP01', 'HU06-CP02', 'HU06-CP03', 'HU06-CP04']);
    expect(suite).toContain('Total: 5 tests');
    expect(suite).not.toContain('@variante');
    expect(listar('--grep', '@hu06')).toContain('@variante'); // sin --grep-invert entraría la variante (crearía un 6.º caso)
    expect(JSON.parse(readFileSync(resolve(RAIZ, 'projects/seguros-del-estado/playwright.project.json'), 'utf8')).workers).toBe(1);
    const corridaRunner = (env: Record<string, string>) => {
      const salida = info.outputPath(`corrida-${Object.keys(env).length}.txt`);
      spawnSync(process.execPath, ['tools/run.mjs', 'seguros-del-estado', '--grep', '@x'], { cwd: RAIZ, encoding: 'utf8', timeout: 60_000,
        env: { ...process.env, BIZAGI_CORRIDA: '', BIZAGI_RUNNER_CLI: resolve(RAIZ, 'projects/seguros-del-estado/tests/fixtures/runner/receptor.cjs'),
          RECEPTOR_SALIDA: info.outputPath('args.json'), RECEPTOR_CORRIDA_SALIDA: salida, ...env } });
      return readFileSync(salida, 'utf8');
    };
    expect(corridaRunner({})).toMatch(/^corrida-\d{4}-\d{2}-\d{2}T/);
    expect(corridaRunner({ BIZAGI_CORRIDA: 'corrida-fijada' })).toBe('corrida-fijada');
  });

  test('(2)(3) cada ejecución conserva su propio registro y una nueva nunca sobrescribe otra', ({}, info) => {
    const { raiz } = repo(info.outputPath());
    corrida(raiz, { cp: 'HU99-CP01', unico: 'u1', inicio: '2026-10-21T10:00:00.000Z', caso: '900', corrida: 'corrida-A' });
    const dir = resolve(raiz, ...RUTA_EJECUCIONES);
    const antes = sha(resolve(dir, 'HU99-CP01_u1.json'));
    corrida(raiz, { cp: 'HU99-CP01', unico: 'u2', inicio: '2026-10-22T10:00:00.000Z', caso: '901', corrida: 'corrida-B' });
    expect(readdirSync(dir).sort()).toEqual(['HU99-CP01_u1.json', 'HU99-CP01_u2.json']);
    expect(sha(resolve(dir, 'HU99-CP01_u1.json'))).toBe(antes);
    expect(() => registrarInicio({ raiz, cp: 'HU99-CP01', unico: 'u1', corrida: 'otra' })).toThrow(/EEXIST/);
    expect(sha(resolve(dir, 'HU99-CP01_u1.json'))).toBe(antes);
    const e = JSON.parse(readFileSync(resolve(dir, 'HU99-CP01_u2.json'), 'utf8'));
    expect(e).toMatchObject({ hu: 'HU99', cp: 'HU99-CP01', unico: 'u2', corrida_suite: 'corrida-B', estado_ejecucion: 'FINALIZADA', numero_caso: '901',
      resumen_pasos: { PASS: 2 }, reporte: 'test-results/seguros-del-estado/sde/HU99-CP01_u2.json', capturas: 'test-results/seguros-del-estado/sde/capturas/HU99-CP01_u2' });
  });

  test('(4)–(8)(10)(11) última ejecución por CP; repetir solo CP02 cambia solo su sección; FAIL sigue FAIL; lo incompleto no reemplaza; capturas del caso correcto; corrida histórica', ({}, info) => {
    const { raiz, proyecto } = repo(info.outputPath());
    const gen = (ahora: string, corridaSuite?: string) => generarSoporteHu({ raiz, dirProyecto: proyecto, hu: 'HU99', ahora: new Date(ahora), ...(corridaSuite ? { corrida: corridaSuite } : {}) });
    const g0 = gen('2026-10-21T00:00:00Z');
    expect(g0.seleccion.map((s) => [s.origen, s.numeroCaso])).toEqual([['declarada', '700'], ['declarada', '701'], ['declarada', '702']]);

    // Suite completa (corrida-A); CP03 con FAIL; CP02 con captura X. Una ejecución ANTERIOR a la declarada no la reemplaza.
    corrida(raiz, { cp: 'HU99-CP01', unico: 'a1', inicio: '2026-10-21T10:00:00.000Z', caso: '900', corrida: 'corrida-A' });
    corrida(raiz, { cp: 'HU99-CP02', unico: 'a2', inicio: '2026-10-21T10:10:00.000Z', caso: '901', corrida: 'corrida-A', captura: pngSintetico(255) });
    corrida(raiz, { cp: 'HU99-CP03', unico: 'a3', inicio: '2026-10-21T10:20:00.000Z', caso: '902', corrida: 'corrida-A', estados: ['PASS', 'FAIL'] });
    corrida(raiz, { cp: 'HU99-CP03', unico: 'viejo', inicio: '2026-10-19T10:00:00.000Z', caso: '600', corrida: 'corrida-0' });
    const g1 = gen('2026-10-21T11:00:00Z');
    expect(g1.seleccion.map((s) => [s.origen, s.numeroCaso, s.corrida])).toEqual([['archivada', '900', 'corrida-A'], ['archivada', '901', 'corrida-A'], ['archivada', '902', 'corrida-A']]);
    expect(g1.casos[2].pasos.map((p) => p.estado)).toEqual(['PASS', 'FAIL']);                 // (6) FAIL sigue FAIL
    expect(g1.casos[0].observaciones).toEqual([]);                                             // las del caso declarado 700 no se trasladan

    // Solo se repite CP02 (corrida-B), con otra captura Y.
    corrida(raiz, { cp: 'HU99-CP02', unico: 'b2', inicio: '2026-10-22T09:00:00.000Z', caso: '903', corrida: 'corrida-B', captura: pngSintetico(128) });
    const g2 = gen('2026-10-22T10:00:00Z');
    expect(g2.seleccion.map((s) => s.numeroCaso)).toEqual(['900', '903', '902']);
    for (const cp of ['HU99-CP01', 'HU99-CP03']) expect(seccion(g2.casos, cp)).toBe(seccion(g1.casos, cp)); // (5) solo cambia CP02
    expect(seccion(g2.casos, 'HU99-CP02')).not.toBe(seccion(g1.casos, 'HU99-CP02'));
    // (8) la captura insertada es la de la ejecución elegida (caso 903), y solo la de su paso
    expect(docxDe(g1).get('word/media/sde-evidencia-001.png')!.equals(pngSintetico(255))).toBe(true);
    expect(docxDe(g2).get('word/media/sde-evidencia-001.png')!.equals(pngSintetico(128))).toBe(true);
    expect([...docxDe(g2).keys()].filter((k) => k.startsWith('word/media/sde-evidencia'))).toHaveLength(1);
    expect(g2.casos[1].pasos[0].capturas[0]).toContain('HU99-CP02_b2');
    const xml = docxDe(g2).get('word/document.xml')!.toString('utf8');
    expect(xml).toContain('Caso Bizagi 903');
    expect(xml).toContain('corrida de suite corrida-B');
    expect(xml).toContain('Número del caso: 903');

    // (7) Más recientes pero incompletas: CP01 interrumpida (con caso), CP02 en curso, CP03 bloqueada antes de ejecutar.
    corrida(raiz, { cp: 'HU99-CP01', unico: 'c1', inicio: '2026-10-23T09:00:00.000Z', caso: '905', corrida: 'corrida-C', fin: 'interrumpida' });
    corrida(raiz, { cp: 'HU99-CP02', unico: 'c2', inicio: '2026-10-23T09:10:00.000Z', caso: null, corrida: 'corrida-C', fin: 'en-curso' });
    corrida(raiz, { cp: 'HU99-CP03', unico: 'c3', inicio: '2026-10-23T09:20:00.000Z', caso: null, corrida: 'corrida-C', bloqueos: ['ENVIRONMENT: SDE_E2E=1 no definida'] });
    const g3 = gen('2026-10-23T10:00:00Z');
    expect(g3.seleccion.map((s) => s.numeroCaso)).toEqual(['900', '903', '902']);
    expect(g3.seleccion[0].advertencias.join()).toMatch(/c1.*caso 905.*interrumpida/);
    expect(g3.seleccion[1].advertencias.join()).toMatch(/c2.*sin finalizar/);
    expect(g3.seleccion[2].advertencias.join()).toMatch(/c3.*BLOCKED antes de ejecutar/);
    expect(docxDe(g3).get('word/document.xml')!.toString('utf8')).toContain('Advertencia de selección');

    // Certificación histórica: solo la corrida pedida; si le falta un CP se advierte y su sección queda sin resultados.
    const gA = gen('2026-10-23T11:00:00Z', 'corrida-A');
    expect(gA.seleccion.map((s) => s.numeroCaso)).toEqual(['900', '901', '902']);
    const gB = gen('2026-10-23T12:00:00Z', 'corrida-B');
    expect(gB.seleccion.map((s) => s.origen)).toEqual(['sin-ejecucion', 'archivada', 'sin-ejecucion']);
    expect(gB.seleccion[0].advertencias.join()).toContain('corrida-B no tiene una ejecución seleccionable de HU99-CP01');
    expect(gB.casos[0].pasos.every((p) => p.estado === 'NOT_RUN')).toBe(true);          // no se inventan estados

    // (10)(11) Cada generación: carpeta nueva con UN solo DOCX (no uno por CP); las anteriores siguen ahí.
    const generaciones = [g0, g1, g2, g3, gA, gB];
    expect(new Set(generaciones.map((g) => resolve(g.docx, '..'))).size).toBe(6);
    for (const g of generaciones) {
      expect(existsSync(g.docx)).toBe(true);
      expect(readdirSync(resolve(g.docx, '..')).filter((f) => f.endsWith('.docx'))).toEqual(['HU99.docx']);
      expect(g.casos.map((c) => c.cp)).toEqual(CPS);
    }
  });

  test('continuaciones del MISMO caso: se suman a la ejecución base sin sustituirla ni duplicar pasos; capturas de la continuación; las de otro caso o incompletas no entran', ({}, info) => {
    const { raiz, proyecto } = repo(info.outputPath());
    corrida(raiz, { cp: 'HU99-CP01', unico: 'base', inicio: '2026-10-21T10:00:00.000Z', caso: '900', corrida: 'corrida-A', estados: ['PASS', 'BLOCKED'], captura: pngSintetico(200) });
    const registroBase = resolve(raiz, ...RUTA_EJECUCIONES, 'HU99-CP01_base.json');
    const antes = sha(registroBase);
    corrida(raiz, { cp: 'HU99-CP01', unico: 'cont-900-a', inicio: '2026-10-21T11:00:00.000Z', caso: '900', corrida: 'corrida-A', continuacionDe: '900', estados: ['PASS', 'FAIL'], captura: pngSintetico(50) });
    corrida(raiz, { cp: 'HU99-CP01', unico: 'cont-777', inicio: '2026-10-21T11:30:00.000Z', caso: '777', corrida: 'corrida-A', continuacionDe: '777' }); // otro caso
    corrida(raiz, { cp: 'HU99-CP01', unico: 'cont-900-b', inicio: '2026-10-21T12:00:00.000Z', caso: '900', corrida: 'corrida-A', continuacionDe: '900', fin: 'interrumpida' });
    const sel = seleccionarUltimas({ raiz, cps: ['HU99-CP01'] })[0];
    expect(sel.elegida?.unico).toBe('base');                                                  // una continuación nunca es la ejecución elegida
    expect(sel.continuaciones.map((c) => c.unico)).toEqual(['cont-900-a']);
    expect(sel.advertencias.join()).toMatch(/cont-900-b.*NO incorporada.*interrumpida/);
    const g = generarSoporteHu({ raiz, dirProyecto: proyecto, hu: 'HU99', ahora: new Date('2026-10-21T13:00:00Z') });
    const c = g.casos[0];
    expect(c.pasos.map((p) => [p.n, p.estado])).toEqual([[1, 'PASS'], [2, 'FAIL']]);              // P1 de la base, P2 de la continuación (FAIL se conserva)
    expect(c.pasos[0].fuente).toBe('test-results/seguros-del-estado/sde/HU99-CP01_base.json');
    expect(c.pasos[1].fuente).toBe('test-results/seguros-del-estado/sde/CONTINUACION_HU99-CP01_cont-900-a.json');
    expect(c.pasos[1].obtenido).toBe('continuación paso 2 caso 900');
    expect(c.pasos[1].capturas[0]).toContain('CONTINUACION_HU99-CP01_cont-900-a');
    expect(g.seleccion[0]).toMatchObject({ numeroCaso: '900', unico: 'base', continuaciones: ['cont-900-a'] });
    const xml = docxDe(g).get('word/document.xml')!.toString('utf8');
    expect(xml).toContain('continuaciones del mismo caso');
    expect((xml.match(/>Paso 2</g) ?? []).length).toBe(CPS.length);                           // sin pasos duplicados: uno por CP
    expect(sha(registroBase)).toBe(antes);                                                     // el resultado original se conserva
  });

  test('(9)(12) listado y simulación de limpieza: protege lo necesario, calcula el espacio y no borra ni modifica nada', ({}, info) => {
    const { raiz, proyecto } = repo(info.outputPath());
    corrida(raiz, { cp: 'HU99-CP01', unico: 'viejo', inicio: '2026-08-01T10:00:00.000Z', caso: '500', corrida: 'corrida-0', captura: pngSintetico(10) });
    corrida(raiz, { cp: 'HU99-CP01', unico: 'usado', inicio: '2026-08-02T10:00:00.000Z', caso: '501', corrida: 'corrida-1' });
    corrida(raiz, { cp: 'HU99-CP01', unico: 'defecto', inicio: '2026-08-03T10:00:00.000Z', caso: '502', corrida: 'corrida-2', estados: ['PASS', 'FAIL'] });
    corrida(raiz, { cp: 'HU99-CP01', unico: 'ultima', inicio: '2026-10-21T10:00:00.000Z', caso: '503', corrida: 'corrida-3' });
    corrida(raiz, { cp: 'HU99-CP02', unico: 'curso', inicio: '2026-08-04T10:00:00.000Z', caso: null, corrida: 'corrida-3', fin: 'en-curso' });
    generarSoporteHu({ raiz, dirProyecto: proyecto, hu: 'HU99', ahora: new Date('2026-10-21T11:00:00Z'), corrida: 'corrida-1' }); // un soporte usa «usado»
    const antes = huellas(raiz);
    const { filas, recuperable } = simularLimpieza({ raiz, hoy: new Date('2026-10-25T00:00:00Z'), retencionDias: 30 });
    const fila = (u: string) => filas.find((f) => f.unico === u)!;
    expect(fila('viejo').candidata).toBe(true);
    expect(fila('usado').protecciones).toContain('usada por un soporte o certificación');
    expect(fila('defecto').protecciones).toContain('contiene FAIL (evidencia de defecto)');
    expect(fila('ultima').protecciones).toEqual(expect.arrayContaining(['última seleccionable del CP', 'dentro de la retención (30 días)']));
    expect(fila('curso').protecciones).toContain('en curso o sin cerrar');
    expect(recuperable).toBe(fila('viejo').bytes);
    expect(fila('viejo').bytes).toBeGreaterThan(pngSintetico(10).length);                    // incluye reporte, registro y capturas
    expect(huellas(raiz)).toEqual(antes);                                                      // nada borrado ni modificado
    expect(Object.keys(ejecuciones).filter((k) => /^(borrar|eliminar|limpiar|purgar)/i.test(k))).toEqual([]); // no existe borrado
    expect(seleccionarUltimas({ raiz, cps: ['HU99-CP01'] })[0].elegida?.unico).toBe('ultima');
  });
});
