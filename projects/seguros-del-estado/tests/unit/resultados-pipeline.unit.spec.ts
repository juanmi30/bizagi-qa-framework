import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calcularVeredicto, modoEjecucion } from '../../sde/veredicto';

/**
 * H1: representación REAL en Playwright/JUnit de cada estado funcional y criterio de pipeline. Ejecuta un Playwright
 * hijo sobre la fixture tests/fixtures/resultados-pw (reportes sintéticos por el mismo aplicarResultado del runner).
 * Sin navegador, sin QA.
 */

const RAIZ = resolve(__dirname, '..', '..', '..', '..');
const CONFIG = resolve(__dirname, '..', 'fixtures', 'resultados-pw', 'playwright.sintetico.config.ts');
const CLI = resolve(RAIZ, 'node_modules', '@playwright', 'test', 'cli.js');

interface CasoJunit { nombre: string; resultado: 'passed' | 'failed' | 'skipped'; mensaje: string; propiedades: [string, string][] }

function correr(salida: string, opciones: { casos?: string; veredicto: boolean; tipo?: string }) {
  const r = spawnSync(process.execPath, [CLI, 'test', '-c', CONFIG], {
    cwd: RAIZ, encoding: 'utf8', timeout: 120_000,
    env: {
      ...process.env, SDE_SINTETICO_SALIDA: salida, SDE_SINTETICO_CASOS: opciones.casos ?? '', SDE_SINTETICO_VEREDICTO: opciones.veredicto ? '1' : '0',
      SDE_TIPO_EJECUCION: opciones.tipo ?? '', CI: '',
    },
  });
  const xml = readFileSync(resolve(salida, 'results.xml'), 'utf8');
  const casos: CasoJunit[] = [...xml.matchAll(/<testcase name="([^"]+)"[^>]*>([\s\S]*?)<\/testcase>/g)].map(([, nombre, cuerpo]) => ({
    nombre: nombre.split(' ')[0],
    resultado: /<failure /.test(cuerpo) ? 'failed' : /<skipped/.test(cuerpo) ? 'skipped' : 'passed',
    // failed: atributo message de <failure>; skipped: Playwright guarda el motivo como propiedad "skip".
    mensaje: (/<failure message="([^"]*)"/.exec(cuerpo)?.[1] ?? /<property name="skip" value="([^"]*)"/.exec(cuerpo)?.[1] ?? '').replace(/&quot;/g, '"'),
    propiedades: [...cuerpo.matchAll(/<property name="([^"]+)" value="([^"]*)"/g)].map(([, n, v]) => [n, v] as [string, string]),
  }));
  return { codigo: r.status, casos, salida };
}

const prop = (c: CasoJunit, n: string) => c.propiedades.filter(([k]) => k === n).map(([, v]) => v);

