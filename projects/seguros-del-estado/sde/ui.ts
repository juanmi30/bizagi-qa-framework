import type { Page, Locator } from '@playwright/test';
import { SdeObjects } from '../baseObjects/sde.objects';

/**
 * Primitivas UI ESTRICTAS para SDE (calibradas contra el DOM real de QA el 2026-10-08). Reglas:
 *  - una etiqueta se ubica por texto EXACTO (sensible a tildes y mayúsculas); solo se tolera un
 *    "*" o ":" final, que es formato y no ortografía;
 *  - si una etiqueta se repite en pantalla, el escenario la acota por grupo: "Grupo › Etiqueta";
 *  - si algo debe ser único y no lo es, falla con un mensaje claro (nada de .first() a ciegas);
 *  - toda escritura se confirma leyendo el valor resultante (post-condición).
 */

export type Ambito = Page | Locator;

/**
 * Una verificación no pudo concluir: la pantalla no es la esperada, está vacía o no aporta los elementos que la
 * verificación necesita. NUNCA es una aprobación (R1, auditoría de Work del PR #2): ausencia de evidencia no es ausencia
 * de defectos. Se clasifica como AUTOMATIZACION (no se atribuye al producto).
 */
export class NoConcluyenteError extends Error {
  constructor(detalle: string) {
    super(`NO CONCLUYENTE: ${detalle}`);
    this.name = 'NoConcluyenteError';
  }
}

export class CalibracionError extends Error {
  constructor(clave: string, detalle: string) {
    super(`[calibrar SdeObjects.${clave}] ${detalle}`);
    this.name = 'CalibracionError';
  }
}

export const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const normaliza = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** Texto exacto de etiqueta, admitiendo espacios, marca de obligatorio y dos puntos al final. */
export function regexEtiqueta(etiqueta: string): RegExp {
  return new RegExp(`^\\s*${escapar(normaliza(etiqueta)).replace(/ /g, '\\s+')}\\s*\\*?\\s*:?\\s*$`);
}
/** Texto exacto (sin tolerancias), normalizando espacios. */
export const regexExacto = (t: string): RegExp => new RegExp(`^\\s*${escapar(normaliza(t)).replace(/ /g, '\\s+')}\\s*$`);

export function paginaDe(ambito: Ambito): Page {
  return 'page' in ambito && typeof (ambito as Locator).page === 'function' ? (ambito as Locator).page() : (ambito as Page);
}

/**
 * Rastreador de las acciones de forma de Bizagi (POST /Rest/Handlers/MultiAction: SUBMITDATA, EXECUTERULE...).
 * La forma SDE re-ejecuta reglas en cadena tras cada cambio (Bizagi lo advierte como "llamadas iterativas");
 * interactuar mientras eso ocurre hace que los clics caigan sobre controles que se están repintando.
 */
const rastreo = new WeakMap<Page, { enCurso: number; ultimo: number }>();
export function rastrearAcciones(page: Page): void {
  if (rastreo.has(page)) return;
  const r = { enCurso: 0, ultimo: Date.now() };
  rastreo.set(page, r);
  const es = (url: string) => url.includes(SdeObjects.rutaAcciones);
  page.on('request', (q) => { if (es(q.url())) { r.enCurso++; r.ultimo = Date.now(); } });
  const fin = (q: { url(): string }) => { if (es(q.url())) { r.enCurso = Math.max(0, r.enCurso - 1); r.ultimo = Date.now(); } };
  page.on('requestfinished', fin);
  page.on('requestfailed', fin);
}

/** Espera a que la forma quede QUIETA: sin acciones en curso durante `ventanaMs` y sin cargador visible. */
export async function esperarFormaQuieta(page: Page, timeout = 60_000, ventanaMs = 1_500): Promise<void> {
  rastrearAcciones(page);
  const r = rastreo.get(page)!;
  const limite = Date.now() + timeout;
  for (;;) {
    const cargando = await page.locator(SdeObjects.carga).filter({ visible: true }).count().catch(() => 0);
    if (r.enCurso === 0 && cargando === 0 && Date.now() - r.ultimo >= ventanaMs) return;
    if (Date.now() > limite) throw new Error(`La forma no quedó quieta en ${Math.round(timeout / 1000)} s (acciones en curso: ${r.enCurso}, cargadores: ${cargando}).`);
    await page.waitForTimeout(250); // intervalo de sondeo de la condición anterior
  }
}

