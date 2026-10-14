import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { actorDesdeEntorno } from '../data/afi/actores';
import { IntakeError } from '../data/afi/aplicacion/intakeLote';
import {
  MODELO_APLICACION_AFI, construirModeloAplicacion, validarAlmacenModelo, ModeloAplicacionError,
  type AlmacenModeloAplicacion, type VinculoObservacion,
} from '../data/afi/aplicacion/modeloAplicacion';
import { ProveedorTareasPendientes, type FuenteTareasPendientes } from '../data/afi/aplicacion/proveedorTareasPendientes';
import { testabilidadCanonica, type TestabilidadCompilacion } from '../data/afi/aplicacion/resolucionObservacion';
import { ObservacionNoDisponibleError, PROVEEDORES_PRODUCTIVOS, type ContextoObservacion, type ObservationProvider } from '../data/afi/aplicacion/superficies';
import {
  CATALOGO_PROVEEDORES, VINCULOS_OBSERVACION_AFI, VinculosInvalidosError, aplicarDecisionesVinculos, estadoProveedor, plantillaDecisionesVinculos,
  prepararRevisionVinculos, problemasConjuntoVinculos, problemasVinculo, vinculosAprobados,
} from '../data/afi/aplicacion/vinculos';
import { DefinicionCasoAfiError, compilarCasoAfi, type DefinicionCasoAfi } from '../data/afi/caso';
import { validarPlanFuncionalAfi, type PasoFuncionalAfi, type ResultadoOperacionAfi } from '../data/afi/funcional';
import { resumenCompilacion } from '../data/afi/loader';
import type { BizagiQaSupport } from '../helpers/bizagiQaSupport';
import {
  CasoAfiNoEjecutableError, ObservacionNoProductivaError, ejecutarCasoAfi, type ColaboradoresAfi,
} from '../helpers/afiCaseRunner';
import { proveedoresReales } from '../helpers/observacionRunner';
import { TESTABILIDAD, construirAgentManifest, publicarCondiciones } from '../data/afi/agentManifest';
import { entidadesDelModelo } from '../data/afi/aplicacion/modeloAplicacion';
import { resolverCondicion } from '../data/afi/aplicacion/resolucionObservacion';
import { EXPECTATIVAS_POR_ENTIDAD, publicarSuperficies, type Expectativa } from '../data/afi/aplicacion/superficies';

/**
 * Fase 4R.1: vínculos de observación (esquema, revisión humana, persistencia), condiciones observables en el contrato,
 * resolución en compilación y ejecución en el runner con un proveedor inyectado sobre una fuente FALSA.
 * Todo sintético: entidades, tareas, casos, actores. Ninguna HU concreta.
 */

const PROVEEDOR = 'tareas-pendientes-bizagi';
const TAREA_A = 'Tarea sintética de revisión';
const MODELO = construirModeloAplicacion({
  actividades: [{ id: 'actividad-a', descripcion: 'Actividad sintética A' }, { id: 'actividad-b', descripcion: 'Actividad sintética B' }],
  rutas: [{ id: 'ruta-a-b', desde: 'actividad-a', hacia: 'actividad-b', descripcion: 'Ruta sintética' }],
  integraciones: [{ id: 'integracion-x', descripcion: 'Integración sintética' }],
  variables: [{ id: 'variable-v', descripcion: 'Dato sintético', ambito: { tipo: 'proceso' }, superficies: ['proceso-bpm'] }],
  notificaciones: [{ id: 'notificacion-n', descripcion: 'Aviso sintético' }],
  pantallas: [{ id: 'pantalla-p', descripcion: 'Pantalla sintética' }],
});
const vinculo = (id = 'actividad-a', nombreTarea = TAREA_A): VinculoObservacion =>
  ({ entidad: { tipo: 'actividad', id }, superficie: 'proceso-bpm', proveedor: PROVEEDOR, localizacion: { nombreTarea } });
const ALMACEN: AlmacenModeloAplicacion = {
  schemaVersion: 'afi-application-model/v1', revision: 3,
  entidades: { pantallas: [], campos: [], actividades: [...MODELO.proceso.actividades], rutas: [...MODELO.proceso.rutas], integraciones: [], variables: [], notificaciones: [] },
  historial: [],
};
const modeloDe = (a: AlmacenModeloAplicacion) => construirModeloAplicacion({ ...a.entidades });

