import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validarDefinicionCasoAfi, type DefinicionCasoAfi } from '../data/afi/caso';
import { secretRefActor, validarSlot, type ActorSlot } from '../data/afi/datosPrueba/contrato';
import { recibirRequisitosDelAgente } from '../data/afi/datosPrueba/intake';
import { extraerEnvelope, salidaDatosPrueba } from '../data/afi/intakeAgente';
import { REGISTRO_DATOS_PRUEBA_AFI, diagnosticarSlot } from '../data/afi/datosPrueba/registro';
import { revisionDatosMd } from '../data/afi/datosPrueba/revisionMd';
import { agruparGapsRaiz, compilarPlanE2E, envelopeDatosE2E, metricasAutonomia, type ContextoCompilacionE2E, type PlanE2ECompilado } from '../data/afi/e2e/compilador';
import type { DatoE2E, DefinicionE2E } from '../data/afi/e2e/contrato';
import { etiquetaLimpia, evaluarColumnas, evaluarMensajes, evaluarPantalla } from '../data/afi/e2e/evaluadores';
import { estadoPaso, veredictoE2E, type ResultadoVerificacion } from '../data/afi/e2e/modelo';
import { cargarDefinicionCasoAfi } from '../data/afi/loader';
import { POLITICAS_AFI } from '../data/afi/politicas';
import { AfiliacionesPortal, SolicitudEnCursoError } from '../helpers/afiliacionesPortal';
import { clasificarErrorPortal, ejecutarCasoE2E, vistaPantalla } from '../helpers/e2e/ejecutorE2E';
import { tablaMarkdownE2E } from '../helpers/e2e/reporteE2E';

/**
 * Contrato E2E DECLARATIVO en .afi.json: validación (claves cerradas, combinaciones legales), compilación (gaps y Test Data
 * DERIVADOS), evaluadores puros y ejecutor. Sin QA real. CP01 se carga desde su .afi.json: no existe TypeScript del caso.
 */

const RUTA_CP01 = resolve(__dirname, '../data/afi/casos/hu7-14-cp01.afi.json');
const CP01 = (): DefinicionCasoAfi => JSON.parse(readFileSync(RUTA_CP01, 'utf8'));
const fixture = <T>(n: string): T => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', n), 'utf8'));
const EXCEL = fixture<{ pasos: { paso: number; accion: string; esperado: string }[] }>('hu7-14-cp01-excel.json');
const OBSERVADA = fixture<{ empresa: Parameters<typeof evaluarPantalla>[0]; contacto: Parameters<typeof evaluarPantalla>[0] }>('estructura-pj-qa-observada.json');
const PARAM = fixture<{ columnas: string[]; filas: string[][] }>('mensajes-site-afi-qa-observada.json');

const compilar = (def: DefinicionCasoAfi = CP01(), extra: Partial<ContextoCompilacionE2E> = {}): PlanE2ECompilado =>
  compilarPlanE2E(def.e2e!, { hu: def.hu, caso: def.caso, perfil: def.perfil, actorRef: def.actorRef, registro: REGISTRO_DATOS_PRUEBA_AFI, entorno: {}, ...extra });
const problemas = (def: unknown) => validarDefinicionCasoAfi(def).map(p => `${p.ruta}: ${p.mensaje}`);
const conE2E = (cambio: (e: DefinicionE2E) => void): DefinicionCasoAfi => { const d = CP01(); cambio(d.e2e!); return d; };
const req = (plan: PlanE2ECompilado, sujeto: string) => plan.requisitos.find(r => (r.rol ?? 'principal') === sujeto);
type Ejecutable = Extract<PlanE2ECompilado['pasos'][number]['verificaciones'][number], { estado: 'EJECUTABLE' }>;

