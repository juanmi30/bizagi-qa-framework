import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, BrowserContext, Locator, Page, Response } from '@playwright/test';
import { LoginActions } from '../../../shared/core/LoginActions';
import { LoginObjects } from '../../../shared/baseObjects/login.objects';
import { SdeObjects } from '../baseObjects/sde.objects';
import { describir } from './datos';
import type { CampoSde, PasoSde, Verificacion } from './escenario';
import { EntornoError, type Capacidad, type ContextoEjecucion, type Verificador } from './ejecutor';
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
  tabla?: { tabla: string; fila: number | null; filasAntes: number; contenidoFila?: string[] };
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

/** Nodo del diagrama de la «Consulta Gráfica»: tipos BPMN de Bizagi (p. ej. aiworkertask, exclusivegateway) y su estado en la ruta. */
export interface NodoGrafico { nombre: string; tipos: string[]; recorrido: boolean; actual: boolean }
export interface RecorridoEsperado { recorrido?: string[]; no_recorrido?: string[]; recorrido_tipo?: string[]; no_recorrido_tipo?: string[] }

/**
 * Evalúa la ruta REAL de una instancia (confirmación de QA, 2026-10-19: la visualización gráfica es evidencia válida del recorrido).
 * Solo cuentan los nodos marcados como recorridos por el portal (botón «Ruta»), nunca su mera presencia en el modelo.
 * Sin ningún nodo recorrido no hay evidencia suficiente: el paso queda para revisión humana, nunca PASS.
 */
export function evaluarRecorrido(caso: { numero: string; encabezado: string; nodos: NodoGrafico[]; completo?: boolean }, e: RecorridoEsperado): { estado: 'PASS' | 'FAIL' | 'NOT_AUTOMATED'; detalle: string } {
  if (normaliza(caso.encabezado) !== normaliza(caso.numero)) {
    throw new Error(`La «Consulta Gráfica» abierta corresponde al caso ${caso.encabezado || '—'}, no al ${caso.numero}: no se evalúa.`);
  }
  const recorridos = caso.nodos.filter((n) => n.recorrido);
  const nombres = (l: NodoGrafico[]) => l.map((n) => `${n.nombre || '(sin nombre)'} [${n.tipos.join(' ')}]${n.actual ? ' (actual)' : ''}`).join(' → ');
  if (recorridos.length === 0) return { estado: 'NOT_AUTOMATED', detalle: `Caso ${caso.numero}: el diagrama no marca ningún nodo recorrido; evidencia insuficiente, queda para revisión humana.` };
  if (caso.completo === false) return { estado: 'NOT_AUTOMATED', detalle: `Caso ${caso.numero}: la ruta marcada no terminó de dibujarse (${recorridos.length} nodos, nodo actual sin marcar); evidencia insuficiente, queda para revisión humana.` };
  const enModelo = (nombre: string) => caso.nodos.some((n) => normaliza(n.nombre) === normaliza(nombre));
  const pasa = (nombre: string) => recorridos.some((n) => normaliza(n.nombre) === normaliza(nombre));
  const faltaModelo = [...(e.recorrido ?? []), ...(e.no_recorrido ?? [])].filter((x) => !enModelo(x));
  if (faltaModelo.length) throw new Error(`[calibrar recorrido] el diagrama no contiene ${faltaModelo.map((x) => `"${x}"`).join(', ')} (nombres del modelo: ${[...new Set(caso.nodos.map((n) => n.nombre).filter(Boolean))].join(', ')}).`);
  const problemas = [
    ...(e.recorrido ?? []).filter((x) => !pasa(x)).map((x) => `"${x}" está en el modelo pero NO fue recorrido`),
    ...(e.no_recorrido ?? []).filter((x) => pasa(x)).map((x) => `"${x}" fue recorrido (ruta NO esperada)`),
    ...(e.recorrido_tipo ?? []).filter((t) => !recorridos.some((n) => n.tipos.includes(t))).map((t) => `ningún nodo de tipo ${t} fue recorrido`),
    ...(e.no_recorrido_tipo ?? []).filter((t) => recorridos.some((n) => n.tipos.includes(t))).map((t) => `se recorrió un nodo de tipo ${t} (ruta NO esperada)`),
  ];
  const base = `Caso ${caso.numero}, recorrido marcado por el portal: ${nombres(recorridos)}`;
  return problemas.length ? { estado: 'FAIL', detalle: `${base}. ${problemas.join('; ')}.` } : { estado: 'PASS', detalle: `${base}. Coincide con lo esperado.` };
}

