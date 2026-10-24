import { test, expect, type Page } from '@playwright/test';
import { crearCapacidadesUi, type UiEntorno } from '../../sde/capacidades';
import { cargarRegistro } from '../../sde/datos';
import { causaDeExcepcion, crearContexto } from '../../sde/ejecutor';
import type { PasoSde } from '../../sde/escenario';

test.use({ trace: 'off' });
const registro = cargarRegistro();
const ui = (page: Page): UiEntorno => ({ browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]),
  contextos: [], actual: 'analista', registrarCaso: () => undefined });

/** Filas/documentos SINTÉTICOS con la estructura observada en los contextos de error del 21/10. Sin QA ni datos de cliente. */
async function documentos(page: Page, tipos: string[], marcada = false, descartarArchivo = false) {
  await page.setContent(`<div class="bzg-form-grid${marcada ? ' ui-bizagi-render-required' : ''}"><div class="bz-rn-grid-header-title">Documentos Anexos</div>
    <table><thead><tr><th><label>Tipo Documental</label></th><th><label>Documento</label></th></tr></thead><tbody class="ui-bizagi-grid-body">
    ${tipos.map(t => `<tr data-bizagi-component="cells"><td><input role="combobox" value="${t}"></td><td><span class="archivo">No hay archivos</span><li class="ui-bizagi-render-upload-wrapper"><a>Subir</a></li></td></tr>`).join('')}
    </tbody></table><ul><li data-action="add">Adicionar</li></ul></div>
    <div class="ui-dialog" role="dialog" hidden><div class="ui-dialog-title">Subir un archivo</div><input type="file"><button>Subir</button></div>
    <script>window.adiciones=0; window.archivos=[]; let objetivo;
      document.querySelector('[data-action=add]').onclick=()=>window.adiciones++;
      document.querySelectorAll('.ui-bizagi-render-upload-wrapper a').forEach(a=>a.onclick=()=>{
        objetivo=a.closest('tr'); document.querySelector('.ui-dialog').hidden=false;
      });
      document.querySelector('input[type=file]').onchange=e=>{
        window.archivos.push(...[...e.target.files].map(f=>({nombre:f.name,bytes:f.size})));
        if (${descartarArchivo}) e.target.value='';
      };
      document.querySelector('.ui-dialog button').onclick=()=>{
        const f=document.querySelector('input[type=file]').files[0];
        if(f) objetivo.querySelector('.archivo').textContent=f.name;
        document.querySelector('.ui-dialog').hidden=true;
      };
    </script>`);
}
const pasoDocs = (tipo?: string): PasoSde => ({ matriz: [9], hacer: 'adjuntar_en_grilla', grilla: 'Documentos Anexos',
  secuencia: 'segun_obligatoriedad', archivo: 'docs/soporte-prueba.pdf', ...(tipo ? { tipo_documental: tipo } : {}) });
const ejecutarDocs = (page: Page, tipo?: string) => crearCapacidadesUi(ui(page)).capacidades.adjuntar_en_grilla(pasoDocs(tipo), crearContexto(registro, {}, 'sintetico'));

