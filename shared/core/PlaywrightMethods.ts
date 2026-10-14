import { Page, Locator } from '@playwright/test';

/**
 * PlaywrightMethods (COMPARTIDO)
 * Encapsula las acciones nativas de Playwright. Si cambia el comportamiento de un
 * "click" (logging, espera extra...), se cambia AQUI una sola vez, para TODOS los proyectos.
 */
export class PlaywrightMethods {
  constructor(protected readonly page: Page) {}

  async pwGoto(path = '/'): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }
  pwGet(selector: string): Locator {
    return this.page.locator(selector);
  }
  async pwClick(selector: string): Promise<void> {
    await this.page.locator(selector).click();
  }
  async pwFill(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).fill(value);
  }
  async pwType(selector: string, value: string, delay = 40): Promise<void> {
    await this.page.locator(selector).pressSequentially(value, { delay });
  }
  async pwSelect(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).selectOption(value);
  }
  async pwUpload(selector: string, filePath: string): Promise<void> {
    await this.page.locator(selector).setInputFiles(filePath);
  }
  async pwWaitVisible(selector: string, timeout = 15_000): Promise<void> {
    await this.page.locator(selector).waitFor({ state: 'visible', timeout });
  }
  /** Espera tras un "Next" que recarga via AJAX (tipico en formas Bizagi). */
  async pwWaitIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }
}
