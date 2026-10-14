import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { compilarCasoAfi, type CasoAfiCompilado, type DefinicionCasoAfi } from '../data/afi/caso';
import { exigirGateEvidenciaPii } from '../data/afi/datosPrueba/gateEvidencia';
import { DatosPruebaNoListosError, REGISTRO_DATOS_PRUEBA_AFI, actorParaCaso, participantesParaCaso, type ParticipanteAfi } from '../data/afi/datosPrueba/registro';
import { SUJETO_PRINCIPAL, esCampoPersona } from '../data/afi/datosPrueba/contrato';
import type { ActorAfi } from '../data/afi/modelo';
import { resolverEtapa } from '../data/afi/resolver';
import { modoReconocimientoPantalla } from '../data/afi/aplicacion/reconocimientoSombra';
import { modoEvidenciaAfi } from '../data/afi/evidencia';
import { cargarDefinicionCasoAfi, resumenCompilacion, resumenCompilacionE2E, resumenError, resumenValidacion, type ResumenAfi } from '../data/afi/loader';
import { compilarPlanE2E, envelopeDatosE2E, type PlanE2ECompilado } from '../data/afi/e2e/compilador';
import { veredictoE2E } from '../data/afi/e2e/modelo';
import { ejecutarCasoE2E, type DependenciasE2E } from '../helpers/e2e/ejecutorE2E';
import { tablaMarkdownE2E } from '../helpers/e2e/reporteE2E';
import { ejecutarCasoAfi, preflightCasoAfi } from '../helpers/afiCaseRunner';
import { CARPETA_EVIDENCIA_AFI } from '../helpers/afiEvidencia';
import { errorSeguro } from '../helpers/afiliacionesPortal';

/**
 * HARNESS técnico (no es un caso de prueba): ejecuta UN archivo *.afi.json indicado por tools/afi.mjs.
 * Variables de CONTROL (nunca datos del caso): AFI_CASE_FILE, AFI_CASE_MODE, AFI_CASE_OUTPUT y
 * AFI_EVIDENCE_MODE (off | cliente | tecnica | todo; por defecto cliente). El archivo nunca decide la evidencia.
 * Sin esas variables (p. ej. en la suite completa) se omite.
 */
const ARCHIVO = process.env.AFI_CASE_FILE;
const MODO = process.env.AFI_CASE_MODE;
const SALIDA = process.env.AFI_CASE_OUTPUT;
/** ¿El archivo declara la sección e2e? (solo elige la variante del harness; la validación real la hace el loader). */
const DECLARA_E2E = (() => {
  if (!ARCHIVO) return false;
  try { const j = JSON.parse(readFileSync(ARCHIVO, 'utf8').replace(/^﻿/, '')); return !!j && typeof j === 'object' && 'e2e' in j; } catch { return false; }
})();

/** validar/compilar: pedir un navegador es un error (el fixture browser lanza en vez de abrir uno). */
const sinNavegador = test.extend<object, object>({
  browser: [async ({}, _usar: unknown) => { // eslint-disable-line no-empty-pattern
    throw new Error('El harness AFI no debe abrir navegador en modo validar/compilar');
  }, { scope: 'worker' }],
} as never);

async function emitir(resumen: ResumenAfi): Promise<void> {
  if (SALIDA) await writeFile(SALIDA, JSON.stringify(resumen), 'utf8');
  else console.log(resumen.texto);
}

/** Emite el resumen del error (redactado) y conserva el fallo del test para el exit code. */
async function emitirError(modo: string, error: unknown): Promise<void> {
  const seguro = errorSeguro(error);
  seguro.name = error instanceof Error ? error.name : 'Error';
  await emitir(resumenError(modo, seguro, error instanceof DatosPruebaNoListosError ? error.diagnostico : undefined));
}

async function conResumen(modo: string, cuerpo: () => Promise<ResumenAfi>): Promise<void> {
  try {
    await emitir(await cuerpo());
  } catch (error) {
    await emitirError(modo, error);
    throw error;
  }
}

/**
 * Preflight SIN navegador (4P): contrato, datos de prueba (actorRef -> slot -> presencia de secretos), compilación y
 * preflight del runner. Si los datos no están READY lanza DatosPruebaNoListosError con el diagnóstico para el analista.
 */
