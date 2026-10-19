import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { asegurarAsignacionActividad, evaluarRecorrido, type NodoGrafico } from '../../sde/capacidades';
import { causaDeExcepcion } from '../../sde/ejecutor';

/**
 * Confirmaciones de QA del 2026-10-19 (Daniel): (1) la «Consulta Gráfica» es evidencia válida del recorrido; (2) QA autoriza
 * reasignar «Estructurar información» al analista de pruebas. Sin QA: evaluación pura y un Admin → Casos sintético.
 */
const N = (nombre: string, tipos: string[], recorrido: boolean, actual = false): NodoGrafico => ({ nombre, tipos, recorrido, actual });
const MODELO = (masivo: boolean): NodoGrafico[] => [
  N('Inicio Radicación', ['nonestart', 'start'], true),
  N('¿Masivo o correo?', ['exclusivegateway'], true),
  N('Estructurar información', ['aiworkertask'], masivo, masivo),
  N('Consultar información de solicitud', ['subprocess'], !masivo, !masivo),
  N('Completar información de solicitud', ['nonetask'], false),
];
const MASIVO = { recorrido: ['Estructurar información'], recorrido_tipo: ['aiworkertask'] };
const INDIVIDUAL = { no_recorrido: ['Estructurar información'], no_recorrido_tipo: ['aiworkertask'] };

test.describe('Recorrido gráfico: evaluación de la ruta marcada @unit', () => {
  test('ruta Masivo correcta', () => {
    expect(evaluarRecorrido({ numero: '654', encabezado: '654', nodos: MODELO(true), completo: true }, MASIVO).estado).toBe('PASS');
  });
  test('ruta Individual correcta (no pasa por la tarea AI worker ni por Estructurar)', () => {
    expect(evaluarRecorrido({ numero: '656', encabezado: '656', nodos: MODELO(false), completo: true }, INDIVIDUAL).estado).toBe('PASS');
  });
  test('nodo presente en el modelo pero no recorrido: FAIL, no PASS', () => {
    const r = evaluarRecorrido({ numero: '656', encabezado: '656', nodos: MODELO(false), completo: true }, MASIVO);
    expect(r.estado).toBe('FAIL');
    expect(r.detalle).toMatch(/"Estructurar información" está en el modelo pero NO fue recorrido/);
  });
  test('transición errada: un Individual que pasa por Estructurar es FAIL (ruta NO esperada)', () => {
    const r = evaluarRecorrido({ numero: '700', encabezado: '700', nodos: MODELO(true), completo: true }, INDIVIDUAL);
    expect(r).toMatchObject({ estado: 'FAIL' });
    expect(r.detalle).toMatch(/ruta NO esperada/);
    expect(causaDeExcepcion(new Error(r.detalle))).toBe('PRODUCTO_POR_CONFIRMAR');
  });
  test('caso equivocado: no se evalúa', () => {
    expect(() => evaluarRecorrido({ numero: '654', encabezado: '655', nodos: MODELO(true), completo: true }, MASIVO)).toThrow(/corresponde al caso 655, no al 654/);
  });
  test('diagrama sin indicadores o ruta a medio dibujar: revisión humana, nunca PASS', () => {
    const sin = MODELO(false).map((n) => ({ ...n, recorrido: false }));
    expect(evaluarRecorrido({ numero: '656', encabezado: '656', nodos: sin, completo: true }, INDIVIDUAL).estado).toBe('NOT_AUTOMATED');
    // Caso real del 2026-10-19: a medio dibujar solo estaban marcados Inicio y la paralela; la aserción negativa habría pasado.
    const parcial = MODELO(false).map((n, i) => ({ ...n, recorrido: i === 0 }));
    expect(evaluarRecorrido({ numero: '656', encabezado: '656', nodos: parcial, completo: false }, INDIVIDUAL).estado).toBe('NOT_AUTOMATED');
  });
  test('nombre inexistente en el modelo: es calibración de la automatización, no defecto', () => {
    expect(() => evaluarRecorrido({ numero: '654', encabezado: '654', nodos: MODELO(true), completo: true }, { recorrido: ['¿Masivo?'] })).toThrow(/\[calibrar recorrido\]/);
    expect(causaDeExcepcion(new Error('[calibrar recorrido] x'))).toBe('AUTOMATIZACION');
  });
});

