import { test, expect, type TestInfo } from '@playwright/test';
import { resolve } from 'node:path';
import { generarUnico } from '../../../shared/runner/scenarioLoader';
import { adquirirBloqueo, BloqueoOcupadoError, type Bloqueo } from '../../../shared/utils/BloqueoArchivo';
import { HistorialCasos } from '../../../shared/utils/HistorialCasos';
import { cargarRegistro } from './datos';
import { cargarEscenario, EscenarioError } from './escenario';
import { crearContexto, ejecutarEscenario, preflight, reporteBloqueado } from './ejecutor';
import { crearCapacidadesUi, type UiEntorno } from './capacidades';
import { guardarReporte, registrarCasoCreado, resumenTexto, RUTA_BLOQUEO_EJECUCION_REAL } from './registro';
import type { ReporteCp } from './modelo';

/**
 * Registra UNA prueba Playwright por escenario declarativo (la usan tests/verticales.spec.ts y tests/variantes.real.spec.ts).
 * - Sin credenciales/datos → SKIPPED con anotación BLOCKED (nunca verde).
 * - Crea casos reales: sin reintentos (un reintento duplicaría casos); el archivo .spec fija workers/trace.
 * - `prefijoReporte` separa reportes que NO son evidencia del CP (variantes): las métricas solo leen "<CP>_*.json".
 */
/**
 * Representación en Playwright/JUnit del estado FUNCIONAL (no se contradicen):
 *  REAL_PASS → passed · REAL_PASS_PARCIAL → failed "NO APROBADO (parcial)" · BLOCKED en ejecución → skipped con la causa ·
 *  FAIL → failed. Un parcial NUNCA aparece como passed.
 */
export function resultadoPlaywright(r: ReporteCp): { accion: 'pasar' | 'fallar' | 'omitir'; mensaje: string } {
  const causas = r.causas?.length ? ` [causa: ${r.causas.join(', ')}]` : '';
  if (r.estado === 'REAL_PASS') return { accion: 'pasar', mensaje: `${r.cp}: REAL_PASS — ${r.motivo}` };
  if (r.estado === 'BLOCKED') {
    const momento = r.bloqueos.length ? 'antes de ejecutar' : 'en ejecución';
    return { accion: 'omitir', mensaje: `${r.cp}: BLOCKED ${momento} (no es fallo del producto)${causas} — ${r.motivo}` };
  }
  if (r.estado === 'REAL_PASS_PARCIAL') return { accion: 'fallar', mensaje: `${r.cp}: NO APROBADO (REAL_PASS_PARCIAL: ejecución real sin fallos, pero con pasos no verificados) — ${r.motivo}` };
  const atribucion = r.atribucion === 'NO_ATRIBUIBLE_AL_PRODUCTO' ? ' [NO atribuible al producto]' : r.atribucion === 'PRODUCTO_POR_CONFIRMAR' ? ' [posible defecto, por confirmar]' : '';
  return { accion: 'fallar', mensaje: `${r.cp}: ${r.estado}${atribucion}${causas} — ${r.motivo}` };
}

/**
 * Lleva el estado funcional del reporte a Playwright/JUnit con trazabilidad: anotaciones `resultado_funcional`,
 * `causa` y `atribucion` (JUnit las publica como propiedades del caso) y luego passed/failed/skipped según
 * resultadoPlaywright. Es el ÚNICO camino: preflight, concurrencia y ejecución terminan aquí.
 */
export function aplicarResultado(reporte: ReporteCp, testInfo: TestInfo): void {
  testInfo.annotations.push({ type: 'resultado_funcional', description: reporte.estado });
  for (const c of reporte.causas ?? []) testInfo.annotations.push({ type: 'causa', description: c });
  if (reporte.atribucion && reporte.atribucion !== 'NO_APLICA') testInfo.annotations.push({ type: 'atribucion', description: reporte.atribucion });
  for (const b of reporte.bloqueos) testInfo.annotations.push({ type: 'BLOCKED', description: b });
  const pw = resultadoPlaywright(reporte);
  if (pw.accion === 'omitir') test.skip(true, pw.mensaje);
  expect(pw.accion, `${pw.mensaje}\n${resumenTexto(reporte)}`).toBe('pasar');
}

/**
 * Para specs reales FUERA del runner que pueden crear casos (calibración, diagnósticos): toma el mismo bloqueo exclusivo
 * antes de cada prueba y lo libera al terminar (también si falla). Si otra ejecución real está en curso, la prueba se
 * omite con causa CONCURRENCIA (nunca corre en paralelo con otra).
 */
