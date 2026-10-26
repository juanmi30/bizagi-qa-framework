import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro } from '../../sde/datos';
import { cargarEscenario, DIR_ESCENARIOS } from '../../sde/escenario';
import { crearContexto, ejecutarEscenario, EntornoError, type Capacidad } from '../../sde/ejecutor';
import { crearCapacidadesUi, type UiEntorno } from '../../sde/capacidades';
import { casoMatriz } from '../../sde/matriz';
import { cargarManifest } from '../../sde/manifest';
import { coberturaCp, fueEjecutado, leerReportes, nivelImplementacion, totales } from '../../sde/metricas';
import { generarTrazabilidad } from '../../sde/trazabilidad';
import type { ReporteCp } from '../../sde/modelo';

/** Clasificación (ambiente vs producto) y métricas de tres indicadores. Sin QA. */

const reg = cargarRegistro();
const esc = cargarEscenario(resolve(DIR_ESCENARIOS, '1-hu06-cp05.yaml'), reg);
const ENV = {
  BIZAGI_BASE_URL: 'https://qa.ficticio.test', BIZAGI_LOGIN_DOMINIO: 'domain', USUARIO_analista: 'u.ficticio', CLAVE_analista: 'Clave#1',
  SDE_PROCESO_CATEGORIA: 'App > Ficticia', SDE_PROCESO_RADICACION: 'Proceso ficticio', SDE_RUTA_LINEA: 'L', SDE_RUTA_RAMO: 'R',
  SDE_RUTA_MOVIMIENTO: 'M', SDE_SUCURSAL: 'S', SDE_RUTA_FORMA_CONSULTA: 'F', SDE_RUTA_CRITERIO_CAMPO: 'C', SDE_RUTA_CRITERIO_VALOR: '998877665',
};
const ok: Capacidad = async () => undefined;
const base = { iniciar_sesion: (async (p, c) => { c.sesiones.add(p.actor as string); }) as Capacidad, diligenciar: ok, verificar: ok, pulsar: ok, verificar_ruta: ok };

test.describe('Clasificación ambiente vs producto @unit', () => {
  test('un bloqueo de AMBIENTE (EntornoError) deja el paso y el CP en BLOCKED, nunca FAIL ni verde', async () => {
    const r = await ejecutarEscenario(esc, {
      capacidades: { ...base, nuevo_caso: async () => { throw new EntornoError('el usuario no tiene habilitado el proceso (ENV-03)'); } },
      verificar: async () => ({ ok: true, detalle: '' }), evidencia: async () => undefined,
    }, crearContexto(reg, ENV, 'u'));
    expect(r.pasos[1]).toMatchObject({ estado: 'BLOCKED', detalle: expect.stringMatching(/^ENTORNO: .*ENV-03/) });
    expect(r.pasos.slice(2).every((p) => p.estado === 'NOT_RUN')).toBe(true);
    expect(r.estado).toBe('BLOCKED'); // los NOT_RUN son consecuencia del bloqueo: no es un FAIL de producto
    expect(r.motivo).toMatch(/BLOCKED \(causa: AMBIENTE\): .*P2.*no se ejecutaron/); // H4: nombra la causa real
  });

  test('un error genérico sigue siendo FAIL (no se disfraza de bloqueo)', async () => {
    const r = await ejecutarEscenario(esc, {
      capacidades: { ...base, nuevo_caso: async () => { throw new Error('No se encontró visible: el proceso'); } },
      verificar: async () => ({ ok: true, detalle: '' }), evidencia: async () => undefined,
    }, crearContexto(reg, ENV, 'u'));
    expect(r.pasos[1].estado).toBe('FAIL');
  });
});

