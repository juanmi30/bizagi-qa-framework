import { test, expect, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { HistorialCasos, type CasoHistorico } from '../../../shared/utils/HistorialCasos';
import { recuperarCasosPendientes, resumenRecuperacion } from '../../../shared/utils/RecuperacionCasos';
import { BizagiQaSupport } from '../helpers/bizagiQaSupport';

/** Lifecycle persistente sin Bizagi: histórico temporal y cancelación física simulada. */

const fecha = () => new Date('2026-09-23T15:00:00.000Z');

async function conHistorial(prueba: (h: HistorialCasos, dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'bizagi-lifecycle-'));
  try { await prueba(new HistorialCasos({ proyecto: 'colsubsidio', directorioBase: dir, ahora: fecha }), dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

async function sembrar(h: HistorialCasos, casos: unknown[]): Promise<void> {
  await mkdir(resolve(h.rutaArchivo, '..'), { recursive: true });
  await writeFile(h.rutaArchivo, JSON.stringify(casos, null, 2), 'utf8');
}

const caso = (numeroCaso: string, modoCreacion: 'servicio' | 'portal', estadoDepuracion = 'Pendiente de depurar') =>
  ({ numeroCaso, fechaHora: '2026-09-01T00:00:00.000Z', escenario: 'E ' + numeroCaso, modoCreacion, estadoDepuracion });

/** Sustituye solo la cancelación física; registro, adopción y marcado son los reales. */
class SoporteSimulado extends BizagiQaSupport {
  cancelados: string[] = [];
  constructor(historial: HistorialCasos, private readonly fallar: (numero: string) => boolean = () => false) {
    super({} as Page, historial);
  }
  protected override async cancelarEnBizagi(): Promise<void> {
    if (this.fallar(this.caso())) throw new Error(`Timeout: el caso ${this.caso()} no apareció en Admin → Casos`);
    this.cancelados.push(this.caso());
  }
}

test.describe('HistorialCasos — lifecycle', () => {
  test('registrar servicio sigue siendo el modo por defecto', () => conHistorial(async h => {
    const r = await h.registrar({ numeroCaso: '100', escenario: 'CRD-01' });
    expect(r).toEqual({ numeroCaso: '100', fechaHora: fecha().toISOString(), escenario: 'CRD-01',
      modoCreacion: 'servicio', estadoDepuracion: 'Pendiente de depurar' });
  }));

  test('registra portal, lista pendientes y exige número y escenario', () => conHistorial(async h => {
    await h.registrar({ numeroCaso: '200', escenario: 'AFI HU 14.12 CP03', modoCreacion: 'portal' });
    await h.registrar({ numeroCaso: '100', escenario: 'CRD-01' });
    expect((await h.listarPendientes('portal')).map(c => c.numeroCaso)).toEqual(['200']);
    expect((await h.listarPendientes()).map(c => c.numeroCaso)).toEqual(['200', '100']);
    await expect(h.registrar({ numeroCaso: '  ', escenario: 'X', modoCreacion: 'portal' })).rejects.toThrow('sin número');
    await expect(h.registrar({ numeroCaso: '300', escenario: ' ', modoCreacion: 'portal' })).rejects.toThrow('escenario');
  }));

  test('duplicado no crea un segundo registro', () => conHistorial(async h => {
    await h.registrar({ numeroCaso: '200', escenario: 'A', modoCreacion: 'portal' });
    await expect(h.registrar({ numeroCaso: '200', escenario: 'B' })).rejects.toThrow('ya existe');
    expect(await h.listar()).toHaveLength(1);
    expect((await h.listar())[0].escenario).toBe('A');
  }));

  test('marcarDepurado actualiza solo ese caso, es idempotente y rechaza inexistentes', () => conHistorial(async h => {
    await h.registrar({ numeroCaso: '200', escenario: 'A', modoCreacion: 'portal' });
    await h.registrar({ numeroCaso: '201', escenario: 'B', modoCreacion: 'portal' });
    await h.marcarDepurado('200');
    const antes = await readFile(h.rutaArchivo, 'utf8');
    expect((await h.marcarDepurado('200')).estadoDepuracion).toBe('Depurado');
    expect(await readFile(h.rutaArchivo, 'utf8')).toBe(antes);
    expect((await h.listar()).map(c => c.estadoDepuracion)).toEqual(['Depurado', 'Pendiente de depurar']);
    await expect(h.marcarDepurado('999')).rejects.toThrow('no existe');
    expect(await readFile(h.rutaArchivo, 'utf8')).toBe(antes);
  }));

  test('compatibilidad con histórico existente sin modo', () => conHistorial(async h => {
    await sembrar(h, [{ numeroCaso: '555656', fechaHora: '2026-08-06T15:00:00.000Z', escenario: 'CRD-01', estadoDepuracion: 'Pendiente de depurar' }]);
    expect((await h.listar())[0].modoCreacion).toBe('servicio');
    expect(await h.listarPendientes('portal')).toEqual([]);
    await h.registrar({ numeroCaso: '300', escenario: 'AFI', modoCreacion: 'portal' });
    expect((await h.listar()).map(c => [c.numeroCaso, c.modoCreacion])).toEqual([['555656', 'servicio'], ['300', 'portal']]);
  }));

  test('escritura atómica conserva el archivo anterior y limpia el temporal', () => conHistorial(async (_, dir) => {
    const base = new HistorialCasos({ proyecto: 'colsubsidio', directorioBase: dir, ahora: fecha });
    await base.registrar({ numeroCaso: '100', escenario: 'A', modoCreacion: 'portal' });
    const antes = await readFile(base.rutaArchivo, 'utf8');
    for (const archivos of [
      { renombrar: async () => { throw Object.assign(new Error('disco'), { code: 'EIO' }); } },
      { escribir: async (ruta: string) => { await writeFile(ruta, '[{"numeroCaso": "10'); throw new Error('crash'); } },
    ]) {
      const h = new HistorialCasos({ proyecto: 'colsubsidio', directorioBase: dir, ahora: fecha, archivos });
      await expect(h.registrar({ numeroCaso: '101', escenario: 'B', modoCreacion: 'portal' })).rejects.toThrow('No fue posible guardar el caso 101');
      expect(await readFile(base.rutaArchivo, 'utf8')).toBe(antes);
      expect((await readdir(resolve(base.rutaArchivo, '..'))).filter(f => f.endsWith('.tmp'))).toEqual([]);
    }
  }));
});

test.describe('BizagiQaSupport — lifecycle Portal', () => {
  test('el caso queda Pendiente apenas se registra y Depurado tras cancelar', () => conHistorial(async h => {
    const soporte = new SoporteSimulado(h);
    await soporte.registrarCasoCreado('310500', 'AFI HU 14.12 CP04 Empresa');
    expect(await h.listar()).toEqual([{ numeroCaso: '310500', fechaHora: fecha().toISOString(),
      escenario: 'AFI HU 14.12 CP04 Empresa', modoCreacion: 'portal', estadoDepuracion: 'Pendiente de depurar' } satisfies CasoHistorico]);
    await soporte.cancelarCasoCreado();
    expect(soporte.cancelados).toEqual(['310500']);
    expect((await h.listar())[0].estadoDepuracion).toBe('Depurado');
  }));

  test('cleanup fallido deja Pendiente y propaga el error', () => conHistorial(async h => {
    const soporte = new SoporteSimulado(h, () => true);
    await soporte.registrarCasoCreado('310501', 'AFI HU 14.12 CP03');
    await expect(soporte.cancelarCasoCreado()).rejects.toThrow('no apareció');
    expect((await h.listar())[0].estadoDepuracion).toBe('Pendiente de depurar');
  }));

  test('si falla el histórico, el número sigue en memoria y el cleanup lo cancela', () => conHistorial(async (_, dir) => {
    const roto = new HistorialCasos({ proyecto: 'colsubsidio', directorioBase: dir,
      archivos: { renombrar: async () => { throw new Error('disco lleno'); } } });
    const soporte = new SoporteSimulado(roto);
    await expect(soporte.registrarCasoCreado('310502', 'AFI HU 14.12 CP01 Desktop'))
      .rejects.toThrow('Bizagi creó el caso 310502, pero falló su persistencia');
    await soporte.cancelarCasoCreado();
    expect(soporte.cancelados).toEqual(['310502']);
    expect(await roto.listar()).toEqual([]);
  }));

  test('adoptar solo acepta un caso Portal pendiente del histórico y no lo duplica', () => conHistorial(async h => {
    await sembrar(h, [caso('1', 'portal'), caso('2', 'servicio'), caso('3', 'portal', 'Depurado')]);
    for (const numero of ['2', '3', '99']) await expect(new SoporteSimulado(h).adoptarCasoRegistrado(numero)).rejects.toThrow('no es un caso Portal pendiente');
    await expect(new SoporteSimulado(h).adoptarCasoRegistrado('1 OR 1')).rejects.toThrow('inválido');
    const soporte = new SoporteSimulado(h);
    await soporte.adoptarCasoRegistrado('1');
    await expect(soporte.adoptarCasoRegistrado('2')).rejects.toThrow('ya administra el caso 1');
    expect(await h.listar()).toHaveLength(3);
  }));
});

test.describe('Recuperación de pendientes Portal', () => {
  test('solo opera portal pendiente, continúa tras un fallo y marca solo los exitosos', () => conHistorial(async h => {
    await sembrar(h, [caso('10', 'portal'), caso('11', 'servicio'), caso('12', 'portal', 'Depurado'), caso('13', 'portal'), caso('14', 'portal')]);
    const intentados: string[] = [];
    const resultados = await recuperarCasosPendientes({
      historial: h, modoCreacion: 'portal',
      cancelar: async numero => {
        intentados.push(numero);
        const soporte = new SoporteSimulado(h, n => n === '13');
        await soporte.adoptarCasoRegistrado(numero);
        await soporte.cancelarCasoCreado();
      },
    });
    expect(intentados).toEqual(['10', '13', '14']);
    expect(resultados.map(r => [r.numeroCaso, r.estado])).toEqual([['10', 'CANCELADO'], ['13', 'ERROR'], ['14', 'CANCELADO']]);
    expect(Object.fromEntries((await h.listar()).map(c => [c.numeroCaso, c.estadoDepuracion]))).toEqual({
      10: 'Depurado', 11: 'Pendiente de depurar', 12: 'Depurado', 13: 'Pendiente de depurar', 14: 'Depurado',
    });
    const resumen = resumenRecuperacion('portal', resultados);
    expect(resumen).toContain('Pendientes Portal encontrados: 3');
    expect(resumen).toContain('13 -> ERROR: Timeout');
    expect(resumen).toContain('Depurados: 2\nPendientes restantes: 1');
  }));

  test('tools/cleanup.mjs no abre Bizagi sin pendientes Portal e ignora servicio', () => conHistorial(async (h, dir) => {
    await mkdir(join(dir, 'projects', 'colsubsidio', 'tests'), { recursive: true });
    await writeFile(join(dir, 'projects', 'colsubsidio', 'tests', 'cleanup-pendientes.spec.ts'), '');
    const correr = (env: Record<string, string> = {}) => spawnSync(process.execPath, [resolve('tools', 'cleanup.mjs'), 'colsubsidio'],
      { env: { ...process.env, CLEANUP_BASE_DIR: dir, ...env }, encoding: 'utf8' });
    await sembrar(h, [caso('20', 'servicio'), caso('21', 'portal', 'Depurado')]);
    let r = correr();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Pendientes Portal encontrados: 0');
    await sembrar(h, [caso('20', 'servicio'), caso('22', 'portal')]);
    r = correr({ CLEANUP_SOLO_LISTAR: '1' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Pendientes Portal en el histórico: 22\n');
  }));
});
