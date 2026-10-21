#!/usr/bin/env node
// Orquestador SDE por HU: coordina lo que ya existe (tools/run.mjs, verticales, soporte Word). No reemplaza ningún control.
//   npm run sde:hu06          → ejecuta los CP de la HU contra Bizagi QA (crea casos) y genera el Word al terminar
//   npm run sde:hu06:word     → solo regenera el Word con las últimas ejecuciones (sin Bizagi)
//   npm run sde:hu06 -- --simular → muestra la preparación (CP, cupo, corrida) sin ejecutar nada
// Las variables (SDE_E2E, cupo, corrida, salidas) existen solo en el proceso hijo: no quedan en la terminal del usuario.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseEnv } from 'dotenv';

const PROYECTO = 'seguros-del-estado';
// SOLO PARA PRUEBAS (tests/unit/orquestador-hu.unit.spec.ts): repositorio temporal y runner sintético, para comprobar el
// flujo completo sin Playwright ni Bizagi. En uso normal no se definen.
const RAIZ = process.env.SDE_ORQ_RAIZ ? resolve(process.env.SDE_ORQ_RAIZ) : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUNNER = process.env.SDE_ORQ_RUNNER ?? 'tools/run.mjs';
const PENDIENTE = 'Pendiente de depurar'; // shared/utils/HistorialCasos.ts: el mismo criterio que usa el cupo atómico

/** Casos propios pendientes, con la MISMA regla que HistorialCasos.listarPendientes (estado ausente = pendiente). */
export function contarPendientes(historico) {
  return (Array.isArray(historico) ? historico : []).filter((c) => (c?.estadoDepuracion ?? PENDIENTE) === PENDIENTE).length;
}

/**
 * Límite de esta corrida: pendientes + CP seleccionados (un caso nuevo por CP, sin reintentos). Si QA fijó un límite
 * global (SDE_MAX_CASOS_PENDIENTES en el entorno o en .env), manda el menor: la corrida nunca amplía la política global.
 */
export function limiteCorrida({ pendientes, nuevos, global }) {
  const propio = pendientes + nuevos;
  const g = global === undefined || global === null || String(global).trim() === '' ? null : Number(String(global).trim());
  if (g !== null && (!Number.isInteger(g) || g < 0)) return { limite: null, error: `SDE_MAX_CASOS_PENDIENTES global "${global}" no es un entero >= 0.` };
  if (g === null) return { limite: propio, motivo: `${pendientes} pendientes + ${nuevos} CP` };
  if (g <= pendientes) return { limite: null, error: `El límite global de QA (SDE_MAX_CASOS_PENDIENTES=${g}) ya está alcanzado: hay ${pendientes} casos pendientes. No se crean casos.` };
  return g < propio
    ? { limite: g, motivo: `límite global de QA ${g} (menor que ${pendientes} pendientes + ${nuevos} CP): se crearán como máximo ${g - pendientes}` }
    : { limite: propio, motivo: `${pendientes} pendientes + ${nuevos} CP (dentro del límite global ${g})` };
}

/** CP que Playwright seleccionaría (salida de --list), en orden. */
export function cpListados(salida) {
  return [...String(salida).matchAll(/\[SDE\] (HU\d+-CP\d+) /g)].map((m) => m[1]);
}

export function argumentosSuite(hu, salidaArtefactos) {
  return ['--grep', `@${hu.toLowerCase()}`, '--grep-invert', '@variante', '--workers=1', '--retries=0', '--trace', 'off', `--output=${salidaArtefactos}`];
}

/** Ejecuciones registradas por una corrida (sde/ejecuciones), sin continuaciones. */
export function ejecucionesDeCorrida(raiz, corrida) {
  const dir = resolve(raiz, 'test-results', PROYECTO, 'sde', 'ejecuciones');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    try { return JSON.parse(readFileSync(resolve(dir, f), 'utf8')); } catch { return null; }
  }).filter((e) => e && e.corrida_suite === corrida && !e.continuacion_de);
}

/** Lo que imprimió el generador del soporte (líneas «SOPORTE ...»). */
export function resumenSoporte(salida) {
  const texto = String(salida);
  return {
    docx: texto.match(/SOPORTE docx: (.+\.docx)/)?.[1]?.trim() ?? null,
    lineas: texto.split(/\r?\n/).filter((l) => /^SOPORTE |^\s+HU\d+-CP\d+ caso|^\s+ADVERTENCIA:/.test(l)).map((l) => l.trimEnd()),
  };
}

function ejecutarRun(args, env, { capturar = false } = {}) {
  const r = spawnSync(process.execPath, [RUNNER, PROYECTO, ...args], {
    cwd: RAIZ, env, encoding: 'utf8', stdio: capturar ? ['ignore', 'pipe', 'pipe'] : 'inherit', shell: false, maxBuffer: 64 * 1024 * 1024,
  });
  if (capturar) { process.stdout.write(r.stdout ?? ''); }
  return { codigo: r.status ?? 1, salida: r.stdout ?? '', error: r.error };
}

