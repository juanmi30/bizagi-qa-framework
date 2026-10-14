import { Page, FrameLocator, Locator } from '@playwright/test';
import { PlaywrightMethods } from './PlaywrightMethods';
import { FormObjects } from '../baseObjects/form.objects';
import type { CampoLlenar } from '../runner/scenarioLoader';

type Scope = Page | FrameLocator | Locator;

/** Convierte un texto en un literal seguro para XPath (maneja comillas). */
function xpathLiteral(s: string): string {
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return 'concat(' + s.split("'").map((p) => `'${p}'`).join(', "\'", ') + ')';
}

/**
 * FormActions (COMPARTIDO)
 * Localiza y diligencia campos del Work Portal por su ETIQUETA visible, sin
 * selectores grabados por proceso. Bizagi pinta cada control junto a su label,
 * así que combinamos varias estrategias por robustez. Para casos difíciles, la
 * plantilla puede traer un `localizador:` que apunta al baseObjects del proyecto.
 */
export class FormActions extends PlaywrightMethods {
  /** Raíz temporal: cuando se llena un pop-up, los campos se buscan SOLO dentro de él. */
  private raiz?: Locator;

  constructor(page: Page, private readonly iframeSelector?: string) {
    super(page);
  }

  /** La forma vive en la página, dentro de un iframe, o —si hay pop-up abierto— dentro de él. */
  private scope(): Scope {
    if (this.raiz) return this.raiz;
    return this.iframeSelector ? this.page.frameLocator(this.iframeSelector) : this.page;
  }

  /** input/textarea de un campo, por su etiqueta (varias estrategias en cascada). */
  private inputDe(label: string): Locator {
    const s = this.scope();
    const lit = xpathLiteral(label);
    return s.getByLabel(label, { exact: false })
      .or(s.locator(`xpath=//label[normalize-space(.)=${lit}]/following::*[self::input or self::textarea][not(@type="hidden")][1]`))
      .or(s.locator(`xpath=//*[normalize-space(text())=${lit}]/following::*[self::input or self::textarea][not(@type="hidden")][1]`))
      .first();
  }

  /** <select> de un campo, por su etiqueta. */
  private selectDe(label: string): Locator {
    const s = this.scope();
    const lit = xpathLiteral(label);
    return s.getByLabel(label, { exact: false })
      .or(s.locator(`xpath=//label[normalize-space(.)=${lit}]/following::select[1]`))
      .or(s.locator(`xpath=//*[normalize-space(text())=${lit}]/following::select[1]`))
      .first();
  }

  /** Contenedor que muestra la etiqueta (útil para radios/checkbox agrupados). */
  private grupoDe(label: string): Locator {
    const lit = xpathLiteral(label);
    return this.scope()
      .locator(`xpath=//*[.//*[normalize-space(text())=${lit}]][.//input or .//*[@role="radio"] or .//label]`)
      .last();
  }

  private control(label: string, localizador?: string): Locator {
    if (localizador) return this.scope().locator(localizador).first();
    return this.inputDe(label);
  }

  /** Diligencia UN campo según su tipo (por defecto: texto). */
  async llenarCampo(campo: CampoLlenar): Promise<void> {
    const tipo = (campo.tipo ?? 'texto').toString();
    const valor = campo.valor;
    switch (tipo) {
      case 'lista':
        await this.seleccionarLista(campo.campo, String(valor), campo.localizador);
        break;
      case 'búsqueda':
      case 'busqueda':
        await this.buscarYElegir(campo.campo, String(valor), campo.localizador);
        break;
      case 'fecha':
        await this.llenarFecha(campo.campo, String(valor), campo.localizador);
        break;
      case 'radio':
        await this.elegirRadio(campo.campo, String(valor));
        break;
      case 'checkbox':
        await this.marcarCheckbox(campo.campo, valor);
        break;
      default: {
        // texto, área de texto, número
        const ctrl = this.control(campo.campo, campo.localizador);
        await ctrl.waitFor({ state: 'visible' });
        await ctrl.fill(String(valor));
      }
    }
  }

  /**
   * Diligencia un campo de FECHA. Los date-picker de Bizagi (Kendo) ignoran el
   * `fill()` programático: hay que TECLEAR la fecha (evento por evento) y luego
   * quitar el foco para que el widget confirme el valor en su modelo interno.
   * Formato esperado: dd/MM/yyyy (ej. 15/08/2026).
   */
  private async llenarFecha(label: string, valor: string, localizador?: string): Promise<void> {
    const ctrl = this.control(label, localizador);
    await ctrl.waitFor({ state: 'visible' });
    await ctrl.click();
    // Limpia cualquier resto/máscara previa antes de escribir.
    await ctrl.press('ControlOrMeta+A').catch(() => undefined);
    await ctrl.press('Backspace').catch(() => undefined);
    await ctrl.pressSequentially(valor, { delay: 40 });
    await this.cerrarCalendario(); // cierra el calendario emergente conservando el valor tecleado
  }

