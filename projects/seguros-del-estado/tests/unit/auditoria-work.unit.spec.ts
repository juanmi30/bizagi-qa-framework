import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro, DatoFaltanteError } from '../../sde/datos';
import { cargarEscenario, DIR_ESCENARIOS, listarEscenarios, EscenarioError } from '../../sde/escenario';
import { causaDeExcepcion, crearContexto, ejecutarEscenario, EntornoError, type Capacidad } from '../../sde/ejecutor';
import { crearCapacidadesUi, type UiEntorno } from '../../sde/capacidades';
import { autorizarAperturaPopup, BarreraPopupError, cargarPopups, type RegistroPopups } from '../../sde/popups';
import { resultadoPlaywright } from '../../sde/verticales';
import { CalibracionError } from '../../sde/ui';
import type { ReporteCp } from '../../sde/modelo';

/** Regresión de los hallazgos de la auditoría independiente de Work (H1, H3, H4, H6). Sin QA. */

const reg = cargarRegistro();
const rep = (estado: ReporteCp['estado']): ReporteCp => ({
  cp: 'HU06-CP05', escenario: 'x', inicio: '', fin: '', unico: 'u', estado, motivo: 'm', numero_caso: '1', actividades_observadas: [],
  pasos: [], matriz: [], bloqueos: [], cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: '' },
});