/** Entorno base para el hijo: sin autorizaciones heredadas que no correspondan a esta corrida. */
function entornoLimpio() {
  const env = { ...process.env };
  for (const v of ['SDE_E2E', 'SDE_MAX_CASOS_PENDIENTES', 'BIZAGI_CORRIDA', 'SDE_AUTORIZO_CALIBRACION_POPUP', 'SDE_POPUPS_CASO_CREADO',
    'SDE_SOPORTE_CORRIDA', 'SDE_CONTINUAR_CP', 'SDE_CONTINUAR_CASO', 'SDE_TIPO_EJECUCION', 'CI', 'CAPTURE']) delete env[v];
  return env;
}

function generarWord(hu) {
  const env = { ...entornoLimpio(), SDE_E2E: '0', SDE_SOPORTE_HU: hu }; // el Word nunca habilita Bizagi
  const salida = `test-results/${PROYECTO}/corridas/soporte-${hu}-${marca()}`;
  const r = ejecutarRun(['--grep', '@soporte-hu', '--workers=1', '--retries=0', '--reporter=line', `--output=${salida}`], env, { capturar: true });
  return { ...r, ...resumenSoporte(r.salida) };
}

const marca = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const linea = (t = '') => console.log(t);

function cpsEsperados(hu) {
  const ruta = resolve(RAIZ, 'projects', PROYECTO, 'certificacion', `${hu}.json`);
  if (!existsSync(ruta)) throw new Error(`No existe certificacion/${hu}.json: la HU no tiene soporte configurado.`);
  return JSON.parse(readFileSync(ruta, 'utf8')).casos.map((c) => c.cp);
}

function imprimirSoporte(w) {
  linea('== SOPORTE WORD ==');
  if (w.codigo === 0 && w.docx) {
    linea(`Generado (archivo nuevo; no sobrescribe versiones anteriores): ${w.docx}`);
    linea('Generar el Word NO significa que la HU pasó: revise estados, causas y observaciones de cada CP.');
  } else linea(`NO se pudo generar el Word (código ${w.codigo}). Revise la salida anterior; la evidencia archivada se conserva.`);
}

