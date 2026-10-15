import type { BrowserContext, Page } from '@playwright/test';
import { SdeObjects } from '../baseObjects/sde.objects';

/**
 * Política de SOLO LECTURA (P-15). Complementa a P-06 (activación SDE_E2E=1 de las verticales reales): P-06 decide SI una
 * ejecución real puede correr; esta política decide QUÉ puede hacer una ejecución marcada como solo lectura.
 *
 * Tres capas, todas activas cuando el UI se crea con `soloLectura: true`:
 *  1. Capacidades (centralizada en crearCapacidadesUi y en el ejecutor): cada capacidad se clasifica por su EFECTO real.
 *     Lo que no está clasificado se trata como escritura (denegar por defecto). Se rechaza ANTES de ejecutarse.
 *  2. Navegador (guardia DOM instalada en el contexto): neutraliza, en fase de captura, los clics y cargas sobre
 *     componentes que en Bizagi persisten datos (zona de botones de la actividad, acciones de grilla, botones de diálogos,
 *     controles de carga de archivos). Cubre también el código que usa Playwright directamente (rutas indirectas).
 *  3. Red: aborta las acciones de Bizagi verificadas como escritura (CREATENEWCASE, ADDRELATIONWITHDATA) y registra el
 *     NOMBRE de las demás acciones (nunca los datos) para calibrar en una fase posterior.
 *
 * LÍMITES (no es una garantía universal): las acciones de red no verificadas (SUBMITDATA, EXECUTERULE, …) solo se
 * registran; teclear en un campo con Playwright directo sobre un caso existente no lo impide la guardia DOM; abrir una
 * actividad (abrir_caso) puede hacer que Bizagi asigne el work item. Ver docs/orquestacion/SEGURIDAD-SOLO-LECTURA.md.
 */

export type ClaseOperacion =
  | 'observacion'          // solo lee o navega sin persistir
  | 'formulario_inicio'    // escribe en el formulario de inicio: permitido SOLO si aún no existe caso (precreación)
  | 'escritura';           // crea, guarda, modifica, envía, elimina, adjunta, radica o completa

export interface Operacion { clase: ClaseOperacion; efecto: string }

/** Clasificación de las capacidades del motor SDE por su efecto conocido (no por el texto de un botón). */
export const OPERACIONES: Record<string, Operacion> = {
  iniciar_sesion: { clase: 'observacion', efecto: 'inicia sesión; no modifica casos' },
  nuevo_caso: { clase: 'formulario_inicio', efecto: 'abre el formulario de inicio; el caso no existe hasta "Crear"' },
  diligenciar: { clase: 'formulario_inicio', efecto: 'escribe valores; sobre un caso existente Bizagi los envía (SUBMITDATA)' },
  intentar_diligenciar: { clase: 'formulario_inicio', efecto: 'teclea un valor; sobre un caso existente Bizagi lo envía' },
  verificar: { clase: 'observacion', efecto: 'solo lee la pantalla' },
  verificar_ruta: { clase: 'observacion', efecto: 'consulta el caso en el buscador (idempotente)' },
  abrir_caso: { clase: 'observacion', efecto: 'abre la actividad para leerla; Bizagi podría asignar el work item (efecto no determinado)' },
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

/** Una acción rechazada por la política. NO es un defecto del producto ni de la automatización: el paso queda BLOCKED. */
export class SoloLecturaError extends Error {
  constructor(readonly accion: string, readonly motivo: string) {
    super(`POLÍTICA SOLO LECTURA: se rechazó "${accion}" antes de ejecutarse (${motivo}).`);
    this.name = 'SoloLecturaError';
  }
}

/** Contexto mínimo que decide si la escritura en el formulario de inicio es inocua: no debe existir un caso. */
export interface ContextoLectura { numeroCaso: string | null }

/** Lanza SoloLecturaError si la capacidad no puede ejecutarse en solo lectura. Lo no clasificado se deniega. */
export function exigirSoloLectura(accion: string, ctx: ContextoLectura): void {
  const op = OPERACIONES[accion];
  if (!op) throw new SoloLecturaError(accion, 'acción no clasificada: se trata como escritura');
  if (op.clase === 'escritura') throw new SoloLecturaError(accion, op.efecto);
  if (op.clase === 'formulario_inicio' && ctx.numeroCaso) {
    throw new SoloLecturaError(accion, `hay un caso existente (${ctx.numeroCaso}): ${op.efecto}`);
  }
}

/** Acciones de red de Bizagi VERIFICADAS como escritura: se abortan en solo lectura. */
export const ACCIONES_RED_ESCRITURA = ['CREATENEWCASE', 'ADDRELATIONWITHDATA'] as const;

export interface RegistroSoloLectura {
  /** Acciones de red abortadas (nombre de la acción). */
  red: string[];
  /** Nombres de acciones de red observadas y permitidas (para calibrar; sin datos). */
  observadas: string[];
}

/** Nombres de acción (MAYÚSCULAS) presentes en el cuerpo de una petición de acciones de Bizagi. Nunca devuelve valores. */
export function accionesDeCuerpo(cuerpo: string): string[] {
  return [...new Set([...cuerpo.matchAll(/"?action"?\s*[:=]\s*"?([A-Z][A-Z_]{3,})/g)].map((m) => m[1]))];
}

/**
 * Guardia DOM (se ejecuta en el navegador). Neutraliza en fase de captura los eventos de activación sobre componentes que
 * persisten datos y deja constancia en window.__sdeSoloLectura.bloqueados (tipo de evento + texto corto del control).
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
      // change/input solo se bloquean en cargas de archivo (teclear en el formulario de inicio sigue permitido).
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

/** Eventos neutralizados por la guardia DOM en la página (tipo:texto corto). */
export async function bloqueosDom(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __sdeSoloLectura?: { bloqueados: string[] } }).__sdeSoloLectura?.bloqueados ?? []);
}

/**
 * Protege un CONTEXTO del navegador en solo lectura: guardia DOM para todas sus páginas (presentes y futuras) y guardia de
 * red sobre las acciones de Bizagi. Devuelve el registro de lo abortado y lo observado.
 */
export async function protegerSoloLectura(contexto: BrowserContext): Promise<RegistroSoloLectura> {
  const registro: RegistroSoloLectura = { red: [], observadas: [] };
  await contexto.addInitScript(guardiaDom, SELECTOR_ESCRITURA);
  for (const p of contexto.pages()) await instalarGuardiaDom(p).catch(() => undefined); // página sin documento aún: la cubre el script de inicio
  await contexto.route(`**${SdeObjects.rutaAcciones}*`, async (route) => {
    const cuerpo = route.request().postData() ?? '';
    const prohibida = ACCIONES_RED_ESCRITURA.find((a) => cuerpo.includes(a));
    if (prohibida) { registro.red.push(prohibida); return route.abort('blockedbyclient'); }
    for (const a of accionesDeCuerpo(cuerpo)) if (!registro.observadas.includes(a)) registro.observadas.push(a);
    return route.fallback();
  });
  return registro;
}