// =====================================================================================
test.describe('4R.1 A. esquema del vínculo (fail-closed)', () => {
  test('vínculo válido; catálogo coherente con la implementación; productivo SOLO en su alcance de catálogo', () => {
    expect(problemasVinculo(vinculo(), MODELO)).toEqual([]);
    const impl = new ProveedorTareasPendientes({ casoAdministrado: () => undefined, tareasPendientes: async () => [] }, new Map());
    expect([impl.id, impl.superficie, [...impl.expectativas]]).toEqual([PROVEEDOR, CATALOGO_PROVEEDORES[PROVEEDOR].superficie, [...CATALOGO_PROVEEDORES[PROVEEDOR].expectativas]]);
    expect(PROVEEDORES_PRODUCTIVOS).toEqual([{ id: 'tareas-pendientes-bizagi', superficie: 'proceso-bpm', alcance: { tipos: ['actividad'], expectativas: ['alcanzada'] } }]);
    // El alcance productivo ES el del catálogo (sin listas duplicadas).
    expect(PROVEEDORES_PRODUCTIVOS[0].alcance).toEqual({ tipos: CATALOGO_PROVEEDORES[PROVEEDOR].tipos, expectativas: CATALOGO_PROVEEDORES[PROVEEDOR].expectativas });
    expect([estadoProveedor(PROVEEDOR), estadoProveedor(PROVEEDOR, []), estadoProveedor('inexistente')]).toEqual(['productivo', 'disponible', 'desconocido']);
    expect(VINCULOS_OBSERVACION_AFI).toEqual([]); // el almacén real aún no tiene vínculos aprobados
  });

  const casos: [string, unknown, RegExp][] = [
    ['clave ajena', { ...vinculo(), estado: 'APPROVED' }, /clave no admitida/],
    ['entidad no registrada', vinculo('actividad-z'), /no registrada/],
    ['tipo incorrecto', { ...vinculo(), entidad: { tipo: 'actividad', id: 'ruta-a-b' } }, /es ruta, no actividad/],
    ['proveedor sin implementación', { ...vinculo(), proveedor: 'proveedor-x' }, /sin implementación/],
    ['superficie que el proveedor no observa', { ...vinculo(), superficie: 'integracion' }, /observa proceso-bpm/],
    ['tipo que el proveedor no localiza', { entidad: { tipo: 'ruta', id: 'ruta-a-b' }, superficie: 'proceso-bpm', proveedor: PROVEEDOR, localizacion: { nombreTarea: 'x' } }, /no localiza entidades ruta/],
    ['configuración desconocida', { ...vinculo(), localizacion: { nombreTarea: TAREA_A, selector: 'x' } }, /localizacion\.selector: no admitida/],
    ['configuración ausente', { ...vinculo(), localizacion: {} }, /nombreTarea: texto/],
    ['PII', vinculo('actividad-a', 'Tarea de 1023456789'), /PII/],
    ['selector', vinculo('actividad-a', '#btn-x'), /SELECTOR/],
    ['código', vinculo('actividad-a', '() => true'), /CODIGO/],
    ['URL', vinculo('actividad-a', 'https://x.test'), /INSTRUCCION/],
    ['multilínea', vinculo('actividad-a', 'a\nb'), /una línea/],
  ];
  for (const [nombre, v, motivo] of casos) {
    test(`rechaza: ${nombre}`, () => { expect(problemasVinculo(v, MODELO).join('; ')).toMatch(motivo); });
  }

  test('conjunto: contradictorio (misma entidad+proveedor) y ambiguo (misma tarea para dos entidades)', () => {
    expect(problemasConjuntoVinculos([vinculo(), vinculo('actividad-a', 'Otra tarea')], MODELO).join()).toMatch(/contradictorio o duplicado/);
    expect(problemasConjuntoVinculos([vinculo(), vinculo('actividad-b', ` ${TAREA_A.toUpperCase()} `)], MODELO).join()).toMatch(/misma localización.*ambiguo/);
    expect(problemasConjuntoVinculos([vinculo(), vinculo('actividad-b', 'Tarea sintética B')], MODELO)).toEqual([]);
  });

  test('un almacén con vínculos incoherentes no carga; con PII ni siquiera valida', () => {
    expect(() => vinculosAprobados({ ...ALMACEN, vinculosObservacion: [vinculo('actividad-z')] }, MODELO)).toThrow(VinculosInvalidosError);
    expect(() => validarAlmacenModelo({ ...ALMACEN, vinculosObservacion: [vinculo('actividad-a', 'buzon.sintetico@example.test')] })).toThrow(ModeloAplicacionError);
  });
});

