import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compilarCasoAfi, type DefinicionCasoAfi } from '../data/afi/caso';
import { CP04_EMPRESA } from '../data/afi/casos/hu14-12-cp04';
import { REGISTRO_DATOS_PRUEBA_AFI, actorParaCaso } from '../data/afi/datosPrueba/registro';
import { colaboradoresReales, ejecutarCasoAfi } from '../helpers/afiCaseRunner';
import type { BizagiQaSupport } from '../helpers/bizagiQaSupport';

/**
 * DIAGNÓSTICO DE ALCANZABILIDAD — Empleador Persona Jurídica (corrida real técnica, temporal). NO forma parte del suite.
 *
 * Flujo existente CP04 Empresa con el actor provisionado indicado (actorRef explícito, sin fallback). En la pantalla PJ, ANTES
 * de que el runner exija el Continuar habilitado, se toma un snapshot SANITIZADO: cada estado se calcula DENTRO del navegador y
 * solo salen booleanos (nunca valores). Se toma al llegar (inicial) y tras la misma espera que aplica el runner (decision).
 * Si el Continuar se habilita, el runner avanza solo hasta el punto funcional y se detiene ANTES de cualquier paso funcional.
 * Cleanup del runner siempre. Sin stores, sin evidencia cliente, sin acciones nuevas sobre el Portal.
 */

const ACTOR_REF = 'empresa-empleador-juridico-rues-sin-rep-legal';
const BOTON_PJ = 'btn-empleador-pj-continuar';
/** Controles a observar si existen (CIIU aparece como "ciuu" en el DOM observado el 02-Oct). */
const CONTROLES = ['naturaleza', 'claseEmpleador', 'ciiu', 'ciuu', 'razonSocial', 'nit', 'dv', 'tipoOrganizacion', 'sigla', 'actividad',
  'fechaInicio', 'valorNomina', 'numeroTrabajadores', 'afiliadoPrimeraVez'];
const HITOS = {
  apertura: { id: 'P02', esperado: 'Pantalla de inicio visible.' },
  preparacion: { id: 'P03', esperado: 'La pantalla de Información de contacto carga exitosamente.' },
};

class DiagnosticoDetenido extends Error {
  constructor() { super('Diagnóstico detenido en el punto funcional (sin pasos funcionales)'); this.name = 'DiagnosticoDetenido'; }
}

interface EstadoControl { identidadControl: string; presente: boolean; requerido?: boolean; deshabilitado?: boolean; vacio?: boolean; invalido?: boolean; muestraErrorCampo?: boolean }
interface Snapshot { controles: EstadoControl[]; otrosRequeridosOInvalidos: EstadoControl[]; boton: { identidadControl: string; presente: boolean; habilitado: boolean } }

/** Estado SANITIZADO: todo se evalúa en el navegador y solo regresan booleanos e identidades de control. */
function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(({ nombres, boton }) => {
    const visible = (e: Element) => (e as HTMLElement).getClientRects().length > 0 && getComputedStyle(e as HTMLElement).visibility !== 'hidden';
    const estado = (els: Element[]) => {
      const e = els[0];
      const campo = e.closest('mat-form-field') ?? e.parentElement;
      const radios = els.filter(x => (x as HTMLInputElement).type === 'radio' || (x as HTMLInputElement).type === 'checkbox');
      const vacio = radios.length ? !radios.some(r => (r as HTMLInputElement).checked)
        : e.tagName === 'MAT-SELECT' ? !(e.querySelector('.mat-mdc-select-value-text, .mat-select-value-text')?.textContent ?? '').trim()
          : !('value' in e) || String((e as HTMLInputElement).value).trim() === '';
      return {
        requerido: els.some(x => x.hasAttribute('required') || x.getAttribute('aria-required') === 'true')
          || !!campo?.querySelector('.mat-mdc-form-field-required-marker, .mat-form-field-required-marker'),
        deshabilitado: els.every(x => x.hasAttribute('disabled') || x.getAttribute('aria-disabled') === 'true'
          || x.classList.contains('mat-mdc-select-disabled') || x.classList.contains('mat-select-disabled')),
        vacio,
        invalido: els.some(x => x.classList.contains('ng-invalid') || x.getAttribute('aria-invalid') === 'true'),
        muestraErrorCampo: !!campo && [...campo.querySelectorAll('mat-error, .mat-mdc-form-field-error, .mat-error, .text-error, .text-danger')].some(visible),
      };
    };
    const buscar = (n: string) => [...document.querySelectorAll(`[formcontrolname="${n}"], [id="${n}"]`)].filter(visible);
    const controles = nombres.map(n => {
      const els = buscar(n);
      return els.length ? { identidadControl: n, presente: true, ...estado(els) } : { identidadControl: n, presente: false };
    });
    // Otros controles visibles requeridos o inválidos (identidad = formcontrolname o id; nunca valores).
    const conocidos = new Set(nombres);
    const grupos = new Map<string, Element[]>();
    for (const e of [...document.querySelectorAll('input, mat-select, select, textarea')].filter(visible)) {
      const id = e.getAttribute('formcontrolname') || e.id;
      if (!id || conocidos.has(id) || (e as HTMLInputElement).type === 'hidden') continue;
      grupos.set(id, [...(grupos.get(id) ?? []), e]);
    }
    const otros = [...grupos].map(([id, els]) => ({ identidadControl: id, presente: true, ...estado(els) })).filter(x => x.requerido || x.invalido);
    const b = document.getElementById(boton) as HTMLButtonElement | null;
    return { controles, otrosRequeridosOInvalidos: otros, boton: { identidadControl: boton, presente: !!b, habilitado: !!b && !b.disabled } };
  }, { nombres: CONTROLES, boton: BOTON_PJ });
}

