import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';
import type { EstadoCp } from './modelo';

/** Manifest de los 17 CP (manifest/casos.yaml): familia, fase, datos, escenario y estado. */

export interface CasoManifest {
  id: string;
  familia: string;
  fase: number;
  prioridad: string;
  actores: string[];
  datasets: string[];
  escenario: string | null;
  estado: EstadoCp;
  brechas: string[];
}
export interface Brecha { id: string; tipo: string; titulo: string }
export interface Familia { id: string; descripcion: string; variaciones: string[]; capacidades: string[] }
export interface Manifest { casos: CasoManifest[]; brechas: Record<string, Brecha>; familias: Record<string, Familia> }

export const RUTA_MANIFEST = resolve(__dirname, '..', 'manifest', 'casos.yaml');

export function cargarManifest(ruta = RUTA_MANIFEST): Manifest {
  const d = yaml.load(readFileSync(ruta, 'utf8')) as {
    casos: Record<string, Omit<CasoManifest, 'id'>>;
    brechas: Record<string, Omit<Brecha, 'id'>>;
    familias: Record<string, Omit<Familia, 'id'>>;
  };
  return {
    casos: Object.entries(d.casos).map(([id, c]) => ({ id, ...c })),
    brechas: Object.fromEntries(Object.entries(d.brechas).map(([id, b]) => [id, { id, ...b }])),
    familias: Object.fromEntries(Object.entries(d.familias).map(([id, f]) => [id, { id, ...f }])),
  };
}
