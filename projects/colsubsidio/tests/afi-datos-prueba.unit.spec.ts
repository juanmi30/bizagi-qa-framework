import { test, expect, type TestInfo } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { actorDesdeEntorno } from '../data/afi/actores';
import { TEST_DATA, construirAgentManifest, serializarAgentManifest } from '../data/afi/agentManifest';
import { compilarCasoAfi, diagnosticoCasoCompilado, validarDefinicionCasoAfi, type DefinicionCasoAfi } from '../data/afi/caso';
import { DEFINICIONES_CP04 } from '../data/afi/casos/hu14-12-cp04';
import {
  CAMPOS_COMPARTIBLES, ESQUEMA_REGISTRO_DATOS, ESQUEMA_REQUISITO_DATOS, SEMANTICA_RESOLUCION, clasificarCampo, colisionesSecretRef, normalizarParaEnv,
  relacionActores, secretRefActor, secretRefShared, validarRequisito, validarSlot,
  type ActorSlot, type CompartidoDeclarado, type CondicionActor,
} from '../data/afi/datosPrueba/contrato';
import {
  aplicarDecisionesDatos, plantillaDecisionesDatos, recibirRequisitosDelAgente,
  type ArchivoDecisionesDatos, type DecisionSlot, type LoteDatosPrueba,
} from '../data/afi/datosPrueba/intake';
import {
  DatosPruebaNoListosError, REGISTRO_DATOS_PRUEBA_AFI, actorDesdeSlot, confirmarProvision, actorParaCaso, diagnosticarActorRef, diagnosticarRequisito, diagnosticarSlot,
  medirDatosPrueba, plantillaEnvDatosPrueba, preflightDatosPrueba, rutaPlantillaEnv, textoDiagnosticoDatos, validarRegistroDatosPrueba,
  type EstadoDatos, type RegistroDatosPrueba,
} from '../data/afi/datosPrueba/registro';
import { CAMPOS_CONTACTO_FUNCIONAL } from '../data/afi/funcional';
import { errorSeguro } from '../helpers/afiliacionesPortal';

/**
 * Fase 4P: Test Data Requirements & Actor Slots. Todo SINTÉTICO: perfil P = pensionado, condiciones X/Y/Z genéricas,
 * valores ficticios que solo existen en entornos en memoria de este archivo. Sin navegador, sin QA real.
 */

const RAIZ = resolve(__dirname, '../../..');
const FECHA = '2026-10-01';
const X: CondicionActor = { id: 'condicion-x', descripcion: 'Actor que cumple la condición sintética X en un sistema externo' };
const Y: CondicionActor = { id: 'condicion-y', descripcion: 'Actor que cumple la condición sintética Y en un sistema externo' };
const Z: CondicionActor = { id: 'condicion-z', descripcion: 'Actor que cumple la condición sintética Z, sin actor disponible todavía' };
const CORREO_QA: CompartidoDeclarado = { id: 'correo-qa-afiliaciones', campo: 'correo', descripcion: 'Buzón QA compartido por los actores sintéticos' };
const CAMPOS_SLICE = [{ campo: 'numeroIdentificacion' as const, fuente: 'slot' as const }, { campo: 'correo' as const, fuente: 'shared' as const, sharedRef: CORREO_QA.id }];

/** Valores ficticios: solo viven en estos entornos en memoria. FUGA detecta el valor completo o sus últimos dígitos. */
const SECRETOS = { idX: '1000004821', idY: '1000007356', idZ: '1000009183', correo: 'buzon.sintetico@example.test' };
const FUGA = /1000004821|1000007356|1000009183|4821|7356|9183|buzon\.sintetico|example\.test/;
const REF_X = 'AFI_ACTOR_PENSIONADO_CONDICION_X_NUMERO_IDENTIFICACION';
const REF_Y = 'AFI_ACTOR_PENSIONADO_CONDICION_Y_NUMERO_IDENTIFICACION';
const REF_Z = 'AFI_ACTOR_PENSIONADO_CONDICION_Z_NUMERO_IDENTIFICACION';
const REF_CORREO = 'AFI_SHARED_CORREO_QA_AFILIACIONES';
const ENV_LISTO = { [REF_X]: SECRETOS.idX, [REF_Y]: SECRETOS.idY, [REF_CORREO]: SECRETOS.correo };

const vacio = (): RegistroDatosPrueba => ({ schemaVersion: ESQUEMA_REGISTRO_DATOS, revision: 1, slots: [], compartidos: [], historial: [] });
const req = (id: string, condiciones: CondicionActor[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: ESQUEMA_REQUISITO_DATOS, id, perfil: 'pensionado', condiciones, camposRequeridos: ['numeroIdentificacion', 'correo'],
  ocurrencias: [{ hu: 'hu-sintetica', caso: id.replace(/^req-/, 'caso-') }], reutilizable: true, ...extra,
});

/** Aprueba todas las propuestas del lote con los campos del slice (identificación propia + correo compartido). */
function aprobar(lote: LoteDatosPrueba, extra: Record<string, Partial<DecisionSlot>> = {}, compartidos: CompartidoDeclarado[] = [CORREO_QA]): ArchivoDecisionesDatos {
  const p = plantillaDecisionesDatos(lote);
  return {
    ...p, compartidos,
    decisiones: p.decisiones.map(d => ({ ...d, decision: 'APPROVED', revisor: 'rol-datos-qa', estado: 'provisionado', correcciones: { campos: CAMPOS_SLICE }, ...extra[d.proposalId] })),
  };
}
const codigo = (f: () => unknown) => { try { f(); return 'OK'; } catch (e) { return (e as { codigo?: string }).codigo ?? (e as Error).name; } };

/** Registro con los actores X e Y aprobados y provisionados (A y C comparten X). */
function registroSlice() {
  const lote = recibirRequisitosDelAgente({ testDataRequirements: [req('req-a', [X]), req('req-b', [Y]), req('req-c', [X])] }, vacio());
  return { lote, ...aplicarDecisionesDatos(lote, aprobar(lote), vacio(), FECHA) };
}

/** Definición SINTÉTICA mínima con actorRef (solo inicio-solicitud; plan funcional de sonda). */
const definicion = (actorRef?: string, caso = 'caso-a'): DefinicionCasoAfi => ({
  version: 1, hu: 'hu-sintetica', caso, nombre: `Caso sintético ${caso}`, perfil: 'pensionado', ...(actorRef ? { actorRef } : {}),
  preparacion: { datosCaso: {}, camposAsercion: [], etapas: ['inicio-solicitud'] },
  funcional: { caso, pasos: [{ id: 'p1', esperado: 'El catálogo tiene opciones', operaciones: [{ tipo: 'catalogo-no-vacio', campo: CAMPOS_CONTACTO_FUNCIONAL[0] }] }] },
});