export async function esperarCarga(page: Page, timeout = 30_000): Promise<void> {
  await page.locator(SdeObjects.carga).filter({ visible: true }).first()
    .waitFor({ state: 'hidden', timeout }).catch(() => undefined); // si nunca apareció un loader, no hay nada que esperar
  await page.waitForLoadState('networkidle', { timeout }).catch(() => undefined);
  if (rastreo.has(page)) await esperarFormaQuieta(page, timeout);
}

/** Exige exactamente UN elemento visible; espera hasta `timeout` a que aparezca al menos uno. */
export async function unicoVisible(loc: Locator, descripcion: string, timeout = 15_000): Promise<Locator> {
  const visibles = loc.filter({ visible: true });
  const limite = Date.now() + timeout;
  for (;;) {
    const resta = limite - Date.now();
    try {
      await visibles.first().waitFor({ state: 'visible', timeout: Math.max(resta, 1) });
    } catch {
      throw new Error(`No se encontró visible: ${descripcion}`);
    }
    const n = await visibles.count();
    if (n === 1) return visibles.first();
    if (n > 1) throw new Error(`Se esperaba exactamente 1 elemento visible para ${descripcion}; hay ${n}. Ambigüedad: no se elige uno al azar.`);
    // n === 0: el formulario se re-renderizó entre la espera y el conteo (Bizagi re-pinta la forma); se vuelve a esperar.
    if (Date.now() >= limite) throw new Error(`No se encontró visible: ${descripcion} (la forma se re-renderizó)`);
  }
}

/** Grupo/sección por su título exacto. */
export async function grupo(ambito: Ambito, titulo: string, timeout?: number): Promise<Locator> {
  // El título es HIJO DIRECTO del grupo: así un grupo externo no "hereda" el título de uno anidado.
  const titulo_ = paginaDe(ambito).locator(`:scope > ${SdeObjects.grupoTitulo}`).filter({ hasText: regexEtiqueta(titulo) });
  return unicoVisible(ambito.locator(SdeObjects.grupo).filter({ has: titulo_ }), `el grupo "${titulo}"`, timeout);
}

/** Elementos cuyo texto completo es exactamente `re` y que no contienen otro igual (el más interno). */
export function textoInterno(ambito: Ambito, re: RegExp): Locator {
  const page = paginaDe(ambito);
  return ambito.locator('*').filter({ hasText: re }).filter({ hasNot: page.locator('*').filter({ hasText: re }) });
}

/** Separa "Grupo › Etiqueta" en ámbito + etiqueta. */
async function resolverReferencia(ambito: Ambito, ref: string, timeout?: number): Promise<{ ambito: Ambito; texto: string }> {
  const partes = ref.split(SdeObjects.separadorGrupo);
  if (partes.length === 1) return { ambito, texto: ref };
  let a: Ambito = ambito;
  for (const g of partes.slice(0, -1)) a = await grupo(a, g, timeout);
  return { ambito: a, texto: partes[partes.length - 1] };
}

/** Etiqueta visible y única (texto exacto) dentro del ámbito. */
export async function etiqueta(ambito: Ambito, ref: string, timeout?: number): Promise<Locator> {
  const r = await resolverReferencia(ambito, ref, timeout);
  try {
    return await unicoVisible(textoInterno(r.ambito, regexEtiqueta(r.texto)), `la etiqueta "${ref}"`, timeout);
  } catch (e) {
    // Desempate ESTRICTO: si el texto se repite (p. ej. el campo "Placa" y la opción "Placa" del radio Forma de Consulta
    // Unitaria, observado con el intermediario el 2026-10-13), vale la etiqueta de CAMPO si es la única. Si no, el error sigue.
    if (!/Se esperaba exactamente 1/.test((e as Error).message)) throw e;
    const deCampo = r.ambito.locator(SdeObjects.etiquetaCampo).filter({ visible: true }).filter({ hasText: regexEtiqueta(r.texto) });
    if ((await deCampo.count()) === 1) return deCampo;
    throw e;
  }
}

