import { CapabilityGapError, type ProblemaPlanFuncional } from './funcional';
import type { CampoAfi, EtapaAfi, ResolucionCampo } from './modelo';
import type { PlanPreparacion } from './resolver';

/**
 * Capacidades PURAS de preparación (Fase 3B): qué ResolucionCampo sabe materializar hoy AfiDataUi.
 * Única fuente de verdad: la usan el compilador (antes de abrir navegador) y AfiDataUi (al ejecutar).
 * Sin Page, Locator, Playwright, Portal ni process.env. Solo lo demostrado por el piloto; nada nuevo.
 * El driver conserva únicamente el mapeo campo -> control UI.
 */

/** Forma de la resolución que el control acepta. */
type Admision = 'valor-texto' | 'texto-deterministico' | 'valor-booleano' | 'booleano-requerido' | 'primera-opcion' | 'primera-sugerencia' | 'opcion-generada';

export interface CapacidadCampo {
  control: 'select' | 'identificacion' | 'correo' | 'checkbox' | 'radio' | 'text' | 'autocomplete';
  admite: readonly Admision[];
  /** select que puede llegar deshabilitado y precargado (CP04 Empresa: tipoIde). */
  precargable?: true;
  /** radio: únicas opciones observadas. */
  opciones?: readonly string[];
  /**
   * (4S-R.2) autocomplete con valor concreto: regla con la que una opción del panel (y el valor final mostrado) corresponde
   * al dato. 'exacta': igualdad tras normalizar solo espacios. 'codigo-catalogo': el código seguido de un separador (CIIU).
   */
  coincidencia?: 'exacta' | 'codigo-catalogo';
  /**
   * Campo de FECHA: formato en que se expresa el dato. El driver lo escribe tal cual en un input de texto y lo convierte a ISO
   * (aaaa-mm-dd) solo si el Portal presenta un input nativo type="date" (observado en Mobile).
   */
  fecha?: { formato: 'dd/mm/aaaa' };
}

const SELECT = { control: 'select', admite: ['valor-texto', 'primera-opcion'] } as const;
const TEXTO_INICIO = ['valor-texto', 'texto-deterministico'] as const;
const CONCRETO = ['valor-texto'] as const;

/** El orden de las claves es el orden de pantalla observado. */
export const CAPACIDADES_PREPARACION = {
  'inicio-solicitud': {
    tipoAportante: SELECT,
    tipoAfiliado: SELECT,
    tipoEmpleador: SELECT,
    naturaleza: SELECT,
    claseEmpleador: SELECT,
    tipoIdentificacion: { ...SELECT, precargable: true },
    numeroIdentificacion: { control: 'identificacion', admite: TEXTO_INICIO },
    correo: { control: 'correo', admite: TEXTO_INICIO },
    confirmacionCorreo: { control: 'correo', admite: TEXTO_INICIO },
    recibioAyudaAsesor: { control: 'radio', admite: TEXTO_INICIO, opciones: ['No'] },
    autorizaDatos: { control: 'checkbox', admite: ['valor-booleano', 'booleano-requerido'] },
    autorizaIntimidad: { control: 'checkbox', admite: ['valor-booleano', 'booleano-requerido'] },
  },
  // 4S-R.1 (Empleador PJ): orden de pantalla observado. Solo campos editables que bloquean el avance; precargados
  // (naturaleza, claseEmpleador, NIT, DV) y opcionales (tipo de organización, sigla) no tienen capability: nunca se tocan.
  'informacion-empresa': {
    razonSocial: { control: 'text', admite: CONCRETO },
    // Solo el CIIU concreto del actor (nunca la primera sugerencia): se busca y se elige la opción coincidente única.
    codigoCiiu: { control: 'autocomplete', admite: CONCRETO, coincidencia: 'codigo-catalogo' },
    actividadEconomicaEmpresa: { control: 'text', admite: CONCRETO },
    fechaInicioActividad: { control: 'text', admite: CONCRETO, fecha: { formato: 'dd/mm/aaaa' } },
    valorNomina: { control: 'text', admite: CONCRETO },
    numeroTrabajadores: { control: 'text', admite: CONCRETO },
    afiliadoPrimeraVez: { control: 'radio', admite: CONCRETO, opciones: ['Si', 'No'] },
    // 4S-R.2: condicional (aparece tras "¿Afiliado por primera vez?"). En QA es un AUTOCOMPLETE de Material (input combobox),
    // no un mat-select. Solo la opción EXACTA del dato del actor.
    cajaCompensacionAnterior: { control: 'autocomplete', admite: CONCRETO, coincidencia: 'exacta' },
  },
  telefonos: {
    numeroCelular: { control: 'text', admite: CONCRETO },
    numeroTelefonoFijo: { control: 'text', admite: CONCRETO },
  },
  // Facultativo (CP04): nacionalidad, estadoCivil, fondo, salario. Independiente (piloto HU 14.12): fondo, actividad, ingreso.
  // Un único orden de pantalla compatible con ambos recorridos observados.
  'informacion-adicional': {
    nacionalidad: { control: 'select', admite: CONCRETO },
    estadoCivil: { control: 'select', admite: CONCRETO },
    // Independiente: "QA autoriza cualquier opción válida" si no llega precargado (first-valid-autocomplete).
    fondoPensiones: { control: 'autocomplete', admite: ['valor-texto', 'primera-sugerencia'] },
    actividad: { control: 'select', admite: CONCRETO },
    ingresoMensual: { control: 'text', admite: CONCRETO },
    salarioBasico: { control: 'text', admite: CONCRETO },
  },
} as const satisfies Partial<Record<EtapaAfi, Partial<Record<CampoAfi, CapacidadCampo>>>>;

