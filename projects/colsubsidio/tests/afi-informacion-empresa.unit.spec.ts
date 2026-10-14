import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { actorDesdeEntorno } from '../data/afi/actores';
import { construirAgentManifest } from '../data/afi/agentManifest';
import { compilarCasoAfi, diagnosticoCasoCompilado, type DefinicionCasoAfi } from '../data/afi/caso';
import { CapabilityGapPreparacionError, capacidad, evaluarCapacidad } from '../data/afi/capacidadesPreparacion';
import { CP04_EMPRESA, CP04_FACULTATIVO, CP04_PENSIONADO } from '../data/afi/casos/hu14-12-cp04';
import { CAMPOS_PEDIBLES, validarCamposRequeridos } from '../data/afi/datosPrueba/contrato';
import { aplicarDecisionesDatos, plantillaDecisionesDatos, recibirRequisitosDelAgente } from '../data/afi/datosPrueba/intake';
import { REGISTRO_DATOS_PRUEBA_AFI } from '../data/afi/datosPrueba/registro';
import { registroAntesKdC970 } from './fixtures/registroAntesKdC970';
import type { ResultadoOperacionAfi } from '../data/afi/funcional';
import { resumenCompilacion } from '../data/afi/loader';
import { CAMPOS_AFI, ResolucionCampo, type ActorAfi, type EtapaAfi } from '../data/afi/modelo';
import { POLITICAS_AFI } from '../data/afi/politicas';
import { DataGapPantallaError, coincideOpcionCatalogo, decidirSegunEstado, fechaIso, type DiagnosticoEstadoCampo } from '../data/afi/preparacionSegunEstado';
import { resolverEtapa, type PlanPreparacion } from '../data/afi/resolver';
import { PreparacionDetenidaError, ejecutarCasoAfi, type ColaboradoresAfi } from '../helpers/afiCaseRunner';
import { AfiDataUi, type AplicacionCampo } from '../helpers/afiDataUi';
import { AfiliacionesPortal } from '../helpers/afiliacionesPortal';

/**
 * 4S-R.1: preparación SEGÚN ESTADO de "Ingresa la información de la empresa" (Empleador PJ). Actores y valores FICTICIOS,
 * DOM sintético con las identidades observadas en el snapshot sanitizado (incluida la errata "ciuu"). Sin QA real.
 */

const ENTORNO_EMPRESA = { AFI_QA_EMPRESA_IDENTIFICACION: '900000001', AFI_QA_CORREO: 'empresa.qa@example.test' };
const NEGOCIO = {
  codigoCiiu: '4711', razonSocial: 'Razon Ficticia QA SAS', actividadEconomicaEmpresa: 'Actividad Ficticia QA', fechaInicioActividad: '01/02/2020',
  valorNomina: '12345678', numeroTrabajadores: '17', afiliadoPrimeraVez: 'Si',
} as const;
/** Ningún valor del actor puede aparecer en diagnósticos, errores, evidencias ni manifest. */
const PII = /\b4711\b|900000001|empresa\.qa@example\.test|Razon Ficticia|Actividad Ficticia|01\/02\/2020|12345678/;
const CAMPOS_EMPRESA = ['razonSocial', 'codigoCiiu', 'actividadEconomicaEmpresa', 'fechaInicioActividad', 'valorNomina', 'numeroTrabajadores', 'afiliadoPrimeraVez'];
/** Corrección 4S-R.1: TODOS son datos del actor (incluido el CIIU); ninguno es auxiliar. */
const SIN_DATO = CAMPOS_EMPRESA;
/** 4S-R.2: + el condicional que solo aparece tras afiliadoPrimeraVez. */
const CON_CAJA = [...CAMPOS_EMPRESA, 'cajaCompensacionAnterior'];
const ETAPAS_PJ: EtapaAfi[] = ['inicio-solicitud', 'informacion-empresa', 'telefonos', 'informacion-adicional'];

/** Actor Empresa legacy (solo identificación y correo) y el mismo con datos de negocio ficticios. */
const legacy = (): ActorAfi => actorDesdeEntorno('empresa', ENTORNO_EMPRESA);
const conNegocio = (datos: Partial<Record<keyof typeof NEGOCIO, string>> = NEGOCIO): ActorAfi => ({ ...legacy(), id: 'empresa-ficticia', datos: { ...legacy().datos, ...datos } });
const planEmpresa = (actor: ActorAfi): PlanPreparacion => resolverEtapa('informacion-empresa', { actor });
const conEtapas = (def: DefinicionCasoAfi, etapas: EtapaAfi[]): DefinicionCasoAfi => ({ ...def, preparacion: { ...def.preparacion, etapas } });
const falla = (p: Promise<unknown>) => p.then(() => new Error('no falló'), (e: Error) => e);

// ---------- DOM sintético de la pantalla PJ (identidades DOM observadas; valores precargados ficticios y públicos) ----------
type EstadoFx = 'vacio' | 'valido' | 'deshabilitado-vacio' | 'deshabilitado-lleno' | 'invalido-lleno' | 'ausente';
interface Fx {
  razonSocial?: EstadoFx; ciuu?: EstadoFx; actividad?: EstadoFx; fechaInicio?: EstadoFx; valorNomina?: EstadoFx; numeroTrabajadores?: EstadoFx;
  afiliado?: 'vacio' | 'valido' | 'ausente';
  /** CIIU sin panel de sugerencias asociado (no es el autocompletar soportado). */
  ciuuSinPanel?: true;
  /** El Portal completa la actividad económica al elegir el CIIU (opcionalmente tras una demora en ms). */
  derivaActividad?: true;
  derivaActividadMs?: number;
  /** Control inválido sin política (p. ej. un campo nuevo del Portal). */
  extraInvalido?: true;
  /** Qué MUESTRA el input CIIU tras elegir una opción (el Portal real muestra solo el código). Por defecto, el label completo. */
  ciuuMuestra?: 'codigo' | 'completo' | 'otro' | 'vacio';
  /** El control CIIU queda aria-invalid=true tras seleccionar. */
  ciuuQuedaInvalido?: true;
  /** "Clase aportante" observada el 06-Oct: requerido, deshabilitado y vacío (sin política: solo se observa). */
  claseAportante?: true;
  /**
   * 4S-R.2: "Caja de compensación anterior" (DOM cajaCompensacion) aparece ~400 ms DESPUÉS de responder afiliadoPrimeraVez.
   * Como en QA real: un INPUT de Material con matAutocomplete (role=combobox, aria-autocomplete=list), NO un mat-select.
   */
  caja?: 'no-aparece' | 'deshabilitada' | 'valida' | 'vacia';
  /** El control de caja queda aria-invalid aunque se elija una opción. */
  cajaQuedaInvalida?: true;
  /** El catálogo trae DOS opciones con el texto exacto del actor (ambigüedad). */
  cajaDuplicada?: true;
  /** Regresión del supuesto viejo: el Portal la presenta como mat-select (la familia declarada ya no corresponde). */
  cajaComoMatSelect?: true;
  /** Como en Mobile (QA 06-Oct): "Fecha de inicio" es un input NATIVO type="date" (solo acepta ISO aaaa-mm-dd). */
  fechaNativa?: true;
}
/**
 * Catálogo ficticio de cajas. Al escribir el valor del actor, el filtro predictivo (contains) deja visibles DOS opciones y la
 * PRIMERA es una que solo CONTIENE el valor ("... ANEXO"): la elegida debe ser la EXACTA (nunca primera ni contains).
 */