// =====================================================================================
test.describe('4P 1/2/3. requisitos, actor slots e identidad semántica', () => {
  test('mismo perfil con distintas condiciones -> slots distintos; mismas condiciones -> el MISMO slot', () => {
    const lote = recibirRequisitosDelAgente({ testDataRequirements: [req('req-a', [X]), req('req-b', [Y]), req('req-c', [X])] }, vacio());
    expect(lote.propuestas.map(p => [p.propuesta.slot.id, p.propuesta.requisitos])).toEqual([
      ['pensionado-condicion-x', ['req-a', 'req-c']], ['pensionado-condicion-y', ['req-b']],
    ]);
    expect(lote.posiblesDuplicados).toEqual([]);
    expect(lote.propuestas.every(p => p.propuesta.estado === 'PENDING_REVIEW')).toBe(true);
  });

  test('identidad: perfil + conjunto canónico de condiciones + campos de identidad; nunca el texto libre', () => {
    const f = (condiciones: CondicionActor[], campos = ['numeroIdentificacion'] as never[], perfil = 'pensionado' as const) => ({ perfil, condiciones, campos });
    expect(relacionActores(f([X, Y]), f([Y, { ...X, descripcion: 'otra redacción' }]))).toBe('IGUAL');
    expect(relacionActores(f([X]), f([X, Y]))).toBe('POSIBLE_DUPLICADO');
    expect(relacionActores(f([X]), f([{ id: 'condicionx', descripcion: 'otra' }]))).toBe('POSIBLE_DUPLICADO');
    expect(relacionActores(f([X]), f([{ id: 'otra-condicion', descripcion: X.descripcion }]))).toBe('POSIBLE_DUPLICADO');
    expect(relacionActores(f([X]), f([X], ['correo'] as never[]))).toBe('POSIBLE_DUPLICADO');
    expect(relacionActores(f([X]), f([Y]))).toBe('DISTINTO');
    expect(relacionActores(f([X]), { ...f([X]), perfil: 'facultativo' as never })).toBe('DISTINTO');
  });

  test('requisito: condiciones lógicas SIN valores; identificaciones, correos, teléfonos, salarios y env names se rechazan', () => {
    const motivos = (r: unknown) => [...new Set(validarRequisito(r).map(p => p.motivo))];
    expect(motivos(req('req-ok', [X]))).toEqual([]);
    expect(motivos(req('r1', [{ id: 'titular', descripcion: 'titular 1023456789' }]))).toContain('PII');
    expect(motivos(req('r2', [{ id: 'titular', descripcion: 'avisar a persona@example.test' }]))).toContain('PII');
    expect(motivos(req('r3', [{ id: 'titular', descripcion: 'llamar al 300 123 4567' }]))).toContain('PII');
    expect(motivos(req('r4', [{ id: 'titular', descripcion: 'salario de 2.500.000' }]))).toContain('PII');
    expect(motivos(req('r5', [X], { valor: 'x' }))).toContain('DEFINE_ENV');
    expect(motivos(req('r6', [X], { secretRef: 'AFI_ACTOR_X_Y' }))).toContain('DEFINE_ENV');
    expect(motivos(req('r7', [{ id: 'titular', descripcion: 'usar AFI_ACTOR_P_X' }]))).toContain('DEFINE_ENV');
    expect(motivos(req('r8', [X], { camposRequeridos: ['confirmacionCorreo'] }))).toEqual(['CAMPO_NO_PEDIBLE']);
    expect(motivos(req('r9', [X], { camposRequeridos: ['autorizaDatos'] }))).toEqual(['CAMPO_NO_PEDIBLE']);
    expect(motivos(req('r10', [X], { perfil: 'perfil-inventado' }))).toEqual(['PERFIL']);
    expect(motivos(req('r11', [X], { estado: 'APPROVED' }))).toEqual(['ESQUEMA']);
  });

  test('un ActorSlot es una CLASE de actor: no exige HU, caso ni número de caso; reutilizable entre casos', () => {
    const { registro } = registroSlice();
    const x = registro.slots.find(s => s.id === 'pensionado-condicion-x')!;
    expect(Object.keys(x).sort()).toEqual(['campos', 'condiciones', 'estado', 'id', 'origen', 'perfil']);
    expect(x.origen.requisitos).toEqual(['req-a', 'req-c']);
    expect(validarSlot({ ...x, origen: { requisitos: [], ocurrencias: [] } })).toEqual([]);
  });

  test('NEEDS_REVIEW ante la duda: condiciones contenidas -> POSSIBLE_DUPLICATE y revisión humana (nunca fusión automática)', () => {
    const { registro } = registroSlice();
    const r = req('req-xy', [X, Y]);
    const d = diagnosticarRequisito(r as never, registro, ENV_LISTO);
    expect([d.status, d.motivos[0].motivo]).toEqual(['NEEDS_REVIEW', 'posible-duplicado']);
    const lote = recibirRequisitosDelAgente({ testDataRequirements: [r] }, registro);
    expect(lote.posiblesDuplicados.map(p => [p.b, p.motivo]).sort()).toEqual([['pensionado-condicion-x', 'condiciones-relacionadas'], ['pensionado-condicion-y', 'condiciones-relacionadas']]);
    const pid = lote.propuestas[0].proposalId;
    expect(codigo(() => aplicarDecisionesDatos(lote, aprobar(lote, {}, []), registro, FECHA))).toBe('POSIBLE_DUPLICADO_SIN_RESOLVER');
    // Humano: son actores distintos -> nuevo slot.
    const distintos = aplicarDecisionesDatos(lote, aprobar(lote, { [pid]: { actoresDistintosDe: ['pensionado-condicion-x', 'pensionado-condicion-y'] } }, []), registro, FECHA);
    expect(distintos.altas).toEqual(['pensionado-condicion-x-condicion-y']);
    // Humano: es el mismo actor que X -> sin slot nuevo, el requisito se suma a X.
    const mismo = aplicarDecisionesDatos(lote, aprobar(lote, { [pid]: { mismoActorQue: 'pensionado-condicion-x', correcciones: undefined, estado: undefined, actoresDistintosDe: ['pensionado-condicion-y'] } }, []), registro, FECHA);
    expect([mismo.altas, mismo.reutilizaciones]).toEqual([[], [{ requisito: 'req-xy', slot: 'pensionado-condicion-x' }]]);
    // Patch previo a kd-c970...: X recibe la condición Y que no tenía -> vuelve a pendiente-provisionar; sus secretos no prueban Y.
    const x = mismo.registro.slots.find(s => s.id === 'pensionado-condicion-x')!;
    expect([x.condiciones.map(c => c.id), x.estado]).toEqual([[X.id, Y.id], 'pendiente-provisionar']);
    expect(diagnosticarRequisito(r as never, mismo.registro, ENV_LISTO).status).toBe('NEEDS_PROVISIONING');
    // Solo la confirmación humana (`datos provisionado`) lo devuelve a READY.
    const confirmado = confirmarProvision(mismo.registro, 'pensionado-condicion-x', 'qa-revisor', FECHA, ENV_LISTO);
    expect(diagnosticarRequisito(r as never, confirmado.registro, ENV_LISTO).status).toBe('READY');
  });

  test('reutilizable=false: nunca comparte slot en silencio (revisión humana)', () => {
    const { registro } = registroSlice();
    const r = req('req-propio', [X], { reutilizable: false });
    expect(diagnosticarRequisito(r as never, registro, ENV_LISTO).motivos[0].motivo).toBe('reutilizacion-no-permitida');
    const lote = recibirRequisitosDelAgente({ testDataRequirements: [r] }, registro);
    expect(lote.reutilizados).toEqual([]);
    expect(lote.posiblesDuplicados).toEqual([{ a: lote.propuestas[0].proposalId, b: 'pensionado-condicion-x', motivo: 'reutilizacion-no-permitida' }]);
  });
});

