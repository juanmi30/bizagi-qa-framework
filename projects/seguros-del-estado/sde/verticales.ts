import { test, expect } from '@playwright/test';
import { generarUnico } from '../../../shared/runner/scenarioLoader';
import { cargarRegistro } from './datos';
import { cargarEscenario, EscenarioError } from './escenario';
import { crearContexto, ejecutarEscenario, preflight } from './ejecutor';
import { crearCapacidadesUi, type UiEntorno } from './capacidades';
import { guardarReporte, registrarCasoCreado, resumenTexto } from './registro';
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
  if (r.estado === 'REAL_PASS') return { accion: 'pasar', mensaje: `${r.cp}: REAL_PASS — ${r.motivo}` };
  if (r.estado === 'BLOCKED') return { accion: 'omitir', mensaje: `${r.cp}: BLOCKED en ejecución (no es fallo del producto) — ${r.motivo}` };
  if (r.estado === 'REAL_PASS_PARCIAL') return { accion: 'fallar', mensaje: `${r.cp}: NO APROBADO (REAL_PASS_PARCIAL: ejecución real sin fallos, pero con pasos no verificados) — ${r.motivo}` };
  return { accion: 'fallar', mensaje: `${r.cp}: ${r.estado} — ${r.motivo}` };
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
      const bloqueos = preflight(s, registro, process.env);
      if (bloqueos.length) {
        // El ejecutor devuelve BLOCKED sin tocar la UI; el reporte deja constancia de QUÉ falta (nombres, no valores).
        const reporte = await ejecutarEscenario(s, { capacidades: {}, verificar: async () => ({ ok: false, detalle: '' }), evidencia: async () => undefined }, ctx);
        await testInfo.attach(`${s.id}-reporte.json`, { path: guardarReporte(reporte, o.prefijoReporte), contentType: 'application/json' });
        for (const b of bloqueos) testInfo.annotations.push({ type: 'BLOCKED', description: b });
        test.skip(true, `BLOCKED — ${bloqueos.length} prerrequisito(s) faltante(s): ${bloqueos.join(' ; ')}`);
      }

      testInfo.setTimeout(30 * 60_000);
      const ui: UiEntorno = {
        browser, paginaInicial: page, paginas: new Map(), contextos: [],
        registrarCaso: (numero, actor) => registrarCasoCreado({ cp: `${o.prefijoReporte}${s.id}`, numero, actor, unico, cleanup: s.cleanup.politica }),
      };
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
        testInfo.annotations.push({ type: 'resultado_funcional', description: reporte.estado });
        const pw = resultadoPlaywright(reporte);
        if (pw.accion === 'omitir') test.skip(true, pw.mensaje);
        expect(pw.accion, `${pw.mensaje}\n${resumenTexto(reporte)}`).toBe('pasar');
      } finally {
        for (const c of ui.contextos) await c.close().catch(() => undefined);
      }
    });
  }
}
