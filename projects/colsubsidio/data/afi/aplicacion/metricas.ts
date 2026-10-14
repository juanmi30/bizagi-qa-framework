import type { RegistroCampos } from './campos';
import type { SalidaAgente } from './conversacion';
import { CLASES_GAP, type GapTecnico } from './gaps';
import { entidadesDelModelo, type ModeloAplicacion } from './modeloAplicacion';
import type { ResultadoObservacion, SuperficieObservacion } from './superficies';

/**
 * MÉTRICAS DE ESCALABILIDAD por caso generado (Fase 4J). Miden si una HU nueva sobre funcionalidades conocidas
 * se resuelve sin tocar el framework. Sin umbrales todavía (no hay datos suficientes): solo se registran y se
 * evalúa el objetivo arquitectónico cualitativo (0 operaciones nuevas, 0 cambios runtime, una sesión).
 */

export interface MetricasCasoAgente {
  hu: string;
  caso: string;
  /** Interacciones agente -> analista hasta un JSON compilable. */
  sesionesAgente: number;
  preguntasFuncionales: number;
  gapsTecnicos: number;
  camposRegistradosNuevos: string[];
  operacionesNuevas: string[];
  /** Archivos de código del framework modificados (runtime = helpers/runner; registro = declaraciones). */
  cambiosCodigo: { runtime: number; declarativos: number };
  minutosHastaCompilable?: number;
}

/** Cuenta preguntas y gaps de una secuencia de salidas del agente para UN caso. */
export function contarSalidas(salidas: readonly SalidaAgente[]): Pick<MetricasCasoAgente, 'sesionesAgente' | 'preguntasFuncionales' | 'gapsTecnicos'> {
  return {
    sesionesAgente: salidas.length,
    preguntasFuncionales: salidas.reduce((n, s) => n + (s.resultado === 'CLARIFICATION_REQUIRED' ? s.clarificaciones.length : 0), 0),
    // Gaps técnicos ÚNICOS (un TESTABILITY_GAP ya viene deduplicado; sus ocurrencias no multiplican el conteo).
    gapsTecnicos: salidas.reduce((n, s) => n + (s.resultado === 'FRAMEWORK_GAP' || s.resultado === 'TESTABILITY_GAP' ? s.gaps.length : 0), 0),
  };
}

/** Campos añadidos al Field Registry entre dos versiones. */
export const camposNuevos = (antes: RegistroCampos, despues: RegistroCampos) => Object.keys(despues).filter(id => !(id in antes));

/**
 * Registro por FASE del framework (knowledge/afi-metricas-fases.json): qué costó cada evolución. Permite ver con el
 * tiempo si las fases dejan de necesitar operaciones/capabilities nuevas y cambios específicos de HU.
 */
export interface RegistroFaseFramework {
  fase: string;
  fecha: string;
  cambiosRuntime: boolean;
  /** Qué tocó el runtime, si lo tocó (texto humano breve). */
  motivoRuntime?: string;
  operacionesNuevas: number;
  capabilitiesFuncionalesNuevas: number;
  cambiosEspecificosHu: number;
}

export function validarRegistroFases(fases: readonly RegistroFaseFramework[]): string[] {
  const p: string[] = [];
  const ids = new Set<string>();
  for (const f of fases) {
    if (ids.has(f.fase)) p.push(`${f.fase}: fase duplicada`);
    ids.add(f.fase);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) p.push(`${f.fase}: fecha AAAA-MM-DD`);
    if (f.cambiosRuntime && !f.motivoRuntime?.trim()) p.push(`${f.fase}: un cambio runtime declara su motivo`);
    for (const k of ['operacionesNuevas', 'capabilitiesFuncionalesNuevas', 'cambiosEspecificosHu'] as const) {
      if (!Number.isInteger(f[k]) || f[k] < 0) p.push(`${f.fase}: ${k} entero >= 0`);
    }
  }
  return p;
}

// ---------- 4L: métricas multi-superficie ----------

export interface MetricasSuperficies {
  superficiesRequeridas: SuperficieObservacion[];
  providersReutilizados: string[];
  providersNuevos: string[];
  /** Entidades registradas en el Application Model (declarativo: NO cuenta como runtime). */
  entidadesDeclarativasNuevas: number;
  gapsTecnicosUnicos: number;
  ocurrenciasGaps: number;
  /** Objetivo: nuevas entidades sí, pero ningún mecanismo nuevo si las superficies ya tienen proveedor. */
  sinRuntimeNuevo: boolean;
}

export function medirSuperficies(e: {
  resultados: readonly Pick<ResultadoObservacion, 'superficie' | 'proveedor' | 'gap'>[];
  proveedoresPrevios: readonly string[];
  modeloAntes: ModeloAplicacion;
  modeloDespues: ModeloAplicacion;
  gaps: readonly GapTecnico[];
}): MetricasSuperficies {
  const superficies = new Set<SuperficieObservacion>();
  for (const r of e.resultados) {
    if (r.superficie) superficies.add(r.superficie);
    for (const s of r.gap?.superficiesCandidatas ?? []) superficies.add(s);
  }
  for (const g of e.gaps) for (const s of g.superficiesCandidatas ?? []) superficies.add(s);
  const usados = [...new Set(e.resultados.map(r => r.proveedor).filter((p): p is string => !!p))];
  const clave = ([t, id]: [string, string]) => `${t}:${id}`;
  const antes = new Set(entidadesDelModelo(e.modeloAntes).map(clave));
  const providersNuevos = usados.filter(p => !e.proveedoresPrevios.includes(p));
  return {
    superficiesRequeridas: [...superficies].sort(),
    providersReutilizados: usados.filter(p => e.proveedoresPrevios.includes(p)),
    providersNuevos,
    entidadesDeclarativasNuevas: entidadesDelModelo(e.modeloDespues).filter(x => !antes.has(clave(x))).length,
    gapsTecnicosUnicos: e.gaps.length,
    ocurrenciasGaps: e.gaps.reduce((n, g) => n + g.ocurrencias.length, 0),
    sinRuntimeNuevo: providersNuevos.length === 0 && e.gaps.every(g => !CLASES_GAP[g.clase].runtime),
  };
}

export function evaluarObjetivoArquitectonico(m: MetricasCasoAgente) {
  return {
    ceroOperacionesNuevas: m.operacionesNuevas.length === 0,
    ceroCambiosRuntime: m.cambiosCodigo.runtime === 0,
    /** La última sesión fue la que produjo el JSON: todo en una sola conversación con el agente (las aclaraciones incluidas). */
    unaSesionHastaCompilable: m.gapsTecnicos === 0,
    /** Sin umbral: se reporta para acumular datos. */
    preguntasFuncionales: m.preguntasFuncionales,
    soloCambiosDeclarativos: m.cambiosCodigo.runtime === 0 && m.operacionesNuevas.length === 0,
  };
}
