import { test } from '@playwright/test';
import { relative, resolve } from 'node:path';
import { generarSoporteHu } from '../sde/certificacion';

/**
 * Generación del SOPORTE DE CERTIFICACIÓN CLIENTE de una HU (un único Word con todos sus CP) desde resultados YA
 * guardados. No abre navegador ni Bizagi: funciona aunque los casos hayan vencido. Configuración por HU en
 * certificacion/<HU>.json. Salida persistente (fuera de Git y fuera de lo que limpia Playwright):
 * test-results/seguros-del-estado/soportes/<HU>/<fecha-hora>/.
 * Uso (PowerShell, raíz del repo):  $env:SDE_SOPORTE_HU='HU06'; node tools/run.mjs seguros-del-estado --grep "@soporte-hu"
 */
const HU = process.env.SDE_SOPORTE_HU;
const DIR_PROYECTO = resolve(__dirname, '..');
const RAIZ = resolve(DIR_PROYECTO, '..', '..');

test('soporte de certificación cliente de una HU @soporte-hu', () => {
  test.skip(!HU || !/^HU\d+$/.test(HU), 'Defina SDE_SOPORTE_HU=<HU>, p. ej. HU06.');
  const { docx, casos } = generarSoporteHu({ raiz: RAIZ, dirProyecto: DIR_PROYECTO, hu: HU! });
  const total = casos.reduce((n, c) => n + c.pasos.length, 0);
  const pass = casos.reduce((n, c) => n + (c.resumen.PASS ?? 0), 0);
  console.log(`SOPORTE ${HU}: ${casos.length} CP, ${pass}/${total} PASS`);
  for (const c of casos) console.log(`  ${c.cp} caso ${c.numeroCaso}: ${JSON.stringify(c.resumen)} · capturas ${c.pasos.filter((p) => p.capturas.length).length}/${c.pasos.length}`);
  console.log(`SOPORTE docx: ${relative(RAIZ, docx).split('\\').join('/')}`);
});
