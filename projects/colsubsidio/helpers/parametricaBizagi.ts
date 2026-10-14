import { expect, type Locator, type Page } from '@playwright/test';
import { variable } from './afiliacionesPortal';
import { BizagiQaSupport } from './bizagiQaSupport';

/**
 * Lectura GENÉRICA y de SOLO LECTURA de una entidad paramétrica de Bizagi (Administración de procesos > Entidades).
 * Nunca crea, edita ni elimina registros: no hace clic en Editar/Guardar/Eliminar. Reutiliza la navegación ya probada en QA
 * por MensajesSiteAfiAdmin (HU 14.12 CP03). Devuelve solo textos de la tabla (contenido paramétrico, público).
 */
export interface TablaParametrica {
  entidad: string;
  columnas: string[];
  filas: string[][];
  /** Páginas leídas (la grilla puede paginar). */
  paginas: number;
}

export class ParametricaBizagi {
  constructor(readonly page: Page) {}

  /** Abre el diálogo de la entidad; `busqueda` es el texto del buscador de entidades (por defecto, el nombre). */
  async abrirEntidad(entidad: string, busqueda = entidad): Promise<Locator> {
    await new BizagiQaSupport(this.page).login();
    await this.page.goto(variable('BIZAGI_BASE_URL'), { waitUntil: 'domcontentloaded' });
    await this.page.locator('#menuListAdmin').click();
    await this.page.getByText('Administración de procesos', { exact: false }).click();
    await this.page.locator('#categories').getByText('Entidades', { exact: true }).click();
    const dialogo = this.page.getByRole('dialog', { name: 'Entidades', exact: true });
    await dialogo.locator('#searchEntity').fill(busqueda);
    await dialogo.getByRole('option', { name: entidad, exact: true }).click();
    await expect(dialogo.getByRole('columnheader').first()).toBeVisible({ timeout: 45_000 });
    return dialogo;
  }

  /**
   * Lee encabezados y TODAS las filas. Grilla observada en QA (06-Oct): table.ui-bizagi-grid-table, filas tr/td SIN roles ARIA,
   * paginación en th.bz-rn-grid-footer-pagination (vacía = una sola página). Si la grilla pagina, falla EXPLÍCITAMENTE en vez
   * de devolver una lectura parcial (nunca se afirma la ausencia de un registro sin haber leído todos).
   */
  async leerTabla(entidad: string, busqueda = entidad): Promise<TablaParametrica> {
    const dialogo = await this.abrirEntidad(entidad, busqueda);
    const lectura = await dialogo.evaluate(d => {
      const limpiar = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim();
      const tabla = d.querySelector('table.ui-bizagi-grid-table');
      const paginador = d.querySelector('.bz-rn-grid-footer-pagination');
      return {
        filas: tabla ? [...tabla.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => limpiar(td.textContent))).filter(f => f.length) : null,
        pagina: !!paginador && paginador.children.length > 0,
      };
    });
    if (!lectura.filas) throw new Error(`Paramétrica "${entidad}": no se encontró la grilla de registros (estructura no soportada).`);
    if (lectura.pagina) throw new Error(`Paramétrica "${entidad}": la grilla está paginada; la lectura paginada aún no está soportada (no se lee parcialmente).`);
    // Encabezados por rol accesible (th implícito): la misma lectura que ya usaba MensajesSiteAfiAdmin.
    const columnas = (await dialogo.getByRole('columnheader').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { entidad, columnas, filas: lectura.filas, paginas: 1 };
  }
}