const CAJA_ACTOR = 'C.C.F. QA GAMMA - SUR';
const CATALOGO_CAJAS = ['C.C.F. QA ALFA - NORTE', 'C.C.F. QA GAMMA - SUR ANEXO', CAJA_ACTOR, 'C.C.F. QA BETA - CENTRO'];
const PJ_VACIA: Fx = { razonSocial: 'vacio', ciuu: 'vacio', actividad: 'vacio', fechaInicio: 'vacio', valorNomina: 'invalido-lleno', numeroTrabajadores: 'vacio', afiliado: 'vacio' };
const PJ_PRECARGADA: Fx = { razonSocial: 'valido', ciuu: 'valido', actividad: 'valido', fechaInicio: 'valido', valorNomina: 'valido', numeroTrabajadores: 'valido', afiliado: 'valido' };

/** Catálogo ficticio: la PRIMERA sugerencia para "47.." es deliberadamente una opción que NO corresponde al CIIU del actor. */
const CATALOGO_CIIU = ['47110 Comercio Largo QA', '4711 Comercio QA', '0111 Cultivo QA', '0112 Otro QA'];

function input(fcn: string, estado: EstadoFx = 'vacio', id = fcn, extra = ''): string {
  if (estado === 'ausente') return '';
  const valor = estado === 'valido' || estado === 'deshabilitado-lleno' ? (fcn === 'ciuu' ? '0111 Cultivo QA' : 'PRECARGA-QA') : estado === 'invalido-lleno' ? '$ 0' : '';
  const invalido = estado === 'vacio' || estado === 'invalido-lleno';
  return `<input type="text" id="${id}" formcontrolname="${fcn}" ${extra} ${estado.startsWith('deshabilitado') ? 'disabled' : ''} class="${invalido ? 'ng-invalid' : ''}" value="${valor}">`;
}
function pantallaPj(c: Fx): string {
  const panel = c.ciuuSinPanel ? '' : 'role="combobox" aria-controls="p-ciuu" aria-expanded="false"';
  const radio = (v: string) => c.afiliado === 'ausente' ? ''
    : `<input type="radio" id="afiliadoPrimeraVez${v}" formcontrolname="afiliadoPrimeraVez" name="apv" value="${v}" class="${c.afiliado === 'valido' ? '' : 'ng-invalid'}" ${c.afiliado === 'valido' && v === 'No' ? 'checked' : ''}>`;
  return `
    <style>mat-select{display:block;min-height:20px;border:1px solid #999;margin:4px}</style>
    <div id="pj"><p>Ingresa la información de la empresa</p>
    ${input('razonSocial', c.razonSocial)} ${input('sigla', 'valido')}
    <input type="text" id="nit" formcontrolname="nit" disabled value="PRECARGA-NIT"><input type="text" id="dv" formcontrolname="dv" disabled value="7">
    <mat-select formcontrolname="naturaleza" aria-disabled="true" class="mat-mdc-select-disabled"><span class="mat-mdc-select-value-text">Privada</span></mat-select>
    ${input('ciuu', c.ciuu, 'mat-input-0', panel)}
    <div id="p-ciuu" role="listbox" hidden>${CATALOGO_CIIU.map(o => `<div role="option">${o}</div>`).join('')}</div>
    ${input('actividad', c.actividad)} ${c.fechaNativa ? '<input type="date" id="fechaInicio" formcontrolname="fechaInicio" class="ng-invalid">' : input('fechaInicio', c.fechaInicio)} ${input('valorNomina', c.valorNomina)}
    <mat-select formcontrolname="tipoOrganizacion" aria-required="false"></mat-select>
    <mat-select formcontrolname="claseEmpleador" aria-disabled="true" class="mat-mdc-select-disabled"><span class="mat-mdc-select-value-text">Clase QA</span></mat-select>
    ${input('numeroTrabajadores', c.numeroTrabajadores)} ${radio('Si')} ${radio('No')}
    ${c.claseAportante ? '<mat-select formcontrolname="claseAportante" aria-required="true" aria-disabled="true" class="mat-mdc-select-disabled"></mat-select>' : ''}
    ${c.extraInvalido ? input('campoNuevoPortal', 'vacio') : ''}
    <div id="hueco-caja"></div>
    <button type="button" id="btn-empleador-pj-continuar" disabled>Continuar</button></div>
    <script>(() => {
      window.ediciones = {}; window.continuar = 0;
      const editar = n => { window.ediciones[n] = (window.ediciones[n] || 0) + 1; };
      const boton = document.getElementById('btn-empleador-pj-continuar');
      const actualizar = () => { boton.disabled = [...document.querySelectorAll('#pj input')].some(e => !e.disabled && e.classList.contains('ng-invalid')); };
      document.querySelectorAll('#pj input[type=text]:not([formcontrolname=ciuu])').forEach(e => e.addEventListener('input', () => {
        editar(e.getAttribute('formcontrolname'));
        e.classList.toggle('ng-invalid', !e.value.trim() || e.value.trim() === '$ 0'); actualizar();
      }));
      document.querySelectorAll('#pj input[type=date]').forEach(e => ['input', 'change'].forEach(ev => e.addEventListener(ev, () => {
        editar(e.getAttribute('formcontrolname')); e.classList.toggle('ng-invalid', !e.value); actualizar();
      })));
      const modoCaja = '${c.caja ?? 'no-aparece'}';
      window.escritoCaja = false;
      const mostrarCaja = () => {
        if (modoCaja === 'no-aparece' || document.querySelector('[formcontrolname=cajaCompensacion]')) return;
        const dis = modoCaja === 'deshabilitada', val = modoCaja === 'valida';
        const opciones = ${JSON.stringify(CATALOGO_CAJAS)}.concat(${c.cajaDuplicada ? 'true' : 'false'} ? [${JSON.stringify(CAJA_ACTOR)}] : []);
        const lista = '<div id="mat-autocomplete-9" role="listbox" hidden>' + opciones.map(o => '<div role="option">' + o + '</div>').join('') + '</div>';
        document.getElementById('hueco-caja').innerHTML = ${c.cajaComoMatSelect ? 'true' : 'false'}
          // Supuesto viejo (regresión): un mat-select con su panel.
          ? '<mat-select formcontrolname="cajaCompensacion" role="combobox" aria-required="true" aria-controls="mat-autocomplete-9" class="ng-invalid"></mat-select>' + lista
          // Componente REAL: input Material + matAutocomplete (aria-controls solo mientras el panel está abierto).
          : '<input type="text" matinput id="mat-input-1" formcontrolname="cajaCompensacion" placeholder="Selecciona una opción" autocomplete="off"'
            + ' class="mat-mdc-autocomplete-trigger mat-mdc-input-element' + (val || dis ? '' : ' ng-invalid') + '" role="combobox" aria-autocomplete="list"'
            + ' aria-haspopup="listbox" aria-expanded="false" aria-required="true" required' + (dis ? ' disabled' : '') + ' value="' + (val ? 'C.C.F. QA BETA - CENTRO' : '') + '">'
            + lista;
        const ctl = document.querySelector('[formcontrolname=cajaCompensacion]'), pc = document.getElementById('mat-autocomplete-9');
        const abrir = () => {
          if (ctl.disabled) return;
          const t = (ctl.value || '').trim().toLowerCase();
          pc.querySelectorAll('[role=option]').forEach(o => { o.hidden = !!t && !o.textContent.toLowerCase().includes(t); });
          pc.hidden = false; ctl.setAttribute('aria-expanded', 'true'); ctl.setAttribute('aria-controls', 'mat-autocomplete-9');
        };
        ctl.addEventListener('click', abrir);
        ctl.addEventListener('input', () => { window.escritoCaja = true; ctl.classList.add('ng-invalid'); abrir(); actualizar(); });
        pc.querySelectorAll('[role=option]').forEach(o => o.addEventListener('click', () => {
          editar('cajaCompensacion'); window.cajaElegida = o.textContent;
          ctl.value = o.textContent;
          ctl.classList.remove('ng-invalid');
          if (${c.cajaQuedaInvalida ? 'true' : 'false'}) ctl.setAttribute('aria-invalid', 'true');
          pc.hidden = true; ctl.setAttribute('aria-expanded', 'false'); ctl.removeAttribute('aria-controls');
          actualizar();
        }));
        actualizar();
      };
      document.querySelectorAll('#pj input[type=radio]').forEach(e => e.addEventListener('change', () => {
        editar('afiliadoPrimeraVez'); document.querySelectorAll('#pj input[type=radio]').forEach(r => r.classList.remove('ng-invalid')); actualizar();
        setTimeout(mostrarCaja, 400);
      }));
      const ciuu = document.querySelector('[formcontrolname=ciuu]'), panel = document.getElementById('p-ciuu');
      window.escritoCiuu = false;
      if (ciuu) ciuu.addEventListener('input', () => { window.escritoCiuu = true; });
      if (ciuu && ciuu.getAttribute('aria-controls')) {
        // Predictivo: muestra las opciones que contienen los dos primeros caracteres escritos (como una búsqueda del servidor).
        const filtrar = () => { const t = ciuu.value.trim().slice(0, 2).toLowerCase();
          panel.querySelectorAll('[role=option]').forEach(o => { o.hidden = !!t && !o.textContent.toLowerCase().includes(t); }); };
        const abrir = () => { filtrar(); panel.hidden = false; ciuu.setAttribute('aria-expanded', 'true'); };
        ciuu.addEventListener('click', abrir);
        ciuu.addEventListener('input', abrir);
        panel.querySelectorAll('[role=option]').forEach(o => o.addEventListener('click', () => {
          const muestra = '${c.ciuuMuestra ?? 'completo'}';
          editar('ciuu');
          ciuu.value = muestra === 'codigo' ? o.textContent.split(' ')[0] : muestra === 'otro' ? '47110' : muestra === 'vacio' ? '' : o.textContent;
          ciuu.classList.remove('ng-invalid'); panel.hidden = true; ciuu.setAttribute('aria-expanded', 'false');
          if (${c.ciuuQuedaInvalido ? 'true' : 'false'}) ciuu.setAttribute('aria-invalid', 'true');
          const act = document.querySelector('[formcontrolname=actividad]');
          const derivar = () => { act.value = 'Descripcion CIIU QA'; act.classList.remove('ng-invalid'); actualizar(); };
          if (${c.derivaActividad ? 'true' : 'false'} && act) setTimeout(derivar, ${c.derivaActividadMs ?? 0});
          actualizar();
        }));
      }
      boton.addEventListener('click', () => {
        window.continuar++;
        document.getElementById('pj').outerHTML = '<h2>Información de contacto</h2>';
      });
      actualizar();
    })();</script>`;
}
async function montar(page: Page, c: Fx): Promise<AfiDataUi> {
  await page.setContent(pantallaPj(c));
  return new AfiDataUi(new AfiliacionesPortal(page));
}
const escritoCiuu = (page: Page) => page.evaluate(() => (window as unknown as { escritoCiuu: boolean }).escritoCiuu);
const ediciones = (page: Page) => page.evaluate(() => (window as unknown as { ediciones: Record<string, number> }).ediciones);
const valor = (page: Page, fcn: string) => page.locator(`[formcontrolname="${fcn}"]`).first().inputValue();
const decisiones = (d: readonly DiagnosticoEstadoCampo[]) => Object.fromEntries(d.map(x => [x.campo, x.decision]));

