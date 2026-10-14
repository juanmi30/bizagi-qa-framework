import { test, type Page, type Locator } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro } from '../sde/datos';
import { cargarEscenario, listarEscenarios, type EscenarioSde } from '../sde/escenario';
import { crearContexto, ejecutarEscenario } from '../sde/ejecutor';
import { crearCapacidadesUi, VIEWPORT_SDE, type UiEntorno } from '../sde/capacidades';
import { guardarReporte, DIR_SALIDA } from '../sde/registro';
import { SdeObjects } from '../baseObjects/sde.objects';
import { esperarCarga, inventarioCampos, normaliza, textosVisibles, unicoVisible } from '../sde/ui';
import { cargarPresentacion } from '../sde/presentacion';
import { aplicarReglasOrtograficas } from '../../../shared/utils/ValidacionesPresentacion';

/**
 * PRE-CREACIÓN EN SOLO LECTURA (calibración del formulario de inicio con el actor REAL de cada escenario).
 * Ejecuta los pasos de cada escenario HASTA ANTES de "Crear". Garantías: ui.soloLectura = true → la red aborta cualquier
 * CREATENEWCASE y "pulsar Crear" falla antes del clic. Los pasos que necesitan datos de QA ausentes quedan BLOCKED.
 * Reportes: PRECREACION_<CP>_*.json (NO cuentan como ejecución del CP). Corre con SDE_PRECREACION=<CP,CP,...|todos>.
 * Se detiene también ANTES de cualquier carga de archivo (adjuntar / adjuntar_en_grilla): un diagnóstico no sube documentos.
 * Además vuelca PRESENTACION_<CP>_*.json: inventario OBSERVADO del formulario (etiquetas en orden de lectura, grupo,
 * obligatoriedad con el campo vacío, solo lectura) y hallazgos ortográficos. Es una PROPUESTA para que QA apruebe orden y
 * obligatoriedad (expectativas pendientes de definición); no es una expectativa ni un resultado del CP.
 */
test.use({ viewport: VIEWPORT_SDE, trace: 'off' }); // trace off: iniciar_sesion teclea la clave

const registro = cargarRegistro();
const pedido = (process.env.SDE_PRECREACION ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const escenarios = listarEscenarios().map((r) => cargarEscenario(r, registro))
  .filter((e) => pedido.includes('todos') ? e.id.startsWith('HU03') : pedido.includes(e.id));

function hastaCrear(e: EscenarioSde): EscenarioSde {
  const i = e.pasos.findIndex((p) => (p.hacer === 'pulsar' && (p.capturar_numero_caso || p.boton === 'Crear')) || ['adjuntar', 'adjuntar_en_grilla'].includes(p.hacer));
  // Solo CFG-PROCESO en preflight: los datos de negocio se exigen por paso (si faltan, ese paso queda BLOCKED).
  return { ...e, datasets: ['CFG-PROCESO'], pasos: i >= 0 ? e.pasos.slice(0, i) : e.pasos };
}

async function etiquetasFormulario(page: Page): Promise<string[]> {
  const textos = await page.locator(`${SdeObjects.dialogoInicio} label`).filter({ visible: true }).allInnerTexts();
  return [...new Set(textos.map(normaliza).filter((t) => t && t.length < 120))];
}

test.describe('Pre-creación HU03 en solo lectura @precreacion', () => {
  test.skip(pedido.length === 0, 'SDE_PRECREACION=<HU03-CP02,...|todos> para correrlo.');
  for (const e of escenarios) {
    test(`pre-creación ${e.id} (sin Crear)`, async ({ page, browser }, testInfo) => {
      testInfo.setTimeout(10 * 60_000);
      const esc = hastaCrear(e);
      const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined, soloLectura: true };
      const { capacidades, verificar } = crearCapacidadesUi(ui);
      const ctx = crearContexto(registro, process.env, `pre-${Date.now()}`);
      try {
        const r = await ejecutarEscenario(esc, { capacidades, verificar, evidencia: async () => undefined }, ctx);
        r.motivo = `PRE-CREACIÓN en solo lectura (no es ejecución del CP; se detiene antes de "Crear"): ${r.motivo}`;
        guardarReporte(r, 'PRECREACION_');
        const etiquetas = await etiquetasFormulario(ui.actual ? ui.paginas.get(ui.actual)! : page).catch(() => []);
        console.log(`PRE ${e.id} actor=${esc.actores.join(',')} pasos=${esc.pasos.length}`);
        for (const p of r.pasos) console.log(`  #${p.indice} ${p.hacer} [${p.estado}] P${p.matriz.join(',')} :: ${p.detalle.slice(0, 260)}`);
        console.log(`  ETIQUETAS ${JSON.stringify(etiquetas)}`);
        const pg = ui.actual ? ui.paginas.get(ui.actual)! : page;
        const grillas = await pg.locator(`${SdeObjects.dialogoInicio} ${SdeObjects.grilla}`).filter({ visible: true }).locator(SdeObjects.grillaTitulo).allInnerTexts().catch(() => []);
        console.log(`  GRILLAS ${JSON.stringify(grillas.map(normaliza))}`);
        // Inventario observado (propuesta para QA): sin valores diligenciados, solo presentación.
        const dialogo = pg.locator(SdeObjects.dialogoInicio);
        const cat = cargarPresentacion();
        const textos = await textosVisibles(dialogo);
        const presentacion = {
          cp: e.id, actor: esc.actores.join(','), fecha: new Date().toISOString(),
          nota: 'Inventario OBSERVADO en QA (solo lectura, antes de Crear). Propuesta para aprobación de QA; no es una expectativa aprobada.',
          estado_formulario: `tras los pasos ${esc.pasos.filter((p) => r.pasos[esc.pasos.indexOf(p)]?.estado !== 'NOT_RUN').map((p) => p.matriz.join('+')).join(', ')}`,
          campos: await inventarioCampos(dialogo),
          hallazgos_ortograficos: aplicarReglasOrtograficas(textos, cat.reglas_ortograficas, cat.conocidos),
          textos_revisados: textos,
        };
        mkdirSync(DIR_SALIDA, { recursive: true });
        writeFileSync(resolve(DIR_SALIDA, `PRESENTACION_${e.id}_${Date.now()}.json`), JSON.stringify(presentacion, null, 2) + '\n', 'utf8');
        console.log(`  PRESENTACION ${JSON.stringify({ campos: presentacion.campos.map((c) => `${c.etiqueta}${c.obligatorio ? ' [oblig.]' : ''}${c.soloLectura ? ' [s/l]' : ''}`), hallazgos: presentacion.hallazgos_ortograficos })}`);
      } finally {
        for (const c of ui.contextos) await c.close().catch(() => undefined);
      }
    });
  }
});

