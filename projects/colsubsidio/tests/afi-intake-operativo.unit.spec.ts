import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { KNOWLEDGE_INTAKE, construirAgentManifest, serializarAgentManifest } from '../data/afi/agentManifest';
import { REGISTRO_CAMPOS_FUNCIONALES } from '../data/afi/aplicacion/campos';
import { aplicarEnDisco, prepararEnDisco, type RutasConocimiento } from '../data/afi/aplicacion/intakeDisco';
import {
  DECISIONES_HUMANAS, ESQUEMA_DECISIONES, ESQUEMA_REVISION, IntakeError, REVISOR_VALIDO, aplicarDecisiones, hashAlmacen, hashSolicitud,
  plantillaDecisiones, prepararLoteRevision, validarArtefactoRevision,
  type ArchivoDecisiones, type ArtefactoRevision, type DecisionHumana,
} from '../data/afi/aplicacion/intakeLote';
import {
  ALMACEN_APLICACION_AFI, construirModeloAplicacion, extensionDesdeAlmacen, publicarModelo, validarAlmacenModelo, type AlmacenModeloAplicacion,
} from '../data/afi/aplicacion/modeloAplicacion';
import {
  ESQUEMA_PROPUESTA, FORMA_PROPUESTA, ID_PROPUESTA, REFERENCIAS_POR_TIPO, claveEntidad, hashPropuesta, ordenarPorDependencias, validarPropuesta,
  type EntidadPropuesta, type KnowledgeProposal,
} from '../data/afi/aplicacion/propuestas';
import { fechaCompactaPlausible, piiEnContenido, piiEnMetadato } from '../data/afi/aplicacion/sensibilidad';
import { PROVEEDORES_PRODUCTIVOS, TIPOS_ENTIDAD, type TipoEntidad } from '../data/afi/aplicacion/superficies';

/**
 * Fase 4O: intake de conocimiento OPERATIVO (preparar -> decisiones humanas -> aplicar a disco). Solo entidades
 * SINTÉTICAS; toda escritura en un directorio temporal bajo test-results. El almacén real no se toca.
 */

const FECHA = '2026-09-30';
const BASE: AlmacenModeloAplicacion = {
  schemaVersion: 'afi-application-model/v1', revision: 1,
  entidades: {
    pantallas: [], campos: [], rutas: [], variables: [], notificaciones: [],
    actividades: [{ id: 'actividad-a', descripcion: 'Actividad sintética A' }, { id: 'actividad-b', descripcion: 'Actividad sintética B' }],
    integraciones: [{ id: 'integracion-x', descripcion: 'Integración sintética' }],
  },
  historial: [],
};
const modeloDe = (a: AlmacenModeloAplicacion) => construirModeloAplicacion(extensionDesdeAlmacen(a));

function prop(proposalId: string, entidad: EntidadPropuesta | Record<string, unknown>, extra: Record<string, unknown> = {}): KnowledgeProposal {
  return {
    schemaVersion: ESQUEMA_PROPUESTA, proposalId, entidad: entidad as EntidadPropuesta,
    origen: { fuente: 'diseño sintético §2', ocurrencias: [{ hu: 'hu-sintetica', caso: 'caso-1', paso: 'p1' }] },
    evidenciaSemantica: 'El diseño nombra esta entidad de forma inequívoca.', estado: 'PENDING_REVIEW', revisiones: [], ...extra,
  } as KnowledgeProposal;
}
const act = (id: string) => ({ tipo: 'actividad', id, descripcion: `Actividad sintética ${id}` }) as EntidadPropuesta;
const solicitud = (solicitudId: string, id: string, alternativas: string[]) => ({
  schemaVersion: ESQUEMA_PROPUESTA, solicitudId, id, descripcion: 'Elemento sintético de tipo dudoso', alternativas,
  origen: { fuente: 'diseño sintético §3', ocurrencias: [{ hu: 'hu-sintetica', paso: 'p2' }] },
  evidenciaSemantica: 'El diseño lo nombra sin aclarar si es actividad o pantalla.', estado: 'NEEDS_CLASSIFICATION',
});

/** Decisiones a partir de la plantilla (sin inventar nada: solo se rellena lo indicado). */
function decidir(a: ArtefactoRevision, d: Record<string, DecisionHumana>, extra: Partial<ArchivoDecisiones> = {}): ArchivoDecisiones {
  const plantilla = plantillaDecisiones(a);
  return {
    ...plantilla,
    decisiones: plantilla.decisiones.map(x => (d[x.proposalId] ? { ...x, decision: d[x.proposalId], revisor: 'rol-conocimiento', comentario: 'revisado' } : x)),
    ...extra,
  };
}
const codigo = (f: () => unknown) => { try { f(); return 'OK'; } catch (e) { return e instanceof IntakeError ? e.codigo : `otro:${(e as Error).message}`; } };

// ---------- Disco temporal ----------
const TMP = resolve(__dirname, '../../../test-results/colsubsidio/unit-conocimiento', randomUUID());
const RAIZ = resolve(__dirname, '../../..');
test.afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function entorno(almacen: AlmacenModeloAplicacion = BASE) {
  const dir = join(TMP, randomUUID());
  mkdirSync(dir, { recursive: true });
  const rutas: RutasConocimiento = { raiz: dir, almacen: join(dir, 'application-model.json'), revisiones: join(dir, 'review'), manifest: join(dir, 'AFI-AGENT-MANIFEST.json') };
  writeFileSync(rutas.almacen, `${JSON.stringify(almacen, null, 2)}\n`, 'utf8');
  const escribir = (nombre: string, v: unknown) => { const r = join(dir, nombre); writeFileSync(r, JSON.stringify(v, null, 2), 'utf8'); return r; };
  const leer = <T = unknown>(r: string): T => JSON.parse(readFileSync(join(dir, r), 'utf8'));
  return { dir, rutas, escribir, leer, almacenTexto: () => readFileSync(rutas.almacen, 'utf8') };
}

