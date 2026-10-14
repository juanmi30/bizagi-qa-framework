import { test, expect, type Page } from '@playwright/test';
import { cargarRegistro } from '../../sde/datos';
import { crearContexto } from '../../sde/ejecutor';
import { crearCapacidadesUi, type UiEntorno } from '../../sde/capacidades';

/**
 * UI-04 (pestañas), UI-05 (pruebas negativas de campo) y UI-06 (selección única) sobre DOM SINTÉTICO, cada una con
 * su control negativo (la capability debe FALLAR cuando el comportamiento no se cumple). Solo prueba la lógica:
 * los selectores reales de estas zonas siguen [PENDIENTE] de calibrar contra QA (ver baseObjects/sde.objects.ts).
 */

const reg = cargarRegistro();
const ctx = () => crearContexto(reg, { BIZAGI_BASE_URL: 'https://qa.ficticio.test' }, 'sint');
function caps(page: Page) {
  const ui: UiEntorno = { browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined };
  return crearCapacidadesUi(ui).capacidades;
}
const err = (pr: Promise<unknown>) => pr.then(() => null, (e: Error) => e.message);

// ---------- UI-04 pestañas ----------
const PESTANAS = (activa = true) => `
  <ul class="ui-tabs-nav">
    <li role="tab" aria-controls="p1" aria-selected="true">Información</li>
    <li role="tab" aria-controls="p2" aria-selected="false">Documentos de la solicitud</li>
    <li role="tab" aria-controls="p3" aria-selected="false">Seguimiento/Trazabilidad</li>
  </ul>
  <div id="p1" role="tabpanel">Formulario</div>
  <div id="p2" role="tabpanel" hidden><span>Soporte.pdf</span></div>
  <div id="p3" role="tabpanel" hidden><table><tr><td>Consultar Alertas Intermediario</td></tr></table></div>
  <span hidden>Texto oculto fuera del panel</span>
  <script>document.querySelectorAll('[role=tab]').forEach((t) => t.onclick = () => {
    if (!${activa}) return;
    document.querySelectorAll('[role=tab]').forEach((x) => { x.setAttribute('aria-selected', String(x === t)); document.getElementById(x.getAttribute('aria-controls')).hidden = x !== t; });
  });</script>`;

test.describe('UI-04 abrir_pestana @unit', () => {
  test('abre la pestaña exacta, exige que quede activa y que su panel muestre el contenido', async ({ page }) => {
    await page.setContent(PESTANAS());
    const r = await caps(page).abrir_pestana({ matriz: [28], hacer: 'abrir_pestana', pestana: 'Seguimiento/Trazabilidad', contiene: ['Consultar Alertas Intermediario'] }, ctx());
    expect((r as { detalle: string }).detalle).toMatch(/activa con su panel visible; muestra "Consultar Alertas Intermediario"/);
  });

  test('control: contenido ausente del panel → falla (no basta con que la pestaña exista)', async ({ page }) => {
    await page.setContent(PESTANAS());
    expect(await err(caps(page).abrir_pestana({ matriz: [28], hacer: 'abrir_pestana', pestana: 'Documentos de la solicitud', contiene: ['Carta de nombramiento'] }, ctx())))
      .toMatch(/no muestra "Carta de nombramiento"/);
  });

  test('control: una pestaña que no se activa al pulsarla → falla', async ({ page }) => {
    await page.setContent(PESTANAS(false));
    expect(await err(caps(page).abrir_pestana({ matriz: [28], hacer: 'abrir_pestana', pestana: 'Documentos de la solicitud' }, ctx()))).toMatch(/no quedó activa/);
  });

  test('control: texto parecido no es la pestaña (exactitud)', async ({ page }) => {
    await page.setContent(PESTANAS());
    expect(await err(caps(page).abrir_pestana({ matriz: [28], hacer: 'abrir_pestana', pestana: 'Seguimiento' }, ctx()))).toMatch(/No se encontró visible: la pestaña "Seguimiento"/);
  });
});

// ---------- UI-05 pruebas negativas ----------
const CAMPOS = (conRestricciones = true) => `
  <div class="ui-bizagi-render"><label>Placa</label><input id="placa" ${conRestricciones ? 'maxlength="6"' : ''}></div>
  <div class="ui-bizagi-render"><label>Número de Póliza</label><input id="pol"></div>
  <span id="msg" role="alert" hidden>El número de póliza debe tener entre 9 y 12 dígitos.</span>
  <script>
    const pol = document.getElementById('pol');
    pol.addEventListener('keydown', (e) => { if (${conRestricciones} && e.key.length === 1 && !/[0-9]/.test(e.key)) e.preventDefault(); });
    pol.addEventListener('blur', () => { document.getElementById('msg').hidden = !${conRestricciones} || /^[0-9]{9,12}$/.test(pol.value); });
  </script>`;

