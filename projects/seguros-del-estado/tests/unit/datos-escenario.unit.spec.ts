import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  cargarRegistro, describir, estadoActor, estadoDataset, resolverTexto, DatoFaltanteError,
} from '../../sde/datos';
import { cargarEscenario, listarEscenarios, EscenarioError } from '../../sde/escenario';
import { cargarManifest } from '../../sde/manifest';

/** Registro de datos y validador de escenarios. Valores FICTICIOS solo dentro de esta prueba. */

const reg = cargarRegistro();
const ENV_POLIZA = { SDE_AUTOS_RAMO: 'R-ficticio', SDE_AUTOS_MOVIMIENTO: 'M-ficticio', SDE_SUCURSAL: 'S-ficticia', SDE_AUTOS_POLIZA: '000111222' };

test.describe('Registro de datos SDE @unit', () => {
  test('el registro carga y todo dato de QA tiene variable de entorno (nunca valor en el repo)', () => {
    for (const d of Object.values(reg.datasets)) {
      for (const p of d.propiedades) {
        if (p.fuente === 'qa') { expect(p.env, `${d.id}.${p.nombre}`).toBeTruthy(); expect(p.valor).toBeUndefined(); }
      }
    }
  });

  test('.env.example declara exactamente las variables del registro (sin valores de QA)', () => {
    const ejemplo = readFileSync(resolve(__dirname, '..', '..', '.env.example'), 'utf8');
    const declaradas = new Map([...ejemplo.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/gm)].map((m) => [m[1], m[2].trim()]));
    const requeridas = new Set<string>();
    for (const a of Object.values(reg.actores)) { a.variables.forEach((v) => requeridas.add(v)); if (a.dominio) requeridas.add(a.dominio); }
    for (const d of Object.values(reg.datasets)) d.propiedades.forEach((p) => p.env && requeridas.add(p.env));
    expect([...requeridas].filter((v) => !declaradas.has(v)), 'faltan en .env.example').toEqual([]);
    const sobrantesSde = [...declaradas.keys()].filter((v) => /^SDE_/.test(v) && v !== 'SDE_EXPLORAR' && !requeridas.has(v));
    expect(sobrantesSde, 'variables SDE_ sin uso en el registro').toEqual([]);
    // Solo la configuración pública (fuente: config) puede venir prellenada; credenciales y datos de QA, nunca.
    const config = new Set(Object.values(reg.datasets).flatMap((d) => d.propiedades.filter((p) => p.fuente === 'config').map((p) => p.env!)));
    expect([...requeridas].filter((v) => declaradas.get(v) && !config.has(v)), 'el ejemplo no debe traer valores de QA').toEqual([]);
  });

  test('un dataset con "valor" de QA en el repositorio se rechaza', ({}, testInfo) => {
    const ruta = testInfo.outputPath('malo.yaml');
    writeFileSync(ruta, 'actores: { a: { rol: x, variables: [U] } }\ndatasets:\n  X: { descripcion: d, propiedades: [ { nombre: p, fuente: qa, env: E, valor: "123" } ] }\n');
    expect(() => cargarRegistro(ruta)).toThrow(/no puede tener "valor"/);
  });

  test('READY/MISSING se calcula desde el entorno y lista variables, no valores', () => {
    expect(estadoDataset(reg, 'POL-AUTOS-VIGENTE', {})).toEqual({ id: 'POL-AUTOS-VIGENTE', estado: 'MISSING', faltantes: ['SDE_AUTOS_RAMO', 'SDE_AUTOS_MOVIMIENTO', 'SDE_SUCURSAL', 'SDE_AUTOS_POLIZA'] });
    expect(estadoDataset(reg, 'POL-AUTOS-VIGENTE', ENV_POLIZA).estado).toBe('READY');
    expect(estadoDataset(reg, 'DOC-SOPORTE', {}).estado).toBe('READY'); // generado: no depende de QA
    expect(estadoActor(reg, 'analista', { USUARIO_analista: 'u', CLAVE_analista: 'c' }).faltantes).toEqual(['DOMINIO_analista (o BIZAGI_LOGIN_DOMINIO)']);
    expect(estadoActor(reg, 'analista', { USUARIO_analista: 'u', CLAVE_analista: 'c', BIZAGI_LOGIN_DOMINIO: 'd' }).estado).toBe('READY');
  });

  test('resolver: literales de matriz, datos de QA, ${unico}; falta de dato lanza DatoFaltanteError', () => {
    const ctx = { registro: reg, env: ENV_POLIZA, unico: '20261007-120000' };
    expect(resolverTexto('${dato:POL-AUTOS-VIGENTE.linea}', ctx)).toBe('Autos');
    expect(resolverTexto('${dato:POL-AUTOS-VIGENTE.poliza}', ctx)).toBe('000111222');
    expect(resolverTexto('${dato:INI-GENERALES-MASIVO.narrativa}', ctx)).toContain('20261007-120000');
    expect(() => resolverTexto('${dato:TOMADOR-EXISTENTE.numero_documento}', ctx)).toThrow(DatoFaltanteError);
    expect(() => resolverTexto('${config:SDE_PROCESO_RADICACION}', ctx)).toThrow(/SDE_PROCESO_RADICACION/);
  });

  test('describir() nunca expone valores de QA', () => {
    const t = describir('Póliza ${dato:POL-AUTOS-VIGENTE.poliza} línea ${dato:POL-AUTOS-VIGENTE.linea}', reg);
    expect(t).toBe('Póliza «dato:POL-AUTOS-VIGENTE.poliza» línea Autos');
  });
});

