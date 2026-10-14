import type { FuenteTareasPendientes } from '../data/afi/aplicacion/proveedorTareasPendientes';
import { ObservacionNoDisponibleError } from '../data/afi/aplicacion/superficies';
import type { BizagiQaSupport } from './bizagiQaSupport';

/**
 * Fuente REAL de tareas pendientes (Fase 4R): adapta Admin → Casos de BizagiQaSupport (solo lectura) al puerto de
 * ProveedorTareasPendientes. Solo observa el caso que el soporte administra (el creado por esta corrida).
 *
 * Clasificación por ETAPA (los mensajes originales nunca se propagan: pueden llevar el número de caso):
 *  - no se obtiene la sesión administrativa       -> autenticacion
 *  - sin caso correlacionado o correlación ambigua -> dato-ausente
 *  - cualquier otro fallo con sesión (red, propagación, UI) -> infraestructura
 */
export class FuenteTareasBizagiQa implements FuenteTareasPendientes {
  constructor(private readonly soporte: Pick<BizagiQaSupport, 'login' | 'actividades' | 'casoAdministrado'>) {}

  casoAdministrado(): string | undefined {
    return this.soporte.casoAdministrado();
  }

  async tareasPendientes(): Promise<readonly string[]> {
    if (!this.soporte.casoAdministrado()) throw new ObservacionNoDisponibleError('dato-ausente');
    try { await this.soporte.login(); } catch { throw new ObservacionNoDisponibleError('autenticacion'); }
    try {
      return await this.soporte.actividades();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : '';
      throw new ObservacionNoDisponibleError(/^Correlación ambigua/.test(mensaje) ? 'dato-ausente' : 'infraestructura');
    }
  }
}
