import { HojaXlsxInexistenteError, coordenadaCelda, leerHojaXlsx } from '../../../../../shared/utils/xlsx';

/**
 * Lector DETERMINISTA del diseño QA (Fase 4H): una hoja de caso del libro de casos de prueba.
 * Estructura observada: título arriba, "Descripción:" con el objetivo, y la tabla Paso | Acción | Resultado Esperado.
 * El texto se devuelve EXACTO (sin recortar, resumir ni normalizar): es la fuente textual del soporte.
 */

export interface PasoDisenoQa {
  /** Número del paso en el diseño (columna Paso). */
  numero: number;
  accion: string;
  esperado: string;
  /** Fila de origen, para auditoría. */
  fila: number;
}

export interface DisenoCasoQa {
  hoja: string;
  titulo: string;
  descripcion: string;
  pasos: PasoDisenoQa[];
}

export type MotivoDisenoQa = 'hoja-inexistente' | 'sin-encabezado' | 'sin-titulo' | 'sin-descripcion' | 'paso-invalido' | 'paso-duplicado' | 'sin-pasos';

export class DisenoQaError extends Error {
  constructor(readonly motivo: MotivoDisenoQa, detalle: string) {
    super(`Diseño QA inválido (${motivo}): ${detalle}`);
    this.name = 'DisenoQaError';
  }
}

const ENCABEZADOS = { paso: 'paso', accion: 'accion', esperado: 'resultado esperado' } as const;
const clave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export function leerDisenoCasoQa(libro: Buffer, hoja: string): DisenoCasoQa {
  let celdas: ReadonlyMap<string, string>;
  try {
    celdas = leerHojaXlsx(libro, hoja).celdas;
  } catch (error) {
    if (error instanceof HojaXlsxInexistenteError) throw new DisenoQaError('hoja-inexistente', error.message);
    throw error;
  }
  // Celdas por fila, en orden de columna.
  const filas = new Map<number, { columna: number; valor: string }[]>();
  for (const [ref, valor] of celdas) {
    const { fila, columna } = coordenadaCelda(ref);
    (filas.get(fila) ?? filas.set(fila, []).get(fila)!).push({ columna, valor });
  }
  const orden = [...filas.keys()].sort((a, b) => a - b);
  for (const f of orden) filas.get(f)!.sort((a, b) => a.columna - b.columna);

  // Encabezado: la primera fila con Paso, Acción y Resultado Esperado.
  let encabezado: { fila: number; paso: number; accion: number; esperado: number } | undefined;
  for (const f of orden) {
    const col = (nombre: string) => filas.get(f)!.find(c => clave(c.valor) === nombre)?.columna;
    const [paso, accion, esperado] = [col(ENCABEZADOS.paso), col(ENCABEZADOS.accion), col(ENCABEZADOS.esperado)];
    if (paso && accion && esperado) { encabezado = { fila: f, paso, accion, esperado }; break; }
  }
  if (!encabezado) throw new DisenoQaError('sin-encabezado', `la hoja "${hoja}" no tiene la fila Paso | Acción | Resultado Esperado.`);
  const previas = orden.filter(f => f < encabezado!.fila);

  // Descripción: el valor a la derecha de la etiqueta "Descripción:".
  let descripcion: string | undefined, filaDescripcion: number | undefined;
  for (const f of previas) {
    const celdasFila = filas.get(f)!;
    const i = celdasFila.findIndex(c => clave(c.valor) === 'descripcion:');
    if (i >= 0 && celdasFila[i + 1]) { descripcion = celdasFila[i + 1].valor; filaDescripcion = f; break; }
  }
  if (descripcion === undefined) throw new DisenoQaError('sin-descripcion', `la hoja "${hoja}" no tiene "Descripción:" con valor antes de la tabla de pasos.`);
  // Título: el primer texto de la hoja, antes de la descripción.
  const titulo = previas.filter(f => f < filaDescripcion!).flatMap(f => filas.get(f)!).find(c => c.valor.trim())?.valor;
  if (!titulo) throw new DisenoQaError('sin-titulo', `la hoja "${hoja}" no tiene título antes de la descripción.`);

  const pasos: PasoDisenoQa[] = [];
  for (const f of orden.filter(x => x > encabezado!.fila)) {
    const celda = (columna: number) => filas.get(f)!.find(c => c.columna === columna)?.valor;
    const numeroTexto = celda(encabezado.paso);
    if (numeroTexto === undefined) continue; // filas de notas o vacías
    const numero = Number(numeroTexto);
    const accion = celda(encabezado.accion), esperado = celda(encabezado.esperado);
    if (!Number.isInteger(numero) || numero < 1) throw new DisenoQaError('paso-invalido', `fila ${f}: número de paso "${numeroTexto.slice(0, 20)}" no es un entero positivo.`);
    if (!accion?.trim() || !esperado?.trim()) throw new DisenoQaError('paso-invalido', `fila ${f}: el paso ${numero} no tiene acción y resultado esperado.`);
    if (pasos.some(p => p.numero === numero)) throw new DisenoQaError('paso-duplicado', `el paso ${numero} aparece más de una vez.`);
    pasos.push({ numero, accion, esperado, fila: f });
  }
  if (!pasos.length) throw new DisenoQaError('sin-pasos', `la hoja "${hoja}" no tiene pasos.`);
  return { hoja, titulo, descripcion, pasos };
}
