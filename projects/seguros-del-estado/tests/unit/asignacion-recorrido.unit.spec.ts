import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { asegurarAsignacionActividad, evaluarRecorrido, type LecturaRecorrido, type NodoGrafico } from '../../sde/capacidades';
import { causaDeExcepcion } from '../../sde/ejecutor';

/**
 * Confirmaciones de QA del 2026-10-19 (Daniel): (1) la «Consulta Gráfica» es evidencia válida del recorrido; (2) QA autoriza
 * reasignar «Estructurar información» al analista de pruebas. Sin QA: evaluación pura y un Admin → Casos sintético.
 */
const N = (id: string, nombre: string, tipos: string[], recorrido: boolean, actual = false): NodoGrafico => ({ id, nombre, tipos, recorrido, actual });
const MODELO = (masivo: boolean): NodoGrafico[] => [
  N('g-inicio', 'Inicio Radicación', ['nonestart', 'start'], true),
  N('g-compuerta', '¿Masivo o correo?', ['exclusivegateway'], true),
  N('g-estructurar', 'Estructurar información', ['aiworkertask'], masivo, masivo),
  N('g-consultar', 'Consultar información de solicitud', ['subprocess'], !masivo, !masivo),
  N('g-completar', 'Completar información de solicitud', ['nonetask'], false),
];
/** Fixture de ruta completa: todos los GUID ejecutados tienen representación. El desconocido se prueba en Issue #8. */
const REGISTRO = (masivo: boolean) => ['g-inicio', 'g-compuerta', masivo ? 'g-estructurar' : 'g-consultar'];
const L = (numero: string, nodos: NodoGrafico[], registro: string[] | null, o: Partial<LecturaRecorrido> = {}): LecturaRecorrido =>
  ({ numero, encabezado: numero, identidadServidor: numero, idCasoServidor: '100', idCasoConsulta: '100', idFlujoCaso: '10', idFlujoRegistro: '10', nodos, registro, ...o });
const MASIVO = { recorrido: ['Estructurar información'], recorrido_tipo: ['aiworkertask'] };
const INDIVIDUAL = { no_recorrido: ['Estructurar información'], no_recorrido_tipo: ['aiworkertask'] };

