import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { cargarRegistro } from '../../sde/datos';
import { cargarEscenario, DIR_ESCENARIOS, type EscenarioSde } from '../../sde/escenario';
import { crearContexto, ejecutarEscenario, sanitizar, type Capacidad, type Dependencias } from '../../sde/ejecutor';
import { registrarCasoCreado } from '../../sde/registro';
import { HistorialCasos } from '../../../../shared/utils/HistorialCasos';

/**
 * Lógica del ejecutor con capabilities FALSAS (sin navegador ni QA): orden, bloqueos, agregación a
 * la matriz y clasificación. Demuestra que el motor NO puede producir verde sin sesión y caso reales.
 */

const reg = cargarRegistro();
const esc = cargarEscenario(resolve(DIR_ESCENARIOS, '1-hu06-cp05.yaml'), reg);
const ENV = {
  BIZAGI_BASE_URL: 'https://qa.ficticio.test', BIZAGI_LOGIN_DOMINIO: 'domain',
  USUARIO_analista: 'domain\\usuario.ficticio', CLAVE_analista: 'ClaveSecreta#1',
  SDE_PROCESO_CATEGORIA: 'App > Ficticia',
  SDE_PROCESO_RADICACION: 'Proceso ficticio', SDE_RUTA_LINEA: 'L', SDE_RUTA_RAMO: 'R', SDE_RUTA_MOVIMIENTO: 'M',
  SDE_SUCURSAL: 'S', SDE_RUTA_FORMA_CONSULTA: 'Número de póliza', SDE_RUTA_CRITERIO_CAMPO: 'Número de póliza', SDE_RUTA_CRITERIO_VALOR: '998877665',
};

function deps(sobre: Partial<Record<string, Capacidad>> = {}, verificarOk = true): Dependencias & { llamadas: string[] } {
  const llamadas: string[] = [];
  const ok: Capacidad = async (p) => { llamadas.push(p.hacer); };
  const capacidades: Record<string, Capacidad> = {
    iniciar_sesion: async (p, ctx) => { llamadas.push(p.hacer); ctx.sesiones.add(p.actor as string); },
    nuevo_caso: ok, diligenciar: ok, verificar: ok, abrir_caso: ok,
    pulsar: async (p, ctx) => { llamadas.push(p.hacer); if (p.capturar_numero_caso) ctx.numeroCaso = '4321'; },
    verificar_ruta: async (p) => { llamadas.push(p.hacer); return { estado: 'UI_PASS', detalle: 'ruta' }; },
    ...sobre,
  };
  return { llamadas, capacidades, verificar: async (v) => ({ ok: verificarOk, detalle: JSON.stringify(v) }), evidencia: async () => undefined };
}

