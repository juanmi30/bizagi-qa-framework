import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TESTABILIDAD } from '../data/afi/agentManifest';
import { diagnosticarCondicion, type DiagnosticoCondicion } from '../data/afi/aplicacion/gaps';
import {
  ALMACEN_APLICACION_AFI, MODELO_APLICACION_AFI, ModeloAplicacionError, construirModeloAplicacion, extensionDesdeAlmacen, publicarModelo, validarAlmacenModelo,
  type AlmacenModeloAplicacion,
} from '../data/afi/aplicacion/modeloAplicacion';
import {
  ESQUEMA_PROPUESTA, PropuestaError, aplicarPropuestasAprobadas, claveNormalizada, corregirPropuesta, deduplicarPropuestas, hashPropuesta, medirIntake,
  propuestaDesdeKnowledgeGap, recibirPropuestasDelAgente, resolverClasificacion, revisarPropuesta, validarPropuesta, validarSolicitudClasificacion,
  type EntidadPropuesta, type KnowledgeProposal, type SolicitudClasificacion,
} from '../data/afi/aplicacion/propuestas';
import type { ReglaConPredicado } from '../data/afi/aplicacion/reglasCondicionales';
import { PROVEEDORES_PRODUCTIVOS, publicarSuperficies, type CondicionObservable } from '../data/afi/aplicacion/superficies';

/**
 * Fase 4N: intake de conocimiento declarativo. Propuestas, revisión y aplicación con entidades SINTÉTICAS;
 * el almacén real del proyecto no se modifica.
 */

/** Almacén vacío SINTÉTICO (independiente del conocimiento real del proyecto). */
const vacio = (): AlmacenModeloAplicacion => ({
  schemaVersion: 'afi-application-model/v1', revision: 1,
  entidades: { pantallas: [], campos: [], actividades: [], rutas: [], integraciones: [], variables: [], notificaciones: [] },
  historial: [],
});
/** Almacén de partida sintético: dos actividades y una integración (para referencias de rutas y variables). */
const BASE: AlmacenModeloAplicacion = {
  ...vacio(),
  entidades: {
    ...vacio().entidades,
    actividades: [{ id: 'actividad-a', descripcion: 'Actividad sintética A' }, { id: 'actividad-b', descripcion: 'Actividad sintética B' }],
    integraciones: [{ id: 'integracion-x', descripcion: 'Integración sintética' }],
  },
};
const MODELO_BASE = construirModeloAplicacion(extensionDesdeAlmacen(BASE));
const FECHA = '2026-09-30';
const REVISOR = { revisor: 'rol-analista-conocimiento', fecha: FECHA };

let n = 0;
function propuesta(entidad: EntidadPropuesta | Record<string, unknown>, extra: Partial<KnowledgeProposal> = {}): KnowledgeProposal {
  return {
    schemaVersion: ESQUEMA_PROPUESTA, proposalId: `prop-${++n}`, entidad: entidad as EntidadPropuesta,
    origen: { fuente: 'diseño sintético §2', ocurrencias: [{ hu: 'hu-sintetica', caso: 'caso-1', paso: 'p1' }] },
    evidenciaSemantica: 'El diseño nombra esta entidad de forma inequívoca.', estado: 'PENDING_REVIEW', revisiones: [], ...extra,
  };
}
const motivos = (p: unknown, m = MODELO_BASE) => validarPropuesta(p, m).map(x => x.motivo);
const aprobar = (p: KnowledgeProposal, m = MODELO_BASE) => revisarPropuesta(p, 'APPROVED', REVISOR, m);