// =====================================================================================
test.describe('4O 1. PII contextual: contenido semántico estricto, metadatos de fuente documentales', () => {
  test('1. fuente con fecha YYYYMMDD, requirement id y fuente documental válida: sin falso positivo', () => {
    const m = modeloDe(BASE);
    const p = prop('prop-fecha', act('actividad-fecha'), {
      origen: { fuente: '20260810_documento-pruebas.xlsx', ocurrencias: [{ hu: 'REQ-0012345', caso: 'caso-20260810', paso: 'p1', condicion: 'RQ00123456' }] },
    });
    expect(validarPropuesta(p, m)).toEqual([]);
    expect(validarPropuesta(prop('kp-20260810-001', act('actividad-f2')), m)).toEqual([]);
    expect(piiEnMetadato('diseno_202608101530_v2.xlsx')).toBe(false);
    expect([fechaCompactaPlausible('20260810'), fechaCompactaPlausible('20261399'), fechaCompactaPlausible('12345678')]).toEqual([true, false, false]);
  });

  test('2. PII real: correo, número personal en evidencia/descripción o en la fuente, rechazados; el hash sigue excluido', () => {
    const m = modeloDe(BASE);
    const motivos = (p: unknown) => validarPropuesta(p, m).map(x => x.motivo);
    expect(motivos(prop('p1', act('actividad-m1'), { origen: { fuente: 'persona@example.test', ocurrencias: [{ hu: 'h' }] } }))).toEqual(['PII']);
    expect(motivos(prop('p2', act('actividad-m2'), { evidenciaSemantica: 'El titular 1023456789 aparece en el diseño' }))).toEqual(['PII']);
    expect(motivos(prop('p3', { tipo: 'actividad', id: 'actividad-m3', descripcion: 'Llamar al 300 123 4567' }))).toEqual(['PII']);
    expect(motivos(prop('p4', { tipo: 'actividad', id: 'actividad-m4', descripcion: 'Salario de 2.500.000' }))).toEqual(['PII']);
    expect(motivos(prop('p5', act('actividad-m5'), { origen: { fuente: 'archivo_1023456789.xlsx', ocurrencias: [{ hu: 'h' }] } }))).toEqual(['PII']);
    expect(motivos(prop('p6', act('actividad-m6'), { origen: { fuente: 'soporte cedula-1023456789', ocurrencias: [{ hu: 'h' }] } }))).toEqual(['PII']);
    // La misma fecha compacta que se admite en la fuente NO se admite en el contenido semántico.
    expect(piiEnContenido('evidencia 20260810')).toBe(true);
    // Hash sha256 e id de lote excluidos del escaneo del almacén.
    const conHash: AlmacenModeloAplicacion = {
      ...BASE, revision: 2, entidades: { ...BASE.entidades, actividades: [...BASE.entidades.actividades, { id: 'actividad-h', descripcion: 'x' }] },
      historial: [{ revision: 2, fecha: FECHA, entidad: 'actividad-h', tipo: 'actividad', propuesta: 'kp-20260810-1', hash: '1234567'.repeat(9) + 'a', revisor: 'rol-x', lote: 'kr-1234567890123456' }],
    };
    expect(() => validarAlmacenModelo(conHash)).not.toThrow();
  });
});

