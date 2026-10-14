import { test, expect } from '@playwright/test';
import { construirAgentManifest } from '../data/afi/agentManifest';
import { compilarCasoAfi, validarDefinicionCasoAfi, type DefinicionCasoAfi } from '../data/afi/caso';
import {
  ESQUEMA_REGISTRO_DATOS, ESQUEMA_REQUISITO_DATOS, secretRefActor, secretRefsDeSlot, validarRequisito, validarSlot,
  type CondicionActor,
} from '../data/afi/datosPrueba/contrato';
import {
  aplicarDecisionesDatos, plantillaDecisionesDatos, recibirRequisitosDelAgente, type ArchivoDecisionesDatos, type DecisionSlot, type LoteDatosPrueba,
} from '../data/afi/datosPrueba/intake';
import {
  DatosPruebaNoListosError, REGISTRO_DATOS_PRUEBA_AFI, actorParaCaso, diagnosticarActorRef, participantesParaCaso, plantillaEnvDatosPrueba,
  publicarContratoDatosPrueba, textoEstadoDatos, textoRequeridosDatos, type RegistroDatosPrueba,
} from '../data/afi/datosPrueba/registro';
import { resumenCompilacion } from '../data/afi/loader';
import { CAMPOS_CONTACTO_FUNCIONAL } from '../data/afi/funcional';

/**
 * Fase 4S: sujetos secundarios (participantes) por caso. Todo SINTÉTICO: roles genéricos rol-a/rol-b/rol-c, condiciones
 * genéricas y valores ficticios que solo existen en entornos en memoria de este archivo. Sin navegador, sin QA real.
 */

const FECHA = '2026-10-05';
const P: CondicionActor = { id: 'principal-sintetico', descripcion: 'Aportante sintético que cumple una condición de negocio genérica' };
const CA: CondicionActor = { id: 'persona-verificada', descripcion: 'Persona sintética verificada en la base local' };
const CB: CondicionActor = { id: 'persona-sin-registros', descripcion: 'Persona sintética sin registros en ninguna fuente' };
const CC: CondicionActor = { id: 'persona-fuente-caida', descripcion: 'Persona sintética cuya consulta externa falla' };
const ROLES = { a: 'rol-a', b: 'rol-b', c: 'rol-c' } as const;

const req = (id: string, condiciones: CondicionActor[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: ESQUEMA_REQUISITO_DATOS, id, perfil: 'pensionado', condiciones, camposRequeridos: ['numeroIdentificacion'],
  ocurrencias: [{ hu: 'hu-sintetica', caso: 'caso-1', paso: 'Paso 3' }], reutilizable: true, ...extra,
});
/** Requisito de PARTICIPANTE: con rol y sin perfil. */
const reqP = (id: string, rol: string, condiciones: CondicionActor[], extra: Record<string, unknown> = {}) => {
  const { perfil: _p, ...r } = req(id, condiciones, extra);
  return { ...r, rol };
};
const vacio = (): RegistroDatosPrueba => ({ schemaVersion: ESQUEMA_REGISTRO_DATOS, revision: 1, slots: [], compartidos: [], historial: [] });

function aprobar(lote: LoteDatosPrueba, extra: Record<string, Partial<DecisionSlot>> = {}): ArchivoDecisionesDatos {
  const p = plantillaDecisionesDatos(lote);
  return { ...p, decisiones: p.decisiones.map(d => ({ ...d, decision: 'APPROVED', revisor: 'rol-datos-qa', estado: 'provisionado', ...extra[d.proposalId] })) };
}
const codigo = (f: () => unknown) => { try { f(); return 'OK'; } catch (e) { return (e as { codigo?: string }).codigo ?? (e as Error).name; } };

/** Registro con 1 actor principal + 3 participantes (condiciones distintas), todos por intake y revisión humana. */
function registroCompleto() {
  const lote = recibirRequisitosDelAgente({
    testDataRequirements: [req('req-principal', [P]), reqP('req-a', ROLES.a, [CA]), reqP('req-b', ROLES.b, [CB]), reqP('req-c', ROLES.c, [CC])],
  }, vacio());
  return { lote, ...aplicarDecisionesDatos(lote, aprobar(lote), vacio(), FECHA) };
}
const idDe = (r: RegistroDatosPrueba, condicion: string) => r.slots.find(s => s.condiciones.some(c => c.id === condicion))!.id;

