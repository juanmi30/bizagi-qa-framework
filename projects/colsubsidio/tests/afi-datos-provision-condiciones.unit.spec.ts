import { test, expect } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ArtefactoRevisionInmutableError, prepararEnDisco, type RutasConocimiento } from '../data/afi/aplicacion/intakeDisco';
import { secretRefsDeSlot, type CondicionActor } from '../data/afi/datosPrueba/contrato';
import { prepararDatosEnDisco, type RutasDatos } from '../data/afi/datosPrueba/disco';
import { aplicarDecisionesDatos, plantillaDecisionesDatos, recibirRequisitosDelAgente, type LoteDatosPrueba } from '../data/afi/datosPrueba/intake';
import { REGISTRO_DATOS_PRUEBA_AFI, confirmarProvision, diagnosticarSlot, type RegistroDatosPrueba } from '../data/afi/datosPrueba/registro';
import type { CampoAfi } from '../data/afi/modelo';
import { loteKdC970, registroAntesKdC970 } from './fixtures/registroAntesKdC970';

/**
 * Patch final previo a aplicar kd-c970835c84c0dbf0. Todo en memoria o en directorios temporales: el store real nunca se escribe.
 *  - mismoActorQue con condición NUEVA -> el actor vuelve a pendiente-provisionar (los secretos no prueban condiciones de negocio);
 *    solo campos nuevos -> conserva la provisión (el estado efectivo ya es MISSING_SECRET mientras falten valores).
 *  - knowledge/review y knowledge/test-data-review son APPEND-ONLY.
 */

const PROYECTO = resolve(__dirname, '..');
const SIN = 'empresa-empleador-juridico-rues-sin-rep-legal', CON = 'empresa-empleador-juridico-rues-con-rep-legal';
const FECHA = '2026-10-06';
const NUEVA: CondicionActor = { id: 'sin-solicitud-afiliacion-en-curso', descripcion: 'Sin solicitud de afiliación en curso que impida crear un nuevo trámite.' };
/** Base congelada y VERIFICADA por hash (revisión 10, antes de kd-c970): las pruebas no dependen de la revisión vigente. */
const BASE = registroAntesKdC970();
const NEGOCIO: CampoAfi[] = ['codigoCiiu', 'razonSocial', 'actividadEconomicaEmpresa', 'fechaInicioActividad', 'valorNomina', 'numeroTrabajadores', 'afiliadoPrimeraVez'];

const slot = (r: RegistroDatosPrueba, id: string) => r.slots.find(s => s.id === id)!;
/** Entorno FICTICIO con todos los secretos del slot presentes (valores inventados, nunca reales). */
const entornoCompleto = (r: RegistroDatosPrueba, id: string) => Object.fromEntries(secretRefsDeSlot(slot(r, id)).map(x => [x.secretRef, `ficticio-${x.campo}`]));
const sinVariables = (e: Record<string, string>, refs: string[]) => Object.fromEntries(Object.entries(e).filter(([k]) => !refs.includes(k)));

/** Requisito del agente sobre el actor SIN (mismas condiciones del slot + extras opcionales). */
function requisito(id: string, extras: { condiciones?: CondicionActor[]; campos?: CampoAfi[] } = {}) {
  const base = slot(BASE, SIN);
  return {
    schemaVersion: 'afi-test-data-requirement/v1', id, perfil: 'empresa',
    condiciones: [...base.condiciones, ...(extras.condiciones ?? [])],
    camposRequeridos: extras.campos ?? ['numeroIdentificacion', 'correo'],
    ocurrencias: [{ hu: 'HU 7.14', caso: 'CP04' }], reutilizable: true,
  };
}
/** Aprueba TODAS las propuestas del lote con mismoActorQue hacia `destino(proposalId)` y aplica en memoria. */
function aplicarMismoActor(lote: LoteDatosPrueba, destino: (pid: string) => string, registro = BASE) {
  const p = plantillaDecisionesDatos(lote);
  const decisiones = { ...p, decisiones: p.decisiones.map(d => ({ ...d, decision: 'APPROVED', revisor: 'qa-revisor', mismoActorQue: destino(d.proposalId) })) };
  return aplicarDecisionesDatos(lote, decisiones, registro, FECHA);
}
const ampliar = (extras: Parameters<typeof requisito>[1]) =>
  aplicarMismoActor(recibirRequisitosDelAgente({ testDataRequirements: [requisito('req-ampliacion-sin-rep', extras)] }, BASE), () => SIN).registro;

