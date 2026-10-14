// Intake de conocimiento declarativo AFI (Fase 4O). Namespace `conocimiento` de tools/afi.mjs:
//   node tools/afi.mjs <proyecto> conocimiento preparar <salida-agente.json|.md> [--revision-dir <dir>] [--json]
//   node tools/afi.mjs <proyecto> conocimiento aplicar <lote.review.json> <lote.decisiones.json> [--dry-run] [--json]
//   node tools/afi.mjs <proyecto> conocimiento vinculos-preparar <vinculos.json> [--json]                                  (4R.1)
//   node tools/afi.mjs <proyecto> conocimiento vinculos-aplicar <lote.review.json> <lote.decisiones.json> [--dry-run] [--json]
//
// preparar: valida la salida (NO confiable) del agente y escribe un artefacto de revisión determinista
//   (knowledge/review/<lote>.review.json) + una plantilla de decisiones SIN decisiones. Nunca toca el Application Model.
// aplicar: comprueba lote, revisionBase y hashes; aplica SOLO lo APPROVED de forma atómica (escritura temporal + rename),
//   incrementa la revisión, conserva historial y regenera AFI-AGENT-MANIFEST.json. --dry-run valida todo y no escribe.
//
// Rutas resueltas desde el cwd y confinadas al repositorio; se pasan al harness por variables de entorno (la ruta
// del repo puede tener espacios). No abre navegador ni toca runtime.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = 'afi-conocimiento.spec.ts';
const USO = [
  'Uso: node tools/afi.mjs <proyecto> conocimiento preparar <salida-agente.json|.md> [--revision-dir <dir>] [--json]',
  '     node tools/afi.mjs <proyecto> conocimiento aplicar <lote.review.json> <lote.decisiones.json> [--dry-run] [--json]',
  '     node tools/afi.mjs <proyecto> conocimiento vinculos-preparar <vinculos.json> [--json]',
  '     node tools/afi.mjs <proyecto> conocimiento vinculos-aplicar <lote.review.json> <lote.decisiones.json> [--dry-run] [--json]',
].join('\n');

function salir(mensaje, codigo = 2) {
  console.error(mensaje);
  console.error(USO);
  process.exit(codigo);
}