test.describe('Recorrido gráfico: evaluación de la ruta (F3 de Work, PR #7) @unit', () => {
  test('completado y correcto: Masivo y la negativa de Individual con evidencia completa', () => {
    expect(evaluarRecorrido(L('654', MODELO(true), REGISTRO(true)), MASIVO).estado).toBe('PASS');
    const r = evaluarRecorrido(L('656', MODELO(false), REGISTRO(false)), INDIVIDUAL);
    expect(r).toMatchObject({ estado: 'PASS' });
    expect(r.detalle).toMatch(/Evidencia completa/);
  });
  test('incompleto: el registro tiene nodos que el dibujo aún no marcó → la negativa queda para revisión, nunca PASS', () => {
    const parcial = MODELO(false).map((n, i) => ({ ...n, recorrido: i === 0 }));
    const r = evaluarRecorrido(L('656', parcial, REGISTRO(false)), INDIVIDUAL);
    expect(r).toMatchObject({ estado: 'NOT_AUTOMATED' });
    expect(r.detalle).toMatch(/El dibujo NO terminó/);
  });
  test('animación con pausa larga y luego el nodo prohibido: el registro del servidor lo delata → FAIL, no PASS', () => {
    // Lo que reprodujo Work: el dibujo se detiene >3 s con Inicio y la compuerta marcados (conteo estable) y luego aparece Estructurar.
    const enPausa = MODELO(true).map((n) => ({ ...n, recorrido: ['g-inicio', 'g-compuerta'].includes(n.id!), actual: false }));
    const r = evaluarRecorrido(L('700', enPausa, REGISTRO(true)), INDIVIDUAL);
    expect(r).toMatchObject({ estado: 'FAIL' });
    expect(r.detalle).toMatch(/"Estructurar información" fue recorrido \(ruta NO esperada\)/);
    expect(causaDeExcepcion(new Error(r.detalle))).toBe('PRODUCTO_POR_CONFIRMAR');
  });
  test('nodo presente en el modelo pero no recorrido (evidencia completa): FAIL', () => {
    const r = evaluarRecorrido(L('656', MODELO(false), REGISTRO(false)), MASIVO);
    expect(r.estado).toBe('FAIL');
    expect(r.detalle).toMatch(/"Estructurar información" está en el modelo pero NO fue recorrido/);
  });
  test('transición errada con evidencia completa: un Individual que pasa por Estructurar es FAIL', () => {
    expect(evaluarRecorrido(L('700', MODELO(true), REGISTRO(true)), INDIVIDUAL).estado).toBe('FAIL');
  });
  test('identidad equivocada del caso (encabezado o servidor): no se evalúa', () => {
    expect(() => evaluarRecorrido(L('654', MODELO(true), REGISTRO(true), { encabezado: '655' }), MASIVO)).toThrow(/corresponde al caso 655, no al 654/);
    expect(() => evaluarRecorrido(L('654', MODELO(true), REGISTRO(true), { identidadServidor: '655' }), MASIVO)).toThrow(/655 según el servidor, no al 654/);
  });
  test('evidencia insuficiente: sin registro del servidor la negativa nunca es PASS; sin nodos tampoco', () => {
    const r = evaluarRecorrido(L('656', MODELO(false), null), INDIVIDUAL);
    expect(r).toMatchObject({ estado: 'NOT_AUTOMATED' });
    expect(r.detalle).toMatch(/Finalización INCIERTA/);
    const sin = MODELO(false).map((n) => ({ ...n, recorrido: false }));
    expect(evaluarRecorrido(L('656', sin, null), INDIVIDUAL).estado).toBe('NOT_AUTOMATED');
    expect(evaluarRecorrido(L('656', sin, null), MASIVO).estado).toBe('NOT_AUTOMATED');
  });
  test('ruta positiva observada sin registro: PASS de la parte positiva; lo exigido ausente sin registro queda pendiente', () => {
    expect(evaluarRecorrido(L('654', MODELO(true), null), MASIVO).estado).toBe('PASS');
    expect(evaluarRecorrido(L('656', MODELO(false), null), MASIVO).estado).toBe('NOT_AUTOMATED');
  });
  test('fuentes que no coinciden (el dibujo marca algo que el registro no tiene): revisión humana', () => {
    const r = evaluarRecorrido(L('656', MODELO(false).map((n) => (n.id === 'g-completar' ? { ...n, recorrido: true } : n)), REGISTRO(false)), INDIVIDUAL);
    expect(r).toMatchObject({ estado: 'NOT_AUTOMATED' });
    expect(r.detalle).toMatch(/fuentes no coinciden/);
  });
  test('nombre inexistente en el modelo: es calibración de la automatización, no defecto', () => {
    expect(() => evaluarRecorrido(L('654', MODELO(true), REGISTRO(true)), { recorrido: ['¿Masivo?'] })).toThrow(/\[calibrar recorrido\]/);
    expect(causaDeExcepcion(new Error('[calibrar recorrido] x'))).toBe('AUTOMATIZACION');
  });
});

// ---------------------------------------------------------------- Admin → Casos sintético
interface Estado {
  asignado: string; disponibleTras: number; consultas: number; reasignaciones: number; duplicada?: boolean; sinPermiso?: boolean; noPersiste?: boolean;
  /** Tras reasignar: aparece un segundo work item con el mismo nombre ya asignado al objetivo, o el work item cambia de identidad. */
  trasReasignar?: 'duplicada' | 'otraIdentidad';
  cancelaciones?: number;
}
const OBJETIVO = 'Analista.Pruebas';

