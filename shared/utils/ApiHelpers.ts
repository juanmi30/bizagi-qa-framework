import { APIRequestContext } from '@playwright/test';

/**
 * ApiHelpers (COMPARTIDO)
 * Validacion robusta: confirmar via API que el caso avanzo a la actividad esperada,
 * no solo por la UI. Bizagi Cloud expone APIs REST / OData.
 * TODO: implementar el endpoint/auth reales del ambiente.
 */
export class ApiHelpers {
  constructor(private readonly request: APIRequestContext) {}

  async getCaseState(caseNumber: string): Promise<unknown> {
    // const res = await this.request.get(`/odata/data/Cases('${caseNumber}')`);
    // return res.json();
    throw new Error(`ApiHelpers.getCaseState pendiente de implementar para caso ${caseNumber}`);
  }
}