/** Valores ficticios; FUGA detecta el valor completo o sus últimos dígitos. */
const VALORES = { principal: '1000001111', a: '1000002222', b: '1000003333', c: '1000004444' };
const FUGA = /1000001111|1000002222|1000003333|1000004444|1111|2222|3333|4444/;
const entorno = (r: RegistroDatosPrueba, cambios: Record<string, string | undefined> = {}) => ({
  [secretRefActor(idDe(r, P.id), 'numeroIdentificacion')]: VALORES.principal,
  [secretRefActor(idDe(r, CA.id), 'numeroIdentificacion')]: VALORES.a,
  [secretRefActor(idDe(r, CB.id), 'numeroIdentificacion')]: VALORES.b,
  [secretRefActor(idDe(r, CC.id), 'numeroIdentificacion')]: VALORES.c,
  // El actor principal (perfil) también necesita sus datos públicos del entorno base del perfil.
  AFI_QA_CORREO: 'qa.sintetico@example.test', AFI_CP01_NUM_CEL: '3000000000', AFI_CP01_NUM_CEL_FIJO: '6010000000',
  ...cambios,
});

const definicion = (r: RegistroDatosPrueba, extra: Partial<DefinicionCasoAfi> = {}): DefinicionCasoAfi => ({
  version: 1, hu: 'hu-sintetica', caso: 'caso-1', nombre: 'Caso sintetico participantes', perfil: 'pensionado', actorRef: idDe(r, P.id),
  participantes: [{ rol: ROLES.a, actorRef: idDe(r, CA.id) }, { rol: ROLES.b, actorRef: idDe(r, CB.id) }, { rol: ROLES.c, actorRef: idDe(r, CC.id) }],
  preparacion: { datosCaso: {}, camposAsercion: [], etapas: ['inicio-solicitud'] },
  funcional: { caso: 'caso-1', pasos: [{ id: 'p1', esperado: 'El catálogo tiene opciones', operaciones: [{ tipo: 'catalogo-no-vacio', campo: CAMPOS_CONTACTO_FUNCIONAL[0] }] }] },
  ...extra,
});
const errores = (d: unknown) => validarDefinicionCasoAfi(d).map(p => `${p.ruta}: ${p.mensaje}`).join('\n');

// =====================================================================================
test.describe('4S A. compatibilidad: el modelo antiguo es el caso simple de un único actor principal', () => {
  test('los 7 actores reales validan, siguen siendo principales y sus secretRefs se derivan igual que antes', () => {
    expect(REGISTRO_DATOS_PRUEBA_AFI.slots.length).toBe(7);
    for (const s of REGISTRO_DATOS_PRUEBA_AFI.slots) {
      expect(s.sujeto, s.id).toBeUndefined();
      expect(validarSlot(s), s.id).toEqual([]);
      for (const r of secretRefsDeSlot(s).filter(x => x.capa === 'slot')) expect(r.secretRef, s.id).toBe(secretRefActor(s.id, r.campo));
    }
  });

  test('requisito sin rol (4P) sigue válido; sin rol ni perfil se rechaza; caso sin participantes compila igual que antes', () => {
    expect(validarRequisito(req('req-x', [P]))).toEqual([]);
    const { perfil: _p, ...sinPerfil } = req('req-x', [P]);
    expect(validarRequisito(sinPerfil).map(p => p.motivo)).toContain('PERFIL');
    const { registro } = registroCompleto();
    const { participantes: _x, ...legacy } = definicion(registro);
    const c = compilarCasoAfi(legacy, actorParaCaso(legacy, registro, entorno(registro)));
    expect([c.participantes, c.relaciones]).toEqual([[], []]);
    expect(resumenCompilacion(c).texto).not.toContain('Participantes');
  });
});

