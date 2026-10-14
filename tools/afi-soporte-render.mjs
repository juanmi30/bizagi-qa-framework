#!/usr/bin/env node
// Finalización y render VISUAL del soporte DOCX (Fase 4H / 4H.1). Nunca genera el documento.
//   node tools/afi-soporte-render.mjs <ruta.docx|ruta.pdf> [--actualizar [--sobrescribir]] [--soffice <ruta a soffice>]
//
// Estados del documento:
//   - DOCX GENERADO (tools/afi-soporte.mjs): válido y actualizable. El índice (TOC) está marcado para actualizarse:
//     Word lo actualiza al abrir (pregunta por los campos); sus números de página son provisionales hasta entonces.
//   - DOCX FINALIZADO: campos e índice ya actualizados. Con --actualizar, LibreOffice headless abre el documento,
//     actualiza índices y campos y guarda una COPIA <nombre>-finalizado.docx. El original no se toca salvo --sobrescribir.
//     (LibreOffice reescribe el paquete OOXML: revisar la copia; Word sigue siendo el finalizador preferido.)
// Render: DOCX -> PDF con LibreOffice headless; PDF -> un PNG por página con pdf.js (dependencia existente) en el
// Chromium de Playwright. Salida en <carpeta>/render/. LibreOffice NO es necesario para generar el DOCX.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USO = 'Uso: node tools/afi-soporte-render.mjs <ruta.docx|ruta.pdf> [--actualizar [--sobrescribir]] [--soffice <ruta>]';

function salir(mensaje, codigo) {
  console.error(mensaje);
  process.exit(codigo);
}

const args = process.argv.slice(2);
const bandera = nombre => { const k = args.indexOf(nombre); if (k < 0) return false; args.splice(k, 1); return true; };
const iSoffice = args.indexOf('--soffice');
const sofficeArg = iSoffice >= 0 ? args.splice(iSoffice, 2)[1] : undefined;
const actualizar = bandera('--actualizar');
const sobrescribir = bandera('--sobrescribir');
const [entrada, ...sobrantes] = args;
if (!entrada || sobrantes.length) salir(USO, 2);
if (iSoffice >= 0 && !sofficeArg) salir(`Falta la ruta de --soffice.\n${USO}`, 2);
if (sobrescribir && !actualizar) salir(`--sobrescribir solo aplica con --actualizar.\n${USO}`, 2);
const archivo = resolve(RAIZ, entrada);
if (relative(RAIZ, archivo).startsWith('..') || !existsSync(archivo)) salir(`No existe (o está fuera del repositorio): ${entrada}`, 2);
const esDocx = extname(archivo).toLowerCase() === '.docx';
if (actualizar && !esDocx) salir('--actualizar requiere un .docx.', 2);

/** soffice: la ruta indicada (si no existe, error: nunca otra instalación en silencio), SOFFICE o rutas habituales. */
function buscarSoffice() {
  if (sofficeArg) return existsSync(sofficeArg) ? sofficeArg : undefined;
  const candidatos = [process.env.SOFFICE, 'C:/Program Files/LibreOffice/program/soffice.exe', 'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice', '/usr/bin/soffice', '/usr/local/bin/soffice'].filter(Boolean);
  const fijo = candidatos.find(c => existsSync(c));
  if (fijo) return fijo;
  return spawnSync('soffice', ['--version'], { shell: process.platform === 'win32' }).status === 0 ? 'soffice' : undefined;
}

let soffice;
if (esDocx) {
  soffice = buscarSoffice();
  if (!soffice) {
    salir(`LibreOffice no está disponible${sofficeArg ? ` en "${sofficeArg}"` : ''}: ${actualizar ? 'no se finaliza el documento' : 'no se renderiza'}. `
      + 'El DOCX no se modificó. Instala LibreOffice o indica --soffice <ruta a soffice>. '
      + '(El DOCX generado sigue siendo válido: Word actualiza el índice al abrirlo.)', 3);
  }
}