/** Ejecuta la etapa capturando aplicaciones y diagnósticos de estado (lo mismo que persiste el runner). */
async function preparar(ui: AfiDataUi, plan: PlanPreparacion) {
  const aplicadas: AplicacionCampo[] = [];
  let estado: readonly DiagnosticoEstadoCampo[] = [];
  const error = await ui.completarInformacionEmpresa(plan, async a => { aplicadas.push(a); }, async d => { estado = d; }).then(() => undefined, (e: Error) => e);
  return { aplicadas, estado, error };
}

// =====================================================================================
test.describe('4S-R.1 regla según estado (pura)', () => {
  test('ausente / deshabilitado / precarga válida / vacío o inválido con y sin dato', () => {
    const e = (presente: boolean, deshabilitado: boolean, vacio: boolean, invalido: boolean) => ({ presente, deshabilitado, vacio, invalido });
    expect(decidirSegunEstado(e(false, false, true, false), true)).toBe('ausente');
    expect(decidirSegunEstado(e(true, true, true, false), true)).toBe('deshabilitado');
    expect(decidirSegunEstado(e(true, true, false, false), true)).toBe('deshabilitado');
    expect(decidirSegunEstado(e(true, false, false, false), true)).toBe('conservar');
    expect(decidirSegunEstado(e(true, false, false, false), false)).toBe('conservar');
    expect(decidirSegunEstado(e(true, false, true, true), true)).toBe('preparar');
    expect(decidirSegunEstado(e(true, false, false, true), true)).toBe('preparar'); // con contenido pero inválido (valorNomina "$ 0")
    expect(decidirSegunEstado(e(true, false, true, true), false)).toBe('sin-dato');
  });

  test('coincidencia de catálogo: igual o código seguido de separador; nunca un prefijo numérico más largo', () => {
    expect(coincideOpcionCatalogo('4711 - Comercio QA', '4711')).toBe(true);
    expect(coincideOpcionCatalogo('  4711   Comercio QA ', '4711')).toBe(true);
    expect(coincideOpcionCatalogo('4711 Comercio QA', '4711 comercio qa')).toBe(true);
    expect(coincideOpcionCatalogo('47110 Comercio Largo QA', '4711')).toBe(false);
    expect(coincideOpcionCatalogo('0111 Cultivo QA', '4711')).toBe(false);
    expect(coincideOpcionCatalogo('4711 Comercio QA', '')).toBe(false);
  });
});