test.describe('Validador de escenarios SDE @unit', () => {
  test('los escenarios del proyecto son válidos', () => {
    const archivos = listarEscenarios();
    // Tantos escenarios como CP con escenario en el manifest (ni huérfanos ni faltantes).
    expect(archivos.length).toBe(cargarManifest().casos.filter((c) => c.escenario).length);
    for (const a of archivos) expect(() => cargarEscenario(a, reg), a).not.toThrow();
  });

  const base = `id: HU06-CP05
titulo: t
actores: [intermediario]
datasets: [CFG-PROCESO]
cleanup: { politica: CLEANUP_NOT_APPLICABLE, razon: r }
pasos:
`;
  const casos: [string, string, RegExp][] = [
    ['capability inexistente', '  - { matriz: [2], hacer: magia }\n', /capability "magia" no existe/],
    ['clave no soportada (no se ignora en silencio)', '  - { matriz: [2], hacer: iniciar_sesion, actor: intermediario, forzar: true }\n', /claves no soportadas forzar/],
    ['paso inexistente en la matriz', '  - { matriz: [42], hacer: iniciar_sesion, actor: intermediario }\n', /el paso 42 no existe/],
    ['dataset no declarado en el escenario', '  - { matriz: [3], hacer: diligenciar, campos: [ { campo: Ramo, valor: "${dato:POL-AUTOS-VIGENTE.ramo}" } ] }\n', /no está declarado en "datasets"/],
    ['verificación desconocida', '  - { matriz: [6], hacer: verificar, verificar: [ { parece_ok: x } ] }\n', /exactamente una clave/],
    ['actor fuera del escenario', '  - { matriz: [2], hacer: iniciar_sesion, actor: analista }\n', /no está en "actores"/],
    ['tipo de campo no soportado', '  - { matriz: [3], hacer: diligenciar, campos: [ { campo: Ramo, valor: x, tipo: fecha } ] }\n', /tipo "fecha" no soportado/],
    ['eliminar fila sin criterio', '  - { matriz: [3], hacer: tabla_eliminar_fila, tabla: T }\n', /exactamente uno de "fila" o "fila_con"/],
  ];
  for (const [nombre, paso, error] of casos) {
    test(`rechaza: ${nombre}`, ({}, testInfo) => {
      const ruta = testInfo.outputPath('esc.yaml');
      writeFileSync(ruta, base + paso);
      let capturado: unknown;
      try { cargarEscenario(ruta, reg); } catch (e) { capturado = e; }
      expect(capturado).toBeInstanceOf(EscenarioError);
      expect((capturado as Error).message).toMatch(error);
    });
  }
});
