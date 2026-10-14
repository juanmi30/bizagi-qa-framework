/**
 * Modelo de datos de Afiliaciones (Fase 2A): describe POLÍTICAS de campos, no valores.
 * Capa de dominio pura: sin Playwright, sin process.env, sin navegador.
 */

/** Perfiles QA sustentados por el piloto HU 14.12 (CP01/CP02/CP03 independiente, CP04 el resto). */
export type PerfilActorAfi = 'independiente' | 'empresa' | 'pensionado' | 'facultativo';

/** Pantallas del Portal en orden de recorrido observado. */
export const ETAPAS_AFI = [
  'inicio-solicitud',
  // 4S-R.1: "Ingresa la información de la empresa" (Empleador Persona Jurídica). Preparación SEGÚN ESTADO.
  'informacion-empresa',
  'telefonos',
  'informacion-adicional',
  'informacion-contacto',
  'direccion',
] as const;
export type EtapaAfi = typeof ETAPAS_AFI[number];

/** Campos de entrada observados en el piloto (no es el proceso Afiliaciones completo). */
export const CAMPOS_AFI = [
  // inicio-solicitud
  'tipoAportante', 'tipoAfiliado', 'tipoEmpleador', 'naturaleza', 'claseEmpleador',
  'tipoIdentificacion', 'numeroIdentificacion', 'correo', 'confirmacionCorreo',
  'recibioAyudaAsesor', 'autorizaDatos', 'autorizaIntimidad',
  // informacion-empresa (identidades SEMÁNTICAS; el nombre DOM de cada control solo lo conoce el adaptador UI)
  'razonSocial', 'codigoCiiu', 'actividadEconomicaEmpresa', 'fechaInicioActividad', 'valorNomina', 'numeroTrabajadores',
  'afiliadoPrimeraVez', 'cajaCompensacionAnterior',
  // telefonos
  'numeroCelular', 'numeroTelefonoFijo',
  // informacion-adicional
  'fondoPensiones', 'actividad', 'ingresoMensual', 'nacionalidad', 'estadoCivil', 'salarioBasico',
  // informacion-contacto
  'departamento', 'ciudadVivienda', 'localidad', 'barrio',
  // direccion
  'viaPrincipal', 'letrasVp', 'sectorVp', 'letrasVg', 'numeroVp', 'numeroVg', 'numeroPredio',
] as const;
export type CampoAfi = typeof CAMPOS_AFI[number];

/** 'generated': FILLER generado de forma determinista bajo una autorización `generable` del perfil (AFI-TEST-DATA §7.3). */
export type OrigenDato = 'test-case' | 'actor' | 'derived' | 'generated' | 'auxiliary';
export type Sensibilidad = 'public' | 'pii' | 'secret';
export type ValorCampo = string | boolean;

/**
 * Intención que ejecutará la futura capa UI; el resolver nunca elige la opción real.
 * - first-valid-option: primera opción habilitada del catálogo, en orden de catálogo o alfabético.
 * - first-valid-autocomplete: primera sugerencia válida de un autocompletar.
 * - inicioAlfabetico: descarta opciones que no empiezan por letra (criterio de CP02).
 */
export type EstrategiaAuxiliar =
  | { tipo: 'first-valid-option'; orden: 'catalogo' | 'alfabetico' }
  | { tipo: 'first-valid-autocomplete'; inicioAlfabetico?: true }
  | { tipo: 'deterministic-text'; valor: string; motivo: string }
  | { tipo: 'deterministic-number'; valor: string; motivo: string }
  | { tipo: 'boolean-required'; valor: true; motivo: string }
  /** GENERATED sobre un catálogo: la opción la elige la UI con opcionDeDominio(catálogo observado, semilla); nunca la primera. */
  | { tipo: 'generated-option'; semilla: string; motivo: string };

export interface PoliticaCampo {
  etapa: EtapaAfi;
  control: 'select' | 'autocomplete' | 'text' | 'checkbox' | 'radio' | 'archivo';
  /** 'no-verificado': el piloto lo diligenció pero no demostró que bloquee el avance. */
  obligatorioParaAvanzar: boolean | 'no-verificado';
  sensibilidad: Sensibilidad;
  /** El actor QA puede aportar el valor. */
  delActor: boolean;
  derivacion?: {
    dependeDe: readonly CampoAfi[];
    /** Devuelve undefined si la regla no aplica a esos valores. */
    derivar: (conocidos: Partial<Record<CampoAfi, ValorCampo>>) => ValorCampo | undefined;
  };
  auxiliar?: EstrategiaAuxiliar;
  /**
   * (4S-R.1) Preparación SEGÚN ESTADO: el campo solo se diligencia si el Portal lo presenta habilitado y vacío/inválido.
   * Su falta de dato NO bloquea la compilación (queda como gap condicional del plan); es un DataGap en pantalla solo si
   * el estado real lo exige. Una precarga válida o un control deshabilitado nunca se modifican.
   */
  segunEstado?: true;
  /**
   * (AFI-TEST-DATA §7.3) Autorización para resolver el campo como FILLER + GENERATED. Sin ella, un dato GENERATED es un gap.
   * La evidencia de un perfil NO autoriza a otros perfiles. (Ninguna política la declara todavía.)
   */
  generable?: {
    perfiles: readonly PerfilActorAfi[];
    etapa: EtapaAfi;
    estrategia: 'fecha-pasada' | 'entero-rango' | 'texto-sintetico' | 'opcion-dominio' | 'archivo-sintetico';
    restricciones: Readonly<Record<string, unknown>>;
    evidencia: { tipo: 'knowledge' | 'req' | 'qa-aceptado' | 'qa-observado'; referencia: string };
  };
  /** Perfiles donde el piloto recorrió el campo; ausente = todos. */
  perfiles?: readonly PerfilActorAfi[];
  /**
   * Variante OBSERVADA del campo para un perfil (el Portal lo presenta en otra etapa o con otra familia de control).
   * Declararla también hace aplicable el campo a ese perfil. Los perfiles sin variante usan la política base intacta.
   * Se consume solo a través de politicasDelPerfil(): ningún consumidor la interpreta por su cuenta.
   */
  porPerfil?: Partial<Record<PerfilActorAfi, VariantePerfilCampo>>;
  /** Dónde está sustentado en el piloto. */
  evidencia: string;
}

