import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validarDefinicionCasoAfi, type DefinicionCasoAfi } from '../data/afi/caso';
import { REGISTRO_DATOS_PRUEBA_AFI } from '../data/afi/datosPrueba/registro';
import { compilarPlanE2E, type ContextoCompilacionE2E, type PlanE2ECompilado } from '../data/afi/e2e/compilador';
import { EJEMPLOS_E2E, FORMA_E2E, publicarContratoE2E, type DefinicionE2E } from '../data/afi/e2e/contrato';
import type { RutaE2E } from '../data/afi/e2e/recorrido';
import { ALMACEN_APLICACION_AFI, MODELO_APLICACION_AFI, construirModeloAplicacion, extensionDesdeAlmacen, type ModeloAplicacion } from '../data/afi/aplicacion/modeloAplicacion';
import { aplicarPropuestasAprobadas, recibirPropuestasDelAgente, revisarPropuesta, validarPropuesta, type KnowledgeProposal } from '../data/afi/aplicacion/propuestas';
import { testabilidadCanonica } from '../data/afi/aplicacion/resolucionObservacion';
import { evaluarExpectativa } from '../data/afi/aplicacion/superficies';
import { POLITICAS_AFI, politicasDelPerfil } from '../data/afi/politicas';
import { resolverEtapa } from '../data/afi/resolver';
import { actorDesdeEntorno } from '../data/afi/actores';
import { capacidad } from '../data/afi/capacidadesPreparacion';
import type { CampoAfi, PoliticaCampo } from '../data/afi/modelo';
import { DataGapRecorridoError, avanzar, recorrerRuta, rutaEjecutable } from '../helpers/e2e/recorridoSemantico';
import { enteroEnRango, opcionDeDominio } from '../data/afi/datosPrueba/generacion';
import { AfiliacionesPortal } from '../helpers/afiliacionesPortal';

/**
 * Endurecimiento del contrato (A1-A4), recorrido derivado desde Knowledge (B), fidelidad semántica (C) y primitivas genéricas
 * del recorrido (D) sobre un DOM SINTÉTICO. Sin QA real; Knowledge real intacto (las propuestas se aplican solo en memoria).
 */

const caso = (n: string): DefinicionCasoAfi => JSON.parse(readFileSync(resolve(__dirname, `../data/afi/casos/hu7-14-${n}.afi.json`), 'utf8'));
const problemas = (def: unknown) => validarDefinicionCasoAfi(def).map(p => `${p.ruta}: ${p.mensaje}`);
const compilar = (def: DefinicionCasoAfi, extra: Partial<ContextoCompilacionE2E> = {}): PlanE2ECompilado =>
  compilarPlanE2E(def.e2e!, { hu: def.hu, caso: def.caso, perfil: def.perfil, actorRef: def.actorRef, registro: REGISTRO_DATOS_PRUEBA_AFI, entorno: {}, ...extra });
const conModelo = (modelo: ModeloAplicacion) => ({ testabilidad: { ...testabilidadCanonica(), modelo } });
const ENVELOPE = JSON.parse(readFileSync(resolve(__dirname, '../intake/hu7-14-navegacion-empleador-juridico.json'), 'utf8'));

/** Knowledge real: el lote de navegación (26 aprobadas) y el de Representante legal observado YA están aplicados. */
const modeloProyectado = (): ModeloAplicacion => MODELO_APLICACION_AFI;
/** Mismo almacén SIN transiciones: para probar el mecanismo cuando Knowledge no registra la ruta. */
const modeloSinTransiciones = () => construirModeloAplicacion({ ...extensionDesdeAlmacen(ALMACEN_APLICACION_AFI), transiciones: [] });
const LOTE_NAVEGACION = JSON.parse(readFileSync(resolve(__dirname, '../knowledge/review/kr-d388556f92e4935c.review.json'), 'utf8')) as { propuestas: { proposalId: string; propuesta: KnowledgeProposal }[] };
const NEEDS_CHANGES = ['prop-completar-pantalla-representante-legal', 'prop-completar-pantalla-contacto-caja', 'prop-completar-pantalla-responsable-portal'];

