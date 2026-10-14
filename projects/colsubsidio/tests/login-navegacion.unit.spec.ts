import { test, expect, type Page, type Route } from '@playwright/test';
import { LoginActions } from '../../../shared/core/LoginActions';
import { esErrorTransitorioUi } from '../../../shared/core/SafeUiRetry';

/** Navegación inicial al Work Portal con DNS transitorio. Red simulada con page.route: sin Bizagi ni DNS real. */

test.use({ baseURL: 'https://portal-bizagi.test' });

const FORMULARIO = `
  <form onsubmit="return false"><input id="UserName"><input id="Password" type="password">
    <button id="btnLogin" type="button">Ingresar</button></form>
  <div id="inbox" hidden>Bandeja</div>
  <script>window.envios = 0; document.getElementById('btnLogin').onclick = () => { window.envios++; document.getElementById('inbox').hidden = false; };</script>`;
const SESION = FORMULARIO.replace('<div id="inbox" hidden>', '<div id="inbox">');

/**
 * Cada respuesta corresponde a una petición de documento; la última se repite.
 * Devuelve cuántas veces el código llamó page.goto: Chromium puede recargar por su cuenta su
 * página de error de red, así que las peticiones no equivalen a reintentos del framework.
 */
async function red(page: Page, respuestas: ('dns' | 'denegado' | 'login' | 'sesion')[]): Promise<() => number> {
  let documentos = 0, gotos = 0;
  const goto = page.goto.bind(page);
  page.goto = ((...args: Parameters<Page['goto']>) => { gotos++; return goto(...args); }) as Page['goto'];
  await page.route('**/*', (route: Route) => {
    // favicon y demás subrecursos no son navegaciones.
    if (!route.request().isNavigationRequest()) return route.fulfill({ status: 404, body: '' });
    const r = respuestas[Math.min(documentos++, respuestas.length - 1)];
    if (r === 'dns') return route.abort('namenotresolved');
    if (r === 'denegado') return route.abort('accessdenied');
    return route.fulfill({ contentType: 'text/html', body: r === 'sesion' ? SESION : FORMULARIO });
  });
  return () => gotos;
}
const envios = (page: Page) => page.evaluate(() => (window as unknown as { envios: number }).envios);

test.describe('LoginActions — navegación inicial resiliente', () => {
  // El dominio del .env del proyecto no aplica al formulario local.
  let dominio: string | undefined;
  test.beforeEach(() => { dominio = process.env.BIZAGI_LOGIN_DOMINIO; delete process.env.BIZAGI_LOGIN_DOMINIO; });
  test.afterEach(() => { if (dominio !== undefined) process.env.BIZAGI_LOGIN_DOMINIO = dominio; });

  test('1. ERR_NAME_NOT_RESOLVED es transitorio; ERR_ACCESS_DENIED y cierres no', () => {
    expect(esErrorTransitorioUi(new Error('page.goto: net::ERR_NAME_NOT_RESOLVED at https://portal-bizagi.test/'))).toBe(true);
    expect(esErrorTransitorioUi(new Error('page.goto: net::ERR_ACCESS_DENIED at https://portal-bizagi.test/'))).toBe(false);
    expect(esErrorTransitorioUi(new Error('page.goto: net::ERR_NAME_NOT_RESOLVED; Target page, context or browser has been closed'))).toBe(false);
  });

  test('2. navega al primer intento y envía credenciales una vez', async ({ page }) => {
    const navegaciones = await red(page, ['login']);
    await new LoginActions(page).login('qa', 'x');
    await expect(page.locator('#inbox')).toBeVisible();
    expect([navegaciones(), await envios(page)]).toEqual([1, 1]);
  });

  test('3. primer goto con DNS caído, el segundo funciona; submit una sola vez', async ({ page }) => {
    const navegaciones = await red(page, ['dns', 'login']);
    await new LoginActions(page).login('qa', 'x');
    await expect(page.locator('#UserName')).toHaveValue('qa');
    expect([navegaciones(), await envios(page)]).toEqual([2, 1]);
  });

  test('4. DNS caído persistente agota el presupuesto con error claro y causa conservada', async ({ page }) => {
    const navegaciones = await red(page, ['dns']);
    const inicio = Date.now();
    const error = await new LoginActions(page).navegarAlPortal({ timeout: 1_500, intervalo: 100 })
      .then(() => new Error('no falló'), (e: Error) => e);
    expect(Date.now() - inicio).toBeLessThan(4_000);
    expect(error.message).toMatch(/^Navegar al Work Portal de Bizagi: no se alcanzó el estado destino tras \d+ intento\(s\) en 1500 ms\. Último: .*net::ERR_NAME_NOT_RESOLVED/);
    expect((error.cause as Error).message).toContain('net::ERR_NAME_NOT_RESOLVED');
    expect(navegaciones()).toBeGreaterThan(1);
  });

  test('5. error de red no transitorio no se reintenta', async ({ page }) => {
    const navegaciones = await red(page, ['denegado', 'login']);
    await expect(new LoginActions(page).login('qa', 'x')).rejects.toThrow('net::ERR_ACCESS_DENIED');
    expect(navegaciones()).toBe(1);
  });

  test('6. sesión ya disponible: no escribe ni envía credenciales', async ({ page }) => {
    await red(page, ['dns', 'sesion']);
    await new LoginActions(page).login('qa', 'x');
    await expect(page.locator('#UserName')).toHaveValue('');
    expect(await envios(page)).toBe(0);
  });
});