// =====================================================================================
test.describe('4P 4/5/6. clasificación de campos, resolución por capas y secret refs', () => {
  test('clasificación derivada de POLITICAS_AFI y del mapeo de actores; compatible con la precedencia vigente', () => {
    expect(['numeroIdentificacion', 'correo', 'numeroCelular', 'salarioBasico'].map(c => clasificarCampo(c as never))).toEqual(['ACTOR_SECRET', 'ACTOR_SECRET', 'ACTOR_SECRET', 'ACTOR_SECRET']);
    expect(clasificarCampo('confirmacionCorreo')).toBe('DERIVED');
    expect(clasificarCampo('autorizaDatos')).toBe('AUXILIARY');
    expect(clasificarCampo('tipoAportante')).toBe('ACTOR_BASE');
    // Compartible = el entorno vigente ya usa la misma variable en varios perfiles; la identidad nunca.
    expect(CAMPOS_COMPARTIBLES).toEqual(['correo', 'numeroCelular', 'numeroTelefonoFijo']);
    expect(Object.fromEntries(Object.entries(SEMANTICA_RESOLUCION).map(([k, v]) => [k, v.origenEquivalente])))
      .toEqual({ ACTOR_SECRET: 'actor', ACTOR_BASE: 'actor', SHARED: 'actor', PUBLIC_CASE: 'test-case', DERIVED: 'derived', AUXILIARY: 'auxiliary' });
  });

  test('secret ref determinista, normalizada (tildes, espacios, guiones, camelCase), portable y estable', () => {
    expect(secretRefActor('perfil-p-estado-x', 'numeroIdentificacion')).toBe('AFI_ACTOR_PERFIL_P_ESTADO_X_NUMERO_IDENTIFICACION');
    expect(secretRefShared('correo-qa-afiliaciones')).toBe(REF_CORREO);
    expect(normalizarParaEnv('Condición  ñandú-x')).toBe('CONDICION_NANDU_X');
    expect(Array.from({ length: 3 }, () => secretRefActor('pensionado-condicion-x', 'numeroIdentificacion'))).toEqual([REF_X, REF_X, REF_X]);
    expect(codigo(() => secretRefShared('---'))).toBe('SECRET_REF_INVALIDA');
    expect(codigo(() => secretRefActor('x'.repeat(120), 'correo'))).toBe('SECRET_REF_INVALIDA');
  });

  test('colisiones de nombres de variable detectadas', () => {
    expect(colisionesSecretRef([{ secretRef: 'AFI_ACTOR_A_B', origen: 'a.b' }, { secretRef: 'AFI_ACTOR_A_B', origen: 'a-b.x' }, { secretRef: 'AFI_ACTOR_C', origen: 'c' }]))
      .toEqual([{ motivo: 'COLISION_SECRET_REF', detalle: 'AFI_ACTOR_A_B lo producen a-b.x y a.b' }]);
    // Ids kebab-case en minúsculas: la derivación es inyectiva entre slots y entre compartidos; el registro igual lo verifica.
    const { registro } = registroSlice();
    expect(() => validarRegistroDatosPrueba(registro)).not.toThrow();
  });

  test('capas: el secreto del slot gana sobre el actor base; fallback solo si el slot lo permite y solo del MISMO perfil', () => {
    const slot: ActorSlot = {
      id: 'pensionado-condicion-x', perfil: 'pensionado', condiciones: [X], estado: 'provisionado', origen: { requisitos: [], ocurrencias: [] },
      campos: [{ campo: 'numeroIdentificacion', fuente: 'slot' }, { campo: 'correo', fuente: 'slot', fallbackBase: true }],
    };
    const REF_CORREO_X = 'AFI_ACTOR_PENSIONADO_CONDICION_X_CORREO';
    const base = { AFI_QA_CORREO: 'base.sintetico@example.test' };
    expect(actorDesdeSlot(slot, { [REF_X]: SECRETOS.idX, [REF_CORREO_X]: SECRETOS.correo, ...base }).datos.correo).toBe(SECRETOS.correo);
    expect(actorDesdeSlot(slot, { [REF_X]: SECRETOS.idX, ...base }).datos.correo).toBe(base.AFI_QA_CORREO);
    // Sin fallback declarado no se usa el base; una variable de OTRO perfil nunca cuenta.
    const sinFallback = { ...slot, campos: [slot.campos[0], { campo: 'correo' as const, fuente: 'slot' as const }] };
    expect(diagnosticarSlot(sinFallback, { [REF_X]: SECRETOS.idX, ...base }).status).toBe('MISSING_SECRET');
    expect(diagnosticarSlot(slot, { [REF_X]: SECRETOS.idX, AFI_CP01_CORREO: 'otro.perfil@example.test' }).missingFields).toEqual(['correo']);
    // La identidad nunca se comparte ni hace fallback; un campo no compartible no va a base.
    const motivos = (campos: unknown) => validarSlot({ ...slot, campos }).map(p => p.motivo);
    expect(motivos([{ campo: 'numeroIdentificacion', fuente: 'slot', fallbackBase: true }])).toContain('FUENTE_CAMPO');
    expect(motivos([{ campo: 'numeroIdentificacion', fuente: 'base' }])).toContain('FUENTE_CAMPO');
    expect(motivos([{ campo: 'salarioBasico', fuente: 'shared', sharedRef: 'x' }])).toContain('FUENTE_CAMPO');
    // Base de otro perfil: un pensionado no tiene salario en el actor base.
    expect(motivos([{ campo: 'numeroIdentificacion', fuente: 'slot' }, { campo: 'salarioBasico', fuente: 'slot', fallbackBase: true }])).toContain('FUENTE_CAMPO');
  });

  test('derived no crea secreto: confirmacionCorreo se deriva de correo y nunca hay ...CONFIRMACION_CORREO', () => {
    expect(validarSlot({ id: 'p-x', perfil: 'pensionado', condiciones: [X], estado: 'provisionado', origen: { requisitos: [], ocurrencias: [] }, campos: [{ campo: 'confirmacionCorreo', fuente: 'slot' }] })
      .map(p => p.motivo)).toContain('CAMPO_NO_SECRETO');
    const { registro } = registroSlice();
    const conNuevo = recibirRequisitosDelAgente({ testDataRequirements: [req('req-z', [Z])] }, registro);
    const r = aplicarDecisionesDatos(conNuevo, aprobar(conNuevo, {}, []), registro, FECHA).registro;
    expect(plantillaEnvDatosPrueba(r)).not.toMatch(/CONFIRMACION_CORREO/);
    const actor = actorParaCaso(definicion('pensionado-condicion-x'), r, ENV_LISTO);
    const plan = compilarCasoAfi(definicion('pensionado-condicion-x'), actor).preparacion.etapas['inicio-solicitud']!;
    expect(plan.resoluciones.find(x => x.campo === 'confirmacionCorreo')).toMatchObject({ origen: 'derived', derivadoDe: ['correo'] });
  });

  test('shared reutilizable: un buzón QA compartido sirve a varios actores con UNA sola variable', () => {
    const { registro } = registroSlice();
    expect(registro.compartidos).toEqual([CORREO_QA]);
    const plantilla = plantillaEnvDatosPrueba(registro);
    expect(plantilla.match(new RegExp(`^${REF_CORREO}=$`, 'gm'))).toHaveLength(1);
    for (const id of ['pensionado-condicion-x', 'pensionado-condicion-y']) expect(actorParaCaso(definicion(id), registro, ENV_LISTO).datos.correo).toBe(SECRETOS.correo);
  });
});

