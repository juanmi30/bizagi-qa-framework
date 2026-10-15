import type { BrowserContext, Page, Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { SdeObjects } from '../baseObjects/sde.objects';

/**
 * Política de SOLO LECTURA ESTRICTA (P-15). Hay DOS modalidades (decisión de Juan Miguel, 2026-10-15):
 *  - Inspección de solo lectura (`soloLectura: true`): promete no modificar nada persistente. Esta política la hace cumplir.
 *  - Ejecución funcional controlada en QA (por defecto): crea, diligencia, guarda, adjunta y avanza lo que el escenario
 *    exija. NO pasa por esta política; la gobiernan P-06 (SDE_E2E=1), la barrera de pop-ups (UI-10/BUG-03), los datos
 *    autorizados y el registro/cierre de los casos creados.
 * P-06 decide SI una ejecución real puede correr; esta política decide QUÉ puede hacer una inspección de solo lectura.
 *
 * Tres capas, todas activas cuando el UI se crea con `soloLectura: true`:
 *  1. Capacidades (centralizada en crearCapacidadesUi y en el ejecutor): cada capacidad se clasifica por su EFECTO real.
 *     Lo que no está clasificado se trata como escritura (denegar por defecto). Se rechaza ANTES de ejecutarse.
 *  2. Navegador (guardia DOM instalada en el contexto): neutraliza, en fase de captura, los clics y cargas sobre
 *     componentes que en Bizagi persisten datos (zona de botones de la actividad, acciones de grilla, botones de diálogos,
 *     controles de carga de archivos). Cubre también el código que usa Playwright directamente.
 *  3. Red (endpoint de acciones de Bizagi): fuera del formulario de inicio IDENTIFICADO se aborta TODA acción (SUBMITDATA,
 *     EXECUTERULE, desconocidas…): teclear o elegir valores con Playwright directo sobre un caso existente no llega al
 *     servicio. Dentro del formulario de inicio (sin caso, evidencia positiva) solo se abortan CREATENEWCASE y
 *     ADDRELATIONWITHDATA. Se registra el NOMBRE de cada acción, nunca los datos.
 *
 * Evidencia positiva del formulario de inicio (F2, auditoría de Work): `nuevo_caso` lo abrió en ESTA ejecución y su diálogo
 * sigue visible. La ausencia de número de caso NO demuestra que se esté en precreación.
 * Límites restantes: ver docs/orquestacion/SEGURIDAD-SOLO-LECTURA.md.
 */

export type ClaseOperacion =
  | 'observacion'          // solo lee o navega sin persistir
  | 'formulario_inicio'    // escribe en el formulario de inicio: permitido SOLO con evidencia positiva de precreación
  | 'no_determinado'       // efecto desconocido (p. ej. abrir una actividad): denegado en solo lectura; permitido en funcional
  | 'escritura';           // crea, guarda, modifica, envía, elimina, adjunta, radica o completa

export interface Operacion { clase: ClaseOperacion; efecto: string }

/** Clasificación de las capacidades del motor SDE por su efecto conocido (no por el texto de un botón). */
export const OPERACIONES: Record<string, Operacion> = {
  iniciar_sesion: { clase: 'observacion', efecto: 'inicia sesión; no modifica casos' },
  nuevo_caso: { clase: 'observacion', efecto: 'abre el formulario de inicio (aporta la evidencia positiva de precreación); el caso no existe hasta "Crear"' },
  diligenciar: { clase: 'formulario_inicio', efecto: 'escribe valores; sobre un caso existente Bizagi los envía (SUBMITDATA)' },
  intentar_diligenciar: { clase: 'formulario_inicio', efecto: 'teclea un valor; sobre un caso existente Bizagi lo envía' },
  verificar: { clase: 'observacion', efecto: 'solo lee la pantalla' },
  verificar_ruta: { clase: 'observacion', efecto: 'consulta el caso en el buscador (idempotente)' },
  abrir_caso: { clase: 'no_determinado', efecto: 'abre una actividad: Bizagi podría asignar o bloquear el work item (sin verificar contra QA)' },
  tabla_verificar: { clase: 'observacion', efecto: 'lee columnas y filas de una grilla' },
  abrir_pestana: { clase: 'observacion', efecto: 'cambia de pestaña y lee su panel' },
  integracion: { clase: 'observacion', efecto: 'declarativa: no toca la UI' },
  no_automatizado: { clase: 'observacion', efecto: 'declarativa: no toca la UI' },
  pulsar: { clase: 'escritura', efecto: 'pulsa un botón de la actividad (Crear, Guardar, Siguiente, Confirmar…): puede crear, guardar o enviar' },
  adjuntar: { clase: 'escritura', efecto: 'sube un archivo' },
  adjuntar_en_grilla: { clase: 'escritura', efecto: 'agrega y guarda una fila de documentos y sube un archivo' },
  tabla_abrir_fila: { clase: 'escritura', efecto: 'abre el pop-up de edición; cerrarlo exige Guardar (BUG-03)' },
  tabla_agregar: { clase: 'escritura', efecto: 'abre el pop-up de adición; cerrarlo exige Guardar (BUG-03)' },
  dialogo_confirmar: { clase: 'escritura', efecto: 'guarda el pop-up de la fila' },
  dialogo_cancelar: { clase: 'escritura', efecto: 'cancela el pop-up: deja el caso inutilizable (BUG-03)' },
  tabla_eliminar_fila: { clase: 'escritura', efecto: 'elimina una fila' },
  tabla_seleccionar_fila: { clase: 'escritura', efecto: 'selecciona una fila; la selección puede persistir en el caso (efecto no determinado)' },
};

/** Una acción rechazada por la política. NO es un defecto del producto: el paso queda BLOCKED (restricción de automatización). */
export class SoloLecturaError extends Error {
  constructor(readonly accion: string, readonly motivo: string) {
    super(`POLÍTICA SOLO LECTURA: se rechazó "${accion}" antes de ejecutarse (${motivo}).`);
    this.name = 'SoloLecturaError';
  }
}

/**
 * Evidencia de contexto. formularioInicio = true SOLO si nuevo_caso abrió el formulario de inicio en esta ejecución y no
 * se ha salido de él (lo pone y lo retira capacidades.ts). Ausencia de evidencia = no se está en precreación (F2).
 */
export interface ContextoLectura { formularioInicio?: boolean }

/** Lanza SoloLecturaError si la capacidad no puede ejecutarse en solo lectura. Lo no clasificado se deniega. */
export function exigirSoloLectura(accion: string, ctx: ContextoLectura): void {
  const op = OPERACIONES[accion];
  if (!op) throw new SoloLecturaError(accion, 'acción no clasificada: se trata como escritura');
  if (op.clase === 'escritura') throw new SoloLecturaError(accion, op.efecto);
  if (op.clase === 'no_determinado') throw new SoloLecturaError(accion, `efecto no determinado: ${op.efecto}`);
  if (op.clase === 'formulario_inicio' && ctx.formularioInicio !== true) {
    throw new SoloLecturaError(accion, `sin evidencia positiva de estar en el formulario de inicio (sin caso): ${op.efecto}`);
  }
}

/** Acciones de red de Bizagi VERIFICADAS como escritura: se abortan en solo lectura incluso en el formulario de inicio. */
export const ACCIONES_RED_ESCRITURA = ['CREATENEWCASE', 'ADDRELATIONWITHDATA'] as const;

export interface RegistroSoloLectura {
  /** Acciones de red abortadas (nombre de la acción, o SIN_NOMBRE si el cuerpo no lo declara). */
  red: string[];
  /** Nombres de acciones permitidas dentro del formulario de inicio identificado (para calibrar; sin datos). */
  observadas: string[];
  estado: {
    /**
     * Instalación de la protección (hallazgo B): solo 'completa' cuando TODAS las partes quedaron instaladas. En
     * 'instalando' o 'fallida' la red aborta toda acción y las capacidades se niegan a operar (fallo cerrado).
     */
    proteccion: 'instalando' | 'completa' | 'fallida';
    /**
     * Permiso TEMPORAL de precreación (hallazgo A): token puesto en el elemento EXACTO del diálogo de inicio identificado.
     * Solo vale mientras ESE elemento siga conectado, visible y siendo el diálogo de inicio; se comprueba en cada solicitud.
     * null = sin permiso. Una vez revocado no se reutiliza: volver a un formulario exige una nueva identificación.
     */
    precreacion: { token: string } | null;
  };
  /** Interceptores de red registrados en el contexto (debe ser 1: sin duplicados aunque se reintente la instalación). */
  rutas: number;
}

/** La protección de solo lectura no quedó instalada por completo: la inspección no puede continuar (nunca es un defecto de Bizagi). */
export class ProteccionNoInstaladaError extends Error {
  constructor(detalle: string) {
    super(`PROTECCIÓN SOLO LECTURA NO INSTALADA: ${detalle}`);
    this.name = 'ProteccionNoInstaladaError';
  }
}

/** Nombres de acción (MAYÚSCULAS) presentes en el cuerpo de una petición de acciones de Bizagi. Nunca devuelve valores. */
export function accionesDeCuerpo(cuerpo: string): string[] {
  return [...new Set([...cuerpo.matchAll(/"?action"?\s*[:=]\s*"?([A-Z][A-Z_]{3,})/g)].map((m) => m[1]))];
}

/**
 * Guardia DOM (se ejecuta en el navegador). Neutraliza en fase de captura los eventos de activación sobre componentes que
 * persisten datos y deja constancia en window.__sdeSoloLectura.bloqueados (tipo de evento + rótulo corto del control).
 */
function guardiaDom(selector: string): void {
  const w = window as unknown as { __sdeSoloLectura?: { bloqueados: string[] } };
  if (w.__sdeSoloLectura) return;
  w.__sdeSoloLectura = { bloqueados: [] };
  const registrar = (tipo: string, el: Element) => {
    // Nunca el valor de un campo (p. ej. la ruta de un archivo): solo el rótulo de botones y controles.
    const esBoton = el instanceof HTMLButtonElement || (el instanceof HTMLInputElement && ['button', 'submit'].includes(el.type));
    const texto = el instanceof HTMLInputElement && el.type === 'file' ? 'archivo'
      : ((esBoton ? (el as HTMLInputElement).value : '') || (el as HTMLElement).innerText || el.getAttribute('title') || el.tagName).trim().slice(0, 40);
    w.__sdeSoloLectura!.bloqueados.push(`${tipo}:${texto}`);
  };
  const objetivo = (e: Event): Element | null => {
    const t = e.target as Element | null;
    return t && typeof t.closest === 'function' ? t.closest(selector) : null;
  };
  for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'submit', 'change', 'input']) {
    window.addEventListener(tipo, (e) => {
      const el = objetivo(e);
      if (!el) return;
      // change/input solo se bloquean en cargas de archivo (teclear lo controla la capa de red).
      if ((tipo === 'change' || tipo === 'input') && !(el instanceof HTMLInputElement && el.type === 'file')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (tipo === 'click' || tipo === 'change' || tipo === 'submit') registrar(tipo, el);
    }, true);
  }
  window.addEventListener('keydown', (e) => {
    const el = objetivo(e);
    if (!el || !['Enter', ' '].includes(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    registrar('keydown', el);
  }, true);
}

/** Selector de componentes que persisten datos en el Work Portal (único lugar: SdeObjects.componentesEscritura). */
const SELECTOR_ESCRITURA = SdeObjects.componentesEscritura.join(', ');

/** Instala la guardia DOM en una página ya cargada (las siguientes la reciben por el script de inicio del contexto). */
export async function instalarGuardiaDom(page: Page): Promise<void> {
  await page.evaluate(guardiaDom, SELECTOR_ESCRITURA);
}

/** Eventos neutralizados por la guardia DOM en la página (tipo:rótulo). */
export async function bloqueosDom(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __sdeSoloLectura?: { bloqueados: string[] } }).__sdeSoloLectura?.bloqueados ?? []);
}

const registros = new WeakMap<BrowserContext, RegistroSoloLectura>();
const enCurso = new WeakMap<BrowserContext, Promise<RegistroSoloLectura>>();
const conScriptDeInicio = new WeakSet<BrowserContext>();
const ATRIBUTO_PRECREACION = 'data-sde-precreacion';

/** Registro de solo lectura de un contexto (undefined si nunca se intentó protegerlo). */
export function registroDe(contexto: BrowserContext): RegistroSoloLectura | undefined {
  return registros.get(contexto);
}

/**
 * ¿Sigue vigente el permiso de precreación EN ESTE MOMENTO? Exige que el elemento exacto marcado al identificar el formulario
 * siga en el documento, visible y siendo el diálogo de inicio. Cualquier otra cosa (navegación, diálogo cerrado u oculto,
 * contenido de la SPA reemplazado, error al comprobar) lo REVOCA de forma definitiva y devuelve false (hallazgo A).
 */
export async function precreacionVigente(page: Page, registro: RegistroSoloLectura): Promise<boolean> {
  const permiso = registro.estado.precreacion;
  if (!permiso) return false;
  const vigente = await page.evaluate(({ atributo, token, selector }) => {
    const el = document.querySelector(`[${atributo}="${token}"]`);
    if (!el || !el.isConnected || !el.matches(selector)) return false;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  }, { atributo: ATRIBUTO_PRECREACION, token: permiso.token, selector: SdeObjects.dialogoInicio }).catch(() => false);
  if (!vigente && registro.estado.precreacion === permiso) registro.estado.precreacion = null;
  return vigente;
}

/** Concede un permiso NUEVO de precreación al diálogo de inicio visible y único de la página (token propio, no reutilizable). */
export async function concederPrecreacion(page: Page, registro: RegistroSoloLectura): Promise<void> {
  registro.estado.precreacion = null;
  const dialogos = page.locator(SdeObjects.dialogoInicio).filter({ visible: true });
  if ((await dialogos.count()) !== 1) throw new Error('No hay evidencia del formulario de inicio: su diálogo no está visible o no es único.');
  const token = randomUUID();
  await dialogos.first().evaluate((el, [atributo, t]) => el.setAttribute(atributo, t), [ATRIBUTO_PRECREACION, token] as const);
  registro.estado.precreacion = { token };
}

/**
 * Protege un CONTEXTO del navegador en solo lectura: guardia de red sobre las acciones de Bizagi y guardia DOM para sus
 * páginas (presentes y futuras). Instalación CONSISTENTE (hallazgo B): el interceptor de red es lo primero y se registra una
 * sola vez; mientras la protección no esté 'completa' ese interceptor aborta toda acción. Solo se marca 'completa' al
 * terminar TODAS las partes; si una falla queda 'fallida' (la red sigue abortando) y se lanza ProteccionNoInstaladaError.
 * Un reintento completa lo que faltó sin duplicar el interceptor; una protección ya completa se devuelve tal cual.
 */
export async function protegerSoloLectura(contexto: BrowserContext): Promise<RegistroSoloLectura> {
  const previo = registros.get(contexto);
  if (previo?.estado.proteccion === 'completa') return previo;
  const pendiente = enCurso.get(contexto);
  if (pendiente) return pendiente;
  const intento = instalar(contexto, previo).finally(() => enCurso.delete(contexto));
  enCurso.set(contexto, intento);
  return intento;
}

async function instalar(contexto: BrowserContext, previo: RegistroSoloLectura | undefined): Promise<RegistroSoloLectura> {
  const registro: RegistroSoloLectura = previo ?? { red: [], observadas: [], estado: { proteccion: 'instalando', precreacion: null }, rutas: 0 };
  registro.estado.proteccion = 'instalando';
  registros.set(contexto, registro); // visible como NO completa: capacidades y red fallan cerrado durante la instalación
  try {
    if (registro.rutas === 0) {
      await contexto.route(`**${SdeObjects.rutaAcciones}*`, (route) => interceptar(route, registro));
      registro.rutas++;
    }
    if (!conScriptDeInicio.has(contexto)) {
      await contexto.addInitScript(guardiaDom, SELECTOR_ESCRITURA);
      conScriptDeInicio.add(contexto);
    }
    for (const p of contexto.pages()) await instalarGuardiaDom(p);
    registro.estado.proteccion = 'completa';
    return registro;
  } catch (e) {
    registro.estado.proteccion = 'fallida';
    // El mensaje dice lo que REALMENTE queda (observación BAJA de Work): sin interceptor registrado, nada se intercepta.
    const red = registro.rutas > 0
      ? 'el interceptor de red está registrado y aborta toda acción mientras la protección no esté completa'
      : 'el interceptor de red NO quedó registrado: ninguna solicitud se intercepta';
    throw new ProteccionNoInstaladaError(`${(e as Error).message.split('\n')[0]} — el contexto queda NO protegido (${red}); la inspección de solo lectura se detiene.`);
  }
}

async function interceptar(route: Route, registro: RegistroSoloLectura): Promise<void> {
  if (route.request().method() === 'GET') return route.fallback();
  const cuerpo = route.request().postData() ?? '';
  const acciones = accionesDeCuerpo(cuerpo);
  const abortar = (motivo: string[]) => { registro.red.push(...motivo); return route.abort('blockedbyclient'); };
  const nombres = acciones.length ? acciones : ['SIN_NOMBRE'];
  // Instalación incompleta o fallida: nada pasa (hallazgo B).
  if (registro.estado.proteccion !== 'completa') return abortar(nombres);
  const prohibida = ACCIONES_RED_ESCRITURA.find((a) => cuerpo.includes(a));
  if (prohibida) return abortar([prohibida]);
  // Fuera del formulario de inicio VIGENTE (comprobado ahora, en la página que hace la solicitud), toda acción se aborta:
  // SUBMITDATA sobre un caso existente persiste y una acción desconocida no se presume segura (F1, hallazgo A).
  let pagina: Page | undefined;
  try { pagina = route.request().frame().page(); } catch { pagina = undefined; }
  if (!pagina || !(await precreacionVigente(pagina, registro))) return abortar(nombres);
  for (const a of acciones) if (!registro.observadas.includes(a)) registro.observadas.push(a);
  return route.fallback();
}