test.describe('4S-R.1 clasificación, compilación y contrato de datos', () => {
  test('H. actor Empresa legacy: el caso CP04 legacy no cambia; con la etapa declarada compila ejecutable con gaps CONDICIONALES', () => {
    const base = compilarCasoAfi(CP04_EMPRESA, legacy());
    expect(base.preparacion.orden).toEqual(['inicio-solicitud', 'telefonos', 'informacion-adicional']);
    expect(base.ejecutable).toBe(true);
    const c = compilarCasoAfi(conEtapas(CP04_EMPRESA, ETAPAS_PJ), legacy());
    expect(c.ejecutable).toBe(true);
    const plan = c.preparacion.etapas['informacion-empresa']!;
    expect(plan.gaps).toEqual([]);
    expect(plan.resoluciones).toEqual([]);
    expect(plan.condicionales!.map(g => [g.campo, g.motivo, g.fuentesEsperadas])).toEqual(CON_CAJA.map(s => [s, 'sin-fuente-segura', ['test-case', 'actor']]));
    const diag = diagnosticoCasoCompilado(c).preparacion.find(p => p.etapa === 'informacion-empresa')!;
    expect(diag.condicionales!.map(g => g.campo)).toEqual(CON_CAJA);
    expect(resumenCompilacion(c).texto).toMatch(/informacion-empresa\s+resoluciones=0\s+requerida=sí\s+segunEstado=8/);
    // Los casos legacy no publican condicionales (resumen idéntico).
    expect(resumenCompilacion(base).texto).not.toContain('segunEstado');
  });

  test('B/E. con datos de negocio del actor: todo (incluido el CIIU) se resuelve desde el actor', () => {
    const plan = planEmpresa(conNegocio());
    expect(plan.gaps).toEqual([]);
    expect(plan.condicionales?.map(g => g.campo)).toEqual(['cajaCompensacionAnterior']);
    expect(plan.resoluciones.map(r => [r.campo, r.origen, r.estrategia])).toEqual(CAMPOS_EMPRESA.map(c => [c, 'actor', undefined]));
    expect(JSON.stringify(plan)).not.toMatch(PII);
  });

  test('una aserción sobre un campo sin valor sigue siendo gap DURO (no se difiere a la pantalla)', () => {
    const def = conEtapas(CP04_EMPRESA, ETAPAS_PJ);
    const c = compilarCasoAfi({ ...def, preparacion: { ...def.preparacion, camposAsercion: ['razonSocial'] } }, legacy());
    expect(c.ejecutable).toBe(false);
    expect(c.preparacion.gaps.map(g => [g.etapa, g.campo, g.motivo])).toEqual([['informacion-empresa', 'razonSocial', 'asercion-sin-valor-explicito']]);
  });

  test('F. Test Data: los siete hechos de negocio (incluido el CIIU) son pedibles: solo actor, pii, sin estrategia auxiliar', () => {
    expect(validarCamposRequeridos(CON_CAJA, 'c')).toEqual([]);
    for (const c of SIN_DATO) {
      expect(CAMPOS_PEDIBLES, c).toContain(c);
      expect([POLITICAS_AFI[c as 'razonSocial'].sensibilidad, POLITICAS_AFI[c as 'razonSocial'].auxiliar], c).toEqual(['pii', undefined]);
    }
    // Ningún dato de negocio se inventa: sin estrategia determinística en la etapa.
    for (const c of CAMPOS_EMPRESA) expect(POLITICAS_AFI[c as 'razonSocial'].auxiliar?.tipo ?? 'ninguna', c).not.toMatch(/deterministic|boolean-required/);
  });

  test('E. nunca "primera opción": el CIIU no admite estrategias de catálogo, ni siquiera pedidas por el caso', () => {
    for (const estrategia of [{ tipo: 'first-valid-autocomplete' }, { tipo: 'first-valid-option', orden: 'catalogo' }] as const) {
      const r = new ResolucionCampo('codigoCiiu', 'test-case', 'pii', false, undefined, estrategia);
      expect('problema' in evaluarCapacidad('informacion-empresa', r), estrategia.tipo).toBe(true);
      const def = conEtapas(CP04_EMPRESA, ETAPAS_PJ);
      expect(() => compilarCasoAfi({ ...def, preparacion: { ...def.preparacion, datosCaso: { ...def.preparacion.datosCaso, codigoCiiu: { estrategia } } } }, legacy()),
        estrategia.tipo).toThrow(CapabilityGapPreparacionError);
    }
    expect(POLITICAS_AFI.codigoCiiu.auxiliar).toBeUndefined();
  });

  test('G. "ciuu" no es identidad pública: solo el adaptador UI la conoce', async () => {
    expect(CAMPOS_AFI as readonly string[]).not.toContain('ciuu');
    expect(CAMPOS_AFI).toContain('codigoCiiu');
    const manifest = JSON.stringify(construirAgentManifest());
    expect(manifest).not.toMatch(/ciuu/i);
    expect(await readFile(resolve(__dirname, '../data/afi/AFI-AGENT-MANIFEST.json'), 'utf8')).not.toMatch(/ciuu/i);
    const raiz = resolve(__dirname, '../data/afi');
    const fuentes = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true }))
      .map(d => d.isDirectory() ? fuentes(join(dir, d.name)) : /\.(ts|json)$/.test(d.name) ? [join(dir, d.name)] : []))).flat();
    for (const f of await fuentes(raiz)) expect(await readFile(f, 'utf8'), f).not.toMatch(/\bciuu\b/i);
    expect(await readFile(resolve(__dirname, '../helpers/afiDataUi.ts'), 'utf8')).toMatch(/codigoCiiu: \{ control: 'ciuu' \}/);
  });

  test('I. otros perfiles (Persona Natural/independiente, pensionado, facultativo): la etapa no les aplica y sus casos no cambian', () => {
    for (const perfil of ['independiente', 'pensionado', 'facultativo'] as const) {
      expect(resolverEtapa('informacion-empresa', { actor: actorDesdeEntorno(perfil, {}) }), perfil).toEqual({ resoluciones: [], gaps: [] });
    }
    for (const def of [CP04_EMPRESA, CP04_PENSIONADO, CP04_FACULTATIVO]) expect(def.preparacion.etapas, def.nombre).not.toContain('informacion-empresa');
  });
});