// =====================================================================================
test.describe('4P 7/8/10/11/12/13. contrato, compatibilidad, estados, diagnósticos y preflight', () => {
  test('actorRef opcional: sin él, el actor por perfil vigente; CP02 y CP04 siguen validando y compilando', async () => {
    const entorno = { AFI_QA_EMPRESA_IDENTIFICACION: '900000001', AFI_QA_CORREO: 'empresa.qa@example.test' };
    for (const d of DEFINICIONES_CP04) {
      expect(validarDefinicionCasoAfi(d), d.nombre).toEqual([]);
      expect(preflightDatosPrueba(d, vacio(), {})).toEqual({ modo: 'perfil' });
      expect(actorParaCaso(d, vacio(), entorno)).toEqual(actorDesdeEntorno(d.perfil, entorno));
    }
    expect(compilarCasoAfi(DEFINICIONES_CP04[0], actorParaCaso(DEFINICIONES_CP04[0], REGISTRO_DATOS_PRUEBA_AFI, entorno)).ejecutable).toBe(true);
    const cp02 = JSON.parse(await readFile(resolve(__dirname, 'fixtures/cp02-desktop-compilacion.afi.json'), 'utf8'));
    expect(validarDefinicionCasoAfi(cp02)).toEqual([]);
    expect(() => compilarCasoAfi(cp02, actorParaCaso(cp02, REGISTRO_DATOS_PRUEBA_AFI, {}))).not.toThrow();
  });

  test('contrato: actorRef es un id semántico; nunca un secretRef, un nombre de variable, process.env ni un valor', () => {
    const ruta = (actorRef: unknown) => validarDefinicionCasoAfi({ ...definicion(), actorRef }).map(p => p.ruta);
    expect(ruta('pensionado-condicion-x')).toEqual([]);
    for (const malo of ['AFI_ACTOR_PENSIONADO_X', 'process.env.X', '1000004821', 'Pensionado X', '', 7]) expect(ruta(malo), String(malo)).toEqual(['actorRef']);
    expect(validarDefinicionCasoAfi({ ...definicion(), secretRef: 'AFI_ACTOR_X' }).map(p => p.ruta)).toEqual(['secretRef']);
  });

  test('estados: MISSING_SECRET, NEEDS_PROVISIONING, NEEDS_REVIEW y READY, distinguidos', () => {
    const { registro } = registroSlice();
    const lote = recibirRequisitosDelAgente({ testDataRequirements: [req('req-d', [Z])] }, registro);
    const r = aplicarDecisionesDatos(lote, aprobar(lote, { [lote.propuestas[0].proposalId]: { estado: undefined } }, []), registro, FECHA).registro;
    const estado = (actorRef: string, env: Record<string, string>) => diagnosticarActorRef(actorRef, 'pensionado', r, env).status;
    expect(estado('pensionado-condicion-x', {})).toBe('MISSING_SECRET');
    expect(estado('pensionado-condicion-x', ENV_LISTO)).toBe('READY');
    expect(estado('pensionado-condicion-z', { ...ENV_LISTO, [REF_Z]: SECRETOS.idZ })).toBe('NEEDS_PROVISIONING');
    expect(estado('actor-inexistente', ENV_LISTO)).toBe('NEEDS_REVIEW');
    expect(diagnosticarActorRef('pensionado-condicion-x', 'facultativo', r, ENV_LISTO).motivos[0].motivo).toBe('perfil-distinto');
  });

  test('diagnóstico humano y JSON: nombre de la variable sí; valor, longitud, prefijo o últimos dígitos nunca', () => {
    const { registro } = registroSlice();
    const parcial = { [REF_Y]: SECRETOS.idY, [REF_CORREO]: SECRETOS.correo };
    const d = diagnosticarActorRef('pensionado-condicion-x', 'pensionado', registro, parcial, { hu: 'hu-sintetica', caso: 'caso-a' });
    expect(d).toMatchObject({ actorRef: 'pensionado-condicion-x', status: 'MISSING_SECRET', missingFields: ['numeroIdentificacion'], missingSecretRefs: [REF_X] });
    expect(Object.keys(d)).toEqual(expect.arrayContaining(['actorRef', 'status', 'missingFields', 'secretRefs', 'occurrences']));
    const texto = textoDiagnosticoDatos(d, { proyecto: 'colsubsidio' });
    expect(texto).toBe([
      'DATOS DE PRUEBA — FALTANTES', 'Actor:', '  pensionado-condicion-x', 'Necesario para:', '  hu-sintetica · caso-a', '  hu-sintetica · caso-c',
      'Debe cumplir:', '  • perfil pensionado', `  • ${X.descripcion}`, 'Falta:', '  Número de identificación',
      'Agregue este valor al .env del proyecto (nunca en el caso, el registro ni Git):', '  # Número de identificación', `  ${REF_X}=`,
      'Después ejecute:', '  node tools/afi.mjs colsubsidio datos estado',
    ].join('\n'));
    // Con TODO configurado: ningún valor, longitud ni sufijo aparece.
    for (const salida of [texto, JSON.stringify(d), JSON.stringify(diagnosticarSlot(registro.slots[0], ENV_LISTO)), textoDiagnosticoDatos(diagnosticarSlot(registro.slots[0], ENV_LISTO))]) {
      expect(salida).not.toMatch(FUGA);
      expect(salida).not.toMatch(/\b10\b|longitud|termina en|\*{3,}/i);
    }
  });

  test('requiere actor: el texto pide CONSEGUIR un actor de QA (no es un bug técnico) y qué configurar después', () => {
    const { registro } = registroSlice();
    const lote = recibirRequisitosDelAgente({ testDataRequirements: [req('req-d', [Z])] }, registro);
    const r = aplicarDecisionesDatos(lote, aprobar(lote, { [lote.propuestas[0].proposalId]: { estado: undefined } }, []), registro, FECHA).registro;
    const texto = textoDiagnosticoDatos(diagnosticarActorRef('pensionado-condicion-z', 'pensionado', r, ENV_LISTO));
    expect(texto).toMatch(/^DATOS DE PRUEBA — REQUIERE ACTOR\n/);
    expect(texto).toContain('Busque/solicite a QA un actor que cumpla:');
    expect(texto).toContain(`Cuando lo tenga:\n  1. configure en el .env del proyecto:\n    # Número de identificación\n    ${REF_Z}=\n  2. confirme la provisión:\n`);
    expect(texto).toContain('datos provisionado pensionado-condicion-z --revisor=<su-alias>');
    expect(texto).not.toMatch(/error|bug|excepci/i);
  });

  test('preflight: actorRef no READY -> DatosPruebaNoListosError ANTES de compilar; el error no lleva valores', () => {
    const { registro } = registroSlice();
    const consola: string[] = [];
    const orig = { log: console.log, error: console.error, warn: console.warn };
    console.log = console.error = console.warn = (...a: unknown[]) => { consola.push(a.map(String).join(' ')); };
    let error: unknown;
    try { actorParaCaso(definicion('pensionado-condicion-x'), registro, { [REF_Y]: SECRETOS.idY, [REF_CORREO]: SECRETOS.correo }); } catch (e) { error = e; } finally { Object.assign(console, orig); }
    expect(error).toBeInstanceOf(DatosPruebaNoListosError);
    expect((error as DatosPruebaNoListosError).diagnostico.status).toBe('MISSING_SECRET');
    expect((error as Error).message).toContain(REF_X);
    expect(`${(error as Error).message}${JSON.stringify(error)}${consola.join('')}`).not.toMatch(FUGA);
    expect(consola).toEqual([]);
  });

  test('evidencia y compilado: el actor es el slot (id lógico); el diagnóstico compilado redacta los secretos', () => {
    const { registro } = registroSlice();
    const c = compilarCasoAfi(definicion('pensionado-condicion-x'), actorParaCaso(definicion('pensionado-condicion-x'), registro, ENV_LISTO));
    expect([c.actorId, c.ejecutable]).toEqual(['pensionado-condicion-x', true]);
    expect(JSON.stringify(diagnosticoCasoCompilado(c))).not.toMatch(FUGA);
  });

  test('errorSeguro redacta cualquier secreto AFI_ACTOR_* / AFI_SHARED_* aunque su campo no esté en la lista histórica', () => {
    const clave = 'AFI_ACTOR_PRUEBA_SINTETICA_SALARIO_BASICO';
    process.env[clave] = '9876543';
    try { expect(errorSeguro(new Error('fallo con 9876543')).message).toBe('fallo con [PRIVADO]'); } finally { delete process.env[clave]; }
  });
});

