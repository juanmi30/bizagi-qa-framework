import { expect } from '@playwright/test';
import type { AfiliacionesPortal } from './afiliacionesPortal';
import {
  REDACTADO, redactar,
  type CampoAfi, type EstrategiaAuxiliar, type EtapaAfi, type OrigenDato, type ResolucionCampo, type Sensibilidad, type ValorCampo,
} from '../data/afi/modelo';
import type { PlanPreparacion } from '../data/afi/resolver';
import {
  CapabilityGapPreparacionError, exigirCapacidadesPreparacion, materializar, ordenarPorPantalla,
  type AlcanceCapacidad, type CamposDeEtapa, type EtapaConCapacidades, type Materializacion,
} from '../data/afi/capacidadesPreparacion';
import {
  DataGapPantallaError, decidirSegunEstado, faltantesSegunEstado, fechaIso, reglaCoincidencia,
  type DiagnosticoEstadoCampo, type EstadoControl, type FaltantePantalla,
} from '../data/afi/preparacionSegunEstado';

/**
 * Driver UI de Afiliaciones: EJECUTA resoluciones del resolver de datos.
 * No decide provenance ni relevancia, no inventa reglas y no lee el entorno.
 * Fase 2B: inicio-solicitud. Fase 2C: telefonos e informacion-adicional (Facultativo), solo
 * valores concretos. Estos drivers completan campos; la navegación (Continuar) es del caso.
 */

/*
 * QUÉ resolución es ejecutable lo decide capacidadesPreparacion.ts (fuente pura única, también usada
 * por el compilador). Aquí solo vive el mapeo campo -> control UI; las claves están tipadas contra
 * esa tabla, así que un campo no puede existir en una y faltar en la otra.
 */
type UiInicio = { control: string } | { titulo: string; control: string } | { ids: Readonly<Record<string, string>> } | Record<string, never>;

const UI_INICIO = {
  tipoAportante: { control: 'tipoAportante' },
  tipoAfiliado: { control: 'tipoAfiliado' },
  tipoEmpleador: { control: 'tipoEmpleador' },
  naturaleza: { control: 'naturaleza' },
  claseEmpleador: { control: 'claseEmpleador' },
  // Demostrado en CP04 Empresa: tipoIde llega deshabilitado y precargado.
  tipoIdentificacion: { control: 'tipoIde' },
  // Lo escribe AfiliacionesPortal.escribirIdentificacion; el control se declara aquí para la máscara PII.
  numeroIdentificacion: { control: 'identificacion' },
  correo: { control: 'correoElectronico' },
  confirmacionCorreo: { control: 'correoElectronicoConfirmacion' },
  // Solo la opción observada en el piloto.
  recibioAyudaAsesor: { ids: { No: 'recibioAyudaAsesorNo' } },
  autorizaDatos: { control: 'terminos', titulo: 'Autorización para el tratamiento de datos' },
  autorizaIntimidad: { control: 'intimidad', titulo: 'Autorización para el derecho de intimidad' },
} as const satisfies Record<CamposDeEtapa<'inicio-solicitud'>, UiInicio>;

/**
 * exacto: inputValue debe ser el valor escrito; si no, solo se exige que el control quede válido.
 * control: formcontrolname (select/autocomplete). catalogo: selector del control de catálogo (id del piloto).
 * sugerencias: selector del autocomplete para la primera sugerencia válida (id del piloto Independiente).
 */
type UiPreparacion = { selector: string; teclado?: true; exacto: boolean } | { control: string; sugerencias?: string } | { catalogo: string; control?: string };

const UI_PREPARACION: { [E in Exclude<EtapaConCapacidades, 'inicio-solicitud' | 'informacion-empresa'>]: Record<CamposDeEtapa<E>, UiPreparacion> } = {
  telefonos: {
    numeroCelular: { selector: '#numeroCelular', exacto: true },
    numeroTelefonoFijo: { selector: '#numeroTelefonoFijo', exacto: true },
  },
  'informacion-adicional': {
    nacionalidad: { control: 'nacionalidad' },
    estadoCivil: { control: 'estadoCivil' },
    fondoPensiones: { control: 'fondo', sugerencias: '#fondo' },
    // Piloto Independiente: opción exacta del actor en #actividad; ingreso tecleado, se exige validez (puede formatearse).
    actividad: { catalogo: '#actividad' },
    ingresoMensual: { selector: '#ingresoMensual', teclado: true, exacto: false },
    // Como el piloto: se teclea y se exige validez, sin comparar el valor mostrado.
    salarioBasico: { selector: 'input[formcontrolname="salarioBasico"]', teclado: true, exacto: false },
  },
};

/** Identidad de un control como la define la estructura observada (formcontrolname > name > id estable). */
const identidad = (id: string) => `[formcontrolname="${id}"], [name="${id}"], [id="${id}"]`;

