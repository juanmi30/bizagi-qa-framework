import { test, expect } from '@playwright/test';
import { autorizacionCasoCreado, autorizarAperturaPopup, cargarPopups } from '../../sde/popups';
import { crearContexto, ejecutarEscenario, type Capacidad } from '../../sde/ejecutor';
import { cargarRegistro } from '../../sde/datos';
import type { EscenarioSde, PasoSde } from '../../sde/escenario';
import { cargarEscenario, DIR_ESCENARIOS } from '../../sde/escenario';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import VeredictoSde from '../../sde/veredicto';
import type { TestCase, TestResult, FullResult } from '@playwright/test/reporter';

const registro = cargarRegistro();
const env = { BIZAGI_BASE_URL: 'https://sintetico.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c',
  SDE_E2E: '1', SDE_POPUPS_CASO_CREADO: '1', BIZAGI_CORRIDA: 'corrida-sintetica' };
const contexto = () => {
  const c = crearContexto(registro, { ...env }, 'unico-sintetico'); c.numeroCaso = '900';
  c.casoCreado = { numero: '900', instancia: 'instancia-sintetica', unico: c.unico, corrida: env.BIZAGI_CORRIDA }; return c;
};

test.describe('Cierre HU06: autorización por caso creado e independencia segura @unit', () => {
  test('el veredicto de una corrida nueva no sobrescribe el histórico convencional', async ({}, info) => {
    const rutaAnterior = resolve('test-results', process.env.PROJECT ?? 'seguros-del-estado', 'veredicto-e2e.json');
    const anterior = existsSync(rutaAnterior) ? readFileSync(rutaAnterior) : null;
    const salidaAnterior = process.env.SDE_VEREDICTO_SALIDA, modoAnterior = process.env.SDE_TIPO_EJECUCION;
    const nueva = info.outputPath('veredicto-sintetico.json');
    try {
      process.env.SDE_VEREDICTO_SALIDA = nueva; process.env.SDE_TIPO_EJECUCION = 'certificacion';
      const r = new VeredictoSde();
      r.onTestEnd({ id: 'sintetico', title: 'sintetico @e2e', tags: ['@e2e'], annotations: [{ type: 'resultado_funcional', description: 'FAIL' }] } as unknown as TestCase,
        { status: 'failed', annotations: [] } as unknown as TestResult);
      await r.onEnd({ status: 'failed' } as FullResult);
      expect(JSON.parse(readFileSync(nueva, 'utf8'))).toMatchObject({ satisfactorio: false, por_estado: { FAIL: 1 } });
      if (anterior) expect(readFileSync(rutaAnterior)).toEqual(anterior);
    } finally {
      if (salidaAnterior === undefined) delete process.env.SDE_VEREDICTO_SALIDA; else process.env.SDE_VEREDICTO_SALIDA = salidaAnterior;
      if (modoAnterior === undefined) delete process.env.SDE_TIPO_EJECUCION; else process.env.SDE_TIPO_EJECUCION = modoAnterior;
      // Incluso una regresión del reporter conserva el archivo anterior byte por byte.
      if (anterior && !readFileSync(rutaAnterior).equals(anterior)) writeFileSync(rutaAnterior, anterior);
    }
  });
  test('el dato RCE del pop-up HU06 no cambia el dato del formulario inicial HU03', () => {
    expect(registro.datasets['EST-FILA-CUMPL-SIN-RCE'].propiedades.find(p => p.nombre === 'ramo_rce')?.env).toBe('SDE_CUMPL_RAMO_RCE_POPUP');
    expect(registro.datasets['POL-CUMPL-RCE'].propiedades.find(p => p.nombre === 'ramo_rce')?.env).toBe('SDE_CUMPL_RAMO_RCE');
  });
  test('CP01 observa el texto de la adición por separado, sin cambiar la expectativa ni bloquear la fila propia', () => {
    const e = cargarEscenario(resolve(DIR_ESCENARIOS, '3-hu06-cp01.yaml'), registro);
    const i = e.pasos.findIndex(p => p.hacer === 'tabla_agregar');
    expect(e.pasos[i].verificar).toBeUndefined();
    expect(e.pasos[i + 1]).toMatchObject({ hacer: 'verificar', no_bloqueante: true, matriz: [24], verificar: [{ valor: { campo: 'Forma Consulta', igual: 'Identificación de Tomador' } }] });
    expect(e.pasos[i + 2].hacer).toBe('diligenciar');
  });
  test('CP04 conserva toda la matriz y completa lo independiente antes de la negativa de riesgo', () => {
    const e = cargarEscenario(resolve(DIR_ESCENARIOS, '6-hu06-cp04.yaml'), registro);
    const negativo = e.pasos.findIndex(p => p.hacer === 'intentar_diligenciar' && p.valor === '12345678');
    expect(e.pasos.findIndex(p => p.hacer === 'tabla_eliminar_fila')).toBeLessThan(negativo);
    expect(e.pasos.findIndex(p => p.hacer === 'abrir_pestana')).toBeLessThan(negativo);
    const popup = e.pasos.findIndex(p => p.hacer === 'tabla_abrir_fila');
    expect(e.pasos[popup - 1]).toMatchObject({ hacer: 'abrir_caso', actor: 'analista', actividad: 'Estructurar información' });
    expect(e.pasos.filter(p => p.hacer === 'pulsar' && p.capturar_numero_caso).length).toBe(1);
    expect(new Set(e.pasos.flatMap(p => p.matriz)).size).toBe(22); // P1 es agregado; P2–P23 conservados.
    expect(e.pasos.at(-1)).toMatchObject({ hacer: 'dialogo_confirmar', matriz: [19], espera: 'cierra' });
  });
  test('permiso sintético de la corrida pasa solamente la excepción en_calibracion existente', () => {
    const c = contexto(); const permiso = autorizacionCasoCreado(c, '900');
    expect(permiso).toBe('900');
    expect(() => autorizarAperturaPopup('detalle-polizas-cumplimiento', 'Detalle Polizas Asociadas', c.numeroCaso, cargarPopups(), permiso)).not.toThrow();
    expect(() => autorizarAperturaPopup('detalle-polizas-modificacion-generales', 'Detalle Polizas Asociadas', c.numeroCaso, cargarPopups(), permiso)).toThrow(/sin_calibrar/);
  });
  for (const variante of ['sinCreacion', 'otraInstanciaFormulario', 'otroCaso', 'otraCorrida', 'otroUnico', 'sinInstancia', 'sinOptIn', 'sinE2E'] as const) {
    test(`nunca autoriza ${variante}`, () => {
      const c = contexto(); let numero = '900';
      if (variante === 'sinCreacion') c.casoCreado = undefined;
      if (variante === 'otraInstanciaFormulario') numero = '901';
      if (variante === 'otroCaso') c.numeroCaso = '901';
      if (variante === 'otraCorrida') c.env.BIZAGI_CORRIDA = 'otra';
      if (variante === 'otroUnico') c.unico = 'otro';
      if (variante === 'sinInstancia') c.casoCreado!.instancia = undefined;
      if (variante === 'sinOptIn') c.env.SDE_POPUPS_CASO_CREADO = '0';
      if (variante === 'sinE2E') c.env.SDE_E2E = '0';
      expect(autorizacionCasoCreado(c, numero)).toBeUndefined();
    });
  }
  for (const tipo of ['tabla_verificar', 'intentar_diligenciar', 'dialogo_confirmar']) {
    test(`${tipo}: conserva FAIL funcional y ejecuta el siguiente paso independiente`, async () => {
      const pasos: PasoSde[] = [{ matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' },
        { matriz: [12], hacer: tipo, no_bloqueante: true, espera: 'cierra' }, { matriz: [22], hacer: 'verificar' }];
      const esc: EscenarioSde = { id: 'HU06-CP02', titulo: 'sintetico', etiquetas: [], actores: ['analista'], datasets: [],
        cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'fixture' }, pasos, archivo: 'sintetico' };
      const c = contexto(); let independiente = false;
      const fallo: Capacidad = async () => ({ estado: 'FAIL', causa: 'PRODUCTO_POR_CONFIRMAR', detalle: 'Diferencia funcional observada' });
      const r = await ejecutarEscenario(esc, { capacidades: { iniciar_sesion: async (_p, x) => { x.sesiones.add('analista'); },
        [tipo]: fallo, verificar: async () => { independiente = true; } }, verificar: async () => ({ ok: true, detalle: '' }), evidencia: async () => undefined }, c);
      expect(independiente).toBe(true); expect(r.pasos[1].estado).toBe('FAIL'); expect(r.estado).toBe('FAIL');
    });
  }
  for (const incidente of [false, true]) {
    test(`cierre fallido ${incidente ? 'con incidente' : 'técnico'} nunca permite seguir`, async () => {
      const c = contexto(); let siguio = false;
      const esc: EscenarioSde = { id: 'HU06-CP02', titulo: 'sint', etiquetas: [], actores: ['analista'], datasets: [], archivo: 'sint',
        cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'fixture' }, pasos: [
          { matriz: [2], hacer: 'iniciar_sesion', actor: 'analista' },
          { matriz: [18], hacer: 'dialogo_confirmar', espera: 'cierra', no_bloqueante: true }, { matriz: [22], hacer: 'verificar' }] };
      const r = await ejecutarEscenario(esc, { capacidades: { iniciar_sesion: async (_p, x) => { x.sesiones.add('analista'); x.dialogoAbierto = true; },
        dialogo_confirmar: async () => { if (!incidente) throw new Error('Timeout 30000ms exceeded'); return { estado: 'FAIL', causa: 'PRODUCTO_POR_CONFIRMAR', incidente: { causa: 'AUTOMATIZACION', detalle: 'No cerró' } }; },
        verificar: async () => { siguio = true; } }, verificar: async () => ({ ok: true, detalle: '' }), evidencia: async () => undefined }, c);
      expect(siguio).toBe(false); expect(r.pasos[2].estado).toBe('NOT_RUN');
    });
  }
});