  /**
   * Cierra el calendario emergente de Bizagi (Mobiscroll) si quedó abierto. Es una
   * "burbuja" que solo se cierra con eventos reales: primero Escape y, si insiste,
   * un clic real en el margen (fuera del calendario). El valor ya tecleado se conserva.
   */
  private async cerrarCalendario(): Promise<void> {
    const popup = this.page.locator('.mbsc-fr-popup, .mbsc-fr-scroll').first();
    if (!(await popup.isVisible().catch(() => false))) return;
    await this.page.keyboard.press('Escape').catch(() => undefined);
    if (await popup.isVisible().catch(() => false)) {
      const vp = this.page.viewportSize();
      if (vp) await this.page.mouse.click(vp.width - 15, Math.round(vp.height / 2)).catch(() => undefined);
    }
    await popup.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
  }

  private async seleccionarLista(label: string, valor: string, localizador?: string): Promise<void> {
    const s = this.scope();
    const sel = localizador ? s.locator(localizador).first() : this.selectDe(label);
    const esSelectNativo =
      (await sel.count()) > 0 &&
      (await sel.evaluate((el) => el.tagName === 'SELECT').catch(() => false));
    if (esSelectNativo) {
      await sel.selectOption({ label: valor });
      return;
    }
    // Lista personalizada: abrir el control y elegir la opción por su texto.
    await this.control(label, localizador).click();
    await this.elegirOpcion(valor);
  }

  /**
   * Elige una opción abierta por su texto exacto. Las opciones de las listas de Bizagi
   * se dibujan en un "portal" a nivel de página (no dentro del pop-up), así que se buscan
   * en la página (o en el iframe, si el proyecto usa uno).
   */
  private async elegirOpcion(valor: string): Promise<void> {
    const base: Scope = this.iframeSelector ? (this.page.frameLocator(this.iframeSelector) as Scope) : this.page;
    const opcion = base.getByText(valor, { exact: true }).first();
    await opcion.waitFor({ state: 'visible', timeout: 10_000 });
    await opcion.click();
  }

