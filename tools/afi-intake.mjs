// Intake unificado AFI (Fase 4Q). Namespace `intake` de tools/afi.mjs:
//   node tools/afi.mjs <proyecto> intake preparar <salida-agente.json|.md|.txt> [--json]
// A partir del MISMO envelope afi-agent-intake/v1 prepara (sin aplicar ninguno):
//   - el lote de conocimiento (4O: knowledge/review/), si trae knowledgeProposals o classificationRequests;
//   - el lote de datos de prueba (4Q: knowledge/test-data-review/), si trae testDataRequirements.
// No duplica lógica: orquesta los preparadores existentes en el harness tests/afi-intake.spec.ts. Sin navegador.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = 'afi-intake.spec.ts';
const USO = 'Uso: node tools/afi.mjs <proyecto> intake preparar <salida-agente.json|.md|.txt> [--json]';

function salir(mensaje, codigo = 2) {
  console.error(mensaje);
  console.error(USO);
  process.exit(codigo);
}

export function ejecutarIntake(proyecto, resto) {
  const json = resto.includes('--json');
  const otras = resto.filter(a => a.startsWith('--') && a !== '--json');
  if (otras.length) salir(`Opción desconocida ${otras[0].split('=')[0]}.`);
  const [accion, ...archivos] = resto.filter(a => !a.startsWith('--'));
  if (!proyecto || !/^[\w-]+$/.test(proyecto)) salir('Falta el proyecto.');
  if (!existsSync(join(RAIZ, 'projects', proyecto, 'tests', HARNESS))) salir(`El proyecto "${proyecto}" no tiene el harness de intake (tests/${HARNESS}).`);
  if (accion !== 'preparar') salir(`Acción de intake inválida "${accion ?? ''}". Acciones: preparar (aplicar sigue siendo por dimensión: conocimiento aplicar / datos aplicar).`);
  if (archivos.length !== 1) salir('preparar recibe exactamente UN archivo: la salida del agente.');
  if (/^[a-z][a-z0-9+.-]+:\/\//i.test(archivos[0])) salir('Solo rutas locales, no URLs.');
  const absoluta = resolve(archivos[0]);
  const rel = relative(RAIZ, absoluta);
  if (!rel || rel.startsWith('..') || /^[a-z]:/i.test(rel)) salir('La salida del agente debe estar dentro del repositorio.');
  if (!existsSync(absoluta) || !statSync(absoluta).isFile()) salir('No existe la salida del agente.');

  const temporal = mkdtempSync(join(tmpdir(), 'afi-intake-'));
  const salida = join(temporal, 'resumen.json');
  const resultado = spawnSync('npx', ['playwright', 'test', HARNESS, '--workers=1', '--retries=0', '--reporter=line', `--output=${join(temporal, 'artefactos')}`], {
    cwd: RAIZ, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32',
    env: { ...process.env, PROJECT: proyecto, AFI_INTAKE_ACCION: accion, AFI_INTAKE_ENTRADA: rel, AFI_INTAKE_OUTPUT: salida },
  });
  let resumen;
  try { resumen = JSON.parse(readFileSync(salida, 'utf8')); } catch { resumen = undefined; }
  rmSync(temporal, { recursive: true, force: true });
  if (resumen) console.log(json ? JSON.stringify(resumen.datos, null, 2) : resumen.texto);
  else {
    process.stderr.write(`${resultado.stdout ?? ''}${resultado.stderr ?? ''}`);
    console.error('El harness de intake no produjo resumen.');
  }
  const codigo = resultado.status ?? 1;
  process.exit(codigo !== 0 ? codigo : resumen?.datos?.ok ? 0 : 1);
}
