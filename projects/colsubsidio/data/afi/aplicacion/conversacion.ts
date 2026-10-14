import type { GapTecnico } from './gaps';
import { TIPOS_ENTIDAD, type TipoEntidad } from './superficies';
import {
  CLAVES_REGLA, incorporarRegla, resolverRegla,
  type AlcanceRegla, type AlmacenReglas, type ClaveRegla, type ContextoRegla, type ReglaFuncional,
} from './reglas';

/**
 * FLUJO CONVERSACIONAL DEL AGENTE (Fase 4J). Contrato independiente de DefinicionCasoAfi.
 * Dos salidas no generables, para AUDIENCIAS distintas:
 *  - CLARIFICATION_REQUIRED -> analista QA, lenguaje funcional, se resuelve conversando.
 *  - FRAMEWORK_GAP          -> equipo de automatización, capability técnica faltante; NUNCA se pregunta al QA.
 * Correspondencia con el protocolo actual del manifest: INFORMACION_INSUFICIENTE -> CLARIFICATION_REQUIRED,
 * CAPABILITY_GAP -> FRAMEWORK_GAP. Capa pura (sin API de IA).
 */

export const SALIDA_CONVERSACIONAL_DESDE_PROTOCOLO = {
  GENERABLE: 'GENERABLE',
  INFORMACION_INSUFICIENTE: 'CLARIFICATION_REQUIRED',
  KNOWLEDGE_GAP: 'KNOWLEDGE_GAP',
  TESTABILITY_GAP: 'TESTABILITY_GAP',
  CAPABILITY_GAP: 'FRAMEWORK_GAP',
} as const;

export const TIPOS_CLARIFICACION = ['regla-negocio', 'dato-prueba', 'condicion', 'resultado-observable', 'alcance'] as const;
export type TipoClarificacion = typeof TIPOS_CLARIFICACION[number];

export interface ClarificacionAgente {
  id: string;
  /** Pregunta corta, en lenguaje funcional, para un analista QA. */
  pregunta: string;
  /** Por qué se necesita (qué no definen las fuentes). */
  motivo: string;
  tipo: TipoClarificacion;
  opciones?: { valor: string; etiqueta: string }[];
  /** Dónde valdría la respuesta; el analista puede confirmarlo o acotarlo. */
  alcanceSugerido: AlcanceRegla;
  /** Si impide generar el caso. */
  bloquea: boolean;
  /** Solo reglas de negocio persistibles: clave del catálogo de reglas. */
  clave?: ClaveRegla;
}

export interface GapFramework { paso: string; requisito: string; capabilityFaltante: string; familia: string }

export type SalidaAgente =
  | { resultado: 'GENERABLE'; definicion: unknown }
  | { resultado: 'CLARIFICATION_REQUIRED'; audiencia: 'analista-qa'; clarificaciones: ClarificacionAgente[] }
  | { resultado: 'FRAMEWORK_GAP'; audiencia: 'automatizacion'; gaps: GapFramework[] }
  /**
   * 4L: PASS/FAIL está definido, pero ninguna superficie tiene proveedor para observarlo. Gaps ya deduplicados
   * (varias ocurrencias de la misma capacidad = un gap técnico). Nunca se convierte en pregunta para QA.
   */
  | { resultado: 'TESTABILITY_GAP'; audiencia: 'automatizacion'; gaps: GapTecnico[] }
  /**
   * 4M: entidades claramente identificadas que aún no están en el Application Model. Se DECLARAN, no se programan:
   * no es una capability ni una pregunta para QA.
   */
  | { resultado: 'KNOWLEDGE_GAP'; audiencia: 'modelo-aplicacion'; entidades: { paso: string; entidad: string; tipo: TipoEntidad; conocimientoFaltante: string }[] };

/** Vocabulario técnico que nunca debe llegar al analista QA. */
const JERGA = /capabilit|familia|operaci[oó]n|orquestaci[oó]n|manifest|json|runner|selector|locator|contrato|framework|\bgap\b|playwright|backlog|schema|DefinicionCaso/i;