/** Contenedor Bizagi del campo con esa etiqueta (el más interno que la contiene). */
export async function campo(ambito: Ambito, ref: string, timeout?: number): Promise<Locator> {
  const r = await resolverReferencia(ambito, ref, timeout);
  await etiqueta(r.ambito, r.texto, timeout); // única y visible en el ámbito (con el desempate de etiqueta de campo)
  const re = regexEtiqueta(r.texto);
  // Preferir el contenedor cuya ETIQUETA DE CAMPO es el texto (no el que solo lo contiene como opción de un radio).
  const porEtiquetaDeCampo = r.ambito.locator(SdeObjects.contenedorCampo).filter({ visible: true })
    .filter({ has: paginaDe(ambito).locator(SdeObjects.etiquetaCampo).filter({ hasText: re }).filter({ visible: true }) });
  const contenedores = (await porEtiquetaDeCampo.count()) > 0 ? porEtiquetaDeCampo
    : r.ambito.locator(SdeObjects.contenedorCampo).filter({ visible: true })
      .filter({ has: paginaDe(ambito).locator('*').filter({ hasText: re }).filter({ visible: true }) });
  if ((await contenedores.count()) === 0) {
    throw new CalibracionError('contenedorCampo', `la etiqueta "${ref}" está visible pero no dentro de "${SdeObjects.contenedorCampo}".`);
  }
  // Las coincidencias son ancestros anidados de la MISMA etiqueta única: el último en orden de documento es el más interno.
  return contenedores.last();
}

export interface InfoCampo {
  clases: string;
  etiquetaTexto: string;
  marcaSoloLectura: boolean;
  marcaObligatorio: boolean;
  controles: { tag: string; tipo: string; rol: string; readonly: boolean; disabled: boolean; requerido: boolean; valor: string }[];
  texto: string;          // texto visible del contenedor (para campos de solo visualización)
}

export async function infoCampo(contenedor: Locator, texto: string): Promise<InfoCampo> {
  const info = await contenedor.evaluate((el, s) => {
    const visible = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); const st = getComputedStyle(e); return (r.width > 0 || r.height > 0) && st.visibility !== 'hidden' && st.display !== 'none'; };
    const controles = [...el.querySelectorAll(s.controles)].filter(visible).map((c) => {
      const h = c as HTMLInputElement;
      const valor = c.tagName === 'SELECT' ? ((c as HTMLSelectElement).selectedOptions[0]?.text ?? '')
        : h.type === 'radio' || h.type === 'checkbox' ? (h.checked ? (el.querySelector(`label[for="${CSS.escape(h.id)}"]`) as HTMLElement | null)?.innerText ?? 'on' : '')
          : (h.value ?? (c as HTMLElement).innerText ?? '');
      return {
        tag: c.tagName.toLowerCase(), tipo: h.type ?? '', rol: c.getAttribute('role') ?? '',
        readonly: h.readOnly === true || c.getAttribute('aria-readonly') === 'true',
        disabled: h.disabled === true || c.getAttribute('aria-disabled') === 'true',
        requerido: h.required === true || c.getAttribute('aria-required') === 'true',
        valor,
      };
    });
    return {
      clases: (el as HTMLElement).className ?? '', texto: (el as HTMLElement).innerText ?? '', controles,
      marcaSoloLectura: !!el.querySelector(s.ro), marcaObligatorio: !!el.querySelector(s.req),
    };
  }, { controles: SdeObjects.controles, ro: SdeObjects.marcaSoloLectura, req: SdeObjects.marcaObligatorio });
  return { ...info, etiquetaTexto: texto };
}

export function estaSoloLectura(i: InfoCampo): boolean {
  if (SdeObjects.claseSoloLectura.test(i.clases) || i.marcaSoloLectura) return true;
  const editables = i.controles.filter((c) => !c.readonly && !c.disabled && c.tipo !== 'file');
  return editables.length === 0;
}

/** Obligatoriedad: marca de Bizagi (solo visible con el campo VACÍO), "*" en la etiqueta o atributo required. */
export function esObligatorio(i: InfoCampo, textoEtiquetaVisible: string): boolean {
  return SdeObjects.claseObligatorio.test(i.clases) || i.marcaObligatorio || /\*\s*:?\s*$/.test(textoEtiquetaVisible) || i.controles.some((c) => c.requerido);
}

