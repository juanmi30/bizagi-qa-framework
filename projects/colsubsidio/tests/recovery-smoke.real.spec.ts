import { test, expect } from '@playwright/test';
import { HistorialCasos } from '../../../shared/utils/HistorialCasos';
import { AfiliacionesPortal, errorSeguro, validarDatosCP01 } from '../helpers/afiliacionesPortal';
import { BizagiQaSupport } from '../helpers/bizagiQaSupport';

/**
 * SMOKE REAL DE RECOVERY — NO pertenece a la regression suite.
 * Crea UN caso Portal real en Bizagi QA y lo deja DELIBERADAMENTE "Pendiente de depurar"
 * para certificar después: npm run cleanup -- colsubsidio
 * Única excepción consciente a la regla de cancelar en finally.
 */
const ESCENARIO = 'SMOKE Recovery Portal';

test.describe('SMOKE REAL recovery — deja un caso Portal pendiente', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.use({ viewport: { width: 1365, height: 900 } });

  test('crea un caso Portal y lo deja pendiente para npm run cleanup', async ({ page, context }, info) => {
    test.skip(process.env.RECOVERY_SMOKE_REAL !== 'true', 'Requiere RECOVERY_SMOKE_REAL=true (smoke real opt-in)');
    test.setTimeout(6 * 60_000);
    expect(info.config.workers, 'El smoke de recovery requiere workers=1').toBe(1);

    const historial = new HistorialCasos();
    // Como máximo un pendiente: nunca acumular casos huérfanos.
    if ((await historial.listarPendientes('portal')).length > 0) {
      throw new Error('Recovery smoke bloqueado: existen casos Portal pendientes. '
        + 'Ejecute npm run cleanup -- colsubsidio antes de crear otro.');
    }

    validarDatosCP01();
    const soportePage = await context.newPage();
    const soporte = new BizagiQaSupport(soportePage, historial);
    const portal = new AfiliacionesPortal(page);
    let numeroCaso: string | undefined;
    let persistido = false;
    try {
      await soporte.login(); // Acceso de recovery verificado antes de crear.
      await portal.abrir();
      await portal.preparar();
      await portal.enviarUnaVez(async numero => {
        numeroCaso = numero;
        await soporte.registrarCasoCreado(numero, ESCENARIO);
        persistido = true;
      });
    } catch (error) {
      // Creado pero sin histórico: el recovery no podría verlo, se aplica el cleanup normal.
      if (numeroCaso && !persistido) await soporte.cancelarCasoCreado().catch(() => {});
      throw errorSeguro(error);
    } finally {
      await soportePage.close();
    }

    const registro = (await historial.listar()).filter(c => c.numeroCaso === numeroCaso);
    expect(registro, 'Un único registro del caso en el histórico').toHaveLength(1);
    expect(registro[0]).toMatchObject({
      numeroCaso, escenario: ESCENARIO, modoCreacion: 'portal', estadoDepuracion: 'Pendiente de depurar',
    });
    expect((await historial.listarPendientes('portal')).map(c => c.numeroCaso)).toEqual([numeroCaso]);

    const aviso = [
      '',
      '==================================================',
      'RECOVERY SMOKE:',
      `Caso ${numeroCaso} creado y dejado intencionalmente pendiente.`,
      'Ejecute:',
      'npm run cleanup -- colsubsidio',
      '==================================================',
      '',
    ].join('\n');
    console.log(aviso);
    info.annotations.push({ type: 'RECOVERY SMOKE', description: `Caso ${numeroCaso} pendiente: npm run cleanup -- colsubsidio` });
    await info.attach('recovery-smoke.json', {
      body: JSON.stringify(registro[0], null, 2), contentType: 'application/json',
    });
  });
});
