import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { aplicarReglasOrtograficas, compararConAprobado, revisarOrden, textoEtiqueta } from '../../../../shared/utils/ValidacionesPresentacion';
import { cargarRegistro } from '../../sde/datos';
import { cargarEscenario, type EscenarioSde, type PasoSde, type Verificacion } from '../../sde/escenario';
import { crearContexto, ejecutarEscenario, type Verificador } from '../../sde/ejecutor';
import { crearCapacidadesUi, type UiEntorno } from '../../sde/capacidades';
import { cargarPresentacion, problemasCatalogo, type CatalogoPresentacion } from '../../sde/presentacion';
import { inventarioCampos } from '../../sde/ui';

/**
 * Validaciones de presentación (reunión QA 2026-10-14): ortografía frente a fuentes aprobadas, orden de campos,
 * obligatorios/opcionales y expectativas pendientes de definición. Sin QA ni navegador real (DOM sintético).
 */

const reg = cargarRegistro();
const catalogo = cargarPresentacion();
const reglas = catalogo.reglas_ortograficas;

test.describe('Presentación — funciones puras (shared/utils/ValidacionesPresentacion) @unit', () => {
  test('texto de etiqueta sin formato y comparación con el texto aprobado', () => {
    expect(textoEtiqueta('  Línea *: ')).toBe('Línea');
    expect(compararConAprobado('Observaciones', ['Línea', 'Observaciones'])).toEqual({ estado: 'exacto', observado: 'Observaciones' });
    expect(compararConAprobado('Observaciones', ['Observaciónes'])).toEqual({ estado: 'difiere_ortografia', observado: 'Observaciónes' });
    expect(compararConAprobado('Información a Consultar', ['Informacion a Consultar'])).toMatchObject({ estado: 'difiere_ortografia' });
    expect(compararConAprobado('Nuevo correo Electrónico de Facturación', ['Nuevo Correo Electrónico de Facturación'])).toMatchObject({ estado: 'difiere_ortografia' });
    expect(compararConAprobado('Tipo de Movimiento', ['Movimiento'])).toEqual({ estado: 'ausente' });
  });

  test('orden relativo: admite campos intercalados; detecta inversión, ausencia y repetición', () => {
    const vistos = ['Línea', 'Ramo', 'Tipo de Solicitud', 'Sucursal', 'Tipo de Radicación'];
    expect(revisarOrden(['Línea', 'Sucursal', 'Tipo de Radicación'], vistos).ok).toBe(true);
    expect(revisarOrden(['Sucursal', 'Ramo'], vistos)).toMatchObject({ ok: false, inversion: ['Sucursal', 'Ramo'], observado: ['Ramo', 'Sucursal'] });
    expect(revisarOrden(['Línea', 'Placa'], vistos)).toMatchObject({ ok: false, faltan: ['Placa'] });
    expect(revisarOrden(['Línea', 'Ramo'], [...vistos, 'Ramo'])).toMatchObject({ ok: false, repetidos: ['Ramo'] });
  });

  test('reglas ortográficas de SDE: detectan los hallazgos ya reportados y los marcan con su ID', () => {
    const h = aplicarReglasOrtograficas(
      ['Observaciónes', 'Informacion a Consultar', 'Detalle Polizas Asociadas', 'Digito de Verificacion del Tomador', 'Ramo :', 'Si'],
      reglas, catalogo.conocidos);
    const por = (t: string) => h.filter((x) => x.texto === t).map((x) => `${x.regla}${x.conocido ? `@${x.conocido}` : ''}`);
    expect(por('Observaciónes')).toEqual(['ORT-PLURAL-ONES@BUG-04']);
    expect(por('Informacion a Consultar')).toEqual(['ORT-AGUDA-CION@OBS-01']);
    expect(por('Detalle Polizas Asociadas')).toEqual(['ORT-TERMINO-POLIZA@OBS-04']);
    expect(por('Digito de Verificacion del Tomador').sort()).toEqual(['ORT-AGUDA-CION@OBS-10', 'ORT-TERMINO-DIGITO@OBS-10']);
    expect(por('Ramo :')).toEqual(['ORT-ESPACIO-ANTES-DE-SIGNO@OBS-03']);
    // "Si" ya no se marca automáticamente (observación de Work, PR #2): depende del contexto afirmativo (INI-SI-AFIRMATIVO, pendiente).
    expect(por('Si')).toEqual([]);
  });

  test('control negativo: los textos correctos observados en QA no producen hallazgos', () => {
    const correctos = ['Línea', 'Ramo', 'Tipo de Solicitud', 'Sucursal', 'Tipo de Radicación', 'Forma de Consulta Unitaria', 'Número de Póliza',
      'Placa', 'Información a Consultar', 'Descripción de la Solicitud (Masiva/Múltiple)', 'Documentos Anexos', 'Observaciones', 'Sí', 'No',
      '¿Requiere actualizar el correo electrónico?', 'Nuevo correo Electrónico de Facturación', 'Confirmar Radicación', 'Desistir Solicitud',
      'Seguimiento/Trazabilidad', 'Estructurar información', 'Masiva', 'Individual', 'Póliza Nueva', 'Modificación', 'Renovación',
      'AUTOMÓVILES LIVIANOS INDIVIDUAL', 'CUMPLIMIENTO ENTIDAD ESTATAL ONLINE', 'Masivo: Solicitud asociada a más de una póliza.',
      'Número de Caso', 'Creador del Caso', 'Fecha de Creación', 'Dígito de Verificación', 'Crear', 'Guardar', 'Cancelar'];
    expect(aplicarReglasOrtograficas(correctos, reglas, catalogo.conocidos)).toEqual([]);
  });
});