// =====================================================================================
test.describe('4R.1 B. revisión humana: preparar -> decidir -> aplicar', () => {
  const entrada = { observationBindings: [vinculo(), vinculo('actividad-z')] };

  test('preparar no aprueba nada, rechaza lo inválido sin copiarlo y no acepta auto-aprobación', () => {
    const a = prepararRevisionVinculos(entrada, ALMACEN, MODELO);
    expect(a.vinculos.map(v => v.bindingId)).toEqual([`actividad:actividad-a@${PROVEEDOR}`]);
    expect(a.rechazados).toEqual([{ indice: 1, problemas: [expect.stringMatching(/no registrada/)] }]);
    expect(plantillaDecisionesVinculos(a).decisiones.every(d => d.decision === null && d.revisor === null)).toBe(true);
    expect(() => prepararRevisionVinculos({ ...entrada, decisiones: [] }, ALMACEN, MODELO)).toThrow(IntakeError);
    expect(prepararRevisionVinculos({ observationBindings: [{ ...vinculo(), estado: 'APPROVED' }] }, ALMACEN, MODELO).vinculos).toEqual([]);
  });

  test('aplicar: solo APPROVED con hash y revisor; sección separada; entidades intactas; reaplicar = YA_APLICADO', () => {
    const a = prepararRevisionVinculos(entrada, ALMACEN, MODELO);
    const plantilla = plantillaDecisionesVinculos(a);
    expect(aplicarDecisionesVinculos(a, plantilla, ALMACEN, MODELO, '2026-10-02').estado).toBe('SIN_CAMBIOS');
    const aprobar = (cambios: Partial<(typeof plantilla.decisiones)[number]>) => ({ ...plantilla, decisiones: [{ ...plantilla.decisiones[0], decision: 'APPROVED' as const, revisor: 'qa-revisor', ...cambios }] });
    expect(() => aplicarDecisionesVinculos(a, aprobar({ hash: 'otro' }), ALMACEN, MODELO, '2026-10-02')).toThrow(/hash decidido/);
    expect(() => aplicarDecisionesVinculos(a, aprobar({ revisor: null }), ALMACEN, MODELO, '2026-10-02')).toThrow(/revisor inválido/);
    const r = aplicarDecisionesVinculos(a, aprobar({}), ALMACEN, MODELO, '2026-10-02');
    expect([r.estado, r.revisionAntes, r.revisionDespues, r.aprobados]).toEqual(['APLICABLE', 3, 4, [`actividad:actividad-a@${PROVEEDOR}`]]);
    expect(r.almacen.entidades).toEqual(ALMACEN.entidades);
    expect(r.almacen.historial).toEqual([]);
    expect(r.almacen.vinculosObservacion).toEqual([vinculo()]);
    expect(r.almacen.historialVinculos).toMatchObject([{ revision: 4, vinculo: `actividad:actividad-a@${PROVEEDOR}`, revisor: 'qa-revisor', lote: a.batchId }]);
    expect(vinculosAprobados(r.almacen, modeloDe(r.almacen))).toEqual([vinculo()]);
    expect(aplicarDecisionesVinculos(a, aprobar({}), r.almacen, modeloDe(r.almacen), '2026-10-02').estado).toBe('YA_APLICADO');
  });

  test('conflictos: almacén cambiado, artefacto adulterado, vínculo contradictorio con uno aprobado', () => {
    const a = prepararRevisionVinculos(entrada, ALMACEN, MODELO);
    const ok = { ...plantillaDecisionesVinculos(a), decisiones: plantillaDecisionesVinculos(a).decisiones.map(d => ({ ...d, decision: 'APPROVED' as const, revisor: 'qa-revisor' })) };
    expect(() => aplicarDecisionesVinculos(a, ok, { ...ALMACEN, revision: 4 }, MODELO, 'f')).toThrow(/REVISION_CONFLICTO/);
    const adulterado = { ...a, vinculos: [{ ...a.vinculos[0], vinculo: vinculo('actividad-a', 'Cambiada') }] };
    expect(() => aplicarDecisionesVinculos(adulterado, ok, ALMACEN, MODELO, 'f')).toThrow(/HASH_DISTINTO/);
    const conAprobado = { ...ALMACEN, vinculosObservacion: [vinculo()] };
    expect(prepararRevisionVinculos({ observationBindings: [vinculo('actividad-a', 'Otra')] }, conAprobado, MODELO).rechazados[0].problemas.join()).toMatch(/contradictorio/);
  });
});

// =====================================================================================
const PASO_UI: PasoFuncionalAfi = { id: 'P01', esperado: 'El Portal no muestra el aviso sintético.', operaciones: [{ tipo: 'texto-ausente', texto: 'Aviso sintético', coincidencia: 'exacta' }] };
const pasoCondicion = (condiciones: unknown[]): PasoFuncionalAfi =>
  ({ id: 'P02', esperado: 'El proceso alcanza la actividad sintética.', operaciones: [], condiciones } as PasoFuncionalAfi);
const ALCANZADA_A = { entidad: { tipo: 'actividad', id: 'actividad-a' }, expectativa: { tipo: 'alcanzada' } };
const definicion = (condiciones: unknown[] = [ALCANZADA_A]): DefinicionCasoAfi => ({
  version: 1, hu: 'HU sintética', caso: 'caso-sintetico', nombre: 'Sintetico Observacion', perfil: 'empresa',
  preparacion: { datosCaso: { tipoAportante: 'Empleador' }, camposAsercion: [], etapas: ['inicio-solicitud', 'telefonos', 'informacion-adicional'] },
  funcional: { caso: 'caso-sintetico', pasos: [PASO_UI, pasoCondicion(condiciones)] },
});
const ACTOR = actorDesdeEntorno('empresa', { AFI_QA_EMPRESA_IDENTIFICACION: '900000001', AFI_QA_CORREO: 'empresa.qa@example.test' });
const T = (extra: Partial<TestabilidadCompilacion> = {}): TestabilidadCompilacion => ({ modelo: MODELO, vinculos: [vinculo()], proveedoresHabilitados: [PROVEEDOR], ...extra });
/** Simula un proveedor AÚN no productivo (habilitado explícitamente para una corrida de validación). */
const NO_PRODUCTIVO = { productivos: [] as string[] };
const compilar = (condiciones?: unknown[], t: TestabilidadCompilacion = T()) => compilarCasoAfi(definicion(condiciones), ACTOR, { testabilidad: t });

