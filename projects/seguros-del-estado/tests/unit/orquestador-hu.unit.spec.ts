import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HistorialCasos } from '../../../../shared/utils/HistorialCasos';

/**
 * Orquestador «npm run sde:hu06 / sde:hu06:word / sde:hu06:simular» (tools/hu.mjs). TODAS las pruebas usan un
 * repositorio temporal (SDE_ORQ_RAIZ) y un runner sintético (SDE_ORQ_RUNNER): nunca se abre Playwright ni Bizagi.
 * Regresión del incidente del 21/10: «npm run sde:hu06 -- --simular» en PowerShell ejecutó la corrida real.
 */
const RAIZ = resolve(__dirname, '..', '..', '..', '..');
const ORQ = resolve(RAIZ, 'projects/seguros-del-estado/tools/hu.mjs');
const FALSO = resolve(RAIZ, 'projects/seguros-del-estado/tests/fixtures/runner/orquestador-falso.cjs');
const CPS = ['HU06-CP05', 'HU06-CP01', 'HU06-CP02', 'HU06-CP03', 'HU06-CP04'];
type Llamada = { args: string[]; env: Record<string, string> };
let nLlamada = 0;

function repo(dir: string, o: { pendientes?: number; envExtra?: string } = {}) {
  const raiz = resolve(dir, 'repo');
  mkdirSync(resolve(raiz, 'projects/seguros-del-estado/certificacion'), { recursive: true });
  mkdirSync(resolve(raiz, 'test-results/seguros-del-estado'), { recursive: true });
  copyFileSync(resolve(RAIZ, 'projects/seguros-del-estado/certificacion/HU06.json'), resolve(raiz, 'projects/seguros-del-estado/certificacion/HU06.json'));
  writeFileSync(resolve(raiz, 'projects/seguros-del-estado/.env'), `BIZAGI_BASE_URL=http://portal.sintetico.local\n${o.envExtra ?? ''}`);
  const historico = [...Array(o.pendientes ?? 44)].map((_, i) => ({ numeroCaso: String(100 + i), fechaHora: '2026-10-20T00:00:00.000Z', escenario: 'x', modoCreacion: 'portal', estadoDepuracion: 'Pendiente de depurar' }));
  historico.push({ numeroCaso: '999', fechaHora: '2026-10-20T00:00:00.000Z', escenario: 'x', modoCreacion: 'portal', estadoDepuracion: 'Depurado' });
  writeFileSync(resolve(raiz, 'test-results/seguros-del-estado/historico-casos.json'), JSON.stringify(historico));
  return raiz;
}

