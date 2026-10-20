import { test, expect } from '@playwright/test';
import { cargarRegistro } from '../../sde/datos';
import type { EscenarioSde, PasoSde } from '../../sde/escenario';
import { crearContexto, ejecutarEscenario, type Capacidad } from '../../sde/ejecutor';
import { BarreraPopupError } from '../../sde/popups';

/**
 * 20/10: la barrera UI-10 impide abrir el pop-up ANTES de cualquier clic. Los pasos de su bloque (mismo "requiere") quedan
 * BLOCKED sin ejecutarse y el recorrido sigue con los independientes. Capacidades falsas, sin QA.
 */
const reg = cargarRegistro();
const P = (matriz: number[], hacer: string, extra: Record<string, unknown> = {}): PasoSde => ({ matriz, hacer, ...extra });
const ENV = { BIZAGI_BASE_URL: 'https://sde.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c' };
const esc = (pasos: PasoSde[]): EscenarioSde => ({ id: 'HU06-CP04', titulo: 't', etiquetas: [], actores: ['analista'], datasets: [],
  cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'r' }, archivo: 'sint', pasos: [P([2], 'iniciar_sesion', { actor: 'analista' }), ...pasos] });

async function correr(pasos: PasoSde[], abrir: Capacidad) {
  const llamadas: string[] = [];
  const r = await ejecutarEscenario(esc(pasos), {
    capacidades: {
      iniciar_sesion: async (_p, c) => { c.sesiones.add('analista'); c.numeroCaso = '700'; },
      tabla_abrir_fila: abrir,
      verificar: async (p) => { llamadas.push(`verificar ${p.matriz.join(',')}`); },
      dialogo_confirmar: async (p) => { llamadas.push(`confirmar ${p.matriz.join(',')}`); },
    },
    verificar: async () => ({ ok: true, detalle: '' }), evidencia: async () => undefined,
  }, crearContexto(reg, ENV, 'u'));
  return { r, llamadas };
}
const barrera: Capacidad = async () => { throw new BarreraPopupError('detalle-polizas-cumplimiento', ['estado "sin_calibrar" (UI-10)']); };
const BLOQUE = ['EST-FILA-CUMPL-CON-RCE'];

test.describe('Barrera UI-10: bloque del pop-up BLOCKED, pasos independientes continúan @unit', () => {
  test('el bloque queda BLOCKED sin ejecutar y las secciones independientes corren', async () => {
    const { r, llamadas } = await correr([
      P([12], 'tabla_abrir_fila', { requiere: BLOQUE }),
      P([13], 'verificar', { requiere: BLOQUE }),
      P([19], 'dialogo_confirmar', { requiere: BLOQUE, espera: 'cierra' }),
      P([22], 'verificar'),
      P([23], 'verificar'),
    ], barrera);
    expect(r.pasos.slice(1, 4).map((p) => [p.estado, p.causa])).toEqual([['BLOCKED', 'AUTOMATIZACION'], ['BLOCKED', 'AUTOMATIZACION'], ['BLOCKED', 'AUTOMATIZACION']]);
    expect(llamadas).toEqual(['verificar 22', 'verificar 23']);
    expect(r.pasos.slice(4).map((p) => p.estado)).toEqual(['PASS', 'PASS']);
    expect(r.estado).toBe('BLOCKED');
  });
  test('sin "requiere" la barrera sigue deteniendo el recorrido (comportamiento anterior)', async () => {
    const { r, llamadas } = await correr([P([12], 'tabla_abrir_fila'), P([22], 'verificar')], barrera);
    expect(r.pasos[2].estado).toBe('NOT_RUN');
    expect(llamadas).toEqual([]);
  });
  test('un fallo distinto de la barrera sigue deteniendo el recorrido', async () => {
    const { r } = await correr([P([12], 'tabla_abrir_fila', { requiere: BLOQUE }), P([22], 'verificar')], async () => { throw new Error('locator.click: Timeout 15000ms exceeded'); });
    expect(r.pasos[1].estado).toBe('FAIL');
    expect(r.pasos[2].estado).toBe('NOT_RUN');
  });
});
