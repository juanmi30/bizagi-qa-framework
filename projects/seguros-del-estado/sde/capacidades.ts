import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, BrowserContext, Locator, Page, Response } from '@playwright/test';
import { LoginActions } from '../../../shared/core/LoginActions';
import { LoginObjects } from '../../../shared/baseObjects/login.objects';
import { SdeObjects } from '../baseObjects/sde.objects';
import { describir } from './datos';
import type { CampoSde, PasoSde, Verificacion } from './escenario';
import { EntornoError, type Capacidad, type ContextoEjecucion, type SalidaCapacidad, type Verificador } from './ejecutor';
import { autorizarAperturaPopup, cargarPopups, type RegistroPopups } from './popups';
import { cargarPresentacion } from './presentacion';
import {
  concederPrecreacion, exigirSoloLectura, OPERACIONES, precreacionVigente, ProteccionNoInstaladaError, protegerSoloLectura, registroDe, type RegistroSoloLectura,
} from './soloLectura';
import { aplicarReglasOrtograficas, compararConAprobado, revisarOrden } from '../../../shared/utils/ValidacionesPresentacion';
import {
  CalibracionError, NoConcluyenteError, adjuntar, botonesVisibles, campo, diligenciar, esObligatorio, esperarCarga, estaSoloLectura,
  etiqueta, hayLineaExacta, hayTextoVisible, lineasQueContienen, infoCampo, inventarioCampos, normaliza, textosVisibles, pulsar, paginaDe, rastrearAcciones, regexEtiqueta, regexExacto, teclear, textoInterno, unicoVisible, valorMostrado, type Ambito,
} from './ui';

/**
 * Capabilities UI de SDE sobre Playwright. Cada una hace UNA cosa observable y confirma su
 * post-condición. Lo que no se puede observar se declara (ver CAPACIDADES_DECLARATIVAS).
 * Un actor = un BrowserContext propio: el cambio de usuario no depende del logout del portal.
 */

export interface UiEntorno {
  browser: Browser;
  paginaInicial: Page;
  paginas: Map<string, Page>;
  contextos: BrowserContext[];
  actual?: string;
  dialogo?: Locator;                                   // pop-up abierto (edición/adición de filas)
  /** clave: identidad de negocio de la fila editada (columna «id» = data-business-key, única en la grilla; D-66). */
  tabla?: { tabla: string; fila: number | null; filasAntes: number; contenidoFila?: string[]; clave?: string };
  registrarCaso: (numero: string, actor: string) => Promise<void> | void;
  /**
   * true: SOLO LECTURA (P-15, sde/soloLectura.ts). Las capacidades de escritura se rechazan antes de ejecutarse, la guardia DOM
   * neutraliza clics y cargas en componentes que persisten datos y la red aborta las acciones de escritura verificadas.
   */
  soloLectura?: boolean;
  /** Registro por contexto protegido: acciones de red abortadas y nombres de acciones observadas (sin datos). */
  registroSoloLectura?: RegistroSoloLectura[];
  /** Registro de formularios de pop-up (por defecto data/popups-calibrados.yaml). Solo las pruebas sintéticas lo sustituyen. */
  popupsCalibrados?: RegistroPopups;
}

const DIR_PROYECTO = resolve(__dirname, '..');
/** Resolución con la que el Work Portal SDE muestra el panel de resumen del caso. */
export const VIEWPORT_SDE = { width: 1440, height: 900 };

function paginaActual(ui: UiEntorno): Page {
  const p = ui.actual ? ui.paginas.get(ui.actual) : undefined;
  if (!p) throw new Error('No hay sesión activa: el escenario debe iniciar sesión antes de este paso.');
  return p;
}
const ambitoActual = (ui: UiEntorno): Ambito => ui.dialogo ?? paginaActual(ui);

/**
 * Evidencia POSITIVA de estar en el formulario de inicio sin caso (P-15/F2). Solo se marca si el diálogo de inicio está
 * visible y es único. En solo lectura concede un permiso NUEVO ligado a ESE elemento del diálogo (token): la guardia de red y
 * la capa de capacidades lo revalidan en cada uso y caduca en cuanto el diálogo deja de estar (hallazgo A).
 */
export async function marcarFormularioInicio(page: Page, ctx: { formularioInicio?: boolean }): Promise<void> {
  if ((await page.locator(SdeObjects.dialogoInicio).filter({ visible: true }).count()) !== 1) {
    throw new Error('No hay evidencia del formulario de inicio: su diálogo no está visible (no se marca precreación).');
  }
  const registro = registroDe(page.context());
  if (registro) await concederPrecreacion(page, registro);
  ctx.formularioInicio = true;
}

/** Retira la evidencia y el permiso: a partir de aquí no se está en el formulario de inicio (red y capacidades deniegan). */
export function salirDeFormularioInicio(page: Page, ctx: { formularioInicio?: boolean }): void {
  ctx.formularioInicio = false;
  const registro = registroDe(page.context());
  if (registro) registro.estado.precreacion = null;
}

/**
 * Pulsa el botón que crea el caso y obtiene el número desde la RESPUESTA REAL de Bizagi
 * (POST /Rest/Handlers/MultiAction → action CREATENEWCASE → CaseNumber). Luego confirma que la UI
 * muestra "Caso <N>". Si Bizagi no responde CREATENEWCASE, no hay caso: falla.
 */
async function pulsarYCapturarCaso(page: Page, accion: () => Promise<void>, alCrear: (numero: string) => Promise<void>): Promise<string> {
  const respuesta = page.waitForResponse(async (r) => r.url().includes(SdeObjects.rutaAcciones) && r.request().method() === 'POST'
    && (await r.text().catch(() => '')).includes('"CREATENEWCASE"'), { timeout: 240_000 });
  await accion();
  const r = await respuesta.catch(() => { throw new Error('Bizagi no respondió CREATENEWCASE en 4 min: no hay evidencia de caso creado.'); });
  const datos = JSON.parse(await r.text()) as { result?: { action?: string; type?: string; CaseNumber?: string; messages?: string[] } }[];
  const creado = datos.map((d) => d.result).find((x) => x?.action === 'CREATENEWCASE');
  if (!creado || creado.type !== 'success' || !creado.CaseNumber) {
    const mensajes = creado?.messages?.join(' | ');
    throw new Error(`Bizagi rechazó la creación (CREATENEWCASE ${creado?.type ?? 'sin resultado'})${mensajes ? `: ${mensajes}` : ''}`);
  }
  // El caso YA existe en QA: se registra antes de cualquier otra verificación (trazabilidad aunque falle la UI).
  await alCrear(creado.CaseNumber);
  await unicoVisible(textoInterno(page, regexExacto(`Caso ${creado.CaseNumber}`)), `el resumen "Caso ${creado.CaseNumber}"`, 60_000);
  return creado.CaseNumber;
}

export interface FilaCaso { fila: Locator; actividades: string[] }
export interface EstadoCaso {
  numero: string;
  /** Actividades actuales de TODAS las filas del caso (proceso principal y subprocesos). */
  actividades: string[];
  /** Fila del proceso principal. */
  fila: Locator;
  /** Cada fila del caso: el buscador lista aparte los subprocesos con el mismo número (observado en QA 2026-10-15, caso 628). */
  filas: FilaCaso[];
}

/**
 * Busca el caso con el buscador global y devuelve sus actividades ACTUALES tal como Bizagi las lista en las filas de
 * resultados (ul.gridListWorkItems, una por work item, con su idTask). No abre ni modifica el caso.
 * Un caso con subprocesos aparece en VARIAS filas con el mismo número (p. ej. «Consultar Información de Solicitud» →
 * «Consultar SISE»): las actividades son la unión de todas y la fila principal es la del `proceso` dado. Sin `proceso`,
 * varias filas son una ambigüedad (no se elige una al azar).
 * Nota: SummaryGuid.currentState se descartó como fuente porque Bizagi lo filtra por usuario (el analista solo veía el evento).
 */
export async function buscarCaso(page: Page, numero: string, proceso?: string): Promise<EstadoCaso> {
  // Recarga real del portal en cada consulta: el buscador del SPA reutiliza resultados previos (observado en QA).
  if ((await new LoginActions(page).navegarAlPortal({ timeout: 120_000, intervalo: 4_000 })) !== 'sesion') throw new Error('La sesión expiró: el portal volvió al login.');
  await unicoVisible(page.locator(SdeObjects.bandeja), 'el menú de la bandeja', 30_000);
  await esperarCarga(page);
  const caja = await unicoVisible(page.locator(SdeObjects.buscadorCasos), 'el buscador global de casos (SdeObjects.buscadorCasos)');
  await caja.fill(numero);
  await caja.press('Enter');
  await esperarCarga(page);
  const delCaso = page.locator(SdeObjects.filaResultado)
    .filter({ has: page.locator(SdeObjects.numeroEnFila).filter({ hasText: regexExacto(numero) }) }).filter({ visible: true });
  await delCaso.first().waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => { throw new Error(`El caso ${numero} no aparece en los resultados de búsqueda.`); });
  const filas: FilaCaso[] = [];
  for (let i = 0, n = await delCaso.count(); i < n; i++) {
    const fila = delCaso.nth(i);
    filas.push({ fila, actividades: (await fila.locator(SdeObjects.actividadesEnFila).allInnerTexts()).map(normaliza).filter(Boolean) });
  }
  const principal = proceso
    ? await unicoVisible(delCaso.filter({ has: page.locator('td').filter({ hasText: regexExacto(proceso) }) }),
      `la fila del caso ${numero} del proceso "${proceso}" en los resultados de búsqueda`)
    : filas.length === 1 ? filas[0].fila : null;
  if (!principal) {
    throw new Error(`Se esperaba exactamente 1 elemento visible para la fila del caso ${numero} en los resultados de búsqueda; hay ${filas.length} ` +
      '(proceso y subprocesos). Ambigüedad: no se elige uno al azar; indica el proceso principal.');
  }
  const actividades = [...new Set(filas.flatMap((f) => f.actividades))];
  return { numero, actividades, fila: principal, filas };
}

const describirEstados = (e: EstadoCaso) => e.actividades.join(' | ') || '—';

/**
 * Extracción del Worker AI frente a la narrativa (corrección F1 de Work, PR #7). Por columna: cada valor esperado debe aparecer
 * y ningún valor no vacío ajeno a la narrativa puede aparecer (sería un valor que el Worker no pudo extraer de ella). Las
 * repeticiones se informan sin fallar: la granularidad de filas no está confirmada por QA. Sin valores esperados suficientes
 * (columna sin valores o valor que no se pudo resolver) no concluye: NOT_AUTOMATED, nunca PASS.
 */
export function evaluarExtraccion(observados: Record<string, string[]>, esperados: Record<string, string[]>, filas: number): { estado: 'PASS' | 'FAIL' | 'NOT_AUTOMATED'; detalle: string } {
  const columnas = Object.keys(esperados);
  const insuficientes = columnas.filter((c) => esperados[c].length === 0 || esperados[c].some((v) => !normaliza(v)));
  if (columnas.length === 0 || insuficientes.length) {
    return { estado: 'NOT_AUTOMATED', detalle: `expectativa de extracción insuficiente${insuficientes.length ? ` (${insuficientes.join(', ')})` : ''}: no se puede concluir; queda pendiente` };
  }
  const partes: string[] = [];
  let ok = true;
  for (const col of columnas) {
    const obs = (observados[col] ?? []).map(normaliza).filter(Boolean);
    const esp = esperados[col].map(normaliza);
    const faltan = esp.filter((v) => !obs.includes(v));
    const inesperados = [...new Set(obs.filter((v) => !esp.includes(v)))];
    const repetidos = [...new Set(obs.filter((v, i) => obs.indexOf(v) !== i))];
    if (faltan.length || inesperados.length) ok = false;
    partes.push(`${col}: ${esp.length - faltan.length} de ${esp.length} esperados extraídos` +
      `${faltan.length ? `; FALTAN ${faltan.join(', ')}` : ''}${inesperados.length ? `; INESPERADOS ${inesperados.join(', ')}` : ''}` +
      `${repetidos.length ? `; repetidos ${repetidos.join(', ')}` : ''}`);
  }
  return { estado: ok ? 'PASS' : 'FAIL', detalle: `${filas} fila(s) verificadas · ${partes.join(' | ')}` };
}

/**
 * «Impide registrar» (corrección F2 de Work, PR #7). La visibilidad del pop-up NO es evidencia: decide lo que muestra una lectura
 * INDEPENDIENTE de la fila (formulario renderizado de nuevo por el servidor en otra pestaña), hecha ANTES de restaurar.
 * - persistido = valor rechazado → FAIL (se quede abierto o se cierre el pop-up);
 * - persistido null (no se pudo leer) → NOT_AUTOMATED: no concluyente, nunca PASS;
 * - si tras restaurar un valor válido «Guardar» no cierra (P-21a), es un INCIDENTE SEPARADO, no una advertencia del PASS.
 */