test.describe('Presentación — catálogo y validador estricto @unit', () => {
  test('el catálogo real es válido y toda expectativa aprobada cita su fuente', () => {
    expect(problemasCatalogo(catalogo)).toEqual([]);
    for (const [id, e] of Object.entries(catalogo.expectativas)) {
      if (e.estado === 'aprobada') expect(e.fuente, id).toMatch(/Matriz|RAE|DLE/);
      else expect(e.responsable, id).toBeTruthy();
    }
    // Lo que ninguna fuente define queda pendiente (no se deduce del portal): orden, obligatoriedad y capitalización.
    for (const id of ['INI-ORDEN-CAMPOS', 'INI-OBLIGATORIEDAD', 'INI-CAPITALIZACION']) expect(catalogo.expectativas[id].estado, id).toBe('pendiente_definicion');
  });

  test('rechaza aprobada sin fuente, pendiente sin responsable, patrón inválido y claves desconocidas', () => {
    expect(problemasCatalogo({
      reglas_ortograficas: [{ id: 'R', patron: '(', descripcion: 'd', fuente: 'f' }],
      conocidos: {},
      expectativas: {
        A: { descripcion: 'x', estado: 'aprobada', verificar: [{ ortografia: 'inicio-radicacion' }] } as never,
        B: { descripcion: 'x', estado: 'pendiente_definicion', pendiente: 'p' } as never,
        C: { descripcion: 'x', estado: 'pendiente_definicion', pendiente: 'p', responsable: 'r', verificar: [] } as never,
      },
    } as Partial<CatalogoPresentacion>).join('\n')).toMatch(/patrón inválido[\s\S]*debe citar su "fuente"[\s\S]*requiere "pendiente" \(qué falta\) y "responsable"[\s\S]*una pendiente no se verifica/);
  });

  test('escenario: expectativa inexistente, "no_bloqueante" fuera de verificar, ámbito de ortografía y orden de 1 campo', ({}, testInfo) => {
    const ruta = testInfo.outputPath('esc.yaml');
    writeFileSync(ruta, `id: HU06-CP05
titulo: t
etiquetas: []
actores: [analista]
datasets: []
cleanup: { politica: CLEANUP_NOT_APPLICABLE, razon: r }
pasos:
  - { matriz: [2], hacer: iniciar_sesion, actor: analista, no_bloqueante: true }
  - matriz: [6]
    hacer: verificar
    no_bloqueante: true
    verificar:
      - expectativa: NO-EXISTE
      - ortografia: visible
      - orden: [Línea]
      - opcional: [Ramo]
      - expectativa: INI-ORDEN-CAMPOS
`);
    const error = (() => { try { cargarEscenario(ruta, reg); return ''; } catch (e) { return (e as Error).message; } })();
    expect(error).toContain('claves no soportadas no_bloqueante');
    expect(error).toContain('"NO-EXISTE" no existe en data/expectativas-presentacion.yaml');
    expect(error).toContain('"visible" no es una pantalla de data/expectativas-presentacion.yaml');
    expect(error).toContain('"orden": requiere al menos 2 campos');
    expect(error).not.toMatch(/opcional|INI-ORDEN-CAMPOS/);
  });

  test('los 13 escenarios oficiales siguen siendo válidos con sus validaciones de presentación', async () => {
    const { listarEscenarios } = await import('../../sde/escenario');
    const escenarios = listarEscenarios().map((r) => cargarEscenario(r, reg));
    expect(escenarios).toHaveLength(13);
  });
});