export function exclusividadEjecucionReal(descripcion: string): void {
  let bloqueo: Bloqueo | undefined;
  test.beforeEach(async () => {
    try {
      bloqueo = await adquirirBloqueo(RUTA_BLOQUEO_EJECUCION_REAL, {
        esperaMs: Number(process.env.SDE_ESPERA_EJECUCION_REAL_SEGUNDOS ?? 0) * 1000, caducidadMs: 6 * 60 * 60_000, descripcion,
      });
    } catch (e) {
      if (!(e instanceof BloqueoOcupadoError)) throw e;
      test.skip(true, `BLOCKED (causa: CONCURRENCIA) — otra ejecución real de SDE está en curso. ${e.message}`);
    }
  });
  test.afterEach(() => { bloqueo?.liberar(); bloqueo = undefined; });
}

/**
 * P-06 (aprobada por Juan Miguel el 2026-10-14): una vertical REAL (crea casos en QA) solo se ejecuta con SDE_E2E=1.
 * Sin la activación, el CP queda BLOCKED por CONFIGURACION antes de tocar QA: un filtro mal escrito ya no basta para
 * radicar un caso (incidente del caso 434). Devuelve el bloqueo (prefijo ENVIRONMENT) o nada si está activada.
 */
export function activacionE2e(env: Record<string, string | undefined>): string[] {
  return env.SDE_E2E?.trim() === '1' ? []
    : ['ENVIRONMENT: SDE_E2E=1 no definida — las verticales reales crean casos en QA y exigen activación explícita (P-06).'];
}

/**
 * P-17, contra la acumulación: mientras el cierre de casos SDE no esté validado, cada caso creado queda pendiente. Con
 * SDE_MAX_CASOS_PENDIENTES=<n> una vertical NO crea otro caso si ya hay n o más pendientes propios (BLOCKED por
 * CONFIGURACION antes de tocar QA). Sin la variable solo se informa: el umbral lo acuerda QA. Valor inválido → bloquea.
 */
export function limiteCasosPendientes(env: Record<string, string | undefined>, pendientes: number): string[] {
  const valor = env.SDE_MAX_CASOS_PENDIENTES?.trim();
  if (!valor) return [];
  const limite = Number(valor);
  if (!Number.isInteger(limite) || limite < 0) return [`ENVIRONMENT: SDE_MAX_CASOS_PENDIENTES="${valor}" no es un entero >= 0 (P-17).`];
  return pendientes >= limite
    ? [`ENVIRONMENT: hay ${pendientes} casos SDE propios pendientes de cierre y el límite es ${limite} (SDE_MAX_CASOS_PENDIENTES, P-17): no se crean más hasta el cleanup.`]
    : [];
}

export type AdmisionCreacion<T> =
  | { admitida: true; pendientes: number; resultado: T }
  | { admitida: false; pendientes: number | null; bloqueos: string[] };

/**
 * Cupo de creación ATÓMICO (corrección de Work, PR #4): el conteo de pendientes, el límite, la ejecución que crea el caso
 * y su registro ocurren DENTRO del mismo bloqueo de ejecución real (H6). Mientras una corrida admitida lo tiene, su cupo
 * está reservado: otra corrida solo cuenta después de que la primera liberó, y para entonces su caso ya está registrado
 * (`registrarCasoCreado` se espera dentro de la ejecución). La reserva ES el bloqueo: se libera en `finally` ante rechazo,
 * excepción o cancelación, así que no quedan reservas fantasma. Alcance: el del bloqueo (un mismo equipo y el mismo
 * histórico local); NO protege entre computadores distintos.
 */
export async function conCupoDeCreacion<T>(
  o: { env: Record<string, string | undefined>; adquirir: () => Promise<Bloqueo>; contarPendientes: () => Promise<number> },
  ejecutar: (pendientes: number) => Promise<T>,
): Promise<AdmisionCreacion<T>> {
  let bloqueo: Bloqueo;
  try {
    bloqueo = await o.adquirir();
  } catch (e) {
    if (!(e instanceof BloqueoOcupadoError)) throw e;
    return { admitida: false, pendientes: null, bloqueos: [`CONCURRENCIA: otra ejecución real de SDE está en curso — ${e.message} Ejecuta de a una (--workers=1) o define SDE_ESPERA_EJECUCION_REAL_SEGUNDOS.`] };
  }
  try {
    const pendientes = await o.contarPendientes();
    const exceso = limiteCasosPendientes(o.env, pendientes);
    if (exceso.length) return { admitida: false, pendientes, bloqueos: exceso };
    return { admitida: true, pendientes, resultado: await ejecutar(pendientes) };
  } finally {
    bloqueo.liberar();
  }
}

export interface OpcionesVerticales { titulo: string; etiquetas: string[]; prefijoReporte: string; prefijoMotivo: string }

