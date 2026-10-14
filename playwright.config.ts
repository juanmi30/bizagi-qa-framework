import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * El proyecto Bizagi activo se elige con la variable PROJECT (la setea tools/run.mjs).
 * Asi un mismo framework corre contra cualquier proyecto Bizagi Cloud:
 *   npm test -- demo        npm test -- colpensiones        npm test -- eficacia
 */
const project = process.env.PROJECT;
if (!project) {
  throw new Error('Falta PROJECT. Ejecuta con: npm test -- <proyecto>  (no uses "npx playwright test" directo).');
}

const projectDir = resolve(__dirname, 'projects', project);
// Ajustes opcionales POR PROYECTO (projects/<p>/playwright.project.json). Sin ese archivo, todo queda como antes.
// Ej.: SDE fuerza ejecución secuencial (casos reales e históricos compartidos) aunque se olvide --workers=1.
// `reporters`: reporters adicionales del proyecto (rutas relativas a projects/<p>/), p. ej. el veredicto E2E de SDE.
const ajustesProyecto: { workers?: number; fullyParallel?: boolean; reporters?: string[] } = existsSync(resolve(projectDir, 'playwright.project.json'))
  ? JSON.parse(readFileSync(resolve(projectDir, 'playwright.project.json'), 'utf8')) : {};
const reportersProyecto = (ajustesProyecto.reporters ?? []).map((r) => [resolve(projectDir, r)] as [string]);
const envPath = resolve(projectDir, '.env');
if (existsSync(envPath)) dotenv.config({ path: envPath });

// CAPTURE=1 graba video + trace + capturas SIEMPRE (para hacer videos de demo o depurar),
// aunque la prueba pase. Sin CAPTURE, solo se conservan cuando algo falla.
const capture = process.env.CAPTURE === '1';
// Evidencia TÉCNICA AFI (Fase 4G): AFI_EVIDENCE_MODE=tecnica|todo conserva video + trace también en PASS.
// Aplica al context/page de los fixtures (los que usa el runner AFI). Nunca es evidencia cliente.
const tecnicaAfi = ['tecnica', 'todo'].includes((process.env.AFI_EVIDENCE_MODE ?? '').trim().toLowerCase());

export default defineConfig({
  testDir: projectDir,
  // Descubre las pruebas del proyecto: las de tests/ (incluye el enganche de plantillas)
  // y los grabados adoptados. Las grabaciones crudas (_crudo/) nunca se ejecutan.
  testMatch: ['tests/**/*.spec.ts', 'grabados/*.spec.ts'],
  testIgnore: ['**/_crudo/**'],
  outputDir: resolve(__dirname, 'test-results', project, 'artifacts'),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: ajustesProyecto.fullyParallel ?? true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: ajustesProyecto.workers ?? (process.env.CI ? 2 : undefined),
  reporter: [
    ['list'],
    ['html', { outputFolder: `test-results/${project}/html-report`, open: 'never' }],
    ['junit', { outputFile: `test-results/${project}/junit/results.xml` }],
    ...reportersProyecto,
  ],
  use: {
    baseURL: process.env.BIZAGI_BASE_URL,
    headless: !!process.env.CI,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: capture ? 'on' : 'only-on-failure',
    video: capture || tecnicaAfi ? 'on' : 'retain-on-failure',
    trace: capture || tecnicaAfi ? 'on' : 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  // Usa Microsoft Edge (Chromium) ya instalado en el equipo, en vez del navegador
  // empaquetado de Playwright. Para volver al empaquetado, quita "channel: 'msedge'".
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'msedge' } }],
});
