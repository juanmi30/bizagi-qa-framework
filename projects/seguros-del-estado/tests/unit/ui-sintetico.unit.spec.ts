import { test, expect, type Page } from '@playwright/test';
import { cargarRegistro } from '../../sde/datos';
import type { EscenarioSde } from '../../sde/escenario';
import { crearContexto, ejecutarEscenario } from '../../sde/ejecutor';
import { crearCapacidadesUi, type UiEntorno } from '../../sde/capacidades';
import {
  botonesVisibles, campo, diligenciar, esObligatorio, estaSoloLectura, etiqueta, hayLineaExacta, hayTextoVisible, infoCampo, valorMostrado,
} from '../../sde/ui';

/**
 * DOM SINTÉTICO que imita el render Bizagi (prefijo de clase ui-bizagi-render). Valida la LÓGICA de
 * las primitivas y capabilities (exactitud, ambigüedad, post-condiciones, filas exactas). NO prueba que
 * el DOM real de SDE sea así: eso lo calibra tests/exploracion.real.spec.ts contra QA.
 */

const CAMPO = (etq: string, control: string, clases = '') =>
  `<div class="ui-bizagi-render ${clases}"><label>${etq}</label><div class="ui-bizagi-render-control">${control}</div></div>`;

// Estructura calcada del DOM REAL de QA SDE (2026-10-08): combo input[role=combobox][aria-controls] + ul[role=listbox],
// marca .control-required, radios label[for], ayuda multilínea con <br>, botones input.ui-bizagi-button.
const FORMULARIO = `
  ${CAMPO('Línea<span>*</span>', '<div class="ui-bizagi-render-control control-required"><input id="linea" class="ui-select-data" role="combobox" aria-controls="listbox-linea" value="Por favor seleccione..."></div>', 'ui-bizagi-render-required')}
  ${CAMPO('Sucursal', '<div class="ui-bizagi-render-control control-required"><input class="ui-select-data" role="combobox" aria-controls="listbox-suc" value="Por favor seleccione..."></div>')}
  ${CAMPO('Tipo de Solicitud', '<div class="ui-bizagi-control-wrapper ui-bizagi-noneditable-normal"><div class="ui-bizagi-render-control"><label class="readonly-control">Modificación</label></div></div>')}
  <div class="ui-bizagi-render"><span class="ui-bizagi-label"><label>Individual: Solicitud asociada a una única póliza.<br>Masivo: Solicitud asociada a más de una póliza.</label></span></div>
  ${CAMPO('Ramo', '<select id="ramo"><option></option><option>Ramo A</option><option>Ramo B</option></select>')}
  ${CAMPO('Placa', '<input id="placa" maxlength="6">')}
  ${CAMPO('Número de Caso', '<span>4321</span>', 'ui-bizagi-render-readonly')}
  ${CAMPO('Fecha de Creación', '<input value="07/10/2026" readonly>')}
  ${CAMPO('Observaciones', '<textarea></textarea>')}
  ${CAMPO('¿Requiere actualizar el correo electrónico?', '<input type="radio" name="c" id="si"><label for="si">Sí</label><input type="radio" name="c" id="no"><label for="no">No</label>')}
  <div class="ui-bizagi-render" id="correo" hidden><label>Nuevo correo Electrónico de Facturación *</label><input></div>
  <p>Masivo: Solicitud asociada a más de una póliza.</p>
  <div class="ui-bizagi-button-container"><button>Desistir Solicitud</button><button>Confirmar Radicación</button><button style="display:none">Guardar</button></div>
  <ul role="listbox" id="listbox-linea" hidden><li role="option">-------------</li><li role="option">Autos</li><li role="option">Generales</li><li role="option">Autos Pesados</li></ul>
  <ul role="listbox" id="listbox-suc" hidden><li role="option">-------------</li></ul>
  <script>(() => {
    const op = document.getElementById('listbox-linea'), linea = document.getElementById('linea');
    document.querySelectorAll('input[role=combobox]').forEach(c => c.addEventListener('click', () => { document.getElementById(c.getAttribute('aria-controls')).hidden = false; }));
    op.querySelectorAll('li').forEach(li => li.addEventListener('click', () => {
      linea.value = li.textContent; op.hidden = true;
      linea.parentElement.classList.toggle('control-required', /^-+$/.test(li.textContent)); // Bizagi quita la marca al tener valor
    }));
    document.getElementById('si').addEventListener('change', () => { document.getElementById('correo').hidden = false; });
    document.getElementById('no').addEventListener('change', () => { document.getElementById('correo').hidden = true; });
  })();</script>`;

