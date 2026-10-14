import { expect, type Page, type TestInfo } from '@playwright/test';

/** Emulación Playwright; no representa un dispositivo ni un teclado físico real. */
export const contextoMobile = {
  viewport: { width: 400, height: 824 },
  hasTouch: true,
  isMobile: true,
};

export async function verificarAlertaMobile(page: Page, info: TestInfo): Promise<void> {
  const alerta = page.locator('.alertas-warn').filter({ hasText: 'Solo puedes afiliarte' });
  await alerta.scrollIntoViewIfNeeded();
  await expect(alerta).toBeVisible();
  const geometria = await alerta.evaluate(elemento => {
    const caja = elemento.getBoundingClientRect();
    const recorrer = document.createTreeWalker(elemento, NodeFilter.SHOW_TEXT);
    const lineas: { x: number; y: number; right: number; bottom: number }[] = [];
    let nodo: Node | null;
    while ((nodo = recorrer.nextNode())) {
      if (!nodo.textContent?.trim()) continue;
      const rango = document.createRange();
      rango.selectNodeContents(nodo);
      for (const rect of rango.getClientRects()) {
        if (rect.width && rect.height) lineas.push({ x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom });
      }
    }
    const icono = elemento.querySelector('img')?.getBoundingClientRect();
    return {
      caja: { x: caja.x, y: caja.y, right: caja.right, bottom: caja.bottom },
      lineas,
      viewport: window.innerWidth,
      overflow: elemento.scrollWidth > elemento.clientWidth + 1,
      textoTapado: lineas.some(r => {
        const encima = document.elementFromPoint((r.x + r.right) / 2, (r.y + r.bottom) / 2);
        return !encima || !elemento.contains(encima);
      }),
      superposicionIcono: icono ? lineas.some(r => r.x < icono.right && r.right > icono.x && r.y < icono.bottom && r.bottom > icono.y) : false,
    };
  });
  await info.attach('alerta-mobile-geometria.json', { body: JSON.stringify(geometria), contentType: 'application/json' });
  expect(geometria.lineas.length).toBeGreaterThan(0);
  expect(geometria.overflow).toBe(false);
  expect(geometria.superposicionIcono).toBe(false);
  expect(geometria.textoTapado).toBe(false);
  expect(geometria.caja.x).toBeGreaterThanOrEqual(0);
  expect(geometria.caja.right).toBeLessThanOrEqual(geometria.viewport + 1);
  for (const linea of geometria.lineas) {
    expect(linea.x).toBeGreaterThanOrEqual(geometria.caja.x - 1);
    expect(linea.right).toBeLessThanOrEqual(geometria.caja.right + 1);
    expect(linea.y).toBeGreaterThanOrEqual(geometria.caja.y - 1);
    expect(linea.bottom).toBeLessThanOrEqual(geometria.caja.bottom + 1);
  }
}
