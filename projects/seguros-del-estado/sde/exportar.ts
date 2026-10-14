import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { escribirZip, leerZip } from '../../../shared/utils/zip';

/**
 * Exportación SANITIZADA del framework + proyecto SDE para compartir (orquestador, revisores).
 * Política: se incluye solo lo necesario para continuar el trabajo (código, escenarios, datos LÓGICOS, matriz,
 * documentos). Nunca: .env, resultados de Playwright (reporte HTML, traces, videos), capturas, logs, otros proyectos.
 * Antes de empaquetar se escanea TODO lo incluido (también el interior de .xlsx/.docx) buscando los valores reales del
 * .env local y patrones de secreto. Con un solo hallazgo no se genera el paquete. Los hallazgos nunca muestran el valor.
 */

/**
 * Raíces incluidas, relativas a la raíz del repositorio. Otros proyectos (_template, colsubsidio, conpre, demo) no se exportan.
 * Incluye el contexto portable de orquestación (CLAUDE.md y docs/orquestacion: contexto maestro, estado, decisiones,
 * protocolo con la instrucción de inicio de Work, checkpoints), para que un agente nuevo pueda arrancar solo con el paquete.
 */
export const RAICES_EXPORT = [
  'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json', '.gitignore', '.eslintrc.json', '.prettierrc',
  'CLAUDE.md', 'INICIO-CLAUDE-CODE.md', 'docs/orquestacion',
  'shared', 'tools', 'projects/seguros-del-estado',
];

/** Documentos que el paquete portable DEBE contener (la exportación falla si falta alguno). */
export const DOCUMENTOS_PORTABLES = [
  'CLAUDE.md',
  'docs/orquestacion/CONTEXTO-MAESTRO.md',
  'docs/orquestacion/ESTADO-ACTUAL.md',
  'docs/orquestacion/DECISIONES.md',
  'docs/orquestacion/PROTOCOLO-AGENTES.md',
];

