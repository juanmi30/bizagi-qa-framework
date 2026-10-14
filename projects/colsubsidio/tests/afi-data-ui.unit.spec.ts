import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { actorDesdeEntorno } from '../data/afi/actores';
import { ETAPAS_AFI, ResolucionCampo, REDACTADO, type CampoAfi, type EstrategiaAuxiliar, type OrigenDato, type Sensibilidad, type ValorCampo } from '../data/afi/modelo';
import { PERFILES_AFI } from '../data/afi/perfiles';
import { POLITICAS_AFI } from '../data/afi/politicas';
import { resolverEtapa, resolverPreparacion, type PlanPreparacion } from '../data/afi/resolver';
import { AfiDataUi, PlanIncompletoError } from '../helpers/afiDataUi';
import { AfiliacionesPortal } from '../helpers/afiliacionesPortal';

/** Fase 2B: resolverEtapa + driver de inicio-solicitud sobre un DOM mínimo. Valores ficticios. */

const ENTORNO_EMPRESA = { AFI_QA_EMPRESA_IDENTIFICACION: '900000001', AFI_QA_CORREO: 'empresa.qa@example.test' };
const ENTORNO_PENSIONADO = { AFI_QA_PENSIONADO_IDENTIFICACION: '1000000002', AFI_QA_CORREO: 'pensionado.qa@example.test' };

const contextoCp04 = (perfil: 'empresa' | 'pensionado', entorno: Record<string, string>) => ({
  actor: actorDesdeEntorno(perfil, entorno), datosCaso: { tipoAportante: PERFILES_AFI[perfil].tipoAportante },
});

const res = (campo: CampoAfi, origen: OrigenDato, sensibilidad: Sensibilidad, valor?: ValorCampo, estrategia?: EstrategiaAuxiliar) =>
  new ResolucionCampo(campo, origen, sensibilidad, false, valor, estrategia);
const plan = (...resoluciones: ResolucionCampo[]): PlanPreparacion => ({ resoluciones, gaps: [] });

// ---------- DOM mínimo representativo de inicio-solicitud ----------
interface SelectMock { control: string; opciones: string[]; deshabilitadas?: string[]; valor?: string; disabled?: true }

function formulario(selects: SelectMock[]): string {
  const select = (s: SelectMock) => `
    <mat-select role="combobox" formcontrolname="${s.control}" aria-controls="p-${s.control}" aria-expanded="false"
      ${s.disabled ? 'aria-disabled="true"' : ''}><span class="valor">${s.valor ?? ''}</span></mat-select>
    <div id="p-${s.control}" role="listbox" hidden>${s.opciones.map(o =>
      `<div role="option" ${s.deshabilitadas?.includes(o) ? 'aria-disabled="true"' : ''}>${o}</div>`).join('')}</div>`;
  const autorizacion = (control: string, titulo: string) => `
    <input type="checkbox" formcontrolname="${control}">
    <div role="dialog" aria-label="${titulo}" id="dlg-${control}" hidden class="dlg">
      <div class="ng2-pdf-viewer-container" style="height:80px;overflow:auto"><div style="height:1500px">Documento</div></div>
      <button class="disabled">Aceptar</button>
    </div>`;
  return `
    <style>mat-select,[contenteditable]{display:block;min-height:20px;border:1px solid #999;margin:4px}
      .dlg{position:fixed;top:10px;left:10px;width:300px;background:#fff;z-index:10}</style>
    <button id="iniciar">Iniciar solicitud de afiliación</button>
    <form id="form" hidden onsubmit="return false">
      ${selects.map(select).join('')}
      <input formcontrolname="identificacion" readonly>
      <div contenteditable="true" formcontrolname="correoElectronico"></div>
      <div contenteditable="true" formcontrolname="correoElectronicoConfirmacion"></div>
      <input type="radio" name="asesor" id="recibioAyudaAsesorNo"><input type="radio" name="asesor" id="recibioAyudaAsesorSi">
      ${autorizacion('terminos', 'Autorización para el tratamiento de datos')}
      ${autorizacion('intimidad', 'Autorización para el derecho de intimidad')}
      <button type="button" id="btn-inicio-solicitud-continuar">Continuar</button>
    </form>
    <script>(() => { // IIFE: setContent repetido conserva el global de la página.
      window.clics = {}; window.iniciado = 0;
      document.getElementById('iniciar').addEventListener('click', () => { window.iniciado++; document.getElementById('form').hidden = false; });
      document.querySelectorAll('mat-select').forEach(sel => {
        const nombre = sel.getAttribute('formcontrolname');
        const panel = document.getElementById(sel.getAttribute('aria-controls'));
        sel.addEventListener('click', () => {
          window.clics[nombre] = (window.clics[nombre] || 0) + 1;
          if (sel.getAttribute('aria-disabled') === 'true') return;
          panel.hidden = false; sel.setAttribute('aria-expanded', 'true');
        });
        panel.querySelectorAll('[role=option]').forEach(o => o.addEventListener('click', () => {
          if (o.getAttribute('aria-disabled') === 'true') return;
          sel.querySelector('.valor').textContent = o.textContent;
          panel.hidden = true; sel.setAttribute('aria-expanded', 'false');
        }));
      });
      const ident = document.querySelector('[formcontrolname=identificacion]');
      ident.addEventListener('click', () => ident.removeAttribute('readonly'));
      document.querySelectorAll('input[type=checkbox]').forEach(c => {
        const dialogo = document.getElementById('dlg-' + c.getAttribute('formcontrolname'));
        const visor = dialogo.querySelector('.ng2-pdf-viewer-container');
        const aceptar = dialogo.querySelector('button');
        c.addEventListener('click', e => { if (c.dataset.aceptado) return; e.preventDefault(); dialogo.hidden = false; });
        visor.addEventListener('scroll', () => {
          if (visor.scrollHeight - visor.clientHeight - visor.scrollTop < 3) aceptar.classList.remove('disabled');
        });
        aceptar.addEventListener('click', () => {
          if (aceptar.classList.contains('disabled')) return;
          dialogo.hidden = true; c.dataset.aceptado = '1'; c.checked = true;
        });
      });
    })();</script>`;
}