// =====================================================================================
test.describe('4O 2/3. contrato de intake publicado al agente', () => {
  test('3. el manifest publica knowledgeIntake derivado de las constantes canónicas; instrucciones lo referencian', async () => {
    const manifest = construirAgentManifest();
    expect(manifest.knowledgeIntake).toBe(KNOWLEDGE_INTAKE);
    const ki = JSON.parse(await readFile(resolve(__dirname, '../data/afi/AFI-AGENT-MANIFEST.json'), 'utf8')).knowledgeIntake;
    expect(ki).toEqual(JSON.parse(JSON.stringify(KNOWLEDGE_INTAKE)));
    expect([ki.schemaVersion, ki.enabled]).toEqual([ESQUEMA_PROPUESTA, true]);
    expect(ki.entityTypes.map((t: { tipo: string }) => t.tipo)).toEqual([...TIPOS_ENTIDAD]);
    for (const t of ki.entityTypes) expect(t.referencias).toEqual(REFERENCIAS_POR_TIPO[t.tipo as keyof typeof REFERENCIAS_POR_TIPO]);
    expect(ki.proposalShape.requeridos).toEqual([...FORMA_PROPUESTA.requeridos]);
    expect(ki.proposalShape.valoresFijos).toEqual({ schemaVersion: ESQUEMA_PROPUESTA, estado: 'PENDING_REVIEW', revisiones: [] });
    expect(ki.classificationRequestShape.valoresFijos.estado).toBe('NEEDS_CLASSIFICATION');
    const reglas = ki.rules.join('\n');
    for (const r of [/diagnóstico FINAL es KNOWLEDGE_GAP[\s\S]*INFORMACION_INSUFICIENTE, TESTABILITY_GAP, CAPABILITY_GAP/, /UNA entidad con exactamente UN tipo/, /dos propuestas atómicas/,
      /classificationRequest/, /PENDING_REVIEW[\s\S]*Nunca autoapruebes ni escribas el modelo/, /NO son entidades/, /fuente[\s\S]*evidenciaSemantica son obligatorias/]) expect(reglas).toMatch(r);
    expect(JSON.stringify(ki)).not.toMatch(/@|\d{5,}|#[a-z]|process\.env|HU 1\d|14\.8|\bSAP\b/);
    const md = await readFile(resolve(__dirname, '../data/afi/AFI-AGENT-INSTRUCTIONS.md'), 'utf8');
    expect(md).toMatch(/knowledgeIntake[\s\S]*knowledgeProposals[\s\S]*classificationRequests/);
    expect(md).toMatch(/diagnóstico FINAL es `KNOWLEDGE_GAP`; nunca para `INFORMACION_INSUFICIENTE`, `TESTABILITY_GAP`, `CAPABILITY_GAP` ni condiciones representables/);
    expect(md).toMatch(/dos propuestas atómicas/);
  });

  test('4. el agente solo puede enviar PENDING_REVIEW: aprobadas, con revisiones o claves ajenas se rechazan sin copiar su contenido', () => {
    const a = prepararLoteRevision({
      knowledgeProposals: [
        prop('ok', act('actividad-ok')),
        prop('auto', act('actividad-auto'), { estado: 'APPROVED' }),
        prop('rev', act('actividad-rev'), { revisiones: [{ decision: 'APPROVED', revisor: 'agente', fecha: FECHA, version: 1, hash: 'x' }] }),
        prop('extra', act('actividad-extra'), { aprobadoPor: 'agente' }),
      ],
    }, BASE);
    expect(a.propuestas.map(p => p.proposalId)).toEqual(['ok']);
    expect(a.rechazadas.map(r => [r.referencia, [...new Set(r.problemas.map(p => p.motivo))]])).toEqual([
      ['auto', ['ESTADO_INVALIDO']], ['rev', ['ESTADO_INVALIDO']], ['extra', ['ESTRUCTURA']]]);
    expect(codigo(() => prepararLoteRevision({ knowledgeProposals: [], decisiones: [] }, BASE))).toBe('ENTRADA_INVALIDA');
    // Una referencia con PII en el proposalId nunca se copia al artefacto.
    const b = prepararLoteRevision({ knowledgeProposals: [prop('x1023456789', act('actividad-p'), { evidenciaSemantica: 'dato 1023456789' })] }, BASE);
    expect(b.rechazadas[0].referencia).toBeUndefined();
    expect(JSON.stringify(b)).not.toMatch(/1023456789/);
  });
});

// =====================================================================================
test.describe('4O 4-6. preparar y artefacto de revisión', () => {
  const SALIDA = {
    knowledgeProposals: [
      prop('kp-ruta', { tipo: 'ruta', id: 'ruta-c-d', descripcion: 'Ruta sintética', desde: 'actividad-c', hacia: 'actividad-d' }),
      prop('kp-c', act('actividad-c')), prop('kp-d', act('actividad-d')), prop('kp-c-bis', act('actividad-c')),
      prop('kp-camino', act('camino-c')),
    ],
    classificationRequests: [solicitud('cr-1', 'elemento-dudoso', ['actividad', 'pantalla-ui'])],
  };

  test('5/6. preparar NO modifica el almacén; artefacto determinista con hashes, rechazos, duplicados, clasificaciones y métricas', () => {
    const e = entorno();
    const antes = e.almacenTexto();
    const r1 = prepararEnDisco(e.rutas, e.escribir('salida-agente.json', SALIDA));
    expect(e.almacenTexto()).toBe(antes);
    const texto1 = readFileSync(join(e.dir, r1.archivoRevision), 'utf8');
    const r2 = prepararEnDisco(e.rutas, e.escribir('salida-agente.json', SALIDA));
    expect(readFileSync(join(e.dir, r2.archivoRevision), 'utf8')).toBe(texto1);
    expect(r2.plantillaNueva).toBe(false);
    const a = r1.artefacto;
    expect(a.revisionBase).toBe(1);
    expect(a.propuestas.map(p => [p.proposalId, p.entidad, p.dependeDe])).toEqual([
      ['kp-ruta', 'ruta:ruta-c-d', ['kp-c', 'kp-d']], ['kp-c', 'actividad:actividad-c', []], ['kp-d', 'actividad:actividad-d', []], ['kp-camino', 'actividad:camino-c', []]]);
    for (const p of a.propuestas) expect(p.hash).toBe(hashPropuesta(p.propuesta));
    expect(a.posiblesDuplicados).toEqual([{ propuestas: ['kp-c', 'kp-camino'], motivo: 'nombre-similar' }]);
    expect(a.solicitudesClasificacion.map(s => [s.solicitudId, s.alternativas])).toEqual([['cr-1', ['actividad', 'pantalla-ui']]]);
    expect(a.resumen).toEqual({
      knowledgeGapsRecibidos: 5, propuestasRecibidas: 5, validas: 5, rechazadas: 0, unicas: 4, posiblesDuplicados: 1,
      clasificacionesRecibidas: 1, clasificacionesPendientes: 1, entidadesPrevistas: 4, revisionBase: 1, runtimeChanges: 0,
    });
    // Plantilla SIN decisiones inventadas.
    const d = e.leer<ArchivoDecisiones>(r1.archivoDecisiones);
    expect(d.decisiones.every(x => x.decision === null) && d.clasificaciones.every(x => x.tipo === null)).toBe(true);
    expect(JSON.stringify(a)).not.toMatch(/"(APPROVED|REJECTED|NEEDS_CHANGES)"/);
    // Otra revisión base => otro lote.
    expect(prepararLoteRevision(SALIDA, { ...BASE, revision: 2 }).batchId).not.toBe(a.batchId);
    // También acepta la respuesta completa del agente con UN bloque json.
    const md = e.escribir('respuesta.md', 'x');
    writeFileSync(md, `KNOWLEDGE_GAP\n\n- paso: p1\n\n\`\`\`json\n${JSON.stringify(SALIDA)}\n\`\`\`\n`, 'utf8');
    expect(prepararEnDisco(e.rutas, md).artefacto.batchId).toBe(a.batchId);
  });
});

// =====================================================================================
test.describe('4O 6-10. decisiones, hashes, revisionBase, dry-run y aplicación', () => {
  const salidaSimple = { knowledgeProposals: [prop('kp-1', act('actividad-uno')), prop('kp-2', act('actividad-dos')), prop('kp-3', act('actividad-tres'))] };

  test('7. hash distinto bloquea: decisión que cita otro contenido o artefacto editado a mano', () => {
    const a = prepararLoteRevision(salidaSimple, BASE);
    const d = decidir(a, { 'kp-1': 'APPROVED' });
    expect(codigo(() => aplicarDecisiones(a, { ...d, decisiones: d.decisiones.map(x => (x.proposalId === 'kp-1' ? { ...x, hash: 'f'.repeat(64) } : x)) }, BASE, FECHA))).toBe('HASH_DISTINTO');
    const editado = JSON.parse(JSON.stringify(a)) as ArtefactoRevision;
    editado.propuestas[0].propuesta.entidad.descripcion = 'Otra cosa';
    expect(codigo(() => aplicarDecisiones(editado, d, BASE, FECHA))).toBe('HASH_DISTINTO');
    expect(codigo(() => aplicarDecisiones(a, { ...d, batchId: 'kr-0000000000000000' }, BASE, FECHA))).toBe('LOTE_DISTINTO');
  });

  test('8/10b. revisionBase vieja bloquea; dos lotes preparados sobre la revisión 1: el segundo NO se aplica tras el primero', () => {
    const e = entorno();
    const r1 = prepararEnDisco(e.rutas, e.escribir('s1.json', salidaSimple));
    const r2 = prepararEnDisco(e.rutas, e.escribir('s2.json', { knowledgeProposals: [prop('kp-9', act('actividad-nueve'))] }));
    expect([r1.artefacto.revisionBase, r2.artefacto.revisionBase]).toEqual([1, 1]);
    const d1 = e.escribir('d1.json', decidir(r1.artefacto, { 'kp-1': 'APPROVED' }));
    const d2 = e.escribir('d2.json', decidir(r2.artefacto, { 'kp-9': 'APPROVED' }));
    aplicarEnDisco(e.rutas, join(e.dir, r1.archivoRevision), d1, FECHA, false);
    expect(e.leer<AlmacenModeloAplicacion>('application-model.json').revision).toBe(2);
    const antes = e.almacenTexto();
    expect(codigo(() => aplicarEnDisco(e.rutas, join(e.dir, r2.archivoRevision), d2, FECHA, false))).toBe('REVISION_CONFLICTO');
    expect(e.almacenTexto()).toBe(antes);
    // Decisiones sobre otra revisionBase que la del artefacto: conflicto.
    const a = prepararLoteRevision(salidaSimple, BASE);
    expect(codigo(() => aplicarDecisiones(a, { ...decidir(a, {}), revisionBase: 7 }, BASE, FECHA))).toBe('REVISION_CONFLICTO');
    // Misma revisión, contenido distinto (edición manual del almacén): también conflicto.
    expect(codigo(() => aplicarDecisiones(a, decidir(a, {}), { ...BASE, entidades: { ...BASE.entidades, notificaciones: [{ id: 'aviso-z', descripcion: 'x' }] } }, FECHA))).toBe('REVISION_CONFLICTO');
  });

  test('9. dry-run ejecuta todas las validaciones y no escribe nada', () => {
    const e = entorno();
    const r = prepararEnDisco(e.rutas, e.escribir('s.json', salidaSimple));
    const d = e.escribir('d.json', decidir(r.artefacto, { 'kp-1': 'APPROVED', 'kp-2': 'REJECTED' }));
    const antes = e.almacenTexto();
    const x = aplicarEnDisco(e.rutas, join(e.dir, r.archivoRevision), d, FECHA, true);
    expect([x.dryRun, x.escritos, x.entidadesAplicadas]).toEqual([true, [], 0]);
    expect([x.resultado.revisionAntes, x.resultado.revisionDespues, x.resultado.metricas.entidadesPrevistas]).toEqual([1, 2, 1]);
    expect(x.resultado.entidadesAnadidas).toEqual([{ proposalId: 'kp-1', entidad: 'actividad:actividad-uno' }]);
    expect(e.almacenTexto()).toBe(antes);
    expect(existsSync(e.rutas.manifest!)).toBe(false);
    expect(readdirSync(e.rutas.revisiones).filter(f => f.includes('resultado'))).toEqual([]);
    // El dry-run también detecta conflictos.
    const mal = e.escribir('mal.json', { ...decidir(r.artefacto, { 'kp-1': 'APPROVED' }), revisionBase: 3 });
    expect(codigo(() => aplicarEnDisco(e.rutas, join(e.dir, r.archivoRevision), mal, FECHA, true))).toBe('REVISION_CONFLICTO');
  });

  test('10/11/12. aplicar incrementa la revisión, conserva historial, registra el lote; reaplicar no duplica', () => {
    const previo: AlmacenModeloAplicacion = {
      ...BASE, revision: 3,
      historial: [{ revision: 3, fecha: '2026-09-01', entidad: 'actividad-b', tipo: 'actividad', propuesta: 'kp-previa', hash: 'a'.repeat(64), revisor: 'rol-previo' }],
    };
    const e = entorno(previo);
    const r = prepararEnDisco(e.rutas, e.escribir('s.json', salidaSimple));
    const d = e.escribir('d.json', decidir(r.artefacto, { 'kp-1': 'APPROVED', 'kp-2': 'NEEDS_CHANGES' }));
    const x = aplicarEnDisco(e.rutas, join(e.dir, r.archivoRevision), d, FECHA, false);
    const almacen = e.leer<AlmacenModeloAplicacion>('application-model.json');
    expect(almacen.revision).toBe(4);
    expect(almacen.historial[0]).toEqual(previo.historial[0]);
    expect(almacen.historial.slice(1)).toEqual([{
      revision: 4, fecha: FECHA, entidad: 'actividad-uno', tipo: 'actividad', propuesta: 'kp-1',
      hash: r.artefacto.propuestas[0].hash, revisor: 'rol-conocimiento', lote: r.artefacto.batchId,
    }]);
    expect(almacen.entidades.actividades.map(a => a.id)).toEqual(['actividad-a', 'actividad-b', 'actividad-uno']);
    expect(x.escritos).toEqual(['application-model.json', 'AFI-AGENT-MANIFEST.json', `review/${r.artefacto.batchId}.resultado.json`]);
    expect(x.resultado.metricas).toMatchObject({ aprobadas: 1, cambiosSolicitados: 1, sinDecision: 1, revisionAntes: 3, revisionDespues: 4, runtimeChanges: 0 });
    const registro = e.leer<{ decisiones: { decision: string }[]; sinDecision: string[] }>(`review/${r.artefacto.batchId}.resultado.json`);
    expect(registro.decisiones.map(z => z.decision)).toEqual(['APPROVED', 'NEEDS_CHANGES']);
    expect(registro.sinDecision).toEqual(['kp-3']);
    // Reaplicar el mismo lote: YA_APLICADO, sin duplicar ni sobrescribir.
    const antes = e.almacenTexto();
    const otra = aplicarEnDisco(e.rutas, join(e.dir, r.archivoRevision), d, FECHA, false);
    expect([otra.resultado.estado, otra.escritos]).toEqual(['YA_APLICADO', []]);
    expect(e.almacenTexto()).toBe(antes);
  });

  test('13. lote atómico: un conflicto dentro del lote anula todo y no escribe', () => {
    const e = entorno();
    const salida = { knowledgeProposals: [prop('kp-a', act('actividad-ok')), prop('kp-x1', act('actividad-x')), prop('kp-x2', { tipo: 'actividad', id: 'actividad-x', descripcion: 'Otra descripción' })] };
    const r = prepararEnDisco(e.rutas, e.escribir('s.json', salida));
    expect(r.artefacto.posiblesDuplicados).toEqual([{ propuestas: ['kp-x1', 'kp-x2'], motivo: 'datos-distintos' }]);
    const base = decidir(r.artefacto, { 'kp-a': 'APPROVED', 'kp-x1': 'APPROVED', 'kp-x2': 'APPROVED' });
    // Sin confirmar el posible duplicado: decisiones inválidas.
    expect(codigo(() => aplicarEnDisco(e.rutas, join(e.dir, r.archivoRevision), e.escribir('d0.json', base), FECHA, false))).toBe('DECISIONES_INVALIDAS');
    // Confirmado, sigue siendo la MISMA entidad dos veces: conflicto; kp-a tampoco se aplica.
    const confirmado = { ...base, decisiones: base.decisiones.map(x => (x.proposalId === 'kp-x2' ? { ...x, noEsDuplicadoDe: ['kp-x1'] } : x)) };
    const antes = e.almacenTexto();
    expect(codigo(() => aplicarEnDisco(e.rutas, join(e.dir, r.archivoRevision), e.escribir('d1.json', confirmado), FECHA, false))).toBe('CONFLICTO_APLICACION');
    expect(e.almacenTexto()).toBe(antes);
    expect(existsSync(`${e.rutas.almacen}.lock`)).toBe(false);
  });
});

// =====================================================================================
test.describe('4O 7. clasificación humana', () => {
  const SALIDA = { knowledgeProposals: [], classificationRequests: [solicitud('cr-1', 'elemento-dudoso', ['actividad', 'variable'])] };

  test('14. la clasificación exige UN tipo de las alternativas, un revisor y los datos del tipo', () => {
    const a = prepararLoteRevision(SALIDA, BASE);
    const base = plantillaDecisiones(a);
    const con = (c: Record<string, unknown>) => ({ ...base, clasificaciones: [{ ...base.clasificaciones[0], revisor: 'rol-conocimiento', ...c }] });
    expect(codigo(() => aplicarDecisiones(a, con({ tipo: 'ruta' }), BASE, FECHA))).toBe('DECISIONES_INVALIDAS');
    expect(codigo(() => aplicarDecisiones(a, con({ tipo: 'actividad', revisor: '' }), BASE, FECHA))).toBe('DECISIONES_INVALIDAS');
    expect(codigo(() => aplicarDecisiones(a, { ...con({ tipo: 'actividad' }), clasificaciones: [con({ tipo: 'actividad' }).clasificaciones[0], con({ tipo: 'variable' }).clasificaciones[0]] }, BASE, FECHA))).toBe('DECISIONES_INVALIDAS');
    expect(codigo(() => aplicarDecisiones(a, con({ tipo: 'actividad', datos: { id: 'otro' } }), BASE, FECHA))).toBe('DECISIONES_INVALIDAS');
    // variable sin superficies: la propuesta resultante es inválida -> nada se aplica.
    expect(codigo(() => aplicarDecisiones(a, con({ tipo: 'variable' }), BASE, FECHA))).toBe('CLASIFICACION_INVALIDA');
    expect(codigo(() => aplicarDecisiones(a, con({ tipo: 'variable', datos: { superficies: ['integracion'] } }), BASE, FECHA))).toBe('OK');
    expect(codigo(() => aplicarDecisiones(a, con({ tipo: 'actividad', hash: '0'.repeat(64) }), BASE, FECHA))).toBe('HASH_DISTINTO');
  });

  test('15. clasificar NO autoaprueba: nace una propuesta PENDING_REVIEW en un lote de seguimiento; solo su aprobación la aplica', () => {
    const e = entorno();
    const r = prepararEnDisco(e.rutas, e.escribir('s.json', SALIDA));
    const plantilla = e.leer<ArchivoDecisiones>(r.archivoDecisiones);
    const d = e.escribir('d.json', { ...plantilla, clasificaciones: [{ ...plantilla.clasificaciones[0], tipo: 'actividad', revisor: 'rol-conocimiento' }] });
    const x = aplicarEnDisco(e.rutas, join(e.dir, r.archivoRevision), d, FECHA, false);
    expect([x.resultado.estado, x.resultado.revisionDespues, x.resultado.entidadesAnadidas]).toEqual(['SIN_CAMBIOS', 1, []]);
    expect(e.leer<AlmacenModeloAplicacion>('application-model.json').entidades.actividades.map(a => a.id)).not.toContain('elemento-dudoso');
    const seg = x.resultado.seguimiento!;
    expect(seg.propuestas.map(p => [p.proposalId, p.entidad, p.propuesta.estado, p.propuesta.revisiones])).toEqual([['cr-1.actividad', 'actividad:elemento-dudoso', 'PENDING_REVIEW', []]]);
    expect(x.escritos).toContain(`review/${seg.batchId}.review.json`);
    const plantillaSeg = e.leer<ArchivoDecisiones>(`review/${seg.batchId}.decisiones.json`);
    expect(plantillaSeg.decisiones.map(z => z.decision)).toEqual([null]);
    // Segundo ciclo: aprobarla sí la incorpora.
    const d2 = e.escribir('d2.json', decidir(seg, { 'cr-1.actividad': 'APPROVED' }));
    aplicarEnDisco(e.rutas, join(e.dir, `review/${seg.batchId}.review.json`), d2, FECHA, false);
    expect(e.leer<AlmacenModeloAplicacion>('application-model.json').entidades.actividades.map(a => a.id)).toContain('elemento-dudoso');
  });
});

// =====================================================================================
test.describe('4O 11. dependencias entre propuestas del mismo lote', () => {
  test('16. actividades + ruta, e integración + variable con ámbito, se aprueban en UN lote y se aplican en orden', () => {
    const e = entorno();
    const salida = {
      knowledgeProposals: [
        prop('kp-ruta', { tipo: 'ruta', id: 'ruta-p-q', descripcion: 'Ruta sintética', desde: 'actividad-p', hacia: 'actividad-q' }),
        prop('kp-var', { tipo: 'variable', id: 'dato-y', descripcion: 'Dato sintético', superficies: ['integracion'], ambito: { tipo: 'integracion', integracion: 'integracion-i' } }),
        prop('kp-p', act('actividad-p')), prop('kp-q', act('actividad-q')),
        prop('kp-i', { tipo: 'integracion', id: 'integracion-i', descripcion: 'Integración sintética I' }),
      ],
    };
    const r = prepararEnDisco(e.rutas, e.escribir('s.json', salida));
    expect(r.artefacto.rechazadas).toEqual([]);
    const todas = Object.fromEntries(r.artefacto.propuestas.map(p => [p.proposalId, 'APPROVED' as const]));
    aplicarEnDisco(e.rutas, join(e.dir, r.archivoRevision), e.escribir('d.json', decidir(r.artefacto, todas)), FECHA, false);
    const almacen = e.leer<AlmacenModeloAplicacion>('application-model.json');
    const orden = almacen.historial.map(h => h.propuesta);
    expect(orden.indexOf('kp-p')).toBeLessThan(orden.indexOf('kp-ruta'));
    expect(orden.indexOf('kp-q')).toBeLessThan(orden.indexOf('kp-ruta'));
    expect(orden.indexOf('kp-i')).toBeLessThan(orden.indexOf('kp-var'));
    expect([almacen.revision, almacen.entidades.rutas, almacen.entidades.variables.map(v => v.ambito)]).toEqual([
      2, [{ id: 'ruta-p-q', descripcion: 'Ruta sintética', desde: 'actividad-p', hacia: 'actividad-q' }], [{ tipo: 'integracion', integracion: 'integracion-i' }]]);
  });

  test('17. dependencia imposible: ni en el modelo ni en el lote, rechazada en el lote o no aprobada -> falla', () => {
    const a = prepararLoteRevision({
      knowledgeProposals: [
        prop('kp-r1', { tipo: 'ruta', id: 'ruta-fantasma', descripcion: 'x', desde: 'actividad-inexistente' }),
        prop('kp-mala', { tipo: 'actividad', id: 'actividad-m', descripcion: 'Ver #btn-x' }),
        prop('kp-r2', { tipo: 'ruta', id: 'ruta-huerfana', descripcion: 'x', desde: 'actividad-m' }),
        prop('kp-s', act('actividad-s')),
        prop('kp-r3', { tipo: 'ruta', id: 'ruta-hacia-s', descripcion: 'x', hacia: 'actividad-s' }),
      ],
    }, BASE);
    expect(a.rechazadas.map(r => [r.referencia, r.problemas.map(p => p.motivo)])).toEqual([
      ['kp-r1', ['REFERENCIA_DESCONOCIDA']], ['kp-mala', ['SELECTOR']], ['kp-r2', ['DEPENDENCIA_RECHAZADA']]]);
    // La dependencia está en el lote pero se RECHAZA (o queda sin decidir): aprobar la ruta falla y nada se aplica.
    expect(codigo(() => aplicarDecisiones(a, decidir(a, { 'kp-r3': 'APPROVED', 'kp-s': 'REJECTED' }), BASE, FECHA))).toBe('CONFLICTO_APLICACION');
    expect(codigo(() => aplicarDecisiones(a, decidir(a, { 'kp-r3': 'APPROVED' }), BASE, FECHA))).toBe('CONFLICTO_APLICACION');
    expect(aplicarDecisiones(a, decidir(a, { 'kp-r3': 'APPROVED', 'kp-s': 'APPROVED' }), BASE, FECHA).entidadesAnadidas.map(x => x.entidad)).toEqual(['actividad:actividad-s', 'ruta:ruta-hacia-s']);
  });

  test('18. ciclo o autodependencia en el grafo: falla (hoy el grafo de tipos es acíclico por construcción)', () => {
    const grafo = { a: ['b'], b: ['c'], c: ['a'], d: [] } as Record<string, string[]>;
    expect(() => ordenarPorDependencias(Object.keys(grafo), k => k, k => grafo[k])).toThrow(/ciclo de dependencias entre a, b, c/);
    expect(() => ordenarPorDependencias(['x'], k => k, () => ['x'])).toThrow(/depende de sí misma/);
    expect(ordenarPorDependencias(['r', 'a', 'b'], k => k, k => (k === 'r' ? ['a', 'b', 'externa'] : []))).toEqual(['a', 'b', 'r']);
    // Las referencias solo apuntan a tipos sin referencias: no hay ciclos posibles entre tipos.
    for (const refs of Object.values(REFERENCIAS_POR_TIPO)) for (const r of refs) expect(REFERENCIAS_POR_TIPO[r.tipo]).toEqual([]);
  });
});

// =====================================================================================
test.describe('4O 8/12/13. almacén final, manifest posterior, runtime y blindaje', () => {
  test('19. el almacén final completo se valida ANTES de escribir: si no es válido, no se escribe nada', () => {
    const e = entorno();
    const r = prepararEnDisco(e.rutas, e.escribir('s.json', { knowledgeProposals: [prop('kp-1', act('actividad-uno'))] }));
    // Un revisor con forma de alias pero con un número largo pasa el formato y lo detiene la validación del almacén final.
    const d = decidir(r.artefacto, { 'kp-1': 'APPROVED' });
    const mal = { ...d, decisiones: d.decisiones.map(x => ({ ...x, revisor: 'a1023456789' })) };
    const antes = e.almacenTexto();
    expect(codigo(() => aplicarEnDisco(e.rutas, join(e.dir, r.archivoRevision), e.escribir('d.json', mal), FECHA, false))).toBe('ALMACEN_INVALIDO');
    expect(e.almacenTexto()).toBe(antes);
    expect(existsSync(e.rutas.manifest!)).toBe(false);
    expect(readdirSync(e.dir).filter(f => f.endsWith('.tmp'))).toEqual([]);
  });

  test('20/21. el manifest posterior refleja SOLO lo aprobado; cero proveedores y cero runtime', () => {
    const e = entorno();
    const r = prepararEnDisco(e.rutas, e.escribir('s.json', {
      knowledgeProposals: [prop('kp-si', act('actividad-aprobada')), prop('kp-no', act('actividad-rechazada')), prop('kp-pend', act('actividad-pendiente'))],
    }));
    const x = aplicarEnDisco(e.rutas, join(e.dir, r.archivoRevision), e.escribir('d.json', decidir(r.artefacto, { 'kp-si': 'APPROVED', 'kp-no': 'REJECTED' })), FECHA, false);
    const manifest = JSON.parse(readFileSync(e.rutas.manifest!, 'utf8'));
    expect(manifest.testabilidad.modelo.actividades).toEqual(['actividad-a', 'actividad-b', 'actividad-aprobada']);
    expect(readFileSync(e.rutas.manifest!, 'utf8')).toBe(serializarAgentManifest(modeloDe(e.leer('application-model.json'))));
    expect(manifest.testabilidad.superficies).toEqual(construirAgentManifest(REGISTRO_CAMPOS_FUNCIONALES).testabilidad.superficies);
    // Aplicar conocimiento nunca añade proveedores: sigue solo el productivo validado (4R) con su alcance de catálogo.
    expect(PROVEEDORES_PRODUCTIVOS).toEqual([{ id: 'tareas-pendientes-bizagi', superficie: 'proceso-bpm', alcance: { tipos: ['actividad'], expectativas: ['alcanzada'] } }]);
    expect(x.resultado.metricas.runtimeChanges).toBe(0);
    expect(x.escritos.every(f => ['application-model.json', 'AFI-AGENT-MANIFEST.json'].includes(f) || f.startsWith('review/'))).toBe(true);
  });

  test('22. blindaje: sin conocimiento de HU concreta en runtime ni en tests (el almacén declarativo queda fuera)', async () => {
    const prohibido = /HU\s*1\d|14\.8|\bSAP\b|CP0\d|\bP\d{2}\b|correo|Cundinamarca|Ch[ií]a|\d{5,}/i;
    for (const f of ['sensibilidad.ts', 'intakeLote.ts', 'intakeDisco.ts', 'propuestas.ts']) {
      expect(await readFile(resolve(__dirname, '../data/afi/aplicacion', f), 'utf8'), f).not.toMatch(prohibido);
    }
    expect(await readFile(resolve(RAIZ, 'tools/afi-conocimiento.mjs'), 'utf8')).not.toMatch(prohibido);
    expect(await readFile(resolve(__dirname, 'afi-conocimiento.spec.ts'), 'utf8')).not.toMatch(prohibido);
  });
});

// =====================================================================================
/**
 * INVARIANTES PERMANENTES del conocimiento real (post primer knowledge review). Sustituyen a los temporales del estado
 * inicial (revision 1, entidades vacías, review vacío). El conocimiento real en knowledge/ (almacén y lotes) está
 * PERMITIDO y no es contaminación del framework: se exige que sea válido, sin PII según la validación contextual real,
 * trazable a decisiones humanas y publicado en el manifest. Estos tests solo LEEN: no deciden ni escriben nada.
 */
const DIR_KNOWLEDGE = resolve(__dirname, '../knowledge');
const DIR_REVIEW = join(DIR_KNOWLEDGE, 'review');
const leerReal = <T>(ruta: string): T => JSON.parse(readFileSync(ruta, 'utf8').replace(/^﻿/, ''));
const almacenReal = () => leerReal<AlmacenModeloAplicacion>(join(DIR_KNOWLEDGE, 'application-model.json'));
const archivosReview = (sufijo: string) => (existsSync(DIR_REVIEW) ? readdirSync(DIR_REVIEW).filter(f => f.endsWith(sufijo)).sort() : []);
const lotesReales = () => archivosReview('.review.json').map(archivo => ({ archivo, artefacto: leerReal<ArtefactoRevision>(join(DIR_REVIEW, archivo)) }));
/** Mismos identificadores criptográficos que excluye la barrera de PII de intakeLote: un sha256 o un id de lote no son PII. */
const sinCriptograficos = (v: unknown) => JSON.stringify(v, (k, x) => (['hash', 'hashAlmacenBase', 'hashEntrada', 'batchId', 'lote'].includes(k) ? undefined : x));
const TIPO_DE_COLECCION: Record<keyof AlmacenModeloAplicacion['entidades'], TipoEntidad> = {
  pantallas: 'pantalla-ui', campos: 'campo-ui', actividades: 'actividad', rutas: 'ruta', integraciones: 'integracion', variables: 'variable', notificaciones: 'notificacion', transiciones: 'transicion-ui',
};
const COLECCION_DE_TIPO = Object.fromEntries(Object.entries(TIPO_DE_COLECCION).map(([c, t]) => [t, c])) as Record<TipoEntidad, keyof AlmacenModeloAplicacion['entidades']>;
const entidadesReales = (a: AlmacenModeloAplicacion) =>
  (Object.keys(TIPO_DE_COLECCION) as (keyof AlmacenModeloAplicacion['entidades'])[]).flatMap(c => (a.entidades[c] ?? []).map(e => ({ tipo: TIPO_DE_COLECCION[c], datos: e as unknown as Record<string, unknown> & { id: string } })));
const HEX64 = /^[0-9a-f]{64}$/;
const BATCH_ID = /^kr-[0-9a-f]{16}$/;

test.describe('4O+ almacén real: invariantes permanentes', () => {
  test('1/2. el Application Model persistido cumple su schema, revision >= 1, y es exactamente el que carga el runtime', () => {
    const a = almacenReal();
    expect(() => validarAlmacenModelo(a)).not.toThrow();
    expect(Object.keys(a).sort()).toEqual(['entidades', 'historial', 'revision', 'schemaVersion']);
    // `transiciones` es opcional (compatibilidad): un almacén sin la colección equivale a ninguna transición.
    expect(Object.keys(a.entidades).sort()).toEqual(Object.keys(TIPO_DE_COLECCION).filter(k => k !== 'transiciones' || 'transiciones' in a.entidades).sort());
    expect(Number.isInteger(a.revision) && a.revision >= 1).toBe(true);
    expect(ALMACEN_APLICACION_AFI).toEqual(a);
    expect(() => modeloDe(a)).not.toThrow();
  });

  test('3. toda entidad almacenada es válida y atómica (la misma validación que al aprobarla, salvo YA_REGISTRADA)', () => {
    const a = almacenReal();
    const m = modeloDe(a);
    for (const { tipo, datos } of entidadesReales(a)) {
      expect(datos, `${tipo}:${datos.id}`).not.toHaveProperty('tipo');
      const problemas = validarPropuesta(prop('kp-almacen', { tipo, ...datos }), m).filter(p => p.motivo !== 'YA_REGISTRADA');
      expect(problemas, `${tipo}:${datos.id}`).toEqual([]);
    }
  });

  test('4. sin PII según la validación contextual real (hashes, ids de lote y metadatos documentales permitidos)', () => {
    expect(() => validarAlmacenModelo(almacenReal())).not.toThrow();
    for (const f of archivosReview('.json')) expect(piiEnMetadato(sinCriptograficos(leerReal(join(DIR_REVIEW, f)))), f).toBe(false);
  });

  test('5. historial íntegro: una entrada de CREACIÓN por entidad (+ enriquecimientos completar revisados), revisiones contiguas y auditoría bien formada', () => {
    const a = almacenReal();
    const almacenadas = entidadesReales(a).map(e => claveEntidad(e.tipo, e.datos.id));
    // La operación de cada entrada sale de su propuesta revisada en el artefacto del lote (fuente de verdad del historial).
    const operacion = (h: (typeof a.historial)[number]) => lotesReales().find(l => l.artefacto.batchId === h.lote)?.artefacto.propuestas.find(x => x.proposalId === h.propuesta)?.propuesta.operacion;
    const completar = a.historial.filter(h => operacion(h) === 'completar');
    const auditadas = a.historial.filter(h => !completar.includes(h)).map(h => claveEntidad(h.tipo, h.entidad));
    // Un completar enriquece una entidad que ya tiene su entrada de creación en una revisión anterior.
    for (const h of completar) expect(a.historial.some(c => !completar.includes(c) && c.tipo === h.tipo && c.entidad === h.entidad && c.revision < h.revision), `${h.tipo}:${h.entidad}`).toBe(true);
    expect(new Set(auditadas).size).toBe(auditadas.length);
    expect([...auditadas].sort()).toEqual([...almacenadas].sort());
    // Cada revisión > 1 nace de al menos una aprobación: el conjunto de revisiones auditadas es 2..revision, en orden.
    expect([...new Set(a.historial.map(h => h.revision))]).toEqual(Array.from({ length: a.revision - 1 }, (_, i) => i + 2));
    for (const h of a.historial) {
      const id = `${h.tipo}:${h.entidad}`;
      expect(Object.keys(h).every(k => ['revision', 'fecha', 'entidad', 'tipo', 'propuesta', 'hash', 'revisor', 'lote'].includes(k)), id).toBe(true);
      expect(TIPOS_ENTIDAD, id).toContain(h.tipo);
      expect(h.fecha, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(h.hash, id).toMatch(HEX64);
      expect(h.revisor, id).toMatch(REVISOR_VALIDO);
      expect(h.propuesta, id).toMatch(ID_PROPUESTA);
      expect(h.lote, id).toMatch(BATCH_ID);
    }
    // Un lote se aplica en UNA revisión.
    for (const lote of new Set(a.historial.map(h => h.lote))) expect(new Set(a.historial.filter(h => h.lote === lote).map(h => h.revision)).size, lote).toBe(1);
  });

  test('6. ningún review batch modifica por sí solo el Application Model', () => {
    const a = almacenReal();
    const antes = hashAlmacen(a);
    const lotes = lotesReales();
    // Todo lo almacenado procede de un lote revisado con decisión humana APPROVED registrada por la CLI, sin alterar.
    for (const h of a.historial) {
      const id = `${h.tipo}:${h.entidad}`;
      const lote = lotes.find(l => l.artefacto.batchId === h.lote);
      expect(lote, `${id}: su lote no tiene artefacto de revisión`).toBeDefined();
      const revisada = lote!.artefacto.propuestas.find(x => x.proposalId === h.propuesta);
      expect(revisada?.hash, id).toBe(h.hash);
      const { tipo, ...datos } = revisada!.propuesta.entidad;
      // Un completar aporta un subconjunto de atributos de la entidad almacenada (su creación aporta el resto).
      if (revisada!.propuesta.operacion === 'completar') expect(a.entidades[COLECCION_DE_TIPO[tipo]], id).toContainEqual(expect.objectContaining(datos));
      else expect(a.entidades[COLECCION_DE_TIPO[tipo]], id).toContainEqual(datos);
      const archivoResultado = join(DIR_REVIEW, `${h.lote}.resultado.json`);
      expect(existsSync(archivoResultado), `${id}: aplicado sin registro de resultado`).toBe(true);
      const resultado = leerReal<{ revisionDespues: number; decisiones: { proposalId: string; decision: string; hash: string; revisor: string }[] }>(archivoResultado);
      expect(resultado.revisionDespues, id).toBe(h.revision);
      expect(resultado.decisiones, id).toContainEqual(expect.objectContaining({ proposalId: h.propuesta, decision: 'APPROVED', hash: h.hash, revisor: h.revisor }));
    }
    // Un lote sin decisiones (su plantilla vacía) nunca cambia el almacén: o no cambia nada, o ya está aplicado, o es viejo.
    for (const { archivo, artefacto } of lotes) {
      let despues = a;
      try {
        const r = aplicarDecisiones(artefacto, plantillaDecisiones(artefacto), a, FECHA);
        expect(['SIN_CAMBIOS', 'YA_APLICADO'], archivo).toContain(r.estado);
        despues = r.almacen;
      } catch (e) {
        expect(e instanceof IntakeError ? e.codigo : String(e), archivo).toBe('REVISION_CONFLICTO');
      }
      expect(hashAlmacen(despues), archivo).toBe(antes);
    }
    expect(hashAlmacen(almacenReal())).toBe(antes);
  });

  test('7. los review batches cumplen su schema y no contienen decisiones embebidas', () => {
    const a = almacenReal();
    const CLAVES = ['schemaVersion', 'batchId', 'revisionBase', 'hashAlmacenBase', 'hashEntrada', 'nota', 'propuestas', 'rechazadas', 'posiblesDuplicados', 'solicitudesClasificacion', 'resumen'];
    const lotes = lotesReales();
    for (const { archivo, artefacto: x } of lotes) {
      expect(Object.keys(x).sort(), archivo).toEqual([...CLAVES].sort());
      expect(x.schemaVersion, archivo).toBe(ESQUEMA_REVISION);
      expect(x.batchId, archivo).toMatch(BATCH_ID);
      expect(archivo).toBe(`${x.batchId}.review.json`);
      expect([x.hashAlmacenBase, x.hashEntrada].every(h => HEX64.test(h)), archivo).toBe(true);
      expect(Number.isInteger(x.revisionBase) && x.revisionBase >= 1 && x.revisionBase <= a.revision, archivo).toBe(true);
      expect(x.resumen, archivo).toMatchObject({
        revisionBase: x.revisionBase, runtimeChanges: 0, unicas: x.propuestas.length, clasificacionesPendientes: x.solicitudesClasificacion.length,
      });
      for (const p of x.propuestas) {
        expect(p.proposalId, archivo).toBe(p.propuesta.proposalId);
        expect(p.hash, p.proposalId).toBe(hashPropuesta(p.propuesta));
        expect(p.entidad, p.proposalId).toBe(claveEntidad(p.propuesta.entidad.tipo, p.propuesta.entidad.id));
        expect([p.propuesta.estado, p.propuesta.revisiones], p.proposalId).toEqual(['PENDING_REVIEW', []]);
      }
      for (const s of x.solicitudesClasificacion) {
        expect(s.hash, s.solicitudId).toBe(hashSolicitud(s.solicitud));
        expect(s.solicitud.estado, s.solicitudId).toBe('NEEDS_CLASSIFICATION');
      }
      // Sin decisiones embebidas: ninguna clave de decisión humana en ningún nivel del artefacto.
      expect(JSON.stringify(x), archivo).not.toMatch(/"(decision|decisiones|revisor|clasificaciones|noEsDuplicadoDe)"\s*:/);
      // Mientras siga vigente contra el almacén, supera la verificación de integridad del runtime.
      if (x.revisionBase === a.revision && x.hashAlmacenBase === hashAlmacen(a)) expect(() => validarArtefactoRevision(x, modeloDe(a)), archivo).not.toThrow();
    }
    // Las decisiones viven SOLO en su archivo separado, ligado a su lote. Aquí no se evalúa ni se completa ninguna.
    const porLote = new Map(lotes.map(l => [l.artefacto.batchId, l.artefacto]));
    for (const f of archivosReview('.decisiones.json')) {
      const d = leerReal<ArchivoDecisiones>(join(DIR_REVIEW, f));
      const art = porLote.get(d.batchId);
      expect(art, `${f}: sin artefacto de revisión`).toBeDefined();
      expect(f).toBe(`${d.batchId}.decisiones.json`);
      expect([d.schemaVersion, d.revisionBase], f).toEqual([ESQUEMA_DECISIONES, art!.revisionBase]);
      for (const x of d.decisiones) {
        expect(art!.propuestas.map(p => p.proposalId), f).toContain(x.proposalId);
        expect([null, ...DECISIONES_HUMANAS], `${f} ${x.proposalId}`).toContain(x.decision);
      }
      for (const c of d.clasificaciones) expect(art!.solicitudesClasificacion.map(s => s.solicitudId), f).toContain(c.solicitudId);
    }
    for (const f of archivosReview('.resultado.json')) expect(porLote.has(f.slice(0, -'.resultado.json'.length)), f).toBe(true);
    // En knowledge/review solo hay artefactos de la CLI: ni temporales ni candados.
    const ajenos = existsSync(DIR_REVIEW) ? readdirSync(DIR_REVIEW).filter(f => !/^kr-[0-9a-f]{16}\.(review|decisiones|resultado)\.json$/.test(f)) : [];
    expect(ajenos).toEqual([]);
  });

  test('8. el manifest publicado está sincronizado con las entidades APPROVED aplicadas al almacén', () => {
    const a = almacenReal();
    const m = modeloDe(a);
    const texto = readFileSync(resolve(__dirname, '../data/afi/AFI-AGENT-MANIFEST.json'), 'utf8').replace(/\r\n/g, '\n');
    expect(texto).toBe(serializarAgentManifest(m));
    const publicado = JSON.parse(texto).testabilidad.modelo;
    expect(publicado).toEqual(JSON.parse(JSON.stringify(publicarModelo(m))));
    // Lo declarado en el almacén (y solo eso, junto a la UI de 4J) está publicado.
    expect(publicado.actividades).toEqual(a.entidades.actividades.map(x => x.id));
    expect(publicado.rutas).toEqual(a.entidades.rutas.map(x => x.id));
    expect(publicado.integraciones).toEqual(a.entidades.integraciones.map(x => x.id));
    expect(publicado.variables).toEqual(a.entidades.variables.map(x => ({ id: x.id, superficies: [...x.superficies] })));
    expect(publicado.notificaciones).toEqual(a.entidades.notificaciones.map(x => x.id));
    for (const x of a.entidades.pantallas) expect(publicado.pantallas).toContain(x.id);
    for (const x of a.entidades.campos) expect(publicado.campos).toContain(x.id);
  });
});
