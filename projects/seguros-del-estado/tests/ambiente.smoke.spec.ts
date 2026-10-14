import { test, expect } from '@playwright/test';
import { SdeObjects } from '../baseObjects/sde.objects';

/**
 * Smoke REAL del ambiente QA SDE (no requiere credenciales; no escribe usuario ni clave).
 * Cubre la parte observable sin sesión del Paso 2 de las matrices ("el ambiente se encuentra
 * disponible"). "Permite iniciar la radicación" exige sesión → tests/login.spec.ts.
 */
const URL_MATRIZ = 'https://test-aiprocesos-sde.bizagi.com/'; // citada en ambos Excel
const URL_QA = process.env.BIZAGI_BASE_URL || URL_MATRIZ;

test.describe('Ambiente QA SDE @smoke @ambiente', () => {
  test('el Work Portal QA responde y presenta login por dominio', async ({ page }, testInfo) => {
    const respuesta = await page.goto(URL_QA, { waitUntil: 'domcontentloaded' });
    expect(respuesta?.status(), 'HTTP del Work Portal').toBeLessThan(400);
    const dominio = page.locator(SdeObjects.login.dominio);
    await expect(dominio).toBeVisible({ timeout: 45_000 });
    const opciones = await dominio.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v && v !== '-1'));
    expect(opciones.length, 'dominios seleccionables').toBeGreaterThan(0);
    testInfo.annotations.push({ type: 'dominios', description: opciones.join(', ') });
  });

  test('al elegir un dominio aparecen usuario, clave e Ingresar (sin enviar credenciales)', async ({ page }) => {
    await page.goto(URL_QA, { waitUntil: 'domcontentloaded' });
    const dominio = page.locator(SdeObjects.login.dominio);
    await expect(dominio).toBeVisible({ timeout: 45_000 });
    const primero = await dominio.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).find((v) => v && v !== '-1'));
    await dominio.selectOption(primero!);
    await expect(page.locator(SdeObjects.login.usuario)).toBeVisible();
    await expect(page.locator(SdeObjects.login.clave)).toBeVisible();
    await expect(page.locator(SdeObjects.login.ingresar)).toBeVisible();
    await expect(page.locator(SdeObjects.login.usuario)).toHaveValue('');
  });
});