// =====================================================================================
test.describe('4S B/C. actor principal + 3 participantes con condiciones propias', () => {
  test('B. intake -> revisión -> registro: 1 principal + 3 slots de participante; el caso los declara y su preflight los resuelve', () => {
    const { lote, registro } = registroCompleto();
    expect(lote.propuestas.map(p => [p.propuesta.slot.sujeto ?? 'principal', p.propuesta.slot.perfil ?? '-'])).toEqual([
      ['principal', 'pensionado'], ['participante', '-'], ['participante', '-'], ['participante', '-'],
    ]);
    expect(registro.slots.filter(s => s.sujeto === 'participante').map(s => s.id)).toEqual([idDe(registro, CA.id), idDe(registro, CB.id), idDe(registro, CC.id)]);
    const def = definicion(registro);
    expect(errores(def)).toBe('');
    const env = entorno(registro);
    const actor = actorParaCaso(def, registro, env);
    const ps = participantesParaCaso(def, registro, env, actor);
    expect(ps.map(p => [p.rol, p.actorRef])).toEqual(def.participantes!.map(p => [p.rol, p.actorRef]));
    const c = compilarCasoAfi(def, actor);
    expect(c.participantes).toEqual(def.participantes);
    expect(JSON.stringify(c.participantes)).not.toMatch(FUGA);
    expect(resumenCompilacion(c).texto).toContain(`${ROLES.a} -> ${idDe(registro, CA.id)}`);
  });

  test('C. cada participante conserva SUS condiciones; las ocurrencias llevan el rol', () => {
    const { registro } = registroCompleto();
    for (const [rol, cond] of [[ROLES.a, CA], [ROLES.b, CB], [ROLES.c, CC]] as const) {
      const s = registro.slots.find(x => x.id === idDe(registro, cond.id))!;
      expect(s.condiciones, rol).toEqual([cond]);
      expect(s.origen.ocurrencias.every(o => o.rol === rol), rol).toBe(true);
    }
  });
});

// =====================================================================================
test.describe('4S D/E/F. relaciones entre sujetos: solo las que QA exige', () => {
  test('D. dos roles comparten EXPLÍCITAMENTE el mismo sujeto (mismo actor + mismo-sujeto)', () => {
    const { registro } = registroCompleto();
    const def = definicion(registro, {
      participantes: [{ rol: ROLES.a, actorRef: idDe(registro, CA.id) }, { rol: ROLES.b, actorRef: idDe(registro, CA.id) }],
      relaciones: [{ tipo: 'mismo-sujeto', sujetos: [ROLES.a, ROLES.b] }],
    });
    expect(errores(def)).toBe('');
    const ps = participantesParaCaso(def, registro, entorno(registro), actorParaCaso(def, registro, entorno(registro)));
    expect(ps[0].datos.numeroIdentificacion).toBe(ps[1].datos.numeroIdentificacion);
    // mismo-sujeto con actores distintos: contradicción del contrato.
    expect(errores({ ...def, participantes: definicion(registro).participantes!.slice(0, 2) })).toMatch(/mismo-sujeto exige que rol-a y rol-b usen el mismo actor/);
  });

  test('E. distinto-sujeto: actores distintos y, en ejecución, identidades distintas por VALOR (error sin valores)', () => {
    const { registro } = registroCompleto();
    const def = definicion(registro, { relaciones: [{ tipo: 'distinto-sujeto', sujetos: [ROLES.a, ROLES.b] }, { tipo: 'distinto-sujeto', sujetos: ['principal', ROLES.c] }] });
    expect(errores(def)).toBe('');
    expect(codigo(() => participantesParaCaso(def, registro, entorno(registro), actorParaCaso(def, registro, entorno(registro))))).toBe('OK');
    // Dos slots distintos configurados con la MISMA persona: se detecta y el error no muestra el valor.
    const env = entorno(registro, { [secretRefActor(idDe(registro, CB.id), 'numeroIdentificacion')]: VALORES.a });
    let mensaje = '';
    try { participantesParaCaso(def, registro, env, actorParaCaso(def, registro, env)); } catch (e) { mensaje = (e as Error).message; expect((e as { codigo: string }).codigo).toBe('RELACION_SUJETOS'); }
    expect(mensaje).toMatch(/rol-a y rol-b deben ser sujetos distintos/);
    expect(mensaje).not.toMatch(FUGA);
    // distinto-sujeto declarado sobre el mismo actor: contradicción del contrato.
    const mismo = definicion(registro, {
      participantes: [{ rol: ROLES.a, actorRef: idDe(registro, CA.id) }, { rol: ROLES.b, actorRef: idDe(registro, CA.id) }],
      relaciones: [{ tipo: 'distinto-sujeto', sujetos: [ROLES.a, ROLES.b] }],
    });
    expect(errores(mismo)).toMatch(/distinto-sujeto exige actores distintos/);
  });

  test('F. sin relación declarada no se infiere igualdad (compartir actor exige mismo-sujeto) ni diferencia (valores iguales no fallan)', () => {
    const { registro } = registroCompleto();
    const compartido = definicion(registro, { participantes: [{ rol: ROLES.a, actorRef: idDe(registro, CA.id) }, { rol: ROLES.b, actorRef: idDe(registro, CA.id) }] });
    expect(errores(compartido)).toMatch(/rol-a y rol-b usan el mismo actor: declare la relación mismo-sujeto/);
    const def = definicion(registro);
    const env = entorno(registro, { [secretRefActor(idDe(registro, CB.id), 'numeroIdentificacion')]: VALORES.a });
    expect(codigo(() => participantesParaCaso(def, registro, env, actorParaCaso(def, registro, env)))).toBe('OK');
  });

  test('relaciones mal formadas: rol no declarado, "principal" como rol, relación repetida', () => {
    const { registro } = registroCompleto();
    expect(errores(definicion(registro, { relaciones: [{ tipo: 'distinto-sujeto', sujetos: [ROLES.a, 'rol-z'] }] }))).toMatch(/roles declarados/);
    expect(errores(definicion(registro, { participantes: [{ rol: 'principal', actorRef: idDe(registro, CA.id) }] }))).toMatch(/distinto de "principal"/);
    expect(errores(definicion(registro, { relaciones: [{ tipo: 'distinto-sujeto', sujetos: [ROLES.a, ROLES.b] }, { tipo: 'mismo-sujeto', sujetos: [ROLES.b, ROLES.a] }] })))
      .toMatch(/repetida o contradictoria/);
  });
});

