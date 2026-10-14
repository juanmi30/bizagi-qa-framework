import { test, expect, type Page } from '@playwright/test';
import { cargarRegistro, estadoActor } from '../sde/datos';
import { crearContexto } from '../sde/ejecutor';
import { crearCapacidadesUi, VIEWPORT_SDE, type UiEntorno } from '../sde/capacidades';
import { SdeObjects } from '../baseObjects/sde.objects';
import { esperarCarga, regexExacto } from '../sde/ui';

/**
 * COMPROBACIÓN DE HABILITACIÓN HU03 (ENV-03) — solo lectura, NO crea casos. Ejecutar cuando el administrador confirme el
 * cambio de permisos. FALLA mientras el intermediario no pueda iniciar el proceso y PASA cuando:
 *   1) el portal recibe "Gestión Solicitudes Centro Expedición" en Rest/Processes/All (respuesta 200 del propio portal), y
 *   2) el árbol de "Nuevo Caso" muestra la ruta de categorías configurada y el proceso.
 * Configuración esperada según el Plan Maestro (hoja "3. Configuración del Entorno"): rol "Radicador" vinculado a la propiedad
 * "Tipo de usuario" (Intermediario Principal / Colaborador) y la persona "PER - Intermediario" con su Clave Intermediario.
 */
test.use({ viewport: VIEWPORT_SDE, trace: 'off' }); // trace off: iniciar_sesion teclea la clave

const registro = cargarRegistro();

async function procesosQueRecibe(page: Page, proceso: string): Promise<{ respuestas200: number; listaProceso: boolean }> {
  const cuerpos: Promise<string>[] = [];
  const oir = (r: { url(): string; status(): number; text(): Promise<string> }) => {
    if (r.url().includes(SdeObjects.rutaProcesos) && r.status() === 200) cuerpos.push(r.text().catch(() => ''));
  };
  page.on('response', oir);
  await page.locator(SdeObjects.nuevoCaso).filter({ visible: true }).click();
  await page.locator(SdeObjects.todosLosProcesos).filter({ visible: true }).click().catch(() => undefined);
  await esperarCarga(page);
  page.off('response', oir);
  const textos = await Promise.all(cuerpos);
  return { respuestas200: textos.length, listaProceso: textos.some((t) => t.includes(proceso)) };
}

// analista es el CONTROL POSITIVO: demuestra que la comprobación sí puede pasar (CE_Analista tiene el proceso habilitado).
for (const actor of ['intermediario', 'intermediario_alerta', 'analista']) {
  test(`${actor === 'analista' ? 'CONTROL — ' : 'HU03 habilitada: '}"${actor}" puede iniciar el proceso de radicación @habilitacion`, async ({ page, browser }, testInfo) => {
    const faltan = estadoActor(registro, actor, process.env).faltantes;
    test.skip(faltan.length > 0, `BLOCKED — credenciales de "${actor}": faltan ${faltan.join(', ')}`);
    testInfo.setTimeout(4 * 60_000);
    const ctx = crearContexto(registro, process.env, 'habilitacion');
    const proceso = ctx.resolver('${config:SDE_PROCESO_RADICACION}');
    const ruta = ctx.resolver('${config:SDE_PROCESO_CATEGORIA}').split('>').map((x) => x.trim()).filter(Boolean);
    const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined, soloLectura: true };
    await crearCapacidadesUi(ui).capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor }, ctx);
    const r = await procesosQueRecibe(page, proceso);
    testInfo.annotations.push({ type: 'ENV-03', description: `${actor}: respuestas 200 de Rest/Processes/All=${r.respuestas200}; lista el proceso=${r.listaProceso}` });
    expect(r.listaProceso, `ENV-03 vigente: el portal no entrega "${proceso}" a "${actor}" (falta rol/autorización de inicio).`).toBe(true);
    // El árbol muestra la primera categoría de la ruta (sin crear caso: no se abre el formulario).
    const primera = page.locator(`${SdeObjects.arbolCategoria} > ${SdeObjects.arbolCategoriaTexto}`).filter({ hasText: regexExacto(ruta[0]) });
    await expect(primera.filter({ visible: true }), `categoría "${ruta[0]}" en "Nuevo Caso"`).toHaveCount(1);
  });
}
