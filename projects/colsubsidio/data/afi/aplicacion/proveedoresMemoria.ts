import type {
  ContextoObservacion, EvidenciaObservacion, Medicion, ObservationProvider, ReferenciaEntidad, SuperficieObservacion, TipoEntidad, ValorPrimitivo,
} from './superficies';

/**
 * PROVEEDORES EN MEMORIA (Fase 4L, vertical slice). FICTICIOS: no leen Portal, BPM, integraciones ni canales reales.
 * Sirven para demostrar el contrato ObservationProvider y el formato común de evidencia. Nunca se usan en producción.
 */

interface EstadoMemoria {
  presentes?: Partial<Record<TipoEntidad, readonly string[]>>;
  variables?: Readonly<Record<string, ValorPrimitivo>>;
  integraciones?: Readonly<Record<string, 'exito' | 'error'>>;
}

export class ProveedorMemoria implements ObservationProvider {
  constructor(
    readonly id: string,
    readonly superficie: SuperficieObservacion,
    /** Tipos de entidad que ESTE proveedor sabe medir (fail-closed: el resto no se soporta). */
    private readonly mide: readonly TipoEntidad[],
    private readonly estado: EstadoMemoria,
    /** Ids concretos que conoce; ausente = cualquiera de sus tipos. */
    private readonly conocidos?: readonly string[],
  ) {}

  supports(entidad: ReferenciaEntidad): boolean {
    return this.mide.includes(entidad.tipo) && (!this.conocidos || this.conocidos.includes(entidad.id));
  }

  async observe(entidad: ReferenciaEntidad, contexto: ContextoObservacion): Promise<{ medicion: Medicion; evidencia: EvidenciaObservacion }> {
    if (!this.supports(entidad)) throw new Error(`${this.id} no soporta ${entidad.tipo} ${entidad.id}`);
    const evidencia = { tipo: `registro-${this.superficie}`, referencia: `${contexto.ejecucion}/${this.id}/${entidad.tipo}/${entidad.id}` };
    switch (entidad.tipo) {
      case 'variable': {
        const vars = this.estado.variables ?? {};
        const existe = Object.prototype.hasOwnProperty.call(vars, entidad.id);
        return { medicion: { tipo: 'valor', existe, ...(existe ? { valor: vars[entidad.id] } : {}) }, evidencia };
      }
      case 'integracion':
        return { medicion: { tipo: 'resultado', resultado: this.estado.integraciones?.[entidad.id] ?? 'sin-ejecutar' }, evidencia };
      default:
        return { medicion: { tipo: 'presencia', presente: (this.estado.presentes?.[entidad.tipo] ?? []).includes(entidad.id) }, evidencia };
    }
  }
}
