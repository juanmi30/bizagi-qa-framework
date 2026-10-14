import { expect, type Locator, type Page } from '@playwright/test';
import type { CampoDato } from '../../data/afi/datosPrueba/contrato';
import type { CampoFormulario, PantallaRuta, RutaE2E } from '../../data/afi/e2e/recorrido';
import type { EtapaAfi } from '../../data/afi/modelo';

/**
 * RECORRIDO SEMÁNTICO GENÉRICO (runtime) sobre la ruta DERIVADA de Knowledge. Una sola implementación por acción, nunca una
 * función por pantalla ni por rol:
 *  - esperarPantalla: encabezado visible (Knowledge `titulo`);
 *  - consultarPersona: identificación (dato tipoIdentificacion/numeroIdentificacion) + botón de consulta (`consulta`);
 *  - diligenciarObligatorios: SEGÚN ESTADO (ausente/deshabilitado/precargado no se toca; vacío -> dato del sujeto);
 *  - cargarDocumentos: archivo permitido que aporta Test Data (nunca se genera aquí);
 *  - avanzar: botón de la transición (`avance`) y llegada a la siguiente pantalla (o permanencia si el caso sigue en ella).
 * Localización por ETIQUETA visible (nombre accesible), nunca selectores. Sin sleeps fijos: solo esperas por estado.
 * Los errores nunca contienen valores (solo ids semánticos).
 */

export interface ValoresRecorrido {
  /** Valor EN MEMORIA del dato de un sujeto ("principal" o rol); undefined si no existe. */
  valor(sujeto: string, dato: CampoDato): string | undefined;
  /** Archivo permitido (ruta local, de Test Data) para un campo de documentos; undefined si no hay. */
  archivo(campo: string): string | undefined;
}

export interface DependenciasRecorrido {
  page: Page;
  valores: ValoresRecorrido;
  /** Prepara una pantalla por las políticas de su etapa (driver de etapa del runner). */
  prepararEtapa(etapa: EtapaAfi): Promise<void>;
  /** Observación tras llegar (despuesDe = 0) y tras cada acción del caso en la pantalla. */
  observar(pantalla: string, despuesDe: number): Promise<void>;
  timeoutMs?: number;
}

export class DataGapRecorridoError extends Error {
  readonly clasificacion = 'TEST_DATA_GAP';
  constructor(readonly pantalla: string, readonly campos: readonly string[]) {
    super(`Faltan datos para diligenciar ${pantalla}: ${campos.join(', ')}`);
    this.name = 'DataGapRecorridoError';
  }
}

export interface AccionEjecutada { pantalla: string; accion: PantallaRuta['acciones'][number]; indice: number }
export interface ResultadoRecorrido { llegadas: string[]; acciones: AccionEjecutada[] }

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Nombre accesible = etiqueta exacta, admitiendo el marcador de obligatorio. */
const nombre = (etiqueta: string) => new RegExp(`^\\s*${escapar(etiqueta)}\\s*\\*?\\s*$`);

export function controlDe(page: Page, campo: Pick<CampoFormulario, 'etiqueta' | 'control'>): Locator {
  if (campo.control === 'select' || campo.control === 'autocomplete') return page.getByRole('combobox', { name: nombre(campo.etiqueta) });
  if (campo.control === 'archivo') return page.getByLabel(nombre(campo.etiqueta));
  return page.getByRole('textbox', { name: nombre(campo.etiqueta) });
}

async function leerValor(control: Locator): Promise<string> {
  return control.evaluate(el => {
    if (el instanceof HTMLSelectElement) return el.selectedIndex >= 0 && el.value ? (el.selectedOptions[0]?.textContent ?? '') : '';
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
    return el.querySelector('[class*="select-value-text"]')?.textContent ?? '';
  }).then(v => v.trim());
}

async function deshabilitado(control: Locator): Promise<boolean> {
  return (await control.isDisabled()) || (await control.getAttribute('aria-disabled')) === 'true';
}