export interface VariantePerfilCampo {
  etapa?: EtapaAfi;
  control?: PoliticaCampo['control'];
  obligatorioParaAvanzar?: PoliticaCampo['obligatorioParaAvanzar'];
  /**
   * Autorización GENERATED propia del perfil (§7.3). Si existe, el perfil NO hereda la estrategia auxiliar de la base: la
   * evidencia de otro perfil nunca autoriza a este.
   */
  generable?: PoliticaCampo['generable'];
  /** Observación que la sustenta (obligatoria: una variante sin evidencia no existe). */
  evidencia: string;
}

/** Persona/empresa QA reutilizable. Los valores pueden ser PII; nunca se imprimen. */
export interface ActorAfi {
  id: string;
  perfil: PerfilActorAfi;
  datos: Partial<Record<CampoAfi, ValorCampo>>;
}

/** El caso puede fijar un valor o delegar EXPLÍCITAMENTE en una regla ("cualquier opción válida"). */
export type ValorCaso = ValorCampo | { estrategia: EstrategiaAuxiliar };

/** Forma pensada para que un futuro agente describa un caso. */
export interface ContextoResolucion {
  actor?: ActorAfi;
  datosCaso?: Partial<Record<CampoAfi, ValorCaso>>;
  /** Campos cuyo valor forma parte del resultado esperado del caso. */
  aserciones?: readonly CampoAfi[];
  /** Identidad estable del caso (HU|CP|versión) para la generación determinista; nunca un dato del actor. */
  semilla?: string;
}

export type MotivoGap =
  | 'campo-desconocido'
  | 'asercion-sin-valor-explicito'
  | 'sin-fuente-segura'
  | 'dependencia-ciclica';

const EXPLICACION: Record<MotivoGap, string> = {
  'campo-desconocido': 'el campo no existe en las políticas de Afiliaciones',
  'asercion-sin-valor-explicito': 'el campo es funcionalmente relevante para el caso y no existe un valor explícito',
  'sin-fuente-segura': 'no hay valor del caso ni del actor, no se puede derivar y el campo no admite resolución auxiliar',
  'dependencia-ciclica': 'su derivación depende circularmente de sí mismo',
};

/** Falta de dato que requiere intervención. El mensaje nunca incluye valores. */
export class DataGapError extends Error {
  constructor(
    readonly campo: string,
    readonly motivo: MotivoGap,
    readonly fuentesEsperadas: readonly OrigenDato[] = [],
  ) {
    super(`No se puede resolver "${campo}": ${EXPLICACION[motivo]}.`
      + (fuentesEsperadas.length ? ` Fuentes aceptadas: ${fuentesEsperadas.join(', ')}.` : ''));
    this.name = 'DataGapError';
  }
}

export const REDACTADO = '[REDACTED]';

export interface DiagnosticoResolucion {
  campo: CampoAfi;
  origen: OrigenDato;
  sensibilidad: Sensibilidad;
  relevanteParaAsercion: boolean;
  valor?: ValorCampo;
  estrategia?: EstrategiaAuxiliar;
  derivadoDe?: readonly CampoAfi[];
}

/**
 * Resultado con provenance. El valor real queda en un campo privado: JSON.stringify,
 * console.log y snapshots solo ven el diagnóstico redactado.
 */
export class ResolucionCampo {
  readonly #valor?: ValorCampo;

  constructor(
    readonly campo: CampoAfi,
    readonly origen: OrigenDato,
    readonly sensibilidad: Sensibilidad,
    readonly relevanteParaAsercion: boolean,
    valor?: ValorCampo,
    readonly estrategia?: EstrategiaAuxiliar,
    readonly derivadoDe?: readonly CampoAfi[],
  ) {
    this.#valor = valor;
  }

  /** Valor real para la futura ejecución; undefined cuando hay estrategia. */
  get valor(): ValorCampo | undefined {
    return this.#valor;
  }

  diagnostico(): DiagnosticoResolucion {
    return {
      campo: this.campo,
      origen: this.origen,
      sensibilidad: this.sensibilidad,
      relevanteParaAsercion: this.relevanteParaAsercion,
      ...(this.#valor !== undefined ? { valor: redactar(this.sensibilidad, this.#valor) } : {}),
      ...(this.estrategia ? { estrategia: this.estrategia } : {}),
      ...(this.derivadoDe ? { derivadoDe: this.derivadoDe } : {}),
    };
  }

  toJSON(): DiagnosticoResolucion {
    return this.diagnostico();
  }
}

export function redactar(sensibilidad: Sensibilidad, valor: ValorCampo): ValorCampo {
  return sensibilidad === 'public' ? valor : REDACTADO;
}
