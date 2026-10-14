import { expect, test, type Page, type BrowserContext, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { capturarEvidencia } from '../../../shared/runner/evidence';
import { AfiliacionesPortal, errorSeguro, validarDatosCP01, variable } from './afiliacionesPortal';
import { BizagiQaSupport } from './bizagiQaSupport';
import { ejecutarContacto, type ResultadoPaso } from './cp01Contacto';
import { ejecutarContactoCP02, type ResultadoPasoCP02 } from './cp02Contacto';
import { CiudadNacional } from './ciudadNacional';
import { completarDireccionCertificada, descargarFormularioFinal } from './formularioFinal';
import { verificarRuralUrbano } from './pdfFormulario';
import fuenteCP01 from '../resources/hu14-12/CP01.json';
import fuenteCP02 from '../resources/hu14-12/CP02.json';

/** Preparación y finally del piloto, reutilizados por los cuatro specs locales. */
export async function ejecutarCasoReal(page: Page, context: BrowserContext, info: TestInfo, caso: 'CP01' | 'CP02', mobile = false): Promise<void> {
  test.skip(process.env.AFI_CP01_RUN_REAL !== 'true', 'Requiere AFI_CP01_RUN_REAL=true');
  test.setTimeout(15 * 60_000);
  const inicio = Date.now();
  const soporteContext = mobile ? await context.browser()!.newContext({
    baseURL: variable('BIZAGI_BASE_URL'), viewport: { width: 1365, height: 900 },
    isMobile: false, hasTouch: false, ignoreHTTPSErrors: true,
  }) : context;
  const bizagiPage = await soporteContext.newPage();
  const portal = new AfiliacionesPortal(page);
  const bizagi = new BizagiQaSupport(bizagiPage);
  const nacional = caso === 'CP02' ? new CiudadNacional(page) : undefined;
  const fuente = (caso === 'CP01' ? fuenteCP01 : fuenteCP02).filter(p => p.accion.startsWith(mobile ? '[MOBILE]' : '[DESKTOP]'));
  const pasos: ResultadoPasoCP02[] = fuente.map(p => ({ paso: p.paso, estado: 'BLOCKED' }));
  let numeroCaso: string | undefined;
  let errorFuncional: Error | undefined, errorCleanup: Error | undefined;
  let cleanup = 'no aplicó', reconocimiento = 'no requerido';
  const json = async (nombre: string, datos: unknown) => {
    const ruta = info.outputPath(nombre);
    await writeFile(ruta, JSON.stringify(datos, null, 2), 'utf8');
    await info.attach(nombre, { path: ruta, contentType: 'application/json' });
  };
  const marcar = (id: string, estado: ResultadoPaso['estado']) => { pasos.find(p => p.paso === id)!.estado = estado; };
  const inicial = mobile ? (caso === 'CP01' ? 'P19' : 'P20') : 'P02';
  let preparando = true;
  try {
    await json(`${caso}_fuente-certificada.json`, fuente);
    await test.step('Precondiciones y datos locales', async () => {
      expect(info.config.workers, 'Las pruebas reales HU 14.12 requieren --workers=1').toBe(1);
      validarDatosCP01();
      for (const nombre of ['AFI_CP01_NUM_CEL', 'AFI_CP01_NUM_CEL_FIJO', 'AFI_CP01_ACTIVIDAD', 'AFI_CP01_INGRESO_MENSUAL', 'BIZAGI_BASE_URL']) variable(nombre);
      await bizagi.login(); // Acceso de cleanup verificado antes de crear.
    });
    await test.step(`${caso} ${inicial} Home público`, async () => {
      await portal.abrir();
      await capturarEvidencia(page, info, `${caso}_${inicial}_inicio`);
      if (caso === 'CP01' && !mobile) marcar('P02', 'PASS');
    });
    await test.step(`${caso} ${caso === 'CP01' && !mobile ? 'P03' : inicial} Preparación hasta Información de contacto`, async () => {
      await portal.preparar();
      await portal.enviarUnaVez(async numero => {
        numeroCaso = numero;
        cleanup = 'pendiente';
        await bizagi.registrarCasoCreado(numero, `AFI HU 14.12 ${caso} ${mobile ? 'Mobile' : 'Desktop'}`);
        await json('caso-creado.json', { numeroCaso, cleanup });
      });
      await test.step('Transición y reconocimiento QA condicional', async () => {
        const pantalla = () => page.locator('#numeroCelular, #actividad').or(page.getByText('Información de contacto', { exact: true }));
        try {
          await expect(pantalla()).toBeVisible({ timeout: 180_000 });
          reconocimiento = 'natural';
        } catch {
          await expect(page.getByText('Estamos verificando tu información de forma segura', { exact: true })).toBeVisible();
          reconocimiento = 'emulación solicitada';
          await bizagi.emularReconocimiento();
          reconocimiento = 'emulación verificada';
          await capturarEvidencia(bizagiPage, info, `${caso}_RECONOCIMIENTO_QA`);
          await expect(pantalla()).toBeVisible({ timeout: 120_000 });
        }
      });
      if (await page.locator('#numeroCelular').isVisible()) await portal.completarTelefonos();
      if (await page.locator('#actividad').isVisible()) await portal.completarInformacionAdicional();
      await expect(page.getByText('Información de contacto', { exact: true })).toBeVisible({ timeout: 120_000 });
      if (mobile) {
        expect(page.viewportSize()).toEqual({ width: 400, height: 824 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          { message: 'Información de contacto adaptada al ancho Mobile' }).toBe(true);
      }
      if (caso === 'CP01') marcar(mobile ? 'P19' : 'P03', 'PASS');
      preparando = false;
    });
    if (caso === 'CP01') await ejecutarContacto(page, info, pasos as ResultadoPaso[], mobile);
    else {
      await ejecutarContactoCP02(page, info, pasos, nacional!, mobile);
      if (!mobile) {
        let formulario = '';
        for (const id of ['P18', 'P19']) {
          await test.step(`CP02 ${id} ${fuente.find(p => p.paso === id)!.accion}`, async () => {
            try {
              if (id === 'P18') {
                await completarDireccionCertificada(page, info);
                formulario = await descargarFormularioFinal(page, info);
              } else await verificarRuralUrbano(formulario, info);
              marcar(id, 'PASS');
            } catch (error) { marcar(id, 'FAIL'); throw error; }
          });
        }
      }
    }
    expect(pasos.filter(p => !(caso === 'CP02' ? ['PASS', 'N/A'] : ['PASS', 'NO_APLICA']).includes(p.estado)).map(p => p.paso), 'Pasos pendientes del caso certificado').toEqual([]);
  } catch (error) {
    errorFuncional = errorSeguro(error);
    if (preparando) marcar(caso === 'CP01' && !mobile && pasos[0].estado === 'PASS' ? 'P03' : inicial, 'FAIL');
    try { await capturarEvidencia(page, info, `${caso}_FALLO_FUNCIONAL`); } catch { /* Preservar causa original. */ }
  } finally {
    info.setTimeout(Date.now() - inicio + 180_000);
    await nacional?.cerrar();
    if (numeroCaso) {
      await test.step('Cleanup del caso creado en esta corrida', async () => {
        try { await bizagi.cancelarCasoCreado(); cleanup = 'exitoso'; }
        catch (error) { cleanup = 'fallido'; errorCleanup = errorSeguro(error); }
        try { await capturarEvidencia(bizagiPage, info, `${caso}_CLEANUP`); } catch { /* Resultado administrativo conservado. */ }
      });
    }
    await json(`${caso}_resultado.json`, {
      caso, plataforma: mobile ? 'Mobile (emulación Playwright)' : 'Desktop',
      numeroCaso, duracionSegundos: Math.round((Date.now() - inicio) / 1000),
      reconocimiento, pasos, cleanup, errorFuncional: errorFuncional?.message, errorCleanup: errorCleanup?.message,
    });
    if (mobile) await soporteContext.close();
  }
  if (errorFuncional) throw errorFuncional;
  if (errorCleanup) throw errorCleanup;
}