test.describe('4R.1 C. contrato: condiciones observables en el paso', () => {
  test('aditivo: un paso puede tener solo condiciones; sin operaciones ni condiciones sigue siendo inválido', () => {
    expect(validarPlanFuncionalAfi(definicion().funcional)).toEqual([]);
    expect(validarPlanFuncionalAfi({ caso: 'c', pasos: [{ ...pasoCondicion([]), condiciones: undefined }] }).map(p => p.ruta)).toContain('pasos[0].operaciones');
  });

  const invalidas: [string, unknown, RegExp][] = [
    ['detalle del proveedor', { ...ALCANZADA_A, proveedor: PROVEEDOR }, /solo entidad y expectativa/],
    ['nombre visible', { ...ALCANZADA_A, nombreVisible: TAREA_A }, /solo entidad y expectativa/],
    ['selector en la entidad', { entidad: { tipo: 'actividad', id: 'actividad-a', selector: '#x' }, expectativa: { tipo: 'alcanzada' } }, /\{ tipo, id \}/],
    ['tipo desconocido', { entidad: { tipo: 'subproceso', id: 'x-y' }, expectativa: { tipo: 'alcanzada' } }, /desconocido/],
    ['expectativa de otro tipo', { entidad: { tipo: 'ruta', id: 'ruta-a-b' }, expectativa: { tipo: 'visible' } }, /no aplicable a ruta/],
    ['valor no primitivo', { entidad: { tipo: 'variable', id: 'variable-v' }, expectativa: { tipo: 'valor', igual: { a: 1 } } }, /primitivo/],
  ];
  for (const [nombre, c, motivo] of invalidas) {
    test(`rechaza: ${nombre}`, () => {
      const p = validarPlanFuncionalAfi({ caso: 'c', pasos: [pasoCondicion([c])] });
      expect(p.map(x => `${x.clase} ${x.mensaje}`).join('; ')).toMatch(motivo);
      expect(p.every(x => x.clase === 'invalido')).toBe(true);
    });
  }

  test('paso cerrado y sin duplicados', () => {
    expect(validarPlanFuncionalAfi({ caso: 'c', pasos: [{ ...PASO_UI, extra: 1 }] }).map(p => p.mensaje)).toContain('propiedad no admitida por el paso');
    expect(validarPlanFuncionalAfi({ caso: 'c', pasos: [pasoCondicion([ALCANZADA_A, ALCANZADA_A])] }).map(p => p.mensaje)).toContain('condición duplicada en el paso');
  });
});