test.describe('Primitivas UI SDE sobre DOM sintético @unit', () => {
  test.beforeEach(async ({ page }) => { await page.setContent(FORMULARIO); });

  test('etiqueta exacta: tolera "*", pero no confunde tildes ni prefijos', async ({ page }) => {
    await expect(etiqueta(page, 'Línea', 1_000)).resolves.toBeTruthy();
    await expect(etiqueta(page, 'Linea', 1_000)).rejects.toThrow(/No se encontró visible/);
    await expect(etiqueta(page, 'Lín', 1_000)).rejects.toThrow(/No se encontró visible/);
  });

  test('ambigüedad: dos etiquetas iguales visibles fallan en vez de elegir una', async ({ page }) => {
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div class="ui-bizagi-render"><label>Ramo</label><input></div>'));
    await expect(etiqueta(page, 'Ramo', 1_000)).rejects.toThrow(/exactamente 1 .* hay 2/);
  });

  test('solo lectura, editable y obligatorio', async ({ page }) => {
    const info = async (t: string) => infoCampo(await campo(page, t), t);
    expect(estaSoloLectura(await info('Número de Caso'))).toBe(true);     // clase readonly, sin control
    expect(estaSoloLectura(await info('Fecha de Creación'))).toBe(true);  // input readonly
    expect(estaSoloLectura(await info('Observaciones'))).toBe(false);
    expect(valorMostrado(await info('Número de Caso'))).toBe('4321');
    expect(esObligatorio(await info('Línea'), await (await etiqueta(page, 'Línea')).innerText())).toBe(true);
    expect(esObligatorio(await info('Ramo'), 'Ramo')).toBe(false);
  });

  test('lista personalizada: elige la opción EXACTA (no "Autos Pesados") y confirma el valor', async ({ page }) => {
    await diligenciar(page, 'Línea', 'Autos', 'lista');
    await expect(page.locator('#linea')).toHaveValue('Autos');
  });

  test('combo sin la opción pedida falla listando las opciones disponibles (no elige otra)', async ({ page }) => {
    await expect(diligenciar(page, 'Sucursal', 'BOGOTA', 'lista')).rejects.toThrow(/la opción "BOGOTA" no está en la lista \(visibles: -------------\)/);
  });

  test('combo que se abre y cierra con cada clic: el error lista las opciones reales, no "ninguna" (2026-10-14)', async ({ page }) => {
    test.setTimeout(120_000);
    // Como el combo real de Ramo: cada clic alterna la lista; QA cambió el texto a "<código> - <nombre>".
    await page.setContent(`${CAMPO('Ramo', '<input id="ramo" role="combobox" aria-controls="lb-ramo" value="">')}
      <ul role="listbox" id="lb-ramo" hidden><li role="option">48 - AUTOMÓVILES LIVIANOS INDIVIDUAL</li><li role="option">50 - AUTOMÓVILES PESADOS INDIVIDUAL</li></ul>
      <script>document.getElementById('ramo').addEventListener('click', () => { const l = document.getElementById('lb-ramo'); l.hidden = !l.hidden; });</script>`);
    await expect(diligenciar(page, 'Ramo', 'AUTOMÓVILES LIVIANOS INDIVIDUAL', 'lista'))
      .rejects.toThrow('la opción "AUTOMÓVILES LIVIANOS INDIVIDUAL" no está en la lista (visibles: 48 - AUTOMÓVILES LIVIANOS INDIVIDUAL | 50 - AUTOMÓVILES PESADOS INDIVIDUAL)');
  });

  test('obligatoriedad Bizagi (.control-required) solo mientras el campo está vacío; valor de un campo de solo lectura', async ({ page }) => {
    const info = async (t: string) => infoCampo(await campo(page, t), t);
    expect(esObligatorio(await info('Sucursal'), 'Sucursal')).toBe(true);
    expect(valorMostrado(await info('Sucursal'))).toBe(''); // "Por favor seleccione..." no es un valor
    expect(estaSoloLectura(await info('Tipo de Solicitud'))).toBe(true);
    expect(valorMostrado(await info('Tipo de Solicitud'))).toBe('Modificación');
  });

  test('texto de ayuda multilínea: cada línea debe coincidir completa', async ({ page }) => {
    // 2 = la línea dentro del label con <br> + el párrafo de una sola línea del mismo formulario.
    expect(await hayLineaExacta(page, 'Masivo: Solicitud asociada a más de una póliza.')).toBe(2);
    expect(await hayLineaExacta(page, 'Masivo: Solicitud asociada a más de una')).toBe(0);
    expect(await hayLineaExacta(page, 'Masivo: Solicitud asociada a mas de una poliza.')).toBe(0);
  });

  test('select nativo por texto de opción', async ({ page }) => {
    await diligenciar(page, 'Ramo', 'Ramo B', 'lista');
    await expect(page.locator('#ramo')).toHaveValue('Ramo B');
  });

  test('post-condición: un valor truncado por longitud máxima se detecta (base para la prueba de Placa > 6)', async ({ page }) => {
    await expect(diligenciar(page, 'Placa', 'ABC1234', 'texto')).rejects.toThrow(/muestra "ABC123" tras diligenciar "ABC1234"/);
    await diligenciar(page, 'Placa', 'ABC123', 'texto');
  });

  test('radio Sí/No cambia la visibilidad del campo dependiente', async ({ page }) => {
    expect(await hayTextoVisible(page, 'Nuevo correo Electrónico de Facturación')).toBe(0);
    await diligenciar(page, '¿Requiere actualizar el correo electrónico?', 'Sí', 'radio');
    expect(await hayTextoVisible(page, 'Nuevo correo Electrónico de Facturación')).toBe(1);
    await diligenciar(page, '¿Requiere actualizar el correo electrónico?', 'No', 'radio');
    expect(await hayTextoVisible(page, 'Nuevo correo Electrónico de Facturación')).toBe(0);
  });

  test('botones visibles (ignora ocultos) y texto exacto con tildes', async ({ page }) => {
    expect(await botonesVisibles(page)).toEqual(['Desistir Solicitud', 'Confirmar Radicación']);
    expect(await hayTextoVisible(page, 'Masivo: Solicitud asociada a más de una póliza.', false)).toBe(1);
    expect(await hayTextoVisible(page, 'Masivo: Solicitud asociada a mas de una poliza.', false)).toBe(0);
  });
});

