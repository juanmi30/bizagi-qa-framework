import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { actorDesdeEntorno } from '../data/afi/actores';
import { AGENT_INTAKE, TEST_DATA, construirAgentManifest, serializarAgentManifest } from '../data/afi/agentManifest';
import { leerSalidaAgente, type RutasConocimiento } from '../data/afi/aplicacion/intakeDisco';
import { prepararLoteRevision } from '../data/afi/aplicacion/intakeLote';
import { compilarCasoAfi, validarDefinicionCasoAfi } from '../data/afi/caso';
import { DEFINICIONES_CP04 } from '../data/afi/casos/hu14-12-cp04';
import {
  CAMPOS_PEDIBLES, ESQUEMA_REGISTRO_DATOS, ESQUEMA_REQUISITO_DATOS, clasificarCampo, fuentePorDefecto, secretRefsDeSlot, sensibilidadCampo,
  validarCamposRequeridos, validarRequisito, validarSlot,
  type CondicionActor,
} from '../data/afi/datosPrueba/contrato';
import { aplicarDatosEnDisco, leerRegistro, prepararDatosEnDisco, provisionEnDisco, type RutasDatos } from '../data/afi/datosPrueba/disco';
import { GATE_EVIDENCIA_PII, evidenciaClienteSegura, exigirGateEvidenciaPii } from '../data/afi/datosPrueba/gateEvidencia';
import { hashPropuestaSlot, recibirRequisitosDelAgente, type ArchivoDecisionesDatos, type DecisionSlot, type LoteDatosPrueba } from '../data/afi/datosPrueba/intake';
import {
  REGISTRO_DATOS_PRUEBA_AFI, actorParaCaso, diagnosticarSlot, plantillaEnvDatosPrueba, textoEstadoDatos, textoRequeridosDatos, type RegistroDatosPrueba,
} from '../data/afi/datosPrueba/registro';
import { ESQUEMA_ENVELOPE_INTAKE, extraerEnvelope, salidaConocimiento, salidaDatosPrueba, tieneConocimiento, tieneDatosPrueba } from '../data/afi/intakeAgente';
import { prepararIntakeUnificado } from '../data/afi/intakeUnificado';
import { CAMPOS_AFI, DataGapError } from '../data/afi/modelo';
import { resolverCampo } from '../data/afi/resolver';

/**
 * Fase 4Q: envelope único, sensibilidad vs resolución, intake operativo de datos (preparar / revisar / aplicar),
 * provisión auditada y gate de evidencia PII. Todo SINTÉTICO en un directorio temporal: el knowledge real no se toca.
 */

const RAIZ = resolve(__dirname, '../../..');
const FECHA = '2026-10-01';
const X: CondicionActor = { id: 'condicion-x', descripcion: 'Actor que cumple la condición sintética X en un sistema externo' };
const Y: CondicionActor = { id: 'condicion-y', descripcion: 'Actor que cumple la condición sintética Y en un sistema externo' };
const SECRETOS = { idX: '1000004821', idY: '1000007356', correo: 'buzon.sintetico@example.test' };
const FUGA = /1000004821|1000007356|4821|7356|buzon\.sintetico|example\.test|1023456789/;
const REF_X = 'AFI_ACTOR_PENSIONADO_CONDICION_X_NUMERO_IDENTIFICACION';
const REF_X_CORREO = 'AFI_ACTOR_PENSIONADO_CONDICION_X_CORREO';
const REF_Y = 'AFI_ACTOR_PENSIONADO_CONDICION_Y_NUMERO_IDENTIFICACION';
const REF_Y_CORREO = 'AFI_ACTOR_PENSIONADO_CONDICION_Y_CORREO';

const req = (id: string, condiciones: CondicionActor[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: ESQUEMA_REQUISITO_DATOS, id, perfil: 'pensionado', condiciones, camposRequeridos: ['numeroIdentificacion', 'correo'],
  ocurrencias: [{ hu: 'hu-sintetica', caso: id.replace(/^req-/, 'caso-') }], reutilizable: true, ...extra,
});
const kp = (id: string) => ({
  schemaVersion: 'afi-knowledge-proposal/v1', proposalId: id, entidad: { tipo: 'actividad', id: `actividad-${id}`, descripcion: 'Actividad sintética' },
  origen: { fuente: 'diseño sintético', ocurrencias: [{ hu: 'hu-sintetica', caso: 'caso-1' }] }, evidenciaSemantica: 'El diseño nombra la actividad.',
  estado: 'PENDING_REVIEW', revisiones: [],
});
const envelope = (o: Partial<Record<'knowledgeProposals' | 'classificationRequests' | 'testDataRequirements', unknown[]>> = {}) => ({
  schemaVersion: ESQUEMA_ENVELOPE_INTAKE, knowledgeProposals: [], classificationRequests: [], testDataRequirements: [], ...o,
});
const bloque = (v: unknown) => `\`\`\`json\n${JSON.stringify(v)}\n\`\`\``;
const vacio = (): RegistroDatosPrueba => ({ schemaVersion: ESQUEMA_REGISTRO_DATOS, revision: 1, slots: [], compartidos: [], historial: [] });
const codigo = (f: () => unknown) => { try { f(); return 'OK'; } catch (e) { return (e as { codigo?: string }).codigo ?? (e as Error).name; } };

// ---------- Disco temporal sintético ----------
const TMP = mkdtempSync(join(tmpdir(), 'afi-4q-'));
test.afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function entorno() {
  mkdirSync(TMP, { recursive: true }); // con fullyParallel, un afterAll previo del mismo worker puede haberlo borrado
  const dir = mkdtempSync(join(TMP, 'e-'));
  mkdirSync(join(dir, 'knowledge'), { recursive: true });
  const rutasD: RutasDatos = { raiz: dir, registro: join(dir, 'knowledge/test-data-registry.json'), revisiones: join(dir, 'knowledge/test-data-review'), manifest: join(dir, 'AFI-AGENT-MANIFEST.json') };
  const rutasK: RutasConocimiento = { raiz: dir, almacen: join(dir, 'knowledge/application-model.json'), revisiones: join(dir, 'knowledge/review'), manifest: join(dir, 'AFI-AGENT-MANIFEST.json') };
  writeFileSync(rutasD.registro, `${JSON.stringify(vacio(), null, 2)}\n`);
  writeFileSync(rutasK.almacen, JSON.stringify({
    schemaVersion: 'afi-application-model/v1', revision: 1, historial: [],
    entidades: { pantallas: [], campos: [], actividades: [], rutas: [], integraciones: [], variables: [], notificaciones: [] },
  }));
  const escribir = (nombre: string, v: unknown) => { const r = join(dir, nombre); writeFileSync(r, typeof v === 'string' ? v : JSON.stringify(v, null, 2)); return r; };
  const leer = <T = unknown>(rel: string): T => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
  const texto = (rel: string) => readFileSync(join(dir, rel), 'utf8');
  return { dir, rutasD, rutasK, escribir, leer, texto, registroTexto: () => readFileSync(rutasD.registro, 'utf8') };
}