/** Portal mínimo en un origen ficticio: "Nuevo Caso" dispara Rest/Processes/All como lo hace el Work Portal real. */
async function portalSintetico(page: Page, procesos: string[]): Promise<void> {
  await page.route('https://qa.ficticio.test/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/Rest/Processes/All')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applications: [{ categories: procesos.map((p) => ({ processes: [{ displayName: p }] })) }] }) });
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: `
      <a id="menuListNew">Nuevo Caso</a><span id="breadcrumbRoot">Todos</span><ul id="allProcesses"></ul>
      <script>document.getElementById('menuListNew').onclick = () => fetch('/Rest/Processes/All');</script>` });
  });
  await page.goto('https://qa.ficticio.test/');
}

test.describe('ENV-03 detectado en nuevo_caso desde la respuesta que recibe el portal @unit', () => {
  for (const [titulo, procesos] of [['proceso NO habilitado → EntornoError', ['Otro proceso']], ['lista vacía → EntornoError', []]] as const) {
    test(titulo, async ({ page }) => {
      await portalSintetico(page, [...procesos]);
      const ui: UiEntorno = { browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['intermediario', page]]), contextos: [], actual: 'intermediario', registrarCaso: () => undefined };
      const err = await crearCapacidadesUi(ui).capacidades.nuevo_caso({ matriz: [2], hacer: 'nuevo_caso', proceso: 'Proceso ficticio' }, crearContexto(reg, ENV, 'u')).catch((e) => e);
      expect(err).toBeInstanceOf(EntornoError);
      expect((err as Error).message).toMatch(/no tiene habilitado el proceso "Proceso ficticio".*ENV-03/);
    });
  }

  test('proceso habilitado → continúa a la ruta de categorías (no se confunde con ENV-03)', async ({ page }) => {
    await portalSintetico(page, ['Proceso ficticio']);
    const ui: UiEntorno = { browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined };
    const err = await crearCapacidadesUi(ui).capacidades.nuevo_caso({ matriz: [2], hacer: 'nuevo_caso', proceso: 'Proceso ficticio' }, crearContexto(reg, ENV, 'u')).catch((e) => e);
    expect(err).not.toBeInstanceOf(EntornoError);
    expect((err as Error).message).toMatch(/el proceso "Proceso ficticio"/); // el árbol sintético no lo pinta: falla el selector, no el permiso
  });
});

// ---------- Métricas ----------
const rep = (estado: ReporteCp['estado'], o: Partial<ReporteCp> = {}): ReporteCp => ({
  cp: 'HU06-CP05', escenario: 'x', inicio: '', fin: '', unico: 'u', estado, motivo: '', numero_caso: null, actividades_observadas: [],
  pasos: [{ indice: 1, hacer: 'iniciar_sesion', matriz: [2], estado: 'PASS', detalle: '' }], matriz: [], bloqueos: [],
  cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: '' }, ...o,
});
const bloqueadoPreflight = rep('BLOCKED', { bloqueos: ['CREDENCIALES actor "analista": faltan USUARIO_analista'], pasos: [{ indice: 1, hacer: 'iniciar_sesion', matriz: [2], estado: 'BLOCKED', detalle: '' }] });

