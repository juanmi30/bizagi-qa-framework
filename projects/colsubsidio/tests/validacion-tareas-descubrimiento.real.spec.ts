import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { actorDesdeEntorno } from '../data/afi/actores';
import { enmascarar, piiEnContenido } from '../data/afi/aplicacion/sensibilidad';
import { compilarCasoAfi } from '../data/afi/caso';
import { CP04_EMPRESA, CP04_PENSIONADO } from '../data/afi/casos/hu14-12-cp04';
import { colaboradoresReales, ejecutarCasoAfi } from '../helpers/afiCaseRunner';
import type { BizagiQaSupport } from '../helpers/bizagiQaSupport';
import { FuenteTareasBizagiQa } from '../helpers/fuenteTareasBizagiQa';

/**
 * Fase 4R.2 — DISCOVERY READ-ONLY (validación técnica, temporal). NO forma parte del suite normal.
 *
 * Flujo existente CP04 (mismo compilado y runner que el spec real) para el perfil AFI_DESCUBRIMIENTO_PERFIL
 * (empresa | pensionado; por defecto empresa). La lectura ocurre SOLO si el runner entrega el control al primer paso
 * funcional, cosa que solo hace tras `informacion-contacto-alcanzada` y la completitud de preparación: ese hecho ES
 * reachedFunctionalPoint. Una lectura de Admin → Casos del caso de ESTA corrida; solo nombres sanitizados.
 * Nada se persiste en Knowledge; el cleanup del runner se ejecuta siempre.
 */

const HITOS = {
  apertura: { id: 'P02', esperado: 'Pantalla de inicio visible.' },
  preparacion: { id: 'P03', esperado: 'La pantalla de Información de contacto carga exitosamente.' },
};
const DEFINICIONES = { empresa: CP04_EMPRESA, pensionado: CP04_PENSIONADO } as const;

test.describe('4R.2 discovery read-only de tareas pendientes', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.use({ viewport: { width: 1365, height: 900 } });

  test('CP04: tareas pendientes en el punto funcional', async ({ page, context }, info) => {
    test.skip(process.env.AFI_DESCUBRIMIENTO_TAREAS_RUN_REAL !== 'true', 'Requiere AFI_DESCUBRIMIENTO_TAREAS_RUN_REAL=true');
    test.setTimeout(12 * 60_000);
    expect(info.config.workers, 'workers=1').toBe(1);
    expect(info.project.retries, 'retries=0').toBe(0);
    const perfil = (process.env.AFI_DESCUBRIMIENTO_PERFIL ?? 'empresa') as keyof typeof DEFINICIONES;
    expect(Object.keys(DEFINICIONES), 'perfil de discovery soportado').toContain(perfil);
    const definicion = DEFINICIONES[perfil];
    // Actor QA del perfil (sin actorRef): nunca un ActorSlot de otra HU.
    expect(definicion.actorRef).toBeUndefined();
    const compilado = compilarCasoAfi(definicion, actorDesdeEntorno(perfil, process.env));

    let reached = false, reads = 0, correlationOk = false;
    let tareas: string[] = [];
    let numero: string | undefined;
    let cancelado: boolean | undefined;
    let errorType: string | undefined;
    try {
      await ejecutarCasoAfi(compilado, {
        page, context, testInfo: info, hitos: HITOS, evidencia: 'off',
        colaboradores: async runtime => {
          const reales = await colaboradoresReales(runtime, compilado);
          const soporte = reales.soporte as BizagiQaSupport;
          const fuente = new FuenteTareasBizagiQa(soporte);
          return {
            ...reales,
            portal: {
              abrir: () => reales.portal.abrir(),
              // Solo se recuerda el número para comprobar la correlación; nunca se imprime.
              enviarUnaVez: registrar => reales.portal.enviarUnaVez(async n => { numero = n; await registrar(n); }),
            },
            soporte: {
              login: () => soporte.login(),
              registrarCasoCreado: (n, e) => soporte.registrarCasoCreado(n, e),
              emularReconocimiento: () => soporte.emularReconocimiento(),
              cancelarCasoCreado: async () => {
                try { await soporte.cancelarCasoCreado(); cancelado = true; } catch (e) { cancelado = false; throw e; }
              },
            },
            funcionalUi: {
              ejecutarPaso: async (paso, registrar, observar) => {
                // El runner solo llega aquí con Información de contacto alcanzada y la preparación completa.
                if (!reached) {
                  reached = true;
                  correlationOk = !!numero && fuente.casoAdministrado() === numero;
                  reads++;
                  try {
                    tareas = (await fuente.tareasPendientes()).map(n => (piiEnContenido(n) ? `[posible-pii] ${enmascarar(n)}` : n.trim()));
                  } catch (e) { errorType = e instanceof Error ? `${e.name}${'motivo' in e ? `:${String(e.motivo)}` : ''}` : 'Error'; }
                }
                return reales.funcionalUi.ejecutarPaso(paso, registrar, observar);
              },
            },
          };
        },
      });
    } catch (e) { errorType ??= e instanceof Error ? e.name : 'Error'; }

    const salida = {
      reachedFunctionalPoint: reached, reads, taskCount: tareas.length, taskNames: tareas, correlationOk,
      cleanup: numero === undefined ? 'N/A' : cancelado ? 'PASS' : 'FAIL',
      ...(errorType ? { errorType } : {}),
    };
    await mkdir('test-results/colsubsidio/validacion-tareas', { recursive: true });
    await writeFile(`test-results/colsubsidio/validacion-tareas/descubrimiento-${perfil}.json`, JSON.stringify(salida, null, 2), 'utf8');
    console.log(`DISCOVERY ${JSON.stringify(salida)}`);
    expect(reads).toBeLessThanOrEqual(1);
  });
});