// =====================================================================================
test.describe('4R.1 D. compilador: entidad -> superficie -> vínculo -> proveedor', () => {
  test('vínculo aprobado + proveedor productivo: REPRESENTABLE, sin marca de validación', () => {
    const c = compilar();
    expect(c.ejecutable).toBe(true);
    expect(c.observacion).toEqual({
      condiciones: [{ paso: 'P02', condicion: 'P02#1', estado: 'REPRESENTABLE', entidad: { tipo: 'actividad', id: 'actividad-a' }, expectativa: { tipo: 'alcanzada' }, superficie: 'proceso-bpm', proveedor: PROVEEDOR, validacion: false }],
      gaps: [], validacion: false,
    });
    // El compilado nunca lleva la localización del vínculo.
    expect(JSON.stringify(c)).not.toContain(TAREA_A);
    expect(resumenCompilacion(c).texto.split('\n')).toContain(`  P02#1 actividad:actividad-a alcanzada -> ${PROVEEDOR}`);
    expect(resumenCompilacion(c).texto).not.toContain('VALIDACIÓN');
  });

  test('proveedor AÚN no productivo habilitado explícitamente: REPRESENTABLE marcado como validación', () => {
    const c = compilar(undefined, T(NO_PRODUCTIVO));
    expect([c.ejecutable, c.observacion.validacion, c.observacion.condiciones[0].validacion]).toEqual([true, true, true]);
    expect(resumenCompilacion(c).texto).toContain(`P02#1 actividad:actividad-a alcanzada -> ${PROVEEDOR} (VALIDACIÓN, no productivo)`);
  });

  const gap = (condiciones: unknown[], t?: TestabilidadCompilacion) => { const c = compilar(condiciones, t); expect(c.ejecutable).toBe(false); return c.observacion.gaps[0]; };

  test('KNOWLEDGE_GAP, TESTABILITY_GAP (sin vínculo / no productivo / no certificable) y CAPABILITY_GAP', () => {
    expect(gap([{ entidad: { tipo: 'actividad', id: 'actividad-z' }, expectativa: { tipo: 'alcanzada' } }])).toMatchObject({ estado: 'KNOWLEDGE_GAP', capacidad: 'registrar actividad' });
    expect(gap([{ entidad: { tipo: 'actividad', id: 'actividad-b' }, expectativa: { tipo: 'alcanzada' } }])).toMatchObject({ estado: 'TESTABILITY_GAP', motivo: 'sin-vinculo' });
    expect(gap([ALCANZADA_A], T({ proveedoresHabilitados: [] }))).toMatchObject({ estado: 'TESTABILITY_GAP', motivo: 'proveedor-no-productivo' });
    expect(gap([{ ...ALCANZADA_A, expectativa: { tipo: 'no-alcanzada' } }])).toMatchObject({ estado: 'TESTABILITY_GAP', motivo: 'expectativa-no-certificable', capacidad: 'observar actividad no-alcanzada' });
    for (const c of [
      { entidad: { tipo: 'ruta', id: 'ruta-a-b' }, expectativa: { tipo: 'tomada' } },
      { entidad: { tipo: 'variable', id: 'variable-v' }, expectativa: { tipo: 'valor', igual: null } },
      { entidad: { tipo: 'integracion', id: 'integracion-x' }, expectativa: { tipo: 'resultado', igual: 'exito' } },
      { entidad: { tipo: 'notificacion', id: 'notificacion-n' }, expectativa: { tipo: 'emitida' } },
    ]) expect(gap([c]), c.entidad.tipo).toMatchObject({ estado: 'TESTABILITY_GAP', motivo: 'sin-vinculo' });
    expect(gap([{ entidad: { tipo: 'pantalla-ui', id: 'pantalla-p' }, expectativa: { tipo: 'visible' } }])).toMatchObject({ estado: 'CAPABILITY_GAP' });
  });

  test('entidad usada con otra clase: error de contrato', () => {
    expect(() => compilar([{ entidad: { tipo: 'actividad', id: 'ruta-a-b' }, expectativa: { tipo: 'alcanzada' } }])).toThrow(DefinicionCasoAfiError);
  });

  test('canónico (solo productivos): sin vínculo aprobado, toda actividad registrada del modelo real sigue TESTABILITY_GAP; legacy intacto', () => {
    const canonica = testabilidadCanonica();
    expect([canonica.proveedoresHabilitados, canonica.vinculos]).toEqual([[PROVEEDOR], []]);
    for (const a of MODELO_APLICACION_AFI.proceso.actividades) {
      const c = compilarCasoAfi(definicion([{ entidad: { tipo: 'actividad', id: a.id }, expectativa: { tipo: 'alcanzada' } }]), ACTOR);
      expect(c.observacion.gaps.map(g => [g.estado, g.motivo]), a.id).toEqual([['TESTABILITY_GAP', 'sin-vinculo']]);
    }
    const legacy = compilarCasoAfi({ ...definicion(), funcional: { caso: 'c', pasos: [PASO_UI] } }, ACTOR);
    expect(legacy.observacion).toEqual({ condiciones: [], gaps: [], validacion: false });
    expect(resumenCompilacion(legacy).texto).not.toContain('Observación');
  });
});

// =====================================================================================
// E. Runner end-to-end sintético: compilado -> runner -> proveedor inyectado -> fuente falsa.

const NUMERO = '900123';
function portalHtml(): string {
  return `<div id="s"></div><script>(() => { window.mostrar = () => { document.getElementById('s').innerHTML = '<h2>Información de contacto</h2>'; }; })();</script>`;
}

interface Fuente extends FuenteTareasPendientes { lecturas: number; contextos: ContextoObservacion[] }
/** Fuente FALSA: secuencia de respuestas (tareas pendientes o error). */
function fuenteFalsa(respuestas: (readonly string[] | Error)[], caso = NUMERO): Fuente {
  return {
    lecturas: 0, contextos: [],
    casoAdministrado: () => caso,
    async tareasPendientes() { const r = respuestas[Math.min(this.lecturas++, respuestas.length - 1)]; if (r instanceof Error) throw r; return r; },
  };
}
/** Espía del contexto que recibe un proveedor (para demostrar que no lleva actor ni provisión). */
function espiar(p: ObservationProvider, contextos: ContextoObservacion[]): ObservationProvider {
  return { id: p.id, superficie: p.superficie, expectativas: p.expectativas, supports: e => p.supports(e), observe: (e, ctx) => { contextos.push(ctx); return p.observe(e, ctx); } };
}

function simulados(page: Page, proveedores: readonly ObservationProvider[]) {
  const r = { pasos: [] as string[], cancelados: 0, creados: 0 };
  const colaboradores: ColaboradoresAfi = {
    portal: {
      abrir: async () => { await page.setContent(portalHtml()); },
      enviarUnaVez: async registrar => { r.creados++; await registrar(NUMERO); await page.evaluate(() => (window as unknown as { mostrar(): void }).mostrar()); return NUMERO; },
    },
    soporte: { login: async () => {}, registrarCasoCreado: async () => {}, emularReconocimiento: async () => {}, cancelarCasoCreado: async () => { r.cancelados++; } },
    datosUi: { completarInicioSolicitud: async () => [], completarTelefonos: async () => [], completarInformacionAdicional: async () => [] },
    funcionalUi: {
      ejecutarPaso: async (paso: PasoFuncionalAfi, registrar?: (res: ResultadoOperacionAfi) => Promise<void>) => {
        r.pasos.push(paso.id);
        const res: ResultadoOperacionAfi = { tipo: paso.operaciones[0].tipo, resultado: 'PASS', observado: {} };
        await registrar?.(res);
        return [res];
      },
    },
    proveedoresObservacion: proveedores,
    cerrar: async () => {},
  };
  return { r, fabrica: async () => colaboradores };
}