const ENV = { BIZAGI_BASE_URL: 'https://x.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c' };
const P = (matriz: number[], hacer: string, extra: Record<string, unknown> = {}): PasoSde => ({ matriz, hacer, ...extra });

function escenario(pasos: PasoSde[]): EscenarioSde {
  return { id: 'HU06-CP05', titulo: 't', etiquetas: [], actores: ['analista'], datasets: [], cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'r' }, pasos, archivo: 'sint' };
}

const CATALOGO_PRUEBA: CatalogoPresentacion = {
  pantallas: {}, reglas_ortograficas: [], conocidos: {},
  expectativas: {
    APROBADA: { descripcion: 'd', estado: 'aprobada', fuente: 'Matriz HU06-CP05 P6', verificar: [{ etiquetas: ['Observaciones'] }] },
    PENDIENTE: { descripcion: 'd', estado: 'pendiente_definicion', pendiente: 'falta el FRM', responsable: 'Daniel' },
  },
};

async function correr(pasos: PasoSde[], ok: (v: Verificacion) => boolean) {
  const verificar: Verificador = async (v) => ({ ok: ok(v), detalle: JSON.stringify(v) });
  return ejecutarEscenario(escenario(pasos), {
    capacidades: { iniciar_sesion: async (_p, c) => { c.sesiones.add('analista'); }, verificar: async () => ({}), pulsar: async () => ({ detalle: 'pulsado' }) },
    verificar, evidencia: async () => undefined, presentacion: CATALOGO_PRUEBA,
  }, crearContexto(reg, ENV, 'u'));
}

