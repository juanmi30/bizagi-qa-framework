import { test, expect } from '@playwright/test';
import { LoginActions, LogoutActions, Validations, LoginHazards } from '@shared';

/**
 * Smoke de login de conpre. Este ambiente usa login por LISTA desplegable
 * ("Seleccione sus datos para ingresar a Bizagi"): se elige el usuario y se pulsa
 * Ingresar (sin contrasena). Reutiliza el nucleo compartido (selectUserLogin).
 */
test.describe('Login - Bizagi Cloud (conpre)', () => {
  test('login por lista carga el inbox @smoke', async ({ page }) => {
    const login = new LoginActions(page);
    const validate = new Validations(page);
    await login.selectUserLogin(process.env.BIZAGI_QUICK_USER ?? 'domain\\usuario.qa');
    expect(await validate.isVisible(LoginHazards.inboxLoaded)).toBeTruthy();
  });

  test('logout regresa al login', async ({ page }) => {
    const login = new LoginActions(page);
    const logout = new LogoutActions(page);
    const validate = new Validations(page);
    await login.selectUserLogin(process.env.BIZAGI_QUICK_USER ?? 'domain\\usuario.qa');
    await logout.logout();
    expect(await validate.isVisible(LoginHazards.loginPage)).toBeTruthy();
  });
});