// Actualización de índices y campos vía UNO (Python de LibreOffice), sobre una COPIA.
const UNO = String.raw`
import os, subprocess, sys, tempfile, time, uno
from com.sun.star.beans import PropertyValue
soffice, origen, destino = sys.argv[1:4]
def prop(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p
perfil = tempfile.mkdtemp(prefix='afi-lo-')
tubo = 'afi' + str(os.getpid())
proc = subprocess.Popen([soffice, '--headless', '--invisible', '--norestore', '--nologo', '--nodefault',
    '-env:UserInstallation=' + uno.systemPathToFileUrl(perfil), '--accept=pipe,name=' + tubo + ';urp;'])
try:
    local = uno.getComponentContext()
    resolutor = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
    ctx = None
    for _ in range(60):
        try:
            ctx = resolutor.resolve('uno:pipe,name=' + tubo + ';urp;StarOffice.ComponentContext'); break
        except Exception:
            time.sleep(1)
    if ctx is None: sys.exit('No se pudo conectar con LibreOffice.')
    escritorio = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
    doc = escritorio.loadComponentFromURL(uno.systemPathToFileUrl(origen), '_blank', 0, (prop('Hidden', True),))
    indices = doc.getDocumentIndexes()
    for i in range(indices.getCount()):
        indices.getByIndex(i).update()
    doc.getTextFields().refresh()
    doc.storeToURL(uno.systemPathToFileUrl(destino), (prop('FilterName', 'MS Word 2007 XML'), prop('Overwrite', True)))
    doc.close(True)
    print('indices=' + str(indices.getCount()))
    try: escritorio.terminate()
    except Exception: pass
finally:
    try: proc.wait(timeout=30)
    except Exception: proc.kill()
`;

let aRenderizar = archivo;
if (actualizar) {
  const programa = dirname(soffice === 'soffice' ? '' : soffice);
  const python = [join(programa, 'python.exe'), join(programa, 'python'), join(programa, '..', 'Resources', 'python')].find(p => programa && existsSync(p)) ?? 'python3';
  const temporal = mkdtempSync(join(tmpdir(), 'afi-finalizar-'));
  const script = join(temporal, 'actualizar.py');
  writeFileSync(script, UNO, 'utf8');
  const finalizado = join(dirname(archivo), `${basename(archivo, '.docx')}-finalizado.docx`);
  const r = spawnSync(python, [script, soffice, archivo, finalizado], { stdio: 'inherit' });
  rmSync(temporal, { recursive: true, force: true });
  if (r.status !== 0 || !existsSync(finalizado)) salir('No se pudo finalizar el documento (LibreOffice/UNO). El DOCX original no se modificó.', 1);
  if (sobrescribir) copyFileSync(finalizado, archivo);
  console.log(`DOCX finalizado: ${relative(RAIZ, sobrescribir ? archivo : finalizado).split('\\').join('/')}${sobrescribir ? ' (original sobrescrito por --sobrescribir)' : ''}`);
  aRenderizar = finalizado;
}

const destino = join(dirname(archivo), 'render');
mkdirSync(destino, { recursive: true });
let pdf = aRenderizar;
if (esDocx) {
  // Sin shell: los argumentos con espacios llegan intactos.
  const r = spawnSync(soffice, ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', destino, aRenderizar], { stdio: 'inherit', shell: soffice === 'soffice' && process.platform === 'win32' });
  pdf = join(destino, `${basename(aRenderizar, extname(aRenderizar))}.pdf`);
  if (r.status !== 0 || !existsSync(pdf)) salir('LibreOffice no produjo el PDF.', 1);
}

// PDF -> PNG: pdf.js servido por rutas interceptadas (sin servidor ni red).
const { chromium } = await import('@playwright/test');
const PDFJS = join(RAIZ, 'node_modules', 'pdfjs-dist', 'build');
const navegador = await chromium.launch();
try {
  const page = await navegador.newPage();
  await page.route('http://render.afi/**', ruta => {
    const nombre = new URL(ruta.request().url()).pathname.slice(1);
    if (nombre === 'documento.pdf') return ruta.fulfill({ body: readFileSync(pdf), contentType: 'application/pdf' });
    if (nombre === 'index.html') return ruta.fulfill({ body: '<!doctype html><body></body>', contentType: 'text/html' });
    return ruta.fulfill({ body: readFileSync(join(PDFJS, basename(nombre))), contentType: 'text/javascript' });
  });
  await page.goto('http://render.afi/index.html');
  const paginas = await page.evaluate(async () => {
    const pdfjs = await import('http://render.afi/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'http://render.afi/pdf.worker.mjs';
    const doc = await pdfjs.getDocument({ url: 'http://render.afi/documento.pdf' }).promise;
    const salida = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const vista = pagina.getViewport({ scale: 1.5 });
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.ceil(vista.width); lienzo.height = Math.ceil(vista.height);
      await pagina.render({ canvasContext: lienzo.getContext('2d'), canvas: lienzo, viewport: vista }).promise;
      salida.push(lienzo.toDataURL('image/png'));
    }
    return salida;
  });
  const prefijo = basename(pdf, '.pdf');
  paginas.forEach((uri, k) => writeFileSync(join(destino, `${prefijo}-pagina-${String(k + 1).padStart(2, '0')}.png`), Buffer.from(uri.split(',')[1], 'base64')));
  console.log(`${paginas.length} página(s) renderizadas en ${relative(RAIZ, destino).split('\\').join('/')}/${prefijo}-pagina-NN.png`);
} finally {
  await navegador.close();
}
