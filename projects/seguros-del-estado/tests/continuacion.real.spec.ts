import { test } from '@playwright/test';
import { resolve } from 'node:path';
import { cargarRegistro } from '../sde/datos';
import { cargarEscenario, DIR_ESCENARIOS, type EscenarioSde, type PasoSde } from '../sde/escenario';
import { crearContexto, ejecutarEscenario } from '../sde/ejecutor';
import { crearCapacidadesUi, VIEWPORT_SDE, type UiEntorno } from '../sde/capacidades';
import { guardarCaptura, guardarReporte } from '../sde/registro';
import { exclusividadEjecucionReal } from '../sde/verticales';
import { registrarFin, registrarInicio, registrarInterrupcion } from '../sde/ejecuciones';

/**
 * CONTINUACIÓN de un CP sobre un caso PROPIO ya creado por su vertical (2026-10-20): ejecuta los pasos oficiales del escenario
 * cuyo primer número de matriz está en [SDE_CONTINUAR_DESDE, SDE_CONTINUAR_HASTA], precedidos por la sesión del analista y la
 * apertura de «Estructurar información». NUNCA crea casos (registrarCaso falla). Los pop-ups siguen sujetos a la barrera UI-10
 * (SDE_AUTORIZO_CALIBRACION_POPUP=<caso> para formularios en_calibracion). Reporte CONTINUACION_<CP>_*.json: complementa el
 * reporte de la vertical; no lo sustituye en las métricas.
 * Uso: SDE_E2E=1 SDE_CONTINUAR_CP=HU06-CP04 SDE_CONTINUAR_CASO=703 SDE_CONTINUAR_DESDE=12 SDE_CONTINUAR_HASTA=22
 */
test.use({ viewport: VIEWPORT_SDE, trace: 'off' }); // trace off: iniciar_sesion teclea la clave
exclusividadEjecucionReal('continuación de un CP sobre un caso existente');

const ARCHIVOS: Record<string, string> = { 'HU06-CP01': '3-hu06-cp01.yaml', 'HU06-CP02': '4-hu06-cp02.yaml', 'HU06-CP03': '5-hu06-cp03.yaml', 'HU06-CP04': '6-hu06-cp04.yaml' };

test('continuación de un CP sobre un caso propio existente @continuacion', async ({ page, browser }, testInfo) => {
  const cp = process.env.SDE_CONTINUAR_CP ?? '';
  const caso = process.env.SDE_CONTINUAR_CASO ?? '';
  const desde = Number(process.env.SDE_CONTINUAR_DESDE);
  const hasta = Number(process.env.SDE_CONTINUAR_HASTA ?? 999);
  test.skip(process.env.SDE_E2E !== '1' || !ARCHIVOS[cp] || !/^\d+$/.test(caso) || !Number.isInteger(desde), 'SDE_E2E=1 SDE_CONTINUAR_CP SDE_CONTINUAR_CASO SDE_CONTINUAR_DESDE [SDE_CONTINUAR_HASTA]');
  testInfo.setTimeout(30 * 60_000);
  const registro = cargarRegistro();
  const oficial = cargarEscenario(resolve(DIR_ESCENARIOS, ARCHIVOS[cp]), registro);
  const P = (matriz: number[], hacer: string, extra: Record<string, unknown> = {}): PasoSde => ({ matriz, hacer, ...extra });
  const pasos = oficial.pasos.filter((p) => p.matriz[0] >= desde && p.matriz[0] <= hasta && p.hacer !== 'iniciar_sesion');
  const esc: EscenarioSde = { ...oficial, titulo: `CONTINUACIÓN sobre el caso ${caso}: ${oficial.titulo}`, actores: ['analista'], pasos: [
    P([desde], 'iniciar_sesion', { actor: 'analista' }),
    P([desde], 'abrir_caso', { actor: 'analista', actividad: 'Estructurar información', maximo_minutos: 2 }),
    ...pasos,
  ] };
  const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], soloLectura: false,
    registrarCaso: () => { throw new Error('La continuación NO crea casos.'); } };
  const { capacidades, verificar } = crearCapacidadesUi(ui);
  const ctx = crearContexto(registro, process.env, `cont-${caso}-P${desde}-${hasta}-${Date.now()}`); // único por corrida: no sobrescribe tramos anteriores
  ctx.numeroCaso = caso;
  // Registro de ejecución vinculado al caso: el soporte la incorpora a la ejecución base de ese caso (solo los pasos que ejecute).
  registrarInicio({ cp, unico: ctx.unico, corrida: process.env.BIZAGI_CORRIDA ?? null, continuacionDe: caso });
  let finalizada = false;
  try {
    const r = await ejecutarEscenario(esc, { capacidades, verificar, soloLectura: false,
      evidencia: async (n) => {
        const actual = ui.actual ? ui.paginas.get(ui.actual) : page;
        const f = await actual?.screenshot({ fullPage: true }).catch(() => null);
        if (!f) return undefined;
        await testInfo.attach(n, { body: f, contentType: 'image/png' });
        guardarCaptura(`CONTINUACION_${cp}`, ctx.unico, n, f); // sobrevive a corridas posteriores
        return n;
      },
    }, ctx);
    r.motivo = `CONTINUACIÓN (P${desde}–P${hasta}) sobre el caso existente ${caso}; complementa el reporte de la vertical: ${r.motivo}`;
    registrarFin({ reporte: r, rutaReporte: guardarReporte(r, 'CONTINUACION_') });
    finalizada = true;
    console.log(`CONT ${cp} caso=${caso} unico=${ctx.unico} estado=${r.estado}`);
    for (const p of r.pasos) console.log(`  #${p.indice} ${p.hacer} P${p.matriz.join(',')} [${p.estado}]${p.causa ? ` ${p.causa}` : ''} :: ${p.detalle.slice(0, 300)}`);
  } finally {
    if (!finalizada) registrarInterrupcion({ cp, unico: ctx.unico, numeroCaso: caso, motivo: 'excepción antes de guardar el reporte de la continuación' });
  }
});