export function validarSalidaAgente(s: SalidaAgente): string[] {
  const p: string[] = [];
  if (s.resultado === 'CLARIFICATION_REQUIRED') {
    if (s.audiencia !== 'analista-qa') p.push('una aclaración se dirige al analista QA');
    if (!s.clarificaciones.length) p.push('sin aclaraciones');
    const ids = new Set<string>();
    for (const c of s.clarificaciones) {
      if (ids.has(c.id)) p.push(`${c.id}: id duplicado`);
      ids.add(c.id);
      if (!(TIPOS_CLARIFICACION as readonly string[]).includes(c.tipo)) p.push(`${c.id}: tipo desconocido`);
      if (!c.pregunta.trim().endsWith('?')) p.push(`${c.id}: la pregunta debe ser una pregunta`);
      if (c.pregunta.length > 200) p.push(`${c.id}: pregunta demasiado larga para un analista`);
      for (const t of [c.pregunta, c.motivo, ...(c.opciones ?? []).map(o => o.etiqueta)]) if (JERGA.test(t)) p.push(`${c.id}: lenguaje técnico en texto para QA`);
      if (c.opciones && new Set(c.opciones.map(o => o.valor)).size !== c.opciones.length) p.push(`${c.id}: opciones repetidas`);
      if (c.clave) {
        if (c.tipo !== 'regla-negocio') p.push(`${c.id}: solo una regla de negocio se persiste como regla`);
        const valores = CLAVES_REGLA[c.clave]?.valores as readonly string[] | undefined;
        if (!valores) p.push(`${c.id}: clave de regla desconocida`);
        else if (c.opciones?.some(o => !valores.includes(o.valor))) p.push(`${c.id}: opción fuera de los valores de la regla`);
      }
    }
  }
  if (s.resultado === 'KNOWLEDGE_GAP') {
    if (s.audiencia !== 'modelo-aplicacion') p.push('un gap de conocimiento se dirige a quien mantiene el Application Model');
    if (!s.entidades.length) p.push('sin entidades');
    for (const e of s.entidades) {
      if (!(TIPOS_ENTIDAD as readonly string[]).includes(e.tipo)) p.push(`${e.entidad}: tipo de entidad desconocido`);
      if (!e.entidad.trim() || !e.conocimientoFaltante.trim()) p.push(`${e.entidad}: entidad y conocimiento faltante requeridos`);
      // Es conocimiento declarativo: nunca pedir implementación ni llamarlo capability.
      if (/implement|programa|c[oó]digo|capabilit|provider|proveedor/i.test(e.conocimientoFaltante)) p.push(`${e.entidad}: un gap de conocimiento no pide implementación`);
    }
    if ('clarificaciones' in s) p.push('un gap de conocimiento nunca lleva preguntas para QA');
  }
  if (s.resultado === 'TESTABILITY_GAP') {
    if (s.audiencia !== 'automatizacion') p.push('un gap de testabilidad se dirige al equipo de automatización');
    if (!s.gaps.length) p.push('sin gaps');
    if (s.gaps.some(g => g.clase !== 'provider-superficie')) p.push('un gap de testabilidad es de proveedor/superficie');
    if (new Set(s.gaps.map(g => g.idSemantico)).size !== s.gaps.length) p.push('gaps sin deduplicar');
    if ('clarificaciones' in s) p.push('un gap técnico nunca lleva preguntas para QA');
  }
  if (s.resultado === 'FRAMEWORK_GAP') {
    if (s.audiencia !== 'automatizacion') p.push('un gap técnico se dirige al equipo de automatización');
    if (!s.gaps.length) p.push('sin gaps');
    if ('clarificaciones' in s) p.push('un gap técnico nunca lleva preguntas para QA');
  }
  return p;
}