test.describe('A1. integración invocada / no invocada: semántica cerrada', () => {
  test('el valor libre "sin-ejecutar" ya no valida; no-invocada sí; igual solo en su dominio', () => {
    const conCondicion = (expectativa: unknown, tipo = 'integracion') => {
      const d = caso('cp02');
      d.e2e!.pasos[0].verificaciones = [{ tipo: 'condicion', entidad: { tipo, id: 'integracion-registraduria' }, expectativa } as never];
      return problemas(d).join('\n');
    };
    expect(conCondicion({ tipo: 'resultado', igual: 'sin-ejecutar' })).toMatch(/exito \| error \(dominio cerrado\)/);
    expect(conCondicion({ tipo: 'no-invocada' })).toBe('');
    expect(conCondicion({ tipo: 'invocada' })).toBe('');
    expect(conCondicion({ tipo: 'no-invocada', igual: 'x' })).toMatch(/igual: clave no admitida/);
    expect(conCondicion({ tipo: 'emitida' })).toMatch(/resultado \| invocada \| no-invocada/);
    expect(conCondicion({ tipo: 'resultado', igual: 'exito' }, 'variable')).toMatch(/\{ tipo: valor \}/);
    // CP02 migrado: la no invocación de Registraduría es exacta (sin valor libre).
    expect(JSON.stringify(caso('cp02'))).not.toMatch(/sin-ejecutar/);
    expect(JSON.stringify(caso('cp02'))).toContain('"tipo":"no-invocada"'.replace(/"/g, '"'));
  });
  test('evaluación y compilación: no-invocada se mide como presencia ausente; sin proveedor queda OBSERVABILITY (no se inventa)', () => {
    expect([evaluarExpectativa({ tipo: 'no-invocada' }, { tipo: 'presencia', presente: false }), evaluarExpectativa({ tipo: 'invocada' }, { tipo: 'presencia', presente: false })]).toEqual(['PASS', 'FAIL']);
    const g = compilar(caso('cp02')).gaps.filter(x => /integracion-registraduria no-invocada/.test(x.motivo));
    expect(g.map(x => [x.clasificacion, x.raiz.id])).toEqual(Array(3).fill(['OBSERVABILITY_GAP', 'observacion:proveedor-integraciones']));
  });
});

test.describe('A2. actor y precondiciones: nunca un actor no demostrado', () => {
  test('CP01: su actor no demuestra una precondición -> gap explícito; CP02 sí la demuestra', () => {
    const p1 = compilar(caso('cp01'));
    expect(p1.actor).toMatchObject({ requerido: true, demostrado: false, faltantes: ['rep-legal-rues-tipo-distinto-cc', 'numero-rep-legal-como-cc-en-registraduria-sin-bizagi'] });
    expect(p1.gaps.find(g => g.ubicacion === 'actor · principal')).toMatchObject({ clasificacion: 'TEST_DATA_GAP', raiz: { id: 'test-data:actor-no-demostrado:principal', bloquea: 'recorrido' } });
    expect(compilar(caso('cp02')).actor).toMatchObject({ requerido: true, demostrado: true, actorRef: 'empresa-empleador-juridico-rues-sin-rep-legal' });
  });
  test('sin actorRef, un escenario no se demuestra con el actor base del perfil; sin escenario no hay nada que demostrar', () => {
    const sinRef = caso('cp02'); delete sinRef.actorRef;
    expect(compilar(sinRef).actor).toMatchObject({ demostrado: false, motivo: expect.stringContaining('actor base del perfil no demuestra') });
    const neutro: DefinicionE2E = { version: 1, datos: [], pasos: [{ paso: 1, accion: 'a', esperado: 'b', verificaciones: [{ tipo: 'portal-apertura' }] }] };
    expect(compilarPlanE2E(neutro, { hu: 'h', caso: 'c', perfil: 'empresa', registro: REGISTRO_DATOS_PRUEBA_AFI }).actor).toMatchObject({ requerido: false, demostrado: true });
  });
  test('el harness nunca compila el recorrido del Portal si el actor no está demostrado', () => {
    const harness = readFileSync(resolve(__dirname, 'afi-case-file.spec.ts'), 'utf8');
    expect(harness.indexOf('plan.actor.demostrado')).toBeGreaterThan(-1);
    expect(harness.indexOf('plan.actor.demostrado')).toBeLessThan(harness.indexOf('actorParaCaso(definicion', harness.indexOf('async function prepararE2E')));
  });
});

test.describe('A3. manifest suficiente: forma completa, dominios y ejemplos', () => {
  const publicado = publicarContratoE2E();
  /** Recorre un JSON contra la forma publicada: cada clave usada debe estar documentada. */
  function sinDocumentar(v: unknown, forma: unknown, ruta: string, faltan: string[]): void {
    if (Array.isArray(v)) { const f = Array.isArray(forma) ? forma[0] : undefined; if (f && typeof f === 'object') v.forEach((x, i) => sinDocumentar(x, f, `${ruta}[${i}]`, faltan)); return; }
    if (!v || typeof v !== 'object' || !forma || typeof forma !== 'object') return;
    const alternativas = (forma as Record<string, unknown>)['|'] as unknown[] | undefined;
    if (alternativas) { const alt = alternativas.find(a => a && typeof a === 'object' && Object.keys(v).every(k => k in (a as object))); if (!alt) faltan.push(ruta); else sinDocumentar(v, alt, ruta, faltan); return; }
    const claves = Object.fromEntries(Object.entries(forma).map(([k, x]) => [k.replace(/\?$/, ''), x]));
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (!(k in claves)) { faltan.push(`${ruta}.${k}`); continue; }
      let f = claves[k];
      if (k === 'verificaciones' && Array.isArray(x)) { x.forEach((ver, i) => sinDocumentar(ver, (FORMA_E2E.verificaciones as Record<string, unknown>)[(ver as { tipo: string }).tipo], `${ruta}.verificaciones[${i}]`, faltan)); continue; }
      if (k === 'expectativa' && typeof f === 'string') f = /Pantalla/.test(f) ? FORMA_E2E.expectativaPantalla : FORMA_E2E.expectativaCondicion;
      sinDocumentar(x, f, `${ruta}.${k}`, faltan);
    }
  }
  test('toda clave usada por CP01 y CP02 está publicada en la forma (un agente no necesita leer TypeScript)', () => {
    for (const n of ['cp01', 'cp02']) {
      const faltan: string[] = [];
      sinDocumentar(caso(n).e2e, FORMA_E2E.e2e, 'e2e', faltan);
      expect(faltan, n).toEqual([]);
    }
  });
  test('forma, dominios y validador coinciden; los ejemplos publicados validan', () => {
    const sinOpc = (o: object) => Object.keys(o).map(k => k.replace(/\?$/, '')).sort();
    for (const [t, ks] of Object.entries(publicado.verificaciones)) expect(sinOpc(FORMA_E2E.verificaciones[t as keyof typeof FORMA_E2E.verificaciones]), t).toEqual(['tipo', ...ks].sort());
    expect(sinOpc(FORMA_E2E.e2e.datos[0])).toEqual([...publicado.datos.claves].sort());
    expect(publicado.dominios.expectativasPorEntidad.integracion).toEqual(['resultado', 'invocada', 'no-invocada']);
    expect(publicado.dominios.igualPorExpectativa).toEqual({ resultado: ['exito', 'error'], valor: 'literal público' });
    const e = EJEMPLOS_E2E;
    const def = {
      version: 1, hu: 'HU sintetica', caso: 'CPX', nombre: 'Ejemplos publicados', perfil: 'empresa',
      preparacion: { datosCaso: { tipoAportante: 'Empleador' }, camposAsercion: [], etapas: ['inicio-solicitud'] },
      e2e: { version: 1, sujetos: [{ rol: 'persona-ejemplo' }],
        datos: [{ campo: 'afiliadoPrimeraVez', sujeto: 'principal', uso: ['SCENARIO'], resolucion: 'TEST_DATA', aplicabilidad: 'siempre' }, e.datoCondicional, e.datoSistema],
        pasos: [e.pasoConFidelidad, { paso: 4, accion: 'x', esperado: 'y', verificaciones: [e.integracionNoInvocada, e.integracionResultado, e.pantallaCampos, e.accionConSujeto] }] },
    };
    expect(problemas(def)).toEqual([]);
  });
  test('el manifest persistido publica forma, dominios y ejemplos (sin selectores ni datos del benchmark)', () => {
    const m = JSON.parse(readFileSync(resolve(__dirname, '../data/afi/AFI-AGENT-MANIFEST.json'), 'utf8'));
    expect(Object.keys(m.contrato.e2e)).toEqual(expect.arrayContaining(['forma', 'dominios', 'ejemplos', 'reglas']));
    expect(JSON.stringify(m.contrato.e2e)).not.toMatch(/CP0\d|formcontrolname|#[a-z]|@|\d{5,}/);
  });
});

test.describe('A4. notaFuente: documental, sin ejecución ni gaps', () => {
  test('CP02 conserva la cuarta columna del Excel; quitarla no cambia verificaciones ni gaps', () => {
    const excel = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/hu7-14-cp02-excel.json'), 'utf8')) as { pasos: { paso: number; nota?: string }[] };
    const con = caso('cp02'), sin = caso('cp02');
    const p5 = con.e2e!.pasos.find(p => p.paso === 5)!;
    expect(p5.notaFuente).toBe(excel.pasos.find(p => p.paso === 5)!.nota);
    for (const p of sin.e2e!.pasos) delete p.notaFuente;
    const a = compilar(con), b = compilar(sin);
    expect(a.pasos.find(p => p.paso === 5)!.notaFuente).toBe(p5.notaFuente);
    expect([a.gaps, a.pasos.map(p => p.verificaciones)]).toEqual([b.gaps, b.pasos.map(p => p.verificaciones)]);
    const larga = caso('cp02'); larga.e2e!.pasos[0].notaFuente = 'x'.repeat(2001);
    expect(problemas(larga).join('\n')).toMatch(/notaFuente: texto documental/);
  });
});

test.describe('C. fidelidad semántica visible (nunca cuenta como exacta)', () => {
  test('CP02: aproximaciones y no representables declarados + detectados; los totales cuadran', () => {
    const f = compilar(caso('cp02')).fidelidad;
    expect([f.pasos, f.pasosValidos, f.semanticasExactas, f.semanticasAproximadas, f.semanticasNoRepresentables]).toEqual([19, 19, 12, 5, 2]);
    expect(f.semanticasExactas + f.semanticasAproximadas + f.semanticasNoRepresentables).toBe(f.pasos);
    expect(f.detalle.filter(d => d.representacion === 'no-representable').map(d => d.paso)).toEqual([12, 17]);
    expect(f.detalle.filter(d => d.origen === 'detectada').map(d => d.paso)).toEqual([11, 16, 19]);
  });
  test('un fragmento que no es literal del paso no valida', () => {
    const d = caso('cp02');
    d.e2e!.pasos[0].fidelidad = [{ fragmento: 'texto inventado', representacion: 'aproximada', motivo: 'x' }];
    expect(problemas(d).join('\n')).toMatch(/texto LITERAL de la accion o del esperado/);
  });
});

test.describe('B. Knowledge representa rutas; el compilador deriva el recorrido', () => {
  test('el lote de navegación se aplicó por el mecanismo formal: 26 aprobadas; los 3 títulos dudosos NO; Representante legal por el lote observado', () => {
    expect(LOTE_NAVEGACION.propuestas).toHaveLength(29);
    expect(MODELO_APLICACION_AFI.ui.transiciones).toHaveLength(5);
    expect(MODELO_APLICACION_AFI.ui.pantallas).toContain('pantalla-direccion');
    const decl = Object.fromEntries(MODELO_APLICACION_AFI.uiDeclarada.pantallas.map(p => [p.id, p]));
    expect([decl['pantalla-contacto-caja'].titulo, decl['pantalla-responsable-portal'].titulo]).toEqual([undefined, undefined]); // no observados
    expect([decl['pantalla-representante-legal'].titulo, decl['pantalla-representante-legal'].consulta]).toEqual(['Representante legal', 'Buscar representante']);
    const aplicadas = new Set(ALMACEN_APLICACION_AFI.historial.filter(h => h.lote === 'kr-d388556f92e4935c').map(h => h.propuesta));
    expect(aplicadas.size).toBe(26);
    for (const p of NEEDS_CHANGES) expect(aplicadas.has(p), p).toBe(false);
  });
  test('completar: solo añade atributos ausentes a entidades aprobadas del almacén (nunca crea, cambia ni pisa)', () => {
    // Contacto caja sigue sin título aprobado: completarlo es válido; Representante legal ya lo tiene: completarlo es SOBRESCRITURA.
    const base = ENVELOPE.knowledgeProposals.find((p: KnowledgeProposal) => p.proposalId === 'prop-completar-pantalla-contacto-caja') as KnowledgeProposal;
    const yaAprobada = ENVELOPE.knowledgeProposals.find((p: KnowledgeProposal) => p.proposalId === 'prop-completar-pantalla-representante-legal') as KnowledgeProposal;
    const motivos = (p: unknown, m: ModeloAplicacion = MODELO_APLICACION_AFI) => validarPropuesta(p, m).map(x => x.motivo);
    expect(motivos(base)).toEqual([]);
    expect(motivos({ ...base, entidad: { ...base.entidad, descripcion: 'Otra descripción' } })).toContain('SOBRESCRITURA');
    expect(motivos({ ...base, entidad: { ...base.entidad, id: 'pantalla-que-no-existe' } })).toContain('NO_REGISTRADA');
    expect(motivos({ ...base, entidad: { tipo: 'pantalla-ui', id: 'informacion-contacto', descripcion: 'x', titulo: 'y' } })).toContain('NO_REGISTRADA'); // 4J en TypeScript
    expect(motivos(yaAprobada)).toContain('SOBRESCRITURA'); // ya aprobado: no se cambia
    const t = ENVELOPE.knowledgeProposals.find((p: KnowledgeProposal) => p.entidad.tipo === 'transicion-ui') as KnowledgeProposal;
    expect(motivos({ ...t, entidad: { ...t.entidad, hacia: (t.entidad as { desde: string }).desde } })).toContain('ESTRUCTURA');
    expect(motivos({ ...t, entidad: { ...t.entidad, hacia: 'pantalla-inexistente' } })).toContain('REFERENCIA_DESCONOCIDA');
  });
  test('sin transiciones aprobadas, toda pantalla posterior queda bloqueada por UNA raíz de Knowledge', () => {
    const plan = compilar(caso('cp02'), conModelo(modeloSinTransiciones()));
    expect(plan.recorrido.pantallas.map(p => p.pantalla)).toEqual(['informacion-contacto']);
    const bloqueos = new Set(Object.values(plan.recorrido.bloqueosHasta).flat().map(b => b.raiz.id));
    expect([...bloqueos]).toEqual(['knowledge:transicion-ui:desde:informacion-contacto']);
  });
  test('con el lote aprobado (en memoria) el compilador DERIVA la ruta, la preparación de cada pantalla y su primer bloqueo real', () => {
    const plan = compilar(caso('cp02'), conModelo(modeloProyectado()));
    expect(plan.recorrido.pantallas.map(p => [p.pantalla, p.preparacion.tipo, p.acciones.join('+')])).toEqual([
      ['informacion-contacto', 'etapa', 'diligenciar-obligatorios+avanzar'],
      ['pantalla-direccion', 'etapa', 'diligenciar-obligatorios+avanzar'],
      ['pantalla-representante-legal', 'formulario', 'consultar-persona+diligenciar-obligatorios+avanzar'],
      ['pantalla-contacto-caja', 'formulario', 'consultar-persona+diligenciar-obligatorios+avanzar'],
      ['pantalla-responsable-portal', 'formulario', 'consultar-persona+diligenciar-obligatorios+avanzar'],
      ['pantalla-documentos', 'ninguna', 'cargar-documentos+avanzar'],
    ]);
    // Los sujetos de cada formulario salen del caso (acciones con sujeto + pantalla), no de un rol fijo.
    expect(plan.recorrido.pantallas.filter(p => p.preparacion.tipo === 'formulario').map(p => p.preparacion.tipo === 'formulario' ? [p.preparacion.sujeto, p.preparacion.consulta] : []))
      .toEqual([['representante-legal', 'Buscar representante'], ['contacto-caja', undefined], ['responsable-portal', undefined]]);
    // Lo no observado queda como gap explícito de Knowledge (título y consulta de Contacto caja), nunca adivinado.
    expect(plan.recorrido.bloqueosHasta['pantalla-contacto-caja'].map(b => b.raiz.id)).toContain('knowledge:pantalla-ui:pantalla-contacto-caja:titulo');
    // Dirección PJ ya tiene política para empresa (GENERATED con evidencia QA): no bloquea.
    expect(plan.recorrido.bloqueosEn['pantalla-direccion']).toEqual([]);
    expect(plan.recorrido.bloqueosEn['pantalla-documentos'].map(b => b.raiz.id)).toEqual(['knowledge:formulario:pantalla-documentos']);
  });
  test('grafo SINTÉTICO: la ruta y los datos de tránsito se derivan de Knowledge, sin secuencias fijas', () => {
    const modelo = construirModeloAplicacion({
      ...extensionDesdeAlmacen(ALMACEN_APLICACION_AFI),
      pantallas: [...ALMACEN_APLICACION_AFI.entidades.pantallas, { id: 'pantalla-sintetica-a', descripcion: 'A', titulo: 'Pantalla A', consulta: 'Consultar' }, { id: 'pantalla-sintetica-b', descripcion: 'B', titulo: 'Pantalla B' }],
      campos: [...ALMACEN_APLICACION_AFI.entidades.campos,
        { id: 'sintetico-tipo', descripcion: 't', pantalla: 'pantalla-sintetica-a', control: 'select', etiqueta: 'Tipo', dato: 'tipoIdentificacion', obligatorio: 'si' },
        { id: 'sintetico-numero', descripcion: 'n', pantalla: 'pantalla-sintetica-a', control: 'text', etiqueta: 'Número', dato: 'numeroIdentificacion', obligatorio: 'si' },
        { id: 'sintetico-nombre', descripcion: 'p', pantalla: 'pantalla-sintetica-a', control: 'text', etiqueta: 'Nombre', dato: 'primerNombre' },
        { id: 'sintetico-correo', descripcion: 'c', pantalla: 'pantalla-sintetica-a', control: 'text', etiqueta: 'Correo', dato: 'correo', obligatorio: 'si' }],
      transiciones: [{ id: 't-origen-a', descripcion: 'x', desde: 'informacion-contacto', hacia: 'pantalla-sintetica-a', avance: 'Seguir' },
        { id: 't-a-b', descripcion: 'x', desde: 'pantalla-sintetica-a', hacia: 'pantalla-sintetica-b', avance: 'Seguir' }],
    });
    const e2e: DefinicionE2E = {
      version: 1, sujetos: [{ rol: 'persona-x', pantalla: 'pantalla-sintetica-a' }],
      precondiciones: [{ sujeto: 'persona-x', id: 'persona-sintetica', descripcion: 'Persona sintética' }],
      datos: [{ campo: 'tipoIdentificacion', sujeto: 'persona-x', uso: ['SCENARIO'], resolucion: 'CASE_LITERAL', valor: 'Cédula de Ciudadanía', aplicabilidad: 'siempre' },
        { campo: 'numeroIdentificacion', sujeto: 'persona-x', uso: ['SCENARIO'], resolucion: 'TEST_DATA', aplicabilidad: 'siempre' }],
      pasos: [{ paso: 1, accion: 'Llegar a B', esperado: 'Se ve B', verificaciones: [{ tipo: 'pantalla', pantalla: 'pantalla-sintetica-b', expectativa: { titulo: { texto: 'Pantalla B' } } }] }],
    };
    const plan = compilarPlanE2E(e2e, { hu: 'h', caso: 'c', perfil: 'empresa', registro: REGISTRO_DATOS_PRUEBA_AFI, entorno: {}, ...conModelo(modelo) });
    expect(plan.recorrido.pantallas.map(p => p.pantalla)).toEqual(['informacion-contacto', 'pantalla-sintetica-a', 'pantalla-sintetica-b']);
    // El caso nunca mencionó A ni el contacto: el correo obligatorio de A (persona-x) y los teléfonos que Empleador PJ captura en
    // Información de contacto (variante de política) son datos de TRÁNSITO de quien ocupa cada pantalla.
    expect(plan.recorrido.datosTransito).toEqual([
      { sujeto: 'principal', campo: 'numeroCelular', pantalla: 'informacion-contacto' }, { sujeto: 'principal', campo: 'numeroTelefonoFijo', pantalla: 'informacion-contacto' },
      { sujeto: 'persona-x', campo: 'correo', pantalla: 'pantalla-sintetica-a' }]);
    expect(plan.requisitos.find(r => r.rol === 'persona-x')!.camposRequeridos).toEqual(['numeroIdentificacion', 'correo']);
    expect(plan.metricasDatos.porRequisito.find(m => m.sujeto === 'persona-x')!.transito).toEqual(['correo']);
    const v = plan.pasos[0].verificaciones[0];
    expect(v).toMatchObject({ estado: 'EJECUTABLE', momento: { pantalla: 'pantalla-sintetica-b', despuesDe: 0 } });
    // Sin sujeto ligado a la pantalla de persona: gap de Test Data explícito, no un sujeto adivinado.
    const sinSujeto = compilarPlanE2E({ ...e2e, sujetos: [{ rol: 'persona-x' }] }, { hu: 'h', caso: 'c', perfil: 'empresa', registro: REGISTRO_DATOS_PRUEBA_AFI, entorno: {}, ...conModelo(modelo) });
    expect(sinSujeto.recorrido.bloqueosEn['pantalla-sintetica-a'].map(b => b.raiz.id)).toEqual(['test-data:sujeto-de-pantalla:pantalla-sintetica-a']);
  });
  test('el recorrido y sus primitivas no conocen pantallas, perfiles ni casos concretos', () => {
    for (const f of ['data/afi/e2e/recorrido.ts', 'helpers/e2e/recorridoSemantico.ts']) {
      expect(readFileSync(resolve(__dirname, '..', f), 'utf8'), f).not.toMatch(/pantalla-(representante|contacto|responsable|documentos|direccion)|'empresa'|CP0\d|HU ?7|Buscar|Continuar|representante/i);
    }
  });
});

test.describe('D. primitivas genéricas del recorrido sobre DOM sintético (sin QA)', () => {
  const ARCHIVO = (() => { const p = join(mkdtempSync(join(tmpdir(), 'afi-doc-')), 'documento-sintetico.pdf'); writeFileSync(p, '%PDF-1.4 sintetico'); return p; })();
  /** SPA sintética: origen -> persona 1 -> persona 2 -> documentos -> fin. Mismas etiquetas en ambas personas. */
  const HTML = `<main id="app"></main><script>
    const app = document.getElementById('app');
    const persona = (titulo, siguiente) => () => { app.innerHTML = '<h2>' + titulo + '</h2>'
      + '<label for="t">Tipo de identificación *</label><select id="t"><option value=""></option><option>Cédula de Ciudadanía</option><option>Pasaporte</option></select>'
      + '<label for="n">Número de identificación</label><input id="n">'
      + '<button id="b">Buscar</button><label for="p">Primer nombre</label><input id="p">'
      + '<label for="c">Correo electrónico</label><input id="c"><p id="e"></p><button id="s">Continuar</button>';
      document.getElementById('b').onclick = () => { const s = document.createElement('div'); s.setAttribute('role', 'progressbar'); app.appendChild(s);
        setTimeout(() => { s.remove(); const p = document.getElementById('p'); p.value = 'NOMBRE SISTEMA'; p.disabled = true; }, 200); };
      document.getElementById('s').onclick = () => { if (!document.getElementById('c').value) { document.getElementById('e').textContent = 'Obligatorio'; return; } siguiente(); };
    };
    const fin = () => { app.innerHTML = '<h2>Fin sintético</h2>'; };
    const documentos = () => { app.innerHTML = '<h2>Documentos sintéticos</h2><label for="f">Documento sintético</label><input id="f" type="file"><button id="s">Continuar</button>';
      document.getElementById('s').onclick = () => { if (document.getElementById('f').files.length) fin(); }; };
    const p2 = persona('Persona dos', documentos), p1 = persona('Persona uno', p2);
    app.innerHTML = '<h2>Origen sintético</h2><button id="s">Continuar</button>';
    document.getElementById('s').onclick = p1;
  </script>`;
  const form = (sujeto: string) => ({ tipo: 'formulario' as const, sujeto, consulta: 'Buscar', campos: [
    { campo: `tipo-${sujeto}`, etiqueta: 'Tipo de identificación', control: 'select', dato: 'tipoIdentificacion' as const, obligatorio: true },
    { campo: `numero-${sujeto}`, etiqueta: 'Número de identificación', control: 'text', dato: 'numeroIdentificacion' as const, obligatorio: true },
    { campo: `nombre-${sujeto}`, etiqueta: 'Primer nombre', control: 'text', dato: 'primerNombre' as const, obligatorio: false },
    { campo: `correo-${sujeto}`, etiqueta: 'Correo electrónico', control: 'text', dato: 'correo' as const, obligatorio: true }] });
  const ruta = (accionesUno: RutaE2E['pantallas'][number]['acciones'] = ['consultar-persona', 'diligenciar-obligatorios', 'avanzar']): Pick<RutaE2E, 'pantallas'> => ({ pantallas: [
    { pantalla: 'origen', origen: true, titulo: 'Origen sintético', preparacion: { tipo: 'ninguna' }, salida: { transicion: 't0', hacia: 'uno', avance: 'Continuar' }, acciones: ['avanzar'] },
    { pantalla: 'uno', titulo: 'Persona uno', preparacion: form('a'), salida: { transicion: 't1', hacia: 'dos', avance: 'Continuar' }, acciones: accionesUno },
    { pantalla: 'dos', titulo: 'Persona dos', preparacion: form('b'), salida: { transicion: 't2', hacia: 'docs', avance: 'Continuar' }, acciones: ['consultar-persona', 'diligenciar-obligatorios', 'avanzar'] },
    { pantalla: 'docs', titulo: 'Documentos sintéticos', preparacion: { tipo: 'documentos', campos: [{ campo: 'doc', etiqueta: 'Documento sintético', control: 'archivo', obligatorio: true }] },
      salida: { transicion: 't3', hacia: 'fin', avance: 'Continuar' }, acciones: ['cargar-documentos', 'avanzar'] },
    { pantalla: 'fin', titulo: 'Fin sintético', preparacion: { tipo: 'ninguna' }, acciones: [] },
  ] });
  const VALORES: Record<string, Record<string, string>> = {
    a: { tipoIdentificacion: 'Cédula de Ciudadanía', numeroIdentificacion: '1001', correo: 'persona.a@example.test' },
    b: { tipoIdentificacion: 'Pasaporte', numeroIdentificacion: '2002', correo: 'persona.b@example.test' },
  };
  const deps = (page: import('@playwright/test').Page, valores = VALORES, observadas: string[] = []) => ({
    page, timeoutMs: 5_000, prepararEtapa: async () => { throw new Error('sin etapas en la ruta sintética'); },
    valores: { valor: (s: string, d: string) => valores[s]?.[d], archivo: (c: string) => (c === 'doc' ? ARCHIVO : undefined) },
    observar: async (p: string, n: number) => { observadas.push(`${p}:${n}`); },
  });

  test('una misma implementación de consultar-persona y diligenciar-obligatorios sirve a dos sujetos/pantallas; documentos y avance genéricos', async ({ page }) => {
    await page.setContent(HTML);
    const observadas: string[] = [];
    const r = await recorrerRuta(ruta(), deps(page, VALORES, observadas));
    expect(r.llegadas).toEqual(['origen', 'uno', 'dos', 'docs', 'fin']);
    expect(r.acciones.filter(a => a.accion === 'consultar-persona').map(a => a.pantalla)).toEqual(['uno', 'dos']);
    expect(r.acciones.filter(a => a.accion === 'diligenciar-obligatorios').map(a => a.pantalla)).toEqual(['uno', 'dos']);
    expect(observadas).toEqual(['origen:0', 'origen:1', 'uno:0', 'uno:1', 'uno:2', 'uno:3', 'dos:0', 'dos:1', 'dos:2', 'dos:3', 'docs:0', 'docs:1', 'docs:2', 'fin:0']);
    await expect(page.getByText('Fin sintético', { exact: true })).toBeVisible();
  });

  test('un obligatorio sin dato del sujeto -> DataGap con ids (nunca valores), en la pantalla correcta', async ({ page }) => {
    await page.setContent(HTML);
    const sinCorreo = { ...VALORES, b: { tipoIdentificacion: 'Pasaporte', numeroIdentificacion: '2002' } };
    const error = await recorrerRuta(ruta(), deps(page, sinCorreo)).then(() => undefined, (e: Error) => e);
    expect(error).toBeInstanceOf(DataGapRecorridoError);
    expect([(error as DataGapRecorridoError).pantalla, (error as DataGapRecorridoError).campos]).toEqual(['dos', ['correo-b']]);
    expect(error!.message).not.toMatch(/2002|Pasaporte|example/);
  });

  test('un avanzar que no es la última acción es un INTENTO: la pantalla se conserva para observar la validación', async ({ page }) => {
    await page.setContent(HTML);
    const observadas: string[] = [];
    const r = await recorrerRuta(ruta(['consultar-persona', 'avanzar', 'diligenciar-obligatorios', 'avanzar']), deps(page, VALORES, observadas));
    expect(r.acciones.filter(a => a.pantalla === 'uno').map(a => a.accion)).toEqual(['consultar-persona', 'avanzar', 'diligenciar-obligatorios', 'avanzar']);
    expect(observadas).toContain('uno:2'); // tras el intento, aún en "Persona uno"
    expect(r.llegadas.at(-1)).toBe('fin');
  });

  test('avanzar ubica el botón por su TEXTO visible (aunque el nombre accesible difiera) y rechaza un texto ambiguo', async ({ page }) => {
    // Hallazgo QA: el "Continuar" del Portal no expone ese nombre accesible; el runner validado lo ubica por texto visible.
    await page.setContent(`<h2>Uno</h2><button aria-label="ir al siguiente paso" onclick="document.body.innerHTML='<h2>Dos</h2>'">Continuar</button>`);
    await avanzar(page, 'Continuar', 'Dos', 3_000);
    await expect(page.getByText('Dos', { exact: true })).toBeVisible();
    await page.setContent(`<h2>Uno</h2><button>Continuar</button><button>Continuar</button>`);
    const e = await avanzar(page, 'Continuar', 'Dos', 1_000).then(() => undefined, (x: Error) => x);
    expect(e?.message).toMatch(/exactamente un botón visible "Continuar"/);
  });

  test('rutaEjecutable: solo el prefijo sin bloqueos; una pantalla bloqueada para operar se observa sin actuar', () => {
    const p = ruta().pantallas;
    const bloqueo = { pantalla: 'dos', clasificacion: 'KNOWLEDGE_GAP' as const, motivo: 'm', raiz: { id: 'r', bloquea: 'recorrido' as const } };
    const corta = rutaEjecutable({ origen: 'origen', pantallas: p, bloqueosHasta: { uno: [], dos: [], docs: [bloqueo], fin: [bloqueo] }, bloqueosEn: { dos: [bloqueo] }, problemas: [bloqueo], datosTransito: [] });
    expect(corta.map(x => [x.pantalla, x.acciones.length])).toEqual([['origen', 1], ['uno', 3], ['dos', 0]]);
  });
});

test.describe('Auditoría del lote kr-d388556f92e4935c ya aplicado', () => {
  const NAVEGACION: Record<string, string[]> = { pantallas: ['titulo', 'etapa', 'consulta'], campos: ['etiqueta', 'dato', 'obligatorio'] };
  test('solo creó lo nuevo (1 pantalla + 5 transiciones) y los completar solo añadieron navegación con la descripción aprobada intacta', () => {
    const entradas = ALMACEN_APLICACION_AFI.historial.filter(h => h.lote === 'kr-d388556f92e4935c');
    const props = new Map(LOTE_NAVEGACION.propuestas.map(p => [p.proposalId, p.propuesta]));
    const creadas = entradas.filter(h => !props.get(h.propuesta)!.operacion).map(h => `${h.tipo}:${h.entidad}`);
    expect(creadas.sort()).toEqual(['pantalla-ui:pantalla-direccion', ...LOTE_NAVEGACION.propuestas.filter(p => p.propuesta.entidad.tipo === 'transicion-ui').map(p => `transicion-ui:${p.propuesta.entidad.id}`)].sort());
    const ent = ALMACEN_APLICACION_AFI.entidades as unknown as Record<string, Record<string, unknown>[]>;
    for (const h of entradas.filter(x => props.get(x.propuesta)!.operacion === 'completar')) {
      const { tipo, id, descripcion, ...agregados } = props.get(h.propuesta)!.entidad as unknown as Record<string, unknown>;
      const col = tipo === 'pantalla-ui' ? 'pantallas' : 'campos';
      const e = ent[col].find(x => x.id === id)!;
      expect(e.descripcion, String(id)).toBe(descripcion); // semántica aprobada intacta
      for (const [k, v] of Object.entries(agregados)) { expect(NAVEGACION[col], `${String(id)}.${k}`).toContain(k); expect(e[k], `${String(id)}.${k}`).toEqual(v); }
    }
    // Nada aprobado antes se perdió: toda entidad con entrada de creación sigue en el almacén.
    for (const h of ALMACEN_APLICACION_AFI.historial) expect(MODELO_APLICACION_AFI.ui.pantallas.concat(MODELO_APLICACION_AFI.ui.campos, MODELO_APLICACION_AFI.ui.transiciones,
      MODELO_APLICACION_AFI.proceso.actividades.map(a => a.id), MODELO_APLICACION_AFI.proceso.rutas.map(r => r.id), MODELO_APLICACION_AFI.integraciones.map(x => x.id),
      MODELO_APLICACION_AFI.variables.map(v => v.id), MODELO_APLICACION_AFI.notificaciones.map(n => n.id)), h.entidad).toContain(h.entidad);
  });
});

test.describe('Información de contacto PJ: etapa y familia por perfil (política, no runner)', () => {
  const empresa = actorDesdeEntorno('empresa', {}), independiente = actorDesdeEntorno('independiente', {});
  const campos = (etapa: Parameters<typeof resolverEtapa>[0], actor = empresa) => {
    const plan = resolverEtapa(etapa, { actor });
    return [...plan.resoluciones.map(x => x.campo), ...plan.gaps.map(g => g.campo)].sort();
  };
  test('empresa PJ usa la etapa y familia observadas (teléfonos en contacto; departamento/ciudad mat-select)', () => {
    const pj = politicasDelPerfil('empresa');
    expect([pj.numeroCelular.etapa, pj.numeroTelefonoFijo.etapa, pj.departamento.control, pj.ciudadVivienda.control])
      .toEqual(['informacion-contacto', 'informacion-contacto', 'select', 'select']);
    expect([pj.numeroCelular.perfiles, pj.numeroTelefonoFijo.obligatorioParaAvanzar]).toEqual([['independiente', 'pensionado', 'facultativo', 'empresa'], true]);
    expect(pj.numeroCelular.evidencia).toMatch(/empresa: Exploración QA Empleador PJ/);
    expect(campos('informacion-contacto')).toEqual(['ciudadVivienda', 'departamento', 'numeroCelular', 'numeroTelefonoFijo']);
    expect(campos('telefonos')).toEqual([]); // PJ no tiene pantalla Teléfonos
  });
  test('independiente (y los demás perfiles) conservan EXACTAMENTE su configuración', () => {
    for (const perfil of ['independiente', 'pensionado', 'facultativo'] as const) {
      const ef = politicasDelPerfil(perfil);
      for (const c of Object.keys(POLITICAS_AFI) as CampoAfi[]) expect(ef[c], `${perfil}.${c}`).toBe(POLITICAS_AFI[c]);
    }
    expect([POLITICAS_AFI.numeroCelular.etapa, POLITICAS_AFI.departamento.control]).toEqual(['telefonos', 'autocomplete']);
    expect(campos('telefonos', independiente)).toEqual(['numeroCelular', 'numeroTelefonoFijo']);
    expect(campos('informacion-contacto', independiente)).toEqual(['barrio', 'ciudadVivienda', 'departamento', 'localidad']);
  });
  test('el driver se elige por política + capacidad (familia), nunca por el nombre del campo', () => {
    // Misma etapa y campo: con la familia de la política de empresa (select) hay capacidad; con la de independiente (autocomplete) no.
    expect(capacidad('informacion-contacto', 'departamento', 'ruta')?.control).toBe(politicasDelPerfil('empresa').departamento.control);
    expect(capacidad('informacion-contacto', 'departamento', 'ruta')?.control).not.toBe(politicasDelPerfil('independiente').departamento.control);
    // Una variante SINTÉTICA de política cambia el plan sin tocar código: la etapa sale de la política efectiva del perfil.
    const sintetica = { ...POLITICAS_AFI, numeroCelular: { ...POLITICAS_AFI.numeroCelular, porPerfil: { facultativo: { etapa: 'informacion-adicional' as const, evidencia: 'sintética' } } } } as Readonly<Record<CampoAfi, PoliticaCampo>>;
    const fac = actorDesdeEntorno('facultativo', {});
    const enAdicional = resolverEtapa('informacion-adicional', { actor: fac }, sintetica);
    expect([...enAdicional.resoluciones, ...enAdicional.gaps].map(x => x.campo)).toContain('numeroCelular');
    // El recorrido compila la familia de la política: un perfil cuya familia no tiene capacidad deriva un CAPABILITY explícito.
    const conAutocomplete = { ...POLITICAS_AFI, departamento: { ...POLITICAS_AFI.departamento, porPerfil: {} } } as Readonly<Record<CampoAfi, PoliticaCampo>>;
    const plan = compilar(caso('cp02'), { ...conModelo(modeloProyectado()), politicas: conAutocomplete });
    expect(plan.recorrido.bloqueosEn['informacion-contacto'].map(b => b.raiz.id)).toContain('capability:preparar-etapa:informacion-contacto');
    expect(compilar(caso('cp02'), conModelo(modeloProyectado())).recorrido.bloqueosEn['informacion-contacto']).toEqual([]);
  });
});

test.describe('Evidencia QA Dirección PJ (exploración sanitizada) frente al modelo', () => {
  const fx = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/estructura-direccion-pj-qa-observada.json'), 'utf8')) as {
    contactoDiligenciado: { botones: { texto: string; habilitado: boolean }[]; controles: { identidad: string; invalido: boolean }[] };
    direccion: { encabezados: string[]; controles: { identidad: string; familia: string; etiqueta?: string; requerido: boolean; soloLectura: boolean; invalido: boolean }[];
      restricciones: { identidad: string; maxlength: string | null }[]; catalogos: { identidad: string; total: number; opciones: string[] }[] };
  };
  test('contacto PJ diligenciado con la política efectiva de empresa: todo válido y Continuar habilitado', () => {
    expect(fx.contactoDiligenciado.controles.every(c => !c.invalido)).toBe(true);
    expect(fx.contactoDiligenciado.botones.find(b => b.texto === 'Continuar')).toBeDefined();
  });
  test('Dirección PJ: encabezado = título propuesto; obligatorios observados = los de la política; dirección completa es del sistema', () => {
    const p = (ENVELOPE.knowledgeProposals as KnowledgeProposal[]).find(x => x.entidad.id === 'pantalla-direccion')!;
    expect(fx.direccion.encabezados[0]).toBe((p.entidad as { titulo: string }).titulo);
    const obligatorios = fx.direccion.controles.filter(c => c.requerido || /\*\s*$/.test(c.etiqueta ?? '')).map(c => c.identidad);
    expect(obligatorios).toEqual(['viaPrincipal', 'numeroVp', 'numeroVg', 'numeroPredio']);
    expect((Object.keys(POLITICAS_AFI) as CampoAfi[]).filter(c => POLITICAS_AFI[c].etapa === 'direccion' && POLITICAS_AFI[c].obligatorioParaAvanzar === true))
      .toEqual(['viaPrincipal', 'numeroVp', 'numeroVg', 'numeroPredio']);
    expect(fx.direccion.controles.find(c => c.identidad === 'direccionCompleta')).toMatchObject({ soloLectura: true });
    // Restricciones visibles y catálogos públicos: base para el dominio de generación propuesto (no aplicado).
    expect(fx.direccion.restricciones.filter(r => ['numeroVp', 'numeroVg', 'numeroPredio'].includes(r.identidad)).map(r => r.maxlength)).toEqual(['3', '3', '3']);
    expect(fx.direccion.catalogos.find(c => c.identidad === 'viaPrincipal')!.total).toBe(15);
    // Política aplicada: empresa queda autorizada SOLO por su propia evidencia (no hereda la auxiliar de Independiente).
    expect(politicasDelPerfil('empresa').viaPrincipal.perfiles).toEqual(['independiente', 'empresa']);
    expect(politicasDelPerfil('empresa').viaPrincipal.auxiliar).toBeUndefined();
    expect(politicasDelPerfil('independiente').viaPrincipal).toBe(POLITICAS_AFI.viaPrincipal);
  });
});

test.describe('Generación sintética determinista (dominio observado, sin "primera opción")', () => {
  const dominio = ['Vía', 'Autopista', 'Calle', 'Avenida Calle', 'Carrera', 'Selecciona una opción'];
  test('mismo dominio + misma semilla = mismo valor, sin importar el orden del Portal; descarta marcadores', () => {
    const v = opcionDeDominio(dominio, 's|viaPrincipal');
    expect(opcionDeDominio([...dominio].reverse(), 's|viaPrincipal')).toBe(v);
    expect(dominio.slice(0, 5)).toContain(v);
    const distintas = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(x => opcionDeDominio(dominio, x)));
    expect(distintas.size).toBeGreaterThan(1); // no es una elección fija
  });
  test('enteros dentro del rango interior pedido, deterministas', () => {
    const xs = Array.from({ length: 50 }, (_, i) => enteroEnRango(10, 99, `s${i}`));
    expect(xs.every(x => x >= 10 && x <= 99)).toBe(true);
    expect(enteroEnRango(10, 99, 'fija')).toBe(enteroEnRango(10, 99, 'fija'));
    expect(() => enteroEnRango(5, 4, 'x')).toThrow('rango inválido');
  });
});