/** Rellena el archivo de decisiones preparado (como lo haría el analista) y devuelve su ruta. */
function decidir(e: ReturnType<typeof entorno>, rel: string, d: Record<string, Partial<DecisionSlot>> | ((x: DecisionSlot) => Partial<DecisionSlot>), extra: Partial<ArchivoDecisionesDatos> = {}) {
  const p = e.leer<ArchivoDecisionesDatos>(rel);
  const f = typeof d === 'function' ? d : (x: DecisionSlot) => d[x.proposalId] ?? {};
  return e.escribir(`${rel}.decidido.json`, { ...p, ...extra, decisiones: p.decisiones.map(x => ({ ...x, ...f(x) })) });
}
const aprobar = (x: DecisionSlot): Partial<DecisionSlot> => ({ decision: 'APPROVED', revisor: 'rol-datos-qa' });

/** preparar + aprobar todo (secretos propios) + aplicar sobre el almacén sintético. */
function sliceAplicado() {
  const e = entorno();
  const r = prepararDatosEnDisco(e.rutasD, e.escribir('salida.md', `Análisis\n\n${bloque(envelope({ testDataRequirements: [req('req-a', [X]), req('req-b', [Y]), req('req-c', [X])] }))}\n`));
  const ap = aplicarDatosEnDisco(e.rutasD, join(e.dir, r.archivoRevision), decidir(e, r.archivoDecisiones, aprobar), FECHA, false);
  return { e, r, ap };
}

// =====================================================================================
test.describe('4Q A. envelope único afi-agent-intake/v1', () => {
  test('1. envelope canónico con las tres listas (siempre presentes); forma estricta', () => {
    const l = extraerEnvelope(JSON.stringify(envelope()));
    expect([l.formato, l.envelope]).toEqual(['canonico', envelope()]);
    for (const malo of [{ ...envelope(), testDataRequirements: undefined }, { ...envelope(), extra: [] }, { ...envelope(), knowledgeProposals: {} }]) {
      expect(codigo(() => extraerEnvelope(JSON.stringify(malo)))).toBe('EnvelopeIntakeError');
    }
  });

  test('2/3/4. conocimiento y datos coexisten en el MISMO envelope sin mezclar modelos; solo conocimiento; solo datos', () => {
    const ambos = extraerEnvelope(`KNOWLEDGE_GAP\n\n- paso: p1\n\n${bloque(envelope({ knowledgeProposals: [kp('kp-1')], testDataRequirements: [req('req-a', [X])] }))}\n`);
    expect(salidaConocimiento(ambos)).toEqual({ knowledgeProposals: [kp('kp-1')], classificationRequests: [] });
    expect(salidaDatosPrueba(ambos)).toEqual({ testDataRequirements: [req('req-a', [X])] });
    expect([tieneConocimiento(ambos), tieneDatosPrueba(ambos)]).toEqual([true, true]);
    const k = extraerEnvelope(JSON.stringify(envelope({ knowledgeProposals: [kp('kp-1')] })));
    expect([tieneConocimiento(k), tieneDatosPrueba(k)]).toEqual([true, false]);
    const d = extraerEnvelope(JSON.stringify(envelope({ testDataRequirements: [req('req-a', [X])] })));
    expect([tieneConocimiento(d), tieneDatosPrueba(d)]).toEqual([false, true]);
    // Cada dimensión la valida su propio receptor: 4O acepta su parte, 4P la suya.
    const almacen = { schemaVersion: 'afi-application-model/v1' as const, revision: 1, historial: [], entidades: { pantallas: [], campos: [], actividades: [], rutas: [], integraciones: [], variables: [], notificaciones: [] } };
    expect(prepararLoteRevision(salidaConocimiento(ambos), almacen).propuestas).toHaveLength(1);
    expect(recibirRequisitosDelAgente(salidaDatosPrueba(ambos), vacio()).propuestas).toHaveLength(1);
  });

  test('5. el parser rechaza dos envelopes, envelope + otro bloque de intake y versiones desconocidas; el legado sigue aceptado', () => {
    expect(codigo(() => extraerEnvelope(`${bloque(envelope())}\n${bloque(envelope())}`))).toBe('EnvelopeIntakeError');
    expect(codigo(() => extraerEnvelope(`${bloque(envelope())}\n${bloque({ knowledgeProposals: [] })}`))).toBe('EnvelopeIntakeError');
    expect(codigo(() => extraerEnvelope(JSON.stringify({ ...envelope(), schemaVersion: 'afi-agent-intake/v2' })))).toBe('EnvelopeIntakeError');
    expect(codigo(() => extraerEnvelope('sin bloques'))).toBe('EnvelopeIntakeError');
    // Compatibilidad temporal 4O/4P: el objeto de conocimiento se entrega TAL CUAL (mismo batchId de 4O).
    const legado4o = { knowledgeProposals: [kp('kp-1')] };
    const l = extraerEnvelope(`${bloque(legado4o)}\n${bloque({ testDataRequirements: [req('req-a', [X])] })}`);
    expect([l.formato, salidaConocimiento(l), l.envelope.testDataRequirements.length]).toEqual(['legado', legado4o, 1]);
    // El mensaje nunca cita el contenido.
    try { extraerEnvelope(`${bloque({ ...envelope(), testDataRequirements: [{ id: '1023456789' }] })}${bloque(envelope())}`); } catch (e) { expect((e as Error).message).not.toMatch(FUGA); }
  });

  test('el parser de 4O (leerSalidaAgente) lee el envelope y entrega SOLO conocimiento', () => {
    const e = entorno();
    const ruta = e.escribir('salida.md', `texto\n${bloque(envelope({ knowledgeProposals: [kp('kp-1')], testDataRequirements: [req('req-a', [X])] }))}`);
    expect(leerSalidaAgente(ruta)).toEqual({ knowledgeProposals: [kp('kp-1')], classificationRequests: [] });
    expect(codigo(() => leerSalidaAgente(e.escribir('doble.md', `${bloque(envelope())}${bloque(envelope())}`)))).toBe('ENTRADA_INVALIDA');
  });

  test('manifest e instrucciones publican UN solo envelope canónico', async () => {
    expect(construirAgentManifest().agentIntake).toBe(AGENT_INTAKE);
    expect(AGENT_INTAKE.claves).toEqual(['knowledgeProposals', 'classificationRequests', 'testDataRequirements']);
    expect(AGENT_INTAKE.reglas.join('\n')).toMatch(/EXACTAMENTE UN bloque/);
    expect(TEST_DATA.salida.formato).toMatch(/envelope ÚNICO/);
    const manifest = JSON.parse(await readFile(resolve(__dirname, '../data/afi/AFI-AGENT-MANIFEST.json'), 'utf8'));
    expect(manifest.agentIntake).toEqual(JSON.parse(JSON.stringify(AGENT_INTAKE)));
    expect(manifest.knowledgeIntake.salida.formato).toMatch(/envelope ÚNICO/);
    const md = await readFile(resolve(__dirname, '../data/afi/AFI-AGENT-INSTRUCTIONS.md'), 'utf8');
    expect(md).toContain('"schemaVersion": "afi-agent-intake/v1"');
    expect(md).toMatch(/EXACTAMENTE UN bloque de código `json` al final/);
    expect(md).not.toMatch(/bloque `json` SEPARADO/);
  });
});

