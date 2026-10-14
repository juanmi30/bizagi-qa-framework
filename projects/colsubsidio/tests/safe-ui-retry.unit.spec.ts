import { test, expect, errors } from '@playwright/test';
import { esErrorTransitorioUi, retrySafeUiOperation } from '../../../shared/core/SafeUiRetry';

/** Primitiva de reintento seguro sin Bizagi QA: errores sintéticos y un DOM local que se rerenderiza. */
test.describe('retrySafeUiOperation', () => {
  test('clasifica solo errores transitorios de interacción/navegación', () => {
    expect(esErrorTransitorioUi(new errors.TimeoutError('locator.click: Timeout 15000ms exceeded'))).toBe(true);
    expect(esErrorTransitorioUi(new Error('locator.click: Element is not attached to the DOM'))).toBe(true);
    expect(esErrorTransitorioUi(new Error('Execution context was destroyed, most likely because of a navigation'))).toBe(true);
    expect(esErrorTransitorioUi(new Error('strict mode violation: getByText(\'Casos\') resolved to 2 elements'))).toBe(false);
    expect(esErrorTransitorioUi(new Error('Target page, context or browser has been closed'))).toBe(false);
    expect(esErrorTransitorioUi(new Error('expect(locator).toBeVisible() failed'))).toBe(false);
    expect(esErrorTransitorioUi('texto')).toBe(false);
  });

  test('reintenta tras detached y retorna al alcanzar la postcondición', async () => {
    let intentos = 0, destino = false;
    const usados = await retrySafeUiOperation({
      nombre: 'sintético', intervalo: 10, esperaEstado: 20, timeout: 2_000,
      accion: async () => {
        if (++intentos === 1) throw new Error('locator.click: Element is not attached to the DOM');
        destino = true;
      },
      estadoExitoso: async () => destino,
    });
    expect(usados).toBe(2);
    expect(intentos).toBe(2);
  });

  test('repite la acción si la postcondición no aparece', async () => {
    let intentos = 0;
    const usados = await retrySafeUiOperation({
      nombre: 'sintético', intervalo: 10, esperaEstado: 20, timeout: 2_000,
      accion: async () => { intentos++; },
      estadoExitoso: async () => intentos >= 3,
    });
    expect(usados).toBe(3);
  });

  test('no reintenta errores no transitorios', async () => {
    let intentos = 0;
    await expect(retrySafeUiOperation({
      nombre: 'sintético', intervalo: 10, timeout: 2_000,
      accion: async () => { intentos++; throw new Error('strict mode violation'); },
      estadoExitoso: async () => false,
    })).rejects.toThrow('strict mode violation');
    expect(intentos).toBe(1);
  });

  test('falla con el nombre de la operación al agotar el presupuesto', async () => {
    await expect(retrySafeUiOperation({
      nombre: 'Abrir destino inexistente', intervalo: 10, esperaEstado: 20, timeout: 200,
      accion: async () => { throw new errors.TimeoutError('locator.click: Timeout 10ms exceeded'); },
      estadoExitoso: async () => false,
    })).rejects.toThrow(/Abrir destino inexistente: no se alcanzó el estado destino/);
  });

  test('resuelve un locator nuevo cuando la SPA reemplaza el nodo', async ({ page }) => {
    // El primer click rerenderiza el menú (nodo viejo desprendido) sin abrir el diálogo.
    await page.setContent(`
      <div id="menu"></div><div role="dialog" aria-label="Casos" hidden>Casos</div>
      <script>
        let clicks = 0;
        function render() {
          const b = document.createElement('button'); b.textContent = 'Casos';
          b.onclick = () => { if (++clicks === 1) render(); else document.querySelector('[role=dialog]').hidden = false; };
          document.getElementById('menu').replaceChildren(b);
        }
        render();
      </script>`);
    const dialogo = page.getByRole('dialog', { name: 'Casos', exact: true });
    const usados = await retrySafeUiOperation({
      nombre: 'Abrir Casos local', intervalo: 10, esperaEstado: 200, timeout: 5_000,
      accion: () => page.locator('#menu').getByRole('button', { name: 'Casos' }).click({ timeout: 1_000 }),
      estadoExitoso: () => dialogo.isVisible(),
    });
    expect(usados).toBe(2);
    await expect(dialogo).toBeVisible();
  });
});