test.describe('4S-R.1 driver según estado sobre DOM sintético', () => {
  test('A. pantalla completamente precargada: no se modifica nada (ni con datos del actor)', async ({ page }) => {
    const ui = await montar(page, PJ_PRECARGADA);
    const { aplicadas, estado, error } = await preparar(ui, planEmpresa(conNegocio()));
    expect(error).toBeUndefined();
    expect(await ediciones(page)).toEqual({});
    expect(CAMPOS_EMPRESA.map(c => decisiones(estado)[c])).toEqual(CAMPOS_EMPRESA.map(() => 'conservar'));
    expect(aplicadas.map(a => [a.campo, a.modo])).toEqual(CAMPOS_EMPRESA.map(c => [c, 'precargado']));
    // A (CIIU): precargado válido -> ni se escribe ni se abre su panel.
    expect([await valor(page, 'ciuu'), await escritoCiuu(page)]).toEqual(['0111 Cultivo QA', false]);
    expect(await valor(page, 'razonSocial')).toBe('PRECARGA-QA');
    await expect(page.locator('#btn-empleador-pj-continuar')).toBeEnabled();
    expect(JSON.stringify([estado, aplicadas])).not.toMatch(PII);
  });

  test('B. habilitados y vacíos con dato del actor: se preparan; el CIIU busca y elige ESA opción (no la primera)', async ({ page }) => {
    const ui = await montar(page, PJ_VACIA);
    const { aplicadas, estado, error } = await preparar(ui, planEmpresa(conNegocio()));
    expect(error).toBeUndefined();
    expect(CAMPOS_EMPRESA.map(c => decisiones(estado)[c])).toEqual(CAMPOS_EMPRESA.map(() => 'preparar'));
    expect(estado.filter(d => CAMPOS_EMPRESA.includes(d.campo)).every(d => d.final && !d.final.invalido && !d.final.vacio)).toBe(true);
    expect(aplicadas.map(a => [a.campo, a.origen, a.modo])).toEqual(CAMPOS_EMPRESA.map(c => [c, 'actor', 'ejecutado']));
    // CIIU: se escribió el dato del actor y se eligió la ÚNICA coincidente; la primera sugerencia ("47110 ...") NO.
    expect(await valor(page, 'ciuu')).toBe('4711 Comercio QA');
    const ciiu = aplicadas.find(a => a.campo === 'codigoCiiu')!;
    expect([ciiu.valorEfectivo, ciiu.diagnostico().valorEfectivo, ciiu.diagnostico().opciones]).toEqual(['4711 Comercio QA', '[REDACTED]', undefined]);
    expect((await ediciones(page)).ciuu).toBe(1);
    expect(await page.evaluate(() => document.getElementById('p-ciuu')!.hidden)).toBe(true);
    await expect(page.locator('#btn-empleador-pj-continuar')).toBeEnabled();
    // Precargados y opcionales intactos.
    expect(await ediciones(page)).not.toHaveProperty('nit');
    expect(await ediciones(page)).not.toHaveProperty('sigla');
    expect(JSON.stringify([estado, aplicadas.map(a => a.diagnostico())])).not.toMatch(PII);
  });

  test('C. deshabilitado y vacío: nunca se edita; se diagnostica sin DataGap', async ({ page }) => {
    const ui = await montar(page, { ...PJ_PRECARGADA, razonSocial: 'deshabilitado-vacio' });
    const { estado, error } = await preparar(ui, planEmpresa(legacy()));
    expect(error).toBeUndefined();
    const razon = estado.find(d => d.campo === 'razonSocial')!;
    expect([razon.decision, razon.estado]).toEqual(['deshabilitado', { presente: true, deshabilitado: true, vacio: true, invalido: false }]);
    expect(await ediciones(page)).toEqual({});
  });

  test('D. habilitados y vacíos SIN dato: DataGap explícito en pantalla (tras preparar lo resoluble), sin valores', async ({ page }) => {
    const ui = await montar(page, PJ_VACIA);
    const { estado, error } = await preparar(ui, planEmpresa(legacy()));
    expect(error).toBeInstanceOf(DataGapPantallaError);
    const gap = error as DataGapPantallaError;
    expect(gap.faltantes.map(f => [f.campo, f.motivo, f.fuentesEsperadas])).toEqual(SIN_DATO.map(c => [c, 'sin-dato', ['test-case', 'actor']]));
    expect(gap.message).toMatch(/^DataGap en informacion-empresa:\n- razonSocial: el Portal lo presenta habilitado y vacío\/inválido/);
    // C (CIIU): sin dato del actor -> DataGap; ni se escribe en el autocompletar ni se elige ninguna opción.
    expect([await ediciones(page), await escritoCiuu(page), await valor(page, 'ciuu')]).toEqual([{}, false, '']);
    expect(decisiones(estado)).toMatchObject({ codigoCiiu: 'sin-dato', razonSocial: 'sin-dato', valorNomina: 'sin-dato' });
    await expect(page.locator('#btn-empleador-pj-continuar')).toBeDisabled();
    expect(`${gap.message}${JSON.stringify(estado)}`).not.toMatch(PII);
  });

  test('D2. el Portal deriva la actividad al elegir el CIIU (con demora): se observa y se conserva, sin usar el dato del actor', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, derivaActividad: true, derivaActividadMs: 800 });
    const { estado, error } = await preparar(ui, planEmpresa(conNegocio({ ...NEGOCIO, actividadEconomicaEmpresa: undefined })));
    expect(error).toBeUndefined();
    const actividad = estado.find(d => d.campo === 'actividadEconomicaEmpresa')!;
    expect([actividad.decision, actividad.origen]).toEqual(['conservar', undefined]);
    expect(await ediciones(page)).not.toHaveProperty('actividad');
  });

  test('D3. el Portal NO deriva la actividad: tras el CIIU sigue vacía -> se usa el dato del actor; sin dato -> DataGap', async ({ page }) => {
    const ui = await montar(page, PJ_VACIA);
    const con = await preparar(ui, planEmpresa(conNegocio()));
    expect(con.error).toBeUndefined();
    expect(con.estado.find(d => d.campo === 'actividadEconomicaEmpresa')!.decision).toBe('preparar');
    const ui2 = await montar(page, PJ_VACIA);
    const sin = await preparar(ui2, planEmpresa(conNegocio({ ...NEGOCIO, actividadEconomicaEmpresa: undefined })));
    expect((sin.error as DataGapPantallaError).faltantes.map(f => f.campo)).toEqual(['actividadEconomicaEmpresa']);
  });

  test('D. CIIU del actor que el catálogo no ofrece: CapabilityGap, sin elegir otra opción y sin exponer el valor', async ({ page }) => {
    const ui = await montar(page, PJ_VACIA);
    const { error } = await preparar(ui, planEmpresa(conNegocio({ ...NEGOCIO, codigoCiiu: '4799' })));
    expect(error).toBeInstanceOf(CapabilityGapPreparacionError);
    expect(error!.message).toContain('informacion-empresa.codigoCiiu');
    expect(error!.message).toContain('sin-coincidencia');
    expect(error!.message).not.toMatch(/4799|ciuu/);
    // Se buscó (se escribió el valor) pero NO se eligió ninguna opción: ni la primera ni otra.
    expect([await escritoCiuu(page), (await ediciones(page)).ciuu]).toEqual([true, undefined]);
    expect(CATALOGO_CIIU).not.toContain(await valor(page, 'ciuu'));
  });

  test('E. un valor válido ya diligenciado se conserva aunque el actor traiga otro', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, valorNomina: 'valido', razonSocial: 'valido' });
    const { aplicadas, error } = await preparar(ui, planEmpresa(conNegocio()));
    expect(error).toBeUndefined();
    expect([await valor(page, 'valorNomina'), await valor(page, 'razonSocial')]).toEqual(['PRECARGA-QA', 'PRECARGA-QA']);
    expect(await ediciones(page)).not.toHaveProperty('valorNomina');
    expect(aplicadas.filter(a => a.modo === 'precargado').map(a => a.campo)).toEqual(['razonSocial', 'valorNomina']);
  });

  test('F2. CIIU sin panel de sugerencias: CapabilityGap, sin escribir a ciegas', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, ciuuSinPanel: true });
    const { error } = await preparar(ui, planEmpresa(conNegocio()));
    expect(error).toBeInstanceOf(CapabilityGapPreparacionError);
    expect(error!.message).toContain('informacion-empresa.codigoCiiu');
    expect(error!.message).not.toMatch(/ciuu/);
    expect(await valor(page, 'ciuu')).toBe('');
    expect(await ediciones(page)).not.toHaveProperty('ciuu');
  });

  test('CIIU A. opción "4711 Comercio QA" y el input muestra solo "4711" (como el Portal real) -> PASS', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, ciuuMuestra: 'codigo' });
    const { aplicadas, error } = await preparar(ui, planEmpresa(conNegocio()));
    expect(error).toBeUndefined();
    expect(await valor(page, 'ciuu')).toBe('4711');
    expect([aplicadas.find(a => a.campo === 'codigoCiiu')!.modo, (await ediciones(page)).ciuu]).toEqual(['ejecutado', 1]);
  });

  test('CIIU B. el input muestra el label completo coincidente -> PASS', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, ciuuMuestra: 'completo' });
    expect((await preparar(ui, planEmpresa(conNegocio()))).error).toBeUndefined();
    expect(await valor(page, 'ciuu')).toBe('4711 Comercio QA');
  });

  for (const [caso, fx] of [
    ['C. el input termina mostrando "47110" (otro código)', { ciuuMuestra: 'otro' }],
    ['D. el input termina vacío', { ciuuMuestra: 'vacio' }],
    ['E. valor correcto pero aria-invalid=true', { ciuuMuestra: 'codigo', ciuuQuedaInvalido: true }],
  ] as [string, Fx][]) {
    test(`CIIU ${caso} -> FAIL (CapabilityGap no-verificada), sin elegir otra opción`, async ({ page }) => {
      const ui = await montar(page, { ...PJ_VACIA, ...fx });
      const { error } = await preparar(ui, planEmpresa(conNegocio()));
      expect(error).toBeInstanceOf(CapabilityGapPreparacionError);
      expect(error!.message).toContain('informacion-empresa.codigoCiiu');
      expect(error!.message).toContain('no-verificada');
      expect(error!.message).not.toMatch(/\b4711\b|47110|ciuu/);
      // Una sola selección (la coincidente): ningún fallback a otra opción.
      expect((await ediciones(page)).ciuu).toBe(1);
    });
  }

  test('CIIU F. el Portal deriva Actividad económica tras la selección (y el input muestra solo el código): se conserva', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, ciuuMuestra: 'codigo', derivaActividad: true, derivaActividadMs: 500 });
    const { estado, error } = await preparar(ui, planEmpresa(conNegocio()));
    expect(error).toBeUndefined();
    expect(estado.find(d => d.campo === 'actividadEconomicaEmpresa')!.decision).toBe('conservar');
    expect(await valor(page, 'actividad')).toBe('Descripcion CIIU QA');
    expect(await ediciones(page)).not.toHaveProperty('actividad');
  });

  test('Clase aportante: SOLO se observa (identidad + booleanos, antes y después); nunca se prepara', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, claseAportante: true });
    let otros: { inicial: readonly { identidadControl: string }[]; final?: readonly { identidadControl: string }[] } | undefined;
    const error = await ui.completarInformacionEmpresa(planEmpresa(conNegocio()), undefined, undefined, async o => { otros = o; }).then(() => undefined, (e: Error) => e);
    expect(error).toBeUndefined();
    const clase = (l?: readonly { identidadControl: string }[]) => l?.find(x => x.identidadControl === 'claseAportante');
    for (const momento of [otros!.inicial, otros!.final]) {
      expect(clase(momento)).toEqual({ identidadControl: 'claseAportante', requerido: true, deshabilitado: true, vacio: true, invalido: false });
    }
    expect(await ediciones(page)).not.toHaveProperty('claseAportante');
    expect(JSON.stringify(otros)).not.toMatch(PII);
    // Sin política ni capability: no existe como campo AFI.
    expect(CAMPOS_AFI as readonly string[]).not.toContain('claseAportante');
  });

  // ---------- 4S-R.2: Caja de compensación anterior (condicional tras afiliadoPrimeraVez) ----------
  const conCaja = (caja: string | null = CAJA_ACTOR) => conNegocio({ ...NEGOCIO, ...(caja ? { cajaCompensacionAnterior: caja } : {}) });
  const decisionCaja = (estado: readonly DiagnosticoEstadoCampo[]) => estado.find(d => d.campo === 'cajaCompensacionAnterior');

  test('Caja A. se prepara afiliadoPrimeraVez y la caja NO aparece -> PASS, ninguna acción', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, caja: 'no-aparece' });
    const { estado, error } = await preparar(ui, planEmpresa(conCaja()));
    expect(error).toBeUndefined();
    expect(decisionCaja(estado)!.decision).toBe('ausente');
    expect(await ediciones(page)).not.toHaveProperty('cajaCompensacion');
  });

  test('Caja B. aparece deshabilitada -> nunca se toca', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, caja: 'deshabilitada' });
    const { estado, error } = await preparar(ui, planEmpresa(conCaja()));
    expect(error).toBeUndefined();
    expect(decisionCaja(estado)!.decision).toBe('deshabilitado');
    expect(await ediciones(page)).not.toHaveProperty('cajaCompensacion');
  });

  test('Caja C. aparece ya válida -> se conserva (no se sobrescribe con el dato del actor)', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, caja: 'valida' });
    const { estado, aplicadas, error } = await preparar(ui, planEmpresa(conCaja()));
    expect(error).toBeUndefined();
    expect(decisionCaja(estado)!.decision).toBe('conservar');
    expect(aplicadas.find(a => a.campo === 'cajaCompensacionAnterior')!.modo).toBe('precargado');
    expect(await ediciones(page)).not.toHaveProperty('cajaCompensacion');
  });

  test('Caja D/G/I. aparece tras afiliadoPrimeraVez, vacía, con dato del actor -> re-observa y elige EXACTAMENTE ese valor (no la primera)', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, caja: 'vacia' });
    const { estado, aplicadas, error } = await preparar(ui, planEmpresa(conCaja()));
    expect(error).toBeUndefined();
    // I: en el instante de preparar afiliadoPrimeraVez el control NO existía; la decisión se tomó tras re-observar.
    expect([decisionCaja(estado)!.estado, decisionCaja(estado)!.decision]).toEqual([{ presente: true, deshabilitado: false, vacio: true, invalido: true }, 'preparar']);
    expect(decisionCaja(estado)!.final).toEqual({ presente: true, deshabilitado: false, vacio: false, invalido: false });
    const elegida = await page.evaluate(() => (window as unknown as { cajaElegida: string }).cajaElegida);
    expect([elegida, (await ediciones(page)).cajaCompensacion]).toEqual([CAJA_ACTOR, 1]);
    expect(elegida).not.toBe(CATALOGO_CAJAS[0]);
    const caja = aplicadas.find(a => a.campo === 'cajaCompensacionAnterior')!;
    // Evidencia segura de la interacción: familia autocomplete, control DOM real, regla exacta, panel abierto, 1 coincidencia.
    expect(caja.diagnostico().interaccion).toEqual({
      familia: 'autocomplete', control: 'cajaCompensacion', regla: 'exacta', panelAbierto: true, opcionesVisibles: 2, coincidencias: 1, clic: true, verificada: true,
    });
    expect(await page.locator('input[formcontrolname="cajaCompensacion"]').inputValue()).toBe(CAJA_ACTOR);
    expect(await page.evaluate(() => (window as unknown as { escritoCaja: boolean }).escritoCaja)).toBe(true);
    expect([caja.origen, caja.modo, caja.diagnostico().valorEfectivo]).toEqual(['actor', 'ejecutado', '[REDACTED]']);
    await expect(page.locator('#btn-empleador-pj-continuar')).toBeEnabled();
    // J: sin PII en la evidencia.
    expect(JSON.stringify([estado, aplicadas.map(a => a.diagnostico())])).not.toMatch(/GAMMA|Razon Ficticia|900000001/);
  });

  test('Caja E. aparece vacía y el actor no tiene el dato -> DataGapPantallaError(cajaCompensacionAnterior)', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, caja: 'vacia' });
    const { error } = await preparar(ui, planEmpresa(conCaja(null)));
    expect(error).toBeInstanceOf(DataGapPantallaError);
    expect((error as DataGapPantallaError).faltantes).toEqual([{ campo: 'cajaCompensacionAnterior', motivo: 'sin-dato', fuentesEsperadas: ['test-case', 'actor'] }]);
    expect(error!.message).not.toMatch(/cajaCompensacion\b|C\.C\.F\./);
    expect(await ediciones(page)).not.toHaveProperty('cajaCompensacion');
  });

  test('Caja F/G. dato del actor que no existe en el catálogo -> CapabilityGap, sin elegir otra opción ni exponer el valor', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, caja: 'vacia' });
    const { error } = await preparar(ui, planEmpresa(conCaja('Caja Inexistente QA')));
    expect(error).toBeInstanceOf(CapabilityGapPreparacionError);
    expect(error!.message).toContain('informacion-empresa.cajaCompensacionAnterior');
    expect(error!.message).not.toMatch(/Caja Inexistente|C\.C\.F\.|cajaCompensacion\b/);
    expect([await ediciones(page), await page.evaluate(() => (window as unknown as { cajaElegida?: string }).cajaElegida)])
      .toEqual([expect.not.objectContaining({ cajaCompensacion: expect.anything() }), undefined]);
  });

  test('Caja: dos opciones con el texto exacto -> CapabilityGap ambigua (nunca elige una de ellas)', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, caja: 'vacia', cajaDuplicada: true });
    const { error } = await preparar(ui, planEmpresa(conCaja()));
    expect(error).toBeInstanceOf(CapabilityGapPreparacionError);
    expect(error!.message).toMatch(/ambigua; regla exacta, panel abierto, opciones visibles 3, coincidencias 2/);
    expect(await ediciones(page)).not.toHaveProperty('cajaCompensacion');
  });

  test('Caja: el viejo supuesto mat-select ya no pasa inadvertido (la familia declarada es autocomplete)', async ({ page }) => {
    expect(capacidad('informacion-empresa', 'cajaCompensacionAnterior')).toMatchObject({ control: 'autocomplete', coincidencia: 'exacta' });
    const ui = await montar(page, { ...PJ_VACIA, caja: 'vacia', cajaComoMatSelect: true });
    const { error } = await preparar(ui, planEmpresa(conCaja()));
    expect(error).toBeInstanceOf(CapabilityGapPreparacionError);
    expect(error!.message).toContain('no es el autocompletar soportado');
    expect(await ediciones(page)).not.toHaveProperty('cajaCompensacion');
  });

  test('Caja: elegida pero el control queda inválido -> CapabilityGap no-verificada', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, caja: 'vacia', cajaQuedaInvalida: true });
    const { error } = await preparar(ui, planEmpresa(conCaja()));
    expect(error).toBeInstanceOf(CapabilityGapPreparacionError);
    expect(error!.message).toContain('no-verificada');
  });

  test('Caja G/H. sin estrategia de catálogo; "cajaCompensacion" no es identidad pública', async () => {
    expect(POLITICAS_AFI.cajaCompensacionAnterior).toMatchObject({ control: 'autocomplete', delActor: true, sensibilidad: 'pii', segunEstado: true, perfiles: ['empresa'] });
    expect(POLITICAS_AFI.cajaCompensacionAnterior.auxiliar).toBeUndefined();
    for (const estrategia of [{ tipo: 'first-valid-option', orden: 'catalogo' }, { tipo: 'first-valid-option', orden: 'alfabetico' }, { tipo: 'first-valid-autocomplete' }] as const) {
      expect('problema' in evaluarCapacidad('informacion-empresa', new ResolucionCampo('cajaCompensacionAnterior', 'test-case', 'pii', false, undefined, estrategia))).toBe(true);
    }
    expect(CAMPOS_AFI as readonly string[]).not.toContain('cajaCompensacion');
    const manifest = JSON.stringify(construirAgentManifest());
    expect(manifest).toContain('cajaCompensacionAnterior');
    expect(manifest).not.toMatch(/cajaCompensacion\b/);
    expect(await readFile(resolve(__dirname, '../data/afi/AFI-AGENT-MANIFEST.json'), 'utf8')).not.toMatch(/cajaCompensacion\b/);
    expect(validarCamposRequeridos(['cajaCompensacionAnterior'], 'c')).toEqual([]);
  });

  test('Fecha en input NATIVO type="date" (Mobile): el mismo dato dd/mm/aaaa se escribe en ISO y queda válido', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, fechaNativa: true });
    const { error } = await preparar(ui, planEmpresa(conNegocio()));
    expect(error).toBeUndefined();
    expect(await page.locator('input[formcontrolname="fechaInicio"]').inputValue()).toBe('2020-02-01');
    await expect(page.locator('input[formcontrolname="fechaInicio"]')).not.toHaveClass(/ng-invalid/);
  });

  test('Fecha nativa con un dato fuera del formato declarado -> CapabilityGap sin exponer el valor (nunca se adivina el formato)', async ({ page }) => {
    const ui = await montar(page, { ...PJ_VACIA, fechaNativa: true });
    const { error } = await preparar(ui, planEmpresa(conNegocio({ ...NEGOCIO, fechaInicioActividad: '2020-02-01' })));
    expect(error).toBeInstanceOf(CapabilityGapPreparacionError);
    expect(error!.message).toContain('formato de fecha declarado (dd/mm/aaaa)');
    expect(error!.message).not.toContain('2020');
    expect(await page.locator('input[formcontrolname="fechaInicio"]').inputValue()).toBe('');
  });

  test('fechaIso: solo dd/mm/aaaa y fechas reales del calendario', () => {
    expect([fechaIso('01/02/2020', 'dd/mm/aaaa'), fechaIso(' 29/02/2024 ', 'dd/mm/aaaa')]).toEqual(['2020-02-01', '2024-02-29']);
    expect([fechaIso('31/02/2020', 'dd/mm/aaaa'), fechaIso('2020-02-01', 'dd/mm/aaaa'), fechaIso('1/2/2020', 'dd/mm/aaaa'), fechaIso('', 'dd/mm/aaaa')])
      .toEqual([undefined, undefined, undefined, undefined]);
  });

  test('control inválido NO declarado: se reporta por su identidad pública, nunca se rellena', async ({ page }) => {
    const ui = await montar(page, { ...PJ_PRECARGADA, extraInvalido: true });
    const { error } = await preparar(ui, planEmpresa(conNegocio()));
    expect(error).toBeInstanceOf(DataGapPantallaError);
    expect((error as DataGapPantallaError).faltantes).toEqual([{ campo: 'campoNuevoPortal', motivo: 'control-no-declarado' }]);
    expect(await ediciones(page)).toEqual({});
  });

  test('I2. pantalla ausente (otra variante): ningún campo se toca', async ({ page }) => {
    await page.setContent('<p>Otra pantalla</p><script>window.ediciones = {}</script>');
    const { estado, error } = await preparar(new AfiDataUi(new AfiliacionesPortal(page)), planEmpresa(conNegocio()));
    expect(error).toBeUndefined();
    expect(CAMPOS_EMPRESA.map(c => decisiones(estado)[c])).toEqual(CAMPOS_EMPRESA.map(() => 'ausente'));
  });
});