// =====================================================================================
test.describe('4Q B/C. sensibilidad vs resolución; campos pedibles', () => {
  test('6. un campo pii con resolución auxiliar segura NO genera secreto (nunca: tampoco por una condición)', () => {
    for (const c of ['tipoAfiliado', 'fondoPensiones', 'nacionalidad', 'estadoCivil'] as const) {
      expect([c, sensibilidadCampo(c), clasificarCampo(c)]).toEqual([c, 'pii', 'AUXILIARY']);
      expect(CAMPOS_PEDIBLES).not.toContain(c);
    }
    expect(TEST_DATA.camposPedibles).toEqual(['numeroIdentificacion', 'correo', 'razonSocial', 'codigoCiiu', 'actividadEconomicaEmpresa', 'fechaInicioActividad', 'valorNomina', 'numeroTrabajadores', 'afiliadoPrimeraVez', 'cajaCompensacionAnterior', 'numeroCelular', 'numeroTelefonoFijo', 'actividad', 'ingresoMensual', 'salarioBasico']);
    expect(TEST_DATA.campos.autoResolubles.campos).toEqual(expect.arrayContaining(['tipoAfiliado', 'fondoPensiones', 'confirmacionCorreo', 'autorizaDatos']));
    expect(TEST_DATA.campos.condicionables.campos).toEqual(expect.arrayContaining(['tipoAfiliado', 'numeroIdentificacion']));
    expect(validarRequisito(req('req-m', [X], { camposRequeridos: ['numeroIdentificacion', 'tipoAfiliado'] })).map(p => p.motivo)).toEqual(['CAMPO_NO_PEDIBLE']);
  });

  test('7. derived nunca se pide ni es condicionable', () => {
    expect(clasificarCampo('confirmacionCorreo')).toBe('DERIVED');
    expect(validarRequisito(req('r', [X], { camposRequeridos: ['confirmacionCorreo'] })).map(p => p.motivo)).toEqual(['CAMPO_NO_PEDIBLE']);
    expect([...TEST_DATA.camposPedibles, ...TEST_DATA.campos.condicionables.campos]).not.toContain('confirmacionCorreo');
  });

  test('8. un campo que el caso CERTIFICA nunca se resuelve con una opción arbitraria (auxiliary)', () => {
    expect(clasificarCampo('departamento')).toBe('AUXILIARY');
    expect(clasificarCampo('departamento', { asertado: true })).toBe('PUBLIC_CASE');
    // Certificado por el caso: pertenece al CASO (contrato funcional), nunca un secreto de datos de prueba.
    expect(clasificarCampo('tipoAfiliado', { asertado: true })).toBe('PUBLIC_CASE');
    // El resolver vigente lo garantiza: sin valor explícito del caso -> DataGap, nunca first-valid.
    expect(() => resolverCampo('departamento', { aserciones: ['departamento'] })).toThrow(DataGapError);
    expect(resolverCampo('departamento', {}).origen).toBe('auxiliary');
  });
});