/** (Ruta derivada) Mapeo UI de las etapas que solo atraviesa la ruta de Knowledge (CAPACIDADES_RUTA). */
const UI_RUTA: Record<string, Record<string, UiPreparacion>> = {
  // Field Registry (formcontrolname demostrado; mat-select observado en QA para PJ).
  'informacion-contacto': {
    departamento: { control: 'departamento' },
    ciudadVivienda: { control: 'ciudadVivienda' },
    // Identidad observada en la estructura PJ (formcontrolname | name | id estable).
    numeroCelular: { selector: identidad('numeroCelular'), exacto: true },
    numeroTelefonoFijo: { selector: identidad('numeroTelefonoFijo'), exacto: true },
  },
  // Identidad observada (piloto Independiente y exploración Dirección PJ): formcontrolname | name | id estable.
  direccion: {
    viaPrincipal: { catalogo: identidad('viaPrincipal') },
    letrasVp: { catalogo: identidad('letrasVp') },
    sectorVp: { catalogo: identidad('sectorVp') },
    letrasVg: { catalogo: identidad('letrasVg') },
    numeroVp: { selector: identidad('numeroVp'), exacto: true },
    numeroVg: { selector: identidad('numeroVg'), exacto: true },
    numeroPredio: { selector: identidad('numeroPredio'), exacto: true },
  },
};

/**
 * 4S-R.1 Empleador PJ ("Ingresa la información de la empresa"). ÚNICO lugar donde vive la identidad DOM de cada campo:
 * el resto del framework solo conoce la identidad semántica (p. ej. codigoCiiu; el Portal lo publica con la errata "ciuu").
 */
/** `tras`: el Portal PODRÍA derivar este campo al preparar aquel; se observa (sin asumirlo) antes de decidir. */
type UiEmpresa = { control: string; teclado?: true; tras?: string } | { control: string; ids: Readonly<Record<string, string>> };
const UI_EMPRESA = {
  razonSocial: { control: 'razonSocial' },
  codigoCiiu: { control: 'ciuu' },
  actividadEconomicaEmpresa: { control: 'actividad', tras: 'codigoCiiu' },
  fechaInicioActividad: { control: 'fechaInicio', teclado: true },
  valorNomina: { control: 'valorNomina', teclado: true },
  numeroTrabajadores: { control: 'numeroTrabajadores', teclado: true },
  afiliadoPrimeraVez: { control: 'afiliadoPrimeraVez', ids: { Si: 'afiliadoPrimeraVezSi', No: 'afiliadoPrimeraVezNo' } },
  // 4S-R.2: el Portal lo publica como "cajaCompensacion" y solo lo muestra tras responder afiliadoPrimeraVez (no se infiere
  // con qué respuesta: la PRESENCIA real del control gobierna la preparación).
  cajaCompensacionAnterior: { control: 'cajaCompensacion', tras: 'afiliadoPrimeraVez' },
} as const satisfies Record<CamposDeEtapa<'informacion-empresa'>, UiEmpresa>;
type CampoEmpresa = keyof typeof UI_EMPRESA;
/** (4S-R.1) Estado sanitizado de un control SIN política (solo observación; identidad pública del control). */
export interface ControlObservado { identidadControl: string; requerido: boolean; deshabilitado: boolean; vacio: boolean; invalido: boolean }
const selectoresEmpresa = (campo: CampoEmpresa): string[] => {
  const m: UiEmpresa = UI_EMPRESA[campo];
  return 'ids' in m ? Object.values(m.ids).map(id => `[id="${id}"]`) : [`[formcontrolname="${m.control}"]`];
};

const ui = <T>(tabla: object, campo: CampoAfi): T => (tabla as Record<string, T>)[campo];

/**
 * Selectores CSS de los controles de cada campo, derivados de los MISMOS mapeos que usa el driver
 * (Fase 4G: máscara PII de evidencias). Un campo sin mapeo UI no aparece.
 */
export function selectoresCamposAfi(): Partial<Record<CampoAfi, string[]>> {
  const porControl = (c: string) => `[formcontrolname="${c}"]`;
  const selectores: Partial<Record<CampoAfi, string[]>> = {};
  for (const [campo, m] of Object.entries(UI_INICIO) as [CampoAfi, UiInicio][]) {
    const s = [...('control' in m ? [porControl(m.control)] : []), ...('ids' in m ? Object.values(m.ids).map(id => `#${id}`) : [])];
    if (s.length) selectores[campo] = s;
  }
  for (const campo of Object.keys(UI_EMPRESA) as CampoEmpresa[]) selectores[campo] = selectoresEmpresa(campo);
  for (const tabla of Object.values(UI_PREPARACION) as Record<string, UiPreparacion>[]) {
    for (const [campo, m] of Object.entries(tabla) as [CampoAfi, UiPreparacion][]) {
      selectores[campo] = 'selector' in m ? [m.selector] : 'catalogo' in m ? [m.catalogo] : [porControl(m.control), ...(m.sugerencias ? [m.sugerencias] : [])];
    }
  }
  return selectores;
}
const texto = (m: Materializacion): string => { if (m.modo !== 'texto') throw new Error(`Materialización inesperada: ${m.modo}`); return m.texto; };

