import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LoginActions } from '../../../shared/core/LoginActions';
import { cargarRegistro, estadoActor } from '../sde/datos';
import type { EscenarioSde, PasoSde } from '../sde/escenario';
import { crearContexto, ejecutarEscenario, sanitizar } from '../sde/ejecutor';
import { SdeObjects } from '../baseObjects/sde.objects';
import { esperarCarga } from '../sde/ui';
import { buscarCaso, crearCapacidadesUi, VIEWPORT_SDE, type UiEntorno } from '../sde/capacidades';
import { DIR_SALIDA } from '../sde/registro';

/**
 * RE-VERIFICACIÓN DE BLOQUEOS en QA, SOLO LECTURA. Corre únicamente con SDE_VERIFICAR_BLOQUEOS=1.
 *  - ENV-03: ¿qué procesos recibe el portal de cada rol al abrir "Nuevo Caso"? (no modifica permisos)
 *  - BUG-02: actividades actuales de los casos PROPIOS Individuales detenidos (buscador; no abre ni avanza)
 *  - BUG-01: lista "Tipo Documental" de "Documentos Anexos" en Masiva/Póliza Nueva. Abre el formulario de
 *            inicio y NUNCA pulsa "Crear": sin "Crear" no existe caso (verificado en la Fase 1B).
 * BUG-03 NO se reproduce (Cancelar en el pop-up destruye el caso).
 * Salida local: test-results/seguros-del-estado/sde/bloqueos-<fecha>.json (sin credenciales ni datos sensibles).
 */
test.use({ viewport: VIEWPORT_SDE, trace: 'off' });

const registro = cargarRegistro();
const CASOS_BUG02 = (process.env.SDE_CASOS_BUG02 ?? '336,345,346,347,348,352').split(',').map((x) => x.trim()).filter(Boolean);
const P = (matriz: number[], hacer: string, extra: Record<string, unknown> = {}): PasoSde => ({ matriz, hacer, ...extra });