const VALIDAS: EntidadPropuesta[] = [
  { tipo: 'pantalla-ui', id: 'pantalla-sintetica', descripcion: 'Pantalla sintética de bloqueo', senales: ['encabezado de bloqueo'] },
  { tipo: 'campo-ui', id: 'campoSintetico', descripcion: 'Campo sintético', pantalla: 'informacion-contacto', control: 'text' },
  { tipo: 'actividad', id: 'actividad-nueva', descripcion: 'Actividad sintética nueva' },
  { tipo: 'ruta', id: 'ruta-a-b', descripcion: 'Ruta sintética', desde: 'actividad-a', hacia: 'actividad-b' },
  { tipo: 'integracion', id: 'integracion-nueva', descripcion: 'Integración sintética nueva' },
  { tipo: 'variable', id: 'variable-x', descripcion: 'Dato sintético', superficies: ['integracion'], ambito: { tipo: 'integracion', integracion: 'integracion-x' } },
  { tipo: 'notificacion', id: 'notificacion-nueva', descripcion: 'Aviso sintético', canal: 'canal-externo' },
];

// =====================================================================================
test.describe('4N 1-5. contrato y validación fail-closed', () => {
  test('1. propuesta válida de cada uno de los 7 tipos (datos propios del tipo; lo ausente queda pendiente)', () => {
    for (const e of VALIDAS) expect(motivos(propuesta(e)), e.tipo).toEqual([]);
    // Ruta sin extremos determinados: válida, pendiente de enriquecimiento (no se inventan).
    expect(motivos(propuesta({ tipo: 'ruta', id: 'ruta-pendiente', descripcion: 'Ruta sin extremos conocidos' }))).toEqual([]);
    expect(motivos(propuesta({ tipo: 'pantalla-ui', id: 'pantalla-sin-firmas', descripcion: 'Sin señales todavía' }))).toEqual([]);
  });

  test('2. tipo compuesto o varias entidades: NO_ATOMICA', () => {
    expect(motivos(propuesta({ tipo: 'pantalla-ui / actividad', id: 'x-y', descripcion: 'x' }))).toEqual(['NO_ATOMICA']);
    expect(motivos(propuesta({ tipo: ['pantalla-ui', 'actividad'], id: 'x-y', descripcion: 'x' }))).toEqual(['NO_ATOMICA']);
    expect(motivos({ ...propuesta(VALIDAS[2]), entidad: [VALIDAS[2], VALIDAS[4]] })).toEqual(['NO_ATOMICA']);
    expect(motivos(propuesta({ tipo: 'integracion, variable', id: 'x-y', descripcion: 'x' }))).toEqual(['NO_ATOMICA']);
  });

  test('3. sin fuente, sin ocurrencias o sin evidencia: rechazada', () => {
    expect(motivos(propuesta(VALIDAS[2], { origen: { fuente: '', ocurrencias: [{ hu: 'hu-sintetica' }] } }))).toEqual(['SIN_FUENTE']);
    expect(motivos(propuesta(VALIDAS[2], { origen: { fuente: 'f', ocurrencias: [] } }))).toEqual(['SIN_OCURRENCIAS']);
    expect(motivos(propuesta(VALIDAS[2], { evidenciaSemantica: ' ' }))).toEqual(['SIN_EVIDENCIA']);
  });

  test('4/5. PII, selectores, código, proveedores e instrucciones ejecutables: rechazados', () => {
    const con = (descripcion: string) => motivos(propuesta({ tipo: 'actividad', id: 'actividad-z', descripcion }));
    expect(con('Titular con documento 1234567890')).toEqual(['PII']);
    expect(con('Avisar a persona@example.test')).toEqual(['PII']);
    expect(con('Se ve en #btn-continuar')).toEqual(['SELECTOR']);
    expect(con('Control [formcontrolname=x]')).toContain('SELECTOR');
    expect(con('Calcular con () => true')).toEqual(['CODIGO']);
    expect(con('Hay que implementar un provider nuevo')).toEqual(['PROVEEDOR']);
    expect(con('Ejecutar npm run algo')).toEqual(['INSTRUCCION']);
    expect(con('Ver https://servidor/interno')).toEqual(['INSTRUCCION']);
    // Estructura propia del tipo: nada ajeno, nada requerido ausente, referencias registradas.
    expect(motivos(propuesta({ tipo: 'ruta', id: 'ruta-q', descripcion: 'x', superficies: ['proceso-bpm'] }))).toEqual(['ESTRUCTURA']);
    expect(motivos(propuesta({ tipo: 'variable', id: 'variable-q', descripcion: 'x' }))).toContain('ESTRUCTURA');
    expect(motivos(propuesta({ tipo: 'ruta', id: 'ruta-q', descripcion: 'x', desde: 'actividad-inexistente' }))).toEqual(['REFERENCIA_DESCONOCIDA']);
    expect(motivos(propuesta({ tipo: 'actividad', id: 'Actividad Mal', descripcion: 'x' }))).toEqual(['ID_INVALIDO']);
  });
});