test.describe('Presentación — ejecutor: expectativas y pasos no bloqueantes @unit', () => {
  test('expectativa aprobada incumplida → FAIL por confirmar, citando su fuente', async () => {
    const r = await correr([P([2], 'iniciar_sesion', { actor: 'analista' }), P([6], 'verificar', { verificar: [{ expectativa: 'APROBADA' }] })], () => false);
    expect(r.pasos[1]).toMatchObject({ estado: 'FAIL', causa: 'PRODUCTO_POR_CONFIRMAR' });
    expect(r.pasos[1].detalle).toContain('[APROBADA · fuente: Matriz HU06-CP05 P6]');
  });

  test('expectativa pendiente → NOT_AUTOMATED (nunca verde) aunque el resto pase; un FAIL aprobado sigue mandando', async () => {
    const pend = await correr([P([2], 'iniciar_sesion', { actor: 'analista' }), P([6], 'verificar', { verificar: [{ expectativa: 'PENDIENTE' }, { expectativa: 'APROBADA' }] })], () => true);
    expect(pend.pasos[1]).toMatchObject({ estado: 'NOT_AUTOMATED', causa: 'NO_AUTOMATIZADO' });
    expect(pend.pasos[1].detalle).toContain('PENDIENTE PENDIENTE DE DEFINICIÓN (Daniel): falta el FRM');
    const ambos = await correr([P([2], 'iniciar_sesion', { actor: 'analista' }), P([6], 'verificar', { verificar: [{ expectativa: 'PENDIENTE' }, { expectativa: 'APROBADA' }] })], () => false);
    expect(ambos.pasos[1].estado).toBe('FAIL');
  });

  test('no_bloqueante: la diferencia de presentación queda FAIL pero el recorrido sigue; sin la clave se detiene', async () => {
    const pasos = (nb: boolean) => [P([2], 'iniciar_sesion', { actor: 'analista' }),
      P([6], 'verificar', { verificar: [{ ortografia: 'inicio-radicacion' }], ...(nb ? { no_bloqueante: true } : {}) }), P([7], 'pulsar', { boton: 'Crear' })];
    const sigue = await correr(pasos(true), (v) => !('ortografia' in v));
    expect(sigue.pasos.map((p) => p.estado)).toEqual(['PASS', 'FAIL', 'PASS']);
    expect(sigue.pasos[1].detalle).toContain('No bloqueante: el recorrido continúa');
    expect(sigue.estado).toBe('FAIL');
    const para = await correr(pasos(false), (v) => !('ortografia' in v));
    expect(para.pasos.map((p) => p.estado)).toEqual(['PASS', 'FAIL', 'NOT_RUN']);
  });

  test('no_bloqueante NO aplica a excepciones (automatización): el estado de la UI ya no es confiable', async () => {
    const r = await ejecutarEscenario(escenario([P([2], 'iniciar_sesion', { actor: 'analista' }),
      P([6], 'verificar', { verificar: [{ ortografia: 'inicio-radicacion' }], no_bloqueante: true }), P([7], 'pulsar', { boton: 'Crear' })]), {
      capacidades: { iniciar_sesion: async (_p, c) => { c.sesiones.add('analista'); }, verificar: async () => ({}), pulsar: async () => undefined },
      verificar: async () => { throw new Error('locator.click: Timeout 15000ms exceeded.'); }, evidencia: async () => undefined, presentacion: CATALOGO_PRUEBA,
    }, crearContexto(reg, ENV, 'u'));
    expect(r.pasos.map((p) => p.estado)).toEqual(['PASS', 'FAIL', 'NOT_RUN']);
    expect(r.pasos[1].causa).toBe('AUTOMATIZACION');
  });
});

const CAMPO = (etq: string, control: string, clases = '') =>
  `<div class="ui-bizagi-render ${clases}"><span class="ui-bizagi-label"><label>${etq}</label></span><div class="ui-bizagi-render-control">${control}</div></div>`;

// Estructura del render Bizagi (calibrada en QA): grupos con h3 de título, etiqueta de campo span.ui-bizagi-label > label,
// marca .control-required solo con el campo vacío, radios label[for] y botones en la zona de botones.
const FORM = `
  <div class="bzg-form-group"><h3 class="ui-bizagi-container-group-header">Informacion a Consultar</h3>
    ${CAMPO('Línea', '<div class="control-required"><input></div>')}
    ${CAMPO('Ramo :', '<input>')}
    ${CAMPO('Sucursal', '<input value="Bogotá">')}
  </div>
  <div class="bzg-form-group"><h3 class="ui-bizagi-container-group-header">Tipo de Consulta</h3>
    ${CAMPO('Observaciónes', '<textarea></textarea>')}
    ${CAMPO('¿Su solicitud requiere cambio de intermediario?', '<input type="radio" id="s" name="r"><label for="s">Si</label><input type="radio" id="n" name="r"><label for="n">No</label>')}
    ${CAMPO('Número de Caso', '<span>1</span>', 'ui-bizagi-render-readonly')}
    ${CAMPO('Tipo de Radicación', '<input type="radio" id="i" name="t"><label for="i">Individual</label>')}
    ${CAMPO('Codigo de Agencia', '<input>')}
  </div>
  <div class="ui-bizagi-button-container"><button>Crear</button></div>`;

