import { test, expect } from '@playwright/test';
import { evaluarRecorrido, type LecturaRecorrido, type NodoGrafico } from '../../sde/capacidades';
import { NoConcluyenteError } from '../../sde/ui';

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