test.describe('Dirección PJ: aceptación demostrada y política generable PROPUESTA (no aplicada)', () => {
  const fx = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/estructura-direccion-pj-qa-observada.json'), 'utf8')) as {
    diligencia: { valores: Record<string, string>; continuarHabilitado: boolean; avanzo: boolean; direccionDiligenciada: { controles: { identidad: string; vacio: boolean; soloLectura: boolean }[] } };
    representanteLegal: { encabezados: string[]; botones: { texto: string }[]; controles: { identidad: string; vacio: boolean }[] };
  };
  const PROP = JSON.parse(readFileSync(resolve(__dirname, '../intake/politica-direccion-empresa.propuesta.json'), 'utf8'));
  test('solo los 4 obligatorios generados -> Continuar habilitado y se llega a "Representante legal"; opcionales vacíos; dirección completa del sistema', () => {
    expect(Object.keys(fx.diligencia.valores)).toEqual(['viaPrincipal', 'numeroVp', 'numeroVg', 'numeroPredio']);
    expect([fx.diligencia.continuarHabilitado, fx.diligencia.avanzo]).toEqual([true, true]);
    const c = Object.fromEntries(fx.diligencia.direccionDiligenciada.controles.map(x => [x.identidad, x]));
    for (const opcional of ['letrasVp', 'sectorVp', 'letrasVg', 'caracteristica', 'numeroCaract', 'informacion']) expect(c[opcional].vacio, opcional).toBe(true);
    expect(c.direccionCompleta).toMatchObject({ soloLectura: true, vacio: false });
    // Los valores son los de la estrategia determinista (no la primera opción del catálogo).
    expect(fx.diligencia.valores.viaPrincipal).toBe(opcionDeDominio(JSON.parse(readFileSync(resolve(__dirname, 'fixtures/estructura-direccion-pj-qa-observada.json'), 'utf8'))
      .direccion.catalogos.find((x: { identidad: string }) => x.identidad === 'viaPrincipal').opciones, 'exploracion-direccion-pj|empresa|direccion|viaPrincipal|v1'));
  });
  test('Representante legal observado: título real y botón de consulta real (resuelven el NEEDS_CHANGES con evidencia)', () => {
    expect(fx.representanteLegal.encabezados[0]).toBe('Representante legal');
    expect(fx.representanteLegal.botones.map(b => b.texto)).toEqual(expect.arrayContaining(['Buscar representante', 'Continuar']));
    expect(fx.representanteLegal.controles.map(x => [x.identidad, x.vacio])).toEqual([['tipoIdentificacion', true], ['numeroIdentificacion', true]]);
  });
  test('la propuesta aplicada en memoria autoriza GENERATED solo a empresa, con evidencia PJ, y libera la ruta en Dirección; el código real no cambia', () => {
    const pol = { ...POLITICAS_AFI } as Record<CampoAfi, PoliticaCampo>;
    for (const [c, x] of Object.entries(PROP.campos) as [CampoAfi, { variante: { generable?: Record<string, unknown> } }][]) {
      pol[c] = { ...pol[c], porPerfil: { empresa: { ...x.variante, ...(x.variante.generable ? { generable: { ...x.variante.generable, evidencia: PROP.evidencia } } : {}), evidencia: PROP.evidencia.referencia } as never } };
    }
    const pj = politicasDelPerfil('empresa', pol);
    expect([pj.viaPrincipal.generable?.estrategia, pj.numeroVp.generable?.restricciones, pj.viaPrincipal.auxiliar]).toEqual(['opcion-dominio', { min: 10, max: 99, maxlength: 3 }, undefined]);
    expect(pj.viaPrincipal.generable?.evidencia.referencia).toMatch(/Exploración QA Dirección Empleador PJ/);
    expect(JSON.stringify(PROP)).not.toMatch(/14\.12|HU 14/);
    expect(politicasDelPerfil('independiente', pol).viaPrincipal.auxiliar).toEqual(POLITICAS_AFI.viaPrincipal.auxiliar);
    expect(compilar(caso('cp02'), { ...conModelo(modeloProyectado()), politicas: pol }).recorrido.bloqueosEn['pantalla-direccion']).toEqual([]);
    // La política aplicada en código coincide con la propuesta (mismas estrategias y restricciones).
    for (const c of ['viaPrincipal', 'numeroVp', 'numeroVg', 'numeroPredio'] as const) {
      expect(POLITICAS_AFI[c].porPerfil!.empresa!.generable!.estrategia, c).toBe(PROP.campos[c].variante.generable.estrategia);
    }
    for (const c of ['letrasVp', 'sectorVp', 'letrasVg'] as const) expect(POLITICAS_AFI[c].porPerfil!.empresa!.obligatorioParaAvanzar, c).toBe(false);
  });
});

