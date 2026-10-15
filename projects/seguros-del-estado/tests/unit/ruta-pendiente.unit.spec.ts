import { test, expect } from '@playwright/test';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro } from '../../sde/datos';
import { cargarEscenario, DIR_ESCENARIOS, listarEscenarios } from '../../sde/escenario';
import { crearContexto, ejecutarEscenario, type Capacidad } from '../../sde/ejecutor';
import { cargarPresentacion } from '../../sde/presentacion';

/**
 * P-18 (corrección de Work, PR #4): una ruta solo OBSERVADA en QA nunca obtiene aprobación funcional. Sin QA ni navegador:
 * capacidades simuladas que "llegan" a la actividad observada.
 */
const reg = cargarRegistro();
const ENV = {
  BIZAGI_BASE_URL: 'https://x.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c', SDE_PROCESO_RADICACION: 'p',
  SDE_PROCESO_CATEGORIA: 'c', SDE_RUTA_LINEA: 'l', SDE_RUTA_RAMO: 'r', SDE_RUTA_MOVIMIENTO: 'm', SDE_SUCURSAL: 's',
  SDE_RUTA_FORMA_CONSULTA: 'f', SDE_RUTA_CRITERIO_CAMPO: 'c', SDE_RUTA_CRITERIO_VALOR: '999',
};
const RUTA_CP05 = resolve(DIR_ESCENARIOS, '1-hu06-cp05.yaml');
const ok: Capacidad = async () => ({});
const caps: Record<string, Capacidad> = {
  iniciar_sesion: async (p, c) => { c.sesiones.add(p.actor as string); }, nuevo_caso: ok, diligenciar: ok, verificar: ok,
  pulsar: async (_p, c) => { c.numeroCaso = '630'; return {}; },
  // La capacidad "llega" a una actividad observada (como el caso 630): observación técnica, no veredicto funcional.
  verificar_ruta: async () => ({ estado: 'PASS', detalle: 'Caso 630: Bizagi lista como actividad actual "Consultar información de solicitud"' }),
};

/** Copia escenarios/ (con _bloques) a un directorio temporal para validar variantes sin tocar el repositorio. */
function copiaTemporal(dir: string, nombre: string, contenido: string): string {
  mkdirSync(dir, { recursive: true });
  cpSync(resolve(DIR_ESCENARIOS, '_bloques'), resolve(dir, '_bloques'), { recursive: true });
  writeFileSync(resolve(dir, nombre), contenido);
  return resolve(dir, nombre);
}

test.describe('P-18 — una ruta pendiente de definición nunca se aprueba @unit', () => {
  test('el catálogo declara RUTA-CONSULTA-UNITARIA pendiente (Daniel/Karen) con las actividades solo observadas', () => {
    const e = cargarPresentacion().expectativas['RUTA-CONSULTA-UNITARIA'];
    expect(e).toMatchObject({ estado: 'pendiente_definicion', actividades_observadas: ['Consultar información de solicitud', 'Consultar SISE'] });
    expect(e.estado === 'pendiente_definicion' && e.responsable).toMatch(/Daniel.*Karen.*P-18/);
  });

  test('HU06-CP05: aunque la ruta llegue a la actividad observada, P8 queda NOT_AUTOMATED y el CP nunca es REAL_PASS', async () => {
    const r = await ejecutarEscenario(cargarEscenario(RUTA_CP05, reg), { capacidades: caps, verificar: async () => ({ ok: true, detalle: '' }), evidencia: async () => undefined }, crearContexto(reg, ENV, 'u'));
    const p8 = r.pasos.find((p) => p.hacer === 'verificar_ruta')!;
    expect(p8).toMatchObject({ estado: 'NOT_AUTOMATED', causa: 'NO_AUTOMATIZADO' });
    expect(p8.detalle).toContain('Consultar información de solicitud'); // la observación técnica se conserva
    expect(p8.detalle).toMatch(/RUTA-CONSULTA-UNITARIA PENDIENTE DE DEFINICIÓN/);
    expect(r.estado).not.toBe('REAL_PASS');
    expect(r.estado).toBe('REAL_PASS_PARCIAL');
  });

  test('una variante que acepta un nombre observado SIN declarar la expectativa pendiente se rechaza al cargar', ({}, testInfo) => {
    const original = readFileSync(RUTA_CP05, 'utf8');
    const sinExpectativa = original.replace(/\r?\n {4}verificar:\r?\n {6}- expectativa: RUTA-CONSULTA-UNITARIA/, '');
    expect(sinExpectativa).not.toBe(original);
    const ruta = copiaTemporal(testInfo.outputPath('esc'), '1-hu06-cp05.yaml', sinExpectativa);
    expect(() => cargarEscenario(ruta, reg)).toThrow(/solo OBSERVADAS en QA.*Consultar información de solicitud.*RUTA-CONSULTA-UNITARIA/s);
    // También con un solo nombre observado, en otra capitalización.
    const soloSise = sinExpectativa.replace(/llega_a: \[[^\]]*\]/, 'llega_a: consultar sise');
    expect(() => cargarEscenario(copiaTemporal(testInfo.outputPath('esc2'), '1-hu06-cp05.yaml', soloSise), reg)).toThrow(/Consultar SISE/);
  });

  test('ningún escenario ni variante del repositorio llega a una actividad observada sin la expectativa pendiente', () => {
    const variantes = resolve(DIR_ESCENARIOS, '_variantes');
    const rutas = [...listarEscenarios(), ...readdirSync(variantes).filter((f) => f.endsWith('.yaml')).map((f) => resolve(variantes, f))];
    expect(rutas.length).toBeGreaterThan(13);
    for (const r of rutas) expect(() => cargarEscenario(r, reg), r).not.toThrow();
  });
});
