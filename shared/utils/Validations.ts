import { Page, expect } from '@playwright/test';

/** Validations (COMPARTIDO): booleanos y aserciones sobre el estado de la pagina. */
export class Validations {
  constructor(private readonly page: Page) {}

  /** True/False sin lanzar error: util para encadenar logica. */
  async isVisible(selector: string, timeout = 10_000): Promise<boolean> {
    try {
      await this.page.locator(selector).waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }
  async getText(selector: string): Promise<string> {
    return (await this.page.locator(selector).innerText()).trim();
  }
  async getInputValue(selector: string): Promise<string> {
    return this.page.locator(selector).inputValue();
  }
  async expectVisible(selector: string): Promise<void> {
    await expect(this.page.locator(selector)).toBeVisible();
  }
  async expectText(selector: string, expected: string): Promise<void> {
    await expect(this.page.locator(selector)).toContainText(expected);
  }
}
