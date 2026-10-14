import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ALERTA_TERRITORIAL, normalizarEspacios } from './afiliacionesPortal';
import { ContactoCatalogos } from './contactoCatalogos';
import { CiudadNacional } from './ciudadNacional';
import { verificarAlertaMobile } from './contactoMobile';
import { type ResultadoPaso } from './cp01Contacto';
import certificado from '../resources/hu14-12/CP02.json';

export type ResultadoPasoCP02 = Omit<ResultadoPaso, 'estado'> & { estado: ResultadoPaso['estado'] | 'N/A' };

export async function ejecutarContactoCP02(page: Page, info: TestInfo, resultados: ResultadoPasoCP02[], nacional: CiudadNacional, mobile = false): Promise<void> {
  const ui = new ContactoCatalogos(page, info);
  const id = (n: number) => `P${String(n + (mobile ? 18 : 0)).padStart(2, '0')}`;
  const paso = async (n: number, accion: () => Promise<void>, motivoNoAplica?: string) => {
    const numero = id(n);
    const fuente = certificado.find(p => p.paso === numero)!;
    const resultado = resultados.find(p => p.paso === numero)!;
    await test.step(`CP02 ${numero} ${fuente.accion}`, async () => {
      await info.attach(`CP02_${numero}_certificado.json`, { body: JSON.stringify(fuente), contentType: 'application/json' });
      if (motivoNoAplica) {
        resultado.estado = 'N/A';
        resultado.detalle = motivoNoAplica;
        await ui.evidencia(`CP02_${numero}_no_aplica`);
        return;
      }
      try { await accion(); resultado.estado = 'PASS'; }
      catch (error) { resultado.estado = 'FAIL'; throw error; }
    });
  };
  const ciudad = mobile ? 'SOACHA' : 'CHÍA';
  const prefijoCiudad = mobile ? 'Soa' : 'Chí';
  let ciudades: string[] = [];
  await paso(2, async () => {
    await expect(page.getByText('Información de contacto', { exact: true })).toBeVisible();
    const alerta = page.locator('.alertas-warn').filter({ hasText: 'Solo puedes afiliarte' });
    await expect(alerta).toBeVisible();
    expect(normalizarEspacios(await alerta.innerText())).toBe(ALERTA_TERRITORIAL);
    await expect(alerta.getByRole('img', { name: 'warn', exact: true })).toBeVisible();
    const subtitulo = page.getByText('Información de localización vivienda', { exact: true });
    await expect(subtitulo).toBeVisible();
    const a = await alerta.boundingBox(), s = await subtitulo.boundingBox();
    expect(a!.y).toBeGreaterThanOrEqual(s!.y + s!.height);
    if (mobile) await verificarAlertaMobile(page, info);
    await ui.evidencia(`CP02_${id(2)}_alerta`);
  });
  await paso(3, async () => {
    const { opciones } = await ui.abrir('Departamento');
    expect([...opciones].sort()).toEqual(['BOGOTÁ, D.C.', 'CUNDINAMARCA'].sort());
    await ui.elegir('Departamento', 'CUNDINAMARCA');
    await expect(ui.campo('Ciudad vivienda')).toBeEditable();
    await expect(ui.campo('Ciudad vivienda')).toHaveValue('');
    await ui.evidencia(`CP02_${id(3)}_ciudad_habilitada`);
  });
  await paso(4, async () => {
    ciudades = (await ui.abrir('Ciudad vivienda')).opciones;
    await nacional.verificar(ciudades, info);
    await ui.evidencia(`CP02_${id(4)}_ciudades`, ciudades);
  });
  await paso(5, () => ui.rechazar('Ciudad vivienda', `CP02_${id(5)}`));
  await paso(6, () => ui.limpiarTrasBlur('Ciudad vivienda', `CP02_${id(6)}`));
  await paso(7, () => ui.filtrar('Ciudad vivienda', prefijoCiudad, ciudad, `CP02_${id(7)}`));
  await paso(8, () => ui.seleccionarYReabrir('Ciudad vivienda', ciudad, ciudades, `CP02_${id(8)}`));
  await paso(9, async () => {
    await ui.elegir('Departamento', 'BOGOTÁ, D.C.');
    await expect(ui.campo('Ciudad vivienda')).toHaveValue('BOGOTÁ, D.C.');
    await expect(ui.campo('Ciudad vivienda')).not.toBeEditable();
    await ui.evidencia(`CP02_${id(9)}_bogota_bloqueada`);
  });
  await paso(10, async () => {
    await ui.elegir('Departamento', 'CUNDINAMARCA');
    await expect(ui.campo('Ciudad vivienda')).toBeEditable();
    const { opciones } = await ui.abrir('Ciudad vivienda');
    await nacional.verificar(opciones, info);
    await ui.filtrar('Ciudad vivienda', prefijoCiudad, ciudad, `CP02_${id(10)}`);
    await ui.elegir('Ciudad vivienda', ciudad);
  });
  const continuar = page.getByRole('button', { name: /Continuar/ });
  // Esperar una condición accionable después de la selección del municipio.
  await expect.poll(async () => await ui.campo('Localidad').isVisible()
    || await ui.campo('Barrio').isVisible() || await continuar.isEnabled()).toBe(true);
  const motivoLocalidad = await ui.campo('Localidad').isVisible()
    ? undefined : 'El municipio seleccionado no habilita Localidad';
  await paso(11, () => ui.rechazar('Localidad', `CP02_${id(11)}`), motivoLocalidad);
  await paso(12, () => ui.limpiarTrasBlur('Localidad', `CP02_${id(12)}`), motivoLocalidad);
  await paso(13, async () => {
    const { opciones } = await ui.abrir('Localidad');
    const seleccion = opcionValida(opciones);
    await ui.filtrar('Localidad', prefijo(seleccion), seleccion, `CP02_${id(13)}`);
    await ui.seleccionarYReabrir('Localidad', seleccion, opciones, `CP02_${id(13)}`);
  }, motivoLocalidad);
  await expect.poll(async () => await ui.campo('Barrio').isVisible() || await continuar.isEnabled()).toBe(true);
  const motivoBarrio = await ui.campo('Barrio').isVisible()
    ? undefined : 'El municipio seleccionado no habilita Barrio';
  let barrios: string[] = [], barrio = '';
  await paso(14, async () => {
    barrios = (await ui.abrir('Barrio')).opciones;
    barrio = opcionValida(barrios);
    await info.attach('CP02_datos_catalogo_corrida.json', {
      body: JSON.stringify({ ciudad, barrio, prefijo: prefijo(barrio) }), contentType: 'application/json',
    });
    await ui.rechazar('Barrio', `CP02_${id(14)}`);
  }, motivoBarrio);
  await paso(15, async () => {
    await ui.filtrar('Barrio', prefijo(barrio), barrio, `CP02_${id(15)}`);
    await ui.seleccionarYReabrir('Barrio', barrio, barrios, `CP02_${id(15)}`);
  }, motivoBarrio);
  await paso(16, () => ui.bloquearBarrio(`CP02_${id(16)}`, mobile), motivoBarrio);
  await paso(17, () => ui.avanzarBarrio(prefijo(barrio), barrio, `CP02_${id(17)}`), motivoBarrio);
  if (motivoBarrio) {
    await test.step('CP02 Continuar con los campos aplicables válidos', async () => {
      await expect(continuar).toBeEnabled();
      await continuar.click();
      await expect(page.getByText('Información de contacto', { exact: true })).toBeHidden();
      await expect(page.getByText('Ingresa la información asociada a la dirección', { exact: true }))
        .toBeVisible({ timeout: 45_000 });
      await ui.evidencia(`CP02_${id(17)}_avance_sin_barrio`);
    });
  }
}

function opcionValida(opciones: string[]): string {
  const valor = opciones.find(o => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(o.trim()));
  expect(valor, 'Catálogo real con al menos una opción válida alfabética').toBeTruthy();
  return valor!;
}
function prefijo(valor: string): string { return valor.match(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/)![0].slice(0, 3); }
