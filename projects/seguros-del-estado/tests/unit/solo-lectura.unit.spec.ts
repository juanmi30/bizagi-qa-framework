import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro } from '../../sde/datos';
import { CAPACIDADES, type EscenarioSde, type PasoSde } from '../../sde/escenario';
import { crearContexto, ejecutarEscenario, CAPACIDADES_DECLARATIVAS } from '../../sde/ejecutor';
import { crearCapacidadesUi, marcarFormularioInicio, type UiEntorno } from '../../sde/capacidades';
import { bloqueosDom, exigirSoloLectura, OPERACIONES, ProteccionNoInstaladaError, protegerSoloLectura, registroDe, SoloLecturaError, type RegistroSoloLectura } from '../../sde/soloLectura';

/**
 * P-15 corregido (auditoría de Work del PR #3, F1–F4). Dos modalidades: inspección de SOLO LECTURA (estricta) y ejecución
 * FUNCIONAL CONTROLADA (escribe lo que el escenario exige). Portal SINTÉTICO con autoguardado al estilo Bizagi: cada
 * cambio de un campo envía SUBMITDATA al endpoint de acciones. Lo que "llega al servidor" queda registrado. Sin QA.
 */

const reg = cargarRegistro();
const ENV = { BIZAGI_BASE_URL: 'https://sde.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c' };
const ORIGEN = 'https://sde.test/';

const CAMPO = (etq: string, control: string) =>
  `<div class="ui-bizagi-render"><span class="ui-bizagi-label"><label>${etq}</label></span><div class="ui-bizagi-render-control">${control}</div></div>`;
const EFECTO = (n: string) => `window.efectos.push('${n}')`;
// Autoguardado de Bizagi: un cambio en un campo se transmite como SUBMITDATA (también sin pulsar ningún botón).
const AUTOGUARDADO = `onchange="fetch('/Rest/Handlers/MultiAction', { method: 'POST', body: JSON.stringify([{ action: 'SUBMITDATA' }]) }).catch(() => window.efectos.push('submit-abortado'))"`;
const FORMULARIO = `
  ${CAMPO('Línea', `<input id="linea" ${AUTOGUARDADO}>`)}
  ${CAMPO('Ramo', `<select id="ramo" ${AUTOGUARDADO}><option></option><option>48 - AUTOMÓVILES LIVIANOS INDIVIDUAL</option></select>`)}
  ${CAMPO('Tipo de Radicación', '<input type="radio" id="ind" name="t"><label for="ind">Individual</label>')}
  <div class="bzg-form-grid"><div class="bz-rn-grid-header-title">Documentos Anexos</div>
    <table><thead><tr><th><label>Tipo Documental</label></th></tr></thead>
      <tbody class="ui-bizagi-grid-body"><tr data-bizagi-component="cells"><td>Solicitud</td></tr></tbody></table>
    <ul><li data-action="add" onclick="${EFECTO('add')}">Adicionar</li><li data-action="remove" onclick="${EFECTO('remove')}">Eliminar</li></ul></div>
  ${CAMPO('Soporte', `<input type="file" id="archivo" onchange="${EFECTO('archivo')}">`)}
  <ul role="tablist"><li role="tab" aria-selected="false" onclick="this.setAttribute('aria-selected','true')">Seguimiento/Trazabilidad</li></ul>
  <div class="ui-bizagi-button-container"><button onclick="${EFECTO('Guardar')}">Guardar</button>
    <button onclick="${EFECTO('Siguiente')}">Siguiente</button><button onclick="${EFECTO('Crear')}">Crear</button></div>`;
/** Formulario de una ACTIVIDAD de un caso existente (sin diálogo de inicio). */
const ACTIVIDAD = `<html><body><script>window.efectos = [];</script>${FORMULARIO}</body></html>`;
/** Formulario de INICIO (diálogo de Bizagi): el caso no existe hasta "Crear". */
const INICIO = `<html><body><script>window.efectos = [];</script><div class="ui-dialog ui-bizagi-start-form-dialog" role="dialog">${FORMULARIO}</div></body></html>`;

