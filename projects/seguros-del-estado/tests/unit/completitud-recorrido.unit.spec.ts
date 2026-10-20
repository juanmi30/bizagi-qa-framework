import { test, expect } from '@playwright/test';
import { evaluarRecorrido, leerRecorridoGrafico, type LecturaRecorrido, type NodoGrafico } from '../../sde/capacidades';

test.use({ baseURL: 'http://portal.sintetico.local', trace: 'off' });

// Identidades, GUID y respuestas puramente sintéticos. No acreditan una calibración nueva de QA.
const nodo = (id: string, nombre: string, recorrido = true, tipos = ['nonetask']): NodoGrafico => ({ id, nombre, recorrido, tipos, actual: false });
const negativa = { no_recorrido: ['Estructurar información'], no_recorrido_tipo: ['aiworkertask'] };
const lectura = (cambios: Partial<LecturaRecorrido> = {}): LecturaRecorrido => ({
  numero: '700', encabezado: '700', identidadServidor: '700', idCasoServidor: '100', idCasoConsulta: '100', idFlujoCaso: '10', idFlujoRegistro: '10',
  registro: ['inicio', 'consulta'],
  nodos: [nodo('inicio', 'Inicio'), nodo('consulta', 'Consultar'), nodo('worker', 'Estructurar información', false, ['aiworkertask'])],
  ...cambios,
});

test.describe('Issue #8: reconciliación del recorrido @unit', () => {
  test('tres GUID ejecutados y solo dos representados: negativa inconclusa', () => {
    const r = evaluarRecorrido(lectura({ registro: ['inicio', 'consulta', 'no-representado'] }), negativa);
    expect(r.estado).toBe('NOT_AUTOMATED');
    expect(r.detalle).not.toContain('Evidencia completa');
  });
  test('GUID técnico sin correspondencia acreditada no se exceptúa', () => {
    expect(evaluarRecorrido(lectura({ registro: ['inicio', 'consulta', 'g-flujo-sin-hotspot'] }), negativa).estado).toBe('NOT_AUTOMATED');
  });
  test('correspondencia completa e identidad suficiente: negativa PASS', () => {
    expect(evaluarRecorrido(lectura(), negativa)).toMatchObject({ estado: 'PASS', detalle: expect.stringContaining('Evidencia completa') });
  });
  test('nodo prohibido efectivamente recorrido: FAIL con expectativa aprobada', () => {
    const l = lectura();
    l.registro!.push('worker');
    l.nodos[2].recorrido = true;
    expect(evaluarRecorrido(l, negativa).estado).toBe('FAIL');
  });
  test('evidencia positiva de nodo prohibido conserva FAIL aunque otro GUID no se reconcilie', () => {
    const l = lectura({ registro: ['inicio', 'consulta', 'worker', 'desconocido'] });
    l.nodos[2].recorrido = true;
    expect(evaluarRecorrido(l, negativa).estado).toBe('FAIL');
  });
  test('sin identidad de radicación: negativa inconclusa', () => {
    expect(evaluarRecorrido(lectura({ identidadServidor: null }), negativa).estado).toBe('NOT_AUTOMATED');
  });
  test('sin identidad de instancia: negativa inconclusa', () => {
    expect(evaluarRecorrido(lectura({ idCasoConsulta: null }), negativa).estado).toBe('NOT_AUTOMATED');
  });
  test('dibujo marca un nodo no incluido en el registro: nunca PASS', () => {
    const l = lectura();
    l.nodos.push(nodo('ajeno', 'Otra actividad'));
    expect(evaluarRecorrido(l, negativa).estado).toBe('NOT_AUTOMATED');
  });
  test('nodos estáticos no recorridos no necesitan aparecer en TransitionLog', () => {
    const l = lectura();
    l.nodos.push(nodo('estatico', 'Actividad de otra rama', false));
    expect(evaluarRecorrido(l, negativa).estado).toBe('PASS');
  });
  for (const marcado of [true, false]) {
    test(`GUID ejecutado duplicado en el dibujo (segunda marca ${marcado}): inconcluso`, () => {
      const l = lectura();
      l.nodos.push(nodo('consulta', 'Otro elemento', marcado));
      expect(evaluarRecorrido(l, negativa).estado).toBe('NOT_AUTOMATED');
    });
  }
  test('nodo recorrido sin GUID: inconcluso', () => {
    const l = lectura();
    l.nodos.push({ ...nodo('', 'Sin identidad'), id: undefined });
    expect(evaluarRecorrido(l, negativa).estado).toBe('NOT_AUTOMATED');
  });
  test('GUID vacío en el registro: inconcluso', () => {
    expect(evaluarRecorrido(lectura({ registro: ['inicio', 'consulta', ''] }), negativa).estado).toBe('NOT_AUTOMATED');
  });
  test('extremos repetidos de transiciones no crean ambigüedad de modelo', () => {
    expect(evaluarRecorrido(lectura({ registro: ['inicio', 'consulta', 'consulta', 'inicio'] }), negativa).estado).toBe('PASS');
  });
  test('positiva completa correctamente observada: PASS', () => {
    expect(evaluarRecorrido(lectura(), { recorrido: ['Consultar'] }).estado).toBe('PASS');
  });
  test('positiva observada sin registro sigue siendo observación, no evidencia completa', () => {
    const r = evaluarRecorrido(lectura({ registro: null }), { recorrido: ['Consultar'] });
    expect(r.estado).toBe('PASS');
    expect(r.detalle).not.toContain('Evidencia completa');
  });
  test('registro no reconciliado no demuestra que una actividad exigida faltó', () => {
    const l = lectura({ registro: ['inicio', 'consulta', 'desconocido'] });
    expect(evaluarRecorrido(l, { recorrido: ['Estructurar información'] }).estado).toBe('NOT_AUTOMATED');
  });
});

