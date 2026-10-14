import { expect, type Page, type Response, type TestInfo } from '@playwright/test';

type Registro = { parameters?: { xpath: string; value?: unknown }[] };
const parametros = (registro: Registro): Record<string, unknown> =>
  Object.fromEntries((registro.parameters ?? []).map(p => [p.xpath, p.value]));

/** Observa las paramétricas del portal; relee solo GET si Chromium no conserva el cuerpo. */
export class CiudadNacional {
  private municipios: Record<string, unknown>[] = [];
  private codigoDepartamento?: string;
  private paginado = false;
  private pendientes = new Set<Promise<void>>();
  private errores = 0;
  private lecturasRespaldo = 0;
  private readonly escuchar = (response: Response) => {
    if (!/\/odata\/data\/entities\([^)]+\)\/values$/.test(new URL(response.url()).pathname)) return;
    const pendiente = this.observar(response).catch(() => { this.errores++; });
    this.pendientes.add(pendiente);
    void pendiente.finally(() => this.pendientes.delete(pendiente));
  };

  constructor(private readonly page: Page) { page.on('response', this.escuchar); }

  private async observar(response: Response): Promise<void> {
    if (!response.ok()) return;
    const data = await response.json().catch(async () => {
      // Chromium puede no conservar el cuerpo de algunas respuestas (size=-1 en trace).
      // Releer solo GET de entities/values, con la petición ya autorizada del portal.
      // Nunca repetir POST, creación de casos ni modificar respuestas de la aplicación.
      if (response.request().method() !== 'GET') throw new Error('La referencia de catálogo debe ser GET');
      const referencia = await this.page.request.fetch(response.request());
      if (!referencia.ok()) throw new Error(`Lectura de catálogo rechazada: HTTP ${referencia.status()}`);
      this.lecturasRespaldo++;
      return referencia.json();
    }) as { value?: Registro[]; '@odata.nextLink'?: string };
    if (!Array.isArray(data.value)) return;
    const registros = data.value.map(parametros);
    const departamento = registros.find(r => r.sDescripcion === 'CUNDINAMARCA' && !('kpDepartamento.sCodigo' in r));
    if (departamento) this.codigoDepartamento = String(departamento.sCodigo);
    if (registros.some(r => 'kpDepartamento.sCodigo' in r && 'sDescripcion' in r)) {
      this.municipios = registros;
      this.paginado = !!data['@odata.nextLink'];
      // Chía está expresamente certificada como municipio de Cundinamarca.
      // Usar su relación paramétrica evita inventar códigos o un catálogo nacional.
      const chia = registros.filter(r => r.sDescripcion === 'CHÍA' && r.dsbl !== true);
      if (!this.codigoDepartamento && chia.length === 1) {
        this.codigoDepartamento = String(chia[0]['kpDepartamento.sCodigo']);
      }
    }
  }

  async verificar(opciones: string[], info: TestInfo): Promise<void> {
    await Promise.all([...this.pendientes]);
    expect(this.codigoDepartamento, 'Relación de Cundinamarca observada para Chía certificada').toBeTruthy();
    expect(this.paginado, 'Ciudad nacional debe estar completa para comparar el catálogo').toBe(false);
    expect(this.municipios.length, 'Respuesta observable de Ciudad nacional').toBeGreaterThan(0);
    const esperados = this.municipios.filter(r =>
      String(r['kpDepartamento.sCodigo']) === this.codigoDepartamento && r.dsbl !== true,
    ).map(r => String(r.sDescripcion).trim());
    expect(esperados.length).toBeGreaterThan(0);
    await info.attach('ciudad-nacional-cundinamarca.json', {
      body: JSON.stringify({ codigoDepartamento: this.codigoDepartamento, esperados, observados: opciones, lecturasGetRespaldo: this.lecturasRespaldo, otrasRespuestasNoLegibles: this.errores }),
      contentType: 'application/json',
    });
    expect([...opciones].sort()).toEqual([...esperados].sort());
  }

  async cerrar(): Promise<void> {
    this.page.off('response', this.escuchar);
    await Promise.all([...this.pendientes]);
  }
}
