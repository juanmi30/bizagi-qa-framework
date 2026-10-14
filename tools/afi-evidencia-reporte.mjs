#!/usr/bin/env node
// Verificación LOCAL del HTML report con evidencias AFI (Fase 4G). Sin Portal ni datos reales.
//   node tools/afi-evidencia-reporte.mjs [proyecto]      (por defecto colsubsidio)
//
// Ejecuta tests/afi-evidencia-reporte.spec.ts (DOM ficticio + runner real) con el reporter HTML en
// test-results/<proyecto>/evidencia-afi-reporte/, decodifica el reporte y comprueba sus adjuntos:
// screenshots image/png asociados a su paso, manifest application/json, adjuntos técnicos sin duplicar
// y que cada archivo referenciado exista en data/ con el formato correcto. Sale con 1 si algo falla.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const proyecto = process.argv[2] ?? 'colsubsidio';
const SPEC = 'afi-evidencia-reporte.spec.ts';
if (!existsSync(resolve('projects', proyecto, 'tests', SPEC))) {
  console.error(`El proyecto "${proyecto}" no tiene tests/${SPEC}.`);
  process.exit(2);
}
// Rutas RELATIVAS al repositorio: con shell en Windows una ruta absoluta con espacios se partiría en dos argumentos.
const base = join('test-results', proyecto, 'evidencia-afi-reporte');
// Playwright limpia por sí mismo --output y la carpeta del reporte HTML en cada corrida.
const html = join(base, 'html');

const corrida = spawnSync('npx', ['playwright', 'test', SPEC, '--workers=1', '--retries=0', '--reporter=html', `--output=${join(base, 'artefactos')}`], {
  stdio: 'inherit', encoding: 'utf8', shell: process.platform === 'win32',
  env: { ...process.env, PROJECT: proyecto, AFI_EVIDENCE_REPORT_DEMO: '1', PLAYWRIGHT_HTML_OUTPUT_DIR: html, PLAYWRIGHT_HTML_OPEN: 'never' },
});
if (corrida.status !== 0) {
  console.error(`La corrida controlada falló (exit ${corrida.status}).`);
  process.exit(1);
}