/** Portal sintético en un origen propio; registra las acciones que llegan "al servidor" de Bizagi. */
async function portal(context: BrowserContext, page: Page, opciones: { protegido: boolean; html?: string }) {
  const servidor: string[] = [];
  await context.route(`${ORIGEN}**`, (route) => {
    const cuerpo = route.request().postData();
    if (cuerpo) servidor.push(cuerpo);
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: opciones.html ?? ACTIVIDAD });
  });
  const registro: RegistroSoloLectura | null = opciones.protegido ? await protegerSoloLectura(context) : null;
  await page.goto(ORIGEN);
  return { servidor, registro };
}

const efectos = (page: Page) => page.evaluate(() => (window as unknown as { efectos: string[] }).efectos);
const uiDe = (page: Page, soloLectura: boolean): UiEntorno =>
  ({ browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined, soloLectura });
const P = (matriz: number[], hacer: string, extra: Record<string, unknown> = {}): PasoSde => ({ matriz, hacer, ...extra });
const post = (page: Page, cuerpo: string) => page.evaluate((c) => fetch('/Rest/Handlers/MultiAction', { method: 'POST', body: c })
  .then((r) => r.status).catch(() => 'BLOQUEADO'), cuerpo);

test.describe('P-15 — clasificación de las capacidades @unit', () => {
  test('toda capacidad está clasificada; lo no clasificado, la escritura y lo no determinado se deniegan en solo lectura', () => {
    expect([...Object.keys(CAPACIDADES), ...Object.keys(CAPACIDADES_DECLARATIVAS)].filter((c) => !OPERACIONES[c])).toEqual([]);
    expect(() => exigirSoloLectura('accion_nueva', {})).toThrow(/acción no clasificada: se trata como escritura/);
    for (const c of ['pulsar', 'adjuntar', 'adjuntar_en_grilla', 'tabla_abrir_fila', 'tabla_agregar', 'dialogo_confirmar', 'dialogo_cancelar', 'tabla_eliminar_fila', 'tabla_seleccionar_fila'])
      expect(() => exigirSoloLectura(c, { formularioInicio: true }), c).toThrow(SoloLecturaError);
    // F4: abrir una actividad tiene efecto no determinado → restringido en solo lectura.
    expect(() => exigirSoloLectura('abrir_caso', {})).toThrow(/efecto no determinado/);
    // F2: escribir en un formulario exige evidencia POSITIVA de precreación; la ausencia de número de caso no basta.
    expect(() => exigirSoloLectura('diligenciar', {})).toThrow(/sin evidencia positiva de estar en el formulario de inicio/);
    expect(() => exigirSoloLectura('diligenciar', { formularioInicio: false })).toThrow(SoloLecturaError);
    expect(() => exigirSoloLectura('diligenciar', { formularioInicio: true })).not.toThrow();
  });
});

test.describe('P-15 — F1: autoguardado y acciones de red desconocidas @unit', () => {
  test('solo lectura: fill y selectOption con autoguardado NO llegan al servicio (SUBMITDATA abortado)', async ({ page, context }) => {
    const { servidor, registro } = await portal(context, page, { protegido: true });
    await page.locator('#linea').fill('Autos');
    await page.locator('#linea').press('Tab'); // el autoguardado sale al abandonar el campo, como hace diligenciar
    await page.locator('#ramo').selectOption({ label: '48 - AUTOMÓVILES LIVIANOS INDIVIDUAL' });
    await expect.poll(() => efectos(page)).toEqual(['submit-abortado', 'submit-abortado']);
    expect(servidor.filter((c) => c.includes('SUBMITDATA'))).toEqual([]);
    expect(registro!.red).toEqual(['SUBMITDATA', 'SUBMITDATA']);
  });

  test('funcional controlada: las mismas operaciones SÍ llegan al servicio', async ({ page, context }) => {
    const { servidor } = await portal(context, page, { protegido: false });
    await page.locator('#linea').fill('Autos');
    await page.locator('#linea').press('Tab'); // el autoguardado sale al abandonar el campo, como hace diligenciar
    await page.locator('#ramo').selectOption({ label: '48 - AUTOMÓVILES LIVIANOS INDIVIDUAL' });
    await expect.poll(() => servidor.filter((c) => c.includes('SUBMITDATA')).length).toBe(2);
    expect(await efectos(page)).toEqual([]);
  });

  test('solo lectura: una acción desconocida (o sin nombre) se bloquea; registra solo el nombre, nunca los datos', async ({ page, context }) => {
    const { servidor, registro } = await portal(context, page, { protegido: true });
    expect(await post(page, JSON.stringify([{ action: 'ACCIONDESCONOCIDA', dato: 'secreto' }]))).toBe('BLOQUEADO');
    expect(await post(page, 'cuerpo=sin-accion')).toBe('BLOQUEADO');
    expect(servidor).toEqual([]);
    expect(registro!.red).toEqual(['ACCIONDESCONOCIDA', 'SIN_NOMBRE']);
    expect(JSON.stringify(registro)).not.toContain('secreto');
  });
});

