import { test, type Page, type Locator } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro } from '../sde/datos';
import { crearContexto } from '../sde/ejecutor';
import { crearCapacidadesUi, VIEWPORT_SDE, type UiEntorno } from '../sde/capacidades';
import { SdeObjects } from '../baseObjects/sde.objects';
import { DIR_SALIDA, registrarCasoCreado } from '../sde/registro';
import { esperarCarga, normaliza, regexExacto, unicoVisible } from '../sde/ui';
import { exclusividadEjecucionReal } from '../sde/verticales';

/**
 * DIAGNÓSTICO BUG-01 (secuencia de documentos) — SOLO el formulario de inicio, NUNCA pulsa "Crear" (sin "Crear" no
 * existe caso; verificado en la Fase 1B). Corre con SDE_DIAGNOSTICO_DOCS=1.
 * QA indicó (2026-10-13) que "primero se guardan los registros y después se adjuntan los documentos". Se observa, paso a
 * paso, qué ofrece la lista "Tipo Documental" de la grilla "Documentos Anexos": al Adicionar, tras guardar la fila y al
 * volver a editarla. Salida: test-results/seguros-del-estado/sde/diagnostico-docs-<fecha>.json (sin datos sensibles).
 */
test.use({ viewport: VIEWPORT_SDE, trace: 'off' });
exclusividadEjecucionReal('diagnóstico BUG-01 documentos'); // H6: puede crear casos: nunca en paralelo con otra ejecución real

const MOVIMIENTO = process.env.SDE_DIAG_MOVIMIENTO ?? 'Póliza Nueva';

interface Llamada { ruta: string; http: number; acciones?: { action?: string; type?: string; messages?: string[] }[]; bytes: number }
function grabarRed(page: Page): { tomar: () => Llamada[] } {
  let buffer: Promise<Llamada>[] = [];
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (!/\/Rest\//i.test(u.pathname) && !/\.(ashx|asmx|svc)$/i.test(u.pathname)) return;
    buffer.push(r.text().catch(() => '').then((t) => {
      let acciones: Llamada['acciones'];
      if (u.pathname.includes(SdeObjects.rutaAcciones)) {
        try { acciones = (JSON.parse(t) as { result?: { action?: string; type?: string; messages?: string[] } }[]).map((x) => ({ action: x.result?.action, type: x.result?.type, messages: x.result?.messages })); } catch { /* respuesta no JSON */ }
      }
      return { ruta: u.pathname, http: r.status(), acciones, bytes: t.length };
    }));
  });
  return { tomar: () => { const b = buffer; buffer = []; return b as unknown as Llamada[]; } };
}

async function opcionesDelCombo(page: Page, combo: Locator): Promise<string[]> {
  const lista = await combo.getAttribute('aria-controls');
  if (!lista) return ['<sin aria-controls>'];
  const opciones = page.locator(SdeObjects.opcionesDe(lista)).filter({ visible: true });
  for (let i = 0; i < 4; i++) {
    await combo.click();
    // Condición de espera: alguna opción visible (si la lista está vacía se agota y se reintenta abrir).
    if (await opciones.first().waitFor({ state: 'visible', timeout: 4_000 }).then(() => true, () => false)) break;
  }
  const textos = (await opciones.allInnerTexts()).map(normaliza).filter(Boolean);
  if (process.env.SDE_DIAG_IDS === '1') {
    const attrs = await opciones.evaluateAll((os) => os.map((o) => ({ texto: (o as HTMLElement).innerText.trim(), data_value: o.getAttribute('data-value'), id: o.id })));
    console.log(`DIAG opciones-atributos ${JSON.stringify(attrs)}`);
  }
  // Cerrar la lista con un segundo clic: Escape cierra TODO el formulario de inicio (diálogo jQuery UI).
  // (y con la lista vacía el desplegable tapa el combo): se cierra pulsando la barra de título del diálogo, que es inerte.
  const desplegable = page.locator(`[id="dd-${(await combo.getAttribute('id')) ?? ''}"]`).filter({ visible: true });
  if ((await desplegable.count()) > 0) await page.locator(`${SdeObjects.dialogoInicio} .ui-dialog-titlebar`).click({ position: { x: 5, y: 5 } });
  return textos;
}

