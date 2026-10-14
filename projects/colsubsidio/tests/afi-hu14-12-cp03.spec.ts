import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { copyFile, mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ALERTA_TERRITORIAL, AfiliacionesPortal, errorSeguro, validarDatosCP01, variable } from '../helpers/afiliacionesPortal';
import { BizagiQaSupport } from '../helpers/bizagiQaSupport';
import { CODIGO_ALERTA, MensajesSiteAfiAdmin, type SnapshotMensaje } from '../helpers/mensajesSiteAfiAdmin';
import { ContactoCatalogos } from '../helpers/contactoCatalogos';
import { completarDireccionCertificada } from '../helpers/formularioFinal';
import { capturarEvidencia } from '../../../shared/runner/evidence';

const BASELINE: SnapshotMensaje = {
  codigo: CODIGO_ALERTA, mensajeOriginal: ALERTA_TERRITORIAL, inhabilitadoOriginal: false,
};

const directorioRecovery = resolve('test-results/colsubsidio/cp03-recovery');
const recovery = resolve(directorioRecovery, 'mensaje-pendiente.json');
const bloqueo = resolve(directorioRecovery, 'ejecucion.lock');
const advertencia = 'ATENCIÓN: RESTAURACIÓN DE PARAMÉTRICA NO CONFIRMADA';

async function existe(path: string): Promise<boolean> {
  try { await readFile(path); return true; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; }
}
function validarSnapshot(dato: unknown): SnapshotMensaje {
  const d = dato as Partial<SnapshotMensaje> | null;
  if (!d || d.codigo !== CODIGO_ALERTA || typeof d.mensajeOriginal !== 'string'
    || typeof d.inhabilitadoOriginal !== 'boolean') throw new Error('Recovery inválido: conservar y revisar antes de cualquier mutación');
  return d as SnapshotMensaje;
}

