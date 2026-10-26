import { test } from '@playwright/test';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { cargarRegistro } from '../sde/datos';
import { RUTA_SOPORTES } from '../sde/certificacion';
import { copiaSinDatosPersonales, fragmentosUsuarios } from '../sde/privacidad';

/**
 * COPIA PARA DEMOSTRACIÓN del último soporte de una HU: oculta nombre y correo de los usuarios QA en las capturas.
 * No abre Bizagi; no modifica el soporte original ni las capturas archivadas. Requiere Windows (OCR del sistema).
 * Uso (PowerShell, raíz del repo):  $env:SDE_SOPORTE_HU='HU06'; node tools/run.mjs seguros-del-estado --grep "@soporte-demo"
 * Salida: <carpeta del soporte>/copia-demo/<nombre>_DEMO_sin_datos_personales.docx
 */
const HU = process.env.SDE_SOPORTE_HU;
const RAIZ = resolve(__dirname, '..', '..', '..');

test('copia de demostración del soporte sin datos personales @soporte-demo', () => {
  test.skip(!HU || !/^HU\d+$/.test(HU), 'Defina SDE_SOPORTE_HU=<HU>, p. ej. HU06.');
  test.skip(process.platform !== 'win32', 'Requiere el OCR de Windows.');
  test.setTimeout(30 * 60_000);
  const base = resolve(RAIZ, ...RUTA_SOPORTES, HU!);
  const carpeta = readdirSync(base).filter((d) => statSync(resolve(base, d)).isDirectory()).sort().at(-1);
  if (!carpeta) throw new Error(`No hay soportes generados de ${HU}: genere primero el Word (@soporte-hu).`);
  const original = readdirSync(resolve(base, carpeta)).find((f) => f.endsWith('.docx'));
  if (!original) throw new Error(`La carpeta ${carpeta} no tiene DOCX.`);
  const salida = resolve(base, carpeta, 'copia-demo', original.replace(/\.docx$/, '_DEMO_sin_datos_personales.docx'));
  if (existsSync(salida)) { console.log(`DEMO ya existe (no se sobrescribe): ${relative(RAIZ, salida)}`); return; }
  const variables = Object.values(cargarRegistro().actores).flatMap((a) => a.variables);
  const r = copiaSinDatosPersonales({ docx: resolve(base, carpeta, original), salida, fragmentos: fragmentosUsuarios(process.env, variables) });
  console.log(`DEMO ${HU}: ${r.imagenes} capturas procesadas, ${r.zonas} zonas ocultas; capturas sin datos personales detectados: ${r.sinZonas.length}`);
  console.log(`DEMO docx: ${relative(RAIZ, r.docx).split('\\').join('/')}`);
});
