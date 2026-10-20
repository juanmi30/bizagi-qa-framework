import { test, expect, type Page } from '@playwright/test';
import { cargarRegistro } from '../../sde/datos';
import { crearContexto } from '../../sde/ejecutor';
import { celdaPorClave, crearCapacidadesUi, type UiEntorno } from '../../sde/capacidades';
import type { RegistroPopups } from '../../sde/popups';

/**
 * D-66 (2026-10-20, caso 702): la identidad de una fila de «Detalle Polizas Asociadas» es su clave de negocio (columna «id» =
 * data-business-key), estable al recargar; data-key cambia en cada render. DOM sintético; claves y placas ficticias.
 */
const fila = (id: string, placa: string, negocio = id, dataKey = String(Math.floor(Math.random() * 9000))) =>
  `<tr data-bizagi-component="cells" data-key="${dataKey}" data-business-key="${negocio}"><td>${id}</td><td>${placa}</td><td></td></tr>`;
const grilla = (filas: string) => `<div class="bzg-form-grid"><div class="bz-rn-grid-header-title">Detalle Polizas Asociadas</div>
  <table><thead><tr><th><label>id</label></th><th><label>Placa</label></th><th></th></tr></thead><tbody class="ui-bizagi-grid-body">${filas}</tbody></table><ul><li data-action="edit">Editar</li></ul></div>`;

test.describe('Identidad de fila por clave de negocio (D-66) @unit', () => {
  test('lee la fila con esa clave aunque cambie el orden', async ({ page }) => {
    await page.setContent(grilla(fila('1554', 'XYZ987') + fila('1553', 'DEF456') + fila('1555', 'KLM456')));
    expect(await celdaPorClave(page, 'Detalle Polizas Asociadas', '1553', 'Placa')).toBe('DEF456');
  });
  test('clave duplicada: no concluye (null), nunca elige una', async ({ page }) => {
    await page.setContent(grilla(fila('1553', 'DEF456') + fila('1553', 'MNP4567')));
    expect(await celdaPorClave(page, 'Detalle Polizas Asociadas', '1553', 'Placa')).toBeNull();
  });
  test('clave ausente: null', async ({ page }) => {
    await page.setContent(grilla(fila('1554', 'XYZ987')));
    expect(await celdaPorClave(page, 'Detalle Polizas Asociadas', '1553', 'Placa')).toBeNull();
  });
  test('data-business-key y columna id que no coinciden: null', async ({ page }) => {
    await page.setContent(grilla(fila('9999', 'DEF456', '1553')));
    expect(await celdaPorClave(page, 'Detalle Polizas Asociadas', '1553', 'Placa')).toBeNull();
  });
  test('tabla_abrir_fila captura la clave solo si es única y coincide con la columna id', async ({ page }) => {
    const abrir = async (p: Page, html: string) => {
      await p.setContent(`${html}<div class="ui-dialog" role="dialog" hidden id="dlg">Editar</div>
        <script>document.querySelector('[data-action=edit]').onclick = () => { document.getElementById('dlg').hidden = false; };</script>`);
      const ui: UiEntorno = { browser: p.context().browser()!, paginaInicial: p, paginas: new Map([['analista', p]]), contextos: [], actual: 'analista', registrarCaso: () => undefined,
        popupsCalibrados: { f: { tabla: 'Detalle Polizas Asociadas', estado: 'calibrado', mapeo_controles: { Placa: 'texto' }, evidencia: 'sintética', cierre_seguro_verificado: true } } as unknown as RegistroPopups };
      const ctx = crearContexto(cargarRegistro(), {}, 'u');
      ctx.numeroCaso = '700';
      await crearCapacidadesUi(ui).capacidades.tabla_abrir_fila({ matriz: [18], hacer: 'tabla_abrir_fila', formulario: 'f', tabla: 'Detalle Polizas Asociadas', fila: 1 }, ctx).catch(() => undefined);
      return ui.tabla?.clave;
    };
    expect(await abrir(page, grilla(fila('1553', 'DEF456') + fila('1554', 'XYZ987')))).toBe('1553');
    expect(await abrir(page, grilla(fila('1553', 'DEF456', '7777')))).toBeUndefined();
  });
});
