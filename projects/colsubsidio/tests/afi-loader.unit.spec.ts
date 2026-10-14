import { test, expect, type TestInfo } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { actorDesdeEntorno } from '../data/afi/actores';
import { CapabilityGapError, DefinicionCasoAfiError, compilarCasoAfi, diagnosticoCasoCompilado } from '../data/afi/caso';
import { CP04_EMPRESA, CP04_FACULTATIVO } from '../data/afi/casos/hu14-12-cp04';
import { CargaCasoAfiError, cargarDefinicionCasoAfi, resumenCompilacion, resumenError, resumenValidacion } from '../data/afi/loader';
import { CasoAfiNoEjecutableError, preflightCasoAfi } from '../helpers/afiCaseRunner';

/** Fase 3D: loader de *.afi.json, harness y CLI. Fixtures temporales con valores ficticios. */

const RAIZ = resolve(__dirname, '../../..');
const GOLDEN = resolve(__dirname, '../data/afi/examples/cp04-empresa.afi.json');
const TELEFONOS = { AFI_CP01_NUM_CEL: '3000000000', AFI_CP01_NUM_CEL_FIJO: '6010000000' };
const ENTORNOS = {
  empresa: { AFI_QA_EMPRESA_IDENTIFICACION: '900000001', AFI_QA_CORREO: 'empresa.qa@example.test' },
  pensionado: { AFI_QA_PENSIONADO_IDENTIFICACION: '1000000002', AFI_QA_CORREO: 'pensionado.qa@example.test', ...TELEFONOS },
  facultativo: {
    AFI_QA_FACULTATIVO_IDENTIFICACION: '1000000003', AFI_QA_CORREO: 'facultativo.qa@example.test', ...TELEFONOS,
    AFI_QA_FACULTATIVO_NACIONALIDAD: 'Colombiana', AFI_QA_FACULTATIVO_ESTADO_CIVIL: 'Soltero(a)',
    AFI_QA_FACULTATIVO_FONDO_PENSIONES: 'Fondo QA', AFI_QA_FACULTATIVO_SALARIO_BASICO: '1500000',
  },
};
const PII = /900000001|100000000[23]|@example\.test|3000000000|6010000000|Colombiana|Soltero|Fondo QA|1500000/;

const clon = (): Record<string, any> => JSON.parse(JSON.stringify(CP04_EMPRESA)); // eslint-disable-line @typescript-eslint/no-explicit-any
/** Escribe un fixture temporal (sin PII real) en la carpeta del test. */
async function fixture(info: TestInfo, nombre: string, contenido: unknown): Promise<string> {
  const ruta = info.outputPath(nombre);
  await mkdir(resolve(ruta, '..'), { recursive: true });
  await writeFile(ruta, typeof contenido === 'string' ? contenido : JSON.stringify(contenido), 'utf8');
  return ruta;
}
const falla = async (p: Promise<unknown>) => p.then(() => { throw new Error('no falló'); }, (e: Error) => e);