export interface ObservacionNoRegistra { rechazado: string; persistido: string | null; popupAbierto: boolean; recuperacion: 'no_requerida' | 'cerro' | 'no_cerro' }
export function evaluarNoRegistra(o: ObservacionNoRegistra): { estado: 'PASS' | 'FAIL' | 'NOT_AUTOMATED'; detalle: string; incidente?: string } {
  const rechazado = normaliza(o.rechazado);
  const comportamiento = o.popupAbierto ? 'el pop-up quedó abierto tras «Guardar»' : 'el pop-up se cerró tras «Guardar»';
  const incidente = o.recuperacion === 'no_cerro'
    ? 'P-21a: tras restaurar un valor válido, «Guardar» no cerró el pop-up; queda abierto y el caso puede quedar inutilizable (BUG-03).'
    : undefined;
  const recuperacion = o.recuperacion === 'cerro' ? '; se restauró un valor válido y «Guardar» cerró el pop-up' : '';
  if (o.persistido === null) {
    return { estado: 'NOT_AUTOMATED', detalle: `${comportamiento}, pero la persistencia de «${rechazado}» NO se pudo verificar (lectura independiente sin identidad fiable del registro; calibración pendiente): no concluyente${recuperacion}.`, incidente };
  }
  const persistido = normaliza(o.persistido);
  if (persistido === rechazado) return { estado: 'FAIL', detalle: `${comportamiento} y quedó registrado «${rechazado}» (lectura independiente de la fila): debía impedirse${recuperacion}.`, incidente };
  return { estado: 'PASS', detalle: `No registra «${rechazado}»: ${comportamiento} y la lectura independiente de la fila muestra «${persistido || '(vacío)'}»${recuperacion}.`, incidente };
}

/**
 * Barrera B (PR #7): NO hay una identidad estable de las filas de pólizas acreditada en la evidencia conservada.
 * La posición, el contenido y un data-key sintético no identifican el registro. Hasta calibrar la vinculación
 * radicación/instancia/registro ANTES de editar y reencontrarla de forma única en una lectura nueva del servidor,
 * esta lectura no es verificable. No se abre otra pestaña para leer una fila por posición.
 * Se conserva la firma para los consumidores; fila solo describe la selección original, nunca es identidad.
 */
export async function leerCeldaPersistida(page: Page, numero: string, proceso: string | undefined, actividad: string, tabla: string, clave: string | undefined, columna: string): Promise<string | null> {
  // D-66 (2026-10-20, caso 702): la columna «id» = data-business-key = rows[i][0] de Render es estable al recargar. Sin clave
  // acreditada al abrir la fila, no hay lectura. Se busca EXACTAMENTE una fila con esa clave (nunca por posición).
  if (!clave) return null;
  const otra = await page.context().newPage();
  try {
    const e = await buscarCaso(otra, numero, proceso);
    const conActividad = e.filas.filter((f) => f.actividades.includes(normaliza(actividad)));
    if (conActividad.length !== 1) return null;
    await (await unicoVisible(conActividad[0].fila.locator(SdeObjects.actividadesEnFila).filter({ hasText: regexExacto(normaliza(actividad)) }), `la actividad "${actividad}"`)).click();
    await unicoVisible(otra.locator(SdeObjects.areaBotones), `el formulario de "${actividad}"`, 60_000);
    await esperarCarga(otra);
    return await celdaPorClave(otra, tabla, clave, columna);
  } catch {
    return null;
  } finally {
    await otra.close().catch(() => undefined);
  }
}

/** Celda de la ÚNICA fila con esa clave de negocio (data-business-key y columna «id» coinciden); null si falta, se repite o no cuadra. */
export async function celdaPorClave(ambito: Ambito, tabla: string, clave: string, columna: string): Promise<string | null> {
  const { cont, columnas } = await contenedorTabla(ambito, tabla);
  const filas = cont.locator(`tr[data-business-key="${clave.replace(/"/g, '')}"]`).filter({ visible: true });
  if ((await filas.count()) !== 1) return null;
  const celdas = (await filas.first().locator('td').allInnerTexts()).map(normaliza);
  const iId = columnas.indexOf('id');
  const idx = columnas.indexOf(normaliza(columna));
  if (iId < 0 || idx < 0 || celdas[iId] !== clave) return null;
  return celdas[idx] ?? '';
}

/**
 * Nodo del diagrama de la «Consulta Gráfica»: `id` = GUID del elemento del modelo (atributo id del hotspot), tipos BPMN de Bizagi
 * (p. ej. aiworkertask, exclusivegateway) y si el dibujo de la ruta ya lo marcó.
 */
export interface NodoGrafico { id?: string; nombre: string; tipos: string[]; recorrido: boolean; actual: boolean }
export interface RecorridoEsperado { recorrido?: string[]; no_recorrido?: string[]; recorrido_tipo?: string[]; no_recorrido_tipo?: string[] }
/**
 * Lectura de la ruta de una instancia. Dos fuentes (sonda de solo lectura del 2026-10-19 sobre 654, 670 y 671):
 * - `registro`: GUIDs de origen y destino de TODAS las transiciones del caso (GET /Rest/Cases/TransitionLog, que el portal pide al
 *   pulsar «Ruta» y del que dibuja la animación). Es la ruta completa; null si no se capturó o no corresponde al caso.
 * - `nodos[].recorrido`: lo que el dibujo marcó. La animación es un temporizador (~215 ms por elemento, sin animaciones CSS/jQuery ni
 *   cambio del botón): el DOM no ofrece señal de fin. El dibujo terminó cuando todos los nodos del registro están marcados.
 * `identidadServidor`: currentCase.radicationNumber de GET /Rest/Cases/WorkitemsGuid (al abrir el diálogo).
 */
export interface LecturaRecorrido {
  numero: string; encabezado: string; identidadServidor?: string | null; nodos: NodoGrafico[]; registro?: string[] | null;
  idCasoServidor?: string | null; idCasoConsulta?: string | null;
  idFlujoCaso?: string | null; idFlujoRegistro?: string | null;
}

/**
 * Evalúa la ruta REAL de una instancia (confirmación de QA, 2026-10-19: la visualización gráfica es evidencia válida del recorrido).
 * Corrección F3 de Work (PR #7): la estabilidad del dibujo NO prueba que terminó. Se distinguen:
 * - ruta positiva observada (lo exigido aparece recorrido) → PASS de la parte positiva;
 * - negativa probada con evidencia completa (registro del servidor + dibujo que lo refleja entero, sin contradicciones) → PASS;
 * - todavía dibujando (el registro tiene nodos aún sin marcar) → NOT_AUTOMATED para lo que dependa de ellos;
 * - finalización incierta (sin registro) → una aserción negativa NUNCA es PASS: revisión humana con la evidencia visual;
 * - contradicción funcional (un nodo prohibido aparece recorrido en cualquier fuente, o uno exigido falta con evidencia completa) → FAIL.
 * Fuentes que no coinciden (el dibujo marca algo que el registro no tiene) → NOT_AUTOMATED (revisión humana).
 */
export function evaluarRecorrido(caso: LecturaRecorrido, e: RecorridoEsperado): { estado: 'PASS' | 'FAIL' | 'NOT_AUTOMATED'; detalle: string } {
  if (normaliza(caso.encabezado) !== normaliza(caso.numero)) {
    throw new NoConcluyenteError(`La «Consulta Gráfica» abierta corresponde al caso ${caso.encabezado || '—'}, no al ${caso.numero}: no se evalúa.`);
  }
  if (caso.identidadServidor != null && normaliza(caso.identidadServidor) !== normaliza(caso.numero)) {
    throw new NoConcluyenteError(`La «Consulta Gráfica» abierta corresponde al caso ${caso.identidadServidor} según el servidor, no al ${caso.numero}: no se evalúa.`);
  }
  const identidadCompleta = [caso.identidadServidor, caso.idCasoServidor, caso.idCasoConsulta, caso.idFlujoCaso, caso.idFlujoRegistro]
    .every((v) => typeof v === 'string' && v.trim().length > 0);
  if ((caso.idCasoServidor && caso.idCasoConsulta && caso.idCasoServidor !== caso.idCasoConsulta) ||
      (caso.idFlujoCaso && caso.idFlujoRegistro && caso.idFlujoCaso !== caso.idFlujoRegistro)) {
    throw new NoConcluyenteError('Identidad contradictoria entre la instancia de la Consulta Gráfica y el registro de transiciones.');
  }
  if (((e.no_recorrido?.length ?? 0) + (e.no_recorrido_tipo?.length ?? 0) > 0) && !identidadCompleta) {
    return { estado: 'NOT_AUTOMATED', detalle: 'Identidad incompleta: no se acredita radicación, instancia y registro de transiciones; la negativa no se da por probada.' };
  }
  const registro = caso.registro ? new Set(caso.registro) : null;
  const enRegistro = (n: NodoGrafico) => !!registro && !!n.id && registro.has(n.id);
  const recorrido = (n: NodoGrafico) => n.recorrido || enRegistro(n);
  const recorridos = caso.nodos.filter(recorrido);
  const nombres = (l: NodoGrafico[]) => l.map((n) => `${n.nombre || '(sin nombre)'} [${n.tipos.join(' ')}]${n.actual ? ' (actual)' : ''}`).join(' → ');
  const enModelo = (nombre: string) => caso.nodos.some((n) => normaliza(n.nombre) === normaliza(nombre));
  const pasa = (nombre: string) => recorridos.some((n) => normaliza(n.nombre) === normaliza(nombre));
  const faltaModelo = [...(e.recorrido ?? []), ...(e.no_recorrido ?? [])].filter((x) => !enModelo(x));
  if (faltaModelo.length) throw new Error(`[calibrar recorrido] el diagrama no contiene ${faltaModelo.map((x) => `"${x}"`).join(', ')} (nombres del modelo: ${[...new Set(caso.nodos.map((n) => n.nombre).filter(Boolean))].join(', ')}).`);
  const sinMarcar = registro ? caso.nodos.filter((n) => enRegistro(n) && !n.recorrido) : [];
  const ajenos = registro ? caso.nodos.filter((n) => n.recorrido && n.id && !registro.has(n.id)) : [];
  // Issue #8: recorrer solo los nodos presentes pierde los GUID del registro que el dibujo aún NO representa.
  // La evidencia conservada acredita id de hotspot = guidTaskFrom/guidTaskTo; no acredita excepciones técnicas.
  const porId = new Map<string, NodoGrafico[]>();
  for (const n of caso.nodos) {
    if (n.id) porId.set(n.id, [...(porId.get(n.id) ?? []), n]);
  }
  const noRepresentados = registro ? [...registro].filter((id) => !porId.has(id)) : [];
  const relevantes = new Set([...(registro ?? []), ...caso.nodos.filter((n) => n.recorrido && n.id).map((n) => n.id!)]);
  const duplicados = [...relevantes].filter((id) => (porId.get(id)?.length ?? 0) > 1);
  const sinIdentidad = caso.nodos.filter((n) => n.recorrido && !n.id?.trim());
  const evidenciaCompleta = identidadCompleta && !!registro && registro.size > 0 && sinMarcar.length === 0 && ajenos.length === 0 &&
    noRepresentados.length === 0 && duplicados.length === 0 && sinIdentidad.length === 0;
  const base = `Caso ${caso.numero}, recorrido (${registro ? `registro del servidor: ${registro.size} elementos; ` : 'SIN registro del servidor; '}dibujo: ${caso.nodos.filter((n) => n.recorrido).length} nodos marcados): ${nombres(recorridos) || '—'}`;
  // Contradicción funcional: lo prohibido recorrido (en cualquier fuente) es FAIL; lo exigido ausente solo con evidencia completa.
  const prohibidos = [
    ...(e.no_recorrido ?? []).filter((x) => pasa(x)).map((x) => `"${x}" fue recorrido (ruta NO esperada)`),
    ...(e.no_recorrido_tipo ?? []).filter((t) => recorridos.some((n) => n.tipos.includes(t))).map((t) => `se recorrió un nodo de tipo ${t} (ruta NO esperada)`),
  ];
  const faltantes = [
    ...(e.recorrido ?? []).filter((x) => !pasa(x)).map((x) => `"${x}" está en el modelo pero NO fue recorrido`),
    ...(e.recorrido_tipo ?? []).filter((t) => !recorridos.some((n) => n.tipos.includes(t))).map((t) => `ningún nodo de tipo ${t} fue recorrido`),
  ];
  // Precedencia (auditoría del PR #9): un nodo prohibido con GUID ÚNICO cuya ejecución DEMUESTRA el registro de transiciones de
  // la instancia es FAIL aunque OTRA parte del recorrido sea ambigua. Decisión de Juan Miguel (20/10): si solo el dibujo lo marca
  // y el registro no demuestra su ejecución, la evidencia es contradictoria → inconcluso (el dibujo se genera desde ese registro).
  // Si la ambigüedad toca al propio nodo prohibido (GUID duplicado o sin GUID), inconcluso. Un nodo solo del modelo nunca es FAIL.
  const esProhibido = (n: NodoGrafico) => (e.no_recorrido ?? []).some((x) => normaliza(x) === normaliza(n.nombre)) ||
    (e.no_recorrido_tipo ?? []).some((t) => n.tipos.includes(t));
  const demostrados = caso.nodos.filter((n) => esProhibido(n) && !!n.id?.trim() && porId.get(n.id!)?.length === 1 &&
    !!registro?.has(n.id!));
  if (demostrados.length) return { estado: 'FAIL', detalle: `${base}. Actividad prohibida recorrida con identidad inequívoca: ${nombres(demostrados)}; ${prohibidos.join('; ')}.` };
  // Un GUID ambiguo no permite inferir qué actividad recorrió el registro.
  if (duplicados.length || sinIdentidad.length) return { estado: 'NOT_AUTOMATED', detalle: `${base}. Correspondencia ambigua: ${duplicados.length} GUID duplicado(s) relevantes y ${sinIdentidad.length} nodo(s) marcado(s) sin GUID; revisión humana.` };
  if (prohibidos.length) return { estado: 'NOT_AUTOMATED', detalle: `${base}. Indicio de actividad prohibida sin ejecución inequívoca (${prohibidos.join('; ')}); revisión humana.` };
  if (faltantes.length && evidenciaCompleta) return { estado: 'FAIL', detalle: `${base}. ${faltantes.join('; ')}.` };
  if (noRepresentados.length) return { estado: 'NOT_AUTOMATED', detalle: `${base}. Registro no reconciliado: ${noRepresentados.length} GUID ejecutado(s) sin representación en el dibujo; no se acredita la ruta completa ni su ausencia; revisión humana.` };
  if (ajenos.length) return { estado: 'NOT_AUTOMATED', detalle: `${base}. Las fuentes no coinciden: el dibujo marca ${nombres(ajenos)} y el registro no; revisión humana.` };
  const negativas = (e.no_recorrido?.length ?? 0) + (e.no_recorrido_tipo?.length ?? 0) > 0;
  if (!faltantes.length && !negativas) {
    if (recorridos.length === 0) return { estado: 'NOT_AUTOMATED', detalle: `${base}. Sin nodos recorridos: evidencia insuficiente, queda para revisión humana.` };
    return { estado: 'PASS', detalle: `${base}. Ruta positiva observada: coincide con lo esperado.` };
  }
  if (!registro || registro.size === 0) {
    return { estado: 'NOT_AUTOMATED', detalle: `${base}. Finalización INCIERTA (sin registro de transiciones del servidor): ${negativas ? 'una aserción negativa no se da por probada' : faltantes.join('; ')}; revisión humana con la evidencia visual.` };
  }
  if (sinMarcar.length) return { estado: 'NOT_AUTOMATED', detalle: `${base}. El dibujo NO terminó (faltan por marcar ${nombres(sinMarcar)}): ${faltantes.length ? faltantes.join('; ') : 'la negativa no se da por probada'}; revisión humana.` };
  if (!identidadCompleta) return { estado: 'NOT_AUTOMATED', detalle: `${base}. Identidad incompleta: no se acredita la completitud de la instancia; revisión humana.` };
  return { estado: 'PASS', detalle: `${base}. Evidencia completa (registro del servidor y dibujo coinciden): coincide con lo esperado.` };
}

