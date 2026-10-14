import { test, expect } from '@playwright/test';
import { LoginActions, LogoutActions, PlaywrightMethods, Validations, InboxObjects } from '@shared';
import { ProcessObjects } from '../baseObjects/process.objects';
import { ProcessHazards } from '../hazards/process.hazards';
import { ExpectedValues } from '../assets/expected.values';

/**
 * PLANTILLA DEL FLUJO DE NEGOCIO: crear caso -> diligenciar -> avanzar -> validar -> logout.
 * Pasos del equipo:
 *   1. npm run codegen -- <URL>  -> capturar localizadores reales.
 *   2. Pegarlos en baseObjects/process.objects.ts de ESTE proyecto.
 *   3. Ajustar Hazards (resultado esperado).
 *   4. npm test -- <proyecto>
 */
test.describe('Proceso piloto - camino feliz', () => {
  test('crear caso, diligenciar y avanzar', async ({ page }) => {
    const login = new LoginActions(page);
    const logout = new LogoutActions(page);
    const pw = new PlaywrightMethods(page);
    const validate = new Validations(page);

    await login.quickLogin(process.env.BIZAGI_QUICK_USER ?? 'usuario.qa');

    await pw.pwClick(InboxObjects.newCaseButton);
    await pw.pwClick(ProcessObjects.processMenuItem(ExpectedValues.pilotProcessName));

    // await pw.pwFill(ProcessObjects.fieldText('Identificacion'), '1234567890');
    // await pw.pwSelect(ProcessObjects.fieldCombo('TipoTramite'), 'Persuasivo');

    await pw.pwClick(ProcessObjects.nextButton);
    await pw.pwWaitIdle();

    expect(await validate.isVisible(ProcessHazards.caseCreated)).toBeTruthy();
    await logout.logout();
  });
});
