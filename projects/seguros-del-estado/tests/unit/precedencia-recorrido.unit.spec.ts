import { test, expect } from '@playwright/test';
import { evaluarRecorrido, leerRecorridoGrafico, type LecturaRecorrido, type NodoGrafico } from '../../sde/capacidades';
import { NoConcluyenteError } from '../../sde/ui';

test.use({ baseURL: 'http://portal.sintetico.local', trace: 'off' });

/**
 * Auditoría del PR #9: precedencia de la clasificación. Una ambigüedad que NO afecta al nodo prohibido no puede ocultar
 * su recorrido demostrado (FAIL). Si la ambigüedad toca al propio nodo prohibido, o no hay ninguno demostrado, queda inconcluso.
 * Identidades, GUID y nodos sintéticos.
 */
const nodo = (id: string | undefined, nombre: string, recorrido = true, tipos = ['nonetask']): NodoGrafico => ({ id, nombre, recorrido, tipos, actual: false });
const negativa = { no_recorrido: ['Estructurar información'], no_recorrido_tipo: ['aiworkertask'] };
const worker = (recorrido = true) => nodo('worker', 'Estructurar información', recorrido, ['aiworkertask']);
const lectura = (registro: string[], nodos: NodoGrafico[], cambios: Partial<LecturaRecorrido> = {}): LecturaRecorrido => ({
  numero: '700', encabezado: '700', identidadServidor: '700', idCasoServidor: '100', idCasoConsulta: '100', idFlujoCaso: '10', idFlujoRegistro: '10',
  registro, nodos, ...cambios,
});
const base = () => [nodo('inicio', 'Inicio'), nodo('consulta', 'Consultar')];

test.describe('PR #9: precedencia de la clasificación del recorrido @unit', () => {
  test('contraejemplo: worker prohibido inequívoco + consulta duplicada → FAIL', () => {
    const r = evaluarRecorrido(lectura(['inicio', 'consulta', 'worker'], [...base(), nodo('consulta', 'Consultar'), worker()]), negativa);
    expect(r.estado).toBe('FAIL');
    expect(r.detalle).toContain('"Estructurar información" fue recorrido');
  });
  test('worker prohibido inequívoco + nodo ajeno marcado sin ID → FAIL', () => {
    expect(evaluarRecorrido(lectura(['inicio', 'consulta', 'worker'], [...base(), worker(), nodo(undefined, 'Ajeno')]), negativa).estado).toBe('FAIL');
  });
  test('ambigüedad sobre la identidad del propio worker (GUID duplicado) → inconcluso', () => {
    expect(evaluarRecorrido(lectura(['inicio', 'consulta', 'worker'], [...base(), worker(), worker()]), negativa).estado).toBe('NOT_AUTOMATED');
  });
  test('worker marcado sin GUID → inconcluso (no se sabe qué elemento es)', () => {
    expect(evaluarRecorrido(lectura(['inicio', 'consulta'], [...base(), nodo(undefined, 'Estructurar información', true, ['aiworkertask'])]), negativa).estado).toBe('NOT_AUTOMATED');
  });
  test('worker dibujado pero NO recorrido (solo en el modelo) → no FAIL por su presencia', () => {
    expect(evaluarRecorrido(lectura(['inicio', 'consulta'], [...base(), worker(false)]), negativa).estado).toBe('PASS');
    expect(evaluarRecorrido(lectura(['inicio', 'consulta'], [...base(), nodo('consulta', 'Consultar'), worker(false)]), negativa).estado).toBe('NOT_AUTOMATED');
  });
  test('worker con GUID único marcado en el dibujo aunque falte en el registro → FAIL (criterio C del PR #7, se conserva)', () => {
    expect(evaluarRecorrido(lectura(['inicio', 'consulta'], [...base(), worker()]), negativa).estado).toBe('FAIL');
  });
  test('sin actividades prohibidas y correspondencia incompleta → inconcluso', () => {
    expect(evaluarRecorrido(lectura(['inicio', 'consulta', 'no-representado'], [...base(), worker(false)]), negativa).estado).toBe('NOT_AUTOMATED');
  });
  test('ruta completa válida → PASS', () => {
    expect(evaluarRecorrido(lectura(['inicio', 'consulta'], [...base(), worker(false)]), negativa)).toMatchObject({ estado: 'PASS', detalle: expect.stringContaining('Evidencia completa') });
  });
  test('GUID ejecutado sin correspondencia y sin incumplimiento independiente → inconcluso', () => {
    expect(evaluarRecorrido(lectura(['inicio', 'consulta', 'desconocido'], [...base(), worker(false)]), negativa).estado).toBe('NOT_AUTOMATED');
  });
  test('identidad de radicación o instancia incorrecta: ni FAIL ni PASS aunque haya un worker recorrido', () => {
    const nodos = [...base(), worker()];
    expect(() => evaluarRecorrido(lectura(['inicio', 'consulta', 'worker'], nodos, { identidadServidor: '701' }), negativa)).toThrow(NoConcluyenteError);
    expect(() => evaluarRecorrido(lectura(['inicio', 'consulta', 'worker'], nodos, { encabezado: '701' }), negativa)).toThrow(NoConcluyenteError);
    expect(() => evaluarRecorrido(lectura(['inicio', 'consulta', 'worker'], nodos, { idCasoConsulta: '101' }), negativa)).toThrow(NoConcluyenteError);
  });
});