const PLACEHOLDER_COMBO = /^Por favor seleccione/i;

/** Valor mostrado por el campo: el del control si lo hay; si no, el texto visible sin la etiqueta. */
export function valorMostrado(i: InfoCampo): string {
  const radios = i.controles.filter((c) => c.tipo === 'radio' || c.tipo === 'checkbox');
  if (radios.length) return normaliza(radios.find((c) => c.valor)?.valor ?? '');
  const conValor = i.controles.find((c) => c.tipo !== 'file' && normaliza(c.valor) !== '');
  if (conValor) return PLACEHOLDER_COMBO.test(normaliza(conValor.valor)) ? '' : normaliza(conValor.valor);
  if (i.controles.length) return '';
  return normaliza(normaliza(i.texto).replace(regexEtiquetaPrefijo(i.etiquetaTexto), ''));
}
const regexEtiquetaPrefijo = (t: string) => new RegExp(`^${escapar(normaliza(t))}\\s*\\*?\\s*:?\\s*`);

async function controlEditable(contenedor: Locator, texto: string): Promise<Locator> {
  const editables = 'input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"]):not([readonly]):not([disabled]):not([aria-readonly="true"]), ' +
    'select:not([disabled]), textarea:not([readonly]):not([disabled]), [contenteditable="true"]';
  return unicoVisible(contenedor.locator(editables), `el control editable de "${texto}"`);
}

/** Abre la lista de un combo y elige la opción EXACTA; reabre si el combo dependiente aún cargaba (idempotente). */
async function elegirEnCombo(page: Page, cont: Locator, ref: string, valor: string): Promise<void> {
  const combo = cont.locator(SdeObjects.combo);
  if ((await combo.count()) !== 1) {
    // select nativo (otros portales) o control no combo
    const sel = await controlEditable(cont, ref);
    if (await sel.evaluate((e) => e.tagName === 'SELECT')) { await sel.selectOption({ label: valor }); return; }
    throw new CalibracionError('combo', `"${ref}" no tiene un input[role=combobox] único ni un <select>.`);
  }
  const lista = await combo.getAttribute('aria-controls');
  if (!lista) throw new CalibracionError('combo', `el combo de "${ref}" no declara aria-controls.`);
  const opcion = page.locator(SdeObjects.opcionesDe(lista)).filter({ visible: true }).filter({ hasText: regexExacto(valor) });
  const limite = Date.now() + 45_000;
  await combo.click();
  // Abrir una lista es idempotente: si el combo se re-renderizó (cascadas Línea → Ramo) se reabre.
  while (!(await opcion.first().waitFor({ state: 'visible', timeout: 4_000 }).then(() => true).catch(() => false))) {
    if (Date.now() > limite) {
      // Cada clic abre o cierra la lista: si quedó cerrada, se abre una vez más para informar las opciones REALES
      // (el 2026-10-14 se informó "ninguna" cuando la lista mostraba los ramos con otro formato, "48 - …").
      const todas = page.locator(SdeObjects.opcionesDe(lista)).filter({ visible: true });
      if ((await todas.count()) === 0) { await combo.click(); await todas.first().waitFor({ state: 'visible', timeout: 4_000 }).catch(() => undefined); }
      const vistas = await todas.allInnerTexts();
      throw new Error(`"${ref}": la opción "${valor}" no está en la lista (visibles: ${vistas.map(normaliza).join(' | ') || 'ninguna'}).`);
    }
    await combo.click();
  }
  const n = await opcion.count();
  if (n !== 1) throw new Error(`"${ref}": la opción "${valor}" aparece ${n} veces.`);
  await opcion.click();
  await page.waitForFunction(([sel, v]) => (document.querySelector(sel) as HTMLInputElement | null)?.value === v,
    [`input[aria-controls="${lista}"]`, valor] as const, { timeout: 30_000 })
    .catch(() => undefined); // la post-condición general de diligenciar() reporta el valor real si no coincide
}

