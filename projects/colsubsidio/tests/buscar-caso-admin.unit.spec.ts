import { test, expect, type Locator, type Page } from '@playwright/test';
import { BizagiQaSupport } from '../helpers/bizagiQaSupport';

/** buscarCaso(): polling (nivel A) + reconstrucción de Admin → Casos (nivel B) sobre un DOM local. */

interface Vista {
  /** Búsqueda (1-based) desde la cual aparece el caso en ESTA vista; null = vista stale, nunca aparece. */
  apareceEn: number | null;
  /** Filas padre del caso que devuelve la búsqueda cuando aparece. */
  padres?: number;
  /** Tras esta búsqueda el diálogo se desmonta (rerender de la SPA). */
  desapareceTras?: number;
}

const NUMERO = '310801';

function admin(v: Vista): string {
  return `
    <div role="dialog" aria-label="Casos">
      <input id="caseInput"><button id="btn-admin-case-search">Buscar</button><div id="res"></div>
    </div>
    <script>(() => {
      const v = ${JSON.stringify(v)}; let n = 0; window.busquedas = 0;
      const dialogo = document.querySelector('[role=dialog]'), input = document.getElementById('caseInput');
      document.getElementById('btn-admin-case-search').addEventListener('click', () => {
        window.busquedas = ++n;
        if (v.desapareceTras && n >= v.desapareceTras) { dialogo.remove(); return; }
        const fila = (num, sub) => '<input type="radio" name="CaseAdmin" data-subprocess="' + sub + '" value="' + num + '">';
        const padres = v.apareceEn !== null && n >= v.apareceEn ? v.padres ?? 1 : 0;
        // Subproceso con el mismo radicado y otro caso: nunca cuentan para la correlación.
        document.getElementById('res').innerHTML = fila(input.value, true) + fila('3108010', false) + Array(padres).fill(fila(input.value, false)).join('');
      });
    })();</script>`;
}

interface Presupuesto { total: number; intervalo: number; esperaResultados: number; reconstruirSinResultado: number; minimoReapertura: number }

class SoporteLocal extends BizagiQaSupport {
  aperturas = 0;
  constructor(page: Page, private readonly vistas: Vista[], presupuesto: Partial<Presupuesto> = {}) {
    // Histórico en memoria: buscarCaso no lo usa.
    super(page, { registrar: async () => ({}) as never, marcarDepurado: async () => ({}) as never, listar: async () => [] });
    this.presupuestoBusqueda = { total: 4_000, intervalo: 50, esperaResultados: 20, reconstruirSinResultado: 600, minimoReapertura: 300, ...presupuesto };
  }
  /** Solo reconstruye la vista local: sin login ni Bizagi. */
  override async abrirAdministracionCasos(): Promise<Locator> {
    const vista = this.vistas[Math.min(this.aperturas, this.vistas.length - 1)];
    this.aperturas++;
    await this.page.setContent(admin(vista));
    return this.page.getByRole('dialog', { name: 'Casos', exact: true });
  }
}

async function soporte(page: Page, vistas: Vista[], presupuesto?: ConstructorParameters<typeof SoporteLocal>[2]) {
  const s = new SoporteLocal(page, vistas, presupuesto);
  await s.registrarCasoCreado(NUMERO, 'unit buscarCaso');
  return s;
}
const busquedas = (page: Page) => page.evaluate(() => (window as unknown as { busquedas: number }).busquedas);
const padre = (dialogo: Locator) => dialogo.locator(`input[name="CaseAdmin"][data-subprocess="false"][value="${NUMERO}"]`);

test.describe('BizagiQaSupport.buscarCaso — propagación lenta', () => {
  test('1. aparece en el primer intento: una apertura, una búsqueda', async ({ page }) => {
    const s = await soporte(page, [{ apareceEn: 1 }]);
    const dialogo = await s.buscarCaso();
    await expect(padre(dialogo)).toHaveCount(1);
    expect([s.aperturas, await busquedas(page)]).toEqual([1, 1]);
  });

  test('2. aparece tras varios polls sobre la misma vista, sin reconstruir', async ({ page }) => {
    const s = await soporte(page, [{ apareceEn: 4 }], { reconstruirSinResultado: 60_000 });
    await expect(padre(await s.buscarCaso())).toHaveCount(1);
    expect([s.aperturas, await busquedas(page)]).toEqual([1, 4]);
  });

  test('3. la vista desaparece y se reconstruye de inmediato', async ({ page }) => {
    const s = await soporte(page, [{ apareceEn: null, desapareceTras: 2 }, { apareceEn: 1 }], { reconstruirSinResultado: 60_000 });
    const inicio = Date.now();
    await expect(padre(await s.buscarCaso())).toHaveCount(1);
    expect(s.aperturas).toBe(2);
    expect(Date.now() - inicio).toBeLessThan(3_000); // No esperó el umbral de stale.
  });

  test('4. vista stale en cero: una reconstrucción encuentra el mismo número', async ({ page }) => {
    const s = await soporte(page, [{ apareceEn: null }, { apareceEn: 1 }]);
    const dialogo = await s.buscarCaso();
    await expect(padre(dialogo)).toHaveCount(1);
    await expect(dialogo.locator('#caseInput')).toHaveValue(NUMERO);
    expect(s.aperturas).toBe(2);
  });

  test('5. ambigüedad falla de inmediato, sin reintentar ni reconstruir', async ({ page }) => {
    const s = await soporte(page, [{ apareceEn: 1, padres: 2 }]);
    await expect(s.buscarCaso()).rejects.toThrow(`Correlación ambigua: el caso ${NUMERO} tiene 2 coincidencias en Admin → Casos`);
    expect([s.aperturas, await busquedas(page)]).toEqual([1, 1]);
  });

  test('6. el presupuesto total no se reinicia tras reconstruir; diagnóstico no sensible', async ({ page }) => {
    const total = 2_500;
    const s = await soporte(page, [{ apareceEn: null }], { total, reconstruirSinResultado: 400 });
    const inicio = Date.now();
    const error = await s.buscarCaso().then(() => new Error('no falló'), (e: Error) => e);
    const duracion = Date.now() - inicio;
    expect(s.aperturas).toBeGreaterThanOrEqual(3); // Reconstruyó varias veces...
    expect(duracion).toBeLessThan(total + 1_000); // ...dentro de UN solo presupuesto.
    expect(error.message).toMatch(new RegExp(`^El caso ${NUMERO} no apareció en Admin → Casos dentro del tiempo de propagación `
      + `\\(tiempoTotal=\\d+s, busquedas=\\d+, reaperturasAdmin=${s.aperturas - 1}, dialogoVisible=sí, inputBusquedaVisible=sí, coincidenciasFinales=0\\)$`));
  });

  test('6b. vista desaparecida sin presupuesto para reabrir: falla con UI no visible en el diagnóstico', async ({ page }) => {
    const s = await soporte(page, [{ apareceEn: null, desapareceTras: 1 }], { total: 1_000, minimoReapertura: 5_000 });
    const error = await s.buscarCaso().then(() => new Error('no falló'), (e: Error) => e);
    expect(error.message).toContain('reaperturasAdmin=0, dialogoVisible=no, inputBusquedaVisible=no, coincidenciasFinales=0');
    expect(s.aperturas).toBe(1);
  });
});