// Formato REAL de TransitionLog (sonda de solo lectura del 2026-10-20, caso 671): cada transición llega en dos registros,
// uno con solo guidTaskTo y otro con solo guidTaskFrom (el otro campo como texto vacío). GUID y portal sintéticos.
test.describe('Lector: formato real de TransitionLog @unit', () => {
  const pares = (a: string, b: string) => [{ guidTaskFrom: '', guidTaskTo: b, tskNameFrom: 'A', tskNameTo: 'B' }, { guidTaskFrom: a, guidTaskTo: '', tskNameFrom: 'A', tskNameTo: 'B' }];
  const casos: [string, unknown[], number | null][] = [
    ['pares reales con un lado vacío: registro reconstruido', [...pares('inicio', 'consulta')], 2],
    ['registro sin ningún GUID: malformado, sin registro', [{ guidTaskFrom: '', guidTaskTo: '' }], null],
    ['campo con tipo distinto de texto: malformado, sin registro', [{ guidTaskFrom: 'inicio', guidTaskTo: null }], null],
  ];
  for (const [titulo, transiciones, esperado] of casos) {
    test(titulo, async ({ page, context }) => {
      const html = `<!doctype html><html><body><div id="menuListInbox">Bandeja</div><div id="inbox">Bandeja</div><input id="menuQuery">
        <table><tbody><tr><td class="I_RadNumber">700</td><td><button class="ui-bizagi-wp-app-inbox-cases-ico-view" id="abrir">Ver</button></td></tr></tbody></table>
        <div class="ui-dialog" hidden id="dlg"><span class="ui-dialog-title">Consulta Gráfica</span>
        <table><tr><th scope="row">Caso:</th><td>700</td></tr></table><button id="ruta">Ruta</button>
        <div id="inicio" class="processviewer-hotspot start">Inicio</div><div id="consulta" class="processviewer-hotspot subprocess">Consultar</div>
        <div id="worker" class="processviewer-hotspot aiworkertask">Estructurar información</div></div>
        <script>document.getElementById('abrir').onclick = async () => { await fetch('/Rest/Cases/WorkitemsGuid?idCase=100&idWorkFlow=10'); document.getElementById('dlg').hidden = false; };
        document.getElementById('ruta').onclick = async () => { await fetch('/Rest/Cases/TransitionLog?idCase=100&idWorkFlow=10');
          ['inicio', 'consulta'].forEach((id) => document.getElementById(id).classList.add('processviewer-highlighted')); };</script></body></html>`;
      await context.route('**/*', (r) => {
        const u = r.request().url();
        if (u.includes('WorkitemsGuid')) return r.fulfill({ json: { currentCase: { idCase: 100, radicationNumber: '700' } } });
        if (u.includes('TransitionLog')) return r.fulfill({ json: transiciones });
        return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
      });
      const l = await leerRecorridoGrafico(page, '700');
      expect(l.registro?.length ?? null).toBe(esperado);
      expect(evaluarRecorrido(l, negativa).estado).toBe(esperado ? 'PASS' : 'NOT_AUTOMATED');
    });
  }
});
