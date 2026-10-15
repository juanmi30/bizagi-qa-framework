import { test, expect, type Page } from '@playwright/test';
import { cargarRegistro } from '../../sde/datos';
import type { EscenarioSde, PasoSde, Verificacion } from '../../sde/escenario';
import { crearContexto, ejecutarEscenario, type Capacidad, type Verificador } from '../../sde/ejecutor';
import { crearCapacidadesUi, type UiEntorno } from '../../sde/capacidades';
import type { CatalogoPresentacion } from '../../sde/presentacion';

/**
 * Regresiones de la auditoría de Work sobre el PR #2 (sin QA ni navegador real):
 *  R1 — una verificación de ortografía sin evidencia (pantalla vacía, no reconocida o error técnico) NUNCA aprueba.
 *  R2 — un defecto funcional observado en un paso se conserva aunque después ocurra una excepción en el mismo paso.
 */

const reg = cargarRegistro();
const ENV = { BIZAGI_BASE_URL: 'https://x.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c' };
const P = (matriz: number[], hacer: string, extra: Record<string, unknown> = {}): PasoSde => ({ matriz, hacer, ...extra });
const escenario = (pasos: PasoSde[]): EscenarioSde =>
  ({ id: 'HU06-CP05', titulo: 't', etiquetas: [], actores: ['analista'], datasets: [], cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'r' }, pasos, archivo: 'sint' });

// ---------------------------------------------------------------------------------------------------------- R1
const CAMPO = (etq: string, control = '<input>') =>
  `<div class="ui-bizagi-render"><span class="ui-bizagi-label"><label>${etq}</label></span><div class="ui-bizagi-render-control">${control}</div></div>`;
const INICIO_CORRECTO = `<div class="bzg-form-group"><h3 class="ui-bizagi-container-group-header">Información de la Solicitud</h3>
  ${CAMPO('Línea')}${CAMPO('Ramo')}${CAMPO('Tipo de Radicación')}</div>`;
const BOTONES = '<div class="ui-bizagi-button-container"><button>Crear</button></div>';

async function verificarEn(page: Page, v: Verificacion) {
  const ui: UiEntorno = { browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined };
  return crearCapacidadesUi(ui).verificar(v, crearContexto(reg, ENV, 'u'));
}

