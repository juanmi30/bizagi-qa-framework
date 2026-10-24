import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro } from '../../sde/datos';
import { cargarEscenario, DIR_ESCENARIOS } from '../../sde/escenario';
import { crearContexto, ejecutarEscenario, type Capacidad } from '../../sde/ejecutor';
import { cargarPresentacion, type CatalogoPresentacion } from '../../sde/presentacion';
import { evaluarRecorrido, type LecturaRecorrido, type RecorridoEsperado } from '../../sde/capacidades';

const reg = cargarRegistro();
const ENV = { BIZAGI_BASE_URL: 'https://sintetico.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c', SDE_PROCESO_RADICACION: 'p',
  SDE_PROCESO_CATEGORIA: 'c', SDE_RUTA_LINEA: 'l', SDE_RUTA_RAMO: 'r', SDE_RUTA_MOVIMIENTO: 'm', SDE_SUCURSAL: 's',
  SDE_RUTA_FORMA_CONSULTA: 'f', SDE_RUTA_CRITERIO_CAMPO: 'c', SDE_RUTA_CRITERIO_VALOR: '999' };
const RUTA_CP05 = resolve(DIR_ESCENARIOS, '1-hu06-cp05.yaml');
/** Instancia y GUID SINTÉTICOS. No reutiliza la evidencia de 706/708/770 para certificar otro caso. */
const grafico = (): LecturaRecorrido => ({ numero: '900', encabezado: '900', identidadServidor: '900', idCasoServidor: '100', idCasoConsulta: '100', idFlujoCaso: '10', idFlujoRegistro: '10',
  registro: ['compuerta', 'consulta'], nodos: [
    { id: 'compuerta', nombre: '¿Masivo o correo?', tipos: ['exclusivegateway'], recorrido: true, actual: false },
    { id: 'consulta', nombre: 'Consultar información de solicitud', tipos: ['subprocess'], recorrido: true, actual: true },
    { id: 'worker', nombre: 'Estructurar información', tipos: ['aiworkertask'], recorrido: false, actual: false },
  ] });
async function ejecutar(g: LecturaRecorrido, catalogo?: CatalogoPresentacion, actividadCorrecta = true) {
  const ok: Capacidad = async () => ({});
  return ejecutarEscenario(cargarEscenario(RUTA_CP05, reg), { capacidades: {
    iniciar_sesion: async (p, c) => { c.sesiones.add(p.actor as string); }, nuevo_caso: ok, diligenciar: ok, verificar: ok,
    pulsar: async (_p, c) => { c.numeroCaso = '900'; },
    verificar_ruta: async () => ({ detalle: 'Consulta actual de la instancia sintética: Consultar SISE' }),
    verificar_recorrido_grafico: async p => {
      const r = evaluarRecorrido(g, p as RecorridoEsperado);
      if (r.estado === 'FAIL') throw new Error(r.detalle);
      return r.estado === 'NOT_AUTOMATED' ? { ...r, causa: 'NO_AUTOMATIZADO' } : { detalle: r.detalle };
    },
  }, verificar: async v => ({ ok: !('actividad' in v) || actividadCorrecta, detalle: 'Observación de la instancia sintética' }),
  evidencia: async () => undefined, ...(catalogo ? { presentacion: catalogo } : {}) }, crearContexto(reg, ENV, 'sintetico'));
}

test.describe('HU06-CP05: criterio confirmado y evidencia propia completa @unit', () => {
  test('la aprobación cita la confirmación funcional conservada, no solo una actividad observada', () => {
    const e = cargarPresentacion().expectativas['RUTA-CONSULTA-UNITARIA'];
    expect(e).toMatchObject({ estado: 'aprobada', fuente: expect.stringContaining('Juan Miguel'), verificar: [{ actividad: 'Consultar SISE' }] });
    const cfg = JSON.parse(readFileSync(resolve(DIR_ESCENARIOS, '../certificacion/HU06.json'), 'utf8'));
    const validacion = cfg.casos.find((c: { cp: string }) => c.cp === 'HU06-CP05').validacionPosterior;
    expect(validacion.pasos).toEqual([8, 9]);
    expect(validacion.texto).toContain('es el camino regular esperado');
  });
  test('llegada aprobada y registro completo de la instancia: P8/P9 PASS, P6 y el CP siguen parciales', async () => {
    const r = await ejecutar(grafico());
    expect(r.matriz.filter(p => [8, 9].includes(p.n)).map(p => p.estado)).toEqual(['PASS', 'PASS']);
    expect(r.matriz.find(p => p.n === 6)?.estado).toBe('NOT_AUTOMATED');
    expect(r.estado).toBe('REAL_PASS_PARCIAL');
  });
  test('llegada actual por sí sola no basta: GUID no reconciliado deja P8/P9 inconclusos', async () => {
    const g = grafico(); g.registro!.push('no-representado');
    const r = await ejecutar(g);
    expect(r.matriz.filter(p => [8, 9].includes(p.n)).map(p => p.estado)).toEqual(['NOT_AUTOMATED', 'NOT_AUTOMATED']);
  });
  test('registro sin identidad suficiente nunca acredita P8/P9', async () => {
    const g = grafico(); g.identidadServidor = null;
    const r = await ejecutar(g);
    expect(r.matriz.filter(p => [8, 9].includes(p.n)).map(p => p.estado)).toEqual(['NOT_AUTOMATED', 'NOT_AUTOMATED']);
  });
  test('Worker inequívocamente recorrido en la instancia: FAIL, sin suavizar la expectativa', async () => {
    const g = grafico(); g.registro!.push('worker'); g.nodos[2].recorrido = true;
    expect((await ejecutar(g)).estado).toBe('FAIL');
  });
  test('no se observa la llegada aprobada: P8 falla y no se fabrica aprobación gráfica', async () => {
    const r = await ejecutar(grafico(), undefined, false);
    expect(r.matriz.find(p => p.n === 8)?.estado).toBe('FAIL');
    expect(r.pasos.find(p => p.hacer === 'verificar_recorrido_grafico')?.estado).toBe('NOT_RUN');
  });
  test('una expectativa que sigue pendiente en el contrato nunca se aprueba por coincidencia', async () => {
    const base = cargarPresentacion();
    const pendiente: CatalogoPresentacion = { ...base, expectativas: { ...base.expectativas, 'RUTA-CONSULTA-UNITARIA': {
      descripcion: 'Criterio sintético sin aprobación', estado: 'pendiente_definicion', pendiente: 'Fuente funcional aún ausente', responsable: 'QA sintético',
    } } };
    const r = await ejecutar(grafico(), pendiente);
    expect(r.matriz.find(p => p.n === 8)?.estado).toBe('NOT_AUTOMATED');
    expect(r.estado).not.toBe('REAL_PASS');
  });
});
