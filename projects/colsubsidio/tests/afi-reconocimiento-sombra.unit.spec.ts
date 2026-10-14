import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { actorDesdeEntorno } from '../data/afi/actores';
import { validarRegistroFases, type RegistroFaseFramework } from '../data/afi/aplicacion/metricas';
import type { PantallaAfi } from '../data/afi/aplicacion/pantallas';
import { clasificarObservacion, modoReconocimientoPantalla, resumirReconocimiento, type TrazaReconocimiento } from '../data/afi/aplicacion/reconocimientoSombra';
import { compilarCasoAfi } from '../data/afi/caso';
import { CP04_EMPRESA } from '../data/afi/casos/hu14-12-cp04';
import type { PasoFuncionalAfi, ResultadoOperacionAfi } from '../data/afi/funcional';
import { ejecutarCasoAfi, type ColaboradoresAfi, type ResultadoCasoAfi, type RuntimeCasoAfi } from '../helpers/afiCaseRunner';
import { reconocerPantalla } from '../helpers/reconocerPantalla';
import { ObservadorPantallaSombra } from '../helpers/reconocimientoSombra';

/**
 * Fase 4K: reconocimiento de pantalla en SHADOW MODE. El runner v1 sigue siendo la autoridad; el recognizer solo
 * observa en puntos estables y queda en la traza técnica. DOM y actor FICTICIOS; sin Portal.
 */

const ENTORNO = { AFI_QA_EMPRESA_IDENTIFICACION: '900000001', AFI_QA_CORREO: 'empresa.qa@example.test' };
const PII = /900000001|@example\.test/;

// Cuerpos de pantalla con las señales semánticas del Application Model (controles por su atributo de dominio).
const CUERPO = {
  inicio: '<mat-select formcontrolname="tipoAportante">Empresa</mat-select><input formcontrolname="identificacion"><input formcontrolname="correoElectronico">',
  telefonos: '<input id="numeroCelular"><input id="numeroTelefonoFijo">',
  adicional: '<input id="actividad"><input id="ingresoMensual">',
  contacto: '<h2>Información de contacto</h2><input formcontrolname="departamento"><input formcontrolname="ciudadVivienda">',
  vacio: '<p>Pantalla sin señales</p>',
};
const BOTON = { telefonos: 'btn-empresa-continuar', adicional: 'btn-empresa-info-ad-continuar', otro: 'btn-otro-continuar' };
interface Pantalla { boton?: string; cuerpo: string }

function portalHtml(pantallas: Pantalla[]): string {
  return `<div id="s">${CUERPO.inicio}</div><script>(() => {
    const P = ${JSON.stringify(pantallas)};
    const s = document.getElementById('s');
    window.clics = [];
    window.mostrar = k => {
      const p = P[k];
      s.innerHTML = p.cuerpo + (p.boton ? '<button id="' + p.boton + '">Continuar</button>' : '');
      if (p.boton) document.getElementById(p.boton).onclick = () => { window.clics.push(p.boton); s.innerHTML = ''; setTimeout(() => window.mostrar(k + 1), 150); };
    };
  })();</script>`;
}

function colaboradores(page: Page, pantallas: Pantalla[]) {
  const pasos: string[] = [];
  const fabrica = async (): Promise<ColaboradoresAfi> => ({
    portal: {
      abrir: async () => { await page.setContent(portalHtml(pantallas)); },
      enviarUnaVez: async registrar => { await registrar('900123'); await page.evaluate(() => (window as unknown as { mostrar(k: number): void }).mostrar(0)); return '900123'; },
    },
    soporte: { login: async () => undefined, registrarCasoCreado: async () => undefined, emularReconocimiento: async () => undefined, cancelarCasoCreado: async () => undefined },
    datosUi: { completarInicioSolicitud: async () => [], completarTelefonos: async () => [], completarInformacionAdicional: async () => [] },
    funcionalUi: {
      ejecutarPaso: async (paso: PasoFuncionalAfi, registrar?: (r: ResultadoOperacionAfi) => Promise<void>) => {
        pasos.push(paso.id);
        const r: ResultadoOperacionAfi = { tipo: paso.operaciones[0].tipo, resultado: 'PASS', observado: {} };
        await registrar?.(r);
        return [r];
      },
    },
    cerrar: async () => undefined,
  });
  return { fabrica, pasos };
}