// =====================================================================================
test.describe('4N 4/9. deduplicación y clasificación', () => {
  test('6. duplicado exacto se deduplica (una propuesta, ocurrencias unidas)', () => {
    const a = propuesta(VALIDAS[2]);
    const b = propuesta(VALIDAS[2], { origen: { fuente: 'diseño sintético §2', ocurrencias: [{ hu: 'hu-sintetica', caso: 'caso-2', paso: 'p3' }] } });
    const r = deduplicarPropuestas([a, b, propuesta(VALIDAS[2])]);
    expect(r.unicas).toHaveLength(1);
    expect(r.unicas[0].origen.ocurrencias.map(o => o.caso)).toEqual(['caso-1', 'caso-2']);
    expect(r.posiblesDuplicados).toEqual([]);
  });

  test('7. posible duplicado ambiguo NO se fusiona solo: POSSIBLE_DUPLICATE para decisión humana', () => {
    expect(['camino Continua', 'ruta-continua', 'Continua', 'rutaContinua'].map(claveNormalizada)).toEqual(['continua', 'continua', 'continua', 'continua']);
    const ruta = propuesta({ tipo: 'ruta', id: 'ruta-continua', descripcion: 'Ruta sintética' });
    const camino = propuesta({ tipo: 'ruta', id: 'camino-continua', descripcion: 'Ruta sintética' });
    const actividad = propuesta({ tipo: 'actividad', id: 'continua', descripcion: 'Actividad sintética' });
    const otraRuta = propuesta({ tipo: 'ruta', id: 'ruta-continua', descripcion: 'Otra descripción' });
    const r = deduplicarPropuestas([ruta, camino, actividad, otraRuta]);
    expect(r.unicas).toHaveLength(4);
    expect(r.posiblesDuplicados.map(d => [d.propuestas, d.motivo])).toEqual([
      [[ruta.proposalId, camino.proposalId], 'nombre-similar'],
      [[ruta.proposalId, actividad.proposalId], 'tipo-distinto'],
      [[camino.proposalId, actividad.proposalId], 'tipo-distinto'],
      [[ruta.proposalId, otraRuta.proposalId], 'datos-distintos'],
      [[camino.proposalId, otraRuta.proposalId], 'nombre-similar'],
      [[actividad.proposalId, otraRuta.proposalId], 'tipo-distinto'],
    ]);
  });

  test('9. tipo ambiguo: solicitud de clasificación; el humano resuelve a UN tipo de las alternativas', () => {
    const s: SolicitudClasificacion = {
      schemaVersion: ESQUEMA_PROPUESTA, solicitudId: 'sol-1', id: 'bloqueo-sintetico', descripcion: 'Estado de bloqueo sintético',
      alternativas: ['pantalla-ui', 'actividad'], origen: { fuente: 'diseño sintético §3', ocurrencias: [{ hu: 'hu-sintetica' }] },
      evidenciaSemantica: 'El diseño no permite distinguir si es una pantalla o una actividad.', estado: 'NEEDS_CLASSIFICATION',
    };
    expect(validarSolicitudClasificacion(s)).toEqual([]);
    expect(validarSolicitudClasificacion({ ...s, alternativas: ['actividad'] }).map(x => x.detalle)).toContain('al menos dos alternativas distintas');
    expect(() => resolverClasificacion(s, 'ruta', {}, 'prop-c')).toThrow('no es una de las alternativas');
    const p = resolverClasificacion(s, 'actividad', {}, 'prop-c');
    expect([p.entidad.tipo, p.estado, motivos(p)]).toEqual(['actividad', 'PENDING_REVIEW', []]);
  });
});