/** Mensaje para el analista QA. Un FRAMEWORK_GAP NO produce preguntas funcionales: devuelve undefined. */
export function mensajeParaQa(s: SalidaAgente): string | undefined {
  if (s.resultado !== 'CLARIFICATION_REQUIRED') return undefined;
  const n = s.clarificaciones.length;
  return [`Necesito confirmar ${n} ${n === 1 ? 'cosa' : 'cosas'} antes de generar este caso.`, '',
    ...s.clarificaciones.map((c, i) => `${i + 1}. ${c.pregunta}${c.opciones ? ` (${c.opciones.map(o => o.etiqueta).join(' / ')})` : ''}`)].join('\n');
}

/** Solo aclaraciones cuya respuesta aún no está en el conocimiento persistido para este contexto. */
export function aclaracionesPendientes(clarificaciones: readonly ClarificacionAgente[], almacen: AlmacenReglas, contexto: ContextoRegla): ClarificacionAgente[] {
  return clarificaciones.filter(c => !c.clave || !resolverRegla(almacen, c.clave, contexto));
}

// ---------- Respuestas -> contexto estructurado para el compilador del agente ----------

export interface RespuestaClarificacion {
  clarificacionId: string;
  valor: string;
  /** Texto humano de la respuesta (se guarda tal cual en la regla). */
  texto: string;
  /** Alcance confirmado por el analista (por defecto, el sugerido). */
  alcance?: AlcanceRegla;
}

export interface ContextoAclaradoAgente {
  version: 'afi-contexto-aclarado/v1';
  /** Reglas de negocio aplicables a este contexto (persistidas o recién confirmadas). */
  reglas: { clave: ClaveRegla; valor: string; texto: string; alcance: AlcanceRegla }[];
  /** Respuestas que solo valen para este caso (datos de prueba, condiciones, resultados observables, alcance). */
  respuestasDeCaso: { pregunta: string; tipo: TipoClarificacion; valor: string; texto: string }[];
}

/**
 * Incorpora respuestas: las reglas de negocio se persisten (con su alcance) en una NUEVA versión del almacén;
 * el resto queda solo en el contexto del caso. Devuelve el contexto para reenviar al compilador del agente.
 */
export function aplicarRespuestas(
  clarificaciones: readonly ClarificacionAgente[],
  respuestas: readonly RespuestaClarificacion[],
  almacen: AlmacenReglas,
  contexto: ContextoRegla,
  auditoria: { fecha: string; referencia: string },
): { almacen: AlmacenReglas; contexto: ContextoAclaradoAgente } {
  let actual = almacen;
  const respuestasDeCaso: ContextoAclaradoAgente['respuestasDeCaso'] = [];
  for (const r of respuestas) {
    const c = clarificaciones.find(x => x.id === r.clarificacionId);
    if (!c) throw new Error(`Respuesta a una aclaración inexistente: ${r.clarificacionId}`);
    if (c.opciones && !c.opciones.some(o => o.valor === r.valor)) throw new Error(`${c.id}: la respuesta no es una de las opciones`);
    if (c.clave) {
      actual = incorporarRegla(actual, {
        clave: c.clave, valor: r.valor, texto: r.texto, alcance: r.alcance ?? c.alcanceSugerido,
        fuente: { tipo: 'aclaracion-qa', referencia: auditoria.referencia }, fecha: auditoria.fecha,
      });
    } else respuestasDeCaso.push({ pregunta: c.pregunta, tipo: c.tipo, valor: r.valor, texto: r.texto });
  }
  const faltan = clarificaciones.filter(c => c.bloquea && !respuestas.some(r => r.clarificacionId === c.id));
  if (faltan.length) throw new Error(`Faltan respuestas bloqueantes: ${faltan.map(c => c.id).join(', ')}`);
  const reglas = (Object.keys(CLAVES_REGLA) as ClaveRegla[])
    .map(clave => resolverRegla(actual, clave, contexto))
    .filter((r): r is ReglaFuncional => !!r)
    .map(r => ({ clave: r.clave, valor: r.valor, texto: r.texto, alcance: r.alcance }));
  return { almacen: actual, contexto: { version: 'afi-contexto-aclarado/v1', reglas, respuestasDeCaso } };
}
