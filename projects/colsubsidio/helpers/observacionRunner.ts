import type { ModeloAplicacion, VinculoObservacion } from '../data/afi/aplicacion/modeloAplicacion';
import { observarCondicion } from '../data/afi/aplicacion/observacion';
import { ProveedorTareasPendientes } from '../data/afi/aplicacion/proveedorTareasPendientes';
import { condicionObservable, type CondicionResuelta } from '../data/afi/aplicacion/resolucionObservacion';
import type { ContextoObservacion, ObservationProvider, ResultadoObservacion } from '../data/afi/aplicacion/superficies';
import type { BizagiQaSupport } from './bizagiQaSupport';
import { FuenteTareasBizagiQa } from './fuenteTareasBizagiQa';

/**
 * PUENTE RUNNER -> OBSERVATIONPROVIDER (Fase 4R.1). Genérico: no conoce ninguna entidad concreta.
 *
 * - Solo observa condiciones que el COMPILADOR resolvió (proveedor + superficie); cualquier otro proveedor se ignora.
 * - El contexto lleva únicamente la correlación runtime de la corrida (casoBizagi): nunca actor, perfil ni provisión.
 * - Reintenta SOLO `dato-ausente` (una presencia puede aparecer más tarde); infraestructura/autenticación no se insisten.
 * - Veredicto del paso: FAIL si alguna condición FAIL; NO_OBSERVABLE si alguna no se pudo observar; PASS si todas PASS.
 */

export interface ReintentosObservacion { intentos: number; intervaloMs: number }
export const REINTENTOS_POR_DEFECTO: ReintentosObservacion = Object.freeze({ intentos: 1, intervaloMs: 0 });

export async function observarCondicionesPaso(e: {
  condiciones: readonly CondicionResuelta[];
  modelo: ModeloAplicacion;
  proveedores: readonly ObservationProvider[];
  contexto: ContextoObservacion;
  reintentos?: ReintentosObservacion;
  esperar?: (ms: number) => Promise<void>;
}): Promise<ResultadoObservacion[]> {
  const { intentos, intervaloMs } = e.reintentos ?? REINTENTOS_POR_DEFECTO;
  const esperar = e.esperar ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
  const resultados: ResultadoObservacion[] = [];
  for (const c of e.condiciones) {
    // Solo el proveedor que resolvió el compilador, en su superficie.
    const proveedores = e.proveedores.filter(p => p.id === c.proveedor && p.superficie === c.superficie);
    let r = await observarCondicion(condicionObservable(c), e.modelo, proveedores, e.contexto, [c.superficie]);
    for (let n = 1; n < Math.max(1, intentos) && soloDatoAusente(r); n++) {
      await esperar(intervaloMs);
      r = await observarCondicion(condicionObservable(c), e.modelo, proveedores, e.contexto, [c.superficie]);
    }
    resultados.push(r);
  }
  return resultados;
}

const soloDatoAusente = (r: ResultadoObservacion) =>
  r.resultado === 'NO_OBSERVABLE' && !!r.noObservado?.intentos.length && r.noObservado.intentos.every(i => i.motivo === 'dato-ausente');

export function veredictoPaso(resultados: readonly ResultadoObservacion[]): 'PASS' | 'FAIL' | 'NO_OBSERVABLE' {
  if (resultados.some(r => r.resultado === 'FAIL')) return 'FAIL';
  if (resultados.some(r => r.resultado === 'NO_OBSERVABLE')) return 'NO_OBSERVABLE';
  return 'PASS';
}

/** Una condición observada dio FAIL funcional. El mensaje solo lleva ids (nunca valores ni textos de la fuente). */
export class CondicionObservableFallidaError extends Error {
  constructor(readonly paso: string, condiciones: readonly string[]) {
    super(`El paso ${paso} no cumple sus condiciones observables: ${condiciones.join(', ')}`);
    this.name = 'CondicionObservableFallidaError';
  }
}

/**
 * Proveedores REALES que el compilado requiere, construidos sobre el soporte de ESTA corrida. Solo se construyen los ids
 * pedidos; un id sin constructor queda sin proveedor (la observación será NO_OBSERVABLE, nunca otra fuente).
 */
export function proveedoresReales(
  soporte: BizagiQaSupport, requeridos: readonly string[], vinculos: readonly VinculoObservacion[],
): ObservationProvider[] {
  const constructores: Record<string, () => ObservationProvider> = {
    'tareas-pendientes-bizagi': () => new ProveedorTareasPendientes(
      new FuenteTareasBizagiQa(soporte),
      new Map(vinculos.filter(v => v.proveedor === 'tareas-pendientes-bizagi' && v.entidad.tipo === 'actividad').map(v => [v.entidad.id, v.localizacion.nombreTarea])),
    ),
  };
  return [...new Set(requeridos)].filter(id => Object.prototype.hasOwnProperty.call(constructores, id)).map(id => constructores[id]());
}
