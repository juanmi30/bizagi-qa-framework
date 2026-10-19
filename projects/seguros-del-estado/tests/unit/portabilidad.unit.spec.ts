import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOCUMENTOS_PORTABLES, generarExport, seleccionarArchivos } from '../../sde/exportar';
import { inventarioReportes, leerReportes } from '../../sde/metricas';
import { DIR_EVIDENCIA_VERSIONADA } from '../../sde/registro';
import { generarTrazabilidad } from '../../sde/trazabilidad';

/** Portabilidad: lo que viaja con Git o con el paquete debe bastar para reconstruir contexto y métricas. Sin QA. @unit */

const RAIZ = resolve(__dirname, '..', '..', '..', '..');

test.describe('Portabilidad del repositorio @unit', () => {
  test('el paquete portable incluye CLAUDE.md y los documentos centrales de orquestación', () => {
    const { incluidos } = seleccionarArchivos(RAIZ);
    for (const d of DOCUMENTOS_PORTABLES) expect(incluidos, d).toContain(d);
    expect(incluidos.some((r) => r.startsWith('docs/orquestacion/checkpoints/'))).toBe(true);
  });

  test('sin los documentos portables no se genera el paquete', ({}, testInfo) => {
    const raiz = testInfo.outputPath('repo');
    mkdirSync(resolve(raiz, 'projects', 'seguros-del-estado'), { recursive: true });
    writeFileSync(resolve(raiz, 'package.json'), '{}');
    const r = generarExport(raiz, []);
    expect(r.faltantes).toEqual(DOCUMENTOS_PORTABLES);
    expect(r.zip).toBeNull();
    expect(r.manifiesto).toContain('Documentos portables FALTANTES');
  });

  test('tras clonar (sin test-results) las métricas salen de la evidencia versionada y el documento lo declara', ({}, testInfo) => {
    const sinLocal = testInfo.outputPath('no-existe');
    expect(inventarioReportes(sinLocal, DIR_EVIDENCIA_VERSIONADA).local).toBeNull();
    const cp05 = leerReportes('HU06-CP05', sinLocal, DIR_EVIDENCIA_VERSIONADA);
    expect(cp05.length).toBeGreaterThan(0);
    expect(cp05.every((r) => r.origen === 'versionado')).toBe(true);
    const md = generarTrazabilidad({}, sinLocal);
    expect(md).toContain('**NO disponible en este equipo**');
    expect(md).toMatch(/\| Ejecutada \| 3\/17 /); // HU06-CP01 (FAIL), HU06-CP02 (caso 639) y HU06-CP05 (PARCIAL), con evidencia versionada
    // 2026-10-19: HU06-CP02 REAL_PASS en el caso 670 (resultado técnico de la automatización, sujeto a revisión de QA).
    expect(md).toMatch(/\| Aprobada \| 1\/17 /);
  });

  test('si un reporte está en ambas fuentes prevalece la copia local', ({}, testInfo) => {
    const local = testInfo.outputPath('local');
    const vers = testInfo.outputPath('vers');
    mkdirSync(local, { recursive: true });
    mkdirSync(vers, { recursive: true });
    writeFileSync(resolve(vers, 'HU06-CP05_1.json'), JSON.stringify({ estado: 'FAIL' }));
    writeFileSync(resolve(vers, 'HU06-CP05_2.json'), JSON.stringify({ estado: 'BLOCKED' }));
    writeFileSync(resolve(local, 'HU06-CP05_1.json'), JSON.stringify({ estado: 'REAL_PASS_PARCIAL' }));
    const r = leerReportes('HU06-CP05', local, vers);
    expect(r.map((x) => [x.archivo, x.origen, x.reporte.estado])).toEqual([
      ['HU06-CP05_1.json', 'local', 'REAL_PASS_PARCIAL'],
      ['HU06-CP05_2.json', 'versionado', 'BLOCKED'],
    ]);
  });

  test('.gitignore excluye credenciales, sesiones, traces, capturas y listados privados', () => {
    test.skip(!existsSync(resolve(RAIZ, '.git')), 'Requiere el repositorio Git.');
    const ignoradas = [
      '.env', 'projects/seguros-del-estado/.env', 'projects/x/.env.local', 'projects/x/.auth/user.json', 'storageState.json',
      'test-results/a/trace.zip', 'x.har', 'video.webm', 'projects/seguros-del-estado/docs/evidencia/captura.png', 'captura.png',
      'Intermedi y suc.xlsx', 'projects/seguros-del-estado/data/Intermediarios.xlsx', 'cliente.docx', 'projects/x/matriz.xlsx',
      'tmp/candidatos.json', 'respaldo.zip', 'id.pem', '.npmrc', 'playwright-report/index.html',
    ];
    const salida = execFileSync('git', ['-C', RAIZ, 'check-ignore', '--no-index', ...ignoradas], { encoding: 'utf8' });
    expect(salida.trim().split(/\r?\n/).sort()).toEqual([...ignoradas].sort());
    // Las excepciones revisadas siguen versionables.
    const versionables = ['projects/seguros-del-estado/.env.example', 'projects/colsubsidio/tests/fixtures/soporte-cp02/CP02-P02-01-componente-region.png',
      'projects/seguros-del-estado/fuentes/20260928_SDE_CEL_V1_Casos de Prueba_HU06.xlsx', 'projects/seguros-del-estado/resources/docs/soporte-prueba.pdf'];
    for (const v of versionables) {
      expect(() => execFileSync('git', ['-C', RAIZ, 'check-ignore', '--no-index', '-q', v]), v).toThrow();
    }
  });
});
