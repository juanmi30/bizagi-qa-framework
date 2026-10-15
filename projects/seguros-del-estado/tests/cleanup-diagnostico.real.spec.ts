import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro, estadoActor } from '../sde/datos';
import { crearContexto, sanitizar } from '../sde/ejecutor';
import { buscarCaso, crearCapacidadesUi, VIEWPORT_SDE, type UiEntorno } from '../sde/capacidades';
import { registroDe } from '../sde/soloLectura';
import { SdeObjects } from '../baseObjects/sde.objects';
import { HistorialCasos } from '../../../shared/utils/HistorialCasos';
import { esperarCarga } from '../sde/ui';

/**
 * DIAGNÓSTICO DE CLEANUP (P-17) — solo lectura: NO crea, NO abre, NO modifica ni cancela casos. Responde, por actor configurado, si el
 * Work Portal de SDE ofrece la cancelación administrativa que usa Colsubsidio: menú Admin → "Administración de procesos" →
 * "Casos" → diálogo con búsqueda e "invalidar". Solo navega por menús; el botón de invalidar se cuenta, nunca se pulsa (además
 * la guardia DOM lo neutraliza). Con SDE_DIAG_CLEANUP_CASO=<n> consulta además UN caso propio del histórico local (búsqueda
 * por número: no cambia el caso). Corre solo con SDE_DIAG_CLEANUP=1. Deja P17_ADMIN_<actor>.json en test-results.
 * La segunda prueba consulta con el buscador global (sin abrir) el estado actual de cada caso propio pendiente del histórico
 * local y deja P17_HISTORICO.json (número, filas y nombres de actividades; ningún dato del caso).
 */
test.use({ viewport: VIEWPORT_SDE, trace: 'off' }); // trace off: iniciar_sesion teclea la clave

const registro = cargarRegistro();

for (const actor of ['analista', 'intermediario']) {
  test(`P-17 [solo lectura]: "${actor}" y la administración de casos del Work Portal @diagnostico-cleanup`, async ({ page, browser }, testInfo) => {
    test.skip(process.env.SDE_DIAG_CLEANUP !== '1', 'Diagnóstico P-17: activar con SDE_DIAG_CLEANUP=1');
    const faltan = estadoActor(registro, actor, process.env).faltantes;
    test.skip(faltan.length > 0, `BLOCKED — credenciales de "${actor}": faltan ${faltan.join(', ')}`);
    testInfo.setTimeout(4 * 60_000);
    const ctx = crearContexto(registro, process.env, 'diagnostico-cleanup');
    const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined, soloLectura: true };
    await crearCapacidadesUi(ui).capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor }, ctx);
    await expect(page.locator(SdeObjects.bandeja).filter({ visible: true })).toHaveCount(1);

    const r = { actor, menuAdmin: false, entradasAdmin: [] as string[], administracionProcesos: false, categoriaCasos: false,
      dialogoCasos: false, busqueda: false, invalidar: 0, accionesRedAbortadas: [] as string[],
      casoConsultado: null as string | null, casoSeleccionable: 0, invalidarTrasBusqueda: 0, filasCaseAdmin: 0,
      botonesDialogo: [] as string[], mensajesDialogo: [] as string[], textoDialogo: '', filasCaseAdminPagina: 0, seleccionableEnPagina: 0, estructuraBusqueda: [] as string[] };
    const menu = page.locator(SdeObjects.menuAdmin).filter({ visible: true });
    r.menuAdmin = (await menu.count()) === 1;
    if (r.menuAdmin) {
      await menu.click();
      await esperarCarga(page);
      r.entradasAdmin = (await page.locator(`${SdeObjects.menuAdmin} ~ * li, ${SdeObjects.menuAdmin} li`).filter({ visible: true }).allInnerTexts())
        .map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40);
      const adminProcesos = page.getByText('Administración de procesos', { exact: false }).filter({ visible: true });
      r.administracionProcesos = (await adminProcesos.count()) > 0;
      if (r.administracionProcesos) {
        await adminProcesos.first().click();
        await esperarCarga(page);
        const casos = page.locator(SdeObjects.adminCategorias).getByText('Casos', { exact: true }).filter({ visible: true });
        r.categoriaCasos = (await casos.count()) > 0;
        if (r.categoriaCasos) {
          await casos.first().click();
          await esperarCarga(page);
          const dialogo = page.getByRole('dialog', { name: 'Casos', exact: true });
          r.dialogoCasos = await dialogo.isVisible().catch(() => false);
          r.busqueda = (await dialogo.locator(`${SdeObjects.adminCasoNumero}, ${SdeObjects.adminCasoBuscar}`).count()) === 2;
          r.invalidar = await dialogo.locator(SdeObjects.adminInvalidar).count();
          // Búsqueda (consulta, no cambia el caso) de UN caso PROPIO registrado: ¿aparece seleccionable y con "invalidar"?
          const numero = process.env.SDE_DIAG_CLEANUP_CASO?.trim();
          if (numero && r.busqueda) {
            const propios = await new HistorialCasos({ proyecto: 'seguros-del-estado', directorioBase: resolve(__dirname, '..', '..', '..') }).listar();
            expect(propios.some((c) => c.numeroCaso === numero), `el caso ${numero} no está en el histórico local: solo se consultan casos propios`).toBe(true);
            await dialogo.locator(SdeObjects.adminCasoNumero).fill(numero);
            // Espera determinista de la consulta; de su respuesta solo se guardan claves y tamaños, NUNCA valores.
            const respuesta = page.waitForResponse((x) => x.url().includes(SdeObjects.rutaBusquedaAdmin), { timeout: 30_000 });
            await dialogo.locator(SdeObjects.adminCasoBuscar).click();
            const cuerpo = await respuesta.then((x) => x.text()).catch((e: Error) => `SIN_RESPUESTA: ${e.message.split('\n')[0]}`);
            try {
              const j = JSON.parse(cuerpo) as Record<string, unknown>;
              r.estructuraBusqueda = Object.entries(j).map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.length}]` : typeof v === 'number' ? v : typeof v}`);
            } catch { r.estructuraBusqueda = [cuerpo.startsWith('SIN_RESPUESTA') ? cuerpo : `no-json(${cuerpo.length})`]; }
            await esperarCarga(page);
            r.casoConsultado = numero;
            r.casoSeleccionable = await dialogo.locator(`input[name="CaseAdmin"][data-subprocess="false"][value="${numero}"]`).count();
            r.invalidarTrasBusqueda = await dialogo.locator(SdeObjects.adminInvalidar).filter({ visible: true }).count();
            // Estructura observada (sin datos del caso): filas seleccionables y botones con su id/rótulo.
            r.filasCaseAdmin = await dialogo.locator('input[name="CaseAdmin"]').count();
            r.filasCaseAdminPagina = await page.locator('input[name="CaseAdmin"]').count();
            r.seleccionableEnPagina = await page.locator(`input[name="CaseAdmin"][value="${numero}"]`).count();
            r.botonesDialogo = (await dialogo.locator('button, input[type="button"]').evaluateAll((els) =>
              els.map((e) => `${e.id || '-'}:${((e as HTMLElement).innerText || (e as HTMLInputElement).value || '').trim()}`))).slice(0, 20);
            r.mensajesDialogo = (await dialogo.locator('.ui-bizagi-notifications-container, .empty, [class*="no-results" i], [class*="message" i]')
              .filter({ visible: true }).allInnerTexts()).map((t) => t.trim()).filter(Boolean).slice(0, 5);
            // Solo en test-results (no se versiona): texto visible del diálogo para interpretar una búsqueda vacía.
            r.textoDialogo = (await dialogo.innerText()).replace(/\s+/g, ' ').slice(0, 1500);
          }
        }
      }
    }
    r.accionesRedAbortadas = [...new Set(registroDe(page.context())?.red ?? [])];
    const dir = resolve(testInfo.outputDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `P17_ADMIN_${actor}.json`), JSON.stringify(r, null, 2));
    testInfo.annotations.push({ type: 'P-17', description: JSON.stringify(r) });
    // Diagnóstico, no aprobación: siempre pasa si pudo observar; la conclusión se lee del JSON.
    expect(registroDe(page.context())?.estado.proteccion).toBe('completa');
  });
}