test.describe('E2E 1-3. contrato .afi.json (claves cerradas y combinaciones legales)', () => {
  test('1. CP01 .afi.json valida; accion/esperado EXACTOS del Excel; sin gaps declarados ni TypeScript del caso', async () => {
    expect(problemas(CP01())).toEqual([]);
    const def = await cargarDefinicionCasoAfi(RUTA_CP01);
    expect(def.funcional).toBeUndefined();
    for (const p of def.e2e!.pasos) {
      const x = EXCEL.pasos.find(e => e.paso === p.paso)!;
      expect([p.accion, p.esperado], `paso ${p.paso}`).toEqual([x.accion, x.esperado]);
    }
    expect([...new Set(def.e2e!.pasos.map(p => p.paso))]).toEqual(Array.from({ length: 31 }, (_, i) => i + 2));
    const mobileExcel = EXCEL.pasos.filter(p => /versi[oó]n Mobile/i.test(p.accion)).map(p => p.paso);
    expect(def.e2e!.pasos.filter(p => p.dispositivo === 'mobile').map(p => p.paso)).toEqual(mobileExcel);
    expect(JSON.stringify(def)).not.toMatch(/_GAP|"gap"|"clasificacion"|btn-|\[formcontrolname/);
    expect(REGISTRO_DATOS_PRUEBA_AFI.slots.some(s => s.id === def.actorRef)).toBe(true);
    expect(readdirSync(resolve(__dirname, '../data/afi/casos')).filter(f => /cp01/i.test(f))).toEqual(['hu7-14-cp01.afi.json']);
  });

  test('2. una clave E2E desconocida falla (raíz, dato, verificación, tipo)', () => {
    expect(problemas(conE2E(e => { (e as unknown as Record<string, unknown>).gaps = []; }))).toContain('e2e.gaps: clave no admitida por el contrato E2E');
    expect(problemas(conE2E(e => { (e.datos[0] as unknown as Record<string, unknown>).clasificacion = 'X'; }))).toContain('e2e.datos[0].clasificacion: clave no admitida por el contrato E2E');
    expect(problemas(conE2E(e => { (e.pasos[0].verificaciones[0] as unknown as Record<string, unknown>).selector = 'x'; })))
      .toContain('e2e.pasos[0].verificaciones[0].selector: clave no admitida por el contrato E2E');
    expect(problemas(conE2E(e => { e.pasos[0].verificaciones = [{ tipo: 'gap' } as never]; })).join('\n')).toMatch(/tipo desconocido/);
  });

  test('3. combinaciones ilegales de uso/resolucion/aplicabilidad fallan', () => {
    const casos: [Partial<DatoE2E>, RegExp][] = [
      [{ uso: ['FILLER', 'SCENARIO'], resolucion: 'TEST_DATA' }, /FILLER excluye ASSERTION y SCENARIO/],
      [{ uso: ['SCENARIO'], resolucion: 'GENERATED' }, /GENERATED exige uso \["FILLER"\]/],
      [{ uso: ['SCENARIO'], resolucion: 'CASE_LITERAL', valor: '123' }, /campo secreto o de persona nunca es literal/],
      [{ uso: ['SCENARIO'], resolucion: 'TEST_DATA', valor: 'x' }, /TEST_DATA no lleva valor/],
      [{ uso: ['SCENARIO'], resolucion: 'SYSTEM', fuenteSistema: 'RUES' }, /SYSTEM admite solo \[\] o \["ASSERTION"\]/],
      [{ uso: [], resolucion: 'TEST_DATA' }, /solo SYSTEM admite uso vacío/],
      [{ uso: ['SCENARIO'], resolucion: 'TEST_DATA', aplicabilidad: 'aveces' as never }, /"siempre" \| \{ cuando \} \| \{ siPresenta \}/],
      [{ uso: ['SCENARIO'], resolucion: 'TEST_DATA', aplicabilidad: { cuando: { campo: 'correo', operador: 'igual', valor: ['x'] } } }, /lista solo con "en"/],
      [{ uso: ['SCENARIO'], resolucion: 'TEST_DATA', aplicabilidad: { cuando: { campo: 'campoInventado' as never, operador: 'igual', valor: 'x' } } }, /campo desconocido/],
    ];
    for (const [cambio, re] of casos) {
      const d = conE2E(e => { e.datos[0] = { ...e.datos[0], ...cambio } as DatoE2E; });
      expect(problemas(d).join('\n'), JSON.stringify(cambio)).toMatch(re);
    }
    // Condición sobre un dato NO declarado en e2e.datos.
    const sinRef = conE2E(e => { e.datos = e.datos.filter(d => !(d.sujeto === 'principal' && d.campo === 'afiliadoPrimeraVez')); });
    expect(problemas(sinRef).join('\n')).toMatch(/referencia un dato no declarado/);
  });
});

test.describe('E2E 4-9. compilación: gaps y Test Data derivados', () => {
  test('4. GENERATED sin autorización generable -> KNOWLEDGE_GAP derivado; con autorización del perfil se resuelve', () => {
    const def = conE2E(e => {
      // letrasVp: sin autorización generable para empresa (viaPrincipal SÍ la tiene desde la exploración Dirección PJ).
      e.datos.push({ campo: 'letrasVp', sujeto: 'principal', uso: ['FILLER'], resolucion: 'GENERATED', aplicabilidad: 'siempre' });
    });
    expect(problemas(def)).toEqual([]);
    const ubic = 'datos · principal.letrasVp';
    const gap = compilar(def).gaps.find(g => g.ubicacion === ubic);
    expect([gap?.clasificacion, gap?.motivo]).toEqual(['KNOWLEDGE_GAP', expect.stringContaining('no existe una autorización generable para el perfil empresa')]);
    const conGenerable = (perfiles: ('empresa' | 'independiente')[]) => ({ ...POLITICAS_AFI, letrasVp: { ...POLITICAS_AFI.letrasVp, porPerfil: {}, generable: {
      perfiles, etapa: 'direccion' as const, estrategia: 'opcion-dominio' as const, restricciones: {}, evidencia: { tipo: 'qa-observado' as const, referencia: 'sintético de prueba' } } } });
    expect(compilar(def, { politicas: conGenerable(['empresa']) }).gaps.some(g => g.ubicacion === ubic)).toBe(false);
    expect(compilar(def, { politicas: conGenerable(['independiente']) }).gaps.some(g => g.ubicacion === ubic)).toBe(true); // otro perfil no autoriza
    // Las únicas autorizaciones productivas son las de Dirección PJ (empresa), con evidencia de su exploración QA.
    expect(Object.values(POLITICAS_AFI).filter(p => p.generable)).toEqual([]);
    const autorizadas = (Object.keys(POLITICAS_AFI) as (keyof typeof POLITICAS_AFI)[]).filter(c => POLITICAS_AFI[c].porPerfil?.empresa?.generable);
    expect(autorizadas).toEqual(['viaPrincipal', 'numeroVp', 'numeroVg', 'numeroPredio']);
    for (const c of autorizadas) expect(POLITICAS_AFI[c].porPerfil!.empresa!.generable!.evidencia.referencia, c).toMatch(/Exploración QA Dirección Empleador PJ/);
  });

  test('5/8. TEST_DATA produce sus requisitos por sujeto; CASE_LITERAL y SYSTEM nunca producen secretos', () => {
    const plan = compilar();
    expect(plan.requisitos.map(r => r.rol ?? 'principal')).toEqual(['principal', 'representante-legal', 'contacto-caja', 'responsable-portal']);
    expect(req(plan, 'principal')).toMatchObject({ perfil: 'empresa', actorSugerido: 'empresa-empleador-juridico-rues-con-rep-legal',
      camposRequeridos: ['numeroIdentificacion', 'correo', 'afiliadoPrimeraVez', 'numeroTrabajadores', 'valorNomina', 'fechaInicioActividad', 'numeroCelular', 'numeroTelefonoFijo'],
      camposCondicionales: [{ campo: 'cajaCompensacionAnterior', cuando: { campo: 'afiliadoPrimeraVez', operador: 'igual', valor: 'No' } }] });
    expect(req(plan, 'contacto-caja')!.camposRequeridos).toEqual(['numeroIdentificacion', 'correo']); // tipo CASE_LITERAL y nombres SYSTEM excluidos
    expect(req(plan, 'responsable-portal')!.camposRequeridos).toEqual(['numeroIdentificacion']);
    expect(req(plan, 'representante-legal')).toMatchObject({ camposRequeridos: ['tipoIdentificacion'],
      camposCondicionales: ['primerNombre', 'segundoNombre', 'primerApellido', 'segundoApellido']
        .map(campo => ({ campo, cuando: { campo: 'tipoIdentificacion', operador: 'distinto', valor: 'Cédula de Ciudadanía' } })) });
    const todos = plan.requisitos.flatMap(r => [...r.camposRequeridos, ...(r.camposCondicionales ?? []).map(c => c.campo)]);
    for (const c of ['razonSocial', 'codigoCiiu', 'actividadEconomicaEmpresa', 'naturaleza', 'claseEmpleador']) expect(todos, c).not.toContain(c);
    expect(req(plan, 'contacto-caja')!.camposRequeridos).not.toContain('tipoIdentificacion');
    // Precondiciones -> condiciones (las del actor existente + las del caso, sin duplicar).
    expect(req(plan, 'principal')!.condiciones.map(c => c.id)).toEqual(expect.arrayContaining(['empleador-juridico-rues-con-rep-legal', 'sin-solicitud-afiliacion-en-curso']));
    expect(JSON.stringify(envelopeDatosE2E(plan))).not.toMatch(/AFI_[A-Z]/);
  });

  test('gaps derivados por el compilador (el archivo no declara ninguno): KNOWLEDGE / CAPABILITY / OBSERVABILITY / TEST_DATA', () => {
    const plan = compilar();
    const porClase = (c: string) => plan.gaps.filter(g => g.clasificacion === c).length;
    // Knowledge rev. 5 (ruta registrada): la navegación ya no es KNOWLEDGE en bloque; quedan las aserciones de pantalla
    // (CAPABILITY) y lo no observado de Knowledge.
    expect({ KNOWLEDGE: porClase('KNOWLEDGE_GAP'), CAPABILITY: porClase('CAPABILITY_GAP'), OBSERVABILITY: porClase('OBSERVABILITY_GAP'), TEST_DATA: porClase('TEST_DATA_GAP') })
      .toEqual({ KNOWLEDGE: 26, CAPABILITY: 13, OBSERVABILITY: 20, TEST_DATA: 5 });
    expect(plan.gaps.filter(g => g.clasificacion === 'TEST_DATA_GAP').map(g => g.ubicacion)).toEqual(['actor · principal', 'datos · principal', 'datos · representante-legal', 'datos · contacto-caja', 'datos · responsable-portal']);
    expect(plan.ejecutable).toBe(false);
    // Una pantalla ejecutable se resuelve a un MOMENTO del recorrido (etapa o punto funcional), nunca a un selector.
    const p8 = plan.pasos.find(p => p.paso === 8)!.verificaciones.find(v => v.estado === 'EJECUTABLE') as Ejecutable;
    expect(p8).toMatchObject({ momento: { etapa: 'informacion-empresa' } });
  });

  test('6/7. condicional: aplicable exige su dato; no aplicable no lo exige (evaluado antes de la UI)', () => {
    const slot: ActorSlot = {
      id: 'empresa-ficticia-condicional', perfil: 'empresa', condiciones: [{ id: 'clase-sintetica', descripcion: 'Empresa sintética de prueba' }],
      campos: [{ campo: 'numeroIdentificacion', fuente: 'slot' }, { campo: 'afiliadoPrimeraVez', fuente: 'slot' },
        { campo: 'cajaCompensacionAnterior', fuente: 'slot', cuando: { campo: 'afiliadoPrimeraVez', operador: 'igual', valor: 'No' } }],
      origen: { requisitos: [], ocurrencias: [] }, estado: 'provisionado',
    };
    expect(validarSlot(slot)).toEqual([]);
    const env = (afiliado: string, caja?: string) => ({ [secretRefActor(slot.id, 'numeroIdentificacion')]: 'sintetico-1', [secretRefActor(slot.id, 'afiliadoPrimeraVez')]: afiliado,
      ...(caja ? { [secretRefActor(slot.id, 'cajaCompensacionAnterior')]: caja } : {}) });
    const aplica = diagnosticarSlot(slot, env('No'));
    expect([aplica.status, aplica.missingFields]).toEqual(['MISSING_SECRET', ['cajaCompensacionAnterior']]);
    expect(diagnosticarSlot(slot, env('No', 'Caja sintética')).status).toBe('READY');
    const noAplica = diagnosticarSlot(slot, env('Si'));
    expect([noAplica.status, noAplica.missingFields]).toEqual(['READY', []]);
    // Una condición sobre un campo que el slot no tiene se rechaza.
    const mala = { ...slot, campos: [...slot.campos.slice(0, 2), { ...slot.campos[2], cuando: { campo: 'correo' as const, operador: 'igual' as const, valor: 'No' } }] };
    expect(validarSlot(mala)).not.toEqual([]);
  });

  test('9. distinto-sujeto llega a Test Data: requisitos, propuestas del intake y revisión humana', () => {
    const plan = compilar();
    const ids = Object.fromEntries(plan.requisitos.map(r => [r.rol ?? 'principal', r.id]));
    expect(req(plan, 'contacto-caja')!.distintoDe).toEqual([ids['representante-legal'], ids['responsable-portal']]);
    expect(req(plan, 'responsable-portal')!.distintoDe).toEqual([ids['representante-legal'], ids['contacto-caja']]);
    // Misma ruta que la CLI (datos preparar): envelope -> dimensión Test Data -> intake.
    const lote = recibirRequisitosDelAgente(salidaDatosPrueba(extraerEnvelope(JSON.stringify(envelopeDatosE2E(plan)))), REGISTRO_DATOS_PRUEBA_AFI);
    expect(lote.rechazados).toEqual([]);
    const caja = lote.propuestas.find(p => p.propuesta.requisitos.includes(ids['contacto-caja']))!.propuesta;
    expect([caja.slot.sujeto, caja.distintoDe]).toEqual(['participante', [ids['representante-legal'], ids['responsable-portal']]]);
    const md = revisionDatosMd(lote, 'colsubsidio', REGISTRO_DATOS_PRUEBA_AFI);
    expect(md).toContain('Debe ser un sujeto DISTINTO del de:');
    expect(md).toMatch(/solo si/);
  });
});

test.describe('E2E 10. un caso nuevo entra sin spec ni TypeScript por caso', () => {
  test('un .afi.json sintético de otra HU se carga, valida y compila con el mismo entry point', async () => {
    const ruta = join(mkdtempSync(join(tmpdir(), 'afi-e2e-')), 'hu-sintetica-cp09.afi.json');
    writeFileSync(ruta, JSON.stringify({
      version: 1, hu: 'HU sintetica', caso: 'CP09', nombre: 'Caso sintético', perfil: 'empresa',
      preparacion: { datosCaso: { tipoAportante: 'Empleador' }, camposAsercion: [], etapas: ['inicio-solicitud'] },
      e2e: { version: 1, datos: [], pasos: [
        { paso: 1, accion: 'Abrir', esperado: 'Carga', verificaciones: [{ tipo: 'portal-apertura' }] },
        { paso: 2, accion: 'Ver contacto', esperado: 'Título', verificaciones: [{ tipo: 'pantalla', pantalla: 'informacion-contacto', expectativa: { titulo: { texto: 'Título sintético' } } }] },
        { paso: 3, accion: 'Otra', esperado: 'x', verificaciones: [{ tipo: 'pantalla', pantalla: 'pantalla-inexistente', expectativa: { titulo: { texto: 'x' } } }] },
      ] },
    }), 'utf8');
    const def = await cargarDefinicionCasoAfi(ruta);
    expect(compilar(def).pasos.map(p => p.verificaciones.map(v => v.estado === 'GAP' ? v.gap.clasificacion : 'EJECUTABLE')))
      .toEqual([['EJECUTABLE'], ['EJECUTABLE'], ['KNOWLEDGE_GAP']]);
    // El harness genérico decide E2E por el CONTENIDO del archivo; ningún spec referencia un CP concreto.
    const harness = readFileSync(resolve(__dirname, 'afi-case-file.spec.ts'), 'utf8');
    expect(harness).toMatch(/DECLARA_E2E/);
    expect(harness).not.toMatch(/hu7-14|CP01|HU7_14/);
    for (const f of readdirSync(__dirname).filter(n => n.endsWith('.ts') && n !== 'afi-e2e.unit.spec.ts')) expect(readFileSync(resolve(__dirname, f), 'utf8'), f).not.toMatch(/hu7-14-cp01\.e2e|HU7_14_CP01/);
  });

  test('el código del framework no contiene lógica específica de un CP', () => {
    for (const f of ['helpers/e2e/ejecutorE2E.ts', 'helpers/e2e/reporteE2E.ts', 'data/afi/e2e/evaluadores.ts', 'data/afi/e2e/modelo.ts', 'data/afi/e2e/contrato.ts',
      'data/afi/e2e/compilador.ts', 'helpers/parametricaBizagi.ts', 'tests/afi-case-file.spec.ts']) {
      expect(readFileSync(resolve(__dirname, '..', f), 'utf8'), f).not.toMatch(/CP01|HU7_14|Mensajes Site AFI|Tipo de sociedad|con-rep-legal|CAFAM/);
    }
  });

  test('ejecutor: un plan solo con gaps no abre Portal ni Bizagi y queda PARTIAL/BLOCKED (nunca verde por omisión)', async () => {
    const plan: PlanE2ECompilado = { pasos: [{ paso: 1, accion: 'a', esperado: 'b', dispositivo: 'desktop',
      verificaciones: [{ estado: 'GAP', tipo: 'accion', gap: { ubicacion: 'u', clasificacion: 'CAPABILITY_GAP', motivo: 'm', raiz: { id: 'capability:accion:x', bloquea: 'recorrido' } } }] }],
    requisitos: [], diagnosticosDatos: [], metricasDatos: { porRequisito: [], camposCaso: { min: 0, max: 0 }, disponibles: 0, nuevos: { min: 0, max: 0 }, noProvisionables: [] },
    recorrido: { origen: 'x', pantallas: [], bloqueosHasta: {}, bloqueosEn: {}, problemas: [], datosTransito: [] },
    actor: { requerido: false, actorRef: null, demostrado: true, faltantes: [] },
    fidelidad: { pasos: 1, pasosValidos: 1, semanticasExactas: 1, semanticasAproximadas: 0, semanticasNoRepresentables: 0, detalle: [] }, gaps: [], ejecutable: false };
    const r = await ejecutarCasoE2E(plan, {} as never);
    expect([r.portal, r.pasos.map(p => p.estado), veredictoE2E(r.pasos)]).toEqual([[], ['BLOCKED'], 'PARTIAL/BLOCKED']);
    expect(tablaMarkdownE2E({ hu: 'h', caso: 'c' }, plan, r.pasos, veredictoE2E(r.pasos))).toContain('CAPABILITY_GAP: m');
  });
});

test.describe('E2E independencia: CP02 entra solo con su .afi.json; métricas y gaps raíz', () => {
  const RUTA_CP02 = resolve(__dirname, '../data/afi/casos/hu7-14-cp02.afi.json');
  const EXCEL_CP02 = fixture<{ pasos: { paso: number; accion: string; esperado: string }[] }>('hu7-14-cp02-excel.json');

  test('CP02 valida y compila sin código propio; accion/esperado EXACTOS del Excel; nada del framework lo nombra', async () => {
    const def = await cargarDefinicionCasoAfi(RUTA_CP02);
    expect(problemas(def)).toEqual([]);
    for (const p of def.e2e!.pasos) {
      const x = EXCEL_CP02.pasos.find(e => e.paso === p.paso)!;
      expect([p.accion, p.esperado], `paso ${p.paso}`).toEqual([x.accion, x.esperado]);
    }
    expect(def.e2e!.pasos.map(p => p.paso)).toEqual(EXCEL_CP02.pasos.filter(p => p.paso > 1).map(p => p.paso));
    const plan = compilar(def);
    expect(metricasAutonomia(plan).declaradas).toBe(49);
    // Cero cambios específicos: ningún archivo de código (framework, helpers, harness, CLI) referencia el caso.
    const codigo = ['helpers', 'data/afi/e2e', 'data/afi/datosPrueba', 'data/afi/aplicacion'].flatMap(d =>
      readdirSync(resolve(__dirname, '..', d)).filter(f => f.endsWith('.ts')).map(f => resolve(__dirname, '..', d, f)));
    for (const f of [...codigo, resolve(__dirname, '../data/afi/caso.ts'), resolve(__dirname, '../data/afi/loader.ts'), resolve(__dirname, 'afi-case-file.spec.ts')]) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/hu7-14-cp0[12]|HU7_14_CP0|sin-rep-legal|con-rep-legal/);
    }
  });

  test('métrica de Test Data: campos del caso ≠ valores nuevos; celular y fijo cuentan por separado; lo provisionado no es nuevo', async () => {
    const cp01 = compilar().metricasDatos;
    expect([cp01.camposCaso, cp01.disponibles, cp01.nuevos]).toEqual([{ min: 12, max: 17 }, 2, { min: 10, max: 15 }]);
    const p1 = cp01.porRequisito.find(m => m.sujeto === 'principal')!;
    expect(p1).toMatchObject({ camposCaso: { min: 8, max: 9 }, disponibles: ['numeroIdentificacion', 'correo'], nuevosRango: { min: 6, max: 7 },
      nuevosCondicionales: ['cajaCompensacionAnterior'] });
    expect(p1.nuevos).toEqual(expect.arrayContaining(['numeroCelular', 'numeroTelefonoFijo']));
    // Departamento, ciudad y dirección ya no se declaran: son de tránsito (los deriva la ruta; auxiliares/derivados no piden Test Data).
    expect(cp01.noProvisionables).toEqual([]);
    const cp02 = compilar(await cargarDefinicionCasoAfi(RUTA_CP02)).metricasDatos;
    expect([cp02.camposCaso, cp02.disponibles, cp02.nuevos]).toEqual([{ min: 13, max: 14 }, 7, { min: 7, max: 7 }]);
    expect(cp02.porRequisito.find(m => m.sujeto === 'principal')!.nuevos).toEqual(['numeroCelular', 'numeroTelefonoFijo']);
  });

  test('gaps agrupados por causa raíz reutilizable; recorrido antes que aserciones; raíces compartidas entre casos', async () => {
    const p1 = compilar(), p2 = compilar(await cargarDefinicionCasoAfi(RUTA_CP02));
    expect(p1.gaps.every(g => g.raiz.id.length > 0)).toBe(true);
    const r1 = agruparGapsRaiz([{ caso: 'CP01', plan: p1 }]);
    expect([p1.gaps.length, r1.length, r2len(p2)]).toEqual([64, 26, 20]);
    // Prioridad: todo lo que bloquea el recorrido va antes que lo que solo bloquea una aserción; diseño es P3 (no cerrable).
    const orden = r1.map(g => g.prioridad);
    expect(orden).toEqual([...orden].sort());
    expect(r1.filter(g => g.prioridad === 'P1').every(g => g.bloquea === 'recorrido')).toBe(true);
    expect(r1.find(g => g.raiz === 'observacion:conformidad-diseno')!.prioridad).toBe('P3');
    // Con la ruta en Knowledge desaparece la raíz en bloque; ninguna capability de navegación falta.
    expect(r1.some(g => g.raiz === 'knowledge:transicion-ui:desde:informacion-contacto')).toBe(false);
    expect(r1.some(g => /capability:(recorrido|accion:(consultar-persona|diligenciar-obligatorios|cargar-documentos))/.test(g.raiz))).toBe(false);
    const ambos = agruparGapsRaiz([{ caso: 'CP01', plan: p1 }, { caso: 'CP02', plan: p2 }]);
    const compartidas = ambos.filter(g => g.casos.length === 2).map(g => g.raiz);
    expect(compartidas).toEqual(expect.arrayContaining(['observacion:proveedor-integraciones',
      'test-data:provision:representante-legal', 'capability:accion:descargar-formulario']));
    const m2 = metricasAutonomia(p2);
    expect([m2.declaradas, m2.verificacionesCompiladas === m2.verificaciones, m2.gapsRaiz, m2.testDataNuevos]).toEqual([49, true, 20, { min: 7, max: 7 }]);
    // Capabilities que CP02 necesita y CP01 no: ninguna.
    const cap1 = new Set(metricasAutonomia(p1).capabilitiesRaiz);
    expect(m2.capabilitiesRaiz.filter(c => !cap1.has(c))).toEqual([]);
  });
});
const r2len = (p: PlanE2ECompilado) => agruparGapsRaiz([{ caso: 'x', plan: p }]).length;

