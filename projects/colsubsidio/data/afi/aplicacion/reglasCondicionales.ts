import type { CondicionObservable, ValorPrimitivo } from './superficies';

/**
 * REGLAS DE NEGOCIO CON PREDICADO (Fase 4M.1). Capa pura.
 *
 *   regla = predicado (condición de activación) + consecuencias (expectativas que activa)
 *
 * - Una consecuencia solo entra al caso si su predicado está DEMOSTRADO por las fuentes del escenario.
 * - Predicado falso: la consecuencia NO aparece. Nunca se infiere la regla inversa ni la contraria
 *   ("si A entonces C" no permite "si no A entonces C", ni "si B entonces C" porque B comparta proceso o integración).
 * - Predicado desconocido: si la consecuencia afecta PASS/FAIL -> INFORMACION_INSUFICIENTE (no se elige).
 * - Toda expectativa derivada queda TRAZADA: fuente, predicado que la activó y consecuencia.
 */

/** Hecho del escenario, tal como lo establecen las fuentes (diseño, requerimiento). undefined = no establecido. */
export type Hechos = Readonly<Record<string, ValorPrimitivo | undefined>>;

/** Todas las comparaciones deben cumplirse (conjunción explícita; sin disyunciones implícitas). */
export interface Predicado { todos: readonly { hecho: string; igual: ValorPrimitivo }[] }

export interface ReglaConPredicado {
  id: string;
  /** De dónde sale la regla (referencia pública del requerimiento o diseño). */
  fuente: string;
  predicado: Predicado;
  consecuencias: readonly CondicionObservable[];
  /** Si la consecuencia cambia el veredicto del caso (por defecto sí). */
  afectaResultado?: boolean;
}

export interface ExpectativaDerivada {
  condicion: CondicionObservable;
  traza: { regla: string; fuente: string; predicado: Predicado; hechos: Record<string, ValorPrimitivo> };
}

export type EvaluacionPredicado = 'verdadero' | 'falso' | 'desconocido';

export function evaluarPredicado(p: Predicado, hechos: Hechos): EvaluacionPredicado {
  if (!p.todos.length) throw new Error('Un predicado sin comparaciones no es una condición de activación.');
  let desconocido = false;
  for (const { hecho, igual } of p.todos) {
    if (!Object.prototype.hasOwnProperty.call(hechos, hecho) || hechos[hecho] === undefined) { desconocido = true; continue; }
    if (hechos[hecho] !== igual) return 'falso'; // una comparación falsa basta (conjunción)
  }
  return desconocido ? 'desconocido' : 'verdadero';
}

export interface ResultadoReglas {
  /** Expectativas que SÍ entran al caso, con su trazabilidad. */
  derivadas: ExpectativaDerivada[];
  /** Reglas no aplicadas porque su predicado es falso (auditoría; no generan nada). */
  noActivadas: string[];
  /** Reglas cuyo predicado no está establecido y cuyas consecuencias afectan PASS/FAIL. */
  informacionInsuficiente: { regla: string; hechosFaltantes: string[] }[];
}

export function aplicarReglas(reglas: readonly ReglaConPredicado[], hechos: Hechos): ResultadoReglas {
  const r: ResultadoReglas = { derivadas: [], noActivadas: [], informacionInsuficiente: [] };
  for (const regla of reglas) {
    const e = evaluarPredicado(regla.predicado, hechos);
    if (e === 'falso') { r.noActivadas.push(regla.id); continue; }
    if (e === 'desconocido') {
      if (regla.afectaResultado !== false) {
        r.informacionInsuficiente.push({ regla: regla.id, hechosFaltantes: regla.predicado.todos.filter(t => hechos[t.hecho] === undefined).map(t => t.hecho) });
      }
      continue;
    }
    const usados = Object.fromEntries(regla.predicado.todos.map(t => [t.hecho, hechos[t.hecho] as ValorPrimitivo]));
    for (const condicion of regla.consecuencias) {
      r.derivadas.push({ condicion, traza: { regla: regla.id, fuente: regla.fuente, predicado: regla.predicado, hechos: usados } });
    }
  }
  return r;
}

/**
 * No expansión de alcance: toda expectativa derivada que se quiera incorporar al caso debe tener fuente, predicado y
 * consecuencia, y su predicado debe cumplirse con los hechos del ESCENARIO del caso (no de otro relacionado).
 */
export function validarTrazabilidad(derivadas: readonly ExpectativaDerivada[], hechos: Hechos): string[] {
  const p: string[] = [];
  for (const d of derivadas) {
    const id = d.condicion.id;
    if (!d.traza?.fuente?.trim()) p.push(`${id}: sin fuente`);
    if (!d.traza?.predicado?.todos?.length) p.push(`${id}: sin predicado que la active`);
    else if (evaluarPredicado(d.traza.predicado, hechos) !== 'verdadero') p.push(`${id}: el escenario no activa el predicado de ${d.traza.regla}`);
  }
  return p;
}