const runtime = (page: Page, context: Parameters<typeof ejecutarCasoAfi>[1]['context'], info: TestInfo, fabrica: () => Promise<ColaboradoresAfi>, extra = {}) =>
  ({ page, context, testInfo: info, colaboradores: fabrica, observacion: { modelo: MODELO, permitirNoProductivos: true, esperar: async () => {}, ...extra } });
const proveedor = (f: FuenteTareasPendientes) => new ProveedorTareasPendientes(f, new Map([['actividad-a', TAREA_A]]));
const adjunto = async (info: TestInfo, nombre: string) => readFile(info.attachments.filter(a => a.name === nombre).at(-1)!.path!, 'utf8');

test.describe('4R.1 E. runner end-to-end sintético', () => {
  test('tarea vinculada presente -> PASS; contexto solo con la correlación de la corrida; sin textos de la fuente', async ({ page, context }, info) => {
    const f = fuenteFalsa([['Otra tarea', TAREA_A]]);
    const contextos: ContextoObservacion[] = [];
    const { r, fabrica } = simulados(page, [espiar(proveedor(f), contextos)]);
    const res = await ejecutarCasoAfi(compilar(), runtime(page, context, info, fabrica));
    expect(res.resultado).toBe('PASS');
    expect(res.pasosFuncionales.map(p => [p.id, p.resultado])).toEqual([['P01', 'PASS'], ['P02', 'PASS']]);
    expect(r.pasos).toEqual(['P01']); // el paso solo-condiciones no pasa por la UI
    expect(res.observacionValidacion).toBeUndefined(); // proveedor productivo: no es una corrida de validación
    expect(res.observaciones).toMatchObject([{ condicion: 'P02#1', resultado: 'PASS', proveedor: PROVEEDOR, superficie: 'proceso-bpm' }]);
    expect(contextos).toEqual([{ caso: 'caso-sintetico', ejecucion: info.testId, casoBizagi: NUMERO }]);
    const archivos = [JSON.stringify(res), await adjunto(info, 'Sintetico-observaciones.json'), await adjunto(info, 'Sintetico-resultado.json')].join();
    expect(archivos).not.toContain(TAREA_A);
    expect(archivos).not.toMatch(/900000001|example\.test/);
    expect(r.cancelados).toBe(1);
  });

  test('tarea ausente -> paso y caso NO_OBSERVABLE (nunca FAIL, sin excepción, cleanup hecho)', async ({ page, context }, info) => {
    const { r, fabrica } = simulados(page, [proveedor(fuenteFalsa([['Otra tarea']]))]);
    const res = await ejecutarCasoAfi(compilar(), runtime(page, context, info, fabrica));
    expect([res.resultado, res.pasosFuncionales.at(-1)!.resultado]).toEqual(['NO_OBSERVABLE', 'NO_OBSERVABLE']);
    expect(res.observaciones![0].noObservado).toEqual({ intentos: [{ superficie: 'proceso-bpm', proveedor: PROVEEDOR, motivo: 'dato-ausente' }] });
    expect([res.error, r.cancelados]).toEqual([undefined, 1]);
  });

  test('error de infraestructura -> NO_OBSERVABLE (infraestructura), no se reintenta', async ({ page, context }, info) => {
    const f = fuenteFalsa([new ObservacionNoDisponibleError('infraestructura'), [TAREA_A]]);
    const { fabrica } = simulados(page, [proveedor(f)]);
    const res = await ejecutarCasoAfi(compilar(), runtime(page, context, info, fabrica, { reintentos: { intentos: 3, intervaloMs: 1 } }));
    expect(res.resultado).toBe('NO_OBSERVABLE');
    expect(res.observaciones![0].noObservado!.intentos[0].motivo).toBe('infraestructura');
    expect(f.lecturas).toBe(1);
  });

  test('dato-ausente se reintenta dentro del presupuesto: aparece después -> PASS', async ({ page, context }, info) => {
    const f = fuenteFalsa([[], [], [TAREA_A]]);
    const { fabrica } = simulados(page, [proveedor(f)]);
    const res = await ejecutarCasoAfi(compilar(), runtime(page, context, info, fabrica, { reintentos: { intentos: 3, intervaloMs: 1 } }));
    expect([res.resultado, f.lecturas]).toEqual(['PASS', 3]);
  });

  test('la fuente administra OTRO caso: dato-ausente (solo el caso de la corrida es observable)', async ({ page, context }, info) => {
    const { fabrica } = simulados(page, [proveedor(fuenteFalsa([[TAREA_A]], '777001'))]);
    const res = await ejecutarCasoAfi(compilar(), runtime(page, context, info, fabrica));
    expect(res.observaciones![0].noObservado!.intentos[0].motivo).toBe('dato-ausente');
  });

  test('un proveedor que no es el resuelto por el compilador se ignora aunque afirme PASS', async ({ page, context }, info) => {
    const impostor: ObservationProvider = { id: 'impostor', superficie: 'proceso-bpm', supports: () => true, observe: async () => ({ medicion: { tipo: 'presencia', presente: true }, evidencia: { tipo: 't', referencia: 'r' } }) };
    const { fabrica } = simulados(page, [impostor]);
    const res = await ejecutarCasoAfi(compilar(), runtime(page, context, info, fabrica));
    expect(res.resultado).toBe('NO_OBSERVABLE');
  });

  test('vínculo ausente -> TESTABILITY_GAP ANTES de ejecutar: ni colaboradores ni caso', async ({ page, context }, info) => {
    const c = compilar(undefined, T({ vinculos: [] }));
    let llamados = 0;
    const error = await ejecutarCasoAfi(c, { page, context, testInfo: info, colaboradores: async () => { llamados++; throw new Error('no'); } }).then(() => null, (e: Error) => e);
    expect(error).toBeInstanceOf(CasoAfiNoEjecutableError);
    expect(error!.message).toBe('El caso "Sintetico Observacion" no es ejecutable.\nCondiciones no observables:\n- P02#1 actividad:actividad-a alcanzada: TESTABILITY_GAP (sin-vinculo)');
    expect(llamados).toBe(0);
  });

  test('proveedor NO productivo (simulado) sin el opt-in de validación de la ejecución: rechazado antes de UI', async ({ page, context }, info) => {
    let llamados = 0;
    const error = await ejecutarCasoAfi(compilar(undefined, T(NO_PRODUCTIVO)), { page, context, testInfo: info, colaboradores: async () => { llamados++; throw new Error('no'); } }).then(() => null, (e: Error) => e);
    expect(error).toBeInstanceOf(ObservacionNoProductivaError);
    expect(llamados).toBe(0);
  });

  test('proveedores reales: solo los ids pedidos y conocidos, construidos con los vínculos de su proveedor', () => {
    const soporte = {} as BizagiQaSupport;
    const ps = proveedoresReales(soporte, [PROVEEDOR, PROVEEDOR, 'desconocido'], [vinculo(), vinculo('actividad-b', 'Tarea B')]);
    expect(ps.map(p => p.id)).toEqual([PROVEEDOR]);
    expect([ps[0].supports({ tipo: 'actividad', id: 'actividad-b' }), ps[0].supports({ tipo: 'actividad', id: 'actividad-z' })]).toEqual([true, false]);
    expect(proveedoresReales(soporte, [], [vinculo()])).toEqual([]);
  });
});

