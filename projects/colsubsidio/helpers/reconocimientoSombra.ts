import type { Page } from '@playwright/test';
import {
  clasificarObservacion, resumirReconocimiento,
  type ObservacionPantalla, type PuntoObservacion, type SenalesPantalla, type TrazaReconocimiento,
} from '../data/afi/aplicacion/reconocimientoSombra';
import { PantallaAmbiguaError, PantallaNoReconocidaError, reconocerPantalla, type EvaluacionPantalla, type OpcionesReconocimiento } from './reconocerPantalla';

/**
 * Observador de reconocimiento en SHADOW MODE (Fase 4K). Solo LEE la página (instantánea de visibilidad):
 * no hace clic, no escribe, no espera, no navega ni toma screenshots. Nunca lanza: cualquier fallo del recognizer
 * queda como observación técnica y el runner sigue siendo la única autoridad.
 */
export class ObservadorPantallaSombra {
  private readonly observaciones: ObservacionPantalla[] = [];

  constructor(private readonly page: Page, private readonly perfil: string, private readonly opciones: OpcionesReconocimiento = {}) {}

  async observar(punto: PuntoObservacion, esperado: string | null): Promise<ObservacionPantalla> {
    const secuencia = this.observaciones.length + 1;
    // Solo las señales de las pantallas relevantes (esperada y reconocidas/candidatas): traza pequeña y portable.
    const senales = (evaluaciones: readonly EvaluacionPantalla[], relevantes: readonly (string | null)[]): SenalesPantalla[] =>
      evaluaciones.filter(e => relevantes.includes(e.pantalla)).map(e => ({ pantalla: e.pantalla, presentes: [...e.senalesPresentes], total: e.total }));
    // Resultado propio del recognizer; la comparación con el runner se decide después (clasificarObservacion).
    let diagnostico: Omit<ObservacionPantalla, 'secuencia' | 'punto' | 'esperado' | 'status'>;
    try {
      const { pantalla, evaluaciones } = await reconocerPantalla(this.page, this.opciones);
      diagnostico = { reconocido: pantalla, recognizer: 'reconocida', senales: senales(evaluaciones, [esperado, pantalla]) };
    } catch (error) {
      if (error instanceof PantallaNoReconocidaError) {
        diagnostico = { reconocido: null, recognizer: 'desconocida', senales: senales(error.evaluaciones, [esperado]) };
      } else if (error instanceof PantallaAmbiguaError) {
        // Por qué compitieron: señales públicas de cada candidata (y de la esperada, si no es candidata).
        diagnostico = { reconocido: null, recognizer: 'ambigua', candidatas: [...error.candidatas], senales: senales(error.evaluaciones, [esperado, ...error.candidatas]) };
      } else {
        // Solo el TIPO de error: un mensaje podría arrastrar detalles de implementación.
        diagnostico = { reconocido: null, recognizer: 'error', detalle: error instanceof Error ? error.name : 'Error' };
      }
    }
    const obs: ObservacionPantalla = { secuencia, punto, esperado, status: clasificarObservacion(esperado, diagnostico.recognizer, diagnostico.reconocido), ...diagnostico };
    this.observaciones.push(obs);
    return obs;
  }

  traza(): TrazaReconocimiento {
    return { modo: 'shadow', autoridad: 'runner-v1', perfil: this.perfil, observaciones: [...this.observaciones], resumen: resumirReconocimiento(this.observaciones) };
  }
}