async function prepararCaso(): Promise<{ definicion: DefinicionCasoAfi; compilado: CasoAfiCompilado }> {
  const definicion = await cargarDefinicionCasoAfi(ARCHIVO!);
  const actor = actorParaCaso(definicion, REGISTRO_DATOS_PRUEBA_AFI, process.env, { proyecto: process.env.PROJECT });
  // 4S: cada participante READY y las relaciones exigidas cumplidas (valores solo en memoria; ninguna operación los consume aún).
  participantesParaCaso(definicion, REGISTRO_DATOS_PRUEBA_AFI, process.env, actor, { proyecto: process.env.PROJECT });
  const compilado = compilarCasoAfi(definicion, actor);
  preflightCasoAfi(compilado); // DataGap o CapabilityGap del runner -> no compilable.
  return { definicion, compilado };
}

/**
 * (E2E) Compilación SIN navegador de un caso con sección e2e: plan (verificaciones + gaps derivados + requisitos de datos) y,
 * si el actor está READY, el recorrido del Portal. Un actor no listo NO impide compilar el plan: queda como gap de datos.
 */
async function prepararE2E(): Promise<{ definicion: DefinicionCasoAfi; plan: PlanE2ECompilado; compilado?: CasoAfiCompilado; motivoSinPortal?: string; recorrido?: DependenciasE2E['recorrido'] }> {
  const definicion = await cargarDefinicionCasoAfi(ARCHIVO!);
  const plan = compilarPlanE2E(definicion.e2e!, { hu: definicion.hu, caso: definicion.caso, perfil: definicion.perfil, actorRef: definicion.actorRef,
    registro: REGISTRO_DATOS_PRUEBA_AFI, entorno: process.env });
  // (A2) Nunca se recorre el Portal con un actor cuya compatibilidad con el escenario no está demostrada.
  if (!plan.actor.demostrado) return { definicion, plan, motivoSinPortal: `actor no demostrado (${plan.actor.motivo})` };
  try {
    const actor = actorParaCaso(definicion, REGISTRO_DATOS_PRUEBA_AFI, process.env, { proyecto: process.env.PROJECT });
    const compilado = compilarCasoAfi(definicion, actor);
    preflightCasoAfi(compilado);
    return { definicion, plan, compilado, recorrido: datosRecorrido(definicion, actor) };
  } catch (error) {
    if (error instanceof DatosPruebaNoListosError) return { definicion, plan, motivoSinPortal: `${error.diagnostico.actorRef ?? 'actor'}: ${error.diagnostico.status}` };
    throw error;
  }
}

/**
 * Datos EN MEMORIA de la ruta derivada: literales del caso, actor principal y participantes con actorRef (los que no estén
 * listos quedan sin valores: el recorrido fallará con DataGap en la pantalla que los necesite, nunca con un dato inventado).
 * Test Data aún no provee archivos: cargar documentos queda como DataGap.
 */
function datosRecorrido(definicion: DefinicionCasoAfi, actor: ActorAfi): NonNullable<DependenciasE2E['recorrido']> {
  const e2e = definicion.e2e!;
  let participantes: ParticipanteAfi[] = [];
  const conActor = (e2e.sujetos ?? []).filter(s => s.actorRef).map(s => ({ rol: s.rol, actorRef: s.actorRef! }));
  // Solo las relaciones entre sujetos que se materializan (los sin actor aún no tienen valores que relacionar).
  const presentes = new Set([SUJETO_PRINCIPAL, ...conActor.map(p => p.rol)]);
  const relaciones = (e2e.relaciones ?? []).filter(r => r.sujetos.every(s => presentes.has(s)));
  try { participantes = participantesParaCaso({ ...definicion, participantes: conActor, relaciones }, REGISTRO_DATOS_PRUEBA_AFI, process.env, actor); }
  catch (e) { if (!(e instanceof DatosPruebaNoListosError)) throw e; }
  return {
    valores: {
      valor: (sujeto, dato) => {
        const literal = e2e.datos.find(d => d.sujeto === sujeto && d.campo === dato && d.resolucion === 'CASE_LITERAL')?.valor;
        if (literal !== undefined) return literal;
        if (sujeto === SUJETO_PRINCIPAL) { const v = esCampoPersona(dato) ? undefined : actor.datos[dato]; return typeof v === 'string' ? v : undefined; }
        const p = participantes.find(x => x.rol === sujeto);
        const v = !p ? undefined : esCampoPersona(dato) ? p.persona[dato] : p.datos[dato];
        return typeof v === 'string' ? v : undefined;
      },
      archivo: () => undefined,
    },
    planEtapa: etapa => resolverEtapa(etapa, { actor, datosCaso: definicion.preparacion.datosCaso }),
  };
}

