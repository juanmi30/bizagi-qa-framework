import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarMatriz, extraerDesdeExcel } from '../../sde/matriz';
import { cargarManifest } from '../../sde/manifest';
import { cargarRegistro } from '../../sde/datos';
import { cargarEscenario, DIR_ESCENARIOS, listarEscenarios } from '../../sde/escenario';
import { generarTrazabilidad } from '../../sde/trazabilidad';

/** Fidelidad de la matriz a los Excel e integridad del manifest de 17 CP. Sin navegador. */

test.describe('Matriz y manifest SDE @unit', () => {
  test('fuentes/matriz.json es idéntica a lo extraído hoy de los Excel', () => {
    expect(cargarMatriz()).toEqual(extraerDesdeExcel());
  });

  test('17 CP: 5 de HU06 y 12 de HU03, pasos numerados 1..n sin huecos', () => {
    const m = cargarMatriz();
    expect(m.map((c) => c.id)).toEqual([
      'HU06-CP01', 'HU06-CP02', 'HU06-CP03', 'HU06-CP04', 'HU06-CP05',
      ...Array.from({ length: 12 }, (_, i) => `HU03-CP${String(i + 1).padStart(2, '0')}`),
    ]);
    for (const c of m) {
      expect(c.pasos.map((p) => p.n), c.id).toEqual(c.pasos.map((_, i) => i + 1));
      expect(c.pasos.every((p) => p.accion && p.esperado), `${c.id}: acción y esperado no vacíos`).toBe(true);
      expect(c.requisitos.length, `${c.id}: requisitos`).toBeGreaterThan(0);
    }
  });

  test('la transcripción SDE_MATRICES_HU03_HU06.md contiene literal cada acción del Excel', () => {
    const md = resolve(__dirname, '..', '..', '..', '..', 'SDE_arranque_Claude_2026-10-07', 'SDE_MATRICES_HU03_HU06.md');
    test.skip(!existsSync(md), 'Transcripción no presente en esta copia');
    const texto = readFileSync(md, 'utf8').replace(/\s+/g, ' ');
    const faltan = cargarMatriz().flatMap((c) => c.pasos.filter((p) => !texto.includes(p.accion)).map((p) => `${c.id} P${p.n}`));
    expect(faltan).toEqual([]);
  });

  test('manifest: exactamente los 17 CP de la matriz, con familia, datos y brechas válidos', () => {
    const man = cargarManifest();
    const reg = cargarRegistro();
    expect(man.casos.map((c) => c.id).sort()).toEqual(cargarMatriz().map((c) => c.id).sort());
    for (const c of man.casos) {
      expect(man.familias[c.familia], `${c.id}: familia`).toBeTruthy();
      for (const d of c.datasets) expect(reg.datasets[d], `${c.id}: dataset ${d}`).toBeTruthy();
      for (const a of c.actores) expect(reg.actores[a], `${c.id}: actor ${a}`).toBeTruthy();
      for (const b of c.brechas) expect(man.brechas[b], `${c.id}: brecha ${b}`).toBeTruthy();
      // Sin evidencia no hay verde: el manifest nunca declara REAL_PASS a mano.
      expect(['PREPARADO', 'EJECUTABLE', 'BLOCKED'], `${c.id}: estado declarado`).toContain(c.estado);
      if (c.escenario) {
        expect(existsSync(resolve(DIR_ESCENARIOS, c.escenario)), `${c.id}: archivo de escenario`).toBe(true);
        const esc = cargarEscenario(resolve(DIR_ESCENARIOS, c.escenario), reg);
        expect(esc.id).toBe(c.id);
        expect([...esc.datasets].sort(), `${c.id}: datasets manifest = escenario`).toEqual([...c.datasets].sort());
      } else {
        expect(c.estado, `${c.id}: sin escenario solo puede estar PREPARADO`).toBe('PREPARADO');
      }
    }
  });

  test('cada escenario de escenarios/ pertenece a un CP del manifest (no hay escenarios huérfanos)', () => {
    const declarados = new Set(cargarManifest().casos.map((c) => c.escenario).filter(Boolean));
    for (const r of listarEscenarios()) expect(declarados.has(r.split(/[\\/]/).pop()!), r).toBe(true);
  });

  test('genera la trazabilidad de los 17 CP con todos sus pasos @docs', () => {
    const md = generarTrazabilidad({}, resolve(__dirname, 'no-existe'), null);
    for (const c of cargarMatriz()) {
      expect(md).toContain(`## ${c.id} — `);
      for (const p of c.pasos) expect(md, `${c.id} P${p.n}`).toContain(`| ${p.n} | `);
    }
    expect(md).not.toMatch(/\*\*REAL_PASS/); // sin reportes no puede haber verdes
    if (process.env.SDE_ACTUALIZAR_DOCS === '1') {
      writeFileSync(resolve(__dirname, '..', '..', 'docs', 'TRAZABILIDAD-17-CP.md'), generarTrazabilidad(), 'utf8');
    }
  });
});
