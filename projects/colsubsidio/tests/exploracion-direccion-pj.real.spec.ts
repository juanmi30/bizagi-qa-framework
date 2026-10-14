import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compilarCasoAfi, type DefinicionCasoAfi } from '../data/afi/caso';
import { CP04_EMPRESA } from '../data/afi/casos/hu14-12-cp04';
import { REGISTRO_DATOS_PRUEBA_AFI, actorParaCaso } from '../data/afi/datosPrueba/registro';
import type { ActorAfi } from '../data/afi/modelo';
import { resolverEtapa } from '../data/afi/resolver';
import { colaboradoresReales, ejecutarCasoAfi } from '../helpers/afiCaseRunner';
import { AfiDataUi } from '../helpers/afiDataUi';
import { AfiliacionesPortal, errorSeguro } from '../helpers/afiliacionesPortal';
import type { BizagiQaSupport } from '../helpers/bizagiQaSupport';
import { mensajeParaReporte } from '../helpers/criterioSmokeEmpresaPj';
import { avanzar } from '../helpers/e2e/recorridoSemantico';
import { enteroEnRango, opcionDeDominio } from '../data/afi/datosPrueba/generacion';
import { observarEstructura, type EstructuraPantalla } from '../helpers/estructuraPantalla';

/**
 * EXPLORACIÓN técnica (no forma parte del suite): estructura SANITIZADA de "Ingresa la información asociada a la dirección" para
 * Empleador PJ. Runner oficial hasta Información de contacto; allí la etapa se diligencia con el driver GENÉRICO (políticas del
 * perfil) y se avanza con la primitiva genérica; en Dirección SOLO se observa (estructura, restricciones visibles y catálogos
 * públicos), sin escribir nada. Caso propio con cleanup obligatorio.
 * Teléfonos: autorizados por el usuario SOLO para esta exploración, desde las variables QA de teléfono ya usadas por otros
 * perfiles; viven en memoria y nunca se registran en Test Data. Gate: AFI_EXPLORACION_DIRECCION_PJ_RUN_REAL=true.
 */

class ExploracionDetenida extends Error { constructor() { super('Exploración detenida en Dirección'); this.name = 'ExploracionDetenida'; } }
const TITULO_DIRECCION = 'Ingresa la información asociada a la dirección';
/** Solo los obligatorios OBSERVADOS en la exploración anterior; los opcionales quedan vacíos. */
const OBLIGATORIOS_SELECT = ['viaPrincipal'] as const;
const OBLIGATORIOS_NUMERO = ['numeroVp', 'numeroVg', 'numeroPredio'] as const;
/** Rango INTERIOR (2 dígitos) dentro de maxlength=3 observado: ni 0/1 ni el máximo. */
const RANGO_NUMERO = { min: 10, max: 99 } as const;
const semilla = (campo: string) => `exploracion-direccion-pj|empresa|direccion|${campo}|v1`;
const VACIA: EstructuraPantalla = { encabezados: [], migas: [], controles: [], botones: [], alertas: [], tooltips: [], spinners: [] };

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

/** Restricciones VISIBLES de los inputs (atributos HTML públicos; nunca valores). */
function restricciones(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('input, textarea')].filter(e => (e as HTMLElement).getClientRects().length > 0 && (e as HTMLInputElement).type !== 'hidden').map(e => {
    const i = e as HTMLInputElement;
    const campo = i.closest('mat-form-field') ?? i.parentElement;
    return {
      identidad: i.getAttribute('formcontrolname') || i.getAttribute('name') || i.id || '(sin-identidad)',
      tipo: i.type, maxlength: i.getAttribute('maxlength'), minlength: i.getAttribute('minlength'), pattern: i.getAttribute('pattern'),
      inputmode: i.getAttribute('inputmode'), hint: (campo?.querySelector('mat-hint')?.textContent ?? '').trim() || null,
    };
  }));
}

