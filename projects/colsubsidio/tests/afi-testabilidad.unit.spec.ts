import { test, expect } from '@playwright/test';
import { PROTOCOLO_DECISION, TESTABILIDAD, construirAgentManifest, serializarAgentManifest } from '../data/afi/agentManifest';
import { mensajeParaQa, validarSalidaAgente, type SalidaAgente } from '../data/afi/aplicacion/conversacion';
import { deduplicarGaps, diagnosticarCondicion, idSemanticoGap } from '../data/afi/aplicacion/gaps';
import { MODELO_APLICACION_AFI, construirModeloAplicacion, publicarModelo, superficiesEfectivas } from '../data/afi/aplicacion/modeloAplicacion';
import { observarCondicion } from '../data/afi/aplicacion/observacion';
import { ProveedorMemoria } from '../data/afi/aplicacion/proveedoresMemoria';
import { PROVEEDORES_PRODUCTIVOS, TIPOS_ENTIDAD, type CondicionObservable } from '../data/afi/aplicacion/superficies';

/**
 * Fase 4M: superficies efectivas autoritativas, gaps multi-superficie y publicación de testabilidad al agente.
 * Entidades y proveedores SINTÉTICOS (en memoria); ningún proveedor productivo.
 */

const MODELO = construirModeloAplicacion({
  actividades: [{ id: 'actividad-a', descripcion: 'Actividad sintética' }],
  integraciones: [{ id: 'integracion-x', descripcion: 'Integración sintética' }],
  variables: [
    { id: 'variable-solo-integracion', descripcion: 'Dato sintético', ambito: { tipo: 'integracion', integracion: 'integracion-x' }, superficies: ['integracion'] },
    { id: 'variable-ambas', descripcion: 'Dato sintético', ambito: { tipo: 'proceso' }, superficies: ['proceso-bpm', 'integracion'] },
  ],
});
const CTX = { caso: 'caso-sintetico', ejecucion: 'ejecucion-1' };
const VARIABLES = { 'variable-solo-integracion': null, 'variable-ambas': null };
// Ambos proveedores dicen soportar TODAS las variables: la autoridad es el modelo, no supports().
const proceso = new ProveedorMemoria('bpm-memoria', 'proceso-bpm', ['actividad', 'variable'], { variables: VARIABLES, presentes: { actividad: ['actividad-a'] } });
const integracion = new ProveedorMemoria('integracion-memoria', 'integracion', ['variable'], { variables: VARIABLES });
const variableNula = (id: string): CondicionObservable => ({ id: 'c', entidad: { tipo: 'variable', id }, expectativa: { tipo: 'valor', igual: null } });

// =====================================================================================
test.describe('4M A/B. superficies efectivas autoritativas', () => {
  test('resolver único: variable = exactamente sus superficies; otros tipos = las de su tipo; no registrada u otro tipo = ninguna', () => {
    expect(superficiesEfectivas(MODELO, { tipo: 'variable', id: 'variable-solo-integracion' })).toEqual(['integracion']);
    expect(superficiesEfectivas(MODELO, { tipo: 'variable', id: 'variable-ambas' })).toEqual(['proceso-bpm', 'integracion']);
    expect(superficiesEfectivas(MODELO, { tipo: 'actividad', id: 'actividad-a' })).toEqual(['proceso-bpm']);
    expect(superficiesEfectivas(MODELO, { tipo: 'pantalla-ui', id: 'informacion-contacto' })).toEqual(['portal-ui']);
    expect(superficiesEfectivas(MODELO, { tipo: 'variable', id: 'no-registrada' })).toEqual([]);
    expect(superficiesEfectivas(MODELO, { tipo: 'pantalla-ui', id: 'variable-ambas' })).toEqual([]);
  });

  test('1. variable declarada solo en integracion: aunque proceso-bpm diga supports=true, solo se usa integracion', async () => {
    const c = variableNula('variable-solo-integracion');
    expect(proceso.supports(c.entidad) && integracion.supports(c.entidad)).toBe(true);
    const r = await observarCondicion(c, MODELO, [proceso, integracion], CTX);
    expect([r.resultado, r.superficie, r.proveedor]).toEqual(['PASS', 'integracion', 'integracion-memoria']);
    // Con solo el proveedor de proceso, NO se observa (fail-closed), y el diagnóstico coincide.
    const sinIntegracion = await observarCondicion(c, MODELO, [proceso], CTX);
    expect(sinIntegracion).toMatchObject({ resultado: 'NO_OBSERVABLE', gap: { clase: 'provider-superficie', superficiesCandidatas: ['integracion'] } });
    expect(diagnosticarCondicion(c, MODELO, [proceso])).toMatchObject({ estado: 'TESTABILITY_GAP', gap: { superficiesCandidatas: ['integracion'] } });
  });

  test('2/3. la preferencia ordena solo superficies efectivas; una no declarada se ignora (fail-closed)', async () => {
    const ambas = variableNula('variable-ambas');
    expect((await observarCondicion(ambas, MODELO, [proceso, integracion], CTX, ['integracion'])).superficie).toBe('integracion');
    expect((await observarCondicion(ambas, MODELO, [proceso, integracion], CTX, ['proceso-bpm'])).superficie).toBe('proceso-bpm');
    const solo = variableNula('variable-solo-integracion');
    // Preferir proceso-bpm no la introduce: sigue siendo integracion.
    expect((await observarCondicion(solo, MODELO, [proceso, integracion], CTX, ['proceso-bpm', 'notificacion'])).superficie).toBe('integracion');
  });
});