test.describe('Re-verificación de bloqueos SDE (solo lectura) @bloqueos', () => {
  test.skip(process.env.SDE_VERIFICAR_BLOQUEOS !== '1', 'Desactivado: SDE_VERIFICAR_BLOQUEOS=1 para correrlo.');
  const salida: Record<string, unknown> = { fecha: new Date().toISOString() };
  test.afterAll(() => {
    mkdirSync(DIR_SALIDA, { recursive: true });
    writeFileSync(resolve(DIR_SALIDA, `bloqueos-${Date.now()}.json`), JSON.stringify(salida, null, 2) + '\n', 'utf8');
    console.log(`BLOQUEOS\n${JSON.stringify(salida, null, 2)}`);
  });

  test('ENV-03: procesos habilitados por rol (respuesta que el propio portal recibe)', async ({ page, browser }) => {
    test.setTimeout(6 * 60_000);
    const proceso = process.env.SDE_PROCESO_RADICACION ?? '';
    const resultado: Record<string, unknown> = {};
    for (const actor of Object.keys(registro.actores)) {
      if (estadoActor(registro, actor, process.env).estado !== 'READY') { resultado[actor] = 'SIN_CREDENCIALES'; continue; }
      const contexto = await browser.newContext({ baseURL: process.env.BIZAGI_BASE_URL, ignoreHTTPSErrors: true, viewport: VIEWPORT_SDE });
      const p = actor === 'intermediario' ? page : await contexto.newPage();
      const ui: UiEntorno = { browser, paginaInicial: p, paginas: new Map(), contextos: [], registrarCaso: () => undefined };
      const ctx = crearContexto(registro, process.env, 'bloqueos');
      await crearCapacidadesUi(ui).capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor }, ctx);
      const vistas: { url: string; http: number; proceso_visible: boolean; categorias_vacias: boolean }[] = [];
      p.on('response', async (r) => {
        if (!/\/Rest\/Processes/i.test(r.url())) return;
        const t = await r.text().catch(() => '');
        vistas.push({ url: new URL(r.url()).pathname, http: r.status(), proceso_visible: !!proceso && t.includes(proceso), categorias_vacias: /"categories"\s*:\s*\[\s*\]/.test(t) });
      });
      await p.locator(SdeObjects.nuevoCaso).filter({ visible: true }).click();
      await p.locator(SdeObjects.todosLosProcesos).filter({ visible: true }).click().catch(() => undefined);
      await esperarCarga(p);
      resultado[actor] = {
        respuestas: vistas,
        categorias_visibles: await p.locator(SdeObjects.arbolCategoria).filter({ visible: true }).count(),
        procesos_en_arbol: await p.locator(SdeObjects.arbolProceso).count(),
      };
      await contexto.close();
    }
    salida['ENV-03'] = resultado;
  });

  test('ENV-03 detalle: rol visible, aplicaciones/categorías/procesos y opciones del portal por actor', async ({ browser }) => {
    test.setTimeout(8 * 60_000);
    const detalle: Record<string, unknown> = {};
    for (const actor of ['intermediario', 'analista']) {
      if (estadoActor(registro, actor, process.env).estado !== 'READY') { detalle[actor] = 'SIN_CREDENCIALES'; continue; }
      const contexto = await browser.newContext({ baseURL: process.env.BIZAGI_BASE_URL, ignoreHTTPSErrors: true, viewport: VIEWPORT_SDE });
      const p = await contexto.newPage();
      const rutas = new Set<string>();
      const cuerpos: Promise<{ ruta: string; t: string }>[] = [];
      p.on('response', (r) => {
        const u = new URL(r.url());
        if (!u.pathname.includes('/Rest/')) return;
        rutas.add(u.pathname.replace(/\/\d+(?=\/|$)/g, '/{n}'));
        if (/Processes\/All|Processes\/RecentProcesses|Authorization\/MenuAuthorization/.test(u.pathname) && r.status() === 200) cuerpos.push(r.text().then((t) => ({ ruta: u.pathname, t }), () => ({ ruta: u.pathname, t: '' })));
      });
      const ui: UiEntorno = { browser, paginaInicial: p, paginas: new Map(), contextos: [], registrarCaso: () => undefined };
      await crearCapacidadesUi(ui).capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor }, crearContexto(registro, process.env, 'bloqueos'));
      await esperarCarga(p);
      // Rol: textos con forma de rol Bizagi (p. ej. "CE_Analista"); el nombre de la persona NO se registra.
      const roles = (await p.locator('body').innerText()).split('\n').map((x) => x.trim()).filter((x) => /^[A-Z]{2,}_[A-Za-zÁÉÍÓÚáéíóúñ]+$/.test(x));
      // Menú superior por id (nunca textos libres de la página: el panel lateral muestra el nombre de la persona).
      const menu = await p.locator('[id^="menuList"], #menuQuery').evaluateAll((es) => es.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.id));
      await p.locator(SdeObjects.nuevoCaso).filter({ visible: true }).click();
      await p.locator(SdeObjects.todosLosProcesos).filter({ visible: true }).click().catch(() => undefined);
      await esperarCarga(p);
      const arbol = (await p.locator('#allProcesses').innerText().catch(() => '')).split('\n').map((x) => x.trim()).filter(Boolean);
      const recibidos = await Promise.all(cuerpos);
      const estructura = recibidos.map(({ ruta, t }) => {
        let json: unknown; try { json = JSON.parse(t); } catch { return { ruta, json: false, bytes: t.length }; }
        // Permisos de menú: solo claves y valores booleanos (sin datos de la persona).
        if (ruta.includes('MenuAuthorization')) {
          const permisos: Record<string, unknown> = {};
          const recorrer = (v: unknown, pre: string) => {
            if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) recorrer(x, pre ? `${pre}.${k}` : k);
            else if (typeof v === 'boolean') permisos[pre] = v;
          };
          recorrer(json, '');
          return { ruta, permisos };
        }
        const nombres: string[] = [];
        const visitar = (v: unknown, prof: number) => {
          if (prof > 8 || v == null) return;
          if (Array.isArray(v)) v.forEach((x) => visitar(x, prof + 1));
          else if (typeof v === 'object') {
            const o = v as Record<string, unknown>;
            const n = o.displayName ?? o.name ?? o.categoryName ?? o.applicationName;
            if (typeof n === 'string') nombres.push(`${'  '.repeat(Math.min(prof, 6))}${n}`);
            Object.values(o).forEach((x) => visitar(x, prof + 1));
          }
        };
        visitar(json, 0);
        return { ruta, nombres: [...new Set(nombres)].slice(0, 40) };
      });
      detalle[actor] = { roles, menu, arbol_nuevo_caso: arbol.slice(0, 20), procesos_recibidos: estructura, endpoints_rest: [...rutas].sort() };
      await contexto.close();
    }
    salida['ENV-03-detalle'] = detalle;
  });

  test('BUG-02: actividad actual de los casos propios Individuales', async ({ page, browser }) => {
    test.setTimeout(8 * 60_000);
    const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined };
    await crearCapacidadesUi(ui).capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' }, crearContexto(registro, process.env, 'bloqueos'));
    const casos: Record<string, unknown> = {};
    const secretos = crearContexto(registro, process.env, 'bloqueos').secretos;
    for (const n of CASOS_BUG02) {
      casos[n] = await buscarCaso(page, n)
        .then(async (e) => ({ actividades: e.actividades, fila: sanitizar((await e.fila.locator('td').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '), secretos) }))
        .catch((e: Error) => `ERROR: ${e.message.split('\n')[0]}`);
    }
    salida['BUG-02'] = casos;
  });

  test('BUG-03: estado al reabrir casos propios en Estructurar información (sin Cancelar ni Guardar)', async ({ page, browser }) => {
    const casos = (process.env.SDE_CASOS_BUG03 ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    test.skip(casos.length === 0, 'SDE_CASOS_BUG03=<n1,n2> (casos PROPIOS) para correrlo.');
    test.setTimeout(6 * 60_000);
    const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined };
    await crearCapacidadesUi(ui).capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' }, crearContexto(registro, process.env, 'bloqueos'));
    const res: Record<string, unknown> = {};
    for (const n of casos) {
      const e = await buscarCaso(page, n);
      const item = e.fila.locator(SdeObjects.actividadesEnFila).filter({ hasText: /^\s*Estructurar información\s*$/ });
      if ((await item.count()) !== 1) { res[n] = { actividades: e.actividades, abierto: false }; continue; }
      await item.click();
      const formulario = await page.locator(SdeObjects.areaBotones).filter({ visible: true }).first()
        .waitFor({ state: 'visible', timeout: 45_000 }).then(() => true, () => false); // solo condición de espera
      const errores = await page.getByText(/Invalid scope action type|Error Type|Exception/).filter({ visible: true }).allInnerTexts();
      res[n] = { actividades: e.actividades, formulario_visible: formulario, errores: errores.map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 160)) };
    }
    salida['BUG-03'] = res;
  });

  test('TRAZA BPM: subprocesos, eventos y línea de tiempo del caso (solo nombres de actividades/procesos)', async ({ page, browser }) => {
    const casos = (process.env.SDE_CASOS_TRAZA ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    test.skip(casos.length === 0, 'SDE_CASOS_TRAZA=<n1,n2> (casos PROPIOS) para correrlo.');
    test.setTimeout(8 * 60_000);
    const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined };
    await crearCapacidadesUi(ui).capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' }, crearContexto(registro, process.env, 'bloqueos'));
    // PRIVACIDAD: no se captura texto libre de la página (muestra nombres de personas). Solo se extraen, de las respuestas JSON
    // del propio portal, los campos cuyo NOMBRE indica actividad/tarea/proceso/evento.
    const CLAVE = /^(displayName|taskName|taskDisplayName|activityName|workItemName|processName|processDisplayName|subprocessName|eventName|name|state|status|type)$/i;
    const extraer = (json: unknown): string[] => {
      const out: string[] = [];
      const ver = (v: unknown, k: string, prof: number) => {
        if (prof > 10 || v == null) return;
        if (Array.isArray(v)) v.forEach((x) => ver(x, k, prof + 1));
        else if (typeof v === 'object') Object.entries(v as Record<string, unknown>).forEach(([kk, x]) => ver(x, kk, prof + 1));
        else if (typeof v === 'string' && CLAVE.test(k) && v.length < 80 && !/@|\s[A-ZÁÉÍÓÚ][a-záéíóú]+\s[A-ZÁÉÍÓÚ][a-záéíóú]+$/.test(v)) out.push(`${k}=${v}`);
      };
      ver(json, '', 0);
      return [...new Set(out)];
    };
    const res: Record<string, unknown> = {};
    for (const n of casos) {
      const cuerpos: Promise<[string, string]>[] = [];
      const oir = (r: { url(): string; status(): number; text(): Promise<string> }) => {
        const u = new URL(r.url());
        if (/\/Rest\/Cases\/\d+\/(Subprocesses|Events|Timeline|History|Activities|Graphic|Workflow)/i.test(u.pathname) || /timeline|history|graph/i.test(u.pathname)) {
          cuerpos.push(r.text().then((t) => [u.pathname.replace(/\/\d+(?=\/|$)/g, '/{n}'), t] as [string, string], () => [u.pathname, ''] as [string, string]));
        }
      };
      page.on('response', oir);
      const e = await buscarCaso(page, n);
      await e.fila.locator(SdeObjects.numeroEnFila).click();
      await esperarCarga(page);
      const linea = page.getByText('Linea de tiempo', { exact: true }).filter({ visible: true });
      const hayLinea = (await linea.count()) === 1;
      if (hayLinea) { await linea.click(); await esperarCarga(page); }
      page.off('response', oir);
      const recibidos = await Promise.all(cuerpos);
      res[n] = {
        actividades_fila: e.actividades, linea_de_tiempo_abierta: hayLinea,
        respuestas: recibidos.map(([ruta, t]) => { try { return { ruta, nombres: extraer(JSON.parse(t)).slice(0, 60) }; } catch { return { ruta, json: false, bytes: t.length }; } }),
      };
    }
    salida['TRAZA'] = res;
  });

  test('UI-10: definición de formularios que entrega Render al abrir Estructurar (solo metadatos; NO abre el pop-up)', async ({ page, browser }) => {
    const caso = process.env.SDE_CASO_RENDER;
    test.skip(!caso, 'SDE_CASO_RENDER=<n> (caso PROPIO en Estructurar información) para correrlo.');
    test.setTimeout(6 * 60_000);
    const ctx = crearContexto(registro, process.env, 'bloqueos');
    const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined };
    const caps = crearCapacidadesUi(ui).capacidades;
    await caps.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' }, ctx);
    const cuerpos: Promise<string>[] = [];
    page.on('response', (r) => { if (r.url().includes('/Rest/Handlers/Render') && r.status() === 200) cuerpos.push(r.text().catch(() => '')); });
    ctx.numeroCaso = caso!;
    await caps.abrir_caso({ matriz: [13], hacer: 'abrir_caso', actor: 'analista', actividad: 'Estructurar información', maximo_minutos: 1 }, ctx);
    const textos = await Promise.all(cuerpos);
    // Solo METADATOS de controles (nunca "value"/datos del caso): etiqueta, xpath, tipo, obligatorio, editable, visible.
    const controles: Record<string, unknown>[] = [];
    const ver = (v: unknown, ruta: string[], prof: number) => {
      if (prof > 40 || v == null || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach((x) => ver(x, ruta, prof + 1)); return; }
      const o = v as Record<string, unknown>;
      const props = (o.properties ?? o) as Record<string, unknown>;
      const etiqueta = props.displayName ?? props.caption ?? props.label;
      if (typeof etiqueta === 'string' && etiqueta.length < 120) {
        controles.push({
          etiqueta, xpath: props.xpath ?? props.dataSource ?? null, tipo: props.type ?? o.type ?? null,
          obligatorio: props.required ?? null, editable: props.editable ?? null, visible: props.visible ?? null,
          contenedor: ruta.slice(-3).join(' › '),
        });
      }
      const nombre = typeof etiqueta === 'string' ? etiqueta : '';
      for (const [k, x] of Object.entries(o)) if (k !== 'value' && k !== 'data') ver(x, nombre ? [...ruta, nombre] : ruta, prof + 1);
    };
    for (const t of textos) { try { ver(JSON.parse(t), [], 0); } catch { /* no JSON */ } }
    const relevantes = controles.filter((c) => /Tomador|Forma|Consulta|D[ií]gito|Placa|P[oó]liza|RCE|Detalle|Tipo/i.test(String(c.etiqueta) + ' ' + String(c.contenedor)));
    salida['UI-10-RENDER'] = { respuestas_render: textos.length, bytes: textos.map((t) => t.length), controles_totales: controles.length, relevantes };
  });

  test('BANDEJA del intermediario: conteos y actividades (solo lectura, sin abrir casos)', async ({ page, browser }) => {
    test.skip(process.env.SDE_VER_BANDEJA !== '1', 'SDE_VER_BANDEJA=1 para correrlo.');
    test.setTimeout(5 * 60_000);
    const cuerpos: Promise<[string, string]>[] = [];
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (/\/Rest\/Inbox\//i.test(u.pathname) && r.status() === 200) cuerpos.push(r.text().then((t) => [u.pathname, t] as [string, string], () => [u.pathname, '']));
    });
    const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined, soloLectura: true };
    await crearCapacidadesUi(ui).capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor: 'intermediario' }, crearContexto(registro, process.env, 'bloqueos'));
    await page.locator(SdeObjects.bandeja).filter({ visible: true }).click();
    await esperarCarga(page);
    // Solo números y nombres de procesos/actividades (claves whitelisted); nunca nombres de personas ni datos del caso.
    const CLAVE = /^(displayName|name|taskName|processName|count|total|totalCases|casesCount|red|yellow|green)$/i;
    const resumen = (await Promise.all(cuerpos)).map(([ruta, t]) => {
      const out: string[] = [];
      const ver = (v: unknown, k: string, prof: number) => {
        if (prof > 12 || v == null) return;
        if (Array.isArray(v)) v.forEach((x) => ver(x, k, prof + 1));
        else if (typeof v === 'object') Object.entries(v as Record<string, unknown>).forEach(([kk, x]) => ver(x, kk, prof + 1));
        else if (CLAVE.test(k) && (typeof v === 'number' || (typeof v === 'string' && v.length < 80 && !/@|[A-Z][a-z]+ [A-Z][a-z]+ [A-Z]/.test(v)))) out.push(`${k}=${v}`);
      };
      try { ver(JSON.parse(t), '', 0); } catch { return { ruta, json: false }; }
      return { ruta, valores: [...new Set(out)].slice(0, 60) };
    });
    salida['BANDEJA'] = resumen;
  });

  test('HISTÓRICO: consultas del analista y datos de póliza en casos accesibles (solo lectura; valores solo a archivo privado)', async ({ page, browser }) => {
    const privado = process.env.SDE_SALIDA_PRIVADA;
    test.skip(!privado, 'SDE_SALIDA_PRIVADA=<ruta fuera del repo> para correrlo.');
    test.setTimeout(8 * 60_000);
    const casos = (process.env.SDE_CASOS_HISTORICO ?? '337').split(',').map((x) => x.trim()).filter(Boolean);
    const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined, soloLectura: true };
    await crearCapacidadesUi(ui).capacidades.iniciar_sesion({ matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' }, crearContexto(registro, process.env, 'bloqueos'));
    const res: Record<string, unknown> = {};
    // 1) Menú "Consultas": nombres de las consultas disponibles (metadatos del portal).
    const consultas = page.locator('#menuListQueries');
    if ((await consultas.filter({ visible: true }).count()) === 1) {
      await consultas.click();
      await esperarCarga(page);
      res.consultas_disponibles = [...new Set((await page.locator('[class*="query" i] li, [class*="queries" i] li, .ui-bizagi-wp-app-menu-queries li, [role="menu"] li, [role="menuitem"]')
        .filter({ visible: true }).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 70))].slice(0, 40);
      await page.keyboard.press('Escape').catch(() => undefined);
    } else res.consultas_disponibles = 'menú Consultas no visible';
    // 2) Casos accesibles: actividades y campos de póliza del render (VALORES solo al archivo privado).
    const privados: Record<string, unknown> = {};
    for (const n of casos) {
      const cuerpos: Promise<string>[] = [];
      const oir = (r: { url(): string; status(): number; text(): Promise<string> }) => { if (r.url().includes('/Rest/Handlers/Render') && r.status() === 200) cuerpos.push(r.text().catch(() => '')); };
      page.on('response', oir);
      const e = await buscarCaso(page, n).catch((err: Error) => ({ error: err.message.split('\n')[0] }) as unknown as Awaited<ReturnType<typeof buscarCaso>>);
      if ('error' in (e as object)) { res[n] = e; page.off('response', oir); continue; }
      await e.fila.locator(SdeObjects.numeroEnFila).click();
      await esperarCarga(page);
      page.off('response', oir);
      const campos: Record<string, string>[] = [];
      const ver = (v: unknown, prof: number) => {
        if (prof > 40 || v == null || typeof v !== 'object') return;
        if (Array.isArray(v)) { v.forEach((x) => ver(x, prof + 1)); return; }
        const o = v as Record<string, unknown>;
        const pr = (o.properties ?? o) as Record<string, unknown>;
        const et = pr.displayName;
        if (typeof et === 'string' && /p[oó]liza|placa|clave|intermediari|vigencia|alerta|tomador/i.test(et)) {
          const valor = pr.value ?? o.value;
          if (valor != null && valor !== '') campos.push({ etiqueta: et, xpath: String(pr.xpath ?? ''), valor: typeof valor === 'object' ? JSON.stringify(valor).slice(0, 200) : String(valor) });
        }
        Object.values(o).forEach((x) => ver(x, prof + 1));
      };
      for (const t of await Promise.all(cuerpos)) { try { ver(JSON.parse(t), 0); } catch { /* no JSON */ } }
      privados[n] = campos;
      res[n] = { actividades: e.actividades, renders: cuerpos.length,
        campos_con_valor: campos.map((c) => ({ etiqueta: c.etiqueta, xpath: c.xpath, valor: `presente (${c.valor.replace(/\D/g, '').length} dígitos)` })) };
    }
    // 3) UNA búsqueda de texto en el buscador global (no enumeración): ¿devuelve casos por palabra? Solo número y actividades.
    const termino = process.env.SDE_BUSQUEDA_TEXTO;
    if (termino) {
      if ((await new LoginActions(page).navegarAlPortal({ timeout: 120_000, intervalo: 4_000 })) === 'sesion') {
        await esperarCarga(page);
        const caja = page.locator(SdeObjects.buscadorCasos).filter({ visible: true });
        await caja.fill(termino);
        await caja.press('Enter');
        await esperarCarga(page);
        const filas = page.locator(SdeObjects.filaResultado).filter({ has: page.locator(SdeObjects.numeroEnFila) });
        const n = await filas.count();
        const muestra: Record<string, unknown>[] = [];
        for (let k = 0; k < Math.min(n, 15); k++) {
          const f = filas.nth(k);
          muestra.push({ caso: (await f.locator(SdeObjects.numeroEnFila).innerText()).trim(), actividades: (await f.locator(SdeObjects.actividadesEnFila).allInnerTexts()).map((x) => x.trim()) });
        }
        res.busqueda_texto = { termino, filas: n, muestra };
      }
    }
    writeFileSync(privado!, JSON.stringify(privados, null, 2), 'utf8'); // FUERA del repositorio: nunca se imprime
    salida['HISTORICO'] = res;
  });

  test('BUG-01: tipos documentales en Masiva / Póliza Nueva (sin Crear)', async ({ page, browser }) => {
    test.setTimeout(10 * 60_000);
    const esc: EscenarioSde = {
      id: 'HU06-CP01', titulo: 'VERIFICACIÓN BUG-01 (no es resultado del CP; no pulsa Crear)', etiquetas: [], actores: ['analista'],
      datasets: [], cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'no crea caso' }, archivo: 'bloqueos',
      pasos: [
        P([2], 'iniciar_sesion', { actor: 'analista' }),
        P([2], 'nuevo_caso', { proceso: '${config:SDE_PROCESO_RADICACION}', categoria: '${config:SDE_PROCESO_CATEGORIA}' }),
        P([3], 'diligenciar', { campos: [
          { campo: 'Línea', valor: 'Generales', tipo: 'lista' },
          { campo: 'Ramo', valor: '${config:SDE_GEN_RAMO}', tipo: 'lista' },
          { campo: 'Tipo de Solicitud', valor: 'Póliza Nueva', tipo: 'lista' },
          { campo: 'Sucursal', valor: '${config:SDE_SUCURSAL}', tipo: 'lista' },
          { campo: 'Tipo de Radicación', valor: 'Masiva', tipo: 'radio' },
        ] }),
        // Sin tipo_documental: si la lista tiene opciones el paso queda BLOCKED listándolas; si está vacía, FAIL (BUG-01 vigente).
        P([9], 'adjuntar_en_grilla', { grilla: 'Documentos Anexos', archivo: 'docs/soporte-prueba.pdf' }),
      ],
    };
    const ui: UiEntorno = { browser, paginaInicial: page, paginas: new Map(), contextos: [], registrarCaso: () => undefined };
    const { capacidades, verificar } = crearCapacidadesUi(ui);
    const r = await ejecutarEscenario(esc, { capacidades, verificar, evidencia: async () => undefined }, crearContexto(registro, process.env, 'bloqueos'));
    salida['BUG-01'] = r.pasos.map((p) => `#${p.indice} ${p.hacer} [${p.estado}] ${p.detalle}`);
  });
});
