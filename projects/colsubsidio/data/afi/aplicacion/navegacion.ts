import { PANTALLAS_AFI, alcanzable, type PantallaAfi } from './pantallas';

/**
 * NAVEGACIÓN POR OBJETIVO (Fase 4J, vertical slice). Sustituye conceptualmente `etapas: [A, B, C]` por
 * `alcanzar: <pantalla>`. Pura: reconocer / preparar / continuar se inyectan (el runtime real los aporta más adelante).
 *
 * Bucle: reconocer -> si es el objetivo, fin -> preparar (solo pantallas "preparable") -> continuar -> repetir.
 * Tolera reordenamiento y pantallas conocidas condicionales o ausentes; FALLA ante pantalla desconocida (la lanza
 * reconocer), objetivo inalcanzable según el grafo, ciclos y exceso de transiciones. No se conecta aún al runner v1.
 */

export interface AccionesNavegacion {
  reconocer(): Promise<string>;
  preparar(pantalla: string): Promise<void>;
  continuar(pantalla: string): Promise<void>;
}

export class NavegacionAfiError extends Error {
  constructor(readonly motivo: 'objetivo-desconocido' | 'objetivo-inalcanzable' | 'sin-avance' | 'ciclo' | 'max-transiciones', readonly recorrido: readonly string[], detalle: string) {
    super(`Navegación AFI (${motivo}): ${detalle}. Recorrido: ${recorrido.join(' -> ') || '(vacío)'}.`);
    this.name = 'NavegacionAfiError';
  }
}

export async function alcanzarPantalla(
  objetivo: string,
  acciones: AccionesNavegacion,
  opciones: { modelo?: Readonly<Partial<Record<string, PantallaAfi>>>; maxTransiciones?: number; maxVisitasPorPantalla?: number } = {},
): Promise<{ recorrido: string[]; preparadas: string[] }> {
  const modelo: Readonly<Partial<Record<string, PantallaAfi>>> = opciones.modelo ?? PANTALLAS_AFI;
  const max = opciones.maxTransiciones ?? 8, maxVisitas = opciones.maxVisitasPorPantalla ?? 2;
  if (!modelo[objetivo]) throw new NavegacionAfiError('objetivo-desconocido', [], `el objetivo ${objetivo} no está en el modelo`);
  const recorrido: string[] = [], preparadas: string[] = [];
  const visitas = new Map<string, number>();
  for (let transiciones = 0; ; transiciones++) {
    const actual = await acciones.reconocer(); // lanza ante pantalla desconocida o ambigua
    recorrido.push(actual);
    if (actual === objetivo) return { recorrido, preparadas };
    const pantalla = modelo[actual];
    if (!pantalla || !alcanzable(actual, objetivo, modelo)) throw new NavegacionAfiError('objetivo-inalcanzable', recorrido, `desde ${actual} no se llega a ${objetivo}`);
    const n = (visitas.get(actual) ?? 0) + 1;
    visitas.set(actual, n);
    if (n > maxVisitas) throw new NavegacionAfiError('ciclo', recorrido, `${actual} se observó ${n} veces`);
    if (transiciones >= max) throw new NavegacionAfiError('max-transiciones', recorrido, `más de ${max} transiciones`);
    if (!pantalla.avance) throw new NavegacionAfiError('sin-avance', recorrido, `${actual} no tiene acción de avance`);
    // Solo preparación segura, una vez por pantalla aunque reaparezca.
    if (pantalla.preparable && !preparadas.includes(actual)) { await acciones.preparar(actual); preparadas.push(actual); }
    await acciones.continuar(actual);
  }
}
