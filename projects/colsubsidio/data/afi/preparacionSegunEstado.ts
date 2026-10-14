import type { CampoAfi, EtapaAfi, OrigenDato } from './modelo';
import type { PlanPreparacion } from './resolver';

/**
 * Preparación SEGÚN ESTADO (4S-R.1): para pantallas que el Portal puede precargar total o parcialmente (p. ej. la información
 * de la empresa tras la consulta RUES), la decisión de tocar un campo depende de su estado REAL en pantalla, no solo del plan.
 * Puro: sin Playwright ni process.env. El estado llega como booleanos (nunca valores).
 *
 *   ausente                      -> no se actúa
 *   deshabilitado                -> nunca se modifica (si además está vacío, solo se diagnostica)
 *   habilitado, con valor válido -> se conserva (nunca se sobrescribe una precarga válida)
 *   habilitado, vacío o inválido -> se prepara con el dato legítimo del plan; sin dato -> DataGap explícito
 */

export interface EstadoControl { presente: boolean; deshabilitado: boolean; vacio: boolean; invalido: boolean }

export type DecisionSegunEstado = 'ausente' | 'deshabilitado' | 'conservar' | 'preparar' | 'sin-dato';

/** `tieneDato`: el plan trae una resolución legítima (caso, actor, derivada o auxiliar) para el campo. */
export function decidirSegunEstado(estado: EstadoControl, tieneDato: boolean): DecisionSegunEstado {
  if (!estado.presente) return 'ausente';
  if (estado.deshabilitado) return 'deshabilitado';
  if (!estado.vacio && !estado.invalido) return 'conservar';
  return tieneDato ? 'preparar' : 'sin-dato';
}

/** Evidencia segura por campo: identidad SEMÁNTICA, estado booleano, decisión y origen del dato (nunca el valor). */
export interface DiagnosticoEstadoCampo {
  campo: CampoAfi;
  estado: EstadoControl;
  decision: DecisionSegunEstado;
  origen?: OrigenDato;
  /** Estado tras preparar la pantalla (solo si se re-evaluó). */
  final?: EstadoControl;
}

export type MotivoFaltante = 'sin-dato' | 'control-no-declarado';

export interface FaltantePantalla { campo: string; motivo: MotivoFaltante; fuentesEsperadas?: readonly OrigenDato[] }

const EXPLICACION: Record<MotivoFaltante, string> = {
  'sin-dato': 'el Portal lo presenta habilitado y vacío/inválido y no existe un dato legítimo (caso, actor, derivado o auxiliar)',
  'control-no-declarado': 'control habilitado e inválido sin política de preparación (Knowledge/capability pendiente)',
};

/**
 * DataGap EN PANTALLA: solo se conoce al observar el estado real (por eso no bloquea la compilación). El mensaje lleva
 * identidades semánticas (o la identidad pública del control no declarado) y motivos; nunca valores.
 */
export class DataGapPantallaError extends Error {
  constructor(readonly etapa: EtapaAfi, readonly faltantes: readonly FaltantePantalla[]) {
    super(`DataGap en ${etapa}:\n${faltantes.map(f => `- ${f.campo}: ${EXPLICACION[f.motivo]}`
      + (f.fuentesEsperadas?.length ? `. Fuentes aceptadas: ${f.fuentesEsperadas.join(', ')}` : '')).join('\n')}`);
    this.name = 'DataGapPantallaError';
  }
}

/**
 * ¿La opción del catálogo corresponde al valor del actor? Igual (sin distinguir mayúsculas ni espacios), o la opción empieza por
 * el valor seguido de un separador no alfanumérico (código "4711" -> "4711 - Comercio ..."; nunca "47110 ...").
 */
export function coincideOpcionCatalogo(opcion: string, valor: string): boolean {
  const n = (t: string) => t.replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
  const o = n(opcion), v = n(valor);
  if (!v) return false;
  return o === v || (o.startsWith(v) && /^[^\p{L}\p{N}]/u.test(o.slice(v.length)));
}

/** Igualdad EXACTA tras normalizar únicamente espacios (sin mayúsculas, prefijos, contains ni similitud). */
export function coincideExacta(opcion: string, valor: string): boolean {
  const n = (t: string) => t.replace(/\s+/g, ' ').trim();
  return n(valor) !== '' && n(opcion) === n(valor);
}

/** Regla declarada por la capability -> comparador. */
export function reglaCoincidencia(regla: 'exacta' | 'codigo-catalogo'): (opcion: string, valor: string) => boolean {
  return regla === 'exacta' ? coincideExacta : coincideOpcionCatalogo;
}

/** Fecha declarada (dd/mm/aaaa) -> ISO aaaa-mm-dd; undefined si no tiene ese formato o no es una fecha real del calendario. */
export function fechaIso(valor: string, formato: 'dd/mm/aaaa'): string | undefined {
  if (formato !== 'dd/mm/aaaa') return undefined;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!m) return undefined;
  const [, d, mes, a] = m;
  const f = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d)));
  return f.getUTCFullYear() === Number(a) && f.getUTCMonth() === Number(mes) - 1 && f.getUTCDate() === Number(d) ? `${a}-${mes}-${d}` : undefined;
}

/** Fuentes aceptadas para un campo sin dato, tomadas del gap condicional del plan (si existe). */
export function fuentesDe(plan: PlanPreparacion, campo: CampoAfi): readonly OrigenDato[] | undefined {
  return plan.condicionales?.find(g => g.campo === campo)?.fuentesEsperadas;
}

/** Faltantes tras preparar: campos del plan aún habilitados y vacíos/inválidos sin dato. */
export function faltantesSegunEstado(plan: PlanPreparacion, diagnosticos: readonly DiagnosticoEstadoCampo[]): FaltantePantalla[] {
  return diagnosticos
    .filter(d => d.decision === 'sin-dato' && d.final && decidirSegunEstado(d.final, false) === 'sin-dato')
    .map(d => ({ campo: d.campo, motivo: 'sin-dato' as const, ...(fuentesDe(plan, d.campo) ? { fuentesEsperadas: fuentesDe(plan, d.campo) } : {}) }));
}