test('P-17 [solo lectura]: estado actual de los casos propios pendientes del histórico (buscador, sin abrir) @diagnostico-cleanup', async ({ page, browser }, testInfo) => {
  test.skip(process.env.SDE_DIAG_CLEANUP !== '1', 'Diagnóstico P-17: activar con SDE_DIAG_CLEANUP=1');
  const faltan = estadoActor(registro, 'analista', process.env).faltantes;
  test.skip(faltan.length > 0, `BLOCKED — credenciales de "analista": faltan ${faltan.join(', ')}`);
  const pendientes = await new HistorialCasos({ proyecto: 'seguros-del-estado', directorioBase: resolve(__dirname, '..', '..', '..') }).listarPendientes();
  testInfo.setTimeout((3 + pendientes.length) * 60_000);
  const ctx = crearContexto(registro, process.env, 'diagnostico-cleanup');
  const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined, soloLectura: true };
  await crearCapacidadesUi(ui).capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' }, ctx);
  const proceso = ctx.resolver('${config:SDE_PROCESO_RADICACION}');
  const estado: Record<string, { filas: number; actividades: string[]; celdas: string } | { error: string }> = {};
  for (const c of pendientes) {
    estado[c.numeroCaso] = await buscarCaso(page, c.numeroCaso, proceso)
      // Celdas de la fila principal (proceso, fechas, «Fecha Solución caso»), sanitizadas: ¿el caso sigue abierto?
      .then(async (e) => ({ filas: e.filas.length, actividades: e.actividades,
        celdas: sanitizar((await e.fila.locator('td').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '), ctx.secretos) }))
      .catch((err: Error) => ({ error: err.message.split('\n')[0] }));
  }
  const dir = resolve(testInfo.outputDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'P17_HISTORICO.json'), JSON.stringify(estado, null, 2));
  expect(registroDe(page.context())?.estado.proteccion).toBe('completa');
});
