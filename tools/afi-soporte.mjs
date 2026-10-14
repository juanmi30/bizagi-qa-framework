#!/usr/bin/env node
// Soporte de certificación cliente AFI (Fase 4H). Acción SEPARADA de `afi.mjs ejecutar`: no ejecuta el caso.
//   node tools/afi-soporte.mjs <proyecto> --caso CP02 [--evidencias <carpeta>] [--diseno <xlsx>] [--template <docx>] [--meta <json>] [--json]
//
// --evidencias: paquete 4G (por defecto, la corrida más reciente en test-results/<proyecto>/evidencia-afi/<caso>/).
// --meta: por defecto projects/<proyecto>/resources/hu14-12/soporte-meta.json (declara diseño y plantilla por defecto).
// Salida: test-results/<proyecto>/soportes/<caso>/<corrida>/ con <caso>-soporte-plan.json y, solo si el soporte es
// GENERABLE (caso PASS, evidencia completa, sin inconsistencias), <caso>-Soportes-Certificacion-Cliente.docx.
//
// Todas las rutas se resuelven desde la RAÍZ del repositorio (no desde el cwd) y deben quedar dentro de él.
// Se pasan al harness por variables de entorno: nunca como argumentos (la ruta del repo tiene espacios).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = 'afi-soporte.spec.ts';
const OPCIONES = ['caso', 'evidencias', 'diseno', 'template', 'meta'];

function salir(mensaje, codigo = 2) {
  console.error(mensaje);
  console.error('Uso: node tools/afi-soporte.mjs <proyecto> --caso <CP..> [--evidencias <carpeta>] [--diseno <xlsx>] [--template <docx>] [--meta <json>] [--json]');
  process.exit(codigo);
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const opciones = {};
const posicionales = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json') continue;
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (!m) { posicionales.push(a); continue; }
  if (!OPCIONES.includes(m[1])) salir(`Opción desconocida --${m[1]}.`);
  if (m[1] in opciones) salir(`--${m[1]} se indica una sola vez.`);
  const valor = m[2] ?? args[++i];
  if (valor === undefined || valor.startsWith('--')) salir(`Falta el valor de --${m[1]}.`);
  opciones[m[1]] = valor;
}
const [proyecto, ...sobrantes] = posicionales;
if (!proyecto || !/^[\w-]+$/.test(proyecto)) salir('Falta el proyecto.');
if (sobrantes.length) salir(`Argumentos no admitidos: ${sobrantes.join(' ')}`);
if (!existsSync(join(RAIZ, 'projects', proyecto, 'tests', HARNESS))) salir(`El proyecto "${proyecto}" no tiene el harness de soporte (tests/${HARNESS}).`);
if (!opciones.caso || !/^[\w-]+$/.test(opciones.caso)) salir('Falta --caso (identificador simple, p. ej. CP02).');
for (const [k, v] of Object.entries(opciones)) if (/^[a-z][a-z0-9+.-]+:\/\//i.test(v)) salir(`--${k}: solo rutas locales, no URLs.`);

/** Ruta del usuario -> relativa a la raíz, confinada al repositorio. */
function relativa(ruta, que) {
  const absoluta = resolve(RAIZ, ruta);
  const rel = relative(RAIZ, absoluta);
  if (!rel || rel.startsWith('..') || /^[a-z]:/i.test(rel)) salir(`${que} debe estar dentro del repositorio: ${ruta}`);
  if (!existsSync(absoluta)) salir(`No existe ${que.toLowerCase()}: ${ruta}`);
  return rel;
}

const meta = relativa(opciones.meta ?? join('projects', proyecto, 'resources', 'hu14-12', 'soporte-meta.json'), 'La metadata');
let evidencias = opciones.evidencias;
if (!evidencias) {
  const base = join(RAIZ, 'test-results', proyecto, 'evidencia-afi', opciones.caso);
  const corridas = existsSync(base) ? readdirSync(base).filter(d => statSync(join(base, d)).isDirectory()).sort() : [];
  if (!corridas.length) salir(`No hay paquetes de evidencia en test-results/${proyecto}/evidencia-afi/${opciones.caso}/. Indica --evidencias.`);
  evidencias = join('test-results', proyecto, 'evidencia-afi', opciones.caso, corridas.at(-1));
  if (!json) console.log(`Paquete de evidencias (más reciente): ${evidencias.split('\\').join('/')}`);
}
evidencias = relativa(evidencias, 'El paquete de evidencias');
const diseno = opciones.diseno ? relativa(opciones.diseno, 'El diseño QA') : '';
const template = opciones.template ? relativa(opciones.template, 'La plantilla') : '';

const temporal = mkdtempSync(join(tmpdir(), 'afi-soporte-'));
const salida = join(temporal, 'resumen.json');
const resultado = spawnSync('npx', ['playwright', 'test', HARNESS, '--workers=1', '--retries=0', '--reporter=line', `--output=${join(temporal, 'artefactos')}`], {
  cwd: RAIZ, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32',
  env: {
    ...process.env, PROJECT: proyecto, AFI_SOPORTE_CASO: opciones.caso, AFI_SOPORTE_EVIDENCIAS: evidencias, AFI_SOPORTE_META: meta,
    AFI_SOPORTE_DISENO: diseno, AFI_SOPORTE_TEMPLATE: template, AFI_SOPORTE_OUTPUT: salida,
  },
});
let resumen;
try { resumen = JSON.parse(readFileSync(salida, 'utf8')); } catch { resumen = undefined; }
rmSync(temporal, { recursive: true, force: true });
if (resumen) console.log(json ? JSON.stringify(resumen.datos, null, 2) : resumen.texto);
else {
  process.stderr.write(`${resultado.stdout ?? ''}${resultado.stderr ?? ''}`);
  console.error('El harness de soporte no produjo resumen.');
}
const codigo = resultado.status ?? 1;
process.exit(codigo !== 0 ? codigo : resumen?.datos?.ok ? 0 : 1);
