import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * Veredicto de una ejecución E2E de SDE (H1). Playwright considera "passed" una corrida en la que TODO quedó skipped;
 * para SDE eso significa que no se probó nada contra QA. Criterio explícito:
 *  - Solo aplica si la corrida incluye pruebas E2E (@e2e). Una corrida solo de @unit no se toca.
 *  - NO CONCLUYENTE (la corrida se marca failed): ningún CP E2E llegó a ejecutarse (todos BLOCKED u omitidos).
 *  - SATISFACTORIO: todos los CP E2E ejecutados y en REAL_PASS (ninguno parcial, fallido ni bloqueado).
 *  - Cualquier otro caso: no satisfactorio; el código de salida lo dan los failed de Playwright (PARCIAL y FAIL ya fallan).
 * Se escribe un JSON con el conteo por estado funcional y por causa (trazabilidad), sin datos sensibles.
 */

export interface ResultadoE2e { titulo: string; status: TestResult['status']; funcional?: string; causas: string[]; atribucion?: string }

export interface Veredicto {
  aplica: boolean;
  total_e2e: number;
  por_estado: Record<string, number>;
  por_causa: Record<string, number>;
  ejecutados: number;
  aprobados: number;
  no_concluyente: boolean;
  satisfactorio: boolean;
  motivo: string;
}

const EJECUTADOS = new Set(['REAL_PASS', 'REAL_PASS_PARCIAL', 'FAIL']);

export function calcularVeredicto(resultados: ResultadoE2e[]): Veredicto {
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
  const aplica = total > 0;
  const no_concluyente = aplica && ejecutados === 0;
  const satisfactorio = aplica && aprobados === total;
  const resumen = Object.entries(por_estado).map(([k, v]) => `${k}=${v}`).join(', ');
  const motivo = !aplica ? 'Sin pruebas E2E en esta corrida: el veredicto funcional no aplica.'
    : no_concluyente ? `NO CONCLUYENTE: ninguno de los ${total} CP E2E se ejecutó contra QA (${resumen}). Una corrida sin ejecuciones no es un resultado satisfactorio.`
      : satisfactorio ? `SATISFACTORIO: ${aprobados}/${total} CP E2E en REAL_PASS.`
        : `NO SATISFACTORIO: ${aprobados}/${total} CP E2E en REAL_PASS (${resumen}).`;
  return { aplica, total_e2e: total, por_estado, por_causa, ejecutados, aprobados, no_concluyente, satisfactorio, motivo };
}

const esE2e = (t: TestCase) => t.tags.includes('@e2e') || /(^|\s)@e2e(\s|$)/.test(t.title);

/** Reporter de Playwright: registra cada CP E2E y, al final, escribe el veredicto y fuerza failed si es NO CONCLUYENTE. */
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
    const v = calcularVeredicto([...this.resultados.values()]);
    if (!v.aplica) return undefined;
    const salida = this.opciones.salida ?? resolve(process.cwd(), 'test-results', process.env.PROJECT ?? 'seguros-del-estado', 'veredicto-e2e.json');
    mkdirSync(dirname(salida), { recursive: true });
    writeFileSync(salida, JSON.stringify({ fecha: new Date().toISOString(), estado_playwright: result.status, ...v }, null, 2) + '\n', 'utf8');
    console.log(`\n[SDE] Veredicto E2E: ${v.motivo}\n`);
    return v.no_concluyente && result.status === 'passed' ? { status: 'failed' } : undefined;
  }
}