async function correr(page: Page, info: TestInfo, pantallas: Pantalla[], extra: Partial<RuntimeCasoAfi> = {}) {
  const { fabrica, pasos } = colaboradores(page, pantallas);
  const compilado = compilarCasoAfi(CP04_EMPRESA, actorDesdeEntorno('empresa', ENTORNO));
  const resultado = await ejecutarCasoAfi(compilado, { page, context: page.context(), testInfo: info, colaboradores: fabrica, ...extra });
  const traza = JSON.parse(await readFile(info.outputPath('CP04-traza-tecnica.json'), 'utf8')) as { screenRecognition?: TrazaReconocimiento };
  const clics = await page.evaluate(() => (window as unknown as { clics: string[] }).clics);
  return { resultado, traza, pasos, clics };
}
const resumen = (t: TrazaReconocimiento) => t.observaciones.map(o => [o.punto, o.esperado, o.reconocido, o.status]);
const CONTACTO: Pantalla = { cuerpo: CUERPO.contacto };

// =====================================================================================
test.describe('4K shadow mode en el runner', () => {
  test('A. match: el recognizer coincide con la etapa que el runner cree manejar en cada punto estable', async ({ page }, info) => {
    const { resultado, traza } = await correr(page, info, [
      { boton: BOTON.telefonos, cuerpo: CUERPO.telefonos }, { boton: BOTON.adicional, cuerpo: CUERPO.adicional }, CONTACTO,
    ], { reconocimientoPantalla: 'shadow' });
    const t = traza.screenRecognition!;
    expect(t).toMatchObject({ modo: 'shadow', autoridad: 'runner-v1', perfil: 'empresa' });
    expect(resumen(t)).toEqual([
      ['inicio-completado', 'inicio-solicitud', 'inicio-solicitud', 'match'],
      ['antes-de-continuar', 'telefonos', 'telefonos', 'match'],
      ['antes-de-continuar', 'informacion-adicional', 'informacion-adicional', 'match'],
      ['punto-funcional', 'informacion-contacto', 'informacion-contacto', 'match'],
    ]);
    expect(t.observaciones.map(o => o.secuencia)).toEqual([1, 2, 3, 4]);
    // Señales semánticas públicas que hicieron match.
    expect(t.observaciones[3].senales).toEqual([{ pantalla: 'informacion-contacto', presentes: ['encabezado', 'campo:departamento', 'campo:ciudadVivienda'], total: 3 }]);
    expect(resultado.reconocimientoPantalla).toEqual({ modo: 'shadow', resumen: { observaciones: 4, matches: 4, mismatches: 0, desconocidas: 0, ambiguas: 0, sinExpectativa: 0, erroresRecognizer: 0 } });
  });

  test('B/C/D/E/F. mismatch, desconocida, ambigua y sin expectativa: PASS funcional intacto y resumen correcto', async ({ page }, info) => {
    const { resultado, traza, pasos } = await correr(page, info, [
      { boton: BOTON.telefonos, cuerpo: CUERPO.adicional }, // el runner cree "telefonos"; el recognizer ve información adicional
      { boton: BOTON.adicional, cuerpo: CUERPO.vacio }, // el recognizer no reconoce nada
      { boton: BOTON.telefonos, cuerpo: CUERPO.telefonos + CUERPO.adicional }, // con expectativa: dos firmas compiten
      { boton: BOTON.otro, cuerpo: CUERPO.telefonos + CUERPO.adicional }, // sin expectativa + recognizer ambiguo
      { boton: BOTON.otro, cuerpo: CUERPO.telefonos }, // sin expectativa + recognizer reconoce
      { boton: BOTON.otro, cuerpo: CUERPO.vacio }, // sin expectativa + recognizer no reconoce (caso observado en QA real)
      CONTACTO,
    ], { reconocimientoPantalla: 'shadow' });
    const t = traza.screenRecognition!;
    expect(t.observaciones.slice(1, 7).map(o => [o.esperado, o.reconocido, o.status, o.recognizer])).toEqual([
      ['telefonos', 'informacion-adicional', 'mismatch', 'reconocida'],
      ['informacion-adicional', null, 'desconocida', 'desconocida'],
      ['telefonos', null, 'ambigua', 'ambigua'],
      [null, null, 'sin-expectativa', 'ambigua'],
      [null, 'telefonos', 'sin-expectativa', 'reconocida'],
      [null, null, 'sin-expectativa', 'desconocida'],
    ]);
    // Qué señal falló: la pantalla esperada no presentó ninguna de sus señales.
    expect(t.observaciones[2].senales).toEqual([{ pantalla: 'informacion-adicional', presentes: [], total: 6 }]);
    // Ambigua con expectativa: POR QUÉ compitieron (señales públicas de cada candidata).
    expect(t.observaciones[3].candidatas).toEqual(['telefonos', 'informacion-adicional']);
    expect(t.observaciones[3].senales).toEqual([
      { pantalla: 'telefonos', presentes: ['campo:numeroCelular', 'campo:numeroTelefonoFijo'], total: 2 },
      { pantalla: 'informacion-adicional', presentes: ['campo:actividad', 'campo:ingresoMensual'], total: 6 },
    ]);
    // Sin expectativa, el diagnóstico del recognizer se conserva (candidatas y señales), sin contarse como ambigua.
    expect(t.observaciones[4].candidatas).toEqual(['telefonos', 'informacion-adicional']);
    expect(t.observaciones[4].senales?.map(s => s.pantalla)).toEqual(['telefonos', 'informacion-adicional']);
    expect(t.resumen).toEqual(resumirReconocimiento(t.observaciones));
    expect(t.resumen).toEqual({ observaciones: 8, matches: 2, mismatches: 1, desconocidas: 1, ambiguas: 1, sinExpectativa: 3, erroresRecognizer: 0 });
    // E. Nada de esto cambia el resultado funcional.
    expect(resultado.resultado).toBe('PASS');
    expect(resultado.pasosFuncionales.every(p => p.resultado === 'PASS')).toBe(true);
    expect(pasos).toEqual(CP04_EMPRESA.funcional!.pasos.map(p => p.id));
  });

  test('un fallo técnico del recognizer queda como error-recognizer y tampoco cambia el PASS', async ({ page }, info) => {
    const modeloInvalido = { x: { id: 'direccion', senales: [{ tipo: 'campo', campo: 'viaPrincipal' }, { tipo: 'campo', campo: 'numeroVp' }], minimo: 1, preparable: true, avance: null, siguientes: [] } } as unknown as Record<string, PantallaAfi>;
    const { resultado, traza } = await correr(page, info, [CONTACTO], { reconocimientoPantalla: 'shadow', opcionesReconocimiento: { modelo: modeloInvalido } });
    expect(traza.screenRecognition!.observaciones.map(o => [o.status, o.detalle])).toEqual([['error-recognizer', 'Error'], ['error-recognizer', 'Error']]);
    expect(resultado.resultado).toBe('PASS');
  });

  test('G. traza portable: sin selectores, HTML, URLs ni PII', async ({ page }, info) => {
    const { traza, resultado } = await correr(page, info, [{ boton: BOTON.telefonos, cuerpo: CUERPO.telefonos }, CONTACTO], { reconocimientoPantalla: 'shadow' });
    const texto = JSON.stringify([traza.screenRecognition, resultado.reconocimientoPantalla]);
    expect(texto).not.toMatch(/#[a-z]|\[[a-z-]+=|formcontrolname|<|>|https?:|btn-|mat-select/i);
    expect(texto).not.toMatch(PII);
    expect(Object.keys(traza.screenRecognition!.observaciones[0]).sort()).toEqual(['esperado', 'punto', 'recognizer', 'reconocido', 'secuencia', 'senales', 'status']);
  });

  test('H/J. off (por defecto): cero observaciones y comportamiento idéntico del runner', async ({ page }, info) => {
    const pantallas = [{ boton: BOTON.telefonos, cuerpo: CUERPO.telefonos }, { boton: BOTON.adicional, cuerpo: CUERPO.adicional }, CONTACTO];
    const off = await correr(page, info, pantallas);
    expect(off.traza.screenRecognition).toBeUndefined();
    expect(off.resultado.reconocimientoPantalla).toBeUndefined();
    const explicito = await correr(page, info, pantallas, { reconocimientoPantalla: 'off' });
    expect(explicito.traza.screenRecognition).toBeUndefined();
    const shadow = await correr(page, info, pantallas, { reconocimientoPantalla: 'shadow' });
    // Mismos clics, mismos pasos, mismo resultado (salvo el diagnóstico añadido).
    expect(shadow.clics).toEqual(off.clics);
    expect(shadow.pasos).toEqual(off.pasos);
    const sinDiagnostico = (r: ResultadoCasoAfi) => {
      const { reconocimientoPantalla: _r, duracionSegundos: _d, ...resto } = r;
      return resto;
    };
    expect(sinDiagnostico(shadow.resultado)).toEqual(sinDiagnostico(off.resultado));
    // Sin screenshots adicionales por el shadow mode.
    expect(info.attachments.filter(a => a.contentType === 'image/png')).toEqual([]);
  });
});

// =====================================================================================
test.describe('4K recognizer: solo lectura', () => {
  test('I. reconocer y observar no navegan, no hacen clic ni modifican el DOM', async ({ page }) => {
    await page.setContent(`${CUERPO.contacto}<button id="b" onclick="window.clics++">Continuar</button><script>window.clics = 0;</script>`);
    await page.locator('[formcontrolname="departamento"]').fill('valor previo');
    await page.locator('[formcontrolname="ciudadVivienda"]').focus();
    const estado = async () => ({
      html: await page.content(), url: page.url(), valor: await page.locator('[formcontrolname="departamento"]').inputValue(),
      foco: await page.evaluate(() => document.activeElement?.getAttribute('formcontrolname')),
    });
    const antes = await estado();
    await reconocerPantalla(page);
    const o = new ObservadorPantallaSombra(page, 'empresa');
    await o.observar('punto-funcional', 'informacion-contacto');
    expect(await estado()).toEqual(antes);
    expect(antes.foco).toBe('ciudadVivienda'); // el foco no se movió
    expect(await page.evaluate(() => (window as unknown as { clics: number }).clics)).toBe(0);
  });

  test('4K.1 precedencia: sin expectativa del runner siempre es sin-expectativa, sea cual sea el recognizer', () => {
    for (const recognizer of ['reconocida', 'desconocida', 'ambigua', 'error'] as const) {
      expect(clasificarObservacion(null, recognizer, recognizer === 'reconocida' ? 'telefonos' : null), recognizer).toBe('sin-expectativa');
    }
    expect(clasificarObservacion('telefonos', 'reconocida', 'telefonos')).toBe('match');
    expect(clasificarObservacion('telefonos', 'reconocida', 'informacion-adicional')).toBe('mismatch');
    expect(clasificarObservacion('telefonos', 'desconocida', null)).toBe('desconocida');
    expect(clasificarObservacion('telefonos', 'ambigua', null)).toBe('ambigua');
    expect(clasificarObservacion('telefonos', 'error', null)).toBe('error-recognizer');
  });

  test('4K.1 observador: esperado null + reconocido null/una/varias -> sin-expectativa, con el diagnóstico conservado', async ({ page }) => {
    const o = new ObservadorPantallaSombra(page, 'empresa');
    for (const cuerpo of [CUERPO.vacio, CUERPO.telefonos, CUERPO.telefonos + CUERPO.adicional]) {
      await page.setContent(cuerpo);
      await o.observar('antes-de-continuar', null);
    }
    const t = o.traza();
    expect(t.observaciones.map(x => [x.status, x.recognizer, x.reconocido])).toEqual([
      ['sin-expectativa', 'desconocida', null], ['sin-expectativa', 'reconocida', 'telefonos'], ['sin-expectativa', 'ambigua', null],
    ]);
    expect(t.resumen).toMatchObject({ observaciones: 3, sinExpectativa: 3, desconocidas: 0, ambiguas: 0, matches: 0, mismatches: 0 });
    expect(JSON.stringify(t)).not.toMatch(/#[a-z]|\[[a-z-]+=|formcontrolname|<|>|https?:/i);
  });

  test('configuración: off por defecto, valores cerrados; fail-closed conservado (0 -> desconocida, >1 -> ambigua)', async ({ page }) => {
    expect(modoReconocimientoPantalla(undefined)).toBe('off');
    expect(modoReconocimientoPantalla(' SHADOW ')).toBe('shadow');
    expect(() => modoReconocimientoPantalla('on')).toThrow('Modo de reconocimiento de pantalla desconocido');
    await page.setContent(CUERPO.vacio);
    await expect(reconocerPantalla(page)).rejects.toThrow('Pantalla desconocida');
    await page.setContent(CUERPO.telefonos + CUERPO.adicional);
    await expect(reconocerPantalla(page)).rejects.toThrow('Pantalla ambigua');
  });

  test('la configuración nunca está en DefinicionCasoAfi y la lógica no conoce casos concretos', async () => {
    expect(Object.keys(CP04_EMPRESA)).not.toContain('reconocimientoPantalla');
    for (const f of ['../helpers/reconocimientoSombra.ts', '../data/afi/aplicacion/reconocimientoSombra.ts']) {
      expect(await readFile(resolve(__dirname, f), 'utf8'), f).not.toMatch(/CP0\d|HU\s*1\d|\bP\d{2}\b|Cundinamarca|Chía/);
    }
    const runner = (await readFile(resolve(__dirname, '../helpers/afiCaseRunner.ts'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(runner).not.toMatch(/process\.env/);
  });
});

test('4K métricas: fase registrada como instrumentación runtime sin operaciones, capabilities ni cambios de HU', async () => {
  const fases = JSON.parse(await readFile(resolve(__dirname, '../knowledge/afi-metricas-fases.json'), 'utf8')) as RegistroFaseFramework[];
  expect(validarRegistroFases(fases)).toEqual([]);
  expect(fases.find(f => f.fase === '4K')).toMatchObject({ cambiosRuntime: true, operacionesNuevas: 0, capabilitiesFuncionalesNuevas: 0, cambiosEspecificosHu: 0 });
  expect(validarRegistroFases([{ fase: 'x', fecha: 'ayer', cambiosRuntime: true, operacionesNuevas: -1, capabilitiesFuncionalesNuevas: 0, cambiosEspecificosHu: 0 }]))
    .toEqual(['x: fecha AAAA-MM-DD', 'x: un cambio runtime declara su motivo', 'x: operacionesNuevas entero >= 0']);
});