test.describe('P-15 — F2: evidencia positiva del formulario de inicio @unit', () => {
  test('formulario EXISTENTE con numeroCaso null: diligenciar se rechaza y el autoguardado no sale (antes se permitía)', async ({ page, context }) => {
    const { servidor } = await portal(context, page, { protegido: true });
    const { capacidades } = crearCapacidadesUi(uiDe(page, true));
    const ctx = crearContexto(reg, ENV, 'u');
    expect(ctx.numeroCaso).toBeNull();
    await expect(capacidades.diligenciar(P([4], 'diligenciar', { campos: [{ campo: 'Línea', valor: 'Autos' }] }), ctx)).rejects.toThrow(/sin evidencia positiva/);
    await expect(marcarFormularioInicio(page, ctx)).rejects.toThrow(/No hay evidencia del formulario de inicio/);
    expect(await page.locator('#linea').inputValue()).toBe('');
    expect(servidor).toEqual([]);
  });

  test('precreación identificada positivamente: diligenciar permitido y su SUBMITDATA sale; "Crear" sigue bloqueado; al salir del diálogo, se vuelve a denegar', async ({ page, context }) => {
    const { servidor, registro } = await portal(context, page, { protegido: true, html: INICIO });
    const { capacidades } = crearCapacidadesUi(uiDe(page, true));
    const ctx = crearContexto(reg, ENV, 'u');
    await marcarFormularioInicio(page, ctx); // lo que hace nuevo_caso al confirmar el diálogo
    expect(ctx.formularioInicio).toBe(true);
    expect(registro!.estado.precreacion).not.toBeNull();
    await capacidades.diligenciar(P([4], 'diligenciar', { campos: [{ campo: 'Línea', valor: 'Autos' }] }), ctx);
    await expect.poll(() => servidor.filter((c) => c.includes('SUBMITDATA')).length).toBe(1);
    expect(await post(page, JSON.stringify([{ action: 'CREATENEWCASE' }]))).toBe('BLOQUEADO');
    expect(await post(page, JSON.stringify([{ action: 'ADDRELATIONWITHDATA' }]))).toBe('BLOQUEADO');
    expect(registro!.observadas).toEqual(['SUBMITDATA']);
    // El diálogo desaparece (otra pantalla): la evidencia caduca y la política vuelve a denegar.
    await page.evaluate(() => document.querySelector('.ui-bizagi-start-form-dialog')!.remove());
    await expect(capacidades.diligenciar(P([4], 'diligenciar', { campos: [{ campo: 'Línea', valor: 'X' }] }), ctx)).rejects.toThrow(/sin evidencia positiva/);
    expect(registro!.estado.precreacion).toBeNull();
  });
});

