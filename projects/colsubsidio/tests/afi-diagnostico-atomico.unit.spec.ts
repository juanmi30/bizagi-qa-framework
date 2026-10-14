import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DIAGNOSTICO, TESTABILIDAD, construirAgentManifest } from '../data/afi/agentManifest';
import { REGISTRO_CAMPOS_FUNCIONALES } from '../data/afi/aplicacion/campos';
import { diagnosticarPaso, gapsDelPaso, type PasoDescompuesto } from '../data/afi/aplicacion/condicionesAtomicas';
import { deduplicarGaps, diagnosticarCondicion, type CapaDiagnostico } from '../data/afi/aplicacion/gaps';
import { MODELO_APLICACION_AFI, construirModeloAplicacion, publicarModelo } from '../data/afi/aplicacion/modeloAplicacion';
import { ProveedorMemoria } from '../data/afi/aplicacion/proveedoresMemoria';
import { aplicarReglas, validarTrazabilidad, type ReglaConPredicado } from '../data/afi/aplicacion/reglasCondicionales';
import type { CondicionObservable, ObservationProvider, ReferenciaEntidad } from '../data/afi/aplicacion/superficies';

/**
 * Fase 4M.1: STOP en la primera capa bloqueante por condición atómica, reglas con predicado y trazabilidad.
 * Entidades, proveedores y reglas SINTÉTICOS.
 */

const MODELO = construirModeloAplicacion({
  actividades: [{ id: 'actividad-a', descripcion: 'Actividad sintética A' }, { id: 'actividad-b', descripcion: 'Actividad sintética B' }],
  rutas: [{ id: 'ruta-a-b', desde: 'actividad-a', hacia: 'actividad-b', descripcion: 'Ruta sintética' }],
  variables: [{ id: 'variable-v', descripcion: 'Dato sintético', ambito: { tipo: 'proceso' }, superficies: ['proceso-bpm'] }],
});

/** Proveedor espía: cuenta cuántas veces se le consulta. */
function espia(p: ObservationProvider) {
  const cuenta = { supports: 0 };
  const envuelto: ObservationProvider = { id: p.id, superficie: p.superficie, supports: (e: ReferenciaEntidad) => { cuenta.supports++; return p.supports(e); }, observe: p.observe.bind(p) };
  return { envuelto, cuenta };
}
const soloActividades = new ProveedorMemoria('actividades-memoria', 'proceso-bpm', ['actividad'], { presentes: { actividad: ['actividad-b'] } });
const alcanzada = (id: string): CondicionObservable => ({ id: `c-${id}`, entidad: { tipo: 'actividad', id }, expectativa: { tipo: 'alcanzada' } });