// ---------------------------------------------------------------- Admin → Casos sintético
interface Estado { asignado: string; disponibleTras: number; consultas: number; reasignaciones: number; duplicada?: boolean; sinPermiso?: boolean; noPersiste?: boolean }
const OBJETIVO = 'Analista.Pruebas';

async function adminSintetico(context: BrowserContext, page: Page, e: Estado) {
  const html = `<!doctype html><html><body>
    <div id="inbox">Bandeja de entrada</div><div id="menuListInbox">Bandeja</div>
    <div id="menuListAdmin">Admin</div><div id="menuAdmin" hidden>Administración de procesos</div>
    <ul id="categories" hidden><li>Casos</li></ul>
    <div role="dialog" aria-label="Casos" id="dlg" hidden>
      <input id="caseInput"><button id="btn-admin-case-search">Buscar</button>
      <div id="res"></div>
      <button id="btn-admin-case-invalidate">Cancelar</button><button id="btn-admin-case-reassign">Reasignar</button>
      <div id="usr" hidden><input id="userNameReassignInput"><button id="btn-users-table-search">Buscar</button><table id="usuarios"></table></div>
    </div>
    <script>
      const $ = (s) => document.querySelector(s);
      $('#menuListAdmin').onclick = () => { $('#menuAdmin').hidden = false; };
      $('#menuAdmin').onclick = () => { $('#categories').hidden = false; };
      $('#categories li').onclick = () => { $('#dlg').hidden = false; };
      $('#btn-admin-case-search').onclick = async () => {
        const j = await (await fetch('/Rest/Queries/SearchCases?n=' + $('#caseInput').value)).json();
        $('#res').innerHTML = (j.rows[0]?.data[2] ?? []).map((t) => '<input type="checkbox" name="workItemAdmin" value="' + j.rows[0].radNumber + '|' + t.idWorkItem + '|' + t.taskName + '">' + t.taskName).join('');
      };
      $('#btn-admin-case-reassign').onclick = async () => {
        const ok = await (await fetch('/permiso')).json();
        if (ok.permiso) $('#usr').hidden = false;
      };
      $('#btn-users-table-search').onclick = () => {
        const u = $('#userNameReassignInput').value;
        $('#usuarios').innerHTML = '<tr><td>371</td><td>' + u + '</td><td><button id="371" name="' + u.toLowerCase() + '">Reasignar</button></td></tr>';
        $('#usuarios button').onclick = () => fetch('/reasignar', { method: 'POST' });
      };
    </script></body></html>`;
  await context.route('**/*', (r) => {
    const u = r.request().url();
    if (u.includes('/Rest/Queries/SearchCases')) {
      e.consultas++;
      const tareas = e.consultas > e.disponibleTras ? [{ idWorkItem: '9001', taskName: 'Estructurar información', assignee: `domain\\${e.asignado}` }] : [];
      if (e.duplicada && tareas.length) tareas.push({ idWorkItem: '9002', taskName: 'Estructurar información', assignee: 'domain\\otro' });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows: [{ radNumber: '700', isSubprocess: false, data: ['700', 'P', tareas] }], records: 1 }) });
    }
    if (u.includes('/permiso')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ permiso: !e.sinPermiso }) });
    if (u.includes('/reasignar')) { e.reasignaciones++; if (!e.noPersiste) e.asignado = OBJETIVO; return r.fulfill({ body: '{}' }); }
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.goto('http://portal.sintetico.local/');
}
const correr = (page: Page, o = {}) => asegurarAsignacionActividad(page, '700', 'Estructurar información', OBJETIVO, { maximoMs: 3_000, intervaloMs: 100, ...o });