/** Abre la «Consulta Gráfica» del caso desde su fila del buscador, pulsa «Ruta» y lee los nodos (solo lectura). */
export async function leerRecorridoGrafico(page: Page, numero: string, proceso?: string): Promise<{ numero: string; encabezado: string; nodos: NodoGrafico[]; completo: boolean }> {
  const e = await buscarCaso(page, numero, proceso);
  await (await unicoVisible(e.fila.locator(SdeObjects.iconoConsultaGrafica), `el ícono «Ver Consulta Gráfica» del caso ${numero}`)).click();
  const dialogo = await unicoVisible(page.locator(SdeObjects.dialogoConsultaGrafica), 'el diálogo «Consulta Gráfica»', 30_000);
  await dialogo.locator(SdeObjects.nodoGrafico).first().waitFor({ state: 'attached', timeout: 30_000 });
  const ruta = dialogo.getByText('Ruta', { exact: true }).filter({ visible: true });
  let completo = false;
  if ((await ruta.count()) === 1) {
    await ruta.click();
    // El portal marca la ruta de forma progresiva (animación; casos 654/656/668, 2026-10-19): leer antes de terminar haría
    // pasar trivialmente una aserción negativa. Completa = el conteo de marcados es estable y el nodo actual ya está marcado.
    let previo = -1;
    let estables = 0;
    for (const limite = Date.now() + 30_000; Date.now() < limite;) {
      const estado = await dialogo.locator(SdeObjects.nodoGrafico).evaluateAll((els) => {
        const cl = els.map((el) => el.getAttribute('class') ?? '');
        const marcados = cl.filter((c) => c.includes('processviewer-highlighted')).length;
        const actuales = cl.filter((c) => c.includes('processviewer-shape-selected'));
        return { marcados, actualesMarcados: actuales.length > 0 && actuales.every((c) => c.includes('processviewer-highlighted')) };
      });
      estables = estado.marcados === previo ? estables + 1 : 0;
      previo = estado.marcados;
      if (estables >= 3 && estado.actualesMarcados) { completo = true; break; }
      await page.waitForTimeout(1_000);
    }
  }
  // Encabezado «Caso:» (encabezado de fila) seguido de su valor (caso 654, 2026-10-19).
  const encabezado = await dialogo.getByRole('rowheader', { name: 'Caso:', exact: true }).first().locator('xpath=following-sibling::*[1]').innerText({ timeout: 10_000 }).catch(() => '');
  const nodos = await dialogo.locator(SdeObjects.nodoGrafico).evaluateAll((els) => els.map((el) => {
    const clases = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    return {
      nombre: (el.textContent ?? '').replace(/\s+/g, ' ').replace(/^\d+(?=\S)/, '').trim(),
      tipos: clases.filter((c) => !c.startsWith('processviewer-')),
      recorrido: clases.includes('processviewer-highlighted'),
      actual: clases.includes('processviewer-shape-selected'),
    };
  }));
  return { numero, encabezado: encabezado.trim(), nodos, completo };
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
  // Verificación: la reasignación solo cuenta si persiste al volver a consultar.
  for (const fin = Date.now() + (o.maximoMs ?? 60_000); ;) {
    const d = await abrirAdministracionCasos(page);
    const ahora = (await consultarTareasAdmin(page, d, numero)).find((t) => t.taskName === nombre);
    if (ahora && usuarioDe(ahora.assignee) === meta) return { reasignada: true, detalle: `"${actividad}" del caso ${numero} ${previa}; se reasignó al usuario de pruebas y la consulta posterior lo confirma.` };
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
        const n = await hayLineaExacta(amb, texto(val as string));
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
      const { columnas, filas } = await contenedorTabla(ambitoActual(ui), p.tabla as string);
      const faltan = ((p.columnas as string[]) ?? []).filter((c) => !columnas.includes(normaliza(c)));
      const n = await filas.count();
      if (faltan.length) throw new Error(`"${p.tabla}": faltan columnas ${faltan.join(', ')} (vistas: ${columnas.filter(Boolean).join(', ')})`);
      // "comparar" (HU06, extracción del Worker AI): valores introducidos en la narrativa frente a los observados por columna.
      // Es OBSERVACIÓN, no aserción: el contrato de extracción (granularidad, número de filas) no está confirmado por QA.
      const comparacion: string[] = [];
      for (const [col, esperados] of Object.entries((p.comparar as Record<string, string[]>) ?? {})) {
        const idx = columnas.indexOf(normaliza(col));
        if (idx < 0) throw new Error(`"${p.tabla}": columna "${col}" inexistente para comparar (vistas: ${columnas.filter(Boolean).join(', ')})`);
        const observados: string[] = [];
        for (let k = 0; k < n; k++) observados.push(normaliza((await filas.nth(k).locator('td').allInnerTexts())[idx] ?? ''));
        const valores = esperados.map((v) => normaliza(ctx.resolver(v)));
        const encontrados = valores.filter((v) => observados.includes(v));
        const extra = observados.filter((v) => v && !valores.includes(v));
        comparacion.push(`${col}: ${encontrados.length} de ${valores.length} introducidos aparecen` +
          `${valores.length > encontrados.length ? ` (faltan: ${valores.filter((v) => !encontrados.includes(v)).join(', ')})` : ''}` +
          `${extra.length ? `; otros valores: ${[...new Set(extra)].join(', ')}` : ''}`);
      }
      if (p.minimo_filas != null && n < (p.minimo_filas as number)) {
        throw new Error(`"${p.tabla}": ${n} fila(s), mínimo ${p.minimo_filas}${comparacion.length ? ` | ${comparacion.join(' | ')}` : ''}`);
      }
      return { detalle: `"${p.tabla}": ${n} fila(s); columnas [${columnas.filter(Boolean).join(', ')}]${comparacion.length ? ` | ${comparacion.join(' | ')}` : ''}` };
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
      await fila.click();
      await (await accionDeFila(fila, cont, 'Editar', p.tabla as string)).click();
      ui.dialogo = await unicoVisible(page.locator(SdeObjects.dialogo), 'el pop-up de edición');
      ctx.dialogoAbierto = true;
      ui.tabla = { tabla: p.tabla as string, fila: i, filasAntes: n, contenidoFila };
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
        // «Impide registrar» (HU06-CP02 P18): QA mostró dos comportamientos válidos en cuanto al registro: el pop-up queda abierto
        // (caso 653) o se cierra SIN guardar el valor (caso 668, la fila conserva el anterior). Se exige que el valor no quede
        // registrado; si queda abierto, se restaura el valor válido y se cierra con «Guardar» en este mismo paso.
        const campo = ctx.resolver(p.campo as string);
        const rechazado = normaliza(ctx.resolver(p.valor_rechazado as string));
        const t = ui.tabla;
        if (await dialogo.isVisible()) {
          await diligenciar(dialogo, campo, ctx.resolver(p.restaurar as string), 'texto');
          await confirmarDialogo(dialogo);
          await esperarCarga(page);
          // Lo exigido por la matriz (no registrar) se cumplió. Que tras restaurar un valor válido «Guardar» no cierre (casos 653 y
          // 669) es un comportamiento aparte, por confirmar (P-21a): se informa sin convertirlo en el resultado de este paso.
          if (await dialogo.isVisible()) return { detalle: `No registra «${rechazado}»: el pop-up quedó abierto. ⚠ P-21a: tras restaurar un valor válido, «Guardar» no cerró el pop-up; queda abierto (el caso puede quedar inutilizable).` };
          ui.dialogo = undefined; ctx.dialogoAbierto = false; ui.tabla = undefined;
          return { detalle: `No registra «${rechazado}»: el pop-up quedó abierto; se restauró un valor válido y «Guardar» lo cerró.` };
        }
        ui.dialogo = undefined; ctx.dialogoAbierto = false; ui.tabla = undefined;
        if (t?.fila == null) throw new Error('no_registra solo aplica a la edición de una fila existente.');
        const { columnas, filas } = await contenedorTabla(page, t.tabla);
        const idx = columnas.indexOf(normaliza(campo));
        if (idx < 0) throw new Error(`"${t.tabla}": columna "${campo}" inexistente.`);
        let valor = '';
        for (const limite = Date.now() + 15_000; ;) {
          valor = normaliza((await filas.nth(t.fila - 1).locator('td').allInnerTexts())[idx] ?? '');
          if (valor === rechazado || Date.now() > limite) break;
          await page.waitForTimeout(1_500);
        }
        if (valor === rechazado) throw new Error(`"${t.tabla}": se registró «${rechazado}» en la fila ${t.fila} (debía impedirse).`);
        return { detalle: `No registra «${rechazado}»: el pop-up se cerró y la fila ${t.fila} conserva «${valor}».` };
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
      const despues = await filas.count();
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