// =====================================================================================
test.describe('4Q D/E/F/G. datos preparar / revisar / aplicar', () => {
  test('9/10. preparar no modifica el registro; el lote es determinista y no pisa decisiones ya editadas', () => {
    const e = entorno();
    const antes = e.registroTexto();
    const entrada = e.escribir('salida.json', envelope({ testDataRequirements: [req('req-a', [X]), req('req-b', [Y]), req('req-c', [X])] }));
    const r1 = prepararDatosEnDisco(e.rutasD, entrada);
    expect(e.registroTexto()).toBe(antes);
    expect(readdirSync(e.rutasD.revisiones).sort()).toEqual([`${r1.lote.batchId}.decisiones.json`, `${r1.lote.batchId}.review.json`, `${r1.lote.batchId}.review.md`]);
    const [rev, md] = [e.texto(r1.archivoRevision), e.texto(r1.archivoMd)];
    writeFileSync(join(e.dir, r1.archivoDecisiones), JSON.stringify({ editado: true }));
    const r2 = prepararDatosEnDisco(e.rutasD, entrada);
    expect([r2.lote.batchId, e.texto(r2.archivoRevision), e.texto(r2.archivoMd), r2.plantillaNueva]).toEqual([r1.lote.batchId, rev, md, false]);
    expect(e.leer(r2.archivoDecisiones)).toEqual({ editado: true });
  });

  test('11. review.md para el analista: secciones claras, sin valores, sin PII y sin nombres de variables antes de aprobar', () => {
    const e = entorno();
    const r = prepararDatosEnDisco(e.rutasD, e.escribir('s.json', envelope({
      testDataRequirements: [req('req-a', [X]), req('req-ab', [X, Y]), req('req-pii', [{ id: 'titular', descripcion: 'titular 1023456789' }])],
    })), 'colsubsidio');
    const md = e.texto(r.archivoMd);
    for (const s of ['## ACTOR PROPUESTO: pensionado-condicion-x', 'Perfil:', 'Debe cumplir:', 'Lo necesitan:', 'Campos necesarios:', 'Qué resolverá automáticamente el framework',
      'Qué será secreto', 'Posibles reutilizaciones', 'Estado propuesto:', '## REQUISITOS RECHAZADOS', 'datos aplicar']) expect(md, s).toContain(s);
    expect(md).toContain('  • Confirmación del correo (se deriva de Correo electrónico)');
    expect(md).toContain('  • Tipo de afiliado (preparación automática segura)');
    expect(md).toContain('  • Correo electrónico — compartible con otros actores SOLO si usted lo decide');
    expect(md).toMatch(/propuesta ps-pensionado-condicion-x-condicion-y: sus condiciones se contienen o se parecen/);
    expect(md).not.toMatch(FUGA);
    expect(md).not.toMatch(/AFI_[A-Z]/);
    for (const f of [r.archivoRevision, r.archivoDecisiones]) expect(e.texto(f)).not.toMatch(FUGA);
  });

  test('12. aplicar --dry-run: valida todo y no escribe nada', () => {
    const e = entorno();
    const r = prepararDatosEnDisco(e.rutasD, e.escribir('s.json', envelope({ testDataRequirements: [req('req-a', [X])] })));
    const antes = e.registroTexto();
    const x = aplicarDatosEnDisco(e.rutasD, join(e.dir, r.archivoRevision), decidir(e, r.archivoDecisiones, aprobar), FECHA, true);
    expect([x.resultado.estado, x.resultado.revisionDespues, x.escritos, x.dryRun]).toEqual(['APLICABLE', 2, [], true]);
    expect(e.registroTexto()).toBe(antes);
    expect(existsSync(e.rutasD.manifest!)).toBe(false);
    expect(readdirSync(e.rutasD.revisiones).filter(f => f.endsWith('.resultado.json'))).toEqual([]);
  });

  test('13. aplicar real: registro con revisión nueva e historial; manifest testData regenerado; resultado auditable sin valores', () => {
    const { e, r, ap } = sliceAplicado();
    const reg = leerRegistro(e.rutasD);
    expect([ap.resultado.estado, reg.revision, reg.slots.map(s => [s.id, s.estado])]).toEqual(['APLICABLE', 2, [['pensionado-condicion-x', 'pendiente-provisionar'], ['pensionado-condicion-y', 'pendiente-provisionar']]]);
    expect(reg.historial.every(h => h.lote === r.lote.batchId && h.revisor === 'rol-datos-qa')).toBe(true);
    // Por defecto, los campos sensibles pedidos son secretos PROPIOS (compartir requiere decisión).
    expect(reg.slots[0].campos).toEqual([{ campo: 'numeroIdentificacion', fuente: 'slot' }, { campo: 'correo', fuente: 'slot' }]);
    expect(readFileSync(e.rutasD.manifest!, 'utf8')).toBe(serializarAgentManifest(undefined, reg));
    expect(JSON.parse(readFileSync(e.rutasD.manifest!, 'utf8')).testData.actores.map((a: { id: string }) => a.id)).toEqual(['pensionado-condicion-x', 'pensionado-condicion-y']);
    const resultado = e.texto(`knowledge/test-data-review/${r.lote.batchId}.resultado.json`);
    expect(JSON.parse(resultado)).toMatchObject({ estado: 'APLICABLE', batchId: r.lote.batchId, revisionAntes: 1, revisionDespues: 2, fecha: FECHA });
    expect(resultado).not.toMatch(/AFI_[A-Z]|"registro"/);
    expect(`${e.registroTexto()}${resultado}`).not.toMatch(FUGA);
    expect(ap.escritos).toEqual(['knowledge/test-data-registry.json', 'AFI-AGENT-MANIFEST.json', `knowledge/test-data-review/${r.lote.batchId}.resultado.json`]);
  });

  test('14/15/17. revisión vieja -> REVISION_CONFLICTO; lote editado -> HASH_DISTINTO; reaplicar -> YA_APLICADO sin escribir', () => {
    const { e, r } = sliceAplicado();
    const decisiones = join(e.dir, `${r.archivoDecisiones}.decidido.json`);
    const despues = e.registroTexto();
    const ya = aplicarDatosEnDisco(e.rutasD, join(e.dir, r.archivoRevision), decisiones, FECHA, false);
    expect([ya.resultado.estado, ya.escritos]).toEqual(['YA_APLICADO', []]);
    expect(e.registroTexto()).toBe(despues);
    // Otro lote preparado sobre la revisión 1 (antes de aplicar el primero) queda viejo.
    const e2 = entorno();
    const viejo = prepararDatosEnDisco(e2.rutasD, e2.escribir('s.json', envelope({ testDataRequirements: [req('req-z', [{ id: 'condicion-z', descripcion: 'Condición sintética Z' }])] })));
    const d2 = decidir(e2, viejo.archivoDecisiones, aprobar);
    const p1 = prepararDatosEnDisco(e2.rutasD, e2.escribir('s1.json', envelope({ testDataRequirements: [req('req-a', [X])] })));
    aplicarDatosEnDisco(e2.rutasD, join(e2.dir, p1.archivoRevision), decidir(e2, p1.archivoDecisiones, aprobar), FECHA, false);
    expect(codigo(() => aplicarDatosEnDisco(e2.rutasD, join(e2.dir, viejo.archivoRevision), d2, FECHA, false))).toBe('REVISION_CONFLICTO');
    // Lote editado a mano.
    const e3 = entorno();
    const p3 = prepararDatosEnDisco(e3.rutasD, e3.escribir('s.json', envelope({ testDataRequirements: [req('req-a', [X])] })));
    const lote = e3.leer<LoteDatosPrueba>(p3.archivoRevision);
    lote.propuestas[0].propuesta.slot.condiciones[0].descripcion = 'otra condición';
    const editado = e3.escribir('editado.review.json', lote);
    expect(codigo(() => aplicarDatosEnDisco(e3.rutasD, editado, decidir(e3, p3.archivoDecisiones, aprobar), FECHA, false))).toBe('HASH_DISTINTO');
  });

  test('16. atomicidad: una decisión inválida en el lote -> nada se aplica, sin temporales ni candado', () => {
    const e = entorno();
    const r = prepararDatosEnDisco(e.rutasD, e.escribir('s.json', envelope({ testDataRequirements: [req('req-a', [X]), req('req-b', [Y])] })));
    const antes = e.registroTexto();
    const d = decidir(e, r.archivoDecisiones, x => (x.proposalId === 'ps-pensionado-condicion-y'
      ? { decision: 'APPROVED', revisor: 'rol-datos-qa', correcciones: { campos: [{ campo: 'numeroIdentificacion', fuente: 'shared', sharedRef: 'no-declarado' }] } }
      : aprobar(x)));
    expect(codigo(() => aplicarDatosEnDisco(e.rutasD, join(e.dir, r.archivoRevision), d, FECHA, false))).toBe('DECISIONES_INVALIDAS');
    expect(e.registroTexto()).toBe(antes);
    expect(readdirSync(join(e.dir, 'knowledge')).filter(f => f.endsWith('.tmp') || f.endsWith('.lock'))).toEqual([]);
    expect(existsSync(e.rutasD.manifest!)).toBe(false);
  });

  test('F. decisiones: corregir id/condiciones/campos, shared/base/slot permitidos, estado inicial; nunca valores ni nombres de variables', () => {
    const e = entorno();
    // tipoAportante (público del perfil) no es pedible: solo el humano puede añadirlo al slot como base.
    const r = prepararDatosEnDisco(e.rutasD, e.escribir('s.json', envelope({ testDataRequirements: [req('req-a', [X])] })));
    expect(r.lote.propuestas[0].propuesta.slot.campos).toEqual([{ campo: 'numeroIdentificacion', fuente: 'slot' }, { campo: 'correo', fuente: 'slot' }]);
    const conValor = decidir(e, r.archivoDecisiones, x => ({ ...aprobar(x), comentario: `usar ${REF_X}` }));
    expect(codigo(() => aplicarDatosEnDisco(e.rutasD, join(e.dir, r.archivoRevision), conValor, FECHA, true))).toBe('DECISIONES_INVALIDAS');
    const conClave = decidir(e, r.archivoDecisiones, x => ({ ...aprobar(x), valor: SECRETOS.idX } as never));
    expect(codigo(() => aplicarDatosEnDisco(e.rutasD, join(e.dir, r.archivoRevision), conClave, FECHA, true))).toBe('DECISIONES_INVALIDAS');
    const ok = decidir(e, r.archivoDecisiones, x => ({
      ...aprobar(x), estado: 'provisionado',
      correcciones: { id: 'pensionado-titular-x', condiciones: [{ ...X, descripcion: 'Titular con la condición sintética X' }],
        campos: [{ campo: 'numeroIdentificacion', fuente: 'slot' }, { campo: 'correo', fuente: 'shared', sharedRef: 'correo-qa-sintetico' }, { campo: 'tipoAportante', fuente: 'base' }] },
    }), { compartidos: [{ id: 'correo-qa-sintetico', campo: 'correo', descripcion: 'Buzón QA sintético' }] });
    aplicarDatosEnDisco(e.rutasD, join(e.dir, r.archivoRevision), ok, FECHA, false);
    expect(leerRegistro(e.rutasD).slots[0]).toMatchObject({ id: 'pensionado-titular-x', estado: 'provisionado' });
    expect(e.registroTexto()).not.toMatch(/AFI_[A-Z]|1000004821/);
  });
});