// =====================================================================================
test.describe('4M C/E. precedencia del diagnóstico y gaps multi-superficie', () => {
  test('4. sin proveedor: TESTABILITY_GAP conserva TODAS las superficies candidatas; id determinista', async () => {
    const c = variableNula('variable-ambas');
    expect(diagnosticarCondicion(c, MODELO, [])).toEqual({
      estado: 'TESTABILITY_GAP', entidad: c.entidad,
      gap: { clase: 'provider-superficie', superficiesCandidatas: ['proceso-bpm', 'integracion'], capacidad: 'observar variable' },
    });
    expect((await observarCondicion(c, MODELO, [], CTX)).gap).toEqual({ clase: 'provider-superficie', superficiesCandidatas: ['proceso-bpm', 'integracion'], capacidad: 'observar variable' });
    const a = idSemanticoGap({ clase: 'provider-superficie', superficiesCandidatas: ['proceso-bpm', 'integracion'], capacidad: 'observar variable' });
    const b = idSemanticoGap({ clase: 'provider-superficie', superficiesCandidatas: ['integracion', 'proceso-bpm'], capacidad: 'Observar  variable' });
    expect(a).toBe('provider-superficie:integracion+proceso-bpm:observar-variable');
    expect(b).toBe(a);
    const gaps = deduplicarGaps([
      { clase: 'provider-superficie', superficiesCandidatas: ['proceso-bpm', 'integracion'], capacidad: 'observar variable', ocurrencia: { hu: 'hu-a', caso: 'c1' } },
      { clase: 'provider-superficie', superficiesCandidatas: ['integracion', 'proceso-bpm'], capacidad: 'observar variable', ocurrencia: { hu: 'hu-a', caso: 'c2' } },
      { clase: 'provider-superficie', superficiesCandidatas: ['integracion'], capacidad: 'observar variable', ocurrencia: { hu: 'hu-a', caso: 'c3' } },
    ]);
    expect(gaps.map(g => [g.idSemantico, g.superficiesCandidatas, g.ocurrencias.length])).toEqual([
      ['provider-superficie:integracion:observar-variable', ['integracion'], 1],
      ['provider-superficie:integracion+proceso-bpm:observar-variable', ['integracion', 'proceso-bpm'], 2],
    ]);
  });

  test('5. entidad clara no registrada: KNOWLEDGE_GAP (no TESTABILITY_GAP), aunque no haya proveedores', () => {
    for (const tipo of ['actividad', 'ruta', 'variable'] as const) {
      const expectativa = tipo === 'variable' ? { tipo: 'valor' as const, igual: null } : tipo === 'ruta' ? { tipo: 'tomada' as const } : { tipo: 'alcanzada' as const };
      expect(diagnosticarCondicion({ id: 'c', entidad: { tipo, id: `${tipo}-nueva` }, expectativa }, MODELO, []), tipo)
        .toEqual({ estado: 'KNOWLEDGE_GAP', entidad: { tipo, id: `${tipo}-nueva` }, gap: { clase: 'conocimiento-declarativo', capacidad: `registrar ${tipo}` } });
    }
  });

  test('6. falta la expectativa: INFORMACION_INSUFICIENTE antes de cualquier análisis de modelo o proveedor', () => {
    // Entidad no registrada y sin proveedores: igual gana la falta de definición.
    expect(diagnosticarCondicion({ id: 'c', entidad: { tipo: 'actividad', id: 'desconocida' } }, MODELO, [])).toEqual({ estado: 'INFORMACION_INSUFICIENTE', falta: 'expectativa' });
    expect(diagnosticarCondicion({ id: 'c', expectativa: { tipo: 'alcanzada' } }, MODELO, [])).toEqual({ estado: 'INFORMACION_INSUFICIENTE', falta: 'entidad' });
  });

  test('7. hay proveedor pero falta una interacción u orquestación: CAPABILITY_GAP; con todo, REPRESENTABLE', () => {
    const c: CondicionObservable = { id: 'c', entidad: { tipo: 'actividad', id: 'actividad-a' }, expectativa: { tipo: 'alcanzada' } };
    expect(diagnosticarCondicion(c, MODELO, [proceso], [{ clase: 'operacion-interaccion', descripcion: 'enviar el formulario desde otra pantalla', soportada: false }]))
      .toEqual({ estado: 'CAPABILITY_GAP', gap: { clase: 'operacion-interaccion', capacidad: 'enviar el formulario desde otra pantalla' } });
    expect(diagnosticarCondicion(c, MODELO, [proceso], [{ clase: 'orquestacion', descripcion: 'paso condicional', soportada: false }]))
      .toMatchObject({ estado: 'CAPABILITY_GAP', gap: { clase: 'orquestacion' } });
    expect(diagnosticarCondicion(c, MODELO, [proceso], [{ clase: 'operacion-interaccion', descripcion: 'x', soportada: true }]))
      .toEqual({ estado: 'REPRESENTABLE', superficie: 'proceso-bpm', proveedor: 'bpm-memoria' });
    // Sin proveedor, la observabilidad se reporta primero (TESTABILITY_GAP precede a CAPABILITY_GAP).
    expect(diagnosticarCondicion(c, MODELO, [], [{ clase: 'orquestacion', descripcion: 'x', soportada: false }]).estado).toBe('TESTABILITY_GAP');
  });
});

