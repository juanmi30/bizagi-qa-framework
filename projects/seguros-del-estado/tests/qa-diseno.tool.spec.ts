import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validarDisenoSde } from '../sde/disenoQa';

/** Herramienta offline: no solicita fixtures de navegador ni ejecuta capacidades UI. */
test('validar contrato documental del piloto @qa-diseno', async () => {
  const raiz = resolve(__dirname, '../../..');
  const piloto = JSON.parse(readFileSync(resolve(raiz, 'docs/qa-hibrida/piloto/HU06-CP02.diseno.json'), 'utf8'));
  const informe = await validarDisenoSde(piloto, {}); // no inspecciona ni serializa .env
  const salida = resolve(raiz, 'test-results/qa-hibrida'); mkdirSync(salida, { recursive: true });
  writeFileSync(resolve(salida, 'HU06-CP02-validacion.json'), JSON.stringify(informe, null, 2));
  console.log(JSON.stringify(informe));
  expect(informe.valido).toBe(true);
});