/** Valores sensibles del entorno (solo en memoria) para el escaneo; nunca se imprimen. */
const sensibles = () => Object.entries(process.env)
  // Solo campos PII (los públicos, como el tipo de aportante, aparecen legítimamente en el diseño QA).
  .filter(([k, v]) => /^AFI_(ACTOR|QA|CP01|SHARED)_/.test(k) && /IDENTIFICACION|CORREO|CEL|TELEFONO|SALARIO|ACTIVIDAD|INGRESO/.test(k) && !!v && v.trim().length >= 5)
  .map(([, v]) => v!.trim());

async function archivos(dir: string): Promise<string[]> {
  const r: string[] = [];
  for (const n of await readdir(dir).catch(() => [] as string[])) {
    const p = join(dir, n);
    if ((await stat(p)).isDirectory()) r.push(...await archivos(p)); else if (/\.(json|md|txt|log)$/.test(n)) r.push(p);
  }
  return r;
}

test.describe('Diagnóstico de alcanzabilidad Empleador PJ', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.use({ viewport: { width: 1365, height: 900 } });

  test('snapshot sanitizado de la pantalla PJ antes de Continuar', async ({ page, context }, info) => {
    test.skip(process.env.AFI_DIAGNOSTICO_PJ_RUN_REAL !== 'true', 'Requiere AFI_DIAGNOSTICO_PJ_RUN_REAL=true');
    test.setTimeout(12 * 60_000);
    expect(info.config.workers, 'workers=1').toBe(1);
    expect(info.project.retries, 'retries=0').toBe(0);

    // Actor EXPLÍCITO del Test Data Registry (sin fallback: si no está READY, actorParaCaso lanza antes de navegar).
    const definicion: DefinicionCasoAfi = { ...CP04_EMPRESA, actorRef: ACTOR_REF };
    const actor = actorParaCaso(definicion, REGISTRO_DATOS_PRUEBA_AFI, process.env);
    expect(actor.id, 'actor del slot indicado, sin fallback').toBe(ACTOR_REF);
    const compilado = compilarCasoAfi(definicion, actor);

    const transiciones: string[] = [];
    let inicial: Snapshot | undefined, decision: Snapshot | undefined;
    let reached = false, numero: string | undefined, cancelado: boolean | undefined, errorType: string | undefined;
    try {
      await ejecutarCasoAfi(compilado, {
        page, context, testInfo: info, hitos: HITOS, evidencia: 'off',
        diagnosticoAntesDeContinuar: async ({ boton }) => {
          transiciones.push(boton ?? '(sin id)');
          if (boton !== BOTON_PJ || inicial) return;
          inicial = await snapshot(page);
          // Misma espera que aplica el runner a su comprobación (solo lectura), y snapshot en el momento de decidir.
          await expect(page.locator(`[id="${BOTON_PJ}"]`)).toBeEnabled({ timeout: 15_000 }).catch(() => undefined);
          decision = await snapshot(page);
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
            // Se detiene ANTES del primer paso funcional: el runner solo llega aquí con Información de contacto alcanzada.
            funcionalUi: { ejecutarPaso: async () => { reached = true; throw new DiagnosticoDetenido(); } },
          };
        },
      });
    } catch (e) { if (!(e instanceof Error && e.name === 'DiagnosticoDetenido')) errorType = e instanceof Error ? e.name : 'Error'; }

    const salida = {
      actorRef: ACTOR_REF,
      reachability: reached ? 'REACHABILITY_NOW_PASS' : 'REACHABILITY_NOW_BLOCKED',
      pantallaPjPresentada: !!inicial,
      transiciones,
      snapshotInicial: inicial ?? null,
      snapshotDecision: decision ?? null,
      cleanup: numero === undefined ? 'N/A' : cancelado ? 'PASS' : 'FAIL',
      ...(errorType ? { errorType } : {}),
    };
    const dir = 'test-results/colsubsidio/diagnostico-pj';
    await mkdir(dir, { recursive: true });
    const ruta = join(dir, 'snapshot-pj.json');
    await writeFile(ruta, JSON.stringify(salida, null, 2), 'utf8');

    // Escaneo PII: artefactos de esta corrida + salida, contra los valores sensibles en memoria (solo conteo).
    const valores = sensibles();
    let coincidencias = 0, revisados = 0;
    for (const f of [ruta, ...await archivos(info.outputDir)]) {
      const t = await readFile(f, 'utf8').catch(() => '');
      revisados++;
      coincidencias += valores.filter(v => t.includes(v)).length;
    }
    console.log(`DIAGNOSTICO_PJ ${JSON.stringify({ ...salida, piiScan: { valoresVigilados: valores.length, archivos: revisados, coincidencias } })}`);
    expect(coincidencias, 'sin PII en artefactos').toBe(0);
    expect(salida.cleanup, 'cleanup obligatorio').toBe('PASS');
  });
});
