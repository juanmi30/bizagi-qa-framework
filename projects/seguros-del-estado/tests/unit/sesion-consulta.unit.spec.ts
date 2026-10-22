import { test, expect } from '@playwright/test';
import { confirmarSesionConsulta } from '../../sde/capacidades';
import { causaDeExcepcion } from '../../sde/ejecutor';

test.use({ trace: 'off' });

test.describe('Recarga autenticada del portal SDE @unit', () => {
  test('espera la bandeja cuando el login transitorio desaparece, sin reenviar credenciales', async ({ page }) => {
    await page.setContent('<input id="username"><button id="submit">Ingresar</button>');
    const confirmacion = confirmarSesionConsulta(page, 'login', 2_000);
    await page.evaluate(() => {
      document.body.innerHTML = '<a id="menuListInbox">Bandeja de entrada</a>';
    });
    await expect(confirmacion).resolves.toBeUndefined();
  });

  test('un login persistente es un bloqueo de ambiente y no una aprobación', async ({ page }) => {
    await page.setContent('<input id="username"><button id="submit">Ingresar</button>');
    const error = await confirmarSesionConsulta(page, 'login', 100).catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(causaDeExcepcion(error)).toBe('AMBIENTE');
    expect(error.message).toContain('permaneció en el login');
  });

  test('una bandeja oculta no acredita una sesión', async ({ page }) => {
    await page.setContent('<a id="menuListInbox" hidden>Bandeja de entrada</a>');
    await expect(confirmarSesionConsulta(page, 'login', 100)).rejects.toThrow('ENTORNO:');
  });

  test('una bandeja ambigua conserva el error técnico', async ({ page }) => {
    await page.setContent('<a id="menuListInbox">Una</a><a id="menuListInbox">Otra</a>');
    const error = await confirmarSesionConsulta(page, 'login', 100).catch(e => e);
    expect(causaDeExcepcion(error)).toBe('AUTOMATIZACION');
    expect(error.message).toContain('strict mode violation');
  });
});
