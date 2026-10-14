import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { HistorialCasos } from '../../../shared/utils/HistorialCasos';
import { recuperarCasosPendientes, resumenRecuperacion } from '../../../shared/utils/RecuperacionCasos';
import { BizagiQaSupport } from '../helpers/bizagiQaSupport';

/**
 * Recuperación EXPLÍCITA de casos Portal pendientes del histórico.
 * Solo corre mediante: npm run cleanup -- colsubsidio
 */
test.describe('Recuperación de casos Portal pendientes', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.use({ viewport: { width: 1365, height: 900 } });

  test('cancelar casos Portal pendientes del histórico', async ({ page }, info) => {
    test.skip(process.env.CLEANUP_PENDIENTES !== 'true', 'Solo mediante npm run cleanup -- <proyecto>');
    expect(info.config.workers, 'La recuperación requiere workers=1').toBe(1);
    const historial = new HistorialCasos();
    const pendientes = await historial.listarPendientes('portal');
    test.setTimeout(60_000 + pendientes.length * 5 * 60_000);

    const resultados = await recuperarCasosPendientes({
      historial,
      modoCreacion: 'portal',
      cancelar: async numero => {
        // Una instancia por número: la correlación nunca cambia de caso.
        const soporte = new BizagiQaSupport(page, historial);
        await soporte.adoptarCasoRegistrado(numero);
        await soporte.cancelarCasoCreado();
      },
    });

    const resumen = resumenRecuperacion('portal', resultados);
    console.log('\n' + resumen + '\n');
    const ruta = info.outputPath('cleanup-resultado.json');
    await writeFile(ruta, JSON.stringify(resultados, null, 2), 'utf8');
    await info.attach('cleanup-resultado.json', { path: ruta, contentType: 'application/json' });
    expect(resultados.filter(r => r.estado === 'ERROR'), 'Casos Portal que siguen pendientes').toEqual([]);
  });
});
