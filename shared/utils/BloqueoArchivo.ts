import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { dirname } from 'node:path';

/**
 * Bloqueo EXCLUSIVO entre procesos de un MISMO equipo (dos terminales, varios workers de Playwright, un script y una
 * prueba). NO coordina equipos distintos contra el mismo ambiente QA: cada equipo tiene su propio test-results/.
 * Una carpeta compartida entre equipos tampoco se recupera sola (ver "Recuperación").
 *
 * Adquisición (atómica y exclusiva, también en Windows/NTFS):
 *  1. Los metadatos COMPLETOS (pid, equipo, inicio, descripción y un token único) se escriben en un temporal propio.
 *  2. `link(temporal → ruta)` publica el bloqueo: el enlace duro se crea de una vez o falla con EEXIST. El archivo de
 *     bloqueo nunca existe vacío ni a medio escribir (el defecto anterior: open "wx" + write dejaba un instante con el
 *     archivo vacío; otro proceso lo leía como huérfano, lo borraba y había dos dueños).
 *
 * Recuperación automática SOLO de un huérfano demostrable: metadatos válidos, mismo equipo y pid que ya no existe.
 *  - Metadatos ilegibles o incompletos, otro equipo, pid vivo o un bloqueo solo "antiguo" → NO se borra nunca
 *    (fallo cerrado): `adquirirBloqueo` espera y, si no se libera, lanza BloqueoOcupadoError con el diagnóstico.
 *  - Dos procesos que recuperan a la vez se excluyen con un segundo bloqueo (`<ruta>.recuperacion`, mismo mecanismo).
 *    Bajo él se relee el bloqueo y solo se borra si sigue siendo el MISMO (mismo token) y su dueño sigue muerto. Un dueño
 *    muerto no puede liberar ni volver a tomarlo, así que nadie más lo modifica entre la relectura y el borrado.
 *  - `<ruta>.recuperacion` nunca se recupera solo: si su dueño murió a mitad de una recuperación, queda fallo cerrado.
 *  - Recuperación manual: docs/orquestacion/RECUPERACION-BLOQUEOS.md.
 *
 * Liberación: por token (no por pid; un mismo proceso puede tener varios bloqueos). Un dueño nunca borra el de otro.
 * Al terminar el proceso se liberan los propios que queden; si muere sin limpiar (kill), el siguiente lo recupera por pid.
 */

export interface InfoBloqueo { pid: number; equipo: string; inicio: string; descripcion: string; token: string }

export interface OpcionesBloqueo {
  /** Cuánto esperar a que se libere un bloqueo vigente antes de rendirse (0 = no esperar). */
  esperaMs?: number;
  /**
   * Antigüedad a partir de la cual el diagnóstico advierte que el bloqueo PARECE abandonado. Solo informa: un bloqueo
   * antiguo con su dueño vivo (o de otro equipo) nunca se retira automáticamente.
   */
  caducidadMs?: number;
  descripcion?: string;
  /** Inyectables para pruebas. */
  pidVivo?: (pid: number) => boolean;
  ahora?: () => number;
  /** Solo pruebas: se invoca en puntos intermedios del algoritmo para forzar intercalados deterministas. */
  intercalar?: (punto: 'recuperacion_tomada') => void;
}

export class BloqueoOcupadoError extends Error {
  constructor(readonly ruta: string, readonly dueno: InfoBloqueo | null, readonly diagnostico = '') {
    super(`Recurso en uso por otro proceso (pid ${dueno?.pid ?? '?'}, desde ${dueno?.inicio ?? '?'}${dueno?.descripcion ? `: ${dueno.descripcion}` : ''}).` +
      (diagnostico ? ` ${diagnostico}` : ''));
    this.name = 'BloqueoOcupadoError';
  }
}

export interface Bloqueo { ruta: string; liberar(): void }

/** token → ruta de los bloqueos de ESTE proceso aún no liberados. */
const propios = new Map<string, string>();
let limpiezaRegistrada = false;

