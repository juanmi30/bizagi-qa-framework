import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { capturarEvidencia } from '../../../shared/runner/evidence';
import { AfiliacionesPortal } from './afiliacionesPortal';
import { catalogoEstable } from './catalogoAutocomplete';

const plegar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export class ContactoCatalogos {
  private readonly portal: AfiliacionesPortal;
  constructor(readonly page: Page, readonly info: TestInfo, private readonly campos: Record<string, Locator> = {}) { this.portal = new AfiliacionesPortal(page); }
  campo(nombre: string): Locator { return this.campos[nombre] ?? this.page.getByRole('combobox', { name: nombre, exact: true }); }
  async evidencia(nombre: string, datos?: unknown): Promise<void> {
    if (datos !== undefined) await this.info.attach(`${nombre}.json`, { body: JSON.stringify(datos), contentType: 'application/json' });
    await capturarEvidencia(this.page, this.info, nombre);
  }
  async abrir(nombre: string): Promise<{ panel: Locator; opciones: string[] }> {
    const panel = await this.portal.abrirCatalogo(this.campo(nombre));
    return { panel, opciones: await catalogoEstable(panel) };
  }
  async elegir(nombre: string, valor: string): Promise<void> {
    const { panel } = await this.abrir(nombre);
    await panel.getByRole('option', { name: valor, exact: true }).click();
    if (await this.campo(nombre).evaluate(el => el.tagName === 'MAT-SELECT')) await expect(this.campo(nombre)).toHaveText(valor);
    else await expect(this.campo(nombre)).toHaveValue(valor);
  }
  async rechazar(nombre: string, paso: string): Promise<void> {
    const campo = this.campo(nombre);
    await expect(campo).toHaveValue('');
    await campo.click();
    for (const entrada of ['123', '@#$%&*']) {
      await campo.pressSequentially(entrada);
      await expect(campo).toHaveValue('');
      await this.evidencia(`${paso}_${entrada === '123' ? 'numeros' : 'especiales'}`);
    }
  }
  async limpiarTrasBlur(nombre: string, paso: string): Promise<void> {
    const campo = this.campo(nombre);
    await campo.click();
    await campo.pressSequentially('Zxyw');
    await expect(campo).toHaveValue('Zxyw');
    await this.evidencia(`${paso}_antes_blur`);
    await this.page.getByText('Información de contacto', { exact: true }).click();
    await expect(campo).not.toBeFocused();
    await expect(campo).toHaveValue('');
    await this.evidencia(`${paso}_despues_blur`);
  }
  async filtrar(nombre: string, prefijo: string, seleccion: string, paso: string): Promise<void> {
    const campo = this.campo(nombre);
    await campo.fill('');
    await campo.pressSequentially(prefijo);
    await expect(campo).toHaveValue(prefijo);
    const { opciones } = await this.abrir(nombre);
    await this.evidencia(`${paso}_filtro_antes_seleccion`, opciones);
    expect(opciones).toContain(seleccion);
    expect(opciones.every(opcion => plegar(opcion).includes(plegar(prefijo)))).toBe(true);
  }
  async seleccionarYReabrir(nombre: string, seleccion: string, originales: string[], paso: string): Promise<void> {
    await this.elegir(nombre, seleccion);
    await this.page.getByText('Información de contacto', { exact: true }).click();
    const { panel, opciones } = await this.abrir(nombre);
    expect([...opciones].sort()).toEqual([...originales].sort());
    await expect(this.campo(nombre)).toHaveValue(seleccion);
    await this.evidencia(`${paso}_reapertura`, opciones);
    await this.campo(nombre).press('Escape');
    await expect(panel).toBeHidden();
    await expect(this.campo(nombre)).toHaveValue(seleccion);
  }
  async bloquearBarrio(paso: string, mobile: boolean): Promise<void> {
    const barrio = this.campo('Barrio');
    await barrio.fill('');
    await barrio.pressSequentially('Zxyw');
    await expect(barrio).toHaveValue('Zxyw');
    const continuar = this.page.getByRole('button', { name: /Continuar/ });
    await continuar.scrollIntoViewIfNeeded();
    const rect = await continuar.boundingBox();
    expect(rect).not.toBeNull();
    const x = rect!.x + rect!.width / 2, y = rect!.y + rect!.height / 2;
    if (mobile) await this.page.touchscreen.tap(x, y);
    else await this.page.mouse.click(x, y);
    await expect(this.page.getByText('Información de contacto', { exact: true })).toBeVisible();
    await expect(barrio).toHaveValue('');
    await expect.poll(() => barrio.evaluate(e => {
      const input = e as HTMLInputElement;
      return input.required && input.validity.valueMissing && !input.validity.valid;
    })).toBe(true);
    await expect(continuar).toBeDisabled();
    await this.evidencia(paso);
  }
  async avanzarBarrio(prefijo: string, seleccion: string, paso: string): Promise<void> {
    await this.filtrar('Barrio', prefijo, seleccion, paso);
    await this.elegir('Barrio', seleccion);
    await this.page.getByRole('button', { name: /Continuar/ }).click();
    await expect(this.page.getByText('Información de contacto', { exact: true })).toBeHidden();
    await expect(this.page.getByText('Ingresa la información asociada a la dirección', { exact: true })).toBeVisible({ timeout: 45_000 });
    await this.evidencia(`${paso}_avance_direccion`);
  }
}
