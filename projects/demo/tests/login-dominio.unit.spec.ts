import { test, expect, type Page } from '@playwright/test';
import { LoginActions } from '../../../shared/core/LoginActions';
import { BpmEngine } from '../../../shared/runner/BpmEngine';

/**
 * Regresión del dominio de login por usuario lógico (DOMINIO_<clave>).
 * Red simulada con page.route: sin Bizagi real. El formulario imita un portal de dos pasos:
 * primero se elige el dominio (el select se oculta) y luego aparecen usuario/clave.
 */

test.use({ baseURL: 'https://portal-bizagi.test' });

const FORMULARIO = `
  <select id="domain"><option value="-1">Seleccione un dominio</option>
    <option value="domain">Bizagi (domain)</option><option value="externos">Externos (externos)</option>
    <option value="corp.test">corp (corp.test)</option></select>
  <div id="credenciales" hidden><input id="user"><input id="password" type="password">
    <button id="btn-login" type="button">Ingresar</button></div>
  <div id="inbox" hidden>Bandeja de entrada</div>
  <script>(() => {
    window.envio = null;
    const dom = document.getElementById('domain');
    dom.addEventListener('change', () => { dom.hidden = true; document.getElementById('credenciales').hidden = false; });
    document.getElementById('btn-login').onclick = () => {
      window.envio = { dominio: dom.value, usuario: document.getElementById('user').value };
      document.getElementById('inbox').hidden = false;
    };
  })();</script>`;

// Variante sin selector de dominio (portales que no lo usan): el comportamiento previo no cambia.
const SIN_DOMINIO = `
  <input id="UserName"><input id="Password" type="password"><button id="btnLogin" type="button">Ingresar</button>
  <div id="inbox" hidden>Bandeja de entrada</div>
  <script>window.envio = null; document.getElementById('btnLogin').onclick = () => {
    window.envio = { dominio: null, usuario: document.getElementById('UserName').value };
    document.getElementById('inbox').hidden = false; };</script>`;

async function portal(page: Page, html: string): Promise<void> {
  await page.route('**/*', (route) => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: 'text/html', body: html })
    : route.fulfill({ status: 404, body: '' }));
}
const envio = (page: Page) => page.evaluate(() => (window as unknown as { envio: { dominio: string | null; usuario: string } }).envio);

const VARIABLES = ['BIZAGI_LOGIN_DOMINIO', 'BIZAGI_LOGIN_MODO', 'USUARIO_qa1', 'CLAVE_qa1', 'DOMINIO_qa1'];

test.describe('LoginActions/BpmEngine — dominio por usuario @unit', () => {
  let respaldo: Record<string, string | undefined> = {};
  test.beforeEach(() => {
    respaldo = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
    for (const v of VARIABLES) delete process.env[v];
  });
  test.afterEach(() => {
    for (const v of VARIABLES) {
      if (respaldo[v] === undefined) delete process.env[v];
      else process.env[v] = respaldo[v];
    }
  });

  test('1. firma previa (2 argumentos) sin dominio: no toca selector y envía una vez', async ({ page }) => {
    await portal(page, SIN_DOMINIO);
    await new LoginActions(page).login('qa', 'x');
    expect(await envio(page)).toEqual({ dominio: null, usuario: 'qa' });
  });

  test('2. sin argumento usa BIZAGI_LOGIN_DOMINIO (comportamiento previo)', async ({ page }) => {
    process.env.BIZAGI_LOGIN_DOMINIO = 'externos';
    await portal(page, FORMULARIO);
    await new LoginActions(page).login('qa', 'x');
    expect(await envio(page)).toEqual({ dominio: 'externos', usuario: 'qa' });
  });

  test('3. el dominio del usuario tiene prioridad sobre el global', async ({ page }) => {
    process.env.BIZAGI_LOGIN_DOMINIO = 'externos';
    await portal(page, FORMULARIO);
    await new LoginActions(page).login('qa', 'x', 'corp.test');
    expect(await envio(page)).toEqual({ dominio: 'corp.test', usuario: 'qa' });
  });

  test('4. argumento vacío cae al global (no deja el dominio sin elegir)', async ({ page }) => {
    process.env.BIZAGI_LOGIN_DOMINIO = 'domain';
    await portal(page, FORMULARIO);
    await new LoginActions(page).login('qa', 'x', '');
    expect(await envio(page)).toEqual({ dominio: 'domain', usuario: 'qa' });
  });

  test('5. BpmEngine modo estandar pasa DOMINIO_<clave> del .env', async ({ page }) => {
    Object.assign(process.env, {
      BIZAGI_LOGIN_MODO: 'estandar', BIZAGI_LOGIN_DOMINIO: 'externos',
      USUARIO_qa1: 'analista.qa', CLAVE_qa1: 'x', DOMINIO_qa1: 'corp.test',
    });
    await portal(page, FORMULARIO);
    await new BpmEngine(page).iniciarSesion('qa1');
    expect(await envio(page)).toEqual({ dominio: 'corp.test', usuario: 'analista.qa' });
  });

  test('6. BpmEngine sin DOMINIO_<clave> conserva el global', async ({ page }) => {
    Object.assign(process.env, { BIZAGI_LOGIN_MODO: 'estandar', BIZAGI_LOGIN_DOMINIO: 'externos', USUARIO_qa1: 'radicador.qa', CLAVE_qa1: 'x' });
    await portal(page, FORMULARIO);
    await new BpmEngine(page).iniciarSesion('qa1');
    expect(await envio(page)).toEqual({ dominio: 'externos', usuario: 'radicador.qa' });
  });
});