// =====================================================================================
test.describe('4Q H/I/J. provisión posterior y UX de estado', () => {
  test('18/20. provisionado exige un actor existente; un argumento con forma de valor nunca se repite', () => {
    const { e } = sliceAplicado();
    expect(codigo(() => provisionEnDisco(e.rutasD, 'actor-inexistente', 'rol-qa', FECHA, {}, false))).toBe('ACTOR_NO_REGISTRADO');
    try { provisionEnDisco(e.rutasD, '1023456789', 'rol-qa', FECHA, {}, false); } catch (x) { expect((x as Error).message).not.toMatch(FUGA); }
    expect(codigo(() => provisionEnDisco(e.rutasD, 'pensionado-condicion-x', 'Juan Perez', FECHA, {}, false))).toBe('DECISIONES_INVALIDAS');
  });

  test('19/20. provisionado exige los secretos PRESENTES: rechaza con los NOMBRES que faltan; nunca imprime valores', () => {
    const { e } = sliceAplicado();
    const antes = e.registroTexto();
    let error: Error | undefined;
    try { provisionEnDisco(e.rutasD, 'pensionado-condicion-x', 'rol-qa', FECHA, { [REF_X]: SECRETOS.idX }, false); } catch (x) { error = x as Error; }
    expect((error as { codigo?: string }).codigo).toBe('SECRETOS_FALTANTES');
    expect(error!.message).toContain(`falta ${REF_X_CORREO} (Correo electrónico)`);
    expect(error!.message).not.toContain(REF_X + ' ');
    expect(`${error!.message}${JSON.stringify(error)}`).not.toMatch(FUGA);
    expect(e.registroTexto()).toBe(antes);
    const env = { [REF_X]: SECRETOS.idX, [REF_X_CORREO]: SECRETOS.correo };
    const seco = provisionEnDisco(e.rutasD, 'pensionado-condicion-x', 'rol-qa', FECHA, env, true);
    expect([seco.resultado.estado, seco.escritos, e.registroTexto()]).toEqual(['PROVISIONADO', [], antes]);
    const real = provisionEnDisco(e.rutasD, 'pensionado-condicion-x', 'rol-qa', FECHA, env, false);
    const reg = leerRegistro(e.rutasD);
    expect([real.resultado.revisionDespues, reg.slots[0].estado, reg.historial.at(-1)]).toEqual([3, 'provisionado', expect.objectContaining({ accion: 'provision', slot: 'pensionado-condicion-x', revisor: 'rol-qa' })]);
    expect(JSON.stringify(real) + e.registroTexto()).not.toMatch(FUGA);
    expect(provisionEnDisco(e.rutasD, 'pensionado-condicion-x', 'rol-qa', FECHA, env, false).resultado.estado).toBe('YA_PROVISIONADO');
  });

  test('21. pendiente-provisionar + secretos presentes: REQUIERE CONFIRMACIÓN (nunca se promueve solo)', () => {
    const { e } = sliceAplicado();
    const reg = leerRegistro(e.rutasD);
    const env = { [REF_X]: SECRETOS.idX, [REF_X_CORREO]: SECRETOS.correo };
    const d = diagnosticarSlot(reg.slots[0], env);
    expect([d.status, d.confirmacionPendiente]).toEqual(['NEEDS_PROVISIONING', true]);
    const estado = textoEstadoDatos(reg, env, { proyecto: 'colsubsidio' });
    expect(estado.texto.split('\n').slice(0, 7)).toEqual([
      'DATOS DE PRUEBA — ESTADO (Test Data Registry, revisión 2)', 'Actores: 2', 'READY: 0', 'Faltan secretos: 0', 'Requieren actor: 1',
      'Requieren confirmación de provisión: 1', 'Revisión: 0',
    ]);
    expect(estado.texto).toContain('DATOS DE PRUEBA — REQUIERE CONFIRMACIÓN DE PROVISIÓN');
    expect(estado.texto).toContain('Los datos necesarios ya están configurados; falta confirmar que el actor cumple las condiciones de negocio:');
    expect(estado.texto).toContain('node tools/afi.mjs colsubsidio datos provisionado pensionado-condicion-x --revisor=<su-alias>');
    expect(estado.texto).not.toMatch(FUGA);
    expect(leerRegistro(e.rutasD).slots[0].estado).toBe('pendiente-provisionar');
  });

  test('I/J. MISSING_SECRET y requeridos: qué falta, qué variable configurar y qué comando correr, sin conocer el registro', () => {
    const { e } = sliceAplicado();
    const env = { [REF_X]: SECRETOS.idX, [REF_X_CORREO]: SECRETOS.correo, [REF_Y]: SECRETOS.idY };
    for (const id of ['pensionado-condicion-x', 'pensionado-condicion-y']) provisionEnDisco(e.rutasD, id, 'rol-qa', FECHA, { ...env, [REF_Y_CORREO]: SECRETOS.correo }, false);
    const reg = leerRegistro(e.rutasD);
    const estado = textoEstadoDatos(reg, env, { proyecto: 'colsubsidio' });
    expect(estado.resumen).toEqual({ actores: 2, ready: 1, faltanSecretos: 1, requierenActor: 0, confirmacionPendiente: 0, revision: 0 });
    expect(estado.texto).toContain(`Falta:\n  Correo electrónico\nAgregue este valor al .env del proyecto (nunca en el caso, el registro ni Git):\n  # Correo electrónico\n  ${REF_Y_CORREO}=\nDespués ejecute:\n  node tools/afi.mjs colsubsidio datos estado`);
    const req2 = textoRequeridosDatos(reg, env, 'caso-a', { proyecto: 'colsubsidio' });
    expect(req2.texto).toMatch(/^CASO hu-sintetica · caso-a\n {2}Necesita el actor pensionado-condicion-x — LISTO\n/);
    expect(`${estado.texto}${req2.texto}`).not.toMatch(FUGA);
  });
});

