import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compilarCasoAfi, type DefinicionCasoAfi } from '../data/afi/caso';
import { CP04_EMPRESA } from '../data/afi/casos/hu14-12-cp04';
import { REGISTRO_DATOS_PRUEBA_AFI, actorParaCaso } from '../data/afi/datosPrueba/registro';
import { colaboradoresReales, ejecutarCasoAfi } from '../helpers/afiCaseRunner';
import { errorSeguro } from '../helpers/afiliacionesPortal';
import type { BizagiQaSupport } from '../helpers/bizagiQaSupport';
import { mensajeParaReporte } from '../helpers/criterioSmokeEmpresaPj';
import { observarEstructura, type EstructuraPantalla } from '../helpers/estructuraPantalla';

/**
 * EXPLORACIÓN técnica (no forma parte del suite): estructura SANITIZADA de las pantallas de Empleador PJ con el actor de
 * HU 7.14 CP01 (con representante legal en RUES). Usa el runner oficial; observa la pantalla PJ (hook de solo lectura) y la
 * pantalla del punto funcional; se detiene allí. Cleanup siempre. Gate: AFI_EXPLORACION_PJ_RUN_REAL=true y AFI_EXPLORACION_ACTOR.
 */

class ExploracionDetenida extends Error { constructor() { super('Exploración detenida en el punto funcional'); this.name = 'ExploracionDetenida'; } }

const sensibles = () => Object.entries(process.env)
  .filter(([k, v]) => /^AFI_(ACTOR|QA|CP01|SHARED)_/.test(k) && /IDENTIFICACION|CORREO|CEL|TELEFONO|SALARIO|ACTIVIDAD|INGRESO|RAZON|NOMINA|TRABAJADORES|FECHA|CAJA|CIIU/.test(k) && !!v && v.trim().length >= 5)
  .map(([, v]) => v!.trim());
async function archivos(dir: string): Promise<string[]> {
  const r: string[] = [];
  for (const n of await readdir(dir).catch(() => [] as string[])) {
    const p = join(dir, n);
    if ((await stat(p)).isDirectory()) r.push(...await archivos(p)); else if (/\.(json|md|txt|log)$/.test(n)) r.push(p);
  }
  return r;
}
const leer = (f: string) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };

test.describe('Exploración flujo Empleador PJ', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.use({ viewport: { width: 1365, height: 900 } });

  test('estructura sanitizada de pantallas PJ', async ({ page, context }, info) => {
    test.skip(process.env.AFI_EXPLORACION_PJ_RUN_REAL !== 'true', 'Requiere AFI_EXPLORACION_PJ_RUN_REAL=true');
    test.setTimeout(12 * 60_000);
    expect([info.config.workers, info.project.retries]).toEqual([1, 0]);
    const actorRef = process.env.AFI_EXPLORACION_ACTOR ?? 'empresa-empleador-juridico-rues-con-rep-legal';
    const definicion: DefinicionCasoAfi = {
      ...CP04_EMPRESA, hu: 'AFI HU 7.14', nombre: 'Exploracion PJ', actorRef,
      preparacion: { ...CP04_EMPRESA.preparacion, etapas: ['inicio-solicitud', 'informacion-empresa'] },
    };
    const actor = actorParaCaso(definicion, REGISTRO_DATOS_PRUEBA_AFI, process.env);
    expect(actor.id).toBe(actorRef);
    const compilado = compilarCasoAfi(definicion, actor);

    const pantallas: { momento: string; boton?: string | null; estructura: EstructuraPantalla }[] = [];
    let numero: string | undefined, cancelado: boolean | undefined, error: { tipo: string; mensaje: string } | undefined;
    try {
      await ejecutarCasoAfi(compilado, {
        page, context, testInfo: info, evidencia: 'off',
        diagnosticoAntesDeContinuar: async ({ boton }) => { pantallas.push({ momento: 'antes-de-continuar', boton, estructura: await observarEstructura(page) }); },
        colaboradores: async runtime => {
          const reales = await colaboradoresReales(runtime, compilado);
          const soporte = reales.soporte as BizagiQaSupport;
          return {
            ...reales,
            portal: { abrir: () => reales.portal.abrir(), enviarUnaVez: registrar => reales.portal.enviarUnaVez(async n => { numero = n; await registrar(n); }) },
            soporte: {
              login: () => soporte.login(), registrarCasoCreado: (n, e) => soporte.registrarCasoCreado(n, e),
              emularReconocimiento: () => soporte.emularReconocimiento(),
              cancelarCasoCreado: async () => { try { await soporte.cancelarCasoCreado(); cancelado = true; } catch (e) { cancelado = false; throw e; } },
            },
            funcionalUi: { ejecutarPaso: async () => { pantallas.push({ momento: 'punto-funcional', estructura: await observarEstructura(page) }); throw new ExploracionDetenida(); } },
          };
        },
      });
    } catch (e) {
      if (!(e instanceof Error && e.name === 'ExploracionDetenida')) error = { tipo: e instanceof Error ? e.name : 'Error', mensaje: mensajeParaReporte(errorSeguro(e).message) };
      if (!pantallas.some(p => p.momento === 'fallo')) pantallas.push({ momento: 'fallo', estructura: await observarEstructura(page).catch(() => ({ encabezados: [], migas: [], controles: [], botones: [], alertas: [], tooltips: [], spinners: [] })) });
    }
    const salida = { actorRef, pantallas, cleanup: numero === undefined ? 'N/A' : cancelado ? 'PASS' : 'FAIL', ...(error ? { error } : {}) };
    const dir = 'test-results/colsubsidio/exploracion-pj';
    await mkdir(dir, { recursive: true });
    const ruta = join(dir, `exploracion-${actorRef}.json`);
    await writeFile(ruta, JSON.stringify(salida, null, 2), 'utf8');
    const valores = sensibles();
    let coincidencias = 0;
    for (const f of [ruta, ...await archivos(info.outputDir)]) coincidencias += valores.filter(v => leer(f).includes(v)).length;
    console.log(`EXPLORACION_PJ ${JSON.stringify({ actorRef, momentos: pantallas.map(p => p.momento), cleanup: salida.cleanup, error, piiScan: { valoresVigilados: valores.length, coincidencias } })}`);
    expect(coincidencias, 'sin PII').toBe(0);
    expect(salida.cleanup).toBe('PASS');
  });
});