test.describe('Métricas de cobertura (implementada / ejecutada / aprobada) @unit', () => {
  const m = casoMatriz('HU06-CP05');
  const c = cargarManifest().casos.find((x) => x.id === 'HU06-CP05')!;

  test('un BLOCKED de preflight NO es ejecución y no tapa la evidencia real anterior', () => {
    expect(fueEjecutado(bloqueadoPreflight)).toBe(false);
    const k = coberturaCp(m, c, esc, [
      { archivo: 'HU06-CP05_1.json', reporte: rep('REAL_PASS_PARCIAL', { numero_caso: '352' }) },
      { archivo: 'HU06-CP05_2.json', reporte: bloqueadoPreflight },
    ]);
    expect(k).toMatchObject({ ejecutada: true, funcional: 'REAL_PASS_PARCIAL', aprobada: false });
    expect(k.evidencia?.archivo).toBe('HU06-CP05_1.json');
    expect(k.ultimoIntento?.archivo).toBe('HU06-CP05_2.json');
  });

  test('REAL_PASS_PARCIAL no cuenta como aprobado; solo REAL_PASS', () => {
    const parcial = coberturaCp(m, c, esc, [{ archivo: 'a.json', reporte: rep('REAL_PASS_PARCIAL') }]);
    const pass = coberturaCp(m, c, esc, [{ archivo: 'a.json', reporte: rep('REAL_PASS') }]);
    const sinReporte = coberturaCp(m, c, esc, []);
    expect([parcial.aprobada, pass.aprobada, sinReporte.ejecutada, sinReporte.funcional]).toEqual([false, true, false, 'EJECUTABLE']);
    expect(totales([parcial, pass, sinReporte])).toMatchObject({ cps: 3, implementada: 3, ejecutada: 2, aprobada: 1, parcial: 1 });
  });

  test('implementación (H2): un paso UI + integración/no automatizado es MIXTO y no cuenta como completo; CP05 es PARCIAL', () => {
    // 9 pasos menos "Objetivo" = 8. Solo P6 mantiene expectativas pendientes. La ruta P8/P9 ya tiene criterio aprobado;
    // esto no convierte en COMPLETA la implementación ni aprueba ninguna ejecución histórica.
    expect(nivelImplementacion(m, esc)).toEqual({ nivel: 'PARCIAL', pasos: { total: 8, ui: 7, mixto: 1, integracion: 0, no_automatizado: 0, sin_cubrir: 0 } });
    // Control: sin lo declarativo (integración, no automatizado y pasos que citan expectativas de presentación) queda COMPLETA.
    // Los pasos «verificar» que citan expectativas se quitan; en los demás (p. ej. la ruta de P8) solo se quita la expectativa.
    const soloUi = { ...esc, pasos: esc.pasos.filter((p) => !['integracion', 'no_automatizado'].includes(p.hacer) && !(p.hacer === 'verificar' && (p.verificar ?? []).some((v) => 'expectativa' in v)))
      .map((p) => ({ ...p, verificar: p.verificar?.filter((v) => !('expectativa' in v)) })) };
    expect(nivelImplementacion(m, soloUi).nivel).toBe('COMPLETA');
    expect(nivelImplementacion(casoMatriz('HU06-CP02'), undefined).nivel).toBe('NO_IMPLEMENTADA');
    const sinPaso8 = { ...esc, pasos: esc.pasos.map(p => ({ ...p, matriz: p.matriz.filter(n => n !== 8) })).filter(p => p.matriz.length) };
    expect(nivelImplementacion(m, sinPaso8)).toMatchObject({ nivel: 'PARCIAL', pasos: { sin_cubrir: 1 } });
  });

  test('la trazabilidad usa la evidencia ejecutada aunque el último archivo sea un BLOCKED de preflight', ({}, testInfo) => {
    const dir = testInfo.outputPath('sde');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'HU06-CP05_20261008-110858.json'), JSON.stringify(rep('REAL_PASS_PARCIAL', { numero_caso: '352' })));
    writeFileSync(resolve(dir, 'HU06-CP05_20261013-090000.json'), JSON.stringify(bloqueadoPreflight));
    expect(leerReportes('HU06-CP05', dir).map((r) => r.archivo)).toEqual(['HU06-CP05_20261008-110858.json', 'HU06-CP05_20261013-090000.json']);
    const md = generarTrazabilidad({}, dir, null);
    const fila = md.split('\n').find((l) => l.startsWith('| HU06-CP05 |'))!;
    expect(fila).toContain('HU06-CP05_20261008-110858.json (caso 352)');
    expect(fila).toContain('último intento: BLOCKED');
    expect(fila).toContain('**REAL_PASS_PARCIAL**');
    expect(fila).toMatch(/\| no \|$/);
    expect(md).toMatch(/\| Aprobada \| 0\/17 /);
  });
});