// =====================================================================================
test.describe('4P 14/15/16. intake del agente, manifest y revisión humana', () => {
  test('el agente no define nombres de env ni valores; el lote nunca contiene AFI_* ni PII (rechazos saneados)', () => {
    const lote = recibirRequisitosDelAgente({
      testDataRequirements: [req('req-a', [X]), req('req-env', [X], { secretRef: 'AFI_ACTOR_PENSIONADO_X' }), req('req-pii', [{ id: 'titular', descripcion: 'titular 1023456789' }])],
    }, vacio());
    expect(lote.rechazados.map(r => [r.referencia, [...new Set(r.problemas.map(p => p.motivo))]])).toEqual([['req-env', ['DEFINE_ENV']], ['req-pii', ['PII']]]);
    expect(JSON.stringify(lote)).not.toMatch(/AFI_[A-Z]|1023456789|process\.env/);
    // KNOWLEDGE_GAP y requisito de datos son dimensiones independientes: la misma salida puede traer ambas.
    expect(() => recibirRequisitosDelAgente({ testDataRequirements: [], knowledgeProposals: [] }, vacio())).not.toThrow();
    expect(codigo(() => recibirRequisitosDelAgente({ testDataRequirements: [], slots: [] }, vacio()))).toBe('LOTE_INVALIDO');
  });

  test('revisión humana requerida: recibir no toca el registro; sin decisiones no cambia nada; hashes, revisor y revisión base exigidos', () => {
    const base = vacio();
    const antes = JSON.stringify(base);
    const lote = recibirRequisitosDelAgente({ testDataRequirements: [req('req-a', [X])] }, base);
    expect(JSON.stringify(base)).toBe(antes);
    expect(aplicarDecisionesDatos(lote, plantillaDecisionesDatos(lote), base, FECHA)).toMatchObject({ estado: 'SIN_CAMBIOS', registro: base, sinDecision: [lote.propuestas[0].proposalId] });
    const d = aprobar(lote);
    expect(codigo(() => aplicarDecisionesDatos(lote, { ...d, decisiones: d.decisiones.map(x => ({ ...x, hash: 'x' })) }, base, FECHA))).toBe('DECISIONES_INVALIDAS');
    expect(codigo(() => aplicarDecisionesDatos(lote, { ...d, decisiones: d.decisiones.map(x => ({ ...x, revisor: '' })) }, base, FECHA))).toBe('DECISIONES_INVALIDAS');
    expect(codigo(() => aplicarDecisionesDatos({ ...lote, propuestas: lote.propuestas.map(p => ({ ...p, propuesta: { ...p.propuesta, reutilizable: false } })) }, d, base, FECHA))).toBe('HASH_DISTINTO');
    expect(codigo(() => aplicarDecisionesDatos(lote, d, { ...base, revision: 2 }, FECHA))).toBe('REVISION_CONFLICTO');
  });

  test('el humano corrige id y condiciones, define fallback y provisión; la identidad idéntica a otro actor exige mismoActorQue', () => {
    const lote = recibirRequisitosDelAgente({ testDataRequirements: [req('req-a', [X])] }, vacio());
    const pid = lote.propuestas[0].proposalId;
    const r = aplicarDecisionesDatos(lote, aprobar(lote, {
      [pid]: { correcciones: { id: 'pensionado-titular-x', condiciones: [{ ...X, descripcion: 'Titular con la condición sintética X' }], campos: [CAMPOS_SLICE[0], { campo: 'correo', fuente: 'slot', fallbackBase: true }] } },
    }), vacio(), FECHA);
    expect(r.registro.slots[0]).toMatchObject({ id: 'pensionado-titular-x', estado: 'provisionado', campos: [CAMPOS_SLICE[0], { campo: 'correo', fuente: 'slot', fallbackBase: true }] });
    expect(r.registro.historial[0]).toMatchObject({ revision: 2, accion: 'correccion', slot: 'pensionado-titular-x', revisor: 'rol-datos-qa', requisitos: ['req-a'] });
    // Un segundo requisito con otra condición que el humano corrige a X: es idéntico al actor existente.
    const otro = recibirRequisitosDelAgente({ testDataRequirements: [req('req-w', [{ id: 'condicion-w', descripcion: 'Condición sintética W' }])] }, r.registro);
    const pid2 = otro.propuestas[0].proposalId;
    expect(codigo(() => aplicarDecisionesDatos(otro, aprobar(otro, { [pid2]: { correcciones: { condiciones: [X], campos: CAMPOS_SLICE } } }, []), r.registro, FECHA))).toBe('DECISIONES_INVALIDAS');
  });

  test('reutilización exacta automática en un lote posterior: no crea slot, se registra al aplicar', () => {
    const { registro } = registroSlice();
    const lote = recibirRequisitosDelAgente({ testDataRequirements: [req('req-e', [X])] }, registro);
    expect([lote.propuestas, lote.reutilizados.map(r => [r.requisito, r.slot])]).toEqual([[], [['req-e', 'pensionado-condicion-x']]]);
    const r = aplicarDecisionesDatos(lote, plantillaDecisionesDatos(lote), registro, FECHA);
    expect(r.registro.slots.find(s => s.id === 'pensionado-condicion-x')!.origen.requisitos).toEqual(['req-a', 'req-c', 'req-e']);
    expect(r.registro.slots).toHaveLength(2);
  });

  test('manifest: testData desde las fuentes canónicas; sin valores ni nombres de variables concretos', () => {
    const m = construirAgentManifest();
    expect(m.testData).toBe(TEST_DATA);
    expect(m.contrato.estructura).toContain('actorRef?');
    expect(TEST_DATA.resoluciones.map(t => t.resolucion)).toEqual(['ACTOR_SECRET', 'ACTOR_BASE', 'SHARED', 'PUBLIC_CASE', 'DERIVED', 'AUXILIARY']);
    expect(TEST_DATA.estados.map(e => e.estado)).toEqual(['READY', 'MISSING_SECRET', 'NEEDS_PROVISIONING', 'NEEDS_REVIEW']);
    expect(TEST_DATA.secretRef.generadoPor).toBe('framework');
    expect(TEST_DATA.actores).toEqual(REGISTRO_DATOS_PRUEBA_AFI.slots.map(s => ({ id: s.id, perfil: s.perfil, condiciones: s.condiciones })));
    const texto = JSON.stringify(TEST_DATA);
    expect(texto).not.toMatch(/AFI_(ACTOR|SHARED)_[A-Z0-9]|AFI_(QA|CP)/);
    for (const r of ['Nunca lo generes', 'Las condiciones SÍ deben aparecer', 'Nunca escribas nombres de variables', 'actorRef es semántico y reutilizable']) expect(texto).toContain(r);
  });
});

