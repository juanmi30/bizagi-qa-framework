import { test } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { BpmEngine, InboxObjects } from '@shared';

/**
 * EXPLORACIÓN temporal (C1): entra a Colsubsidio y pulsa "Nuevo Caso" para ver cómo es la
 * selección de proceso (¿categoría? ¿nombre exacto?) y la primera pantalla. NO crea nada aún.
 * Correr:  npm test -- colsubsidio --headed --grep @explorar   |  Borrar al terminar.
 */
const OUT = resolve(process.cwd(), 'test-results', 'explorar-crd');

test('@explorar crear caso CRD', async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(OUT, { recursive: true });

  const engine = new BpmEngine(page);
  await engine.iniciarSesion('admin');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.screenshot({ path: `${OUT}/01-inbox.png`, fullPage: false });

  await page.locator(InboxObjects.newCaseButton).first().click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/02-nuevo-caso.png`, fullPage: true });
  writeFileSync(`${OUT}/02-nuevo-caso.txt`, await page.locator('body').ariaSnapshot(), 'utf8');

  // Elegir el proceso "Gestión de Créditos" y ver la primera pantalla (agencia + identificación).
  await page.getByText('Gestión de Créditos', { exact: false }).first().click();
  await page.locator('.k-loading-mask, [class*="loading" i], [class*="spinner" i]').first()
    .waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/03-primera-pantalla.png`, fullPage: true });
  writeFileSync(`${OUT}/03-primera-pantalla.txt`, await page.locator('body').ariaSnapshot(), 'utf8');

  // Llenar el diálogo de creación y crear el caso.
  await page.getByRole('radio', { name: 'No', exact: true }).first().check({ force: true }).catch(() => undefined);
  await page.getByRole('combobox', { name: 'Tipo Identificación:' }).first().click().catch(() => undefined);
  await page.waitForTimeout(600);
  await page.getByText('Cédula de Ciudadanía', { exact: true }).first().click().catch(() => undefined);
  await page.getByRole('textbox', { name: 'Número Identificación:' }).first().fill('1018487734');
  await page.screenshot({ path: `${OUT}/04-dialogo-lleno.png`, fullPage: true });

  // Tras "Crear": puede salir la validación fugaz (documento con solicitud activa) O avanzar a
  // "Registrar información inicial". Se detecta lo que ocurra primero (poll cada 300 ms, hasta ~90 s).
  const cuerpo = page.locator('.ui-bizagi-notifications-content, .ui-bizagi-notifications-container li, [role="alert"]');
  const dialog = page.getByRole('dialog', { name: 'Nuevo Caso' });
  const destino = page.getByText('Registrar información inicial', { exact: false }).first();
  await page.getByRole('button', { name: 'Crear' }).first().click();
  let estado = 'timeout';
  let msg = '';
  for (let i = 0; i < 300; i++) { // ~90 s
    const t = (await cuerpo.allInnerTexts().catch(() => [] as string[]))
      .map((x) => x.replace(/\s+/g, ' ').trim())
      .filter((x) => x.length > 5 && !/^Debe revisar/i.test(x)).join(' || ');
    if (t) { msg = t; estado = 'VALIDACION'; break; }
    if (await destino.isVisible().catch(() => false)) { estado = 'AVANZO'; break; }
    if (!(await dialog.isVisible().catch(() => false)) && i > 6) { estado = 'AVANZO(dialogo cerrado)'; break; }
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/06-tras-crear.png`, fullPage: true });
  writeFileSync(
    `${OUT}/06-tras-crear.txt`,
    `estado: ${estado}\nvalidacion: ${msg || '(ninguna)'}\n\n` + (await page.locator('body').ariaSnapshot()),
    'utf8',
  );
});