async function abrir(page: Page, selects: SelectMock[]): Promise<AfiDataUi> {
  await page.setContent(formulario(selects));
  return new AfiDataUi(new AfiliacionesPortal(page));
}
const valorSelect = (page: Page, control: string) => page.locator(`mat-select[formcontrolname="${control}"] .valor`);

test.describe('resolverEtapa', () => {
  test('solo devuelve campos de su etapa y conserva perfiles y precedencia (CP04)', () => {
    const empresa = resolverEtapa('inicio-solicitud', contextoCp04('empresa', ENTORNO_EMPRESA));
    expect(empresa.gaps).toEqual([]);
    expect(empresa.resoluciones.every(r => POLITICAS_AFI[r.campo].etapa === 'inicio-solicitud')).toBe(true);
    const por = Object.fromEntries(empresa.resoluciones.map(r => [r.campo, r.diagnostico()]));
    expect(Object.keys(por)).toEqual(['tipoAportante', 'tipoEmpleador', 'naturaleza', 'claseEmpleador', 'tipoIdentificacion',
      'numeroIdentificacion', 'correo', 'confirmacionCorreo', 'recibioAyudaAsesor', 'autorizaDatos', 'autorizaIntimidad']);
    expect(por.tipoAportante).toMatchObject({ origen: 'test-case', valor: 'Empleador', relevanteParaAsercion: false });
    expect(por.tipoIdentificacion).toMatchObject({ origen: 'actor', valor: 'NIT' });
    expect(por.tipoEmpleador).toMatchObject({ origen: 'actor', valor: 'Jurídica' });
    expect(por.numeroIdentificacion).toMatchObject({ origen: 'actor', sensibilidad: 'pii', valor: REDACTADO });
    expect(por.correo).toMatchObject({ origen: 'actor', sensibilidad: 'pii', valor: REDACTADO });
    expect(por.confirmacionCorreo).toMatchObject({ origen: 'derived', derivadoDe: ['correo'] });
    for (const c of ['naturaleza', 'claseEmpleador']) expect(por[c]).toMatchObject({ origen: 'auxiliary', estrategia: { tipo: 'first-valid-option', orden: 'alfabetico' } });
    expect(por.recibioAyudaAsesor).toMatchObject({ origen: 'auxiliary', estrategia: { tipo: 'deterministic-text', valor: 'No' } });
    for (const c of ['autorizaDatos', 'autorizaIntimidad']) expect(por[c]).toMatchObject({ origen: 'auxiliary', estrategia: { tipo: 'boolean-required', valor: true } });
    expect(JSON.stringify(empresa)).not.toMatch(/900000001|empresa\.qa@/);

    const pensionado = resolverEtapa('inicio-solicitud', contextoCp04('pensionado', ENTORNO_PENSIONADO));
    const afiliado = pensionado.resoluciones.find(r => r.campo === 'tipoAfiliado')!;
    expect([afiliado.origen, afiliado.relevanteParaAsercion]).toEqual(['auxiliary', false]);
    expect(pensionado.resoluciones.map(r => r.campo)).not.toContain('tipoEmpleador');
  });

  test('tipoAportante nunca cae a un default auxiliar', () => {
    const sinAportante = resolverEtapa('inicio-solicitud', { actor: { id: 'x', perfil: 'empresa', datos: {} } });
    expect(sinAportante.gaps.map(g => [g.campo, g.motivo])).toContainEqual(['tipoAportante', 'sin-fuente-segura']);
  });

  test('nombres desconocidos del caso son gap en la etapa; resolverPreparacion no cambia', () => {
    const contexto = { ...contextoCp04('empresa', ENTORNO_EMPRESA), aserciones: ['tipoAportnte' as never] };
    expect(resolverEtapa('inicio-solicitud', contexto).gaps.map(g => [g.campo, g.motivo])).toEqual([['tipoAportnte', 'campo-desconocido']]);
    const completo = resolverPreparacion(contextoCp04('pensionado', ENTORNO_PENSIONADO));
    const porEtapas = ETAPAS_AFI.flatMap(e => resolverEtapa(e, contextoCp04('pensionado', ENTORNO_PENSIONADO)).resoluciones);
    expect(JSON.stringify(completo.resoluciones)).toBe(JSON.stringify(porEtapas));
  });
});

