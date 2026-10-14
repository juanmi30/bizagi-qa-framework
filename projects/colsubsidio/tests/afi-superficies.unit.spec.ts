import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REGISTRO_CAMPOS_FUNCIONALES } from '../data/afi/aplicacion/campos';
import { mensajeParaQa, validarSalidaAgente, type SalidaAgente } from '../data/afi/aplicacion/conversacion';
import { CLASES_GAP, clasificarIncorporacion, deduplicarGaps, diagnosticarCondicion, type GapDetectado } from '../data/afi/aplicacion/gaps';
import { contarSalidas, medirSuperficies, validarRegistroFases, type RegistroFaseFramework } from '../data/afi/aplicacion/metricas';
import {
  ALMACEN_APLICACION_AFI, MODELO_APLICACION_AFI, ModeloAplicacionError, construirModeloAplicacion, resolverEntidad, type ExtensionModeloAplicacion,
} from '../data/afi/aplicacion/modeloAplicacion';
import { PANTALLAS_AFI } from '../data/afi/aplicacion/pantallas';
import { ProveedorMemoria } from '../data/afi/aplicacion/proveedoresMemoria';
import {
  CondicionInvalidaError, EXPECTATIVAS_POR_ENTIDAD, SUPERFICIES, TIPOS_ENTIDAD, evaluarExpectativa, publicarSuperficies,
  superficiesDeEntidad, validarCondicion, type CondicionObservable, type ResultadoObservacion,
} from '../data/afi/aplicacion/superficies';
import { observarCondicion } from '../data/afi/aplicacion/observacion';
import { validarPlanFuncionalAfi } from '../data/afi/funcional';

/**
 * Fase 4L: modelo multi-superficie de testabilidad. Entidades, proveedores y valores SINTÉTICOS (en memoria):
 * sin Portal, sin BPM real, sin integraciones ni canales reales.
 */

const EXTENSION: ExtensionModeloAplicacion = {
  actividades: [{ id: 'actividad-a', descripcion: 'Actividad sintética A' }, { id: 'actividad-b', descripcion: 'Actividad sintética B' }],
  rutas: [{ id: 'ruta-a-b', desde: 'actividad-a', hacia: 'actividad-b', descripcion: 'Ruta sintética' }],
  integraciones: [{ id: 'integracion-x', descripcion: 'Integración sintética' }],
  variables: [
    { id: 'variable-proceso', descripcion: 'Dato sintético del proceso', ambito: { tipo: 'proceso' }, superficies: ['proceso-bpm', 'integracion'] },
    { id: 'estado-interno', descripcion: 'Dato interno sintético', ambito: { tipo: 'integracion', integracion: 'integracion-x' }, superficies: ['integracion'] },
  ],
  notificaciones: [{ id: 'notificacion-y', descripcion: 'Aviso sintético', canal: 'canal-externo' }],
};
const MODELO = construirModeloAplicacion(EXTENSION);
const CTX = { caso: 'caso-sintetico', ejecucion: 'ejecucion-1' };

const ui = new ProveedorMemoria('ui-memoria', 'portal-ui', ['pantalla-ui'], { presentes: { 'pantalla-ui': ['informacion-contacto'] } });
const proceso = new ProveedorMemoria('bpm-memoria', 'proceso-bpm', ['actividad', 'ruta', 'variable'], {
  presentes: { actividad: ['actividad-a', 'actividad-b'], ruta: ['ruta-a-b'] }, variables: { 'variable-proceso': null },
});
const integracion = new ProveedorMemoria('integracion-memoria', 'integracion', ['integracion', 'variable'], {
  integraciones: { 'integracion-x': 'exito' }, variables: { 'variable-proceso': null, 'estado-interno': 'OK' },
});
const notificacion = new ProveedorMemoria('notificacion-memoria', 'notificacion', ['notificacion'], { presentes: { notificacion: ['notificacion-y'] } });
const TODOS = [ui, proceso, integracion, notificacion];

