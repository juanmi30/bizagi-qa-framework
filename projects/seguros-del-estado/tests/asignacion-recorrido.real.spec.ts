import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro } from '../sde/datos';
import { crearContexto } from '../sde/ejecutor';
import {
  asegurarAsignacionActividad, crearCapacidadesUi, evaluarRecorrido, leerRecorridoGrafico, VIEWPORT_SDE, type RecorridoEsperado, type UiEntorno,
} from '../sde/capacidades';
import { HistorialCasos } from '../../../shared/utils/HistorialCasos';
import { DIR_SALIDA } from '../sde/registro';

/**
 * Calibración y diagnóstico de las confirmaciones de QA del 2026-10-19 (Daniel), sobre casos PROPIOS ya existentes:
 * - Recorrido gráfico: la «Consulta Gráfica» (botón «Ruta») es evidencia válida de la ruta por la compuerta. SDE_RECORRIDO_CASOS=<n>:<masivo|individual>,...
 * - Asignación: Bizagi asigna «Estructurar información» por carga; QA autoriza reasignarla al analista de pruebas. SDE_ASIGNAR_CASO=<n>.
 * Solo casos del histórico local (propios). No crean casos.
 */
test.use({ viewport: VIEWPORT_SDE, trace: 'off' }); // trace off: iniciar_sesion teclea la clave

const registro = cargarRegistro();
const RAIZ = resolve(__dirname, '..', '..', '..');
/** Expectativas respaldadas por el diseño (HU06 V1.1 y matriz): Masivo pasa por «Estructurar información» (tarea AI worker); Individual no. */
const PRESETS: Record<string, RecorridoEsperado> = {
  masivo: { recorrido: ['Estructurar información'], recorrido_tipo: ['aiworkertask'] },
  individual: { no_recorrido: ['Estructurar información'], no_recorrido_tipo: ['aiworkertask'] },
};
const propios = async () => new Set((await new HistorialCasos({ proyecto: 'seguros-del-estado', directorioBase: RAIZ }).listar()).map((c) => c.numeroCaso));

test('recorrido gráfico de casos propios [solo lectura] @recorrido-grafico', async ({ page, browser }) => {
  const pedidos = (process.env.SDE_RECORRIDO_CASOS ?? '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.split(':'));
  test.skip(pedidos.length === 0, 'SDE_RECORRIDO_CASOS=<n>:<masivo|individual>,...');
  test.setTimeout((2 + 2 * pedidos.length) * 60_000);
  const mios = await propios();
  const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined, soloLectura: true };
  await crearCapacidadesUi(ui).capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' }, crearContexto(registro, process.env, 'recorrido'));
  const salida: Record<string, unknown> = {};
  for (const [n, tipo] of pedidos) {
    expect(mios.has(n), `el caso ${n} no es propio (no está en el histórico local)`).toBe(true);
    expect(PRESETS[tipo], `tipo de ruta desconocido: ${tipo}`).toBeTruthy();
    const caso = await leerRecorridoGrafico(page, n, process.env.SDE_PROCESO_RADICACION);
    await page.screenshot({ path: test.info().outputPath(`recorrido-${n}.png`), fullPage: true });
    // Solo nombres y tipos de nodos del modelo, y si fueron recorridos (sin datos del caso ni del creador).
    salida[n] = { tipo, evaluacion: evaluarRecorrido(caso, PRESETS[tipo]), nodos_recorridos: caso.nodos.filter((x) => x.recorrido) };
  }
  mkdirSync(DIR_SALIDA, { recursive: true });
  writeFileSync(resolve(DIR_SALIDA, `RECORRIDO_GRAFICO_${Date.now()}.json`), JSON.stringify(salida, null, 2) + '\n');
  console.log(`RECORRIDO ${JSON.stringify(salida)}`);
});

test('asignación de Estructurar información en un caso propio [funcional controlada: Admin → Reasignar solo si es de otro usuario] @asignacion', async ({ page, browser }) => {
  const n = process.env.SDE_ASIGNAR_CASO?.trim();
  test.skip(!n, 'SDE_ASIGNAR_CASO=<número de un caso PROPIO en Estructurar información>');
  test.setTimeout(10 * 60_000);
  expect((await propios()).has(n!), `el caso ${n} no es propio (no está en el histórico local)`).toBe(true);
  const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined, soloLectura: false };
  const { capacidades } = crearCapacidadesUi(ui);
  const ctx = crearContexto(registro, process.env, 'asignacion');
  await capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' }, ctx);
  // Escrituras que el portal envía durante la asignación (método, ruta y estado; sin cuerpos): prueban que se envió la reasignación.
  const escrituras: string[] = [];
  page.on('response', (x) => { if (x.request().method() !== 'GET') escrituras.push(`${x.request().method()} ${new URL(x.url()).pathname} ${x.status()}`); });
  // SDE_ASIGNAR_CALIBRAR=1: recorre el mecanismo de reasignación hacia el MISMO usuario de pruebas (sin efecto funcional).
  const r = await asegurarAsignacionActividad(page, n!, 'Estructurar información', process.env.USUARIO_analista ?? '', { calibrarMecanismo: process.env.SDE_ASIGNAR_CALIBRAR === '1' });
  ctx.numeroCaso = n!;
  const abierto = await capacidades.abrir_caso({ matriz: [10], hacer: 'abrir_caso', actor: 'analista', actividad: 'Estructurar información', maximo_minutos: 3 }, ctx);
  await page.screenshot({ path: test.info().outputPath(`asignacion-${n}.png`), fullPage: true });
  console.log(`ASIGNACION ${JSON.stringify({ caso: n, reasignada: r.reasignada, detalle: r.detalle, apertura: (abierto as { detalle: string }).detalle, escrituras: [...new Set(escrituras)] })}`);
});
