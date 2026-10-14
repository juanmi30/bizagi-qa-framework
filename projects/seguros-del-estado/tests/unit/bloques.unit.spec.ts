import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro } from '../../sde/datos';
import { cargarEscenario, listarEscenarios, EscenarioError } from '../../sde/escenario';

/** Bloques reutilizables (escenarios/_bloques) y orden de ejecución. Sin navegador. */

const reg = cargarRegistro();
const BLOQUE = `descripcion: d
parametros: [actor, p]
pasos:
  - matriz: "\${param:p}"
    hacer: iniciar_sesion
    actor: "\${param:actor}"
`;
const ESC = (incluir: string) => `id: HU06-CP05
titulo: t
actores: [analista]
datasets: [CFG-PROCESO]
cleanup: { politica: CLEANUP_NOT_APPLICABLE, razon: r }
pasos:
${incluir}
  - { matriz: [9], hacer: no_automatizado, razon: x }
`;

function preparar(dir: string, incluir: string): string {
  mkdirSync(resolve(dir, '_bloques'), { recursive: true });
  writeFileSync(resolve(dir, '_bloques', 'b.yaml'), BLOQUE);
  writeFileSync(resolve(dir, 'e.yaml'), ESC(incluir));
  return resolve(dir, 'e.yaml');
}
const error = (f: () => unknown) => { try { f(); return ''; } catch (e) { return e instanceof EscenarioError ? e.message : String(e); } };

test.describe('Bloques reutilizables de escenarios @unit', () => {
  test('se expanden con sus parámetros (incluidas listas como "matriz") y pasan el validador estricto', ({}, ti) => {
    const esc = cargarEscenario(preparar(ti.outputPath('ok'), '  - { incluir: b, con: { actor: analista, p: [2] } }'), reg);
    expect(esc.pasos.map((p) => [p.hacer, p.matriz, p.actor ?? null])).toEqual([['iniciar_sesion', [2], 'analista'], ['no_automatizado', [9], null]]);
  });

  const casos: [string, string, RegExp][] = [
    ['parámetro faltante', '  - { incluir: b, con: { actor: analista } }', /faltan parámetros p/],
    ['parámetro desconocido', '  - { incluir: b, con: { actor: analista, p: [2], extra: 1 } }', /parámetros desconocidos extra/],
    ['bloque inexistente', '  - { incluir: nada, con: {} }', /no existe el bloque escenarios\/_bloques\/nada\.yaml/],
    ['claves extra junto a incluir', '  - { incluir: b, con: { actor: analista, p: [2] }, hacer: pulsar }', /claves no soportadas hacer/],
    ['el paso expandido sigue validándose (actor fuera del escenario)', '  - { incluir: b, con: { actor: intermediario, p: [2] } }', /actor "intermediario" no está en "actores"/],
    ['un paso expandido inexistente en la matriz', '  - { incluir: b, con: { actor: analista, p: [42] } }', /el paso 42 no existe/],
  ];
  for (const [nombre, incluir, re] of casos) {
    test(`rechaza: ${nombre}`, ({}, ti) => {
      expect(error(() => cargarEscenario(preparar(ti.outputPath('x'), incluir), reg))).toMatch(re);
    });
  }

  test('una referencia ${param:...} que nadie resuelve es un error', ({}, ti) => {
    const dir = ti.outputPath('sin');
    const ruta = preparar(dir, '  - { incluir: b, con: { actor: analista, p: [2] } }');
    writeFileSync(resolve(dir, '_bloques', 'b.yaml'), BLOQUE.replace('hacer: iniciar_sesion', 'hacer: iniciar_sesion\n    nota: "${param:otro}"').replace('[actor, p]', '[actor, p]'));
    expect(error(() => cargarEscenario(ruta, reg))).toMatch(/quedaron referencias sin resolver \$\{param:otro\}/);
  });

  test('los escenarios del proyecto se listan en orden numérico de prefijo (1, 2, …, 10, 11)', () => {
    const prefijos = listarEscenarios().map((r) => Number(r.split(/[\\/]/).pop()!.split('-')[0]));
    expect(prefijos).toEqual([...prefijos].sort((a, b) => a - b));
    expect(prefijos.slice(0, 3)).toEqual([1, 2, 3]);
  });
});
