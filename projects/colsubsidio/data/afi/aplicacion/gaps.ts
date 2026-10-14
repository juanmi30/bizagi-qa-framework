import { resolverEntidad, superficiesEfectivas, type ModeloAplicacion } from './modeloAplicacion';
import { capacidadObservacion } from './observacion';
import {
  EXPECTATIVAS_POR_ENTIDAD, TIPOS_ENTIDAD, proveedorCertifica,
  type CondicionObservable, type ObservationProvider, type SuperficieObservacion, type TipoEntidad,
} from './superficies';

/**
 * DIAGNÓSTICO DE TESTABILIDAD Y TAXONOMÍA DE GAPS (Fases 4L/4M). Capa pura.
 *
 * Precedencia (4M), por requisito:
 *  1. ¿Está definido QUÉ significa PASS/FAIL (entidad y expectativa)?        NO -> INFORMACION_INSUFICIENTE (para QA)
 *  2. ¿La entidad, con tipo semántico claro, está en el Application Model?     NO -> KNOWLEDGE_GAP (declarar, no programar)
 *  3. ¿Alguna superficie EFECTIVA tiene proveedor productivo que la observe?   NO -> TESTABILITY_GAP (automatización)
 *  4. ¿Existen las interacciones/orquestación que el requisito necesita?       NO -> CAPABILITY_GAP (automatización)
 *  5. Todo existe -> REPRESENTABLE.
 * KNOWLEDGE_GAP y TESTABILITY_GAP nunca se convierten en preguntas para QA.
 */

// ---------- Taxonomía de gaps (extensible, sin forzar familias viejas) ----------

export const CLASES_GAP = {
  'conocimiento-declarativo': { runtime: false, descripcion: 'Falta registrar una entidad, campo compatible o regla: se declara, no se programa.' },
  'provider-superficie': { runtime: true, descripcion: 'La condición está definida pero ninguna superficie efectiva tiene proveedor que la observe.' },
  'operacion-interaccion': { runtime: true, descripcion: 'Falta una forma de ACTUAR sobre el sistema (nuevo tipo de interacción).' },
  orquestacion: { runtime: true, descripcion: 'Falta orquestar el plan (condicionales, valores reutilizados, múltiples contextos).' },
} as const;
export type ClaseGap = keyof typeof CLASES_GAP;

/** Una ocurrencia: dónde apareció el gap. */
export interface OcurrenciaGap { hu: string; caso: string; paso?: string; condicion?: string }

export interface GapDetectado {
  clase: ClaseGap;
  /** Capacidad técnica que falta, en términos genéricos (p. ej. "observar ruta"). */
  capacidad: string;
  /** TODAS las superficies candidatas (efectivas) donde un proveedor la resolvería; vacío si no aplica. */
  superficiesCandidatas?: SuperficieObservacion[];
  /** Familia de backlog SOLO si describe honestamente el problema; si no, se omite (nunca se fuerza). */
  familia?: string;
  ocurrencia: OcurrenciaGap;
}

export interface GapTecnico {
  idSemantico: string;
  clase: ClaseGap;
  superficiesCandidatas?: SuperficieObservacion[];
  capacidad: string;
  familia?: string;
  ocurrencias: OcurrenciaGap[];
}