/** Listas paramétricas reales por Línea (Ramo, Tipo de Solicitud) para el intermediario. Solo lectura, sin Crear. */
async function opciones(page: Page, campo: Locator): Promise<string[]> {
  const combo = await unicoVisible(campo.locator(SdeObjects.combo), 'combo');
  const lista = await combo.getAttribute('aria-controls');
  const ops = page.locator(SdeObjects.opcionesDe(lista ?? '')).filter({ visible: true });
  await combo.click();
  await ops.first().waitFor({ state: 'visible', timeout: 6_000 }).catch(() => undefined);
  const t = (await ops.allInnerTexts()).map(normaliza).filter((x) => x && !/^-+$/.test(x));
  // Cerrar sin Escape (Escape cierra TODO el formulario de inicio): clic en la barra de título del diálogo.
  await page.locator(`${SdeObjects.dialogoInicio} .ui-dialog-titlebar`).click({ position: { x: 5, y: 5 } });
  return t;
}

test('listas paramétricas del formulario de inicio para el intermediario (sin Crear) @precreacion', async ({ page, browser }) => {
  test.skip(process.env.SDE_PRECREACION_LISTAS !== '1', 'SDE_PRECREACION_LISTAS=1 para correrlo.');
  test.setTimeout(10 * 60_000);
  const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined, soloLectura: true };
  const { capacidades } = crearCapacidadesUi(ui);
  const ctx = crearContexto(registro, process.env, 'listas');
  await capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor: 'intermediario' }, ctx);
  await capacidades.nuevo_caso({ matriz: [3], hacer: 'nuevo_caso', proceso: '${config:SDE_PROCESO_RADICACION}', categoria: '${config:SDE_PROCESO_CATEGORIA}' }, ctx);
  const salida: Record<string, unknown> = { etiquetas_iniciales: await etiquetasFormulario(page) };
  const { campo } = await import('../sde/ui');
  const dialogo = page.locator(SdeObjects.dialogoInicio);
  salida.lineas = await opciones(page, await campo(dialogo, 'Línea'));
  for (const linea of salida.lineas as string[]) {
    await capacidades.diligenciar({ matriz: [4], hacer: 'diligenciar', campos: [{ campo: 'Línea', valor: linea, tipo: 'lista' }] }, ctx);
    await esperarCarga(page);
    const ramos = await opciones(page, await campo(dialogo, 'Ramo'));
    // En Cumplimiento "Tipo de Solicitud" aparece recién al elegir un Ramo: se elige el primero (selección reversible, sin Crear).
    if (ramos.length) await capacidades.diligenciar({ matriz: [4], hacer: 'diligenciar', campos: [{ campo: 'Ramo', valor: ramos[0], tipo: 'lista' }] }, ctx);
    const tipoSol = await campo(dialogo, 'Tipo de Solicitud', 8_000).catch(() => null);
    const tiposSolicitud = !tipoSol ? ['(no visible)'] : (await tipoSol.locator(SdeObjects.combo).count()) === 1 ? await opciones(page, tipoSol) : ['(asignado automáticamente / solo lectura)'];
    salida[`linea:${linea}`] = { ramos, ramo_elegido_para_inspeccion: ramos[0] ?? null, tipos_solicitud: tiposSolicitud };
  }
  mkdirSync(DIR_SALIDA, { recursive: true });
  writeFileSync(resolve(DIR_SALIDA, `precreacion-listas-${Date.now()}.json`), JSON.stringify(salida, null, 2) + '\n', 'utf8');
  console.log(`LISTAS ${JSON.stringify(salida)}`);
});
