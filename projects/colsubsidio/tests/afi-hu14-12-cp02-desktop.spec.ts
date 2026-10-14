import { test } from '@playwright/test';
import { ejecutarCasoReal } from '../helpers/afiHu1412';

test.describe('AFI HU 14.12 CP02 Desktop — QA real', () => {
  test.describe.configure({ retries: 0, mode: 'serial' });
  test.use({ viewport: { width: 1365, height: 900 } });
  test('CP02 Desktop P02-P19', async ({ page, context }, info) => {
    await ejecutarCasoReal(page, context, info, 'CP02');
  });
});
