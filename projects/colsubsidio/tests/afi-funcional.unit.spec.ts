import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ALERTA_TERRITORIAL_CP04, PLAN_FUNCIONAL_CP04 } from '../data/afi/cp04Funcional';
import {
  CapabilityGapError, PlanFuncionalInvalidoError, evaluarCatalogo, exigirPlanFuncionalValido, normalizarTextoCatalogo, validarPlanFuncionalAfi,
  type PasoFuncionalAfi, type PlanFuncionalAfi, type ResultadoOperacionAfi,
} from '../data/afi/funcional';
import { AfiFunctionalUi } from '../helpers/afiFunctionalUi';
import { ALERTA_TERRITORIAL } from '../helpers/afiliacionesPortal';

/** Fase 2D: plan funcional declarativo CP04 P04-P06. Modelo puro + ejecutor sobre DOM mínimo. */

const clonar = (): PlanFuncionalAfi => JSON.parse(JSON.stringify(PLAN_FUNCIONAL_CP04));
const problemas = (plan: unknown) => validarPlanFuncionalAfi(plan).map(p => [p.ruta, p.clase]);

test.describe('Plan funcional AFI — modelo puro', () => {
  test('el plan CP04 es JSON puro: se serializa sin perder semántica y es válido', () => {
    const texto = JSON.stringify(PLAN_FUNCIONAL_CP04);
    expect(JSON.parse(texto)).toEqual(PLAN_FUNCIONAL_CP04);
    const noJson = (v: unknown): boolean => typeof v === 'function' || v instanceof RegExp
      || (typeof v === 'object' && v !== null && Object.values(v).some(noJson));
    expect(noJson(PLAN_FUNCIONAL_CP04)).toBe(false);
    expect(texto).not.toMatch(/formcontrolname|#btn|\[id=|getBy|locator/i);
    expect(validarPlanFuncionalAfi(PLAN_FUNCIONAL_CP04)).toEqual([]);
    expect(() => exigirPlanFuncionalValido(JSON.parse(texto))).not.toThrow();
    expect(PLAN_FUNCIONAL_CP04.pasos.map(p => [p.id, p.operaciones.map(o => o.tipo)])).toEqual([
      ['P04', ['texto-ausente', 'texto-ausente']],
      ['P05', ['catalogo-opcion-fuera-de', 'seleccionar-exacto']],
      ['P06', ['catalogo-no-vacio', 'catalogo-opcion-fuera-de', 'cerrar-catalogo']],
    ]);
    expect(ALERTA_TERRITORIAL_CP04).toBe(ALERTA_TERRITORIAL);
  });

  test('paso sin id e ids duplicados fallan', () => {
    const plan = clonar();
    plan.pasos[1].id = 'P04';
    (plan.pasos[2] as Partial<PasoFuncionalAfi>).id = '';
    expect(problemas(plan)).toEqual([['pasos[1].id', 'invalido'], ['pasos[2].id', 'invalido']]);
    expect(() => exigirPlanFuncionalValido(plan)).toThrow(PlanFuncionalInvalidoError);
    expect(() => exigirPlanFuncionalValido(plan)).toThrow('id de paso duplicado "P04"');
  });

  test('operación desconocida -> CapabilityGapError, no DataGap', () => {
    const plan = clonar();
    (plan.pasos[0].operaciones as unknown[]).push({ tipo: 'hover-tooltip', campo: 'departamento' });
    const error = (() => { try { exigirPlanFuncionalValido(plan); } catch (e) { return e as Error; } })();
    expect(error).toBeInstanceOf(CapabilityGapError);
    expect(error!.message).toContain('pasos[0].operaciones[2].tipo: La operación "hover-tooltip" no está soportada por AFI.');
  });

  test('campo no soportado y opciones de contrato desconocidas son capability gap', () => {
    const plan = clonar();
    Object.assign(plan.pasos[1].operaciones[0], { campo: 'barrio' });
    Object.assign(plan.pasos[0].operaciones[0], { coincidencia: 'regex' });
    expect(problemas(plan)).toEqual([['pasos[0].operaciones[0].coincidencia', 'capability'], ['pasos[1].operaciones[0].campo', 'capability']]);
    expect(() => exigirPlanFuncionalValido(plan)).toThrow(CapabilityGapError);
  });

  test('valores requeridos vacíos, excluir vacío, evidencia vacía y propiedades ajenas fallan', () => {
    const plan = clonar();
    Object.assign(plan.pasos[1].operaciones[1], { valor: ' ' });
    Object.assign(plan.pasos[1].operaciones[0], { excluir: [], evidencia: '' });
    Object.assign(plan.pasos[0].operaciones[0], { texto: '', selector: '#alerta' });
    delete (plan.pasos[2].operaciones[2] as Partial<{ campo: string }>).campo;
    expect(problemas(plan)).toEqual([
      ['pasos[0].operaciones[0].selector', 'invalido'], ['pasos[0].operaciones[0].texto', 'invalido'],
      ['pasos[1].operaciones[0].evidencia', 'invalido'], ['pasos[1].operaciones[0].excluir', 'invalido'],
      ['pasos[1].operaciones[1].valor', 'invalido'],
      ['pasos[2].operaciones[2].campo', 'invalido'],
    ]);
    expect(problemas({ caso: 'x', pasos: [] })).toEqual([['pasos', 'invalido']]);
    expect(problemas(null)).toEqual([['plan', 'invalido']]);
  });

  test('normalización texto-es: variantes de Bogotá son iguales', () => {
    for (const s of ['BOGOTÁ, D.C.', 'Bogota DC', 'BOGOTADC', 'bogotá d. c.']) expect(normalizarTextoCatalogo(s)).toBe('BOGOTADC');
    expect(normalizarTextoCatalogo('Medellín')).toBe('MEDELLIN');
    expect(normalizarTextoCatalogo('CUNDINAMARCA')).not.toBe(normalizarTextoCatalogo('BOGOTÁ, D.C.'));
  });

  test('evaluarCatalogo: fuera-de, no-vacío y seleccionar exacto (PASS/FAIL), resultado serializable', () => {
    const fueraDe = { tipo: 'catalogo-opcion-fuera-de', campo: 'departamento', excluir: ['BOGOTÁ, D.C.', 'CUNDINAMARCA'], normalizacion: 'texto-es' } as const;
    const pasa = evaluarCatalogo(fueraDe, ['Bogota DC', 'CUNDINAMARCA', 'ANTIOQUIA']);
    expect(pasa).toEqual({ tipo: 'catalogo-opcion-fuera-de', campo: 'departamento', resultado: 'PASS', observado: { cantidadOpciones: 3, cantidadFuera: 1, condicionCumplida: true } });
    expect(evaluarCatalogo(fueraDe, ['BOGOTÁ, D.C.', 'Cundinamarca']).resultado).toBe('FAIL');
    expect(evaluarCatalogo(fueraDe, []).resultado).toBe('FAIL');

    const noVacio = { tipo: 'catalogo-no-vacio', campo: 'ciudadVivienda' } as const;
    expect(evaluarCatalogo(noVacio, ['MEDELLÍN']).resultado).toBe('PASS');
    expect(evaluarCatalogo(noVacio, [])).toMatchObject({ resultado: 'FAIL', observado: { cantidadOpciones: 0 } });

    const elegir = { tipo: 'seleccionar-exacto', campo: 'departamento', valor: 'ANTIOQUIA' } as const;
    expect(evaluarCatalogo(elegir, ['ANTIOQUIA', 'ARAUCA'])).toEqual({
      tipo: 'seleccionar-exacto', campo: 'departamento', valorEsperado: 'ANTIOQUIA', resultado: 'PASS', observado: { coincidenciasExactas: 1 } });
    // Exacto: sin normalizar.
    expect(evaluarCatalogo(elegir, ['Antioquia']).resultado).toBe('FAIL');
    expect(JSON.parse(JSON.stringify(pasa))).toEqual(pasa);
  });

  test('la capa funcional no usa el resolver, POLITICAS_AFI, Playwright ni process.env', async () => {
    for (const archivo of ['funcional', 'cp04Funcional']) {
      const fuente = await readFile(resolve(__dirname, '../data/afi', `${archivo}.ts`), 'utf8');
      const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(codigo, archivo).not.toMatch(/@playwright|helpers|process\.env|resolver|POLITICAS_AFI/);
    }
    const spec = await readFile(resolve(__dirname, 'afi-hu14-12-cp04.spec.ts'), 'utf8');
    expect(spec).not.toMatch(/ContactoCatalogos|formcontrolname="departamento"|ANTIOQUIA|normalize\('NFD'\)|ALERTA_TERRITORIAL\b/);
  });
});

// ---------- DOM mínimo de Información de contacto (autocompletes estilo mat-autocomplete) ----------
function contacto(opciones: { alerta?: boolean; departamentos?: string[] } = {}): string {
  const departamentos = opciones.departamentos ?? ['BOGOTÁ, D.C.', 'CUNDINAMARCA', 'ANTIOQUIA', 'ANTIOQUIA (antiguo)'];
  return `
    <h2>Información de contacto</h2>
    ${opciones.alerta ? `<div class="alerta">${ALERTA_TERRITORIAL}</div>` : ''}
    <input role="combobox" aria-label="Departamento" id="senuelo">
    <input role="combobox" formcontrolname="departamento" id="dep" aria-expanded="false">
    <div id="p-dep" role="listbox" hidden>${departamentos.map(o => `<div role="option">${o}</div>`).join('')}</div>
    <input role="combobox" formcontrolname="ciudadVivienda" id="ciu" aria-expanded="false">
    <div id="p-ciu" role="listbox" hidden></div>
    <script>(() => {
      const ciudades = { 'ANTIOQUIA': ['MEDELLÍN', 'BELLO'], 'BOGOTÁ, D.C.': ['BOGOTÁ, D.C.'] };
      const cerrar = (input, panel) => { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-controls'); };
      for (const id of ['dep', 'ciu']) {
        const input = document.getElementById(id), panel = document.getElementById('p-' + id);
        input.addEventListener('click', () => { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', 'p-' + id); });
        input.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(input, panel); });
        panel.addEventListener('click', e => {
          const o = e.target.closest('[role=option]'); if (!o) return;
          input.value = o.textContent; cerrar(input, panel);
          if (id === 'dep') document.getElementById('p-ciu').innerHTML =
            (ciudades[o.textContent] || []).map(c => '<div role="option">' + c + '</div>').join('');
        });
      }
    })();</script>`;
}

const adjunto = (info: TestInfo, nombre: string) => {
  const a = info.attachments.find(x => x.name === nombre);
  return a?.body ? JSON.parse(a.body.toString()) : undefined;
};
const paso = (id: string) => PLAN_FUNCIONAL_CP04.pasos.find(p => p.id === id)!;

async function abrir(page: Page, info: TestInfo, opciones?: Parameters<typeof contacto>[0]): Promise<AfiFunctionalUi> {
  await page.setContent(contacto(opciones));
  return new AfiFunctionalUi(page, info);
}

test.describe('AfiFunctionalUi — CP04 P04-P06 sobre DOM mínimo', () => {
  test('P04-P06 del plan: mapeo por formcontrolname, Antioquia exacto, evidencias y observaciones', async ({ page }, info) => {
    const ui = await abrir(page, info);
    const registradas: Record<string, ResultadoOperacionAfi[]> = {};
    for (const p of PLAN_FUNCIONAL_CP04.pasos) {
      await ui.ejecutarPaso(p, async r => { (registradas[p.id] ??= []).push(r); });
    }
    await expect(page.locator('#dep')).toHaveValue('ANTIOQUIA');
    await expect(page.locator('#ciu')).toHaveValue(''); // P06 no elige ciudad.
    await expect(page.locator('#p-ciu')).toBeHidden();
    await expect(page.locator('#senuelo')).toHaveValue('');
    expect(registradas).toEqual({
      P04: [
        { tipo: 'texto-ausente', resultado: 'PASS', observado: { coincidencia: 'exacta', visibles: 0 } },
        { tipo: 'texto-ausente', resultado: 'PASS', observado: { coincidencia: 'contiene', visibles: 0 } },
      ],
      P05: [
        { tipo: 'catalogo-opcion-fuera-de', campo: 'departamento', resultado: 'PASS', observado: { cantidadOpciones: 4, cantidadFuera: 2, condicionCumplida: true } },
        { tipo: 'seleccionar-exacto', campo: 'departamento', valorEsperado: 'ANTIOQUIA', resultado: 'PASS', observado: { coincidenciasExactas: 1 } },
      ],
      P06: [
        { tipo: 'catalogo-no-vacio', campo: 'ciudadVivienda', resultado: 'PASS', observado: { cantidadOpciones: 2, condicionCumplida: true } },
        { tipo: 'catalogo-opcion-fuera-de', campo: 'ciudadVivienda', resultado: 'PASS', observado: { cantidadOpciones: 2, cantidadFuera: 2, condicionCumplida: true } },
        { tipo: 'cerrar-catalogo', campo: 'ciudadVivienda', resultado: 'PASS', observado: { catalogoAbierto: true, cerrado: true } },
      ],
    });
    expect(JSON.parse(JSON.stringify(registradas))).toEqual(registradas);
    // Evidencias actuales conservadas con el mismo contenido.
    const nombres = info.attachments.map(a => a.name);
    for (const n of ['CP04_P04_sin_alerta', 'CP04_P05_departamentos', 'CP04_P06_ciudades']) expect(nombres).toContain(n);
    expect(adjunto(info, 'CP04_P05_departamentos.json')).toEqual(['BOGOTÁ, D.C.', 'CUNDINAMARCA', 'ANTIOQUIA', 'ANTIOQUIA (antiguo)']);
    expect(adjunto(info, 'CP04_P06_ciudades.json')).toEqual({ departamento: 'ANTIOQUIA', opciones: ['MEDELLÍN', 'BELLO'] });
  });

  test('P04 FAIL: alerta visible queda observada y el paso falla con su esperado', async ({ page }, info) => {
    const ui = await abrir(page, info, { alerta: true });
    const registradas: ResultadoOperacionAfi[] = [];
    const error = await ui.ejecutarPaso(paso('P04'), async r => { registradas.push(r); }).then(() => undefined, (e: Error) => e);
    expect(error?.message).toContain(paso('P04').esperado);
    expect(registradas).toEqual([{ tipo: 'texto-ausente', resultado: 'FAIL', observado: { coincidencia: 'exacta', visibles: 1 } }]);
    expect(info.attachments.map(a => a.name)).not.toContain('CP04_P04_sin_alerta');
  });

  test('P05 FAIL: catálogo restringido a Bogotá/Cundinamarca y sin Antioquia exacto', async ({ page }, info) => {
    let ui = await abrir(page, info, { departamentos: ['Bogota D.C.', 'CUNDINAMARCA'] });
    const registradas: ResultadoOperacionAfi[] = [];
    await expect(ui.ejecutarPaso(paso('P05'), async r => { registradas.push(r); })).rejects.toThrow(paso('P05').esperado);
    expect(registradas.map(r => [r.tipo, r.resultado])).toEqual([['catalogo-opcion-fuera-de', 'FAIL']]);

    ui = await abrir(page, info, { departamentos: ['CUNDINAMARCA', 'Antioquia'] });
    registradas.length = 0;
    await expect(ui.ejecutarPaso(paso('P05'), async r => { registradas.push(r); })).rejects.toThrow('coincidenciasExactas');
    expect(registradas.map(r => [r.tipo, r.resultado])).toEqual([['catalogo-opcion-fuera-de', 'PASS'], ['seleccionar-exacto', 'FAIL']]);
    await expect(page.locator('#dep')).toHaveValue('');
  });
});