export async function main(argv = process.argv.slice(2)) {
  const hu = (argv.find((a) => /^HU\d+$/i.test(a)) ?? '').toUpperCase();
  if (!hu) { console.error('Uso: node projects/seguros-del-estado/tools/hu.mjs HU06 [--word | --simular]'); return 2; }
  const soloWord = argv.includes('--word');
  // PowerShell elimina el «--» de «npm run sde:hu06 -- --simular» y npm se queda con la opción (npm_config_simular): sin
  // esta comprobación el orquestador ejecutaría la corrida REAL (incidente del 21/10, casos 784, 786 y 787). Usar
  // «npm run sde:hu06:simular». Cualquier argumento desconocido detiene: nunca se cae en una ejecución real por defecto.
  const simular = argv.includes('--simular') || /^(true|1)$/i.test(process.env.npm_config_simular ?? '');
  const desconocidos = argv.filter((a) => !/^HU\d+$/i.test(a) && !['--word', '--simular'].includes(a));
  const npmDesconocidas = Object.keys(process.env).filter((k) => /^npm_config_(simular|word|dry_run|dryrun|list)$/i.test(k) && k !== 'npm_config_simular');
  if (desconocidos.length || npmDesconocidas.length) {
    console.error(`DETENIDO: opciones no reconocidas (${[...desconocidos, ...npmDesconocidas].join(', ')}). No se ejecuta nada. Use npm run sde:hu06:simular o npm run sde:hu06:word.`);
    return 2;
  }

  if (soloWord) {
    linea(`== ${hu}: regenerar el soporte Word con las últimas ejecuciones (sin Bizagi) ==`);
    const w = generarWord(hu);
    imprimirSoporte(w);
    return w.codigo === 0 && w.docx ? 0 : 1;
  }

  // ---- Preparación (sin tocar Bizagi) ----
  linea(`== ${hu}: preparación de la corrida ==`);
  const esperados = cpsEsperados(hu);
  const envArchivo = resolve(RAIZ, 'projects', PROYECTO, '.env');
  if (!existsSync(envArchivo)) { console.error(`DETENIDO: falta projects/${PROYECTO}/.env (credenciales y datos QA locales).`); return 3; }
  const listaR = spawnSync(process.execPath, [RUNNER, PROYECTO, ...argumentosSuite(hu, `test-results/${PROYECTO}/corridas/lista`), '--list'], { cwd: RAIZ, env: entornoLimpio(), encoding: 'utf8' });
  const seleccion = cpListados(listaR.stdout);
  const coincide = seleccion.length === esperados.length && esperados.every((cp) => seleccion.includes(cp)) && !/@variante/.test(listaR.stdout);
  linea(`CP seleccionados (${seleccion.length}): ${seleccion.join(', ') || '—'}`);
  if (!coincide) { console.error(`DETENIDO: la selección no coincide con los ${esperados.length} CP de ${hu} (${esperados.join(', ')}). No se ejecuta nada.`); return 3; }
  const bloqueo = resolve(RAIZ, 'test-results', PROYECTO, '.ejecucion-real.lock');
  if (existsSync(bloqueo)) { console.error(`DETENIDO: hay otra ejecución real de SDE en curso o un bloqueo sin liberar (${relative(RAIZ, bloqueo)}). No se ejecuta nada.`); return 3; }
  const rutaHistorico = resolve(RAIZ, 'test-results', PROYECTO, 'historico-casos.json');
  const pendientes = contarPendientes(existsSync(rutaHistorico) ? JSON.parse(readFileSync(rutaHistorico, 'utf8')) : []);
  const global = process.env.SDE_MAX_CASOS_PENDIENTES ?? parseEnv(readFileSync(envArchivo)).SDE_MAX_CASOS_PENDIENTES;
  const cupo = limiteCorrida({ pendientes, nuevos: seleccion.length, global });
  if (cupo.error) { console.error(`DETENIDO: ${cupo.error}`); return 3; }
  const corrida = `${hu}-${marca()}`;
  const carpeta = `test-results/${PROYECTO}/corridas/${corrida}`;
  linea(`Cupo de esta corrida: SDE_MAX_CASOS_PENDIENTES=${cupo.limite} (${cupo.motivo}); un caso por CP, sin reintentos.`);
  linea(`Corrida: ${corrida} · artefactos: ${carpeta}`);
  if (simular) { linea('SIMULACIÓN: no se ejecutó nada ni se creó ningún caso.'); return 0; }

  // ---- Ejecución real (solo en el proceso hijo) ----
  linea(`== ${hu}: ejecución contra Bizagi QA (crea hasta ${seleccion.length} casos) ==`);
  mkdirSync(resolve(RAIZ, carpeta), { recursive: true });
  const envE2e = {
    ...entornoLimpio(), SDE_E2E: '1', SDE_MAX_CASOS_PENDIENTES: String(cupo.limite), BIZAGI_CORRIDA: corrida,
    SDE_TIPO_EJECUCION: 'certificacion', SDE_POPUPS_CASO_CREADO: '1', // D-69: pop-ups solo del caso creado por esta misma corrida
    SDE_VEREDICTO_SALIDA: resolve(RAIZ, carpeta, 'veredicto-e2e.json'),
  };
  const e2e = ejecutarRun(argumentosSuite(hu, `${carpeta}/artifacts`), envE2e);
  const registros = ejecucionesDeCorrida(RAIZ, corrida);

  // ---- Soporte Word (siempre que haya evidencia; también con FAIL o parciales) ----
  const w = registros.length ? generarWord(hu) : null;

  // ---- Resumen final: ejecución, resultado funcional y soporte, por separado ----
  linea('');
  linea('== EJECUCIÓN ==');
  linea(`Playwright terminó con código ${e2e.codigo}${e2e.codigo === 0 ? '' : ' (distinto de 0: hay CP con FAIL, BLOCKED o parciales, o un problema de ejecución)'}.`);
  if (e2e.error) linea(`No se pudo iniciar la ejecución: ${e2e.error.message}`);
  linea(`Ejecuciones registradas en la corrida ${corrida}: ${registros.length} de ${seleccion.length}.`);
  const infra = registros.filter((r) => r.bloqueada_antes_de_ejecutar || r.estado_ejecucion !== 'FINALIZADA');
  if (!registros.length) linea('NINGÚN CP llegó a ejecutarse: revise la salida anterior (credenciales, conexión, bloqueo o cupo). No se generó Word.');
  for (const r of infra) linea(`ATENCIÓN ${r.cp}: ${r.estado_ejecucion !== 'FINALIZADA' ? `ejecución ${r.estado_ejecucion}${r.motivo_interrupcion ? ` (${r.motivo_interrupcion})` : ''}` : 'BLOCKED antes de tocar QA (activación, datos, cupo o concurrencia)'}.`);
  linea('');
  linea('== RESULTADO FUNCIONAL DE LA AUTOMATIZACIÓN (no es certificación ni aprobación QA) ==');
  for (const cp of seleccion) {
    const r = registros.find((x) => x.cp === cp);
    if (!r) { linea(`${cp}: sin registro en esta corrida`); continue; }
    const res = Object.entries(r.resumen_pasos ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ');
    linea(`${cp}: caso ${r.numero_caso ?? '—'} · ${r.estado_cp ?? r.estado_ejecucion} · ${res || 'sin pasos'}`);
  }
  linea('');
  if (w) imprimirSoporte(w);
  else { linea('== SOPORTE WORD =='); linea('No se generó: no hay ejecuciones de esta corrida.'); }
  return e2e.codigo !== 0 ? e2e.codigo : (w && w.codigo === 0 && w.docx ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main();
