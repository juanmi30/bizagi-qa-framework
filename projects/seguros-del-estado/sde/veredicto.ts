import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * Veredicto GLOBAL de una ejecución E2E de SDE (H1 + auditoría de Work, P1). Playwright considera "passed" una corrida
 * con pruebas skipped; para SDE un BLOCKED es un CP que no se probó. El tipo de ejecución lo fija SDE_TIPO_EJECUCION:
 *
 *  - certificacion (por defecto): SATISFACTORIO solo si TODOS los CP E2E seleccionados están en REAL_PASS. Cualquier
 *    REAL_PASS_PARCIAL, BLOCKED, FAIL u omitido → NO SATISFACTORIO y la corrida termina con código distinto de cero.
 *    Ningún CP ejecutado → NO CONCLUYENTE (también error). Pedida EXPLÍCITAMENTE sin CP seleccionados → NO CONCLUYENTE.
 *  - diagnostico | precreacion | exploracion (solo si se pide explícitamente): nunca certifican ni se anuncian
 *    satisfactorias; el código de salida es el de Playwright (errores técnicos, parciales y FAIL), sin forzarlo.
 *  - Valor desconocido: la corrida falla (no se adivina el modo).
 *
 * El veredicto no cambia el estado de ningún CP en JUnit: un BLOCKED sigue siendo skipped con su causa (no se convierte
 * en defecto del producto); lo que cambia es el resultado GLOBAL (código de salida + veredicto-e2e.json). Solo aplica si
 * la corrida incluye pruebas E2E (@e2e): una corrida solo de @unit no se toca. Sin datos sensibles.
 */

export const TIPOS_EJECUCION = ['certificacion', 'diagnostico', 'precreacion', 'exploracion'] as const;
export type TipoEjecucion = typeof TIPOS_EJECUCION[number];

export interface ModoEjecucion { tipo: TipoEjecucion; explicito: boolean; error?: string }

/** Lee SDE_TIPO_EJECUCION. Sin valor → certificación (implícita). Valor desconocido → error. */
export function modoEjecucion(env: Record<string, string | undefined> = process.env): ModoEjecucion {
  const valor = (env.SDE_TIPO_EJECUCION ?? '').trim().toLowerCase();
  if (!valor) return { tipo: 'certificacion', explicito: false };
  if ((TIPOS_EJECUCION as readonly string[]).includes(valor)) return { tipo: valor as TipoEjecucion, explicito: true };
  return { tipo: 'certificacion', explicito: true, error: `SDE_TIPO_EJECUCION="${valor}" no es válido (usa: ${TIPOS_EJECUCION.join(', ')}).` };
}

export interface ResultadoE2e { titulo: string; status: TestResult['status']; funcional?: string; causas: string[]; atribucion?: string }

export interface Veredicto {
  aplica: boolean;
  tipo_ejecucion: TipoEjecucion;
  certifica: boolean;
  total_e2e: number;
  por_estado: Record<string, number>;
  por_causa: Record<string, number>;
  ejecutados: number;
  aprobados: number;
  no_concluyente: boolean;
  satisfactorio: boolean;
  /** La corrida debe terminar con código distinto de cero aunque Playwright no tenga pruebas failed. */
  falla_corrida: boolean;
  motivo: string;
}

const EJECUTADOS = new Set(['REAL_PASS', 'REAL_PASS_PARCIAL', 'FAIL']);

