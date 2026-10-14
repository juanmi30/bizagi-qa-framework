import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LoginActions } from '../../../shared/core/LoginActions';
import { SdeObjects } from '../baseObjects/sde.objects';
import { DIR_SALIDA } from '../sde/registro';
import { esperarCarga } from '../sde/ui';

/**
 * EXPLORACIÓN DE CALIBRACIÓN (primera corrida con credenciales). Solo corre con SDE_EXPLORAR=1.
 * - Inicia sesión como intermediario, abre "Nuevo caso" y lista los procesos visibles.
 * - Si SDE_PROCESO_RADICACION está definido, abre el formulario de inicio y vuelca su ESTRUCTURA
 *   (clases de contenedores, etiquetas, tipo de control, readonly/required, botones). NO pulsa "Crear".
 * - Nunca vuelca valores de controles (solo su longitud) ni credenciales.
 * Advertencia: si el proceso asigna número de caso al abrir el formulario, ese caso queda creado;
 * la salida lo indica para registrarlo.
 * Salida local: test-results/seguros-del-estado/sde/exploracion-<fecha>.json + capturas en el reporte.
 */
// Sin trace: Playwright registraría el valor de fill() (la clave). Ver tests/unit/seguridad.unit.spec.ts.
test.use({ trace: 'off' });

test.describe('Exploración DOM SDE @exploracion', () => {
  test('estructura del Work Portal y del formulario de inicio', async ({ page }, testInfo) => {
    const faltan = ['USUARIO_intermediario', 'CLAVE_intermediario'].filter((v) => !process.env[v]);
    test.skip(process.env.SDE_EXPLORAR !== '1', 'Exploración desactivada (SDE_EXPLORAR=1 para correrla).');
    test.skip(faltan.length > 0, `BLOCKED — faltan ${faltan.join(', ')}`);
    testInfo.setTimeout(5 * 60_000);

    await new LoginActions(page).login(process.env.USUARIO_intermediario!, process.env.CLAVE_intermediario!,
      process.env.DOMINIO_intermediario || undefined);
    await esperarCarga(page);
    await testInfo.attach('01-bandeja', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    const salida: Record<string, unknown> = { fecha: new Date().toISOString(), url: page.url() };
    salida.nuevoCaso = await page.locator(SdeObjects.nuevoCaso).filter({ visible: true }).evaluateAll((els) =>
      els.map((e) => ({ tag: e.tagName, id: e.id, clases: (e as HTMLElement).className, texto: (e as HTMLElement).innerText?.trim().slice(0, 40) })));
    salida.buscador = await page.locator(SdeObjects.buscadorCasos).filter({ visible: true }).count();

    // Exploración: si el selector es ambiguo, la lista completa ya quedó en salida.nuevoCaso para calibrar.
    const boton = page.locator(SdeObjects.nuevoCaso).filter({ visible: true });
    if ((await boton.count()) >= 1) {
      await boton.nth(0).click();
      await esperarCarga(page);
      await testInfo.attach('02-nuevo-caso', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      salida.menuNuevoCaso = await page.locator('a, li, [role="menuitem"], button').filter({ visible: true })
        .evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLElement).innerText?.replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 80))]);
    }

    const proceso = process.env.SDE_PROCESO_RADICACION;
    if (proceso) {
      await page.getByText(proceso, { exact: true }).filter({ visible: true }).click();
      await esperarCarga(page);
      await testInfo.attach('03-formulario-inicio', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      salida.formulario = await page.evaluate(() => {
        const visible = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const campos = [...document.querySelectorAll('[class*="ui-bizagi-render"]')].filter(visible).slice(0, 300).map((c) => ({
          clases: (c as HTMLElement).className,
          etiqueta: (c.querySelector('label, [class*="label" i]') as HTMLElement | null)?.innerText?.trim().slice(0, 80) ?? null,
          controles: [...c.querySelectorAll('input:not([type=hidden]), select, textarea, [contenteditable]')].map((i) => ({
            tag: i.tagName, tipo: (i as HTMLInputElement).type, readonly: (i as HTMLInputElement).readOnly,
            disabled: (i as HTMLInputElement).disabled, required: (i as HTMLInputElement).required,
            longitudValor: ((i as HTMLInputElement).value ?? '').length, maxlength: i.getAttribute('maxlength'),
          })),
        }));
        const botones = [...document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')].filter(visible)
          .map((b) => ({ texto: ((b as HTMLElement).innerText || (b as HTMLInputElement).value || '').trim(), clasesPadre: (b.parentElement as HTMLElement | null)?.className ?? '' }));
        const textosCaso = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /caso/i.test((e as HTMLElement).innerText ?? ''))
          .slice(0, 20).map((e) => ({ tag: e.tagName, clases: (e as HTMLElement).className, texto: (e as HTMLElement).innerText.trim().slice(0, 60) }));
        return { campos, botones, textosCaso };
      });
    }
    mkdirSync(DIR_SALIDA, { recursive: true });
    const ruta = resolve(DIR_SALIDA, `exploracion-${Date.now()}.json`);
    writeFileSync(ruta, JSON.stringify(salida, null, 2), 'utf8');
    await testInfo.attach('exploracion.json', { path: ruta, contentType: 'application/json' });
  });
});