/** Id determinista: clase : superficies candidatas ordenadas (unidas por +) : capacidad normalizada. */
export function idSemanticoGap(g: Pick<GapDetectado, 'clase' | 'capacidad' | 'superficiesCandidatas'>): string {
  const superficies = g.superficiesCandidatas?.length ? [...new Set(g.superficiesCandidatas)].sort().join('+') : 'sin-superficie';
  return [g.clase, superficies, g.capacidad.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')].join(':');
}

/** Deduplicación: N ocurrencias de la misma capacidad sobre las mismas superficies candidatas = UN gap técnico. */
export function deduplicarGaps(detectados: readonly GapDetectado[]): GapTecnico[] {
  const porId = new Map<string, GapTecnico>();
  for (const d of detectados) {
    const idSemantico = idSemanticoGap(d);
    const g = porId.get(idSemantico) ?? {
      idSemantico, clase: d.clase, capacidad: d.capacidad,
      ...(d.superficiesCandidatas?.length ? { superficiesCandidatas: [...new Set(d.superficiesCandidatas)].sort() } : {}),
      ...(d.familia ? { familia: d.familia } : {}), ocurrencias: [],
    };
    g.ocurrencias.push(d.ocurrencia);
    porId.set(idSemantico, g);
  }
  return [...porId.values()].sort((a, b) => a.idSemantico.localeCompare(b.idSemantico));
}

// ---------- Diagnóstico con precedencia ----------

/** Condición tal como la formula el agente; entidad o expectativa pueden faltar si las fuentes no las definen. */
export type CondicionPropuesta = Omit<CondicionObservable, 'entidad' | 'expectativa'> & {
  entidad?: Partial<CondicionObservable['entidad']>;
  expectativa?: CondicionObservable['expectativa'];
};

/** Acción que el requisito necesita además de observar (actuar u orquestar), y si el framework la soporta hoy. */
export interface AccionRequerida { clase: 'operacion-interaccion' | 'orquestacion'; descripcion: string; soportada: boolean }

export type DiagnosticoCondicion =
  | { estado: 'REPRESENTABLE'; superficie: SuperficieObservacion; proveedor: string }
  | { estado: 'INFORMACION_INSUFICIENTE'; falta: 'entidad' | 'expectativa' }
  | { estado: 'KNOWLEDGE_GAP'; entidad: { tipo: TipoEntidad; id: string }; gap: Omit<GapDetectado, 'ocurrencia'> }
  | { estado: 'TESTABILITY_GAP'; entidad: { tipo: TipoEntidad; id: string }; gap: Omit<GapDetectado, 'ocurrencia'> }
  | { estado: 'CAPABILITY_GAP'; gap: Omit<GapDetectado, 'ocurrencia'> }
  /** Error de clase de entidad (p. ej. una ruta usada como pantalla): el requisito está mal formulado, no hay gap. */
  | { estado: 'INVALIDA'; motivo: string };

/** Capas de la precedencia, en orden. STOP en la primera bloqueante: las posteriores no se evalúan (4M.1). */
export type CapaDiagnostico = 'definicion' | 'conocimiento' | 'observabilidad' | 'capacidad';

export function diagnosticarCondicion(
  c: CondicionPropuesta,
  modelo: ModeloAplicacion,
  /** Proveedores PRODUCTIVOS (en pruebas se inyectan los de memoria). */
  proveedores: readonly Pick<ObservationProvider, 'id' | 'superficie' | 'supports' | 'expectativas'>[],
  acciones: readonly AccionRequerida[] = [],
  /** Opcional: registra las capas realmente evaluadas (auditoría del STOP). */
  capas?: CapaDiagnostico[],
): DiagnosticoCondicion {
  // 1. QUÉ significa PASS/FAIL, antes de mirar modelo, superficies o proveedores.
  capas?.push('definicion');
  if (!c.entidad?.tipo || !c.entidad.id?.trim()) return { estado: 'INFORMACION_INSUFICIENTE', falta: 'entidad' };
  if (!c.expectativa) return { estado: 'INFORMACION_INSUFICIENTE', falta: 'expectativa' };
  const tipo = c.entidad.tipo as TipoEntidad;
  if (!(TIPOS_ENTIDAD as readonly string[]).includes(tipo)) return { estado: 'INVALIDA', motivo: `tipo de entidad desconocido ${String(tipo).slice(0, 30)}` };
  if (!EXPECTATIVAS_POR_ENTIDAD[tipo].includes(c.expectativa.tipo)) return { estado: 'INVALIDA', motivo: `la expectativa ${c.expectativa.tipo} no aplica a ${tipo}` };
  const ref = { tipo, id: c.entidad.id };
  // 2. ¿Registrada con ese tipo? Otro tipo = error de clase; no registrada = conocimiento declarativo -> STOP
  //    (no se miran proveedores: nunca KNOWLEDGE_GAP y TESTABILITY_GAP para la misma condición en una pasada).
  capas?.push('conocimiento');
  const r = resolverEntidad(modelo, ref);
  if (r.estado === 'tipo-incorrecto') return { estado: 'INVALIDA', motivo: `${ref.id} es ${r.tipoReal}, no ${tipo}` };
  if (r.estado === 'no-registrada') return { estado: 'KNOWLEDGE_GAP', entidad: ref, gap: { clase: 'conocimiento-declarativo', capacidad: `registrar ${tipo}` } };
  // 3. Observación: solo superficies EFECTIVAS, con proveedor productivo. Sin proveedor -> STOP (no se evalúan acciones).
  capas?.push('observabilidad');
  // (4R) El proveedor debe CERTIFICAR la expectativa, no solo soportar la entidad (misma regla que observarCondicion).
  const efectivas = superficiesEfectivas(modelo, ref);
  const p = efectivas.map(s => proveedores.find(x => x.superficie === s && proveedorCertifica(x, ref, c.expectativa!.tipo))).find(Boolean);
  if (!p) {
    const capacidad = capacidadObservacion({ entidad: ref, expectativa: c.expectativa }, modelo, proveedores);
    return { estado: 'TESTABILITY_GAP', entidad: ref, gap: { clase: 'provider-superficie', superficiesCandidatas: efectivas, capacidad } };
  }
  // 4. Actuar/orquestar lo que el requisito necesita.
  capas?.push('capacidad');
  const faltante = acciones.find(a => !a.soportada);
  if (faltante) return { estado: 'CAPABILITY_GAP', gap: { clase: faltante.clase, capacidad: faltante.descripcion } };
  return { estado: 'REPRESENTABLE', superficie: p.superficie, proveedor: p.id };
}

// ---------- Declarativo vs runtime ----------

export type IncorporacionConocimiento =
  | { tipo: 'entidad'; entidad: TipoEntidad }
  | { tipo: 'campo-compatible' }
  | { tipo: 'regla-funcional' }
  | { tipo: 'proveedor'; superficie: SuperficieObservacion }
  | { tipo: 'superficie' }
  | { tipo: 'operacion-interaccion' }
  | { tipo: 'orquestacion' };

/** Registrar entidades, campos compatibles o reglas NO es un cambio runtime; nuevos mecanismos sí. */
export function clasificarIncorporacion(i: IncorporacionConocimiento): 'declarativo' | 'runtime' {
  return i.tipo === 'entidad' || i.tipo === 'campo-compatible' || i.tipo === 'regla-funcional' ? 'declarativo' : 'runtime';
}
