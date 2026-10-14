import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { serializarAgentManifest } from '../agentManifest';
import { EnvelopeIntakeError, leerEnvelope, salidaConocimiento } from '../intakeAgente';
import { construirModeloAplicacion, extensionDesdeAlmacen, validarAlmacenModelo, type AlmacenModeloAplicacion } from './modeloAplicacion';
import {
  aplicarDecisionesVinculos, plantillaDecisionesVinculos, prepararRevisionVinculos, type ArtefactoRevisionVinculos, type ResultadoVinculos,
} from './vinculos';
import {
  IntakeError, aplicarDecisiones, hashAlmacen, plantillaDecisiones, prepararLoteRevision,
  type ArtefactoRevision, type ResultadoAplicacionLote,
} from './intakeLote';

/**
 * E/S del intake de conocimiento (Fase 4O). La lógica es pura (intakeLote.ts); aquí solo se lee, se bloquea y se
 * escribe de forma SEGURA:
 *  - escritura temporal en el mismo directorio + rename (nunca un archivo truncado);
 *  - candado exclusivo sobre el almacén mientras se aplica (dos aplicaciones concurrentes no se pisan);
 *  - relectura del almacén justo antes de escribir (si cambió desde que se calculó: conflicto, no se escribe);
 *  - --dry-run ejecuta TODAS las validaciones y no escribe nada.
 * Las rutas de los artefactos se registran RELATIVAS a la raíz del repositorio.
 */

export interface RutasConocimiento {
  raiz: string;
  /** knowledge/application-model.json */
  almacen: string;
  /** Directorio de artefactos de revisión (knowledge/review por defecto). */
  revisiones: string;
  /** AFI-AGENT-MANIFEST.json a regenerar tras aplicar (se omite si no se indica). */
  manifest?: string;
}

export function rutasConocimiento(raiz: string, proyecto: string, revisiones?: string): RutasConocimiento {
  const base = join(raiz, 'projects', proyecto);
  return {
    raiz,
    almacen: join(base, 'knowledge', 'application-model.json'),
    revisiones: revisiones ? join(raiz, revisiones) : join(base, 'knowledge', 'review'),
    manifest: join(base, 'data', 'afi', 'AFI-AGENT-MANIFEST.json'),
  };
}

const rel = (r: RutasConocimiento, ruta: string) => relative(r.raiz, ruta).split('\\').join('/');
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

/** Escritura atómica: temporal en el mismo directorio + rename. */
export function escribirAtomico(ruta: string, contenido: string) {
  mkdirSync(dirname(ruta), { recursive: true });
  const temporal = join(dirname(ruta), `.${basename(ruta)}.${process.pid}.tmp`);
  try {
    writeFileSync(temporal, contenido, 'utf8');
    renameSync(temporal, ruta);
  } finally {
    rmSync(temporal, { force: true });
  }
}

/** Un artefacto de revisión ya existente no puede reescribirse con otro contenido (append-only). */
export class ArtefactoRevisionInmutableError extends Error {
  constructor(readonly archivo: string) {
    super(`El artefacto de revisión ${archivo} ya existe con otro contenido: los lotes de revisión son append-only `
      + '(un lote nuevo nunca reemplaza ni borra uno anterior). No se escribió nada.');
    this.name = 'ArtefactoRevisionInmutableError';
  }
}

/**
 * APPEND-ONLY para knowledge/review y knowledge/test-data-review: crea el artefacto si no existe; si ya existe con los MISMOS
 * bytes no hace nada (preparar dos veces lo mismo es idempotente); con otro contenido falla sin escribir.
 */
export function exigirArtefactoNuevo(ruta: string, contenido: string): void {
  if (existsSync(ruta) && readFileSync(ruta, 'utf8') !== contenido) throw new ArtefactoRevisionInmutableError(basename(ruta));
}
export function escribirArtefactoRevision(ruta: string, contenido: string): void {
  exigirArtefactoNuevo(ruta, contenido);
  if (!existsSync(ruta)) escribirAtomico(ruta, contenido);
}

const leerJson = (ruta: string, que: string): unknown => {
  let texto: string;
  try { texto = readFileSync(ruta, 'utf8'); } catch { throw new IntakeError('ENTRADA_INVALIDA', [`no se puede leer ${que}`]); }
  try { return JSON.parse(texto.replace(/^\uFEFF/, '')); } catch { throw new IntakeError('ENTRADA_INVALIDA', [`${que} no es JSON válido`]); }
};

