import { test, expect } from '@playwright/test';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadScenario, ScenarioError, generarUnico, aplicarUnico } from './scenarioLoader';
import type { Scenario } from './scenarioLoader';
import { BpmEngine } from './BpmEngine';
import { verificarHazard, verificarEntrada } from './hazards';
import { capturarEvidencia } from './evidence';
import { fuentePermitida, escenarioPermitido } from './filters';

/**
 * Descubre los escenarios .yaml del proyecto activo (carpeta scenarios/) y crea
 * UNA prueba de Playwright por cada uno. Las "etiquetas" del YAML se vuelven tags
 * (@plantilla, @regresion...) para poder filtrar con --grep.
 * Los archivos que empiezan con "_" se ignoran (son plantillas de ejemplo).
 */
export function registerScenarios(): void {
  const proyecto = process.env.PROJECT;
  if (!proyecto) return;
  if (!fuentePermitida('plantillas')) return; // --fuente grabados
  const dir = resolve(process.cwd(), 'projects', proyecto, 'scenarios');
  if (!existsSync(dir)) return;
  const archivos = readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f) && !f.startsWith('_'));
  for (const archivo of archivos) registrarUno(resolve(dir, archivo));
}

function registrarUno(ruta: string): void {
  const nombreArchivo = ruta.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, '') ?? ruta;

  let sc: Scenario | null = null;
  let errorCarga = '';
  try {
    sc = loadScenario(ruta);
  } catch (e) {
    errorCarga = e instanceof ScenarioError ? e.message : String(e);
  }

  // Plantilla mal formada -> una prueba que falla mostrando el error en espanol.
  if (!sc) {
    if (!escenarioPermitido([nombreArchivo])) return;
    test(`[plantilla] ${ruta}  @plantilla`, async () => {
      throw new Error(errorCarga);
    });
    return;
  }

  const s = sc;
  if (!escenarioPermitido([nombreArchivo, s.escenario, s.proceso])) return; // --escenario
  const tags = ['@escenario', '@plantilla', ...s.etiquetas.map((e) => '@' + String(e).replace(/\s+/g, '-'))].join(' ');
  const titulo = `[plantilla] ${s.proceso} — ${s.escenario}  ${tags}`;

  test(titulo, async ({ page }, testInfo) => {
    // ${unico}: token de la corrida (fecha-hora) para identificar los casos y no chocar
    // entre corridas. Se sustituye en TODO el escenario (lo que se teclea Y los hazards).
    const unico = generarUnico();
    const sc = aplicarUnico(s, unico);
    testInfo.annotations.push({ type: 'unico', description: unico });

    // Extensión G: el tope de tiempo del test se ajusta al escenario, porque una integración
    // declarada puede esperar minutos (el default de Playwright, 60 s, lo mataría antes).
    const minIntegracionEnv = Number(process.env.ESPERA_INTEGRACION_MINUTOS);
    const minIntegracion = Number.isFinite(minIntegracionEnv) && minIntegracionEnv > 0 ? minIntegracionEnv : 5;
    const msIntegraciones = sc.pasos.reduce(
      (acc, p) => acc + (p.esperar_integracion ? (p.esperar_integracion.maximo_minutos ?? minIntegracion) * 60_000 : 0),
      0,
    );
    testInfo.setTimeout(60_000 + sc.pasos.length * 60_000 + msIntegraciones);

    const base = process.env.BIZAGI_BASE_URL;
    // Una URL "real" empieza por http(s) y no es un marcador de posición (<...>).
    const urlReal = !!base && /^https?:\/\//i.test(base) && !/[<>]/.test(base);

    // Modo esqueleto: sin URL real de Bizagi (ej. demo), validamos que la plantilla
    // es correcta y que el motor la arma, sin ejecutar contra un servidor real.
    if (!urlReal) {
      testInfo.annotations.push({
        type: 'esqueleto',
        description: 'Sin BIZAGI_BASE_URL: se valida la plantilla y el armado, sin ejecutar contra Bizagi.',
      });
      expect(sc.pasos.length, 'La plantilla debe tener al menos un paso').toBeGreaterThan(0);
      expect(sc.hazards.length, 'La plantilla debe tener al menos un hazard').toBeGreaterThan(0);
      return;
    }

    const engine = new BpmEngine(page, { iframe: process.env.BIZAGI_FORM_IFRAME || undefined });
    await engine.iniciar(sc);

    for (let i = 0; i < sc.pasos.length; i++) {
      const paso = sc.pasos[i];
      await engine.entrarAPaso(paso);
      for (const r of await verificarEntrada(engine, paso.verificar_al_entrar ?? [])) {
        expect(r.ok, r.descripcion + (r.detalle ? ` (${r.detalle})` : '')).toBe(true);
      }
      if (paso.personalizado) await engine.ejecutarPersonalizado(paso.personalizado);
      else await engine.diligenciar(paso);
      await engine.avanzar(paso, sc.pasos[i + 1]?.actividad);
      await capturarEvidencia(page, testInfo, `${sc.proceso}_${paso.actividad}_paso${i + 1}`);
    }

    for (const h of sc.hazards) {
      const r = await verificarHazard(page, engine, h);
      await capturarEvidencia(page, testInfo, `hazard_${r.descripcion}`);
      expect(r.ok, r.descripcion + (r.detalle ? ` (${r.detalle})` : '')).toBe(true);
    }
  });
}