// =====================================================================================
test.describe('4M D. publicación de testabilidad en el manifest', () => {
  const manifest = construirAgentManifest();

  test('8. taxonomía, expectativas y superficies desde la fuente canónica; SOLO proveedores productivos y con cobertura exacta', () => {
    expect(manifest.testabilidad).toBe(TESTABILIDAD);
    expect(JSON.parse(serializarAgentManifest()).testabilidad).toEqual(JSON.parse(JSON.stringify(TESTABILIDAD)));
    expect(TESTABILIDAD.entidades.map(e => e.tipo)).toEqual([...TIPOS_ENTIDAD]);
    expect(TESTABILIDAD.entidades.find(e => e.tipo === 'variable')!.superficies).toEqual(['proceso-bpm', 'integracion']);
    expect(TESTABILIDAD.expectativasPorEntidad.ruta).toEqual(['tomada', 'no-tomada']);
    // 4R: exactamente un proveedor productivo, en proceso-bpm, que cubre SOLO actividad.alcanzada (superficie parcial).
    expect(PROVEEDORES_PRODUCTIVOS).toEqual([{ id: 'tareas-pendientes-bizagi', superficie: 'proceso-bpm', alcance: { tipos: ['actividad'], expectativas: ['alcanzada'] } }]);
    expect(TESTABILIDAD.superficies.map(s => [s.superficie, s.estado, s.proveedores])).toEqual([
      ['portal-ui', 'solo-mecanismo-previo', []], ['proceso-bpm', 'parcial', ['tareas-pendientes-bizagi']], ['integracion', 'sin-proveedor', []], ['notificacion', 'sin-proveedor', []],
    ]);
    expect(TESTABILIDAD.superficies.find(s => s.superficie === 'proceso-bpm')!.cobertura)
      .toEqual([{ proveedor: 'tareas-pendientes-bizagi', observaciones: [{ entidad: 'actividad', expectativas: ['alcanzada'] }] }]);
    expect(TESTABILIDAD.superficies.filter(s => s.superficie !== 'proceso-bpm').every(s => !('cobertura' in s))).toBe(true);
    // Modelo publicado: UI proyectada de 4J + lo APROBADO del almacén declarativo (conocimiento real permitido).
    expect(TESTABILIDAD.modelo).toEqual(publicarModelo(MODELO_APLICACION_AFI));
    expect(JSON.stringify(TESTABILIDAD)).not.toMatch(/memoria|sintetic/i); // proveedores/entidades de prueba nunca se publican
    // El contenido PROPIO del framework no lleva conocimiento de HU; la proyección del almacén queda fuera del escaneo.
    const { modelo: _modelo, ...framework } = TESTABILIDAD;
    expect(JSON.stringify(framework)).not.toMatch(/HU\s*1\d|14\.8|\bSAP\b|CP0\d|\bP\d{2}\b|correo|Cundinamarca|Ch[ií]a|\d{5,}/i);
  });

  test('precedencia y pasos del protocolo = diagnóstico publicado; formatos de KNOWLEDGE_GAP y TESTABILITY_GAP', () => {
    expect(PROTOCOLO_DECISION.precedencia).toBe(TESTABILIDAD.diagnostico.precedencia);
    expect(PROTOCOLO_DECISION.pasos.map(p => p.no)).toEqual([...TESTABILIDAD.diagnostico.precedencia]);
    expect(PROTOCOLO_DECISION.salidas.KNOWLEDGE_GAP.formato).toEqual(['KNOWLEDGE_GAP', '', '- paso:', '- entidad:', '- tipo:', '- conocimiento declarativo faltante:']);
    expect(PROTOCOLO_DECISION.salidas.TESTABILITY_GAP.formato)
      .toEqual(['TESTABILITY_GAP', '', '- paso:', '- requisito:', '- entidad:', '- superficies candidatas:', '- observación faltante:']);
    const reglas = PROTOCOLO_DECISION.reglas.join('\n');
    expect(reglas).toMatch(/Modo intake\/benchmark[\s\S]*MEZCLA[\s\S]*KNOWLEDGE_GAP[\s\S]*TESTABILITY_GAP/);
    expect(reglas).toMatch(/nunca se formulan como preguntas para QA/);
    expect(reglas).toMatch(/no se emite JSON \(tampoco parcial\)/);
    expect(TESTABILIDAD.diagnostico.reglas.join('\n')).toMatch(/Frontera portal-ui[\s\S]*CAPABILITY_GAP \(compatibilidad\)/);
  });
});

