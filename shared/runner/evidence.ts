import { Page, TestInfo } from '@playwright/test';

/**
 * Evidencia: toma un screenshot y lo adjunta al reporte HTML de Playwright,
 * con un nombre claro (ej. proceso_actividad_paso). Nunca detiene la prueba:
 * si la captura falla, sigue.
 */
export async function capturarEvidencia(page: Page, testInfo: TestInfo, nombre: string): Promise<void> {
  const seguro = nombre.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80).replace(/^_+|_+$/g, '');
  const foto = await page.screenshot().catch(() => null);
  if (foto) {
    await testInfo.attach(seguro || 'evidencia', { body: foto, contentType: 'image/png' });
  }
}
