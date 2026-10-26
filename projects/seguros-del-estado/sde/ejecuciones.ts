import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import type { ReporteCp } from './modelo';

/**
 * Archivo de EJECUCIONES por CP (metadatos de cada corrida, para seleccionar la última válida al generar el soporte).
 * Un archivo por corrida: test-results/seguros-del-estado/sde/ejecuciones/<CP>_<unico>.json. Nunca se sobrescribe el de
 * otra corrida; cada corrida solo actualiza el suyo (EN_CURSO → FINALIZADA | INTERRUMPIDA). El reporte JSON original
 * (sde/<CP>_<unico>.json) y las capturas (sde/capturas/<CP>_<unico>/) quedan donde ya estaban: aquí solo se referencian.
 * Todo es local (test-results/ no viaja con Git) y queda fuera de lo que limpia Playwright.
 */
export const RAIZ_REPO = resolve(__dirname, '..', '..', '..');
export const RUTA_EJECUCIONES = ['test-results', 'seguros-del-estado', 'sde', 'ejecuciones'] as const;
const RUTA_SDE = ['test-results', 'seguros-del-estado', 'sde'] as const;

export type EstadoEjecucion = 'EN_CURSO' | 'FINALIZADA' | 'INTERRUMPIDA';
export interface EjecucionCp {
  formato: 1;
  hu: string; cp: string; unico: string;
  /** Identificador de la corrida de suite (BIZAGI_CORRIDA, lo fija tools/run.mjs); null si se lanzó sin el runner. */
  corrida_suite: string | null;
  inicio: string; fin: string | null;
  estado_ejecucion: EstadoEjecucion;
  numero_caso: string | null;
  estado_cp: string | null;
  resumen_pasos: Record<string, number>;
  /** BLOCKED antes de tocar QA (activación, datos, cupo, concurrencia): no hubo ejecución real. */
  bloqueada_antes_de_ejecutar: boolean;
  /** Rutas relativas a la raíz del repo, con «/». */
  reporte: string | null; capturas: string; evidencias_adicionales: string[];
  motivo_interrupcion?: string;
  /** Continuación (tests/continuacion.real.spec.ts) sobre este número de caso: complementa a su ejecución base, nunca la sustituye. */
  continuacion_de?: string;
}

const rel = (raiz: string, ruta: string) => relative(raiz, ruta).split(sep).join('/');
const rutaEjecucion = (raiz: string, cp: string, unico: string) => resolve(raiz, ...RUTA_EJECUCIONES, `${cp}_${unico}.json`);
export const huDe = (cp: string) => { const m = /^(HU\d+)-CP\d+$/.exec(cp); if (!m) throw new Error(`CP inválido: ${cp}`); return m[1]; };

