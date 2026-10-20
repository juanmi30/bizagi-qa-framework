import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { cargarRegistro } from '../../sde/datos';
import type { EscenarioSde, PasoSde } from '../../sde/escenario';
import { crearContexto, ejecutarEscenario } from '../../sde/ejecutor';
import { crearCapacidadesUi, evaluarExtraccion, evaluarNoRegistra, type UiEntorno } from '../../sde/capacidades';

/**
 * Regresiones de la auditoría de Work del PR #7 (F1 y F2; F3 y F4 están en asignacion-recorrido.unit.spec.ts). Cada defecto
 * original se reproduce con un portal SINTÉTICO (nada sale a QA) y se exige el resultado correcto. Placas y pólizas ficticias.
 */
const reg = cargarRegistro();
const P = (matriz: number[], hacer: string, extra: Record<string, unknown> = {}): PasoSde => ({ matriz, hacer, ...extra });
const uiDe = (page: Page): UiEntorno =>
  ({ browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined });

// ---------------------------------------------------------------- F1: extracción del Worker AI frente a la narrativa
const GRILLA = (filas: [string, string][]) => `<div class="bzg-form-grid"><div class="bz-rn-grid-header-title">Detalle Polizas Asociadas</div>
  <table><thead><tr><th><label>Número Póliza</label></th><th><label>Placa</label></th></tr></thead>
  <tbody class="ui-bizagi-grid-body">${filas.map(([p, pl]) => `<tr data-bizagi-component="cells"><td>${p}</td><td>${pl}</td></tr>`).join('')}</tbody></table></div>`;
const POLIZAS = ['100245678', '1109876543', '9023456781'];
const PLACAS = ['ABC123', 'XYZ987', 'KLM456'];
const COMPARAR = { tabla: 'Detalle Polizas Asociadas', minimo_filas: 1, comparar: { 'Número Póliza': POLIZAS, Placa: PLACAS } };

