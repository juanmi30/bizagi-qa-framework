import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname } from 'node:path';

/**
 * Bloqueo EXCLUSIVO entre procesos mediante un archivo creado de forma atómica (flag "wx": falla si ya existe).
 * Sirve para que dos procesos (dos terminales, o varios workers de Playwright si alguien pasa --workers) no hagan a
 * la vez una lectura-modificación-escritura o una ejecución real que no admite concurrencia.
 *
 * - El archivo guarda pid, equipo, inicio y una descripción (nunca datos sensibles).
 * - Bloqueo huérfano: si el proceso dueño ya no existe en este equipo, o el bloqueo superó `caducidadMs`, se retira.
 * - Liberación: `liberar()` en un finally; además, al terminar el proceso se retiran los bloqueos propios que queden.
 *   Si el proceso muere sin poder limpiar (kill -9), el siguiente lo detecta como huérfano por el pid.
 */

export interface InfoBloqueo { pid: number; equipo: string; inicio: string; descripcion: string }

export interface OpcionesBloqueo {
  /** Cuánto esperar a que se libere un bloqueo vigente antes de rendirse (0 = no esperar). */
  esperaMs?: number;
  /** Antigüedad a partir de la cual un bloqueo se considera abandonado aunque su pid exista. */
  caducidadMs?: number;
  descripcion?: string;
  /** Inyectables para pruebas. */
  pidVivo?: (pid: number) => boolean;
  ahora?: () => number;
}

export class BloqueoOcupadoError extends Error {
  constructor(readonly ruta: string, readonly dueno: InfoBloqueo | null) {
    super(`Recurso en uso por otro proceso (pid ${dueno?.pid ?? '?'}, desde ${dueno?.inicio ?? '?'}${dueno?.descripcion ? `: ${dueno.descripcion}` : ''}).`);
    this.name = 'BloqueoOcupadoError';
  }
}

export interface Bloqueo { ruta: string; liberar(): void }

const propios = new Set<string>();
let limpiezaRegistrada = false;

function pidVivoPorDefecto(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

function leer(ruta: string): InfoBloqueo | null {
  try { return JSON.parse(readFileSync(ruta, 'utf8')) as InfoBloqueo; } catch { return null; }
}

function registrarLimpieza(): void {
  if (limpiezaRegistrada) return;
  limpiezaRegistrada = true;
  process.once('exit', () => { for (const r of propios) liberarSiPropio(r); });
}

function liberarSiPropio(ruta: string): void {
  // Solo se borra si el archivo sigue siendo de ESTE proceso (pudo ser retirado por huérfano y tomado por otro).
  if (leer(ruta)?.pid === process.pid) { try { unlinkSync(ruta); } catch { /* ya no existe */ } }
  propios.delete(ruta);
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Intenta tomar el bloqueo una vez. Devuelve null si está ocupado por un dueño vigente. */
export function intentarBloqueo(ruta: string, o: OpcionesBloqueo = {}): Bloqueo | null {
  const pidVivo = o.pidVivo ?? pidVivoPorDefecto;
  const ahora = o.ahora ?? Date.now;
  mkdirSync(dirname(ruta), { recursive: true });
  for (let intento = 0; intento < 3; intento++) {
    try {
      const fd = openSync(ruta, 'wx');
      const info: InfoBloqueo = { pid: process.pid, equipo: hostname(), inicio: new Date(ahora()).toISOString(), descripcion: o.descripcion ?? '' };
      try { writeSync(fd, JSON.stringify(info)); } finally { closeSync(fd); }
      propios.add(ruta);
      registrarLimpieza();
      return { ruta, liberar: () => liberarSiPropio(ruta) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    const dueno = leer(ruta);
    const huerfano = !dueno
      || (dueno.equipo === hostname() && !pidVivo(dueno.pid))
      || (o.caducidadMs != null && ahora() - Date.parse(dueno.inicio) > o.caducidadMs);
    if (!huerfano) return null;
    try { unlinkSync(ruta); } catch { /* otro proceso lo retiró primero */ }
  }
  return null;
}

/** Toma el bloqueo esperando hasta `esperaMs`; lanza BloqueoOcupadoError si no lo consigue. */
export async function adquirirBloqueo(ruta: string, o: OpcionesBloqueo = {}): Promise<Bloqueo> {
  const limite = Date.now() + (o.esperaMs ?? 0);
  for (let pausa = 25; ; pausa = Math.min(pausa * 2, 500)) {
    const b = intentarBloqueo(ruta, o);
    if (b) return b;
    if (Date.now() >= limite) throw new BloqueoOcupadoError(ruta, leer(ruta));
    await dormir(Math.min(pausa, Math.max(1, limite - Date.now())));
  }
}

/** Ejecuta `fn` con el bloqueo tomado y lo libera siempre (también si `fn` falla). */
export async function conBloqueo<T>(ruta: string, fn: () => Promise<T>, o: OpcionesBloqueo = {}): Promise<T> {
  const b = await adquirirBloqueo(ruta, o);
  try { return await fn(); } finally { b.liberar(); }
}