async function verificarSintetico(page: import('@playwright/test').Page, v: Verificacion) {
  const ui: UiEntorno = { browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined };
  return crearCapacidadesUi(ui).verificar(v, crearContexto(reg, ENV, 'u'));
}

test.describe('Presentación — verificaciones sobre DOM sintético @unit', () => {
  test.beforeEach(async ({ page }) => { await page.setContent(FORM); });

  test('inventario en orden de lectura, con grupo, obligatoriedad y solo lectura', async ({ page }) => {
    const inv = await inventarioCampos(page);
    expect(inv.map((x) => x.etiqueta)).toEqual(['Línea', 'Ramo :', 'Sucursal', 'Observaciónes', '¿Su solicitud requiere cambio de intermediario?', 'Número de Caso', 'Tipo de Radicación', 'Codigo de Agencia']);
    expect(inv[0]).toMatchObject({ grupo: 'Informacion a Consultar', obligatorio: true, soloLectura: false });
    expect(inv[5]).toMatchObject({ grupo: 'Tipo de Consulta', soloLectura: true });
  });

  test('orden: se cumple con campos intercalados y falla con el orden invertido', async ({ page }) => {
    expect(await verificarSintetico(page, { orden: ['Línea', 'Sucursal', 'Número de Caso'] })).toMatchObject({ ok: true });
    const mal = await verificarSintetico(page, { orden: ['Sucursal', 'Línea'] });
    expect(mal.ok).toBe(false);
    expect(mal.detalle).toContain('"Línea" aparece antes que "Sucursal"');
  });

  test('opcional: vacío sin marca → cumple; vacío con marca → no cumple; con valor → no verificable (error del escenario)', async ({ page }) => {
    expect(await verificarSintetico(page, { opcional: ['Ramo'] })).toMatchObject({ ok: true });
    expect(await verificarSintetico(page, { opcional: ['Línea'] })).toMatchObject({ ok: false });
    await expect(verificarSintetico(page, { opcional: ['Sucursal'] })).rejects.toThrow(/^NO VERIFICABLE: "Sucursal" ya tiene valor/);
  });

  test('ortografía sobre los textos visibles: separa hallazgos ya registrados de los nuevos', async ({ page }) => {
    const r = await verificarSintetico(page, { ortografia: 'inicio-radicacion' });
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain('"Observaciónes" → ORT-PLURAL-ONES ("Observaciónes") [ya registrado: BUG-04]');
    expect(r.detalle).toContain('"Informacion a Consultar" → ORT-AGUDA-CION ("Informacion") [ya registrado: OBS-01]');
    expect(r.detalle).toContain('"Ramo :" → ORT-ESPACIO-ANTES-DE-SIGNO');
    expect(r.detalle).toContain('"Codigo de Agencia" → ORT-TERMINO-CODIGO ("Codigo"; correcto: Código) [NUEVO]');
    expect(r.detalle).not.toContain('"Si" →');
    expect(r.detalle).toContain('en "inicio-radicacion" (identificada por Línea, Tipo de Radicación)');
    await page.setContent(CAMPO('Observaciones', '<textarea></textarea>') + CAMPO('Línea', '<input>') + CAMPO('Tipo de Radicación', '<input>'));
    expect(await verificarSintetico(page, { ortografia: 'inicio-radicacion' })).toMatchObject({ ok: true });
  });

  test('etiquetas: "Observaciones" aprobada frente a "Observaciónes" se informa como diferencia de ortografía', async ({ page }) => {
    const r = await verificarSintetico(page, { etiquetas: ['Observaciones', 'Placa'] });
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain('"Observaciones" difiere en ortografía/capitalización: la pantalla muestra "Observaciónes"');
    expect(r.detalle).toContain('"Placa" ausente');
  });
});
