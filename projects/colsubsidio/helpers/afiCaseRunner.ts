import { test, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { esCompiladoAfi, type CasoAfiCompilado } from '../data/afi/caso';
import { CapabilityGapPreparacionError, exigirCapacidadesPreparacion } from '../data/afi/capacidadesPreparacion';
import { MODO_EVIDENCIA_POR_DEFECTO, capturaTecnica, type ModoEvidenciaAfi, type ResumenEvidenciaAfi } from '../data/afi/evidencia';
import { exigirPlanFuncionalValido, type ResultadoOperacionAfi } from '../data/afi/funcional';
import type { EtapaAfi, PerfilActorAfi } from '../data/afi/modelo';
import { PERFILES_AFI } from '../data/afi/perfiles';
import type { PlanPreparacion } from '../data/afi/resolver';
import { AfiDataUi, type AplicacionCampo } from './afiDataUi';
import { EvidenciasAfi } from './afiEvidencia';
import type { OpcionesReconocimiento } from './reconocerPantalla';
import { ObservadorPantallaSombra } from './reconocimientoSombra';
import type { ModoReconocimientoPantalla, PuntoObservacion, ResumenReconocimiento } from '../data/afi/aplicacion/reconocimientoSombra';
import { AfiFunctionalUi } from './afiFunctionalUi';
import { AfiliacionesPortal, errorSeguro } from './afiliacionesPortal';
import { BizagiQaSupport } from './bizagiQaSupport';
import { MODELO_APLICACION_AFI, type ModeloAplicacion, type VinculoObservacion } from '../data/afi/aplicacion/modeloAplicacion';
import type { ObservationProvider, ResultadoObservacion } from '../data/afi/aplicacion/superficies';
import { VINCULOS_OBSERVACION_AFI } from '../data/afi/aplicacion/vinculos';
import {
  CondicionObservableFallidaError, observarCondicionesPaso, proveedoresReales, veredictoPaso, type ReintentosObservacion,
} from './observacionRunner';

/**
 * Runner AFI v1 (Fase 3B): ejecuta un CasoAfiCompilado. No conoce ningún caso concreto:
 * solo perfil, etapas, capabilities AFI y el flujo Portal/Bizagi demostrado.
 * No lee process.env ni resuelve datos: el compilado es la única fuente.
 *
 * Soporta SOLO: preparación inicio-solicitud / informacion-empresa (según estado, Empleador PJ) / telefonos / informacion-adicional hasta
 * Información de contacto, y el plan funcional de AfiFunctionalUi. Otra cosa -> CapabilityGap antes de UI.
 */

export const ETAPAS_RUNNER_V1 = ['inicio-solicitud', 'informacion-empresa', 'telefonos', 'informacion-adicional'] as const satisfies readonly EtapaAfi[];
type EtapaPantalla = Exclude<typeof ETAPAS_RUNNER_V1[number], 'inicio-solicitud'>;

// ---- Adaptación del Portal (framework, nunca del contrato) ----
const CONTACTO = /^(Información de contacto|Ingresa tu información de contacto)$/i;
const VERIFICANDO = 'Estamos verificando tu información de forma segura';
/** Botón Continuar que identifica cada pantalla de preparación, por perfil. */
const BOTON_PANTALLA: Record<EtapaPantalla, (perfil: PerfilActorAfi) => string> = {
  // 4S-R.1: solo la variante Persona Jurídica está observada; otra variante no activa la etapa (y la etapa declarada queda pendiente).
  'informacion-empresa': () => '#btn-empleador-pj-continuar',
  telefonos: perfil => `#btn-${perfil}-continuar`,
  'informacion-adicional': perfil => `#btn-${perfil}-info-ad-continuar`,
};
const SUFIJO_EVIDENCIA: Record<typeof ETAPAS_RUNNER_V1[number], string> = {
  'inicio-solicitud': 'inicio', 'informacion-empresa': 'informacion-empresa', telefonos: 'telefonos', 'informacion-adicional': 'informacion-adicional',
};
const MAX_PANTALLAS = 8;

/** Hito técnico del runner (no es una capability del contrato). */
export interface HitoTecnico { id: string; esperado: string }
const HITOS_POR_DEFECTO = {
  apertura: { id: 'apertura-portal', esperado: 'Pantalla de inicio visible.' },
  preparacion: { id: 'preparacion', esperado: 'La pantalla de Información de contacto carga exitosamente.' },
};

export interface ColaboradoresAfi {
  portal: Pick<AfiliacionesPortal, 'abrir' | 'enviarUnaVez'>;
  soporte: Pick<BizagiQaSupport, 'login' | 'registrarCasoCreado' | 'emularReconocimiento' | 'cancelarCasoCreado'>;
  datosUi: Pick<AfiDataUi, 'completarInicioSolicitud' | 'completarTelefonos' | 'completarInformacionAdicional'>
    & Partial<Pick<AfiDataUi, 'completarInformacionEmpresa'>>;
  funcionalUi: Pick<AfiFunctionalUi, 'ejecutarPaso'>;
  /** (4R.1) Proveedores de observación de ESTA corrida (los reales se construyen sobre su soporte). */
  proveedoresObservacion?: readonly ObservationProvider[];
  cerrar(): Promise<void>;
}

export interface RuntimeCasoAfi {
  page: Page;
  context: BrowserContext;
  testInfo: TestInfo;
  /** Etiquetas de reporte de los hitos técnicos (compatibilidad de evidencias del piloto). */
  hitos?: Partial<typeof HITOS_POR_DEFECTO>;
  /** Prefijo de archivos de evidencia; por defecto el primer token de metadata.nombre. */
  prefijoEvidencia?: string;
  /** Política de evidencias de ESTA ejecución (configuración, nunca del contrato). Por defecto 'cliente'. */
  evidencia?: ModoEvidenciaAfi;
  /** Fase 4K: reconocimiento de pantalla en SHADOW MODE (solo observa; configuración de ejecución). Por defecto 'off'. */
  reconocimientoPantalla?: ModoReconocimientoPantalla;
  /** Solo pruebas: modelo/registros alternativos del recognizer. */
  opcionesReconocimiento?: OpcionesReconocimiento;
  /** Solo pruebas: opciones internas del registro de evidencias (p. ej. screenshot simulado). */
  opcionesEvidencia?: Pick<ConstructorParameters<typeof EvidenciasAfi>[0], 'capturar' | 'selectoresCampos'>;
  /**
   * (4R.1) Observación de condiciones (configuración de ejecución, nunca del caso). `permitirNoProductivos` es el segundo
   * opt-in explícito de una corrida de VALIDACIÓN: sin él, un compilado que use proveedores no productivos se rechaza.
   */
  observacion?: { modelo?: ModeloAplicacion; vinculos?: readonly VinculoObservacion[]; reintentos?: ReintentosObservacion; permitirNoProductivos?: boolean; esperar?: (ms: number) => Promise<void> };
  /**
   * Solo diagnóstico técnico: se invoca en cada transición de preparación ANTES de exigir el Continuar habilitado. Debe ser
   * de SOLO LECTURA (nunca actúa sobre el Portal) y su fallo se ignora. Ausente = comportamiento idéntico.
   * (4S-R.1) Devolver 'detener' corta la corrida ANTES de ese Continuar (PreparacionDetenidaError; el cleanup se mantiene).
   */
  diagnosticoAntesDeContinuar?: (contexto: { boton: string | null }) => Promise<void | 'detener'>;
  /**
   * (E2E) Se invoca al alcanzar el punto funcional (preparación completa), ANTES del plan funcional. Su error se propaga
   * (p. ej. el ejecutor E2E detiene allí el recorrido); el cleanup se mantiene. Ausente = comportamiento idéntico.
   */
  alPuntoFuncional?: () => Promise<void>;
  /**
   * Contexto del navegador para el soporte Bizagi (login, cleanup, emulación). Ausente = el mismo del Portal. Se usa cuando el
   * Portal corre emulado (p. ej. Mobile) y la consola de Bizagi debe seguir en escritorio.
   */
  contextoSoporte?: BrowserContext;
  /** Solo pruebas: sustituye los colaboradores reales. Se invoca DESPUÉS del preflight. */
  colaboradores?: (runtime: RuntimeCasoAfi) => Promise<ColaboradoresAfi>;
}

type Estado = 'PASS' | 'FAIL';
/** (4R.1) Un paso cuyas condiciones no pudieron observarse no está certificado: ni PASS ni FAIL. */
type EstadoPaso = Estado | 'NO_OBSERVABLE';

/** Evento técnico del runner: serializable y sin PII (solo nombres de etapa, ids de botón públicos, conteos). */
export interface EventoTecnicoAfi {
  evento:
    | 'login-soporte' | 'portal-abierto' | 'etapa-preparacion' | 'caso-creado'
    | 'reconocimiento-natural' | 'reconocimiento-emulado' | 'transicion-preparacion'
    | 'informacion-contacto-alcanzada' | 'completitud-preparacion' | 'cleanup';
  estado: Estado | 'PENDIENTE';
  etapa?: EtapaAfi;
  /** Seguro: id de botón, conteos, nombre del tipo de error. Nunca mensajes con valores. */
  detalle?: string;
}

/** Estado de una etapa, derivado del PLAN COMPILADO (no de políticas ni de la UI). */
export interface EstadoEtapaPreparacion {
  etapa: EtapaAfi;
  declarada: boolean;
  resoluciones: number;
  /** Declarada y con al menos una resolución: debe materializarse antes del funcional. */
  requerida: boolean;
  aplicada: boolean;
  resultado: 'aplicada' | 'fallida' | 'pendiente' | 'no-requerida' | 'no-declarada';
}

/** El Portal no presentó (o no se completó) una etapa que el plan requería. Ni DataGap ni CapabilityGap. */
export class EtapaPreparacionNoAlcanzadaError extends Error {
  constructor(readonly pendientes: readonly { etapa: EtapaAfi; resoluciones: number }[]) {
    super(`No se completaron todas las etapas de preparación requeridas:\n${pendientes
      .map(p => `- ${p.etapa}: la etapa tenía ${p.resoluciones} resolución(es) pero no fue observada/aplicada.`).join('\n')}`);
    this.name = 'EtapaPreparacionNoAlcanzadaError';
  }
}

/** (4S-R.1) Corte solicitado por un diagnóstico técnico antes de un Continuar: nunca es un resultado funcional. */
export class PreparacionDetenidaError extends Error {
  constructor(readonly boton: string | null) {
    super(`Preparación detenida por diagnóstico antes del Continuar ${boton ?? '(sin id)'}.`);
    this.name = 'PreparacionDetenidaError';
  }
}

/** Se agotaron las transiciones de preparación sin llegar a Información de contacto. */
export class InformacionContactoNoAlcanzadaError extends Error {
  constructor(transiciones: number, pendientes: readonly EtapaAfi[], botones: readonly string[]) {
    super(`No se alcanzó Información de contacto después de ${transiciones} transiciones de preparación. `
      + `Etapas requeridas pendientes: ${pendientes.length ? pendientes.join(', ') : 'ninguna'}. `
      + `Botones observados: ${botones.length ? botones.join(', ') : 'ninguno'}.`);
    this.name = 'InformacionContactoNoAlcanzadaError';
  }
}

export interface ResultadoCasoAfi {
  metadata: CasoAfiCompilado['metadata'];
  perfil: PerfilActorAfi;
  numeroCaso?: string;
  resultado: EstadoPaso;
  pasosTecnicos: { id: string; esperado: string; resultado: EstadoPaso }[];
  pasosFuncionales: { id: string; esperado: string; resultado: EstadoPaso }[];
  reconocimiento: string;
  cleanup: 'no aplica' | 'pendiente' | 'exitoso' | 'fallido';
  duracionSegundos: number;
  etapasPreparacion: EstadoEtapaPreparacion[];
  trazaTecnica: EventoTecnicoAfi[];
  error?: string;
  errorCleanup?: string;
  /** Fase 4G: estado de la evidencia, independiente de `resultado` (un error de evidencia nunca es FAIL funcional). */
  evidencia?: ResumenEvidenciaAfi;
  /** Fase 4K: diagnóstico técnico del recognizer en shadow mode. Nunca altera `resultado`. */
  reconocimientoPantalla?: { modo: 'shadow'; resumen: ResumenReconocimiento };
  /** (4R.1) Resultados de las condiciones observables (sin valores observados ni textos de la fuente). */
  observaciones?: ResultadoObservacion[];
  /** (4R.1) Corrida de VALIDACIÓN de un proveedor no productivo: su resultado no certifica el caso. */
  observacionValidacion?: true;
}

/** Caso compilado con data gaps: nunca se abre navegador. */
export class CasoAfiNoEjecutableError extends Error {
  constructor(nombre: string, gaps: CasoAfiCompilado['preparacion']['gaps'], observacion: CasoAfiCompilado['observacion']['gaps'] = []) {
    super([
      ...(gaps.length || !observacion.length
        ? [`El caso "${nombre}" no es ejecutable; faltan datos:`, ...gaps.map(g => `- ${g.etapa}.${g.campo}: ${g.motivo}`)]
        : [`El caso "${nombre}" no es ejecutable.`]),
      ...(observacion.length ? ['Condiciones no observables:', ...observacion.map(g => `- ${g.condicion} ${g.entidad.tipo}:${g.entidad.id} ${g.expectativa}: ${g.estado}${g.motivo ? ` (${g.motivo})` : ''}`)] : []),
    ].join('\n'));
    this.name = 'CasoAfiNoEjecutableError';
  }
}

/** (4R.1) El compilado usa un proveedor NO productivo y la ejecución no lo autorizó explícitamente. */
export class ObservacionNoProductivaError extends Error {
  constructor(proveedores: readonly string[]) {
    super(`El caso usa proveedores de observación no productivos (${proveedores.join(', ')}); solo una corrida de validación explícita puede ejecutarlos.`);
    this.name = 'ObservacionNoProductivaError';
  }
}

/**
 * Preflight puro, ANTES de cualquier página/navegación/caso: compilado auténtico, ejecutable,
 * etapas soportadas por el runner v1, capabilities de preparación y plan funcional válido.
 */
export function preflightCasoAfi(compilado: CasoAfiCompilado, opciones: { permitirNoProductivos?: boolean } = {}): void {
  if (!esCompiladoAfi(compilado)) throw new Error('El runner AFI solo acepta un CasoAfiCompilado producido por compilarCasoAfi (sin alterar)');
  if (!compilado.ejecutable || compilado.preparacion.gaps.length || compilado.observacion.gaps.length) {
    throw new CasoAfiNoEjecutableError(compilado.metadata.nombre, compilado.preparacion.gaps, compilado.observacion.gaps);
  }
  if (compilado.observacion.validacion && !opciones.permitirNoProductivos) {
    throw new ObservacionNoProductivaError([...new Set(compilado.observacion.condiciones.filter(c => c.validacion).map(c => c.proveedor))]);
  }
  const orden = compilado.preparacion.orden;
  const noSoportadas = orden.filter(e => !(ETAPAS_RUNNER_V1 as readonly string[]).includes(e));
  const problemas = noSoportadas.map(e => ({ ruta: `preparacion.etapas.${e}`, clase: 'capability' as const, mensaje: `El runner AFI v1 no sabe orquestar la etapa "${e}".` }));
  if (!orden.includes('inicio-solicitud')) {
    problemas.push({ ruta: 'preparacion.etapas', clase: 'capability', mensaje: 'El runner AFI v1 requiere "inicio-solicitud": es la única forma demostrada de crear el caso.' });
  }
  if (problemas.length) throw new CapabilityGapPreparacionError(problemas);
  for (const etapa of orden) exigirCapacidadesPreparacion(etapa, compilado.preparacion.etapas[etapa]!);
  // Un caso E2E puede no tener plan funcional en "Información de contacto" (lo que sigue lo declara su sección e2e).
  if (!compilado.e2e || compilado.funcional.pasos.length) exigirPlanFuncionalValido(compilado.funcional);
}

/** Id público del Continuar que identifica la pantalla de una etapa de preparación, para un perfil (adaptador del Portal). */
export function botonDeEtapa(etapa: EtapaAfi, perfil: PerfilActorAfi): string | undefined {
  const f = (BOTON_PANTALLA as Partial<Record<EtapaAfi, (p: PerfilActorAfi) => string>>)[etapa];
  return f ? f(perfil).replace(/^#/, '') : undefined;
}

/** Colaboradores reales de la corrida (exportado para specs de validación que los envuelven, nunca para sustituirlos). */
export async function colaboradoresReales({ page, context, testInfo, observacion, contextoSoporte }: RuntimeCasoAfi, compilado: CasoAfiCompilado): Promise<ColaboradoresAfi> {
  const portal = new AfiliacionesPortal(page);
  // El soporte Bizagi (consola administrativa) nunca hereda la emulación de dispositivo del Portal.
  const soportePage = await (contextoSoporte ?? context).newPage();
  // Se crea antes de abrir el Portal: sus fuentes observan las paramétricas desde la carga.
  const funcionalUi = new AfiFunctionalUi(page, testInfo);
  const soporte = new BizagiQaSupport(soportePage);
  return {
    portal, soporte, datosUi: new AfiDataUi(portal), funcionalUi,
    // 4R.1: solo los proveedores que el compilado resolvió, sobre el soporte (y el caso) de ESTA corrida.
    proveedoresObservacion: proveedoresReales(soporte, compilado.observacion.condiciones.map(c => c.proveedor), observacion?.vinculos ?? VINCULOS_OBSERVACION_AFI),
    cerrar: async () => { await funcionalUi.cerrar(); await soportePage.close(); },
  };
}

/** Diagnóstico de formulario con valores privados redactados (conservado del piloto CP04). */
async function diagnosticoFormulario(page: Page): Promise<unknown> {
  return page.locator('input:visible, select:visible, textarea:visible, mat-select:visible, [contenteditable="true"]:visible, button:visible').evaluateAll(es => {
    const privados = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'))
      .map(e => 'value' in e ? String(e.value ?? '') : e.textContent ?? '').filter(s => s.length > 2);
    const ocultar = (s: string) => privados.reduce((t, v) => t.split(v).join('[PRIVADO]'), s);
    return {
      controles: es.map(e => {
        const campo = e as HTMLInputElement;
        const esCatalogo = ['MAT-SELECT', 'SELECT'].includes(e.tagName);
        const valor = e.tagName === 'SELECT'
          ? Array.from((e as HTMLSelectElement).selectedOptions).map(o => o.textContent?.trim() ?? '').join(', ')
          : e.tagName === 'MAT-SELECT' || e.tagName === 'BUTTON'
            ? e.textContent?.trim() ?? '' : campo.value ?? e.textContent?.trim() ?? '';
        const labels = Array.from(campo.labels ?? []).map(l => l.textContent?.trim());
        const ariaLabels = (e.getAttribute('aria-labelledby') ?? '').split(' ').map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
        const v = campo.validity;
        return {
          tag: e.tagName, id: e.id, tipo: campo.type, formcontrolname: e.getAttribute('formcontrolname'),
          labels: labels.map(l => ocultar(l ?? '')), ariaLabel: ocultar(e.getAttribute('aria-label') ?? ''),
          ariaLabels: ariaLabels.map(l => ocultar(l!)), placeholder: campo.placeholder,
          required: e.hasAttribute('required'), ariaRequired: e.getAttribute('aria-required'),
          ariaInvalid: e.getAttribute('aria-invalid'), clases: e.className,
          vacio: !valor || /^(Selecciona|Seleccione)\b/.test(valor),
          valor: esCatalogo || e.tagName === 'BUTTON' ? ocultar(valor) : valor ? '[PRESENTE, PRIVADO]' : '',
          checked: ['checkbox', 'radio'].includes(campo.type) ? campo.checked : undefined,
          disabled: e.matches(':disabled') || e.getAttribute('aria-disabled') === 'true', readonly: campo.readOnly ?? e.hasAttribute('readonly'),
          validez: v ? { valid: v.valid, valueMissing: v.valueMissing, typeMismatch: v.typeMismatch, patternMismatch: v.patternMismatch,
            rangeUnderflow: v.rangeUnderflow, rangeOverflow: v.rangeOverflow, customError: v.customError } : undefined,
          validacion: ocultar(campo.validationMessage ?? ''),
        };
      }),
      mensajes: Array.from(document.querySelectorAll('mat-error, .invalid-feedback, [role="alert"]'))
        .filter(e => (e as HTMLElement).offsetWidth || (e as HTMLElement).offsetHeight)
        .map(e => ocultar(e.textContent?.trim() ?? '')),
    };
  });
}

/**
 * Ejecuta un compilado válido. try: ejecutar · catch: conservar error original · finally: si hubo
 * numeroCaso, cancelarlo (lifecycle/ledger en BizagiQaSupport). Falla si falló la ejecución o el cleanup.
 */
export async function ejecutarCasoAfi(compilado: CasoAfiCompilado, runtime: RuntimeCasoAfi): Promise<ResultadoCasoAfi> {
  const { page, testInfo } = runtime;
  const inicio = Date.now();
  const hitos = { ...HITOS_POR_DEFECTO, ...runtime.hitos };
  const nombre = compilado?.metadata?.nombre ?? 'caso';
  const prefijo = (runtime.prefijoEvidencia ?? nombre.split(/\s+/)[0]).replace(/[^\w-]+/g, '_') || 'caso';
  const etiquetaPerfil = compilado?.perfil ? (PERFILES_AFI as Record<string, { nombre: string }>)[compilado.perfil]?.nombre ?? compilado.perfil : 'actor';
  // Los JSON se reescriben progresivamente en disco, pero se adjuntan UNA vez al final (attach copia el
  // archivo en ese instante: adjuntar en cada escritura duplicaba la traza y la ejecución en el reporte).
  const adjuntables = new Map<string, { path: string; contentType: string }>();
  const json = async (archivo: string, datos: unknown) => {
    const path = testInfo.outputPath(archivo);
    await writeFile(path, JSON.stringify(datos, null, 2), 'utf8');
    if (!adjuntables.has(archivo)) adjuntables.set(archivo, { path, contentType: 'application/json' });
  };
  const adjuntarTecnicos = async () => {
    for (const [nombre, adjunto] of adjuntables) await testInfo.attach(nombre, adjunto).catch(() => undefined);
    adjuntables.clear();
  };
  // Valores sensibles del caso (resueltos y aplicados), solo en memoria: la evidencia cliente verifica que no se vean.
  const sensibles: unknown[] = [];
  const vigilar = (aplicada: AplicacionCampo) => { if (aplicada.resolucion.sensibilidad !== 'public') sensibles.push(aplicada.valorEfectivo); };
  const modoEvidencia = runtime.evidencia ?? MODO_EVIDENCIA_POR_DEFECTO;
  const evidencias = new EvidenciasAfi({
    page, testInfo, modo: modoEvidencia, prefijo,
    metadata: { hu: compilado?.metadata?.hu ?? '', caso: compilado?.metadata?.caso ?? '', nombre },
    sensibles: () => sensibles, ...runtime.opcionesEvidencia,
  });
  const planJson = (etapa: EtapaAfi, plan: PlanPreparacion) => ({
    etapa, resoluciones: plan.resoluciones.map(r => r.diagnostico()), gaps: plan.gaps.map(g => ({ campo: g.campo, motivo: g.motivo })),
  });

  let numeroCaso: string | undefined;
  let cleanup: ResultadoCasoAfi['cleanup'] = 'no aplica', reconocimiento = 'no requerido';
  let fallo: Error | undefined, falloCleanup: Error | undefined;
  let colaboradores: ColaboradoresAfi | undefined;
  const estados = new Map<string, EstadoPaso>();
  const observaciones: ResultadoObservacion[] = [];
  let actual: string | undefined;
  const preparacionPublica: Record<string, { opciones: string[]; seleccion: string }> = {};
  const hito = async (h: HitoTecnico, cuerpo: () => Promise<void>) => {
    actual = h.id;
    await test.step(h.esperado, cuerpo);
    estados.set(h.id, 'PASS');
  };

  // ---- Traza técnica y estado de etapas (solo nombres, conteos e ids públicos) ----
  const traza: EventoTecnicoAfi[] = [];
  const aplicadas = new Set<EtapaAfi>(), fallidas = new Set<EtapaAfi>();
  const autentico = esCompiladoAfi(compilado);
  const etapasPreparacion = (): EstadoEtapaPreparacion[] => !autentico ? [] : ETAPAS_RUNNER_V1.map(etapa => {
    const declarada = compilado.preparacion.orden.includes(etapa);
    const resoluciones = compilado.preparacion.etapas[etapa]?.resoluciones.length ?? 0;
    // 4S-R.1: una etapa según estado con solo gaps condicionales también debe observarse (puede exigir el DataGap en pantalla).
    const requerida = declarada && resoluciones + (compilado.preparacion.etapas[etapa]?.condicionales?.length ?? 0) > 0, aplicada = aplicadas.has(etapa);
    const resultado = !declarada ? 'no-declarada' : aplicada ? 'aplicada' : fallidas.has(etapa) ? 'fallida' : requerida ? 'pendiente' : 'no-requerida';
    return { etapa, declarada, resoluciones, requerida, aplicada, resultado };
  });
  const pendientes = () => etapasPreparacion().filter(e => e.requerida && !e.aplicada);
  const archivoTraza = `${prefijo}-traza-tecnica.json`;
  // Shadow mode (4K): el recognizer observa en puntos estables y queda en la traza; nunca decide ni falla la prueba.
  const sombra = runtime.reconocimientoPantalla === 'shadow' && autentico
    ? new ObservadorPantallaSombra(page, compilado.perfil, runtime.opcionesReconocimiento) : undefined;
  const guardarTraza = async () => {
    await json(archivoTraza, { eventos: traza, etapasPreparacion: etapasPreparacion(), ...(sombra ? { screenRecognition: sombra.traza() } : {}) });
  };
  const observarPantalla = async (punto: PuntoObservacion, esperado: () => Promise<string | null>) => {
    if (!sombra) return;
    try { await sombra.observar(punto, await esperado()); } catch { /* el diagnóstico nunca cambia la prueba */ }
    await guardarTraza().catch(() => undefined);
  };
  const evento = async (e: EventoTecnicoAfi) => {
    traza.push(e);
    try { await guardarTraza(); } catch { /* La evidencia nunca reemplaza el error original. */ }
  };
  /** Ejecuta y registra PASS/FAIL; ante fallo solo guarda el TIPO de error (el mensaje puede llevar valores). */
  const trazar = async <T>(e: Omit<EventoTecnicoAfi, 'estado'>, cuerpo: () => Promise<T>): Promise<T> => {
    try {
      const r = await cuerpo();
      await evento({ ...e, estado: 'PASS' });
      return r;
    } catch (error) {
      await evento({ ...e, estado: 'FAIL', detalle: [e.detalle, error instanceof Error ? error.name : 'Error'].filter(Boolean).join('; ') });
      throw error;
    }
  };
  /** Una etapa figura aplicada SOLO después de que su completar() termina bien. */
  const aplicarEtapa = async (etapa: EtapaAfi, completar: () => Promise<unknown>) => {
    const n = compilado.preparacion.etapas[etapa]?.resoluciones.length ?? 0;
    try {
      await trazar({ evento: 'etapa-preparacion', etapa, detalle: `${n} resolución(es)` }, completar);
    } catch (error) {
      fallidas.add(etapa);
      await guardarTraza().catch(() => undefined);
      throw error;
    }
    aplicadas.add(etapa);
    await guardarTraza().catch(() => undefined);
  };

  try {
    if (!esCompiladoAfi(compilado)) preflightCasoAfi(compilado); // Mensaje claro sin tocar el objeto.
    const { perfil, preparacion, funcional } = compilado;
    for (const etapa of preparacion.orden) {
      for (const r of preparacion.etapas[etapa]!.resoluciones) if (r.sensibilidad !== 'public' && r.valor !== undefined) sensibles.push(r.valor);
    }
    // Evidencia segura de los planes compilados (también si luego el preflight rechaza).
    for (const etapa of preparacion.orden) {
      await json(`${prefijo}-plan-${SUFIJO_EVIDENCIA[etapa as keyof typeof SUFIJO_EVIDENCIA] ?? etapa}.json`, planJson(etapa, preparacion.etapas[etapa]!));
    }
    await json(`${prefijo}-plan-funcional.json`, funcional);
    preflightCasoAfi(compilado, { permitirNoProductivos: runtime.observacion?.permitirNoProductivos });

    // ---- A partir de aquí: páginas, navegación y (posible) caso Bizagi ----
    colaboradores = await (runtime.colaboradores ?? (r => colaboradoresReales(r, compilado)))(runtime);
    const { portal, soporte, datosUi, funcionalUi } = colaboradores;
    const conFormulario = perfil !== 'empresa'; // Empresa no expone formularios de preparación en el piloto.
    const formulario = async (archivo: string) => { if (conFormulario) await json(archivo, await diagnosticoFormulario(page)); };
    const registrarEjecucion = (archivo: string) => {
      const ejecucion: unknown[] = [];
      return async (aplicada: AplicacionCampo) => { vigilar(aplicada); ejecucion.push(aplicada.diagnostico()); await json(archivo, ejecucion); };
    };
    const planDe = (etapa: EtapaPantalla) => preparacion.etapas[etapa];
    const completar: Record<EtapaPantalla, (plan: PlanPreparacion) => Promise<unknown>> = {
      'informacion-empresa': plan => {
        if (!datosUi.completarInformacionEmpresa) throw new CapabilityGapPreparacionError([{ ruta: 'preparacion.etapas.informacion-empresa', clase: 'capability', mensaje: 'Los colaboradores de esta ejecución no saben preparar la información de la empresa.' }]);
        return datosUi.completarInformacionEmpresa(plan, registrarEjecucion(`${prefijo}-ejecucion-informacion-empresa.json`),
          diagnosticos => json(`${prefijo}-estado-informacion-empresa.json`, diagnosticos),
          otros => json(`${prefijo}-otros-controles-informacion-empresa.json`, otros));
      },
      telefonos: plan => datosUi.completarTelefonos(plan, registrarEjecucion(`${prefijo}-ejecucion-telefonos.json`)),
      'informacion-adicional': plan => datosUi.completarInformacionAdicional(plan, registrarEjecucion(`${prefijo}-ejecucion-informacion-adicional.json`)),
    };
    await trazar({ evento: 'login-soporte' }, () => soporte.login());
    await hito(hitos.apertura, () => trazar({ evento: 'portal-abierto' }, () => portal.abrir()));
    await hito(hitos.preparacion, async () => {
      const ejecucionInicio: unknown[] = [];
      await aplicarEtapa('inicio-solicitud', () => datosUi.completarInicioSolicitud(preparacion.etapas['inicio-solicitud']!, async aplicada => {
        vigilar(aplicada);
        const diagnostico = aplicada.diagnostico();
        ejecucionInicio.push(diagnostico);
        await json(`${prefijo}-ejecucion-inicio.json`, ejecucionInicio);
        // Compatibilidad del reporte: solo selecciones auxiliares públicas.
        if (diagnostico.opciones) {
          preparacionPublica[diagnostico.campo] = { opciones: [...diagnostico.opciones], seleccion: String(diagnostico.valorEfectivo) };
          await json('preparacion-publica.json', preparacionPublica);
        }
      }));
      // Inicio diligenciado y estable, antes de enviarlo.
      await observarPantalla('inicio-completado', async () => 'inicio-solicitud');
      await trazar({ evento: 'caso-creado' }, () => portal.enviarUnaVez(async numero => {
        // Se registra para cleanup ANTES de cualquier aserción posterior.
        numeroCaso = numero;
        cleanup = 'pendiente';
        await soporte.registrarCasoCreado(numero, `${compilado.metadata.hu} ${compilado.metadata.nombre}`);
        await json('caso-creado.json', { numeroCaso });
      }));

      const contacto = page.getByText(CONTACTO);
      const continuar = page.locator('button:visible:not(#btn-inicio-solicitud-continuar)').filter({ hasText: /^\s*Continuar\s*$/ });
      const pantalla = contacto.or(continuar);
      let natural = true;
      try {
        await expect(pantalla.first()).toBeVisible({ timeout: 180_000 });
        reconocimiento = 'natural';
      } catch { natural = false; }
      if (natural) await evento({ evento: 'reconocimiento-natural', estado: 'PASS' });
      else {
        await trazar({ evento: 'reconocimiento-emulado' }, async () => {
          await expect(page.getByText(VERIFICANDO, { exact: true })).toBeVisible();
          reconocimiento = 'emulación solicitada';
          await soporte.emularReconocimiento();
          reconocimiento = 'emulación verificada';
          await expect(pantalla.first()).toBeVisible({ timeout: 120_000 });
        });
      }
      // Las pantallas precargadas varían por aportante; avanzar sólo por su botón único.
      // No completar silenciosamente datos obligatorios desconocidos ni reenviar el inicio.
      const botones: string[] = [];
      let transiciones = 0;
      while (!await contacto.isVisible()) {
        if (transiciones >= MAX_PANTALLAS) {
          const error = new InformacionContactoNoAlcanzadaError(transiciones, pendientes().map(e => e.etapa), botones);
          await evento({ evento: 'informacion-contacto-alcanzada', estado: 'FAIL', detalle: `${transiciones} transiciones; ${error.name}` });
          throw error;
        }
        await expect(continuar).toHaveCount(1);
        await formulario(`${etiquetaPerfil}-preparacion-${transiciones}.json`);
        for (const etapa of Object.keys(BOTON_PANTALLA) as EtapaPantalla[]) {
          const plan = planDe(etapa);
          // Solo etapas declaradas, con resoluciones y aún no aplicadas (la pantalla puede volver a observarse).
          if (!(plan?.resoluciones.length || plan?.condicionales?.length) || aplicadas.has(etapa) || !await page.locator(BOTON_PANTALLA[etapa](perfil)).isVisible()) continue;
          await aplicarEtapa(etapa, () => completar[etapa](plan));
          if (etapa === 'telefonos') await formulario(`${etiquetaPerfil}-telefonos-completos-${transiciones}.json`);
        }
        // Diagnóstico opcional y de SOLO LECTURA antes de exigir el Continuar habilitado; nunca cambia la prueba.
        if (runtime.diagnosticoAntesDeContinuar) {
          const boton = await continuar.getAttribute('id');
          let detener = false;
          try { detener = await runtime.diagnosticoAntesDeContinuar({ boton }) === 'detener'; } catch { /* solo diagnóstico */ }
          if (detener) throw new PreparacionDetenidaError(boton);
        }
        await expect(continuar).toBeEnabled();
        // Pantalla completada y estable, justo antes de su Continuar. Lo que el runner "cree": la etapa cuyo botón ve.
        await observarPantalla('antes-de-continuar', async () => {
          for (const etapa of Object.keys(BOTON_PANTALLA) as EtapaPantalla[]) if (await page.locator(BOTON_PANTALLA[etapa](perfil)).isVisible()) return etapa;
          return null;
        });
        const id = await continuar.getAttribute('id');
        expect(id, 'La transición de preparación debe identificar su botón').toBeTruthy();
        botones.push(id!);
        await trazar({ evento: 'transicion-preparacion', detalle: id! }, async () => {
          await continuar.click();
          await expect(page.locator(`[id="${id}"]`)).toBeHidden({ timeout: 45_000 });
          await expect(pantalla.first()).toBeVisible({ timeout: 60_000 });
        });
        transiciones++;
      }
      await trazar({ evento: 'informacion-contacto-alcanzada', detalle: `${transiciones} transiciones` }, () => expect(contacto).toBeVisible({ timeout: 45_000 }));
      // Punto funcional alcanzado, antes de cualquier operación del plan (sin catálogos abiertos).
      await observarPantalla('punto-funcional', async () => 'informacion-contacto');

      // Completitud: TODA etapa declarada con resoluciones debe haberse materializado antes del funcional.
      const faltan = pendientes();
      if (faltan.length) {
        for (const e of faltan) await evento({ evento: 'completitud-preparacion', estado: 'PENDIENTE', etapa: e.etapa, detalle: `${e.resoluciones} resolución(es)` });
        const error = new EtapaPreparacionNoAlcanzadaError(faltan.map(e => ({ etapa: e.etapa, resoluciones: e.resoluciones })));
        await evento({ evento: 'completitud-preparacion', estado: 'FAIL', detalle: error.name });
        throw error;
      }
      await evento({ evento: 'completitud-preparacion', estado: 'PASS', detalle: `${aplicadas.size} etapa(s) aplicada(s)` });
    });

    if (runtime.alPuntoFuncional) await runtime.alPuntoFuncional();

    // ---- Prueba funcional: exclusivamente compilado.funcional ----
    const ejecucionFuncional: Record<string, ResultadoOperacionAfi[]> = {};
    for (const paso of funcional.pasos) {
      actual = paso.id;
      let estadoPaso: EstadoPaso = 'PASS';
      await test.step(`${paso.id}: ${paso.esperado}`, async () => {
        if (paso.operaciones.length) {
          await funcionalUi.ejecutarPaso(paso, async resultado => {
            (ejecucionFuncional[paso.id] ??= []).push(resultado);
            await json(`${prefijo}-ejecucion-funcional.json`, ejecucionFuncional);
          }, evidencias.observador(paso));
        }
        // 4R.1: condiciones observables resueltas por el compilador; el caso Bizagi es SOLO el de esta corrida.
        const condiciones = compilado.observacion.condiciones.filter(c => c.paso === paso.id);
        if (!condiciones.length) return;
        const resultados = await observarCondicionesPaso({
          condiciones, modelo: runtime.observacion?.modelo ?? MODELO_APLICACION_AFI, proveedores: colaboradores!.proveedoresObservacion ?? [],
          contexto: { caso: compilado.metadata.caso, ejecucion: testInfo.testId, ...(numeroCaso ? { casoBizagi: numeroCaso } : {}) },
          reintentos: runtime.observacion?.reintentos, esperar: runtime.observacion?.esperar,
        });
        observaciones.push(...resultados);
        await json(`${prefijo}-observaciones.json`, observaciones);
        estadoPaso = veredictoPaso(resultados);
        if (estadoPaso === 'FAIL') throw new CondicionObservableFallidaError(paso.id, resultados.filter(r => r.resultado === 'FAIL').map(r => r.condicion));
      });
      estados.set(paso.id, estadoPaso);
    }
  } catch (error) {
    // Si la redacción no cambia nada se conserva el error original (y su tipo: gap de datos, capability...).
    const seguro = errorSeguro(error);
    fallo = error instanceof Error && error.message === seguro.message ? error : seguro;
    if (actual) estados.set(actual, 'FAIL');
    // Diagnóstico solo si el runner llegó a usar el navegador.
    if (colaboradores) {
      try {
        if (compilado.perfil !== 'empresa') await json(`${etiquetaPerfil}-fallo-formulario.json`, await diagnosticoFormulario(page));
        // Técnica (página completa, sin máscara): en disco siempre; adjunta solo con evidencia técnica.
        const fallo = testInfo.outputPath(`${prefijo}-fallo.png`);
        await page.screenshot({ path: fallo, fullPage: true });
        if (capturaTecnica(modoEvidencia)) adjuntables.set(`${prefijo}-fallo.png`, { path: fallo, contentType: 'image/png' });
        await json('controles-observados.json', await page.locator('input:visible, mat-select:visible, button:visible').evaluateAll(es => es.map(e => ({
          tag: e.tagName, id: e.id, campo: e.getAttribute('formcontrolname'),
          requerido: e.getAttribute('aria-required') ?? e.getAttribute('required'),
          deshabilitado: e.hasAttribute('disabled'),
          boton: e.tagName === 'BUTTON' ? e.textContent?.trim() : undefined,
        }))));
      } catch { /* Conservar error original. */ }
    }
  } finally {
    testInfo.setTimeout(Date.now() - inicio + 180_000);
    if (numeroCaso && colaboradores) {
      try { await colaboradores.soporte.cancelarCasoCreado(); cleanup = 'exitoso'; }
      catch (error) { cleanup = 'fallido'; falloCleanup = errorSeguro(error); }
      await evento({ evento: 'cleanup', estado: cleanup === 'exitoso' ? 'PASS' : 'FAIL' });
    }
  }

  const tecnicos = [hitos.apertura, hitos.preparacion];
  const funcionales = esCompiladoAfi(compilado) ? compilado.funcional.pasos : [];
  const con = (pasos: readonly HitoTecnico[]) => pasos.filter(p => estados.has(p.id)).map(p => ({ id: p.id, esperado: p.esperado, resultado: estados.get(p.id)! }));
  const resultado: ResultadoCasoAfi = {
    metadata: compilado?.metadata, perfil: compilado?.perfil, numeroCaso,
    resultado: fallo || falloCleanup ? 'FAIL' : [...estados.values()].includes('NO_OBSERVABLE') ? 'NO_OBSERVABLE' : 'PASS',
    pasosTecnicos: con(tecnicos), pasosFuncionales: con(funcionales),
    reconocimiento, cleanup, duracionSegundos: Math.round((Date.now() - inicio) / 1000),
    etapasPreparacion: etapasPreparacion(), trazaTecnica: [...traza],
    ...(sombra ? { reconocimientoPantalla: { modo: 'shadow' as const, resumen: sombra.traza().resumen } } : {}),
    ...(observaciones.length ? { observaciones: [...observaciones] } : {}),
    ...(autentico && compilado.observacion.validacion ? { observacionValidacion: true as const } : {}),
    ...(fallo ? { error: fallo.message } : {}), ...(falloCleanup ? { errorCleanup: falloCleanup.message } : {}),
  };
  const archivoResultado = `${prefijo}-resultado.json`;
  try {
    await guardarTraza().catch(() => undefined);
    // Los adjuntos técnicos del runner (este resultado incluido) cuentan en el resumen de evidencia.
    resultado.evidencia = evidencias.resumen(new Set([...adjuntables.keys(), archivoResultado]).size);
    // Compatibilidad con el reporte del piloto: pasos/esperados planos y selecciones públicas.
    await json(archivoResultado, {
      ...resultado, caso: resultado.metadata?.caso, aportante: etiquetaPerfil,
      pasos: Object.fromEntries(estados), esperados: Object.fromEntries([...tecnicos, ...funcionales].map(p => [p.id, p.esperado])),
      preparacion: preparacionPublica,
    });
  } finally {
    const tecnicosAdjuntos = [...adjuntables.keys()];
    await adjuntarTecnicos();
    // Paquete de evidencias: manifest (relacionado con el resultado) y copia del resultado. Nunca cambia el veredicto.
    await evidencias.cerrar({
      resultado: resultado.resultado, resumen: resultado.evidencia ?? evidencias.resumen(tecnicosAdjuntos.length),
      pasos: funcionales.map(p => ({ id: p.id, esperado: p.esperado, ...(estados.has(p.id) ? { resultado: estados.get(p.id)! } : {}) })),
      resultadoRuta: tecnicosAdjuntos.includes(archivoResultado) ? testInfo.outputPath(archivoResultado) : undefined,
      tecnicos: tecnicosAdjuntos,
    });
    await colaboradores?.cerrar();
  }
  if (fallo) throw fallo;
  if (falloCleanup) throw falloCleanup;
  return resultado;
}