export const leerAlmacen = (r: RutasConocimiento): AlmacenModeloAplicacion => validarAlmacenModelo(leerJson(r.almacen, 'el Application Model') as AlmacenModeloAplicacion);

/**
 * Salida del agente (4Q): el envelope único afi-agent-intake/v1 (JSON, o la respuesta completa .md/.txt con EXACTAMENTE un
 * bloque json). Devuelve SOLO la parte de conocimiento; la salida 4O antigua se acepta temporalmente tal cual.
 */
export function leerSalidaAgente(ruta: string): unknown {
  try {
    return salidaConocimiento(leerEnvelope(ruta));
  } catch (e) {
    if (e instanceof EnvelopeIntakeError) throw new IntakeError('ENTRADA_INVALIDA', e.problemas);
    throw e;
  }
}

export interface ResultadoPreparar { artefacto: ArtefactoRevision; archivoRevision: string; archivoDecisiones: string; plantillaNueva: boolean }

/** PREPARAR: nunca modifica el almacén. Escribe el artefacto (determinista) y, si no existe, la plantilla de decisiones. */
export function prepararEnDisco(r: RutasConocimiento, entrada: string): ResultadoPreparar {
  const almacen = leerAlmacen(r);
  const antes = hashAlmacen(almacen);
  const artefacto = prepararLoteRevision(leerSalidaAgente(entrada), almacen);
  const archivoRevision = join(r.revisiones, `${artefacto.batchId}.review.json`);
  const archivoDecisiones = join(r.revisiones, `${artefacto.batchId}.decisiones.json`);
  escribirArtefactoRevision(archivoRevision, json(artefacto));
  // La plantilla nunca pisa decisiones que un humano ya empezó a escribir.
  const plantillaNueva = !existsSync(archivoDecisiones);
  if (plantillaNueva) escribirAtomico(archivoDecisiones, json(plantillaDecisiones(artefacto)));
  if (hashAlmacen(leerAlmacen(r)) !== antes) throw new IntakeError('REVISION_CONFLICTO', ['el almacén cambió mientras se preparaba el lote']);
  return { artefacto, archivoRevision: rel(r, archivoRevision), archivoDecisiones: rel(r, archivoDecisiones), plantillaNueva };
}

export interface ResultadoAplicarDisco {
  resultado: ResultadoAplicacionLote;
  dryRun: boolean;
  escritos: string[];
  entidadesAplicadas: number;
}

/** Candado exclusivo junto al almacén (se crea con 'wx': falla si otra aplicación lo tiene). */
function conCandado<T>(r: RutasConocimiento, f: () => T): T {
  const candado = `${r.almacen}.lock`;
  let fd: number;
  try { fd = openSync(candado, 'wx'); } catch {
    throw new IntakeError('REVISION_CONFLICTO', ['otra aplicación de conocimiento está en curso (existe el candado del almacén); si no es así, elimina el archivo .lock']);
  }
  try { return f(); } finally { closeSync(fd); rmSync(candado, { force: true }); }
}

/**
 * APLICAR: valida todo; con dryRun no escribe nada. Sin dryRun, bajo candado: almacén (atómico) -> manifest derivado
 * del nuevo modelo -> registro del resultado -> artefacto de seguimiento de las clasificaciones.
 */
