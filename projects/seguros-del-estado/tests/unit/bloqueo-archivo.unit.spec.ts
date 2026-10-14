import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import * as ts from 'typescript';
import { adquirirBloqueo, BloqueoOcupadoError, conBloqueo, intentarBloqueo, leerBloqueo, type InfoBloqueo } from '../../../../shared/utils/BloqueoArchivo';

/**
 * P0 de la auditoría de Work sobre el PR #1: carrera del bloqueo entre procesos (shared/utils/BloqueoArchivo.ts).
 * Defecto anterior: open("wx") creaba el archivo VACÍO y los metadatos se escribían después; otro proceso lo leía en ese
 * instante, lo tomaba por huérfano, lo borraba y lo creaba: dos dueños a la vez. Sin QA ni navegador.
 */

const RAIZ = resolve(__dirname, '..', '..', '..', '..');
const COMPETIDOR = resolve(__dirname, '..', 'fixtures', 'bloqueo', 'competidor.cjs');
const PID_MUERTO = 999_999_999;
const soloMuerto = (pid: number) => pid !== PID_MUERTO;

const info = (extra: Partial<InfoBloqueo> = {}): InfoBloqueo =>
  ({ pid: PID_MUERTO, equipo: hostname(), inicio: new Date().toISOString(), descripcion: 'sintético', token: 'token-ajeno', ...extra });
const escribir = (ruta: string, contenido: unknown) => writeFileSync(ruta, typeof contenido === 'string' ? contenido : JSON.stringify(contenido));

/** El MISMO código del componente, transpilado a CommonJS para cargarlo desde procesos Node independientes. */
function moduloParaProcesos(dir: string): string {
  const fuente = readFileSync(resolve(RAIZ, 'shared', 'utils', 'BloqueoArchivo.ts'), 'utf8');
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const ruta = resolve(dir, 'BloqueoArchivo.cjs');
  writeFileSync(ruta, js);
  return ruta;
}

function terminar(hijo: ChildProcess): Promise<{ codigo: number | null; salida: string; error: string }> {
  let salida = '';
  let error = '';
  hijo.stdout?.on('data', (d) => { salida += d; });
  hijo.stderr?.on('data', (d) => { error += d; });
  return new Promise((r) => hijo.once('exit', (codigo) => r({ codigo, salida, error })));
}

