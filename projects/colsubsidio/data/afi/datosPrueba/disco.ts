import { closeSync, existsSync, openSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { serializarAgentManifest } from '../agentManifest';
import { escribirArtefactoRevision, escribirAtomico, exigirArtefactoNuevo } from '../aplicacion/intakeDisco';
import { EnvelopeIntakeError, leerEnvelope, salidaDatosPrueba } from '../intakeAgente';
import { DatosPruebaError } from './contrato';
import {
  aplicarDecisionesDatos, hashRegistro, plantillaDecisionesDatos, recibirRequisitosDelAgente,
  type LoteDatosPrueba, type ResultadoAplicacionDatos,
} from './intake';
import { confirmarProvision, validarRegistroDatosPrueba, type RegistroDatosPrueba, type ResultadoProvision } from './registro';
import { revisionDatosMd } from './revisionMd';

/**
 * E/S del intake de DATOS DE PRUEBA (Fase 4Q). La lógica es pura (intake.ts / registro.ts); aquí solo se lee, se bloquea y
 * se escribe de forma segura, con las mismas garantías que el intake de conocimiento (4O):
 *  - escritura temporal + rename; candado exclusivo sobre el registro; relectura antes de escribir (conflicto si cambió);
 *  - --dry-run ejecuta TODAS las validaciones y no escribe nada;
 *  - nunca se lee ni escribe el .env: solo la PRESENCIA de variables del entorno del proceso (provisionado).
 * Rutas registradas RELATIVAS a la raíz del repositorio.
 */

export interface RutasDatos {
  raiz: string;
  /** knowledge/test-data-registry.json */
  registro: string;
  /** knowledge/test-data-review */
  revisiones: string;
  /** AFI-AGENT-MANIFEST.json a regenerar tras aplicar (se omite si no se indica). */
  manifest?: string;
}

export function rutasDatos(raiz: string, proyecto: string): RutasDatos {
  const base = join(raiz, 'projects', proyecto);
  return {
    raiz,
    registro: join(base, 'knowledge', 'test-data-registry.json'),
    revisiones: join(base, 'knowledge', 'test-data-review'),
    manifest: join(base, 'data', 'afi', 'AFI-AGENT-MANIFEST.json'),
  };
}

const rel = (r: RutasDatos, ruta: string) => relative(r.raiz, ruta).split('\\').join('/');
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const fallo = (detalle: string) => new DatosPruebaError('ENTRADA_INVALIDA', [{ motivo: 'ESQUEMA', detalle }]);

function leerJson(ruta: string, que: string): unknown {
  let texto: string;
  try { texto = readFileSync(ruta, 'utf8'); } catch { throw fallo(`no se puede leer ${que}`); }
  try { return JSON.parse(texto.replace(/^\uFEFF/, '')); } catch { throw fallo(`${que} no es JSON válido`); }
}

export const leerRegistro = (r: RutasDatos): RegistroDatosPrueba => validarRegistroDatosPrueba(leerJson(r.registro, 'el Test Data Registry'));

function conCandado<T>(r: RutasDatos, f: () => T): T {
  const candado = `${r.registro}.lock`;
  let fd: number;
  try { fd = openSync(candado, 'wx'); } catch {
    throw new DatosPruebaError('REVISION_CONFLICTO', [{ motivo: 'ESQUEMA', detalle: 'otra operación sobre el Test Data Registry está en curso (existe su .lock); si no es así, elimine el archivo .lock' }]);
  }
  try { return f(); } finally { closeSync(fd); rmSync(candado, { force: true }); }
}

function escribirRegistro(r: RutasDatos, antes: RegistroDatosPrueba, nuevo: RegistroDatosPrueba): string[] {
  // Concurrencia optimista además del candado: el registro no puede haber cambiado desde que se leyó.
  if (hashRegistro(leerRegistro(r)) !== hashRegistro(antes)) {
    throw new DatosPruebaError('REVISION_CONFLICTO', [{ motivo: 'ESQUEMA', detalle: 'el Test Data Registry cambió durante la operación' }]);
  }
  validarRegistroDatosPrueba(JSON.parse(JSON.stringify(nuevo)));
  escribirAtomico(r.registro, json(nuevo));
  const escritos = [rel(r, r.registro)];
  if (r.manifest) {
    escribirAtomico(r.manifest, serializarAgentManifest(undefined, nuevo));
    escritos.push(rel(r, r.manifest));
  }
  return escritos;
}

// ---------- D/E. Preparar ----------

export interface ResultadoPrepararDatos {
  lote: LoteDatosPrueba; archivoRevision: string; archivoDecisiones: string; archivoMd: string; plantillaNueva: boolean;
}

/** PREPARAR: nunca modifica el registro. Escribe el lote (determinista), su versión legible y, si no existe, la plantilla de decisiones. */
export function prepararDatosEnDisco(r: RutasDatos, entrada: string, proyecto?: string): ResultadoPrepararDatos {
  let salida: { testDataRequirements: unknown[] };
  try { salida = salidaDatosPrueba(leerEnvelope(entrada)); } catch (e) {
    if (e instanceof EnvelopeIntakeError) throw new DatosPruebaError('ENTRADA_INVALIDA', e.problemas.map(detalle => ({ motivo: 'ESQUEMA' as const, detalle })));
    throw e;
  }
  const registro = leerRegistro(r);
  const antes = hashRegistro(registro);
  const lote = recibirRequisitosDelAgente(salida, registro);
  const md = revisionDatosMd(lote, proyecto, registro);
  const archivoRevision = join(r.revisiones, `${lote.batchId}.review.json`);
  const archivoMd = join(r.revisiones, `${lote.batchId}.review.md`);
  const archivoDecisiones = join(r.revisiones, `${lote.batchId}.decisiones.json`);
  // Append-only: se comprueban AMBOS antes de escribir nada (un lote nuevo nunca reemplaza ni borra uno anterior).
  exigirArtefactoNuevo(archivoRevision, json(lote));
  exigirArtefactoNuevo(archivoMd, md);
  escribirArtefactoRevision(archivoRevision, json(lote));
  escribirArtefactoRevision(archivoMd, md);
  // La plantilla nunca pisa decisiones que un humano ya empezó a escribir.
  const plantillaNueva = !existsSync(archivoDecisiones);
  if (plantillaNueva) escribirAtomico(archivoDecisiones, json(plantillaDecisionesDatos(lote)));
  if (hashRegistro(leerRegistro(r)) !== antes) throw new DatosPruebaError('REVISION_CONFLICTO', [{ motivo: 'ESQUEMA', detalle: 'el registro cambió mientras se preparaba el lote' }]);
  return { lote, archivoRevision: rel(r, archivoRevision), archivoDecisiones: rel(r, archivoDecisiones), archivoMd: rel(r, archivoMd), plantillaNueva };
}

// ---------- G. Aplicar ----------

export interface ResultadoAplicarDatosDisco { resultado: ResultadoAplicacionDatos; dryRun: boolean; escritos: string[] }

/** APLICAR: todo o nada; con dryRun no escribe. Registro (atómico) -> manifest -> resultado auditable (sin valores). */
export function aplicarDatosEnDisco(r: RutasDatos, revision: string, decisiones: string, fecha: string, dryRun: boolean): ResultadoAplicarDatosDisco {
  const ejecutar = (): ResultadoAplicarDatosDisco => {
    const registro = leerRegistro(r);
    const resultado = aplicarDecisionesDatos(leerJson(revision, 'el lote de revisión'), leerJson(decisiones, 'el archivo de decisiones'), registro, fecha);
    if (dryRun || resultado.estado === 'YA_APLICADO') return { resultado, dryRun, escritos: [] };
    const escritos = resultado.estado === 'APLICABLE' ? escribirRegistro(r, registro, resultado.registro) : [];
    const { registro: _r, ...auditable } = resultado;
    const archivo = join(r.revisiones, `${resultado.batchId}.resultado.json`);
    escribirAtomico(archivo, json({ ...auditable, fecha }));
    escritos.push(rel(r, archivo));
    return { resultado, dryRun, escritos };
  };
  return dryRun ? ejecutar() : conCandado(r, ejecutar);
}

// ---------- H. Confirmación de provisión ----------

export interface ResultadoProvisionDisco { resultado: ResultadoProvision; dryRun: boolean; escritos: string[] }

/** PROVISIONADO: verifica PRESENCIA de los secretos en el entorno del proceso; cambia solo metadata + historial. */
export function provisionEnDisco(r: RutasDatos, actorRef: string, revisor: string, fecha: string, entorno: Readonly<Record<string, string | undefined>>, dryRun: boolean): ResultadoProvisionDisco {
  const ejecutar = (): ResultadoProvisionDisco => {
    const registro = leerRegistro(r);
    const resultado = confirmarProvision(registro, actorRef, revisor, fecha, entorno);
    if (dryRun || resultado.estado === 'YA_PROVISIONADO') return { resultado, dryRun, escritos: [] };
    return { resultado, dryRun, escritos: escribirRegistro(r, registro, resultado.registro) };
  };
  return dryRun ? ejecutar() : conCandado(r, ejecutar);
}
