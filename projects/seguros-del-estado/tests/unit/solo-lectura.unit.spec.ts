import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { cargarRegistro } from '../../sde/datos';
import { CAPACIDADES, type EscenarioSde, type PasoSde } from '../../sde/escenario';
import { crearContexto, ejecutarEscenario, CAPACIDADES_DECLARATIVAS } from '../../sde/ejecutor';
import { crearCapacidadesUi, type UiEntorno } from '../../sde/capacidades';
import { bloqueosDom, exigirSoloLectura, OPERACIONES, protegerSoloLectura, SoloLecturaError } from '../../sde/soloLectura';

/**
 * P-15: el modo solo lectura impide efectivamente las operaciones de escritura (capacidades, navegador y red). Portal
 * SINTÉTICO: cada control con efecto deja constancia en window.efectos si llegó a ejecutarse. Sin QA.
 */

const reg = cargarRegistro();
const ENV = { BIZAGI_BASE_URL: 'https://sde.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c' };
const ORIGEN = 'https://sde.test/';

const CAMPO = (etq: string, control: string) =>
  `<div class="ui-bizagi-render"><span class="ui-bizagi-label"><label>${etq}</label></span><div class="ui-bizagi-render-control">${control}</div></div>`;
const EFECTO = (n: string) => `window.efectos.push('${n}')`;
const PORTAL = `<html><body><script>window.efectos = [];</script>
  ${CAMPO('Línea', '<input id="linea">')}
  ${CAMPO('Tipo de Radicación', '<input type="radio" id="ind" name="t"><label for="ind">Individual</label>')}
  <div class="bzg-form-grid"><div class="bz-rn-grid-header-title">Documentos Anexos</div>
    <table><thead><tr><th><label>Tipo Documental</label></th></tr></thead>
      <tbody class="ui-bizagi-grid-body"><tr data-bizagi-component="cells"><td>Solicitud</td></tr></tbody></table>
    <ul><li data-action="add" onclick="${EFECTO('add')}">Adicionar</li><li data-action="save" onclick="${EFECTO('save')}">Guardar fila</li>
      <li data-action="remove" onclick="${EFECTO('remove')}">Eliminar</li></ul></div>
  ${CAMPO('Soporte', `<input type="file" id="archivo" onchange="${EFECTO('archivo')}">`)}
  <ul role="tablist"><li role="tab" aria-selected="false" onclick="this.setAttribute('aria-selected','true')">Seguimiento/Trazabilidad</li></ul>
  <div class="ui-bizagi-button-container"><button onclick="${EFECTO('Guardar')}">Guardar</button>
    <button onclick="${EFECTO('Siguiente')}">Siguiente</button><button onclick="${EFECTO('Crear')}">Crear</button></div>
</body></html>`;

/** Portal sintético servido en un origen propio; las acciones de Bizagi que lleguen "al servidor" quedan registradas. */
async function portal(context: BrowserContext, page: Page, protegido: boolean) {
  const servidor: string[] = [];
  await context.route(`${ORIGEN}**`, (route) => {
    const cuerpo = route.request().postData();
    if (cuerpo) servidor.push(cuerpo);
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PORTAL });
  });
  const registro = protegido ? await protegerSoloLectura(context) : null;
  await page.goto(ORIGEN);
  return { servidor, registro };
}

const efectos = (page: Page) => page.evaluate(() => (window as unknown as { efectos: string[] }).efectos);
const uiDe = (page: Page, soloLectura: boolean): UiEntorno =>
  ({ browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined, soloLectura });
const P = (matriz: number[], hacer: string, extra: Record<string, unknown> = {}): PasoSde => ({ matriz, hacer, ...extra });

test.describe('P-15 — clasificación de las capacidades @unit', () => {
  test('toda capacidad del motor está clasificada explícitamente; lo no clasificado se deniega', () => {
    const conocidas = [...Object.keys(CAPACIDADES), ...Object.keys(CAPACIDADES_DECLARATIVAS)];
    expect(conocidas.filter((c) => !OPERACIONES[c])).toEqual([]);
    expect(() => exigirSoloLectura('accion_nueva', { numeroCaso: null })).toThrow(/acción no clasificada: se trata como escritura/);
    // Escritura clasificada por su efecto, no por el texto del botón: TODO "pulsar" se deniega.
    for (const c of ['pulsar', 'adjuntar', 'adjuntar_en_grilla', 'tabla_abrir_fila', 'tabla_agregar', 'dialogo_confirmar', 'dialogo_cancelar', 'tabla_eliminar_fila', 'tabla_seleccionar_fila'])
      expect(() => exigirSoloLectura(c, { numeroCaso: null }), c).toThrow(SoloLecturaError);
    // Formulario de inicio: permitido sin caso (precreación); con un caso existente, Bizagi enviaría los valores.
    expect(() => exigirSoloLectura('diligenciar', { numeroCaso: null })).not.toThrow();
    expect(() => exigirSoloLectura('diligenciar', { numeroCaso: '571' })).toThrow(/hay un caso existente \(571\)/);
  });
});