test.describe('Provisión: mismoActorQue con y sin condición nueva (en memoria)', () => {
  test('punto de partida: el actor SIN está provisionado y READY con sus secretos', () => {
    expect(slot(BASE, SIN).estado).toBe('provisionado');
    expect(diagnosticarSlot(slot(BASE, SIN), entornoCompleto(BASE, SIN)).status).toBe('READY');
  });

  test('A. mismoActorQue SIN condición nueva -> conserva provisionado', () => {
    const r = ampliar({ campos: ['numeroIdentificacion', 'correo', 'razonSocial'] });
    expect(slot(r, SIN).condiciones).toEqual(slot(BASE, SIN).condiciones);
    expect(slot(r, SIN).estado).toBe('provisionado');
  });

  test('B. mismoActorQue CON condición nueva -> pendiente-provisionar', () => {
    const r = ampliar({ condiciones: [NUEVA] });
    expect(slot(r, SIN).condiciones.map(c => c.id)).toEqual(['empleador-juridico-rues-sin-rep-legal', NUEVA.id]);
    expect(slot(r, SIN).estado).toBe('pendiente-provisionar');
    // Ningún otro actor cambia de estado.
    for (const s of r.slots.filter(x => x.id !== SIN)) expect(s.estado, s.id).toBe(slot(BASE, s.id).estado);
  });

  test('C. con TODOS sus secretos presentes, la condición nueva no lo vuelve READY automáticamente', () => {
    const r = ampliar({ condiciones: [NUEVA] });
    const d = diagnosticarSlot(slot(r, SIN), entornoCompleto(r, SIN));
    // Todos los secretos presentes: lo único pendiente es la confirmación humana de las condiciones.
    expect([d.status, d.confirmacionPendiente]).toEqual(['NEEDS_PROVISIONING', true]);
  });

  test('D. tras `datos provisionado` (confirmación humana) y con secretos completos -> READY', () => {
    const r = ampliar({ condiciones: [NUEVA] });
    const entorno = entornoCompleto(r, SIN);
    const p = confirmarProvision(r, SIN, 'qa-revisor', FECHA, entorno);
    expect(p.estado).toBe('PROVISIONADO');
    expect(slot(p.registro, SIN).estado).toBe('provisionado');
    expect(diagnosticarSlot(slot(p.registro, SIN), entorno).status).toBe('READY');
    expect(p.registro.historial.at(-1)).toMatchObject({ slot: SIN, accion: 'provision', revisor: 'qa-revisor' });
    // Sin secretos completos no hay bypass: la confirmación se rechaza.
    const nuevos = secretRefsDeSlot(slot(r, SIN)).filter(x => x.campo === 'numeroIdentificacion').map(x => x.secretRef);
    expect(() => confirmarProvision(r, SIN, 'qa-revisor', FECHA, sinVariables(entorno, nuevos))).toThrow(/SECRETOS_FALTANTES|falta/);
  });

  test('E. solo campos nuevos: faltan secretos -> MISSING_SECRET; todos presentes -> conserva READY', () => {
    const r = ampliar({ campos: NEGOCIO });
    expect(slot(r, SIN).estado).toBe('provisionado');
    const completo = entornoCompleto(r, SIN);
    const nuevos = secretRefsDeSlot(slot(r, SIN)).filter(x => (NEGOCIO as readonly string[]).includes(x.campo)).map(x => x.secretRef);
    expect(nuevos).toHaveLength(7);
    expect(diagnosticarSlot(slot(r, SIN), sinVariables(completo, nuevos)).status).toBe('MISSING_SECRET');
    expect(diagnosticarSlot(slot(r, SIN), completo).status).toBe('READY');
  });

  test('F. lote real kd-c970835c84c0dbf0 simulado: SIN y CON reciben la condición y ambos requieren nueva confirmación humana', () => {
    const ruta = join(PROYECTO, 'knowledge/test-data-review/kd-c970835c84c0dbf0.review.json');
    const bytes = readFileSync(ruta, 'utf8');
    const lote: LoteDatosPrueba = loteKdC970();
    const antes = JSON.stringify(BASE), vigenteAntes = JSON.stringify(REGISTRO_DATOS_PRUEBA_AFI);
    const res = aplicarMismoActor(lote, pid => (pid.includes('sin-rep-legal') ? SIN : CON));
    expect([res.altas, res.reutilizaciones.map(x => x.slot), res.revisionAntes, res.revisionDespues]).toEqual([[], [SIN, CON], 10, 11]);
    for (const id of [SIN, CON]) {
      const s = slot(res.registro, id);
      expect(s.condiciones.map(c => c.id), id).toContain(NUEVA.id);
      expect(s.estado, id).toBe('pendiente-provisionar');
      const d = diagnosticarSlot(s, entornoCompleto(res.registro, id));
      expect([d.status, d.confirmacionPendiente], id).toEqual(['NEEDS_PROVISIONING', true]);
    }
    expect(slot(res.registro, SIN).campos.map(c => c.campo)).toEqual(['numeroIdentificacion', 'correo', ...NEGOCIO]);
    expect(slot(res.registro, CON).campos.map(c => c.campo)).toEqual(['numeroIdentificacion', 'correo']);
    // Los demás actores (HU 14.8) no cambian; el store y el artefacto reales tampoco.
    for (const s of res.registro.slots.filter(x => ![SIN, CON].includes(x.id))) expect(s, s.id).toEqual(slot(BASE, s.id));
    expect(JSON.stringify(BASE)).toBe(antes);
    expect(JSON.stringify(REGISTRO_DATOS_PRUEBA_AFI)).toBe(vigenteAntes);
    expect(readFileSync(ruta, 'utf8')).toBe(bytes);
    // Coherencia con la aplicación REAL (decisión humana posterior): condiciones y campos del registro vigente = simulación.
    if (REGISTRO_DATOS_PRUEBA_AFI.historial.some(h => h.lote === 'kd-c970835c84c0dbf0')) {
      for (const id of [SIN, CON]) {
        const real = slot(REGISTRO_DATOS_PRUEBA_AFI, id), simulado = slot(res.registro, id);
        // Lotes posteriores (p. ej. kd-06d8f9578f37ab19) pueden AÑADIR campos: la simulación debe ser prefijo del estado real.
        expect([real.condiciones, real.campos.slice(0, simulado.campos.length)], id).toEqual([simulado.condiciones, simulado.campos]);
      }
    }
  });
});