// ---------- Integración con el runner existente (mismo loop de preparación; sin runner paralelo) ----------
function colaboradores(page: Page, fx: Fx, r: { cancelados: number; pasos: string[] }): () => Promise<ColaboradoresAfi> {
  const real = () => new AfiDataUi(new AfiliacionesPortal(page));
  return async () => ({
    portal: {
      abrir: async () => { await page.setContent('<p>Inicio</p>'); },
      enviarUnaVez: async registrar => { await registrar('900123'); await page.setContent(pantallaPj(fx)); return '900123'; },
    },
    soporte: { login: async () => {}, registrarCasoCreado: async () => {}, emularReconocimiento: async () => {}, cancelarCasoCreado: async () => { r.cancelados++; } },
    datosUi: {
      completarInicioSolicitud: async () => [], completarTelefonos: async () => [], completarInformacionAdicional: async () => [],
      completarInformacionEmpresa: (plan, registrar, estado) => real().completarInformacionEmpresa(plan, registrar, estado),
    },
    funcionalUi: {
      ejecutarPaso: async (paso, registrar) => {
        r.pasos.push(paso.id);
        const res: ResultadoOperacionAfi = { tipo: paso.operaciones[0].tipo, resultado: 'PASS', observado: {} };
        await registrar?.(res);
        return [res];
      },
    },
    cerrar: async () => {},
  });
}
async function adjuntos(info: TestInfo): Promise<string> {
  return (await Promise.all(info.attachments.filter(a => a.path).map(a => readFile(a.path!, 'utf8').catch(() => '')))).join('\n');
}
const HITOS = { apertura: { id: 'P02', esperado: 'Apertura' }, preparacion: { id: 'P03', esperado: 'Preparación' } };