// =====================================================================================
// 4R cierre: promoción productiva de tareas-pendientes-bizagi con alcance PARCIAL (actividad.alcanzada).

const CANONICA_CON = (vinculos: VinculoObservacion[]): TestabilidadCompilacion => ({ ...testabilidadCanonica(), modelo: MODELO, vinculos });
const muestra = (tipo: Expectativa['tipo']): Expectativa =>
  (tipo === 'valor' ? { tipo, igual: null } : tipo === 'resultado' ? { tipo, igual: 'exito' } : { tipo }) as Expectativa;

test.describe('4R cierre. promoción productiva con alcance parcial', () => {
  test('A. alcanzada + vínculo aprobado + proveedor productivo: compilable SIN proveedoresHabilitados explícitos', () => {
    const c = compilar(undefined, CANONICA_CON([vinculo()]));
    expect([c.ejecutable, c.observacion.validacion]).toEqual([true, false]);
    expect(c.observacion.condiciones.map(x => [x.estado, x.proveedor, x.superficie])).toEqual([['REPRESENTABLE', PROVEEDOR, 'proceso-bpm']]);
  });

  test('B. ya no requiere permitirNoProductivos: el runner lo ejecuta y certifica PASS', async ({ page, context }, info) => {
    const { fabrica } = simulados(page, [proveedor(fuenteFalsa([[TAREA_A]]))]);
    const res = await ejecutarCasoAfi(compilar(undefined, CANONICA_CON([vinculo()])), {
      page, context, testInfo: info, colaboradores: fabrica, observacion: { modelo: MODELO, esperar: async () => {} },
    });
    expect([res.resultado, res.observaciones![0].resultado, res.observacionValidacion]).toEqual(['PASS', 'PASS', undefined]);
  });

  const gapCanonico = (condicion: unknown, vinculos: VinculoObservacion[] = [vinculo()]) => {
    const c = compilar([condicion], CANONICA_CON(vinculos));
    expect(c.ejecutable).toBe(false);
    return c.observacion.gaps[0];
  };

  test('C. alcanzada SIN vínculo -> TESTABILITY_GAP (sin-vinculo)', () => {
    expect(gapCanonico(ALCANZADA_A, [])).toMatchObject({ estado: 'TESTABILITY_GAP', motivo: 'sin-vinculo' });
  });

  test('D. no-alcanzada CON vínculo -> TESTABILITY_GAP (expectativa-no-certificable)', () => {
    expect(gapCanonico({ ...ALCANZADA_A, expectativa: { tipo: 'no-alcanzada' } }))
      .toMatchObject({ estado: 'TESTABILITY_GAP', motivo: 'expectativa-no-certificable', capacidad: 'observar actividad no-alcanzada' });
  });

  test('E/F. ruta, variable, integración y notificación -> TESTABILITY_GAP aunque el proveedor esté en proceso-bpm; y no se pueden vincular a él', () => {
    for (const c of [
      { entidad: { tipo: 'ruta', id: 'ruta-a-b' }, expectativa: { tipo: 'tomada' } },
      { entidad: { tipo: 'ruta', id: 'ruta-a-b' }, expectativa: { tipo: 'no-tomada' } },
      { entidad: { tipo: 'variable', id: 'variable-v' }, expectativa: { tipo: 'valor', igual: null } },
      { entidad: { tipo: 'integracion', id: 'integracion-x' }, expectativa: { tipo: 'resultado', igual: 'exito' } },
      { entidad: { tipo: 'notificacion', id: 'notificacion-n' }, expectativa: { tipo: 'emitida' } },
    ]) expect(gapCanonico(c), `${c.entidad.tipo}.${c.expectativa.tipo}`).toMatchObject({ estado: 'TESTABILITY_GAP' });
    for (const [tipo, id] of [['ruta', 'ruta-a-b'], ['variable', 'variable-v']] as const) {
      expect(problemasVinculo({ entidad: { tipo, id }, superficie: 'proceso-bpm', proveedor: PROVEEDOR, localizacion: { nombreTarea: 'x' } }, MODELO).join(), tipo)
        .toMatch(new RegExp(`no localiza entidades ${tipo}`));
    }
  });

  test('sin vínculos, la mera existencia del proveedor productivo NO cambia ningún diagnóstico del modelo canónico', () => {
    const conProveedor = testabilidadCanonica();
    const sinProveedor: TestabilidadCompilacion = { ...conProveedor, proveedoresHabilitados: [], productivos: [] };
    let n = 0;
    for (const [tipo, id] of entidadesDelModelo(MODELO_APLICACION_AFI)) {
      for (const e of EXPECTATIVAS_POR_ENTIDAD[tipo]) {
        const c = { entidad: { tipo, id }, expectativa: muestra(e) };
        const a = resolverCondicion('P', 0, c, conProveedor), b = resolverCondicion('P', 0, c, sinProveedor);
        expect(a, `${tipo}:${id}.${e}`).toEqual(b);
        expect(a.estado, `${tipo}:${id}.${e}`).not.toBe('REPRESENTABLE');
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
  });

  test('G. el manifest publica la cobertura parcial EXACTA, derivada del catálogo', () => {
    const bpm = TESTABILIDAD.superficies.find(s => s.superficie === 'proceso-bpm')!;
    const d = CATALOGO_PROVEEDORES[PROVEEDOR];
    expect(bpm).toMatchObject({
      estado: 'parcial', proveedores: [PROVEEDOR],
      cobertura: [{ proveedor: PROVEEDOR, observaciones: d.tipos.map(entidad => ({ entidad, expectativas: [...d.expectativas] })) }],
    });
    expect(bpm.cobertura).toEqual([{ proveedor: PROVEEDOR, observaciones: [{ entidad: 'actividad', expectativas: ['alcanzada'] }] }]);
    // La superficie sigue declarando TODO lo que existe en ella: la cobertura no la reescribe.
    expect(bpm.observaciones.map(o => o.entidad)).toEqual(['actividad', 'ruta', 'variable']);
    expect(TESTABILIDAD.superficies.find(s => s.superficie === 'integracion')).toMatchObject({ estado: 'sin-proveedor', proveedores: [] });
    // Estado derivado: cobertura total = con-proveedor; parcial = parcial; legado sin alcance = total (compatibilidad 4L).
    const total = {
      id: 'p-total', superficie: 'proceso-bpm' as const,
      alcance: { tipos: ['actividad', 'ruta', 'variable'] as const, expectativas: ['alcanzada', 'no-alcanzada', 'tomada', 'no-tomada', 'valor'] as const },
    };
    expect(publicarSuperficies([total]).find(s => s.superficie === 'proceso-bpm')!.estado).toBe('con-proveedor');
    expect(publicarSuperficies([{ id: 'legado', superficie: 'proceso-bpm' }]).find(s => s.superficie === 'proceso-bpm')!.estado).toBe('con-proveedor');
    expect(JSON.parse(JSON.stringify(construirAgentManifest().testabilidad.superficies))).toEqual(JSON.parse(JSON.stringify(TESTABILIDAD.superficies)));
  });

  test('H. observablesHoy vacío sin vínculos aprobados (provider productivo != entidad observable)', () => {
    const c = construirAgentManifest().funcional.condiciones;
    expect([c.proveedoresProductivos, c.observablesHoy]).toEqual([[PROVEEDOR], []]);
  });

  test('I. un vínculo sintético aprobado hace aparecer SOLO actividad.alcanzada en observablesHoy', () => {
    expect(publicarCondiciones(CANONICA_CON([vinculo()])).observablesHoy).toEqual([{ tipo: 'actividad', id: 'actividad-a', expectativa: 'alcanzada' }]);
  });
});