// ---------- Campo y opción de radio con el MISMO texto (formulario de inicio HU03 real, 2026-10-13) ----------
const RADIO_Y_CAMPO = `
  <div class="ui-bizagi-render"><span class="ui-bizagi-label"><label>Forma de Consulta Unitaria</label></span>
    <div class="ui-bizagi-render-control"><input type="radio" id="o1" name="f"><label for="o1">Número de póliza</label>
    <input type="radio" id="o2" name="f" checked><label for="o2">Placa</label></div></div>
  <div class="ui-bizagi-render" id="campo-placa"><span class="ui-bizagi-label"><label>Placa</label></span>
    <div class="ui-bizagi-render-control control-required"><input id="placa"></div></div>`;

test.describe('Desempate campo vs. opción de radio @unit', () => {
  test('"Placa" resuelve al CAMPO (etiqueta de campo) y no a la opción del radio', async ({ page }) => {
    await page.setContent(RADIO_Y_CAMPO);
    const c = await campo(page, 'Placa');
    expect(await c.getAttribute('id')).toBe('campo-placa');
    expect(esObligatorio(await infoCampo(c, 'Placa'), 'Placa')).toBe(true);
  });

  test('control: dos ETIQUETAS DE CAMPO iguales siguen siendo ambiguas (no se elige al azar)', async ({ page }) => {
    await page.setContent(RADIO_Y_CAMPO + RADIO_Y_CAMPO.replace('campo-placa', 'campo-placa-2').replace(/o1|o2/g, (m) => m + 'b'));
    await expect(campo(page, 'Placa')).rejects.toThrow(/exactamente 1/);
  });
});