test.describe('4S-R.1 runner: etapa informacion-empresa en el loop existente', () => {
  test('PJ con datos del actor: prepara según estado, cruza btn-empleador-pj-continuar y llega al punto funcional', async ({ page, context }, info) => {
    const c = compilarCasoAfi(conEtapas(CP04_EMPRESA, ['inicio-solicitud', 'informacion-empresa']), conNegocio());
    const r = { cancelados: 0, pasos: [] as string[] };
    const resultado = await ejecutarCasoAfi(c, { page, context, testInfo: info, hitos: HITOS, colaboradores: colaboradores(page, PJ_VACIA, r) });
    expect(resultado.resultado).toBe('PASS');
    expect(resultado.trazaTecnica.filter(e => e.evento === 'transicion-preparacion').map(e => e.detalle)).toEqual(['btn-empleador-pj-continuar']);
    expect(resultado.etapasPreparacion.find(e => e.etapa === 'informacion-empresa')).toMatchObject({ declarada: true, requerida: true, aplicada: true, resultado: 'aplicada' });
    expect([r.cancelados, r.pasos.length > 0]).toEqual([1, true]);
    const nombres = info.attachments.map(a => a.name);
    expect(nombres).toEqual(expect.arrayContaining(['CP04-estado-informacion-empresa.json', 'CP04-ejecucion-informacion-empresa.json', 'CP04-plan-informacion-empresa.json']));
    expect(`${JSON.stringify(resultado)}${await adjuntos(info)}`).not.toMatch(PII);
  });

  test('PJ sin datos de negocio: DataGapPantallaError antes del Continuar, sin pasos funcionales y con cleanup', async ({ page, context }, info) => {
    const c = compilarCasoAfi(conEtapas(CP04_EMPRESA, ['inicio-solicitud', 'informacion-empresa']), legacy());
    expect(c.ejecutable).toBe(true);
    const r = { cancelados: 0, pasos: [] as string[] };
    const error = await falla(ejecutarCasoAfi(c, { page, context, testInfo: info, hitos: HITOS, colaboradores: colaboradores(page, PJ_VACIA, r) }));
    expect(error).toBeInstanceOf(DataGapPantallaError);
    expect([r.cancelados, r.pasos]).toEqual([1, []]);
    expect(await page.evaluate(() => (window as unknown as { continuar: number }).continuar)).toBe(0);
    expect(`${error.message}${await adjuntos(info)}`).not.toMatch(PII);
  });

  test('diagnóstico que pide detener: corta ANTES del Continuar (sin pulsarlo), sin funcional y con cleanup', async ({ page, context }, info) => {
    const c = compilarCasoAfi(conEtapas(CP04_EMPRESA, ['inicio-solicitud', 'informacion-empresa']), conNegocio());
    const r = { cancelados: 0, pasos: [] as string[] };
    const vistos: (string | null)[] = [];
    const error = await falla(ejecutarCasoAfi(c, {
      page, context, testInfo: info, hitos: HITOS, colaboradores: colaboradores(page, PJ_VACIA, r),
      diagnosticoAntesDeContinuar: async ({ boton }) => { vistos.push(boton); return 'detener'; },
    }));
    expect(error).toBeInstanceOf(PreparacionDetenidaError);
    expect([vistos, r.cancelados, r.pasos]).toEqual([['btn-empleador-pj-continuar'], 1, []]);
    expect(await page.evaluate(() => (window as unknown as { continuar: number }).continuar)).toBe(0);
  });

  test('legacy: CP04 Empresa sin la etapa y pantalla PJ precargada cruza igual que antes (sin preparar nada)', async ({ page, context }, info) => {
    const c = compilarCasoAfi(conEtapas(CP04_EMPRESA, ['inicio-solicitud']), legacy());
    const r = { cancelados: 0, pasos: [] as string[] };
    const resultado = await ejecutarCasoAfi(c, { page, context, testInfo: info, hitos: HITOS, colaboradores: colaboradores(page, PJ_PRECARGADA, r) });
    expect(resultado.resultado).toBe('PASS');
    expect(resultado.trazaTecnica.some(e => e.etapa === 'informacion-empresa')).toBe(false);
    expect(await page.evaluate(() => (window as unknown as { ediciones?: Record<string, number> }).ediciones ?? {})).toEqual({});
  });
});

