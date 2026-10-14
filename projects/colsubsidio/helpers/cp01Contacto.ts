import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { capturarEvidencia } from '../../../shared/runner/evidence';
import { AfiliacionesPortal, ALERTA_TERRITORIAL, normalizarEspacios } from './afiliacionesPortal';
import certificado from '../resources/hu14-12/CP01.json';
import { completarDireccionCertificada, descargarFormularioFinal } from './formularioFinal';
import { verificarAlertaMobile } from './contactoMobile';
import { verificarRuralUrbano } from './pdfFormulario';
import { catalogoEstable } from './catalogoAutocomplete';
import { ContactoCatalogos } from './contactoCatalogos';

export type ResultadoPaso = { paso: string; estado: 'PASS' | 'FAIL' | 'BLOCKED' | 'NO_APLICA'; detalle?: string };
export const pasosCP01 = (): ResultadoPaso[] => Array.from({ length: 15 }, (_, i) => ({ paso: `P${String(i + 4).padStart(2, '0')}`, estado: 'BLOCKED' }));

export async function ejecutarContacto(page: Page, info: TestInfo, resultados: ResultadoPaso[], mobile = false): Promise<void> {
  const portal = new AfiliacionesPortal(page);
  const evidencia = (nombre: string) => capturarEvidencia(page, info, mobile ? nombre.replace('_DESKTOP_', '_MOBILE_').replace(/_P(\d+)_/, (_, n) => `_P${Number(n) + 16}_`) : nombre);
  const adjuntar = (nombre: string, datos: unknown) => info.attach(mobile ? nombre.replace(/_P(\d+)_/, (_, n) => `_P${Number(n) + 16}_`) : nombre, { body: JSON.stringify(datos, null, 2), contentType: 'application/json' });
  const paso = async (id: string, titulo: string, accion: () => Promise<void>) => {
    if (mobile) id = `P${Number(id.slice(1)) + 16}`;
    const resultado = resultados.find(p => p.paso === id)!;
    await test.step(`CP01 ${id} ${titulo}`, async () => {
      await info.attach(`CP01_${id}_certificado.json`, { body: JSON.stringify(certificado.find(p => p.paso === id)), contentType: 'application/json' });
      try { await accion(); resultado.estado = 'PASS'; }
      catch (error) { resultado.estado = 'FAIL'; throw error; }
    });
  };
  const titulo = page.getByText('Información de contacto', { exact: true });
  await expect(titulo).toBeVisible({ timeout: 60_000 });
  const departamento = page.getByRole('combobox', { name: 'Departamento', exact: true });
  const ciudad = page.getByRole('combobox', { name: 'Ciudad vivienda', exact: true });
  const localidad = page.getByRole('combobox', { name: 'Localidad', exact: true });
  let panelDepartamento: Locator;
  let inicial: string[] = [];
  let filtrado: Locator;

  await paso('P04', 'Alerta territorial', async () => {
    const alerta = page.locator('.alertas-warn').filter({ hasText: 'Solo puedes afiliarte' });
    await expect(alerta).toBeVisible();
    expect(normalizarEspacios(await alerta.innerText())).toBe(ALERTA_TERRITORIAL);
    await expect(alerta.getByRole('img', { name: 'warn', exact: true })).toBeVisible();
    if (mobile) await verificarAlertaMobile(page, info);
    await evidencia('CP01_P04_DESKTOP_alerta');
  });
  await paso('P05', 'Tipo de población no visible', async () => {
    // Se permite existir oculto en el DOM; el requisito no exige ausencia.
    await expect(page.getByText(/Tipo de población/i).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: /Tipo de población/i })).toHaveCount(0);
    await evidencia('CP01_P05_DESKTOP_tipo_poblacion_no_visible');
  });
  await paso('P06', 'Conjunto exacto de departamentos', async () => {
    panelDepartamento = await portal.abrirCatalogo(departamento);
    const opciones = await catalogoEstable(panelDepartamento);
    await adjuntar('CP01_P06_departamentos.json', opciones);
    await evidencia('CP01_P06_DESKTOP_departamento_opciones');
    expect([...opciones].sort()).toEqual(['BOGOTÁ, D.C.', 'CUNDINAMARCA'].sort());
  });
  await paso('P07', 'Ciudad precargada y bloqueada', async () => {
    await panelDepartamento.getByRole('option', { name: 'BOGOTÁ, D.C.', exact: true }).click();
    await expect(ciudad).toHaveValue('BOGOTÁ, D.C.');
    await expect(ciudad).not.toBeEditable();
    await adjuntar('CP01_P07_estado_ciudad.json', await ciudad.evaluate(e => ({
      disabled: (e as HTMLInputElement).disabled,
      readonly: (e as HTMLInputElement).readOnly,
      ariaDisabled: e.getAttribute('aria-disabled'),
    })));
    await evidencia('CP01_P07_DESKTOP_ciudad_bloqueada');
  });
  await paso('P08', 'Rechazo de números y especiales en Localidad', async () => {
    await expect(localidad).toHaveValue('');
    const panel = await portal.abrirCatalogo(localidad);
    inicial = await catalogoEstable(panel);
    await adjuntar('CP01_P08_localidades_iniciales.json', inicial);
    await localidad.pressSequentially('123');
    await expect(localidad).toHaveValue('');
    await evidencia('CP01_P08_DESKTOP_localidad_rechazo_numeros');
    await localidad.pressSequentially('@#$%&*');
    await expect(localidad).toHaveValue('');
    await evidencia('CP01_P08_DESKTOP_localidad_rechazo_especiales');
  });
  await paso('P09', 'Limpieza del texto inválido después de blur', async () => {
    await localidad.pressSequentially('Zxyw');
    await expect(localidad).toHaveValue('Zxyw');
    await evidencia('CP01_P09_DESKTOP_localidad_antes_blur');
    await titulo.click(); // Blur real, sin dispatchEvent ni escritura en el DOM.
    await expect(localidad).not.toBeFocused();
    await expect(localidad).toHaveValue('');
    await evidencia('CP01_P09_DESKTOP_localidad_despues_blur');
  });
  await paso('P10', 'Filtro Cha antes de seleccionar', async () => {
    await localidad.click();
    await localidad.pressSequentially('Cha');
    await expect(localidad).toHaveValue('Cha');
    filtrado = await portal.abrirCatalogo(localidad);
    const opciones = await catalogoEstable(filtrado);
    await adjuntar('CP01_P10_localidades_filtro_cha.json', opciones);
    await evidencia('CP01_P10_DESKTOP_localidad_filtro_cha');
    expect(opciones).toContain('Chapinero');
  });
  await paso('P11', 'Selección Chapinero y restauración del catálogo', async () => {
    await filtrado.getByRole('option', { name: 'Chapinero', exact: true }).click();
    await expect(localidad).toHaveValue('Chapinero');
    await titulo.click();
    const panel = await portal.abrirCatalogo(localidad);
    const reabierto = await catalogoEstable(panel);
    await adjuntar('CP01_P11_localidades_reabiertas.json', reabierto);
    await evidencia('CP01_P11_DESKTOP_localidad_reabierta');
    expect([...reabierto].sort()).toEqual([...inicial].sort());
    await expect(localidad).toHaveValue('Chapinero');
    await localidad.press('Escape');
    await expect(panel).toBeHidden();
    await expect(localidad).toHaveValue('Chapinero');
  });
  const ui = new ContactoCatalogos(page, info);
  const prefijoBarrio = mobile ? 'bella' : 'bel';
  const etiqueta = (n: number) => `CP01_P${String(n + (mobile ? 16 : 0)).padStart(2, '0')}_${mobile ? 'MOBILE' : 'DESKTOP'}`;
  let barrios: string[] = [];
  await paso('P12', 'Barrio rechaza números y especiales', async () => {
    barrios = (await ui.abrir('Barrio')).opciones;
    await adjuntar('CP01_P12_barrios_iniciales.json', barrios);
    await ui.rechazar('Barrio', etiqueta(12));
  });
  await paso('P13', 'Búsqueda predictiva certificada de Bellavista', async () => {
    await ui.filtrar('Barrio', prefijoBarrio, 'Bellavista', etiqueta(13));
    const { opciones } = await ui.abrir('Barrio');
    expect(opciones.length).toBeLessThan(barrios.length);
  });
  await paso('P14', 'Bellavista conservado y catálogo completo restaurado', () =>
    ui.seleccionarYReabrir('Barrio', 'Bellavista', barrios, etiqueta(14)));
  await paso('P15', 'Barrio inválido se limpia y bloquea avance', () => ui.bloquearBarrio(etiqueta(15), mobile));
  await paso('P16', 'Barrio válido permite avanzar a dirección', () => ui.avanzarBarrio(prefijoBarrio, 'Bellavista', etiqueta(16)));
  if (mobile) return;
  // P17 no se marca PASS hasta observar el formulario final completo.
  let formulario = '';
  await paso('P17', 'Recorrido posterior a contacto y formulario final', async () => {
    await completarDireccionCertificada(page, info);
    formulario = await descargarFormularioFinal(page, info);
  });
  await paso('P18', 'Celda Rural/Urbano vacía en la fila de vivienda', () => verificarRuralUrbano(formulario, info));
}