// =====================================================================================
test.describe('4L 1. taxonomía cerrada y clases de entidad', () => {
  test('tipos cerrados; cada tipo con expectativas y al menos una superficie', () => {
    expect([...TIPOS_ENTIDAD]).toEqual(['pantalla-ui', 'campo-ui', 'transicion-ui', 'actividad', 'ruta', 'integracion', 'variable', 'notificacion']);
    expect(Object.keys(EXPECTATIVAS_POR_ENTIDAD).sort()).toEqual([...TIPOS_ENTIDAD].sort());
    for (const t of TIPOS_ENTIDAD) expect(superficiesDeEntidad(t).length, t).toBeGreaterThan(0);
    expect(Object.keys(SUPERFICIES)).toEqual(['portal-ui', 'proceso-bpm', 'integracion', 'notificacion']);
  });

  test('un dato interno NO se acepta como campo UI', () => {
    expect(resolverEntidad(MODELO, { tipo: 'campo-ui', id: 'estado-interno' })).toEqual({ estado: 'tipo-incorrecto', tipoReal: 'variable' });
    expect(diagnosticarCondicion({ id: 'c', entidad: { tipo: 'campo-ui', id: 'estado-interno' }, expectativa: { tipo: 'valor', igual: 'OK' } }, MODELO, TODOS))
      .toEqual({ estado: 'INVALIDA', motivo: 'estado-interno es variable, no campo-ui' });
    // El plan funcional (Field Registry) tampoco lo acepta como campo.
    expect(validarPlanFuncionalAfi({ caso: 'x', pasos: [{ id: 'x', esperado: 'x', operaciones: [{ tipo: 'campo-valor', campo: 'estado-interno', vacio: true }] }] }))
      .toEqual([{ ruta: 'pasos[0].operaciones[0].campo', clase: 'capability', mensaje: 'El campo "estado-interno" no está soportado por el plan funcional AFI.' }]);
  });

  test('una ruta NO se acepta como pantalla; la expectativa debe ser de su tipo', () => {
    expect(diagnosticarCondicion({ id: 'c', entidad: { tipo: 'pantalla-ui', id: 'ruta-a-b' }, expectativa: { tipo: 'visible' } }, MODELO, TODOS))
      .toEqual({ estado: 'INVALIDA', motivo: 'ruta-a-b es ruta, no pantalla-ui' });
    expect(() => validarCondicion({ id: 'c', entidad: { tipo: 'ruta', id: 'ruta-a-b' }, expectativa: { tipo: 'visible' } })).toThrow(CondicionInvalidaError);
    expect(() => validarCondicion({ id: 'c', entidad: { tipo: 'integracion', id: 'integracion-x' }, expectativa: { tipo: 'tomada' } })).toThrow('no aplica a integracion');
  });

  test('Application Model: UI proyectada de 4J + declarada; resto declarativo desde el almacén; validación fail-closed', () => {
    const e = ALMACEN_APLICACION_AFI.entidades;
    expect(MODELO_APLICACION_AFI.ui).toEqual({
      pantallas: [...Object.keys(PANTALLAS_AFI), ...e.pantallas.map(p => p.id)], campos: [...Object.keys(REGISTRO_CAMPOS_FUNCIONALES), ...e.campos.map(c => c.id)],
      transiciones: (e.transiciones ?? []).map(t => t.id),
    });
    expect([MODELO_APLICACION_AFI.proceso, MODELO_APLICACION_AFI.integraciones, MODELO_APLICACION_AFI.variables, MODELO_APLICACION_AFI.notificaciones])
      .toEqual([{ actividades: e.actividades, rutas: e.rutas }, e.integraciones, e.variables, e.notificaciones]);
    const problemas = (e: ExtensionModeloAplicacion) => { try { construirModeloAplicacion(e); } catch (x) { return (x as ModeloAplicacionError).problemas; } return []; };
    expect(problemas({ rutas: [{ id: 'informacion-contacto', desde: 'a', hacia: 'b', descripcion: 'x' }] })).toEqual([
      'informacion-contacto: declarado como pantalla-ui y como ruta', 'ruta informacion-contacto: actividad desconocida a', 'ruta informacion-contacto: actividad desconocida b',
    ]);
    expect(problemas({ variables: [{ id: 'v', descripcion: 'x', ambito: { tipo: 'integracion', integracion: 'nada' }, superficies: ['portal-ui'] }] }))
      .toEqual(['variable v: integración desconocida nada', 'variable v: la superficie portal-ui no observa variables']);
  });
});

