import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { leerDisenoCasoQa } from './disenoQa';
import { dimensionesPng, renderizarSoporteDocx } from './docx';
import { construirPlanSoporte, validarMetaSoporte, type ImagenPaquete, type ManifiestoEntrada, type ResultadoEntrada, type SoporteCertificacionAfi } from './plan';

/**
 * Orquestación de E/S del soporte (Fase 4H). Todas las rutas se resuelven desde la RAÍZ del repositorio
 * (nunca desde el cwd) y deben quedar dentro de ella; la salida va siempre a
 * test-results/<proyecto>/soportes/<caso>/<corrida>/. No abre navegador ni vuelve a capturar el Portal.
 */

export interface OpcionesSoporteAfi {
  /** Raíz absoluta del repositorio. */
  raiz: string;
  proyecto: string;
  caso: string;
  /** Rutas relativas a la raíz (o absolutas dentro de ella). */
  meta: string;
  evidencias: string;
  diseno?: string;
  template?: string;
}

export interface ResultadoSoporteAfi {
  plan: SoporteCertificacionAfi;
  /** Rutas RELATIVAS a la raíz, con '/'. */
  salida: string;
  planArchivo: string;
  docx?: string;
}

export class RutaSoporteError extends Error {
  constructor(detalle: string) { super(detalle); this.name = 'RutaSoporteError'; }
}

const aPosix = (ruta: string) => ruta.split(sep).join('/');
const sha256 = (datos: Buffer) => createHash('sha256').update(datos).digest('hex');

/** Resuelve una ruta del usuario contra la raíz y exige que quede dentro del repositorio. */
export function rutaEnRepositorio(raiz: string, ruta: string, que: string): string {
  const absoluta = isAbsolute(ruta) ? resolve(ruta) : resolve(raiz, ruta);
  const rel = relative(raiz, absoluta);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new RutaSoporteError(`${que} debe estar dentro del repositorio: ${aPosix(ruta)}`);
  return absoluta;
}

export async function generarSoporteAfi(o: OpcionesSoporteAfi): Promise<ResultadoSoporteAfi> {
  if (!/^[\w-]+$/.test(o.proyecto) || !/^[\w-]+$/.test(o.caso)) throw new RutaSoporteError('proyecto y caso deben ser identificadores simples.');
  const raiz = resolve(o.raiz);
  const rutaMeta = rutaEnRepositorio(raiz, o.meta, 'La metadata');
  const meta = validarMetaSoporte(JSON.parse(await readFile(rutaMeta, 'utf8')));
  const conf = meta.casos[o.caso];
  const rutaDiseno = rutaEnRepositorio(raiz, o.diseno ?? meta.diseno, 'El diseño QA');
  const rutaTemplate = rutaEnRepositorio(raiz, o.template ?? meta.template, 'La plantilla');
  const rutaEvidencias = rutaEnRepositorio(raiz, o.evidencias, 'El paquete de evidencias');
  if (!existsSync(rutaEvidencias) || !statSync(rutaEvidencias).isDirectory()) throw new RutaSoporteError(`No existe el paquete de evidencias: ${aPosix(o.evidencias)}`);

  for (const archivo of [`${o.caso}-evidencias.json`, `${o.caso}-resultado.json`]) {
    if (!existsSync(join(rutaEvidencias, archivo))) {
      throw new RutaSoporteError(`El paquete ${aPosix(relative(raiz, rutaEvidencias))} no contiene ${archivo} (¿paquete de otro caso?).`);
    }
  }
  if (!existsSync(rutaDiseno)) throw new RutaSoporteError(`No existe el diseño QA: ${aPosix(relative(raiz, rutaDiseno))}`);
  if (!existsSync(rutaTemplate)) throw new RutaSoporteError(`No existe la plantilla: ${aPosix(relative(raiz, rutaTemplate))}`);
  const libro = await readFile(rutaDiseno);
  const diseno = leerDisenoCasoQa(libro, conf?.hoja ?? o.caso);
  const manifiesto = JSON.parse(await readFile(join(rutaEvidencias, `${o.caso}-evidencias.json`), 'utf8')) as ManifiestoEntrada;
  const resultado = JSON.parse(await readFile(join(rutaEvidencias, `${o.caso}-resultado.json`), 'utf8')) as ResultadoEntrada;

  // Imágenes del paquete: nombre simple, existe y es PNG. Lo que falte lo reporta el plan (fail-closed por paso).
  const imagenes = new Map<string, ImagenPaquete>();
  const bytes = new Map<string, Buffer>();
  for (const ev of manifiesto.evidencias ?? []) {
    if (!/^[\w.-]+\.png$/.test(ev.archivo) || imagenes.has(ev.archivo)) continue;
    const ruta = join(rutaEvidencias, ev.archivo);
    if (!existsSync(ruta)) continue;
    const datos = await readFile(ruta);
    try {
      const { ancho, alto } = dimensionesPng(datos);
      imagenes.set(ev.archivo, { sha256: sha256(datos), ancho, alto });
      bytes.set(ev.archivo, datos);
    } catch { /* no es PNG: queda como imagen faltante */ }
  }

  const paquete = basename(rutaEvidencias);
  const plan = construirPlanSoporte({
    proyecto: o.proyecto, caso: o.caso, meta, diseno,
    fuenteDiseno: { archivo: basename(rutaDiseno), hoja: diseno.hoja, sha256: sha256(libro) },
    manifiesto, resultado, imagenes, paquete,
  });

  const salida = join(raiz, 'test-results', o.proyecto, 'soportes', o.caso, paquete);
  await mkdir(salida, { recursive: true });
  const planArchivo = join(salida, `${o.caso}-soporte-plan.json`);
  await writeFile(planArchivo, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  const docxRuta = join(salida, `${o.caso}-Soportes-Certificacion-Cliente.docx`);
  let docx: string | undefined;
  if (plan.estado === 'GENERABLE') {
    const seleccionadas = new Map(plan.pasos.flatMap(p => p.ordenDocumento).map(a => [a, bytes.get(a)!]));
    const logo = await readFile(join(dirname(rutaMeta), meta.logoCliente));
    await writeFile(docxRuta, renderizarSoporteDocx(plan, { template: await readFile(rutaTemplate), logoCliente: logo, imagenes: seleccionadas }));
    docx = aPosix(relative(raiz, docxRuta));
  } else {
    // Un documento de una generación anterior de esta corrida no puede quedar como si siguiera vigente.
    await rm(docxRuta, { force: true });
  }
  return { plan, salida: aPosix(relative(raiz, salida)), planArchivo: aPosix(relative(raiz, planArchivo)), ...(docx ? { docx } : {}) };
}