/**
 * Abre la «Consulta Gráfica» del caso desde su fila del buscador, pulsa «Ruta» y lee las dos fuentes (solo lectura): el registro
 * de transiciones del servidor y el dibujo. Espera a que el dibujo marque todos los nodos del registro (señal de fin real); si no
 * llega en el límite, devuelve lo leído y evaluarRecorrido lo trata como «todavía dibujando».
 */
export async function leerRecorridoGrafico(page: Page, numero: string, proceso?: string): Promise<LecturaRecorrido> {
  const e = await buscarCaso(page, numero, proceso);
  const respuestaCaso = page.waitForResponse((r) => r.url().includes(SdeObjects.rutaCasoGrafico) && r.status() === 200, { timeout: 30_000 }).catch(() => null);
  await (await unicoVisible(e.fila.locator(SdeObjects.iconoConsultaGrafica), `el ícono «Ver Consulta Gráfica» del caso ${numero}`)).click();
  const dialogo = await unicoVisible(page.locator(SdeObjects.dialogoConsultaGrafica), 'el diálogo «Consulta Gráfica»', 30_000);
  await dialogo.locator(SdeObjects.nodoGrafico).first().waitFor({ state: 'attached', timeout: 30_000 });
  const caso = await respuestaCaso;
  const actual = caso ? ((await caso.json().catch(() => ({}))) as { currentCase?: { idCase?: number | string; radicationNumber?: string } }).currentCase : undefined;
  const identidadServidor = actual?.radicationNumber != null ? String(actual.radicationNumber) : null;
  const idCasoServidor = actual?.idCase != null ? String(actual.idCase) : null;
  const consultaCaso = caso ? new URL(caso.url()).searchParams : null;
  const idFlujoCaso = consultaCaso?.get('idWorkFlow') ?? null;
  if (idCasoServidor && consultaCaso?.get('idCase') !== idCasoServidor) {
    throw new NoConcluyenteError('La respuesta de identidad no corresponde a la instancia solicitada por la Consulta Gráfica.');
  }
  let idCasoConsulta: string | null = null;
  let idFlujoRegistro: string | null = null;
  const ruta = dialogo.getByText('Ruta', { exact: true }).filter({ visible: true });
  let registro: string[] | null = null;
  if ((await ruta.count()) === 1) {
    const respuestaRuta = page.waitForResponse((r) => r.url().includes(SdeObjects.rutaTransicionesCaso) && r.status() === 200, { timeout: 30_000 }).catch(() => null);
    await ruta.click();
    const tl = await respuestaRuta;
    idCasoConsulta = tl ? new URL(tl.url()).searchParams.get('idCase') : null;
    idFlujoRegistro = tl ? new URL(tl.url()).searchParams.get('idWorkFlow') : null;
    // Solo cuenta si el registro es del MISMO caso que identificó el servidor (idCase de la consulta = currentCase.idCase).
    if (tl && actual?.idCase != null && new URL(tl.url()).searchParams.get('idCase') === String(actual.idCase)) {
      const transiciones = (await tl.json().catch(() => null)) as { guidTaskFrom?: string; guidTaskTo?: string }[] | null;
      // Formato REAL (sonda de solo lectura del 2026-10-20, caso 671): cada transición llega en DOS registros, uno con solo
      // guidTaskTo (guidTaskFrom = "") y otro con solo guidTaskFrom (guidTaskTo = ""). Un registro es válido si ambos campos
      // son texto y al menos uno trae GUID; sin ningún GUID o con tipos distintos es malformado y no hay registro.
      const guid = (v: unknown) => (typeof v === 'string' ? v.trim() : null);
      if (Array.isArray(transiciones) && transiciones.length > 0 && transiciones.every((t) =>
        t && guid(t.guidTaskFrom) !== null && guid(t.guidTaskTo) !== null && !!(guid(t.guidTaskFrom) || guid(t.guidTaskTo)))) {
        registro = [...new Set(transiciones.flatMap((t) => [guid(t.guidTaskFrom)!, guid(t.guidTaskTo)!]).filter(Boolean))];
      }
    }
    if (registro?.length) {
      // Cada GUID ejecutado debe identificar UN hotspot marcado dentro de ESTE diálogo, no en toda la página.
      // Se itera el registro completo: filtrar primero el DOM permitía éxito vacuo ante GUID ausentes (Issue #8).
      const raiz = await dialogo.elementHandle();
      try {
        await page.waitForFunction(({ raiz, sel, ids }) => {
          if (!raiz?.isConnected) return false;
          const nodos = [...raiz.querySelectorAll(sel)];
          return ids.every((id) => {
            const correspondientes = nodos.filter((el) => el.id === id);
            return correspondientes.length === 1 && correspondientes[0].classList.contains('processviewer-highlighted');
          });
        }, { raiz, sel: SdeObjects.nodoGrafico, ids: registro }, { timeout: 60_000, polling: 250 }).catch(() => undefined);
      } finally {
        await raiz?.dispose();
      }
    }
  }
  // Encabezado «Caso:» (encabezado de fila) seguido de su valor (caso 654, 2026-10-19).
  const encabezado = await dialogo.getByRole('rowheader', { name: 'Caso:', exact: true }).first().locator('xpath=following-sibling::*[1]').innerText({ timeout: 10_000 }).catch(() => '');
  const nodos = await dialogo.locator(SdeObjects.nodoGrafico).evaluateAll((els) => els.map((el) => {
    const clases = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    return {
      id: el.id || undefined,
      nombre: (el.textContent ?? '').replace(/\s+/g, ' ').replace(/^\d+(?=\S)/, '').trim(),
      tipos: clases.filter((c) => !c.startsWith('processviewer-')),
      recorrido: clases.includes('processviewer-highlighted'),
      actual: clases.includes('processviewer-shape-selected'),
    };
  }));
  return { numero, encabezado: encabezado.trim(), identidadServidor, idCasoServidor, idCasoConsulta, idFlujoCaso, idFlujoRegistro, nodos, registro };
}

/** Bloqueo de asignación (permiso, disponibilidad o ambigüedad): BLOCKED con causa ASIGNACION, nunca defecto del producto. */
export class AsignacionError extends Error {
  constructor(mensaje: string) { super(`ASIGNACIÓN: ${mensaje}`); this.name = 'AsignacionError'; }
}

/** Work item de una actividad tal como lo entrega Administrar Casos (respuesta de SearchCases del propio portal). */
export interface TareaAdmin { idWorkItem: string; taskName: string; assignee?: string }

/** Admin → Administración de procesos → Casos desde una carga limpia del portal. Devuelve el diálogo «Casos». */
export async function abrirAdministracionCasos(page: Page): Promise<Locator> {
  if ((await new LoginActions(page).navegarAlPortal({ timeout: 120_000, intervalo: 4_000 })) !== 'sesion') throw new Error('La sesión expiró: el portal volvió al login.');
  const adminProcesos = page.getByText('Administración de procesos', { exact: false }).filter({ visible: true }).first();
  // El menú puede no desplegarse al primer clic mientras el portal termina de cargar (calibración del 2026-10-19).
  for (let i = 0; i < 4 && !(await adminProcesos.isVisible().catch(() => false)); i++) {
    const menu = page.locator(SdeObjects.menuAdmin).filter({ visible: true });
    if ((await menu.count()) === 0) throw new AsignacionError('el usuario no tiene el menú Admin (sin permiso de administrar casos).');
    await menu.click();
    await esperarCarga(page);
    await page.waitForTimeout(1_500);
  }
  await adminProcesos.click();
  await esperarCarga(page);
  await page.locator(SdeObjects.adminCategorias).getByText('Casos', { exact: true }).filter({ visible: true }).first().click();
  await esperarCarga(page);
  const dialogo = page.getByRole('dialog', { name: 'Casos', exact: true });
  await dialogo.locator(SdeObjects.adminCasoNumero).waitFor({ state: 'visible', timeout: 30_000 });
  return dialogo;
}

/**
 * Consulta en Administrar Casos los work items del caso EXACTO (proceso principal, no subprocesos) usando la respuesta de
 * SearchCases que el propio portal pide al buscar. Solo consulta. Más de un caso con ese número = ambigüedad.
 */
export async function consultarTareasAdmin(page: Page, dialogo: Locator, numero: string): Promise<TareaAdmin[]> {
  await dialogo.locator(SdeObjects.adminCasoNumero).fill(numero);
  const respuesta = page.waitForResponse((r) => r.url().includes(SdeObjects.rutaBusquedaAdmin), { timeout: 30_000 });
  await dialogo.locator(SdeObjects.adminCasoBuscar).click();
  const cuerpo = await (await respuesta).json() as { rows?: { radNumber?: string; isSubprocess?: boolean; data?: unknown[] }[] };
  await esperarCarga(page);
  const filas = (cuerpo.rows ?? []).filter((r) => String(r.radNumber) === numero && !r.isSubprocess);
  if (filas.length > 1) throw new AsignacionError(`el caso ${numero} aparece ${filas.length} veces en Administrar Casos: ambigüedad, no se modifica nada.`);
  if (filas.length === 0) return [];
  const tareas = (filas[0].data ?? []).find((d) => Array.isArray(d) && d.some((x) => typeof x === 'object' && x !== null && 'taskName' in x)) as TareaAdmin[] | undefined;
  return (tareas ?? []).map((t) => ({ idWorkItem: String(t.idWorkItem), taskName: normaliza(t.taskName), assignee: t.assignee }));
}

/** Parte de usuario de un «dominio\\usuario» (comparación sin mayúsculas). */
const usuarioDe = (asignado: string | undefined) => (asignado ?? '').split('\\').pop()!.trim().toLowerCase();

/**
 * Asegura que la actividad del caso quede asignada al usuario objetivo (confirmación de QA, 2026-10-19: Bizagi asigna
 * «Estructurar información» por carga y QA autoriza reasignarla al analista de pruebas). Si ya está asignada, no toca nada.
 * Si es de otro usuario, usa SOLO el mecanismo del portal (Administrar Casos → Reasignar) y verifica la persistencia
 * volviendo a consultar. No informa nombres de terceros.
 */