test.describe('E2E: evaluadores puros (incluida estructura REAL observada en QA)', () => {
  const v = (estado: ResultadoVerificacion['estado']): ResultadoVerificacion => ({ tipo: 'x', estado, detalle: '' });
  test('estado de paso y veredicto: FAIL > BLOCKED > PARTIAL > PASS; E2E PASS solo si todo pasa', () => {
    expect([estadoPaso([v('PASS')]), estadoPaso([v('PASS'), v('BLOCKED')]), estadoPaso([v('BLOCKED')]), estadoPaso([v('PASS'), v('FAIL')]), estadoPaso([])])
      .toEqual(['PASS', 'PARTIAL', 'BLOCKED', 'FAIL', 'BLOCKED']);
    const r = (estado: ResultadoVerificacion['estado']) => ({ paso: 1, dispositivo: 'desktop' as const, estado, verificaciones: [] });
    expect([veredictoE2E([r('PASS'), r('PASS')]), veredictoE2E([r('PASS'), r('BLOCKED')]), veredictoE2E([r('PASS'), r('FAIL'), r('BLOCKED')]), veredictoE2E([])])
      .toEqual(['E2E PASS', 'PARTIAL/BLOCKED', 'FAIL', 'PARTIAL/BLOCKED']);
  });

  test('columnas y mensajes exactos (sin contains); pantalla con título único, etiquetas sin "*" y miga por segmento', () => {
    const c = evaluarColumnas({ columnas: ['Código', 'Mensaje', 'Deshabilitada', 'Estado civil'], filas: [] }, ['Código', 'Mensaje', 'Estado']);
    expect([c.estado, c.detalle]).toEqual(['FAIL', 'Faltan columnas: Estado. Columnas observadas: Código, Mensaje, Deshabilitada, Estado civil']);
    const tabla = { columnas: ['Código', 'Mensaje'], filas: [['a', ' Texto  exacto. '], ['c', 'Dup'], ['d', 'Dup']] };
    expect(evaluarMensajes(tabla, 'Mensaje', [{ descripcion: 'x', texto: 'Texto exacto.' }]).estado).toBe('PASS');
    expect(evaluarMensajes(tabla, 'Mensaje', [{ descripcion: 'x', texto: 'Texto exacto' }]).estado).toBe('FAIL');
    expect(evaluarMensajes(tabla, 'Mensaje', [{ descripcion: 'dup', texto: 'Dup' }]).detalle).toContain('dup [coincidencias=2]');
    const p = { encabezados: ['Encabezado'], migas: ['Afiliaciones / Registro Información Cliente'],
      controles: [{ identidad: 'razonSocial', etiqueta: 'Razón social *' }, { identidad: 'x', placeholder: 'Campo oculto' }] };
    expect(etiquetaLimpia('Razón social *')).toBe('Razón social');
    expect(evaluarPantalla(p, { titulo: { texto: 'Encabezado', unico: true }, etiquetasPresentes: ['Razón social'] }).estado).toBe('PASS');
    expect(evaluarPantalla(p, { etiquetasAusentes: ['Campo oculto'] }).estado).toBe('FAIL'); // aparece como placeholder
    expect(evaluarPantalla(p, { migaContiene: 'Registro Información Cliente' }).estado).toBe('PASS');
    expect(evaluarPantalla(p, { migaContiene: 'Registro' }).estado).toBe('FAIL');
  });

  test('pasos 8/9/11 del .afi.json sobre la estructura PJ observada en QA; pasos 3/4 sobre la paramétrica REAL FALLAN', () => {
    const plan = compilar();
    const ej = (n: number, i = 0) => plan.pasos.find(p => p.paso === n && p.dispositivo === 'desktop')!.verificaciones.filter(x => x.estado === 'EJECUTABLE')[i] as Ejecutable;
    expect(evaluarPantalla(OBSERVADA.empresa, ej(8).expectativa!).estado).toBe('PASS');
    expect(evaluarPantalla(OBSERVADA.empresa, ej(9).expectativa!).estado).toBe('PASS');
    expect(evaluarPantalla(OBSERVADA.contacto, ej(11, 1).expectativa!).estado).toBe('PASS');
    expect(JSON.stringify(OBSERVADA)).not.toMatch(/"(value|valor)"|@|\d{6,}/);
    const p3 = ej(3).def as unknown as { columnas: string[] };
    const p4 = ej(4).def as unknown as { columnaMensaje: string; mensajes: { descripcion: string; texto: string }[] };
    expect(evaluarColumnas(PARAM, p3.columnas).detalle).toContain('Faltan columnas: Estado');
    const r4 = evaluarMensajes(PARAM, p4.columnaMensaje, p4.mensajes);
    expect(r4.estado).toBe('FAIL');
    for (const m of p4.mensajes) expect(r4.detalle).toContain(`${m.descripcion} [coincidencias=0]`);
  });

  test('vistaPantalla: por botón; punto funcional; o la estructura del fallo si estaba en esa pantalla (nunca otra)', () => {
    const est = (botones: string[]) => ({ encabezados: [], migas: [], controles: [], botones: botones.map(id => ({ id, texto: 'Continuar', habilitado: false })), alertas: [], tooltips: [], spinners: [] });
    const obs = { pantallas: [{ momento: 'antes-de-continuar', boton: 'btn-a', estructura: est(['btn-a']) }, { momento: 'fallo', boton: null, estructura: est(['btn-b']) }] };
    expect(vistaPantalla(obs, { boton: 'btn-a' })).toMatchObject({ enFallo: false, vista: { boton: 'btn-a' } });
    expect(vistaPantalla(obs, { boton: 'btn-b' })).toMatchObject({ enFallo: true, vista: { momento: 'fallo' } });
    expect([vistaPantalla(obs, { boton: 'btn-c' }), vistaPantalla(obs, 'punto-funcional')]).toEqual([undefined, undefined]);
  });
});