// =====================================================================================
test.describe('4M.1 A. STOP en la primera capa bloqueante', () => {
  test('1. entidad no registrada: KNOWLEDGE_GAP y CERO análisis de proveedores o acciones', () => {
    const { envuelto, cuenta } = espia(soloActividades);
    const capas: CapaDiagnostico[] = [];
    const d = diagnosticarCondicion(alcanzada('actividad-nueva'), MODELO, [envuelto], [{ clase: 'orquestacion', descripcion: 'x', soportada: false }], capas);
    expect(d.estado).toBe('KNOWLEDGE_GAP');
    expect(capas).toEqual(['definicion', 'conocimiento']);
    expect(cuenta.supports).toBe(0);
  });

  test('2. entidad registrada sin proveedor: TESTABILITY_GAP y sin evaluar acciones', () => {
    const capas: CapaDiagnostico[] = [];
    const d = diagnosticarCondicion({ id: 'r', entidad: { tipo: 'ruta', id: 'ruta-a-b' }, expectativa: { tipo: 'tomada' } }, MODELO, [soloActividades],
      [{ clase: 'operacion-interaccion', descripcion: 'x', soportada: false }], capas);
    expect(d).toMatchObject({ estado: 'TESTABILITY_GAP', gap: { superficiesCandidatas: ['proceso-bpm'], capacidad: 'observar ruta' } });
    expect(capas).toEqual(['definicion', 'conocimiento', 'observabilidad']);
  });

  test('3. proveedor existente + acción faltante: CAPABILITY_GAP tras recorrer todas las capas', () => {
    const capas: CapaDiagnostico[] = [];
    expect(diagnosticarCondicion(alcanzada('actividad-b'), MODELO, [soloActividades], [{ clase: 'operacion-interaccion', descripcion: 'accion sintetica', soportada: false }], capas))
      .toEqual({ estado: 'CAPABILITY_GAP', gap: { clase: 'operacion-interaccion', capacidad: 'accion sintetica' } });
    expect(capas).toEqual(['definicion', 'conocimiento', 'observabilidad', 'capacidad']);
    // Sin definición, se detiene en la primera capa.
    const soloDefinicion: CapaDiagnostico[] = [];
    expect(diagnosticarCondicion({ id: 'x', entidad: { tipo: 'actividad', id: 'actividad-b' } }, MODELO, [soloActividades], [], soloDefinicion).estado).toBe('INFORMACION_INSUFICIENTE');
    expect(soloDefinicion).toEqual(['definicion']);
  });

  test('E. X no registrada = solo KNOWLEDGE_GAP; tras registrarla, una NUEVA evaluación puede dar TESTABILITY_GAP', () => {
    const c: CondicionObservable = { id: 'x', entidad: { tipo: 'variable', id: 'variable-x' }, expectativa: { tipo: 'valor', igual: null } };
    expect(diagnosticarCondicion(c, MODELO, []).estado).toBe('KNOWLEDGE_GAP');
    const registrado = construirModeloAplicacion({ variables: [{ id: 'variable-x', descripcion: 'Dato sintético', ambito: { tipo: 'proceso' }, superficies: ['proceso-bpm'] }] });
    expect(diagnosticarCondicion(c, registrado, []).estado).toBe('TESTABILITY_GAP');
  });
});

// =====================================================================================
test.describe('4M.1 B/F. condiciones atómicas y deduplicación por capacidad', () => {
  const PASO: PasoDescompuesto = {
    hu: 'hu-sintetica', caso: 'caso-1', paso: 'p1',
    condiciones: [
      { condicion: { id: 'ruta', entidad: { tipo: 'ruta', id: 'ruta-a-b' }, expectativa: { tipo: 'tomada' } } },
      { condicion: { id: 'pantalla', entidad: { tipo: 'pantalla-ui', id: 'pantalla-nueva' }, expectativa: { tipo: 'visible' } } },
      { condicion: alcanzada('actividad-b'), acciones: [{ clase: 'orquestacion', descripcion: 'paso condicional', soportada: false }] },
      { condicion: { id: 'variable', entidad: { tipo: 'variable', id: 'variable-v' }, expectativa: { tipo: 'valor', igual: null } } },
    ],
  };

  test('4. un paso con varias condiciones: cada una se detiene en su propia capa', () => {
    const r = diagnosticarPaso(PASO, MODELO, [soloActividades]);
    expect(r.condiciones.map(c => [c.condicion, c.diagnostico.estado, c.capasEvaluadas.at(-1)])).toEqual([
      ['ruta', 'TESTABILITY_GAP', 'observabilidad'],
      ['pantalla', 'KNOWLEDGE_GAP', 'conocimiento'],
      ['c-actividad-b', 'CAPABILITY_GAP', 'capacidad'],
      ['variable', 'TESTABILITY_GAP', 'observabilidad'],
    ]);
    expect(r.representable).toBe(false);
    // Una sola salida por condición.
    expect(r.condiciones.map(c => c.condicion)).toEqual(['ruta', 'pantalla', 'c-actividad-b', 'variable']);
  });

  test('7. deduplicación por capacidad atómica: observar-ruta y leer variable no se fusionan; ocurrencias por caso/paso', () => {
    const d1 = diagnosticarPaso(PASO, MODELO, [soloActividades]);
    const d2 = diagnosticarPaso({ ...PASO, caso: 'caso-2', paso: 'p4' }, MODELO, [soloActividades]);
    const tecnicos = [...gapsDelPaso(PASO, d1.condiciones).tecnicos, ...gapsDelPaso({ ...PASO, caso: 'caso-2', paso: 'p4' }, d2.condiciones).tecnicos];
    const gaps = deduplicarGaps(tecnicos);
    expect(gaps.map(g => [g.idSemantico, g.ocurrencias.map(o => `${o.caso}/${o.paso}/${o.condicion}`)])).toEqual([
      ['orquestacion:sin-superficie:paso-condicional', ['caso-1/p1/c-actividad-b', 'caso-2/p4/c-actividad-b']],
      ['provider-superficie:proceso-bpm:observar-ruta', ['caso-1/p1/ruta', 'caso-2/p4/ruta']],
      ['provider-superficie:proceso-bpm:observar-variable', ['caso-1/p1/variable', 'caso-2/p4/variable']],
    ]);
    // El KNOWLEDGE_GAP no es un gap técnico: va aparte.
    expect(gapsDelPaso(PASO, d1.condiciones).conocimiento.map(g => g.capacidad)).toEqual(['registrar pantalla-ui pantalla-nueva']);
  });
});

