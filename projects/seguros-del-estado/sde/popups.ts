import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';
import type { ContextoEjecucion } from './ejecutor';

/** Opt-in de calibración exclusivamente para el caso creado y la instancia verificada de esta misma corrida. */
export function autorizacionCasoCreado(ctx: ContextoEjecucion, numeroFormulario: string): string | undefined {
  const c = ctx.casoCreado;
  return ctx.env.SDE_POPUPS_CASO_CREADO === '1' && ctx.env.SDE_E2E === '1' && !!c?.instancia
    && !!c.corrida && c.corrida === ctx.env.BIZAGI_CORRIDA && c.unico === ctx.unico
    && c.numero === ctx.numeroCaso && c.numero === numeroFormulario.trim() ? c.numero : undefined;
}

/**
 * Barrera de apertura de pop-ups de grilla (H3 / BUG-03 / UI-10). La consultan las capabilities ANTES de cualquier clic:
 * un pop-up solo se abre si su formulario está calibrado con mapeo, evidencia y cierre seguro (Guardar) verificados, o si está
 * "en_calibracion" y hay autorización explícita para EL caso en ejecución. Si no, BarreraPopupError → paso BLOCKED.
 */
export interface PopupCalibrado {
  tabla: string;
  descripcion: string;
  estado: 'sin_calibrar' | 'en_calibracion' | 'calibrado';
  mapeo_controles: Record<string, string> | null;
  evidencia: string | null;
  cierre_seguro_verificado: boolean;
  brecha?: string;
}
export type RegistroPopups = Record<string, PopupCalibrado>;

export const RUTA_POPUPS = resolve(__dirname, '..', 'data', 'popups-calibrados.yaml');

export function cargarPopups(ruta = RUTA_POPUPS): RegistroPopups {
  if (!existsSync(ruta)) return {};
  return ((yaml.load(readFileSync(ruta, 'utf8')) as { formularios?: RegistroPopups })?.formularios) ?? {};
}

export class BarreraPopupError extends Error {
  constructor(formulario: string, motivos: string[]) {
    super(`BARRERA POP-UP "${formulario}": no se abre (BUG-03 destruye el caso si no se puede cerrar con Guardar). ${motivos.join('; ')}.`);
    this.name = 'BarreraPopupError';
  }
}

/** Lanza BarreraPopupError si falta cualquier condición. `autorizacion` = valor de SDE_AUTORIZO_CALIBRACION_POPUP. */
export function autorizarAperturaPopup(formulario: string | undefined, tabla: string, numeroCaso: string | null,
  registro: RegistroPopups, autorizacion: string | undefined): void {
  if (!formulario) throw new BarreraPopupError('(sin declarar)', ['el paso no declara "formulario"']);
  const f = registro[formulario];
  if (!f) throw new BarreraPopupError(formulario, ['el formulario no está en data/popups-calibrados.yaml']);
  const motivos: string[] = [];
  if (f.tabla !== tabla) motivos.push(`el registro corresponde a la tabla "${f.tabla}", no a "${tabla}"`);
  if (f.estado === 'en_calibracion') {
    if (!numeroCaso || autorizacion?.trim() !== numeroCaso) {
      motivos.push(`calibración de riesgo sin autorización explícita (SDE_AUTORIZO_CALIBRACION_POPUP debe ser el caso ${numeroCaso ?? '—'})`);
    }
  } else {
    if (f.estado !== 'calibrado') motivos.push(`estado "${f.estado}"${f.brecha ? ` (${f.brecha})` : ''}`);
    if (!f.mapeo_controles || Object.keys(f.mapeo_controles).length === 0) motivos.push('sin mapeo de controles verificado');
    if (!f.evidencia) motivos.push('sin evidencia de calibración');
    if (!f.cierre_seguro_verificado) motivos.push('cierre seguro con Guardar no verificado');
  }
  if (motivos.length) throw new BarreraPopupError(formulario, motivos);
}