/** Ruta del usuario -> relativa a la raíz, confinada al repositorio. */
function relativa(ruta, que, { existe = true } = {}) {
  if (/^[a-z][a-z0-9+.-]+:\/\//i.test(ruta)) salir(`${que}: solo rutas locales, no URLs.`);
  const absoluta = resolve(ruta);
  const rel = relative(RAIZ, absoluta);
  if (!rel || rel.startsWith('..') || /^[a-z]:/i.test(rel)) salir(`${que} debe estar dentro del repositorio: ${ruta}`);
  if (existe && (!existsSync(absoluta) || !statSync(absoluta).isFile())) salir(`No existe ${que.toLowerCase()}: ${ruta}`);
  return rel;
}

/** Fecha local AAAA-MM-DD de la aplicación (queda en el historial). */
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function ejecutarConocimiento(proyecto, resto) {
  const json = resto.includes('--json');
  const dryRun = resto.includes('--dry-run');
  const opciones = {};
  const posicionales = [];
  for (let i = 0; i < resto.length; i++) {
    const a = resto[i];
    if (a === '--json' || a === '--dry-run') continue;
    const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!m) { posicionales.push(a); continue; }
    if (m[1] !== 'revision-dir') salir(`Opción desconocida --${m[1]}.`);
    if (m[1] in opciones) salir(`--${m[1]} se indica una sola vez.`);
    const valor = m[2] ?? resto[++i];
    if (valor === undefined || valor.startsWith('--')) salir(`Falta el valor de --${m[1]}.`);
    opciones[m[1]] = valor;
  }
  const [accion, ...archivos] = posicionales;
  if (!proyecto || !/^[\w-]+$/.test(proyecto)) salir('Falta el proyecto.');
  if (!existsSync(join(RAIZ, 'projects', proyecto, 'tests', HARNESS))) salir(`El proyecto "${proyecto}" no tiene el harness de conocimiento (tests/${HARNESS}).`);
  const env = { PROJECT: proyecto, AFI_CONOCIMIENTO_ACCION: accion };
  if (accion === 'preparar') {
    if (archivos.length !== 1) salir('preparar recibe exactamente UN archivo: la salida de intake del agente.');
    if (dryRun) salir('--dry-run solo aplica a aplicar (preparar nunca modifica el Application Model).');
    env.AFI_CONOCIMIENTO_ENTRADA = relativa(archivos[0], 'La salida del agente');
    if (opciones['revision-dir']) env.AFI_CONOCIMIENTO_DIR_REVISION = relativa(opciones['revision-dir'], 'El directorio de revisión', { existe: false });
  } else if (accion === 'aplicar') {
    if (archivos.length !== 2) salir('aplicar recibe DOS archivos: el artefacto de revisión y el archivo de decisiones.');
    if (opciones['revision-dir']) salir('--revision-dir solo aplica a preparar (aplicar escribe junto al artefacto de revisión).');
    env.AFI_CONOCIMIENTO_REVISION = relativa(archivos[0], 'El artefacto de revisión');
    env.AFI_CONOCIMIENTO_DECISIONES = relativa(archivos[1], 'El archivo de decisiones');
    // El registro del resultado y el seguimiento se escriben junto al artefacto.
    env.AFI_CONOCIMIENTO_DIR_REVISION = dirname(env.AFI_CONOCIMIENTO_REVISION);
    env.AFI_CONOCIMIENTO_DRY_RUN = dryRun ? '1' : '0';
    env.AFI_CONOCIMIENTO_FECHA = hoy();
  } else if (accion === 'vinculos-preparar') {
    // 4R.1: vínculos de observación propuestos -> artefacto de revisión + plantilla (nunca modifica el almacén).
    if (archivos.length !== 1) salir('vinculos-preparar recibe exactamente UN archivo: { "observationBindings": [...] }.');
    if (dryRun || opciones['revision-dir']) salir('vinculos-preparar no admite --dry-run ni --revision-dir.');
    env.AFI_CONOCIMIENTO_ENTRADA = relativa(archivos[0], 'La propuesta de vínculos');
  } else if (accion === 'vinculos-aplicar') {
    if (archivos.length !== 2) salir('vinculos-aplicar recibe DOS archivos: el artefacto de revisión y el archivo de decisiones.');
    if (opciones['revision-dir']) salir('--revision-dir no aplica a vinculos-aplicar.');
    env.AFI_CONOCIMIENTO_REVISION = relativa(archivos[0], 'El artefacto de revisión');
    env.AFI_CONOCIMIENTO_DECISIONES = relativa(archivos[1], 'El archivo de decisiones');
    env.AFI_CONOCIMIENTO_DIR_REVISION = dirname(env.AFI_CONOCIMIENTO_REVISION);
    env.AFI_CONOCIMIENTO_DRY_RUN = dryRun ? '1' : '0';
    env.AFI_CONOCIMIENTO_FECHA = hoy();
  } else {
    salir(`Acción de conocimiento inválida "${accion ?? ''}". Acciones: preparar, aplicar, vinculos-preparar, vinculos-aplicar.`);
  }

  const temporal = mkdtempSync(join(tmpdir(), 'afi-conocimiento-'));
  const salida = join(temporal, 'resumen.json');
  const resultado = spawnSync('npx', ['playwright', 'test', HARNESS, '--workers=1', '--retries=0', '--reporter=line', `--output=${join(temporal, 'artefactos')}`], {
    cwd: RAIZ, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32',
    env: { ...process.env, ...env, AFI_CONOCIMIENTO_OUTPUT: salida },
  });
  let resumen;
  try { resumen = JSON.parse(readFileSync(salida, 'utf8')); } catch { resumen = undefined; }
  rmSync(temporal, { recursive: true, force: true });
  if (resumen) console.log(json ? JSON.stringify(resumen.datos, null, 2) : resumen.texto);
  else {
    process.stderr.write(`${resultado.stdout ?? ''}${resultado.stderr ?? ''}`);
    console.error('El harness de conocimiento no produjo resumen.');
  }
  const codigo = resultado.status ?? 1;
  process.exit(codigo !== 0 ? codigo : resumen?.datos?.ok ? 0 : 1);
}
