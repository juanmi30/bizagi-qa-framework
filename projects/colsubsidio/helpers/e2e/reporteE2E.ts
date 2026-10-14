import type { PlanE2ECompilado } from '../../data/afi/e2e/compilador';
import type { ResultadoPasoE2E } from '../../data/afi/e2e/modelo';

/** Tabla legible del resultado E2E (textos públicos del caso y detalles sanitizados). */
export function tablaMarkdownE2E(meta: { hu: string; caso: string; fuente?: string; actorRef?: string }, plan: PlanE2ECompilado,
  pasos: readonly ResultadoPasoE2E[], veredicto: string): string {
  const celda = (t: string) => t.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const filas = pasos.map(r => {
    const p = plan.pasos.find(x => x.paso === r.paso && x.dispositivo === r.dispositivo)!;
    const ejecutables = p.verificaciones.filter(v => v.estado === 'EJECUTABLE').length;
    const automatizado = ejecutables ? (ejecutables === p.verificaciones.length ? 'Sí' : 'Parcial') : 'No';
    const ejecutado = r.verificaciones.some((v, i) => p.verificaciones[i]?.estado === 'EJECUTABLE' && v.estado !== 'BLOCKED') ? 'Sí' : 'No';
    const evidencia = r.verificaciones.filter((_, i) => p.verificaciones[i]?.estado === 'EJECUTABLE').map(v => `${v.tipo}: ${v.estado} — ${v.detalle}`).join(' · ') || '—';
    const gaps = r.verificaciones.filter(v => v.estado !== 'PASS').map(v => `${v.clasificacion ?? (v.estado === 'FAIL' ? 'FALLO' : 'BLOQUEADO')}: ${v.detalle}`).join(' · ') || '—';
    return `| ${r.paso}${r.dispositivo === 'mobile' ? ' (Mobile)' : ''} — ${celda(p.accion)} | ${automatizado} | ${ejecutado} | ${r.estado} | ${celda(evidencia)} | ${celda(gaps)} |`;
  });
  return [`# ${meta.hu} ${meta.caso} — ${veredicto}`, '', `Fuente: ${meta.fuente ?? '-'}. Actor: ${meta.actorRef ?? '-'}.`, '',
    '| Paso CP | Automatizado | Ejecutado QA | PASS/FAIL/BLOCKED | Evidencia | Gap restante |', '|---|---|---|---|---|---|', ...filas, ''].join('\n');
}