  /**
   * Agrega UNA fila a una tabla/colección: pulsa "Adicionar <tabla>", llena los campos
   * DENTRO del pop-up (acotando la búsqueda al diálogo) y guarda; espera a que el pop-up
   * cierre. Reutiliza el mismo llenador de tipos (texto/fecha/lista/…).
   */
  async agregarFilaTabla(tabla: string, campos: CampoLlenar[]): Promise<void> {
    const base = this.scope();
    await base
      .getByRole('listitem', { name: `Adicionar ${tabla}` })
      .or(base.locator(`[title="Adicionar ${tabla}"]`))
      .locator('visible=true')
      .first()
      .click();

    const dialog = this.page.getByRole('dialog', { name: `Adicionar ${tabla}` });
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });

    const previa = this.raiz;
    this.raiz = dialog; // a partir de aquí los campos se buscan SOLO dentro del pop-up
    try {
      for (const campo of campos) await this.llenarCampo(campo);
    } finally {
      this.raiz = previa;
    }

    await dialog.getByRole('button', { name: 'Guardar' }).first().click();
    await dialog.waitFor({ state: 'hidden', timeout: 15_000 });
  }

  /**
   * Cuenta las filas de DATOS de una tabla/colección, ubicándola por su etiqueta visible.
   * Tras "Guardar" la forma se recarga y la grilla reaparece vacía un instante antes de
   * pintar las filas: por eso se espera a que aparezca AL MENOS UNA fila de datos (no solo
   * la tabla). Si de verdad no hay filas, agota la espera y devuelve 0.
   */
  async contarFilas(tabla: string): Promise<number> {
    await this.page
      .locator('.k-loading-mask, [class*="loading" i], [class*="loader" i], [class*="spinner" i]')
      .first()
      .waitFor({ state: 'hidden', timeout: 30_000 })
      .catch(() => undefined);
    await this.page.waitForLoadState('networkidle').catch(() => undefined);
    const lit = xpathLiteral(tabla);
    const filas = this.scope()
      .locator(`xpath=//*[normalize-space(text())=${lit}]/following::table[1]`)
      .first()
      .locator('xpath=.//tr[td]');
    await filas.first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
    return filas.count().catch(() => 0);
  }

  private async buscarYElegir(label: string, valor: string, localizador?: string): Promise<void> {
    const ctrl = this.control(label, localizador);
    await ctrl.click();
    await ctrl.fill('');
    // Los buscadores de Bizagi son "de sugerencia" y filtran por la DESCRIPCIÓN. Si el valor
    // trae código ("02-... - DESCRIPCIÓN"), se teclea solo la descripción para que aparezca.
    const consulta = valor.includes(' - ') ? valor.split(' - ').slice(1).join(' - ') : valor;
    await ctrl.pressSequentially(consulta, { delay: 40 });
    // La sugerencia se dibuja como li.ui-bizagi-render-search-item; si el proyecto usa otro
    // tipo de búsqueda, se cae a un texto genérico visible.
    const item = this.page.locator('.ui-bizagi-render-search-item-label').filter({ hasText: valor }).first();
    try {
      await item.waitFor({ state: 'visible', timeout: 10_000 });
      await item.click();
    } catch {
      const generico = this.page.getByText(valor, { exact: false }).first();
      await generico.waitFor({ state: 'visible', timeout: 10_000 });
      await generico.click();
    }
  }

  private async elegirRadio(label: string, valor: string): Promise<void> {
    const esSi = /^(s[íi]|true|1|x|verdadero)$/i.test(valor.trim());
    const litLabel = xpathLiteral(label);
    // Radios booleanos de Bizagi: input con value "true" (Sí) / "false" (No). Se toma el que
    // SIGUE a la etiqueta de la pregunta (evita confundir con radios de otras preguntas).
    const val = esSi ? 'true' : 'false';
    const radioBizagi = this.scope()
      .locator(`xpath=//*[normalize-space(text())=${litLabel}]/following::input[contains(@class,"ui-bizagi-render-boolean-radio") and @value="${val}"][1]`)
      .first();
    if (await radioBizagi.count()) {
      await radioBizagi.scrollIntoViewIfNeeded().catch(() => undefined);
      await radioBizagi.check({ force: true }).catch(async () => {
        const id = await radioBizagi.getAttribute('id');
        if (id) await this.scope().locator(`label[for="${id}"]`).first().click();
      });
      return;
    }
    // Respaldo: por NOMBRE accesible del radio ("Si"/"No"). Útil cuando la etiqueta de la
    // pregunta va embebida en un texto mayor y no se puede anclar por texto exacto (ej. el
    // diálogo "Nuevo Caso" de Colsubsidio). Requiere que la forma tenga un solo grupo Sí/No
    // visible; si hubiera varios, usar la ubicación por etiqueta o un `localizador:`.
    const porNombre = this.scope().getByRole('radio', { name: esSi ? 'Si' : 'No', exact: true });
    if (await porNombre.count()) {
      const r = porNombre.first();
      await r.scrollIntoViewIfNeeded().catch(() => undefined);
      await r.check({ force: true }).catch(async () => {
        const id = await r.getAttribute('id');
        if (id) await this.scope().locator(`label[for="${id}"]`).first().click();
      });
      return;
    }
    // Genérico (radios no-Bizagi): grupo por etiqueta + clic en el texto del valor.
    const grupo = this.grupoDe(label);
    const litVal = xpathLiteral(valor);
    await grupo
      .locator(`xpath=.//label[normalize-space(.)=${litVal}] | .//*[normalize-space(text())=${litVal}]`)
      .first()
      .click();
  }

  private async marcarCheckbox(label: string, valor: unknown): Promise<void> {
    const marcar = valor === true || /^(s[íi]|true|1|x)$/i.test(String(valor).trim());
    const ctrl = this.inputDe(label);
    if (marcar) await ctrl.check();
    else await ctrl.uncheck();
  }

  /** Lee el valor actual de un campo (para "verificar_al_entrar"). */
  async leerCampo(label: string): Promise<string> {
    const ctrl = this.inputDe(label);
    return (await ctrl.inputValue().catch(() => ctrl.textContent())) ?? '';
  }

  async campoEstaVacio(label: string): Promise<boolean> {
    return !(await this.leerCampo(label)).toString().trim();
  }

  /**
   * Lee un valor de DISPLAY (solo lectura) ubicado JUNTO a una etiqueta visible.
   * Ej.: etiqueta "Número de caso" → devuelve "GCON - 060". Reutiliza la filosofía de
   * "ubicar por etiqueta" del framework, así sirve para leer el número de caso de cualquier
   * portal (la etiqueta se configura por proyecto). Devuelve '' si no está en pantalla.
   */
  async leerValorPorEtiqueta(etiqueta: string): Promise<string> {
    const lit = xpathLiteral(etiqueta);
    const valor = this.scope()
      .locator(`xpath=//*[normalize-space(text())=${lit}]/following::*[normalize-space(.)!=''][1]`)
      .first();
    if (!(await valor.count())) return '';
    const txt = (await valor.textContent().catch(() => '')) ?? '';
    return txt.replace(/\s+/g, ' ').trim();
  }

  /** Clic en un botón por su texto visible (Siguiente, Guardar, Aceptar...). */
  async clickBoton(texto: string): Promise<void> {
    await this.scope().locator(FormObjects.botonPorTexto(texto)).first().click();
  }
}
