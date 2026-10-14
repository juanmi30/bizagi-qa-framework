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
import {
  CalibracionError, adjuntar, botonesVisibles, campo, diligenciar, esObligatorio, esperarCarga, estaSoloLectura,
  etiqueta, hayLineaExacta, hayTextoVisible, infoCampo, normaliza, pulsar, paginaDe, rastrearAcciones, regexEtiqueta, regexExacto, teclear, textoInterno, unicoVisible, valorMostrado, type Ambito,
} from './ui';

/**
 * Capabilities UI de SDE sobre Playwright. Cada una hace UNA cosa observable y confirma su
 * post-condición. Lo que no se puede observar se declara (ver CAPACIDADES_DECLARATIVAS).
 * Un actor = un BrowserContext propio: el cambio de usuario no depende del logout del portal.
 */

/**
 * MODO SOLO LECTURA (diagnósticos y calibraciones): ninguna petición que cree un caso llega a Bizagi. Se instala en el
 * CONTEXTO del navegador (todas sus páginas) y aborta cualquier POST a la ruta de acciones cuyo cuerpo contenga
 * CREATENEWCASE, sin importar qué prueba o filtro lo disparó. Devuelve el contador de intentos bloqueados.
 */
export async function protegerContraCreacion(contexto: BrowserContext): Promise<{ bloqueados: () => number }> {
  let n = 0;
  await contexto.route(`**${SdeObjects.rutaAcciones}*`, async (route) => {
    if ((route.request().postData() ?? '').includes('CREATENEWCASE')) { n++; return route.abort('blockedbyclient'); }
    return route.fallback();
  });
  return { bloqueados: () => n };
}

