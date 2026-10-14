import { expect, type Page, type TestInfo } from '@playwright/test';
import { capturarEvidencia } from '../../../shared/runner/evidence';
import { AfiliacionesPortal } from './afiliacionesPortal';
import { readFile } from 'node:fs/promises';

/** Valores de dirección visibles en soporte CP01 P16; no usa datos históricos de identidad. */
export async function completarDireccionCertificada(page: Page, info: TestInfo): Promise<void> {
  const portal = new AfiliacionesPortal(page);
  await expect(page.getByText('Ingresa la información asociada a la dirección', { exact: true })).toBeVisible();
  for (const [id, opcion] of [['viaPrincipal', 'Avenida Calle'], ['letrasVp', 'A BIS'], ['sectorVp', 'Oeste'], ['letrasVg', 'A BIS']]) {
    const control = page.locator(`#${id}`);
    // Los prefijos visuales de mat-form-field pueden cubrir el centro del select.
    // Abrir mediante teclado respeta la interacción accesible sin force ni cambios DOM.
    await control.focus();
    await control.press('Enter');
    const panel = await portal.abrirCatalogo(control);
    await panel.getByRole('option', { name: opcion, exact: true }).click();
    await expect(panel).toBeHidden();
  }
  for (const [id, valor] of [['numeroVp', '16'], ['numeroVg', '8'], ['numeroPredio', '8']]) {
    await page.locator(`#${id}`).fill(valor);
    await expect(page.locator(`#${id}`)).toHaveValue(valor);
  }
  await page.getByText('Ingresa la información asociada a la dirección', { exact: true }).click();
  await expect(page.locator('#btn-independiente-dir-continuar')).toBeEnabled();
  await capturarEvidencia(page, info, 'CP01_P17_direccion_certificada');
  await page.locator('#btn-independiente-dir-continuar').click();
  await expect(page.locator('#viaPrincipal')).toBeHidden({ timeout: 45_000 });
  await capturarEvidencia(page, info, 'CP01_P17_siguiente_pantalla');
  await info.attach('P17-controles-siguientes.json', {
    body: JSON.stringify(await page.locator('input,select,mat-select,button').evaluateAll(elements => elements.map(e => ({
      tag: e.tagName, id: e.id, name: e.getAttribute('aria-label'),
      formControl: e.getAttribute('formcontrolname'), type: e.getAttribute('type'),
      required: e.hasAttribute('required'),
    })))), contentType: 'application/json',
  });
}

export async function descargarFormularioFinal(page: Page, info: TestInfo): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Documentación', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Formulario para independiente', { exact: true })).toBeVisible();
  const pendiente = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('link', { name: 'Descargar', exact: true }).click();
  const descarga = await pendiente;
  const destino = info.outputPath('formulario-final.pdf');
  await descarga.saveAs(destino);
  expect(await descarga.failure()).toBeNull();
  const bytes = await readFile(destino);
  expect(bytes.subarray(0, 5).toString('ascii'), 'Formulario descargado es PDF').toBe('%PDF-');
  await info.attach('formulario-final.pdf', { path: destino, contentType: 'application/pdf' });
  return destino;
}