/** Al empezar una corrida: EN_CURSO. Si ya existe un registro con ese CP y único, falla (nunca se sobrescribe otra corrida). */
export function registrarInicio(o: { raiz?: string; cp: string; unico: string; corrida?: string | null; inicio?: Date; continuacionDe?: string }): string {
  const raiz = o.raiz ?? RAIZ_REPO;
  const ruta = rutaEjecucion(raiz, o.cp, o.unico);
  mkdirSync(resolve(ruta, '..'), { recursive: true });
  const e: EjecucionCp = {
    formato: 1, hu: huDe(o.cp), cp: o.cp, unico: o.unico, corrida_suite: o.corrida?.trim() || null,
    inicio: (o.inicio ?? new Date()).toISOString(), fin: null, estado_ejecucion: 'EN_CURSO', numero_caso: o.continuacionDe ?? null, estado_cp: null,
    resumen_pasos: {}, bloqueada_antes_de_ejecutar: false, reporte: null,
    capturas: rel(raiz, resolve(raiz, ...RUTA_SDE, 'capturas', `${o.continuacionDe ? 'CONTINUACION_' : ''}${o.cp}_${o.unico}`)), evidencias_adicionales: [],
    ...(o.continuacionDe ? { continuacion_de: o.continuacionDe } : {}),
  };
  writeFileSync(ruta, JSON.stringify(e, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  return ruta;
}

function actualizar(raiz: string, cp: string, unico: string, cambio: (e: EjecucionCp) => void): EjecucionCp {
  const ruta = rutaEjecucion(raiz, cp, unico);
  const e = JSON.parse(readFileSync(ruta, 'utf8')) as EjecucionCp;
  cambio(e);
  writeFileSync(ruta, JSON.stringify(e, null, 2) + '\n', 'utf8');
  return e;
}

/** Al guardar correctamente el reporte: FINALIZADA (también con FAIL, BLOCKED o parcial: el estado lo dice el reporte). */
export function registrarFin(o: { raiz?: string; reporte: ReporteCp; rutaReporte: string }): EjecucionCp {
  const raiz = o.raiz ?? RAIZ_REPO;
  const r = o.reporte;
  return actualizar(raiz, r.cp, r.unico, (e) => {
    const resumen: Record<string, number> = {};
    for (const m of r.matriz) resumen[m.estado] = (resumen[m.estado] ?? 0) + 1;
    Object.assign(e, {
      fin: r.fin || new Date().toISOString(), estado_ejecucion: 'FINALIZADA', numero_caso: r.numero_caso, estado_cp: r.estado,
      resumen_pasos: resumen, bloqueada_antes_de_ejecutar: r.bloqueos.length > 0, reporte: rel(raiz, o.rutaReporte),
    });
  });
}

/** Excepción antes de guardar el reporte: INTERRUMPIDA (conserva el número de caso si ya se había creado). */
export function registrarInterrupcion(o: { raiz?: string; cp: string; unico: string; numeroCaso: string | null; motivo: string }): void {
  const raiz = o.raiz ?? RAIZ_REPO;
  if (!existsSync(rutaEjecucion(raiz, o.cp, o.unico))) return;
  actualizar(raiz, o.cp, o.unico, (e) => {
    if (e.estado_ejecucion !== 'EN_CURSO') return;
    Object.assign(e, { fin: new Date().toISOString(), estado_ejecucion: 'INTERRUMPIDA', numero_caso: o.numeroCaso, motivo_interrupcion: o.motivo });
  });
}

export interface EjecucionLeida { archivo: string; ejecucion: EjecucionCp | null; error?: string }
export function listarEjecuciones(raiz = RAIZ_REPO): EjecucionLeida[] {
  const dir = resolve(raiz, ...RUTA_EJECUCIONES);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    try { return { archivo: f, ejecucion: JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as EjecucionCp }; }
    catch (e) { return { archivo: f, ejecucion: null, error: `no se pudo leer: ${(e as Error).message}` }; }
  });
}

/** Seleccionable = ejecución real FINALIZADA con su reporte íntegro y caso Bizagi. Un FAIL finalizado SÍ es seleccionable. */
export function motivoNoSeleccionable(raiz: string, e: EjecucionCp): string | null {
  if (e.estado_ejecucion !== 'FINALIZADA') return e.estado_ejecucion === 'EN_CURSO' ? 'sin finalizar (en curso o interrumpida sin registro)' : `interrumpida${e.motivo_interrupcion ? `: ${e.motivo_interrupcion}` : ''}`;
  if (e.bloqueada_antes_de_ejecutar) return 'BLOCKED antes de ejecutar (no hubo ejecución real)';
  if (!e.numero_caso) return 'sin número de caso Bizagi';
  if (!e.reporte || !existsSync(resolve(raiz, e.reporte))) return 'falta el reporte JSON';
  try {
    const r = JSON.parse(readFileSync(resolve(raiz, e.reporte), 'utf8')) as ReporteCp;
    if (r.cp !== e.cp || r.unico !== e.unico || r.numero_caso !== e.numero_caso) return 'el reporte no corresponde a la ejecución (CP, único o caso distintos)';
  } catch { return 'reporte JSON ilegible'; }
  return null;
}

