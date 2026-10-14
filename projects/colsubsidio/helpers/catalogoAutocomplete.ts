import { expect, type Locator } from '@playwright/test';
import { normalizarEspacios } from './afiliacionesPortal';

/** No declara un catálogo completo si el DOM utiliza virtualización. */
export async function catalogoEstable(panel: Locator): Promise<string[]> {
  await expect(panel).toBeVisible();
  expect(await panel.locator('cdk-virtual-scroll-viewport,.cdk-virtual-scroll-content-wrapper').count(), 'Catálogo completo, sin virtualización').toBe(0);
  let anterior = '', iguales = 0;
  let opciones: string[] = [];
  await expect.poll(async () => {
    opciones = (await panel.getByRole('option').allTextContents()).map(normalizarEspacios);
    const actual = JSON.stringify(opciones);
    iguales = opciones.length && actual === anterior ? iguales + 1 : 0;
    anterior = actual;
    return iguales;
  }, { timeout: 30_000, intervals: [300, 500, 1_000] }).toBeGreaterThanOrEqual(2);
  return opciones;
}
