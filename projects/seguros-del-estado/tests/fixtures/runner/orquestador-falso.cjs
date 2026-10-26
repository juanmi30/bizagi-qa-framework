// FIXTURE (no es una prueba): sustituye a tools/run.mjs en las pruebas del orquestador (SDE_ORQ_RUNNER). Nunca abre
// Playwright ni Bizagi. Registra cada llamada (argumentos y variables relevantes) en FALSO_REGISTRO (una línea JSON).
//  --list        → imprime los CP de FALSO_CPS como lo haría Playwright (FALSO_VARIANTE=1 añade la variante de CP01).
//  @soporte-hu   → imprime las líneas del generador y sale con FALSO_CODIGO_WORD (0 por defecto).
//  resto (E2E)   → escribe un registro de ejecución por CP en SDE_ORQ_RAIZ y sale con FALSO_CODIGO_E2E (1 por defecto).
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(3);
const vars = ['SDE_E2E', 'SDE_MAX_CASOS_PENDIENTES', 'BIZAGI_CORRIDA', 'SDE_POPUPS_CASO_CREADO', 'SDE_AUTORIZO_CALIBRACION_POPUP', 'SDE_SOPORTE_HU', 'SDE_SOPORTE_CORRIDA', 'SDE_TIPO_EJECUCION', 'CI', 'CAPTURE'];
const env = Object.fromEntries(vars.filter((v) => process.env[v] !== undefined).map((v) => [v, process.env[v]]));
fs.appendFileSync(process.env.FALSO_REGISTRO, JSON.stringify({ args, env }) + '\n');
const cps = (process.env.FALSO_CPS || '').split(',').filter(Boolean);
if (args.includes('--list')) {
  for (const cp of cps) console.log(`  [chromium] › sde\\verticales.ts:148:9 › [SDE] ${cp} — sintético @sde @e2e @${cp} @hu06`);
  if (process.env.FALSO_VARIANTE === '1') console.log('  [chromium] › sde\\verticales.ts:148:9 › Variantes › [VARIANTE] HU06-CP01 — sintético @sde @e2e @HU06-CP01 @variante @hu06');
  console.log(`Total: ${cps.length + (process.env.FALSO_VARIANTE === '1' ? 1 : 0)} tests in 1 file`);
  process.exit(0);
}
if (args.includes('@soporte-hu')) {
  console.log('SOPORTE HU06: 5 CP, 80/108 PASS');
  console.log('  HU06-CP01 caso 900: {"FAIL":1,"PASS":28} · capturas 29/29 · origen archivada u0');
  console.log('SOPORTE docx: test-results/seguros-del-estado/soportes/HU06/sintetico/HU06.docx');
  process.exit(Number(process.env.FALSO_CODIGO_WORD || 0));
}
const dir = path.resolve(process.env.SDE_ORQ_RAIZ, 'test-results', 'seguros-del-estado', 'sde', 'ejecuciones');
fs.mkdirSync(dir, { recursive: true });
cps.forEach((cp, i) => fs.writeFileSync(path.resolve(dir, `${cp}_u${i}.json`), JSON.stringify({
  formato: 1, hu: 'HU06', cp, unico: `u${i}`, corrida_suite: process.env.BIZAGI_CORRIDA, inicio: new Date().toISOString(), fin: new Date().toISOString(),
  estado_ejecucion: 'FINALIZADA', numero_caso: String(900 + i), estado_cp: i === 0 ? 'FAIL' : 'REAL_PASS_PARCIAL', resumen_pasos: i === 0 ? { FAIL: 1, PASS: 28 } : { PASS: 9 },
  bloqueada_antes_de_ejecutar: false, reporte: null, capturas: '', evidencias_adicionales: [],
})));
process.exit(Number(process.env.FALSO_CODIGO_E2E ?? 1));
