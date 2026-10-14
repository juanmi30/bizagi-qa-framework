import { defineConfig, type ReporterDescription } from '@playwright/test';
import { resolve } from 'node:path';

/** Configuración SOLO para la fixture resultados.sintetico.ts (sin navegador, sin QA). La invoca resultados-pipeline.unit.spec.ts. */
const salida = process.env.SDE_SINTETICO_SALIDA ?? resolve(__dirname, 'salida');
const reporters: ReporterDescription[] = [['junit', { outputFile: resolve(salida, 'results.xml') }]];
if (process.env.SDE_SINTETICO_VEREDICTO === '1') reporters.push([resolve(__dirname, '..', '..', '..', 'sde', 'veredicto.ts'), { salida: resolve(salida, 'veredicto.json') }]);

export default defineConfig({
  testDir: __dirname,
  testMatch: 'resultados.sintetico.ts',
  outputDir: resolve(salida, 'artifacts'),
  workers: 1,
  retries: 0,
  reporter: reporters,
});
