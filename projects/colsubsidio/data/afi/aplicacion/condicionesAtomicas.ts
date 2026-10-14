import { diagnosticarCondicion, type AccionRequerida, type CapaDiagnostico, type CondicionPropuesta, type DiagnosticoCondicion, type GapDetectado } from './gaps';
import type { ModeloAplicacion } from './modeloAplicacion';
import type { ObservationProvider } from './superficies';

/**
 * CONDICIONES ATÓMICAS (Fase 4M.1). Un paso QA puede afirmar varias cosas independientes ("avanza por la ruta X y
 * muestra la pantalla Y"). Se descompone en condiciones ATÓMICAS y cada una recorre SU PROPIA precedencia con STOP en
 * la primera capa bloqueante: dentro de una condición nunca se saltan capas; entre condiciones, cada una puede
 * detenerse en una capa distinta. La descomposición la hace quien lee el diseño (el agente); aquí se diagnostica.
 */

export interface CondicionAtomica {
  condicion: CondicionPropuesta;
  /** Acciones u orquestación que ESTA condición necesita (no las de otras condiciones del paso). */
  acciones?: readonly AccionRequerida[];
}

export interface PasoDescompuesto { hu: string; caso: string; paso: string; condiciones: readonly CondicionAtomica[] }

export interface DiagnosticoAtomico { condicion: string; diagnostico: DiagnosticoCondicion; capasEvaluadas: CapaDiagnostico[] }

export function diagnosticarPaso(
  paso: PasoDescompuesto,
  modelo: ModeloAplicacion,
  proveedores: readonly Pick<ObservationProvider, 'id' | 'superficie' | 'supports' | 'expectativas'>[],
): { paso: string; condiciones: DiagnosticoAtomico[]; representable: boolean } {
  if (!paso.condiciones.length) throw new Error(`El paso ${paso.paso} no tiene condiciones atómicas.`);
  const ids = new Set<string>();
  const condiciones = paso.condiciones.map(({ condicion, acciones }) => {
    if (ids.has(condicion.id)) throw new Error(`Condición atómica duplicada en ${paso.paso}: ${condicion.id}`);
    ids.add(condicion.id);
    const capasEvaluadas: CapaDiagnostico[] = [];
    const diagnostico = diagnosticarCondicion(condicion, modelo, proveedores, acciones ?? [], capasEvaluadas);
    return { condicion: condicion.id, diagnostico, capasEvaluadas };
  });
  return { paso: paso.paso, condiciones, representable: condiciones.every(c => c.diagnostico.estado === 'REPRESENTABLE') };
}

/**
 * Gaps técnicos (runtime) de un paso como ocurrencias por condición atómica, listos para deduplicar por CAPACIDAD
 * atómica: observar una ruta y leer una variable son capacidades distintas aunque ocurran en el mismo paso y superficie.
 * Los KNOWLEDGE_GAP no son técnicos (se declaran) y se devuelven aparte.
 */
export function gapsDelPaso(paso: PasoDescompuesto, diagnosticos: readonly DiagnosticoAtomico[]): { tecnicos: GapDetectado[]; conocimiento: GapDetectado[] } {
  const tecnicos: GapDetectado[] = [], conocimiento: GapDetectado[] = [];
  for (const d of diagnosticos) {
    const ocurrencia = { hu: paso.hu, caso: paso.caso, paso: paso.paso, condicion: d.condicion };
    if (d.diagnostico.estado === 'TESTABILITY_GAP' || d.diagnostico.estado === 'CAPABILITY_GAP') tecnicos.push({ ...d.diagnostico.gap, ocurrencia });
    if (d.diagnostico.estado === 'KNOWLEDGE_GAP') conocimiento.push({ ...d.diagnostico.gap, capacidad: `${d.diagnostico.gap.capacidad} ${d.diagnostico.entidad.id}`, ocurrencia });
  }
  return { tecnicos, conocimiento };
}
