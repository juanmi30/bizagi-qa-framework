import type { Page } from '@playwright/test';
import { REGISTRO_CAMPOS_FUNCIONALES, camposDelRegistro, selectorCssCampo, type RegistroCampos } from '../data/afi/aplicacion/campos';
import { PANTALLAS_AFI, type PantallaAfi } from '../data/afi/aplicacion/pantallas';
import type { CampoAfi } from '../data/afi/modelo';
import { selectoresCamposAfi } from './afiDataUi';

/**
 * Primitive genérica de reconocimiento de pantalla (Fase 4J). NO navega ni espera: toma una instantánea de las
 * señales semánticas de cada pantalla del Application Model y exige EXACTAMENTE una coincidencia.
 * La localización de los campos sale de los mismos registros que usan los drivers (preparación y Field Registry).
 */

export interface EvaluacionPantalla {
  pantalla: string;
  presentes: number;
  total: number;
  obligatoriasOk: boolean;
  coincide: boolean;
  /** Señales semánticas públicas presentes ("encabezado", "campo:<id>"): nunca selectores. */
  senalesPresentes: string[];
}

export class PantallaNoReconocidaError extends Error {
  constructor(readonly evaluaciones: readonly EvaluacionPantalla[]) {
    super(`Pantalla desconocida: ninguna pantalla del modelo coincide (${evaluaciones.map(e => `${e.pantalla} ${e.presentes}/${e.total}`).join(', ')}).`);
    this.name = 'PantallaNoReconocidaError';
  }
}

export class PantallaAmbiguaError extends Error {
  /** evaluaciones: para explicar por qué compitieron (señales públicas de cada candidata). */
  constructor(readonly candidatas: readonly string[], readonly evaluaciones: readonly EvaluacionPantalla[] = []) {
    super(`Pantalla ambigua: coinciden ${candidatas.join(', ')}. Las firmas del modelo deben distinguirlas.`);
    this.name = 'PantallaAmbiguaError';
  }
}

export interface OpcionesReconocimiento {
  modelo?: Readonly<Partial<Record<string, PantallaAfi>>>;
  registro?: RegistroCampos;
  /** Selectores de campos de preparación (por defecto, los del driver de datos). */
  selectoresPreparacion?: Partial<Record<CampoAfi, readonly string[]>>;
}

export async function reconocerPantalla(page: Page, opciones: OpcionesReconocimiento = {}): Promise<{ pantalla: string; evaluaciones: EvaluacionPantalla[] }> {
  const modelo = opciones.modelo ?? PANTALLAS_AFI;
  const preparacion = opciones.selectoresPreparacion ?? selectoresCamposAfi();
  const funcionales = new Map(camposDelRegistro(opciones.registro ?? REGISTRO_CAMPOS_FUNCIONALES).map(c => [c.id, selectorCssCampo(c)]));
  const selectorDe = (campo: string): string => {
    const s = funcionales.get(campo) ?? (preparacion as Record<string, readonly string[] | undefined>)[campo]?.join(', ');
    // Fail-closed: una firma que nombra un campo sin localización conocida es un modelo inválido, no "ausente".
    if (!s) throw new Error(`Señal de pantalla sobre un campo sin localización conocida: ${campo}`);
    return s;
  };
  const evaluaciones: EvaluacionPantalla[] = [];
  for (const p of Object.values(modelo)) {
    if (!p) continue;
    let presentes = 0, obligatoriasOk = true;
    const senalesPresentes: string[] = [];
    for (const s of p.senales) {
      const visible = s.tipo === 'encabezado'
        ? (await Promise.all(s.textos.map(t => page.getByText(t, { exact: true }).first().isVisible()))).some(Boolean)
        : await page.locator(selectorDe(s.campo)).first().isVisible();
      if (visible) { presentes++; senalesPresentes.push(s.tipo === 'encabezado' ? 'encabezado' : `campo:${s.campo}`); }
      else if (s.obligatoria) obligatoriasOk = false;
    }
    evaluaciones.push({ pantalla: p.id, presentes, total: p.senales.length, obligatoriasOk, coincide: obligatoriasOk && presentes >= p.minimo, senalesPresentes });
  }
  const candidatas = evaluaciones.filter(e => e.coincide).map(e => e.pantalla);
  if (!candidatas.length) throw new PantallaNoReconocidaError(evaluaciones);
  if (candidatas.length > 1) throw new PantallaAmbiguaError(candidatas, evaluaciones);
  return { pantalla: candidatas[0], evaluaciones };
}