test.describe('Issue #8: lectura del portal sintético y señal de completitud @unit', () => {
  for (const modo of ['completo', 'ausente', 'duplicado', 'otro-dialogo'] as const) {
    test(modo, async ({ page, context }) => {
      const html = `<!doctype html><html><body><div id="menuListInbox">Bandeja</div><div id="inbox">Bandeja</div><input id="menuQuery">
        <table><tbody><tr><td class="I_RadNumber">700</td><td><button class="ui-bizagi-wp-app-inbox-cases-ico-view" id="abrir">Ver</button></td></tr></tbody></table>
        <div class="ui-dialog" hidden id="dlg"><span class="ui-dialog-title">Consulta Gráfica</span>
        <table><tr><th scope="row">Caso:</th><td>700</td></tr></table><button id="ruta">Ruta</button>
        <div id="inicio" class="processviewer-hotspot processviewer-highlighted start">Inicio</div>
        <div id="consulta" class="processviewer-hotspot processviewer-highlighted subprocess">Consultar</div>
        <div id="worker" class="processviewer-hotspot aiworkertask">Estructurar información</div>
        ${modo === 'duplicado' ? '<div id="consulta" class="processviewer-hotspot processviewer-highlighted subprocess">Duplicado</div>' : ''}</div>
        ${modo === 'otro-dialogo' ? '<div id="tercero" class="processviewer-hotspot processviewer-highlighted">Otro caso</div>' : ''}
        <script>document.getElementById('abrir').onclick = async () => {
          await fetch('/Rest/Cases/WorkitemsGuid?idCase=100&idWorkFlow=10'); document.getElementById('dlg').hidden = false;
        }; document.getElementById('ruta').onclick = () => fetch('/Rest/Cases/TransitionLog?idCase=100&idWorkFlow=10');</script></body></html>`;
      await context.route('**/*', (r) => {
        const u = r.request().url();
        if (u.includes('WorkitemsGuid')) return r.fulfill({ json: { currentCase: { idCase: 100, radicationNumber: '700' } } });
        if (u.includes('TransitionLog')) return r.fulfill({ json: [{ guidTaskFrom: 'inicio', guidTaskTo: 'consulta' },
          ...(['ausente', 'otro-dialogo'].includes(modo) ? [{ guidTaskFrom: 'consulta', guidTaskTo: 'tercero' }] : [])] });
        return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
      });
      // Ejecuta el predicado REAL una vez en el navegador; simula el fin del plazo para evitar 60 s por negativa.
      // No sustituye la decisión de evaluarRecorrido ni fabrica una señal de éxito.
      let senal: boolean | undefined;
      Object.defineProperty(page, 'waitForFunction', { value: async (predicado: (arg: unknown) => boolean, arg: unknown) => {
        senal = await page.evaluate(predicado, arg);
        if (!senal) throw new Error('Plazo sintético agotado sin señal de completitud');
        return null;
      } });
      const leida = await leerRecorridoGrafico(page, '700');
      expect(senal).toBe(modo === 'completo');
      expect(evaluarRecorrido(leida, negativa).estado).toBe(modo === 'completo' ? 'PASS' : 'NOT_AUTOMATED');
    });
  }
});