test.describe('UI-05 intentar_diligenciar @unit', () => {
  test('Placa > 6 queda truncada; póliza no numérica se filtra y corta muestra el mensaje', async ({ page }) => {
    await page.setContent(CAMPOS());
    const c = caps(page);
    const placa = await c.intentar_diligenciar({ matriz: [1], hacer: 'intentar_diligenciar', campo: 'Placa', valor: 'ABC1234', esperado_mostrado: 'ABC123' }, ctx());
    expect((placa as { detalle: string }).detalle).toMatch(/se tecleó ABC1234; el formulario muestra "ABC123"; coincide/);
    const pol = await c.intentar_diligenciar({ matriz: [1], hacer: 'intentar_diligenciar', campo: 'Número de Póliza', valor: '12ab34', esperado_mostrado: '1234',
      mensaje: 'El número de póliza debe tener entre 9 y 12 dígitos.' }, ctx());
    expect((pol as { detalle: string }).detalle).toMatch(/muestra "1234".*mensaje .* visible/);
  });

  test('control: sin restricciones en el formulario la prueba negativa FALLA (no da un falso verde)', async ({ page }) => {
    await page.setContent(CAMPOS(false));
    const c = caps(page);
    expect(await err(c.intentar_diligenciar({ matriz: [1], hacer: 'intentar_diligenciar', campo: 'Placa', valor: 'ABC1234', esperado_mostrado: 'ABC123' }, ctx())))
      .toMatch(/muestra "ABC1234"; se esperaba "ABC123"/);
    expect(await err(c.intentar_diligenciar({ matriz: [1], hacer: 'intentar_diligenciar', campo: 'Número de Póliza', valor: '1234', mensaje: 'El número de póliza debe tener entre 9 y 12 dígitos.' }, ctx())))
      .toMatch(/no aparece el mensaje/);
  });
});

// ---------- UI-06 selección única ----------
const POLIZAS = (tipo: 'radio' | 'checkbox') => `
  <div class="ui-bizagi-render"><label>Pólizas retornadas</label>
    <table><thead><tr><th></th><th>Número Póliza</th><th>Ramo</th></tr></thead><tbody>
      ${['100000001', '100000002', '100000003'].map((n) => `<tr><td><input type="${tipo}" name="sel"></td><td>${n}</td><td>AUTOS</td></tr>`).join('')}
    </tbody></table></div>`;

test.describe('UI-06 tabla_seleccionar_fila @unit', () => {
  test('selecciona por número y por valores exactos; siempre queda exactamente una fila seleccionada', async ({ page }) => {
    await page.setContent(POLIZAS('radio'));
    const c = caps(page);
    await c.tabla_seleccionar_fila({ matriz: [1], hacer: 'tabla_seleccionar_fila', tabla: 'Pólizas retornadas', fila: 1 }, ctx());
    const r = await c.tabla_seleccionar_fila({ matriz: [1], hacer: 'tabla_seleccionar_fila', tabla: 'Pólizas retornadas', fila_con: { 'Número Póliza': '100000003' } }, ctx());
    expect((r as { detalle: string }).detalle).toMatch(/Fila 3 .* exactamente 1 fila seleccionada \(3 fila\(s\)\)/);
  });

  test('control: una tabla que permite selección múltiple → la segunda selección FALLA', async ({ page }) => {
    await page.setContent(POLIZAS('checkbox'));
    const c = caps(page);
    await c.tabla_seleccionar_fila({ matriz: [1], hacer: 'tabla_seleccionar_fila', tabla: 'Pólizas retornadas', fila: 1 }, ctx());
    expect(await err(c.tabla_seleccionar_fila({ matriz: [1], hacer: 'tabla_seleccionar_fila', tabla: 'Pólizas retornadas', fila: 2 }, ctx())))
      .toMatch(/hay 2 fila\(s\) seleccionada\(s\) \[1, 2\]/);
  });

  test('control: "fila_con" ambiguo o inexistente no elige al azar', async ({ page }) => {
    await page.setContent(POLIZAS('radio'));
    expect(await err(caps(page).tabla_seleccionar_fila({ matriz: [1], hacer: 'tabla_seleccionar_fila', tabla: 'Pólizas retornadas', fila_con: { Ramo: 'AUTOS' } }, ctx())))
      .toMatch(/3 fila\(s\) coinciden/);
  });
});
