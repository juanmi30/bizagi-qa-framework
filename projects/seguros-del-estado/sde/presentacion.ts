import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';
import type { ReglaOrtografica } from '../../../shared/utils/ValidacionesPresentacion';

/**
 * Catálogo de expectativas de PRESENTACIÓN de SDE (data/expectativas-presentacion.yaml): textos, ortografía, orden y
 * obligatoriedad con su FUENTE aprobada, o declaradas pendientes de definición. Los escenarios las referencian con
 * { expectativa: <ID> }; el ejecutor verifica las aprobadas y deja NOT_AUTOMATED las pendientes (nunca verdes).
 */

export interface ExpectativaAprobada {
  descripcion: string;
  estado: 'aprobada';
  fuente: string;
  /** Verificaciones del escenario (sin "expectativa" anidada). Se validan con el mismo validador estricto. */
  verificar: Record<string, unknown>[];
}
export interface ExpectativaPendiente {
  descripcion: string;
  estado: 'pendiente_definicion';
  pendiente: string;
  responsable: string;
  /** Solo rutas (P-18): actividades OBSERVADAS en QA, conservadas como evidencia; nunca son una expectativa aprobada. */
  actividades_observadas?: string[];
}
export type Expectativa = ExpectativaAprobada | ExpectativaPendiente;

/** Pantalla reconocible por marcadores citados en la matriz (R1: sin pantalla identificada no hay aprobación). */
export interface PantallaPresentacion { descripcion: string; marcadores: string[]; fuente: string }

export interface CatalogoPresentacion {
  pantallas: Record<string, PantallaPresentacion>;
  reglas_ortograficas: ReglaOrtografica[];
  conocidos: Record<string, string>;
  expectativas: Record<string, Expectativa>;
}

export const RUTA_PRESENTACION = resolve(__dirname, '..', 'data', 'expectativas-presentacion.yaml');

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** Problemas de estructura del catálogo (las verificaciones anidadas las valida escenario.ts con su validador). */
export function problemasCatalogo(c: Partial<CatalogoPresentacion> | undefined): string[] {
  const p: string[] = [];
  if (!c || typeof c !== 'object') return ['el catálogo debe ser un mapa con reglas_ortograficas, conocidos y expectativas'];
  const extra = Object.keys(c).filter((k) => !['pantallas', 'reglas_ortograficas', 'conocidos', 'expectativas'].includes(k));
  if (extra.length) p.push(`claves desconocidas en la raíz: ${extra.join(', ')}`);
  for (const [id, pa] of Object.entries(c.pantallas ?? {})) {
    if (!esTexto(pa?.descripcion) || !esTexto(pa?.fuente) || !Array.isArray(pa?.marcadores) || pa.marcadores.length === 0 || !pa.marcadores.every(esTexto))
      p.push(`pantalla ${id}: requiere descripcion, fuente y una lista no vacía de marcadores`);
    const sobran = Object.keys(pa ?? {}).filter((k) => !['descripcion', 'marcadores', 'fuente'].includes(k));
    if (sobran.length) p.push(`pantalla ${id}: claves desconocidas ${sobran.join(', ')}`);
  }
  const ids = new Set<string>();
  for (const [i, r] of (c.reglas_ortograficas ?? []).entries()) {
    const donde = `regla #${i + 1}`;
    if (!esTexto(r?.id) || !esTexto(r?.patron) || !esTexto(r?.descripcion) || !esTexto(r?.fuente)) { p.push(`${donde}: requiere id, patron, descripcion y fuente`); continue; }
    if (ids.has(r.id)) p.push(`${donde}: id repetido ${r.id}`);
    ids.add(r.id);
    try { new RegExp(r.patron, `gu${(r.banderas ?? '').replace(/[gu]/g, '')}`); } catch (e) { p.push(`${donde} (${r.id}): patrón inválido: ${(e as Error).message}`); }
    const sobran = Object.keys(r).filter((k) => !['id', 'patron', 'banderas', 'descripcion', 'fuente', 'correcto'].includes(k));
    if (sobran.length) p.push(`${donde} (${r.id}): claves desconocidas ${sobran.join(', ')}`);
  }
  for (const [frag, id] of Object.entries(c.conocidos ?? {})) if (!esTexto(frag) || !esTexto(id)) p.push(`conocidos: "${frag}" requiere un identificador`);
  for (const [id, e] of Object.entries(c.expectativas ?? {})) {
    const donde = `expectativa ${id}`;
    if (!/^[A-Z0-9-]+$/.test(id)) p.push(`${donde}: el id debe ser MAYÚSCULAS, dígitos y guiones`);
    if (!esTexto(e?.descripcion)) p.push(`${donde}: falta "descripcion"`);
    if (e?.estado === 'aprobada') {
      if (!esTexto(e.fuente)) p.push(`${donde}: una expectativa aprobada debe citar su "fuente"`);
      if (!Array.isArray(e.verificar) || e.verificar.length === 0) p.push(`${donde}: una expectativa aprobada requiere "verificar"`);
      const sobran = Object.keys(e).filter((k) => !['descripcion', 'estado', 'fuente', 'verificar'].includes(k));
      if (sobran.length) p.push(`${donde}: claves desconocidas ${sobran.join(', ')}`);
    } else if (e?.estado === 'pendiente_definicion') {
      if (!esTexto(e.pendiente) || !esTexto(e.responsable)) p.push(`${donde}: una expectativa pendiente requiere "pendiente" (qué falta) y "responsable"`);
      if (e.actividades_observadas != null && !(Array.isArray(e.actividades_observadas) && e.actividades_observadas.length > 0 && e.actividades_observadas.every(esTexto)))
        p.push(`${donde}: "actividades_observadas" debe ser una lista no vacía de textos`);
      const sobran = Object.keys(e).filter((k) => !['descripcion', 'estado', 'pendiente', 'responsable', 'actividades_observadas'].includes(k));
      if (sobran.length) p.push(`${donde}: claves desconocidas ${sobran.join(', ')} (una pendiente no se verifica)`);
    } else {
      p.push(`${donde}: "estado" debe ser aprobada | pendiente_definicion`);
    }
  }
  return p;
}

let cache: { ruta: string; catalogo: CatalogoPresentacion } | undefined;

/** Carga el catálogo (sin validar las verificaciones anidadas: eso lo hace cargarEscenario al usarlas). */
export function cargarPresentacion(ruta = RUTA_PRESENTACION): CatalogoPresentacion {
  if (cache?.ruta === ruta) return cache.catalogo;
  const crudo = existsSync(ruta) ? yaml.load(readFileSync(ruta, 'utf8')) as Partial<CatalogoPresentacion> : {};
  const problemas = problemasCatalogo(crudo);
  if (problemas.length) throw new Error(`Catálogo de presentación inválido (${ruta.split(/[\\/]/).pop()}):\n  • ${problemas.join('\n  • ')}`);
  const catalogo = { pantallas: crudo.pantallas ?? {}, reglas_ortograficas: crudo.reglas_ortograficas ?? [], conocidos: crudo.conocidos ?? {}, expectativas: crudo.expectativas ?? {} };
  cache = { ruta, catalogo };
  return catalogo;
}