// =====================================================================================
test.describe('4S G/H/I. secretos, diagnóstico humano y privacidad', () => {
  test('G. los secretos de cada participante se derivan independientes (por slot), sin colisión ni capa base', () => {
    const { registro } = registroCompleto();
    const refs = registro.slots.flatMap(s => secretRefsDeSlot(s).map(r => r.secretRef));
    expect(new Set(refs).size).toBe(refs.length);
    for (const s of registro.slots.filter(x => x.sujeto === 'participante')) {
      expect(secretRefsDeSlot(s).map(r => r.capa)).toEqual(['slot']);
      expect(validarSlot({ ...s, campos: [{ campo: 'numeroIdentificacion', fuente: 'base' }] }).map(p => p.motivo)).toContain('FUENTE_CAMPO');
      expect(validarSlot({ ...s, campos: [{ campo: 'correo', fuente: 'slot', fallbackBase: true }] }).map(p => p.motivo)).toContain('FUENTE_CAMPO');
    }
    expect(plantillaEnvDatosPrueba(registro)).toContain(`# Participante: ${idDe(registro, CA.id)} (sujeto secundario`);
  });

  test('H. datos estado / requeridos dicen QUÉ sujeto falta, con qué rol y qué condición debe cumplir', () => {
    const { registro } = registroCompleto();
    const env = entorno(registro, { [secretRefActor(idDe(registro, CB.id), 'numeroIdentificacion')]: undefined });
    const { texto, resumen } = textoEstadoDatos(registro, env);
    expect(texto).toContain('Participantes (sujetos secundarios): 3');
    expect(resumen.faltanSecretos).toBe(1);
    const bloque = texto.split('\n\n').find(b => b.includes('FALTANTES'))!;
    expect(bloque).toContain('Participante:');
    expect(bloque).toContain(idDe(registro, CB.id));
    expect(bloque).toContain(`hu-sintetica · caso-1 · Paso 3 · rol ${ROLES.b}`);
    expect(bloque).toContain(CB.descripcion);
    expect(bloque).toContain(secretRefActor(idDe(registro, CB.id), 'numeroIdentificacion'));
    expect(textoRequeridosDatos(registro, env).texto).toContain(`Necesita el participante ${idDe(registro, CB.id)} (rol ${ROLES.b})`);
    // Preflight del caso: el participante faltante bloquea con su diagnóstico humano.
    const def = definicion(registro);
    let e: unknown;
    try { participantesParaCaso(def, registro, env, actorParaCaso(def, registro, env)); } catch (x) { e = x; }
    expect(e).toBeInstanceOf(DatosPruebaNoListosError);
    expect((e as Error).message).toMatch(new RegExp(`Participante \\(rol ${ROLES.b}\\):`));
  });

  test('I. sin PII ni nombres de variables en manifest, estado, requeridos ni compilado', () => {
    const { registro } = registroCompleto();
    const env = entorno(registro);
    const publicado = JSON.stringify(publicarContratoDatosPrueba(registro));
    expect(publicado).not.toMatch(FUGA);
    // Nombres CONCRETOS de variables (la convención publicada AFI_ACTOR_<ACTOR>_<CAMPO> es una plantilla, no un nombre).
    expect(publicado).not.toMatch(/\bAFI_[A-Z0-9]+_[A-Z0-9]/);
    expect(publicado).toContain('"sujeto":"participante"');
    expect([textoEstadoDatos(registro, env).texto, textoRequeridosDatos(registro, env).texto].join()).not.toMatch(FUGA);
    const manifest = construirAgentManifest().testData;
    expect(manifest.participantes.consumoRuntime).toBe(false);
    expect(manifest.contractShape.requisito.opcionales).toEqual(['perfil', 'rol', 'actorSugerido', 'camposCondicionales', 'distintoDe']);
  });
});

