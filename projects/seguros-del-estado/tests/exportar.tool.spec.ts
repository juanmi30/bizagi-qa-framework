import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro } from '../sde/datos';
import { crearContexto } from '../sde/ejecutor';
import { generarExport } from '../sde/exportar';

/**
 * HERRAMIENTA (no es una prueba funcional): genera el paquete sanitizado para compartir.
 *   $env:SDE_EXPORTAR="1"; npm test -- seguros-del-estado exportar.tool --workers=1
 * Salida local: test-results/seguros-del-estado/export/sde-export-<fecha>.zip (+ MANIFIESTO-EXPORT.md dentro).
 * Si el escaneo encuentra un secreto, NO se genera el zip y la herramienta falla indicando archivo y línea (sin el valor).
 */
const RAIZ = resolve(__dirname, '..', '..', '..');

test('exportación sanitizada @exportar', async ({}, testInfo) => {
  test.skip(process.env.SDE_EXPORTAR !== '1', 'Herramienta: SDE_EXPORTAR=1 para generar el paquete.');
  testInfo.setTimeout(5 * 60_000);
  const secretos = crearContexto(cargarRegistro(), process.env, 'export').secretos;
  const r = generarExport(RAIZ, secretos);
  console.log(r.manifiesto);
  expect(r.hallazgos, 'el paquete no puede contener secretos').toEqual([]);
  const dir = resolve(RAIZ, 'test-results', 'seguros-del-estado', 'export');
  mkdirSync(dir, { recursive: true });
  const ruta = resolve(dir, `sde-export-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.zip`);
  writeFileSync(ruta, r.zip!);
  console.log(`Paquete: ${ruta} (${(r.zip!.length / 1024).toFixed(0)} KB)`);
});
