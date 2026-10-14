import { MODELO_APLICACION_AFI, resolverEntidad, superficiesEfectivas, type ModeloAplicacion, type VinculoObservacion } from './modeloAplicacion';
import {
  PROVEEDORES_PRODUCTIVOS,
  type CondicionObservable, type Expectativa, type ReferenciaEntidad, type SuperficieObservacion,
} from './superficies';
import { CATALOGO_PROVEEDORES, VINCULOS_OBSERVACION_AFI, estadoProveedor } from './vinculos';

/**
 * RESOLUCIÓN DE CONDICIONES OBSERVABLES EN COMPILACIÓN (Fase 4R.1). Capa pura.
 *
 *   condición del caso (entidad + expectativa)
 *     -> entidad registrada (si no: KNOWLEDGE_GAP)
 *     -> superficies efectivas (solo portal-ui: CAPABILITY_GAP, se certifica con funcional.operaciones)
 *     -> vínculo APROBADO en una superficie efectiva (si no: TESTABILITY_GAP sin-vinculo)
 *     -> proveedor del vínculo que CERTIFICA la expectativa (si no: TESTABILITY_GAP expectativa-no-certificable)
 *     -> proveedor HABILITADO: por defecto solo los productivos (si no: TESTABILITY_GAP proveedor-no-productivo)
 *
 * Nada aquí mira el actor, el perfil, los datos de prueba ni el resultado esperado del paso.
 */

export interface TestabilidadCompilacion {
  modelo: ModeloAplicacion;
  vinculos: readonly VinculoObservacion[];
  /** Proveedores que esta compilación puede usar. Canónico: SOLO los productivos. */
  proveedoresHabilitados: readonly string[];
  /** Ids productivos para marcar `validacion`. Por defecto PROVEEDORES_PRODUCTIVOS (solo pruebas lo sustituyen). */
  productivos?: readonly string[];
}

export const testabilidadCanonica = (): TestabilidadCompilacion => ({
  modelo: MODELO_APLICACION_AFI, vinculos: VINCULOS_OBSERVACION_AFI, proveedoresHabilitados: PROVEEDORES_PRODUCTIVOS.map(p => p.id),
});

export type MotivoTestabilidad = 'sin-vinculo' | 'expectativa-no-certificable' | 'proveedor-no-productivo';

interface Ubicacion { paso: string; condicion: string }

export type CondicionResuelta = Ubicacion & {
  estado: 'REPRESENTABLE';
  entidad: ReferenciaEntidad;
  expectativa: Expectativa;
  superficie: SuperficieObservacion;
  proveedor: string;
  /** true: el proveedor está implementado pero NO es productivo (solo una corrida de validación lo habilita). */
  validacion: boolean;
};

export type GapCondicion = Ubicacion & {
  estado: 'KNOWLEDGE_GAP' | 'TESTABILITY_GAP' | 'CAPABILITY_GAP';
  entidad: ReferenciaEntidad;
  expectativa: Expectativa['tipo'];
  capacidad: string;
  motivo?: MotivoTestabilidad;
};

export type ResolucionCondicion = CondicionResuelta | GapCondicion | (Ubicacion & { estado: 'INVALIDA'; motivo: string });

export function resolverCondicion(paso: string, indice: number, c: Pick<CondicionObservable, 'entidad' | 'expectativa'>, t: TestabilidadCompilacion): ResolucionCondicion {
  const u: Ubicacion = { paso, condicion: `${paso}#${indice + 1}` };
  const base = { ...u, entidad: { tipo: c.entidad.tipo, id: c.entidad.id }, expectativa: c.expectativa.tipo };
  const r = resolverEntidad(t.modelo, c.entidad);
  if (r.estado === 'tipo-incorrecto') return { ...u, estado: 'INVALIDA', motivo: `${c.entidad.id} es ${r.tipoReal}, no ${c.entidad.tipo}` };
  if (r.estado === 'no-registrada') return { ...base, estado: 'KNOWLEDGE_GAP', capacidad: `registrar ${c.entidad.tipo}` };
  const efectivas = superficiesEfectivas(t.modelo, c.entidad);
  if (efectivas.every(s => s === 'portal-ui')) {
    return { ...base, estado: 'CAPABILITY_GAP', capacidad: `certificar ${c.entidad.tipo} con una operación funcional del Portal` };
  }
  const candidatos = t.vinculos.filter(v => v.entidad.tipo === c.entidad.tipo && v.entidad.id === c.entidad.id
    && efectivas.includes(v.superficie) && Object.prototype.hasOwnProperty.call(CATALOGO_PROVEEDORES, v.proveedor));
  if (!candidatos.length) return { ...base, estado: 'TESTABILITY_GAP', motivo: 'sin-vinculo', capacidad: `vincular ${c.entidad.tipo} a un proveedor` };
  const certifican = candidatos.filter(v => CATALOGO_PROVEEDORES[v.proveedor].expectativas.includes(c.expectativa.tipo));
  if (!certifican.length) {
    return { ...base, estado: 'TESTABILITY_GAP', motivo: 'expectativa-no-certificable', capacidad: `observar ${c.entidad.tipo} ${c.expectativa.tipo}` };
  }
  const elegido = certifican.find(v => t.proveedoresHabilitados.includes(v.proveedor));
  if (!elegido) return { ...base, estado: 'TESTABILITY_GAP', motivo: 'proveedor-no-productivo', capacidad: `validar en QA real ${certifican[0].proveedor}` };
  return {
    ...u, estado: 'REPRESENTABLE', entidad: base.entidad, expectativa: JSON.parse(JSON.stringify(c.expectativa)),
    superficie: elegido.superficie, proveedor: elegido.proveedor, validacion: estadoProveedor(elegido.proveedor, t.productivos?.map(id => ({ id }))) !== 'productivo',
  };
}

/** Condición observable (4L) de una condición resuelta: el id es el del paso, nunca algo del proveedor. */
export const condicionObservable = (c: CondicionResuelta): CondicionObservable => ({ id: c.condicion, entidad: c.entidad, expectativa: c.expectativa });