// ---------- Tabla "Pólizas asociadas" + pop-up, ejecutada por el EJECUTOR con capabilities UI reales ----------
const TABLA = `
  <div class="ui-bizagi-render"><label>Pólizas asociadas a la solicitud</label>
    <button title="Agregar">+</button>
    <table><thead><tr><th>Forma de Consulta</th><th>Tipo de Documento Tomador</th><th>Número de Documento Tomador</th><th></th></tr></thead>
      <tbody id="filas"></tbody></table></div>
  <div role="dialog" class="ui-dialog" id="dlg" hidden>
    <div class="ui-bizagi-render ui-bizagi-render-readonly"><label>Forma de Consulta</label><span>Identificación de Tomador</span></div>
    <div class="ui-bizagi-render ui-bizagi-render-required"><label>Tipo de Documento Tomador</label><select id="tipo"><option></option><option>CC</option><option>NIT</option></select></div>
    <div class="ui-bizagi-render" id="dv" hidden><label>Dígito de Verificación</label><input readonly></div>
    <div class="ui-bizagi-render ui-bizagi-render-required"><label>Número de Documento Tomador</label><input id="num"></div>
    <button id="guardar">Guardar</button><button id="cancelar">Cancelar</button>
  </div>
  <script>(() => {
    const datos = [['Identificación de Tomador', 'CC', '111'], ['Identificación de Tomador', 'CC', '222']];
    let editando = null;
    const dlg = document.getElementById('dlg'), tipo = document.getElementById('tipo'), num = document.getElementById('num');
    const pintar = () => {
      document.getElementById('filas').innerHTML = datos.map((d, i) =>
        '<tr><td>' + d.join('</td><td>') + '</td><td><button title="Editar" data-i="' + i + '">e</button><button title="Eliminar" data-i="' + i + '">x</button></td></tr>').join('');
      document.querySelectorAll('[title=Editar]').forEach(b => b.onclick = () => { editando = +b.dataset.i; tipo.value = datos[editando][1]; num.value = ''; dlg.hidden = false; });
      document.querySelectorAll('[title=Eliminar]').forEach(b => b.onclick = () => { datos.splice(+b.dataset.i, 1); pintar(); });
    };
    tipo.onchange = () => { document.getElementById('dv').hidden = tipo.value !== 'NIT'; };
    document.querySelector('[title=Agregar]').onclick = () => { editando = -1; tipo.value = ''; num.value = ''; dlg.hidden = false; };
    document.getElementById('cancelar').onclick = () => { dlg.hidden = true; };
    document.getElementById('guardar').onclick = () => {
      if (!tipo.value || !num.value) return; // obligatorios: el pop-up permanece abierto
      const fila = ['Identificación de Tomador', tipo.value, num.value];
      if (editando === -1) datos.push(fila); else datos[editando] = fila;
      dlg.hidden = true; pintar();
    };
    pintar();
  })();</script>`;

const reg = cargarRegistro();
const ENV = {
  BIZAGI_BASE_URL: 'https://qa.ficticio.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c',
  SDE_EST_TOMADOR_NIT: '900123456', SDE_EST_TOMADOR_NIT_2: '900654321',
};
const P = (matriz: number[], hacer: string, extra: Record<string, unknown> = {}) => ({ matriz, hacer, ...extra });
const ESCENARIO: EscenarioSde = {
  id: 'HU06-CP01', titulo: 'subconjunto sintético pasos 17–26', etiquetas: [], actores: ['analista'],
  datasets: ['EST-FILA-GENERALES-PN'], cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'sintético' }, archivo: 'sintetico',
  pasos: [
    P([2], 'iniciar_sesion', { actor: 'analista' }),
    P([17], 'tabla_verificar', { tabla: 'Pólizas asociadas a la solicitud', minimo_filas: 1, columnas: ['Número de Documento Tomador'] }),
    P([18], 'tabla_abrir_fila', { tabla: 'Pólizas asociadas a la solicitud', fila: 1, formulario: 'sintetico' }),
    P([19], 'verificar', { verificar: [{ valor: { campo: 'Forma de Consulta', igual: 'Identificación de Tomador' } }, { solo_lectura: ['Forma de Consulta'] }] }),
    P([20], 'verificar', { verificar: [{ obligatorio: ['Tipo de Documento Tomador', 'Número de Documento Tomador'] }] }),
    P([21], 'diligenciar', { campos: [{ campo: 'Tipo de Documento Tomador', valor: '${dato:EST-FILA-GENERALES-PN.tipo_documento}', tipo: 'lista' }],
      verificar: [{ visible: 'Dígito de Verificación' }, { solo_lectura: ['Dígito de Verificación'] }] }),
    P([22], 'dialogo_confirmar', { espera: 'permanece_abierto' }),
    P([23], 'diligenciar', { campos: [{ campo: 'Número de Documento Tomador', valor: '${dato:EST-FILA-GENERALES-PN.numero_documento}' }] }),
    P([23], 'dialogo_confirmar', { espera: 'cierra', fila_resultante: { 'Número de Documento Tomador': '${dato:EST-FILA-GENERALES-PN.numero_documento}', 'Tipo de Documento Tomador': 'NIT' } }),
    P([24], 'tabla_agregar', { tabla: 'Pólizas asociadas a la solicitud', formulario: 'sintetico' }),
    P([25], 'diligenciar', { campos: [
      { campo: 'Tipo de Documento Tomador', valor: 'NIT', tipo: 'lista' },
      { campo: 'Número de Documento Tomador', valor: '${dato:EST-FILA-GENERALES-PN.numero_documento_nueva_fila}' }] }),
    P([25], 'dialogo_confirmar', { espera: 'cierra', fila_resultante: { 'Número de Documento Tomador': '${dato:EST-FILA-GENERALES-PN.numero_documento_nueva_fila}' } }),
    P([26], 'tabla_eliminar_fila', { tabla: 'Pólizas asociadas a la solicitud', fila_con: { 'Número de Documento Tomador': '${dato:EST-FILA-GENERALES-PN.numero_documento_nueva_fila}' } }),
  ],
};