test.describe('GENERATED en runtime: resolver y driver (política Dirección PJ)', () => {
  test('empresa: los 4 obligatorios se resuelven como generated (deterministas por caso), los opcionales no se planifican', () => {
    const plan = resolverEtapa('direccion', { actor: actorDesdeEntorno('empresa', {}), semilla: 'HU|CP|1' });
    expect(plan.gaps).toEqual([]);
    const por = Object.fromEntries(plan.resoluciones.map(r => [r.campo, r]));
    expect(Object.keys(por)).toEqual(['viaPrincipal', 'numeroVp', 'numeroVg', 'numeroPredio']);
    expect(Object.values(por).every(r => r.origen === 'generated')).toBe(true);
    expect(por.viaPrincipal.estrategia).toMatchObject({ tipo: 'generated-option', semilla: 'HU|CP|1|viaPrincipal' });
    for (const c of ['numeroVp', 'numeroVg', 'numeroPredio']) expect(Number(por[c].valor)).toBeGreaterThanOrEqual(10);
    expect(resolverEtapa('direccion', { actor: actorDesdeEntorno('empresa', {}), semilla: 'HU|CP|1' }).resoluciones.map(r => r.valor))
      .toEqual(plan.resoluciones.map(r => r.valor)); // determinista
  });
  test('independiente conserva su resolución auxiliar del piloto', () => {
    const plan = resolverEtapa('direccion', { actor: actorDesdeEntorno('independiente', {}) });
    expect(plan.resoluciones.every(r => r.origen === 'auxiliary')).toBe(true);
    expect(plan.resoluciones.map(r => r.campo)).toEqual(expect.arrayContaining(['letrasVp', 'sectorVp', 'letrasVg']));
  });
  test('el driver elige la opción generada sobre el catálogo en pantalla (no la primera)', async ({ page }) => {
    await page.setContent(`<div role="combobox" id="via" aria-controls="panel" aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');document.getElementById('panel').style.display='block'">via</div>
      <div id="panel" role="listbox" style="display:none">${['Autopista', 'Avenida', 'Avenida Calle', 'Calle', 'Carrera'].map(o => `<div role="option" onclick="document.getElementById('panel').style.display='none';document.getElementById('via').textContent='${o}'">${o}</div>`).join('')}</div>`);
    const r = await new AfiliacionesPortal(page).elegirOpcionGeneradaEn(page.locator('#via'), 's|viaPrincipal');
    expect(r.seleccion).toBe(opcionDeDominio(['Autopista', 'Avenida', 'Avenida Calle', 'Calle', 'Carrera'], 's|viaPrincipal'));
    await expect(page.locator('#via')).toHaveText(r.seleccion);
  });
});