test.describe('H1 — Playwright refleja el estado funcional @unit', () => {
  test('REAL_PASS pasa; REAL_PASS_PARCIAL y FAIL fallan; BLOCKED en ejecución se omite (nunca un parcial "passed")', () => {
    expect(resultadoPlaywright(rep('REAL_PASS')).accion).toBe('pasar');
    expect(resultadoPlaywright(rep('REAL_PASS_PARCIAL'))).toMatchObject({ accion: 'fallar', mensaje: expect.stringMatching(/NO APROBADO \(REAL_PASS_PARCIAL/) });
    expect(resultadoPlaywright(rep('FAIL')).accion).toBe('fallar');
    expect(resultadoPlaywright(rep('BLOCKED'))).toMatchObject({ accion: 'omitir', mensaje: expect.stringMatching(/BLOCKED en ejecución/) });
  });
});

const CALIBRADO: RegistroPopups = { ok: { tabla: 'T', descripcion: '', estado: 'calibrado', mapeo_controles: { a: 'b' }, evidencia: 'e', cierre_seguro_verificado: true } };

test.describe('H3 — barrera de apertura de pop-ups @unit', () => {
  const bloquea = (f: string | undefined, reg_: RegistroPopups, caso: string | null = '430', aut?: string) =>
    (() => { try { autorizarAperturaPopup(f, 'T', caso, reg_, aut); return ''; } catch (e) { return (e as Error).message; } })();

  test('el registro real solo permite abrir los pop-ups calibrados con evidencia y cierre seguro verificado (UI-10)', () => {
    const real = cargarPopups();
    expect(Object.keys(real).length).toBeGreaterThan(0);
    // 2026-10-16: detalle-polizas-autos calibrado en el caso propio 651 (abrir → cambiar → Guardar → persiste al reabrir).
    const abiertos = Object.entries(real).filter(([id, f]) => { try { autorizarAperturaPopup(id, f.tabla, '1', real, undefined); return true; } catch { return false; } }).map(([id]) => id);
    expect(abiertos).toEqual(['detalle-polizas-autos']);
    for (const id of abiertos) expect(real[id]).toMatchObject({ estado: 'calibrado', cierre_seguro_verificado: true, evidencia: expect.stringContaining('651') });
    for (const [id, f] of Object.entries(real).filter(([x]) => !abiertos.includes(x))) expect(() => autorizarAperturaPopup(id, f.tabla, '1', real, undefined), id).toThrow(BarreraPopupError);
  });

  test('exige formulario declarado, registrado, de la misma tabla, calibrado, con mapeo, evidencia y cierre seguro', () => {
    expect(bloquea(undefined, CALIBRADO)).toMatch(/no declara "formulario"/);
    expect(bloquea('x', CALIBRADO)).toMatch(/no está en data\/popups-calibrados\.yaml/);
    expect(bloquea('ok', CALIBRADO)).toBe('');
    for (const [campo, valor, msg] of [['estado', 'sin_calibrar', /estado "sin_calibrar"/], ['mapeo_controles', null, /sin mapeo/],
      ['evidencia', null, /sin evidencia/], ['cierre_seguro_verificado', false, /cierre seguro con Guardar no verificado/], ['tabla', 'Otra', /no a "T"/]] as const) {
      expect(bloquea('ok', { ok: { ...CALIBRADO.ok, [campo]: valor } } as RegistroPopups), campo).toMatch(msg);
    }
  });

  test('calibración de riesgo: solo con autorización explícita para EL caso en ejecución', () => {
    const enCal: RegistroPopups = { ok: { ...CALIBRADO.ok, estado: 'en_calibracion', cierre_seguro_verificado: false, mapeo_controles: null } };
    expect(bloquea('ok', enCal, '430', undefined)).toMatch(/sin autorización explícita/);
    expect(bloquea('ok', enCal, '430', '431')).toMatch(/sin autorización explícita/);
    expect(bloquea('ok', enCal, '430', '430')).toBe('');
  });

  test('en ejecución: la capability NO hace ningún clic y el paso queda BLOCKED por AUTOMATIZACION', async ({ page }) => {
    await page.setContent('<div class="ui-bizagi-render"><label>T</label><table><tbody><tr><td>1</td></tr></tbody></table><button title="Editar" onclick="window.abierto=true">e</button></div>');
    const ui: UiEntorno = { browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined };
    const esc = { ...cargarEscenario(resolve(DIR_ESCENARIOS, '1-hu06-cp05.yaml'), reg), pasos: [
      { matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' }, { matriz: [8], hacer: 'tabla_abrir_fila', tabla: 'T', fila: 1, formulario: 'detalle-polizas-pn-generales' }] };
    const { capacidades, verificar } = crearCapacidadesUi(ui);
    capacidades.iniciar_sesion = async (p, c) => { c.sesiones.add(p.actor as string); };
    const r = await ejecutarEscenario(esc as never, { capacidades, verificar, evidencia: async () => undefined }, crearContexto(reg, { BIZAGI_BASE_URL: 'https://x.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c', SDE_PROCESO_RADICACION: 'p', SDE_PROCESO_CATEGORIA: 'c', SDE_RUTA_LINEA: 'l', SDE_RUTA_RAMO: 'r', SDE_RUTA_MOVIMIENTO: 'm', SDE_SUCURSAL: 's', SDE_RUTA_FORMA_CONSULTA: 'f', SDE_RUTA_CRITERIO_CAMPO: 'c', SDE_RUTA_CRITERIO_VALOR: '999' }, 'u'));
    expect(r.pasos[1]).toMatchObject({ estado: 'BLOCKED', causa: 'AUTOMATIZACION', detalle: expect.stringMatching(/BARRERA POP-UP/) });
    expect(await page.evaluate(() => (window as unknown as { abierto?: boolean }).abierto ?? false)).toBe(false);
  });

  test('el validador exige "formulario" en los pasos que abren pop-ups y que exista en el registro', ({}, ti) => {
    const dir = ti.outputPath('e'); mkdirSync(dir, { recursive: true });
    const yaml = (extra: string) => `id: HU06-CP01\ntitulo: t\nactores: [analista]\ndatasets: [CFG-PROCESO]\ncleanup: { politica: CLEANUP_NOT_APPLICABLE, razon: r }\npasos:\n  - { matriz: [18], hacer: tabla_abrir_fila, tabla: T, fila: 1${extra} }\n`;
    const carga = (y: string) => { writeFileSync(resolve(dir, 'e.yaml'), y); try { cargarEscenario(resolve(dir, 'e.yaml'), reg); return ''; } catch (e) { return e instanceof EscenarioError ? e.message : String(e); } };
    expect(carga(yaml(''))).toMatch(/falta "formulario"/);
    expect(carga(yaml(', formulario: inventado'))).toMatch(/no existe en data\/popups-calibrados\.yaml/);
    expect(carga(yaml(', formulario: detalle-polizas-pn-generales'))).toBe('');
  });

  test('todo paso de pop-up de los escenarios del proyecto declara un formulario registrado', () => {
    const reales = cargarPopups();
    for (const r of listarEscenarios()) for (const p of cargarEscenario(r, reg).pasos) {
      if (['tabla_abrir_fila', 'tabla_agregar'].includes(p.hacer)) expect(reales[p.formulario as string], `${r} ${p.hacer}`).toBeTruthy();
    }
  });
});

test.describe('H4 — causa del resultado (no todo FAIL es del producto) @unit', () => {
  test('clasificación conservadora por tipo de excepción', () => {
    expect(causaDeExcepcion(new DatoFaltanteError('${dato:x.y}'))).toBe('DATO');
    expect(causaDeExcepcion(new EntornoError('DNS'))).toBe('AMBIENTE');
    expect(causaDeExcepcion(new CalibracionError('combo', 'x'))).toBe('AUTOMATIZACION');
    expect(causaDeExcepcion(new Error('No se encontró visible: la etiqueta "X"'))).toBe('AUTOMATIZACION');
    expect(causaDeExcepcion(new Error('locator.click: Timeout 15000ms exceeded.'))).toBe('AUTOMATIZACION');
    expect(causaDeExcepcion(new Error('Bizagi rechazó la creación (CREATENEWCASE validationMessages)'))).toBe('PRODUCTO_POR_CONFIRMAR');
    expect(causaDeExcepcion(new Error('algo inesperado'))).toBe('NO_CLASIFICADO');
  });

  test('un FAIL causado solo por automatización se declara NO atribuible al producto; una verificación incumplida queda "por confirmar"', async () => {
    const esc = cargarEscenario(resolve(DIR_ESCENARIOS, '1-hu06-cp05.yaml'), reg);
    const ENV = { BIZAGI_BASE_URL: 'https://x.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c', SDE_PROCESO_RADICACION: 'p', SDE_PROCESO_CATEGORIA: 'c', SDE_RUTA_LINEA: 'l', SDE_RUTA_RAMO: 'r', SDE_RUTA_MOVIMIENTO: 'm', SDE_SUCURSAL: 's', SDE_RUTA_FORMA_CONSULTA: 'f', SDE_RUTA_CRITERIO_CAMPO: 'c', SDE_RUTA_CRITERIO_VALOR: '999' };
    const base: Record<string, Capacidad> = { iniciar_sesion: async (p, c) => { c.sesiones.add(p.actor as string); } };
    const auto = await ejecutarEscenario(esc, { capacidades: { ...base, nuevo_caso: async () => { throw new Error('No se encontró visible: el proceso'); } }, verificar: async () => ({ ok: true, detalle: '' }), evidencia: async () => undefined }, crearContexto(reg, ENV, 'u'));
    expect(auto.pasos[1].causa).toBe('AUTOMATIZACION');
    expect(auto.motivo).toMatch(/NO atribuible al producto/);
    const producto = await ejecutarEscenario(esc, { capacidades: { ...base, nuevo_caso: async () => undefined }, verificar: async () => ({ ok: false, detalle: 'distinto' }), evidencia: async () => undefined }, crearContexto(reg, ENV, 'u'));
    expect(producto.pasos[1].causa).toBe('PRODUCTO_POR_CONFIRMAR');
    expect(producto.motivo).not.toMatch(/NO atribuible/);
  });
});

test.describe('H6 — SDE se ejecuta en un solo worker aunque se olvide --workers=1 @unit', () => {
  test('la configuración efectiva del proyecto tiene workers = 1 (si este test falla, se pasó --workers>1 por línea de comandos)', ({}, testInfo) => {
    expect(testInfo.config.workers).toBe(1);
  });
});
