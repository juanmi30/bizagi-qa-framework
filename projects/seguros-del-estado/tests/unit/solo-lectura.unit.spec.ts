import { test, expect } from '@playwright/test';
import { cargarRegistro } from '../../sde/datos';
import { crearContexto } from '../../sde/ejecutor';
import { crearCapacidadesUi, protegerContraCreacion, type UiEntorno } from '../../sde/capacidades';

/** Protección "solo lectura": un diagnóstico nunca puede crear casos, lo dispare quien lo dispare. Portal sintético. */

const reg = cargarRegistro();
const POST = (accion: string) => `fetch('/Rest/Handlers/MultiAction', { method: 'POST', body: JSON.stringify([{ action: '${accion}' }]) })
  .then((r) => r.status).catch(() => 'BLOQUEADO')`;

test.describe('Modo solo lectura: CREATENEWCASE nunca llega a Bizagi @unit', () => {
  test('la red aborta CREATENEWCASE y deja pasar las demás acciones del formulario', async ({ page, context }) => {
    let llegaronAlServidor: string[] = [];
    await context.route('https://qa.ficticio.test/**', (route) => {
      const cuerpo = route.request().postData() ?? '';
      if (cuerpo) llegaronAlServidor.push(cuerpo);
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>portal</p>' });
    });
    const guardia = await protegerContraCreacion(context);
    await page.goto('https://qa.ficticio.test/');
    expect(await page.evaluate(POST('SUBMITDATA'))).toBe(200);
    expect(await page.evaluate(POST('CREATENEWCASE'))).toBe('BLOQUEADO');
    expect(guardia.bloqueados()).toBe(1);
    expect(llegaronAlServidor.some((c) => c.includes('CREATENEWCASE'))).toBe(false);
    expect(llegaronAlServidor.some((c) => c.includes('SUBMITDATA'))).toBe(true);
    llegaronAlServidor = [];
  });

  test('pulsar "Crear" en modo solo lectura falla ANTES del clic', async ({ page }) => {
    await page.setContent('<div class="ui-bizagi-button-container"><button id="crear" onclick="window.pulsado=true">Crear</button></div>');
    const ui: UiEntorno = { browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined, soloLectura: true };
    const ctx = crearContexto(reg, {}, 'u');
    const err = await crearCapacidadesUi(ui).capacidades.pulsar({ matriz: [8], hacer: 'pulsar', boton: 'Crear', capturar_numero_caso: true }, ctx).catch((e) => (e as Error).message);
    expect(err).toMatch(/MODO SOLO LECTURA/);
    expect(await page.evaluate(() => (window as unknown as { pulsado?: boolean }).pulsado ?? false)).toBe(false);
  });

  test('control: sin modo solo lectura, pulsar un botón normal funciona', async ({ page }) => {
    await page.setContent('<div class="ui-bizagi-button-container"><button onclick="window.pulsado=true">Siguiente</button></div>');
    const ui: UiEntorno = { browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined };
    await crearCapacidadesUi(ui).capacidades.pulsar({ matriz: [8], hacer: 'pulsar', boton: 'Siguiente' }, crearContexto(reg, {}, 'u'));
    expect(await page.evaluate(() => (window as unknown as { pulsado?: boolean }).pulsado)).toBe(true);
  });
});