test.describe('R1 — la ortografía nunca se aprueba sin evidencia de la pantalla esperada @unit', () => {
  test('HTML vacío: NO CONCLUYENTE (antes: ok con "0 textos visibles: sin hallazgos")', async ({ page }) => {
    await page.setContent('<html><body></body></html>');
    await expect(verificarEn(page, { ortografia: 'inicio-radicacion' })).rejects.toThrow(/^NO CONCLUYENTE: no se identificó la pantalla "inicio-radicacion"/);
  });

  test('pantalla no reconocida (otra actividad con textos correctos): NO CONCLUYENTE', async ({ page }) => {
    await page.setContent(CAMPO('Número de Caso') + CAMPO('Creador del Caso') + CAMPO('Observaciones') + BOTONES);
    await expect(verificarEn(page, { ortografia: 'inicio-radicacion' })).rejects.toThrow(/marcadores no visibles Línea, Tipo de Radicación/);
  });

  test('pantalla válida con textos correctos: aprobada, citando cómo se identificó', async ({ page }) => {
    await page.setContent(INICIO_CORRECTO + BOTONES);
    const r = await verificarEn(page, { ortografia: 'inicio-radicacion' });
    expect(r.ok).toBe(true);
    expect(r.detalle).toMatch(/en "inicio-radicacion" \(identificada por Línea, Tipo de Radicación\) sobre 5 textos visibles: sin hallazgos/);
  });

  test('pantalla válida con error ortográfico: defecto detectado', async ({ page }) => {
    await page.setContent(INICIO_CORRECTO + CAMPO('Numero de Poliza') + BOTONES);
    const r = await verificarEn(page, { ortografia: 'inicio-radicacion' });
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain('"Numero de Poliza" → ORT-TERMINO-POLIZA');
    expect(r.detalle).toContain('"Numero de Poliza" → ORT-TERMINO-NUMERO');
  });

  test('excepción al consultar los botones: el error técnico se conserva (antes se tragaba y aprobaba)', async ({ page }) => {
    await page.setContent(INICIO_CORRECTO + BOTONES);
    // Fallo técnico sintético dentro de la lectura de botones (el valor del botón no se puede leer).
    await page.evaluate(() => Object.defineProperty(document.querySelector('button')!, 'value', { get() { throw new Error('lectura de botón imposible'); } }));
    await expect(verificarEn(page, { ortografia: 'inicio-radicacion' })).rejects.toThrow(/lectura de botón imposible/);
  });

  test('pantalla válida SIN zona de botones (ausencia prevista): se evalúa con normalidad', async ({ page }) => {
    await page.setContent(INICIO_CORRECTO);
    expect(await verificarEn(page, { ortografia: 'inicio-radicacion' })).toMatchObject({ ok: true });
    await page.setContent(INICIO_CORRECTO + CAMPO('Observaciónes'));
    expect(await verificarEn(page, { ortografia: 'inicio-radicacion' })).toMatchObject({ ok: false });
  });

  test('en el ejecutor, "no concluyente" queda FAIL por AUTOMATIZACION (nunca PASS ni atribuido al producto)', async ({ page }) => {
    await page.setContent('<html><body></body></html>');
    const ui: UiEntorno = { browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined };
    const { capacidades, verificar } = crearCapacidadesUi(ui);
    capacidades.iniciar_sesion = async (_p, c) => { c.sesiones.add('analista'); };
    const r = await ejecutarEscenario(escenario([P([2], 'iniciar_sesion', { actor: 'analista' }),
      P([6], 'verificar', { no_bloqueante: true, verificar: [{ ortografia: 'inicio-radicacion' }] })]), { capacidades, verificar, evidencia: async () => undefined }, crearContexto(reg, ENV, 'u'));
    expect(r.pasos[1]).toMatchObject({ estado: 'FAIL', causa: 'AUTOMATIZACION' });
    expect(r.pasos[1].detalle).toMatch(/^NO CONCLUYENTE/);
    expect(r.atribucion).toBe('NO_ATRIBUIBLE_AL_PRODUCTO');
  });

  test('una expectativa pendiente sin fuente nunca permite REAL_PASS (control: la misma aprobada sí)', async () => {
    const catalogo = (estado: 'aprobada' | 'pendiente_definicion'): CatalogoPresentacion => ({
      pantallas: {}, reglas_ortograficas: [], conocidos: {},
      expectativas: { X: estado === 'aprobada'
        ? { descripcion: 'd', estado, fuente: 'Matriz HU06-CP05 P6', verificar: [{ etiquetas: ['Línea'] }] }
        : { descripcion: 'd', estado, pendiente: 'sin FRM', responsable: 'Daniel' } },
    });
    // Sesión y caso reales simulados; TODOS los pasos de la matriz cubiertos por verificaciones que pasan.
    const capacidades: Record<string, Capacidad> = {
      iniciar_sesion: async (_p, c) => { c.sesiones.add('analista'); }, verificar: async () => ({}),
      pulsar: async (_p, c) => { c.numeroCaso = '999'; },
    };
    const pasos = [P([2], 'iniciar_sesion', { actor: 'analista' }), P([7], 'pulsar', { boton: 'Crear' }),
      P([2, 3, 4, 5, 6, 7, 8, 9], 'verificar', { verificar: [{ visible: 'Línea' }, { expectativa: 'X' }] })];
    const correr = (estado: 'aprobada' | 'pendiente_definicion') => ejecutarEscenario(escenario(pasos),
      { capacidades, verificar: async () => ({ ok: true, detalle: 'ok' }), evidencia: async () => undefined, presentacion: catalogo(estado) }, crearContexto(reg, ENV, 'u'));
    expect((await correr('aprobada')).estado).toBe('REAL_PASS');
    const pendiente = await correr('pendiente_definicion');
    expect(pendiente.estado).toBe('REAL_PASS_PARCIAL');
    expect(pendiente.motivo).toContain('P6=NOT_AUTOMATED');
  });
});

