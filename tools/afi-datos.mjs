// Datos de prueba AFI (Fases 4P/4Q). Namespace `datos` de tools/afi.mjs:
//   node tools/afi.mjs <proyecto> datos estado [--json]                   resumen + detalle por actor (sin valores)
//   node tools/afi.mjs <proyecto> datos requeridos [<caso|hu>] [--json]   qué actor necesita cada caso
//   node tools/afi.mjs <proyecto> datos plantilla-env [--escribir]        SOLO nombres vacíos; --escribir genera .env.test-data.example
//   node tools/afi.mjs <proyecto> datos preparar <salida-agente.json|.md|.txt> [--json]
//   node tools/afi.mjs <proyecto> datos aplicar <lote.review.json> <lote.decisiones.json> [--dry-run] [--json]
//   node tools/afi.mjs <proyecto> datos provisionado <actor> --revisor=<alias> [--dry-run] [--json]
// Nunca imprime ni escribe valores; nunca toca el .env real (provisionado solo comprueba PRESENCIA de variables).
// Sin navegador: delega en el harness tests/afi-datos.spec.ts. Rutas confinadas al repositorio.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = 'afi-datos.spec.ts';
const ACCIONES = ['estado', 'requeridos', 'plantilla-env', 'preparar', 'aplicar', 'provisionado'];
const USO = [
  'Uso: node tools/afi.mjs <proyecto> datos estado [--json]',
  '     node tools/afi.mjs <proyecto> datos requeridos [<caso|hu>] [--json]',
  '     node tools/afi.mjs <proyecto> datos plantilla-env [--escribir]',
  '     node tools/afi.mjs <proyecto> datos preparar <salida-agente.json|.md|.txt> [--json]',
  '     node tools/afi.mjs <proyecto> datos aplicar <lote.review.json> <lote.decisiones.json> [--dry-run] [--json]',
  '     node tools/afi.mjs <proyecto> datos provisionado <actor> --revisor=<alias> [--dry-run] [--json]',
].join('\n');

function salir(mensaje, codigo = 2) {
  console.error(mensaje);
  console.error(USO);
  process.exit(codigo);
}

/** Ruta del usuario -> relativa a la raíz, confinada al repositorio. */
function relativa(ruta, que) {
  if (/^[a-z][a-z0-9+.-]+:\/\//i.test(ruta)) salir(`${que}: solo rutas locales, no URLs.`);
  const absoluta = resolve(ruta);
  const rel = relative(RAIZ, absoluta);
  if (!rel || rel.startsWith('..') || /^[a-z]:/i.test(rel)) salir(`${que} debe estar dentro del repositorio.`);
  if (!existsSync(absoluta) || !statSync(absoluta).isFile()) salir(`No existe ${que.toLowerCase()}.`);
  return rel;
}

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function ejecutarDatos(proyecto, resto) {
  const banderas = resto.filter(a => a.startsWith('--'));
  const revisorArg = banderas.filter(a => a.startsWith('--revisor='));
  const desconocidas = banderas.filter(a => !['--json', '--escribir', '--dry-run'].includes(a) && !a.startsWith('--revisor='));
  if (desconocidas.length) salir(`Opción desconocida ${desconocidas[0].split('=')[0]}.`);
  const json = banderas.includes('--json');
  const escribir = banderas.includes('--escribir');
  const dryRun = banderas.includes('--dry-run');
  const [accion, ...args] = resto.filter(a => !a.startsWith('--'));
  if (!proyecto || !/^[\w-]+$/.test(proyecto)) salir('Falta el proyecto.');
  if (!existsSync(join(RAIZ, 'projects', proyecto, 'tests', HARNESS))) salir(`El proyecto "${proyecto}" no tiene el harness de datos de prueba (tests/${HARNESS}).`);
  if (!ACCIONES.includes(accion)) salir(`Acción de datos inválida "${accion ?? ''}". Acciones: ${ACCIONES.join(', ')}.`);
  if (escribir && accion !== 'plantilla-env') salir('--escribir solo aplica a plantilla-env.');
  if (json && accion === 'plantilla-env') salir('plantilla-env produce texto (.env.example), no --json.');
  if (dryRun && !['aplicar', 'provisionado'].includes(accion)) salir('--dry-run solo aplica a aplicar y provisionado.');
  if (revisorArg.length && accion !== 'provisionado') salir('--revisor solo aplica a provisionado (en aplicar, el revisor va en cada decisión).');
  const env = { PROJECT: proyecto, AFI_DATOS_ACCION: accion, AFI_DATOS_DRY_RUN: dryRun ? '1' : '0', AFI_DATOS_FECHA: hoy() };
  if (['estado', 'plantilla-env'].includes(accion) && args.length) salir('Argumentos no admitidos.');
  if (accion === 'requeridos') {
    if (args.length > 1) salir('requeridos recibe como mucho un caso o hu.');
    if (args[0]) env.AFI_DATOS_FILTRO = args[0];
  }
  if (accion === 'plantilla-env' && escribir) env.AFI_DATOS_ESCRIBIR = '1';
  if (accion === 'preparar') {
    if (args.length !== 1) salir('preparar recibe exactamente UN archivo: la salida del agente.');
    env.AFI_DATOS_ENTRADA = relativa(args[0], 'La salida del agente');
  }
  if (accion === 'aplicar') {
    if (args.length !== 2) salir('aplicar recibe DOS archivos: el lote de revisión y el archivo de decisiones.');
    env.AFI_DATOS_REVISION = relativa(args[0], 'El lote de revisión');
    env.AFI_DATOS_DECISIONES = relativa(args[1], 'El archivo de decisiones');
  }
  if (accion === 'provisionado') {
    if (args.length !== 1) salir('provisionado recibe exactamente UN actor.');
    // El id del actor nunca es un valor: si no tiene forma de id, no se reenvía ni se muestra.
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(args[0]) || args[0].length > 60) salir('El actor debe ser un id kebab-case del Test Data Registry (no se muestra el argumento por seguridad).');
    if (revisorArg.length !== 1) salir('provisionado requiere --revisor=<alias> una sola vez.');
    env.AFI_DATOS_ACTOR = args[0];
    env.AFI_DATOS_REVISOR = revisorArg[0].slice('--revisor='.length);
  }

  const temporal = mkdtempSync(join(tmpdir(), 'afi-datos-'));
  const salida = join(temporal, 'resumen.json');
  const resultado = spawnSync('npx', ['playwright', 'test', HARNESS, '--workers=1', '--retries=0', '--reporter=line', `--output=${join(temporal, 'artefactos')}`], {
    cwd: RAIZ, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32',
    env: { ...process.env, ...env, AFI_DATOS_OUTPUT: salida },
  });
  let resumen;
  try { resumen = JSON.parse(readFileSync(salida, 'utf8')); } catch { resumen = undefined; }
  rmSync(temporal, { recursive: true, force: true });
  if (resumen) console.log(json ? JSON.stringify(resumen.datos, null, 2) : resumen.texto);
  else {
    process.stderr.write(`${resultado.stdout ?? ''}${resultado.stderr ?? ''}`);
    console.error('El harness de datos de prueba no produjo resumen.');
  }
  const codigo = resultado.status ?? 1;
  process.exit(codigo !== 0 ? codigo : resumen?.datos?.ok ? 0 : 1);
}
