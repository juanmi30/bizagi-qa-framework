import { piiEnContenido } from './sensibilidad';
import type {
  ContextoObservacion, ObservationProvider, ReferenciaEntidad, ResultadoObserve, TipoExpectativa,
} from './superficies';

/**
 * PROVEEDOR proceso-bpm sobre las TAREAS PENDIENTES del caso (Fase 4R). Capa pura: la fuente se inyecta.
 *
 * Fuente real demostrada en QA: Work Portal → Admin → Administración de procesos → Casos, búsqueda por número exacto
 * del caso de ESTA ejecución (BizagiQaSupport.actividades, solo lectura). Es una INSTANTÁNEA de lo pendiente ahora:
 *  - tarea vinculada presente  -> la actividad fue alcanzada (presencia: true);
 *  - tarea vinculada ausente   -> NO concluye nada (ya pasó, aún no llega, es automática...): dato-ausente.
 * Por eso solo certifica `alcanzada`; nunca `no-alcanzada`, rutas, variables ni integraciones.
 *
 * El VÍNCULO actividad -> nombre de tarea Bizagi es conocimiento declarativo y se inyecta: este módulo no conoce
 * ninguna actividad concreta. Sin vínculo la entidad no se soporta (TESTABILITY_GAP intacto).
 */

export interface FuenteTareasPendientes {
  /** Número del caso Bizagi que esta fuente administra (correlación runtime de la propia ejecución). */
  casoAdministrado(): string | undefined;
  /** Nombres visibles de las tareas pendientes AHORA de ese caso. Lanza ObservacionNoDisponibleError con su motivo. */
  tareasPendientes(): Promise<readonly string[]>;
}

/** Vínculos declarativos: id semántico de actividad -> nombre de la tarea en Bizagi. */
export type VinculosTarea = ReadonlyMap<string, string>;

export class VinculoTareaInvalidoError extends Error {
  constructor(detalle: string) { super(`Vínculo de tarea inválido: ${detalle}`); this.name = 'VinculoTareaInvalidoError'; }
}

export class ProveedorTareasPendientes implements ObservationProvider {
  readonly id = 'tareas-pendientes-bizagi';
  readonly superficie = 'proceso-bpm' as const;
  readonly expectativas: readonly TipoExpectativa[] = Object.freeze(['alcanzada'] as const);

  constructor(private readonly fuente: FuenteTareasPendientes, private readonly vinculos: VinculosTarea) {
    for (const [actividad, tarea] of vinculos) {
      if (!tarea.trim()) throw new VinculoTareaInvalidoError(`${actividad.slice(0, 40)} sin nombre de tarea`);
      // Un nombre de tarea es un metadato de proceso: nunca un dato personal.
      if (piiEnContenido(tarea)) throw new VinculoTareaInvalidoError(`${actividad.slice(0, 40)}: posible PII`);
    }
  }

  supports(entidad: ReferenciaEntidad): boolean {
    return entidad.tipo === 'actividad' && this.vinculos.has(entidad.id);
  }

  async observe(entidad: ReferenciaEntidad, contexto: ContextoObservacion): Promise<ResultadoObserve> {
    const tarea = entidad.tipo === 'actividad' ? this.vinculos.get(entidad.id) : undefined;
    if (tarea === undefined) return { noObservable: 'error-proveedor' };
    // Solo el caso correlacionado por la ejecución, y solo si la fuente administra ESE caso.
    const caso = this.fuente.casoAdministrado();
    if (!contexto.casoBizagi || caso !== contexto.casoBizagi) return { noObservable: 'dato-ausente' };
    const pendientes = await this.fuente.tareasPendientes();
    if (!pendientes.some(t => t.trim() === tarea.trim())) return { noObservable: 'dato-ausente' };
    return {
      medicion: { tipo: 'presencia', presente: true },
      // Portable: ni número de caso ni nombre de tarea.
      evidencia: { tipo: 'instantanea-tareas-pendientes', referencia: `${contexto.ejecucion}/${this.id}/${entidad.tipo}/${entidad.id}` },
    };
  }
}