// =====================================================================================
test.describe('4Q K/L/M/N. plantilla, shared, intake unificado y casos legacy', () => {
  test('22. compartir un secreto SIEMPRE requiere decisión explícita: ni el agente ni la propuesta lo deciden', () => {
    const e = entorno();
    // Aunque exista un compartido declarado, una propuesta nueva usa secretos propios.
    const base = prepararDatosEnDisco(e.rutasD, e.escribir('s0.json', envelope({ testDataRequirements: [req('req-a', [X])] })));
    aplicarDatosEnDisco(e.rutasD, join(e.dir, base.archivoRevision), decidir(e, base.archivoDecisiones, x => ({
      ...aprobar(x), correcciones: { campos: [{ campo: 'numeroIdentificacion', fuente: 'slot' }, { campo: 'correo', fuente: 'shared', sharedRef: 'correo-qa-sintetico' }] },
    }), { compartidos: [{ id: 'correo-qa-sintetico', campo: 'correo', descripcion: 'Buzón QA sintético' }] }), FECHA, false);
    const otro = prepararDatosEnDisco(e.rutasD, e.escribir('s1.json', envelope({ testDataRequirements: [req('req-b', [Y])] })));
    expect(otro.lote.propuestas[0].propuesta.slot.campos.map(c => c.fuente)).toEqual(['slot', 'slot']);
    // El agente no puede expresar fuentes ni compartidos.
    expect(validarRequisito(req('r', [X], { camposRequeridos: [{ campo: 'correo', fuente: 'shared' }] })).map(p => p.motivo)).toContain('CAMPO');
    expect(validarRequisito(req('r', [X], { sharedRef: 'correo-qa' })).map(p => p.motivo)).toContain('ESQUEMA');
    expect(TEST_DATA.campos.compartibles.significado).toMatch(/NUNCA lo comparte automáticamente/);
  });

  test('23. plantilla env: solo secretos propios y compartidos declarados (una vez); nunca derived, auxiliary ni base/público', () => {
    const r: RegistroDatosPrueba = {
      ...vacio(), revision: 2, compartidos: [{ id: 'correo-qa-sintetico', campo: 'correo', descripcion: 'Buzón QA sintético' }],
      slots: ['condicion-x', 'condicion-y'].map(c => ({
        id: `pensionado-${c}`, perfil: 'pensionado' as const, condiciones: [{ id: c, descripcion: `Condición sintética ${c}` }], estado: 'provisionado' as const,
        origen: { requisitos: [], ocurrencias: [] },
        campos: [{ campo: 'numeroIdentificacion' as const, fuente: 'slot' as const }, { campo: 'correo' as const, fuente: 'shared' as const, sharedRef: 'correo-qa-sintetico' },
          { campo: 'tipoAportante' as const, fuente: 'base' as const }],
      })),
    };
    const plantilla = plantillaEnvDatosPrueba(r);
    expect(plantilla.split('\n').filter(l => l && !l.startsWith('#'))).toEqual(['AFI_SHARED_CORREO_QA_SINTETICO=', REF_X + '=', REF_Y + '=']);
    expect(plantilla).toContain('# Actor: pensionado-condicion-x (perfil pensionado)\n# Debe cumplir: Condición sintética condicion-x\n# Campo: Número de identificación\n');
    expect(plantilla).not.toMatch(/CONFIRMACION|AUTORIZA|TIPO_APORTANTE|TIPO_AFILIADO|DEPARTAMENTO/);
  });

  test('24. intake preparar: el MISMO envelope prepara ambos lotes con los preparadores existentes; solo uno si solo hay una dimensión', () => {
    const e = entorno();
    const ambos = prepararIntakeUnificado(e.escribir('ambos.md', `x\n${bloque(envelope({ knowledgeProposals: [kp('kp-1')], testDataRequirements: [req('req-a', [X])] }))}`), e.rutasK, e.rutasD);
    expect([ambos.formato, !!ambos.conocimiento, !!ambos.datosPrueba]).toEqual(['canonico', true, true]);
    expect(readdirSync(e.rutasK.revisiones).filter(f => f.endsWith('.review.json'))).toEqual([`${ambos.conocimiento!.artefacto.batchId}.review.json`]);
    expect(readdirSync(e.rutasD.revisiones).filter(f => f.endsWith('.review.json'))).toEqual([`${ambos.datosPrueba!.lote.batchId}.review.json`]);
    const soloK = prepararIntakeUnificado(e.escribir('k.json', envelope({ knowledgeProposals: [kp('kp-2')] })), e.rutasK, e.rutasD);
    expect([!!soloK.conocimiento, !!soloK.datosPrueba]).toEqual([true, false]);
    const soloD = prepararIntakeUnificado(e.escribir('d.json', envelope({ testDataRequirements: [req('req-b', [Y])] })), e.rutasK, e.rutasD);
    expect([!!soloD.conocimiento, !!soloD.datosPrueba]).toEqual([false, true]);
    // Nada se aplicó.
    expect(leerRegistro(e.rutasD).revision).toBe(1);
    expect(JSON.parse(readFileSync(e.rutasK.almacen, 'utf8')).revision).toBe(1);
  });

  test('25. legacy: CP02 y CP04 siguen validando y compilando sin actorRef ni variables nuevas', async () => {
    const entornoEmpresa = { AFI_QA_EMPRESA_IDENTIFICACION: '900000001', AFI_QA_CORREO: 'empresa.qa@example.test' };
    for (const d of DEFINICIONES_CP04) {
      expect(validarDefinicionCasoAfi(d)).toEqual([]);
      expect(d).not.toHaveProperty('actorRef');
      expect(actorParaCaso(d, REGISTRO_DATOS_PRUEBA_AFI, entornoEmpresa)).toEqual(actorDesdeEntorno(d.perfil, entornoEmpresa));
    }
    expect(compilarCasoAfi(DEFINICIONES_CP04[0], actorParaCaso(DEFINICIONES_CP04[0], REGISTRO_DATOS_PRUEBA_AFI, entornoEmpresa)).ejecutable).toBe(true);
    const cp02 = JSON.parse(await readFile(resolve(__dirname, 'fixtures/cp02-desktop-compilacion.afi.json'), 'utf8'));
    expect(validarDefinicionCasoAfi(cp02)).toEqual([]);
    expect(() => compilarCasoAfi(cp02, actorParaCaso(cp02, REGISTRO_DATOS_PRUEBA_AFI, {}))).not.toThrow();
    // El registro real no exige variables a los casos existentes.
    for (const s of REGISTRO_DATOS_PRUEBA_AFI.slots) expect([DEFINICIONES_CP04.map(d => d.caso), cp02.caso].flat()).not.toContain(s.id);
  });
});