test.describe('P0 — bloqueo entre procesos sin carreras (BloqueoArchivo) @unit', () => {
  test('archivo recién adquirido aún SIN metadatos (estado intermedio del algoritmo anterior): nunca es huérfano', async ({}, testInfo) => {
    const ruta = testInfo.outputPath('vacio.lock');
    escribir(ruta, ''); // lo que veía otro proceso entre open("wx") y write() del dueño
    expect(intentarBloqueo(ruta, { pidVivo: () => false }), 'con el algoritmo anterior aquí había DOS dueños').toBeNull();
    expect(existsSync(ruta), 'no se borra el bloqueo de un dueño que aún escribe').toBe(true);
    const error = await adquirirBloqueo(ruta, { esperaMs: 100, pidVivo: () => false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BloqueoOcupadoError);
    expect((error as Error).message).toMatch(/ilegibles o incompletos.*RECUPERACION-BLOQUEOS\.md/);
  });

  test('metadatos incompletos o inválidos (truncados, sin token, formato anterior, pid inválido): fallo cerrado', ({}, testInfo) => {
    const casos: Record<string, unknown> = {
      truncado: '{"pid":12',
      sin_token: { pid: PID_MUERTO, equipo: hostname(), inicio: new Date().toISOString(), descripcion: '' },
      pid_invalido: info({ pid: 0 }),
      inicio_invalido: info({ inicio: 'ayer' }),
      no_objeto: '[]',
    };
    for (const [nombre, contenido] of Object.entries(casos)) {
      const ruta = testInfo.outputPath(`${nombre}.lock`);
      escribir(ruta, contenido);
      expect(leerBloqueo(ruta), nombre).toBeNull();
      expect(intentarBloqueo(ruta, { pidVivo: () => false }), nombre).toBeNull();
      expect(readFileSync(ruta, 'utf8'), `${nombre}: intacto`).toBe(typeof contenido === 'string' ? contenido : JSON.stringify(contenido));
    }
  });

  test('el archivo de bloqueo nace con sus metadatos completos (publicación atómica por enlace duro)', ({}, testInfo) => {
    const ruta = testInfo.outputPath('completo.lock');
    const b = intentarBloqueo(ruta, { descripcion: 'x' })!;
    expect(leerBloqueo(ruta)).toMatchObject({ pid: process.pid, equipo: hostname(), descripcion: 'x', token: expect.any(String) });
    b.liberar();
    expect(existsSync(ruta)).toBe(false);
  });

  test('bloqueo antiguo con dueño vivo u otro equipo: no se retira por antigüedad (solo se diagnostica)', async ({}, testInfo) => {
    const antiguo = testInfo.outputPath('antiguo.lock');
    escribir(antiguo, info({ pid: process.pid, inicio: '2020-01-01T00:00:00.000Z' }));
    expect(intentarBloqueo(antiguo, { caducidadMs: 1000 })).toBeNull();
    await expect(adquirirBloqueo(antiguo, { caducidadMs: 1000 })).rejects.toThrow(/sigue vivo pero el bloqueo es antiguo/);
    const remoto = testInfo.outputPath('remoto.lock');
    escribir(remoto, info({ equipo: 'otro-equipo' }));
    expect(intentarBloqueo(remoto, { pidVivo: () => false, caducidadMs: 0 })).toBeNull();
    await expect(adquirirBloqueo(remoto, { pidVivo: () => false })).rejects.toThrow(/otro equipo/);
    expect(existsSync(antiguo) && existsSync(remoto)).toBe(true);
  });

  test('huérfano demostrable (mismo equipo, proceso muerto): se recupera y queda un solo dueño', ({}, testInfo) => {
    const ruta = testInfo.outputPath('huerfano.lock');
    escribir(ruta, info());
    const b = intentarBloqueo(ruta, { pidVivo: soloMuerto })!;
    expect(b).not.toBeNull();
    expect(leerBloqueo(ruta)).toMatchObject({ pid: process.pid });
    expect(existsSync(`${ruta}.recuperacion`), 'el bloqueo de recuperación se libera').toBe(false);
    b.liberar();
  });

  test('dos recuperaciones simultáneas del mismo huérfano: solo una gana', ({}, testInfo) => {
    const ruta = testInfo.outputPath('doble.lock');
    escribir(ruta, info());
    let segunda: ReturnType<typeof intentarBloqueo> | undefined;
    // B intenta exactamente mientras A ya decidió recuperar (tiene el bloqueo de recuperación y aún no borró).
    const a = intentarBloqueo(ruta, { pidVivo: soloMuerto, intercalar: () => { segunda = intentarBloqueo(ruta, { pidVivo: soloMuerto }); } });
    expect(segunda, 'B no puede recuperar a la vez').toBeNull();
    expect(a, 'A recupera').not.toBeNull();
    expect(leerBloqueo(ruta)?.pid).toBe(process.pid);
    expect(intentarBloqueo(ruta, { pidVivo: soloMuerto }), 'ni después: A es dueño vivo').toBeNull();
    a!.liberar();
  });

  test('si el huérfano fue reemplazado por un dueño legítimo antes de borrarlo, la recuperación lo respeta', ({}, testInfo) => {
    const ruta = testInfo.outputPath('reemplazado.lock');
    escribir(ruta, info());
    let legitimo: ReturnType<typeof intentarBloqueo> = null;
    const a = intentarBloqueo(ruta, {
      pidVivo: soloMuerto,
      // Intercalado: el huérfano desaparece y otro proceso toma el bloqueo mientras A tiene la recuperación.
      intercalar: () => { unlinkSync(ruta); legitimo = intentarBloqueo(ruta); },
    });
    expect(legitimo).not.toBeNull();
    expect(a, 'A no borra el bloqueo nuevo (token distinto) ni se vuelve dueño').toBeNull();
    expect(leerBloqueo(ruta)?.token).not.toBe('token-ajeno');
    legitimo!.liberar();
    expect(existsSync(ruta)).toBe(false);
  });

  test('recuperación abandonada (su dueño murió a mitad): fallo cerrado con diagnóstico; no se borra nada', async ({}, testInfo) => {
    const ruta = testInfo.outputPath('abandonada.lock');
    escribir(ruta, info());
    escribir(`${ruta}.recuperacion`, info({ token: 'recuperador-muerto' }));
    expect(intentarBloqueo(ruta, { pidVivo: soloMuerto })).toBeNull();
    await expect(adquirirBloqueo(ruta, { pidVivo: soloMuerto, esperaMs: 100 })).rejects.toThrow(/\.recuperacion \(recuperación en curso o abandonada\)/);
    expect(existsSync(ruta) && existsSync(`${ruta}.recuperacion`)).toBe(true);
  });

  test('liberación: el dueño correcto libera; uno incorrecto no toca el bloqueo ajeno; liberar dos veces no hace nada', ({}, testInfo) => {
    const ruta = testInfo.outputPath('duenos.lock');
    const a = intentarBloqueo(ruta)!;
    // Escenario anómalo: el bloqueo de A desapareció y B (mismo proceso, otro token) lo tomó.
    unlinkSync(ruta);
    const b = intentarBloqueo(ruta)!;
    expect(b).not.toBeNull();
    a.liberar();
    expect(leerBloqueo(ruta), 'A no libera el bloqueo de B aunque compartan pid').not.toBeNull();
    expect(intentarBloqueo(ruta), 'B sigue siendo dueño').toBeNull();
    b.liberar();
    b.liberar();
    expect(existsSync(ruta)).toBe(false);
  });

  test('excepción durante la operación protegida: se libera y el error se propaga', async ({}, testInfo) => {
    const ruta = testInfo.outputPath('excepcion.lock');
    await expect(conBloqueo(ruta, async () => { throw new Error('falla protegida'); })).rejects.toThrow('falla protegida');
    expect(existsSync(ruta)).toBe(false);
    expect(await conBloqueo(ruta, async () => 'ok')).toBe('ok');
  });

  test('adquisiciones simultáneas en un proceso: nunca dos dentro de la sección crítica', async ({}, testInfo) => {
    const ruta = testInfo.outputPath('simultaneas.lock');
    let dentro = 0;
    let maximo = 0;
    await Promise.all(Array.from({ length: 12 }, () => conBloqueo(ruta, async () => {
      maximo = Math.max(maximo, ++dentro);
      await new Promise((r) => setTimeout(r, 5));
      dentro--;
    }, { esperaMs: 30_000 })));
    expect(maximo).toBe(1);
  });

  test('proceso terminado abruptamente (kill) con el bloqueo tomado: el siguiente lo recupera', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const modulo = moduloParaProcesos(testInfo.outputPath());
    const ruta = testInfo.outputPath('kill.lock');
    const hijo = spawn(process.execPath, [COMPETIDOR, modulo, ruta, testInfo.outputPath('s'), '0', '0', 'retener'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const fin = terminar(hijo);
    try {
      await new Promise<void>((r, j) => { hijo.stdout!.on('data', (d) => { if (String(d).includes('TOMADO')) r(); }); hijo.once('exit', () => j(new Error('el hijo terminó antes'))); });
      expect(leerBloqueo(ruta)?.pid).toBe(hijo.pid);
      expect(intentarBloqueo(ruta), 'dueño vivo: ocupado').toBeNull();
    } finally {
      hijo.kill('SIGKILL');
    }
    await fin;
    expect(existsSync(ruta), 'murió sin limpiar').toBe(true);
    const b = intentarBloqueo(ruta);
    expect(b, 'huérfano por pid recuperado').not.toBeNull();
    b!.liberar();
  });

  test('procesos Node independientes compitiendo por el mismo bloqueo: nunca dos dueños simultáneos', async ({}, testInfo) => {
    test.setTimeout(180_000);
    const modulo = moduloParaProcesos(testInfo.outputPath());
    const ruta = testInfo.outputPath('procesos.lock');
    const seccion = testInfo.outputPath('seccion-critica');
    // 6x60 sin retención: con el algoritmo anterior este estrés produjo secciones críticas simultáneas (5 en 360).
    const procesos = 6;
    const iteraciones = 60;
    const resultados = await Promise.all(Array.from({ length: procesos }, () =>
      terminar(spawn(process.execPath, [COMPETIDOR, modulo, ruta, seccion, String(iteraciones), '0'], { stdio: ['ignore', 'pipe', 'pipe'] }))));
    for (const r of resultados) expect(r.codigo, r.error).toBe(0);
    const reportes = resultados.map((r) => JSON.parse(r.salida.trim()) as { dentro: number; violaciones: number });
    expect(reportes.reduce((s, r) => s + r.dentro, 0), 'todas las secciones críticas se ejecutaron').toBe(procesos * iteraciones);
    expect(reportes.reduce((s, r) => s + r.violaciones, 0), 'ninguna sección crítica simultánea').toBe(0);
    expect(existsSync(ruta), 'el bloqueo queda liberado').toBe(false);
  });
});
