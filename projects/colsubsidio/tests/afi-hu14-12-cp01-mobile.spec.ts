import { test } from '@playwright/test';
import { ejecutarCasoReal } from '../helpers/afiHu1412';
import { contextoMobile } from '../helpers/contactoMobile';

test.describe('AFI HU 14.12 CP01 Mobile — emulación Playwright', () => {
  test.describe.configure({ retries: 0, mode: 'serial' });
  test.use(contextoMobile);
  test('CP01 Mobile P19-P32', async ({ page, context }, info) => {
    await ejecutarCasoReal(page, context, info, 'CP01', true);
  });
});