async function estadoGrilla(page: Page, grilla: Locator): Promise<Record<string, unknown>> {
  const filas = grilla.locator(SdeObjects.filaDatos).filter({ visible: true });
  const n = await filas.count();
  const detalle = [];
  for (let k = 0; k < n; k++) {
    const fila = filas.nth(k);
    detalle.push({
      celdas: (await fila.locator('td').allInnerTexts()).map(normaliza),
      combos: await fila.locator(SdeObjects.combo).filter({ visible: true }).count(),
      inputs_archivo: await fila.locator('input[type="file"]').count(),
      clases: (await fila.getAttribute('class')) ?? '',
    });
  }
  return {
    filas: n, detalle,
    acciones_pie: await grilla.locator('li[data-action]').filter({ visible: true }).evaluateAll((ls) => ls.map((l) => l.getAttribute('data-action'))),
    notificaciones: (await page.locator(SdeObjects.notificacion).filter({ visible: true }).allInnerTexts()).map(normaliza).filter(Boolean),
  };
}

test('diagnóstico BUG-01: secuencia guardar registro → tipos documentales (sin Crear) @diagnostico', async ({ page, browser }, testInfo) => {
  test.skip(process.env.SDE_DIAGNOSTICO_DOCS !== '1', 'Diagnóstico: SDE_DIAGNOSTICO_DOCS=1.');
  testInfo.setTimeout(15 * 60_000);
  const registro = cargarRegistro();
  const ctx = crearContexto(registro, process.env, 'diag');
  const ui: UiEntorno = {
    browser, paginaInicial: page, paginas: new Map(), contextos: [],
    registrarCaso: (n, actor) => registrarCasoCreado({ cp: 'DIAGNOSTICO BUG-01 secuencia producto (no es resultado de CP)', numero: n, actor, unico: 'diag', cleanup: 'CLEANUP_NOT_APPLICABLE' }),
    soloLectura: process.env.SDE_DIAG_CREAR !== '1', // solo crea si se pide explícitamente
  };
  const { capacidades } = crearCapacidadesUi(ui);
  const obs: Record<string, unknown>[] = [];
  const foto = async (n: string) => testInfo.attach(n, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  const red = grabarRed(page);
  const anotar = async (paso: string, datos: Record<string, unknown>) => {
    const llamadas = await Promise.all(red.tomar() as unknown as Promise<Llamada>[]);
    const resumen = llamadas.filter((l) => l.acciones || l.ruta.includes('Render') || l.ruta.includes('Combo') || l.ruta.includes('Data'));
    obs.push({ paso, ...datos, red: resumen });
    console.log(`DIAG ${paso} ${JSON.stringify({ ...datos, red: resumen })}`);
  };

  try {
    await capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' }, ctx);
    await capacidades.nuevo_caso({ matriz: [2], hacer: 'nuevo_caso', proceso: '${config:SDE_PROCESO_RADICACION}', categoria: '${config:SDE_PROCESO_CATEGORIA}' }, ctx);
    await capacidades.diligenciar({ matriz: [3], hacer: 'diligenciar', campos: [
      { campo: 'Línea', valor: 'Generales', tipo: 'lista' },
      { campo: 'Ramo', valor: '${config:SDE_GEN_RAMO}', tipo: 'lista' },
      { campo: 'Tipo de Solicitud', valor: MOVIMIENTO, tipo: 'lista' },
      { campo: 'Sucursal', valor: '${config:SDE_SUCURSAL}', tipo: 'lista' },
      { campo: 'Tipo de Radicación', valor: 'Masiva', tipo: 'radio' },
    ] }, ctx);
    if (process.env.SDE_DIAG_DESCRIPCION === '1') {
      await capacidades.diligenciar({ matriz: [9], hacer: 'diligenciar', campos: [
        { campo: 'Descripción de la Solicitud (Masiva/Múltiple)', valor: 'DIAGNÓSTICO QA automatizado: texto sintético sin pólizas reales.', tipo: 'area' },
      ] }, ctx);
    }
    const dialogo = page.locator(SdeObjects.dialogoInicio);
    const botones = await dialogo.locator(SdeObjects.areaBotones).getByRole('button').filter({ visible: true })
      .evaluateAll((bs) => bs.map((b) => ((b as HTMLInputElement).value || (b as HTMLElement).innerText).trim()));
    const etiquetas = await dialogo.locator('label').filter({ visible: true }).allInnerTexts();
    await anotar('0-formulario', { movimiento: MOVIMIENTO, botones, etiquetas: etiquetas.map(normaliza).filter(Boolean) });

    const grillas = page.locator(SdeObjects.grilla).filter({ visible: true })
      .filter({ has: page.locator(SdeObjects.grillaTitulo).filter({ hasText: regexExacto('Documentos Anexos') }) });
    const grilla = await unicoVisible(grillas, 'la grilla "Documentos Anexos"');
    await anotar('1-inicial', await estadoGrilla(page, grilla));
    await foto('1-inicial');

    // A) Adicionar → la lista del tipo documental en la fila NUEVA (sin guardar).
    await (await unicoVisible(grilla.locator(SdeObjects.accionGrilla('add')), 'Adicionar de Documentos Anexos')).click();
    await esperarCarga(page);
    const filas = grilla.locator(SdeObjects.filaDatos).filter({ visible: true });
    const nueva = filas.last();
    const combo = nueva.locator(SdeObjects.combo).filter({ visible: true });
    // No se abre la lista aquí: cerrarla con Escape descarta la edición de la fila nueva (observado 2026-10-13).
    await anotar('2-adicionar', { ...(await estadoGrilla(page, grilla)), combos_en_fila: await combo.count() });
    await foto('2-adicionar');

    // B) Guardar la fila (acción "save" del pie) SIN tipo documental: ¿Bizagi la guarda? ¿se habilita la lista?
    const guardar = grilla.locator(SdeObjects.accionGrilla('save')).filter({ visible: true });
    if ((await guardar.count()) === 1) {
      await guardar.click();
      await esperarCarga(page);
      const fila = filas.last();
      const comboTras = fila.locator(SdeObjects.combo).filter({ visible: true });
      await anotar('3-guardar-fila', { ...(await estadoGrilla(page, grilla)), opciones: (await comboTras.count()) === 1 ? await opcionesDelCombo(page, comboTras) : `combos=${await comboTras.count()}` });
      await foto('3-guardar-fila');

      // C) Estructura de las celdas de la fila guardada (controles, sin valores): ¿hay control de carga?
      const celdas = await filas.last().locator('td').evaluateAll((tds) => tds.map((td) => ({
        controles: [...td.querySelectorAll('input, button, a, select')].map((c) => `${c.tagName.toLowerCase()}[${(c as HTMLInputElement).type ?? ''}]${(c as HTMLElement).className ? '.' + (c as HTMLElement).className.split(/\s+/).slice(0, 2).join('.') : ''}`),
        texto: (td as HTMLElement).innerText.trim().slice(0, 80),
      })));
      await anotar('4-celdas-fila-guardada', { celdas });

      // C2) Acción natural siguiente de la matriz (P9): escribir la descripción DESPUÉS de guardar la fila.
      if (process.env.SDE_DIAG_DESCRIPCION_DESPUES === '1') {
        await capacidades.diligenciar({ matriz: [9], hacer: 'diligenciar', campos: [
          { campo: 'Descripción de la Solicitud (Masiva/Múltiple)', valor: 'DIAGNÓSTICO QA automatizado: texto sintético sin pólizas reales.', tipo: 'area' },
        ] }, ctx);
        const comboD = filas.last().locator(SdeObjects.combo).filter({ visible: true });
        await anotar('4b-tras-descripcion', { ...(await estadoGrilla(page, grilla)), opciones: (await comboD.count()) === 1 ? await opcionesDelCombo(page, comboD) : `combos=${await comboD.count()}` });
      }

      // D) Re-render como lo haría un usuario: cambiar Sucursal y volver a la original (Bizagi re-pinta la forma).
      const refresco = process.env.SDE_DIAG_REFRESCO;
      if (refresco) {
        if (refresco === 'clic-fila') { await filas.last().locator('td').nth(1).click(); await esperarCarga(page); }
        if (refresco === 'nueva-fila') { await (await unicoVisible(grilla.locator(SdeObjects.accionGrilla('add')), 'Adicionar (2.ª fila)')).click(); await esperarCarga(page); }
        if (refresco === 'radio-mismo') { await capacidades.diligenciar({ matriz: [6], hacer: 'diligenciar', campos: [{ campo: 'Tipo de Radicación', valor: 'Masiva', tipo: 'radio' }] }, ctx); }
        const combos = filas.locator(SdeObjects.combo).filter({ visible: true });
        const res: Record<string, unknown> = { modo: refresco, filas: await filas.count(), combos: await combos.count() };
        for (let k = 0; k < (await combos.count()); k++) res[`opciones_fila_${k + 1}`] = await opcionesDelCombo(page, combos.nth(k));
        await anotar('4c-refresco-natural', { ...res, ...(await estadoGrilla(page, grilla)) });
      }
      if (process.env.SDE_DIAG_RERENDER === '1') {
        const otra = process.env.SDE_DIAG_SUCURSAL_ALTERNA ?? 'MEDELLIN';
        await capacidades.diligenciar({ matriz: [4], hacer: 'diligenciar', campos: [{ campo: 'Sucursal', valor: otra, tipo: 'lista' }] }, ctx);
        await capacidades.diligenciar({ matriz: [4], hacer: 'diligenciar', campos: [{ campo: 'Sucursal', valor: '${config:SDE_SUCURSAL}', tipo: 'lista' }] }, ctx);
        const grillaR = await unicoVisible(page.locator(SdeObjects.grilla).filter({ visible: true })
          .filter({ has: page.locator(SdeObjects.grillaTitulo).filter({ hasText: regexExacto('Documentos Anexos') }) }), 'la grilla "Documentos Anexos" (re-render)');
        const filasR = grillaR.locator(SdeObjects.filaDatos).filter({ visible: true });
        const estado = await estadoGrilla(page, grillaR);
        let opciones: string[] | string = 'sin filas';
        if ((await filasR.count()) > 0) {
          const comboR = filasR.last().locator(SdeObjects.combo).filter({ visible: true });
          if ((await comboR.count()) === 0) {
            // La fila guardada se muestra en lectura: se entra en edición con la acción del pie (si existe).
            await filasR.last().click();
            await esperarCarga(page);
            const editar = grillaR.locator(SdeObjects.accionGrilla('edit')).filter({ visible: true });
            if ((await editar.count()) === 1) { await editar.click(); await esperarCarga(page); }
          }
          const comboR2 = filasR.last().locator(SdeObjects.combo).filter({ visible: true });
          opciones = (await comboR2.count()) === 1 ? await opcionesDelCombo(page, comboR2) : `combos=${await comboR2.count()}`;
        }
        await anotar('5-tras-re-render', { ...estado, opciones });
        await foto('5-tras-re-render');

        // E) Elegir el tipo documental, subir el PDF sintético y (opcional) Crear: ¿la secuencia del producto completa la radicación?
        const tipo = process.env.SDE_DIAG_TIPO;
        if (tipo && (await filasR.count()) > 0) {
          const fila = filasR.last();
          const comboT = fila.locator(SdeObjects.combo).filter({ visible: true });
          const lista = await comboT.getAttribute('aria-controls');
          await comboT.click();
          await (await unicoVisible(page.locator(SdeObjects.opcionesDe(lista ?? '')).filter({ visible: true }).filter({ hasText: regexExacto(tipo) }), `el tipo "${tipo}"`)).click();
          await esperarCarga(page);
          const guardarT = grillaR.locator(SdeObjects.accionGrilla('save')).filter({ visible: true });
          if ((await guardarT.count()) === 1) { await guardarT.click(); await esperarCarga(page); }
          await anotar('6-tipo-elegido', await estadoGrilla(page, grillaR));
          // Estructura de la celda de archivo (tags y clases, sin datos) y carga como usuario: clic en el control → diálogo de archivos.
          const celdaArchivo = fila.locator('td').filter({ hasText: /No hay archivos/ });
          const estructura = await celdaArchivo.evaluateAll((tds) => tds.map((td) => [...td.querySelectorAll('*')].slice(0, 25)
            .map((e) => `${e.tagName.toLowerCase()}${(e as HTMLElement).className && typeof (e as HTMLElement).className === 'string' ? '.' + (e as HTMLElement).className.trim().split(/\s+/).join('.') : ''}${e.getAttribute('title') ? `[title=${e.getAttribute('title')}]` : ''}`)));
          await anotar('6b-celda-archivo', { estructura });
          const ruta = resolve(__dirname, '..', 'resources', 'docs', 'soporte-prueba.pdf');
          const archivo = fila.locator('input[type="file"]');
          if ((await archivo.count()) === 1) {
            await archivo.setInputFiles(ruta);
          } else if ((await celdaArchivo.count()) === 1) {
            const selector = page.waitForEvent('filechooser', { timeout: 15_000 }).catch(() => null);
            await celdaArchivo.locator(process.env.SDE_DIAG_CONTROL_ARCHIVO ?? '*').filter({ visible: true }).last().click();
            const dialogo = await selector;
            const inputsDialogo = page.locator(`${SdeObjects.dialogo} input[type="file"]`);
            await anotar('6c-dialogo-archivos', { abierto: !!dialogo, dialogos_visibles: await page.locator(SdeObjects.dialogo).filter({ visible: true }).count(), inputs_archivo_en_dialogos: await inputsDialogo.count() });
            if (dialogo) await dialogo.setFiles(ruta);
            else if ((await inputsDialogo.count()) === 1) {
              const dlgSubida = page.locator(SdeObjects.dialogo).filter({ visible: true }).filter({ has: page.locator('input[type="file"]') });
              await inputsDialogo.setInputFiles(ruta);
              await esperarCarga(page);
              const botonesSubida = await dlgSubida.getByRole('button').filter({ visible: true })
                .evaluateAll((bs) => bs.map((b) => ((b as HTMLInputElement).value || (b as HTMLElement).innerText).trim()));
              const titulo = await dlgSubida.locator('.ui-dialog-title').allInnerTexts();
              await anotar('6d-dialogo-subida', { titulo, botones: botonesSubida, texto: normaliza(await dlgSubida.innerText()).slice(0, 200) });
              const confirmar = process.env.SDE_DIAG_BOTON_SUBIR;
              if (confirmar) { await (await unicoVisible(dlgSubida.getByRole('button', { name: confirmar, exact: true }), `"${confirmar}" del diálogo de carga`)).click(); await esperarCarga(page); }
            }
          }
          await esperarCarga(page);
          await fila.getByText('soporte-prueba.pdf', { exact: true }).waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined);
          await anotar('7-archivo', { ...(await estadoGrilla(page, grillaR)), archivo_visible: await fila.getByText('soporte-prueba.pdf', { exact: true }).count() });
          await foto('7-archivo');
          if (process.env.SDE_DIAG_CREAR === '1') {
            const r = await capacidades.pulsar({ matriz: [10], hacer: 'pulsar', boton: 'Crear', capturar_numero_caso: true }, ctx)
              .then((x) => ({ ok: true, detalle: (x as { detalle: string }).detalle }), (e: Error) => ({ ok: false, detalle: e.message.split('\n')[0] }));
            await anotar('8-crear', { ...r, numero_caso: ctx.numeroCaso });
            await foto('8-crear');
          }
        }
      }
    } else {
      await anotar('3-guardar-fila', { error: `acciones "save" visibles: ${await guardar.count()}` });
    }
  } finally {
    mkdirSync(DIR_SALIDA, { recursive: true });
    writeFileSync(resolve(DIR_SALIDA, `diagnostico-docs-${Date.now()}.json`), JSON.stringify(obs, null, 2) + '\n', 'utf8');
  }
});