// =====================================================================================
const LIMPIEZA: ReglaConPredicado = {
  id: 'regla-limpieza', fuente: 'requerimiento sintético §1',
  predicado: { todos: [{ hecho: 'registro-es-de-tercero', igual: true }] },
  consecuencias: [{ id: 'variables-limpias', entidad: { tipo: 'variable', id: 'variable-v' }, expectativa: { tipo: 'valor', igual: null } }],
};

test.describe('4M.1 C/D. reglas con predicado y trazabilidad', () => {
  test('5. predicado verdadero aplica con traza; falso no aparece; desconocido -> INFORMACION_INSUFICIENTE', () => {
    const verdadero = aplicarReglas([LIMPIEZA], { 'registro-es-de-tercero': true });
    expect(verdadero.derivadas).toEqual([{
      condicion: LIMPIEZA.consecuencias[0],
      traza: { regla: 'regla-limpieza', fuente: 'requerimiento sintético §1', predicado: LIMPIEZA.predicado, hechos: { 'registro-es-de-tercero': true } },
    }]);
    const falso = aplicarReglas([LIMPIEZA], { 'registro-es-de-tercero': false });
    expect([falso.derivadas, falso.noActivadas, falso.informacionInsuficiente]).toEqual([[], ['regla-limpieza'], []]);
    const desconocido = aplicarReglas([LIMPIEZA], {});
    expect([desconocido.derivadas, desconocido.informacionInsuficiente]).toEqual([[], [{ regla: 'regla-limpieza', hechosFaltantes: ['registro-es-de-tercero'] }]]);
    // Si la consecuencia no afecta PASS/FAIL, desconocer el predicado no bloquea (ni la agrega).
    expect(aplicarReglas([{ ...LIMPIEZA, afectaResultado: false }], {}).informacionInsuficiente).toEqual([]);
  });

  test('6. no se infiere la consecuencia en escenarios relacionados (sin registro, otro perfil, misma integración)', () => {
    // "No existe registro" es un hecho distinto: la regla no dice nada de él.
    expect(aplicarReglas([LIMPIEZA], { 'existe-registro': false, 'registro-es-de-tercero': false }).derivadas).toEqual([]);
    // Compartir hechos con el escenario activado (misma integración, mismo perfil) no activa la regla.
    const vecino = { 'integracion-usada': 'integracion-x', perfil: 'perfil-a', 'registro-es-de-tercero': false };
    expect(aplicarReglas([LIMPIEZA], vecino).derivadas).toEqual([]);
    // Conjunción: basta una comparación falsa; todas deben cumplirse.
    const doble: ReglaConPredicado = { ...LIMPIEZA, id: 'doble', predicado: { todos: [{ hecho: 'a', igual: true }, { hecho: 'b', igual: 'x' }] } };
    expect(aplicarReglas([doble], { a: true, b: 'y' }).derivadas).toEqual([]);
    expect(aplicarReglas([doble], { a: false }).informacionInsuficiente).toEqual([]); // falso aunque falte b
  });

  test('D. trazabilidad: sin fuente o predicado, o predicado no activado por el caso -> no entra al caso', () => {
    const { derivadas } = aplicarReglas([LIMPIEZA], { 'registro-es-de-tercero': true });
    expect(validarTrazabilidad(derivadas, { 'registro-es-de-tercero': true })).toEqual([]);
    // La misma expectativa llevada a otro caso cuyo diseño no activa el predicado: expansión de alcance.
    expect(validarTrazabilidad(derivadas, { 'registro-es-de-tercero': false })).toEqual(['variables-limpias: el escenario no activa el predicado de regla-limpieza']);
    const sinTraza = [{ ...derivadas[0], traza: { ...derivadas[0].traza, fuente: '', predicado: { todos: [] } } }];
    expect(validarTrazabilidad(sinTraza, {})).toEqual(['variables-limpias: sin fuente', 'variables-limpias: sin predicado que la active']);
  });
});

