import { test } from '@playwright/test';
import { ejecutarCasoReal } from '../helpers/afiHu1412';

test.describe('AFI HU 14.12 CP01 Desktop — QA real', () => {
  test.describe.configure({ retries: 0, mode: 'serial' });
  test.use({ viewport: { width: 1365, height: 900 } });
  test('CP01 Desktop P02-P18', async ({ page, context }, info) => {
    await ejecutarCasoReal(page, context, info, 'CP01');
  });
});