// =====================================================================================
test.describe('4N 5/6/8-12. revisión y aplicación declarativa', () => {
  test('8/9. PENDING y REJECTED no modifican el almacén ni el modelo', () => {
    const pendiente = propuesta(VALIDAS[2]);
    const rechazada = revisarPropuesta(propuesta(VALIDAS[4]), 'REJECTED', { ...REVISOR, comentario: 'no aplica' }, MODELO_BASE);
    const r = aplicarPropuestasAprobadas(BASE, [pendiente, rechazada], FECHA);
    expect(r.almacen).toBe(BASE);
    expect(r.aplicadas).toEqual([]);
    expect(r.ignoradas).toEqual([{ proposalId: pendiente.proposalId, estado: 'PENDING_REVIEW' }, { proposalId: rechazada.proposalId, estado: 'REJECTED' }]);
    expect(publicarModelo(r.modelo)).toEqual(publicarModelo(MODELO_BASE));
  });

  test('10/12. APPROVED añade la entidad con auditoría; es declarativo y no crea proveedores', () => {
    const p = aprobar(propuesta(VALIDAS[5]));
    expect(p.revisiones).toEqual([{ decision: 'APPROVED', revisor: 'rol-analista-conocimiento', fecha: FECHA, version: 1, hash: hashPropuesta(p) }]);
    const r = aplicarPropuestasAprobadas(BASE, [p], FECHA);
    expect(r.almacen.revision).toBe(BASE.revision + 1);
    expect(r.almacen.entidades.variables).toEqual([{ id: 'variable-x', descripcion: 'Dato sintético', superficies: ['integracion'], ambito: { tipo: 'integracion', integracion: 'integracion-x' } }]);
    expect(r.almacen.historial).toEqual([{ revision: 2, fecha: FECHA, entidad: 'variable-x', tipo: 'variable', propuesta: p.proposalId, hash: hashPropuesta(p), revisor: 'rol-analista-conocimiento' }]);
    expect(publicarModelo(r.modelo).variables).toEqual([{ id: 'variable-x', superficies: ['integracion'] }]);
    expect(r.cambio).toEqual({ declarativo: true, runtime: false });
    // Base intacta (no se muta) y aplicar conocimiento no añade proveedores: solo el productivo validado (4R), con su alcance.
    expect(BASE.entidades.variables).toEqual([]);
    expect(PROVEEDORES_PRODUCTIVOS).toEqual([{ id: 'tareas-pendientes-bizagi', superficie: 'proceso-bpm', alcance: { tipos: ['actividad'], expectativas: ['alcanzada'] } }]);
    expect(publicarSuperficies().flatMap(s => s.proveedores)).toEqual(['tareas-pendientes-bizagi']);
    // La variable aprobada (integracion) no gana cobertura: ese proveedor no observa variables ni esa superficie.
    expect(publicarSuperficies().find(s => s.superficie === 'integracion')!.estado).toBe('sin-proveedor');
  });

  test('las 7 entidades aprobadas en un lote quedan en el modelo', () => {
    const r = aplicarPropuestasAprobadas(BASE, VALIDAS.map(e => aprobar(propuesta(e))), FECHA);
    expect(publicarModelo(r.modelo)).toMatchObject({
      actividades: ['actividad-a', 'actividad-b', 'actividad-nueva'], rutas: ['ruta-a-b'], integraciones: ['integracion-x', 'integracion-nueva'],
      notificaciones: ['notificacion-nueva'],
    });
    expect(r.modelo.ui.pantallas).toContain('pantalla-sintetica');
    expect(r.modelo.ui.campos).toContain('campoSintetico');
  });

  test('11. conflicto de tipo con una entidad existente falla; el lote nunca se aplica a medias', () => {
    expect(motivos(propuesta({ tipo: 'pantalla-ui', id: 'actividad-a', descripcion: 'x' }))).toEqual(['CONFLICTO_TIPO']);
    expect(motivos(propuesta({ tipo: 'actividad', id: 'actividad-a', descripcion: 'x' }))).toEqual(['YA_REGISTRADA']);
    expect(() => aprobar(propuesta({ tipo: 'pantalla-ui', id: 'actividad-a', descripcion: 'x' }))).toThrow(PropuestaError);
    // Dos aprobadas compatibles por separado pero en conflicto entre sí: el lote falla completo.
    const a = aprobar(propuesta({ tipo: 'actividad', id: 'entidad-z', descripcion: 'x' }));
    const b = aprobar(propuesta({ tipo: 'variable', id: 'entidad-z', descripcion: 'x', superficies: ['proceso-bpm'] }));
    expect(() => aplicarPropuestasAprobadas(BASE, [a, b], FECHA)).toThrow('conflicto al aplicar');
    expect(BASE.entidades.actividades).toHaveLength(2);
    // El contenido aprobado no puede cambiar después.
    const alterada = { ...a, entidad: { ...a.entidad, descripcion: 'cambiada' } } as KnowledgeProposal;
    expect(() => aplicarPropuestasAprobadas(BASE, [alterada], FECHA)).toThrow('el contenido cambió después de aprobarse');
  });

  test('revisión: NEEDS_CHANGES -> corrección -> PENDING_REVIEW; solo se revisa lo pendiente', () => {
    const p = revisarPropuesta(propuesta(VALIDAS[2]), 'NEEDS_CHANGES', { ...REVISOR, comentario: 'precisar la descripción' }, MODELO_BASE);
    expect(p.estado).toBe('NEEDS_CHANGES');
    expect(() => revisarPropuesta(p, 'APPROVED', REVISOR, MODELO_BASE)).toThrow('solo se revisa una propuesta PENDING_REVIEW');
    const corregida = corregirPropuesta(p, { evidenciaSemantica: 'Descripción precisada por el diseño.' }, MODELO_BASE);
    expect(corregida.estado).toBe('PENDING_REVIEW');
    expect(aprobar(corregida).revisiones.map(r => [r.decision, r.version])).toEqual([['NEEDS_CHANGES', 1], ['APPROVED', 2]]);
  });
});

