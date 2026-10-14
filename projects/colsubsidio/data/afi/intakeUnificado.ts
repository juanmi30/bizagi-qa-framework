import { prepararEnDisco, type ResultadoPreparar, type RutasConocimiento } from './aplicacion/intakeDisco';
import { prepararDatosEnDisco, type ResultadoPrepararDatos, type RutasDatos } from './datosPrueba/disco';
import { leerEnvelope, tieneConocimiento, tieneDatosPrueba, type EnvelopeLeido } from './intakeAgente';

/**
 * INTAKE UNIFICADO (Fase 4Q): a partir del MISMO envelope prepara el lote de conocimiento (4O) y/o el de datos de prueba
 * (4Q). No duplica lógica: solo decide qué preparador existente invocar. Nunca aplica nada.
 */
export interface ResultadoIntakeUnificado {
  formato: EnvelopeLeido['formato'];
  conocimiento?: ResultadoPreparar;
  datosPrueba?: ResultadoPrepararDatos;
}

export function prepararIntakeUnificado(entrada: string, rutasK: RutasConocimiento, rutasD: RutasDatos, proyecto?: string): ResultadoIntakeUnificado {
  const envelope = leerEnvelope(entrada);
  return {
    formato: envelope.formato,
    ...(tieneConocimiento(envelope) ? { conocimiento: prepararEnDisco(rutasK, entrada) } : {}),
    ...(tieneDatosPrueba(envelope) ? { datosPrueba: prepararDatosEnDisco(rutasD, entrada, proyecto) } : {}),
  };
}
