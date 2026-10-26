import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * P2 de la auditoría de Work sobre el PR #1: tools/run.mjs debe entregar a Playwright los argumentos LITERALES (sin que
 * un shell los parta ni expanda %VARIABLE%). Argumentos exclusivamente sintéticos; un receptor sustituye a Playwright
 * (BIZAGI_RUNNER_CLI) y registra lo que recibe. Las pruebas con el CLI real solo usan --list: no ejecutan nada.
 */

const RAIZ = resolve(__dirname, '..', '..', '..', '..');
const RECEPTOR = resolve(__dirname, '..', 'fixtures', 'runner', 'receptor.cjs');
const VARIABLE = 'SDE_PRUEBA_RUNNER_EXPANSION';

const ARGUMENTOS = [
  '--grep', 'dos palabras con espacios',
  '--grep-invert', 'con "comillas" dobles y \'simples\'',
  `%${VARIABLE}%`,
  `prefijo%${VARIABLE}%sufijo`,
  `!${VARIABLE}!`,
  '%PATH%',
  '& | < > ^ ( ) ; , = `x` $HOME $(whoami) * ?',
  '@unit|@smoke',
  '--workers=1', '--workers', '1',
  '--trace', 'off', '--trace=on',
  'C:\\Ruta con espacios\\carpeta final\\',
  'D:\\Proyectos QA\\carpeta con espacios\\archivo de prueba.spec.ts',
  'termina en barra invertida\\',
  'barra\\"comilla',
  '',
];

function recibido(args: string[], salida: string): string[] {
  const r = spawnSync(process.execPath, ['tools/run.mjs', 'seguros-del-estado', ...args], {
    cwd: RAIZ, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, BIZAGI_RUNNER_CLI: RECEPTOR, RECEPTOR_SALIDA: salida, [VARIABLE]: 'EXPANDIDO' },
  });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(readFileSync(salida, 'utf8')) as string[];
}

test.describe('P2 — el runner conserva literalmente los argumentos (Windows sin shell) @unit', () => {
  test('cada argumento llega exactamente igual al CLI: espacios, comillas, %VARIABLE%, símbolos de shell, rutas, --grep, --workers, --trace', ({}, testInfo) => {
    expect(recibido(ARGUMENTOS, testInfo.outputPath('recibido.json'))).toEqual(['test', ...ARGUMENTOS]);
  });

  test('los parámetros propios del runner se consumen y el resto llega intacto', ({}, testInfo) => {
    const r = recibido(['--fuente', 'plantillas', '--como', 'x', '--grep', `%${VARIABLE}% y más`], testInfo.outputPath('recibido.json'));
    expect(r).toEqual(['test', '--grep', `%${VARIABLE}% y más`]);
  });

  test('control: con shell en Windows (runner anterior) %VARIABLE% se expandía aunque se entrecomillara', ({}, testInfo) => {
    test.skip(process.platform !== 'win32', 'la expansión %VAR% es propia de cmd.exe');
    const salida = testInfo.outputPath('anterior.json');
    // Mismo entrecomillado que el runner anterior (commit 6b4e35e).
    const citar = (a: string) => (/[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
    spawnSync(`"${process.execPath}"`, [RECEPTOR, `%${VARIABLE}%`, `"%${VARIABLE}%" con espacios`].map(citar), {
      encoding: 'utf8', shell: true, env: { ...process.env, RECEPTOR_SALIDA: salida, [VARIABLE]: 'EXPANDIDO' },
    });
    const anterior = JSON.parse(readFileSync(salida, 'utf8')) as string[];
    expect(anterior.join(' ')).toContain('EXPANDIDO');
    expect(anterior.join(' ')).not.toContain(`%${VARIABLE}%`);
  });

  test('con el CLI real de Playwright (--list, no ejecuta): --grep, --workers, --trace y filtro de archivo funcionan', () => {
    const r = spawnSync(process.execPath, ['tools/run.mjs', 'seguros-del-estado', '--list', '--reporter=list', '--grep', '@unit', '--workers=1', '--trace', 'off', 'tests/unit/nit.unit.spec.ts'],
      { cwd: RAIZ, encoding: 'utf8', timeout: 120_000 });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Total: \d+ tests? in 1 file/);
    expect(r.stdout).not.toMatch(/\.real\.spec|verticales|variantes/);
    // Un %VARIABLE% no se expande: como grep literal no coincide con ninguna prueba.
    const literal = spawnSync(process.execPath, ['tools/run.mjs', 'seguros-del-estado', '--list', '--reporter=list', '--grep', '%PATH%'],
      { cwd: RAIZ, encoding: 'utf8', timeout: 120_000 });
    expect(`${literal.stdout}\n${literal.stderr}`).toMatch(/Total: 0 tests|No tests found/);
  });
});