// =====================================================================================
test.describe('4N 7/10/14. re-diagnóstico: el gap avanza de capa sin runtime', () => {
  const condicion: CondicionObservable = { id: 'x-nula', entidad: { tipo: 'variable', id: 'variable-x' }, expectativa: { tipo: 'valor', igual: null } };

  test('13. KNOWLEDGE_GAP -> propuesta PENDING (sigue KNOWLEDGE_GAP) -> APPROVED -> TESTABILITY_GAP; métricas', () => {
    const pasadas: DiagnosticoCondicion['estado'][] = [];
    const d1 = diagnosticarCondicion(condicion, MODELO_BASE, PROVEEDORES_PRODUCTIVOS as never);
    pasadas.push(d1.estado);
    expect(d1.estado).toBe('KNOWLEDGE_GAP');
    const p = propuestaDesdeKnowledgeGap(d1, { descripcion: 'Dato sintético', superficies: ['integracion', 'proceso-bpm'] } as never, {
      proposalId: 'prop-x', fuente: 'requerimiento sintético §4', ocurrencia: { hu: 'hu-sintetica', caso: 'caso-1', paso: 'p2', condicion: 'x-nula' },
      evidenciaSemantica: 'El requerimiento define el dato X y su valor esperado.',
    });
    expect([p.estado, p.entidad]).toEqual(['PENDING_REVIEW', { descripcion: 'Dato sintético', superficies: ['integracion', 'proceso-bpm'], tipo: 'variable', id: 'variable-x' }]);
    // Sin aprobar: el modelo no cambia y la condición sigue en KNOWLEDGE_GAP.
    const sinAprobar = aplicarPropuestasAprobadas(BASE, [p], FECHA);
    pasadas.push(diagnosticarCondicion(condicion, sinAprobar.modelo, []).estado);
    expect(pasadas.at(-1)).toBe('KNOWLEDGE_GAP');
    // Aprobada: el modelo contiene X y la condición avanza a la siguiente capa (sin proveedor productivo).
    const aprobada = aprobar(p);
    const r = aplicarPropuestasAprobadas(BASE, [aprobada], FECHA);
    const d2 = diagnosticarCondicion(condicion, r.modelo, []);
    pasadas.push(d2.estado);
    expect(d2).toEqual({
      estado: 'TESTABILITY_GAP', entidad: condicion.entidad,
      gap: { clase: 'provider-superficie', superficiesCandidatas: ['proceso-bpm', 'integracion'], capacidad: 'observar variable' },
    });
    expect(medirIntake({
      knowledgeGapsDetectados: 1, propuestasGeneradas: [p], dedup: deduplicarPropuestas([aprobada]), almacenAntes: BASE, almacenDespues: r.almacen, pasadas,
    })).toEqual({
      knowledgeGapsDetectados: 1, propuestasGeneradas: 1, propuestasUnicas: 1, aprobadas: 1, rechazadas: 0, pendientes: 0,
      posiblesDuplicados: 0, entidadesAnadidas: 1, cambiosRuntime: 0, generacionesHastaSiguienteCapa: 3,
    });
  });

  test('14. la misma variable con expectativas distintas (null y "Activo") es UNA entidad', () => {
    const otra: CondicionObservable = { id: 'x-activa', entidad: { tipo: 'variable', id: 'variable-x' }, expectativa: { tipo: 'valor', igual: 'Activo' } };
    const desde = (c: CondicionObservable, caso: string) => propuestaDesdeKnowledgeGap(diagnosticarCondicion(c, MODELO_BASE, []),
      { descripcion: 'Dato sintético', superficies: ['integracion'] } as never,
      { proposalId: `prop-${caso}`, fuente: 'requerimiento sintético §4', ocurrencia: { hu: 'hu-sintetica', caso, condicion: c.id }, evidenciaSemantica: 'Dato X definido.' });
    const r = deduplicarPropuestas([desde(condicion, 'caso-1'), desde(otra, 'caso-2')]);
    expect(r.unicas).toHaveLength(1);
    expect(r.unicas[0].origen.ocurrencias.map(o => o.condicion)).toEqual(['x-nula', 'x-activa']);
    expect(JSON.stringify(r.unicas[0].entidad)).not.toMatch(/Activo|null/); // la expectativa no vive en la entidad
    expect(motivos(propuesta({ tipo: 'variable', id: 'variable-y', descripcion: 'x', superficies: ['integracion'], valor: 'Activo' }))).toContain('NO_ES_ENTIDAD');
  });
});