// =====================================================================================
test.describe('4S J. el intake nunca convierte en silencio un participante en el actor principal', () => {
  test('rol inválido o reservado, ocurrencia con otro rol: rechazados', () => {
    expect(validarRequisito(reqP('r', 'principal', [CA])).map(p => p.motivo)).toContain('ID_INVALIDO');
    expect(validarRequisito(reqP('r', 'Rol A', [CA])).map(p => p.motivo)).toContain('ID_INVALIDO');
    expect(validarRequisito({ ...reqP('r', ROLES.a, [CA]), ocurrencias: [{ hu: 'h', rol: ROLES.b }] }).map(p => p.detalle).join()).toMatch(/coincidir con el rol/);
  });

  test('mismo rol + mismas condiciones: ni se agrupan ni se reutilizan solos (posible duplicado para un humano)', () => {
    const { registro } = registroCompleto();
    const lote = recibirRequisitosDelAgente({ testDataRequirements: [reqP('req-a2', ROLES.a, [CA]), reqP('req-a3', ROLES.a, [CA])] }, registro);
    expect(lote.reutilizados).toEqual([]);
    expect(lote.propuestas).toHaveLength(2);
    expect(lote.posiblesDuplicados.length).toBeGreaterThanOrEqual(2);
    // Sin resolver los posibles duplicados no se aplica nada.
    expect(codigo(() => aplicarDecisionesDatos(lote, aprobar(lote), registro, FECHA))).toBe('POSIBLE_DUPLICADO_SIN_RESOLVER');
    // Confirmados como sujetos DISTINTOS: dos slots con condiciones idénticas conviven.
    const [a, b] = lote.propuestas.map(p => p.proposalId);
    const existente = idDe(registro, CA.id);
    const r = aplicarDecisionesDatos(lote, aprobar(lote, { [a]: { actoresDistintosDe: [b, existente] }, [b]: { actoresDistintosDe: [existente] } }), registro, FECHA);
    expect(r.registro.slots.filter(s => s.condiciones[0].id === CA.id)).toHaveLength(3);
  });

  test('mismoActorQue entre participante y actor principal: rechazado; actorRef principal hacia un participante: NEEDS_REVIEW', () => {
    const { registro } = registroCompleto();
    const lote = recibirRequisitosDelAgente({ testDataRequirements: [reqP('req-x', ROLES.a, [P])] }, registro);
    const pid = lote.propuestas[0].proposalId;
    const decisiones = aprobar(lote, { [pid]: { mismoActorQue: idDe(registro, P.id), estado: undefined, actoresDistintosDe: undefined } });
    expect(() => aplicarDecisionesDatos(lote, decisiones, registro, FECHA)).toThrow(/mezcla un participante con un actor principal/);
    const d = diagnosticarActorRef(idDe(registro, CA.id), 'pensionado', registro, entorno(registro));
    expect([d.status, d.motivos[0].motivo]).toEqual(['NEEDS_REVIEW', 'sujeto-distinto']);
    // Y un participante no puede apuntar al slot del principal sin declarar mismo-sujeto con "principal".
    const def = definicion(registro, { participantes: [{ rol: ROLES.a, actorRef: idDe(registro, P.id) }] });
    expect(errores(def)).toMatch(/principal y rol-a usan el mismo actor/);
    const conRelacion = { ...def, relaciones: [{ tipo: 'mismo-sujeto' as const, sujetos: ['principal', ROLES.a] as [string, string] }] };
    expect(errores(conRelacion)).toBe('');
    expect(codigo(() => participantesParaCaso(conRelacion, registro, entorno(registro), actorParaCaso(conRelacion, registro, entorno(registro))))).toBe('OK');
  });
});
