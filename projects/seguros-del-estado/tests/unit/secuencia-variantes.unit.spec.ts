import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro, referencias } from '../../sde/datos';
import { cargarEscenario, listarEscenarios, DIR_VARIANTES, EscenarioError, type EscenarioSde } from '../../sde/escenario';
import { cargarManifest } from '../../sde/manifest';
import { leerReportes } from '../../sde/metricas';

/** Secuencia de documentos (BUG-01), variantes diagnósticas y regla de seguridad del pop-up (BUG-03). Sin navegador. */

const reg = cargarRegistro();
const BASE = `id: HU06-CP01
titulo: t
actores: [analista]
datasets: [CFG-PROCESO, DOC-SOPORTE]
cleanup: { politica: CLEANUP_NOT_APPLICABLE, razon: r }
`;
const cargar = (dir: string, yaml: string) => { mkdirSync(dir, { recursive: true }); writeFileSync(resolve(dir, 'e.yaml'), yaml); return cargarEscenario(resolve(dir, 'e.yaml'), reg); };
const error = (f: () => unknown) => { try { f(); return ''; } catch (e) { return e instanceof EscenarioError ? e.message : String(e); } };
const ADJ = (extra: string) => `${BASE}pasos:\n  - { matriz: [9], hacer: adjuntar_en_grilla, grilla: Documentos Anexos, archivo: "\${dato:DOC-SOPORTE.archivo}"${extra} }\n`;

test.describe('Secuencia de documentos y variantes @unit', () => {
  test('adjuntar_en_grilla: "guardar_primero" exige refrescar_con completo; "matriz" no lo admite; secuencias desconocidas se rechazan', ({}, ti) => {
    expect(error(() => cargar(ti.outputPath('a'), ADJ(', secuencia: guardar_primero')))).toMatch(/exige "refrescar_con"/);
    expect(error(() => cargar(ti.outputPath('b'), ADJ(', secuencia: guardar_primero, refrescar_con: { campo: Sucursal, valor: X }')))).toMatch(/exige "refrescar_con"/);
    expect(error(() => cargar(ti.outputPath('c'), ADJ(', refrescar_con: { campo: Sucursal, valor_temporal: A, valor: B }')))).toMatch(/solo aplica a secuencia "guardar_primero"/);
    expect(error(() => cargar(ti.outputPath('d'), ADJ(', secuencia: magia')))).toMatch(/"secuencia" debe ser/);
    expect(cargar(ti.outputPath('e'), ADJ(', secuencia: guardar_primero, refrescar_con: { campo: Sucursal, valor_temporal: A, valor: B }')).pasos[0].secuencia).toBe('guardar_primero');
  });

  test('una "variante" debe declarar qué difiere de la matriz', ({}, ti) => {
    expect(error(() => cargar(ti.outputPath('v'), `${BASE}variante: { descripcion: x }\npasos:\n  - { matriz: [2], hacer: iniciar_sesion, actor: analista }\n`))).toMatch(/"variante" requiere/);
  });

  test('las variantes del proyecto son válidas, declaran sus diferencias y pertenecen a un CP del manifest', () => {
    const ids = new Set(cargarManifest().casos.map((c) => c.id));
    const variantes = listarEscenarios(DIR_VARIANTES).map((r) => cargarEscenario(r, reg));
    expect(variantes.length).toBeGreaterThan(0);
    for (const v of variantes) {
      expect(v.variante?.difiere_en.length, v.archivo).toBeGreaterThan(0);
      expect(ids.has(v.id), v.archivo).toBe(true);
    }
  });

  test('los reportes VARIANTE_* nunca se leen como evidencia del CP', ({}, ti) => {
    const dir = ti.outputPath('sde');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'VARIANTE_HU06-CP01_20261013-115152.json'), '{}');
    writeFileSync(resolve(dir, 'HU06-CP01_20261008-110951.json'), JSON.stringify({ estado: 'FAIL' }));
    expect(leerReportes('HU06-CP01', dir).map((r) => r.archivo)).toEqual(['HU06-CP01_20261008-110951.json']);
  });
});

/**
 * BUG-03: salir del pop-up de una fila sin "Guardar" deja el caso inutilizable. Regla estática: todo paso que ABRE un
 * pop-up debe tener después un dialogo_confirmar "cierra", y los datos que usan los pasos hasta ese cierre deben estar
 * garantizados ANTES de abrirlo (datasets del escenario o "requiere" del propio paso de apertura).
 */
function violacionesPopup(esc: EscenarioSde): string[] {
  const malas: string[] = [];
  esc.pasos.forEach((p, i) => {
    if (!['tabla_abrir_fila', 'tabla_agregar'].includes(p.hacer)) return;
    const j = esc.pasos.findIndex((q, k) => k > i && q.hacer === 'dialogo_confirmar' && ['cierra', 'no_registra'].includes(q.espera as string)); // no_registra también termina con «Guardar» (D-54)
    if (j < 0) { malas.push(`${esc.archivo} paso #${i + 1}: abre un pop-up que el escenario nunca cierra con "Guardar"`); return; }
    const garantizados = new Set([...esc.datasets, ...(p.requiere ?? [])]);
    const usados = new Set(esc.pasos.slice(i, j + 1).flatMap((q) => [...referencias(q), ...(q.requiere ?? []).map((d) => `dato:${d}.`)])
      .filter((r) => r.startsWith('dato:')).map((r) => r.slice(5).split('.')[0]));
    const faltan = [...usados].filter((d) => !garantizados.has(d));
    if (faltan.length) malas.push(`${esc.archivo} paso #${i + 1}: abre el pop-up sin garantizar ${faltan.join(', ')} (necesarios para cerrarlo con "Guardar")`);
  });
  return malas;
}

test.describe('Seguridad del pop-up "Detalle Polizas Asociadas" (BUG-03) @unit', () => {
  test('ningún escenario (oficial o variante) puede quedar con el pop-up abierto por falta de datos', () => {
    const todos = [...listarEscenarios(), ...listarEscenarios(DIR_VARIANTES)].map((r) => cargarEscenario(r, reg));
    expect(todos.flatMap(violacionesPopup)).toEqual([]);
  });

  test('control: abrir el pop-up sin garantizar los datos del cierre se detecta', ({}, ti) => {
    const esc = cargar(ti.outputPath('p'), `id: HU06-CP01
titulo: t
actores: [analista]
datasets: [CFG-PROCESO]
cleanup: { politica: CLEANUP_NOT_APPLICABLE, razon: r }
pasos:
  - { matriz: [18], hacer: tabla_abrir_fila, tabla: T, fila: 1, formulario: detalle-polizas-pn-generales }
  - { matriz: [23], hacer: diligenciar, requiere: [EST-FILA-GENERALES-PN], campos: [ { campo: N, valor: "\${dato:EST-FILA-GENERALES-PN.numero_documento}" } ] }
  - { matriz: [23], hacer: dialogo_confirmar, requiere: [EST-FILA-GENERALES-PN], espera: cierra }
`);
    expect(violacionesPopup(esc).join(' ')).toMatch(/sin garantizar EST-FILA-GENERALES-PN/);
  });
});
