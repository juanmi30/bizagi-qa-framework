import { expect, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

type Punto = [number, number];
type Segmento = { a: Punto; b: Punto };
type Matriz = [number, number, number, number, number, number];
const identidad = (): Matriz => [1, 0, 0, 1, 0, 0];
const aplicar = (m: Matriz, p: Punto): Punto => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
function multiplicar(a: Matriz, b: Matriz): Matriz {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s/g, '').toUpperCase();
const unicos = (xs: number[]) => [...new Set(xs.map(x => Math.round(x * 10) / 10))];

/** Lee bordes vectoriales del PDF, no infiere una celda vacía solo por ausencia de etiqueta. */
function segmentos(fnArray: number[], argsArray: unknown[][], ops: Record<string, number>): Segmento[] {
  let matriz = identidad();
  const pila: Matriz[] = [];
  const salida: Segmento[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i], args = argsArray[i];
    if (op === ops.save) pila.push([...matriz]);
    else if (op === ops.restore) matriz = pila.pop() ?? identidad();
    else if (op === ops.transform) matriz = multiplicar(matriz, args as Matriz);
    else if (op === ops.paintFormXObjectBegin) {
      pila.push([...matriz]);
      if (args[0]) matriz = multiplicar(matriz, args[0] as Matriz);
    } else if (op === ops.paintFormXObjectEnd) matriz = pila.pop() ?? identidad();
    else if (op === ops.constructPath) {
      // PDF.js 6: [operación de pintado, [DrawOPS], límites].
      const datos = (args[1] as ArrayLike<ArrayLike<number>>)?.[0];
      if (!datos || typeof datos.length !== 'number') continue;
      let actual: Punto = [0, 0], inicio: Punto = [0, 0];
      for (let j = 0; j < datos.length;) {
        const instruccion = datos[j++];
        if (instruccion === 0) { actual = [datos[j++], datos[j++]]; inicio = actual; }
        else if (instruccion === 1 || instruccion === 4) {
          const siguiente: Punto = instruccion === 4 ? inicio : [datos[j++], datos[j++]];
          salida.push({ a: aplicar(matriz, actual), b: aplicar(matriz, siguiente) });
          actual = siguiente;
        } else if (instruccion === 2) { j += 4; actual = [datos[j++], datos[j++]]; }
        else if (instruccion === 3) { j += 2; actual = [datos[j++], datos[j++]]; }
        else throw new Error('Operación vectorial PDF no soportada; no inferir celda vacía');
      }
    }
  }
  return salida;
}

export async function verificarRuralUrbano(ruta: string, info: TestInfo): Promise<void> {
  // Conservar import() nativo bajo el tsconfig CommonJS existente del framework.
  const pdfjs = await (new Function('return import("pdfjs-dist/legacy/build/pdf.mjs")')() as Promise<typeof import('pdfjs-dist')>);
  const carga = pdfjs.getDocument({ data: new Uint8Array(await readFile(ruta)), useSystemFonts: true });
  const documento = await carga.promise;
  try {
    let encontradas = 0;
    for (let numero = 1; numero <= documento.numPages; numero++) {
      const pagina = await documento.getPage(numero);
      const texto = (await pagina.getTextContent()).items.filter((i): i is TextItem => 'str' in i && !!i.str.trim());
      const rurales = texto.filter(i => normalizar(i.str) === 'RURAL/URBANO');
      if (!rurales.length) continue;
      expect(rurales, 'Una celda Rural/Urbano en la página del formulario').toHaveLength(1);
      const rural = rurales[0];
      const fila = texto.filter(i => Math.abs(i.transform[5] - rural.transform[5]) < 1.5).sort((a, b) => a.transform[4] - b.transform[4]);
      const etiquetas = ['DIRECCIONDEVIVIENDA', 'MUNICIPIO', 'RURAL/URBANO', 'DEPARTAMENTO', 'TELEFONO'];
      expect(fila.map(i => normalizar(i.str)), 'Estructura de la fila Dirección de vivienda').toEqual(etiquetas);
      const lista = await pagina.getOperatorList();
      const lineas = segmentos(lista.fnArray, lista.argsArray, pdfjs.OPS);
      const verticales = lineas.filter(l => Math.abs(l.a[0]-l.b[0]) < 0.2 && Math.abs(l.a[1]-l.b[1]) > 2);
      const horizontales = lineas.filter(l => Math.abs(l.a[1]-l.b[1]) < 0.2 && Math.abs(l.a[0]-l.b[0]) > 2);
      const y = rural.transform[5];
      const columnas = unicos(verticales.filter(l => Math.min(l.a[1], l.b[1]) <= y && Math.max(l.a[1], l.b[1]) >= y).map(l => l.a[0]));
      const izquierda = Math.max(...columnas.filter(x => x < rural.transform[4]));
      const derecha = Math.min(...columnas.filter(x => x > rural.transform[4] + rural.width));
      expect(Number.isFinite(izquierda) && Number.isFinite(derecha), 'Bordes verticales reales de Rural/Urbano').toBe(true);
      const niveles = unicos(horizontales.filter(l => Math.min(l.a[0],l.b[0]) <= izquierda + 0.5 && Math.max(l.a[0],l.b[0]) >= derecha - 0.5 && l.a[1] < y).map(l => l.a[1])).sort((a,b) => b-a);
      expect(niveles.length, 'Bordes superior e inferior de la celda de datos').toBeGreaterThanOrEqual(2);
      const [superior, inferior] = niveles;
      for (const x of [izquierda, derecha]) {
        expect(verticales.some(l => Math.abs(l.a[0]-x) < 0.5 && Math.min(l.a[1],l.b[1]) <= inferior + 0.5 && Math.max(l.a[1],l.b[1]) >= superior - 0.5), 'Celda de datos delimitada verticalmente').toBe(true);
      }
      const contenido = texto.filter(i => {
        const cx = i.transform[4] + i.width/2, cy = i.transform[5] + i.height/2;
        return cx > izquierda && cx < derecha && cy > inferior && cy < superior;
      });
      await info.attach('Rural-Urbano-estructura.json', { body: JSON.stringify({ pagina: numero, etiquetas, celda: { izquierda, derecha, superior, inferior }, elementosTexto: contenido.length }), contentType: 'application/json' });
      expect(contenido.length, 'LA CELDA de datos Rural/Urbano está vacía').toBe(0);
      // Renderizar el documento real como evidencia del formulario observado.
      const viewport = pagina.getViewport({ scale: 1.5 });
      const factory = documento.canvasFactory as { create(w: number, h: number): { canvas: { toBuffer(tipo: string): Buffer }; context: unknown }; destroy(c: unknown): void };
      const canvas = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await pagina.render({ canvasContext: canvas.context as CanvasRenderingContext2D, viewport, canvas: null }).promise;
      const imagen = info.outputPath('formulario-final.png');
      await writeFile(imagen, canvas.canvas.toBuffer('image/png'));
      await info.attach('formulario-final.png', { path: imagen, contentType: 'image/png' });
      factory.destroy(canvas);
      encontradas++;
    }
    expect(encontradas, 'Fila de vivienda encontrada exactamente una vez en el formulario final').toBe(1);
  } finally { await carga.destroy(); }
}
