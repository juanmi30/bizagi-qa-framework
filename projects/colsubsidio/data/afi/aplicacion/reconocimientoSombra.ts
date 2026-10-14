/**
 * RECONOCIMIENTO DE PANTALLA EN SHADOW MODE (Fase 4K). Capa pura: configuración, forma de las observaciones y resumen.
 *
 * Compara dos mecanismos INDEPENDIENTES: la etapa que el runner v1 cree estar manejando (su autoridad: botones y
 * textos del piloto) y la pantalla que reconoce el Application Model. Un match no prueba que la firma sea correcta
 * ni un mismatch que el runner se equivoque: solo registra el acuerdo para validar las firmas en QA real.
 * Nunca decide navegación, preparación ni el resultado funcional.
 */

export const MODOS_RECONOCIMIENTO_PANTALLA = ['off', 'shadow'] as const;
export type ModoReconocimientoPantalla = typeof MODOS_RECONOCIMIENTO_PANTALLA[number];
export const MODO_RECONOCIMIENTO_POR_DEFECTO: ModoReconocimientoPantalla = 'off';

/** Valor de control (CLI/entorno) -> modo. Vacío = off; desconocido = error (nunca se adivina). */
export function modoReconocimientoPantalla(valor: string | undefined): ModoReconocimientoPantalla {
  if (valor === undefined || valor.trim() === '') return MODO_RECONOCIMIENTO_POR_DEFECTO;
  const modo = valor.trim().toLowerCase();
  if (!(MODOS_RECONOCIMIENTO_PANTALLA as readonly string[]).includes(modo)) {
    throw new Error(`Modo de reconocimiento de pantalla desconocido ${JSON.stringify(valor.slice(0, 20))}. Modos: ${MODOS_RECONOCIMIENTO_PANTALLA.join(', ')}.`);
  }
  return modo as ModoReconocimientoPantalla;
}

/** Momentos del runner con la UI estable (pantalla cargada, sin navegación ni estados funcionales efímeros). */
export type PuntoObservacion =
  /** inicio-solicitud diligenciado, antes de enviarlo. */
  | 'inicio-completado'
  /** Pantalla de preparación completada, justo antes de pulsar su Continuar. */
  | 'antes-de-continuar'
  /** Información de contacto alcanzada, antes del plan funcional. */
  | 'punto-funcional';

export type EstadoObservacion =
  | 'match'
  | 'mismatch'
  /** El recognizer no reconoció ninguna pantalla. */
  | 'desconocida'
  /** Varias pantallas coinciden. */
  | 'ambigua'
  /** El runner no tiene una etapa identificada para esta pantalla (avanza solo por su Continuar único): no hay con qué comparar. */
  | 'sin-expectativa'
  /** Fallo técnico del propio recognizer (no de la pantalla). */
  | 'error-recognizer';

/** Señales semánticas públicas presentes: "encabezado" o "campo:<id de dominio>". Nunca selectores ni valores. */
export interface SenalesPantalla { pantalla: string; presentes: string[]; total: number }

/** Qué dijo el recognizer por sí solo (diagnóstico), independiente de la comparación con el runner. */
export type ResultadoRecognizer = 'reconocida' | 'desconocida' | 'ambigua' | 'error';

export interface ObservacionPantalla {
  secuencia: number;
  punto: PuntoObservacion;
  esperado: string | null;
  reconocido: string | null;
  /** Comparación runner vs recognizer (ver clasificarObservacion). */
  status: EstadoObservacion;
  /** Resultado propio del recognizer, siempre registrado (también cuando no hay expectativa). */
  recognizer: ResultadoRecognizer;
  candidatas?: string[];
  senales?: SenalesPantalla[];
  detalle?: string;
}

/**
 * Precedencia (4K.1): sin expectativa del runner NO hay comparación posible -> 'sin-expectativa', sea cual sea el
 * resultado del recognizer (que queda en `recognizer`). Con expectativa: match/mismatch si reconoció una pantalla;
 * si no, el resultado del recognizer (desconocida, ambigua o error-recognizer).
 */
export function clasificarObservacion(esperado: string | null, recognizer: ResultadoRecognizer, reconocido: string | null): EstadoObservacion {
  if (esperado === null) return 'sin-expectativa';
  switch (recognizer) {
    case 'reconocida': return esperado === reconocido ? 'match' : 'mismatch';
    case 'desconocida': return 'desconocida';
    case 'ambigua': return 'ambigua';
    case 'error': return 'error-recognizer';
  }
}

export interface ResumenReconocimiento {
  observaciones: number;
  matches: number;
  mismatches: number;
  desconocidas: number;
  ambiguas: number;
  sinExpectativa: number;
  erroresRecognizer: number;
}

export interface TrazaReconocimiento {
  modo: 'shadow';
  /** El recognizer nunca gobierna: solo diagnóstico técnico. */
  autoridad: 'runner-v1';
  perfil: string;
  observaciones: ObservacionPantalla[];
  resumen: ResumenReconocimiento;
}

export function resumirReconocimiento(observaciones: readonly ObservacionPantalla[]): ResumenReconocimiento {
  const n = (s: EstadoObservacion) => observaciones.filter(o => o.status === s).length;
  return {
    observaciones: observaciones.length, matches: n('match'), mismatches: n('mismatch'), desconocidas: n('desconocida'),
    ambiguas: n('ambigua'), sinExpectativa: n('sin-expectativa'), erroresRecognizer: n('error-recognizer'),
  };
}
