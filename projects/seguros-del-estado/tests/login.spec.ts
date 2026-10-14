import { test, expect } from '@playwright/test';
import { LoginActions } from '../../../shared/core/LoginActions';
import { SdeObjects } from '../baseObjects/sde.objects';
import { cargarRegistro, estadoActor } from '../sde/datos';

/**
 * Login REAL por rol (reemplaza el login.spec de plantilla, que usaba usuarios de ejemplo).
 * Sin credenciales del alias → SKIPPED con anotación BLOCKED (nunca verde por omisión).
 * No crea casos.
 */
const registro = cargarRegistro();
// Sin trace: Playwright registraría el valor de fill() (la clave). Ver tests/unit/seguridad.unit.spec.ts.
test.use({ trace: 'off' });

test.describe('Login SDE por rol @smoke @login', () => {
  for (const alias of Object.keys(registro.actores)) {
    test(`login real como "${alias}" carga la bandeja`, async ({ page }, testInfo) => {
      const estado = estadoActor(registro, alias, process.env);
      const sinUrl = !/^https?:\/\//i.test(process.env.BIZAGI_BASE_URL ?? '');
      const faltan = [...(sinUrl ? ['BIZAGI_BASE_URL'] : []), ...estado.faltantes];
      if (faltan.length) {
        testInfo.annotations.push({ type: 'BLOCKED', description: `faltan ${faltan.join(', ')}` });
        test.skip(true, `BLOCKED — credenciales de "${alias}": faltan ${faltan.join(', ')}`);
      }
      await new LoginActions(page).login(
        process.env[`USUARIO_${alias}`]!, process.env[`CLAVE_${alias}`]!, process.env[`DOMINIO_${alias}`] || undefined,
      );
      await expect(page.locator(SdeObjects.bandeja).filter({ visible: true }).first()).toBeVisible();
    });
  }
});