test.describe('cargarDefinicionCasoAfi', () => {
  test('golden cp04-empresa.afi.json: carga como unknown, valida y equivale al golden TypeScript', async () => {
    const definicion = await cargarDefinicionCasoAfi(GOLDEN);
    expect(definicion).toEqual(CP04_EMPRESA);
    // Equivalencia crítica: mismo actor -> mismo compilado (diagnóstico profundo).
    const actor = actorDesdeEntorno('empresa', ENTORNOS.empresa);
    const desdeArchivo = compilarCasoAfi(definicion, actor), desdeTs = compilarCasoAfi(CP04_EMPRESA, actor);
    expect(diagnosticoCasoCompilado(desdeArchivo)).toEqual(diagnosticoCasoCompilado(desdeTs));
    for (const etapa of desdeTs.preparacion.orden) {
      const crudo = (c: typeof desdeTs) => c.preparacion.etapas[etapa]!.resoluciones.map(r => [r.campo, r.origen, r.valor, r.estrategia]);
      expect(crudo(desdeArchivo)).toEqual(crudo(desdeTs));
    }
    expect(() => preflightCasoAfi(desdeArchivo)).not.toThrow();
  });

  test('round-trip físico: archivo escrito fuera del código -> cargar -> compilar -> resumen seguro', async ({}, info) => { // eslint-disable-line no-empty-pattern
    const ruta = await fixture(info, 'externo/facultativo.afi.json', JSON.stringify(CP04_FACULTATIVO, null, 2));
    const compilado = compilarCasoAfi(await cargarDefinicionCasoAfi(ruta), actorDesdeEntorno('facultativo', ENTORNOS.facultativo));
    const resumen = resumenCompilacion(compilado);
    expect(resumen.datos).toMatchObject({
      modo: 'compilar', ok: true, ejecutable: true, perfil: 'facultativo', gaps: [],
      preparacion: [
        { etapa: 'inicio-solicitud', resoluciones: 8, requerida: true, gaps: 0 },
        { etapa: 'telefonos', resoluciones: 2, requerida: true, gaps: 0 },
        { etapa: 'informacion-adicional', resoluciones: 4, requerida: true, gaps: 0 },
      ],
      funcional: [{ id: 'P04', operaciones: 2 }, { id: 'P05', operaciones: 2 }, { id: 'P06', operaciones: 3 }],
    });
    expect(JSON.stringify(resumen)).not.toMatch(PII);
    // BOM de editores Windows admitido.
    const conBom = await fixture(info, 'bom.afi.json', `﻿${JSON.stringify(CP04_EMPRESA)}`);
    expect(await cargarDefinicionCasoAfi(conBom)).toEqual(CP04_EMPRESA);
  });

  test('1-3. inexistente, extensión incorrecta y JSON inválido (sin citar contenido)', async ({}, info) => { // eslint-disable-line no-empty-pattern
    const inexistente = await falla(cargarDefinicionCasoAfi(info.outputPath('no-existe.afi.json')));
    expect([inexistente.constructor, (inexistente as CargaCasoAfiError).motivo]).toEqual([CargaCasoAfiError, 'no-existe']);
    const txt = await fixture(info, 'caso.json', CP04_EMPRESA);
    expect(await falla(cargarDefinicionCasoAfi(txt))).toMatchObject({ motivo: 'extension' });
    const roto = await fixture(info, 'roto.afi.json', '{"hu": "dato-secreto-777", "caso": ');
    const error = await falla(cargarDefinicionCasoAfi(roto)) as CargaCasoAfiError;
    expect(error.motivo).toBe('json-invalido');
    expect(error.message).toMatch(/^No se pudo cargar "roto\.afi\.json" \(json-invalido\): el contenido no es JSON válido/);
    expect(error.message).not.toContain('secreto');
    const carpeta = info.outputPath('carpeta.afi.json');
    await mkdir(carpeta, { recursive: true });
    expect(await falla(cargarDefinicionCasoAfi(carpeta))).toMatchObject({ motivo: 'no-es-archivo' });
  });

  test('solo rutas locales: URLs, data: y patrones se rechazan', async () => {
    for (const ruta of ['https://x.test/a.afi.json', 'http://x.test/a.afi.json', 'data:application/json,{}.afi.json', 'file:///c/a.afi.json', 'casos/*.afi.json']) {
      expect(await falla(cargarDefinicionCasoAfi(ruta)), ruta).toMatchObject({ motivo: 'ruta-no-local' });
    }
  });

  test('4-7. versión, selector extra, PII literal -> DefinicionCasoAfiError; capability desconocida -> CapabilityGapError', async ({}, info) => { // eslint-disable-line no-empty-pattern
    const casos: [string, (d: Record<string, any>) => void, Function][] = [ // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
      ['version', d => { d.version = 2; }, DefinicionCasoAfiError],
      ['selector', d => { d.preparacion.selector = '#btn'; }, DefinicionCasoAfiError],
      ['pii', d => { d.preparacion.datosCaso.correo = 'alguien@example.test'; }, DefinicionCasoAfiError],
      ['capability', d => { d.funcional.pasos[0].operaciones.push({ tipo: 'hover-tooltip', campo: 'departamento' }); }, CapabilityGapError],
    ];
    for (const [nombre, mutar, clase] of casos) {
      const d = clon(); mutar(d);
      const error = await falla(cargarDefinicionCasoAfi(await fixture(info, `${nombre}.afi.json`, d)));
      expect(error, nombre).toBeInstanceOf(clase);
      expect(error.message, nombre).not.toContain('alguien@example.test');
    }
  });

  test('8-9. DataGap al compilar y actor que no puede materializarse: ejecutable=false y preflight rechaza', async ({}, info) => { // eslint-disable-line no-empty-pattern
    const pensionado = await cargarDefinicionCasoAfi(await fixture(info, 'pensionado.afi.json', { ...clon(), nombre: 'X Pensionado', perfil: 'pensionado',
      preparacion: { ...clon().preparacion, datosCaso: { tipoAportante: 'Pensionado' } } }));
    const sinCelular = compilarCasoAfi(pensionado, actorDesdeEntorno('pensionado', { ...ENTORNOS.pensionado, AFI_CP01_NUM_CEL: '' }));
    expect(resumenCompilacion(sinCelular).datos).toMatchObject({ ok: false, ejecutable: false, gaps: [{ etapa: 'telefonos', campo: 'numeroCelular', motivo: 'sin-fuente-segura' }] });
    expect(() => preflightCasoAfi(sinCelular)).toThrow(CasoAfiNoEjecutableError);
    // Perfil válido en el contrato, pero el entorno no tiene su actor: todo gap, nunca se inventa.
    const independiente = await cargarDefinicionCasoAfi(await fixture(info, 'independiente.afi.json', { ...clon(), nombre: 'X Independiente', perfil: 'independiente',
      preparacion: { datosCaso: {}, camposAsercion: [], etapas: ['inicio-solicitud'] } }));
    const vacio = compilarCasoAfi(independiente, actorDesdeEntorno('independiente', {}));
    expect(vacio.ejecutable).toBe(false);
    expect(vacio.preparacion.gaps.map(g => g.campo)).toEqual(expect.arrayContaining(['tipoAportante', 'numeroIdentificacion', 'correo']));
    expect(resumenCompilacion(vacio).texto).toContain('Gaps:\n  inicio-solicitud.tipoAportante: sin-fuente-segura');
  });

  test('resúmenes: validar no toca el actor; error resumido de forma segura', () => {
    expect(resumenValidacion(CP04_EMPRESA).texto).toBe(['VALIDO', 'version=1', 'hu=AFI HU 14.12', 'caso=228503', 'nombre=CP04 Empresa', 'perfil=empresa',
      'etapas=3 (inicio-solicitud, telefonos, informacion-adicional)', 'pasosFuncionales=3 (P04, P05, P06)'].join('\n'));
    const e = new DefinicionCasoAfiError([{ ruta: 'version', clase: 'contrato', mensaje: 'versión no soportada' }]);
    expect(resumenError('validar', e)).toEqual({
      texto: 'INVALIDO (DefinicionCasoAfiError)\nDefinición de caso AFI inválida:\n- version: versión no soportada',
      datos: { modo: 'validar', ok: false, error: { tipo: 'DefinicionCasoAfiError', mensaje: e.message } },
    });
  });
});