test.describe('P-15 — capacidades en solo lectura (portal sintético) @unit', () => {
  test('1-2. lectura de etiquetas, textos, grillas y pestañas: permitida', async ({ page, context }) => {
    await portal(context, page, true);
    const { capacidades, verificar } = crearCapacidadesUi(uiDe(page, true));
    const ctx = crearContexto(reg, ENV, 'u');
    const etq = await verificar({ etiquetas: ['Línea', 'Tipo de Radicación'] }, ctx);
    expect(etq.ok, etq.detalle).toBe(true);
    const orto = await verificar({ ortografia: 'inicio-radicacion' }, ctx);
    expect(orto.ok, orto.detalle).toBe(true);
    expect(await capacidades.tabla_verificar(P([6], 'tabla_verificar', { tabla: 'Documentos Anexos', columnas: ['Tipo Documental'] }), ctx)).toMatchObject({ detalle: expect.stringContaining('1 fila(s)') });
    expect(await capacidades.abrir_pestana(P([28], 'abrir_pestana', { pestana: 'Seguimiento/Trazabilidad' }), ctx)).toMatchObject({ detalle: expect.stringContaining('activa') });
    expect(await efectos(page)).toEqual([]);
  });

  test('3-4. "Guardar" y "Crear" se rechazan ANTES del clic (nada se ejecuta)', async ({ page, context }) => {
    await portal(context, page, true);
    const { capacidades } = crearCapacidadesUi(uiDe(page, true));
    const ctx = crearContexto(reg, ENV, 'u');
    await expect(capacidades.pulsar(P([20], 'pulsar', { boton: 'Guardar' }), ctx)).rejects.toThrow(/^POLÍTICA SOLO LECTURA: se rechazó "pulsar" antes de ejecutarse/);
    await expect(capacidades.pulsar(P([8], 'pulsar', { boton: 'Crear', capturar_numero_caso: true }), ctx)).rejects.toThrow(SoloLecturaError);
    expect(await efectos(page)).toEqual([]);
    expect(ctx.numeroCaso).toBeNull();
  });

  test('5. agregar, eliminar filas y subir documentos: rechazados', async ({ page, context }) => {
    await portal(context, page, true);
    const { capacidades } = crearCapacidadesUi(uiDe(page, true));
    const ctx = crearContexto(reg, ENV, 'u');
    for (const p of [P([22], 'tabla_agregar', { tabla: 'Documentos Anexos', formulario: 'x' }), P([26], 'tabla_eliminar_fila', { tabla: 'Documentos Anexos', fila: 1 }),
      P([9], 'adjuntar', { campo: 'Soporte', archivo: 'x.pdf' }), P([9], 'adjuntar_en_grilla', { grilla: 'Documentos Anexos', archivo: 'x.pdf' })]) {
      await expect(capacidades[p.hacer](p, ctx), p.hacer).rejects.toThrow(SoloLecturaError);
    }
    expect(await efectos(page)).toEqual([]);
  });

  test('6. navegación con escritura ("Siguiente", confirmar/cancelar pop-up) y diligenciar sobre un caso existente: rechazados', async ({ page, context }) => {
    await portal(context, page, true);
    const { capacidades } = crearCapacidadesUi(uiDe(page, true));
    const ctx = crearContexto(reg, ENV, 'u');
    await expect(capacidades.pulsar(P([20], 'pulsar', { boton: 'Siguiente' }), ctx)).rejects.toThrow(SoloLecturaError);
    await expect(capacidades.dialogo_confirmar(P([23], 'dialogo_confirmar', { espera: 'cierra' }), ctx)).rejects.toThrow(SoloLecturaError);
    await expect(capacidades.dialogo_cancelar(P([18], 'dialogo_cancelar'), ctx)).rejects.toThrow(SoloLecturaError);
    ctx.numeroCaso = '571';
    await expect(capacidades.diligenciar(P([27], 'diligenciar', { campos: [{ campo: 'Línea', valor: 'X' }] }), ctx)).rejects.toThrow(/caso existente \(571\)/);
    expect(await page.locator('#linea').inputValue()).toBe('');
    expect(await efectos(page)).toEqual([]);
  });

  test('7 y 10. acción desconocida en el ejecutor: BLOCKED por la política, nunca invocada ni atribuida al producto', async () => {
    let invocada = 0;
    const esc: EscenarioSde = { id: 'HU06-CP05', titulo: 't', etiquetas: [], actores: ['analista'], datasets: [], cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'r' }, archivo: 'sint',
      pasos: [P([2], 'iniciar_sesion', { actor: 'analista' }), P([7], 'accion_nueva'), P([8], 'pulsar', { boton: 'Guardar' })] };
    const r = await ejecutarEscenario(esc, {
      capacidades: { iniciar_sesion: async (_p, c) => { c.sesiones.add('analista'); }, accion_nueva: async () => { invocada++; }, pulsar: async () => { invocada++; } },
      verificar: async () => ({ ok: true, detalle: '' }), evidencia: async () => undefined, soloLectura: true,
    }, crearContexto(reg, ENV, 'u'));
    expect(invocada).toBe(0);
    expect(r.pasos[1]).toMatchObject({ estado: 'BLOCKED', causa: 'POLITICA_SOLO_LECTURA' });
    expect(r.pasos[1].detalle).toContain('acción no clasificada: se trata como escritura');
    expect(r).toMatchObject({ estado: 'BLOCKED', atribucion: 'NO_APLICA', causas: ['POLITICA_SOLO_LECTURA'] });
  });
});