export function aplicarEnDisco(r: RutasConocimiento, revision: string, decisiones: string, fecha: string, dryRun: boolean): ResultadoAplicarDisco {
  const ejecutar = (): ResultadoAplicarDisco => {
    const almacen = leerAlmacen(r);
    const resultado = aplicarDecisiones(leerJson(revision, 'el artefacto de revisión'), leerJson(decisiones, 'el archivo de decisiones'), almacen, fecha);
    if (dryRun || resultado.estado === 'YA_APLICADO') return { resultado, dryRun, escritos: [], entidadesAplicadas: 0 };
    const escritos: string[] = [];
    if (resultado.estado === 'APLICABLE') {
      // Concurrencia optimista además del candado: el almacén no puede haber cambiado desde que se leyó.
      if (hashAlmacen(leerAlmacen(r)) !== hashAlmacen(almacen)) throw new IntakeError('REVISION_CONFLICTO', ['el almacén cambió durante la aplicación']);
      validarAlmacenModelo(resultado.almacen);
      escribirAtomico(r.almacen, json(resultado.almacen));
      escritos.push(rel(r, r.almacen));
      if (r.manifest) {
        escribirAtomico(r.manifest, serializarAgentManifest(resultado.modelo));
        escritos.push(rel(r, r.manifest));
      }
    }
    const registro = join(r.revisiones, `${resultado.batchId}.resultado.json`);
    const { almacen: _a, modelo: _m, seguimiento, ...auditable } = resultado;
    escribirAtomico(registro, json({ ...auditable, fecha, ...(seguimiento ? { seguimiento: seguimiento.batchId } : {}) }));
    escritos.push(rel(r, registro));
    if (seguimiento) {
      const archivo = join(r.revisiones, `${seguimiento.batchId}.review.json`);
      escribirArtefactoRevision(archivo, json(seguimiento));
      const plantilla = join(r.revisiones, `${seguimiento.batchId}.decisiones.json`);
      if (!existsSync(plantilla)) escribirAtomico(plantilla, json(plantillaDecisiones(seguimiento)));
      escritos.push(rel(r, archivo), rel(r, plantilla));
    }
    return { resultado, dryRun, escritos, entidadesAplicadas: resultado.entidadesAnadidas.length };
  };
  return dryRun ? ejecutar() : conCandado(r, ejecutar);
}

// ---------- Vínculos de observación (4R.1): misma E/S segura, revisión propia ----------

export interface ResultadoPrepararVinculos { artefacto: ArtefactoRevisionVinculos; archivoRevision: string; archivoDecisiones: string; plantillaNueva: boolean }

/** PREPARAR vínculos: nunca modifica el almacén; artefacto determinista + plantilla de decisiones (todo en null). */
export function prepararVinculosEnDisco(r: RutasConocimiento, entrada: string): ResultadoPrepararVinculos {
  const almacen = leerAlmacen(r);
  const artefacto = prepararRevisionVinculos(leerJson(entrada, 'la propuesta de vínculos'), almacen, construirModeloAplicacion(extensionDesdeAlmacen(almacen)));
  const archivoRevision = join(r.revisiones, `${artefacto.batchId}.review.json`);
  const archivoDecisiones = join(r.revisiones, `${artefacto.batchId}.decisiones.json`);
  escribirArtefactoRevision(archivoRevision, json(artefacto));
  const plantillaNueva = !existsSync(archivoDecisiones);
  if (plantillaNueva) escribirAtomico(archivoDecisiones, json(plantillaDecisionesVinculos(artefacto)));
  return { artefacto, archivoRevision: rel(r, archivoRevision), archivoDecisiones: rel(r, archivoDecisiones), plantillaNueva };
}

/** APLICAR vínculos: valida todo; con dryRun no escribe. Bajo el MISMO candado que el intake de entidades. */
export function aplicarVinculosEnDisco(r: RutasConocimiento, revision: string, decisiones: string, fecha: string, dryRun: boolean): { resultado: ResultadoVinculos; escritos: string[] } {
  const ejecutar = () => {
    const almacen = leerAlmacen(r);
    const modelo = construirModeloAplicacion(extensionDesdeAlmacen(almacen));
    const resultado = aplicarDecisionesVinculos(leerJson(revision, 'el artefacto de revisión de vínculos'), leerJson(decisiones, 'las decisiones de vínculos'), almacen, modelo, fecha);
    if (dryRun || resultado.estado !== 'APLICABLE') return { resultado, escritos: [] };
    if (hashAlmacen(leerAlmacen(r)) !== hashAlmacen(almacen)) throw new IntakeError('REVISION_CONFLICTO', ['el almacén cambió durante la aplicación']);
    escribirAtomico(r.almacen, json(resultado.almacen));
    const registro = join(r.revisiones, `${resultado.batchId}.resultado.json`);
    const { almacen: _a, ...auditable } = resultado;
    escribirAtomico(registro, json({ ...auditable, fecha }));
    return { resultado, escritos: [rel(r, r.almacen), rel(r, registro)] };
  };
  return dryRun ? ejecutar() : conCandado(r, ejecutar);
}