// ---------- Corrección 4S-R.1: ampliación del MISMO actor por el flujo normal de Test Data (en memoria; nunca escribe el store) ----------
test.describe('4S-R.1 Test Data: mismoActorQue amplía el actor existente (simulación en memoria)', () => {
  test('el lote de intake, aprobado con mismoActorQue, añade condición y campos al slot existente sin crear actores', async () => {
    const entrada = JSON.parse(await readFile(resolve(__dirname, '../intake/4s-r1-informacion-empresa-datos.json'), 'utf8'));
    // Base congelada (revisión 10, verificada por hash): la prueba no depende de la revisión vigente del store real.
    const BASE = registroAntesKdC970();
    const antes = JSON.stringify(REGISTRO_DATOS_PRUEBA_AFI);
    const lote = recibirRequisitosDelAgente(entrada, BASE);
    const SIN = 'empresa-empleador-juridico-rues-sin-rep-legal', CON = 'empresa-empleador-juridico-rues-con-rep-legal';
    expect(lote.posiblesDuplicados.map(d => [d.b, d.motivo])).toEqual([[SIN, 'condiciones-relacionadas'], [CON, 'condiciones-relacionadas']]);
    const plantilla = plantillaDecisionesDatos(lote);
    const destino = (pid: string) => (pid.includes('sin-rep-legal') ? SIN : CON);
    const decisiones = { ...plantilla, decisiones: plantilla.decisiones.map(d => ({ ...d, decision: 'APPROVED', revisor: 'qa-revisor', mismoActorQue: destino(d.proposalId) })) };
    const r = aplicarDecisionesDatos(lote, decisiones, BASE, '2026-10-06');
    expect([r.altas, r.reutilizaciones.map(x => x.slot)]).toEqual([[], [SIN, CON]]);
    const slot = (id: string) => r.registro.slots.find(s => s.id === id)!;
    expect(slot(SIN).condiciones.map(c => c.id)).toEqual(['empleador-juridico-rues-sin-rep-legal', 'sin-solicitud-afiliacion-en-curso']);
    expect(slot(SIN).campos.map(c => c.campo)).toEqual(['numeroIdentificacion', 'correo', ...entrada.testDataRequirements[0].camposRequeridos]);
    expect(slot(CON).condiciones.map(c => c.id)).toEqual(['empleador-juridico-rues-con-rep-legal', 'sin-solicitud-afiliacion-en-curso']);
    expect(slot(CON).campos.map(c => c.campo)).toEqual(['numeroIdentificacion', 'correo']);
    expect(r.registro.slots.length).toBe(BASE.slots.length);
    // Simulación pura: el registro vigente no cambia.
    expect(JSON.stringify(REGISTRO_DATOS_PRUEBA_AFI)).toBe(antes);
  });
});