/** Gaps del plan: se reporta solo campo y motivo, nunca valores. */
export class PlanIncompletoError extends Error {
  constructor(readonly etapa: EtapaAfi, readonly faltantes: readonly { campo: string; motivo: string }[]) {
    super(`No se puede preparar ${etapa}:\n${faltantes.map(f => `- ${f.campo}: ${f.motivo}`).join('\n')}`);
    this.name = 'PlanIncompletoError';
  }
}

export function exigirSinGaps(etapa: EtapaAfi, plan: PlanPreparacion): void {
  if (plan.gaps.length) throw new PlanIncompletoError(etapa, plan.gaps.map(g => ({ campo: g.campo, motivo: g.motivo })));
}

export interface DiagnosticoAplicacion {
  campo: CampoAfi;
  origen: OrigenDato;
  sensibilidad: Sensibilidad;
  relevanteParaAsercion: boolean;
  estrategia?: EstrategiaAuxiliar;
  aplicado: true;
  /** 'precargado': el control ya traía el valor exacto esperado y no se tocó. */
  modo: 'ejecutado' | 'precargado';
  valorEfectivo: ValorCampo;
  /** Solo campos public: catálogo visto al elegir una opción auxiliar. */
  opciones?: readonly string[];
  /** (4S-R.2) Cómo se materializó en la UI (familia, control DOM, regla y conteos). Nunca valores. */
  interaccion?: InteraccionUi;
}

/** Evidencia segura de la interacción: familia de componente, identidad del control DOM, regla y conteos/booleanos. */
export interface InteraccionUi {
  familia: 'autocomplete' | 'select';
  control: string;
  regla?: 'exacta' | 'codigo-catalogo';
  panelAbierto?: boolean; opcionesVisibles?: number; coincidencias?: number; clic?: boolean; verificada?: boolean;
}

/** Qué ocurrió realmente en la UI. Provenance copiada de la resolución; valor real privado. */
export class AplicacionCampo {
  readonly #valorEfectivo: ValorCampo;
  readonly #opciones?: readonly string[];

  constructor(readonly resolucion: ResolucionCampo, valorEfectivo: ValorCampo, readonly modo: 'ejecutado' | 'precargado', opciones?: readonly string[],
    readonly interaccion?: InteraccionUi) {
    this.#valorEfectivo = valorEfectivo;
    this.#opciones = opciones;
  }