export async function asegurarAsignacionActividad(
  page: Page, numero: string, actividad: string, objetivo: string,
  // `calibrarMecanismo`: SOLO calibración (tests/asignacion-recorrido.real.spec.ts): recorre la reasignación aunque ya sea del
  // usuario de pruebas (mismo destino: sin efecto funcional). Las verticales nunca lo usan.
  o: { maximoMs?: number; intervaloMs?: number; calibrarMecanismo?: boolean } = {},
): Promise<{ reasignada: boolean; detalle: string }> {
  const meta = objetivo.trim().toLowerCase();
  if (!meta) throw new AsignacionError('no hay usuario objetivo configurado para el actor.');
  const nombre = normaliza(actividad);
  const limite = Date.now() + (o.maximoMs ?? 5 * 60_000);
  let tarea: TareaAdmin | undefined;
  let dialogo: Locator;
  for (;;) {
    dialogo = await abrirAdministracionCasos(page);
    const tareas = (await consultarTareasAdmin(page, dialogo, numero)).filter((t) => t.taskName === nombre);
    if (tareas.length > 1) throw new AsignacionError(`la actividad "${actividad}" tiene ${tareas.length} work items en el caso ${numero}: ambigüedad, no se modifica nada.`);
    tarea = tareas[0];
    if (tarea) break;
    if (Date.now() > limite) throw new AsignacionError(`la actividad "${actividad}" no está disponible en el caso ${numero} (Administrar Casos) dentro del límite.`);
    await page.waitForTimeout(o.intervaloMs ?? 20_000);
  }
  if (usuarioDe(tarea.assignee) === meta && !o.calibrarMecanismo) return { reasignada: false, detalle: `"${actividad}" del caso ${numero} ya está asignada al usuario de pruebas: sin reasignación.` };
  const previa = usuarioDe(tarea.assignee) === meta ? 'ya era del usuario de pruebas (calibración del mecanismo hacia el mismo usuario)' : 'estaba asignada a otro usuario';
  // Reasignación: casilla EXACTA del work item, botón Reasignar, usuario objetivo y su botón de fila.
  const casilla = dialogo.locator(`${SdeObjects.adminWorkItem}[value^="${numero}|${tarea.idWorkItem}|"]`);
  if ((await casilla.count()) !== 1) throw new AsignacionError(`no se encontró la casilla única del work item de "${actividad}" (caso ${numero}).`);
  await casilla.check();
  await dialogo.locator(SdeObjects.adminReasignar).click();
  const campoUsuario = dialogo.locator(SdeObjects.adminUsuarioReasignar);
  await campoUsuario.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => { throw new AsignacionError('el portal no ofreció la reasignación (sin permiso o sin formulario de usuario).'); });
  await campoUsuario.fill(objetivo.trim());
  await dialogo.locator(SdeObjects.adminBuscarUsuario).click();
  await esperarCarga(page);
  // El botón «Reasignar» de cada fila lleva el Nombre Usuario en su atributo name (caso 668, 2026-10-19); sin mayúsculas.
  const botonUsuario = dialogo.locator(`button[name="${objetivo.trim().replace(/"/g, '')}" i]`).filter({ hasText: /^\s*Reasignar\s*$/ });
  await botonUsuario.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  if ((await botonUsuario.count()) !== 1) throw new AsignacionError(`el usuario de pruebas no aparece una sola vez como asignable (${await botonUsuario.count()} coincidencias).`);
  await botonUsuario.click();
  await esperarCarga(page);
  // Verificación (corrección F4 de Work, PR #7): la reasignación solo cuenta si, al volver a consultar, la actividad tiene UN
  // SOLO work item, es el MISMO (idWorkItem original) y está asignado al usuario objetivo. Nunca se toma el primero que coincida.
  for (const fin = Date.now() + (o.maximoMs ?? 60_000); ;) {
    const d = await abrirAdministracionCasos(page);
    const coinciden = (await consultarTareasAdmin(page, d, numero)).filter((t) => t.taskName === nombre);
    if (coinciden.length > 1) throw new AsignacionError(`tras reasignar, "${actividad}" tiene ${coinciden.length} work items en el caso ${numero}: ambigüedad, no se da por reasignada.`);
    const ahora = coinciden[0];
    if (ahora && ahora.idWorkItem !== tarea.idWorkItem) {
      throw new AsignacionError(`tras reasignar, el work item de "${actividad}" (caso ${numero}) ya no es el original (${tarea.idWorkItem} → ${ahora.idWorkItem}): no se da por reasignada.`);
    }
    if (ahora && usuarioDe(ahora.assignee) === meta) return { reasignada: true, detalle: `"${actividad}" del caso ${numero} ${previa}; se reasignó al usuario de pruebas y la consulta posterior confirma el MISMO work item (${tarea.idWorkItem}), único y asignado al usuario de pruebas.` };
    if (Date.now() > fin) throw new Error(`La reasignación de "${actividad}" (caso ${numero}) no persistió: la consulta posterior no la muestra asignada al usuario de pruebas.`);
    await page.waitForTimeout(o.intervaloMs ?? 5_000);
  }
}

async function contenedorTabla(ambito: Ambito, tabla: string): Promise<{ cont: Locator; columnas: string[]; filas: Locator }> {
  // Grilla Bizagi (bzg-form-grid) por su título exacto; si el portal no la usa, contenedor de campo por etiqueta.
  const page = paginaDe(ambito);
  const grillas = ambito.locator(SdeObjects.grilla).filter({ visible: true })
    .filter({ has: page.locator(SdeObjects.grillaTitulo).filter({ hasText: regexExacto(tabla) }) });
  const cont = (await grillas.count()) > 0 ? await unicoVisible(grillas, `la grilla "${tabla}"`) : await campo(ambito, tabla);
  // Se conservan las cabeceras vacías (columna de selección o de acciones): el índice debe alinear con las celdas td.
  const columnas = (await cont.locator('th, [role="columnheader"]').allInnerTexts()).map(normaliza);
  return { cont, columnas, filas: cont.locator(SdeObjects.filaDatos).filter({ visible: true }) };
}

/** Textos normalizados de las celdas de la fila i (1..n) de una grilla por su título (calibración UI-10: antes y después de guardar). */
export async function celdasDeFila(ambito: Ambito, tabla: string, i: number): Promise<string[] | null> {
  const { filas } = await contenedorTabla(ambito, tabla);
  if (i < 1 || i > (await filas.count())) return null;
  return (await filas.nth(i - 1).locator('td').allInnerTexts()).map(normaliza);
}

/** Índices (0..n-1) de las filas cuyas columnas tienen EXACTAMENTE los valores dados. */
async function filasQueCoinciden(tabla: string, columnas: string[], filas: Locator, esperadas: Record<string, string>, ctx: ContextoEjecucion): Promise<number[]> {
  const pares = Object.entries(esperadas).map(([col, v]) => ({ col, idx: columnas.indexOf(normaliza(col)), valor: normaliza(ctx.resolver(v)) }));
  const faltan = pares.filter((x) => x.idx < 0).map((x) => x.col);
  if (faltan.length) throw new Error(`Columnas inexistentes en "${tabla}": ${faltan.join(', ')} (vistas: ${columnas.filter(Boolean).join(', ')})`);
  const out: number[] = [];
  const n = await filas.count();
  for (let k = 0; k < n; k++) {
    const celdas = (await filas.nth(k).locator('td').allInnerTexts()).map(normaliza);
    if (pares.every((x) => celdas[x.idx] === x.valor)) out.push(k);
  }
  return out;
}

/** Fila objetivo (1..n): por número / "ultima", o por valores exactos de columnas (debe coincidir EXACTAMENTE una). */
async function resolverFila(p: PasoSde, columnas: string[], filas: Locator, ctx: ContextoEjecucion): Promise<number> {
  const n = await filas.count();
  let i: number;
  if (p.fila_con) {
    const coinciden = await filasQueCoinciden(p.tabla as string, columnas, filas, p.fila_con as Record<string, string>, ctx);
    if (coinciden.length !== 1) throw new Error(`"${p.tabla}": ${coinciden.length} fila(s) coinciden con "fila_con"; se requiere exactamente 1.`);
    i = coinciden[0] + 1;
  } else {
    i = p.fila === 'ultima' ? n : (p.fila as number);
  }
  if (i < 1 || i > n) throw new Error(`"${p.tabla}" tiene ${n} fila(s); no existe la fila ${p.fila}.`);
  return i;
}

/** Índices (0..n-1) de las filas marcadas como seleccionadas (control de selección marcado o marca de fila activa). */
async function filasSeleccionadas(filas: Locator): Promise<number[]> {
  const marcas = await filas.evaluateAll((trs, s) => trs.map((tr) => {
    const c = tr.querySelector(s.control) as HTMLInputElement | null;
    return (c?.checked ?? false) || tr.getAttribute('aria-selected') === 'true' || new RegExp(s.clase).test((tr as HTMLElement).className);
  }), { control: SdeObjects.seleccionFila, clase: SdeObjects.filaSeleccionadaClase.source });
  return marcas.flatMap((m, k) => (m ? [k] : []));
}

/** Acción de una fila: la de la propia fila; si la fila no tiene, la de la barra de la tabla (aplica a la fila seleccionada). */
async function accionDeFila(fila: Locator, cont: Locator, accion: 'Editar' | 'Eliminar', tabla: string): Promise<Locator> {
  const enFila = fila.locator(SdeObjects.accionTabla(accion));
  if ((await enFila.filter({ visible: true }).count()) > 0) return unicoVisible(enFila, `la acción ${accion} de la fila de "${tabla}"`);
  // Grilla Bizagi: la acción está en el pie (li[data-action]) y aplica a la fila seleccionada. [VERIFICADO]
  const pie = cont.locator(SdeObjects.accionGrilla(accion === 'Editar' ? 'edit' : 'remove'));
  if ((await pie.filter({ visible: true }).count()) > 0) return unicoVisible(pie, `la acción ${accion} del pie de "${tabla}"`);
  return unicoVisible(cont.locator(SdeObjects.accionTablaBarra(accion)), `la acción ${accion} de "${tabla}" (SdeObjects.accionTabla)`);
}

async function confirmarDialogo(dialogo: Locator): Promise<void> {
  const nombres = SdeObjects.confirmarDialogo;
  const botones = dialogo.getByRole('button').filter({ visible: true }).filter({ hasText: new RegExp(`^\\s*(${nombres.join('|')})\\s*$`) });
  const b = await unicoVisible(botones, `el botón de confirmación del pop-up (${nombres.join('/')})`);
  await b.click();
}

/**
 * Evidencia POSITIVA de documentos obligatorios en una grilla de documentos (P-02; Juan Miguel, 2026-10-19: solo son obligatorios
 * si la parametrización del formulario lo exige): la marca de obligatoriedad que Bizagi pone a la grilla. El tipo configurado en
 * DOCS-OBLIGATORIOS NO es evidencia (13/10 se infirió de un rechazo de «Crear» anterior al despliegue): solo se usa para ELEGIR el
 * tipo si la obligatoriedad se evidencia. Si la parametrización exige un documento sin marcarlo, lo prueba el rechazo de
 * CREATENEWCASE (sin caso creado). Filas precargadas (no observadas en QA) son calibración pendiente, nunca un PASS.
 * Calibración del 2026-10-19 (formulario de inicio de Generales / Póliza Nueva / Masiva, sin «Crear»): grilla vacía, sin marca de
 * obligatoriedad y el combo sin tipos antes y después de guardar la fila; al repintar con otra Sucursal, Bizagi vacía la grilla.
 */
export async function evidenciaDocumentosObligatorios(cont: Locator, filas: Locator): Promise<{ obligatorio: boolean; detalle: string }> {
  const precargadas = await filas.count();
  if (precargadas > 0) throw new CalibracionError('documentos', `la grilla trae ${precargadas} fila(s) precargada(s): comportamiento no calibrado (¿documentos obligatorios por parametrización?).`);
  const marca = await cont.evaluate((el) => el.matches('.ui-bizagi-render-required, .control-required')
    || !!el.querySelector('.ui-bizagi-render-required, .control-required')
    || /\*\s*$/.test((el.querySelector('.bz-rn-grid-header-title, .ui-bizagi-label label')?.textContent ?? '').trim()));
  return marca
    ? { obligatorio: true, detalle: 'obligatoriedad evidenciada (la grilla está marcada como obligatoria)' }
    : { obligatorio: false, detalle: 'sin evidencia de documentos obligatorios (la grilla no está marcada como obligatoria y no trae filas precargadas)' };
}

/** Opciones reales del combo «Tipo Documental» de una fila (sin el marcador «-----»). Cierra la lista sin Escape (Escape cierra el formulario de inicio). */
async function opcionesTipoDocumental(page: Page, fila: Locator): Promise<string[]> {
  const combo = fila.locator(SdeObjects.combo).filter({ visible: true });
  if ((await combo.count()) !== 1) return [];
  const lista = await combo.getAttribute('aria-controls');
  if (!lista) throw new CalibracionError('combo', 'el combo de la fila no declara aria-controls.');
  const opciones = page.locator(SdeObjects.opcionesDe(lista)).filter({ visible: true });
  await combo.click();
  await opciones.first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  const textos = (await opciones.allInnerTexts()).map(normaliza);
  const marcador = opciones.filter({ hasText: /^\s*-+\s*$/ });
  if (await marcador.count()) await marcador.first().click();
  else if (await opciones.count()) await combo.click();
  return textos.filter((o) => o && !/^-+$/.test(o));
}

/**
 * P9 de HU06-CP01 (P-02, 2026-10-19): adjunta SOLO si hay evidencia positiva de documentos obligatorios. Por cada tipo obligatorio:
 * Adicionar → (si la lista ya ofrece tipos, se usa; si no, Guardar la fila, esperar el repintado y reactivar la fila pulsando su
 * combo: que los tipos aparezcan recién tras guardar NO se declara defecto) → tipo → Guardar → archivo sintético → comprobación
 * de que el documento quedó registrado (archivo visible en la fila y tipo conservado). Nunca pulsa Escape ni «Crear».
 */