// ---------- BUG-03: un fallo con el pop-up abierto no puede abandonarlo ----------
test.describe('Política del pop-up abierto (BUG-03) @unit', () => {
  const escPopup = {
    ...esc, id: 'HU06-CP01', archivo: 'sintetico-popup',
    pasos: [
      { matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' },
      { matriz: [18], hacer: 'tabla_abrir_fila', tabla: 'T', fila: 1 },
      { matriz: [21], hacer: 'verificar', verificar: [{ visible: 'Dígito de Verificación' }] },
      { matriz: [23], hacer: 'diligenciar', campos: [{ campo: 'N', valor: 'x' }] },
      { matriz: [23], hacer: 'dialogo_confirmar', espera: 'cierra' },
      { matriz: [24], hacer: 'tabla_agregar', tabla: 'T' },
    ],
  };
  const llamadas: string[] = [];
  const caps = (abrir: boolean): Record<string, Capacidad> => ({
    iniciar_sesion: async (p, c) => { c.sesiones.add(p.actor as string); },
    tabla_abrir_fila: async (_p, c) => { llamadas.push('abrir'); if (abrir) c.dialogoAbierto = true; },
    verificar: async () => undefined,
    diligenciar: async () => { llamadas.push('diligenciar'); },
    dialogo_confirmar: async (_p, c) => { llamadas.push('guardar'); c.dialogoAbierto = false; },
    tabla_agregar: async () => { llamadas.push('agregar'); },
  });
  const verificarFalla = async (v: unknown) => ({ ok: !JSON.stringify(v).includes('Dígito'), detalle: JSON.stringify(v) });

  test('con el pop-up abierto, un FAIL se registra y la ejecución sigue SOLO hasta cerrarlo con Guardar', async () => {
    llamadas.length = 0;
    const r = await ejecutarEscenario(escPopup as never, { capacidades: caps(true), verificar: verificarFalla, evidencia: async () => undefined }, crearContexto(reg, ENV, 'u'));
    expect(llamadas).toEqual(['abrir', 'diligenciar', 'guardar']); // no sigue con "agregar"
    expect(r.pasos[2]).toMatchObject({ estado: 'FAIL', detalle: expect.stringMatching(/se continúa SOLO hasta cerrarlo/) });
    expect(r.pasos[4].estado).toBe('PASS');
    expect(r.pasos[5]).toMatchObject({ estado: 'NOT_RUN', detalle: expect.stringMatching(/tras cerrar el pop-up/) });
    expect(r.estado).toBe('FAIL'); // nunca verde
  });

  test('si el intento de cerrar con Guardar falla, se detiene ahí (no sigue probando pasos con el pop-up abierto)', async () => {
    llamadas.length = 0;
    const c = { ...caps(true), dialogo_confirmar: async () => { llamadas.push('guardar'); throw new Error('El pop-up no se cerró al confirmar.'); } };
    const r = await ejecutarEscenario(escPopup as never, { capacidades: c, verificar: verificarFalla, evidencia: async () => undefined }, crearContexto(reg, ENV, 'u'));
    expect(llamadas).toEqual(['abrir', 'diligenciar', 'guardar']);
    expect(r.pasos[4]).toMatchObject({ estado: 'FAIL', detalle: expect.stringMatching(/probablemente quedó inutilizable/) });
    expect(r.pasos[5].estado).toBe('NOT_RUN');
  });

  test('control: sin pop-up abierto, un FAIL detiene de inmediato como siempre', async () => {
    llamadas.length = 0;
    const r = await ejecutarEscenario(escPopup as never, { capacidades: caps(false), verificar: verificarFalla, evidencia: async () => undefined }, crearContexto(reg, ENV, 'u'));
    expect(llamadas).toEqual(['abrir']);
    expect(r.pasos.slice(3).every((p) => p.estado === 'NOT_RUN')).toBe(true);
  });
});