/** Diligencia un campo y confirma el valor resultante. */
export async function diligenciar(ambito: Ambito, ref: string, valor: string, tipo: 'texto' | 'lista' | 'radio' | 'area' = 'texto'): Promise<void> {
  const page = paginaDe(ambito);
  await esperarCarga(page); // no interactuar mientras Bizagi re-ejecuta reglas y repinta la forma
  const cont = await campo(ambito, ref);
  if (tipo === 'radio') {
    const opcion = await unicoVisible(cont.locator(SdeObjects.radioOpcion).filter({ hasText: regexExacto(valor) }), `la opción "${valor}" de "${ref}"`);
    await opcion.click();
    const id = await opcion.getAttribute('for');
    const marcado = id ? await page.locator(`[id="${id}"]`).isChecked() : false;
    if (!marcado) throw new Error(`"${ref}": tras elegir "${valor}" la opción no quedó marcada.`);
    await esperarCarga(page);
    return;
  }
  if (tipo === 'lista') {
    await elegirEnCombo(page, cont, ref, valor);
  } else {
    const ctl = await controlEditable(cont, ref);
    await ctl.fill(valor);
    await ctl.press('Tab');
  }
  await esperarCarga(page);
  const resultante = valorMostrado(await infoCampo(await campo(ambito, ref), ref));
  if (resultante !== normaliza(valor)) {
    throw new Error(`"${ref}": el formulario muestra "${resultante}" tras diligenciar "${valor}".`);
  }
}

/**
 * Prueba negativa (UI-05): vacía el control y TECLEA el valor como un usuario (las máscaras y el maxlength actúan
 * tecla a tecla), sale del campo y devuelve lo que el formulario MUESTRA. No exige que coincida con lo tecleado.
 */
export async function teclear(ambito: Ambito, ref: string, valor: string): Promise<string> {
  const page = paginaDe(ambito);
  await esperarCarga(page);
  const ctl = await controlEditable(await campo(ambito, ref), ref);
  await ctl.fill('');
  await ctl.pressSequentially(valor);
  await ctl.press('Tab');
  await esperarCarga(page);
  return valorMostrado(await infoCampo(await campo(ambito, ref), ref));
}

/** Un campo visible del formulario, en orden de lectura (orden del documento), con su presentación. Sin valores. */
/** conValor: el campo muestra un valor (sin revelarlo); con valor, la marca de obligatorio de Bizagi ya no es concluyente. */
export interface CampoInventario { etiqueta: string; grupo: string; obligatorio: boolean; soloLectura: boolean; conValor: boolean; controles: string[] }

/**
 * Inventario de los campos VISIBLES del ámbito en orden de lectura: etiqueta, grupo, obligatoriedad (marca de Bizagi:
 * solo visible con el campo vacío) y solo lectura. Lo usan la verificación "orden" y las propuestas de expectativas.
 */
export async function inventarioCampos(ambito: Ambito): Promise<CampoInventario[]> {
  await esperarCarga(paginaDe(ambito));
  const etiquetas = ambito.locator(SdeObjects.etiquetaCampo).filter({ visible: true });
  const out: CampoInventario[] = [];
  for (let i = 0, n = await etiquetas.count(); i < n; i++) {
    const lbl = etiquetas.nth(i);
    const texto = normaliza(await lbl.innerText());
    const cont = lbl.locator(SdeObjects.contenedorDeEtiqueta);
    if (!texto || (await cont.count()) !== 1) continue;
    const info = await infoCampo(cont, texto);
    const grupo = await cont.evaluate((el, s) => {
      const g = el.closest(s.grupo);
      const h = g ? [...g.children].find((c) => c.matches(s.titulo)) : null;
      return h ? (h as HTMLElement).innerText : '';
    }, { grupo: SdeObjects.grupo, titulo: SdeObjects.grupoTitulo });
    out.push({ etiqueta: texto, grupo: normaliza(grupo), obligatorio: esObligatorio(info, texto), soloLectura: estaSoloLectura(info), conValor: valorMostrado(info) !== '', controles: [...new Set(info.controles.map((c) => c.tipo || c.tag))] });
  }
  return out;
}

/**
 * Textos de presentación visibles del ámbito (SdeObjects.textosPresentacion + botones), sin repetir. Nunca valores.
 * Única ausencia tolerada: que la pantalla no tenga zona de botones (consulta completada sin error). Cualquier error al
 * consultar se PROPAGA para clasificarse; nunca se convierte en "sin textos".
 */