// ---------------- CLI real (proceso aparte: node tools/afi.mjs) ----------------
function afi(...args: string[]) {
  // Sin variables de control heredadas: el CLI las fija.
  const { AFI_CASE_FILE: _a, AFI_CASE_MODE: _b, AFI_CASE_OUTPUT: _c, ...env } = process.env;
  const r = spawnSync(process.execPath, [resolve(RAIZ, 'tools/afi.mjs'), ...args], { cwd: RAIZ, encoding: 'utf8', env, timeout: 180_000 });
  return { codigo: r.status, salida: r.stdout, error: r.stderr };
}
/** Valores sensibles REALES del entorno del proyecto: nunca deben salir por el CLI. */
const sensibles = () => Object.entries(process.env)
  .filter(([k, v]) => v && v.trim().length >= 4 && /PASSWORD|CLAVE|TOKEN|USUARIO|CORREO|IDENTIFICACION|NUM_CEL|IBC|INGRESO|ACTIVIDAD|FACULTATIVO_/i.test(k))
  .map(([, v]) => v!.trim());

test.describe('tools/afi.mjs', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);

  test('10. validar golden: VALIDO, exit 0 (el harness no puede abrir navegador)', async () => {
    const r = afi('colsubsidio', 'validar', GOLDEN);
    expect(r.codigo, r.error).toBe(0);
    expect(r.salida.trim()).toBe(resumenValidacion(CP04_EMPRESA).texto);
  });

  test('11. compilar golden --json: ok, ejecutable, sin PII del entorno real, exit 0', async () => {
    const r = afi('colsubsidio', 'compilar', GOLDEN, '--json');
    expect(r.codigo, r.error).toBe(0);
    const datos = JSON.parse(r.salida);
    expect(datos).toMatchObject({ modo: 'compilar', ok: true, ejecutable: true, perfil: 'empresa', metadata: { caso: '228503', nombre: 'CP04 Empresa' } });
    for (const valor of sensibles()) expect(r.salida.includes(valor)).toBe(false);
  });

  test('archivo inválido: exit != 0 con el tipo de error; argumentos inválidos no lanzan Playwright', async ({}, info) => { // eslint-disable-line no-empty-pattern
    const d = clon(); d.selector = '#btn';
    const r = afi('colsubsidio', 'validar', await fixture(info, 'selector.afi.json', d));
    expect(r.codigo).not.toBe(0);
    expect(r.salida).toMatch(/^INVALIDO \(DefinicionCasoAfiError\)\n.*- selector: propiedad no admitida por el contrato/s);
    for (const args of [['colsubsidio', 'borrar', GOLDEN], ['colsubsidio', 'validar', 'a.json'], ['colsubsidio', 'validar', 'https://x.test/a.afi.json'],
      ['colsubsidio', 'validar', 'no-existe.afi.json'], ['no-existe', 'validar', GOLDEN], ['colsubsidio', 'validar', GOLDEN, 'otro.afi.json']]) {
      expect(afi(...args).codigo, args.join(' ')).toBe(2);
    }
  });
});

// ---------------- Frontera ----------------
test('el harness es genérico y validar/compilar no piden navegador; el CLI no interpreta el contrato', async () => {
  const quitar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const harness = quitar(await readFile(resolve(__dirname, 'afi-case-file.spec.ts'), 'utf8'));
  expect(harness).not.toMatch(/CP04|228503|PLAN_FUNCIONAL_CP04|DEFINICIONES_CP04|Empresa|Pensionado|Facultativo/);
  expect(harness).toMatch(/sinNavegador\('afi-case-file validar', async \(\) =>/);
  expect(harness).toMatch(/sinNavegador\('afi-case-file compilar', async \(\) =>/);
  const cli = quitar(await readFile(resolve(RAIZ, 'tools/afi.mjs'), 'utf8'));
  expect(cli).not.toMatch(/datosCaso|camposAsercion|preparacion|funcional|perfil|caso\.ts|compilarCasoAfi/);
  expect(cli.match(/JSON\.parse\(/g)).toHaveLength(1); // solo el resumen emitido por el harness
});