async function adjuntarSegunObligatoriedad(page: Page, amb: Ambito, grilla: string, ruta: string, tiposTexto: string): Promise<SalidaCapacidad> {
  const tipos = tiposTexto.split('|').map((t) => t.trim()).filter(Boolean);
  const inicial = await contenedorTabla(amb, grilla);
  const evidencia = await evidenciaDocumentosObligatorios(inicial.cont, inicial.filas);
  if (!evidencia.obligatorio) return { detalle: `"${grilla}": ${evidencia.detalle}; se continúa SIN adjuntar (si la parametrización exigiera un documento, Bizagi rechazará «Crear» sin crear el caso).` };
  const nombre = ruta.split(/[\\/]/).pop()!;
  const hechos: string[] = [];
  for (const tipo of tipos.length ? tipos : ['']) {
    const { cont, filas } = await contenedorTabla(amb, grilla);
    const antes = await filas.count();
    await esperarCarga(page);
    await (await unicoVisible(cont.locator(SdeObjects.accionGrilla('add')), `la acción Adicionar de "${grilla}"`)).click();
    await esperarCarga(page);
    let fila = filas.nth(antes);
    await fila.waitFor({ state: 'visible', timeout: 30_000 });
    let opciones = await opcionesTipoDocumental(page, fila);
    let momento = 'al agregar la fila';
    if (!opciones.length) {
      const guardar = cont.locator(SdeObjects.accionGrilla('save')).filter({ visible: true });
      if ((await guardar.count()) === 1) {
        await guardar.click();
        await esperarCarga(page);
        // Al persistir, Bizagi cambia la clave de la fila y la repinta: se vuelve a localizar y se reactiva con su combo.
        for (const limite = Date.now() + 20_000; !opciones.length && Date.now() < limite;) {
          fila = (await contenedorTabla(amb, grilla)).filas.nth(antes);
          await fila.waitFor({ state: 'visible', timeout: 10_000 });
          opciones = await opcionesTipoDocumental(page, fila);
          if (!opciones.length) await page.waitForTimeout(2_000);
        }
        momento = 'tras guardar la fila y reactivarla';
      }
    }
    if (!opciones.length) {
      throw new Error(`"${grilla}": el combo "Tipo Documental" no ofrece ninguna opción (solo "-------------") ni al agregar la fila ni tras guardarla y reactivarla; no es posible registrar ${tipo ? `el documento obligatorio "${tipo}"` : 'el documento obligatorio'} (${evidencia.detalle}).`);
    }
    if (!tipo) return { estado: 'BLOCKED', causa: 'DATO', detalle: `"${grilla}": ${evidencia.detalle}; tipos ofrecidos ${momento}: ${opciones.join(' | ')}. Falta indicar cuál es obligatorio (DOCS-OBLIGATORIOS).` };
    if (!opciones.includes(normaliza(tipo))) return { estado: 'BLOCKED', causa: 'DATO', detalle: `"${grilla}": el tipo obligatorio "${tipo}" no está entre los ofrecidos ${momento} (${opciones.join(' | ')}).` };
    const combo = fila.locator(SdeObjects.combo).filter({ visible: true });
    await combo.click();
    await (await unicoVisible(page.locator(SdeObjects.opcionesDe((await combo.getAttribute('aria-controls'))!)).filter({ visible: true }).filter({ hasText: regexExacto(normaliza(tipo)) }), `el tipo documental "${tipo}"`)).click();
    await esperarCarga(page);
    const guardar = cont.locator(SdeObjects.accionGrilla('save')).filter({ visible: true });
    if ((await guardar.count()) === 1) { await guardar.click(); await esperarCarga(page); }
    fila = (await contenedorTabla(amb, grilla)).filas.nth(antes);
    const control = fila.locator(SdeObjects.cargaArchivoFila);
    if ((await control.count()) !== 1) throw new Error(`"${grilla}": la fila del tipo "${tipo}" no ofrece carga de archivo (${await control.count()} controles).`);
    await control.click();
    const dlg = await unicoVisible(page.locator(SdeObjects.dialogo).filter({ has: page.locator('.ui-dialog-title').filter({ hasText: regexExacto(SdeObjects.dialogoCargaTitulo) }) }), `el diálogo "${SdeObjects.dialogoCargaTitulo}"`, 30_000);
    await dlg.locator('input[type="file"]').setInputFiles(ruta);
    await (await unicoVisible(dlg.getByRole('button', { name: SdeObjects.botonSubir, exact: true }), `"${SdeObjects.botonSubir}" del diálogo de carga`)).click();
    await dlg.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => { throw new Error(`El diálogo "${SdeObjects.dialogoCargaTitulo}" no se cerró tras "${SdeObjects.botonSubir}".`); });
    await esperarCarga(page);
    // Registro efectivo: archivo visible en la fila y tipo documental conservado (relectura de la grilla).
    fila = (await contenedorTabla(amb, grilla)).filas.nth(antes);
    const archivoVisible = await fila.getByText(nombre, { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false);
    const tipoActual = normaliza(await fila.locator(SdeObjects.combo).first().inputValue().catch(async () => (await fila.innerText()).toString()));
    if (!archivoVisible || !tipoActual.includes(normaliza(tipo))) {
      throw new Error(`"${grilla}": el documento "${tipo}" no quedó registrado (archivo visible: ${archivoVisible ? 'sí' : 'no'}; tipo en la fila: "${tipoActual || '—'}").`);
    }
    hechos.push(`"${tipo}" (tipos ofrecidos ${momento}) con "${nombre}" registrado`);
  }
  return { detalle: `"${grilla}": ${evidencia.detalle}; ${hechos.join('; ')}.` };
}