type Tabla = typeof CAPACIDADES_PREPARACION;
export type EtapaConCapacidades = keyof Tabla;
export type CamposDeEtapa<E extends EtapaConCapacidades> = keyof Tabla[E];

/**
 * Capacidades de las etapas que SOLO atraviesa la ruta DERIVADA de Knowledge (más allá del punto funcional). Tabla aparte:
 * no amplían lo que el runner v1 acepta como etapa declarable (su contrato y preflight no cambian).
 */
export const CAPACIDADES_RUTA = {
  // Familia observada en QA para Empleador PJ: mat-select (estructura sanitizada). Auxiliares: la política autoriza
  // CUALQUIER opción válida; con un select se materializa como la primera habilitada.
  'informacion-contacto': {
    departamento: { control: 'select', admite: ['valor-texto', 'primera-opcion'] },
    ciudadVivienda: { control: 'select', admite: ['valor-texto', 'primera-opcion', 'primera-sugerencia'] },
    // Empleador PJ: los teléfonos se capturan en esta pantalla (variante porPerfil de la política).
    numeroCelular: { control: 'text', admite: CONCRETO },
    numeroTelefonoFijo: { control: 'text', admite: CONCRETO },
  },
  // Dirección (piloto Independiente, CP01 P16): catálogos y números deterministas.
  direccion: {
    // Empleador PJ: GENERATED sobre el catálogo observado (política porPerfil); el piloto Independiente sigue con primera-opcion.
    viaPrincipal: { control: 'select', admite: ['valor-texto', 'primera-opcion', 'opcion-generada'] },
    letrasVp: SELECT,
    sectorVp: SELECT,
    letrasVg: SELECT,
    numeroVp: { control: 'text', admite: TEXTO_INICIO },
    numeroVg: { control: 'text', admite: TEXTO_INICIO },
    numeroPredio: { control: 'text', admite: TEXTO_INICIO },
  },
} as const satisfies Partial<Record<EtapaAfi, Partial<Record<CampoAfi, CapacidadCampo>>>>;

/** Alcance de la consulta: el runner v1 (etapas declarables) o la ruta derivada (runner v1 + etapas de ruta). */
export type AlcanceCapacidad = 'runner' | 'ruta';
const tablaDe = (etapa: EtapaAfi, alcance: AlcanceCapacidad) => (CAPACIDADES_PREPARACION as Partial<Record<EtapaAfi, Partial<Record<CampoAfi, CapacidadCampo>>>>)[etapa]
  ?? (alcance === 'ruta' ? (CAPACIDADES_RUTA as Partial<Record<EtapaAfi, Partial<Record<CampoAfi, CapacidadCampo>>>>)[etapa] : undefined);

/** Qué debe hacer el driver con la resolución. */
export type Materializacion =
  | { modo: 'texto'; texto: string }
  | { modo: 'booleano'; valor: boolean }
  | { modo: 'primera-opcion'; orden: 'catalogo' | 'alfabetico' }
  /** Autocomplete vacío: primera sugerencia habilitada en el orden del catálogo (opcionalmente, solo las que empiezan por letra). */
  | { modo: 'primera-sugerencia'; inicioAlfabetico: boolean }
  /** Opción elegida de forma determinista sobre el catálogo observado en pantalla (GENERATED). */
  | { modo: 'opcion-generada'; semilla: string };