test.describe('Ejecutor SDE @unit', () => {
  test('sin credenciales/datos: BLOCKED, no ejecuta ninguna capability y lista variables faltantes', async () => {
    const d = deps();
    const r = await ejecutarEscenario(esc, d, crearContexto(reg, { BIZAGI_BASE_URL: ENV.BIZAGI_BASE_URL }, 'u'));
    expect(r.estado).toBe('BLOCKED');
    expect(d.llamadas).toEqual([]);
    expect(r.bloqueos.join(' ')).toContain('USUARIO_analista');
    expect(r.bloqueos.join(' ')).toContain('SDE_PROCESO_RADICACION');
    expect(r.matriz.every((m) => m.estado === 'BLOCKED')).toBe(true);
  });

  test('camino completo con integraciones declaradas → REAL_PASS_PARCIAL (nunca REAL_PASS si hay INTEGRATION_NOT_VERIFIED / NOT_AUTOMATED)', async () => {
    const r = await ejecutarEscenario(esc, deps(), crearContexto(reg, ENV, 'u'));
    expect(r.estado).toBe('REAL_PASS_PARCIAL');
    expect(r.numero_caso).toBe('4321');
    const porPaso = Object.fromEntries(r.matriz.map((m) => [m.n, m.estado]));
    expect(porPaso).toEqual({ 1: 'NOT_AUTOMATED', 2: 'PASS', 3: 'PASS', 4: 'PASS', 5: 'PASS', 6: 'NOT_AUTOMATED', 7: 'PASS', 8: 'NOT_AUTOMATED', 9: 'NOT_AUTOMATED' });
    // P-18: aunque la capacidad de ruta responda UI_PASS, la expectativa pendiente deja P8 sin aprobar. P9 la comparte
    // (verificar_ruta cubre [8, 9]) y el motor la agrega como NOT_AUTOMATED; la integración sigue registrada en su paso.
    expect(r.pasos.find((p) => p.hacer === 'integracion')?.estado).toBe('INTEGRATION_NOT_VERIFIED');
    expect(r.motivo).toContain('P8=NOT_AUTOMATED');
    expect(r.motivo).toContain('P9=NOT_AUTOMATED');
  });

  test('sin número de caso real no hay E2E: FAIL aunque todo lo demás "pase"', async () => {
    const r = await ejecutarEscenario(esc, deps({ pulsar: async () => undefined }), crearContexto(reg, ENV, 'u'));
    expect(r.estado).toBe('FAIL');
    expect(r.motivo).toMatch(/número de caso/);
  });

  test('sin sesión real no hay E2E: FAIL', async () => {
    const r = await ejecutarEscenario(esc, deps({ iniciar_sesion: async () => undefined }), crearContexto(reg, ENV, 'u'));
    expect(r.estado).toBe('FAIL');
  });

  test('un fallo detiene el escenario: los pasos siguientes quedan NOT_RUN', async () => {
    const r = await ejecutarEscenario(esc, deps({ nuevo_caso: async () => { throw new Error('No se encontró el proceso'); } }), crearContexto(reg, ENV, 'u'));
    expect(r.estado).toBe('FAIL');
    expect(r.pasos[1].estado).toBe('FAIL');
    expect(r.pasos.slice(2).every((p) => p.estado === 'NOT_RUN')).toBe(true);
  });

  test('una verificación fallida convierte el paso en FAIL', async () => {
    const r = await ejecutarEscenario(esc, deps({}, false), crearContexto(reg, ENV, 'u'));
    expect(r.estado).toBe('FAIL');
    expect(r.pasos.find((p) => p.estado === 'FAIL')?.matriz).toEqual([2, 3]); // primer paso con "verificar"
  });

  test('secretos (clave, usuario, datos SISE) nunca salen en el detalle del reporte', async () => {
    const r = await ejecutarEscenario(esc, deps({
      diligenciar: async () => { throw new Error('fill("998877665") falló; login usuario.ficticio/ClaveSecreta#1'); },
    }), crearContexto(reg, ENV, 'u'));
    const json = JSON.stringify(r);
    for (const s of ['998877665', 'ClaveSecreta#1', 'usuario.ficticio']) expect(json).not.toContain(s); // incluye el usuario sin "domain\"
    expect(json).toContain('«oculto»');
    expect(sanitizar('abc ClaveSecreta#1 xyz', ['ClaveSecreta#1'])).toBe('abc «oculto» xyz');
  });

  test('un paso con "requiere" y datos faltantes queda BLOCKED sin ejecutarse, el resto continúa y el CP no es verde', async () => {
    const conRequiere: EscenarioSde = {
      ...esc,
      pasos: esc.pasos.map((p) => (p.hacer === 'integracion' ? { ...p, requiere: ['TOMADOR-EXISTENTE'] } : p)),
    };
    const d = deps();
    const r = await ejecutarEscenario(conRequiere, d, crearContexto(reg, ENV, 'u'));
    const bloqueado = r.pasos.find((p) => p.hacer === 'integracion')!;
    expect(bloqueado.estado).toBe('BLOCKED');
    expect(bloqueado.detalle).toContain('SDE_TOMADOR_EXISTENTE_NUM');
    expect(d.llamadas).toContain('verificar_ruta'); // los demás pasos sí corrieron
    expect(r.estado).toBe('BLOCKED');
    expect(r.motivo).toMatch(/caso 4321/);
  });

  test('los valores de configuración y listas paramétricas se muestran; los sensibles no', async () => {
    const r = await ejecutarEscenario(esc, deps(), crearContexto(reg, ENV, 'u'));
    const json = JSON.stringify(r);
    expect(json).not.toContain('998877665');           // criterio_valor (sensible)
    expect(crearContexto(reg, ENV, 'u').secretos).not.toContain('Proceso ficticio'); // config pública
  });

  test('los casos creados se registran en el HistorialCasos compartido (modo portal, con CP y política de cleanup)', async ({}, testInfo) => {
    const dir = testInfo.outputPath('raiz');
    await registrarCasoCreado({ cp: 'HU06-CP05', numero: '4321', actor: 'intermediario', unico: 'u1', cleanup: 'CLEANUP_NOT_APPLICABLE' }, dir);
    const casos = await new HistorialCasos({ proyecto: 'seguros-del-estado', directorioBase: dir }).listar();
    expect(casos).toEqual([expect.objectContaining({
      numeroCaso: '4321', modoCreacion: 'portal', escenario: 'HU06-CP05 [intermediario] u1 CLEANUP_NOT_APPLICABLE',
    })]);
  });

  test('un escenario solo puede referirse a pasos existentes: la cobertura no inventa pasos', async () => {
    const r = await ejecutarEscenario(esc as EscenarioSde, deps(), crearContexto(reg, ENV, 'u'));
    expect(r.matriz.map((m) => m.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
