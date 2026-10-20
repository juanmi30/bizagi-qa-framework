import { test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { consolidarCaso, renderizarSoporteHu, type ConfigSoporteHu } from '../sde/certificacion';

/**
 * Generación del SOPORTE DE CERTIFICACIÓN CLIENTE de una HU (un único Word con todos sus CP) desde resultados YA
 * guardados. No abre navegador ni Bizagi: funciona aunque los casos hayan vencido. Configuración por HU en
 * certificacion/<HU>.json. Salida (fuera de Git): test-results/seguros-del-estado/soportes/<HU>/<fecha-hora>/.
 * Uso (PowerShell, raíz del repo):  $env:SDE_SOPORTE_HU='HU06'; node tools/run.mjs seguros-del-estado --grep "@soporte-hu"
 */
const HU = process.env.SDE_SOPORTE_HU;
const DIR_PROYECTO = resolve(__dirname, '..');
const RAIZ = resolve(DIR_PROYECTO, '..', '..');

test('soporte de certificación cliente de una HU @soporte-hu', () => {
  test.skip(!HU || !/^HU\d+$/.test(HU), 'Defina SDE_SOPORTE_HU=<HU>, p. ej. HU06.');
  const cfg = JSON.parse(readFileSync(resolve(DIR_PROYECTO, 'certificacion', `${HU}.json`), 'utf8')) as ConfigSoporteHu;
  const matriz = JSON.parse(readFileSync(resolve(DIR_PROYECTO, 'fuentes', 'matriz.json'), 'utf8')) as { casos: { id: string; titulo: string; pasos: { n: number; accion: string; esperado: string }[] }[] };
  const casos = cfg.casos.map((c) => {
    const m = matriz.casos.find((x) => x.id === c.cp);
    if (!m) throw new Error(`${c.cp} no está en la matriz.`);
    return consolidarCaso(RAIZ, DIR_PROYECTO, c, m);
  });
  const template = readFileSync(resolve(RAIZ, cfg.template));
  const logoCliente = cfg.logoCliente ? readFileSync(resolve(DIR_PROYECTO, 'certificacion', cfg.logoCliente)) : undefined;
  const salida = resolve(RAIZ, 'test-results', 'seguros-del-estado', 'soportes', cfg.hu, new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(salida, { recursive: true });
  const docx = resolve(salida, cfg.salida);
  writeFileSync(docx, renderizarSoporteHu(cfg, casos, { template, ...(logoCliente ? { logoCliente } : {}) }));
  writeFileSync(resolve(salida, `${cfg.hu}-soporte-plan.json`), JSON.stringify(casos, null, 2) + '\n', 'utf8');
  const total = casos.reduce((n, c) => n + c.pasos.length, 0);
  const pass = casos.reduce((n, c) => n + (c.resumen.PASS ?? 0), 0);
  console.log(`SOPORTE ${cfg.hu}: ${casos.length} CP, ${pass}/${total} PASS`);
  for (const c of casos) console.log(`  ${c.cp} caso ${c.numeroCaso}: ${JSON.stringify(c.resumen)} · capturas ${c.pasos.filter((p) => p.capturas.length).length}/${c.pasos.length}`);
  console.log(`SOPORTE docx: ${relative(RAIZ, docx).split('\\').join('/')}`);
});