/** La preparación pide materializar algo que AfiDataUi no sabe. Distinto del gap funcional y del DataGap. */
export class CapabilityGapPreparacionError extends CapabilityGapError {
  constructor(problemas: readonly ProblemaPlanFuncional[]) {
    super(problemas);
    this.name = 'CapabilityGapPreparacionError';
    this.message = `CapabilityGap de preparación AFI:\n${problemas.map(p => `- ${p.ruta}: ${p.mensaje}`).join('\n')}`;
  }
}

export function capacidad(etapa: EtapaAfi, campo: CampoAfi, alcance: AlcanceCapacidad = 'runner'): CapacidadCampo | undefined {
  const tabla = tablaDe(etapa, alcance);
  return tabla && Object.prototype.hasOwnProperty.call(tabla, campo) ? tabla[campo] : undefined;
}

/** Decide la materialización o describe el gap; nunca lanza. */
export function evaluarCapacidad(etapa: EtapaAfi, r: ResolucionCampo, alcance: AlcanceCapacidad = 'runner'): { capacidad: CapacidadCampo; materializacion: Materializacion } | { problema: string } {
  const gap = (detalle: string) => ({ problema: `El driver de ${etapa} no puede ejecutar "${r.campo}": ${detalle}.` });
  const cap = capacidad(etapa, r.campo, alcance);
  if (!cap) return gap('campo no soportado en esta etapa');
  const v = r.valor, e = r.estrategia, admite = (a: Admision) => cap.admite.includes(a);
  let m: Materializacion | undefined;
  if (typeof v === 'string' && admite('valor-texto')) m = { modo: 'texto', texto: v };
  else if ((e?.tipo === 'deterministic-text' || e?.tipo === 'deterministic-number') && admite('texto-deterministico')) m = { modo: 'texto', texto: e.valor };
  else if (typeof v === 'boolean' && admite('valor-booleano')) m = { modo: 'booleano', valor: v };
  else if (e?.tipo === 'boolean-required' && admite('booleano-requerido')) m = { modo: 'booleano', valor: e.valor };
  else if (e?.tipo === 'first-valid-option' && admite('primera-opcion')) m = { modo: 'primera-opcion', orden: e.orden };
  else if (e?.tipo === 'first-valid-autocomplete' && admite('primera-sugerencia')) m = { modo: 'primera-sugerencia', inicioAlfabetico: e.inicioAlfabetico === true };
  else if (e?.tipo === 'generated-option' && admite('opcion-generada')) m = { modo: 'opcion-generada', semilla: e.semilla };
  if (!m) return gap(`${e ? `estrategia ${e.tipo}` : `valor ${typeof v}`} no soportado para ${cap.control}`);
  if (cap.opciones && m.modo === 'texto' && !cap.opciones.includes(m.texto)) return gap('opción de radio no observada en el piloto');
  return { capacidad: cap, materializacion: m };
}

/** Para el driver: materialización o CapabilityGapPreparacionError. */
export function materializar(etapa: EtapaAfi, r: ResolucionCampo, alcance: AlcanceCapacidad = 'runner'): { capacidad: CapacidadCampo; materializacion: Materializacion } {
  const evaluada = evaluarCapacidad(etapa, r, alcance);
  if ('problema' in evaluada) throw new CapabilityGapPreparacionError([{ ruta: `${etapa}.${r.campo}`, clase: 'capability', mensaje: evaluada.problema }]);
  return evaluada;
}

/** Todas las resoluciones del plan (no sus gaps de datos) deben ser materializables. Acumula. */
export function problemasCapacidadPreparacion(etapa: EtapaAfi, plan: PlanPreparacion, alcance: AlcanceCapacidad = 'runner'): ProblemaPlanFuncional[] {
  return plan.resoluciones.flatMap(r => {
    const evaluada = evaluarCapacidad(etapa, r, alcance);
    return 'problema' in evaluada ? [{ ruta: `${etapa}.${r.campo}`, clase: 'capability' as const, mensaje: evaluada.problema }] : [];
  });
}

export function exigirCapacidadesPreparacion(etapa: EtapaAfi, plan: PlanPreparacion, alcance: AlcanceCapacidad = 'runner'): void {
  const problemas = problemasCapacidadPreparacion(etapa, plan, alcance);
  if (problemas.length) throw new CapabilityGapPreparacionError(problemas);
}

/** Orden de pantalla de la etapa (claves de la tabla); lo desconocido va primero y falla al materializar. */
export function ordenarPorPantalla(etapa: EtapaAfi, resoluciones: readonly ResolucionCampo[], alcance: AlcanceCapacidad = 'runner'): ResolucionCampo[] {
  const orden = Object.keys(tablaDe(etapa, alcance) ?? {});
  return [...resoluciones].sort((a, b) => orden.indexOf(a.campo) - orden.indexOf(b.campo));
}
