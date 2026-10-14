import { resolverEntidad, superficiesEfectivas, type ModeloAplicacion } from './modeloAplicacion';
import {
  CondicionInvalidaError, MOTIVOS_NO_OBSERVABLE, ObservacionNoDisponibleError, evaluarExpectativa, medicionCompatible, proveedorCertifica,
  validarCondicion, validarContexto,
  type CondicionObservable, type ContextoObservacion, type Medicion, type MotivoNoObservable, type ObservationProvider,
  type ResultadoObservacion, type SuperficieObservacion,
} from './superficies';

/**
 * Observación de una condición RESPETANDO el Application Model (Fase 4M). Pura salvo el proveedor inyectado.
 *
 * - Solo se usan las superficies EFECTIVAS de la entidad (superficiesEfectivas): un proveedor fuera de ellas no puede
 *   observarla aunque su supports() la acepte (fail-closed).
 * - La preferencia solo ORDENA superficies efectivas; una superficie no declarada en la preferencia se ignora.
 * - Sin proveedor: NO_OBSERVABLE con gap provider-superficie que conserva TODAS las superficies candidatas.
 * - Entidad no registrada: NO_OBSERVABLE con gap conocimiento-declarativo. Otro tipo: CondicionInvalidaError.
 *
 * Fail-closed (4R):
 * - Un proveedor solo se elige si CERTIFICA la expectativa (proveedorCertifica), no solo la entidad.
 * - Un proveedor que no puede medir (infraestructura, autenticación, dato ausente) o que falla da NO_OBSERVABLE con el
 *   motivo, nunca FAIL; se intenta la siguiente superficie efectiva. Sus mensajes de error nunca se copian (PII).
 * - Una medición de tipo incompatible con la expectativa es error-proveedor, no FAIL.
 * - El contexto solo admite identidad de ejecución y correlación runtime (validarContexto): ningún actorRef.
 */
export async function observarCondicion(
  condicion: CondicionObservable,
  modelo: ModeloAplicacion,
  proveedores: readonly ObservationProvider[],
  contexto: ContextoObservacion,
  preferencia: readonly SuperficieObservacion[] = [],
): Promise<ResultadoObservacion> {
  validarCondicion(condicion);
  validarContexto(contexto);
  const base = { condicion: condicion.id, entidad: condicion.entidad, expectativa: condicion.expectativa };
  const r = resolverEntidad(modelo, condicion.entidad);
  if (r.estado === 'tipo-incorrecto') throw new CondicionInvalidaError(`${condicion.entidad.id} es ${r.tipoReal}, no ${condicion.entidad.tipo}`);
  if (r.estado === 'no-registrada') {
    return { ...base, resultado: 'NO_OBSERVABLE', gap: { clase: 'conocimiento-declarativo', superficiesCandidatas: [], capacidad: `registrar ${condicion.entidad.tipo}` } };
  }
  const efectivas = superficiesEfectivas(modelo, condicion.entidad);
  const orden = [...preferencia.filter(s => efectivas.includes(s)), ...efectivas.filter(s => !preferencia.includes(s))];
  const intentos: NonNullable<ResultadoObservacion['noObservado']>['intentos'] = [];
  for (const s of orden) {
    const p = proveedores.find(x => x.superficie === s && proveedorCertifica(x, condicion.entidad, condicion.expectativa.tipo));
    if (!p) continue;
    let motivo: MotivoNoObservable;
    try {
      const o = await p.observe(condicion.entidad, contexto);
      if ('medicion' in o && medicionCompatible(condicion.expectativa, o.medicion)) {
        return {
          ...base, resultado: evaluarExpectativa(condicion.expectativa, o.medicion), superficie: s, proveedor: p.id,
          medicion: sinValorObservado(o.medicion), evidencia: o.evidencia,
        };
      }
      motivo = 'noObservable' in o && (MOTIVOS_NO_OBSERVABLE as readonly string[]).includes(o.noObservable) ? o.noObservable : 'error-proveedor';
    } catch (e) {
      motivo = e instanceof ObservacionNoDisponibleError ? e.motivo : 'error-proveedor';
    }
    intentos.push({ superficie: s, proveedor: p.id, motivo });
  }
  if (intentos.length) return { ...base, resultado: 'NO_OBSERVABLE', noObservado: { intentos } };
  return { ...base, resultado: 'NO_OBSERVABLE', gap: { clase: 'provider-superficie', superficiesCandidatas: efectivas, capacidad: capacidadObservacion(condicion, modelo, proveedores) } };
}

/** El valor observado puede ser PII: el resultado publica solo si existía. */
function sinValorObservado(m: Medicion): Medicion {
  return m.tipo === 'valor' ? { tipo: 'valor', existe: m.existe } : m;
}

/**
 * Capacidad faltante, ATÓMICA: si algún proveedor de una superficie efectiva soporta la entidad pero no certifica la
 * expectativa (p. ej. una fuente de instantánea ante una negación), falta observar ESA expectativa, no el tipo entero.
 */
export function capacidadObservacion(
  c: Pick<CondicionObservable, 'entidad' | 'expectativa'>,
  modelo: ModeloAplicacion,
  proveedores: readonly Pick<ObservationProvider, 'superficie' | 'supports'>[],
): string {
  const efectivas = superficiesEfectivas(modelo, c.entidad);
  const parcial = proveedores.some(p => efectivas.includes(p.superficie) && p.supports(c.entidad));
  return parcial ? `observar ${c.entidad.tipo} ${c.expectativa.tipo}` : `observar ${c.entidad.tipo}`;
}