// =====================================================================================
test.describe('4Q O/Q. seguridad y gate de evidencia PII', () => {
  test('O. una salida del agente con un valor real se rechaza; ni el lote, ni la revisión legible, ni las decisiones lo copian', () => {
    const e = entorno();
    const r = prepararDatosEnDisco(e.rutasD, e.escribir('s.json', envelope({
      testDataRequirements: [req('req-a', [X], { valor: '1023456789' }), req('req-b', [{ id: 'titular', descripcion: 'cédula 1023456789' }])],
    })));
    expect(r.lote.rechazados.map(x => x.referencia)).toEqual(['req-a', 'req-b']);
    for (const f of [r.archivoRevision, r.archivoMd, r.archivoDecisiones]) expect(e.texto(f)).not.toMatch(FUGA);
  });

  test('Q. gate formal: con actorRef, la evidencia cliente queda bloqueada mientras el gate siga ABIERTO', async () => {
    expect(GATE_EVIDENCIA_PII.estado).toBe('ABIERTO');
    expect(codigo(() => exigirGateEvidenciaPii('pensionado-condicion-x', 'cliente'))).toBe('GATE_EVIDENCIA_PII');
    expect(codigo(() => exigirGateEvidenciaPii('pensionado-condicion-x', 'todo'))).toBe('GATE_EVIDENCIA_PII');
    for (const modo of ['off', 'tecnica'] as const) expect(codigo(() => exigirGateEvidenciaPii('pensionado-condicion-x', modo))).toBe('OK');
    expect(evidenciaClienteSegura(undefined, 'cliente')).toBe(true); // legacy: sin cambios
    expect(evidenciaClienteSegura('pensionado-condicion-x', 'cliente')).toBe(false);
    const doc = await readFile(resolve(__dirname, '../data/afi/AFI-TEST-DATA.md'), 'utf8');
    expect(doc).toContain(GATE_EVIDENCIA_PII.id);
    const harness = await readFile(resolve(__dirname, 'afi-case-file.spec.ts'), 'utf8');
    expect(harness).toMatch(/exigirGateEvidenciaPii\(definicion\.actorRef, modoEvidenciaAfi\(process\.env\.AFI_EVIDENCE_MODE\)\)/);
  });

  test('26. blindaje: cero conocimiento de HU concreta en el envelope, el intake unificado, sus CLI y harnesses', async () => {
    const prohibido = /HU\s*1\d|14\.8|14\.12|\bSAP\b|CP0\d|\bP\d{2}\b|Cundinamarca|Ch[ií]a|\d{5,}/i;
    for (const f of ['data/afi/intakeAgente.ts', 'data/afi/intakeUnificado.ts', 'tests/afi-intake.spec.ts', 'tests/afi-datos.spec.ts',
      ...readdirSync(resolve(__dirname, '../data/afi/datosPrueba')).map(x => `data/afi/datosPrueba/${x}`)]) {
      expect(await readFile(resolve(__dirname, '..', f), 'utf8'), f).not.toMatch(prohibido);
    }
    for (const f of ['tools/afi-datos.mjs', 'tools/afi-intake.mjs']) expect(await readFile(resolve(RAIZ, f), 'utf8'), f).not.toMatch(prohibido);
  });
});

// =====================================================================================
test.describe('4Q parche: campos pedibles fail-closed (fuente canónica única)', () => {
  const motivos = (campos: unknown[]) => validarRequisito(req('req-p', [X], { camposRequeridos: campos })).map(p => p.motivo);

  test('1/2/3. numeroIdentificacion, correo y numeroCelular se aceptan', () => {
    for (const c of ['numeroIdentificacion', 'correo', 'numeroCelular']) expect(motivos([c]), c).toEqual([]);
  });

  test('4-8. fondoPensiones, tipoAfiliado, nacionalidad, estadoCivil y confirmacionCorreo se rechazan como NO pedibles (distinto de desconocido)', () => {
    for (const c of ['fondoPensiones', 'tipoAfiliado', 'nacionalidad', 'estadoCivil', 'confirmacionCorreo']) expect(motivos([c]), c).toEqual(['CAMPO_NO_PEDIBLE']);
    expect(motivos(['campoInventado'])).toEqual(['CAMPO']);
    // Tampoco pueden ser secreto de un ActorSlot (ni por fuente por defecto ni por decisión).
    expect(codigo(() => fuentePorDefecto('tipoAfiliado'))).toBe('REQUISITO_INVALIDO');
    const slot = { id: 'pensionado-x', perfil: 'pensionado', condiciones: [X], estado: 'provisionado', origen: { requisitos: [], ocurrencias: [] } };
    for (const fuente of ['slot', 'base']) expect(validarSlot({ ...slot, campos: [{ campo: 'fondoPensiones', fuente }] }).map(p => p.motivo)).toContain('CAMPO_NO_PEDIBLE');
  });

  test('9. una propiedad auto-resoluble puede ir en una condición lógica sin crear secretRef', () => {
    const condicion = { id: 'tipo-afiliado-sintetico', descripcion: 'Actor cuyo tipo de afiliado es el sintético A' };
    const e = entorno();
    const r = prepararDatosEnDisco(e.rutasD, e.escribir('s.json', envelope({ testDataRequirements: [req('req-a', [condicion], { camposRequeridos: ['numeroIdentificacion'] })] })));
    expect(r.lote.rechazados).toEqual([]);
    expect(r.lote.propuestas[0].propuesta.slot.campos).toEqual([{ campo: 'numeroIdentificacion', fuente: 'slot' }]);
    aplicarDatosEnDisco(e.rutasD, join(e.dir, r.archivoRevision), decidir(e, r.archivoDecisiones, aprobar), FECHA, false);
    const reg = leerRegistro(e.rutasD);
    expect(secretRefsDeSlot(reg.slots[0]).map(x => x.secretRef)).toEqual(['AFI_ACTOR_PENSIONADO_TIPO_AFILIADO_SINTETICO_NUMERO_IDENTIFICACION']);
    expect(plantillaEnvDatosPrueba(reg).split('\n').filter(l => l && !l.startsWith('#'))).toEqual(['AFI_ACTOR_PENSIONADO_TIPO_AFILIADO_SINTETICO_NUMERO_IDENTIFICACION=']);
  });

  test('10. manifest.camposPedibles coincide EXACTAMENTE con lo que acepta el validador', async () => {
    const aceptados = CAMPOS_AFI.filter(c => validarCamposRequeridos([c], 'c').length === 0);
    expect(aceptados).toEqual([...CAMPOS_PEDIBLES]);
    expect(TEST_DATA.camposPedibles).toEqual(aceptados);
    expect(TEST_DATA.campos.requierenSecreto.campos).toEqual(aceptados);
    const archivo = JSON.parse(await readFile(resolve(__dirname, '../data/afi/AFI-AGENT-MANIFEST.json'), 'utf8')).testData;
    expect(archivo.camposPedibles).toEqual(aceptados);
    // Instrucciones inequívocas: ya no existe "solo si una condición lo hace material".
    const textos = [JSON.stringify(TEST_DATA), await readFile(resolve(__dirname, '../data/afi/AFI-AGENT-INSTRUCTIONS.md'), 'utf8'), await readFile(resolve(__dirname, '../data/afi/AFI-TEST-DATA.md'), 'utf8')];
    for (const t of textos) expect(t).not.toMatch(/lo hace[n]? materia|los hace materiales|vuelve[n]? MATERIAL/i);
    expect(TEST_DATA.reglas.join('\n')).toMatch(/camposRequeridos contiene SOLO campos de camposPedibles/);
  });

  test('11. una salida maliciosa o errónea del agente nunca produce AFI_ACTOR_* para un campo auto-resoluble', () => {
    const e = entorno();
    const r = prepararDatosEnDisco(e.rutasD, e.escribir('s.json', envelope({
      testDataRequirements: [req('req-a', [X], { camposRequeridos: ['numeroIdentificacion', 'tipoAfiliado'] }), req('req-b', [Y], { camposRequeridos: ['fondoPensiones'] })],
    })));
    expect(r.lote.rechazados.map(x => [x.referencia, x.problemas.map(p => p.motivo)])).toEqual([['req-a', ['CAMPO_NO_PEDIBLE']], ['req-b', ['CAMPO_NO_PEDIBLE']]]);
    expect(r.lote.propuestas).toEqual([]);
    // Un lote FORJADO (hash recalculado) con el campo auto-resoluble como secreto tampoco se aplica.
    const valido = prepararDatosEnDisco(e.rutasD, e.escribir('ok.json', envelope({ testDataRequirements: [req('req-c', [X])] })));
    const lote = e.leer<LoteDatosPrueba>(valido.archivoRevision);
    lote.propuestas[0].propuesta.slot.campos.push({ campo: 'tipoAfiliado', fuente: 'slot' });
    lote.propuestas[0].hash = hashPropuestaSlot(lote.propuestas[0].propuesta);
    const forjado = e.escribir('forjado.review.json', lote);
    const d = e.leer<ArchivoDecisionesDatos>(valido.archivoDecisiones);
    const decisiones = e.escribir('forjado.decisiones.json', { ...d, decisiones: d.decisiones.map(x => ({ ...x, hash: lote.propuestas[0].hash, decision: 'APPROVED', revisor: 'rol-datos-qa' })) });
    expect(codigo(() => aplicarDatosEnDisco(e.rutasD, forjado, decisiones, FECHA, false))).toBe('DECISIONES_INVALIDAS');
    // Ni una corrección humana puede convertirlo en secreto.
    const humano = decidir(e, valido.archivoDecisiones, x => ({ ...aprobar(x), correcciones: { campos: [{ campo: 'numeroIdentificacion', fuente: 'slot' }, { campo: 'nacionalidad', fuente: 'slot' }] } }));
    expect(codigo(() => aplicarDatosEnDisco(e.rutasD, join(e.dir, valido.archivoRevision), humano, FECHA, false))).toBe('DECISIONES_INVALIDAS');
    expect(e.registroTexto()).toBe(`${JSON.stringify(vacio(), null, 2)}\n`);
    expect(readdirSync(e.rutasD.revisiones).map(f => e.texto(`knowledge/test-data-review/${f}`)).join('')).not.toMatch(/AFI_ACTOR_\w*(TIPO_AFILIADO|FONDO_PENSIONES|NACIONALIDAD)/);
  });
});

