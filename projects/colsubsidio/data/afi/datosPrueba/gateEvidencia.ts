import { capturaCliente, type ModoEvidenciaAfi } from '../evidencia';
import { DatosPruebaError } from './contrato';

/**
 * GATE FORMAL de evidencia cliente con datos sensibles (Fase 4Q). NO es una implementación de enmascarado: es una deuda
 * explícita y bloqueante.
 *
 * Un caso con actorRef (ActorSlot) escribe en el Portal valores SECRET reales del actor (identificación, correo...). Las
 * capturas cliente pueden mostrarlos en inputs visibles. Hasta cerrar este gate, un E2E con ActorSlot NO puede producir
 * evidencia cliente ni declararse "client-safe". Intake, compilación y E2E sin evidencia cliente (off | tecnica, de uso
 * interno) sí están permitidos. Los casos sin actorRef conservan su comportamiento vigente.
 */
export const GATE_EVIDENCIA_PII = {
  id: 'evidencia-cliente-pii-actor-slots',
  estado: 'ABIERTO' as 'ABIERTO' | 'CERRADO',
  alcance: 'Ejecución E2E de casos con actorRef (ActorSlot) con evidencia cliente (modos cliente | todo).',
  riesgo: 'Las capturas cliente pueden mostrar valores SECRET del actor en inputs visibles (identificación, correo, teléfonos...).',
  criteriosDeCierre: [
    'Estrategia explícita y revisada para que ninguna captura cliente muestre un campo SECRET del actor (enmascarado o exclusión, por campo).',
    'Pruebas automáticas que demuestren que cada campo SECRET pedible queda oculto en la evidencia cliente.',
    'Decisión documentada de quién puede ver la evidencia técnica (video/trace), que no es client-safe.',
  ],
  mientrasAbierto: 'Use --evidencia=off o --evidencia=tecnica (interna, nunca para el cliente) en casos con actorRef.',
} as const;

/** ¿La evidencia de esta ejecución puede declararse client-safe? */
export const evidenciaClienteSegura = (actorRef: string | undefined, modo: ModoEvidenciaAfi): boolean =>
  !capturaCliente(modo) || actorRef === undefined || GATE_EVIDENCIA_PII.estado === 'CERRADO';

/** Preflight (antes del navegador): con el gate abierto, un caso con actorRef no puede pedir evidencia cliente. */
export function exigirGateEvidenciaPii(actorRef: string | undefined, modo: ModoEvidenciaAfi): void {
  if (evidenciaClienteSegura(actorRef, modo)) return;
  throw new DatosPruebaError('GATE_EVIDENCIA_PII', [{
    motivo: 'PII',
    detalle: `gate ${GATE_EVIDENCIA_PII.id} ABIERTO: un caso con actorRef no puede producir evidencia cliente (modo ${modo}). ${GATE_EVIDENCIA_PII.mientrasAbierto}`,
  }]);
}
