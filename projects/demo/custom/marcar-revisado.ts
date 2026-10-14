import type { PasoContext } from '@shared';

// Snippet de ejemplo: resuelve una "pantalla rara". Recibe la página en sesión.
export default async function ({ page }: PasoContext): Promise<void> {
  await page.locator('#estado').fill('Revisado');
  await page.getByRole('button', { name: 'Marcar' }).click();
}
