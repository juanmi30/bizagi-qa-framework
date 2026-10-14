import { test } from '@playwright/test';
import { ejecutarCasoReal } from '../helpers/afiHu1412';
import { contextoMobile } from '../helpers/contactoMobile';

test.describe('AFI HU 14.12 CP02 Mobile — emulación Playwright', () => {
  test.describe.configure({ retries: 0, mode: 'serial' });
  test.use(contextoMobile);
  test('CP02 Mobile P20-P35', async ({ page, context }, info) => {
    await ejecutarCasoReal(page, context, info, 'CP02', true);
  });
});