// =====================================================================================
test.describe('4N 8/11/13/16. agente, reglas, manifest y persistencia', () => {
  test('8. el agente solo PROPONE: entra PENDING_REVIEW; auto-aprobaciones y basura se rechazan', () => {
    const buena = propuesta(VALIDAS[2]);
    const autoaprobada = { ...propuesta(VALIDAS[4]), estado: 'APPROVED', revisiones: [{ decision: 'APPROVED', revisor: 'agente', fecha: FECHA, version: 1, hash: 'x' }] };
    const r = recibirPropuestasDelAgente({ knowledgeProposals: [buena, autoaprobada, 'texto libre'] }, MODELO_BASE);
    expect(r.aceptadas.map(p => p.proposalId)).toEqual([buena.proposalId]);
    expect(r.rechazadas.map(x => [x.indice, x.problemas.map(p => p.motivo)])).toEqual([[1, ['ESTADO_INVALIDO']], [2, ['ESQUEMA']]]);
  });

  test('15. las reglas con predicado NO se convierten en entidades', () => {
    const regla: ReglaConPredicado = {
      id: 'regla-sintetica', fuente: 'requerimiento sintético §1', predicado: { todos: [{ hecho: 'h', igual: true }] },
      consecuencias: [{ id: 'c', entidad: { tipo: 'variable', id: 'variable-x' }, expectativa: { tipo: 'valor', igual: null } }],
    };
    const r = recibirPropuestasDelAgente({ knowledgeProposals: [regla] }, MODELO_BASE);
    expect(r.aceptadas).toEqual([]);
    expect(r.rechazadas[0].problemas.map(p => p.motivo)).toContain('NO_ES_ENTIDAD');
  });

  test('16. el manifest publica solo el modelo aprobado; PENDING y REJECTED nunca', () => {
    expect(TESTABILIDAD.modelo).toEqual(publicarModelo(MODELO_APLICACION_AFI));
    const aprobada = aprobar(propuesta({ tipo: 'notificacion', id: 'aviso-aprobado', descripcion: 'x' }));
    const pendiente = propuesta({ tipo: 'notificacion', id: 'aviso-pendiente', descripcion: 'x' });
    const rechazada = revisarPropuesta(propuesta({ tipo: 'notificacion', id: 'aviso-rechazado', descripcion: 'x' }), 'REJECTED', REVISOR, MODELO_BASE);
    const r = aplicarPropuestasAprobadas(BASE, [aprobada, pendiente, rechazada], FECHA);
    expect(publicarModelo(r.modelo).notificaciones).toEqual(['aviso-aprobado']);
  });

  test('12. persistencia: almacén versionado válido (revision >= 1); PII rechazada; el modelo canónico se construye desde él', async () => {
    const persistido = JSON.parse(await readFile(resolve(__dirname, '../knowledge/application-model.json'), 'utf8'));
    expect(validarAlmacenModelo(persistido)).toMatchObject({ schemaVersion: 'afi-application-model/v1' });
    expect(Number.isInteger(persistido.revision) && persistido.revision >= 1).toBe(true);
    expect(persistido).toEqual(ALMACEN_APLICACION_AFI);
    expect(() => validarAlmacenModelo({ ...vacio(), entidades: { ...vacio().entidades, actividades: [{ id: 'a-b', descripcion: 'tel 3001234567' }] } })).toThrow(ModeloAplicacionError);
    expect(publicarModelo(MODELO_APLICACION_AFI)).toEqual(publicarModelo(construirModeloAplicacion(extensionDesdeAlmacen(persistido))));
  });
});

test('17/18. blindaje: cero HU, casos, sistemas o canales concretos en runtime; el almacén real solo se exige sin PII', async () => {
  const prohibido = /HU\s*1\d|14\.8|\bSAP\b|CP0\d|\bP\d{2}\b|correo|Cundinamarca|Ch[ií]a|\d{5,}/i;
  for (const f of ['propuestas.ts', 'modeloAplicacion.ts']) expect(await readFile(resolve(__dirname, '../data/afi/aplicacion', f), 'utf8'), f).not.toMatch(prohibido);
  // El conocimiento real del almacén declarativo está permitido (no es contaminación del framework): solo la
  // validación contextual de PII real (hashes e ids de lote excluidos) se le aplica.
  const persistido = JSON.parse(await readFile(resolve(__dirname, '../knowledge/application-model.json'), 'utf8'));
  expect(() => validarAlmacenModelo(persistido)).not.toThrow();
});
