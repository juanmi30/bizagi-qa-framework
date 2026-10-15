import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { cargarRegistro } from '../../sde/datos';
import { crearContexto } from '../../sde/ejecutor';
import { buscarCaso, crearCapacidadesUi, type UiEntorno } from '../../sde/capacidades';

/**
 * Buscador global con subprocesos (QA 2026-10-15, caso 628): Bizagi lista el caso en VARIAS filas con el mismo número
 * (proceso principal y subproceso «Consultar Información de Solicitud» → «Consultar SISE»). Antes, verificar_ruta fallaba
 * por ambigüedad. Portal sintético: el contexto responde todo localmente, nada sale a QA.
 */
const PRINCIPAL = 'Proceso Principal Sintético';
const fila = (numero: string, proceso: string, actividades: string[]) =>
  `<tr><td class="I_RadNumber">${numero}</td><td>${proceso}</td><td><ul class="gridListWorkItems">${
    actividades.map((a) => `<li><span class="ui-bizagi-wp-app-inbox-activity-name">${a}</span></li>`).join('')}</ul></td></tr>`;
const portal = (filas: string) => `<!doctype html><html><body><div id="menuListInbox">Bandeja</div><div id="inbox">Bandeja de entrada</div>
  <input id="menuQuery" placeholder="Buscar"><table><thead><tr><th>Número</th><th>Proceso</th><th>Actividad</th></tr></thead><tbody>${filas}</tbody></table></body></html>`;

async function servir(context: BrowserContext, page: Page, html: string) {
  await context.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto('http://portal.sintetico.local/');
}

const CON_SUBPROCESO = portal(
  fila('628', PRINCIPAL, ['Máximo tiempo de radicación', 'Consultar información de solicitud', 'Deshabilitar cancelación']) +
  fila('628', 'Consultar Información de Solicitud', ['Consultar SISE']) +
  fila('6280', PRINCIPAL, ['Estructurar información']));

test.describe('Búsqueda de casos con subprocesos @unit', () => {
  test('con el proceso principal: une las actividades de todas las filas del caso y elige la fila principal', async ({ page, context }) => {
    await servir(context, page, CON_SUBPROCESO);
    const e = await buscarCaso(page, '628', PRINCIPAL);
    expect(e.filas).toHaveLength(2); // 6280 no es el caso 628
    expect(e.actividades).toEqual(['Máximo tiempo de radicación', 'Consultar información de solicitud', 'Deshabilitar cancelación', 'Consultar SISE']);
    await expect(e.fila).toContainText(PRINCIPAL);
    expect(e.actividades).not.toContain('Estructurar información');
  });

  test('sin proceso y con varias filas: ambigüedad explícita (no se elige una al azar)', async ({ page, context }) => {
    await servir(context, page, CON_SUBPROCESO);
    await expect(buscarCaso(page, '628')).rejects.toThrow(/hay 2 \(proceso y subprocesos\)\. Ambigüedad/);
  });

  test('una sola fila: comportamiento anterior intacto', async ({ page, context }) => {
    await servir(context, page, portal(fila('434', PRINCIPAL, ['Estructurar información'])));
    const e = await buscarCaso(page, '434');
    expect(e).toMatchObject({ numero: '434', actividades: ['Estructurar información'] });
    expect(e.filas).toHaveLength(1);
  });

  test('verificar_ruta: una actividad del subproceso cuenta como llegada y las prohibidas se buscan en todas las filas', async ({ page, browser, context }) => {
    await servir(context, page, CON_SUBPROCESO);
    const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], registrarCaso: () => undefined };
    const { capacidades } = crearCapacidadesUi(ui);
    const ctx = crearContexto(cargarRegistro(), { ...process.env, SDE_PROCESO_RADICACION: PRINCIPAL }, 'u');
    ctx.numeroCaso = '628';
    const r = await capacidades.verificar_ruta({ matriz: [8], hacer: 'verificar_ruta', actor: 'analista', llega_a: ['Consultar SISE'], no_llega_a: ['Estructurar información'], maximo_minutos: 0 }, ctx);
    expect(r).toMatchObject({ estado: 'PASS' });
    await expect(capacidades.verificar_ruta({ matriz: [8], hacer: 'verificar_ruta', actor: 'analista', llega_a: ['X'], no_llega_a: ['Consultar SISE'], maximo_minutos: 0 }, ctx))
      .rejects.toThrow(/está en "Consultar SISE" \(ruta NO esperada\)/);
  });
});

test.describe('abrir_caso: el work item puede llegar después de la actividad (caso 637) @unit', () => {
  // La fila lista "Estructurar información"; al pulsarla, la página pide WorkItems. El servidor sintético responde vacío
  // las primeras N veces y luego entrega el work item y el formulario. Nada sale a QA.
  async function portalConDemora(context: BrowserContext, page: Page, vaciasAntes: number) {
    let pedidos = 0;
    const html = portal(fila('637', PRINCIPAL, ['Estructurar información'])).replace('</body>', `<script>
      document.addEventListener('click', async (ev) => {
        if (!ev.target.closest('.ui-bizagi-wp-app-inbox-activity-name')) return;
        const r = await fetch('/Rest/Cases/637/WorkItems'); const j = await r.json();
        if (j.workItems.length) document.body.insertAdjacentHTML('beforeend', '<div class="ui-bizagi-button-container"><button>Guardar</button></div>');
      });</script></body>`);
    await context.route('**/*', (r) => {
      if (r.request().url().includes('/Rest/Cases/637/WorkItems')) {
        pedidos++;
        const workItems = pedidos > vaciasAntes ? [{ displayName: 'Estructurar información' }] : [];
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workItems }) });
      }
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    });
    await page.goto('http://portal.sintetico.local/');
    return () => pedidos;
  }
  const paso = { matriz: [10], hacer: 'abrir_caso', actor: 'analista', actividad: 'Estructurar información', maximo_minutos: 1 };
  const preparar = (page: Page, browser: import('@playwright/test').Browser) => {
    const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], registrarCaso: () => undefined };
    const ctx = crearContexto(cargarRegistro(), { ...process.env, SDE_PROCESO_RADICACION: PRINCIPAL }, 'u');
    ctx.numeroCaso = '637';
    return { capacidades: crearCapacidadesUi(ui).capacidades, ctx };
  };

  test('WorkItems vacío al primer intento: reintenta dentro del límite y abre la actividad', async ({ page, browser, context }) => {
    test.setTimeout(90_000);
    const pedidos = await portalConDemora(context, page, 1);
    const { capacidades, ctx } = preparar(page, browser);
    const r = await capacidades.abrir_caso(paso, ctx);
    expect(r).toMatchObject({ detalle: expect.stringContaining('work item entregado en el intento 2') });
    expect(pedidos()).toBe(2);
  });

  test('si Bizagi nunca entrega el work item, falla al agotar el límite con el motivo y los intentos', async ({ page, browser, context }) => {
    test.setTimeout(120_000);
    await portalConDemora(context, page, Infinity);
    const { capacidades, ctx } = preparar(page, browser);
    await expect(capacidades.abrir_caso({ ...paso, maximo_minutos: 0.2 }, ctx)).rejects.toThrow(/no entrega a "analista" el work item "Estructurar información" del caso 637 \(WorkItems: ninguno; \d+ intento\(s\)\)/);
  });
});