  get campo(): CampoAfi { return this.resolucion.campo; }
  get origen(): OrigenDato { return this.resolucion.origen; }
  get valorEfectivo(): ValorCampo { return this.#valorEfectivo; }

  diagnostico(): DiagnosticoAplicacion {
    const r = this.resolucion;
    return {
      campo: r.campo, origen: r.origen, sensibilidad: r.sensibilidad, relevanteParaAsercion: r.relevanteParaAsercion,
      ...(r.estrategia ? { estrategia: r.estrategia } : {}),
      aplicado: true, modo: this.modo,
      valorEfectivo: redactar(r.sensibilidad, this.#valorEfectivo),
      ...(this.#opciones && r.sensibilidad === 'public' ? { opciones: this.#opciones } : {}),
      ...(this.interaccion ? { interaccion: { ...this.interaccion } } : {}),
    };
  }

  toJSON(): DiagnosticoAplicacion {
    return this.diagnostico();
  }
}

type Accion = () => Promise<AplicacionCampo>;

export class AfiDataUi {
  constructor(private readonly portal: AfiliacionesPortal) {}

  /**
   * Completa inicio-solicitud desde un plan de resolverEtapa('inicio-solicitud').
   * Gaps o resoluciones no ejecutables fallan ANTES de pulsar "Iniciar solicitud".
   */
  async completarInicioSolicitud(
    plan: PlanPreparacion,
    registrar?: (aplicacion: AplicacionCampo) => Promise<void>,
  ): Promise<AplicacionCampo[]> {
    const acciones = this.acciones('inicio-solicitud', plan);
    await this.portal.iniciarSolicitud();
    const aplicadas = await this.ejecutar(acciones, registrar);
    await this.portal.esperarInicioCompleto();
    return aplicadas;
  }

  /** Rellena y verifica teléfonos; no pulsa Continuar. */
  async completarTelefonos(plan: PlanPreparacion, registrar?: (aplicacion: AplicacionCampo) => Promise<void>): Promise<AplicacionCampo[]> {
    return this.ejecutar(this.acciones('telefonos', plan), registrar);
  }

  /** Rellena y verifica información adicional; no pulsa Continuar. */
  async completarInformacionAdicional(plan: PlanPreparacion, registrar?: (aplicacion: AplicacionCampo) => Promise<void>): Promise<AplicacionCampo[]> {
    return this.ejecutar(this.acciones('informacion-adicional', plan), registrar);
  }

  /**
   * (Ruta derivada) Cualquier etapa de la tabla de capacidades preparada por políticas: el MISMO mecanismo para todas
   * (sin una función por pantalla). No pulsa Continuar: el avance lo decide la transición de Knowledge.
   */
  async completarEtapa(etapa: EtapaAfi, plan: PlanPreparacion, registrar?: (aplicacion: AplicacionCampo) => Promise<void>): Promise<AplicacionCampo[]> {
    if (etapa === 'inicio-solicitud' || etapa === 'informacion-empresa') throw new Error(`${etapa} tiene su driver propio en el runner`);
    return this.ejecutar(this.acciones(etapa, plan, 'ruta'), registrar);
  }

  /**
   * (4S-R.1) Información de la empresa SEGÚN ESTADO (no pulsa Continuar). Por campo del plan, en orden de pantalla: ausente o
   * deshabilitado -> no se toca; precarga válida -> se conserva; habilitado y vacío/inválido -> se prepara con el dato legítimo
   * del plan. Luego re-evalúa (el Portal puede completar dependientes) y, si la pantalla aún exige un campo sin dato o tiene un
   * control inválido no declarado, lanza DataGapPantallaError. `registrarEstado` recibe solo booleanos y decisiones.
   */
  async completarInformacionEmpresa(
    plan: PlanPreparacion,
    registrar?: (aplicacion: AplicacionCampo) => Promise<void>,
    registrarEstado?: (diagnosticos: readonly DiagnosticoEstadoCampo[]) => Promise<void>,
    registrarOtros?: (otros: { inicial: readonly ControlObservado[]; final?: readonly ControlObservado[] }) => Promise<void>,
  ): Promise<AplicacionCampo[]> {
    const etapa = 'informacion-empresa';
    exigirSinGaps(etapa, plan);
    exigirCapacidadesPreparacion(etapa, plan);
    const resoluciones = new Map(plan.resoluciones.map(r => [r.campo, r]));
    const enPlan = (c: CampoEmpresa) => resoluciones.has(c) || !!plan.condicionales?.some(g => g.campo === c);
    const diagnosticos: DiagnosticoEstadoCampo[] = [];
    const aplicadas: AplicacionCampo[] = [];
    // Solo OBSERVACIÓN (nunca se actúa sobre ellos): controles sin política en la pantalla, p. ej. "Clase aportante".
    const otros: { inicial: readonly ControlObservado[]; final?: readonly ControlObservado[] } = { inicial: await this.otrosControles() };
    try {
      for (const campo of (Object.keys(UI_EMPRESA) as CampoEmpresa[]).filter(enPlan)) {
        const r = resoluciones.get(campo);
        const ui: UiEmpresa = UI_EMPRESA[campo];
        // Reevaluación observada: si se preparó el campo del que podría derivarse, se espera brevemente a que el Portal lo
        // complete; si no lo hace, se decide con el estado real (dato del actor o DataGap). Nunca se asume la derivación.
        if ('tras' in ui && ui.tras && diagnosticos.some(d => d.campo === ui.tras && d.decision === 'preparar')) await this.esperarCompletado(selectoresEmpresa(campo));
        const estado = await this.estadoControl(selectoresEmpresa(campo));
        const decision = decidirSegunEstado(estado, !!r);
        diagnosticos.push({ campo, estado, decision, ...(r ? { origen: r.origen } : {}) });
        if (!r || (decision !== 'preparar' && decision !== 'conservar')) continue;
        const aplicada = decision === 'conservar' ? await this.conservado(r) : await this.prepararEmpresa(r);
        aplicadas.push(aplicada);
        await registrar?.(aplicada);
      }
      for (const d of diagnosticos) {
        if (d.decision === 'preparar' || d.decision === 'sin-dato') d.final = await this.estadoControl(selectoresEmpresa(d.campo as CampoEmpresa));
      }
      otros.final = await this.otrosControles();
      const faltantes: FaltantePantalla[] = [...faltantesSegunEstado(plan, diagnosticos), ...await this.controlesInvalidosNoDeclarados()];
      if (faltantes.length) throw new DataGapPantallaError(etapa, faltantes);
      return aplicadas;
    } finally {
      try { await registrarEstado?.(diagnosticos); } catch { /* La evidencia nunca reemplaza el resultado. */ }
      try { if (!otros.final) otros.final = await this.otrosControles(); await registrarOtros?.(otros); } catch { /* solo evidencia */ }
    }
  }

  /** Controles visibles SIN política en la pantalla: identidad pública del control + booleanos (nunca valores). */
  private otrosControles(): Promise<ControlObservado[]> {
    const declarados = Object.values(UI_EMPRESA).flatMap((m: UiEmpresa) => ['ids' in m ? Object.values(m.ids) : [], m.control].flat());
    return this.portal.page.evaluate(conocidos => {
      const visible = (e: Element) => (e as HTMLElement).getClientRects().length > 0 && getComputedStyle(e as HTMLElement).visibility !== 'hidden';
      const grupos = new Map<string, Element[]>();
      for (const e of [...document.querySelectorAll('input, mat-select, select, textarea')].filter(visible)) {
        const id = e.getAttribute('formcontrolname') || e.getAttribute('name') || e.id;
        if (!id || conocidos.includes(id) || conocidos.includes(e.id) || (e as HTMLInputElement).type === 'hidden') continue;
        grupos.set(id, [...(grupos.get(id) ?? []), e]);
      }
      return [...grupos].map(([identidadControl, els]) => {
        const e = els[0];
        const campo = e.closest('mat-form-field') ?? e.parentElement;
        const opciones = els.filter(x => ['radio', 'checkbox'].includes((x as HTMLInputElement).type));
        return {
          identidadControl,
          requerido: els.some(x => x.hasAttribute('required') || x.getAttribute('aria-required') === 'true')
            || !!campo?.querySelector('.mat-mdc-form-field-required-marker, .mat-form-field-required-marker'),
          deshabilitado: els.every(x => x.hasAttribute('disabled') || x.getAttribute('aria-disabled') === 'true'
            || x.classList.contains('mat-mdc-select-disabled') || x.classList.contains('mat-select-disabled')),
          vacio: opciones.length ? !opciones.some(r => (r as HTMLInputElement).checked)
            : e.tagName === 'MAT-SELECT' ? !(e.querySelector('.mat-mdc-select-value-text, .mat-select-value-text')?.textContent ?? '').trim()
              : !('value' in e) || String((e as HTMLInputElement).value).trim() === '',
          invalido: els.some(x => x.classList.contains('ng-invalid') || x.getAttribute('aria-invalid') === 'true'),
        };
      });
    }, declarados);
  }

  /**
   * Tras preparar el campo del que depende: hasta 3 s para que el Portal REACCIONE (muestre el control condicional o lo
   * complete). Termina antes solo si el control ya está presente y resuelto (deshabilitado o con valor válido); si aparece
   * vacío o nunca aparece, se espera la ventana completa y se decide con el estado REAL observado al final.
   */
  private async esperarCompletado(selectores: readonly string[]): Promise<void> {
    await expect.poll(async () => { const e = await this.estadoControl(selectores); return e.presente && (e.deshabilitado || (!e.vacio && !e.invalido)); },
      { message: 'Campo dependiente', timeout: 3_000, intervals: [250, 500] }).toBe(true).catch(() => undefined);
  }

  /** Estado SANITIZADO de un control: se calcula en el navegador y solo regresan booleanos (nunca el valor). */
  private estadoControl(selectores: readonly string[]): Promise<EstadoControl> {
    return this.portal.page.evaluate(sel => {
      const visible = (e: Element) => (e as HTMLElement).getClientRects().length > 0 && getComputedStyle(e as HTMLElement).visibility !== 'hidden';
      const els = sel.flatMap(s => [...document.querySelectorAll(s)]).filter(visible);
      if (!els.length) return { presente: false, deshabilitado: false, vacio: true, invalido: false };
      const e = els[0];
      const opciones = els.filter(x => ['radio', 'checkbox'].includes((x as HTMLInputElement).type));
      const vacio = opciones.length ? !opciones.some(r => (r as HTMLInputElement).checked)
        : e.tagName === 'MAT-SELECT' ? !(e.querySelector('.mat-mdc-select-value-text, .mat-select-value-text')?.textContent ?? '').trim()
          : !('value' in e) || String((e as HTMLInputElement).value).trim() === '';
      return {
        presente: true,
        deshabilitado: els.every(x => x.hasAttribute('disabled') || x.getAttribute('aria-disabled') === 'true'
          || x.classList.contains('mat-mdc-select-disabled') || x.classList.contains('mat-select-disabled')),
        vacio,
        invalido: els.some(x => x.classList.contains('ng-invalid') || x.getAttribute('aria-invalid') === 'true'),
      };
    }, [...selectores]);
  }

  /** Controles visibles, habilitados e inválidos que ninguna política declara: identidad pública del control, nunca valores. */
  private async controlesInvalidosNoDeclarados(): Promise<FaltantePantalla[]> {
    const declarados = Object.values(UI_EMPRESA).flatMap((m: UiEmpresa) => ['ids' in m ? Object.values(m.ids) : [], m.control].flat());
    const ids = await this.portal.page.evaluate(conocidos => {
      const visible = (e: Element) => (e as HTMLElement).getClientRects().length > 0 && getComputedStyle(e as HTMLElement).visibility !== 'hidden';
      const r = new Set<string>();
      for (const e of [...document.querySelectorAll('input, mat-select, select, textarea')].filter(visible)) {
        const id = e.getAttribute('formcontrolname') || e.getAttribute('name') || e.id;
        if (!id || conocidos.includes(id) || conocidos.includes(e.id) || (e as HTMLInputElement).type === 'hidden') continue;
        const deshabilitado = e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true' || e.classList.contains('mat-mdc-select-disabled');
        if (!deshabilitado && (e.classList.contains('ng-invalid') || e.getAttribute('aria-invalid') === 'true')) r.add(id);
      }
      return [...r];
    }, declarados);
    return ids.map(campo => ({ campo, motivo: 'control-no-declarado' as const }));
  }

  /** Precarga válida con resolución en el plan: no se toca. Solo un campo public expone su valor (en memoria). */
  private async conservado(r: ResolucionCampo): Promise<AplicacionCampo> {
    const m: UiEmpresa = UI_EMPRESA[r.campo as CampoEmpresa];
    const valor = r.sensibilidad === 'public' && !('ids' in m)
      ? (await this.portal.page.locator(`input[formcontrolname="${m.control}"]`).inputValue()).trim() : REDACTADO;
    return new AplicacionCampo(r, valor, 'precargado');
  }

  /** Materializa con las primitivas genéricas del Portal; un control que no se comporta como su capability -> CapabilityGap. */
  private async prepararEmpresa(r: ResolucionCampo): Promise<AplicacionCampo> {
    const etapa = 'informacion-empresa';
    const { capacidad, materializacion } = materializar(etapa, r);
    const m: UiEmpresa = UI_EMPRESA[r.campo as CampoEmpresa];
    const campo = this.portal.page.locator(`input[formcontrolname="${m.control}"]`);
    // FAMILIA explícita según la capability: autocomplete de Material (input combobox) vs mat-select. Cada familia tiene su
    // primitiva genérica; el driver nunca deduce la familia por el nombre del campo y verifica que el DOM real la cumpla.
    const gapUi = (detalle: string) => new CapabilityGapPreparacionError([{ ruta: `${etapa}.${r.campo}`, clase: 'capability', mensaje: detalle }]);
    if (capacidad.control === 'autocomplete') {
      if (!capacidad.coincidencia) throw new Error(`Capability incoherente para "${r.campo}": autocomplete sin regla de coincidencia`);
      // Antes de interactuar: el control debe ser un INPUT combobox con panel de sugerencias. Nunca "a ciegas" con fill().
      const autocompletar = await this.portal.page.locator(`[formcontrolname="${m.control}"]`).first().evaluate(e => e.tagName === 'INPUT'
        && (e.getAttribute('role') === 'combobox' || !!e.getAttribute('aria-autocomplete')
          || (!!e.getAttribute('aria-controls') && e.getAttribute('aria-haspopup') !== 'false')));
      if (!autocompletar) throw gapUi(`El Portal presenta "${r.campo}" sin panel de sugerencias asociado: no es el autocompletar soportado.`);
      // Se busca EL valor del actor y solo se elige la opción coincidente única según la regla declarada; nunca otra.
      const valor = texto(materializacion), regla = capacidad.coincidencia, compara = reglaCoincidencia(regla);
      const elegido = await this.portal.elegirSugerenciaCoincidente(campo, valor, opcion => compara(opcion, valor));
      const interaccion: InteraccionUi = { familia: 'autocomplete', control: m.control, regla, ...elegido.detalle };
      if (elegido.resultado !== 'seleccionada') {
        const d = elegido.detalle;
        throw gapUi(elegido.resultado === 'no-verificada'
          ? `El autocompletar de "${r.campo}" no quedó con un valor correspondiente al dato del actor y válido tras seleccionar la opción coincidente (no-verificada); no se elige otra opción.`
          : `El autocompletar de "${r.campo}" no permitió localizar una opción coincidente única con el dato del actor (${elegido.resultado}; `
            + `regla ${regla}, panel ${d.panelAbierto ? 'abierto' : 'no abierto'}, opciones visibles ${d.opcionesVisibles}, coincidencias ${d.coincidencias}); no se elige otra opción.`);
      }
      return new AplicacionCampo(r, elegido.seleccion, 'ejecutado', undefined, interaccion);
    }
    const valor = texto(materializacion);
    if (capacidad.control === 'select' && !('ids' in m)) {
      // Primitiva EXISTENTE de selección exacta (elegirExactoEn): exactamente una opción igual al dato; nunca otra.
      // Familia mat-select: el DOM real debe serlo (un input autocomplete aquí es un mapping equivocado, no se "adivina").
      const select = this.portal.page.locator(`mat-select[formcontrolname="${m.control}"]`);
      if (await select.count() !== 1) throw gapUi(`El Portal no presenta "${r.campo}" como mat-select: la familia declarada no corresponde al control real.`);
      const gap = (detalle: string) => new CapabilityGapPreparacionError([{ ruta: `${etapa}.${r.campo}`, clase: 'capability',
        mensaje: `El catálogo de "${r.campo}" ${detalle}; no se elige otra opción.` }]);
      try { await this.portal.elegirExactoEn(select, valor); }
      catch { throw gap('no permitió seleccionar exactamente una opción igual al dato del actor (ninguna o varias)'); }
      const final = await this.estadoControl(selectoresEmpresa(r.campo as CampoEmpresa));
      if (final.vacio || final.invalido) throw gap('no quedó con una opción elegida y válida tras seleccionar (no-verificada)');
      return new AplicacionCampo(r, valor, 'ejecutado', undefined, { familia: 'select', control: m.control, clic: true, verificada: true });
    }
    if (capacidad.control === 'radio' && 'ids' in m) {
      const id = m.ids[valor];
      if (!id) throw new Error(`Mapeo UI incoherente para "${r.campo}" en ${etapa}`);
      await this.portal.elegirRadio(id);
      return new AplicacionCampo(r, valor, 'ejecutado');
    }
    if (capacidad.control === 'text' && !('ids' in m)) {
      // Fecha: si el Portal la presenta como input nativo type="date" (Mobile), solo acepta ISO; se convierte el MISMO dato.
      const nativoFecha = !!capacidad.fecha && await campo.evaluate(e => (e as HTMLInputElement).type === 'date');
      if (nativoFecha) {
        const iso = fechaIso(valor, capacidad.fecha!.formato);
        if (!iso) throw gapUi(`El dato de "${r.campo}" no tiene el formato de fecha declarado (${capacidad.fecha!.formato}); no se puede escribir en el input de fecha nativo.`);
        await campo.fill(iso);
        await campo.blur();
      } else await this.portal.escribirCampoTexto(campo, valor, 'teclado' in m && m.teclado === true);
      // Puede formatearse (fecha, moneda): se exige validez, nunca se compara ni imprime el valor.
      try {
        await expect(campo, `${r.campo}: debe quedar válido`).not.toHaveClass(/\bng-invalid\b/);
      } catch {
        // Diagnóstico SEGURO del adaptador (atributos y booleanos, nunca el valor) para clasificar la causa.
        const d = await campo.evaluate(e => ({
          vacio: !(e as HTMLInputElement).value, soloLectura: e.hasAttribute('readonly'), inputmode: e.getAttribute('inputmode'),
          tipo: (e as HTMLInputElement).type, maxlength: e.getAttribute('maxlength'),
          mascara: [...e.attributes].filter(x => /mask|pattern|format/i.test(x.name)).map(x => x.name).join('+') || null,
          datepicker: !!e.getAttribute('ng-reflect-mat-datepicker') || e.classList.contains('mat-datepicker-input'),
          overlayAbierto: !!document.querySelector('.cdk-overlay-container .mat-datepicker-content, .cdk-overlay-container mat-calendar, .cdk-overlay-container [role="dialog"]'),
          enfocado: document.activeElement === e,
        }));
        throw new Error(`${r.campo}: no quedó válido tras escribir (${Object.entries(d).map(([k, x]) => `${k}=${x}`).join(', ')})`);
      }
      return new AplicacionCampo(r, valor, 'ejecutado');
    }
    throw new Error(`Mapeo UI incoherente para "${r.campo}" en ${etapa}`);
  }

  /** Sin tocar la UI: lanza si el plan tiene gaps o alguna resolución que este driver no sabe ejecutar. */
  validarPlan(etapa: EtapaAfi, plan: PlanPreparacion): void {
    this.acciones(etapa, plan);
  }

  private acciones(etapa: EtapaAfi, plan: PlanPreparacion, alcance: AlcanceCapacidad = 'runner'): Accion[] {
    exigirSinGaps(etapa, plan);
    // Todas las capacidades antes de tocar UI (misma fuente pura que el compilador).
    exigirCapacidadesPreparacion(etapa, plan, alcance);
    if (etapa === 'inicio-solicitud') return plan.resoluciones.map(r => this.accion(r));
    // Orden de la pantalla observada, no el del catálogo de campos.
    return ordenarPorPantalla(etapa, plan.resoluciones, alcance).map(r => this.accionPreparacion(etapa, r, alcance));
  }

  private async ejecutar(acciones: Accion[], registrar?: (aplicacion: AplicacionCampo) => Promise<void>): Promise<AplicacionCampo[]> {
    const aplicadas: AplicacionCampo[] = [];
    for (const accion of acciones) {
      const aplicada = await accion();
      aplicadas.push(aplicada);
      await registrar?.(aplicada);
    }
    return aplicadas;
  }

  /** telefonos / informacion-adicional: valores concretos (CP04, piloto Independiente) y primera sugerencia válida. */
  private accionPreparacion(etapa: EtapaAfi, r: ResolucionCampo, alcance: AlcanceCapacidad = 'runner'): Accion {
    const { capacidad, materializacion } = materializar(etapa, r, alcance);
    const tabla = (UI_PREPARACION as Record<string, object>)[etapa] ?? (alcance === 'ruta' ? UI_RUTA[etapa] : undefined);
    const control = ui<UiPreparacion>(tabla ?? {}, r.campo);
    // GENERATED sobre un catálogo: opción determinista del dominio OBSERVADO en pantalla (nunca la primera implícita).
    if (materializacion.modo === 'opcion-generada' && capacidad.control === 'select') {
      const control_ = 'catalogo' in control ? this.portal.page.locator(control.catalogo) : 'control' in control && control.control ? this.portal.page.locator(`mat-select[formcontrolname="${control.control}"]`) : undefined;
      if (!control_) throw new Error(`Mapeo UI incoherente para "${r.campo}" en ${etapa}`);
      const semilla = materializacion.semilla;
      return async () => { const { opciones, seleccion } = await this.portal.elegirOpcionGeneradaEn(control_.first(), semilla); return new AplicacionCampo(r, seleccion, 'ejecutado', opciones); };
    }
    // Auxiliar sobre un select: la política autoriza cualquier opción válida -> la primera habilitada del catálogo.
    if (capacidad.control === 'select' && (materializacion.modo === 'primera-opcion' || materializacion.modo === 'primera-sugerencia')) {
      const orden = materializacion.modo === 'primera-opcion' ? materializacion.orden : 'catalogo';
      if ('control' in control && control.control) {
        const nombre = control.control;
        return async () => { const { opciones, seleccion } = await this.portal.elegirPrimeraHabilitada(nombre, orden); return new AplicacionCampo(r, seleccion, 'ejecutado', opciones); };
      }
      if ('catalogo' in control) {
        const selector = control.catalogo;
        return async () => {
          const { opciones, seleccion } = await this.portal.elegirPrimeraHabilitadaEn(this.portal.page.locator(selector), orden);
          return new AplicacionCampo(r, seleccion, 'ejecutado', opciones);
        };
      }
    }
    if (materializacion.modo === 'primera-sugerencia') {
      if (capacidad.control !== 'autocomplete' || !('sugerencias' in control) || !control.sugerencias) throw new Error(`Mapeo UI incoherente para "${r.campo}" en ${etapa}`);
      const selector = control.sugerencias, inicioAlfabetico = materializacion.inicioAlfabetico;
      return async () => {
        const elegido = await this.portal.elegirPrimeraSugerenciaValida(this.portal.page.locator(selector), inicioAlfabetico);
        // El valor observado queda en la aplicación (privado); el diagnóstico lo redacta si el campo no es public.
        return new AplicacionCampo(r, elegido.valor, elegido.modo, elegido.modo === 'ejecutado' ? elegido.opciones : undefined);
      };
    }
    const valor = texto(materializacion);
    const hecho = () => new AplicacionCampo(r, valor, 'ejecutado');
    if (capacidad.control === 'select' && 'catalogo' in control) {
      const selector = control.catalogo;
      return async () => { await this.portal.elegirExactoEn(this.portal.page.locator(selector), valor); return hecho(); };
    }

    if (capacidad.control === 'text' && 'selector' in control) {
      return async () => {
        const campo = this.portal.page.locator(control.selector);
        await this.portal.escribirCampoTexto(campo, valor, control.teclado);
        // Comparación booleana: el mensaje de fallo nunca contiene el valor.
        if (control.exacto) expect(await campo.inputValue() === valor, `${r.campo}: valor ingresado correctamente`).toBe(true);
        else await expect(campo, `${r.campo}: debe quedar válido`).not.toHaveClass(/\bng-invalid\b/);
        return hecho();
      };
    }
    if ('control' in control && control.control) {
      const nombre = control.control;
      if (capacidad.control === 'select') return async () => { await this.portal.elegirConfigurado(nombre, valor); return hecho(); };
      if (capacidad.control === 'autocomplete') return async () => { await this.portal.elegirAutocompleteExacto(nombre, valor); return hecho(); };
    }
    throw new Error(`Mapeo UI incoherente para "${r.campo}" en ${etapa}`);
  }

  /** Traduce una resolución a una acción UI; lanza de inmediato si no es ejecutable. */
  private accion(r: ResolucionCampo): Accion {
    const { capacidad, materializacion: m } = materializar('inicio-solicitud', r);
    const control = ui<UiInicio>(UI_INICIO, r.campo) as { control?: string; titulo?: string; ids?: Readonly<Record<string, string>> };
    const hecho = (efectivo: ValorCampo, modo: 'ejecutado' | 'precargado' = 'ejecutado', opciones?: string[]) =>
      new AplicacionCampo(r, efectivo, modo, opciones);

    switch (capacidad.control) {
      case 'select': {
        const nombre = control.control!;
        if (m.modo === 'primera-opcion') {
          return async () => {
            const { opciones, seleccion } = await this.portal.elegirPrimeraHabilitada(nombre, m.orden);
            return hecho(seleccion, 'ejecutado', opciones);
          };
        }
        const valor = texto(m);
        return async () => {
          const select = this.portal.page.locator(`mat-select[formcontrolname="${nombre}"]`);
          if (capacidad.precargable && await select.isDisabled()) {
            await expect(select, `${r.campo}: precargado y deshabilitado, debe contener el valor esperado`).toHaveText(valor);
            return hecho(valor, 'precargado');
          }
          await this.portal.elegirConfigurado(nombre, valor);
          return hecho(valor);
        };
      }
      case 'identificacion': {
        const valor = texto(m);
        return async () => { await this.portal.escribirIdentificacion(valor); return hecho(valor); };
      }
      case 'correo': {
        const valor = texto(m);
        const campo = control.control as 'correoElectronico' | 'correoElectronicoConfirmacion';
        return async () => { await this.portal.escribirCorreo(campo, valor); return hecho(valor); };
      }
      case 'checkbox': {
        if (m.modo !== 'booleano') break;
        const marcado = m.valor;
        return async () => { await this.portal.autorizar(control.control!, marcado, control.titulo!); return hecho(marcado); };
      }
      case 'radio': {
        const valor = texto(m);
        const id = control.ids?.[valor];
        if (!id) break;
        return async () => { await this.portal.elegirRadio(id); return hecho(valor); };
      }
    }
    throw new Error(`Mapeo UI incoherente para "${r.campo}" en inicio-solicitud`);
  }
}