test.describe('H1 — resultados en Playwright/JUnit y criterio de pipeline @unit', () => {
  test.describe.configure({ mode: 'serial' });

  test('cada estado funcional tiene su representación JUnit y conserva estado y causa', ({}, testInfo) => {
    test.setTimeout(150_000);
    const { codigo, casos } = correr(testInfo.outputPath('todos'), { veredicto: true });
    const c = Object.fromEntries(casos.map((x) => [x.nombre, x]));
    expect(Object.keys(c).sort()).toEqual(['BLOCKED_EJECUCION', 'BLOCKED_PREFLIGHT', 'FAIL_AUTOMATIZACION', 'FAIL_PRODUCTO', 'PARCIAL', 'REAL_PASS']);

    // Solo REAL_PASS aparece como passed. Un parcial NUNCA cuenta como aprobado.
    expect(casos.filter((x) => x.resultado === 'passed').map((x) => x.nombre)).toEqual(['REAL_PASS']);
    expect(c.PARCIAL.resultado).toBe('failed');
    expect(c.PARCIAL.mensaje).toContain('NO APROBADO (REAL_PASS_PARCIAL');

    // Un bloqueo (preflight o en ejecución) es skipped y NUNCA se presenta como fallo del producto.
    for (const k of ['BLOCKED_PREFLIGHT', 'BLOCKED_EJECUCION']) {
      expect(c[k].resultado, k).toBe('skipped');
      expect(c[k].mensaje, k).toContain('no es fallo del producto');
    }
    expect(c.BLOCKED_PREFLIGHT.mensaje).toContain('BLOCKED antes de ejecutar');
    expect(c.BLOCKED_PREFLIGHT.mensaje).toContain('CONFIGURACION');
    expect(c.BLOCKED_EJECUCION.mensaje).toContain('BLOCKED en ejecución');

    // FAIL: failed, con la atribución explícita (automatización ≠ producto).
    expect(c.FAIL_AUTOMATIZACION.resultado).toBe('failed');
    expect(c.FAIL_AUTOMATIZACION.mensaje).toContain('NO atribuible al producto');
    expect(c.FAIL_PRODUCTO.resultado).toBe('failed');
    expect(c.FAIL_PRODUCTO.mensaje).toContain('posible defecto, por confirmar');

    // Trazabilidad en JUnit: estado funcional, causa y atribución como propiedades del caso.
    expect(prop(c.REAL_PASS, 'resultado_funcional')).toEqual(['REAL_PASS']);
    expect(prop(c.PARCIAL, 'resultado_funcional')).toEqual(['REAL_PASS_PARCIAL']);
    expect(prop(c.BLOCKED_PREFLIGHT, 'causa')).toEqual(['CONFIGURACION']);
    expect(prop(c.BLOCKED_EJECUCION, 'causa')).toEqual(['AMBIENTE']);
    expect(prop(c.FAIL_AUTOMATIZACION, 'atribucion')).toEqual(['NO_ATRIBUIBLE_AL_PRODUCTO']);
    expect(prop(c.FAIL_PRODUCTO, 'atribucion')).toEqual(['PRODUCTO_POR_CONFIRMAR']);

    expect(codigo, 'con fallos o parciales la corrida termina en error').not.toBe(0);
    const v = JSON.parse(readFileSync(testInfo.outputPath('todos', 'veredicto.json'), 'utf8'));
    expect(v).toMatchObject({ total_e2e: 6, ejecutados: 4, aprobados: 1, satisfactorio: false, no_concluyente: false,
      por_estado: { REAL_PASS: 1, REAL_PASS_PARCIAL: 1, BLOCKED: 2, FAIL: 2 } });
  });

  test('todo BLOCKED: Playwright solo devolvería éxito; el veredicto SDE lo marca NO CONCLUYENTE y falla la corrida', ({}, testInfo) => {
    test.setTimeout(150_000);
    // Comportamiento anterior (sin el criterio): todo skipped → código 0, la corrida parecería satisfactoria.
    const sin = correr(testInfo.outputPath('sin-veredicto'), { casos: 'BLOCKED_PREFLIGHT,BLOCKED_EJECUCION', veredicto: false });
    expect(sin.casos.every((x) => x.resultado === 'skipped')).toBe(true);
    expect(sin.codigo).toBe(0);

    const con = correr(testInfo.outputPath('con-veredicto'), { casos: 'BLOCKED_PREFLIGHT,BLOCKED_EJECUCION', veredicto: true });
    expect(con.codigo, 'una corrida sin ejecuciones no es satisfactoria').not.toBe(0);
    const v = JSON.parse(readFileSync(testInfo.outputPath('con-veredicto', 'veredicto.json'), 'utf8'));
    expect(v).toMatchObject({ no_concluyente: true, satisfactorio: false, ejecutados: 0, por_causa: { CONFIGURACION: 1, AMBIENTE: 1 } });
    expect(v.motivo).toContain('NO CONCLUYENTE');
  });

  test('solo REAL_PASS: satisfactorio y código 0', ({}, testInfo) => {
    test.setTimeout(150_000);
    const r = correr(testInfo.outputPath('pass'), { casos: 'REAL_PASS', veredicto: true });
    expect(r.codigo).toBe(0);
    expect(JSON.parse(readFileSync(testInfo.outputPath('pass', 'veredicto.json'), 'utf8'))).toMatchObject({ satisfactorio: true, aprobados: 1 });
  });

  test('todos REAL_PASS (certificación): satisfactorio, JUnit todo passed y código 0', ({}, testInfo) => {
    test.setTimeout(150_000);
    const r = correr(testInfo.outputPath('todos-pass'), { casos: 'REAL_PASS,REAL_PASS_2', veredicto: true });
    expect(r.casos.map((x) => x.resultado)).toEqual(['passed', 'passed']);
    expect(r.codigo).toBe(0);
    expect(JSON.parse(readFileSync(testInfo.outputPath('todos-pass', 'veredicto.json'), 'utf8')))
      .toMatchObject({ tipo_ejecucion: 'certificacion', certifica: true, satisfactorio: true, falla_corrida: false, aprobados: 2, total_e2e: 2 });
  });

  // P1 (auditoría Work): antes REAL_PASS + BLOCKED daba "NO SATISFACTORIO" con código 0 (JUnit: 1 passed, 1 skipped).
  for (const [nombre, casos, estado, junit] of [
    ['REAL_PASS + BLOCKED', 'REAL_PASS,BLOCKED_EJECUCION', 'BLOCKED', ['passed', 'skipped']],
    ['REAL_PASS + REAL_PASS_PARCIAL', 'REAL_PASS,PARCIAL', 'REAL_PASS_PARCIAL', ['passed', 'failed']],
    ['REAL_PASS + FAIL', 'REAL_PASS,FAIL_PRODUCTO', 'FAIL', ['passed', 'failed']],
  ] as const) {
    test(`${nombre} (certificación): NO SATISFACTORIO y código distinto de cero; JUnit conserva el estado de cada CP`, ({}, testInfo) => {
      test.setTimeout(150_000);
      const r = correr(testInfo.outputPath('mixto'), { casos, veredicto: true });
      expect(r.casos.map((x) => x.resultado), 'JUnit por CP (un BLOCKED sigue siendo skipped, no defecto)').toEqual([...junit]);
      expect(r.codigo, 'una certificación con un CP que no está en REAL_PASS no termina en éxito').not.toBe(0);
      const v = JSON.parse(readFileSync(testInfo.outputPath('mixto', 'veredicto.json'), 'utf8'));
      expect(v).toMatchObject({ tipo_ejecucion: 'certificacion', satisfactorio: false, falla_corrida: true, no_concluyente: false, aprobados: 1, total_e2e: 2,
        por_estado: { REAL_PASS: 1, [estado]: 1 }, estado_playwright: estado === 'BLOCKED' ? 'passed' : 'failed' });
      expect(v.motivo).toMatch(/^NO SATISFACTORIO: 1\/2/);
    });
  }

  test('REAL_PASS + BLOCKED sin el veredicto (control): Playwright solo devolvería código 0', ({}, testInfo) => {
    test.setTimeout(150_000);
    expect(correr(testInfo.outputPath('control'), { casos: 'REAL_PASS,BLOCKED_EJECUCION', veredicto: false }).codigo).toBe(0);
  });

  test('sin CP seleccionados: certificación explícita → NO CONCLUYENTE (error); sin pedirla → no aplica', ({}, testInfo) => {
    test.setTimeout(150_000);
    const explicita = correr(testInfo.outputPath('sin-cp'), { casos: 'AUXILIAR', veredicto: true, tipo: 'certificacion' });
    expect(explicita.casos.map((x) => x.resultado)).toEqual(['passed']);
    expect(explicita.codigo).not.toBe(0);
    expect(JSON.parse(readFileSync(testInfo.outputPath('sin-cp', 'veredicto.json'), 'utf8'))).toMatchObject({ no_concluyente: true, satisfactorio: false, total_e2e: 0 });
    const implicita = correr(testInfo.outputPath('sin-e2e'), { casos: 'AUXILIAR', veredicto: true });
    expect(implicita.codigo, 'corrida sin E2E (p. ej. @unit): el veredicto no interviene').toBe(0);
    expect(existsSync(testInfo.outputPath('sin-e2e', 'veredicto.json'))).toBe(false);
  });

  test('diagnóstico explícito: no certifica ni se anuncia satisfactorio; el código es el de Playwright', ({}, testInfo) => {
    test.setTimeout(150_000);
    const r = correr(testInfo.outputPath('diag'), { casos: 'REAL_PASS,BLOCKED_EJECUCION', veredicto: true, tipo: 'diagnostico' });
    expect(r.casos.map((x) => x.resultado)).toEqual(['passed', 'skipped']);
    expect(r.codigo).toBe(0);
    const v = JSON.parse(readFileSync(testInfo.outputPath('diag', 'veredicto.json'), 'utf8'));
    expect(v).toMatchObject({ tipo_ejecucion: 'diagnostico', certifica: false, satisfactorio: false, falla_corrida: false });
    expect(v.motivo).toMatch(/^DIAGNOSTICO \(no es una certificación; nunca es satisfactoria\)/);
  });

  test('tipo de ejecución (función pura): todo REAL_PASS en diagnóstico nunca es satisfactorio; un tipo desconocido falla', () => {
    const pass = [{ titulo: 'a', status: 'passed' as const, funcional: 'REAL_PASS', causas: [] }];
    expect(modoEjecucion({})).toEqual({ tipo: 'certificacion', explicito: false });
    for (const tipo of ['diagnostico', 'precreacion', 'exploracion']) {
      expect(calcularVeredicto(pass, modoEjecucion({ SDE_TIPO_EJECUCION: tipo })), tipo).toMatchObject({ satisfactorio: false, certifica: false, falla_corrida: false });
    }
    const raro = calcularVeredicto(pass, modoEjecucion({ SDE_TIPO_EJECUCION: 'certificar-rapido' }));
    expect(raro).toMatchObject({ aplica: true, satisfactorio: false, falla_corrida: true });
    expect(raro.motivo).toContain('no es válido');
    expect(calcularVeredicto(pass)).toMatchObject({ satisfactorio: true, falla_corrida: false });
  });

  test('criterio (función pura): sin E2E no aplica; skipped sin estado funcional no se adivina', () => {
    expect(calcularVeredicto([]).aplica).toBe(false);
    const v = calcularVeredicto([{ titulo: 'x', status: 'skipped', causas: [] }, { titulo: 'y', status: 'failed', causas: [] }]);
    expect(v).toMatchObject({ no_concluyente: true, por_estado: { OMITIDO_SIN_ESTADO: 1, ERROR_SIN_ESTADO: 1 } });
    // Un "passed" de Playwright sin REAL_PASS funcional no es una aprobación.
    expect(calcularVeredicto([{ titulo: 'z', status: 'passed', funcional: 'REAL_PASS_PARCIAL', causas: [] }])).toMatchObject({ aprobados: 0, satisfactorio: false });
  });
});