// =====================================================================================
/** CLI real: SOLO comandos que no escriben en el knowledge real (lecturas, rechazos y un envelope vacío). */
test.describe('4Q CLI: sin valores y sin tocar el .env', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);
  const ENV_REAL = resolve(__dirname, '../.env');
  const huella = () => (existsSync(ENV_REAL) ? createHash('sha256').update(readFileSync(ENV_REAL)).digest('hex') : 'sin-env');
  const afi = (...args: string[]) => {
    const r = spawnSync(process.execPath, [resolve(RAIZ, 'tools/afi.mjs'), ...args], { cwd: RAIZ, encoding: 'utf8' });
    return { codigo: r.status, salida: `${r.stdout ?? ''}`, error: `${r.stderr ?? ''}` };
  };
  const sensibles = () => Object.entries(process.env)
    .filter(([k, v]) => v && v.trim().length >= 4 && /PASSWORD|CLAVE|TOKEN|USUARIO|CORREO|IDENTIFICACION|NUM_CEL|IBC|INGRESO|ACTIVIDAD|FACULTATIVO_|^AFI_(ACTOR|SHARED)_/i.test(k))
    .map(([, v]) => v!.trim());

  test('provisionado / aplicar / intake: rechazos claros (exit != 0), sin valores, sin modificar .env ni el registro real', () => {
    const env = huella();
    const registro = readFileSync(resolve(__dirname, '../knowledge/test-data-registry.json'), 'utf8');
    const noExiste = afi('colsubsidio', 'datos', 'provisionado', 'actor-sintetico-inexistente', '--revisor=rol-qa', '--json');
    expect(noExiste.codigo).not.toBe(0);
    expect(JSON.parse(noExiste.salida)).toMatchObject({ ok: false, error: { codigo: 'ACTOR_NO_REGISTRADO' } });
    const valor = afi('colsubsidio', 'datos', 'provisionado', '1023456789', '--revisor=rol-qa');
    expect(valor.codigo).toBe(2);
    expect(`${valor.salida}${valor.error}`).not.toMatch(/1023456789/);
    for (const args of [['datos', 'provisionado', 'actor-x'], ['datos', 'aplicar', 'no-existe.json', 'no-existe.json'], ['datos', 'preparar'], ['datos', 'estado', '--dry-run'],
      ['intake', 'aplicar', 'x.json'], ['intake', 'preparar']]) expect(afi('colsubsidio', ...args).codigo, args.join(' ')).toBe(2);
    for (const r of [noExiste, valor]) for (const v of sensibles()) expect(`${r.salida}${r.error}`.includes(v)).toBe(false);
    expect(huella()).toBe(env);
    expect(readFileSync(resolve(__dirname, '../knowledge/test-data-registry.json'), 'utf8')).toBe(registro);
  });

  test('intake preparar con un envelope sin contenido: no prepara ni escribe nada', ({}, info) => { // eslint-disable-line no-empty-pattern
    const ruta = info.outputPath('vacio.json');
    mkdirSync(resolve(ruta, '..'), { recursive: true });
    writeFileSync(ruta, JSON.stringify(envelope()));
    const antes = [readdirSync(resolve(__dirname, '../knowledge')).sort(), huella()];
    const r = afi('colsubsidio', 'intake', 'preparar', ruta, '--json');
    expect(r.codigo, r.error).toBe(0);
    expect(JSON.parse(r.salida)).toEqual({ ok: true, accion: 'preparar', formato: 'canonico' });
    expect([readdirSync(resolve(__dirname, '../knowledge')).sort(), huella()]).toEqual(antes);
  });
});
