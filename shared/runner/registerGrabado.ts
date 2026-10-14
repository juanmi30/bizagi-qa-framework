import { test, expect, Page, TestInfo } from '@playwright/test';
import { BpmEngine } from './BpmEngine';
import { verificarHazard } from './hazards';
import { capturarEvidencia } from './evidence';
import { fuentePermitida, escenarioPermitido } from './filters';
import type { Hazard } from './scenarioLoader';

/**
 * "Molde" para un escenario GRABADO adoptado. El grabado trae solo los PASOS
 * (sin login ni credenciales): registerGrabado hace el login del núcleo, corre
 * los pasos, adjunta evidencia y valida los mismos hazards que las plantillas.
 * Así TODOS los escenarios (plantilla o grabado) validan igual.
 */
export interface GrabadoMeta {
  escenario: string;            // nombre legible (aparece en el reporte)
  usuario: string;              // usuario LÓGICO del .env (nunca una credencial)
  etiquetas?: string[];         // -> tags @regresion, @smoke...
  hazards?: Hazard[];           // verificaciones finales (mismas del motor)
  archivo?: string;             // nombre de archivo (para el filtro --escenario)
}

export function registerGrabado(
  meta: GrabadoMeta,
  pasos: (ctx: { page: Page; engine: BpmEngine; testInfo: TestInfo }) => Promise<void>,
): void {
  if (!fuentePermitida('grabados')) return;              // --fuente plantillas
  if (!escenarioPermitido([meta.archivo, meta.escenario])) return; // --escenario

  const tags = ['@escenario', '@grabado', ...(meta.etiquetas ?? []).map((e) => '@' + String(e).replace(/\s+/g, '-'))].join(' ');
  const titulo = `[grabado] ${meta.escenario}  ${tags}`;

  test(titulo, async ({ page }, testInfo) => {
    const base = process.env.BIZAGI_BASE_URL;
    const urlReal = !!base && /^https?:\/\//i.test(base) && !/[<>]/.test(base);
    const engine = new BpmEngine(page, { iframe: process.env.BIZAGI_FORM_IFRAME || undefined });

    // Modo esqueleto (sin Bizagi real): valida que el grabado está bien armado.
    if (!urlReal) {
      testInfo.annotations.push({
        type: 'esqueleto',
        description: 'Sin BIZAGI_BASE_URL real: se valida el armado del grabado, sin ejecutarlo.',
      });
      expect(meta.escenario, 'El grabado tiene nombre de escenario').toBeTruthy();
      return;
    }

    await engine.iniciarSesion(meta.usuario); // login del núcleo (sin credenciales en el archivo)
    await pasos({ page, engine, testInfo });
    await capturarEvidencia(page, testInfo, `grabado_${meta.escenario}`);

    for (const h of meta.hazards ?? []) {
      const r = await verificarHazard(page, engine, h);
      await capturarEvidencia(page, testInfo, `hazard_${r.descripcion}`);
      expect(r.ok, r.descripcion + (r.detalle ? ` (${r.detalle})` : '')).toBe(true);
    }
  });
}
