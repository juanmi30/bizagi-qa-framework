import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BOTON_PJ, PUNTO_FUNCIONAL, mensajeParaReporte, problemasSmoke, reporteSmoke, type EntradaSmoke,
} from '../helpers/criterioSmokeEmpresaPj';

/** Regresiones del falso verde del smoke 4S-R.1: un PASS exige TODO el recorrido, no solo cleanup + PII 0. */

const SIGUIENTE = 'btn-representante-legal-continuar';
const exito: EntradaSmoke = {
  transiciones: [BOTON_PJ, SIGUIENTE], etapaInformacionEmpresa: 'PASS', errorNombre: 'PreparacionDetenidaError', cleanup: 'PASS', coincidenciasPii: 0,
};
const evaluar = (e: Partial<EntradaSmoke>) => problemasSmoke(reporteSmoke({ ...exito, ...e }));

test.describe('Criterio de éxito del smoke 4S-R.1', () => {
  test('réplica de la corrida real: falla de runtime en la etapa + cleanup PASS + PII 0 -> FAIL (antes era verde)', () => {
    const r = reporteSmoke({ transiciones: [], etapaInformacionEmpresa: 'FAIL', errorNombre: 'Error', errorMensajeSaneado: 'Autocomplete: opción seleccionada', cleanup: 'PASS', coincidenciasPii: 0 });
    expect(r).toMatchObject({ pantallaPjObservada: true, hookContinuarPjAlcanzado: false, pjCruzada: false, botonPantallaSiguiente: null, corteEsperado: null });
    expect(problemasSmoke(r)).toEqual([
      'error inesperado: Error',
      'la etapa informacion-empresa no terminó (FAIL)',
      `no se alcanzó el Continuar ${BOTON_PJ}`,
      'no se cruzó la pantalla PJ ni se observó una pantalla siguiente',
      'la ejecución no terminó en un corte esperado (PreparacionDetenidaError | SmokeDetenido)',
    ]);
  });

  test('A. el runtime falla y el cleanup pasa -> FAIL', () => {
    expect(evaluar({ errorNombre: 'CapabilityGapPreparacionError', etapaInformacionEmpresa: 'FAIL', transiciones: [] })).toContain('error inesperado: CapabilityGapPreparacionError');
    expect(evaluar({ errorNombre: 'DataGapPantallaError', etapaInformacionEmpresa: 'FAIL', transiciones: [] }).length).toBeGreaterThan(0);
  });

  test('B. PII 0 + cleanup PASS pero la PJ no se cruzó -> FAIL', () => {
    // Corte "esperado" ANTES de cruzar la PJ (en el propio Continuar PJ): no es éxito.
    expect(evaluar({ transiciones: [BOTON_PJ] })).toEqual(['no se cruzó la pantalla PJ ni se observó una pantalla siguiente']);
    // Ni siquiera se presentó la pantalla.
    expect(evaluar({ transiciones: [], etapaInformacionEmpresa: null })).toEqual(expect.arrayContaining([
      'la pantalla PJ no se observó (la etapa informacion-empresa no se ejecutó)', `no se alcanzó el Continuar ${BOTON_PJ}`,
    ]));
  });

  test('C. PreparacionDetenidaError después de cruzar la PJ -> PASS', () => {
    const r = reporteSmoke(exito);
    expect(problemasSmoke(r)).toEqual([]);
    expect([r.pjCruzada, r.botonPantallaSiguiente, r.corteEsperado, r.errorInesperado]).toEqual([true, SIGUIENTE, 'PreparacionDetenidaError', null]);
  });

  test('D. SmokeDetenido en el punto funcional (PJ cruzada sin otra pantalla intermedia) -> PASS', () => {
    const r = reporteSmoke({ ...exito, transiciones: [BOTON_PJ], errorNombre: 'SmokeDetenido' });
    expect(problemasSmoke(r)).toEqual([]);
    expect(r.botonPantallaSiguiente).toBe(PUNTO_FUNCIONAL);
    // SmokeDetenido SIN haber pasado por la PJ no es éxito.
    expect(evaluar({ transiciones: [], errorNombre: 'SmokeDetenido' })).toContain(`no se alcanzó el Continuar ${BOTON_PJ}`);
  });

  test('E. el error inesperado se conserva saneado en el reporte y además hace fallar el criterio', () => {
    const ansi = '\u001b[2mexpect(\u001b[22mreceived).toBe(expected)\n\nExpected: true\nReceived: false';
    const r = reporteSmoke({ ...exito, errorNombre: 'Error', errorMensajeSaneado: mensajeParaReporte(ansi) });
    expect(r.errorInesperado).toEqual({ tipo: 'Error', mensaje: 'expect(received).toBe(expected) | Expected: true | Received: false' });
    expect(JSON.parse(JSON.stringify(r)).errorInesperado.tipo).toBe('Error');
    expect(problemasSmoke(r)).toContain('error inesperado: Error');
    // Sin cleanup o con PII también falla, aunque el recorrido sea completo.
    expect(evaluar({ cleanup: 'FAIL' })).toEqual(['cleanup FAIL']);
    expect(evaluar({ cleanup: 'N/A' })).toEqual(['cleanup N/A']);
    expect(evaluar({ coincidenciasPii: 1 })).toEqual(['PII en artefactos: 1']);
  });

  test('el smoke real decide con este criterio y no se traga errores', () => {
    const fuente = readFileSync(resolve(__dirname, 'smoke-informacion-empresa-pj.real.spec.ts'), 'utf8');
    expect(fuente).toMatch(/expect\(problemasSmoke\(salida\), [^)]*\)\.toEqual\(\[\]\)/);
    expect(fuente).not.toMatch(/errorType/);
    expect(fuente).not.toMatch(/pantallaPjPresentada/);
  });
});
