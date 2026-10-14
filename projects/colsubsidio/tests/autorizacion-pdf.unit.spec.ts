import { test, expect, type Page } from '@playwright/test';
import { AfiliacionesPortal } from '../helpers/afiliacionesPortal';

/** autorizar(): modal PDF que tarda en renderizar o cabe completo. DOM mínimo; sin Bizagi. */

const TITULO = 'Autorización para el tratamiento de datos';

interface Visor {
  /** ms hasta que el PDF "renderiza" su contenido largo; null = nunca (queda corto). */
  renderTras: number | null;
  /** Aceptar habilitado desde el inicio (documento completo visible). */
  aceptarHabilitado?: boolean;
}

function modal(v: Visor): string {
  return `
    <style>.dlg{position:fixed;top:10px;left:10px;width:300px;background:#fff;z-index:10}</style>
    <input type="checkbox" formcontrolname="terminos">
    <div role="dialog" aria-label="${TITULO}" hidden class="dlg">
      <div class="ng2-pdf-viewer-container" style="height:80px;overflow:auto"><div id="doc" style="height:40px">Documento</div></div>
      <button class="${v.aceptarHabilitado ? '' : 'disabled'}">Aceptar</button>
    </div>
    <script>(() => {
      const v = ${JSON.stringify(v)};
      window.clicsCasilla = 0; window.clicsAceptar = 0;
      const c = document.querySelector('input[type=checkbox]'), dialogo = document.querySelector('[role=dialog]');
      const visor = dialogo.querySelector('.ng2-pdf-viewer-container'), aceptar = dialogo.querySelector('button');
      c.addEventListener('click', e => {
        window.clicsCasilla++;
        if (c.dataset.aceptado) return;
        e.preventDefault(); dialogo.hidden = false;
        if (v.renderTras !== null) setTimeout(() => { document.getElementById('doc').style.height = '1500px'; }, v.renderTras);
      });
      visor.addEventListener('scroll', () => {
        if (visor.scrollHeight - visor.clientHeight - visor.scrollTop < 3) aceptar.classList.remove('disabled');
      });
      aceptar.addEventListener('click', () => {
        window.clicsAceptar++;
        if (aceptar.classList.contains('disabled')) return;
        dialogo.hidden = true; c.dataset.aceptado = '1'; c.checked = true;
      });
    })();</script>`;
}

/** Mismo flujo con presupuesto corto: la API pública de autorizar() no cambia. */
class PortalRapido extends AfiliacionesPortal {
  constructor(page: Page, timeout = 6_000) { super(page); this.presupuestoAutorizacion = { timeout, intervals: [100, 200] }; }
}

const clics = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { clicsCasilla: number; clicsAceptar: number };
  return [w.clicsCasilla, w.clicsAceptar];
});

async function autorizar(page: Page, v: Visor, timeout?: number) {
  await page.setContent(modal(v));
  await new PortalRapido(page, timeout).autorizar('terminos', true, TITULO);
}

async function terminaAutorizado(page: Page) {
  await expect(page.locator('input[formcontrolname=terminos]')).toBeChecked();
  await expect(page.getByRole('dialog', { name: TITULO })).toBeHidden();
  // 4-5. Casilla y Aceptar pulsados una sola vez.
  expect(await clics(page)).toEqual([1, 1]);
}

test.describe('AfiliacionesPortal.autorizar — modal PDF', () => {
  test('1. visor scrollable de inmediato: desplaza, acepta, casilla marcada y diálogo oculto', async ({ page }) => {
    await autorizar(page, { renderTras: 0 });
    await terminaAutorizado(page);
  });

  test('2. PDF que renderiza tarde (sin overflow al abrir) no falla prematuramente', async ({ page }) => {
    const inicio = Date.now();
    await autorizar(page, { renderTras: 2_500 });
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(2_500);
    await terminaAutorizado(page);
  });

  test('3. documento que cabe completo con Aceptar habilitado: acepta sin exigir scroll', async ({ page }) => {
    await autorizar(page, { renderTras: null, aceptarHabilitado: true });
    expect(await page.locator('.ng2-pdf-viewer-container').evaluate(el => [el.scrollHeight > el.clientHeight, el.scrollTop])).toEqual([false, 0]);
    await terminaAutorizado(page);
  });

  test('6-7. nunca habilitable: no pulsa Aceptar bloqueado y el diagnóstico es no sensible', async ({ page }) => {
    const error = await autorizar(page, { renderTras: null }, 1_500).then(() => new Error('no falló'), (e: Error) => e);
    expect(error.message).toBe(`No se pudo completar la autorización "terminos" ("${TITULO}"): dialogoVisible=sí, visorVisible=sí, `
      + 'scrollable=no, scrollHeight=80, clientHeight=80, scrollTop=0, aceptarBloqueado=sí');
    expect(await clics(page)).toEqual([1, 0]);
    await expect(page.locator('input[formcontrolname=terminos]')).not.toBeChecked();
  });

  test('autorizado=false no abre el modal', async ({ page }) => {
    await page.setContent(modal({ renderTras: 0 }));
    await new PortalRapido(page).autorizar('terminos', false, TITULO);
    expect(await clics(page)).toEqual([0, 0]);
  });
});