/** Lector ZIP mínimo (directorio central + deflate): el reporte embebe sus datos como zip en base64. */
function leerZip(buffer) {
  let fin = buffer.length - 22;
  while (fin >= 0 && buffer.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('ZIP sin directorio central');
  const total = buffer.readUInt16LE(fin + 10);
  let p = buffer.readUInt32LE(fin + 16);
  const archivos = {};
  for (let i = 0; i < total; i++) {
    const metodo = buffer.readUInt16LE(p + 10), comprimido = buffer.readUInt32LE(p + 20);
    const largoNombre = buffer.readUInt16LE(p + 28), extra = buffer.readUInt16LE(p + 30), comentario = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const nombre = buffer.subarray(p + 46, p + 46 + largoNombre).toString('utf8');
    const inicio = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const datos = buffer.subarray(inicio, inicio + comprimido);
    archivos[nombre] = metodo === 8 ? inflateRawSync(datos) : datos;
    p += 46 + largoNombre + extra + comentario;
  }
  return archivos;
}

const errores = [];
const exigir = (condicion, mensaje) => { if (!condicion) errores.push(mensaje); };
const indice = readFileSync(join(html, 'index.html'), 'utf8');
const embebido = indice.match(/<template id="playwrightReportBase64">data:application\/zip;base64,([^<]+)/);
if (!embebido) {
  console.error('El reporte HTML no contiene datos embebidos reconocibles.');
  process.exit(1);
}
const zip = leerZip(Buffer.from(embebido[1], 'base64'));
const pruebas = Object.entries(zip).filter(([n]) => n.endsWith('.json') && n !== 'report.json')
  .flatMap(([, b]) => JSON.parse(b.toString('utf8')).tests ?? []);
const prueba = pruebas.find(t => /CP99 ficticio/.test(t.title));
exigir(prueba, 'El reporte no contiene la prueba controlada.');
const resultado = prueba?.results?.[0];
exigir(resultado?.status === 'passed', `La prueba controlada debe pasar (estado ${resultado?.status}).`);
const adjuntos = resultado?.attachments ?? [];

// Pasos del reporte que contienen cada adjunto (índices).
const pasoDe = new Map();
const recorrer = (pasos, ancestros) => {
  for (const s of pasos ?? []) {
    const cadena = [...ancestros, s.title];
    for (const i of s.attachments ?? []) pasoDe.set(i, cadena);
    recorrer(s.steps, cadena);
  }
};
recorrer(resultado?.steps, []);

const leer = a => readFileSync(join(html, a.path));
const nombres = adjuntos.map(a => a.name);
const duplicados = [...new Set(nombres.filter((n, i) => nombres.indexOf(n) !== i))];
exigir(!duplicados.length, `Adjuntos duplicados: ${duplicados.join(', ')}`);

const imagenes = adjuntos.map((a, i) => ({ ...a, i })).filter(a => a.contentType === 'image/png' && /^CP99-P\d+-\d{2}-/.test(a.name));
exigir(imagenes.length >= 1, 'Se esperaba al menos un screenshot cliente image/png.');
for (const a of imagenes) {
  exigir(a.path && existsSync(join(html, a.path)), `${a.name}: falta el archivo en el reporte.`);
  if (a.path && existsSync(join(html, a.path))) exigir(leer(a).subarray(1, 4).toString() === 'PNG', `${a.name}: no es un PNG.`);
  exigir(a.path?.endsWith('.png'), `${a.name}: el reporte no lo sirve como .png (sin miniatura).`);
  const paso = a.name.split('-')[1];
  exigir((pasoDe.get(a.i) ?? []).some(t => t.startsWith(`${paso}:`)), `${a.name}: no está dentro del step de ${paso}.`);
}

const manifiesto = adjuntos.find(a => a.name === 'CP99-evidencias.json');
exigir(manifiesto?.contentType === 'application/json', 'Falta el manifest CP99-evidencias.json application/json.');
if (manifiesto?.path) {
  const m = JSON.parse(leer(manifiesto).toString('utf8'));
  exigir(m.resultado === 'PASS' && m.evidencia?.estado === 'completa', 'El manifest debe reflejar PASS con evidencia completa.');
  for (const e of m.evidencias ?? []) exigir(imagenes.some(a => a.name === e.archivo), `Manifest: ${e.archivo} no está adjunto en el reporte.`);
  exigir(!/[A-Za-z]:[\\/]|\/(Users|home|tmp)\//.test(JSON.stringify(m)), 'El manifest contiene rutas absolutas.');
}
for (const tecnico of ['CP99-traza-tecnica.json', 'CP99-resultado.json']) {
  const a = adjuntos.filter(x => x.name === tecnico);
  exigir(a.length === 1 && a[0].contentType === 'application/json', `${tecnico}: se esperaba exactamente un adjunto application/json.`);
}

console.log(`\nReporte: ${join('test-results', proyecto, 'evidencia-afi-reporte', 'html', 'index.html')}`);
console.log(`Adjuntos: ${adjuntos.length} (${imagenes.length} screenshot(s) cliente, manifest ${manifiesto ? 'sí' : 'no'})`);
for (const a of imagenes) console.log(`  ${a.name}  ${a.contentType}  ->  step "${(pasoDe.get(a.i) ?? []).find(t => /^P\d+:/.test(t)) ?? '(sin step de paso)'}"`);
if (errores.length) {
  console.error(`\nFALLÓ la verificación del reporte:\n${errores.map(e => `- ${e}`).join('\n')}`);
  process.exit(1);
}
console.log('OK: el HTML report contiene screenshots, manifest y adjuntos técnicos correctos.');