// ---------------------------------------------------------------------------------------------------------- R2
/** Verificador sintético: { etiquetas: [X] } se comporta según X. */
const verificarSintetico: Verificador = async (v) => {
  const x = (v as { etiquetas?: string[] }).etiquetas?.[0];
  if (x === 'AMBIENTE') throw new Error('page.goto: net::ERR_CONNECTION_RESET at https://x.test');
  if (x === 'RARO') throw new Error('algo inesperado');
  return { ok: x?.startsWith('PASS') ?? false, detalle: `observado ${x}` };
};

async function paso(verificaciones: string[], noBloqueante = false) {
  return ejecutarEscenario(escenario([
    P([2], 'iniciar_sesion', { actor: 'analista' }),
    P([6], 'verificar', { verificar: verificaciones.map((x) => ({ etiquetas: [x] })), ...(noBloqueante ? { no_bloqueante: true } : {}) }),
    P([7], 'pulsar', { boton: 'Crear' }),
  ]), {
    capacidades: { iniciar_sesion: async (_p, c) => { c.sesiones.add('analista'); }, verificar: async () => ({}), pulsar: async () => ({ detalle: 'pulsado' }) },
    verificar: verificarSintetico, evidencia: async () => undefined,
  }, crearContexto(reg, ENV, 'u'));
}

