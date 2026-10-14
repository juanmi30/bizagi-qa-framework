import type { EtapaAfi, PoliticaCampo, Sensibilidad } from '../modelo';
import { CAMPOS_AFI } from '../modelo';
import { POLITICAS_AFI } from '../politicas';

/**
 * FIELD REGISTRY AFI (Fase 4J). Registro ÚNICO de los campos que el plan funcional puede nombrar.
 * Declarar aquí un campo compatible lo vuelve utilizable por las operaciones genéricas (validador, driver UI,
 * manifest y máscara de evidencias lo consultan): ninguna operación se edita al añadir un campo.
 *
 * Capa pura: sin Playwright. La LOCALIZACIÓN es semántica (atributo de dominio o nombre accesible); el driver
 * UI la traduce a un locator. Fail-closed: un campo que no está en el registro no es nombrable.
 */

export type ControlCampo = PoliticaCampo['control'];

/** Capacidades que ofrece cada tipo de control. Las operaciones declaran cuál requieren (funcional.ts). */
export const CAPACIDADES_CONTROL = {
  autocomplete: ['estado', 'valor', 'texto', 'catalogo', 'sugerencias'],
  select: ['estado', 'valor', 'catalogo'],
  text: ['estado', 'valor', 'texto'],
  checkbox: ['estado'],
  radio: ['estado'],
  // Carga de un archivo permitido (pantalla de documentos). El archivo lo aporta Test Data; nunca se genera aquí.
  archivo: ['estado'],
} as const satisfies Record<ControlCampo, readonly string[]>;
export type CapacidadControl = typeof CAPACIDADES_CONTROL[keyof typeof CAPACIDADES_CONTROL][number];

/** Cómo encontrar el control sin selectores en el plan: atributo estable del dominio o nombre accesible. */
export type LocalizacionCampo =
  | { tipo: 'atributo-dominio'; atributo: 'formcontrolname'; valor: string }
  | { tipo: 'nombre-accesible'; rol: 'combobox' | 'textbox'; nombre: string };

export interface EntradaRegistroCampo {
  /** Etiqueta visible (nombre humano, también usado por el driver de catálogos). */
  etiqueta: string;
  localizacion: LocalizacionCampo;
  /** Solo si el campo NO está en las políticas del modelo; si está, se derivan de POLITICAS_AFI (una sola declaración). */
  pantalla?: EtapaAfi;
  control?: ControlCampo;
  sensibilidad?: Sensibilidad;
}

export interface CampoRegistrado {
  id: string;
  etiqueta: string;
  localizacion: LocalizacionCampo;
  pantalla: EtapaAfi;
  control: ControlCampo;
  sensibilidad: Sensibilidad;
  capacidades: readonly CapacidadControl[];
}

export type RegistroCampos = Readonly<Record<string, EntradaRegistroCampo>>;

/** Registro canónico actual: SOLO los campos ya demostrados en el piloto. */
export const REGISTRO_CAMPOS_FUNCIONALES = {
  departamento: { etiqueta: 'Departamento', localizacion: { tipo: 'atributo-dominio', atributo: 'formcontrolname', valor: 'departamento' } },
  ciudadVivienda: { etiqueta: 'Ciudad de vivienda', localizacion: { tipo: 'atributo-dominio', atributo: 'formcontrolname', valor: 'ciudadVivienda' } },
} as const satisfies RegistroCampos;

export type IdCampoRegistrado = keyof typeof REGISTRO_CAMPOS_FUNCIONALES;

export class RegistroCamposInvalidoError extends Error {
  constructor(readonly problemas: readonly string[]) {
    super(`Registro de campos inválido:\n${problemas.map(p => `- ${p}`).join('\n')}`);
    this.name = 'RegistroCamposInvalidoError';
  }
}

const esCampoModelo = (id: string): id is keyof typeof POLITICAS_AFI => (CAMPOS_AFI as readonly string[]).includes(id);

/** Resuelve un campo: lo del modelo (pantalla, control, sensibilidad) manda; lo declarado solo completa campos nuevos. */
export function definicionCampo(registro: RegistroCampos, id: string): CampoRegistrado | undefined {
  if (!Object.prototype.hasOwnProperty.call(registro, id)) return undefined;
  const e = registro[id];
  const modelo = esCampoModelo(id) ? POLITICAS_AFI[id] : undefined;
  const pantalla = modelo?.etapa ?? e.pantalla, control = modelo?.control ?? e.control, sensibilidad = modelo?.sensibilidad ?? e.sensibilidad;
  if (!pantalla || !control || !sensibilidad) return undefined;
  return { id, etiqueta: e.etiqueta, localizacion: e.localizacion, pantalla, control, sensibilidad, capacidades: CAPACIDADES_CONTROL[control] };
}

/** Validación estructural del registro (fail-closed). */
export function validarRegistroCampos(registro: RegistroCampos): CampoRegistrado[] {
  const problemas: string[] = [];
  const campos: CampoRegistrado[] = [];
  const etiquetas = new Set<string>(), localizaciones = new Set<string>();
  for (const id of Object.keys(registro)) {
    const e = registro[id];
    if (!/^[a-z][A-Za-z0-9]*$/.test(id)) problemas.push(`${id}: id semántico en camelCase`);
    if (!e.etiqueta?.trim()) problemas.push(`${id}: etiqueta requerida`);
    if (esCampoModelo(id) && (e.pantalla || e.control || e.sensibilidad)) {
      problemas.push(`${id}: pantalla/control/sensibilidad vienen de las políticas del modelo; no se redeclaran`);
    }
    const c = definicionCampo(registro, id);
    if (!c) { problemas.push(`${id}: campo nuevo sin pantalla, control o sensibilidad`); continue; }
    const loc = JSON.stringify(c.localizacion);
    if (localizaciones.has(loc)) problemas.push(`${id}: localización duplicada`);
    if (etiquetas.has(c.etiqueta)) problemas.push(`${id}: etiqueta duplicada`);
    localizaciones.add(loc); etiquetas.add(c.etiqueta);
    campos.push(c);
  }
  if (problemas.length) throw new RegistroCamposInvalidoError(problemas);
  return campos;
}

export const camposDelRegistro = (registro: RegistroCampos = REGISTRO_CAMPOS_FUNCIONALES) => validarRegistroCampos(registro);

/** Campos del registro que ofrecen una capacidad (aplicabilidad genérica de operaciones). */
export function camposConCapacidad(capacidad: CapacidadControl, registro: RegistroCampos = REGISTRO_CAMPOS_FUNCIONALES): string[] {
  return camposDelRegistro(registro).filter(c => c.capacidades.includes(capacidad)).map(c => c.id);
}

/** Selector CSS equivalente a la localización (para máscaras de evidencia); undefined si no es expresable en CSS. */
export function selectorCssCampo(campo: CampoRegistrado): string | undefined {
  const l = campo.localizacion;
  return l.tipo === 'atributo-dominio' ? `[${l.atributo}="${l.valor}"]` : undefined;
}

/** Campos NO públicos del registro: la evidencia cliente debe enmascararlos. */
export function camposSensiblesDelRegistro(registro: RegistroCampos = REGISTRO_CAMPOS_FUNCIONALES): CampoRegistrado[] {
  return camposDelRegistro(registro).filter(c => c.sensibilidad !== 'public');
}
