import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compilarCasoAfi, type DefinicionCasoAfi } from '../data/afi/caso';
import { CP04_EMPRESA } from '../data/afi/casos/hu14-12-cp04';
import { REGISTRO_DATOS_PRUEBA_AFI, actorParaCaso } from '../data/afi/datosPrueba/registro';
import { colaboradoresReales, ejecutarCasoAfi } from '../helpers/afiCaseRunner';
import type { BizagiQaSupport } from '../helpers/bizagiQaSupport';
import { errorSeguro } from '../helpers/afiliacionesPortal';
import { BOTON_PJ, mensajeParaReporte, problemasSmoke, reporteSmoke, type EstadoEvento } from '../helpers/criterioSmokeEmpresaPj';

/**
 * SMOKE 4S-R.1 — preparación según estado de "Ingresa la información de la empresa" (Empleador PJ). Corrida real ÚNICA,
 * solo con autorización humana explícita (AFI_SMOKE_EMPRESA_PJ_RUN_REAL=true). NO forma parte del suite.
 *
 * inicio -> caso creado -> etapa informacion-empresa (runner existente) -> Continuar PJ -> siguiente pantalla (Representante
 * Legal) -> se detiene ahí, sin diligenciarla -> cleanup obligatorio. Actor EXPLÍCITO sin fallback. La evidencia de la etapa
 * (CP04-estado-informacion-empresa.json) solo contiene booleanos, decisiones y orígenes; nunca valores.
 */

const ACTOR_REF = 'empresa-empleador-juridico-rues-sin-rep-legal';
const HITOS = {
  apertura: { id: 'P02', esperado: 'Pantalla de inicio visible.' },
  preparacion: { id: 'P03', esperado: 'Preparación hasta la pantalla posterior a la información de la empresa.' },
};

class SmokeDetenido extends Error {
  constructor() { super('Smoke detenido tras cruzar la pantalla de la empresa'); this.name = 'SmokeDetenido'; }
}

const sensibles = () => Object.entries(process.env)
  .filter(([k, v]) => /^AFI_(ACTOR|QA|CP01|SHARED)_/.test(k) && /IDENTIFICACION|CORREO|CEL|TELEFONO|SALARIO|ACTIVIDAD|INGRESO|RAZON|NOMINA|TRABAJADORES|FECHA/.test(k) && !!v && v.trim().length >= 5)
  .map(([, v]) => v!.trim());

function readFileSyncSeguro(f: string): string {
  try { return readFileSync(f, 'utf8'); } catch { return ''; }
}

async function archivos(dir: string): Promise<string[]> {
  const r: string[] = [];
  for (const n of await readdir(dir).catch(() => [] as string[])) {
    const p = join(dir, n);
    if ((await stat(p)).isDirectory()) r.push(...await archivos(p)); else if (/\.(json|md|txt|log)$/.test(n)) r.push(p);
  }
  return r;
}