// =====================================================================================
test.describe('4L 3/4. proveedores y separación assertion / mecanismo', () => {
  test('supports es fail-closed y observe rechaza lo no soportado', async () => {
    const soloActividades = new ProveedorMemoria('solo-actividades', 'proceso-bpm', ['actividad'], {});
    expect(soloActividades.supports({ tipo: 'actividad', id: 'actividad-a' })).toBe(true);
    expect(soloActividades.supports({ tipo: 'ruta', id: 'ruta-a-b' })).toBe(false);
    await expect(soloActividades.observe({ tipo: 'ruta', id: 'ruta-a-b' }, CTX)).rejects.toThrow('no soporta');
    const r = await observarCondicion({ id: 'r', entidad: { tipo: 'ruta', id: 'ruta-a-b' }, expectativa: { tipo: 'tomada' } }, MODELO, [soloActividades], CTX);
    expect(r).toMatchObject({ resultado: 'NO_OBSERVABLE', gap: { clase: 'provider-superficie', superficiesCandidatas: ['proceso-bpm'], capacidad: 'observar ruta' } });
    expect(r.proveedor).toBeUndefined();
  });

  test('la MISMA condición se observa por distintos proveedores sin reescribir el caso', async () => {
    const condicion: CondicionObservable = Object.freeze({ id: 'variable-nula', entidad: Object.freeze({ tipo: 'variable', id: 'variable-proceso' }), expectativa: Object.freeze({ tipo: 'valor', igual: null }) }) as CondicionObservable;
    const porProceso = await observarCondicion(condicion, MODELO, TODOS, CTX, ['proceso-bpm']);
    const porIntegracion = await observarCondicion(condicion, MODELO, TODOS, CTX, ['integracion']);
    expect([porProceso.resultado, porProceso.proveedor, porProceso.superficie]).toEqual(['PASS', 'bpm-memoria', 'proceso-bpm']);
    expect([porIntegracion.resultado, porIntegracion.proveedor, porIntegracion.superficie]).toEqual(['PASS', 'integracion-memoria', 'integracion']);
    expect(porProceso.evidencia!.referencia).not.toBe(porIntegracion.evidencia!.referencia);
    // Si un mecanismo desaparece, el otro la observa: la condición no cambia.
    expect((await observarCondicion(condicion, MODELO, [integracion], CTX, ['proceso-bpm'])).proveedor).toBe('integracion-memoria');
  });

  test('el proveedor mide hechos; el veredicto sale de la expectativa del caso', () => {
    const nula = { tipo: 'valor', existe: true, valor: null } as const;
    expect(evaluarExpectativa({ tipo: 'valor', igual: null }, nula)).toBe('PASS');
    expect(evaluarExpectativa({ tipo: 'valor', igual: 'X' }, nula)).toBe('FAIL');
    // Variable inexistente no es "null": fail-closed.
    expect(evaluarExpectativa({ tipo: 'valor', igual: null }, { tipo: 'valor', existe: false })).toBe('FAIL');
    // Una medición de otra clase nunca pasa.
    expect(evaluarExpectativa({ tipo: 'tomada' }, { tipo: 'valor', existe: true, valor: true })).toBe('FAIL');
    expect(evaluarExpectativa({ tipo: 'resultado', igual: 'exito' }, { tipo: 'resultado', resultado: 'sin-ejecutar' })).toBe('FAIL');
  });
});