test.describe('R2 — un defecto observado sobrevive a una excepción posterior en el mismo paso @unit', () => {
  test('PASS + PASS: PASS y el recorrido sigue', async () => {
    const r = await paso(['PASS-1', 'PASS-2']);
    expect(r.pasos.map((p) => p.estado)).toEqual(['PASS', 'PASS', 'PASS']);
    expect(r.pasos[1].incidente).toBeUndefined();
  });

  test('FAIL funcional + PASS: FAIL por confirmar con ambas observaciones', async () => {
    const r = await paso(['FALLA', 'PASS-2']);
    expect(r.pasos[1]).toMatchObject({ estado: 'FAIL', causa: 'PRODUCTO_POR_CONFIRMAR' });
    expect(r.pasos[1].detalle).toBe('✘ observado FALLA | ✔ observado PASS-2');
    expect(r.atribucion).toBe('PRODUCTO_POR_CONFIRMAR');
  });

  test('FAIL funcional + excepción de AMBIENTE: el defecto sigue visible y atribuido; el bloqueo queda como incidente', async () => {
    const r = await paso(['FALLA', 'AMBIENTE', 'PASS-3']);
    const p = r.pasos[1];
    expect(p).toMatchObject({ estado: 'FAIL', causa: 'PRODUCTO_POR_CONFIRMAR', incidente: { causa: 'AMBIENTE' } });
    expect(p.detalle).toContain('✘ observado FALLA');
    expect(p.detalle).toContain('⚠ INCIDENTE posterior (AMBIENTE; no sustituye lo observado): page.goto: net::ERR_CONNECTION_RESET');
    // La tercera verificación nunca ocurrió: no se informa como observada.
    expect(p.detalle).not.toContain('PASS-3');
    expect(p.detalle).toContain('Comprobaciones del paso completadas: 1 de 3 declaradas (verificaciones elementales ejecutadas: 1)');
    expect(r.estado).toBe('FAIL'); // antes: BLOCKED y el defecto desaparecía
    expect(r.atribucion).toBe('PRODUCTO_POR_CONFIRMAR');
    expect(r.causas).toEqual(expect.arrayContaining(['PRODUCTO_POR_CONFIRMAR', 'AMBIENTE']));
    expect(r.motivo).toContain('incidente técnico posterior al defecto observado: AMBIENTE');
    expect(r.pasos[2].estado).toBe('NOT_RUN'); // el incidente detiene el recorrido
    // La matriz conserva el FAIL del paso P6.
    expect(r.matriz.find((m) => m.n === 6)!.estado).toBe('FAIL');
  });

  test('FAIL funcional + excepción de AMBIENTE en un paso NO BLOQUEANTE: se conserva el defecto y aun así se detiene', async () => {
    const r = await paso(['FALLA', 'AMBIENTE'], true);
    expect(r.pasos[1]).toMatchObject({ estado: 'FAIL', causa: 'PRODUCTO_POR_CONFIRMAR', incidente: { causa: 'AMBIENTE' } });
    expect(r.pasos[1].detalle).not.toContain('No bloqueante: el recorrido continúa');
    expect(r.pasos[2].estado).toBe('NOT_RUN');
  });

  test('FAIL funcional + excepción desconocida: defecto conservado, incidente NO_CLASIFICADO', async () => {
    const r = await paso(['FALLA', 'RARO']);
    expect(r.pasos[1]).toMatchObject({ estado: 'FAIL', causa: 'PRODUCTO_POR_CONFIRMAR', incidente: { causa: 'NO_CLASIFICADO' } });
    expect(r.atribucion).toBe('PRODUCTO_POR_CONFIRMAR');
  });

  test('PASS + excepción de AMBIENTE: BLOCKED (sin defecto previo), conservando lo observado', async () => {
    const r = await paso(['PASS-1', 'AMBIENTE']);
    expect(r.pasos[1]).toMatchObject({ estado: 'BLOCKED', causa: 'AMBIENTE' });
    expect(r.pasos[1].incidente).toBeUndefined();
    expect(r.pasos[1].detalle).toContain('✔ observado PASS-1');
    expect(r.estado).toBe('BLOCKED');
    expect(r.atribucion).toBe('NO_APLICA');
  });

  test('conteo homogéneo (observación BAJA de Work): una expectativa con 3 verificaciones cuenta como 1 comprobación, no "3 de 2"', async () => {
    const catalogo: CatalogoPresentacion = { pantallas: {}, reglas_ortograficas: [], conocidos: {}, expectativas: {
      TRES: { descripcion: 'd', estado: 'aprobada', fuente: 'Matriz HU06-CP05 P6', verificar: [{ etiquetas: ['FALLA'] }, { etiquetas: ['PASS-b'] }, { etiquetas: ['PASS-c'] }] } } };
    const r = await ejecutarEscenario(escenario([P([2], 'iniciar_sesion', { actor: 'analista' }),
      P([6], 'verificar', { verificar: [{ expectativa: 'TRES' }, { etiquetas: ['AMBIENTE'] }] })]), {
      capacidades: { iniciar_sesion: async (_p, c) => { c.sesiones.add('analista'); }, verificar: async () => ({}) },
      verificar: verificarSintetico, evidencia: async () => undefined, presentacion: catalogo,
    }, crearContexto(reg, ENV, 'u'));
    const d = r.pasos[1].detalle;
    expect(d).toContain('Comprobaciones del paso completadas: 1 de 2 declaradas (verificaciones elementales ejecutadas: 3)');
    expect(d).not.toMatch(/3 de 2/);
    // El detalle y la evidencia funcional se conservan: las tres observaciones de la expectativa y el incidente.
    expect(d.split('[TRES · fuente: Matriz HU06-CP05 P6]').length - 1).toBe(3);
    expect(r.pasos[1]).toMatchObject({ estado: 'FAIL', causa: 'PRODUCTO_POR_CONFIRMAR', incidente: { causa: 'AMBIENTE' } });
  });

  test('dos FAIL funcionales en el mismo paso: ambos se informan', async () => {
    const r = await paso(['FALLA-A', 'FALLA-B']);
    expect(r.pasos[1].detalle).toBe('✘ observado FALLA-A | ✘ observado FALLA-B');
    expect(r.pasos[1].estado).toBe('FAIL');
  });

  test('excepción antes de cualquier resultado funcional: comportamiento anterior (BLOCKED por ambiente, sin incidente)', async () => {
    const r = await paso(['AMBIENTE', 'FALLA']);
    expect(r.pasos[1]).toMatchObject({ estado: 'BLOCKED', causa: 'AMBIENTE' });
    expect(r.pasos[1].incidente).toBeUndefined();
    expect(r.pasos[1].detalle).not.toContain('FALLA');
  });
});