/** Exclusiones con su motivo (se evalúan sobre la ruta relativa con "/"). */
export const EXCLUSIONES: { patron: RegExp; motivo: string }[] = [
  { patron: /(^|\/)node_modules\//, motivo: 'dependencias (se instalan con npm ci)' },
  { patron: /(^|\/)\.env(\.(?!example$)[^/]*)?$/, motivo: 'credenciales y datos de QA (.env)' },
  { patron: /(^|\/)(test-results|playwright-report|blob-report)\//, motivo: 'resultados locales de Playwright (pueden contener capturas, valores tecleados y PII)' },
  { patron: /\.(png|jpe?g|gif|bmp|webp|webm|mp4|avi|har)$/i, motivo: 'captura o video (muestra nombre y correo del usuario QA)' },
  { patron: /(^|\/)trace[^/]*\.zip$|\.trace$/i, motivo: 'trace de Playwright (registra valores tecleados)' },
  { patron: /\.log$/i, motivo: 'log de consola (excluido también por .gitignore)' },
  { patron: /(^|\/)_crudo\//, motivo: 'grabaciones crudas sin revisar' },
];

export function motivoExclusion(ruta: string): string | null {
  return EXCLUSIONES.find((e) => e.patron.test(ruta))?.motivo ?? null;
}

export interface Seleccion { incluidos: string[]; excluidos: { ruta: string; motivo: string }[] }

export function seleccionarArchivos(raizRepo: string, raices = RAICES_EXPORT): Seleccion {
  const sel: Seleccion = { incluidos: [], excluidos: [] };
  const visitar = (abs: string) => {
    const ruta = relative(raizRepo, abs).split('\\').join('/');
    const st = statSync(abs, { throwIfNoEntry: false });
    if (!st) return;
    if (st.isDirectory()) {
      if (/(^|\/)node_modules$/.test(ruta)) { sel.excluidos.push({ ruta: ruta + '/', motivo: 'dependencias (se instalan con npm ci)' }); return; }
      for (const h of readdirSync(abs).sort()) visitar(resolve(abs, h));
      return;
    }
    const motivo = motivoExclusion(ruta);
    if (motivo) sel.excluidos.push({ ruta, motivo });
    else sel.incluidos.push(ruta);
  };
  for (const r of raices) visitar(resolve(raizRepo, r));
  return sel;
}

export interface Hallazgo { ruta: string; linea: number; tipo: string }

/** Patrones de secreto genéricos (además de los valores reales del .env). */
const PATRONES: { tipo: string; re: RegExp }[] = [
  { tipo: 'asignación de credencial con valor', re: /^\s*(?:CLAVE|PASSWORD|BIZAGI_PASSWORD|USUARIO|SECRET|TOKEN|CLIENT_SECRET)[A-Za-z0-9_]*\s*=\s*\S{3,}/im },
  { tipo: 'token JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./ },
  { tipo: 'cabecera Bearer', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/ },
  { tipo: 'correo electrónico', re: /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|test)\b|ficticio\.test\b|anthropic\.com\b)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/ },
];

/** Textos a revisar de un archivo: el propio texto, o las partes XML de un .xlsx/.docx/.pptx. */
function textos(ruta: string, datos: Buffer): { parte: string; texto: string }[] {
  if (/\.(xlsx|docx|pptx)$/i.test(ruta)) {
    return leerZip(datos).filter((e) => /\.(xml|rels)$/i.test(e.nombre)).map((e) => ({ parte: `${ruta}!${e.nombre}`, texto: e.datos.toString('utf8') }));
  }
  return [{ parte: ruta, texto: datos.toString(/\.pdf$/i.test(ruta) ? 'latin1' : 'utf8') }];
}

const BINARIOS_OPACOS = /\.(woff2?|ttf|ico)$/i;

/** Escanea contenidos. `secretos`: valores reales que no pueden aparecer (credenciales, datos sensibles de QA). */
export function escanearSecretos(archivos: { ruta: string; datos: Buffer }[], secretos: string[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const valores = secretos.filter((s) => s.trim().length >= 3);
  for (const { ruta, datos } of archivos) {
    if (BINARIOS_OPACOS.test(ruta)) continue;
    for (const { parte, texto } of textos(ruta, datos)) {
      const lineas = texto.split(/\r?\n/);
      lineas.forEach((l, i) => {
        if (valores.some((v) => l.includes(v))) hallazgos.push({ ruta: parte, linea: i + 1, tipo: 'valor real del .env (credencial o dato sensible)' });
        for (const p of PATRONES) if (p.re.test(l)) hallazgos.push({ ruta: parte, linea: i + 1, tipo: p.tipo });
      });
    }
  }
  return hallazgos;
}

export interface ResultadoExport { seleccion: Seleccion; hallazgos: Hallazgo[]; faltantes: string[]; zip: Buffer | null; manifiesto: string }

export function generarExport(raizRepo: string, secretos: string[], fecha = new Date()): ResultadoExport {
  const seleccion = seleccionarArchivos(raizRepo);
  const archivos = seleccion.incluidos.map((ruta) => ({ ruta, datos: readFileSync(resolve(raizRepo, ruta)) }));
  const hallazgos = escanearSecretos(archivos, secretos);
  const faltantes = DOCUMENTOS_PORTABLES.filter((d) => !seleccion.incluidos.includes(d));
  const manifiesto = [
    `# Exportación sanitizada SDE-CEL — ${fecha.toISOString()}`,
    '',
    `Incluidos: ${seleccion.incluidos.length} archivos. Excluidos: ${seleccion.excluidos.length}. Escaneo de secretos: ${hallazgos.length ? `${hallazgos.length} HALLAZGO(S) — paquete NO generado` : '0 hallazgos'}.`,
    `Valores del .env local verificados: ${secretos.length} (no se listan).`,
    faltantes.length ? `Documentos portables FALTANTES (paquete NO generado): ${faltantes.join(', ')}.` : 'Documentos portables de orquestación: completos.',
    '',
    'Para continuar: leer `CLAUDE.md` y `docs/orquestacion/` (la instrucción de inicio de Work está en PROTOCOLO-AGENTES.md §2);',
    '`npm ci`; copiar `projects/seguros-del-estado/.env.example` a `.env` y completarlo localmente.',
    'El historial local `test-results/` NO viaja en el paquete: las métricas de ejecución salen de `docs/evidencia/` (versionada).',
    '',
    '## Excluidos por política',
    '',
    ...[...new Set(seleccion.excluidos.map((e) => e.motivo))].map((m) => `- ${m}: ${seleccion.excluidos.filter((e) => e.motivo === m).length}`),
    '',
    ...(hallazgos.length ? ['## Hallazgos (sin valores)', '', ...hallazgos.map((h) => `- ${h.ruta}:${h.linea} — ${h.tipo}`), ''] : []),
  ].join('\n');
  const zip = hallazgos.length || faltantes.length ? null : escribirZip([
    ...archivos.map((a) => ({ nombre: a.ruta, datos: a.datos })),
    { nombre: 'MANIFIESTO-EXPORT.md', datos: Buffer.from(manifiesto + '\n', 'utf8') },
  ]);
  return { seleccion, hallazgos, faltantes, zip, manifiesto };
}