test.describe('Precondición tipificada: "Ya tienes una solicitud en curso"', () => {
  test('clasificación: TEST_DATA_GAP por la clase (no por el mensaje)', () => {
    expect(clasificarErrorPortal(new SolicitudEnCursoError())).toBe('TEST_DATA_GAP');
    expect(clasificarErrorPortal(Object.assign(new Error('x'), { name: 'DataGapPantallaError' }))).toBe('TEST_DATA_GAP');
    expect(clasificarErrorPortal(Object.assign(new Error('x'), { name: 'CapabilityGapPreparacionError' }))).toBe('CAPABILITY_GAP');
    expect(clasificarErrorPortal(new Error('timeout'))).toBe('FRAMEWORK');
  });

  test('enviarUnaVez reconoce la pantalla de solicitud en curso de inmediato, sin registrar caso ni reenviar', async ({ page }) => {
    await page.setContent(`<button id="btn-inicio-solicitud-continuar">Iniciar</button>
      <script>document.getElementById('btn-inicio-solicitud-continuar').addEventListener('click', () => {
        window.clics = (window.clics || 0) + 1;
        setTimeout(() => { document.body.innerHTML = '<h2>Ya tienes una solicitud en curso</h2><button id="btn-caso-curso-volver-inicio">Volver al inicio</button>'; }, 300);
      });</script>`);
    const registrados: string[] = [];
    const inicio = Date.now();
    const error = await new AfiliacionesPortal(page).enviarUnaVez(async n => { registrados.push(n); }).then(() => undefined, (e: Error) => e);
    expect(error).toBeInstanceOf(SolicitudEnCursoError);
    expect(Date.now() - inicio).toBeLessThan(15_000);
    expect([registrados, await page.evaluate(() => (window as unknown as { clics: number }).clics)]).toEqual([[], 1]);
  });
});