async function adminSintetico(context: BrowserContext, page: Page, e: Estado) {
  const html = `<!doctype html><html><body>
    <div id="inbox">Bandeja de entrada</div><div id="menuListInbox">Bandeja</div>
    <div id="menuListAdmin">Admin</div><div id="menuAdmin" hidden>Administración de procesos</div>
    <ul id="categories" hidden><li>Casos</li></ul>
    <div role="dialog" aria-label="Casos" id="dlg" hidden>
      <input id="caseInput"><button id="btn-admin-case-search">Buscar</button>
      <div id="res"></div>
      <button id="btn-admin-case-invalidate" onclick="fetch('/cancelar', { method: 'POST' })">Cancelar</button><button id="btn-admin-case-reassign">Reasignar</button>
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
      // El primero que coincide YA está asignado al objetivo: tomar el primero daría un falso éxito (defecto F4 de Work).
      if (e.reasignaciones && e.trasReasignar === 'duplicada') tareas.unshift({ idWorkItem: '9002', taskName: 'Estructurar información', assignee: `domain\\${OBJETIVO}` });
      if (e.reasignaciones && e.trasReasignar === 'otraIdentidad') tareas.splice(0, tareas.length, { idWorkItem: '9003', taskName: 'Estructurar información', assignee: `domain\\${OBJETIVO}` });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows: [{ radNumber: '700', isSubprocess: false, data: ['700', 'P', tareas] }], records: 1 }) });
    }
    if (u.includes('/cancelar')) { e.cancelaciones = (e.cancelaciones ?? 0) + 1; return r.fulfill({ body: '{}' }); }
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
  test('H. tras reasignar aparecen dos work items con el mismo nombre: BLOCKED por ASIGNACION, no se toma el primero', async ({ page, context }) => {
    const e: Estado = { asignado: 'Otro.Analista', disponibleTras: 0, consultas: 0, reasignaciones: 0, noPersiste: true, trasReasignar: 'duplicada' };
    await adminSintetico(context, page, e);
    const err = await correr(page, { maximoMs: 1_500 }).catch((x: Error) => x);
    expect(String(err)).toMatch(/tras reasignar, "Estructurar información" tiene 2 work items .* ambigüedad/);
    expect(causaDeExcepcion(err)).toBe('ASIGNACION');
  });
  test('I. tras reasignar el work item tiene OTRA identidad: BLOCKED por ASIGNACION, aunque esté asignado al objetivo', async ({ page, context }) => {
    const e: Estado = { asignado: 'Otro.Analista', disponibleTras: 0, consultas: 0, reasignaciones: 0, noPersiste: true, trasReasignar: 'otraIdentidad' };
    await adminSintetico(context, page, e);
    const err = await correr(page, { maximoMs: 1_500 }).catch((x: Error) => x);
    expect(String(err)).toMatch(/ya no es el original \(9001 → 9003\)/);
    expect(causaDeExcepcion(err)).toBe('ASIGNACION');
  });
  test('J. reasignación efectiva: confirma el MISMO work item, único y asignado al objetivo', async ({ page, context }) => {
    const e: Estado = { asignado: 'Otro.Analista', disponibleTras: 0, consultas: 0, reasignaciones: 0 };
    await adminSintetico(context, page, e);
    expect((await correr(page)).detalle).toMatch(/MISMO work item \(9001\), único y asignado/);
  });
  test('K. nunca se pulsa «Cancelar» de Administrar Casos (anular el caso), ni ante ambigüedad', async ({ page, context }) => {
    for (const extra of [{}, { duplicada: true }, { noPersiste: true, trasReasignar: 'duplicada' as const }]) {
      const e: Estado = { asignado: 'Otro.Analista', disponibleTras: 0, consultas: 0, reasignaciones: 0, ...extra };
      await adminSintetico(context, page, e);
      await correr(page, { maximoMs: 1_500 }).catch(() => undefined);
      expect(e.cancelaciones ?? 0).toBe(0);
    }
  });
  test('G. repetir es idempotente: la segunda ejecución no reasigna', async ({ page, context }) => {
    const e: Estado = { asignado: 'Otro.Analista', disponibleTras: 0, consultas: 0, reasignaciones: 0 };
    await adminSintetico(context, page, e);
    expect(await correr(page)).toMatchObject({ reasignada: true });
    expect(await correr(page)).toMatchObject({ reasignada: false });
    expect(e.reasignaciones).toBe(1);
  });
});
