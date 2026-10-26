import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validarDisenoSde } from '../../sde/disenoQa';
import { explicarPaso } from '../../sde/hallazgosHumanos';
import type { PasoSoporte } from '../../sde/certificacion';
const raiz = resolve(__dirname, '../../../..');
const piloto = () => JSON.parse(readFileSync(resolve(raiz, 'docs/qa-hibrida/piloto/HU06-CP02.diseno.json'), 'utf8'));
const api = () => (new Function('u', 'return import(u)'))(pathToFileURL(resolve(raiz, 'tools/qa-diseno/contrato.mjs')).href);

test.describe('Fidelidad y orden del piloto v1.1 @unit', () => {
  test('P18 documental anterior a P19 se ejecuta después de P22; capacidad 23 compartida se ejecuta una sola vez', async () => {
    const p = piloto(); const r = await validarDisenoSde(p);
    expect(r.errores).toEqual([]);
    expect(p.pasos.find((s: any) => s.id === 'P18').dependeDe).toEqual(['P22']);
    expect(p.pasos.find((s: any) => s.id === 'P19').dependeDe).not.toContain('P18');
    for (const n of [17,19]) expect(p.pasos.find((s: any) => s.matriz === n).capacidadesNativas).toContain(23);
    expect(p.planEjecucion.orden.filter((n: number) => n === 23)).toHaveLength(1);
  });
  for (const cambio of ['datos-vacios-P17','dato-distinto-P17','sin-precondiciones','sin-dependencias','sin-condicion-causal','P18-automatico','sin-obligacion-manual','sin-evidencia','sin-condicion-humana','esperado','capacidad-inexistente','orden-documental','perfil-alterno']) {
    test(`rechaza debilitamiento semántico: ${cambio}`, async () => {
      const p = piloto(), p17 = p.pasos.find((s: any) => s.matriz === 17), p18 = p.pasos.find((s: any) => s.matriz === 18);
      if (cambio === 'datos-vacios-P17') p17.datos = [];
      if (cambio === 'dato-distinto-P17') p17.datos = ['EST-FILA-AUTOS-PLACA.placa_nueva_fila'];
      if (cambio === 'sin-precondiciones') p.precondiciones = [];
      if (cambio === 'sin-dependencias') p.pasos.forEach((s: any) => s.dependeDe = []);
      if (cambio === 'sin-condicion-causal') p.planEjecucion.dependencias = [];
      if (cambio === 'P18-automatico') p18.modalidad = 'automatico';
      if (cambio === 'sin-obligacion-manual') p18.responsabilidades.pendienteManual = [];
      // La estructura sigue siendo válida: retirar solo la evidencia manual también debe rechazarse.
      if (cambio === 'sin-evidencia') p18.responsabilidades.evidencias = p18.responsabilidades.evidencias.slice(0, 1);
      if (cambio === 'sin-condicion-humana') p18.responsabilidades.continuacion.siNoSeCompleta = 'no-continuar';
      if (cambio === 'esperado') p18.esperado = 'Aceptar siete caracteres';
      if (cambio === 'capacidad-inexistente') p18.capacidadesNativas.push(999);
      if (cambio === 'orden-documental') p.pasos.reverse();
      if (cambio === 'perfil-alterno') p.perfilRevision.referencia = p.nativo.referencia;
      expect((await validarDisenoSde(p)).valido).toBe(false);
    });
  }
  for (const cambio of ['ciclo-pasos','ciclo-capacidades','P19-depende-P18','capacidad-duplicada','orden-invertido']) {
    test(`detecta conflicto antes de ejecutar: ${cambio}`, async () => {
      const p = piloto(), { validarContrato } = await api();
      if (cambio === 'ciclo-pasos') p.pasos.find((s: any) => s.id === 'P22').dependeDe = ['P18'];
      if (cambio === 'ciclo-capacidades') p.planEjecucion.dependencias.push({antes:34,despues:1,condicion:'Ciclo inventado'});
      if (cambio === 'P19-depende-P18') p.pasos.find((s: any) => s.id === 'P19').dependeDe = ['P18'];
      if (cambio === 'capacidad-duplicada') p.planEjecucion.orden.push(23);
      if (cambio === 'orden-invertido') p.planEjecucion.orden.reverse();
      expect(validarContrato(p).valido).toBe(false);
    });
  }
});

test.describe('Interpretación conservadora de CP02 @unit', () => {
  const cp = JSON.parse(readFileSync(resolve(raiz, 'projects/seguros-del-estado/tests/fixtures/qa-hibrida-cp02-alcance.json'), 'utf8'));
  test('P18 no demuestra rechazo ni aceptación de longitud; conserva FAIL y causas históricas, separa recuperación', () => {
    const p = cp.pasos.find((p: PasoSoporte) => p.n === 18), antes = JSON.stringify(p);
    const h = explicarPaso(p, 'HU06-CP02');
    expect(p.estado).toBe('FAIL');
    expect(h.categoria).toBe('Comprobación de longitud inconclusa');
    expect(h.pendiente).toContain('ni que valide correctamente');
    expect(h.incidentePosterior).toContain('Después');
    expect(h.continuidadEstado).toBe('terminacion_dificultad_recuperacion');
    expect(JSON.stringify(p)).toBe(antes);
  });
  for (const n of [14,22]) test(`P${n} distingue controles presentes de reglas completas`, () => {
    const p = cp.pasos.find((p: PasoSoporte) => p.n === n), antes = JSON.stringify(p);
    const h = explicarPaso(p, 'HU06-CP02');
    expect(h.categoria).toContain('alcance parcial'); expect(h.pendiente).toMatch(/no demuestra|No se demuestra/);
    expect(JSON.stringify(p)).toBe(antes);
  });
  test('tres clases de continuidad, sin confundir última acción con continuación normal', () => {
    const p: PasoSoporte = {n:3,accion:'a',esperado:'e',estado:'PASS',obtenido:'ok',fuente:'f',capturas:[]};
    expect(explicarPaso(p).continuidadEstado).toBe('desconocida');
    expect(explicarPaso({...p,continuidad:'continuo'}).continuidadEstado).toBe('continuacion_normal');
    expect(explicarPaso({...p,incidentes:['AUTOMATIZACION: Guardar no cerró el pop-up']}).continuidadEstado).toBe('terminacion_dificultad_recuperacion');
  });
});