// =====================================================================================
test.describe('4P 17/18/21. plantilla env, registro sin valores y seguridad', () => {
  test('plantilla env: solo nombres vacíos y comentarios; determinista; nunca el .env real', () => {
    const { registro } = registroSlice();
    const plantilla = plantillaEnvDatosPrueba(registro);
    const variables = plantilla.split('\n').filter(l => l && !l.startsWith('#'));
    expect(variables).toEqual([`${REF_CORREO}=`, `${REF_X}=`, `${REF_Y}=`]);
    expect(plantilla).toContain('# Actor: pensionado-condicion-x (perfil pensionado)');
    expect(plantilla).toContain('# Campo: Número de identificación');
    expect(plantillaEnvDatosPrueba({ ...registro, slots: [...registro.slots].reverse() })).toBe(plantilla);
    expect(plantilla).not.toMatch(FUGA);
    expect(rutaPlantillaEnv('/proyecto')).toMatch(/\.env\.test-data\.example$/);
    for (const malo of ['.env', '../.env', 'datos.txt']) expect(codigo(() => rutaPlantillaEnv('/proyecto', malo)), malo).toBe('RUTA_PROHIBIDA');
  });

  test('registro: nunca valores ni nombres de variables; PII y estado secreto en texto libre rechazados', () => {
    const { registro } = registroSlice();
    const conValor = JSON.parse(JSON.stringify(registro));
    conValor.slots[0].valor = SECRETOS.idX;
    expect(codigo(() => validarRegistroDatosPrueba(conValor))).toBe('REGISTRO_INVALIDO');
    expect(codigo(() => validarRegistroDatosPrueba({ ...registro, env: {} }))).toBe('REGISTRO_INVALIDO');
    const conNombre = JSON.parse(JSON.stringify(registro));
    conNombre.compartidos[0].descripcion = `usar ${REF_CORREO}`;
    expect(codigo(() => validarRegistroDatosPrueba(conNombre))).toBe('REGISTRO_INVALIDO');
    const conEstado = JSON.parse(JSON.stringify(registro));
    conEstado.slots[0].estado = 'provisionado con la cédula 1023456789';
    expect(codigo(() => validarRegistroDatosPrueba(conEstado))).toBe('REGISTRO_INVALIDO');
    expect(JSON.stringify(registro)).not.toMatch(/AFI_[A-Z]|1000004821/);
  });

  test('registro real: válido, versionado y sin valores (el contenido real aprobado está permitido)', async () => {
    const real = JSON.parse(await readFile(resolve(__dirname, '../knowledge/test-data-registry.json'), 'utf8'));
    expect(() => validarRegistroDatosPrueba(real)).not.toThrow();
    expect(real.revision).toBeGreaterThanOrEqual(1);
    expect(REGISTRO_DATOS_PRUEBA_AFI).toEqual(real);
    expect(JSON.stringify(real)).not.toMatch(/AFI_[A-Z]/);
  });

  test('artefactos versionados (manifest, registro, knowledge) no contienen ningún valor sensible del entorno real', () => {
    const sensibles = Object.entries(process.env)
      .filter(([k, v]) => v && v.trim().length >= 4 && /PASSWORD|CLAVE|TOKEN|USUARIO|CORREO|IDENTIFICACION|NUM_CEL|IBC|INGRESO|ACTIVIDAD|FACULTATIVO_|^AFI_(ACTOR|SHARED)_/i.test(k))
      .map(([, v]) => v!.trim());
    const archivos = [resolve(__dirname, '../data/afi/AFI-AGENT-MANIFEST.json'), resolve(__dirname, '../knowledge/test-data-registry.json'),
      ...(existsSync(resolve(__dirname, '../.env.test-data.example')) ? [resolve(__dirname, '../.env.test-data.example')] : [])];
    const textos = [...archivos.map(f => readFileSync(f, 'utf8')), serializarAgentManifest()];
    for (const t of textos) for (const v of sensibles) expect(t.includes(v)).toBe(false);
    // Sin snapshots con valores: este proyecto no guarda snapshots de Playwright.
    expect(readdirSync(__dirname).filter(f => f.endsWith('-snapshots'))).toEqual([]);
  });
});