test.describe('F1: tabla_verificar «comparar» es una aserción @unit', () => {
  const verificarCon = async (page: Page, filas: [string, string][], paso: Record<string, unknown> = COMPARAR) => {
    await page.setContent(GRILLA(filas));
    return crearCapacidadesUi(uiDe(page)).capacidades.tabla_verificar(P([12], 'tabla_verificar', paso), crearContexto(reg, {}, 'u'));
  };
  for (const comparar of [{}, null, undefined, { Placa: [] }, { Placa: ['   '] }, { Placa: null }, { ' ': ['ABC123'] }]) {
    test(`A: comparación sin contenido ${JSON.stringify(comparar)} nunca PASS`, async ({ page }) => {
      expect(await verificarCon(page, [['100245678', 'ABC123']], { ...COMPARAR, comparar })).toMatchObject({ estado: 'NOT_AUTOMATED' });
    });
  }
  test('A: una expectativa resuelta a blanco queda inconclusa', async ({ page }) => {
    await page.setContent(GRILLA([['100245678', 'ABC123']]));
    const ctx = crearContexto(reg, {}, 'u');
    ctx.resolver = () => '   ';
    expect(await crearCapacidadesUi(uiDe(page)).capacidades.tabla_verificar(P([12], 'tabla_verificar', COMPARAR), ctx)).toMatchObject({ estado: 'NOT_AUTOMATED' });
  });
  test('A: tabla sin comparación conserva la verificación de estructura', async ({ page }) => {
    const r = await verificarCon(page, [['100245678', 'ABC123']], { tabla: COMPARAR.tabla, columnas: ['Placa'], minimo_filas: 1 });
    expect((r as { estado?: string }).estado).toBeUndefined();
  });
  test('extracción exacta: PASS con el detalle de filas verificadas', async ({ page }) => {
    const r = await verificarCon(page, [[POLIZAS[0], PLACAS[0]], [POLIZAS[1], PLACAS[1]], [POLIZAS[2], PLACAS[2]]]);
    expect(r).toMatchObject({ detalle: expect.stringContaining('3 fila(s) verificadas') });
    expect((r as { estado?: string }).estado).toBeUndefined(); // PASS
  });
  test('ninguno de los esperados: FAIL', async ({ page }) => {
    await expect(verificarCon(page, [['555000111', 'QQQ111']])).rejects.toThrow(/extracción distinta de la narrativa .*0 de 3 esperados/);
  });
  test('falta una póliza: FAIL', async ({ page }) => {
    await expect(verificarCon(page, [[POLIZAS[0], PLACAS[0]], ['', PLACAS[1]], [POLIZAS[2], PLACAS[2]]])).rejects.toThrow(/Número Póliza: 2 de 3 esperados extraídos; FALTAN 1109876543/);
  });
  test('falta una placa: FAIL', async ({ page }) => {
    await expect(verificarCon(page, [[POLIZAS[0], PLACAS[0]], [POLIZAS[1], ''], [POLIZAS[2], PLACAS[2]]])).rejects.toThrow(/Placa: 2 de 3 esperados extraídos; FALTAN XYZ987/);
  });
  test('valor extra no presente en la narrativa: FAIL (INESPERADOS)', async ({ page }) => {
    await expect(verificarCon(page, [[POLIZAS[0], PLACAS[0]], [POLIZAS[1], PLACAS[1]], [POLIZAS[2], PLACAS[2]], ['777888999', 'ZZZ999']])).rejects.toThrow(/INESPERADOS 777888999/);
  });
  test('repeticiones: se informan sin exigir un número exacto de filas', async ({ page }) => {
    const r = await verificarCon(page, [[POLIZAS[0], PLACAS[0]], [POLIZAS[0], PLACAS[0]], [POLIZAS[1], PLACAS[1]], [POLIZAS[2], PLACAS[2]]]);
    expect(r).toMatchObject({ detalle: expect.stringContaining('repetidos 100245678') });
  });
  test('expectativa insuficiente: nunca PASS (queda pendiente)', async ({ page }) => {
    const r = await verificarCon(page, [[POLIZAS[0], PLACAS[0]]], { ...COMPARAR, comparar: { Placa: [''] } });
    expect(r).toMatchObject({ estado: 'NOT_AUTOMATED', causa: 'NO_AUTOMATIZADO' });
    expect(evaluarExtraccion({}, {}, 0).estado).toBe('NOT_AUTOMATED');
    expect(evaluarExtraccion({ Placa: [] }, { Placa: [] }, 0).estado).toBe('NOT_AUTOMATED');
  });
});

// ---------------------------------------------------------------- F2: «impide registrar» con lectura independiente
type Modo = 'abierto_no_persiste' | 'abierto_persiste' | 'cerrado_no_persiste' | 'cerrado_persiste' | 'no_cierra_tras_restaurar' | 'sin_lectura';
const PRINCIPAL = 'Proceso Principal Sintético';
const CAMPO = (etq: string, control: string) => `<div class="ui-bizagi-render"><span class="ui-bizagi-label"><label>${etq}</label></span><div class="ui-bizagi-render-control">${control}</div></div>`;
const GRILLA_PLACA = (placa: string, columna = 'Placa') => `<div class="bzg-form-grid"><div class="bz-rn-grid-header-title">Detalle Polizas Asociadas</div><table><thead><tr><th><label>${columna}</label></th></tr></thead><tbody class="ui-bizagi-grid-body"><tr data-bizagi-component="cells"><td>${placa}</td></tr></tbody></table></div>`;

/**
 * Portal sintético: la pestaña de TRABAJO muestra la grilla (que NO se refresca, como en el caso 651) y el pop-up; «Guardar»
 * envía el valor al «servidor», que según el modo lo guarda o no y cierra o no el pop-up. Otra pestaña que abre la actividad
 * desde el buscador renderiza la grilla con lo PERSISTIDO.
 */
