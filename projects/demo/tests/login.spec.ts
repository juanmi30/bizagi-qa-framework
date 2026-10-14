import { test, expect } from '@playwright/test';
import { LoginActions, LogoutActions, Validations, LoginHazards } from '@shared';

/**
 * Smoke de login (reutiliza 100% el nucleo compartido).
 * El tag @smoke permite correr solo esto en PR:  npm test -- <proyecto> --grep @smoke
 */
test.describe('Login - Bizagi Cloud', () => {
  test('quick login carga el inbox @smoke', async ({ page }) => {
    const login = new LoginActions(page);
    const validate = new Validations(page);
    await login.quickLogin(process.env.BIZAGI_QUICK_USER ?? 'usuario.qa');
    expect(await validate.isVisible(LoginHazards.inboxLoaded)).toBeTruthy();
  });

  test('login estandar con usuario y clave @smoke', async ({ page }) => {
    const login = new LoginActions(page);
    const validate = new Validations(page);
    await login.login(process.env.BIZAGI_USER ?? '', process.env.BIZAGI_PASSWORD ?? '');
    expect(await validate.isVisible(LoginHazards.inboxLoaded)).toBeTruthy();
  });

  test('logout regresa al login', async ({ page }) => {
    const login = new LoginActions(page);
    const logout = new LogoutActions(page);
    const validate = new Validations(page);
    await login.quickLogin(process.env.BIZAGI_QUICK_USER ?? 'usuario.qa');
    await logout.logout();
    expect(await validate.isVisible(LoginHazards.loginPage)).toBeTruthy();
  });
});