// =====================================================================================
test.describe('4P 23/24. métricas y vertical slice sintética', () => {
  test('A (P+X), B (P+Y), C (P+X): A y C reutilizan X; MISSING_SECRET -> READY con 3 variables; D (P+Z) NEEDS_PROVISIONING', () => {
    const reqs = [req('req-a', [X]), req('req-b', [Y]), req('req-c', [X])];
    const { registro, altas } = registroSlice();
    expect(altas).toEqual(['pensionado-condicion-x', 'pensionado-condicion-y']);
    const estados = (env: Record<string, string>) => reqs.map(r => diagnosticarRequisito(r as never, registro, env));
    const sinSecretos = estados({});
    expect(sinSecretos.map(d => [d.requisito, d.actorRef, d.status])).toEqual([
      ['req-a', 'pensionado-condicion-x', 'MISSING_SECRET'], ['req-b', 'pensionado-condicion-y', 'MISSING_SECRET'], ['req-c', 'pensionado-condicion-x', 'MISSING_SECRET'],
    ]);
    const listos = estados(ENV_LISTO);
    expect(listos.map(d => d.status)).toEqual(['READY', 'READY', 'READY']);
    // Los tres casos compilan con su actor lógico; confirmacionCorreo se deriva.
    for (const [ref, caso] of [['pensionado-condicion-x', 'caso-a'], ['pensionado-condicion-y', 'caso-b'], ['pensionado-condicion-x', 'caso-c']]) {
      const c = compilarCasoAfi(definicion(ref, caso), actorParaCaso(definicion(ref, caso), registro, ENV_LISTO));
      expect(c.ejecutable, caso).toBe(true);
      expect(c.preparacion.etapas['inicio-solicitud']!.resoluciones.find(x => x.campo === 'confirmacionCorreo')!.origen).toBe('derived');
    }
    // Cuarto requisito sin actor disponible.
    const loteD = recibirRequisitosDelAgente({ testDataRequirements: [req('req-d', [Z])] }, registro);
    const finalD = aplicarDecisionesDatos(loteD, aprobar(loteD, { [loteD.propuestas[0].proposalId]: { estado: undefined } }, []), registro, FECHA).registro;
    const todos = [...reqs, req('req-d', [Z])];
    expect(todos.map(r => diagnosticarRequisito(r as never, finalD, ENV_LISTO).status)).toEqual(['READY', 'READY', 'READY', 'NEEDS_PROVISIONING']);
    // Ningún JSON/texto del slice contiene valores.
    const artefactos = [registro, finalD, loteD, sinSecretos, listos, plantillaEnvDatosPrueba(finalD), ...listos.map(d => textoDiagnosticoDatos(d))];
    for (const a of artefactos) expect(typeof a === 'string' ? a : JSON.stringify(a)).not.toMatch(FUGA);
    // Métricas (sin valores).
    const pasadas: EstadoDatos[][] = [sinSecretos.map(d => d.status), listos.map(d => d.status)];
    expect(medirDatosPrueba({ requisitos: todos as never, registroAntes: vacio(), registroDespues: finalD, entorno: ENV_LISTO, pasadas })).toEqual({
      requisitosDetectados: 4, actorSlotsUnicos: 3, slotsReutilizados: 1, slotsNuevos: 3, ready: 3, missingSecret: 0, needsProvisioning: 1, needsReview: 0,
      secretsRequeridos: 4, sharedReutilizados: 1, runtimeChanges: 0, pasadasHastaReady: 2,
    });
  });
});

// =====================================================================================
const PROHIBIDO_HU = /HU\s*1\d|14\.8|14\.12|\bSAP\b|CP0\d|\bP\d{2}\b|Cundinamarca|Ch[ií]a|\d{5,}/i;