export async function textosVisibles(ambito: Ambito): Promise<string[]> {
  await esperarCarga(paginaDe(ambito));
  const textos: string[] = [];
  for (const sel of SdeObjects.textosPresentacion) textos.push(...await ambito.locator(sel).filter({ visible: true }).allInnerTexts());
  const hayBotones = (await ambito.locator(SdeObjects.areaBotones).filter({ visible: true }).count()) > 0;
  if (hayBotones) textos.push(...await botonesVisibles(ambito));
  return [...new Set(textos.map(normaliza).filter(Boolean))];
}

/** Adjunta un archivo en el control de carga del campo y confirma que el nombre aparece. */
export async function adjuntar(ambito: Ambito, ref: string, ruta: string): Promise<void> {
  const cont = await campo(ambito, ref);
  const inputs = cont.locator('input[type="file"]');
  const n = await inputs.count();
  if (n !== 1) throw new CalibracionError('contenedorCampo', `"${ref}" tiene ${n} input[type=file]; se esperaba 1.`);
  await inputs.setInputFiles(ruta);
  const nombre = ruta.split(/[\\/]/).pop()!;
  await cont.getByText(nombre, { exact: false }).first().waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => { throw new Error(`"${ref}": el archivo "${nombre}" no aparece como adjunto.`); });
}

export async function pulsar(ambito: Ambito, texto: string): Promise<void> {
  const boton = await unicoVisible(ambito.getByRole('button', { name: texto, exact: true }), `el botón "${texto}"`);
  await boton.click();
}

/** Textos de los botones visibles en la zona de botones (button o input.ui-bizagi-button). */
export async function botonesVisibles(ambito: Ambito): Promise<string[]> {
  const area = ambito.locator(SdeObjects.areaBotones).filter({ visible: true });
  if ((await area.count()) === 0) throw new CalibracionError('areaBotones', 'no hay zona de botones visible.');
  const textos = await area.getByRole('button').filter({ visible: true })
    .evaluateAll((bs) => bs.map((b) => ((b as HTMLInputElement).value || (b as HTMLElement).innerText || '').trim()));
  return [...new Set(textos.map(normaliza).filter(Boolean))];
}

/** ¿Cuántos textos visibles exactamente iguales hay? (para no_visible / visible) */
export async function hayTextoVisible(ambito: Ambito, texto: string, comoEtiqueta = true): Promise<number> {
  const r = await resolverReferencia(ambito, texto).catch(() => null);
  if (!r) return 0; // el grupo no está visible → tampoco lo está su contenido
  return textoInterno(r.ambito, comoEtiqueta ? regexEtiqueta(r.texto) : regexExacto(r.texto)).filter({ visible: true }).count();
}

/**
 * ¿Cuántas LÍNEAS visibles son exactamente este texto? Bizagi agrupa textos de ayuda en un solo label con <br>
 * (ej. "Individual: ...<br>Masivo: ..."): cada línea debe coincidir completa (tildes, mayúsculas y puntuación).
 */
export async function hayLineaExacta(ambito: Ambito, texto: string): Promise<number> {
  const objetivo = normaliza(texto);
  const candidatos = textoInterno(ambito, new RegExp(escapar(objetivo).replace(/ /g, '\\s+'))).filter({ visible: true });
  const lineas = await candidatos.evaluateAll((els) => els.flatMap((e) => (e as HTMLElement).innerText.split('\n')));
  return lineas.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l === objetivo).length;
}

/** Líneas visibles que CONTIENEN el texto sin ser exactamente él (diagnóstico de texto_exacto: presente, pero no como línea propia). */
export async function lineasQueContienen(ambito: Ambito, texto: string): Promise<string[]> {
  const objetivo = normaliza(texto);
  const candidatos = textoInterno(ambito, new RegExp(escapar(objetivo).replace(/ /g, '\\s+'))).filter({ visible: true });
  const lineas = await candidatos.evaluateAll((els) => els.flatMap((e) => (e as HTMLElement).innerText.split('\n')));
  return [...new Set(lineas.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l !== objetivo && l.includes(objetivo)))];
}