async function portal(context: BrowserContext, page: Page, modo: Modo) {
  const servidor = { placa: 'DEF456', guardados: [] as string[] };
  const trabajo = `<!doctype html><html><body><div id="menuListInbox">Bandeja</div><div id="inbox">Bandeja</div>${GRILLA_PLACA('DEF456')}
    <div class="ui-dialog" role="dialog" id="dlg">${CAMPO('Placa', '<input id="placa">')}<button id="guardar">Guardar</button></div>
    <script>document.getElementById('guardar').onclick = async () => {
      const r = await (await fetch('/guardar', { method: 'POST', body: document.getElementById('placa').value })).json();
      if (r.cierra) document.getElementById('dlg').style.display = 'none';
    };</script></body></html>`;
  const buscador = `<!doctype html><html><body><div id="menuListInbox">Bandeja</div><div id="inbox">Bandeja</div><input id="menuQuery">
    <table><tbody><tr><td class="I_RadNumber">670</td><td>${PRINCIPAL}</td><td><ul class="gridListWorkItems"><li><span class="ui-bizagi-wp-app-inbox-activity-name">Estructurar información</span></li></ul></td></tr></tbody></table>
    <script>document.addEventListener('click', async (ev) => {
      if (!ev.target.closest('.ui-bizagi-wp-app-inbox-activity-name')) return;
      const j = await (await fetch('/estado')).json();
      document.body.insertAdjacentHTML('beforeend', '<div class="ui-bizagi-button-container"><button>Siguiente</button></div>' + j.grilla);
    });</script></body></html>`;
  await context.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.includes('/guardar')) {
      const valor = r.request().postData() ?? '';
      const invalido = valor.length > 6;
      const persiste = modo === 'abierto_persiste' || modo === 'cerrado_persiste' || (!invalido && modo !== 'no_cierra_tras_restaurar');
      if (persiste) { servidor.placa = valor; servidor.guardados.push(valor); }
      const cierra = modo === 'no_cierra_tras_restaurar' ? false : invalido ? modo.startsWith('cerrado') || modo === 'sin_lectura' : true;
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ cierra }) });
    }
    if (u.includes('/estado')) {
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ grilla: GRILLA_PLACA(servidor.placa, modo === 'sin_lectura' ? 'Otra' : 'Placa') }) });
    }
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body: u.includes('trabajo=1') ? trabajo : buscador });
  });
  await page.goto('http://portal.sintetico.local/?trabajo=1');
  await page.fill('#placa', 'MNP4567'); // P18: placa de 7 caracteres (ficticia)
  return servidor;
}

async function noRegistra(page: Page) {
  const ui = uiDe(page);
  ui.dialogo = page.locator('#dlg');
  ui.tabla = { tabla: 'Detalle Polizas Asociadas', fila: 1, filasAntes: 1 };
  const ctx = crearContexto(reg, { ...process.env, SDE_PROCESO_RADICACION: PRINCIPAL }, 'u');
  ctx.numeroCaso = '670';
  ctx.actividades.push('Estructurar información');
  ctx.dialogoAbierto = true;
  return crearCapacidadesUi(ui).capacidades.dialogo_confirmar(
    P([18], 'dialogo_confirmar', { espera: 'no_registra', campo: 'Placa', valor_rechazado: 'MNP4567', restaurar: 'DEF456' }), ctx);
}

