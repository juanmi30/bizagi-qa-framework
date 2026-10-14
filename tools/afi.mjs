#!/usr/bin/env node
// CLI de casos AFI en archivo (Fase 3D). UN archivo *.afi.json por invocación.
//   node tools/afi.mjs <proyecto> validar  <archivo.afi.json> [--json]   contrato
//   node tools/afi.mjs <proyecto> compilar <archivo.afi.json> [--json]   contrato + actor + preflight, sin navegador
//   node tools/afi.mjs <proyecto> ejecutar <archivo.afi.json> [--json] [--evidencia=<modo>]   E2E real
//   node tools/afi.mjs <proyecto> conocimiento preparar|aplicar ...   intake de conocimiento declarativo (4O)
//   node tools/afi.mjs <proyecto> datos estado|requeridos|plantilla-env|preparar|aplicar|provisionado ...   datos de prueba (4P/4Q)
//   node tools/afi.mjs <proyecto> intake preparar <salida-agente>   prepara conocimiento + datos desde un envelope (4Q)
//
// --evidencia (solo ejecutar; configuración de EJECUCIÓN, nunca del caso): off | cliente | tecnica | todo.
// Por defecto cliente (QA real). tecnica/todo conservan además video y trace de Playwright (uso interno).
// Tras ejecutar, el paquete de evidencias se copia a test-results/<proyecto>/evidencia-afi/<caso>/<fecha>/
// (test-results/<proyecto>/artifacts se limpia en cada corrida).
// --reconocimiento (solo ejecutar): off | shadow (por defecto off). shadow = el recognizer de pantallas OBSERVA en
// puntos estables y lo registra en la traza técnica (screenRecognition); nunca navega ni cambia el resultado.
//
// Este script NO interpreta el JSON: solo valida argumentos/ruta y delega en el harness
// TypeScript (projects/<proyecto>/tests/afi-case-file.spec.ts), que usa loader.ts + caso.ts.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const MODOS = ['validar', 'compilar', 'ejecutar'];
const MODOS_EVIDENCIA = ['off', 'cliente', 'tecnica', 'todo'];
const HARNESS = 'afi-case-file.spec.ts';

const args = process.argv.slice(2);
// Namespace de conocimiento declarativo (Fase 4O): preparar / aplicar lotes de revisión. Ver tools/afi-conocimiento.mjs.
if (args[1] === 'conocimiento') {
  const { ejecutarConocimiento } = await import('./afi-conocimiento.mjs');
  ejecutarConocimiento(args[0], args.slice(2));
}
// Namespace de datos de prueba (Fases 4P/4Q): estado, requeridos, plantilla-env, preparar, aplicar, provisionado. Ver tools/afi-datos.mjs.
if (args[1] === 'datos') {
  const { ejecutarDatos } = await import('./afi-datos.mjs');
  ejecutarDatos(args[0], args.slice(2));
}
// Intake unificado (Fase 4Q): prepara conocimiento y datos de prueba desde el MISMO envelope. Ver tools/afi-intake.mjs.
if (args[1] === 'intake') {
  const { ejecutarIntake } = await import('./afi-intake.mjs');
  ejecutarIntake(args[0], args.slice(2));
}
const json = args.includes('--json');
const banderaEvidencia = args.filter(a => a.startsWith('--evidencia='));
const evidencia = banderaEvidencia.at(-1)?.slice('--evidencia='.length);
const banderaReconocimiento = args.filter(a => a.startsWith('--reconocimiento='));
const reconocimiento = banderaReconocimiento.at(-1)?.slice('--reconocimiento='.length);
const [proyecto, modo, archivo, ...sobrantes] = args.filter(a => a !== '--json' && !a.startsWith('--evidencia=') && !a.startsWith('--reconocimiento='));

function salir(mensaje, codigo = 2) {
  console.error(mensaje);
  console.error('Uso: node tools/afi.mjs <proyecto> <validar|compilar|ejecutar> <archivo.afi.json> [--json] [--evidencia=off|cliente|tecnica|todo] [--reconocimiento=off|shadow]');
  process.exit(codigo);
}