/** Valores sensibles del entorno (solo en memoria) para el escaneo PII de los artefactos E2E; nunca se imprimen. */
const sensiblesEntorno = () => Object.entries(process.env)
  .filter(([k, v]) => /^AFI_(ACTOR|QA|CP\d+|SHARED)_/.test(k) && !!v && v.trim().length >= 5).map(([, v]) => v!.trim());
async function archivosTexto(dir: string): Promise<string[]> {
  const r: string[] = [];
  for (const n of await readdir(dir).catch(() => [] as string[])) {
    const p = join(dir, n);
    if ((await stat(p)).isDirectory()) r.push(...await archivosTexto(p)); else if (/\.(json|md|txt|log)$/.test(n)) r.push(p);
  }
  return r;
}

test.describe('AFI harness de archivo', () => {
  test.skip(!ARCHIVO || !MODO, 'Solo se ejecuta desde tools/afi.mjs');
  test.describe.configure({ retries: 0 });

  if (MODO === 'validar') {
    sinNavegador('afi-case-file validar', async () => {
      // Solo contrato: sin actor, sin compilar, sin navegador.
      await conResumen('validar', async () => resumenValidacion(await cargarDefinicionCasoAfi(ARCHIVO!)));
    });
  } else if (MODO === 'compilar') {
    sinNavegador('afi-case-file compilar', async () => {
      // Contrato + datos de prueba + actor del entorno + compilación + preflight. Sin navegador.
      await conResumen('compilar', async () => {
        const def = await cargarDefinicionCasoAfi(ARCHIVO!);
        if (!def.e2e) return resumenCompilacion((await prepararCaso()).compilado);
        // Tiempo desde el archivo de entrada hasta COMPILADO (carga + validación + compilación + diagnóstico de datos).
        const inicio = Date.now();
        const { definicion, plan, compilado, motivoSinPortal } = await prepararE2E();
        return resumenCompilacionE2E(definicion, plan, { ejecutable: !!compilado, ...(motivoSinPortal ? { motivo: motivoSinPortal } : {}) }, Date.now() - inicio);
      });
    });
  } else if (MODO === 'ejecutar' && DECLARA_E2E) {
    // ---- E2E: el mismo entry point, el ejecutor genérico. El veredicto lo decide el resultado (E2E PASS = todo PASS). ----
    test.use({ viewport: { width: 1365, height: 900 } });
    let preparado: Awaited<ReturnType<typeof prepararE2E>> | undefined;
    test.beforeAll(async () => {
      try {
        preparado = await prepararE2E();
        exigirGateEvidenciaPii(preparado.definicion.actorRef, modoEvidenciaAfi(process.env.AFI_EVIDENCE_MODE));
      } catch (error) { await emitirError('ejecutar', error); throw error; }
    });
    test('afi-case-file ejecutar e2e', async ({ page, context, browser }, info) => {
      test.setTimeout(30 * 60_000);
      expect(info.config.workers, 'El harness AFI requiere workers=1').toBe(1);
      expect(info.project.retries, 'El harness AFI requiere retries=0').toBe(0);
      const { definicion, plan, compilado, motivoSinPortal, recorrido } = preparado!;
      const admin = await browser.newContext({ viewport: { width: 1365, height: 900 } });
      let resultado;
      try {
        resultado = await ejecutarCasoE2E(plan, { adminPage: await admin.newPage(), browser, context, page, testInfo: info, compilado, ...(recorrido ? { recorrido } : {}),
          ...(motivoSinPortal ? { motivoSinPortal: { detalle: `Actor no listo: ${motivoSinPortal}`, clasificacion: 'TEST_DATA_GAP' as const } } : {}) });
      } finally { await admin.close().catch(() => undefined); }
      const veredicto = veredictoE2E(resultado.pasos);
      const dir = join('test-results/colsubsidio/e2e', `${definicion.hu}-${definicion.caso}`.replace(/[^A-Za-z0-9._-]+/g, '-'));
      await mkdir(dir, { recursive: true });
      const salida = {
        caso: { hu: definicion.hu, caso: definicion.caso, fuente: definicion.fuente, actorRef: definicion.actorRef }, veredicto,
        pasos: resultado.pasos, gapsDerivados: plan.gaps, requisitosDatos: envelopeDatosE2E(plan), diagnosticosDatos: plan.diagnosticosDatos,
        portal: resultado.portal, parametricas: Object.fromEntries(Object.entries(resultado.tablas).map(([k, t]) => [k, 'error' in t ? t : { columnas: t.columnas, filas: t.filas.length }])),
      };
      await writeFile(join(dir, 'resultado.json'), JSON.stringify(salida, null, 2), 'utf8');
      await writeFile(join(dir, 'resultado.md'), tablaMarkdownE2E({ hu: definicion.hu, caso: definicion.caso, fuente: definicion.fuente?.referencia, actorRef: definicion.actorRef }, plan, resultado.pasos, veredicto), 'utf8');
      const valores = sensiblesEntorno();
      let coincidencias = 0;
      for (const f of [join(dir, 'resultado.json'), join(dir, 'resultado.md'), ...await archivosTexto(info.outputDir)]) {
        const t = await readFile(f, 'utf8').catch(() => '');
        coincidencias += valores.filter(v => t.includes(v)).length;
      }
      await emitir({ texto: [`${veredicto} ${definicion.hu} ${definicion.caso}`, ...resultado.pasos.map(p => `  P${p.paso}${p.dispositivo === 'mobile' ? 'm' : ''} ${p.estado}`),
        `cleanup=${resultado.portal.map(o => o.cleanup).join(',') || 'N/A'}`, `pii=${coincidencias}`].join('\n'),
      datos: { modo: 'ejecutar', ok: veredicto === 'E2E PASS', veredicto, reporte: dir } });
      expect(coincidencias, 'sin PII').toBe(0);
      expect(resultado.portal.every(o => o.cleanup !== 'FAIL'), 'cleanup obligatorio').toBe(true);
      expect(veredicto, 'veredicto E2E').toBe('E2E PASS');
    });
  } else {
    test.use({ viewport: { width: 1365, height: 900 } });
    let preparado: CasoAfiCompilado | undefined;
    // beforeAll no pide fixtures de navegador: si los datos o la compilación fallan, el navegador NUNCA se abre.
    test.beforeAll(async () => {
      try {
        const { definicion, compilado } = await prepararCaso();
        // Gate de evidencia PII (4Q): con actorRef, nunca evidencia cliente mientras el gate siga abierto.
        exigirGateEvidenciaPii(definicion.actorRef, modoEvidenciaAfi(process.env.AFI_EVIDENCE_MODE));
        preparado = compilado;
      } catch (error) { await emitirError('ejecutar', error); throw error; }
    });
    test('afi-case-file ejecutar', async ({ page, context }, info) => {
      test.setTimeout(12 * 60_000);
      // El archivo nunca controla workers/retries.
      expect(info.config.workers, 'El harness AFI requiere workers=1').toBe(1);
      expect(info.project.retries, 'El harness AFI requiere retries=0').toBe(0);
      expect(MODO, 'Modo AFI desconocido').toBe('ejecutar');
      await conResumen('ejecutar', async () => {
        const evidencia = modoEvidenciaAfi(process.env.AFI_EVIDENCE_MODE);
        const reconocimientoPantalla = modoReconocimientoPantalla(process.env.AFI_SCREEN_RECOGNITION);
        const compilado = preparado!;
        const resultado = await ejecutarCasoAfi(compilado, { page, context, testInfo: info, evidencia, reconocimientoPantalla });
        const rp = resultado.reconocimientoPantalla?.resumen;
        const e = resultado.evidencia;
        // Ruta RELATIVA del paquete, solo para que el CLI lo copie a una carpeta durable (no es metadata durable).
        const paquete = e && e.modo !== 'off' ? relative(process.cwd(), info.outputPath(CARPETA_EVIDENCIA_AFI)).split(sep).join('/') : undefined;
        return {
          texto: [`${resultado.resultado} ${resultado.metadata.nombre}`, `numeroCaso=${resultado.numeroCaso ?? '-'}`, `cleanup=${resultado.cleanup}`,
            ...[...resultado.pasosTecnicos, ...resultado.pasosFuncionales].map(p => `  ${p.id} ${p.resultado}`),
            ...(e ? [`evidencia=${e.estado} (modo ${e.modo}; ${e.capturasCliente} captura(s) cliente, ${e.adjuntosTecnicos} adjunto(s) técnico(s), ${e.erroresCaptura} error(es) de captura)`] : []),
            // Diagnóstico técnico del shadow mode: nunca cambia el resultado funcional.
            ...(rp ? [`reconocimiento-pantalla=shadow (${rp.observaciones} observación(es): ${rp.matches} match, ${rp.mismatches} mismatch, `
              + `${rp.desconocidas} desconocida, ${rp.ambiguas} ambigua, ${rp.sinExpectativa} sin expectativa, ${rp.erroresRecognizer} error recognizer; detalle en la traza técnica)`] : []),
          ].join('\n'),
          datos: { modo: 'ejecutar', ok: resultado.resultado === 'PASS', resultado, ...(paquete ? { paqueteEvidencia: paquete } : {}) },
        };
      });
    });
  }
});