test.describe('Smoke 4S-R.1 información de la empresa (PJ)', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.use({ viewport: { width: 1365, height: 900 } });

  test('prepara según estado, cruza la pantalla PJ y se detiene en la siguiente', async ({ page, context }, info) => {
    test.skip(process.env.AFI_SMOKE_EMPRESA_PJ_RUN_REAL !== 'true', 'Requiere AFI_SMOKE_EMPRESA_PJ_RUN_REAL=true (autorización humana)');
    test.setTimeout(12 * 60_000);
    expect(info.config.workers, 'workers=1').toBe(1);
    expect(info.project.retries, 'retries=0').toBe(0);

    const definicion: DefinicionCasoAfi = {
      ...CP04_EMPRESA, actorRef: ACTOR_REF,
      preparacion: { ...CP04_EMPRESA.preparacion, etapas: ['inicio-solicitud', 'informacion-empresa'] },
    };
    const actor = actorParaCaso(definicion, REGISTRO_DATOS_PRUEBA_AFI, process.env);
    expect(actor.id, 'actor del slot indicado, sin fallback').toBe(ACTOR_REF);
    const compilado = compilarCasoAfi(definicion, actor);
    expect(compilado.ejecutable, 'compilado ejecutable').toBe(true);

    const transiciones: string[] = [];
    let numero: string | undefined, cancelado: boolean | undefined, errorNombre: string | undefined, errorMensaje: string | undefined;
    try {
      await ejecutarCasoAfi(compilado, {
        page, context, testInfo: info, hitos: HITOS, evidencia: 'off',
        // Solo lectura: registra el id público del botón de cada transición. Tras cruzar la PJ, la primera pantalla distinta
        // (Representante Legal) es el destino: se detiene ANTES de su Continuar, sin diligenciarla.
        diagnosticoAntesDeContinuar: async ({ boton }) => {
          transiciones.push(boton ?? '(sin id)');
          return transiciones.includes(BOTON_PJ) && boton !== BOTON_PJ ? 'detener' : undefined;
        },
        colaboradores: async runtime => {
          const reales = await colaboradoresReales(runtime, compilado);
          const soporte = reales.soporte as BizagiQaSupport;
          return {
            ...reales,
            portal: { abrir: () => reales.portal.abrir(), enviarUnaVez: registrar => reales.portal.enviarUnaVez(async n => { numero = n; await registrar(n); }) },
            soporte: {
              login: () => soporte.login(),
              registrarCasoCreado: (n, e) => soporte.registrarCasoCreado(n, e),
              emularReconocimiento: () => soporte.emularReconocimiento(),
              cancelarCasoCreado: async () => { try { await soporte.cancelarCasoCreado(); cancelado = true; } catch (e) { cancelado = false; throw e; } },
            },
            funcionalUi: { ejecutarPaso: async () => { throw new SmokeDetenido(); } },
          };
        },
      });
    } catch (e) {
      // NADA se traga: el nombre (y el mensaje saneado) se conservan; el criterio decide si fue un corte esperado o un fallo.
      errorNombre = e instanceof Error ? e.name : 'Error';
      errorMensaje = mensajeParaReporte(errorSeguro(e).message);
    }

    // Indicador independiente de presentación de la pantalla PJ: el evento de la etapa en la traza técnica del runner
    // (la etapa solo se ejecuta con el botón PJ visible). El hook de transiciones corre DESPUÉS de preparar la pantalla.
    const traza = JSON.parse(await readFile(join(info.outputDir, 'CP04-traza-tecnica.json'), 'utf8').catch(() => '{"eventos":[]}')) as
      { eventos: { evento: string; etapa?: string; estado: EstadoEvento }[] };
    const etapa = traza.eventos.find(x => x.evento === 'etapa-preparacion' && x.etapa === 'informacion-empresa')?.estado ?? null;
    const estado = JSON.parse(await readFile(join(info.outputDir, 'CP04-estado-informacion-empresa.json'), 'utf8').catch(() => 'null'));
    // Solo observación (p. ej. "Clase aportante"): identidad del control + booleanos, antes y después de preparar.
    const otros = JSON.parse(await readFile(join(info.outputDir, 'CP04-otros-controles-informacion-empresa.json'), 'utf8').catch(() => 'null'));
    const cleanup = numero === undefined ? 'N/A' as const : cancelado ? 'PASS' as const : 'FAIL' as const;

    // PII: primero los artefactos de la corrida; luego el propio reporte (que incluye el mensaje saneado).
    const valores = sensibles();
    const contar = async (archivos_: string[]) => {
      let n = 0;
      for (const f of archivos_) n += valores.filter(v => (readFileSyncSeguro(f)).includes(v)).length;
      return n;
    };
    const artefactos = await archivos(info.outputDir);
    let coincidencias = await contar(artefactos);
    const construir = () => ({
      actorRef: ACTOR_REF,
      ...reporteSmoke({ transiciones, etapaInformacionEmpresa: etapa, errorNombre, errorMensajeSaneado: errorMensaje, cleanup, coincidenciasPii: coincidencias }),
      estadoInformacionEmpresa: estado,
      otrosControlesInformacionEmpresa: otros,
    });
    const dir = 'test-results/colsubsidio/smoke-empresa-pj';
    await mkdir(dir, { recursive: true });
    const ruta = join(dir, 'smoke-empresa-pj.json');
    await writeFile(ruta, JSON.stringify(construir(), null, 2), 'utf8');
    const enReporte = await contar([ruta]);
    if (enReporte) {
      // Nunca se deja PII en el reporte: se elimina el mensaje y se registra el hallazgo.
      errorMensaje = undefined;
      coincidencias += enReporte;
      await writeFile(ruta, JSON.stringify(construir(), null, 2), 'utf8');
    }
    const salida = construir();
    console.log(`SMOKE_EMPRESA_PJ ${JSON.stringify({ ...salida, piiScan: { valoresVigilados: valores.length, archivos: artefactos.length + 1, coincidencias } })}`);
    // PASS real = TODO: sin error inesperado, PJ observada y preparada, Continuar PJ alcanzado, PJ cruzada, pantalla siguiente,
    // corte esperado, cleanup PASS y PII 0. Cleanup + PII 0 nunca bastan.
    expect(problemasSmoke(salida), 'criterio de éxito del smoke 4S-R.1').toEqual([]);
  });
});