test.describe('228502 - AFI HU 14.12 CP03', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.use({ viewport: { width: 1365, height: 900 } });
  test('CP03 parametrización y depuración en Bizagi', async ({ page: adminPage, browser }, info) => {
    test.skip(process.env.AFI_CP03_RUN_REAL !== 'true', 'Requiere AFI_CP03_RUN_REAL=true');
    test.setTimeout(25 * 60_000);
    expect(info.config.workers, 'CP03 requiere workers=1').toBe(1);
    expect(info.project.retries, 'CP03 requiere retries=0').toBe(0);
    const inicio = Date.now();
    const token = randomUUID();
    const pdfTemporales: string[] = [];
    let pdfTemporalesEliminados = false;
    const admin = new MensajesSiteAfiAdmin(adminPage);
    const pasos: Record<string, 'PASS' | 'FAIL' | 'BLOCKED'> = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => ['P' + String(i + 2).padStart(2, '0'), 'BLOCKED']),
    );
    const casos: { numero: string; soporte: BizagiQaSupport; cleanup: string }[] = [];
    const portales: { context: BrowserContext; page: Page; numero?: string }[] = [];
    let estadoFinal: SnapshotMensaje | undefined;
    let restaurada = false, lockPropio = false;
    let fallo: Error | undefined;
    const secundarios: string[] = [];
    const adjuntar = async (nombre: string, datos: unknown) => {
      const path = info.outputPath(nombre);
      await writeFile(path, JSON.stringify(datos, null, 2), 'utf8');
      await info.attach(nombre, { path, contentType: 'application/json' });
    };
    const paso = async (id: string, titulo: string, accion: () => Promise<void>) => {
      await test.step('CP03 ' + id + ' ' + titulo, async () => {
        try { await accion(); pasos[id] = 'PASS'; }
        catch (e) { pasos[id] = 'FAIL'; throw errorSeguro(e); }
      });
    };
    const cancelar = async (numero: string) => {
      const caso = casos.find(c => c.numero === numero)!;
      if (caso.cleanup === 'exitoso') return;
      try {
        await caso.soporte.cancelarCasoCreado();
        caso.cleanup = 'exitoso';
      } catch (errorCleanup) {
        // N/A solo con estado terminal explicito del padre propio, nunca por ausencia.
        const dialogo = await caso.soporte.buscarCaso();
        const padre = dialogo.getByRole('row').filter({
          has: dialogo.locator('input[name="CaseAdmin"][data-subprocess="false"][value="' + numero + '"]'),
        });
        await expect(padre).toHaveCount(1);
        const terminal = padre.getByRole('cell').filter({ hasText: /^\s*(Finalizado|Terminado|Completado|Cerrado|Cancelado)\s*$/i });
        if (await terminal.count() !== 1) throw errorCleanup;
        caso.cleanup = 'N/A: estado terminal ' + (await terminal.innerText()).trim();
        await adjuntar('CP03_cleanup-terminal-' + numero + '.json', { numero, estado: await terminal.innerText() });
      }
    };
    const nuevaSolicitud = async () => {
      const context = await browser.newContext({
        baseURL: variable('BIZAGI_BASE_URL'), ignoreHTTPSErrors: true,
        viewport: { width: 1365, height: 900 },
      });
      const portalPage = await context.newPage();
      const corrida: typeof portales[number] = { context, page: portalPage };
      portales.push(corrida);
      const portal = new AfiliacionesPortal(portalPage);
      await portal.abrir();
      await portal.preparar();
      const soporte = new BizagiQaSupport(adminPage);
      await portal.enviarUnaVez(async numero => {
        corrida.numero = numero;
        // En la lista de cleanup antes de escribir disco: un fallo del histórico no evita cancelarlo.
        casos.push({ numero, soporte, cleanup: 'pendiente' });
        await soporte.registrarCasoCreado(numero, 'AFI HU 14.12 CP03');
        await adjuntar('CP03_casos-creados.json', casos.map(c => ({ numero: c.numero, cleanup: c.cleanup })));
      });
      const pantalla = portalPage.locator('#numeroCelular, #actividad').or(
        portalPage.getByText('Información de contacto', { exact: true }));
      try { await expect(pantalla).toBeVisible({ timeout: 180_000 }); }
      catch (errorAvance) {
        const verificando = portalPage.getByText('Estamos verificando tu informaci\u00f3n de forma segura', { exact: true });
        const limite = Date.now() + 120_000;
        let emulado = false;
        while (!(await pantalla.isVisible()) && Date.now() < limite) {
          // La contingencia solo aplica mientras persiste este estado exacto.
          if (!(await verificando.isVisible())) break;
          const actividades = await soporte.actividades();
          if (await pantalla.isVisible() || !(await verificando.isVisible())) break;
          const reconocimiento = actividades.filter(nombre => /reconocimiento/i.test(nombre));
          expect(reconocimiento.length, 'Reconocimiento no ambiguo del caso propio').toBeLessThanOrEqual(1);
          if (reconocimiento.length === 1) {
            try {
              await soporte.emularReconocimiento();
              emulado = true;
              break;
            } catch (e) {
              // Puede desaparecer entre la consulta y la emulacion por avance natural.
              if (await pantalla.isVisible() || !(await verificando.isVisible())) break;
              const mensaje = e instanceof Error ? e.message : String(e);
              if (!mensaje.includes('Debe existir una actividad inequ') || !(await soporte.actividades()).every(n => !/reconocimiento/i.test(n))) throw e;
            }
          }
          await portalPage.waitForTimeout(Math.min(3_000, Math.max(0, limite - Date.now())));
        }
        if (!(await pantalla.isVisible())) {
          if (!emulado && await verificando.isVisible()) {
            throw new Error('El Portal permaneci\u00f3 bloqueado en reconocimiento y Bizagi no public\u00f3 la actividad de reconocimiento dentro del timeout');
          }
          if (!emulado && !(await verificando.isVisible())) {
            // Otro estado no autoriza emular reconocimiento; conservar el error de avance.
            try { await expect(pantalla).toBeVisible({ timeout: 120_000 }); }
            catch { throw errorAvance; }
          } else {
            await expect(pantalla).toBeVisible({ timeout: 120_000 });
          }
        }
      }
      if (await portalPage.locator('#numeroCelular').isVisible()) await portal.completarTelefonos();
      if (await portalPage.locator('#actividad').isVisible()) await portal.completarInformacionAdicional();
      await expect(portalPage.getByText('Información de contacto', { exact: true })).toBeVisible({ timeout: 120_000 });
      return corrida;
    };
    try {
      await mkdir(directorioRecovery, { recursive: true });
      // Exclusión entre corridas CP03; un lock de proceso muerto no impide recuperar.
      if (await existe(bloqueo)) {
        const previo = JSON.parse(await readFile(bloqueo, 'utf8')) as { pid: number };
        if (!Number.isInteger(previo.pid) || previo.pid <= 0) throw new Error('Lock CP03 inválido');
        let vivo = true;
        try { process.kill(previo.pid, 0); }
        catch (e) { if ((e as NodeJS.ErrnoException).code === 'ESRCH') vivo = false; else throw e; }
        if (vivo) throw new Error('Otra ejecución CP03 mantiene el lock; no modificar paramétrica');
        await unlink(bloqueo);
      }
      const lock = await open(bloqueo, 'wx');
      lockPropio = true;
      try { await lock.writeFile(JSON.stringify({ pid: process.pid })); await lock.sync(); }
      finally { await lock.close(); }
      await new BizagiQaSupport(adminPage).login();
      // Recovery durable del baseline antes de normalizar el ambiente.
      if (await existe(recovery)) validarSnapshot(JSON.parse(await readFile(recovery, 'utf8')));
      const respaldo = await open(recovery, 'w');
      try { await respaldo.writeFile(JSON.stringify(BASELINE, null, 2), 'utf8'); await respaldo.sync(); }
      finally { await respaldo.close(); }
      await test.step('Verificar baseline antes de CP03', async () => {
        const previo = await admin.leerRegistro();
        const normalizado = previo.mensajeOriginal !== BASELINE.mensajeOriginal || previo.inhabilitadoOriginal !== false;
        if (normalizado) await admin.restaurarRegistro(BASELINE);
        await admin.verificarRegistro(BASELINE);
        await adjuntar('CP03_baseline-inicial.json', { normalizado, confirmado: true });
      });
      validarDatosCP01();
      for (const nombre of ['AFI_CP01_NUM_CEL', 'AFI_CP01_NUM_CEL_FIJO', 'AFI_CP01_ACTIVIDAD', 'AFI_CP01_INGRESO_MENSUAL']) variable(nombre);
      await paso('P02', 'Snapshot inicial de Mensajes Site AFI', async () => {
        const leido = await admin.leerRegistro();
        expect(leido).toEqual(BASELINE);
        await adjuntar('CP03_P02_snapshot.json', { codigo: leido.codigo, mensajeOriginal: leido.mensajeOriginal, inhabilitado: leido.inhabilitadoOriginal });
      });
      const original = BASELINE;
      const temporal = 'Mensaje de prueba automatizada CP03 HU 14.12 ' + Date.now();
      await paso('P03', 'Modificar únicamente Mensaje y verificar persistencia', async () => {
        expect(temporal).not.toBe(original.mensajeOriginal);
        await admin.editarRegistro(CODIGO_ALERTA, { mensaje: temporal, inhabilitado: false });
        await adjuntar('CP03_P03_persistido.json', await admin.verificarRegistro({ ...original, mensajeOriginal: temporal }));
      });
      await paso('P04', 'Mensaje temporal visible en Portal', async () => {
        const portal = await nuevaSolicitud();
        const alerta = portal.page.locator('.alertas-warn');
        await expect(alerta).toBeVisible();
        expect(await alerta.innerText()).toBe(temporal);
        await expect(portal.page.getByText(original.mensajeOriginal, { exact: true })).toBeHidden();
        await capturarEvidencia(portal.page, info, 'CP03_P04_mensaje_temporal');
        await cancelar(portal.numero!);
      });
      await paso('P05', 'Restauración intermedia y nueva solicitud', async () => {
        await admin.restaurarRegistro(original);
        const portal = await nuevaSolicitud();
        const alerta = portal.page.locator('.alertas-warn');
        await expect(alerta).toBeVisible();
        expect(await alerta.innerText()).toBe(original.mensajeOriginal);
        await capturarEvidencia(portal.page, info, 'CP03_P05_mensaje_original');
        await cancelar(portal.numero!);
      });
      await paso('P06', 'Inhabilitar sin borrar ni cambiar Mensaje', async () => {
        await admin.editarRegistro(CODIGO_ALERTA, { inhabilitado: true });
        await adjuntar('CP03_P06_persistido.json', await admin.verificarRegistro({ ...original, inhabilitadoOriginal: true }));
      });
      let vigente: typeof portales[number];
      await paso('P07', 'Alerta territorial no visible', async () => {
        vigente = await nuevaSolicitud();
        await expect(vigente.page.locator('.alertas-warn').filter({ visible: true })).toHaveCount(0);
        await expect(vigente.page.getByText(original.mensajeOriginal, { exact: true })).toBeHidden();
        await capturarEvidencia(vigente.page, info, 'CP03_P07_alerta_ausente');
      });
      await paso('P08', 'Enviar solicitud y capturar radicado', async () => {
        const portalPage = vigente!.page;
        const ui = new ContactoCatalogos(portalPage, info);
        await ui.elegir('Departamento', 'CUNDINAMARCA');
        await ui.elegir('Ciudad vivienda', 'CHÍA');
        await expect(portalPage.getByRole('button', { name: /Continuar/ })).toBeEnabled();
        await portalPage.getByRole('button', { name: /Continuar/ }).click();
        await completarDireccionCertificada(portalPage, info);
        await expect(portalPage.getByRole('heading', { name: 'Documentación', exact: true })).toBeVisible({ timeout: 60_000 });
        const [descarga] = await Promise.all([
          portalPage.waitForEvent('download', { timeout: 60_000 }),
          portalPage.locator('#link-documentacion-descargar-formulario').click(),
        ]);
        expect(await descarga.failure()).toBeNull();
        const downloadedPath = await descarga.path();
        expect(downloadedPath, 'La descarga conserva su archivo real durante esta corrida').not.toBeNull();
        expect(await existe(downloadedPath!)).toBe(true);
        await info.attach('formulario-final.pdf', { path: downloadedPath!, contentType: 'application/pdf' });
        // El aviso obligatorio desaparece al aceptar: conservar la identidad del input.
        const pendientes = portalPage.locator('.item-uploadable').filter({ visible: true })
          .filter({ hasText: 'Documento obligatorio' }).filter({ hasNotText: /no aplica/i });
        const ids = await pendientes.locator('input[type="file"]:enabled')
          .evaluateAll(es => es.map(e => e.id));
        expect(new Set(ids).size, 'Uploads sin identidades duplicadas').toBe(ids.length);
        const directorioTemp = resolve('test-results/colsubsidio/cp03-temp');
        await mkdir(directorioTemp, { recursive: true });
        const temporalPdf = resolve(directorioTemp, 'cp03-documento-' + token + '.pdf');
        pdfTemporales.push(temporalPdf);
        await copyFile(downloadedPath!, temporalPdf);
        for (const id of ids) {
          expect(id).not.toBe('');
          const input = portalPage.locator('[id=' + JSON.stringify(id) + ']');
          const documento = portalPage.locator('.item-uploadable').filter({ has: input });
          await expect(documento).toHaveCount(1);
          if (await documento.getByText('Cargado', { exact: true }).isVisible()) continue;
          await input.setInputFiles(temporalPdf);
          await expect(documento.getByText('Cargado', { exact: true })).toBeVisible({ timeout: 120_000 });
          await expect(documento.locator('.loading-spinner:visible')).toHaveCount(0);
          await expect(documento.locator('.text-error:visible, .text-danger:visible')).toHaveCount(0);
        }
        await adjuntar('CP03_P08_uploads.json', { controles: ids, copiasTemporalesDelPdf: pdfTemporales.length });
        await capturarEvidencia(portalPage, info, 'CP03_P08_documento_cargado');
        // No confundir la creación inicial con el envío final exigido por el certificado.
        await adjuntar('CP03_P08_controles-documentacion.json', await portalPage.locator('input,button,a').evaluateAll(es => es.map(e => ({
          tag: e.tagName, id: e.id, type: e.getAttribute('type'),
          label: e.getAttribute('aria-label'), required: e.hasAttribute('required'),
          disabled: e.hasAttribute('disabled'), texto: ['BUTTON', 'A'].includes(e.tagName) ? e.textContent?.trim() : undefined,
        }))));
        const enviar = portalPage.locator('#btn-documentacion-continuar');
        await expect(enviar).toBeVisible();
        try {
          await expect(enviar, 'Los documentos requeridos habilitan Continuar').toBeEnabled({ timeout: 30_000 });
        } catch (e) {
          await adjuntar('CP03_P08_uploads-pendientes.json', await pendientes.locator('input[type="file"]')
            .evaluateAll(es => es.map(e => ({ id: e.id, disabled: (e as HTMLInputElement).disabled }))));
          throw e;
        }
        await enviar.click();
        await adjuntar('CP03_P08_envio.json', { numero: vigente!.numero, archivoAceptado: true, continuarEjecutado: true });
      });
      await paso('P09', 'Acceso al Work Portal', async () => { await new BizagiQaSupport(adminPage).login(); });
      let casoAbierto: import('@playwright/test').Locator;
      await paso('P10', 'Abrir exclusivamente el caso generado', async () => {
        const numero = vigente!.numero!;
        const soporte = casos.find(c => c.numero === numero)!.soporte;
        await soporte.esperarValidacionesCliente();
        await soporte.reasignarAAdministradorQa('Realizar validaciones cliente');
        const dialogo = await soporte.buscarCaso();
        const enlace = dialogo.getByRole('link', { name: 'Realizar validaciones cliente', exact: true });
        await expect(enlace).toHaveCount(1);
        await expect(enlace).toBeVisible();
        await expect(enlace).toBeEnabled();
        await enlace.click();
        await expect(adminPage.getByText('Afiliaciones \u203a Realizar validaciones cliente', { exact: true })).toBeVisible({ timeout: 60_000 });
        casoAbierto = adminPage.locator('.ui-bizagi-container-form').filter({ visible: true });
        await expect(casoAbierto).toHaveCount(1, { timeout: 60_000 });
        await expect(casoAbierto).toBeVisible();
        await capturarEvidencia(adminPage, info, 'CP03_P10_caso_abierto');
      });
      await paso('P11', 'Ausencia de Tipo de Población en todas las zonas', async () => {
        const zonas: { zona: string; revisada: boolean; coincidencias: number }[] = [];
        try {
          // Recorrer las pestanas reales, sin imponer titulos que el certificado no exige.
          const patron = /Tipo\s+de\s+Poblaci\u00f3n/i;
          const labelsRevisados = new Set<string>();
          const revisar = async (zona: string) => {
            for (const control of await casoAbierto.locator('[aria-expanded="false"]').filter({ visible: true }).all()) {
              if (await control.getAttribute('role') === 'combobox') continue;
              if (['INPUT', 'SELECT'].includes(await control.evaluate(e => e.tagName))) continue;
              await control.click();
            }
            const labels = await casoAbierto.locator('label[id^="label-"]:visible').allTextContents();
            for (const label of labels) labelsRevisados.add(label.replace(/\s+/g, ' ').trim());
            const coincidencias = await casoAbierto.getByText(patron).count()
              + await casoAbierto.getByRole('textbox', { name: patron }).count()
              + await casoAbierto.getByRole('combobox', { name: patron }).count()
              + await casoAbierto.locator('[aria-label], [placeholder], [title]').evaluateAll(es => es.filter(e =>
                ['aria-label', 'placeholder', 'title'].some(a => /Tipo\s+de\s+Poblaci\u00f3n/i.test(e.getAttribute(a) || ''))).length);
            zonas.push({ zona, revisada: true, coincidencias });
            await capturarEvidencia(adminPage, info, 'CP03_P11_zona_' + zonas.length);
            expect(coincidencias, 'Tipo de Poblaci\u00f3n ausente en ' + zona).toBe(0);
          };
          const tramite = casoAbierto.getByText('Informaci\u00f3n del tr\u00e1mite', { exact: true });
          await expect(tramite).toHaveCount(1);
          await tramite.click();
          await revisar('Informaci\u00f3n del tr\u00e1mite / formulario principal');
          const pestanas = await casoAbierto.getByRole('tab').allTextContents();
          for (const nombre of pestanas) {
            const tab = casoAbierto.getByRole('tab', { name: nombre.trim(), exact: true });
            await expect(tab).toHaveCount(1);
            await tab.click();
            await revisar(nombre.trim());
          }
          await adjuntar('CP03_P11_labels-revisados.json', [...labelsRevisados]);
          const labels = [...labelsRevisados].join('\n');
          expect(labels, 'Se revisaron datos basicos del caso').toMatch(/identificaci\u00f3n|documento|nombre/i);
          expect(labels, 'Se revisaron datos de contacto del caso').toMatch(/direcci\u00f3n|tel\u00e9fono|correo|celular/i);
          const frames = adminPage.frames();
          for (const frame of frames) {
            const coincidencias = await frame.getByText(/Tipo\s+de\s+Población/i).filter({ visible: true }).count();
            zonas.push({ zona: frame === adminPage.mainFrame() ? 'Formulario principal' : 'iframe del caso', revisada: true, coincidencias });
            expect(coincidencias).toBe(0);
          }
          expect(zonas.every(z => z.coincidencias === 0)).toBe(true);
        } finally {
          await adjuntar('CP03_P11_zonas-revisadas.json', zonas);
          await capturarEvidencia(adminPage, info, 'CP03_P11_formulario_Bizagi');
        }
      });
    } catch (e) {
      fallo = errorSeguro(e);
      await capturarEvidencia(adminPage, info, 'CP03_fallo_Bizagi').catch(() => {});
      for (const portal of portales) await capturarEvidencia(portal.page, info, 'CP03_fallo_portal').catch(() => {});
    } finally {
      info.setTimeout(Date.now() - inicio + 8 * 60_000);
      if (lockPropio) {
        await test.step('Restauración obligatoria y verificación persistida', async () => {
          try {
            estadoFinal = await admin.restaurarRegistro(BASELINE);
            expect(estadoFinal).toEqual(BASELINE);
            restaurada = true;
            if (await existe(recovery)) await unlink(recovery);
            await adjuntar('CP03_restauracion-verificada.json', estadoFinal);
          } catch (e) {
            secundarios.push(advertencia + ': ' + errorSeguro(e).message);
            await info.attach(advertencia, { body: errorSeguro(e).message, contentType: 'text/plain' });
          }
        });
      }
      for (const caso of casos) {
        try { await cancelar(caso.numero); }
        catch (e) { caso.cleanup = 'fallido'; secundarios.push('Cleanup: ' + errorSeguro(e).message); }
      }
      for (let i = 0; i < portales.length; i++) {
        await portales[i].context.close().catch(() => {});
      }
      for (const archivo of pdfTemporales) {
        try { await unlink(archivo); }
        catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') secundarios.push('Cleanup PDF: ' + errorSeguro(e).message);
        }
      }
      pdfTemporalesEliminados = (await Promise.all(pdfTemporales.map(existe))).every(presente => !presente);
      await adjuntar('CP03_resultado.json', {
        pasos, duracionSegundos: Math.round((Date.now() - inicio) / 1000),
        casos: casos.map(c => ({ numero: c.numero, cleanup: c.cleanup })),
        pdfTemporalesEliminados,
        parametricaRestaurada: restaurada, mensajeOriginalRestaurado: restaurada,
        mensajeBaselineConfirmado: restaurada && estadoFinal?.mensajeOriginal === BASELINE.mensajeOriginal,
        inhabilitarFinal: estadoFinal?.inhabilitadoOriginal ?? null,
        recoveryPendiente: await existe(recovery), errorFuncional: fallo?.message, erroresSecundarios: secundarios,
      });
      if (lockPropio) await unlink(bloqueo);
    }
    if (fallo) throw fallo;
    if (secundarios.length) throw new Error(secundarios.join('\n'));
  });
});

