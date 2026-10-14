import type { Page, Response } from '@playwright/test';
import { parametrosRegistro, type InstantaneaFuente, type RegistroFuente } from '../data/afi/fuentes';

/** Proveedor de una fuente autoritativa: entrega lo observado; la interpretación es pura (data/afi/fuentes.ts). */
export interface ProveedorFuenteAfi {
  instantanea(): Promise<InstantaneaFuente>;
  cerrar(): Promise<void>;
}

type Entrada =
  | { orden: number; estado: 'legible'; registros: RegistroFuente[]; paginada: boolean }
  | { orden: number; estado: 'ilegible' };

const VALORES_ENTIDAD = /\/odata\/data\/entities\([^)]+\)\/values$/;

/**
 * Paramétricas OData del Portal (generaliza el helper histórico CiudadNacional, Fase 4D).
 * Observa las respuestas que el Portal YA solicita; conserva la última por entidad.
 * Si Chromium no conserva el cuerpo, relee SOLO peticiones GET con la misma petición autorizada.
 * Nunca repite POST ni mutaciones, nunca modifica respuestas y no conoce ningún caso ni valor de ejemplo.
 * Debe crearse ANTES de que el Portal cargue la pantalla (el runner crea el driver al inicio).
 */
export class FuenteParametricaPortal implements ProveedorFuenteAfi {
  private readonly entidades = new Map<string, Entrada>();
  private readonly pendientes = new Set<Promise<void>>();
  private lecturasRespaldo = 0;
  private secuencia = 0;
  private readonly escuchar = (response: Response) => {
    const url = new URL(response.url());
    if (!VALORES_ENTIDAD.test(url.pathname)) return;
    const orden = ++this.secuencia;
    const pendiente = this.observar(url.pathname, orden, response)
      .catch(() => this.guardar(url.pathname, { orden, estado: 'ilegible' }));
    this.pendientes.add(pendiente);
    void pendiente.finally(() => this.pendientes.delete(pendiente));
  };

  constructor(private readonly page: Page) { page.on('response', this.escuchar); }

  private guardar(entidad: string, entrada: Entrada): void {
    const previa = this.entidades.get(entidad);
    if (!previa || previa.orden < entrada.orden) this.entidades.set(entidad, entrada);
  }

  private async observar(entidad: string, orden: number, response: Response): Promise<void> {
    if (!response.ok()) return;
    let data: { value?: unknown; '@odata.nextLink'?: unknown } | undefined;
    try {
      data = await response.json();
    } catch {
      if (response.request().method() === 'GET') {
        try {
          const relectura = await this.page.request.fetch(response.request());
          if (relectura.ok()) { data = await relectura.json(); this.lecturasRespaldo++; }
        } catch { /* queda ilegible */ }
      }
    }
    if (!data || !Array.isArray(data.value)) { this.guardar(entidad, { orden, estado: 'ilegible' }); return; }
    this.guardar(entidad, { orden, estado: 'legible', registros: data.value.map(parametrosRegistro), paginada: !!data['@odata.nextLink'] });
  }

  async instantanea(): Promise<InstantaneaFuente> {
    await Promise.all([...this.pendientes]);
    const entradas = [...this.entidades.entries()];
    const legibles = entradas.filter((e): e is [string, Extract<Entrada, { estado: 'legible' }>] => e[1].estado === 'legible');
    return {
      respuestas: legibles.filter(([, e]) => e.registros.length).map(([entidad, e]) => ({ entidad, registros: e.registros, paginada: e.paginada })),
      lecturasRespaldo: this.lecturasRespaldo,
      ilegibles: entradas.length - legibles.length,
      vacias: legibles.filter(([, e]) => !e.registros.length).length,
    };
  }

  async cerrar(): Promise<void> {
    this.page.off('response', this.escuchar);
    await Promise.all([...this.pendientes]);
  }
}