test.describe('Regresiones HU06 del 21/10: documentos precargados @unit', () => {
  for (const cantidad of [3, 5]) {
    test(`${cantidad} filas parametrizadas sin obligatoriedad: conserva la grilla y continúa sin subir`, async ({ page }) => {
      await documentos(page, Array.from({ length: cantidad }, (_, i) => `Tipo Sintético ${i}`));
      const r = await ejecutarDocs(page);
      expect((r as { estado?: string }).estado).toBeUndefined();
      expect(r).toMatchObject({ detalle: expect.stringContaining('SIN adjuntar') });
      expect(await page.evaluate(() => ({ adiciones: (window as unknown as { adiciones: number }).adiciones,
        archivos: (window as unknown as { archivos: unknown[] }).archivos.length }))).toEqual({ adiciones: 0, archivos: 0 });
      expect(await page.locator('tbody tr').count()).toBe(cantidad);
    });
  }
  test('obligatorio con tipo único precargado: usa su control y verifica recepción del archivo', async ({ page }) => {
    await documentos(page, ['Tipo Sintético B', 'Tipo Sintético A', 'Otros'], true);
    const r = await ejecutarDocs(page, 'Tipo Sintético A');
    expect((r as { estado?: string }).estado).toBeUndefined();
    expect(await page.locator('tbody tr').nth(1).getByText('soporte-prueba.pdf', { exact: true }).isVisible()).toBe(true);
    expect(await page.locator('tbody tr').nth(0).getByText('No hay archivos', { exact: true }).isVisible()).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { adiciones: number }).adiciones)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { archivos: { nombre: string; bytes: number }[] }).archivos)).toEqual([
      { nombre: 'soporte-prueba.pdf', bytes: expect.any(Number) },
    ]);
  });
  test('obligatorio sin tipo declarado: BLOCKED por dato, sin elegir una fila arbitraria', async ({ page }) => {
    await documentos(page, ['Tipo Sintético A', 'Otros'], true);
    expect(await ejecutarDocs(page)).toMatchObject({ estado: 'BLOCKED', causa: 'DATO' });
  });
  test('tipo requerido ausente de las filas precargadas: BLOCKED por dato', async ({ page }) => {
    await documentos(page, ['Otros'], true);
    expect(await ejecutarDocs(page, 'Tipo Sintético A')).toMatchObject({ estado: 'BLOCKED', causa: 'DATO' });
  });
  test('tipos duplicados: nunca selecciona la primera fila ni da PASS', async ({ page }) => {
    await documentos(page, ['Tipo Sintético A', 'Tipo Sintético A'], true);
    const err = await ejecutarDocs(page, 'Tipo Sintético A').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(causaDeExcepcion(err)).toBe('AUTOMATIZACION');
  });
  test('fila precargada de estructura desconocida: conserva la barrera de calibración', async ({ page }) => {
    await documentos(page, ['Tipo Sintético A']);
    await page.locator('.ui-bizagi-render-upload-wrapper').evaluate(el => el.remove());
    const err = await ejecutarDocs(page).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(causaDeExcepcion(err)).toBe('AUTOMATIZACION');
  });
  test('control de archivo no retiene la carga: error técnico explícito, nunca PASS', async ({ page }) => {
    await documentos(page, ['Tipo Sintético A'], true, true);
    const err = await ejecutarDocs(page, 'Tipo Sintético A').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toMatch(/control.*archivo.*no.*recibi|archivo.*no.*control/i);
    expect(causaDeExcepcion(err)).toBe('AUTOMATIZACION');
  });
});

test.describe('CP02 P12: extracción y diagnóstico de lectura @unit', () => {
  for (const completas of [true, false]) {
    test(`tres pólizas con placas ${completas ? 'presentes' : 'vacías'}: preserva la aserción`, async ({ page }) => {
      const polizas = ['POL-SINT-A', 'POL-SINT-B', 'POL-SINT-C'];
      const placas = ['ABC123', 'XYZ987', 'KLM456'];
      await page.setContent(`<div class="bzg-form-grid"><div class="bz-rn-grid-header-title">Detalle Polizas Asociadas</div>
        <table><thead><tr><th>id</th><th>Número Póliza</th><th>Placa</th></tr></thead><tbody class="ui-bizagi-grid-body">
        ${polizas.map((p, i) => `<tr data-bizagi-component="cells" data-business-key="fila-${i}"><td>fila-${i}</td><td>${p}</td><td>${completas ? placas[i] : ''}</td></tr>`).join('')}
        </tbody></table></div>`);
      const p: PasoSde = { matriz: [12], hacer: 'tabla_verificar', tabla: 'Detalle Polizas Asociadas', minimo_filas: 1,
        comparar: { 'Número Póliza': polizas, Placa: placas } };
      const ejecutar = () => crearCapacidadesUi(ui(page)).capacidades.tabla_verificar(p, crearContexto(registro, {}, 'sintetico'));
      if (completas) expect((await ejecutar() as { estado?: string }).estado).toBeUndefined();
      else {
        const err = await ejecutar().catch((e: Error) => e);
        expect(String(err)).toMatch(/3 fila.*Placa: 0 de 3 esperados/);
        expect(String(err)).toMatch(/identidades.*3\/3.*Placa.*3.*vac/i);
      }
    });
  }
});