test.describe('AfiDataUi — inicio-solicitud', () => {
  test('gaps o resoluciones no ejecutables impiden tocar el Portal', async ({ page }) => {
    const driver = await abrir(page, []);
    const incompleto = resolverEtapa('inicio-solicitud', { actor: actorDesdeEntorno('empresa', {}) });
    const error = await driver.completarInicioSolicitud(incompleto).then(() => new Error('no falló'), (e: Error) => e);
    expect(error).toBeInstanceOf(PlanIncompletoError);
    expect(error.message).toBe('No se puede preparar inicio-solicitud:\n- numeroIdentificacion: sin-fuente-segura\n'
      + '- correo: sin-fuente-segura\n- confirmacionCorreo: sin-fuente-segura');
    await expect(driver.completarInicioSolicitud(plan(res('departamento', 'test-case', 'public', 'CUNDINAMARCA'))))
      .rejects.toThrow('no puede ejecutar "departamento": campo no soportado en esta etapa');
    await expect(driver.completarInicioSolicitud(plan(res('recibioAyudaAsesor', 'test-case', 'public', 'Sí'))))
      .rejects.toThrow('opción de radio no observada');
    expect(await page.evaluate(() => (window as unknown as { iniciado: number }).iniciado)).toBe(0);
  });

  test('select concreto se elige exacto, sin normalizar', async ({ page }) => {
    const driver = await abrir(page, [{ control: 'tipoAportante', opciones: ['Empleador independiente', 'Empleador', 'Pensionado'] }]);
    const [a] = await driver.completarInicioSolicitud(plan(res('tipoAportante', 'test-case', 'public', 'Empleador')));
    await expect(valorSelect(page, 'tipoAportante')).toHaveText('Empleador');
    expect([a.modo, a.valorEfectivo]).toEqual(['ejecutado', 'Empleador']);
  });

  test('first-valid-option respeta orden de catálogo o alfabético y registra la selección pública', async ({ page }) => {
    const opciones = ['Seleccione una opción', 'Zeta', 'Alfa', 'Beta'];
    for (const [orden, esperado] of [['catalogo', 'Zeta'], ['alfabetico', 'Alfa']] as const) {
      const driver = await abrir(page, [{ control: 'naturaleza', opciones, deshabilitadas: ['Beta'] }]);
      const [a] = await driver.completarInicioSolicitud(plan(res('naturaleza', 'auxiliary', 'public', undefined, { tipo: 'first-valid-option', orden })));
      await expect(valorSelect(page, 'naturaleza')).toHaveText(esperado);
      expect(a.valorEfectivo).toBe(esperado);
      expect(a.diagnostico()).toMatchObject({ origen: 'auxiliary', valorEfectivo: esperado, opciones: ['Zeta', 'Alfa'] });
    }
  });

  test('selección auxiliar de un campo pii queda redactada', async ({ page }) => {
    const driver = await abrir(page, [{ control: 'tipoAfiliado', opciones: ['Beta', 'Alfa'] }]);
    const [a] = await driver.completarInicioSolicitud(plan(res('tipoAfiliado', 'auxiliary', 'pii', undefined, { tipo: 'first-valid-option', orden: 'alfabetico' })));
    expect(a.valorEfectivo).toBe('Alfa');
    expect(a.diagnostico().valorEfectivo).toBe(REDACTADO);
    expect(a.diagnostico().opciones).toBeUndefined();
    expect(JSON.stringify(a)).not.toContain('Alfa');
  });

  test('tipoIde deshabilitado con el valor esperado se acepta sin click', async ({ page }) => {
    const driver = await abrir(page, [{ control: 'tipoIde', opciones: ['NIT'], valor: 'NIT', disabled: true }]);
    const [a] = await driver.completarInicioSolicitud(plan(res('tipoIdentificacion', 'actor', 'public', 'NIT')));
    expect([a.modo, a.valorEfectivo]).toEqual(['precargado', 'NIT']);
    expect(await page.evaluate(() => (window as unknown as { clics: Record<string, number> }).clics.tipoIde ?? 0)).toBe(0);
  });

  test('tipoIde deshabilitado con otro valor falla claro', async ({ page }) => {
    const driver = await abrir(page, [{ control: 'tipoIde', opciones: ['Cédula de Ciudadanía'], valor: 'Cédula de Ciudadanía', disabled: true }]);
    await expect(driver.completarInicioSolicitud(plan(res('tipoIdentificacion', 'actor', 'public', 'NIT'))))
      .rejects.toThrow('tipoIdentificacion: precargado y deshabilitado, debe contener el valor esperado');
  });

  test('texto, checkbox boolean-required y radio determinístico devuelven su valor efectivo', async ({ page }) => {
    const driver = await abrir(page, []);
    const aplicadas = await driver.completarInicioSolicitud(plan(
      res('numeroIdentificacion', 'actor', 'pii', '1000000001'),
      res('correo', 'actor', 'pii', 'qa@example.test'),
      res('recibioAyudaAsesor', 'auxiliary', 'public', undefined, { tipo: 'deterministic-text', valor: 'No', motivo: 'm' }),
      res('autorizaDatos', 'auxiliary', 'public', undefined, { tipo: 'boolean-required', valor: true, motivo: 'm' }),
    ));
    await expect(page.locator('[formcontrolname=identificacion]')).toHaveValue('1000000001');
    await expect(page.locator('#recibioAyudaAsesorNo')).toBeChecked();
    await expect(page.locator('input[formcontrolname=terminos]')).toBeChecked();
    expect(aplicadas.map(a => a.valorEfectivo)).toEqual(['1000000001', 'qa@example.test', 'No', true]);
    const diagnostico = JSON.stringify(aplicadas);
    expect(diagnostico).not.toMatch(/1000000001|qa@example\.test/);
    expect(aplicadas[0].diagnostico()).toMatchObject({ campo: 'numeroIdentificacion', origen: 'actor', valorEfectivo: REDACTADO, aplicado: true });
    expect(aplicadas[2].diagnostico()).toMatchObject({ valorEfectivo: 'No' });
  });

  test('vertical slice Empresa: actor -> resolverEtapa -> driver', async ({ page }) => {
    const driver = await abrir(page, [
      { control: 'tipoAportante', opciones: ['Empleador', 'Pensionado', 'Facultativo'] },
      { control: 'tipoEmpleador', opciones: ['Jurídica', 'Natural'] },
      { control: 'naturaleza', opciones: ['Seleccione', 'Pública', 'Privada', 'Mixta'] },
      { control: 'claseEmpleador', opciones: ['Clase B', 'Clase A'] },
      { control: 'tipoIde', opciones: ['NIT'], valor: 'NIT', disabled: true },
    ]);
    const aplicadas = await driver.completarInicioSolicitud(resolverEtapa('inicio-solicitud', contextoCp04('empresa', ENTORNO_EMPRESA)));
    expect(aplicadas.map(a => [a.campo, a.origen, a.modo])).toEqual([
      ['tipoAportante', 'test-case', 'ejecutado'], ['tipoEmpleador', 'actor', 'ejecutado'],
      ['naturaleza', 'auxiliary', 'ejecutado'], ['claseEmpleador', 'auxiliary', 'ejecutado'],
      ['tipoIdentificacion', 'actor', 'precargado'], ['numeroIdentificacion', 'actor', 'ejecutado'],
      ['correo', 'actor', 'ejecutado'], ['confirmacionCorreo', 'derived', 'ejecutado'],
      ['recibioAyudaAsesor', 'auxiliary', 'ejecutado'], ['autorizaDatos', 'auxiliary', 'ejecutado'], ['autorizaIntimidad', 'auxiliary', 'ejecutado'],
    ]);
    await expect(valorSelect(page, 'naturaleza')).toHaveText('Mixta');
    await expect(valorSelect(page, 'claseEmpleador')).toHaveText('Clase A');
    await expect(page.locator('[formcontrolname=correoElectronicoConfirmacion]')).toHaveText('empresa.qa@example.test');
    await expect(page.locator('input[formcontrolname=intimidad]')).toBeChecked();
    expect(JSON.stringify(aplicadas)).not.toMatch(/900000001|empresa\.qa@/);
  });

  test('el driver no decide provenance ni lee el entorno', async ({ page }) => {
    for (const origen of ['actor', 'test-case'] as const) {
      const driver = await abrir(page, [{ control: 'tipoAportante', opciones: ['Empleador', 'Pensionado'] }]);
      const r = new ResolucionCampo('tipoAportante', origen, 'public', origen === 'test-case', 'Pensionado');
      const [a] = await driver.completarInicioSolicitud(plan(r));
      await expect(valorSelect(page, 'tipoAportante')).toHaveText('Pensionado');
      expect(a.diagnostico()).toMatchObject({ origen, relevanteParaAsercion: origen === 'test-case' });
    }
    const fuente = await readFile(resolve(__dirname, '../helpers/afiDataUi.ts'), 'utf8');
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codigo).not.toMatch(/process\.env|variable\(|resolverCampo|resolverEtapa\(|POLITICAS_AFI|origen\s*[!=]==|relevanteParaAsercion\s*[?&|]/);
  });
});

// ================= Fase 2C: telefonos + informacion-adicional =================

const TELEFONOS_QA = { AFI_CP01_NUM_CEL: '3000000000', AFI_CP01_NUM_CEL_FIJO: '6010000000' };
const ENTORNO_PENSIONADO_2C = { ...ENTORNO_PENSIONADO, ...TELEFONOS_QA };
const ENTORNO_FACULTATIVO = {
  AFI_QA_FACULTATIVO_IDENTIFICACION: '1000000003', AFI_QA_CORREO: 'facultativo.qa@example.test', ...TELEFONOS_QA,
  AFI_QA_FACULTATIVO_NACIONALIDAD: 'Colombiana', AFI_QA_FACULTATIVO_ESTADO_CIVIL: 'Soltero(a)',
  AFI_QA_FACULTATIVO_FONDO_PENSIONES: 'Fondo QA', AFI_QA_FACULTATIVO_SALARIO_BASICO: '1500000',
};
const sin = (entorno: Record<string, string>, clave: string) => Object.fromEntries(Object.entries(entorno).filter(([k]) => k !== clave));
const PII_2C = /3000000000|6010000000|1500000|Colombiana|Soltero|Fondo QA|3999999999/;

test.describe('resolverEtapa — telefonos e informacion-adicional', () => {
  test('telefonos: Empresa sin campos; Pensionado y Facultativo desde el actor', () => {
    expect(resolverEtapa('telefonos', { actor: actorDesdeEntorno('empresa', { ...ENTORNO_EMPRESA, ...TELEFONOS_QA }) }))
      .toEqual({ resoluciones: [], gaps: [] });
    for (const [perfil, entorno] of [['pensionado', ENTORNO_PENSIONADO_2C], ['facultativo', ENTORNO_FACULTATIVO]] as const) {
      const p = resolverEtapa('telefonos', { actor: actorDesdeEntorno(perfil, entorno) });
      expect(p.gaps).toEqual([]);
      expect(p.resoluciones.map(r => r.diagnostico())).toEqual([
        { campo: 'numeroCelular', origen: 'actor', sensibilidad: 'pii', relevanteParaAsercion: false, valor: REDACTADO },
        { campo: 'numeroTelefonoFijo', origen: 'actor', sensibilidad: 'pii', relevanteParaAsercion: false, valor: REDACTADO },
      ]);
      expect(p.resoluciones[0].valor).toBe('3000000000');
      expect(JSON.stringify(p)).not.toMatch(PII_2C);
    }
  });

  test('telefonos: actor sin celular es gap (nunca se inventa)', () => {
    const p = resolverEtapa('telefonos', { actor: actorDesdeEntorno('pensionado', sin(ENTORNO_PENSIONADO_2C, 'AFI_CP01_NUM_CEL')) });
    expect(p.gaps.map(g => [g.campo, g.motivo])).toEqual([['numeroCelular', 'sin-fuente-segura']]);
    expect(p.resoluciones.map(r => r.campo)).toEqual(['numeroTelefonoFijo']);
  });

  test('informacion-adicional: vacío para Empresa y Pensionado; cuatro campos del actor para Facultativo', () => {
    expect(resolverEtapa('informacion-adicional', { actor: actorDesdeEntorno('empresa', ENTORNO_EMPRESA) })).toEqual({ resoluciones: [], gaps: [] });
    expect(resolverEtapa('informacion-adicional', { actor: actorDesdeEntorno('pensionado', ENTORNO_PENSIONADO_2C) })).toEqual({ resoluciones: [], gaps: [] });
    const p = resolverEtapa('informacion-adicional', { actor: actorDesdeEntorno('facultativo', ENTORNO_FACULTATIVO) });
    expect(p.gaps).toEqual([]);
    expect(p.resoluciones.map(r => [r.campo, r.origen, r.estrategia])).toEqual([
      ['fondoPensiones', 'actor', undefined], ['nacionalidad', 'actor', undefined],
      ['estadoCivil', 'actor', undefined], ['salarioBasico', 'actor', undefined],
    ]);
    expect(JSON.stringify(p)).not.toMatch(PII_2C);
  });

  test('informacion-adicional: salario ausente es gap; fondo ausente cae a first-valid-autocomplete (4E.1: materializable)', () => {
    const sinSalario = resolverEtapa('informacion-adicional', { actor: actorDesdeEntorno('facultativo', sin(ENTORNO_FACULTATIVO, 'AFI_QA_FACULTATIVO_SALARIO_BASICO')) });
    expect(sinSalario.gaps.map(g => [g.campo, g.motivo])).toEqual([['salarioBasico', 'sin-fuente-segura']]);
    const sinFondo = resolverEtapa('informacion-adicional', { actor: actorDesdeEntorno('facultativo', sin(ENTORNO_FACULTATIVO, 'AFI_QA_FACULTATIVO_FONDO_PENSIONES')) });
    expect(sinFondo.gaps).toEqual([]);
    expect(sinFondo.resoluciones[0].diagnostico()).toMatchObject({ campo: 'fondoPensiones', origen: 'auxiliary', estrategia: { tipo: 'first-valid-autocomplete' } });
    // Sin página: validarPlan no toca la UI.
    const driver = new AfiDataUi({} as AfiliacionesPortal);
    expect(() => driver.validarPlan('informacion-adicional', sinSalario)).toThrow(PlanIncompletoError);
    expect(() => driver.validarPlan('informacion-adicional', sinFondo)).not.toThrow();
    // Una estrategia que el driver sigue sin saber ejecutar se rechaza antes de la UI.
    const sinNacionalidad = resolverEtapa('informacion-adicional', { actor: actorDesdeEntorno('facultativo', sin(ENTORNO_FACULTATIVO, 'AFI_QA_FACULTATIVO_NACIONALIDAD')) });
    expect(() => driver.validarPlan('informacion-adicional', sinNacionalidad))
      .toThrow('El driver de informacion-adicional no puede ejecutar "nacionalidad": estrategia first-valid-option no soportado para select.');
  });
});

// ---------- DOM mínimo representativo de teléfonos + información adicional Facultativo ----------
function preparacion(): string {
  const select = (control: string, opciones: string[]) => `
    <mat-select role="combobox" formcontrolname="${control}" aria-controls="p-${control}" aria-expanded="false"><span class="valor"></span></mat-select>
    <div id="p-${control}" role="listbox" hidden>${opciones.map(o => `<div role="option">${o}</div>`).join('')}</div>`;
  return `
    <style>mat-select{display:block;min-height:20px;border:1px solid #999;margin:4px}</style>
    <input type="text" id="numeroCelular" value="3999999999">
    <input type="text" id="numeroTelefonoFijo">
    ${select('nacionalidad', ['Colombiana (doble)', 'Colombiana', 'Extranjera'])}
    ${select('estadoCivil', ['Soltero(a)', 'Casado(a)'])}
    <input type="text" id="fondo" formcontrolname="fondo" class="ng-invalid" aria-controls="p-fondo" aria-expanded="false">
    <div id="p-fondo" role="listbox" hidden>${['Fondo QA Plus', 'Fondo QA', 'Otro fondo'].map(o => `<div role="option">${o}</div>`).join('')}</div>
    <input type="text" formcontrolname="salarioBasico" class="ng-invalid">
    <button type="button" id="btn-facultativo-info-ad-continuar">Continuar</button>
    <script>(() => {
      window.continuar = 0;
      document.getElementById('btn-facultativo-info-ad-continuar').addEventListener('click', () => window.continuar++);
      document.querySelectorAll('mat-select').forEach(sel => {
        const panel = document.getElementById(sel.getAttribute('aria-controls'));
        sel.addEventListener('click', () => { panel.hidden = false; sel.setAttribute('aria-expanded', 'true'); });
        panel.querySelectorAll('[role=option]').forEach(o => o.addEventListener('click', () => {
          sel.querySelector('.valor').textContent = o.textContent; panel.hidden = true; sel.setAttribute('aria-expanded', 'false');
        }));
      });
      const fondo = document.getElementById('fondo'), pFondo = document.getElementById('p-fondo');
      fondo.addEventListener('click', () => { pFondo.hidden = false; fondo.setAttribute('aria-expanded', 'true'); });
      fondo.addEventListener('input', () => fondo.classList.add('ng-invalid')); // Texto libre no es una opción.
      pFondo.querySelectorAll('[role=option]').forEach(o => o.addEventListener('click', () => {
        fondo.value = o.textContent; fondo.classList.remove('ng-invalid'); pFondo.hidden = true; fondo.setAttribute('aria-expanded', 'false');
      }));
      const salario = document.querySelector('[formcontrolname=salarioBasico]');
      salario.addEventListener('input', () => salario.classList.toggle('ng-invalid', !/^\\d+$/.test(salario.value)));
    })();</script>`;
}

async function abrirPreparacion(page: Page): Promise<AfiDataUi> {
  await page.setContent(preparacion());
  return new AfiDataUi(new AfiliacionesPortal(page));
}
const continuarClics = (page: Page) => page.evaluate(() => (window as unknown as { continuar: number }).continuar);

test.describe('AfiDataUi — telefonos e informacion-adicional', () => {
  test('telefonos: limpia el valor previo, escribe exacto, redacta y no pulsa Continuar', async ({ page }) => {
    const driver = await abrirPreparacion(page);
    const registradas: unknown[] = [];
    const aplicadas = await driver.completarTelefonos(
      resolverEtapa('telefonos', { actor: actorDesdeEntorno('pensionado', ENTORNO_PENSIONADO_2C) }),
      async a => { registradas.push(a.diagnostico()); },
    );
    await expect(page.locator('#numeroCelular')).toHaveValue('3000000000');
    await expect(page.locator('#numeroTelefonoFijo')).toHaveValue('6010000000');
    expect(aplicadas.map(a => a.valorEfectivo)).toEqual(['3000000000', '6010000000']);
    expect(aplicadas[0].diagnostico()).toEqual({
      campo: 'numeroCelular', origen: 'actor', sensibilidad: 'pii', relevanteParaAsercion: false,
      aplicado: true, modo: 'ejecutado', valorEfectivo: REDACTADO,
    });
    expect(registradas).toHaveLength(2);
    expect(JSON.stringify([aplicadas, registradas])).not.toMatch(PII_2C);
    expect(await continuarClics(page)).toBe(0);
  });

  test('informacion-adicional Facultativo: select, autocomplete y texto exactos desde el actor', async ({ page }) => {
    const driver = await abrirPreparacion(page);
    const aplicadas = await driver.completarInformacionAdicional(
      resolverEtapa('informacion-adicional', { actor: actorDesdeEntorno('facultativo', ENTORNO_FACULTATIVO) }));
    await expect(page.locator('mat-select[formcontrolname=nacionalidad] .valor')).toHaveText('Colombiana');
    await expect(page.locator('mat-select[formcontrolname=estadoCivil] .valor')).toHaveText('Soltero(a)');
    await expect(page.locator('#fondo')).toHaveValue('Fondo QA');
    await expect(page.locator('#fondo')).not.toHaveClass(/ng-invalid/);
    await expect(page.locator('[formcontrolname=salarioBasico]')).toHaveValue('1500000');
    // Orden de la pantalla (como completarInformacionAdicionalFacultativo), no el del resolver.
    expect(aplicadas.map(a => [a.campo, a.origen, a.modo])).toEqual([
      ['nacionalidad', 'actor', 'ejecutado'], ['estadoCivil', 'actor', 'ejecutado'],
      ['fondoPensiones', 'actor', 'ejecutado'], ['salarioBasico', 'actor', 'ejecutado'],
    ]);
    expect(aplicadas.every(a => a.diagnostico().valorEfectivo === REDACTADO)).toBe(true);
    expect(JSON.stringify(aplicadas)).not.toMatch(PII_2C);
    expect(await continuarClics(page)).toBe(0);
  });

  test('autocomplete sin opción exacta falla claro y sin exponer el valor', async ({ page }) => {
    const driver = await abrirPreparacion(page);
    const error = await driver.completarInformacionAdicional(plan(res('fondoPensiones', 'actor', 'pii', 'Fondo')))
      .then(() => new Error('no falló'), (e: Error) => e);
    expect(error.message).toContain('fondo: debe existir exactamente una opción igual al valor configurado');
    expect(error.message).not.toMatch(/'Fondo'|"Fondo"/);
  });

  test('plan con gaps o no ejecutable no toca la UI', async ({ page }) => {
    const driver = await abrirPreparacion(page);
    const conGap = resolverEtapa('telefonos', { actor: actorDesdeEntorno('pensionado', sin(ENTORNO_PENSIONADO_2C, 'AFI_CP01_NUM_CEL')) });
    await expect(driver.completarTelefonos(conGap)).rejects.toThrow('No se puede preparar telefonos:\n- numeroCelular: sin-fuente-segura');
    await expect(driver.completarTelefonos(plan(res('numeroCelular', 'actor', 'pii', '3000000000'), res('salarioBasico', 'actor', 'pii', '1'))))
      .rejects.toThrow('El driver de telefonos no puede ejecutar "salarioBasico": campo no soportado en esta etapa');
    await expect(driver.completarInformacionAdicional(plan(
      res('nacionalidad', 'auxiliary', 'pii', undefined, { tipo: 'first-valid-option', orden: 'catalogo' }))))
      .rejects.toThrow('estrategia first-valid-option no soportado para select');
    await expect(page.locator('#numeroCelular')).toHaveValue('3999999999');
    await expect(page.locator('#p-nacionalidad')).toBeHidden();
  });

  test('provenance se copia de la resolución, no la decide el driver', async ({ page }) => {
    const driver = await abrirPreparacion(page);
    const [a] = await driver.completarTelefonos(plan(new ResolucionCampo('numeroCelular', 'test-case', 'pii', true, '3000000000')));
    expect(a.diagnostico()).toMatchObject({ origen: 'test-case', relevanteParaAsercion: true, valorEfectivo: REDACTADO });
  });
});