export interface SeleccionCp { cp: string; elegida: EjecucionCp | null; continuaciones: EjecucionCp[]; advertencias: string[] }
/**
 * Última ejecución seleccionable de cada CP, por la fecha de INICIO registrada en sus metadatos (no por nombre ni fecha
 * de modificación). Con `corrida`, solo las de esa corrida de suite (reproducir una certificación histórica). Las más
 * recientes no seleccionables se informan como advertencia: nunca reemplazan en silencio a una completa.
 */
export function seleccionarUltimas(o: { raiz?: string; cps: string[]; corrida?: string; posteriorA?: Record<string, number> }): SeleccionCp[] {
  const raiz = o.raiz ?? RAIZ_REPO;
  const todas = listarEjecuciones(raiz);
  return o.cps.map((cp) => {
    const advertencias: string[] = [];
    for (const l of todas) if (!l.ejecucion && l.archivo.startsWith(`${cp}_`)) advertencias.push(`Registro ilegible ${l.archivo}: ${l.error}.`);
    const delCp = todas.map((l) => l.ejecucion).filter((e): e is EjecucionCp => !!e && e.cp === cp);
    const propias = delCp.filter((e) => !e.continuacion_de && (!o.corrida || e.corrida_suite === o.corrida))
      .sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio) || b.unico.localeCompare(a.unico));
    let elegida: EjecucionCp | null = null;
    for (const e of propias) {
      const motivo = motivoNoSeleccionable(raiz, e);
      if (!motivo) {
        const empate = propias.find((x) => x !== e && x.inicio === e.inicio && !motivoNoSeleccionable(raiz, x));
        if (empate) advertencias.push(`Ejecuciones ambiguas de ${cp} con el mismo inicio (${e.unico} y ${empate.unico}): se usa ${e.unico}; revísalas.`);
        elegida = e; break;
      }
      advertencias.push(`Existe una ejecución más reciente de ${cp} NO utilizada (${e.unico}, inicio ${e.inicio}${e.numero_caso ? `, caso ${e.numero_caso}` : ''}): ${motivo}.`);
    }
    const limite = o.posteriorA?.[cp];
    if (elegida && limite != null && Date.parse(elegida.inicio) <= limite) elegida = null; // la certificación declarada es más reciente
    if (!elegida && o.corrida) advertencias.push(`La corrida de suite ${o.corrida} no tiene una ejecución seleccionable de ${cp}.`);
    // Continuaciones del MISMO caso, posteriores a la ejecución elegida, en orden: solo las finalizadas aportan pasos.
    const continuaciones: EjecucionCp[] = [];
    if (elegida) {
      const base = elegida;
      const candidatas = delCp.filter((e) => e.continuacion_de === base.numero_caso && Date.parse(e.inicio) > Date.parse(base.inicio))
        .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
      for (const c of candidatas) {
        const motivo = motivoNoSeleccionable(raiz, c);
        if (motivo) advertencias.push(`Continuación ${c.unico} del caso ${c.continuacion_de} NO incorporada: ${motivo}.`);
        else continuaciones.push(c);
      }
    }
    return { cp, elegida, continuaciones, advertencias };
  });
}

// ---------- Históricos: listado y SIMULACIÓN de limpieza (no existe función de borrado) ----------
const tamano = (ruta: string): number => {
  if (!existsSync(ruta)) return 0;
  const s = statSync(ruta);
  return s.isDirectory() ? readdirSync(ruta).reduce((n, h) => n + tamano(resolve(ruta, h)), 0) : s.size;
};

export interface FilaHistorico { cp: string; unico: string; estado_ejecucion: string; estado_cp: string | null; numero_caso: string | null; inicio: string; bytes: number; protecciones: string[]; candidata: boolean }
/**
 * Qué se PODRÍA limpiar. Solo lee: no borra ni mueve nada. Protegidas: la última seleccionable de cada CP, las
 * referenciadas por un soporte generado o por una certificación declarada, las que contienen FAIL (evidencia de defecto),
 * las EN_CURSO y las que están dentro del periodo de retención (propuesta: `retencionDias`, pendiente de política QA).
 * Los soportes Word y docs/evidencia (versionada) no son candidatos nunca.
 */