export function registrarVerticales(rutas: string[], o: OpcionesVerticales = { titulo: '[SDE]', etiquetas: [], prefijoReporte: '', prefijoMotivo: '' }): void {
  const registro = cargarRegistro();
  for (const ruta of rutas) {
    let esc: ReturnType<typeof cargarEscenario> | undefined;
    let error = '';
    try { esc = cargarEscenario(ruta, registro); } catch (e) { error = e instanceof EscenarioError ? e.message : String(e); }
    const nombre = ruta.split(/[\\/]/).pop()!;

    if (!esc) {
      test(`${o.titulo} ${nombre} (inválido) @sde`, () => { throw new Error(error); });
      continue;
    }
    const s = esc;
    // @HU06-CP05: etiqueta ÚNICA por CP (las etiquetas cortas como @cp01 se repiten entre HU06 y HU03).
    const tags = ['@sde', '@e2e', '@' + s.id, ...o.etiquetas, ...s.etiquetas.map((t) => '@' + t)].join(' ');

    test(`${o.titulo} ${s.id} — ${s.titulo} ${tags}`, async ({ page, browser }, testInfo) => {
      const unico = generarUnico();
      const ctx = crearContexto(registro, process.env, unico);
      const bloqueados = async (bloqueos: string[]) => {
        // BLOCKED sin tocar la UI; el reporte deja constancia de QUÉ falta (nombres, no valores) y de la causa.
        const reporte = reporteBloqueado(s, ctx, bloqueos);
        await testInfo.attach(`${s.id}-reporte.json`, { path: guardarReporte(reporte, o.prefijoReporte), contentType: 'application/json' });
        aplicarResultado(reporte, testInfo);
      };
      const faltantes = [...activacionE2e(process.env), ...preflight(s, registro, process.env)];
      if (faltantes.length) return bloqueados(faltantes);

      // H6: una sola ejecución real de SDE a la vez (casos reales, histórico y reportes compartidos), aunque se pase
      // --workers>1 o se abran dos terminales. Por defecto no espera: el CP queda BLOCKED por CONCURRENCIA.
      if (testInfo.config.workers > 1) {
        testInfo.annotations.push({ type: 'ADVERTENCIA', description: `Se pidieron ${testInfo.config.workers} workers: las ejecuciones reales de SDE se serializan con un bloqueo; usa --workers=1.` });
      }
      testInfo.setTimeout(30 * 60_000);
      const ui: UiEntorno = {
        browser, paginaInicial: page, paginas: new Map(), contextos: [],
        registrarCaso: (numero, actor) => registrarCasoCreado({ cp: `${o.prefijoReporte}${s.id}`, numero, actor, unico, cleanup: s.cleanup.politica }),
      };
      // P-17 / D-44: conteo y límite DENTRO del bloqueo H6, que se mantiene hasta registrar el caso (cupo atómico).
      const admision = await conCupoDeCreacion({
        env: process.env,
        adquirir: () => adquirirBloqueo(RUTA_BLOQUEO_EJECUCION_REAL, {
          esperaMs: Number(process.env.SDE_ESPERA_EJECUCION_REAL_SEGUNDOS ?? 0) * 1000,
          caducidadMs: 6 * 60 * 60_000, descripcion: `${o.prefijoReporte}${s.id}`,
        }),
        contarPendientes: async () => (await new HistorialCasos({ proyecto: 'seguros-del-estado', directorioBase: resolve(__dirname, '..', '..', '..') }).listarPendientes()).length,
      }, async (pendientes) => {
        testInfo.annotations.push({ type: 'P-17', description: `Casos SDE propios pendientes de cierre antes de esta corrida: ${pendientes}` });
        await ejecutarVertical();
      });
      if (!admision.admitida) {
        if (admision.pendientes != null) testInfo.annotations.push({ type: 'P-17', description: `Casos SDE propios pendientes de cierre: ${admision.pendientes}` });
        return bloqueados(admision.bloqueos);
      }

      async function ejecutarVertical(): Promise<void> {
        const { capacidades, verificar } = crearCapacidadesUi(ui);
        try {
          const reporte = await ejecutarEscenario(s, {
            capacidades, verificar,
            evidencia: async (nombreEv) => {
              const p = ui.actual ? ui.paginas.get(ui.actual) : page;
              const foto = await p?.screenshot({ fullPage: true }).catch(() => null);
              if (foto) await testInfo.attach(nombreEv, { body: foto, contentType: 'image/png' });
              return foto ? nombreEv : undefined;
            },
          }, ctx);
          if (o.prefijoMotivo) reporte.motivo = `${o.prefijoMotivo}${reporte.motivo}`;
          const ruta = guardarReporte(reporte, o.prefijoReporte);
          await testInfo.attach(`${s.id}-reporte.json`, { path: ruta, contentType: 'application/json' });
          testInfo.annotations.push({ type: reporte.estado, description: reporte.motivo });
          if (reporte.numero_caso) testInfo.annotations.push({ type: 'caso', description: reporte.numero_caso });
          console.log(resumenTexto(reporte));
          aplicarResultado(reporte, testInfo);
        } finally {
          for (const c of ui.contextos) await c.close().catch(() => undefined);
        }
      }
    });
  }
}