test('4P blindaje: cero conocimiento de HU concreta en la capa de datos de prueba, su CLI y su harness', async () => {
  const dir = resolve(__dirname, '../data/afi/datosPrueba');
  for (const f of readdirSync(dir)) expect(await readFile(join(dir, f), 'utf8'), f).not.toMatch(PROHIBIDO_HU);
  expect(await readFile(resolve(RAIZ, 'tools/afi-datos.mjs'), 'utf8')).not.toMatch(PROHIBIDO_HU);
  expect(await readFile(resolve(__dirname, 'afi-datos.spec.ts'), 'utf8')).not.toMatch(PROHIBIDO_HU);
  // Capa pura: no lee process.env (el entorno lo entrega el llamador).
  for (const f of readdirSync(dir)) expect(await readFile(join(dir, f), 'utf8'), f).not.toMatch(/process\.env\b(?!\.)|process\.env\[/);
});

// =====================================================================================
/** CLI real (sin navegador): `datos`, y compilar/ejecutar con un actorRef no READY. */
test.describe('4P 13/17. CLI: datos y preflight sin navegador', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);
  const ENV_REAL = resolve(__dirname, '../.env');
  const huella = () => (existsSync(ENV_REAL) ? createHash('sha256').update(readFileSync(ENV_REAL)).digest('hex') : 'sin-env');
  const afi = (...args: string[]) => {
    const r = spawnSync(process.execPath, [resolve(RAIZ, 'tools/afi.mjs'), ...args], {
      cwd: RAIZ, encoding: 'utf8', env: { ...process.env, CI: '1', BIZAGI_BASE_URL: 'http://127.0.0.1:9' },
    });
    return { codigo: r.status, salida: `${r.stdout ?? ''}`, error: `${r.stderr ?? ''}` };
  };
  const sensibles = () => Object.entries(process.env)
    .filter(([k, v]) => v && v.trim().length >= 4 && /PASSWORD|CLAVE|TOKEN|USUARIO|CORREO|IDENTIFICACION|NUM_CEL|IBC|INGRESO|ACTIVIDAD|FACULTATIVO_|^AFI_(ACTOR|SHARED)_/i.test(k))
    .map(([, v]) => v!.trim());
  async function fixture(info: TestInfo, nombre: string, contenido: unknown) {
    const ruta = info.outputPath(nombre);
    await mkdir(resolve(ruta, '..'), { recursive: true });
    await writeFile(ruta, JSON.stringify(contenido), 'utf8');
    return ruta;
  }

  test('datos estado / requeridos / plantilla-env: sin valores, exit 0, no escriben el .env', () => {
    const antes = huella();
    const plantillaAntes = existsSync(rutaPlantillaEnv(resolve(__dirname, '..')));
    const estado = afi('colsubsidio', 'datos', 'estado', '--json');
    expect(estado.codigo, estado.error).toBe(0);
    expect(JSON.parse(estado.salida)).toMatchObject({ ok: true, accion: 'estado', revision: REGISTRO_DATOS_PRUEBA_AFI.revision });
    const requeridos = afi('colsubsidio', 'datos', 'requeridos');
    expect(requeridos.codigo, requeridos.error).toBe(0);
    const plantilla = afi('colsubsidio', 'datos', 'plantilla-env');
    expect(plantilla.codigo, plantilla.error).toBe(0);
    expect(plantilla.salida.trimEnd()).toBe(plantillaEnvDatosPrueba().trimEnd());
    for (const r of [estado, requeridos, plantilla]) for (const v of sensibles()) expect(`${r.salida}${r.error}`.includes(v)).toBe(false);
    expect(huella()).toBe(antes);
    expect(existsSync(rutaPlantillaEnv(resolve(__dirname, '..')))).toBe(plantillaAntes);
    for (const args of [['colsubsidio', 'datos', 'borrar'], ['colsubsidio', 'datos', 'estado', '--escribir'], ['colsubsidio', 'datos', 'plantilla-env', '--json'], ['colsubsidio', 'datos', 'estado', 'x']]) {
      expect(afi(...args).codigo, args.join(' ')).toBe(2);
    }
  });

  test('compilar y ejecutar con actorRef no READY: diagnóstico de datos, exit != 0, sin navegador', async ({}, info) => { // eslint-disable-line no-empty-pattern
    const archivo = await fixture(info, 'actor-inexistente.afi.json', definicion('actor-sintetico-inexistente'));
    const comprobar = (modo: string, datos: { error: { mensaje: string } }, salida: string) => {
      expect(datos, modo).toMatchObject({ modo, ok: false, error: { tipo: 'DatosPruebaNoListosError' }, datosPrueba: { actorRef: 'actor-sintetico-inexistente', status: 'NEEDS_REVIEW' } });
      expect(datos.error.mensaje, modo).toMatch(/^DATOS DE PRUEBA — REQUIERE REVISIÓN/);
      for (const v of sensibles()) expect(salida.includes(v)).toBe(false);
    };
    const compilar = afi('colsubsidio', 'compilar', archivo, '--json');
    expect(compilar.codigo).not.toBe(0);
    comprobar('compilar', JSON.parse(compilar.salida), compilar.salida);
    // ejecutar: el harness directo con salida AISLADA (tools/afi.mjs ejecutar limpia test-results/<proyecto>/artifacts,
    // que es donde corre esta suite). Evidencia off, URL inalcanzable y headless como defensa adicional.
    const tmp = mkdtempSync(join(tmpdir(), 'afi-4p-'));
    try {
      const salida = join(tmp, 'resumen.json');
      const r = spawnSync('npx', ['playwright', 'test', 'afi-case-file.spec.ts', '--workers=1', '--retries=0', '--reporter=line', `--output=${join(tmp, 'artefactos')}`], {
        cwd: RAIZ, encoding: 'utf8', shell: process.platform === 'win32',
        env: {
          ...process.env, PROJECT: 'colsubsidio', CI: '1', BIZAGI_BASE_URL: 'http://127.0.0.1:9', AFI_EVIDENCE_MODE: 'off',
          AFI_CASE_FILE: archivo, AFI_CASE_MODE: 'ejecutar', AFI_CASE_OUTPUT: salida,
        },
      });
      expect(r.status).not.toBe(0);
      comprobar('ejecutar', JSON.parse(readFileSync(salida, 'utf8')).datos, `${r.stdout}${r.stderr}${readFileSync(salida, 'utf8')}`);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    // ejecutar: el preflight vive en beforeAll (sin fixtures de navegador) y el test no vuelve a cargar ni resolver.
    const harness = await readFile(resolve(__dirname, 'afi-case-file.spec.ts'), 'utf8');
    expect(harness).toMatch(/test\.beforeAll\(async \(\) => \{\s*try \{\s*const \{ definicion, compilado \} = await prepararCaso\(\);\s*[^]*?exigirGateEvidenciaPii\(definicion\.actorRef/);
    const cuerpo = harness.slice(harness.indexOf("test('afi-case-file ejecutar'"));
    expect(cuerpo).not.toMatch(/cargarDefinicionCasoAfi|actorParaCaso|actorDesdeEntorno|compilarCasoAfi/);
  });
});