if (!proyecto) salir('Falta el proyecto.');
if (!existsSync(resolve('projects', proyecto, 'tests', HARNESS))) salir(`El proyecto "${proyecto}" no existe o no tiene el harness AFI (tests/${HARNESS}).`);
if (!MODOS.includes(modo)) salir(`Modo inválido "${modo ?? ''}". Modos: ${MODOS.join(', ')}.`);
if (!archivo) salir('Falta el archivo .afi.json.');
if (banderaEvidencia.length > 1) salir('--evidencia se indica una sola vez.');
if (evidencia !== undefined && !MODOS_EVIDENCIA.includes(evidencia)) salir(`Modo de evidencia inválido "${evidencia}". Modos: ${MODOS_EVIDENCIA.join(', ')}.`);
if (evidencia !== undefined && modo !== 'ejecutar') salir('--evidencia solo aplica a ejecutar.');
if (banderaReconocimiento.length > 1) salir('--reconocimiento se indica una sola vez.');
if (reconocimiento !== undefined && !['off', 'shadow'].includes(reconocimiento)) salir(`Modo de reconocimiento inválido "${reconocimiento}". Modos: off, shadow.`);
if (reconocimiento !== undefined && modo !== 'ejecutar') salir('--reconocimiento solo aplica a ejecutar.');
if (sobrantes.length) salir(`Argumentos no admitidos: ${sobrantes.join(' ')} (un archivo por invocación).`);
if (/^[a-z][a-z0-9+.-]+:/i.test(archivo)) salir('Solo se aceptan rutas de archivo locales, no URLs.');
if (!archivo.toLowerCase().endsWith('.afi.json')) salir('El archivo debe tener extensión .afi.json.');
const ruta = resolve(archivo);
if (!existsSync(ruta) || !statSync(ruta).isFile()) salir(`No existe el archivo: ${archivo}`);

// Salida del harness por archivo temporal: el ruido de Playwright nunca se mezcla con el resumen.
const temporal = mkdtempSync(join(tmpdir(), 'afi-cli-'));
const salida = join(temporal, 'resumen.json');
const ejecutar = modo === 'ejecutar';
const pwArgs = ['playwright', 'test', HARNESS, '--workers=1', '--retries=0'];
// validar/compilar: sin artefactos ni reportes del proyecto (no pisan test-results de otras corridas).
if (!ejecutar) pwArgs.push('--reporter=line', `--output=${join(temporal, 'artefactos')}`);

const resultado = spawnSync('npx', pwArgs, {
  stdio: ejecutar ? 'inherit' : 'pipe',
  encoding: 'utf8',
  env: {
    ...process.env, PROJECT: proyecto, AFI_CASE_FILE: ruta, AFI_CASE_MODE: modo, AFI_CASE_OUTPUT: salida,
    ...(ejecutar ? { AFI_EVIDENCE_MODE: evidencia ?? process.env.AFI_EVIDENCE_MODE ?? 'cliente' } : {}),
    ...(ejecutar ? { AFI_SCREEN_RECOGNITION: reconocimiento ?? process.env.AFI_SCREEN_RECOGNITION ?? 'off' } : {}),
  },
  shell: process.platform === 'win32',
});

let resumen;
try { resumen = JSON.parse(readFileSync(salida, 'utf8')); } catch { resumen = undefined; }
rmSync(temporal, { recursive: true, force: true });

// Copia durable del paquete de evidencias (solo rutas relativas dentro del repositorio).
const paquete = resumen?.datos?.paqueteEvidencia;
if (ejecutar && typeof paquete === 'string' && !paquete.startsWith('..') && existsSync(resolve(paquete))) {
  const fecha = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    for (const caso of readdirSync(resolve(paquete))) {
      const destino = join('test-results', proyecto, 'evidencia-afi', caso, fecha);
      cpSync(resolve(paquete, caso), resolve(destino), { recursive: true });
      if (!json) console.log(`Paquete de evidencias: ${destino.split(sep).join('/')}`);
    }
  } catch (error) {
    // La copia es una comodidad: nunca cambia el resultado ni el exit code de la ejecución.
    console.error(`No se pudo copiar el paquete de evidencias (${error?.code ?? error?.name ?? 'Error'}); queda en ${paquete}.`);
  }
}

if (resumen) {
  console.log(json ? JSON.stringify(resumen.datos, null, 2) : resumen.texto);
} else {
  // El harness no llegó a emitir resumen (config, compilación TS, etc.): mostrar lo que dijo Playwright.
  if (!ejecutar) process.stderr.write(`${resultado.stdout ?? ''}${resultado.stderr ?? ''}`);
  console.error('El harness AFI no produjo resumen.');
}
// Nunca tragar el exit code de Playwright; y un resumen no-ok nunca sale en 0.
const codigo = resultado.status ?? 1;
process.exit(codigo !== 0 ? codigo : resumen?.datos?.ok ? 0 : 1);