test.describe('F2: «no_registra» exige evidencia de que el valor no persistió @unit', () => {
  test.setTimeout(120_000);
  // B: estos portales no acreditan identidad de registro. Su antigua aprobación por posición era el defecto.
  for (const modo of ['abierto_no_persiste', 'abierto_persiste', 'cerrado_no_persiste', 'cerrado_persiste', 'sin_lectura', 'no_cierra_tras_restaurar'] as Modo[]) {
    test(`B: ${modo}: inconcluso sin identidad, recuperación separada`, async ({ page, context }) => {
      const servidor = await portal(context, page, modo);
      const r = await noRegistra(page);
      expect(r).toMatchObject({ estado: 'NOT_AUTOMATED', causa: 'AUTOMATIZACION', detalle: expect.stringContaining('sin identidad fiable') });
      if (modo === 'cerrado_persiste') expect(servidor.guardados).toEqual(['MNP4567']);
      if (modo === 'no_cierra_tras_restaurar') expect(r).toMatchObject({ incidente: { causa: 'PRODUCTO_POR_CONFIRMAR', detalle: expect.stringContaining('P-21a') } });
      else expect((r as { incidente?: unknown }).incidente).toBeUndefined();
    });
  }
  for (const orden of ['objetivo-primero', 'objetivo-segundo']) {
    test(`B: dos filas ${orden}, inválida persistida y otra válida: nunca PASS`, async ({ page, context }) => {
      const servidor = await portal(context, page, 'cerrado_persiste');
      // IDs puramente sintéticos: NO son evidencia del DOM ni del modelo real de Bizagi.
      // Antes de guardar, el objetivo es la primera de DOS filas. El servidor puede devolverlo en otra posición.
      await page.locator('.ui-bizagi-grid-body').evaluate((el) => {
        el.innerHTML = '<tr data-bizagi-component="cells" data-key="sint-objetivo"><td>DEF456</td></tr><tr data-bizagi-component="cells" data-key="sint-otra"><td>ABC123</td></tr>';
      });
      const filas = orden === 'objetivo-primero' ? [['sint-objetivo', 'MNP4567'], ['sint-otra', 'ABC123']] : [['sint-otra', 'ABC123'], ['sint-objetivo', 'MNP4567']];
      const grilla = `<div class="bzg-form-grid"><div class="bz-rn-grid-header-title">Detalle Polizas Asociadas</div><table><thead><tr><th><label>Placa</label></th></tr></thead><tbody class="ui-bizagi-grid-body">${filas.map(([id, placa]) => `<tr data-bizagi-component="cells" data-key="${id}"><td>${placa}</td></tr>`).join('')}</tbody></table></div>`;
      await context.route('**/estado', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ grilla }) }));
      const r = await noRegistra(page);
      expect(servidor.guardados).toEqual(['MNP4567']);
      expect(r).toMatchObject({ estado: 'NOT_AUTOMATED', causa: 'AUTOMATIZACION' });
    });
  }
  test('evaluación pura: validación y recuperación separadas', () => {
    expect(evaluarNoRegistra({ rechazado: 'MNP4567', persistido: 'MNP4567', popupAbierto: false, recuperacion: 'no_requerida' }).estado).toBe('FAIL');
    expect(evaluarNoRegistra({ rechazado: 'MNP4567', persistido: null, popupAbierto: true, recuperacion: 'cerro' }).estado).toBe('NOT_AUTOMATED');
    const r = evaluarNoRegistra({ rechazado: 'MNP4567', persistido: 'MNP4567', popupAbierto: true, recuperacion: 'no_cerro' });
    expect(r).toMatchObject({ estado: 'FAIL', incidente: expect.stringContaining('P-21a') });
  });
  test('ejecutor: el incidente queda en el paso, detiene el recorrido y el CP no queda REAL_PASS', async () => {
    const esc: EscenarioSde = { id: 'HU06-CP02', titulo: 't', etiquetas: [], actores: ['analista'], datasets: [], cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'r' }, archivo: 'sint',
      pasos: [P([2], 'iniciar_sesion', { actor: 'analista' }), P([18], 'p18'), P([22], 'despues')] };
    let despues = 0;
    const r = await ejecutarEscenario(esc, {
      capacidades: {
        iniciar_sesion: async (_p, c) => { c.sesiones.add('analista'); c.numeroCaso = '700'; },
        p18: async () => ({ detalle: 'No registra', incidente: { causa: 'PRODUCTO_POR_CONFIRMAR', detalle: 'P-21a: no cerró' } }),
        despues: async () => { despues++; },
      },
      verificar: async () => ({ ok: true, detalle: '' }), evidencia: async () => undefined,
    }, crearContexto(reg, { BIZAGI_BASE_URL: 'https://sde.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c' }, 'u'));
    expect(r.pasos[1]).toMatchObject({ estado: 'PASS', incidente: { causa: 'PRODUCTO_POR_CONFIRMAR' } });
    expect(r.pasos[1].detalle).toMatch(/INCIDENTE SEPARADO/);
    expect(r.pasos[2].estado).toBe('NOT_RUN');
    expect(despues).toBe(0);
    expect(r.estado).not.toBe('REAL_PASS');
  });
});
