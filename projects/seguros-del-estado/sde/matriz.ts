import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { leerHojaXlsx, nombresHojasXlsx } from '../../../shared/utils/xlsx';

/**
 * Matriz QA SDE (17 CP). Fuente de verdad: los Excel de fuentes/. fuentes/matriz.json es una
 * extracción LITERAL (acción/esperado sin reinterpretar); la prueba @unit de matriz compara ambas.
 */

export interface PasoMatriz { n: number; accion: string; esperado: string }
export interface CasoMatriz {
  id: string;            // HU06-CP01
  hu: string;
  cp: string;
  archivo: string;
  titulo: string;
  descripcion: string;
  requisitos: string[];
  pasos: PasoMatriz[];
}

export const DIR_FUENTES = resolve(__dirname, '..', 'fuentes');
export const FUENTES = [
  { hu: 'HU06', archivo: '20260928_SDE_CEL_V1_Casos de Prueba_HU06.xlsx' },
  { hu: 'HU03', archivo: '20261006_SDE_CEL_V2_Casos de Prueba_HU03.xlsx' },
] as const;

const limpia = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Extrae los CP directamente de los Excel (misma regla que generó matriz.json). */
export function extraerDesdeExcel(dir = DIR_FUENTES): CasoMatriz[] {
  const casos: CasoMatriz[] = [];
  for (const f of FUENTES) {
    const libro = readFileSync(resolve(dir, f.archivo));
    const esc = leerHojaXlsx(libro, 'Escenarios').celdas;
    const req = new Map<string, string>();
    for (let fila = 10; fila < 60; fila++) {
      const id = limpia(esc.get('B' + fila));
      if (/^CP\d+$/.test(id)) req.set(id, limpia(esc.get('C' + fila)));
    }
    for (const hoja of nombresHojasXlsx(libro).filter((h) => /^CP\d+$/.test(h))) {
      const c = leerHojaXlsx(libro, hoja).celdas;
      const pasos: PasoMatriz[] = [];
      for (let fila = 8; fila < 200; fila++) {
        const n = limpia(c.get('B' + fila));
        if (!n) continue;
        pasos.push({ n: Number(n), accion: limpia(c.get('C' + fila)), esperado: limpia(c.get('D' + fila)) });
      }
      casos.push({
        id: `${f.hu}-${hoja}`, hu: f.hu, cp: hoja, archivo: f.archivo,
        titulo: limpia(c.get('C2')), descripcion: limpia(c.get('C5')),
        requisitos: (req.get(hoja) ?? '').split(/(?=(?:Requirement|Feature) \d+:)/).map(limpia).filter(Boolean),
        pasos,
      });
    }
  }
  return casos;
}

let cache: CasoMatriz[] | undefined;
export function cargarMatriz(): CasoMatriz[] {
  cache ??= (JSON.parse(readFileSync(resolve(DIR_FUENTES, 'matriz.json'), 'utf8')) as { casos: CasoMatriz[] }).casos;
  return cache;
}

export function casoMatriz(id: string): CasoMatriz {
  const c = cargarMatriz().find((x) => x.id === id);
  if (!c) throw new Error(`El CP "${id}" no existe en fuentes/matriz.json`);
  return c;
}
