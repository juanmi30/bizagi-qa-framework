import { test, expect } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { adquirirBloqueo, BloqueoOcupadoError, conBloqueo, intentarBloqueo } from '../../../../shared/utils/BloqueoArchivo';
import { HistorialCasos } from '../../../../shared/utils/HistorialCasos';
import { cargarRegistro } from '../../sde/datos';
import { cargarEscenario, DIR_ESCENARIOS } from '../../sde/escenario';
import { causaDeBloqueo, causaDeExcepcion, crearContexto, ejecutarEscenario, preflight, reporteBloqueado, type Capacidad } from '../../sde/ejecutor';
import { casoMatriz } from '../../sde/matriz';
import { cargarManifest } from '../../sde/manifest';
import { maximoAlcanzable, pendientesParaRealPass } from '../../sde/metricas';
import { RUTA_BLOQUEO_EJECUCION_REAL } from '../../sde/registro';
import { generarTrazabilidad } from '../../sde/trazabilidad';
import { activacionE2e, limiteCasosPendientes } from '../../sde/verticales';

/** Fase "confiabilidad SDE-CEL": H4 (causas), H6 (concurrencia) y H7 (pendientes de REAL_PASS). Sin QA ni navegador. */

const reg = cargarRegistro();
const cp05 = cargarEscenario(resolve(DIR_ESCENARIOS, '1-hu06-cp05.yaml'), reg);
const ENV = {
  BIZAGI_BASE_URL: 'https://x.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c', SDE_PROCESO_RADICACION: 'p',
  SDE_PROCESO_CATEGORIA: 'c', SDE_RUTA_LINEA: 'l', SDE_RUTA_RAMO: 'r', SDE_RUTA_MOVIMIENTO: 'm', SDE_SUCURSAL: 's',
  SDE_RUTA_FORMA_CONSULTA: 'f', SDE_RUTA_CRITERIO_CAMPO: 'c', SDE_RUTA_CRITERIO_VALOR: '999',
};
const sesion: Record<string, Capacidad> = { iniciar_sesion: async (p, c) => { c.sesiones.add(p.actor as string); } };
const correr = (caps: Record<string, Capacidad>, ok = true) =>
  ejecutarEscenario(cp05, { capacidades: { ...sesion, ...caps }, verificar: async () => ({ ok, detalle: ok ? '' : 'distinto' }), evidencia: async () => undefined }, crearContexto(reg, ENV, 'u'));