// Registro de pop-ups SOLO para el DOM sintético: aquí el cierre con Guardar es controlado por la propia prueba.
const POPUP_SINTETICO = { sintetico: { tabla: 'Pólizas asociadas a la solicitud', descripcion: 'DOM sintético', estado: 'calibrado' as const,
  mapeo_controles: { 'Número de Documento Tomador': '#num' }, evidencia: 'DOM sintético de la prueba', cierre_seguro_verificado: true } };

async function ejecutarSintetico(page: Page) {
  const ui: UiEntorno = { browser: page.context().browser()!, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined, popupsCalibrados: POPUP_SINTETICO };
  const { capacidades, verificar } = crearCapacidadesUi(ui);
  // Login SINTÉTICO: no hay portal; se marca la sesión para poder ejecutar el resto. No fija número de caso.
  capacidades.iniciar_sesion = async (p, ctx) => { ui.paginas.set(p.actor as string, page); ui.actual = p.actor as string; ctx.sesiones.add(p.actor as string); };
  return ejecutarEscenario(ESCENARIO, { capacidades, verificar, evidencia: async () => undefined }, crearContexto(reg, ENV, 'sint'));
}

test.describe('Capabilities de tabla + ejecutor sobre DOM sintético @unit', () => {
  test('editar fila exacta, bloquear confirmación sin obligatorios, agregar y eliminar la fila propia', async ({ page }) => {
    await page.setContent(TABLA);
    const r = await ejecutarSintetico(page);
    const fallos = r.pasos.filter((p) => p.estado !== 'PASS').map((p) => `#${p.indice} ${p.hacer}: ${p.estado} ${p.detalle}`);
    expect(fallos).toEqual([]);
    const celdas = await page.locator('#filas tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].slice(0, 3).map((td) => td.textContent)));
    expect(celdas).toEqual([['Identificación de Tomador', 'NIT', '900123456'], ['Identificación de Tomador', 'CC', '222']]);
    // Sin número de caso real el CP jamás es verde, aunque todos los pasos sintéticos pasen.
    expect(r.estado).toBe('FAIL');
    expect(r.motivo).toMatch(/número de caso/);
  });

  test('si el pop-up acepta confirmar sin obligatorios, el paso 22 falla', async ({ page }) => {
    await page.setContent(TABLA.replace('if (!tipo.value || !num.value) return;', ''));
    const r = await ejecutarSintetico(page);
    const p22 = r.pasos.find((p) => p.matriz.includes(22))!;
    expect(p22.estado).toBe('FAIL');
    expect(p22.detalle).toMatch(/se confirmó sin los campos obligatorios/);
  });

  test('dialogo_cancelar cierra el pop-up y verifica que la tabla no cambió', async ({ page }) => {
    await page.setContent(TABLA);
    const ui: UiEntorno = { browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined, popupsCalibrados: POPUP_SINTETICO };
    const { capacidades } = crearCapacidadesUi(ui);
    const ctx = crearContexto(reg, ENV, 'sint');
    await capacidades.tabla_abrir_fila({ matriz: [18], hacer: 'tabla_abrir_fila', tabla: 'Pólizas asociadas a la solicitud', fila: 2, formulario: 'sintetico' }, ctx);
    const r = await capacidades.dialogo_cancelar({ matriz: [18], hacer: 'dialogo_cancelar' }, ctx);
    expect((r as { detalle: string }).detalle).toMatch(/sin cambios \(2 fila\(s\)\)/);
    await expect(page.locator('#dlg')).toBeHidden();
  });

  test('si la edición queda en otra fila, "fila_resultante" lo detecta', async ({ page }) => {
    await page.setContent(TABLA.replace('else datos[editando] = fila;', 'else datos[editando === 0 ? 1 : 0] = fila;'));
    const r = await ejecutarSintetico(page);
    expect(r.pasos.find((p) => p.hacer === 'dialogo_confirmar' && p.matriz.includes(23))!.detalle).toMatch(/la fila 1 no quedó con los valores esperados/);
  });
});
