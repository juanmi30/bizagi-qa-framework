#!/usr/bin/env node
// Recuperación EXPLÍCITA de casos Portal pendientes del histórico de un proyecto.
// Uso:  npm run cleanup -- <proyecto>
//
// Solo opera números registrados en test-results/<proyecto>/historico-casos.json
// con modoCreacion "portal" y estado "Pendiente de depurar". La lógica UI vive en
// el spec del proyecto (convención: projects/<proyecto>/tests/cleanup-pendientes.spec.ts),
// que se ejecuta con workers=1 a través de tools/run.mjs.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SPEC = 'tests/cleanup-pendientes.spec.ts';
const raiz = resolve(process.env.CLEANUP_BASE_DIR ?? process.cwd());
const proyecto = process.argv[2] ?? '';

function fallar(mensaje) {
  console.error(`Error: ${mensaje}`);
  process.exit(1);
}

if (!proyecto) fallar('Debes indicar el proyecto. Ejemplo: npm run cleanup -- colsubsidio');
if (!existsSync(resolve(raiz, 'projects', proyecto))) fallar(`El proyecto "${proyecto}" no existe dentro de projects/.`);
if (!existsSync(resolve(raiz, 'projects', proyecto, SPEC))) {
  fallar(`El proyecto "${proyecto}" no soporta cleanup físico (falta projects/${proyecto}/${SPEC}).`);
}

const historico = resolve(raiz, 'test-results', proyecto, 'historico-casos.json');
let casos = [];
if (existsSync(historico)) {
  try { casos = JSON.parse(readFileSync(historico, 'utf8')); }
  catch { fallar(`El histórico del proyecto "${proyecto}" no contiene un JSON válido.`); }
  if (!Array.isArray(casos)) fallar(`El histórico del proyecto "${proyecto}" no tiene el formato esperado.`);
}
const pendientes = casos.filter((c) =>
  c.modoCreacion === 'portal' && (c.estadoDepuracion ?? 'Pendiente de depurar') === 'Pendiente de depurar');

if (pendientes.length === 0) {
  console.log('Pendientes Portal encontrados: 0');
  console.log('No hay nada que recuperar; no se abrió Bizagi.');
  process.exit(0);
}
console.log(`Pendientes Portal en el histórico: ${pendientes.map((c) => c.numeroCaso).join(', ')}`);
if (process.env.CLEANUP_SOLO_LISTAR === '1') process.exit(0);

const result = spawnSync(process.execPath, [resolve(raiz, 'tools', 'run.mjs'), proyecto, SPEC, '--workers=1', '--reporter=list'], {
  stdio: 'inherit',
  cwd: raiz,
  env: { ...process.env, CLEANUP_PENDIENTES: 'true' },
});
process.exit(result.status ?? 1);
