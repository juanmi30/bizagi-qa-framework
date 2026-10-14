import type { Page, TestInfo } from '@playwright/test';
import { actorDesdeEntorno } from '../../data/afi/actores';
import { compilarCasoAfi, type DefinicionCasoAfi } from '../../data/afi/caso';
import { CP04_EMPRESA } from '../../data/afi/casos/hu14-12-cp04';
import type { OperacionFuncionalAfi, PasoFuncionalAfi } from '../../data/afi/funcional';
import type { InstantaneaFuente, RegistroFuente, RespuestaEntidad } from '../../data/afi/fuentes';
import { ejecutarCasoAfi, type ColaboradoresAfi, type RuntimeCasoAfi } from '../../helpers/afiCaseRunner';
import { AfiFunctionalUi } from '../../helpers/afiFunctionalUi';

/**
 * Fase 4G: Información de contacto FICTICIA y runner con colaboradores simulados y driver funcional REAL.
 * Compartido por afi-evidencia.unit.spec.ts y el reporte HTML local (afi-evidencia-reporte.spec.ts). Sin Portal.
 */

// ---------- Fuente y DOM ficticios ----------
export const depto = (codigo: string, descripcion: string): RegistroFuente => ({ sCodigo: codigo, sDescripcion: descripcion });
export const muni = (descripcion: string, padre: string): RegistroFuente =>
  ({ sCodigo: `${padre}-${descripcion}`, sDescripcion: descripcion, 'kpDepartamento.sCodigo': padre, dsbl: false });
export const FUENTE: InstantaneaFuente = {
  respuestas: [
    { entidad: 'dep', paginada: false, registros: [depto('10', 'DEPTO NORTE'), depto('20', 'DEPTO SUR')] } as RespuestaEntidad,
    { entidad: 'mun', paginada: false, registros: [muni('VILLA ÁLAMO', '10'), muni('SAN JOSÉ', '10'), muni('PUERTO NUEVO', '10'), muni('LAS PEÑAS', '20')] } as RespuestaEntidad,
  ],
  lecturasRespaldo: 0, ilegibles: 0, vacias: 0,
};
export const CIUDADES = ['VILLA ÁLAMO', 'SAN JOSÉ', 'PUERTO NUEVO'];

/** Información de contacto mínima: alerta, departamento precargado, ciudad con autocomplete y un extra opcional (PII). */
export function contacto(extra = ''): string {
  return `
    <h2>Información de contacto</h2>
    <p>Información de localización vivienda</p>
    <div class="alertas-warn">Solo puedes afiliarte si resides en la zona de cobertura.</div>
    <input role="combobox" formcontrolname="departamento" id="dep" value="DEPTO NORTE" readonly>
    <input role="combobox" formcontrolname="ciudadVivienda" id="ciu" aria-expanded="false">
    <div id="p-ciu" role="listbox" hidden></div>
    ${extra}
    <script>(() => {
      const ciu = document.getElementById('ciu'), panel = document.getElementById('p-ciu');
      const CIUDADES = ${JSON.stringify(CIUDADES)};
      const abrir = () => { panel.hidden = false; ciu.setAttribute('aria-expanded', 'true'); ciu.setAttribute('aria-controls', 'p-ciu'); };
      const cerrar = () => { panel.hidden = true; ciu.setAttribute('aria-expanded', 'false'); ciu.removeAttribute('aria-controls'); };
      const pintar = ops => { panel.innerHTML = ops.map(o => '<div role="option">' + o + '</div>').join(''); };
      pintar(CIUDADES);
      ciu.addEventListener('click', abrir);
      ciu.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
      ciu.addEventListener('input', () => { const q = ciu.value.toLocaleUpperCase('es'); pintar(CIUDADES.filter(c => c.includes(q))); abrir(); });
    })();</script>`;
}

export const RAPIDO = 1_500;
export const proveedor = { instantanea: async () => FUENTE, cerrar: async () => undefined };
export const ui = (page: Page, info: TestInfo) => new AfiFunctionalUi(page, info, { timeout: RAPIDO, fuentes: { 'parametrica-ciudad-nacional': proveedor } });

// Operaciones de ejemplo (genéricas, no de un caso real).
export const ALERTA: OperacionFuncionalAfi = { tipo: 'componente-visible', componente: 'alerta-territorial' };
export const EDITABLE: OperacionFuncionalAfi = { tipo: 'campo-estado', campo: 'ciudadVivienda', estado: 'editable' };
export const ESCRIBIR = (texto: string): OperacionFuncionalAfi => ({ tipo: 'escribir', campo: 'ciudadVivienda', texto });
export const SUGERENCIAS = (textoBusqueda: string): OperacionFuncionalAfi => ({
  tipo: 'sugerencias-segun-fuente', campo: 'ciudadVivienda', fuente: 'parametrica-ciudad-nacional', filtroDesdeCampo: 'departamento',
  normalizacion: 'texto-es', textoBusqueda, coincidencia: 'contiene', diacriticos: 'sensibles', mayusculas: 'insensibles',
});
export const CERRAR: OperacionFuncionalAfi = { tipo: 'cerrar-catalogo', campo: 'ciudadVivienda' };
export const paso = (id: string, ...operaciones: OperacionFuncionalAfi[]): PasoFuncionalAfi => ({ id, esperado: `Esperado ${id}`, operaciones });

// Actor ficticio: sus valores sensibles son los que la evidencia nunca puede mostrar.
export const ENTORNO = { AFI_QA_EMPRESA_IDENTIFICACION: '900000001', AFI_QA_CORREO: 'empresa.qa@example.test' };
export const PII = /900000001|@example\.test/;
export const CORREO_ENMASCARADO = `<input formcontrolname="correoElectronico" id="correo" value="${ENTORNO.AFI_QA_CORREO}" style="width:260px;height:30px">`;

// Runner real con colaboradores simulados y driver funcional REAL sobre el DOM ficticio.
export const definicion = (pasos: PasoFuncionalAfi[]): DefinicionCasoAfi => ({ ...CP04_EMPRESA, caso: 'CP99', nombre: 'CP99 Evidencia ficticia', funcional: { caso: 'CP99', pasos } });
export const PASOS = [paso('P02', ALERTA, EDITABLE), paso('P03', ESCRIBIR('San'), SUGERENCIAS('San'), CERRAR), paso('P04', ESCRIBIR('Zx'), { tipo: 'salir-del-campo', campo: 'ciudadVivienda' })];

export async function correr(page: Page, info: TestInfo, extra: Partial<RuntimeCasoAfi> = {}, html = contacto(CORREO_ENMASCARADO), pasos = PASOS) {
  const compilado = compilarCasoAfi(definicion(pasos), actorDesdeEntorno('empresa', ENTORNO));
  const colaboradores = async (): Promise<ColaboradoresAfi> => {
    const funcionalUi = ui(page, info);
    return {
      portal: { abrir: async () => { await page.setContent(html); }, enviarUnaVez: async registrar => { await registrar('900123'); return '900123'; } },
      soporte: { login: async () => undefined, registrarCasoCreado: async () => undefined, emularReconocimiento: async () => undefined, cancelarCasoCreado: async () => undefined },
      datosUi: { completarInicioSolicitud: async () => [], completarTelefonos: async () => [], completarInformacionAdicional: async () => [] },
      funcionalUi, cerrar: () => funcionalUi.cerrar(),
    };
  };
  return ejecutarCasoAfi(compilado, { page, context: page.context(), testInfo: info, colaboradores, ...extra });
}