export function simularLimpieza(o: { raiz?: string; hoy?: Date; retencionDias: number; referenciadas?: Set<string> }): { filas: FilaHistorico[]; recuperable: number; reportesSinMetadatos: number } {
  const raiz = o.raiz ?? RAIZ_REPO;
  const leidas = listarEjecuciones(raiz).map((l) => l.ejecucion).filter((e): e is EjecucionCp => !!e);
  const ultimas = new Set(seleccionarUltimas({ raiz, cps: [...new Set(leidas.map((e) => e.cp))] })
    .flatMap((s) => (s.elegida ? [s.elegida, ...s.continuaciones] : [])).map((e) => `${e.cp}_${e.unico}`));
  const referenciadas = new Set([...(o.referenciadas ?? []), ...referenciasDeSoportes(raiz)]);
  const hoy = (o.hoy ?? new Date()).getTime();
  const filas = leidas.map((e) => {
    const clave = `${e.cp}_${e.unico}`;
    const protecciones = [
      ultimas.has(clave) && 'última seleccionable del CP',
      referenciadas.has(clave) && 'usada por un soporte o certificación',
      (e.estado_cp === 'FAIL' || (e.resumen_pasos.FAIL ?? 0) > 0) && 'contiene FAIL (evidencia de defecto)',
      e.estado_ejecucion === 'EN_CURSO' && 'en curso o sin cerrar',
      hoy - Date.parse(e.inicio) < o.retencionDias * 86_400_000 && `dentro de la retención (${o.retencionDias} días)`,
    ].filter((x): x is string => !!x);
    const bytes = tamano(rutaEjecucion(raiz, e.cp, e.unico)) + (e.reporte ? tamano(resolve(raiz, e.reporte)) : 0) + tamano(resolve(raiz, e.capturas));
    return { cp: e.cp, unico: e.unico, estado_ejecucion: e.estado_ejecucion, estado_cp: e.estado_cp, numero_caso: e.numero_caso, inicio: e.inicio, bytes, protecciones, candidata: protecciones.length === 0 };
  });
  const conMetadatos = new Set(leidas.map((e) => `${e.cp}_${e.unico}.json`));
  const dirSde = resolve(raiz, ...RUTA_SDE);
  const reportesSinMetadatos = existsSync(dirSde) ? readdirSync(dirSde).filter((f) => /^HU\d+-CP\d+_.*\.json$/.test(f) && !conMetadatos.has(f)).length : 0;
  return { filas, recuperable: filas.filter((f) => f.candidata).reduce((n, f) => n + f.bytes, 0), reportesSinMetadatos };
}

/** Ejecuciones (<CP>_<unico>) citadas por los planes de soportes ya generados. */
export function referenciasDeSoportes(raiz = RAIZ_REPO): string[] {
  const base = resolve(raiz, 'test-results', 'seguros-del-estado', 'soportes');
  const refs: string[] = [];
  const visitar = (d: string) => {
    for (const h of existsSync(d) ? readdirSync(d) : []) {
      const r = resolve(d, h);
      if (statSync(r).isDirectory()) visitar(r);
      else if (h.endsWith('-soporte-plan.json')) {
        try {
          const plan = JSON.parse(readFileSync(r, 'utf8')) as { seleccion?: { cp: string; unico?: string | null; continuaciones?: string[] }[] };
          for (const s of plan.seleccion ?? []) for (const u of [s.unico, ...(s.continuaciones ?? [])]) if (u) refs.push(`${s.cp}_${u}`);
        } catch { /* plan antiguo o ilegible: no aporta referencias */ }
      }
    }
  };
  visitar(base);
  return refs;
}
