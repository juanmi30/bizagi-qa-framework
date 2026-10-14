#!/usr/bin/env node
// Ejecuta las pruebas de un proyecto Bizagi (plantillas + grabados).
// Uso:  npm test -- <proyecto> [args de playwright] [--escenario X] [--fuente plantillas|grabados]
//   npm test -- demo
//   npm test -- demo --grep @smoke
//   npm test -- demo --escenario "radicador"
//   npm test -- demo --fuente grabados --list
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { load as yamlLoad } from 'js-yaml';

const [, , project, ...rest] = process.argv;
if (!project) {
  console.error('Uso: npm test -- <proyecto> [args de playwright]');
  console.error('Ej.: npm test -- demo   |   npm test -- demo --escenario "radicador"');
  process.exit(1);
}
const projectDir = resolve('projects', project);
if (!existsSync(projectDir)) {
  console.error(`No existe el proyecto "${project}" en projects/.`);
  console.error(`Crea uno con:  npm run new:project -- ${project}`);
  process.exit(1);
}
const envPath = resolve(projectDir, '.env');
if (existsSync(envPath)) loadEnv({ path: envPath });
else console.warn(`Aviso: falta projects/${project}/.env  (copia .env.example a .env y complétalo).`);

// --- Separa los parámetros PROPIOS del framework de los de Playwright ---
const passthrough = [];
let escenario = '';
let fuente = '';
let como = '';
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === '--escenario') escenario = rest[++i] ?? '';
  else if (a.startsWith('--escenario=')) escenario = a.slice('--escenario='.length);
  else if (a === '--fuente') fuente = rest[++i] ?? '';
  else if (a.startsWith('--fuente=')) fuente = a.slice('--fuente='.length);
  else if (a === '--como') como = rest[++i] ?? '';
  else if (a.startsWith('--como=')) como = a.slice('--como='.length);
  else passthrough.push(a);
}

const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

if (fuente && !['plantillas', 'grabados'].includes(norm(fuente))) {
  console.error(`--fuente debe ser "plantillas" o "grabados" (recibí "${fuente}").`);
  process.exit(1);
}

// --- Catálogo de definiciones del proyecto (plantillas + grabados) ---
function catalogo() {
  const defs = [];
  const scDir = resolve(projectDir, 'scenarios');
  if (existsSync(scDir)) {
    for (const f of readdirSync(scDir)) {
      if (!/\.ya?ml$/i.test(f) || f.startsWith('_')) continue;
      let esc = f.replace(/\.ya?ml$/i, '');
      try {
        const d = yamlLoad(readFileSync(resolve(scDir, f), 'utf8'));
        if (d && d.escenario) esc = String(d.escenario);
      } catch { /* si el YAML está roto, se reporta al correr */ }
      defs.push({ origen: 'plantilla', archivo: f, escenario: esc });
    }
  }
  const grDir = resolve(projectDir, 'grabados');
  if (existsSync(grDir)) {
    for (const f of readdirSync(grDir)) {
      if (!/\.spec\.ts$/i.test(f) || f.startsWith('_')) continue;
      defs.push({ origen: 'grabado', archivo: f, escenario: f.replace(/\.spec\.ts$/i, '') });
    }
  }
  return defs;
}

const yaTieneGrep = passthrough.some((a) => a === '--grep' || a.startsWith('--grep'));
let grep = null;

if (escenario) {
  // Valida que exista y filtra por env (ESCENARIO_FILTRO). El grep usa una etiqueta
  // única sin espacios (@escenario) para no romperse al pasar por la consola.
  const enFuente = (d) => !fuente || norm(fuente).startsWith(norm(d.origen));
  const coincide = catalogo().filter(enFuente)
    .filter((d) => norm(d.escenario).includes(norm(escenario)) || norm(d.archivo).includes(norm(escenario)));
  if (coincide.length === 0) {
    console.error(`No encontré un escenario que coincida con "${escenario}" en "${project}".`);
    const todos = catalogo();
    if (todos.length === 0) console.error('  (este proyecto aún no tiene escenarios ni grabados)');
    else { console.error('Escenarios disponibles:'); for (const d of todos) console.error(`  [${d.origen}] ${d.escenario}   (${d.archivo})`); }
    process.exit(1);
  }
  grep = '@escenario';
} else if (fuente) {
  grep = norm(fuente) === 'plantillas' ? '@plantilla' : '@grabado';
}
if (grep && !yaTieneGrep) passthrough.push('--grep', grep);

// Se invoca el CLI de Playwright DIRECTAMENTE con este mismo Node y sin shell: los argumentos llegan literales.
// Antes era `npx` con shell en Windows (npx es un .cmd): cmd.exe partía `--grep "dos palabras"` (incidente 2026-10-13,
// se ejecutó una vertical E2E real) y expandía `%VARIABLE%` aunque se entrecomillara (auditoría de Work, PR #1).
// BIZAGI_RUNNER_CLI: SOLO para pruebas del runner (un receptor sintético que registra los argumentos que recibe).
const require = createRequire(import.meta.url);
const cli = process.env.BIZAGI_RUNNER_CLI || require.resolve('@playwright/test/cli');

const result = spawnSync(process.execPath, [cli, 'test', ...passthrough], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PROJECT: project,
    ESCENARIO_FILTRO: escenario,
    FUENTE_ESCENARIO: fuente,
    COMO_GRABACION: como,
  },
  shell: false,
});
if (result.error) console.error(`No se pudo iniciar Playwright: ${result.error.message}`);
process.exit(result.status ?? 1);