export interface UiEntorno {
  browser: Browser;
  paginaInicial: Page;
  paginas: Map<string, Page>;
  contextos: BrowserContext[];
  actual?: string;
  dialogo?: Locator;                                   // pop-up abierto (edición/adición de filas)
  tabla?: { tabla: string; fila: number | null; filasAntes: number; contenidoFila?: string[] };
  registrarCaso: (numero: string, actor: string) => Promise<void> | void;
  /** true: el escenario NO puede crear casos (pulsar "Crear" falla antes del clic y la red bloquea CREATENEWCASE). */
  soloLectura?: boolean;
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

export interface EstadoCaso { numero: string; actividades: string[]; fila: Locator }

/**
 * Busca el caso con el buscador global y devuelve sus actividades ACTUALES tal como Bizagi las lista en la fila de
 * resultados (ul.gridListWorkItems, una por work item, con su idTask). No abre ni modifica el caso.
 * Nota: SummaryGuid.currentState se descartó como fuente porque Bizagi lo filtra por usuario (el analista solo veía el evento).
 */
export async function buscarCaso(page: Page, numero: string): Promise<EstadoCaso> {
  // Recarga real del portal en cada consulta: el buscador del SPA reutiliza resultados previos (observado en QA).
  if ((await new LoginActions(page).navegarAlPortal({ timeout: 120_000, intervalo: 4_000 })) !== 'sesion') throw new Error('La sesión expiró: el portal volvió al login.');
  await unicoVisible(page.locator(SdeObjects.bandeja), 'el menú de la bandeja', 30_000);
  await esperarCarga(page);
  const caja = await unicoVisible(page.locator(SdeObjects.buscadorCasos), 'el buscador global de casos (SdeObjects.buscadorCasos)');
  await caja.fill(numero);
  await caja.press('Enter');
  await esperarCarga(page);
  const fila = await unicoVisible(page.locator(SdeObjects.filaResultado)
    .filter({ has: page.locator(SdeObjects.numeroEnFila).filter({ hasText: regexExacto(numero) }) }),
  `la fila del caso ${numero} en los resultados de búsqueda`, 30_000);
  const actividades = (await fila.locator(SdeObjects.actividadesEnFila).allInnerTexts()).map(normaliza).filter(Boolean);
  return { numero, actividades, fila };
}

const describirEstados = (e: EstadoCaso) => e.actividades.join(' | ') || '—';

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
  const protegidos = new WeakSet<BrowserContext>();
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
        return { ok: n > 0, detalle: `línea de texto exacta “${val}” (${n})` };
      }
      case 'etiquetas': {
        const faltan: string[] = [];
        for (const e of val as string[]) if ((await hayTextoVisible(amb, e)) === 0) faltan.push(e);
        return { ok: faltan.length === 0, detalle: faltan.length ? `etiquetas exactas ausentes: ${faltan.join(', ')}` : `etiquetas exactas presentes (${(val as string[]).length})` };
      }
      case 'solo_lectura':
      case 'editable':
      case 'obligatorio': {
        const malos: string[] = [];
        for (const e of val as string[]) {
          const lbl = await etiqueta(amb, e);
          const info = await infoCampo(await campo(amb, e), e);
          const cumple = tipo === 'solo_lectura' ? estaSoloLectura(info)
            : tipo === 'editable' ? !estaSoloLectura(info)
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
      if (ui.soloLectura && !protegidos.has(page.context())) { protegidos.add(page.context()); await protegerContraCreacion(page.context()); }
      rastrearAcciones(page); // habilita la espera de "forma quieta" (re-ejecución de reglas Bizagi)
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
      if (!tipo) return { estado: 'BLOCKED', detalle: `Tipos documentales disponibles: ${reales.join(' | ')}. Falta indicar cuál es el obligatorio (DOCS-OBLIGATORIOS).` };
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
      const notas = [`Botón "${p.boton}" pulsado`];
      if (ui.soloLectura && (p.capturar_numero_caso || /^crear$/i.test(String(p.boton).trim()))) {
        throw new Error(`MODO SOLO LECTURA: se impidió pulsar "${p.boton}" (crearía un caso).`);
      }
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
      const destinos = (Array.isArray(p.llega_a) ? p.llega_a as string[] : [p.llega_a as string]).map(normaliza);
      const prohibidas = ((p.no_llega_a as string[]) ?? []).map(normaliza);
      const limite = Date.now() + ((p.maximo_minutos as number) ?? 8) * 60_000;
      const vistos: string[] = [];
      let ultimo: EstadoCaso;
      let destino = '';
      let consultas = 0;
      for (;;) {
        // Buscar el caso es idempotente (solo lectura): se repite hasta que el motor llegue a la actividad.
        ultimo = await buscarCaso(page, ctx.numeroCaso);
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

    abrir_caso: async (p, ctx) => {
      if (!ctx.numeroCaso) throw new Error('No hay número de caso capturado.');
      const page = ui.paginas.get(p.actor as string);
      if (!page) throw new Error(`El actor "${p.actor}" no tiene sesión.`);
      const actividad = normaliza(p.actividad as string);
      const limite = Date.now() + ((p.maximo_minutos as number) ?? 8) * 60_000;
      let e: EstadoCaso;
      for (;;) {
        e = await buscarCaso(page, ctx.numeroCaso);
        if (e.actividades.includes(actividad)) break;
        if (Date.now() > limite) {
          throw new Error(`El caso ${ctx.numeroCaso} no está en "${actividad}". Actividades actuales: ${describirEstados(e)}`);
        }
        await page.waitForTimeout(20_000); // sondeo acotado: la actividad puede tardar en asignarse (integraciones / Worker AI)
      }
      // Abrir la actividad desde su fila y confirmar con Bizagi (WorkItems) que el usuario puede trabajarla.
      const items = page.waitForResponse((r) => r.url().includes(`/Rest/Cases/${ctx.numeroCaso}/WorkItems`) && r.status() === 200, { timeout: 60_000 });
      const enFila = e.fila.locator(SdeObjects.actividadesEnFila).filter({ hasText: regexExacto(actividad) });
      await (await unicoVisible(enFila, `la actividad "${actividad}" en la fila del caso ${ctx.numeroCaso}`)).click();
      const wi = await (await items).json() as { workItems?: { displayName: string }[] };
      if (!(wi.workItems ?? []).some((w) => normaliza(w.displayName) === actividad)) {
        throw new Error(`Bizagi no entrega a "${p.actor}" el work item "${actividad}" del caso ${ctx.numeroCaso} (WorkItems: ${(wi.workItems ?? []).map((w) => w.displayName).join(', ') || 'ninguno'}).`);
      }
      await unicoVisible(page.locator(SdeObjects.areaBotones), `el formulario de "${actividad}"`, 60_000);
      await esperarCarga(page);
      ui.actual = p.actor as string;
      ctx.actividades.push(actividad);
      return { detalle: `Caso ${ctx.numeroCaso} abierto por "${p.actor}" en "${actividad}"` };
    },

    tabla_verificar: async (p) => {
      const { columnas, filas } = await contenedorTabla(ambitoActual(ui), p.tabla as string);
      const faltan = ((p.columnas as string[]) ?? []).filter((c) => !columnas.includes(normaliza(c)));
      const n = await filas.count();
      if (faltan.length) throw new Error(`"${p.tabla}": faltan columnas ${faltan.join(', ')} (vistas: ${columnas.filter(Boolean).join(', ')})`);
      if (p.minimo_filas != null && n < (p.minimo_filas as number)) throw new Error(`"${p.tabla}": ${n} fila(s), mínimo ${p.minimo_filas}`);
      return { detalle: `"${p.tabla}": ${n} fila(s); columnas [${columnas.filter(Boolean).join(', ')}]` };
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
      if (p.espera === 'permanece_abierto') {
        if (!(await dialogo.isVisible())) throw new Error('El pop-up se cerró: se confirmó sin los campos obligatorios.');
        return { detalle: 'El pop-up permanece abierto: no permite confirmar sin obligatorios.' };
      }
      await dialogo.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => { throw new Error('El pop-up no se cerró al confirmar.'); });
      const t = ui.tabla;
      ui.dialogo = undefined;
      ctx.dialogoAbierto = false;
      const { columnas, filas } = await contenedorTabla(page, t.tabla);
      const n = await filas.count();
      const esperadas = (p.fila_resultante as Record<string, string>) ?? {};
      const hayEsperadas = Object.keys(esperadas).length > 0;
      const coinciden = hayEsperadas ? await filasQueCoinciden(t.tabla, columnas, filas, esperadas, ctx) : [];
      if (t.fila === null) {
        if (n !== t.filasAntes + 1) throw new Error(`"${t.tabla}": se esperaban ${t.filasAntes + 1} filas tras agregar; hay ${n}.`);
        if (hayEsperadas && coinciden.length !== 1) throw new Error(`"${t.tabla}": la fila agregada con los valores esperados aparece ${coinciden.length} vez/veces.`);
      } else {
        if (n !== t.filasAntes) throw new Error(`"${t.tabla}": la edición cambió el número de filas (${t.filasAntes} → ${n}).`);
        if (hayEsperadas && !coinciden.includes(t.fila - 1)) throw new Error(`"${t.tabla}": la fila ${t.fila} no quedó con los valores esperados.`);
      }
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
  return { capacidades, verificar };
}
