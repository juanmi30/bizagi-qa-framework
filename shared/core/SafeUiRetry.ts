import { errors } from '@playwright/test';

/**
 * Reintento acotado de operaciones UI SEGURAS e IDEMPOTENTES (COMPARTIDO).
 * Uso permitido: navegación, abrir menús/categorías/diálogos, repetir una búsqueda.
 * NUNCA para crear, enviar, completar, cancelar o guardar: repetirlas puede duplicar negocio.
 */
export interface OperacionUiSegura {
  nombre: string;
  /** Se ejecuta completa en cada intento: debe construir locators nuevos (sin ElementHandle). */
  accion: () => Promise<void>;
  /** Postcondición observable del destino; no debe mutar estado. */
  estadoExitoso: () => Promise<boolean>;
  /** Presupuesto total de la operación (ms). */
  timeout?: number;
  /** Pausa entre intentos (ms). */
  intervalo?: number;
  /** Cuánto se sondea la postcondición tras cada acción antes de reintentar (ms). */
  esperaEstado?: number;
}

// Rerender/navegación de la SPA: el nodo o el contexto cambió bajo el locator.
const TRANSITORIOS = [
  /element is not attached to the DOM/i,
  /element was detached from the DOM/i,
  /execution context was destroyed/i,
  /navigation .* interrupted by another navigation/i,
  /net::ERR_ABORTED/,
  // DNS transitorio observado en QA real al navegar al Work Portal.
  /net::ERR_NAME_NOT_RESOLVED/,
];

/** Solo errores de interacción/navegación transitorios; aserciones, strict mode y cierres no. */
export function esErrorTransitorioUi(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (/has been closed/i.test(e.message)) return false;
  if (e instanceof errors.TimeoutError || e.name === 'TimeoutError') return true;
  return TRANSITORIOS.some(r => r.test(e.message));
}

const pausa = (ms: number) => new Promise(r => setTimeout(r, Math.max(0, ms)));

async function alcanzado(estadoExitoso: () => Promise<boolean>, ms: number): Promise<boolean> {
  const limite = Date.now() + ms;
  for (;;) {
    try {
      if (await estadoExitoso()) return true;
    } catch (e) {
      if (!esErrorTransitorioUi(e)) throw e;
    }
    if (Date.now() >= limite) return false;
    await pausa(Math.min(250, limite - Date.now()));
  }
}

/** Repite `accion` hasta que `estadoExitoso` se cumpla. Devuelve el número de intentos usados. */
export async function retrySafeUiOperation(op: OperacionUiSegura): Promise<number> {
  const { nombre, accion, estadoExitoso, timeout = 60_000, intervalo = 1_000, esperaEstado = 5_000 } = op;
  const limite = Date.now() + timeout;
  let intentos = 0;
  let ultimo: unknown;
  for (;;) {
    intentos++;
    try {
      await accion();
      if (await alcanzado(estadoExitoso, Math.min(esperaEstado, Math.max(0, limite - Date.now())))) return intentos;
      ultimo = new Error('postcondición no alcanzada');
    } catch (e) {
      if (!esErrorTransitorioUi(e)) throw e;
      ultimo = e;
    }
    if (Date.now() + intervalo >= limite) break;
    await pausa(intervalo);
  }
  const detalle = ultimo instanceof Error ? ultimo.message.split('\n')[0] : String(ultimo);
  throw new Error(`${nombre}: no se alcanzó el estado destino tras ${intentos} intento(s) en ${timeout} ms. Último: ${detalle}`,
    { cause: ultimo });
}