async function escribirValor(page: Page, control: Locator, campo: CampoFormulario, valor: string): Promise<void> {
  if (campo.control === 'select' || campo.control === 'autocomplete') {
    if (await control.evaluate(el => el instanceof HTMLSelectElement)) { await control.selectOption({ label: valor }); return; }
    await control.click();
    const opcion = page.getByRole('option', { name: valor, exact: true });
    // Mensaje sin el valor (puede ser PII).
    await expect.poll(() => opcion.count(), { message: `${campo.campo}: debe existir exactamente una opción igual al dato` }).toBe(1);
    await opcion.click();
    return;
  }
  await control.fill(valor);
  expect(await control.inputValue() === valor, `${campo.campo}: valor ingresado`).toBe(true);
}

export async function esperarPantalla(page: Page, titulo: string, timeoutMs = 45_000): Promise<void> {
  await expect(page.getByText(titulo, { exact: true }).first(), `llegada a "${titulo}"`).toBeVisible({ timeout: timeoutMs });
}

/**
 * Botón por su TEXTO VISIBLE exacto (como el runner validado en QA): el nombre accesible del Portal puede diferir del texto
 * (iconos/aria). Exige exactamente uno visible: un texto ambiguo es un error, nunca se elige el primero.
 */
async function boton(page: Page, texto: string, timeoutMs: number): Promise<Locator> {
  const candidatos = page.locator('button:visible').filter({ hasText: new RegExp(`^\\s*${escapar(texto)}\\s*$`) });
  await expect.poll(() => candidatos.count(), { message: `exactamente un botón visible "${texto}"`, timeout: timeoutMs }).toBe(1);
  return candidatos.first();
}

async function sinProgreso(page: Page, timeoutMs: number): Promise<void> {
  await expect(page.getByRole('progressbar'), 'operación en curso finalizada').toHaveCount(0, { timeout: timeoutMs });
}

/** Diligencia SEGÚN ESTADO los campos ligados a un dato del sujeto. Falla (DataGap) si un obligatorio queda sin dato. */
export async function diligenciarObligatorios(page: Page, pantalla: string, campos: readonly CampoFormulario[], valor: (dato: CampoDato) => string | undefined): Promise<void> {
  const faltantes: string[] = [];
  for (const c of campos.filter(x => x.dato && x.control !== 'archivo')) {
    const control = controlDe(page, c);
    if (!await control.count() || !await control.first().isVisible() || await deshabilitado(control.first())) continue;
    if (await leerValor(control.first())) continue; // precargado: se conserva
    const v = valor(c.dato!);
    if (v === undefined) { if (c.obligatorio) faltantes.push(c.campo); continue; }
    await escribirValor(page, control.first(), c, v);
  }
  if (faltantes.length) throw new DataGapRecorridoError(pantalla, faltantes);
}

/** Identifica a la persona (tipo y número del sujeto, respetando precargas) y ejecuta la consulta. */
export async function consultarPersona(
  page: Page, pantalla: string, campos: readonly CampoFormulario[], consulta: string, valor: (dato: CampoDato) => string | undefined, timeoutMs = 45_000,
): Promise<void> {
  const identificacion = campos.filter(c => c.dato === 'tipoIdentificacion' || c.dato === 'numeroIdentificacion');
  await diligenciarObligatorios(page, pantalla, identificacion.map(c => ({ ...c, obligatorio: true })), valor);
  const b = await boton(page, consulta, timeoutMs);
  await expect(b, 'botón de consulta habilitado').toBeEnabled({ timeout: timeoutMs });
  await b.click();
  await sinProgreso(page, timeoutMs);
}

export async function cargarDocumentos(page: Page, pantalla: string, campos: readonly CampoFormulario[], archivo: (campo: string) => string | undefined): Promise<void> {
  const faltantes = campos.filter(c => c.obligatorio && !archivo(c.campo)).map(c => c.campo);
  if (faltantes.length) throw new DataGapRecorridoError(pantalla, faltantes);
  for (const c of campos) {
    const ruta = archivo(c.campo);
    if (ruta) await controlDe(page, c).first().setInputFiles(ruta);
  }
}