/** Catálogo PÚBLICO de un select (se abre y se cierra con Escape; no se elige nada). */
async function catalogo(page: Page, portal: AfiliacionesPortal, identidad: string): Promise<{ identidad: string; total: number; opciones: string[] } | { identidad: string; error: string }> {
  try {
    const control = page.locator(`mat-select[formcontrolname="${identidad}"], mat-select[id="${identidad}"]`).first();
    if (await control.getAttribute('aria-disabled') === 'true') return { identidad, error: 'deshabilitado' };
    const panel = await portal.abrirCatalogo(control);
    const opciones = (await panel.getByRole('option').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    return { identidad, total: opciones.length, opciones: opciones.slice(0, 80) };
  } catch (e) { return { identidad, error: e instanceof Error ? e.name : 'Error' }; }
}

test.describe('Exploración Dirección Empleador PJ', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.use({ viewport: { width: 1365, height: 900 } });

  test('estructura sanitizada de Dirección PJ', async ({ page, context }, info) => {
    test.skip(process.env.AFI_EXPLORACION_DIRECCION_PJ_RUN_REAL !== 'true', 'Requiere AFI_EXPLORACION_DIRECCION_PJ_RUN_REAL=true');
    test.setTimeout(15 * 60_000);
    expect([info.config.workers, info.project.retries]).toEqual([1, 0]);
    const actorRef = process.env.AFI_EXPLORACION_ACTOR ?? 'empresa-empleador-juridico-rues-sin-rep-legal';
    const definicion: DefinicionCasoAfi = {
      ...CP04_EMPRESA, hu: 'AFI HU 7.14', nombre: 'Exploracion Direccion PJ', actorRef,
      preparacion: { ...CP04_EMPRESA.preparacion, etapas: ['inicio-solicitud', 'informacion-empresa'] },
    };
    const actor = actorParaCaso(definicion, REGISTRO_DATOS_PRUEBA_AFI, process.env);
    expect(actor.id).toBe(actorRef);
    const compilado = compilarCasoAfi(definicion, actor);
    // Solo en memoria y solo para esta exploración (autorización del usuario): teléfonos QA ya usados por otros perfiles.
    const cel = process.env.AFI_CP01_NUM_CEL?.trim(), fijo = process.env.AFI_CP01_NUM_CEL_FIJO?.trim();
    expect(!!cel && !!fijo, 'teléfonos QA configurados').toBe(true);
    const actorContacto: ActorAfi = { ...actor, datos: { ...actor.datos, numeroCelular: cel, numeroTelefonoFijo: fijo } };

    const pantallas: { momento: string; estructura: EstructuraPantalla }[] = [];
    const observar = async (momento: string) => { pantallas.push({ momento, estructura: await observarEstructura(page) }); };
    let numero: string | undefined, cancelado: boolean | undefined, error: { tipo: string; mensaje: string } | undefined;
    let direccion: { restricciones: Awaited<ReturnType<typeof restricciones>>; catalogos: Awaited<ReturnType<typeof catalogo>>[] } | undefined;
    let diligencia: { valores: Record<string, string>; continuarHabilitado: boolean; avanzo: boolean; siguiente?: { titulo: string | undefined; restricciones: Awaited<ReturnType<typeof restricciones>> } } | undefined;
    try {
      await ejecutarCasoAfi(compilado, {
        page, context, testInfo: info, evidencia: 'off',
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
            funcionalUi: {
              ejecutarPaso: async () => {
                const portal = new AfiliacionesPortal(page);
                await observar('contacto-llegada');
                // Etapa preparada por el driver GENÉRICO con las políticas EFECTIVAS del perfil (variantes PJ).
                await new AfiDataUi(portal).completarEtapa('informacion-contacto', resolverEtapa('informacion-contacto', { actor: actorContacto }));
                await observar('contacto-diligenciado');
                await avanzar(page, 'Continuar', TITULO_DIRECCION, 60_000);
                await observar('direccion-llegada');
                const est = pantallas.at(-1)!.estructura;
                direccion = {
                  restricciones: await restricciones(page),
                  catalogos: await Promise.all(est.controles.filter(c => c.familia === 'mat-select').map(c => catalogo(page, portal, c.identidad))),
                };
                await observar('direccion-tras-catalogos');
                // ---- Solo los 4 obligatorios, con valores sintéticos deterministas dentro del dominio observado ----
                const valores: Record<string, string> = {};
                for (const id of OBLIGATORIOS_SELECT) {
                  const cat = direccion.catalogos.find(c => c.identidad === id);
                  if (!cat || !('opciones' in cat)) throw new Error(`catálogo no observado: ${id}`);
                  valores[id] = opcionDeDominio(cat.opciones, semilla(id));
                  await portal.elegirExactoEn(page.locator(`mat-select[formcontrolname="${id}"], mat-select[id="${id}"]`).first(), valores[id]);
                }
                for (const id of OBLIGATORIOS_NUMERO) {
                  valores[id] = String(enteroEnRango(RANGO_NUMERO.min, RANGO_NUMERO.max, semilla(id)));
                  const input = page.locator(`input[formcontrolname="${id}"], input[name="${id}"], input[id="${id}"]`);
                  await expect.poll(() => input.count(), { message: `exactamente un control ${id}` }).toBe(1);
                  await input.fill(valores[id]);
                  expect(await input.inputValue() === valores[id], `${id}: valor ingresado`).toBe(true);
                }
                await observar('direccion-diligenciada');
                const continuar = page.locator('button:visible').filter({ hasText: /^\s*Continuar\s*$/ });
                await expect.poll(() => continuar.count(), { message: 'exactamente un Continuar visible' }).toBe(1);
                let continuarHabilitado = false;
                try { await expect(continuar).toBeEnabled({ timeout: 30_000 }); continuarHabilitado = true; } catch { /* se registra */ }
                diligencia = { valores, continuarHabilitado, avanzo: false };
                if (!continuarHabilitado) throw new Error('Continuar no se habilitó con los 4 obligatorios');
                await continuar.click();
                await expect(page.getByText(TITULO_DIRECCION, { exact: true }).first(), 'se deja Dirección').toBeHidden({ timeout: 60_000 });
                await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 60_000 });
                await observar('siguiente-llegada');
                diligencia = { valores, continuarHabilitado, avanzo: true,
                  siguiente: { titulo: pantallas.at(-1)!.estructura.encabezados[0], restricciones: await restricciones(page) } };
                // Representante Legal: SOLO se observa; no se diligencia nada.
                throw new ExploracionDetenida();
              },
            },
          };
        },
      });
    } catch (e) {
      if (!(e instanceof Error && e.name === 'ExploracionDetenida')) error = { tipo: e instanceof Error ? e.name : 'Error', mensaje: mensajeParaReporte(errorSeguro(e).message) };
      if (error) pantallas.push({ momento: 'fallo', estructura: await observarEstructura(page).catch(() => VACIA) });
    }
    const salida = { actorRef, pantallas, ...(direccion ? { direccion } : {}), ...(diligencia ? { diligencia } : {}), cleanup: numero === undefined ? 'N/A' : cancelado ? 'PASS' : 'FAIL', ...(error ? { error } : {}) };
    const dir = 'test-results/colsubsidio/exploracion-pj';
    await mkdir(dir, { recursive: true });
    const ruta = join(dir, `exploracion-direccion-${actorRef}.json`);
    await writeFile(ruta, JSON.stringify(salida, null, 2), 'utf8');
    const valores = sensibles();
    let coincidencias = 0;
    for (const f of [ruta, ...await archivos(info.outputDir)]) coincidencias += valores.filter(v => leer(f).includes(v)).length;
    console.log(`EXPLORACION_DIRECCION_PJ ${JSON.stringify({ actorRef, momentos: pantallas.map(p => p.momento), cleanup: salida.cleanup, error, piiScan: { valoresVigilados: valores.length, coincidencias } })}`);
    expect(coincidencias, 'sin PII').toBe(0);
    expect(salida.cleanup).toBe('PASS');
  });
});