test.describe('P-15 — F4 y escritura: rechazos ANTES de ejecutar @unit', () => {
  test('abrir_caso: restringido en solo lectura; disponible en funcional controlada (la política no interviene)', async ({ page, context }) => {
    await portal(context, page, { protegido: true });
    const ctx = crearContexto(reg, ENV, 'u');
    ctx.numeroCaso = '999';
    await expect(crearCapacidadesUi(uiDe(page, true)).capacidades.abrir_caso(P([13], 'abrir_caso', { actor: 'analista', actividad: 'X', maximo_minutos: 0 }), ctx))
      .rejects.toThrow(SoloLecturaError);
    const funcional = await crearCapacidadesUi(uiDe(page, false)).capacidades.abrir_caso(P([13], 'abrir_caso', { actor: 'otro', actividad: 'X' }), ctx).catch((e) => e as Error);
    expect(funcional).not.toBeInstanceOf(SoloLecturaError);
    expect((funcional as Error).message).toContain('no tiene sesión'); // llegó a ejecutarse
  });

  test('Guardar, Crear, Siguiente, pop-up, agregar, eliminar y subir: rechazados antes del clic (nada se ejecuta)', async ({ page, context }) => {
    await portal(context, page, { protegido: true, html: INICIO });
    const { capacidades } = crearCapacidadesUi(uiDe(page, true));
    const ctx = crearContexto(reg, ENV, 'u');
    await marcarFormularioInicio(page, ctx); // ni siquiera en el formulario de inicio se escribe por estas vías
    for (const p of [P([20], 'pulsar', { boton: 'Guardar' }), P([8], 'pulsar', { boton: 'Crear', capturar_numero_caso: true }), P([20], 'pulsar', { boton: 'Siguiente' }),
      P([23], 'dialogo_confirmar', { espera: 'cierra' }), P([18], 'dialogo_cancelar'), P([22], 'tabla_agregar', { tabla: 'Documentos Anexos', formulario: 'x' }),
      P([26], 'tabla_eliminar_fila', { tabla: 'Documentos Anexos', fila: 1 }), P([9], 'adjuntar', { campo: 'Soporte', archivo: 'x.pdf' }),
      P([9], 'adjuntar_en_grilla', { grilla: 'Documentos Anexos', archivo: 'x.pdf' })]) {
      await expect(capacidades[p.hacer](p, ctx), `${p.hacer} ${p.boton ?? ''}`).rejects.toThrow(SoloLecturaError);
    }
    expect(await efectos(page)).toEqual([]);
    expect(ctx.numeroCaso).toBeNull();
  });

  test('verificaciones observacionales legítimas funcionan en solo lectura (etiquetas, ortografía, grilla, pestaña)', async ({ page, context }) => {
    await portal(context, page, { protegido: true });
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

  test('ejecutor: acción desconocida, pulsar y abrir_caso en solo lectura → BLOCKED por la política, sin invocarse ni atribuirse al producto', async () => {
    let invocadas = 0;
    const esc: EscenarioSde = { id: 'HU06-CP05', titulo: 't', etiquetas: [], actores: ['analista'], datasets: [], cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'r' }, archivo: 'sint',
      pasos: [P([2], 'iniciar_sesion', { actor: 'analista' }), P([7], 'accion_nueva')] };
    const correr = (pasos: PasoSde[]) => ejecutarEscenario({ ...esc, pasos }, {
      capacidades: { iniciar_sesion: async (_p, c) => { c.sesiones.add('analista'); }, accion_nueva: async () => { invocadas++; }, pulsar: async () => { invocadas++; }, abrir_caso: async () => { invocadas++; } },
      verificar: async () => ({ ok: true, detalle: '' }), evidencia: async () => undefined, soloLectura: true,
    }, crearContexto(reg, ENV, 'u'));
    for (const p of [P([7], 'accion_nueva'), P([8], 'pulsar', { boton: 'Guardar' }), P([8], 'abrir_caso', { actor: 'analista', actividad: 'X' })]) {
      const r = await correr([esc.pasos[0], p]);
      expect(r.pasos[1], p.hacer).toMatchObject({ estado: 'BLOCKED', causa: 'POLITICA_SOLO_LECTURA' });
      expect(r, p.hacer).toMatchObject({ estado: 'BLOCKED', atribucion: 'NO_APLICA', causas: ['POLITICA_SOLO_LECTURA'] });
    }
    expect(invocadas).toBe(0);
  });
});

test.describe('P-15 — rutas indirectas y control funcional @unit', () => {
  test('clics y cargas con Playwright directo sobre componentes de escritura: neutralizados y registrados sin valores', async ({ page, context }) => {
    await portal(context, page, { protegido: true });
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.locator('li[data-action="add"]').click();
    await page.locator('li[data-action="remove"]').click();
    await page.locator('#archivo').setInputFiles({ name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
    await page.getByRole('button', { name: 'Guardar', exact: true }).press('Enter');
    expect(await efectos(page)).toEqual([]);
    expect(await bloqueosDom(page)).toEqual(expect.arrayContaining(['click:Guardar', 'click:Siguiente', 'click:Adicionar', 'click:Eliminar', 'change:archivo', 'keydown:Guardar']));
  });

  test('ejecución funcional controlada: escribe lo que el escenario exige (botones, grilla, carga, autoguardado y creación)', async ({ page, context }) => {
    const { servidor } = await portal(context, page, { protegido: false });
    const { capacidades } = crearCapacidadesUi(uiDe(page, false));
    const ctx = crearContexto(reg, ENV, 'u');
    await capacidades.pulsar(P([20], 'pulsar', { boton: 'Guardar' }), ctx);
    await capacidades.diligenciar(P([4], 'diligenciar', { campos: [{ campo: 'Línea', valor: 'Autos' }] }), ctx);
    await page.locator('li[data-action="add"]').click();
    await page.locator('#archivo').setInputFiles({ name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
    expect(await efectos(page)).toEqual(['Guardar', 'add', 'archivo']);
    expect(await post(page, JSON.stringify([{ action: 'CREATENEWCASE' }]))).toBe(200);
    await expect.poll(() => servidor.some((c) => c.includes('SUBMITDATA'))).toBe(true);
  });
});

test.describe('P-15 — F3: la modalidad declarada coincide con la protección instalada @unit', () => {
  const DIR = resolve(__dirname, '..');
  const specs = readdirSync(DIR).filter((f) => f.endsWith('.real.spec.ts'));
  /** Bloques por prueba: [título, cuerpo]. */
  const bloques = (fuente: string) => fuente.split(/\n(?=\s*test\()/).slice(1).map((b) => [b.slice(0, b.indexOf('\n')), b] as const);
  const ESCRITURA = /'(pulsar|adjuntar|adjuntar_en_grilla|tabla_abrir_fila|tabla_agregar|dialogo_confirmar|dialogo_cancelar|tabla_eliminar_fila|tabla_seleccionar_fila|abrir_caso)'|\.abrir_caso\(|setInputFiles|accionGrilla\('(add|save|remove|edit)'\)/;

  test('toda prueba real que se declara de solo lectura activa la protección y no ejecuta escritura ni abre actividades', () => {
    const problemas: string[] = [];
    let declaradas = 0;
    for (const f of specs) {
      for (const [titulo, cuerpo] of bloques(readFileSync(resolve(DIR, f), 'utf8'))) {
        if (!/solo lectura/i.test(titulo)) continue;
        declaradas++;
        if (!/soloLectura: true|protegerSoloLectura\(/.test(cuerpo)) problemas.push(`${f}: "${titulo.trim().slice(0, 70)}" no activa soloLectura`);
        if (ESCRITURA.test(cuerpo)) problemas.push(`${f}: "${titulo.trim().slice(0, 70)}" ejecuta escritura o abre actividades`);
      }
    }
    expect(problemas).toEqual([]);
    expect(declaradas).toBeGreaterThanOrEqual(6); // ENV-03 ×2, BUG-02, BANDEJA, HISTÓRICO y candidatos
  });

  test('todo UiEntorno de una prueba real declara su modalidad (soloLectura explícito o "[funcional controlada" en el título)', () => {
    const sinDeclarar: string[] = [];
    for (const f of specs) {
      for (const [titulo, cuerpo] of bloques(readFileSync(resolve(DIR, f), 'utf8'))) {
        const literales = cuerpo.match(/: UiEntorno = \{[\s\S]*?\};/g) ?? [];
        for (const l of literales) if (!/soloLectura:/.test(l) && !/\[funcional controlada/.test(titulo)) sinDeclarar.push(`${f}: "${titulo.trim().slice(0, 70)}"`);
      }
    }
    expect(sinDeclarar).toEqual([]);
  });

  test('iniciar_sesion instala la protección efectiva (DOM + red) cuando el UI es de solo lectura', () => {
    const fuente = readFileSync(resolve(__dirname, '..', '..', 'sde', 'capacidades.ts'), 'utf8');
    expect(fuente).toMatch(/if \(ui\.soloLectura\) \{[\s\S]{0,300}const registro = await protegerSoloLectura\(page\.context\(\)\);/);
    expect(fuente).toContain('await marcarFormularioInicio(page, ctx); // evidencia POSITIVA de precreación');
  });
});

// ------------------------------------------------------------------------------------------------------------------------
// Auditoría final de Work sobre el PR #3. Las ediciones salen de Playwright DIRECTO (sin pasar por ninguna capacidad): la
// guardia de red debe decidir con la evidencia ACTUAL del formulario de inicio y con una instalación COMPLETA.
const submits = (servidor: string[]) => servidor.filter((c) => c.includes('SUBMITDATA')).length;
const FORM_ACTIVIDAD = FORMULARIO.replace(/id="(linea|ramo|archivo)"/g, 'id="$1-caso"');

test.describe('P-15 — hallazgo A: el permiso de precreación depende de la evidencia ACTUAL @unit', () => {
  test('A1. precreación válida con el diálogo presente: el autoguardado sale; Crear y alta de filas siguen bloqueados', async ({ page, context }) => {
    const { servidor } = await portal(context, page, { protegido: true, html: INICIO });
    await marcarFormularioInicio(page, crearContexto(reg, ENV, 'u'));
    await page.locator('#linea').fill('Autos');
    await page.locator('#linea').press('Tab');
    await expect.poll(() => submits(servidor)).toBe(1);
    expect(await post(page, JSON.stringify([{ action: 'CREATENEWCASE' }]))).toBe('BLOQUEADO');
    expect(await post(page, JSON.stringify([{ action: 'ADDRELATIONWITHDATA' }]))).toBe('BLOQUEADO');
  });

  test('A2. navegación a un caso existente y fill directo con autoguardado: SUBMITDATA NO llega (antes llegaba)', async ({ page, context }) => {
    const { servidor, registro } = await portal(context, page, { protegido: true, html: INICIO });
    await marcarFormularioInicio(page, crearContexto(reg, ENV, 'u'));
    await context.route(`${ORIGEN}caso/571`, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: ACTIVIDAD }));
    await page.goto(`${ORIGEN}caso/571`);
    await page.locator('#linea').fill('Autos');
    await page.locator('#linea').press('Tab');
    await expect.poll(() => efectos(page)).toEqual(['submit-abortado']);
    expect(submits(servidor)).toBe(0);
    expect(registro!.estado.precreacion).toBeNull();
  });

  test('A3. el diálogo desaparece SIN navegación y selectOption directo: SUBMITDATA bloqueado', async ({ page, context }) => {
    const { servidor, registro } = await portal(context, page, { protegido: true, html: INICIO });
    await marcarFormularioInicio(page, crearContexto(reg, ENV, 'u'));
    await page.evaluate((html) => { document.querySelector('.ui-bizagi-start-form-dialog')!.remove(); document.body.insertAdjacentHTML('beforeend', html); }, FORM_ACTIVIDAD);
    await page.locator('#ramo-caso').selectOption({ label: '48 - AUTOMÓVILES LIVIANOS INDIVIDUAL' });
    await expect.poll(() => efectos(page)).toEqual(['submit-abortado']);
    expect(submits(servidor)).toBe(0);
    expect(registro!.estado.precreacion).toBeNull();
  });

  test('A4. la SPA reemplaza el contenido (nuevo diálogo idéntico, sin recarga): el permiso anterior queda invalidado', async ({ page, context }) => {
    const { servidor } = await portal(context, page, { protegido: true, html: INICIO });
    await marcarFormularioInicio(page, crearContexto(reg, ENV, 'u'));
    await page.evaluate(() => { const d = document.querySelector('.ui-bizagi-start-form-dialog')!; d.outerHTML = d.outerHTML.replace(/ data-sde-precreacion="[^"]+"/, ''); });
    expect(await page.locator('.ui-bizagi-start-form-dialog').count()).toBe(1);
    await page.locator('#linea').fill('Autos');
    await page.locator('#linea').press('Tab');
    await expect.poll(() => efectos(page)).toEqual(['submit-abortado']);
    expect(submits(servidor)).toBe(0);
  });

  test('A5. sin evidencia (nunca identificado) o con el diálogo oculto: la escritura se rechaza en red y en capacidades', async ({ page, context }) => {
    const { servidor } = await portal(context, page, { protegido: true, html: INICIO });
    await page.locator('#linea').fill('Autos');
    await page.locator('#linea').press('Tab');
    await expect.poll(() => efectos(page)).toEqual(['submit-abortado']);
    const ctx = crearContexto(reg, ENV, 'u');
    await marcarFormularioInicio(page, ctx);
    await page.evaluate(() => { (document.querySelector('.ui-bizagi-start-form-dialog') as HTMLElement).style.display = 'none'; });
    await expect(crearCapacidadesUi(uiDe(page, true)).capacidades.diligenciar(P([4], 'diligenciar', { campos: [{ campo: 'Línea', valor: 'X' }] }), ctx)).rejects.toThrow(/sin evidencia positiva/);
    expect(ctx.formularioInicio).toBe(false);
    expect(submits(servidor)).toBe(0);
  });

  test('A6. salir y volver legítimamente: no se reutiliza el permiso anterior; solo una nueva identificación concede otro', async ({ page, context }) => {
    const { servidor, registro } = await portal(context, page, { protegido: true, html: INICIO });
    const ctx = crearContexto(reg, ENV, 'u');
    await marcarFormularioInicio(page, ctx);
    const anterior = registro!.estado.precreacion!.token;
    await page.evaluate(() => { const d = document.querySelector('.ui-bizagi-start-form-dialog')!; const html = d.outerHTML.replace(/ data-sde-precreacion="[^"]+"/, ''); d.remove(); document.body.insertAdjacentHTML('beforeend', html); });
    await page.locator('#linea').fill('Autos');
    await page.locator('#linea').press('Tab');
    await expect.poll(() => efectos(page)).toEqual(['submit-abortado']);
    expect(registro!.estado.precreacion).toBeNull();
    await marcarFormularioInicio(page, ctx); // nueva identificación positiva
    expect(registro!.estado.precreacion!.token).not.toBe(anterior);
    await page.locator('#linea').fill('Generales');
    await page.locator('#linea').press('Tab');
    await expect.poll(() => submits(servidor)).toBe(1);
  });
});

/** Contexto envoltorio que hace fallar "route" o "addInitScript" las veces indicadas (fallo transitorio o persistente). */
function contextoConFallos(real: BrowserContext, fallos: { route?: number; addInitScript?: number }): BrowserContext {
  return new Proxy(real, {
    get(objetivo, prop) {
      if ((prop === 'route' || prop === 'addInitScript') && (fallos[prop] ?? 0) > 0) {
        return async () => { fallos[prop]!--; throw new Error(`fallo inyectado en ${prop}`); };
      }
      const v = Reflect.get(objetivo, prop);
      return typeof v === 'function' ? v.bind(objetivo) : v;
    },
  }) as BrowserContext;
}

async function portalSinProteger(context: BrowserContext, page: Page, html = ACTIVIDAD) {
  const servidor: string[] = [];
  await context.route(`${ORIGEN}**`, (route) => {
    const cuerpo = route.request().postData();
    if (cuerpo) servidor.push(cuerpo);
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.goto(ORIGEN);
  return servidor;
}
const autoguardar = async (page: Page) => { await page.locator('#linea').fill('Autos'); await page.locator('#linea').press('Tab'); };

test.describe('P-15 — hallazgo B: instalación consistente de la protección @unit', () => {
  test('B1. instalación completa: estado "completa", un interceptor, guardia DOM activa y autoguardado bloqueado', async ({ page, context }) => {
    const servidor = await portalSinProteger(context, page);
    const registro = await protegerSoloLectura(context);
    expect(registro.estado.proteccion).toBe('completa');
    expect(registro.rutas).toBe(1);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    expect(await bloqueosDom(page)).toEqual(['click:Guardar']); // guardia DOM activa en la página ya cargada
    await autoguardar(page);
    await expect.poll(() => efectos(page)).toEqual(['submit-abortado']);
    expect(submits(servidor)).toBe(0);
  });

  test('B2 y B4. error durante la instalación: NO queda protegida; entre el fallo y el reintento nada sale y las capacidades se detienen', async ({ page, context }) => {
    const servidor = await portalSinProteger(context, page);
    const conFallos = contextoConFallos(context, { addInitScript: 1 });
    await expect(protegerSoloLectura(conFallos)).rejects.toBeInstanceOf(ProteccionNoInstaladaError);
    expect(registroDe(conFallos)!.estado.proteccion).toBe('fallida');
    // B4: el interceptor quedó instalado y falla cerrado mientras la protección no está completa.
    await autoguardar(page);
    await expect.poll(() => efectos(page)).toEqual(['submit-abortado']);
    expect(submits(servidor)).toBe(0);
    // Y ninguna capacidad corre sobre un contexto no protegido por completo.
    await expect(crearCapacidadesUi(uiDe(page, true)).capacidades.tabla_verificar(P([6], 'tabla_verificar', { tabla: 'Documentos Anexos' }), crearContexto(reg, ENV, 'u')))
      .rejects.toBeInstanceOf(ProteccionNoInstaladaError);
  });

  test('B3 y B5. reintento tras un fallo transitorio: queda completa sin duplicar el interceptor; repetir es idempotente', async ({ page, context }) => {
    await portalSinProteger(context, page);
    const conFallos = contextoConFallos(context, { addInitScript: 1 });
    await expect(protegerSoloLectura(conFallos)).rejects.toBeInstanceOf(ProteccionNoInstaladaError);
    const registro = await protegerSoloLectura(conFallos);
    expect(registro.estado.proteccion).toBe('completa');
    expect(registro.rutas).toBe(1);
    const [a, b] = await Promise.all([protegerSoloLectura(conFallos), protegerSoloLectura(conFallos)]);
    expect(a).toBe(registro);
    expect(b).toBe(registro);
    expect(registro.rutas).toBe(1);
    const real = await protegerSoloLectura(context);
    expect(await protegerSoloLectura(context)).toBe(real);
    expect(real.rutas).toBe(1);
  });

  test('B4 (variante). si falla el propio interceptor, la protección NO se da por instalada y el reintento lo registra una sola vez', async ({ page, context }) => {
    await portalSinProteger(context, page);
    const conFallos = contextoConFallos(context, { route: 1 });
    await expect(protegerSoloLectura(conFallos)).rejects.toThrow(/PROTECCIÓN SOLO LECTURA NO INSTALADA: fallo inyectado en route/);
    expect(registroDe(conFallos)!.estado.proteccion).toBe('fallida');
    expect(registroDe(conFallos)!.rutas).toBe(0);
    const registro = await protegerSoloLectura(conFallos);
    expect(registro).toMatchObject({ rutas: 1, estado: { proteccion: 'completa' } });
  });

  test('B6. fallo persistente: detención segura con causa explícita (AUTOMATIZACION), sin ningún PASS', async ({ page, context }) => {
    await portalSinProteger(context, page);
    const conFallos = contextoConFallos(context, { route: Infinity });
    let pulsaciones = 0;
    const esc: EscenarioSde = { id: 'HU06-CP05', titulo: 't', etiquetas: [], actores: ['analista'], datasets: [], cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'r' }, archivo: 'sint',
      pasos: [P([2], 'iniciar_sesion', { actor: 'analista' }), P([6], 'verificar', { verificar: [{ etiquetas: ['Línea'] }] }), P([7], 'pulsar', { boton: 'Guardar' })] };
    const r = await ejecutarEscenario(esc, {
      capacidades: {
        iniciar_sesion: async (_p, c) => { await protegerSoloLectura(conFallos); c.sesiones.add('analista'); },
        verificar: async () => ({}), pulsar: async () => { pulsaciones++; },
      },
      verificar: async () => ({ ok: true, detalle: '' }), evidencia: async () => undefined, soloLectura: true,
    }, crearContexto(reg, ENV, 'u'));
    expect(r.pasos[0]).toMatchObject({ estado: 'FAIL', causa: 'AUTOMATIZACION' });
    expect(r.pasos[0].detalle).toMatch(/^PROTECCIÓN SOLO LECTURA NO INSTALADA/);
    expect(r.pasos.slice(1).map((p) => p.estado)).toEqual(['NOT_RUN', 'NOT_RUN']);
    expect(r).toMatchObject({ estado: 'FAIL', atribucion: 'NO_ATRIBUIBLE_AL_PRODUCTO' });
    expect(r.pasos.some((p) => p.estado === 'PASS')).toBe(false);
    expect(pulsaciones).toBe(0);
    await expect(protegerSoloLectura(conFallos)).rejects.toBeInstanceOf(ProteccionNoInstaladaError);
  });
});