/** Pulsa el botón de la transición. Con `destino`, exige llegar; sin él (el caso sigue en la pantalla), exige quedarse. */
export async function avanzar(page: Page, etiqueta: string, destino: string | undefined, timeoutMs = 45_000): Promise<void> {
  const b = await boton(page, etiqueta, timeoutMs);
  await expect(b, `botón "${etiqueta}" habilitado`).toBeEnabled({ timeout: timeoutMs });
  await b.click();
  if (destino) await esperarPantalla(page, destino, timeoutMs);
  else await sinProgreso(page, timeoutMs);
}

/**
 * Recorre la ruta derivada desde el origen (punto funcional ya alcanzado por el runner). Ejecuta en cada pantalla la secuencia
 * de acciones compilada y observa tras la llegada y tras cada acción. Un `avanzar` que no es la última acción de la pantalla
 * es un INTENTO (el caso sigue en ella, p. ej. para observar una validación).
 */
export async function recorrerRuta(ruta: Pick<RutaE2E, 'pantallas'>, d: DependenciasRecorrido): Promise<ResultadoRecorrido> {
  const t = d.timeoutMs ?? 45_000;
  const r: ResultadoRecorrido = { llegadas: [], acciones: [] };
  for (let i = 0; i < ruta.pantallas.length; i++) {
    const p = ruta.pantallas[i], siguiente = ruta.pantallas[i + 1];
    if (!p.origen) {
      if (!p.titulo) throw new Error(`Ruta sin encabezado para reconocer ${p.pantalla}`);
      await esperarPantalla(d.page, p.titulo, t);
    }
    r.llegadas.push(p.pantalla);
    await d.observar(p.pantalla, 0);
    const prep = p.preparacion;
    const valor = (dato: CampoDato) => (prep.tipo === 'formulario' ? d.valores.valor(prep.sujeto, dato) : undefined);
    for (let k = 0; k < p.acciones.length; k++) {
      const accion = p.acciones[k];
      switch (accion) {
        case 'consultar-persona':
          if (prep.tipo !== 'formulario' || !prep.consulta) throw new Error(`${p.pantalla}: consultar-persona sin formulario de persona`);
          await consultarPersona(d.page, p.pantalla, prep.campos, prep.consulta, valor, t);
          break;
        case 'diligenciar-obligatorios':
          if (prep.tipo === 'etapa') await d.prepararEtapa(prep.etapa);
          else if (prep.tipo === 'formulario') await diligenciarObligatorios(d.page, p.pantalla, prep.campos, valor);
          else throw new Error(`${p.pantalla}: diligenciar-obligatorios sin formulario`);
          break;
        case 'cargar-documentos':
          if (prep.tipo !== 'documentos') throw new Error(`${p.pantalla}: cargar-documentos sin campos de archivo`);
          await cargarDocumentos(d.page, p.pantalla, prep.campos, c => d.valores.archivo(c));
          break;
        case 'avanzar': {
          if (!p.salida?.avance) throw new Error(`${p.pantalla}: sin transición de salida`);
          const ultima = k === p.acciones.length - 1;
          await avanzar(d.page, p.salida.avance, ultima ? siguiente?.titulo : undefined, t);
          break;
        }
      }
      r.acciones.push({ pantalla: p.pantalla, accion, indice: k });
      await d.observar(p.pantalla, k + 1);
    }
  }
  return r;
}

/** Prefijo ejecutable de la ruta: hasta la última pantalla alcanzable sin bloqueos; si no se puede operar, solo se observa. */
export function rutaEjecutable(ruta: RutaE2E): RutaE2E['pantallas'] {
  const salida: RutaE2E['pantallas'] = [];
  for (const p of ruta.pantallas) {
    if (!p.origen && (ruta.bloqueosHasta[p.pantalla] ?? []).length) break;
    const operable = !(ruta.bloqueosEn[p.pantalla] ?? []).length;
    salida.push(operable ? p : { ...p, acciones: [] });
    if (!operable) break;
  }
  return salida;
}