// =====================================================================================
test.describe('4M F/G. salidas del agente: formatos y audiencias', () => {
  test('9. KNOWLEDGE_GAP y TESTABILITY_GAP válidos, para su audiencia y nunca como preguntas para QA', () => {
    const conocimiento: SalidaAgente = {
      resultado: 'KNOWLEDGE_GAP', audiencia: 'modelo-aplicacion',
      entidades: [{ paso: 'p1', entidad: 'actividad-nueva', tipo: 'actividad', conocimientoFaltante: 'declarar la actividad y sus rutas de entrada' }],
    };
    expect(validarSalidaAgente(conocimiento)).toEqual([]);
    expect(mensajeParaQa(conocimiento)).toBeUndefined();
    expect(validarSalidaAgente({ ...conocimiento, entidades: [{ ...conocimiento.entidades[0], conocimientoFaltante: 'implementar un provider nuevo' }] }))
      .toContain('actividad-nueva: un gap de conocimiento no pide implementación');
    expect(validarSalidaAgente({ ...conocimiento, audiencia: 'analista-qa' } as unknown as SalidaAgente))
      .toContain('un gap de conocimiento se dirige a quien mantiene el Application Model');
    const testabilidad: SalidaAgente = {
      resultado: 'TESTABILITY_GAP', audiencia: 'automatizacion',
      gaps: deduplicarGaps([{ clase: 'provider-superficie', superficiesCandidatas: ['proceso-bpm', 'integracion'], capacidad: 'observar variable', ocurrencia: { hu: 'hu-a', caso: 'c1', paso: 'p2' } }]),
    };
    expect(validarSalidaAgente(testabilidad)).toEqual([]);
    expect(mensajeParaQa(testabilidad)).toBeUndefined();
  });
});
