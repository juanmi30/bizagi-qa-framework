import { test } from '@playwright/test';
import { aplicarResultado } from '../../../sde/verticales';
import type { ReporteCp } from '../../../sde/modelo';

/**
 * FIXTURE (no es una prueba de la suite: la ejecuta resultados-pipeline.unit.spec.ts con su propia configuración).
 * Cada prueba lleva un reporte SINTÉTICO por el mismo camino que el runner real (aplicarResultado) para comprobar,
 * sobre el JUnit y el código de salida reales de Playwright, cómo se representa cada estado funcional.
 */
const base = (cp: string, estado: ReporteCp['estado'], extra: Partial<ReporteCp>): ReporteCp => ({
  cp, escenario: 'sintetico.yaml', inicio: '2026-01-01T00:00:00.000Z', fin: '2026-01-01T00:00:01.000Z', unico: 'sintetico',
  estado, motivo: `motivo sintético ${estado}`, numero_caso: null, actividades_observadas: [], pasos: [], matriz: [], bloqueos: [],
  cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'sintético' }, ...extra,
});

const CASOS: Record<string, ReporteCp> = {
  REAL_PASS: base('SIN-PASS', 'REAL_PASS', { numero_caso: '1', causas: [], atribucion: 'NO_APLICA' }),
  REAL_PASS_2: base('SIN-PASS-2', 'REAL_PASS', { numero_caso: '6', causas: [], atribucion: 'NO_APLICA' }),
  PARCIAL: base('SIN-PARCIAL', 'REAL_PASS_PARCIAL', { numero_caso: '2', causas: ['INTEGRACION_NO_VERIFICADA'], atribucion: 'NO_APLICA' }),
  BLOCKED_PREFLIGHT: base('SIN-BLOQ-PRE', 'BLOCKED', { bloqueos: ['CREDENCIALES actor "analista": faltan USUARIO_analista'], causas: ['CONFIGURACION'], atribucion: 'NO_APLICA' }),
  BLOCKED_EJECUCION: base('SIN-BLOQ-EJE', 'BLOCKED', { numero_caso: '3', causas: ['AMBIENTE'], atribucion: 'NO_APLICA' }),
  FAIL_AUTOMATIZACION: base('SIN-FAIL-AUT', 'FAIL', { numero_caso: '4', causas: ['AUTOMATIZACION'], atribucion: 'NO_ATRIBUIBLE_AL_PRODUCTO' }),
  FAIL_PRODUCTO: base('SIN-FAIL-PRO', 'FAIL', { numero_caso: '5', causas: ['PRODUCTO_POR_CONFIRMAR'], atribucion: 'PRODUCTO_POR_CONFIRMAR' }),
};

/** Sin SDE_SINTETICO_CASOS: un CP de cada representación. REAL_PASS_2 y AUXILIAR solo se usan cuando se piden. */
const POR_DEFECTO = ['REAL_PASS', 'PARCIAL', 'BLOCKED_PREFLIGHT', 'BLOCKED_EJECUCION', 'FAIL_AUTOMATIZACION', 'FAIL_PRODUCTO'];

for (const k of (process.env.SDE_SINTETICO_CASOS || POR_DEFECTO.join(',')).split(',')) {
  // AUXILIAR: prueba que NO es un CP (sin @e2e), para simular una corrida sin CP seleccionados.
  if (k === 'AUXILIAR') { test('AUXILIAR sin CP', () => {}); continue; }
  test(`${k} @sde @e2e`, async ({}, testInfo) => {
    aplicarResultado(CASOS[k], testInfo);
  });
}
