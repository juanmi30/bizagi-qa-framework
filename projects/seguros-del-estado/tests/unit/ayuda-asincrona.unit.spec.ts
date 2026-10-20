import { test, expect } from '@playwright/test';
import { cargarRegistro } from '../../sde/datos';
import { crearContexto } from '../../sde/ejecutor';
import { crearCapacidadesUi, type UiEntorno } from '../../sde/capacidades';

/**
 * Precreación del 2026-10-20 (Cumplimiento): Bizagi actualiza el texto de ayuda por reglas DESPUÉS de elegir la modalidad.
 * texto_exacto espera, acotado, a que aparezca la línea; si nunca aparece sigue siendo FAIL. DOM sintético.
 */
const ui = (page: import('@playwright/test').Page): UiEntorno =>
  ({ browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined });
const LINEA = 'Masivo: Solicitud asociada a más de una póliza de cumplimiento y/o RCE.';
const verificar = (page: import('@playwright/test').Page) => crearCapacidadesUi(ui(page)).verificar({ texto_exacto: LINEA }, crearContexto(cargarRegistro(), {}, 'u'));

test.describe('texto_exacto con ayuda asíncrona @unit', () => {
  test('la línea aparece tras la regla: PASS', async ({ page }) => {
    await page.setContent(`<label id="a">Masivo: Solicitud asociada a más de una póliza.</label>
      <script>setTimeout(() => { document.getElementById('a').innerHTML = 'Individual: Solicitud asociada a una póliza de cumplimiento y/o RCE.<br>${LINEA}'; }, 1500);</script>`);
    expect(await verificar(page)).toMatchObject({ ok: true });
  });
  test('la línea nunca aparece: FAIL tras la espera acotada', async ({ page }) => {
    await page.setContent('<label>Masivo: Solicitud asociada a más de una póliza.</label>');
    expect(await verificar(page)).toMatchObject({ ok: false });
  });
  test('el texto queda dentro de otra línea (sin salto): FAIL', async ({ page }) => {
    await page.setContent(`<label>Individual: Solicitud asociada a una póliza de cumplimiento y/o RCE. ${LINEA}</label>`);
    const r = await verificar(page);
    expect(r).toMatchObject({ ok: false, detalle: expect.stringContaining('DENTRO de otra línea') });
  });
});
