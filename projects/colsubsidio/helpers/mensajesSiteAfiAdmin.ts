import { expect, type Locator, type Page } from '@playwright/test';
import { BizagiQaSupport } from './bizagiQaSupport';
import { variable } from './afiliacionesPortal';

export const CODIGO_ALERTA = 'independiente_informacion_contacto_alerta';
export interface SnapshotMensaje {
  codigo: typeof CODIGO_ALERTA;
  mensajeOriginal: string;
  inhabilitadoOriginal: boolean;
}

/** Administración UI exclusiva de Mensajes Site AFI. Nunca elimina ni crea registros. */
export class MensajesSiteAfiAdmin {
  constructor(readonly page: Page) {}

  async abrirMensajesSiteAfi(): Promise<Locator> {
    await new BizagiQaSupport(this.page).login();
    await this.page.goto(variable('BIZAGI_BASE_URL'), { waitUntil: 'domcontentloaded' });
    await this.page.locator('#menuListAdmin').click();
    await this.page.getByText('Administración de procesos', { exact: false }).click();
    await this.page.locator('#categories').getByText('Entidades', { exact: true }).click();
    const dialogo = this.page.getByRole('dialog', { name: 'Entidades', exact: true });
    await dialogo.locator('#searchEntity').fill('mensaje');
    await dialogo.getByRole('option', { name: 'Mensajes Site AFI', exact: true }).click();
    await expect(dialogo.getByRole('columnheader', { name: 'Mensaje', exact: true })).toBeVisible({ timeout: 45_000 });
    return dialogo;
  }

  private async abrirRegistro(codigo: string): Promise<Locator> {
    if (codigo !== CODIGO_ALERTA) throw new Error('CP03 solo administra el código autorizado');
    const dialogo = await this.abrirMensajesSiteAfi();
    const clave = dialogo.getByRole('cell', { name: codigo, exact: true });
    await expect(clave).toHaveCount(1);
    await clave.click();
    await dialogo.getByTitle('Editar', { exact: true }).click();
    await expect(dialogo.getByRole('textbox', { name: 'Mensaje', exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(dialogo.getByText(codigo, { exact: true })).toBeVisible();
    await expect(dialogo.getByRole('checkbox')).toHaveCount(1);
    return dialogo;
  }

  async leerRegistro(codigo = CODIGO_ALERTA): Promise<SnapshotMensaje> {
    const dialogo = await this.abrirRegistro(codigo);
    const snapshot: SnapshotMensaje = {
      codigo: CODIGO_ALERTA,
      mensajeOriginal: await dialogo.getByRole('textbox', { name: 'Mensaje', exact: true }).inputValue(),
      inhabilitadoOriginal: await dialogo.getByRole('checkbox').isChecked(),
    };
    await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialogo.getByRole('textbox', { name: 'Mensaje', exact: true })).toBeHidden();
    return snapshot;
  }

  async editarRegistro(codigo: string, cambios: { mensaje?: string; inhabilitado?: boolean }): Promise<void> {
    const dialogo = await this.abrirRegistro(codigo);
    if (cambios.mensaje !== undefined) await dialogo.getByRole('textbox', { name: 'Mensaje', exact: true }).fill(cambios.mensaje);
    if (cambios.inhabilitado !== undefined) {
      const casilla = dialogo.getByRole('checkbox');
      if (await casilla.isChecked() !== cambios.inhabilitado) {
        await casilla.focus();
        await casilla.press('Space');
      }
      await expect(casilla).toBeChecked({ checked: cambios.inhabilitado });
    }
    // Código solo lectura: no se modifica ningún otro atributo.
    await expect(dialogo.getByText(codigo, { exact: true })).toBeVisible();
    await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(dialogo.getByRole('textbox', { name: 'Mensaje', exact: true })).toBeHidden({ timeout: 45_000 });
  }

  async verificarRegistro(snapshot: SnapshotMensaje): Promise<SnapshotMensaje> {
    const persistido = await this.leerRegistro(snapshot.codigo);
    expect(persistido).toEqual(snapshot);
    return persistido;
  }

  async restaurarRegistro(snapshot: SnapshotMensaje): Promise<SnapshotMensaje> {
    await this.editarRegistro(snapshot.codigo, {
      mensaje: snapshot.mensajeOriginal, inhabilitado: snapshot.inhabilitadoOriginal,
    });
    return this.verificarRegistro(snapshot);
  }
}