test.describe('H4 — causas estructuradas, coherentes entre preflight y ejecución @unit', () => {
  test('preflight: cada paso bloqueado lleva la causa del bloqueo; el reporte las resume y no atribuye nada al producto', async () => {
    const sinEnv = await ejecutarEscenario(cp05, { capacidades: {}, verificar: async () => ({ ok: true, detalle: '' }), evidencia: async () => undefined }, crearContexto(reg, {}, 'u'));
    expect(sinEnv.estado).toBe('BLOCKED');
    expect(sinEnv.pasos.every((p) => p.estado === 'BLOCKED' && p.causa === 'CONFIGURACION')).toBe(true);
    expect(sinEnv.causas).toEqual(expect.arrayContaining(['CONFIGURACION']));
    expect(sinEnv.atribucion).toBe('NO_APLICA');
    expect(sinEnv.motivo).toMatch(/no es un resultado del producto/);
    // Mismo resultado por el camino directo que usa el runner (reporteBloqueado).
    const directo = reporteBloqueado(cp05, crearContexto(reg, {}, 'u'), preflight(cp05, reg, {}));
    expect(directo.pasos.map((p) => p.causa)).toEqual(sinEnv.pasos.map((p) => p.causa));
  });

  test('causa de cada tipo de bloqueo previo', () => {
    expect(causaDeBloqueo('ENVIRONMENT: BIZAGI_BASE_URL no configurada')).toBe('CONFIGURACION');
    expect(causaDeBloqueo('CREDENCIALES actor "analista": faltan USUARIO_analista')).toBe('CONFIGURACION');
    expect(causaDeBloqueo('TEST_DATA DOC-SOPORTE: faltan SDE_X')).toBe('DATO');
    expect(causaDeBloqueo('CONCURRENCIA: otra ejecución real de SDE está en curso')).toBe('CONCURRENCIA');
    expect(causaDeBloqueo('otra cosa')).toBe('NO_CLASIFICADO');
    const soloDatos = reporteBloqueado(cp05, crearContexto(reg, ENV, 'u'), ['TEST_DATA DOC-SOPORTE: faltan SDE_X']);
    expect(soloDatos.pasos.every((p) => p.causa === 'DATO')).toBe(true);
    const concurrencia = reporteBloqueado(cp05, crearContexto(reg, ENV, 'u'), ['CONCURRENCIA: en curso']);
    expect(concurrencia).toMatchObject({ estado: 'BLOCKED', causas: ['CONCURRENCIA'] });
  });

  test('timeouts, red y excepciones desconocidas nunca se atribuyen al producto', () => {
    expect(causaDeExcepcion(new Error('page.goto: net::ERR_NAME_NOT_RESOLVED at https://x.test'))).toBe('AMBIENTE');
    expect(causaDeExcepcion(new Error('page.goto: Timeout 30000ms exceeded.'))).toBe('AMBIENTE');
    expect(causaDeExcepcion(new Error('connect ECONNREFUSED 127.0.0.1:443'))).toBe('AMBIENTE');
    expect(causaDeExcepcion(new Error('locator.click: Timeout 15000ms exceeded.'))).toBe('AUTOMATIZACION');
    expect(causaDeExcepcion(new Error('Target crashed'))).toBe('NO_CLASIFICADO');
  });

  test('un error de red a mitad de la corrida deja el paso BLOCKED por AMBIENTE (no FAIL)', async () => {
    const r = await correr({ nuevo_caso: async () => { throw new Error('page.goto: net::ERR_CONNECTION_RESET'); } });
    expect(r.pasos[1]).toMatchObject({ estado: 'BLOCKED', causa: 'AMBIENTE' });
    expect(r.estado).toBe('BLOCKED');
    expect(r.motivo).toContain('causa: AMBIENTE');
  });

  test('un BLOCKED devuelto por una capability sin causa queda NO_CLASIFICADO (antes se presumía DATO); con causa explícita se respeta', async () => {
    const sinCausa = await correr({ nuevo_caso: async () => ({ estado: 'BLOCKED', detalle: 'x' }) });
    expect(sinCausa.pasos[1].causa).toBe('NO_CLASIFICADO');
    expect(sinCausa.motivo).toContain('causa: NO_CLASIFICADO');
    const conCausa = await correr({ nuevo_caso: async () => ({ estado: 'BLOCKED', causa: 'DATO', detalle: 'x' }) });
    expect(conCausa.pasos[1].causa).toBe('DATO');
  });

  test('atribución del FAIL: excepción desconocida → NO atribuible; verificación incumplida → por confirmar', async () => {
    const raro = await correr({ nuevo_caso: async () => { throw new Error('algo inesperado'); } });
    expect(raro).toMatchObject({ estado: 'FAIL', atribucion: 'NO_ATRIBUIBLE_AL_PRODUCTO' });
    expect(raro.motivo).toMatch(/NO atribuible al producto/);
    expect(raro.causas).toEqual(['NO_CLASIFICADO']);
    const observado = await correr({ nuevo_caso: async () => undefined }, false);
    expect(observado).toMatchObject({ estado: 'FAIL', atribucion: 'PRODUCTO_POR_CONFIRMAR' });
    expect(observado.motivo).toMatch(/POR CONFIRMAR/);
  });
});

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.describe('H6 — exclusión entre procesos (histórico y ejecuciones reales) @unit', () => {
  test('registros simultáneos en el histórico no se pisan (con un escritor lento que fuerza la carrera)', async ({}, testInfo) => {
    const base = testInfo.outputPath('hist');
    const lento = { escribir: async (r: string, c: string) => { await dormir(40); await writeFile(r, c, 'utf8'); } };
    const n = 8;
    await Promise.all(Array.from({ length: n }, (_, i) =>
      new HistorialCasos({ proyecto: 'p', directorioBase: base, archivos: lento }).registrar({ numeroCaso: String(100 + i), escenario: `e${i}`, modoCreacion: 'portal' })));
    const casos = await new HistorialCasos({ proyecto: 'p', directorioBase: base }).listar();
    expect(casos.map((c) => c.numeroCaso).sort()).toEqual(Array.from({ length: n }, (_, i) => String(100 + i)));
    expect(existsSync(resolve(base, 'test-results', 'p', 'historico-casos.json.lock')), 'el bloqueo se libera').toBe(false);
  });

  test('otro PROCESO vivo retiene el bloqueo; al morir sin limpiar (kill), el bloqueo huérfano se recupera', async ({}, testInfo) => {
    const ruta = testInfo.outputPath('x.lock');
    const hijo = spawn(process.execPath, ['-e', `
      const fs = require('fs'); const os = require('os');
      const fd = fs.openSync(${JSON.stringify(ruta)}, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, equipo: os.hostname(), inicio: new Date().toISOString(), descripcion: 'hijo', token: 'hijo-' + process.pid }));
      fs.closeSync(fd); setInterval(() => {}, 1000);`], { stdio: 'ignore' });
    try {
      for (let i = 0; i < 100 && !existsSync(ruta); i++) await dormir(50);
      expect(existsSync(ruta)).toBe(true);
      expect(intentarBloqueo(ruta)).toBeNull();
      await expect(adquirirBloqueo(ruta, { esperaMs: 300 })).rejects.toBeInstanceOf(BloqueoOcupadoError);
    } finally {
      hijo.kill('SIGKILL');
    }
    await new Promise((r) => hijo.once('exit', r));
    expect(existsSync(ruta), 'el hijo murió sin limpiar').toBe(true);
    const b = intentarBloqueo(ruta);
    expect(b, 'bloqueo huérfano recuperado').not.toBeNull();
    b!.liberar();
    expect(existsSync(ruta)).toBe(false);
  });

  test('se libera aunque la operación falle; no borra el bloqueo de otro dueño; la antigüedad sola no lo retira', async ({}, testInfo) => {
    const ruta = testInfo.outputPath('y.lock');
    await expect(conBloqueo(ruta, async () => { throw new Error('falla'); })).rejects.toThrow('falla');
    expect(existsSync(ruta)).toBe(false);
    const mio = intentarBloqueo(ruta)!;
    writeFileSync(ruta, JSON.stringify({ pid: process.pid + 1, equipo: 'otro-equipo', inicio: new Date().toISOString(), descripcion: '', token: 'ajeno' }));
    mio.liberar();
    expect(existsSync(ruta), 'el archivo ya era de otro dueño: no se toca').toBe(true);
    expect(intentarBloqueo(ruta, { pidVivo: () => true })).toBeNull();
    // P0 (auditoría Work): un bloqueo antiguo de otro equipo no se retira automáticamente (fallo cerrado).
    expect(intentarBloqueo(ruta, { caducidadMs: 1000, ahora: () => Date.now() + 5000 })).toBeNull();
    expect(existsSync(ruta)).toBe(true);
  });

  test('el bloqueo de ejecución real de SDE vive en test-results (nunca se versiona)', () => {
    expect(RUTA_BLOQUEO_EJECUCION_REAL.split(/[\\/]/).slice(-3)).toEqual(['test-results', 'seguros-del-estado', '.ejecucion-real.lock']);
    const runner = readFileSync(resolve(__dirname, '..', '..', 'sde', 'verticales.ts'), 'utf8');
    expect(runner).toMatch(/adquirirBloqueo\(RUTA_BLOQUEO_EJECUCION_REAL/);
    expect(runner).toMatch(/bloqueo\.liberar\(\)/);
    for (const spec of ['calibracion.real.spec.ts', 'diagnostico-documentos.real.spec.ts']) {
      expect(readFileSync(resolve(__dirname, '..', spec), 'utf8'), spec).toMatch(/exclusividadEjecucionReal\(/);
    }
  });
});

test.describe('Runner — un filtro con espacios no selecciona pruebas reales (incidente 2026-10-13) @unit', () => {
  test('--grep con espacios llega entero a Playwright (solo --list: no ejecuta nada)', () => {
    const raiz = resolve(__dirname, '..', '..', '..', '..');
    const r = spawnSync(process.execPath, ['tools/run.mjs', 'seguros-del-estado', '--list', '--grep', 'sin los documentos portables'], { cwd: raiz, encoding: 'utf8', timeout: 120_000 });
    const salida = `${r.stdout}\n${r.stderr}`;
    // Con el runner anterior: grep "sin" + filtros de archivo "los", "documentos", "portables" → también listaba pruebas reales.
    expect(salida).toMatch(/Total: 1 test in 1 file/);
    expect(salida).not.toMatch(/\.real\.spec|verticales|variantes/);
  });
});

test.describe('P-06 — activación explícita de las verticales reales (aprobada 2026-10-14) @unit', () => {
  test('sin SDE_E2E=1 la vertical queda BLOCKED por CONFIGURACION antes de tocar QA; con SDE_E2E=1 no hay bloqueo', () => {
    for (const env of [{}, { SDE_E2E: '' }, { SDE_E2E: '0' }, { SDE_E2E: 'true' }]) {
      const b = activacionE2e(env);
      expect(b, JSON.stringify(env)).toHaveLength(1);
      expect(causaDeBloqueo(b[0])).toBe('CONFIGURACION');
    }
    expect(activacionE2e({ SDE_E2E: '1' })).toEqual([]);
    expect(activacionE2e({ SDE_E2E: ' 1 ' })).toEqual([]);
    // El reporte bloqueado no atribuye nada al producto ni crea casos: es el mismo camino de preflight.
    const r = reporteBloqueado(cp05, crearContexto(reg, ENV, 'u'), activacionE2e({}));
    expect(r).toMatchObject({ estado: 'BLOCKED', causas: ['CONFIGURACION'], numero_caso: null });
  });

  test('el runner de verticales aplica la activación ANTES del preflight y del bloqueo de ejecución real', () => {
    const fuente = readFileSync(resolve(__dirname, '..', '..', 'sde', 'verticales.ts'), 'utf8');
    const iActivacion = fuente.indexOf('...activacionE2e(process.env)');
    expect(iActivacion).toBeGreaterThan(0);
    // registrarVerticales es la última función del archivo: su adquisición del bloqueo es la última aparición.
    expect(iActivacion).toBeLessThan(fuente.lastIndexOf('adquirirBloqueo(RUTA_BLOQUEO_EJECUCION_REAL'));
    expect(fuente).toContain('const faltantes = [...activacionE2e(process.env), ...preflight(s, registro, process.env)];');
  });
});

test.describe('P-17 — límite contra la acumulación de casos pendientes @unit', () => {
  test('sin SDE_MAX_CASOS_PENDIENTES solo se informa; con el límite alcanzado la vertical queda BLOCKED por CONFIGURACION', () => {
    expect(limiteCasosPendientes({}, 500)).toEqual([]);
    expect(limiteCasosPendientes({ SDE_MAX_CASOS_PENDIENTES: '20' }, 19)).toEqual([]);
    for (const [env, n] of [[{ SDE_MAX_CASOS_PENDIENTES: '20' }, 20], [{ SDE_MAX_CASOS_PENDIENTES: ' 0 ' }, 0], [{ SDE_MAX_CASOS_PENDIENTES: 'x' }, 0], [{ SDE_MAX_CASOS_PENDIENTES: '-1' }, 0]] as const) {
      const b = limiteCasosPendientes(env, n);
      expect(b, JSON.stringify(env)).toHaveLength(1);
      expect(causaDeBloqueo(b[0])).toBe('CONFIGURACION');
    }
    const r = reporteBloqueado(cp05, crearContexto(reg, ENV, 'u'), limiteCasosPendientes({ SDE_MAX_CASOS_PENDIENTES: '1' }, 19));
    expect(r).toMatchObject({ estado: 'BLOCKED', causas: ['CONFIGURACION'], numero_caso: null });
  });

  test('el runner aplica el límite DESPUÉS de P-06/preflight y ANTES del bloqueo de ejecución real (no crea casos)', () => {
    const fuente = readFileSync(resolve(__dirname, '..', '..', 'sde', 'verticales.ts'), 'utf8');
    const iLimite = fuente.indexOf('limiteCasosPendientes(process.env, pendientes)');
    expect(iLimite).toBeGreaterThan(fuente.indexOf('...activacionE2e(process.env)'));
    expect(iLimite).toBeLessThan(fuente.lastIndexOf('adquirirBloqueo(RUTA_BLOQUEO_EJECUCION_REAL'));
  });
});

test.describe('H7 — pendientes reales para REAL_PASS @unit', () => {
  const man = cargarManifest();
  const esc = (id: string) => { const c = man.casos.find((x) => x.id === id)!; return c.escenario ? cargarEscenario(resolve(DIR_ESCENARIOS, c.escenario), reg) : undefined; };

  test('HU06-CP01: P4, P12, P17 y P28 siguen pendientes; el máximo alcanzable es REAL_PASS_PARCIAL', () => {
    const pend = pendientesParaRealPass(casoMatriz('HU06-CP01'), esc('HU06-CP01'));
    // P4 (2026-10-14): exige "etiquetas, ortografía y capitalización definidas"; capitalización, orden y la etiqueta del tipo de
    // solicitud no tienen fuente aprobada (expectativas pendientes de definición en data/expectativas-presentacion.yaml).
    expect(pend.map((p) => p.n)).toEqual([4, 12, 17, 28]);
    expect(maximoAlcanzable(casoMatriz('HU06-CP01'), esc('HU06-CP01'))).toBe('REAL_PASS_PARCIAL');
    // P28 sigue en la matriz y en el escenario oficial (no se eliminó para mejorar la métrica).
    expect(casoMatriz('HU06-CP01').pasos.some((p) => p.n === 28)).toBe(true);
    expect(esc('HU06-CP01')!.pasos.filter((p) => p.matriz.includes(28)).map((p) => p.hacer)).toEqual(['verificar', 'no_automatizado']);
    expect(man.casos.find((c) => c.id === 'HU06-CP01')!.brechas).toEqual(expect.arrayContaining(['UI-04', 'INT-02']));
  });

  test('HU06-CP05: P6 y P9 pendientes; ningún CP con pendientes promete REAL_PASS', () => {
    expect(pendientesParaRealPass(casoMatriz('HU06-CP05'), esc('HU06-CP05')).map((p) => p.n)).toEqual([6, 9]);
    for (const c of man.casos) {
      const e = esc(c.id);
      const max = maximoAlcanzable(casoMatriz(c.id), e);
      if (!e) expect(max, c.id).toBe('SIN_ESCENARIO');
      else expect(max === 'REAL_PASS', c.id).toBe(pendientesParaRealPass(casoMatriz(c.id), e).length === 0);
    }
  });

  test('la trazabilidad generada declara el máximo y los pendientes de cada CP (P28 incluido en HU06-CP01)', ({}, testInfo) => {
    const md = generarTrazabilidad({}, testInfo.outputPath('no-existe'), null);
    const seccion = md.slice(md.indexOf('## HU06-CP01 — '), md.indexOf('## ', md.indexOf('## HU06-CP01 — ') + 5));
    expect(seccion).toContain('**Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P4 (mixto), P12 (mixto), P17 (mixto), P28 (mixto)');
  });
});
