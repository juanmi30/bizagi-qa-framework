#!/usr/bin/env node
// Grabación guiada (codegen) para casos raros de Bizagi.
// Uso:
//   npm run grabar -- <cliente> <nombre>              -> graba un CASO completo  -> grabados/_crudo/<nombre>.spec.ts
//   npm run grabar -- <cliente> <nombre> --como paso  -> graba solo una PANTALLA -> custom/_crudo/<nombre>.ts
// Lee la URL del .env del cliente (no pide datos que ya están ahí). Usa Edge (Chromium).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { config as loadEnv } from 'dotenv';

const argv = process.argv.slice(2);
let como = '';
const libres = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--como') como = argv[++i] ?? '';
  else if (a.startsWith('--como=')) como = a.slice('--como='.length);
  else libres.push(a);
}
const [cliente, nombre] = libres;

if (!cliente || !nombre) {
  console.error('Uso: npm run grabar -- <cliente> <nombre> [--como paso]');
  console.error('Ej.: npm run grabar -- conpre visor-documentos');
  console.error('     npm run grabar -- conpre adjuntar-archivos --como paso');
  process.exit(1);
}

const projectDir = resolve('projects', cliente);
if (!existsSync(projectDir)) {
  console.error(`No existe el proyecto "${cliente}" en projects/. Créalo con: npm run new:project -- ${cliente}`);
  process.exit(1);
}
const envPath = resolve(projectDir, '.env');
if (existsSync(envPath)) loadEnv({ path: envPath });

const url = process.env.BIZAGI_BASE_URL;
const urlReal = !!url && /^https?:\/\//i.test(url) && !/[<>]/.test(url);
if (!urlReal) {
  console.error(`El .env de "${cliente}" no tiene una URL real (BIZAGI_BASE_URL).`);
  console.error(`Complétala en projects/${cliente}/.env antes de grabar.`);
  process.exit(1);
}

const esPaso = /^paso$/i.test(como);
const carpeta = esPaso ? resolve(projectDir, 'custom', '_crudo') : resolve(projectDir, 'grabados', '_crudo');
mkdirSync(carpeta, { recursive: true });
const salida = resolve(carpeta, esPaso ? `${nombre}.ts` : `${nombre}.spec.ts`);
const target = esPaso ? 'playwright' : 'playwright-test';

console.log(`Abriendo el grabador (codegen) en Edge -> ${url}`);
console.log(esPaso
  ? 'Graba SOLO la pantalla rara (el paso). Cierra la ventana de Edge al terminar.'
  : 'Graba el CASO completo. Cierra la ventana de Edge al terminar.');

const result = spawnSync(
  'npx',
  ['playwright', 'codegen', '--channel', 'msedge', '--target', target, '-o', salida, url],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.status === 0) {
  console.log('');
  console.log(`Grabación cruda guardada en: ${relative(process.cwd(), salida)}`);
  console.log('OJO: la grabación CRUDA aún NO es un escenario del framework');
  console.log('     (puede traer el login y credenciales). Hay que "adoptarla":');
  console.log(`     npm run adoptar -- ${cliente} ${nombre}${esPaso ? ' --como paso' : ''}`);
}
process.exit(result.status ?? 1);
