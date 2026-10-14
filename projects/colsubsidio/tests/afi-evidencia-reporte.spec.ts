import { test, expect } from '@playwright/test';
import { correr } from './fixtures/afiEvidenciaFicticia';

/**
 * Fase 4G: corrida CONTROLADA (DOM ficticio, sin Portal) para verificar el HTML report de Playwright:
 * screenshots cliente, manifest y adjuntos técnicos. Solo se ejecuta desde tools/afi-evidencia-reporte.mjs.
 */
test.describe('AFI evidencias — reporte HTML local', () => {
  test.skip(process.env.AFI_EVIDENCE_REPORT_DEMO !== '1', 'Solo desde tools/afi-evidencia-reporte.mjs');
  test.use({ viewport: { width: 1365, height: 900 } });

  test('CP99 ficticio con evidencias cliente y técnicas', async ({ page }, info) => {
    const resultado = await correr(page, info);
    expect(resultado.resultado).toBe('PASS');
    expect(resultado.evidencia).toMatchObject({ estado: 'completa', capturasCliente: 3 });
  });
});