// =====================================================================================
test.describe('4M.1 publicación y blindaje', () => {
  test('reglas publicadas en protocoloDecision.diagnostico con ejemplos genéricos', () => {
    const ids = DIAGNOSTICO.reglas.map(r => r.id);
    for (const id of ['condicion-atomica', 'stop-primera-capa', 'regla-con-predicado', 'trazabilidad-de-consecuencias']) expect(ids).toContain(id);
    const regla = (id: string) => DIAGNOSTICO.reglas.find(r => r.id === id)!.regla;
    expect(regla('stop-primera-capa')).toMatch(/no analices proveedores ni emitas TESTABILITY_GAP[\s\S]*no analices acciones ni orquestación/);
    expect(regla('regla-con-predicado')).toMatch(/DEMUESTRAN su predicado[\s\S]*No infieras la regla inversa[\s\S]*INFORMACION_INSUFICIENTE/);
    const stop = DIAGNOSTICO.ejemplos.find(e => e.regla === 'stop-primera-capa')!;
    expect('despues' in stop && stop.despues).toMatch(/nueva evaluación puede dar TESTABILITY_GAP/);
    expect(TESTABILIDAD.diagnostico.reglas.join('\n')).toMatch(/Nunca KNOWLEDGE_GAP y TESTABILITY_GAP para la misma condición[\s\S]*capacidad técnica ATÓMICA/);
  });

  test('8. blindaje: el código no aporta conocimiento concreto; lo concreto de TESTABILIDAD es SOLO la proyección del Knowledge aprobado', async () => {
    const fuentes = Object.fromEntries(await Promise.all(FUENTES_RUNTIME.map(async f => [f, await readFile(resolve(__dirname, '..', f), 'utf8')] as const)));
    expect(violacionesFrontera({ fuentes, diagnostico: DIAGNOSTICO, testabilidad: TESTABILIDAD, modeloAprobado: MODELO_APLICACION_AFI })).toEqual([]);
    // La parte de código de TESTABILIDAD es idéntica con un almacén VACÍO: nada concreto proviene del código.
    const vacio = construirAgentManifest(REGISTRO_CAMPOS_FUNCIONALES, construirModeloAplicacion({})).testabilidad;
    expect({ ...TESTABILIDAD, modelo: null }).toEqual({ ...vacio, modelo: null });
    expect(JSON.stringify([DIAGNOSTICO, vacio])).not.toMatch(PROHIBIDO_CONCRETO);
  });

  test('8b. regresión de frontera: la misma entidad concreta es válida declarada y se detecta hardcodeada', async () => {
    const ID = 'actividad-validar-sap-sintetica';
    const modeloAprobado = construirModeloAplicacion({ actividades: [{ id: ID, descripcion: 'Actividad sintética de un sistema externo' }] });
    const testabilidad = construirAgentManifest(REGISTRO_CAMPOS_FUNCIONALES, modeloAprobado).testabilidad;
    const fuentes = Object.fromEntries(await Promise.all(FUENTES_RUNTIME.map(async f => [f, await readFile(resolve(__dirname, '..', f), 'utf8')] as const)));
    // A. Declarada en el Knowledge (proyección del modelo aprobado): permitida aunque nombre un sistema concreto.
    expect(JSON.stringify(testabilidad.modelo)).toMatch(PROHIBIDO_CONCRETO);
    expect(violacionesFrontera({ fuentes, diagnostico: DIAGNOSTICO, testabilidad, modeloAprobado })).toEqual([]);
    // B1. La MISMA entidad hardcodeada en un proveedor/runtime: detectada.
    const proveedor = 'data/afi/aplicacion/proveedorTareasPendientes.ts';
    const contaminadas = { ...fuentes, [proveedor]: `${fuentes[proveedor]}\nconst especial = '${ID}';\n` };
    expect(violacionesFrontera({ fuentes: contaminadas, diagnostico: DIAGNOSTICO, testabilidad, modeloAprobado })).toEqual([`runtime:${proveedor}`]);
    // B2. Inyectada en la parte de CÓDIGO del manifest (reglas), o publicada sin estar aprobada: detectada.
    const reglas = { ...testabilidad, diagnostico: { ...testabilidad.diagnostico, reglas: [...testabilidad.diagnostico.reglas, `Si es ${ID}, PASS`] } };
    expect(violacionesFrontera({ fuentes, diagnostico: DIAGNOSTICO, testabilidad: reglas, modeloAprobado })).toEqual(['manifest:codigo']);
    expect(violacionesFrontera({ fuentes, diagnostico: DIAGNOSTICO, testabilidad, modeloAprobado: construirModeloAplicacion({}) })).toEqual(['manifest:modelo-no-aprobado']);
  });
});