// ---------- Append-only de los artefactos de revisión (directorios temporales con COPIAS de los reales) ----------
const TMP = join(tmpdir(), `afi-append-only-${randomUUID()}`);
test.afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const fotografia = (dir: string) => Object.fromEntries(readdirSync(dir).sort().map(n => [n, readFileSync(join(dir, n), 'utf8')]));
function copiaDe(origen: string, destino: string) {
  mkdirSync(destino, { recursive: true });
  for (const n of readdirSync(origen)) copyFileSync(join(origen, n), join(destino, n));
}

test.describe('Append-only: knowledge/review y knowledge/test-data-review', () => {
  test('Test Data: un lote nuevo no elimina ni modifica ningún lote anterior; re-preparar uno existente con otro contenido falla sin escribir', () => {
    const dir = join(TMP, randomUUID());
    const r: RutasDatos = { raiz: dir, registro: join(dir, 'knowledge/test-data-registry.json'), revisiones: join(dir, 'knowledge/test-data-review'), manifest: join(dir, 'AFI-AGENT-MANIFEST.json') };
    mkdirSync(join(dir, 'knowledge'), { recursive: true });
    writeFileSync(r.registro, `${JSON.stringify(BASE, null, 2)}\n`);
    copiaDe(join(PROYECTO, 'knowledge/test-data-review'), r.revisiones);
    const antes = fotografia(r.revisiones);
    expect(Object.keys(antes)).toEqual(expect.arrayContaining(['kd-dcc55b8df6d3478c.review.json', 'kd-c970835c84c0dbf0.review.json']));

    // Lote NUEVO (otro requisito): se añaden archivos; todos los anteriores quedan byte-idénticos.
    const entrada = join(dir, 'salida.json');
    writeFileSync(entrada, JSON.stringify({ testDataRequirements: [requisito('req-append-only', { campos: ['numeroIdentificacion', 'correo', 'razonSocial'] })] }));
    const nuevo = prepararDatosEnDisco(r, entrada, 'colsubsidio');
    const despues = fotografia(r.revisiones);
    for (const [n, contenido] of Object.entries(antes)) expect(despues[n], n).toBe(contenido);
    expect(Object.keys(despues).length).toBe(Object.keys(antes).length + 3);
    // Re-preparar lo MISMO: idempotente (mismos bytes, nada cambia).
    prepararDatosEnDisco(r, entrada, 'colsubsidio');
    expect(fotografia(r.revisiones)).toEqual(despues);

    // Re-preparar el lote real kd-c970... cuya revisión legible hoy se renderiza distinto: NO lo reemplaza.
    const real = prepararDatosEnDisco.bind(null, r, join(PROYECTO, 'intake/4s-r1-informacion-empresa-datos.json'), 'colsubsidio');
    expect(real).toThrow(ArtefactoRevisionInmutableError);
    expect(fotografia(r.revisiones)).toEqual(despues);
    expect(nuevo.lote.batchId).not.toBe('kd-c970835c84c0dbf0');
  });

  test('Knowledge: preparar un lote nuevo no elimina ni modifica los lotes anteriores', () => {
    const dir = join(TMP, randomUUID());
    const r: RutasConocimiento = { raiz: dir, almacen: join(dir, 'application-model.json'), revisiones: join(dir, 'review'), manifest: join(dir, 'AFI-AGENT-MANIFEST.json') };
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(PROYECTO, 'knowledge/application-model.json'), r.almacen);
    copiaDe(join(PROYECTO, 'knowledge/review'), r.revisiones);
    const antes = fotografia(r.revisiones);
    const res = prepararEnDisco(r, join(PROYECTO, 'intake/hu7141-cp01-cp04-gem.md'));
    const despues = fotografia(r.revisiones);
    for (const [n, contenido] of Object.entries(antes)) expect(despues[n], n).toBe(contenido);
    expect(existsSync(join(r.revisiones, `${res.artefacto.batchId}.review.json`))).toBe(true);
  });

  test('una revisión existente con otro contenido nunca se sobrescribe (ambos escritores usan la guarda)', () => {
    const fuente = (rel: string) => readFileSync(join(PROYECTO, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const conocimiento = fuente('data/afi/aplicacion/intakeDisco.ts'), datos = fuente('data/afi/datosPrueba/disco.ts');
    // Ningún .review.* se escribe con la escritura atómica "pisable".
    expect(conocimiento).not.toMatch(/escribirAtomico\((archivoRevision|archivo), json\((artefacto|seguimiento)\)\)/);
    expect(datos).not.toMatch(/escribirAtomico\((archivoRevision|archivoMd)/);
    expect(`${conocimiento}${datos}`).not.toMatch(/\b(rmSync|unlinkSync)\([^)]*revisiones/);
  });
});

// ---------- Provenance: fuente 228333 ----------
test.describe('Provenance HU 7.14.1: identificador 228333', () => {
  test('la fuente y su carpeta de imágenes usan 228333; no queda ningún 2288333 en fuentes, intake ni stores', () => {
    const raiz = resolve(PROYECTO, '../..');
    const nombre = 'HU7_14_1_228333_CLS - AFI - GEN - Ajuste flujo de proceso Afiliaciones.md';
    expect(existsSync(join(raiz, nombre))).toBe(true);
    expect(readdirSync(raiz).filter(n => n.includes('2288333'))).toEqual([]);
    expect(readdirSync(join(raiz, 'image')).filter(n => n.includes('2288333'))).toEqual([]);
    expect(readFileSync(join(raiz, nombre), 'utf8')).toContain('image/HU7_14_1_228333_CLS-AFI-GEN-AjusteflujodeprocesoAfiliaciones/');
    for (const d of ['intake', 'knowledge', 'knowledge/review', 'knowledge/test-data-review']) {
      for (const n of readdirSync(join(PROYECTO, d), { withFileTypes: true }).filter(x => x.isFile()).map(x => x.name)) {
        expect(readFileSync(join(PROYECTO, d, n), 'utf8'), `${d}/${n}`).not.toContain('2288333');
      }
    }
  });
});

// ---------- 4S-R.2: lote kd-06d8f9578f37ab19 (cajaCompensacionAnterior) simulado en memoria ----------
test.describe('4S-R.2 lote caja de compensación anterior (simulación en memoria; nunca escribe el store)', () => {
  const LOTE = 'kd-06d8f9578f37ab19';
  const CAMPO: CampoAfi = 'cajaCompensacionAnterior';

  test('mismoActorQue SIN condición nueva: mismo actor, misma provisión, +1 campo; MISSING_SECRET hasta configurar la variable y luego READY sin `datos provisionado`', () => {
    const vigente = REGISTRO_DATOS_PRUEBA_AFI;
    const lote = JSON.parse(readFileSync(join(PROYECTO, `knowledge/test-data-review/${LOTE}.review.json`), 'utf8')) as LoteDatosPrueba;
    expect([lote.propuestas.length, lote.posiblesDuplicados.map(d => d.b)]).toEqual([1, [SIN]]);
    // Ninguna condición nueva respecto del actor destino (las del requisito son exactamente las suyas).
    // Sin condiciones nuevas, las del actor no cambian ni antes ni después de aplicarlo: se comparan con el registro vigente.
    const antesSin = slot(vigente, SIN);
    expect(lote.propuestas[0].propuesta.slot.condiciones.map(c => c.id)).toEqual(antesSin.condiciones.map(c => c.id));
    if (vigente.historial.some(h => h.lote === LOTE)) {
      // Ya aplicado por un humano: se verifica el resultado real.
      expect(slot(vigente, SIN).campos.map(c => c.campo)).toContain(CAMPO);
      expect(slot(vigente, SIN).estado).toBe('provisionado');
      return;
    }
    expect(lote.revisionBase).toBe(vigente.revision);
    const antes = JSON.stringify(vigente);
    const res = aplicarMismoActor(lote, () => SIN, vigente);
    expect([res.altas, res.reutilizaciones.map(x => x.slot)]).toEqual([[], [SIN]]);
    const s = slot(res.registro, SIN);
    expect([s.estado, s.condiciones, s.campos.map(c => c.campo)]).toEqual([antesSin.estado, antesSin.condiciones, [...antesSin.campos.map(c => c.campo), CAMPO]]);
    const completo = entornoCompleto(res.registro, SIN);
    const ref = secretRefsDeSlot(s).find(x => x.campo === CAMPO)!.secretRef;
    expect(diagnosticarSlot(s, sinVariables(completo, [ref])).status).toBe('MISSING_SECRET');
    expect(diagnosticarSlot(s, completo).status).toBe('READY');
    // Los demás actores no cambian; el registro vigente tampoco.
    for (const x of res.registro.slots.filter(y => y.id !== SIN)) expect(x, x.id).toEqual(slot(vigente, x.id));
    expect(JSON.stringify(vigente)).toBe(antes);
  });
});

