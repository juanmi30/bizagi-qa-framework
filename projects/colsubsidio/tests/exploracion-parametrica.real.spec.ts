import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ParametricaBizagi } from '../helpers/parametricaBizagi';

/** EXPLORACIÓN de solo lectura de una paramétrica de Bizagi (no forma parte del suite). Gate: AFI_EXPLORACION_PARAM_RUN_REAL. */
test('lectura de solo lectura de Mensajes Site AFI', async ({ page }, info) => {
  test.skip(process.env.AFI_EXPLORACION_PARAM_RUN_REAL !== 'true', 'Requiere AFI_EXPLORACION_PARAM_RUN_REAL=true');
  test.setTimeout(6 * 60_000);
  expect([info.config.workers, info.project.retries]).toEqual([1, 0]);
  const tabla = await new ParametricaBizagi(page).leerTabla('Mensajes Site AFI', 'mensaje');
  // Estructura de la paginación (solo atributos públicos) para ajustar el lector.
  const paginacion = await page.getByRole('dialog', { name: 'Entidades', exact: true }).evaluate(d =>
    [...d.querySelectorAll('[title], [aria-label], button, a')].filter(e => /sigu|next|anter|prev|p[aá]gina|page/i.test(`${e.getAttribute('title')} ${e.getAttribute('aria-label')} ${e.className} ${e.textContent}`))
      .slice(0, 20).map(e => ({ tag: e.tagName, title: e.getAttribute('title'), aria: e.getAttribute('aria-label'), clase: String(e.className).slice(0, 80), texto: (e.textContent || '').trim().slice(0, 30) })));
  const celdas = await page.getByRole('dialog', { name: 'Entidades', exact: true }).evaluate(d => {
    const cs = [...d.querySelectorAll('[role="cell"], [role="gridcell"], td')];
    const c = cs[0];
    const cadena: string[] = []; let e: Element | null = c ?? null;
    for (let i = 0; e && i < 5; i++, e = e.parentElement) cadena.push(`${e.tagName}[role=${e.getAttribute('role')}].${String(e.className).slice(0, 40)}`);
    return { total: cs.length, roles: [...new Set(cs.map(x => `${x.tagName}:${x.getAttribute('role')}`))], cadena,
      filasRole: d.querySelectorAll('[role="row"]').length, tr: d.querySelectorAll('tr').length };
  });
  console.log(`CELDAS ${JSON.stringify(celdas)}`);
  const pager = await page.getByRole('dialog', { name: 'Entidades', exact: true }).evaluate(d =>
    [...d.querySelectorAll('[class*="pag" i], [class*="pager" i], [class*="paging" i], [class*="footer" i]')].slice(0, 25).map(e => ({
      tag: e.tagName, clase: String(e.className).slice(0, 90), title: e.getAttribute('title'), texto: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      hijos: e.children.length })));
  console.log(`PAGER ${JSON.stringify(pager)}`);
  await mkdir('test-results/colsubsidio/exploracion-parametrica', { recursive: true });
  await writeFile('test-results/colsubsidio/exploracion-parametrica/mensajes-site-afi.json', JSON.stringify({ ...tabla, paginacion }, null, 2), 'utf8');
  console.log(`PARAMETRICA columnas=${JSON.stringify(tabla.columnas)} filas=${tabla.filas.length} paginas=${tabla.paginas}`);
});