test.describe('P-15 — rutas indirectas: navegador y red @unit', () => {
  test('8. clics y cargas con Playwright directo sobre componentes de escritura: neutralizados y registrados', async ({ page, context }) => {
    await portal(context, page, true);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.locator('li[data-action="add"]').click();
    await page.locator('li[data-action="remove"]').click();
    await page.locator('#archivo').setInputFiles({ name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
    await page.getByRole('button', { name: 'Guardar', exact: true }).press('Enter');
    expect(await efectos(page)).toEqual([]);
    expect(await bloqueosDom(page)).toEqual(expect.arrayContaining(['click:Guardar', 'click:Siguiente', 'click:Adicionar', 'click:Eliminar', 'change:archivo', 'keydown:Guardar']));
    // Leer y teclear en el formulario de inicio sigue siendo posible (la precreación lo necesita).
    await page.locator('#linea').fill('Autos');
    expect(await page.locator('#linea').inputValue()).toBe('Autos');
    await page.getByRole('tab', { name: 'Seguimiento/Trazabilidad' }).click();
    expect(await page.getByRole('tab').getAttribute('aria-selected')).toBe('true');
  });

  test('8. red: CREATENEWCASE y ADDRELATIONWITHDATA se abortan; el resto pasa y solo se registra su nombre', async ({ page, context }) => {
    const { servidor, registro } = await portal(context, page, true);
    const post = (accion: string) => page.evaluate((a) => fetch('/Rest/Handlers/MultiAction', { method: 'POST', body: JSON.stringify([{ action: a, data: 'secreto' }]) })
      .then((r) => r.status).catch(() => 'BLOQUEADO'), accion);
    expect(await post('CREATENEWCASE')).toBe('BLOQUEADO');
    expect(await post('ADDRELATIONWITHDATA')).toBe('BLOQUEADO');
    expect(await post('SUBMITDATA')).toBe(200);
    expect(servidor.some((c) => /CREATENEWCASE|ADDRELATIONWITHDATA/.test(c))).toBe(false);
    expect(registro!.red).toEqual(['CREATENEWCASE', 'ADDRELATIONWITHDATA']);
    expect(registro!.observadas).toEqual(['SUBMITDATA']);
    expect(JSON.stringify(registro)).not.toContain('secreto');
  });

  test('9. control en modo normal: las mismas acciones SÍ se ejecutan (sin regresión de la escritura autorizada)', async ({ page, context }) => {
    await portal(context, page, false);
    const { capacidades } = crearCapacidadesUi(uiDe(page, false));
    await capacidades.pulsar(P([20], 'pulsar', { boton: 'Guardar' }), crearContexto(reg, ENV, 'u'));
    await page.locator('li[data-action="add"]').click();
    await page.locator('#archivo').setInputFiles({ name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
    expect(await efectos(page)).toEqual(['Guardar', 'add', 'archivo']);
    expect(await page.evaluate(() => fetch('/Rest/Handlers/MultiAction', { method: 'POST', body: '[{"action":"CREATENEWCASE"}]' }).then((r) => r.status))).toBe(200);
  });
});