export function crearCapacidadesUi(ui: UiEntorno): { capacidades: Record<string, Capacidad>; verificar: Verificador } {
  const verificar: Verificador = async (v: Verificacion, ctx: ContextoEjecucion) => {
    const amb = ambitoActual(ui);
    const page = paginaActual(ui);
    await esperarCarga(page);
    const [tipo, val] = Object.entries(v)[0] as [string, unknown];
    const texto = (s: string) => ctx.resolver(s);
    switch (tipo) {
      case 'visible': {
        const n = await hayTextoVisible(amb, texto(val as string));
        return { ok: n > 0, detalle: `"${val}" visible (${n})` };
      }
      case 'no_visible': {
        const n = await hayTextoVisible(amb, texto(val as string));
        return { ok: n === 0, detalle: `"${val}" no visible (encontrados ${n})` };
      }
      // Solo etiquetas de CAMPO: distingue el campo "Placa" de la opción "Placa" del radio "Forma de Consulta Unitaria".
      case 'campo_visible':
      case 'campo_no_visible': {
        const n = await amb.locator(SdeObjects.etiquetaCampo).filter({ visible: true }).filter({ hasText: regexEtiqueta(texto(val as string)) }).count();
        const ok = tipo === 'campo_visible' ? n > 0 : n === 0;
        return { ok, detalle: `campo "${val}" ${tipo === 'campo_visible' ? 'visible' : 'no visible'} (etiquetas de campo encontradas: ${n})` };
      }
      case 'texto_exacto': {
        // Bizagi actualiza la ayuda por reglas tras elegir Ramo/modalidad (Cumplimiento, precreación del 2026-10-20): se espera,
        // acotado, a que la línea aparezca; si no aparece, sigue siendo FAIL.
        let n = 0;
        for (const limite = Date.now() + 10_000; (n = await hayLineaExacta(amb, texto(val as string))) === 0 && Date.now() < limite;) await page.waitForTimeout(500);
        if (n > 0) return { ok: true, detalle: `línea de texto exacta “${val}” (${n})` };
        // Distingue "no está" de "está, pero dentro de una línea más larga" (p. ej. sin salto de línea): sigue siendo FAIL.
        const dentro = await lineasQueContienen(amb, texto(val as string));
        return { ok: false, detalle: `línea de texto exacta “${val}” (0)${dentro.length ? `; el texto aparece DENTRO de otra línea: ${dentro.map((l) => `«${l}»`).join(' | ')}` : ''}` };
      }
      case 'etiquetas': {
        const faltan: string[] = [];
        for (const e of val as string[]) if ((await hayTextoVisible(amb, e)) === 0) faltan.push(e);
        if (!faltan.length) return { ok: true, detalle: `etiquetas exactas presentes (${(val as string[]).length})` };
        // Distingue "no está" de "está con otra ortografía o capitalización" (lo que QA prioriza detectar).
        const vistos = await textosVisibles(amb);
        const diag = faltan.map((e) => {
          const c = compararConAprobado(e, vistos);
          return c.estado === 'difiere_ortografia' ? `"${e}" difiere en ortografía/capitalización: la pantalla muestra "${c.observado}"` : `"${e}" ausente`;
        });
        return { ok: false, detalle: `etiquetas exactas no encontradas: ${diag.join('; ')}` };
      }
      case 'orden': {
        const inventario = (await inventarioCampos(amb)).map((x) => x.etiqueta);
        const r = revisarOrden(val as string[], inventario);
        const problema = r.faltan.length ? `no visibles: ${r.faltan.join(', ')}` : r.repetidos.length ? `repetidos (orden ambiguo): ${r.repetidos.join(', ')}`
          : r.inversion ? `"${r.inversion[1]}" aparece antes que "${r.inversion[0]}"` : '';
        return { ok: r.ok, detalle: `orden de campos [${(val as string[]).join(' → ')}]: ${r.ok ? 'se cumple' : `NO se cumple (${problema}); orden observado [${r.observado.join(' → ')}]`}` };
      }
      case 'ortografia': {
        // R1 (Work, PR #2): solo se concluye sobre la pantalla esperada y con evidencia positiva de haberla observado.
        const cat = cargarPresentacion();
        const id = val as string;
        const pantalla = cat.pantallas[id];
        if (!pantalla) throw new NoConcluyenteError(`la pantalla "${id}" no está declarada en el catálogo de presentación.`);
        const ausentes: string[] = [];
        for (const m of pantalla.marcadores) if ((await hayTextoVisible(amb, m)) === 0) ausentes.push(m);
        if (ausentes.length) throw new NoConcluyenteError(`no se identificó la pantalla "${id}": marcadores no visibles ${ausentes.join(', ')} (fuente: ${pantalla.fuente}).`);
        const textos = await textosVisibles(amb);
        const sinRecoger = pantalla.marcadores.filter((m) => compararConAprobado(m, textos).estado !== 'exacto');
        if (sinRecoger.length) throw new NoConcluyenteError(`la pantalla "${id}" está visible pero la recolección de textos no observó ${sinRecoger.join(', ')}: la revisión no sería completa.`);
        const hallazgos = aplicarReglasOrtograficas(textos, cat.reglas_ortograficas, cat.conocidos);
        const describirH = hallazgos.map((h) => `"${h.texto}" → ${h.regla} ("${h.fragmento}"${h.correcto ? `; correcto: ${h.correcto}` : ''})${h.conocido ? ` [ya registrado: ${h.conocido}]` : ' [NUEVO]'}`);
        return { ok: hallazgos.length === 0, detalle: `ortografía (norma RAE/DLE) en "${id}" (identificada por ${pantalla.marcadores.join(', ')}) sobre ${textos.length} textos visibles: ${hallazgos.length ? `${hallazgos.length} hallazgo(s): ${describirH.join('; ')}` : 'sin hallazgos'}` };
      }
      case 'solo_lectura':
      case 'editable':
      case 'obligatorio':
      case 'opcional': {
        const malos: string[] = [];
        for (const e of val as string[]) {
          const lbl = await etiqueta(amb, e);
          const info = await infoCampo(await campo(amb, e), e);
          // Bizagi solo marca un obligatorio mientras está VACÍO: con un valor, "opcional" no es verificable (error del escenario).
          if (tipo === 'opcional' && valorMostrado(info) !== '') throw new Error(`NO VERIFICABLE: "${e}" ya tiene valor; "opcional" se verifica con el campo vacío.`);
          const cumple = tipo === 'solo_lectura' ? estaSoloLectura(info)
            : tipo === 'editable' ? !estaSoloLectura(info)
              : tipo === 'opcional' ? !esObligatorio(info, await lbl.innerText())
                : esObligatorio(info, await lbl.innerText());
          if (!cumple) malos.push(e);
        }
        return { ok: malos.length === 0, detalle: malos.length ? `no cumplen "${tipo}": ${malos.join(', ')}` : `${tipo}: ${(val as string[]).join(', ')}` };
      }
      case 'botones_exactos': {
        const vistos = await botonesVisibles(amb);
        const esperados = (val as string[]).map(normaliza);
        const ok = vistos.length === esperados.length && esperados.every((b) => vistos.includes(b));
        return { ok, detalle: `botones visibles [${vistos.join(', ')}] vs esperados [${esperados.join(', ')}]` };
      }
      case 'valor': {
        const { campo: c, igual } = val as { campo: string; igual: string };
        const actual = valorMostrado(await infoCampo(await campo(amb, c), c));
        const esperado = texto(igual);
        // Si no coincide se informa el valor mostrado (el ejecutor enmascara cualquier dato sensible): sirve para calibrar.
        const ok = actual === normaliza(esperado);
        return { ok, detalle: `"${c}" = ${describir(igual, ctx.registro, ctx.unico, ctx.env)} (${ok ? 'coincide' : `NO coincide: muestra "${actual}"`})` };
      }
      case 'actividad': {
        const titulo = page.locator(SdeObjects.tituloActividad).filter({ visible: true });
        if ((await titulo.count()) === 0) throw new CalibracionError('tituloActividad', 'no hay título de actividad visible.');
        const textos = (await titulo.allInnerTexts()).map(normaliza);
        return { ok: textos.includes(normaliza(val as string)), detalle: `actividad visible [${textos.join(' | ')}] vs "${val}"` };
      }
      default:
        throw new Error(`verificación "${tipo}" no implementada`);
    }
  };

  const capacidades: Record<string, Capacidad> = {
    iniciar_sesion: async (p, ctx) => {
      const actor = p.actor as string;
      let page = ui.paginas.get(actor);
      if (!page) {
        if (ui.paginas.size === 0) page = ui.paginaInicial;
        else {
          const contexto = await ui.browser.newContext({ baseURL: ctx.env.BIZAGI_BASE_URL, ignoreHTTPSErrors: true, viewport: VIEWPORT_SDE });
          ui.contextos.push(contexto);
          page = await contexto.newPage();
        }
        ui.paginas.set(actor, page);
      }
      if (ui.soloLectura) {
        // Instalación consistente (hallazgo B): si falla, ProteccionNoInstaladaError detiene la inspección ANTES del login;
        // el contexto solo cuenta como protegido cuando la protección quedó completa (un reintento la completa).
        const registro = await protegerSoloLectura(page.context());
        if (!(ui.registroSoloLectura ??= []).includes(registro)) ui.registroSoloLectura.push(registro);
      }
      rastrearAcciones(page); // habilita la espera de "forma quieta" (re-ejecución de reglas Bizagi)
      salirDeFormularioInicio(page, ctx); // una sesión nueva no está en ningún formulario de inicio
      const usuario = ctx.env[`USUARIO_${actor}`] ?? '';
      const clave = ctx.env[`CLAVE_${actor}`] ?? '';
      try {
        // QA presenta cortes de DNS intermitentes (>40 s): se amplía SOLO la navegación inicial (idempotente) antes del login.
        await new LoginActions(page).navegarAlPortal({ timeout: 120_000, intervalo: 4_000 });
        await new LoginActions(page).login(usuario, clave, ctx.env[`DOMINIO_${actor}`] || undefined);
      } catch (e) {
        const msg = (e as Error).message;
        if (/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION/.test(msg)) {
          throw new EntornoError(`el Work Portal QA no resolvió/no respondió (${msg.match(/net::\w+/)?.[0] ?? 'red'}) tras 2 min de reintentos.`);
        }
        const rechazo = await page.locator(LoginObjects.errorMessage).filter({ visible: true }).count();
        if (rechazo > 0) throw new Error(`Login de "${actor}" rechazado por el portal (mensaje de error visible).`);
        throw new CalibracionError('bandeja', `tras el login de "${actor}" no apareció la bandeja: ${(e as Error).message.split('\n')[0]}`);
      }
      ctx.sesiones.add(actor);
      ui.actual = actor;
      return { estado: 'PASS', detalle: `Sesión real iniciada como "${actor}".` };
    },

    nuevo_caso: async (p, ctx) => {
      const page = paginaActual(ui);
      const proceso = ctx.resolver(p.proceso as string);
      // Permiso del rol (ENV-03): al abrir "Nuevo Caso" el portal recibe en Rest/Processes/All (HTTP 200) solo los
      // procesos que el usuario puede iniciar. Se lee la respuesta que recibe el PROPIO portal (una petición directa
      // devuelve 401) y se ignoran los 304 (sin cuerpo). Si ninguna respuesta 200 lista el proceso, el bloqueo es
      // AMBIENTAL (permisos), no un selector roto ni un defecto del CP. Sin respuestas capturadas no se concluye nada.
      const listas: Promise<string>[] = [];
      const alResponder = (r: Response) => { if (r.url().includes(SdeObjects.rutaProcesos) && r.status() === 200) listas.push(r.text().catch(() => '')); };
      page.on('response', alResponder);
      try {
        await (await unicoVisible(page.locator(SdeObjects.nuevoCaso), 'el menú "Nuevo Caso" (SdeObjects.nuevoCaso)')).click();
        await (await unicoVisible(page.locator(SdeObjects.todosLosProcesos), '"Todos los procesos" (SdeObjects.todosLosProcesos)')).click();
        await esperarCarga(page);
      } finally {
        page.off('response', alResponder);
      }
      const cuerpos = await Promise.all(listas);
      if (cuerpos.length > 0 && !cuerpos.some((c) => c.includes(proceso))) {
        throw new EntornoError(`el usuario "${ui.actual}" no tiene habilitado el proceso "${proceso}" (${SdeObjects.rutaProcesos} no lo lista; ENV-03).`);
      }
      // Ruta de categorías "App > Processes > Centro de Expedición": un nivel a la vez, texto exacto y único.
      const ruta = p.categoria ? ctx.resolver(p.categoria as string).split('>').map((x) => x.trim()).filter(Boolean) : [];
      for (const cat of ruta) {
        const titulo = page.locator(`:scope > ${SdeObjects.arbolCategoriaTexto}`).filter({ hasText: regexExacto(cat) });
        await (await unicoVisible(page.locator(SdeObjects.arbolCategoria).filter({ has: titulo }), `la categoría "${cat}"`, 20_000)).click();
      }
      const item = page.locator(SdeObjects.arbolProceso).filter({ hasText: regexExacto(proceso) });
      await (await unicoVisible(item, `el proceso "${proceso}"`, 20_000)).click();
      // Formulario de inicio (hasStartForm): diálogo propio; el caso NO existe hasta "Crear".
      await unicoVisible(page.locator(SdeObjects.dialogoInicio), 'el formulario de inicio (SdeObjects.dialogoInicio)', 60_000);
      await marcarFormularioInicio(page, ctx); // evidencia POSITIVA de precreación (P-15/F2)
      await esperarCarga(page);
      return { detalle: `Formulario de inicio de "${proceso}" abierto (ruta: ${ruta.join(' > ') || '—'})` };
    },

    diligenciar: async (p, ctx) => {
      const amb = ambitoActual(ui);
      const hechos: string[] = [];
      for (const c of p.campos as CampoSde[]) {
        await diligenciar(amb, ctx.resolver(c.campo), ctx.resolver(c.valor), c.tipo ?? 'texto');
        hechos.push(`${describir(c.campo, ctx.registro, ctx.unico, ctx.env)}=${describir(c.valor, ctx.registro, ctx.unico, ctx.env)}`);
      }
      return { detalle: `Diligenciado y confirmado: ${hechos.join('; ')}` };
    },

    adjuntar: async (p, ctx) => {
      const ruta = resolve(DIR_PROYECTO, 'resources', ctx.resolver(p.archivo as string));
      if (!existsSync(ruta)) throw new Error(`No existe el archivo a adjuntar: resources/${ctx.resolver(p.archivo as string)}`);
      const etiquetaCampo = ctx.resolver(p.campo as string);
      await adjuntar(ambitoActual(ui), etiquetaCampo, ruta);
      return { detalle: `Adjunto cargado en "${etiquetaCampo}"` };
    },

    adjuntar_en_grilla: async (p, ctx) => {
      const page = paginaActual(ui);
      const ruta = resolve(DIR_PROYECTO, 'resources', ctx.resolver(p.archivo as string));
      if (!existsSync(ruta)) throw new Error(`No existe el archivo a adjuntar: resources/${ctx.resolver(p.archivo as string)}`);
      const nombreGrilla = ctx.resolver(p.grilla as string);
      if (p.secuencia === 'segun_obligatoriedad') return adjuntarSegunObligatoriedad(page, ambitoActual(ui), nombreGrilla, ruta, p.tipo_documental ? ctx.resolver(p.tipo_documental as string) : '');
      const productoPrimero = p.secuencia === 'guardar_primero';
      const grillaVisible = async () => contenedorTabla(ambitoActual(ui), nombreGrilla);
      let { cont, filas } = await grillaVisible();
      const antes = await filas.count();
      await esperarCarga(page);
      await (await unicoVisible(cont.locator(SdeObjects.accionGrilla('add')), `la acción Adicionar de "${nombreGrilla}"`)).click();
      await esperarCarga(page);
      await unicoVisible(filas.nth(antes), `la fila nueva de "${nombreGrilla}"`, 30_000);
      const notas: string[] = [];
      if (productoPrimero) {
        // SECUENCIA DEL PRODUCTO (observada en QA el 2026-10-13, propuesta de control de cambios — NO es la de la matriz):
        // 1) guardar la fila vacía (Bizagi: ADDRELATIONWITHDATA); 2) la grilla no se refresca sola: se re-pinta el formulario
        // cambiando y restaurando el campo declarado en "refrescar_con"; 3) recién ahí la lista ofrece los tipos documentales.
        await (await unicoVisible(cont.locator(SdeObjects.accionGrilla('save')), `Guardar fila de "${nombreGrilla}"`)).click();
        await esperarCarga(page);
        const r = p.refrescar_con as { campo: string; valor_temporal: string; valor: string };
        const campoR = ctx.resolver(r.campo);
        await diligenciar(ambitoActual(ui), campoR, ctx.resolver(r.valor_temporal), 'lista');
        await diligenciar(ambitoActual(ui), campoR, ctx.resolver(r.valor), 'lista');
        ({ cont, filas } = await grillaVisible());
        notas.push(`fila guardada antes del tipo documental y formulario re-pintado vía "${campoR}"`);
      }
      const fila = filas.nth(antes);
      // 1) Tipo documental: la lista debe ofrecer opciones (si está vacía, en la secuencia de la matriz es BUG-01).
      const combo = await unicoVisible(fila.locator(SdeObjects.combo), `el combo "Tipo Documental" de la fila nueva`);
      const lista = await combo.getAttribute('aria-controls');
      if (!lista) throw new CalibracionError('combo', 'el combo de la fila no declara aria-controls.');
      const opciones = page.locator(SdeObjects.opcionesDe(lista)).filter({ visible: true });
      let reales: string[] = [];
      const limite = Date.now() + 30_000;
      while (Date.now() < limite) {
        await combo.click(); // abrir la lista es idempotente
        await opciones.first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
        reales = (await opciones.allInnerTexts()).map(normaliza).filter((o) => o && !/^-+$/.test(o));
        if (reales.length) break;
        await esperarCarga(page);
      }
      if (!reales.length) {
        throw new Error(`"${nombreGrilla}": el combo "Tipo Documental" no ofrece ninguna opción (solo "-------------"); no es posible adjuntar el documento obligatorio` +
          (productoPrimero ? '.' : ' en la secuencia de la matriz (la fila indica "Por favor guarde el registro antes de subir el archivo").'));
      }
      const tipo = p.tipo_documental ? ctx.resolver(p.tipo_documental as string) : '';
      if (!tipo) return { estado: 'BLOCKED', causa: 'DATO', detalle: `Tipos documentales disponibles: ${reales.join(' | ')}. Falta indicar cuál es el obligatorio (DOCS-OBLIGATORIOS).` };
      await (await unicoVisible(opciones.filter({ hasText: regexExacto(tipo) }), `el tipo documental "${tipo}"`)).click();
      await esperarCarga(page);
      // 2) Guardar la fila si sigue en edición (secuencia de la matriz) y 3) subir el archivo.
      const guardar = cont.locator(SdeObjects.accionGrilla('save')).filter({ visible: true });
      if ((await guardar.count()) === 1) { await guardar.click(); await esperarCarga(page); }
      const nombre = ruta.split(/[\\/]/).pop()!;
      const directo = fila.locator('input[type="file"]');
      if ((await directo.count()) === 1) {
        await directo.setInputFiles(ruta);
      } else {
        // Control de carga Bizagi (VERIFICADO 2026-10-13): enlace de la celda → diálogo "Subir un archivo" → "Subir".
        const control = fila.locator(SdeObjects.cargaArchivoFila);
        if ((await control.count()) !== 1) {
          throw new Error(`"${nombreGrilla}": la fila no ofrece carga de archivo (${await control.count()} controles); en QA aparece "Por favor guarde el registro antes de subir el archivo" mientras la fila no está guardada.`);
        }
        await control.click();
        const dlg = await unicoVisible(page.locator(SdeObjects.dialogo).filter({ has: page.locator(`.ui-dialog-title`).filter({ hasText: regexExacto(SdeObjects.dialogoCargaTitulo) }) }), `el diálogo "${SdeObjects.dialogoCargaTitulo}"`, 30_000);
        await dlg.locator('input[type="file"]').setInputFiles(ruta);
        await (await unicoVisible(dlg.getByRole('button', { name: SdeObjects.botonSubir, exact: true }), `"${SdeObjects.botonSubir}" del diálogo de carga`)).click();
        await dlg.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => { throw new Error(`El diálogo "${SdeObjects.dialogoCargaTitulo}" no se cerró tras "${SdeObjects.botonSubir}".`); });
        await esperarCarga(page);
      }
      await unicoVisible(fila.getByText(nombre, { exact: true }), `el archivo "${nombre}" en la fila`, 60_000);
      return { detalle: `"${nombreGrilla}": ${notas.length ? notas.join('; ') + '; ' : ''}tipo "${tipo}" (opciones: ${reales.join(' | ')}) y archivo "${nombre}" adjunto` };
    },

    verificar: async () => ({}),

    pulsar: async (p, ctx) => {
      const page = paginaActual(ui);
      salirDeFormularioInicio(page, ctx); // un botón puede crear el caso o cambiar de pantalla
      const notas = [`Botón "${p.boton}" pulsado`];
      if (p.capturar_numero_caso) {
        const numero = await pulsarYCapturarCaso(page, () => pulsar(ambitoActual(ui), p.boton as string), async (n) => {
          ctx.numeroCaso = n;
          await ui.registrarCaso(n, ui.actual ?? '');
        });
        notas.push(`Bizagi respondió CREATENEWCASE con CaseNumber ${numero} y la UI muestra "Caso ${numero}"`);
      } else {
        await pulsar(ambitoActual(ui), p.boton as string);
      }
      await esperarCarga(page, 90_000);
      if (p.esperar_hasta) {
        const limite = ((p.maximo_minutos as number) ?? 5) * 60_000;
        await page.getByText(regexEtiqueta(p.esperar_hasta as string)).filter({ visible: true }).first()
          .waitFor({ state: 'visible', timeout: limite })
          .catch(() => { throw new Error(`No se llegó a "${p.esperar_hasta}" en ${p.maximo_minutos ?? 5} min.`); });
        notas.push(`llegó a "${p.esperar_hasta}"`);
      }
      return { detalle: notas.join('; ') };
    },

    verificar_ruta: async (p, ctx) => {
      if (!ctx.numeroCaso) throw new Error('No hay número de caso capturado: no se puede verificar la ruta.');
      const page = ui.paginas.get(p.actor as string);
      if (!page) throw new Error(`El actor "${p.actor}" no tiene sesión.`);
      salirDeFormularioInicio(page, ctx); // el buscador recarga el portal: el formulario de inicio ya no está
      const destinos = (Array.isArray(p.llega_a) ? p.llega_a as string[] : [p.llega_a as string]).map(normaliza);
      const prohibidas = ((p.no_llega_a as string[]) ?? []).map(normaliza);
      const limite = Date.now() + ((p.maximo_minutos as number) ?? 8) * 60_000;
      const vistos: string[] = [];
      let ultimo: EstadoCaso;
      let destino = '';
      let consultas = 0;
      for (;;) {
        // Buscar el caso es idempotente (solo lectura): se repite hasta que el motor llegue a la actividad.
        ultimo = await buscarCaso(page, ctx.numeroCaso, ctx.resolver('${config:SDE_PROCESO_RADICACION}'));
        consultas++;
        for (const a of ultimo.actividades) if (!vistos.includes(a)) { vistos.push(a); ctx.actividades.push(a); }
        const prohibida = prohibidas.find((x) => ultimo.actividades.includes(x));
        if (prohibida) throw new Error(`El caso ${ctx.numeroCaso} está en "${prohibida}" (ruta NO esperada). Estado: ${describirEstados(ultimo)}`);
        const alcanzado = ultimo.actividades.find((a) => destinos.includes(a));
        if (alcanzado) { destino = alcanzado; break; }
        if (Date.now() > limite) {
          throw new Error(`El caso ${ctx.numeroCaso} no llegó a ninguna de [${destinos.join(' | ')}] en ${p.maximo_minutos ?? 8} min. ` +
            `Actividades observadas: ${vistos.join(' → ') || '—'}. Estado final: ${describirEstados(ultimo)}`);
        }
        await page.waitForTimeout(20_000); // intervalo de sondeo de un proceso asíncrono del motor; la salida es por condición o límite
      }
      return {
        estado: 'PASS',
        // El buscador solo muestra las actividades ACTUALES en el momento de cada consulta: no prueba que el caso nunca pasó por otra.
        detalle: `Caso ${ctx.numeroCaso}: Bizagi lista como actividad actual "${destino}" (work items del caso en el buscador); actividades observadas ${vistos.join(' → ')}; ` +
          `${prohibidas.length ? `"${prohibidas.join('", "')}" no observada(s) en las ${consultas} consulta(s) realizadas (el buscador solo muestra actividades actuales; no demuestra que nunca se ejecutaran)` : 'sin rutas prohibidas declaradas'}. Estado: ${describirEstados(ultimo)}`,
      };
    },

    verificar_recorrido_grafico: async (p, ctx) => {
      if (!ctx.numeroCaso) throw new Error('No hay número de caso capturado.');
      const page = ui.paginas.get(p.actor as string);
      if (!page) throw new Error(`El actor "${p.actor}" no tiene sesión.`);
      salirDeFormularioInicio(page, ctx);
      const caso = await leerRecorridoGrafico(page, ctx.numeroCaso, ctx.resolver('${config:SDE_PROCESO_RADICACION}'));
      const r = evaluarRecorrido(caso, p as RecorridoEsperado);
      if (r.estado === 'FAIL') throw new Error(r.detalle);
      return r.estado === 'NOT_AUTOMATED' ? { estado: 'NOT_AUTOMATED', causa: 'NO_AUTOMATIZADO', detalle: r.detalle } : { detalle: r.detalle };
    },

    asegurar_asignacion: async (p, ctx) => {
      if (!ctx.numeroCaso) throw new Error('No hay número de caso capturado.');
      const page = ui.paginas.get(p.actor as string);
      if (!page) throw new Error(`El actor "${p.actor}" no tiene sesión.`);
      salirDeFormularioInicio(page, ctx);
      const objetivo = ctx.env[`USUARIO_${p.actor}`] ?? '';
      const r = await asegurarAsignacionActividad(page, ctx.numeroCaso, p.actividad as string, objetivo, { maximoMs: ((p.maximo_minutos as number) ?? 5) * 60_000 });
      return { detalle: r.detalle };
    },

    abrir_caso: async (p, ctx) => {
      if (!ctx.numeroCaso) throw new Error('No hay número de caso capturado.');
      const page = ui.paginas.get(p.actor as string);
      if (!page) throw new Error(`El actor "${p.actor}" no tiene sesión.`);
      salirDeFormularioInicio(page, ctx); // se trabaja sobre un caso EXISTENTE
      const actividad = normaliza(p.actividad as string);
      const limite = Date.now() + ((p.maximo_minutos as number) ?? 8) * 60_000;
      // La actividad puede aparecer en el buscador ANTES de que Bizagi entregue su work item al usuario (caso 637,
      // 2026-10-15: WorkItems vacío al primer intento y disponible minutos después). Ambas condiciones se sondean dentro del
      // mismo límite: buscar es idempotente y un intento sin work item no abre la actividad (Bizagi no la entrega).
      let ultimoMotivo = '';
      let intento = 1;
      for (; ; intento++) {
        const e = await buscarCaso(page, ctx.numeroCaso, ctx.resolver('${config:SDE_PROCESO_RADICACION}'));
        if (!e.actividades.includes(actividad)) {
          ultimoMotivo = `El caso ${ctx.numeroCaso} no está en "${actividad}". Actividades actuales: ${describirEstados(e)}`;
        } else {
          // Abrir la actividad desde su fila y confirmar con Bizagi (WorkItems) que el usuario puede trabajarla.
          const items = page.waitForResponse((r) => r.url().includes(`/Rest/Cases/${ctx.numeroCaso}/WorkItems`) && r.status() === 200, { timeout: 60_000 });
          // La actividad puede estar en la fila de un subproceso: se pulsa en la fila que la lista.
          const filasConActividad = e.filas.filter((f) => f.actividades.includes(actividad));
          if (filasConActividad.length !== 1) throw new Error(`La actividad "${actividad}" aparece en ${filasConActividad.length} filas del caso ${ctx.numeroCaso}: no se elige una al azar.`);
          const enFila = filasConActividad[0].fila.locator(SdeObjects.actividadesEnFila).filter({ hasText: regexExacto(actividad) });
          await (await unicoVisible(enFila, `la actividad "${actividad}" en la fila del caso ${ctx.numeroCaso}`)).click();
          const wi = await (await items).json() as { workItems?: { displayName: string }[] };
          if ((wi.workItems ?? []).some((w) => normaliza(w.displayName) === actividad)) break;
          ultimoMotivo = `Bizagi no entrega a "${p.actor}" el work item "${actividad}" del caso ${ctx.numeroCaso} (WorkItems: ${(wi.workItems ?? []).map((w) => w.displayName).join(', ') || 'ninguno'}; ${intento} intento(s)).`;
        }
        if (Date.now() > limite) throw new Error(ultimoMotivo);
        await page.waitForTimeout(20_000); // sondeo acotado: la actividad o su work item pueden tardar (integraciones / Worker AI)
      }
      await unicoVisible(page.locator(SdeObjects.areaBotones), `el formulario de "${actividad}"`, 60_000);
      await esperarCarga(page);
      ui.actual = p.actor as string;
      ctx.actividades.push(actividad);
      return { detalle: `Caso ${ctx.numeroCaso} abierto por "${p.actor}" en "${actividad}"${intento > 1 ? ` (work item entregado en el intento ${intento})` : ''}` };
    },

    tabla_verificar: async (p, ctx) => {
      if ('comparar' in p && (!p.comparar || typeof p.comparar !== 'object' || Array.isArray(p.comparar) ||
          !Object.entries(p.comparar).every(([c, v]) => normaliza(c) && Array.isArray(v) && v.every((x) => typeof x === 'string')))) {
        return { estado: 'NOT_AUTOMATED', causa: 'NO_AUTOMATIZADO', detalle: 'Expectativa de comparación insuficiente o inválida.' };
      }
      const { columnas, filas } = await contenedorTabla(ambitoActual(ui), p.tabla as string);
      const faltan = ((p.columnas as string[]) ?? []).filter((c) => !columnas.includes(normaliza(c)));
      const n = await filas.count();
      if (faltan.length) throw new Error(`"${p.tabla}": faltan columnas ${faltan.join(', ')} (vistas: ${columnas.filter(Boolean).join(', ')})`);
      // "comparar" (HU06, extracción del Worker AI): ASERCIÓN (corrección F1 de Work, PR #7). Cada valor de la narrativa debe
      // aparecer en su columna y ningún valor no vacío ajeno a la narrativa puede aparecer. No se exige un número exacto de filas.
      const esperados = Object.fromEntries(Object.entries((p.comparar as Record<string, string[]>) ?? {}).map(([c, v]) => [c, v.map((x) => ctx.resolver(x))]));
      const observados: Record<string, string[]> = {};
      for (const col of Object.keys(esperados)) {
        const idx = columnas.indexOf(normaliza(col));
        if (idx < 0) throw new Error(`"${p.tabla}": columna "${col}" inexistente para comparar (vistas: ${columnas.filter(Boolean).join(', ')})`);
        observados[col] = [];
        for (let k = 0; k < n; k++) observados[col].push((await filas.nth(k).locator('td').allInnerTexts())[idx] ?? '');
      }
      const extraccion = 'comparar' in p ? evaluarExtraccion(observados, esperados, n) : null;
      if (p.minimo_filas != null && n < (p.minimo_filas as number)) {
        throw new Error(`"${p.tabla}": ${n} fila(s), mínimo ${p.minimo_filas}${extraccion ? ` | ${extraccion.detalle}` : ''}`);
      }
      if (extraccion?.estado === 'FAIL') throw new Error(`"${p.tabla}": extracción distinta de la narrativa (NO coincide): ${extraccion.detalle}`);
      if (extraccion?.estado === 'NOT_AUTOMATED') return { estado: 'NOT_AUTOMATED', causa: 'NO_AUTOMATIZADO', detalle: `"${p.tabla}": ${n} fila(s) | ${extraccion.detalle}` };
      return { detalle:`"${p.tabla}": ${n} fila(s); columnas [${columnas.filter(Boolean).join(', ')}]${extraccion ? ` | ${extraccion.detalle}` : ''}` };
    },

    tabla_abrir_fila: async (p, ctx) => {
      // H3: barrera ANTES de cualquier clic (BUG-03): sin formulario calibrado y cierre seguro verificado, no se abre.
      autorizarAperturaPopup(p.formulario as string | undefined, p.tabla as string, ctx.numeroCaso, ui.popupsCalibrados ?? cargarPopups(), ctx.env.SDE_AUTORIZO_CALIBRACION_POPUP);
      const page = paginaActual(ui);
      const { cont, filas } = await contenedorTabla(page, p.tabla as string);
      const n = await filas.count();
      const i = p.fila === 'ultima' ? n : (p.fila as number);
      if (i < 1 || i > n) throw new Error(`"${p.tabla}" tiene ${n} fila(s); no existe la fila ${p.fila}.`);
      const fila = filas.nth(i - 1);
      const contenidoFila = (await fila.locator('td').allInnerTexts()).map(normaliza);
      // Identidad de la fila ANTES de editar (D-66): columna «id» = data-business-key y única en la grilla; si no, sin clave.
      const negocio = normaliza((await fila.getAttribute('data-business-key')) ?? '');
      const { columnas } = await contenedorTabla(page, p.tabla as string);
      const clave = negocio && contenidoFila[columnas.indexOf('id')] === negocio
        && (await cont.locator(`tr[data-business-key="${negocio.replace(/"/g, '')}"]`).count()) === 1 ? negocio : undefined;
      await fila.click();
      await (await accionDeFila(fila, cont, 'Editar', p.tabla as string)).click();
      ui.dialogo = await unicoVisible(page.locator(SdeObjects.dialogo), 'el pop-up de edición');
      ctx.dialogoAbierto = true;
      ui.tabla = { tabla: p.tabla as string, fila: i, filasAntes: n, contenidoFila, clave };
      return { detalle: `Pop-up de edición abierto para la fila ${i} de "${p.tabla}"` };
    },

    tabla_agregar: async (p, ctx) => {
      autorizarAperturaPopup(p.formulario as string | undefined, p.tabla as string, ctx.numeroCaso, ui.popupsCalibrados ?? cargarPopups(), ctx.env.SDE_AUTORIZO_CALIBRACION_POPUP);
      const page = paginaActual(ui);
      const { cont, filas } = await contenedorTabla(page, p.tabla as string);
      const n = await filas.count();
      const pieAgregar = cont.locator(SdeObjects.accionGrilla('add'));
      const agregar = (await pieAgregar.filter({ visible: true }).count()) > 0 ? pieAgregar : cont.locator(SdeObjects.accionTablaBarra('Agregar'));
      await (await unicoVisible(agregar, `la acción Agregar de "${p.tabla}"`)).click();
      ui.dialogo = await unicoVisible(page.locator(SdeObjects.dialogo), 'el pop-up de adición');
      ctx.dialogoAbierto = true;
      ui.tabla = { tabla: p.tabla as string, fila: null, filasAntes: n };
      return { detalle: `Pop-up de adición abierto en "${p.tabla}" (${n} fila(s) antes)` };
    },

    dialogo_confirmar: async (p, ctx) => {
      const page = paginaActual(ui);
      const dialogo = ui.dialogo;
      if (!dialogo || !ui.tabla) throw new Error('No hay pop-up de tabla abierto.');
      await confirmarDialogo(dialogo);
      await esperarCarga(page);
      if (p.espera === 'no_registra') {
        // «Impide registrar» (HU06-CP02 P18): QA mostró dos comportamientos: el pop-up queda abierto (casos 653 y 669) o se cierra
        // (668 y 670). Ninguno prueba por sí solo que el valor no se registró (F2 de Work). La lectura independiente usa la clave de
        // negocio de la fila tomada ANTES de editar (D-66); sin clave acreditada queda inconclusa (B). Nunca por posición.
        const campo = ctx.resolver(p.campo as string);
        const rechazado = ctx.resolver(p.valor_rechazado as string);
        const t = ui.tabla;
        if (t?.fila == null) throw new Error('no_registra solo aplica a la edición de una fila existente.');
        if (!ctx.numeroCaso || !ctx.actividades.length) throw new Error('no_registra requiere el caso y la actividad abiertos.');
        const leer = () => leerCeldaPersistida(page, ctx.numeroCaso!, ctx.resolver('${config:SDE_PROCESO_RADICACION}'), ctx.actividades[ctx.actividades.length - 1], t.tabla, t.clave, campo);
        const popupAbierto = await dialogo.isVisible();
        const persistido = await leer();
        let recuperacion: ObservacionNoRegistra['recuperacion'] = 'no_requerida';
        if (popupAbierto) {
          // Recuperación SEPARADA de la validación: se restaura el valor válido y se cierra con «Guardar» (BUG-03: nunca sin guardar).
          await diligenciar(dialogo, campo, ctx.resolver(p.restaurar as string), 'texto');
          await confirmarDialogo(dialogo);
          await esperarCarga(page);
          recuperacion = (await dialogo.isVisible()) ? 'no_cerro' : 'cerro';
        }
        if (recuperacion !== 'no_cerro') { ui.dialogo = undefined; ctx.dialogoAbierto = false; ui.tabla = undefined; }
        const r = evaluarNoRegistra({ rechazado, persistido, popupAbierto, recuperacion });
        const incidente = r.incidente ? { causa: 'PRODUCTO_POR_CONFIRMAR' as const, detalle: r.incidente } : undefined;
        if (r.estado === 'FAIL') return { estado: 'FAIL', causa: 'PRODUCTO_POR_CONFIRMAR', detalle: `"${t.tabla}" fila ${t.fila}: ${r.detalle}`, incidente };
        if (r.estado === 'NOT_AUTOMATED') return { estado: 'NOT_AUTOMATED', causa: 'AUTOMATIZACION', detalle: r.detalle, incidente };
        return { detalle: r.detalle, incidente };
      }
      if (p.espera === 'permanece_abierto') {
        if (!(await dialogo.isVisible())) throw new Error('El pop-up se cerró: se confirmó sin los campos obligatorios.');
        return { detalle: 'El pop-up permanece abierto: no permite confirmar sin obligatorios.' };
      }
      await dialogo.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => { throw new Error('El pop-up no se cerró al confirmar.'); });
      const t = ui.tabla;
      ui.dialogo = undefined;
      ctx.dialogoAbierto = false;
      const esperadas = (p.fila_resultante as Record<string, string>) ?? {};
      const hayEsperadas = Object.keys(esperadas).length > 0;
      // La grilla puede tardar en reflejar lo guardado (caso 651, 2026-10-16: sin refresco inmediato; sí al reabrir). Se relee
      // durante un tiempo acotado y se decide con la última lectura.
      let n = 0;
      let problema = '';
      for (const limite = Date.now() + 15_000; ;) {
        const { columnas, filas } = await contenedorTabla(page, t.tabla);
        n = await filas.count();
        const coinciden = hayEsperadas ? await filasQueCoinciden(t.tabla, columnas, filas, esperadas, ctx) : [];
        problema = t.fila === null
          ? (n !== t.filasAntes + 1 ? `se esperaban ${t.filasAntes + 1} filas tras agregar; hay ${n}`
            : hayEsperadas && coinciden.length !== 1 ? `la fila agregada con los valores esperados aparece ${coinciden.length} vez/veces` : '')
          : (n !== t.filasAntes ? `la edición cambió el número de filas (${t.filasAntes} → ${n})`
            : hayEsperadas && !coinciden.includes(t.fila - 1) ? `la fila ${t.fila} no quedó con los valores esperados` : '');
        if (!problema || Date.now() > limite) break;
        await page.waitForTimeout(1_500);
      }
      if (problema) throw new Error(`"${t.tabla}": ${problema} (tras releer la grilla durante 15 s).`);
      const resumen = Object.entries(esperadas).map(([c, v]) => `${c}=${describir(v, ctx.registro, ctx.unico, ctx.env)}`).join(', ');
      ui.tabla = undefined;
      return { detalle: `Pop-up confirmado; "${t.tabla}" con ${n} fila(s)${resumen ? `; fila verificada: ${resumen}` : ''}` };
    },

    dialogo_cancelar: async (_p, ctx) => {
      const page = paginaActual(ui);
      const dialogo = ui.dialogo;
      if (!dialogo || !ui.tabla) throw new Error('No hay pop-up de tabla abierto.');
      const t = ui.tabla;
      await (await unicoVisible(dialogo.getByRole('button', { name: 'Cancelar', exact: true }), 'el botón "Cancelar" del pop-up')).click();
      await dialogo.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => { throw new Error('El pop-up no se cerró al cancelar.'); });
      ui.dialogo = undefined;
      ctx.dialogoAbierto = false;
      ui.tabla = undefined;
      await esperarCarga(page);
      const { filas } = await contenedorTabla(page, t.tabla);
      const n = await filas.count();
      if (n !== t.filasAntes) throw new Error(`"${t.tabla}": cancelar cambió el número de filas (${t.filasAntes} → ${n}).`);
      if (t.fila !== null && t.contenidoFila) {
        const ahora = (await filas.nth(t.fila - 1).locator('td').allInnerTexts()).map(normaliza);
        if (ahora.join('|') !== t.contenidoFila.join('|')) throw new Error(`"${t.tabla}": la fila ${t.fila} cambió pese a cancelar.`);
      }
      return { detalle: `Pop-up cancelado; "${t.tabla}" sin cambios (${n} fila(s))` };
    },

    tabla_eliminar_fila: async (p, ctx) => {
      const page = paginaActual(ui);
      const { cont, columnas, filas } = await contenedorTabla(page, p.tabla as string);
      const n = await filas.count();
      const i = await resolverFila(p, columnas, filas, ctx);
      const textos = async (k: number) => (await filas.nth(k).locator('td').allInnerTexts()).map(normaliza).join(' | ');
      const antes = await Promise.all(Array.from({ length: n }, (_, k) => textos(k)));
      const contenido = antes[i - 1];
      const fila = filas.nth(i - 1);
      await fila.click();
      await (await accionDeFila(fila, cont, 'Eliminar', p.tabla as string)).click();
      const confirmacion = page.locator(SdeObjects.dialogo).filter({ visible: true });
      if ((await confirmacion.count()) === 1) await confirmarDialogo(confirmacion);
      await esperarCarga(page);
      // La grilla no refleja de inmediato lo guardado (P-21c; caso 703, 2026-10-20: la fila sí se eliminó en el servidor).
      let despues = await filas.count();
      for (const limite = Date.now() + 15_000; despues !== n - 1 && Date.now() < limite; despues = await filas.count()) await page.waitForTimeout(1_000);
      if (despues !== n - 1) throw new Error(`"${p.tabla}": ${n} → ${despues} filas; se esperaba ${n - 1}.`);
      const restantes = await Promise.all(Array.from({ length: despues }, (_, k) => textos(k)));
      const ocurrencias = (l: string[]) => l.filter((x) => x === contenido).length;
      if (ocurrencias(restantes) !== ocurrencias(antes) - 1) throw new Error(`"${p.tabla}": la fila eliminada sigue presente.`);
      return { detalle: `Fila ${i} eliminada de "${p.tabla}" (${n} → ${despues})` };
    },

    tabla_seleccionar_fila: async (p, ctx) => {
      const page = paginaActual(ui);
      const { columnas, filas } = await contenedorTabla(ambitoActual(ui), p.tabla as string);
      const i = await resolverFila(p, columnas, filas, ctx);
      const fila = filas.nth(i - 1);
      const control = fila.locator(SdeObjects.seleccionFila);
      const nc = await control.count();
      if (nc > 1) throw new CalibracionError('seleccionFila', `la fila ${i} de "${p.tabla}" tiene ${nc} controles de selección.`);
      await (nc === 1 ? control : fila).click();
      await esperarCarga(page);
      const sel = await filasSeleccionadas(filas);
      if (sel.length !== 1 || sel[0] !== i - 1) {
        throw new Error(`"${p.tabla}": tras seleccionar la fila ${i} hay ${sel.length} fila(s) seleccionada(s)${sel.length ? ` [${sel.map((k) => k + 1).join(', ')}]` : ''}; se esperaba solo la ${i}.`);
      }
      return { detalle: `Fila ${i} de "${p.tabla}" seleccionada; exactamente 1 fila seleccionada (${await filas.count()} fila(s))` };
    },

    abrir_pestana: async (p, ctx) => {
      const page = paginaActual(ui);
      const nombre = ctx.resolver(p.pestana as string);
      const tab = await unicoVisible(page.locator(SdeObjects.pestana).filter({ hasText: regexExacto(nombre) }), `la pestaña "${nombre}" (SdeObjects.pestana)`);
      await tab.click();
      await esperarCarga(page);
      const estado = await tab.evaluate((e, clase) => ({
        activa: e.getAttribute('aria-selected') === 'true' || new RegExp(clase).test((e as HTMLElement).className),
        panel: e.getAttribute('aria-controls') ?? e.querySelector('a[href^="#"]')?.getAttribute('href')?.slice(1) ?? null,
      }), SdeObjects.pestanaActivaClase.source);
      if (!estado.activa) throw new Error(`La pestaña "${nombre}" no quedó activa tras pulsarla.`);
      let ambito: Ambito = page;
      if (estado.panel) ambito = await unicoVisible(page.locator(`[id="${estado.panel}"]`), `el panel de la pestaña "${nombre}"`, 30_000);
      const esperados = ((p.contiene as string[]) ?? []).map((t) => ctx.resolver(t));
      const faltan: string[] = [];
      for (const t of esperados) if ((await hayTextoVisible(ambito, t, false)) === 0) faltan.push(t);
      if (faltan.length) throw new Error(`Pestaña "${nombre}": no muestra ${faltan.map((t) => `"${t}"`).join(', ')}.`);
      return { detalle: `Pestaña "${nombre}" activa${estado.panel ? ' con su panel visible' : ''}${esperados.length ? `; muestra ${esperados.map((t) => `"${t}"`).join(', ')}` : ''}` };
    },

    intentar_diligenciar: async (p, ctx) => {
      const ref = ctx.resolver(p.campo as string);
      const valor = ctx.resolver(p.valor as string);
      const tecleado = describir(p.valor as string, ctx.registro, ctx.unico, ctx.env);
      const mostrado = await teclear(ambitoActual(ui), ref, valor);
      const notas = [`"${ref}": se tecleó ${tecleado}; el formulario muestra "${mostrado}"`];
      if (p.esperado_mostrado != null) {
        const esperado = normaliza(ctx.resolver(p.esperado_mostrado as string));
        if (mostrado !== esperado) throw new Error(`${notas[0]}; se esperaba "${esperado}" (la restricción del campo no se aplicó).`);
        notas.push('coincide con lo esperado');
      }
      if (p.mensaje != null) {
        const mensaje = ctx.resolver(p.mensaje as string);
        if ((await hayLineaExacta(paginaActual(ui), mensaje)) === 0) throw new Error(`${notas[0]}; no aparece el mensaje "${mensaje}".`);
        notas.push(`mensaje "${mensaje}" visible`);
      }
      return { detalle: notas.join('; ') };
    },
  };
  // P-15: la política de solo lectura se aplica en UN solo lugar, antes de ejecutar cualquier capacidad (incluidas las que
  // un spec invoque directamente). Lo no clasificado se deniega (sde/soloLectura.ts).
  if (ui.soloLectura) {
    for (const [nombre, cap] of Object.entries(capacidades)) {
      capacidades[nombre] = async (p, ctx) => {
        if (nombre !== 'iniciar_sesion') {
          // Ninguna capacidad corre sobre un contexto cuya protección no quedó COMPLETA (hallazgo B): se detiene.
          const pagina = paginaActual(ui);
          const registro = registroDe(pagina.context());
          if (registro?.estado.proteccion !== 'completa') {
            throw new ProteccionNoInstaladaError(`estado "${registro?.estado.proteccion ?? 'sin instalar'}" del contexto; "${nombre}" no se ejecuta.`);
          }
          // Escribir en el formulario de inicio exige el permiso VIGENTE (mismo diálogo, visible, ahora). Si caducó, se
          // retira la evidencia y la política deniega (F2, hallazgo A).
          if (OPERACIONES[nombre]?.clase === 'formulario_inicio' && ctx.formularioInicio && !(await precreacionVigente(pagina, registro))) {
            salirDeFormularioInicio(pagina, ctx);
          }
        }
        exigirSoloLectura(nombre, ctx);
        return cap(p, ctx);
      };
    }
  }
  return { capacidades, verificar };
}