// =====================================================================================
test.describe('4L 6/7/8/10. diagnóstico, taxonomía de gaps y deduplicación', () => {
  test('clarificación (QUÉ no está definido) vs gap de testabilidad (definido, sin proveedor) vs conocimiento declarativo', () => {
    const d = (c: Parameters<typeof diagnosticarCondicion>[0], ps = TODOS) => diagnosticarCondicion(c, MODELO, ps);
    expect(d({ id: 'c', entidad: { tipo: 'variable', id: 'variable-proceso' } })).toEqual({ estado: 'INFORMACION_INSUFICIENTE', falta: 'expectativa' });
    expect(d({ id: 'c', expectativa: { tipo: 'emitida' } })).toEqual({ estado: 'INFORMACION_INSUFICIENTE', falta: 'entidad' });
    // Definida ("la variable queda null"): NO se pregunta a QA; sin proveedor es un TESTABILITY_GAP.
    const definida = { id: 'c', entidad: { tipo: 'variable' as const, id: 'variable-proceso' }, expectativa: { tipo: 'valor' as const, igual: null } };
    expect(d(definida, [ui, notificacion])).toEqual({
      estado: 'TESTABILITY_GAP', entidad: definida.entidad,
      gap: { clase: 'provider-superficie', superficiesCandidatas: ['proceso-bpm', 'integracion'], capacidad: 'observar variable' },
    });
    expect(d(definida)).toEqual({ estado: 'REPRESENTABLE', superficie: 'proceso-bpm', proveedor: 'bpm-memoria' });
    // Bien definida pero no registrada: se declara (no es runtime ni pregunta).
    expect(d({ id: 'c', entidad: { tipo: 'actividad', id: 'actividad-nueva' }, expectativa: { tipo: 'alcanzada' } }))
      .toEqual({ estado: 'KNOWLEDGE_GAP', entidad: { tipo: 'actividad', id: 'actividad-nueva' }, gap: { clase: 'conocimiento-declarativo', capacidad: 'registrar actividad' } });
  });

  test('salida TESTABILITY_GAP: para automatización, deduplicada y nunca como pregunta al QA', () => {
    const gaps = deduplicarGaps([{ clase: 'provider-superficie', superficiesCandidatas: ['proceso-bpm'], capacidad: 'observar ruta', ocurrencia: { hu: 'hu-a', caso: 'c1' } }]);
    const s: SalidaAgente = { resultado: 'TESTABILITY_GAP', audiencia: 'automatizacion', gaps };
    expect(validarSalidaAgente(s)).toEqual([]);
    expect(mensajeParaQa(s)).toBeUndefined();
    expect(validarSalidaAgente({ ...s, gaps: [...gaps, ...gaps] })).toContain('gaps sin deduplicar');
    expect(validarSalidaAgente({ ...s, gaps: [{ ...gaps[0], clase: 'orquestacion' }] })).toContain('un gap de testabilidad es de proveedor/superficie');
    expect(contarSalidas([s])).toMatchObject({ gapsTecnicos: 1 });
  });

  test('5 casos con la misma capacidad = 1 gap técnico con 5 ocurrencias; la familia no se fuerza', () => {
    const ocurrencias: GapDetectado[] = [1, 2, 3, 4, 5].map(n => ({ clase: 'provider-superficie', superficiesCandidatas: ['proceso-bpm'], capacidad: 'Observar ruta', ocurrencia: { hu: 'hu-a', caso: `c${n}`, paso: 'p1' } }));
    const otra: GapDetectado = { clase: 'provider-superficie', superficiesCandidatas: ['notificacion'], capacidad: 'Observar notificacion', ocurrencia: { hu: 'hu-a', caso: 'c1' } };
    const gaps = deduplicarGaps([...ocurrencias, otra]);
    expect(gaps.map(g => [g.idSemantico, g.ocurrencias.length])).toEqual([
      ['provider-superficie:notificacion:observar-notificacion', 1], ['provider-superficie:proceso-bpm:observar-ruta', 5],
    ]);
    expect(gaps.every(g => g.familia === undefined)).toBe(true); // sin familia honesta: no se inventa (ni transicion ni orquestacion-plan)
    expect(Object.keys(CLASES_GAP)).toEqual(['conocimiento-declarativo', 'provider-superficie', 'operacion-interaccion', 'orquestacion']);
  });

  test('declarativo vs runtime: registrar entidades/campos/reglas no es runtime; nuevos mecanismos sí', () => {
    for (const entidad of TIPOS_ENTIDAD) expect(clasificarIncorporacion({ tipo: 'entidad', entidad }), entidad).toBe('declarativo');
    expect(clasificarIncorporacion({ tipo: 'campo-compatible' })).toBe('declarativo');
    expect(clasificarIncorporacion({ tipo: 'regla-funcional' })).toBe('declarativo');
    expect(clasificarIncorporacion({ tipo: 'proveedor', superficie: 'notificacion' })).toBe('runtime');
    for (const tipo of ['superficie', 'operacion-interaccion', 'orquestacion'] as const) expect(clasificarIncorporacion({ tipo })).toBe('runtime');
    expect(CLASES_GAP['conocimiento-declarativo'].runtime).toBe(false);
  });
});