function orquestar(raiz: string, argv: string[], extra: Record<string, string> = {}, padre: Record<string, string> = {}) {
  const registro = resolve(raiz, `llamadas-${++nLlamada}.jsonl`); // un registro por invocación
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', SDE_ORQ_RAIZ: raiz, SDE_ORQ_RUNNER: FALSO,
    FALSO_REGISTRO: registro, FALSO_CPS: CPS.join(','), ...padre, ...extra };
  const r = spawnSync(process.execPath, [ORQ, ...argv], { cwd: RAIZ, env, encoding: 'utf8', timeout: 60_000 });
  const llamadas: Llamada[] = existsSync(registro) ? readFileSync(registro, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}`, llamadas, e2e: llamadas.filter((l) => !l.args.includes('--list') && !l.args.includes('@soporte-hu')), word: llamadas.filter((l) => l.args.includes('@soporte-hu')) };
}

test.describe('Orquestador HU06: dos comandos, sin regresiones de seguridad @unit', () => {
  test('cupo: misma regla de pendientes que HistorialCasos; la corrida nunca amplía un límite global de QA', async ({}, info) => {
    const m = await import(pathToFileURL(ORQ).href);
    const raiz = repo(info.outputPath());
    const historico = JSON.parse(readFileSync(resolve(raiz, 'test-results/seguros-del-estado/historico-casos.json'), 'utf8'));
    historico.push({ numeroCaso: '998', fechaHora: '2026-10-20T00:00:00.000Z', escenario: 'x', modoCreacion: 'portal' }); // sin estado = pendiente
    writeFileSync(resolve(raiz, 'test-results/seguros-del-estado/historico-casos.json'), JSON.stringify(historico));
    const oficial = (await new HistorialCasos({ proyecto: 'seguros-del-estado', directorioBase: raiz }).listarPendientes()).length;
    expect(m.contarPendientes(historico)).toBe(oficial);
    expect(oficial).toBe(45);
    expect(m.limiteCorrida({ pendientes: 44, nuevos: 5 })).toMatchObject({ limite: 49 });
    expect(m.limiteCorrida({ pendientes: 44, nuevos: 5, global: '46' })).toMatchObject({ limite: 46 });   // manda el global
    expect(m.limiteCorrida({ pendientes: 44, nuevos: 5, global: '60' })).toMatchObject({ limite: 49 });   // la corrida sigue acotada a 5
    expect(m.limiteCorrida({ pendientes: 44, nuevos: 5, global: '44' }).error).toMatch(/ya está alcanzado/);
    expect(m.limiteCorrida({ pendientes: 44, nuevos: 5, global: 'x' }).error).toMatch(/no es un entero/);
    expect(m.cpListados('[SDE] HU06-CP05 — a\n[SDE] HU06-CP01 — b')).toEqual(['HU06-CP05', 'HU06-CP01']);
    expect(m.argumentosSuite('HU06', 'x')).toEqual(['--grep', '@hu06', '--grep-invert', '@variante', '--workers=1', '--retries=0', '--trace', 'off', '--output=x']);
  });

  test('simulación: muestra CP, cupo y corrida sin ejecutar nada; también si npm se quedó con «--simular» (incidente del 21/10)', ({}, info) => {
    const raiz = repo(info.outputPath());
    const a = orquestar(raiz, ['HU06', '--simular']);
    expect(a.codigo, a.salida).toBe(0);
    expect(a.salida).toContain('CP seleccionados (5): HU06-CP05, HU06-CP01, HU06-CP02, HU06-CP03, HU06-CP04');
    expect(a.salida).toContain('SDE_MAX_CASOS_PENDIENTES=49 (44 pendientes + 5 CP)');
    expect(a.salida).toContain('SIMULACIÓN: no se ejecutó nada');
    expect(a.e2e).toHaveLength(0);
    const b = orquestar(raiz, ['HU06'], { npm_config_simular: 'true' }); // así llega «npm run sde:hu06 -- --simular» desde PowerShell
    expect(b.codigo, b.salida).toBe(0);
    expect(b.e2e).toHaveLength(0);
    const c = orquestar(raiz, ['HU06', '--algo']);
    expect(c.codigo).toBe(2);
    expect(c.llamadas).toHaveLength(0);
    const d = orquestar(raiz, ['HU06'], { npm_config_word: 'true' }); // «npm run sde:hu06 -- --word» perdido: no cae en la corrida real
    expect(d.codigo).toBe(2);
    expect(d.llamadas).toHaveLength(0);
  });

  test('se detiene ANTES de Bizagi si la selección no son los 5 CP, si hay variante, si hay un bloqueo de ejecución o si el límite global está alcanzado', ({}, info) => {
    const raiz = repo(info.outputPath('a'));
    expect(orquestar(raiz, ['HU06'], { FALSO_CPS: CPS.slice(0, 4).join(',') }).e2e).toHaveLength(0);
    const v = orquestar(raiz, ['HU06'], { FALSO_VARIANTE: '1' });
    expect(v.salida).toContain('DETENIDO');
    expect(v.e2e).toHaveLength(0);
    writeFileSync(resolve(raiz, 'test-results/seguros-del-estado/.ejecucion-real.lock'), '{}');
    const l = orquestar(raiz, ['HU06']);
    expect(l.salida).toMatch(/DETENIDO: hay otra ejecución real/);
    expect(l.e2e).toHaveLength(0);
    const g = orquestar(repo(info.outputPath('b'), { envExtra: 'SDE_MAX_CASOS_PENDIENTES=44\n' }), ['HU06']);
    expect(g.salida).toMatch(/límite global de QA .* ya está alcanzado/);
    expect(g.e2e).toHaveLength(0);
  });

  test('corrida: autorización solo en el proceso hijo, cupo por corrida, sin autorizaciones heredadas; Word generado aunque haya FAIL, y resumen que separa ejecución, resultado y soporte', ({}, info) => {
    const raiz = repo(info.outputPath());
    const r = orquestar(raiz, ['HU06'], {}, { SDE_AUTORIZO_CALIBRACION_POPUP: '710', CI: '1', SDE_SOPORTE_CORRIDA: 'vieja' });
    expect(r.e2e).toHaveLength(1);
    const e = r.e2e[0];
    expect(e.args).toEqual(expect.arrayContaining(['--grep', '@hu06', '--grep-invert', '@variante', '--workers=1', '--retries=0', '--trace', 'off']));
    expect(e.env).toMatchObject({ SDE_E2E: '1', SDE_MAX_CASOS_PENDIENTES: '49', SDE_POPUPS_CASO_CREADO: '1', SDE_TIPO_EJECUCION: 'certificacion' });
    expect(e.env.BIZAGI_CORRIDA).toMatch(/^HU06-\d{8}T\d{6}Z$/);
    expect(e.env.SDE_AUTORIZO_CALIBRACION_POPUP).toBeUndefined();   // no se hereda la autorización de otro caso
    expect(e.env.CI).toBeUndefined();                               // CI activaría reintentos en la configuración
    expect(r.word).toHaveLength(1);                                 // el Word se genera aunque la suite saliera con 1
    expect(r.word[0].env).toMatchObject({ SDE_E2E: '0', SDE_SOPORTE_HU: 'HU06' });
    expect(r.word[0].env.SDE_SOPORTE_CORRIDA).toBeUndefined();
    expect(r.word[0].env.SDE_MAX_CASOS_PENDIENTES).toBeUndefined();
    expect(r.codigo).toBe(1);                                       // el código de la suite se conserva
    for (const t of ['== EJECUCIÓN ==', 'Playwright terminó con código 1', 'Ejecuciones registradas en la corrida', '5 de 5',
      '== RESULTADO FUNCIONAL DE LA AUTOMATIZACIÓN (no es certificación ni aprobación QA) ==', 'HU06-CP05: caso 900 · FAIL · FAIL 1 · PASS 28',
      '== SOPORTE WORD ==', 'HU06.docx', 'Generar el Word NO significa que la HU pasó']) expect(r.salida).toContain(t);
  });

  test('sde:hu06:word solo genera el Word, sin habilitar Bizagi', ({}, info) => {
    const raiz = repo(info.outputPath());
    const r = orquestar(raiz, ['HU06', '--word'], {}, { SDE_E2E: '1', SDE_MAX_CASOS_PENDIENTES: '99' });
    expect(r.codigo, r.salida).toBe(0);
    expect(r.llamadas).toHaveLength(1);
    expect(r.word[0].env.SDE_E2E).toBe('0');
    expect(r.word[0].env.SDE_MAX_CASOS_PENDIENTES).toBeUndefined();
    expect(r.salida).toContain('Generado (archivo nuevo; no sobrescribe versiones anteriores)');
  });

  test('package.json declara los comandos cortos sobre el orquestador', () => {
    const s = JSON.parse(readFileSync(resolve(RAIZ, 'package.json'), 'utf8')).scripts;
    expect(s).toMatchObject({ 'sde:hu06': 'node projects/seguros-del-estado/tools/hu.mjs HU06', 'sde:hu06:word': 'node projects/seguros-del-estado/tools/hu.mjs HU06 --word',
      'sde:hu06:simular': 'node projects/seguros-del-estado/tools/hu.mjs HU06 --simular' });
  });
});
