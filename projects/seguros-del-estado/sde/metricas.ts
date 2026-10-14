import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CasoMatriz } from './matriz';
import type { CasoManifest } from './manifest';
import type { EscenarioSde } from './escenario';
import type { EstadoCp, ReporteCp } from './modelo';

/**
 * Tres indicadores INDEPENDIENTES por CP (nunca se suman entre sí):
 *  - implementada: hay escenario declarativo válido; COMPLETA si cada paso de la matriz está cubierto por una
 *    capability UI o por una integración declarada; PARCIAL si quedan pasos sin cubrir o solo "no_automatizado".
 *  - ejecutada: existe un reporte con sesión real (no bloqueado en preflight). Un reporte BLOCKED por prerrequisitos
 *    NO es ejecución y nunca tapa una ejecución real anterior.
 *  - aprobada: el último reporte EJECUTADO es REAL_PASS. REAL_PASS_PARCIAL no cuenta como aprobado.
 */

/** Capabilities que declaran lo que no se automatiza o no se observa (no son verificación UI). */
export const DECLARATIVAS = new Set(['integracion', 'no_automatizado']);

export type NivelImplementacion = 'COMPLETA' | 'PARCIAL' | 'NO_IMPLEMENTADA';

/** origen: "local" = test-results de este equipo; "versionado" = docs/evidencia (viaja con Git). */
export interface ReporteArchivo { archivo: string; reporte: ReporteCp; origen?: 'local' | 'versionado' }

export interface CoberturaCp {
  cp: string;
  implementacion: NivelImplementacion;
  // ui: solo capabilities UI · mixto: UI + integración/no automatizado (NO cuenta como completo) · resto: solo declarativo o nada.
  pasos: { total: number; ui: number; mixto: number; integracion: number; no_automatizado: number; sin_cubrir: number };
  ejecutada: boolean;
  evidencia: ReporteArchivo | null;          // último reporte con ejecución real
  ultimoIntento: ReporteArchivo | null;      // último reporte de cualquier tipo (puede ser un BLOCKED de preflight)
  funcional: EstadoCp;                       // estado del último reporte ejecutado; si no hay, el del manifest
  aprobada: boolean;
}

const esObjetivo = (accion: string) => /^Objetivo:?$/i.test(accion);

/** ¿El reporte refleja una ejecución contra QA? (sin bloqueos de preflight y con una sesión real iniciada) */
export function fueEjecutado(r: ReporteCp): boolean {
  return r.bloqueos.length === 0 && r.pasos.some((p) => p.hacer === 'iniciar_sesion' && p.estado === 'PASS');
}

export function leerReportes(cp: string, dir: string, dirVersionado: string | null = null): ReporteArchivo[] {
  const leer = (d: string, origen: 'local' | 'versionado'): ReporteArchivo[] => !existsSync(d) ? [] :
    readdirSync(d).filter((f) => f.startsWith(`${cp}_`) && f.endsWith('.json'))
      .map((archivo) => ({ archivo, origen, reporte: JSON.parse(readFileSync(resolve(d, archivo), 'utf8')) as ReporteCp }));
  // Un mismo archivo en ambas carpetas es el mismo reporte: prevalece la copia local.
  const porNombre = new Map<string, ReporteArchivo>();
  for (const r of [...(dirVersionado ? leer(dirVersionado, 'versionado') : []), ...leer(dir, 'local')]) porNombre.set(r.archivo, r);
  return [...porNombre.values()].sort((a, b) => a.archivo.localeCompare(b.archivo));
}

/** Reportes de CP disponibles en cada fuente; local = null si test-results no existe en este equipo (p. ej. tras clonar). */
export function inventarioReportes(dir: string, dirVersionado: string | null): { local: number | null; versionado: number } {
  const contar = (d: string) => readdirSync(d).filter((f) => /^HU\d{2}-CP\d{2}_.*\.json$/.test(f)).length;
  return { local: existsSync(dir) ? contar(dir) : null, versionado: dirVersionado && existsSync(dirVersionado) ? contar(dirVersionado) : 0 };
}

export function nivelImplementacion(m: CasoMatriz, esc: EscenarioSde | undefined): { nivel: NivelImplementacion; pasos: CoberturaCp['pasos'] } {
  const pasos = { total: 0, ui: 0, mixto: 0, integracion: 0, no_automatizado: 0, sin_cubrir: 0 };
  for (const p of m.pasos) {
    if (esObjetivo(p.accion)) continue;
    pasos.total++;
    const cubren = esc?.pasos.filter((x) => x.matriz.includes(p.n)) ?? [];
    const conUi = cubren.some((x) => !DECLARATIVAS.has(x.hacer));
    const conDeclarativa = cubren.some((x) => DECLARATIVAS.has(x.hacer));
    if (conUi && conDeclarativa) pasos.mixto++;
    else if (conUi) pasos.ui++;
    else if (cubren.some((x) => x.hacer === 'integracion')) pasos.integracion++;
    else if (cubren.length) pasos.no_automatizado++;
    else pasos.sin_cubrir++;
  }
  // COMPLETA solo si TODOS los pasos se verifican únicamente por UI (sin integración pendiente ni partes no automatizadas).
  const nivel: NivelImplementacion = !esc ? 'NO_IMPLEMENTADA' : pasos.ui === pasos.total ? 'COMPLETA' : 'PARCIAL';
  return { nivel, pasos };
}

export function coberturaCp(m: CasoMatriz, c: CasoManifest, esc: EscenarioSde | undefined, reportes: ReporteArchivo[]): CoberturaCp {
  const { nivel, pasos } = nivelImplementacion(m, esc);
  const ejecutados = reportes.filter((r) => fueEjecutado(r.reporte));
  const evidencia = ejecutados.at(-1) ?? null;
  const funcional = evidencia?.reporte.estado ?? c.estado;
  return {
    cp: c.id, implementacion: nivel, pasos, ejecutada: !!evidencia, evidencia,
    ultimoIntento: reportes.at(-1) ?? null, funcional, aprobada: funcional === 'REAL_PASS',
  };
}

export interface Totales { cps: number; implementada: number; implementada_completa: number; ejecutada: number; aprobada: number; parcial: number; fail: number; blocked: number }

export function totales(lista: CoberturaCp[]): Totales {
  return {
    cps: lista.length,
    implementada: lista.filter((c) => c.implementacion !== 'NO_IMPLEMENTADA').length,
    implementada_completa: lista.filter((c) => c.implementacion === 'COMPLETA').length,
    ejecutada: lista.filter((c) => c.ejecutada).length,
    aprobada: lista.filter((c) => c.aprobada).length,
    parcial: lista.filter((c) => c.ejecutada && c.funcional === 'REAL_PASS_PARCIAL').length,
    fail: lista.filter((c) => c.ejecutada && c.funcional === 'FAIL').length,
    blocked: lista.filter((c) => c.funcional === 'BLOCKED').length,
  };
}