// =====================================================================================
test.describe('4L 11. vertical slice sintética: todas las superficies, formato común', () => {
  const CONDICIONES: CondicionObservable[] = [
    { id: 'pantalla', entidad: { tipo: 'pantalla-ui', id: 'informacion-contacto' }, expectativa: { tipo: 'visible' } },
    { id: 'actividad', entidad: { tipo: 'actividad', id: 'actividad-b' }, expectativa: { tipo: 'alcanzada' } },
    { id: 'ruta', entidad: { tipo: 'ruta', id: 'ruta-a-b' }, expectativa: { tipo: 'tomada' } },
    { id: 'variable', entidad: { tipo: 'variable', id: 'variable-proceso' }, expectativa: { tipo: 'valor', igual: null } },
    { id: 'notificacion', entidad: { tipo: 'notificacion', id: 'notificacion-y' }, expectativa: { tipo: 'emitida' } },
    { id: 'integracion', entidad: { tipo: 'integracion', id: 'integracion-x' }, expectativa: { tipo: 'resultado', igual: 'exito' } },
  ];

  test('UI, actividad, ruta, variable null, notificación e integración: PASS con el mismo formato de resultado/evidencia', async () => {
    const resultados: ResultadoObservacion[] = [];
    for (const c of CONDICIONES) {
      expect(diagnosticarCondicion(c, MODELO, TODOS).estado, c.id).toBe('REPRESENTABLE');
      resultados.push(await observarCondicion(c, MODELO, TODOS, CTX));
    }
    expect(resultados.map(r => [r.condicion, r.resultado, r.superficie])).toEqual([
      ['pantalla', 'PASS', 'portal-ui'], ['actividad', 'PASS', 'proceso-bpm'], ['ruta', 'PASS', 'proceso-bpm'],
      ['variable', 'PASS', 'proceso-bpm'], ['notificacion', 'PASS', 'notificacion'], ['integracion', 'PASS', 'integracion'],
    ]);
    for (const r of resultados) {
      expect(Object.keys(r).sort()).toEqual(['condicion', 'entidad', 'evidencia', 'expectativa', 'medicion', 'proveedor', 'resultado', 'superficie']);
      expect(r.evidencia!.referencia).toMatch(/^ejecucion-1\/[\w-]+\/[\w-]+\/[\w-]+$/); // portable, sin rutas ni PII
    }
    // Y las negaciones fallan con el mismo formato.
    const falla = await observarCondicion({ id: 'no', entidad: { tipo: 'notificacion', id: 'notificacion-y' }, expectativa: { tipo: 'no-emitida' } }, MODELO, TODOS, CTX);
    expect(falla.resultado).toBe('FAIL');
  });

  test('13. publicación futura en el manifest: superficies, observaciones y cuáles carecen de proveedor', () => {
    const hoy = publicarSuperficies([]);
    expect(hoy.map(s => [s.superficie, s.estado])).toEqual([
      ['portal-ui', 'solo-mecanismo-previo'], ['proceso-bpm', 'sin-proveedor'], ['integracion', 'sin-proveedor'], ['notificacion', 'sin-proveedor'],
    ]);
    const slice = publicarSuperficies(TODOS);
    expect(slice.every(s => s.estado === 'con-proveedor')).toBe(true);
    expect(slice.find(s => s.superficie === 'proceso-bpm')!.observaciones.map(o => o.entidad)).toEqual(['actividad', 'ruta', 'variable']);
  });

  test('14. métricas: superficies requeridas, proveedores reutilizados/nuevos, entidades declarativas y gaps únicos vs ocurrencias', async () => {
    const resultados = [];
    for (const c of CONDICIONES) resultados.push(await observarCondicion(c, MODELO, TODOS, CTX));
    const gaps = deduplicarGaps([1, 2, 3].map(n => ({ clase: 'provider-superficie' as const, superficiesCandidatas: ['notificacion' as const], capacidad: 'observar canal', ocurrencia: { hu: 'hu-a', caso: `c${n}` } })));
    // Línea base sintética (solo UI de 4J): las métricas no dependen del conocimiento real del almacén.
    const SOLO_UI = construirModeloAplicacion();
    const m = medirSuperficies({
      resultados, proveedoresPrevios: ['ui-memoria', 'bpm-memoria', 'integracion-memoria'],
      modeloAntes: SOLO_UI, modeloDespues: MODELO, gaps,
    });
    expect(m).toEqual({
      superficiesRequeridas: ['integracion', 'notificacion', 'portal-ui', 'proceso-bpm'],
      providersReutilizados: ['ui-memoria', 'bpm-memoria', 'integracion-memoria'], providersNuevos: ['notificacion-memoria'],
      entidadesDeclarativasNuevas: 7, gapsTecnicosUnicos: 1, ocurrenciasGaps: 3, sinRuntimeNuevo: false,
    });
    // Solo entidades nuevas, con proveedores existentes: sin runtime nuevo.
    const soloDeclarativo = medirSuperficies({ resultados, proveedoresPrevios: TODOS.map(p => p.id), modeloAntes: SOLO_UI, modeloDespues: MODELO, gaps: [] });
    expect([soloDeclarativo.entidadesDeclarativasNuevas, soloDeclarativo.sinRuntimeNuevo]).toEqual([7, true]);
  });
});

// =====================================================================================
test('4L blindaje: sin HU, casos ni sistemas reales; fase registrada sin runtime', async () => {
  const prohibido = /HU\s*1\d|14\.8|\bSAP\b|CP0\d|\bP\d{2}\b|correo|Cundinamarca|Ch[ií]a/i;
  for (const f of ['superficies.ts', 'modeloAplicacion.ts', 'gaps.ts', 'proveedoresMemoria.ts', 'observacion.ts']) {
    expect(await readFile(resolve(__dirname, '../data/afi/aplicacion', f), 'utf8'), f).not.toMatch(prohibido);
  }
  const fases = JSON.parse(await readFile(resolve(__dirname, '../knowledge/afi-metricas-fases.json'), 'utf8')) as RegistroFaseFramework[];
  expect(validarRegistroFases(fases)).toEqual([]);
  expect(fases.find(f => f.fase === '4L')).toMatchObject({ cambiosRuntime: false, operacionesNuevas: 0, capabilitiesFuncionalesNuevas: 0, cambiosEspecificosHu: 0 });
});