/** Términos de HU, sistemas, casos o valores concretos: nunca en código; solo en Knowledge/casos declarativos. */
const PROHIBIDO_CONCRETO = /HU\s*1\d|14\.8|\bSAP\b|CP0\d|\bP\d{2}\b|correo|Cundinamarca|Ch[ií]a|\d{5,}/i;
/** Runtime, capabilities, providers y resolución de observación: código que nunca puede nombrar algo concreto. */
const FUENTES_RUNTIME = [
  'data/afi/aplicacion/condicionesAtomicas.ts', 'data/afi/aplicacion/reglasCondicionales.ts', 'data/afi/aplicacion/gaps.ts',
  'data/afi/aplicacion/observacion.ts', 'data/afi/aplicacion/proveedorTareasPendientes.ts', 'data/afi/aplicacion/vinculos.ts',
  'data/afi/aplicacion/resolucionObservacion.ts', 'helpers/fuenteTareasBizagiQa.ts', 'helpers/observacionRunner.ts',
];

/**
 * Frontera 4R.1: (1) ninguna fuente runtime contiene términos concretos; (2) la parte de código del manifest
 * (todo salvo `modelo`) tampoco; (3) `modelo` es EXACTAMENTE la proyección del modelo aprobado (nada inventado).
 */
function violacionesFrontera(e: {
  fuentes: Record<string, string>; diagnostico: unknown; testabilidad: { modelo: unknown } & Record<string, unknown>; modeloAprobado: Parameters<typeof publicarModelo>[0];
}): string[] {
  const v = Object.entries(e.fuentes).filter(([, texto]) => PROHIBIDO_CONCRETO.test(texto)).map(([f]) => `runtime:${f}`);
  if (PROHIBIDO_CONCRETO.test(JSON.stringify([e.diagnostico, { ...e.testabilidad, modelo: null }]))) v.push('manifest:codigo');
  if (JSON.stringify(e.testabilidad.modelo) !== JSON.stringify(publicarModelo(e.modeloAprobado))) v.push('manifest:modelo-no-aprobado');
  return v;
}
