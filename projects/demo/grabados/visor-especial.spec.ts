import { registerGrabado } from '@shared';

// Escenario GRABADO adoptado. Sin login ni credenciales: el molde hace el login
// del núcleo con el usuario lógico del .env. Completa etiquetas y hazards abajo.
registerGrabado(
  {
    escenario: 'Visor especial',
    usuario: 'admin',        // usuario LÓGICO del .env (USUARIO_admin=...)
    etiquetas: ['smoke'],
    hazards: [{ asignado_a: 'revisor1' }],
    archivo: 'visor-especial',
  },
  async ({ page }) => {
    await page.getByRole('link', { name: 'Nuevo Caso' }).click();
    await page.getByText('Radicación con visor especial').click();
    await page.getByRole('button', { name: 'Abrir visor de documentos' }).click();
    await page.getByRole('tab', { name: 'Anexos' }).click();
    await page.getByRole('button', { name: 'Marcar como revisado' }).click();
    await page.getByRole('button', { name: 'Cerrar visor' }).click();
  },
);