function pidVivoPorDefecto(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** Metadatos del bloqueo, o null si no existe, no se puede leer o está incompleto (nunca se adivina). */
export function leerBloqueo(ruta: string): InfoBloqueo | null {
  try {
    const d = JSON.parse(readFileSync(ruta, 'utf8')) as Partial<InfoBloqueo>;
    const valido = Number.isInteger(d.pid) && (d.pid as number) > 0 && typeof d.equipo === 'string' && d.equipo !== ''
      && typeof d.inicio === 'string' && !Number.isNaN(Date.parse(d.inicio)) && typeof d.token === 'string' && d.token !== '';
    return valido ? { descripcion: '', ...d } as InfoBloqueo : null;
  } catch { return null; }
}

function registrarLimpieza(): void {
  if (limpiezaRegistrada) return;
  limpiezaRegistrada = true;
  process.once('exit', () => { for (const [token, ruta] of propios) liberarSiPropio(ruta, token); });
}

function liberarSiPropio(ruta: string, token: string): void {
  // Solo se borra si el archivo sigue siendo de ESTE dueño (mismo token). Mientras el dueño vive, nadie más lo retira.
  if (leerBloqueo(ruta)?.token === token) { try { unlinkSync(ruta); } catch { /* ya no existe */ } }
  propios.delete(token);
}

type Creacion = { creado: true } | { creado: false; existe: boolean; codigo: string };

/** Publica `info` en `ruta` de forma atómica y exclusiva (temporal completo + enlace duro). */
function crearExclusivo(ruta: string, info: InfoBloqueo): Creacion {
  const temporal = `${ruta}.${info.token}.tmp`;
  const fd = openSync(temporal, 'wx');
  try {
    try { writeSync(fd, JSON.stringify(info)); fsyncSync(fd); } finally { closeSync(fd); }
    linkSync(temporal, ruta);
    return { creado: true };
  } catch (e) {
    const codigo = (e as NodeJS.ErrnoException).code ?? 'DESCONOCIDO';
    if (codigo === 'EEXIST') return { creado: false, existe: true, codigo };
    // Windows: un archivo en borrado pendiente o retenido por el antivirus da EPERM/EACCES/EBUSY por un instante.
    if (['EPERM', 'EACCES', 'EBUSY'].includes(codigo)) return { creado: false, existe: false, codigo };
    throw new Error(`No se pudo crear el bloqueo ${ruta} (${codigo}). Requiere un sistema de archivos local con enlaces duros (NTFS, ext4, APFS).`);
  } finally {
    try { unlinkSync(temporal); } catch { /* el temporal es propio; si quedó, no afecta la exclusión */ }
  }
}

function nuevaInfo(descripcion: string, ahora: () => number): InfoBloqueo {
  return { pid: process.pid, equipo: hostname(), inicio: new Date(ahora()).toISOString(), descripcion, token: randomUUID() };
}

/** Diagnóstico del dueño actual: ¿es un huérfano DEMOSTRABLE? Si no, por qué se mantiene (fallo cerrado). */
function diagnosticar(ruta: string, o: OpcionesBloqueo): { dueno: InfoBloqueo | null; huerfano: boolean; motivo: string } {
  const pidVivo = o.pidVivo ?? pidVivoPorDefecto;
  const ahora = o.ahora ?? Date.now;
  const dueno = leerBloqueo(ruta);
  if (!existsSync(ruta)) return { dueno: null, huerfano: false, motivo: 'El bloqueo no existe (se liberó o no pudo crearse).' };
  if (!dueno) return { dueno, huerfano: false, motivo: 'Metadatos ilegibles o incompletos: no se retira automáticamente.' };
  if (dueno.equipo !== hostname()) return { dueno, huerfano: false, motivo: `Bloqueo de otro equipo (${dueno.equipo}): no se puede comprobar su proceso; no se retira automáticamente.` };
  if (dueno.pid === process.pid || pidVivo(dueno.pid)) {
    const antiguo = o.caducidadMs != null && ahora() - Date.parse(dueno.inicio) > o.caducidadMs;
    return { dueno, huerfano: false, motivo: antiguo ? `El proceso ${dueno.pid} sigue vivo pero el bloqueo es antiguo: puede estar colgado; no se retira automáticamente.` : '' };
  }
  return { dueno, huerfano: true, motivo: `El proceso ${dueno.pid} ya no existe: bloqueo huérfano.` };
}

/** Retira un huérfano demostrable bajo el bloqueo de recuperación. true = se retiró (o ya no estaba). */
function recuperarHuerfano(ruta: string, token: string, o: OpcionesBloqueo): boolean {
  const rutaRecuperacion = `${ruta}.recuperacion`;
  const info = nuevaInfo(`recuperación de ${ruta}`, o.ahora ?? Date.now);
  if (!crearExclusivo(rutaRecuperacion, info).creado) return false; // otro proceso recupera (o quedó abandonado): fallo cerrado
  try {
    o.intercalar?.('recuperacion_tomada');
    const d = diagnosticar(ruta, o);
    if (!d.dueno) return !existsSync(ruta);
    if (d.dueno.token !== token || !d.huerfano) return false; // ya es otro bloqueo, o dejó de ser demostrable
    try { unlinkSync(ruta); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return false; }
    return true;
  } finally {
    liberarSiPropio(rutaRecuperacion, info.token);
  }
}

function intentar(ruta: string, o: OpcionesBloqueo): Bloqueo | null {
  mkdirSync(dirname(ruta), { recursive: true });
  for (let intento = 0; intento < 2; intento++) {
    const info = nuevaInfo(o.descripcion ?? '', o.ahora ?? Date.now);
    const c = crearExclusivo(ruta, info);
    if (c.creado) {
      propios.set(info.token, ruta);
      registrarLimpieza();
      return { ruta, liberar: () => liberarSiPropio(ruta, info.token) };
    }
    if (!c.existe) return null; // transitorio de Windows: se reintenta en la siguiente vuelta de adquirirBloqueo
    const d = diagnosticar(ruta, o);
    if (!d.huerfano || !d.dueno || !recuperarHuerfano(ruta, d.dueno.token, o)) return null;
  }
  return null;
}

/** Intenta tomar el bloqueo una vez. Devuelve null si está ocupado (o su estado no permite tomarlo con seguridad). */
export function intentarBloqueo(ruta: string, o: OpcionesBloqueo = {}): Bloqueo | null {
  return intentar(ruta, o);
}

/** Toma el bloqueo esperando hasta `esperaMs`; lanza BloqueoOcupadoError (con diagnóstico) si no lo consigue. */
export async function adquirirBloqueo(ruta: string, o: OpcionesBloqueo = {}): Promise<Bloqueo> {
  const limite = Date.now() + (o.esperaMs ?? 0);
  for (let pausa = 25; ; pausa = Math.min(pausa * 2, 500)) {
    const b = intentar(ruta, o);
    if (b) return b;
    if (Date.now() >= limite) {
      const d = diagnosticar(ruta, o);
      const recuperacion = existsSync(`${ruta}.recuperacion`)
        ? ` Existe ${ruta}.recuperacion (recuperación en curso o abandonada).` : '';
      const manual = d.motivo || recuperacion ? ' Recuperación manual: docs/orquestacion/RECUPERACION-BLOQUEOS.md.' : '';
      throw new BloqueoOcupadoError(ruta, d.dueno, `${d.motivo}${recuperacion}${manual}`.trim());
    }
    await new Promise((r) => setTimeout(r, Math.min(pausa, Math.max(1, limite - Date.now()))));
  }
}

/** Ejecuta `fn` con el bloqueo tomado y lo libera siempre (también si `fn` falla). */
export async function conBloqueo<T>(ruta: string, fn: () => Promise<T>, o: OpcionesBloqueo = {}): Promise<T> {
  const b = await adquirirBloqueo(ruta, o);
  try { return await fn(); } finally { b.liberar(); }
}