test.describe('Asignación de Estructurar información (Admin → Casos sintético) @unit', () => {
  test('A. ya asignada al analista objetivo: no hay reasignación', async ({ page, context }) => {
    const e: Estado = { asignado: OBJETIVO, disponibleTras: 0, consultas: 0, reasignaciones: 0 };
    await adminSintetico(context, page, e);
    expect(await correr(page)).toMatchObject({ reasignada: false });
    expect(e.reasignaciones).toBe(0);
  });
  test('B. asignada a otro analista: se reasigna y la consulta posterior lo confirma', async ({ page, context }) => {
    const e: Estado = { asignado: 'Otro.Analista', disponibleTras: 0, consultas: 0, reasignaciones: 0 };
    await adminSintetico(context, page, e);
    const r = await correr(page);
    expect(r).toMatchObject({ reasignada: true });
    expect(r.detalle).not.toMatch(/Otro\.Analista/); // no se informa el nombre de terceros
    expect(e.reasignaciones).toBe(1);
  });
  test('C. actividad todavía no disponible: espera acotada; si nunca aparece, BLOCKED por ASIGNACION', async ({ page, context }) => {
    test.setTimeout(120_000);
    const e: Estado = { asignado: OBJETIVO, disponibleTras: 2, consultas: 0, reasignaciones: 0 };
    await adminSintetico(context, page, e);
    expect(await correr(page, { maximoMs: 60_000 })).toMatchObject({ reasignada: false });
    expect(e.consultas).toBeGreaterThanOrEqual(3); // esperó a que la actividad apareciera
    const nunca: Estado = { asignado: OBJETIVO, disponibleTras: 1_000, consultas: 0, reasignaciones: 0 };
    await adminSintetico(context, page, nunca);
    const err = await correr(page, { maximoMs: 400 }).catch((x: Error) => x);
    expect(String(err)).toMatch(/ASIGNACIÓN: la actividad "Estructurar información" no está disponible/);
    expect(causaDeExcepcion(err)).toBe('ASIGNACION');
  });
  test('D. actividad ambigua (dos work items): no se modifica nada', async ({ page, context }) => {
    const e: Estado = { asignado: 'Otro.Analista', disponibleTras: 0, consultas: 0, reasignaciones: 0, duplicada: true };
    await adminSintetico(context, page, e);
    await expect(correr(page)).rejects.toThrow(/ambigüedad, no se modifica nada/);
    expect(e.reasignaciones).toBe(0);
  });
  test('E. reasignación rechazada por permisos: BLOCKED por ASIGNACION, sin PASS', async ({ page, context }) => {
    const e: Estado = { asignado: 'Otro.Analista', disponibleTras: 0, consultas: 0, reasignaciones: 0, sinPermiso: true };
    await adminSintetico(context, page, e);
    const err = await correr(page).catch((x: Error) => x);
    expect(String(err)).toMatch(/no ofreció la reasignación/);
    expect(causaDeExcepcion(err)).toBe('ASIGNACION');
    expect(e.reasignaciones).toBe(0);
  });
  test('F. reasignación aparentemente exitosa sin persistencia: FAIL, nunca PASS', async ({ page, context }) => {
    const e: Estado = { asignado: 'Otro.Analista', disponibleTras: 0, consultas: 0, reasignaciones: 0, noPersiste: true };
    await adminSintetico(context, page, e);
    await expect(correr(page, { maximoMs: 1_500 })).rejects.toThrow(/no persistió/);
    expect(e.reasignaciones).toBe(1);
  });
  test('G. repetir es idempotente: la segunda ejecución no reasigna', async ({ page, context }) => {
    const e: Estado = { asignado: 'Otro.Analista', disponibleTras: 0, consultas: 0, reasignaciones: 0 };
    await adminSintetico(context, page, e);
    expect(await correr(page)).toMatchObject({ reasignada: true });
    expect(await correr(page)).toMatchObject({ reasignada: false });
    expect(e.reasignaciones).toBe(1);
  });
});