export function calcularVeredicto(resultados: ResultadoE2e[], modo: ModoEjecucion = { tipo: 'certificacion', explicito: false }): Veredicto {
  const por_estado: Record<string, number> = {};
  const por_causa: Record<string, number> = {};
  for (const r of resultados) {
    // Sin anotación funcional (p. ej. error antes de ejecutar) no se adivina: se cuenta aparte.
    const e = r.funcional ?? (r.status === 'skipped' ? 'OMITIDO_SIN_ESTADO' : r.status === 'passed' ? 'PASSED_SIN_ESTADO' : 'ERROR_SIN_ESTADO');
    por_estado[e] = (por_estado[e] ?? 0) + 1;
    for (const c of r.causas) por_causa[c] = (por_causa[c] ?? 0) + 1;
  }
  const total = resultados.length;
  const ejecutados = resultados.filter((r) => r.funcional && EJECUTADOS.has(r.funcional)).length;
  const aprobados = resultados.filter((r) => r.funcional === 'REAL_PASS' && r.status === 'passed').length;
  const certifica = modo.tipo === 'certificacion' && !modo.error;
  const base = { tipo_ejecucion: modo.tipo, certifica, total_e2e: total, por_estado, por_causa, ejecutados, aprobados };
  const resumen = Object.entries(por_estado).map(([k, v]) => `${k}=${v}`).join(', ');

  if (modo.error) {
    return { ...base, aplica: true, no_concluyente: true, satisfactorio: false, falla_corrida: true, motivo: `NO CONCLUYENTE: ${modo.error}` };
  }
  if (total === 0) {
    // Una certificación pedida explícitamente sin CP seleccionados no certifica nada. Sin pedirla, no hay E2E: no aplica.
    if (certifica && modo.explicito) {
      return { ...base, aplica: true, no_concluyente: true, satisfactorio: false, falla_corrida: true,
        motivo: 'NO CONCLUYENTE: certificación sin CP E2E seleccionados; no se certificó nada.' };
    }
    return { ...base, aplica: false, no_concluyente: false, satisfactorio: false, falla_corrida: false, motivo: 'Sin pruebas E2E en esta corrida: el veredicto funcional no aplica.' };
  }
  const no_concluyente = ejecutados === 0;
  if (!certifica) {
    return { ...base, aplica: true, no_concluyente, satisfactorio: false, falla_corrida: false,
      motivo: `${modo.tipo.toUpperCase()} (no es una certificación; nunca es satisfactoria): ${ejecutados}/${total} CP ejecutados, ${aprobados} en REAL_PASS (${resumen}).` };
  }
  const satisfactorio = aprobados === total;
  const motivo = no_concluyente ? `NO CONCLUYENTE: ninguno de los ${total} CP E2E se ejecutó contra QA (${resumen}). Una corrida sin ejecuciones no es un resultado satisfactorio.`
    : satisfactorio ? `SATISFACTORIO: ${aprobados}/${total} CP E2E en REAL_PASS.`
      : `NO SATISFACTORIO: ${aprobados}/${total} CP E2E en REAL_PASS (${resumen}). La certificación exige REAL_PASS en todos los CP seleccionados.`;
  return { ...base, aplica: true, no_concluyente, satisfactorio, falla_corrida: !satisfactorio, motivo };
}

const esE2e = (t: TestCase) => t.tags.includes('@e2e') || /(^|\s)@e2e(\s|$)/.test(t.title);

/** Reporter de Playwright: registra cada CP E2E y, al final, escribe el veredicto y fuerza failed si no es satisfactorio. */
export default class VeredictoSde implements Reporter {
  private readonly resultados = new Map<string, ResultadoE2e>();
  constructor(private readonly opciones: { salida?: string } = {}) {}

  onTestEnd(test: TestCase, result: TestResult): void {
    if (!esE2e(test)) return;
    const anot = [...test.annotations, ...(result.annotations ?? [])];
    const valor = (tipo: string) => anot.filter((a) => a.type === tipo).map((a) => a.description ?? '');
    this.resultados.set(test.id, {
      titulo: test.title, status: result.status, funcional: valor('resultado_funcional').at(-1),
      causas: [...new Set(valor('causa'))], atribucion: valor('atribucion').at(-1),
    });
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | undefined> {
    const v = calcularVeredicto([...this.resultados.values()], modoEjecucion());
    if (!v.aplica) return undefined;
    const salida = this.opciones.salida ?? process.env.SDE_VEREDICTO_SALIDA ?? resolve(process.cwd(), 'test-results', process.env.PROJECT ?? 'seguros-del-estado', 'veredicto-e2e.json');
    mkdirSync(dirname(salida), { recursive: true });
    writeFileSync(salida, JSON.stringify({ fecha: new Date().toISOString(), estado_playwright: result.status, ...v }, null, 2) + '\n', 'utf8');
    console.log(`\n[SDE] Veredicto E2E: ${v.motivo}\n`);
    return v.falla_corrida && result.status === 'passed' ? { status: 'failed' } : undefined;
  }
}
