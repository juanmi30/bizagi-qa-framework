import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { actorDesdeEntorno } from '../data/afi/actores';
import { CapabilityGapError, compilarCasoAfi, type CasoAfiCompilado, type DefinicionCasoAfi } from '../data/afi/caso';
import { CapabilityGapPreparacionError, problemasCapacidadPreparacion } from '../data/afi/capacidadesPreparacion';
import { CP04_EMPRESA, CP04_FACULTATIVO, CP04_PENSIONADO, DEFINICIONES_CP04 } from '../data/afi/casos/hu14-12-cp04';
import type { PasoFuncionalAfi, ResultadoOperacionAfi } from '../data/afi/funcional';
import type { EtapaAfi } from '../data/afi/modelo';
import { resolverEtapa, type PlanPreparacion } from '../data/afi/resolver';
import {
  CasoAfiNoEjecutableError, EtapaPreparacionNoAlcanzadaError, InformacionContactoNoAlcanzadaError, ejecutarCasoAfi, preflightCasoAfi,
  type ColaboradoresAfi, type EstadoEtapaPreparacion, type EventoTecnicoAfi, type ResultadoCasoAfi,
} from '../helpers/afiCaseRunner';
import { AfiDataUi } from '../helpers/afiDataUi';
import type { AfiliacionesPortal } from '../helpers/afiliacionesPortal';

/** Fase 3B: capabilities puras de preparación, preflight y runner AFI v1 con colaboradores simulados. */

const TELEFONOS = { AFI_CP01_NUM_CEL: '3000000000', AFI_CP01_NUM_CEL_FIJO: '6010000000' };
const ENTORNOS = {
  empresa: { AFI_QA_EMPRESA_IDENTIFICACION: '900000001', AFI_QA_CORREO: 'empresa.qa@example.test' },
  pensionado: { AFI_QA_PENSIONADO_IDENTIFICACION: '1000000002', AFI_QA_CORREO: 'pensionado.qa@example.test', ...TELEFONOS },
  facultativo: {
    AFI_QA_FACULTATIVO_IDENTIFICACION: '1000000003', AFI_QA_CORREO: 'facultativo.qa@example.test', ...TELEFONOS,
    AFI_QA_FACULTATIVO_NACIONALIDAD: 'Colombiana', AFI_QA_FACULTATIVO_ESTADO_CIVIL: 'Soltero(a)',
    AFI_QA_FACULTATIVO_FONDO_PENSIONES: 'Fondo QA', AFI_QA_FACULTATIVO_SALARIO_BASICO: '1500000',
  },
} as const;
type Perfil = keyof typeof ENTORNOS;
const PII = /900000001|100000000[23]|@example\.test|3000000000|6010000000|Colombiana|Soltero|Fondo QA|1500000/;
const actor = (perfil: Perfil, entorno: Record<string, string> = ENTORNOS[perfil]) => actorDesdeEntorno(perfil, entorno);
const compilar = (def: DefinicionCasoAfi, entorno?: Record<string, string>) => compilarCasoAfi(def, actor(def.perfil as Perfil, entorno));
const sin = (entorno: Record<string, string>, clave: string) => Object.fromEntries(Object.entries(entorno).filter(([k]) => k !== clave));
const conEtapas = (def: DefinicionCasoAfi, etapas: EtapaAfi[]): DefinicionCasoAfi => ({ ...def, preparacion: { ...def.preparacion, etapas } });
const lanza = async (p: Promise<unknown> | (() => unknown)) => {
  try { await (typeof p === 'function' ? p() : p); } catch (e) { return e as Error; }
  throw new Error('no lanzó');
};

// ---------------- A. Capabilities puras ----------------
test.describe('A. capabilities puras de preparación', () => {
  test('1-3. planes CP04 (inicio, teléfonos, información adicional concreta) son materializables', () => {
    for (const def of DEFINICIONES_CP04) {
      const c = compilar(def);
      for (const etapa of c.preparacion.orden) expect(problemasCapacidadPreparacion(etapa, c.preparacion.etapas[etapa]!), `${def.nombre} ${etapa}`).toEqual([]);
    }
    expect(compilar(CP04_FACULTATIVO).preparacion.etapas['informacion-adicional']!.resoluciones.map(r => r.campo))
      .toEqual(['fondoPensiones', 'nacionalidad', 'estadoCivil', 'salarioBasico']);
  });

  test('4. estrategia auxiliar no materializable (nacionalidad first-valid-option) -> CapabilityGap de preparación al compilar (no DataGap)', () => {
    const plan = resolverEtapa('informacion-adicional', { actor: actor('facultativo', sin(ENTORNOS.facultativo, 'AFI_QA_FACULTATIVO_NACIONALIDAD')) });
    expect(plan.gaps).toEqual([]);
    expect(problemasCapacidadPreparacion('informacion-adicional', plan)).toEqual([{
      ruta: 'informacion-adicional.nacionalidad', clase: 'capability',
      mensaje: 'El driver de informacion-adicional no puede ejecutar "nacionalidad": estrategia first-valid-option no soportado para select.',
    }]);
    // 4E.1: el fondo sin valor del actor ya es materializable (first-valid-autocomplete).
    expect(compilar(CP04_FACULTATIVO, sin(ENTORNOS.facultativo, 'AFI_QA_FACULTATIVO_FONDO_PENSIONES')).ejecutable).toBe(true);
    const error = (() => { try { compilar(CP04_FACULTATIVO, sin(ENTORNOS.facultativo, 'AFI_QA_FACULTATIVO_NACIONALIDAD')); } catch (e) { return e as Error; } })();
    expect(error).toBeInstanceOf(CapabilityGapPreparacionError);
    expect(error).toBeInstanceOf(CapabilityGapError); // sigue siendo un capability gap...
    expect(error!.name).toBe('CapabilityGapPreparacionError'); // ...distinguible del funcional.
    expect(error!.message).toMatch(/^CapabilityGap de preparación AFI:\n- informacion-adicional\.nacionalidad: /);
  });

  test('5. AfiDataUi.validarPlan usa la misma fuente pura', async () => {
    const plan = resolverEtapa('informacion-adicional', { actor: actor('facultativo', sin(ENTORNOS.facultativo, 'AFI_QA_FACULTATIVO_NACIONALIDAD')) });
    const driver = new AfiDataUi({} as AfiliacionesPortal);
    expect(() => driver.validarPlan('informacion-adicional', plan)).toThrow(CapabilityGapPreparacionError);
    const fuente = (await readFile(resolve(__dirname, '../helpers/afiDataUi.ts'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(fuente).toMatch(/exigirCapacidadesPreparacion\(etapa, plan\)/);
    expect(fuente).toMatch(/materializar\(/);
    // La decisión (qué admite cada control) no vive en el driver.
    expect(fuente).not.toMatch(/admite|no soportado para|first-valid-option|deterministic-|boolean-required/);
  });
});

// ---------------- B. Preflight ----------------
test.describe('B. preflight antes de UI', () => {
  /** Colaboradores espía: si se invoca, el runner ya habría abierto páginas. */
  const espia = () => { const s = { llamado: 0 }; return { s, fabrica: async (): Promise<ColaboradoresAfi> => { s.llamado++; throw new Error('no debía crear colaboradores'); } }; };

  test('6. compilado con DataGap: falla sin páginas, navegación ni colaboradores', async ({ page, context }, info) => {
    const c = compilar(CP04_PENSIONADO, sin(ENTORNOS.pensionado, 'AFI_CP01_NUM_CEL'));
    expect(c.ejecutable).toBe(false);
    const { s, fabrica } = espia();
    const paginas = context.pages().length;
    const error = await lanza(ejecutarCasoAfi(c, { page, context, testInfo: info, colaboradores: fabrica }));
    expect(error).toBeInstanceOf(CasoAfiNoEjecutableError);
    expect(error.message).toBe('El caso "CP04 Pensionado" no es ejecutable; faltan datos:\n- telefonos.numeroCelular: sin-fuente-segura');
    expect([s.llamado, context.pages().length, page.url()]).toEqual([0, paginas, 'about:blank']);
  });

  test('7. etapa no orquestable por el runner v1 -> CapabilityGap antes de UI', async ({ page, context }, info) => {
    // Una etapa sin campos para el perfil compila ejecutable, pero el runner v1 no la sabe orquestar.
    const { s, fabrica } = espia();
    const sinCampos = compilar(conEtapas(CP04_PENSIONADO, ['inicio-solicitud', 'telefonos', 'direccion']));
    expect(sinCampos.ejecutable).toBe(true);
    const error = await lanza(ejecutarCasoAfi(sinCampos, { page, context, testInfo: info, colaboradores: fabrica }));
    expect(error).toBeInstanceOf(CapabilityGapPreparacionError);
    expect(error.message).toContain('El runner AFI v1 no sabe orquestar la etapa "direccion".');
    // Empresa SÍ tiene campos de dirección (política Dirección PJ): como etapa del runner v1 es un CapabilityGap ya al compilar
    // (la dirección solo la atraviesa la ruta derivada de Knowledge).
    expect(() => compilar(conEtapas(CP04_EMPRESA, ['inicio-solicitud', 'direccion']))).toThrow(CapabilityGapPreparacionError);
    // Sin inicio-solicitud no hay forma demostrada de crear el caso.
    // (datosCaso vacío: el contrato ya rechaza tipoAportante si su etapa no está declarada.)
    const soloTelefonos: DefinicionCasoAfi = { ...CP04_PENSIONADO, preparacion: { datosCaso: {}, camposAsercion: [], etapas: ['telefonos'] } };
    expect(() => preflightCasoAfi(compilar(soloTelefonos))).toThrow('requiere "inicio-solicitud"');
    // informacion-contacto sí tiene resoluciones que AfiDataUi no materializa: falla ya al compilar.
    expect(() => compilar(conEtapas(CP04_EMPRESA, ['inicio-solicitud', 'informacion-contacto']))).toThrow(CapabilityGapPreparacionError);
    expect(s.llamado).toBe(0);
  });

  test('8. compilado adulterado o fabricado a mano se rechaza antes de UI', async ({ page, context }, info) => {
    const c = compilar(CP04_EMPRESA);
    expect(Object.isFrozen(c) && Object.isFrozen(c.preparacion.etapas) && Object.isFrozen(c.funcional.pasos)).toBe(true);
    expect(() => { (c as { ejecutable: boolean }).ejecutable = false; }).toThrow();
    const { s, fabrica } = espia();
    for (const falso of [{ ...c }, JSON.parse(JSON.stringify(c))] as CasoAfiCompilado[]) {
      const error = await lanza(ejecutarCasoAfi(falso, { page, context, testInfo: info, colaboradores: fabrica }));
      expect(error.message).toContain('solo acepta un CasoAfiCompilado producido por compilarCasoAfi');
    }
    expect(s.llamado).toBe(0);
  });

  test('9. el runner consume el compilado: no resuelve, no lee el entorno ni conoce el caso', async () => {
    const fuente = (await readFile(resolve(__dirname, '../helpers/afiCaseRunner.ts'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(fuente).not.toMatch(/resolverEtapa|resolverPreparacion|resolverCampo|actorDesdeEntorno|process\.env|PLAN_FUNCIONAL_CP04|CP04|228503|funcional\.caso/);
  });
});

// ---------------- C. Ejecución con DOM mínimo y colaboradores simulados ----------------
interface Pantalla { boton?: string }
/** Pantallas de preparación en secuencia; la última sin botón es Información de contacto. */
function portalHtml(pantallas: Pantalla[], retardo = 800): string {
  return `<div id="s"></div><script>(() => {
    const pantallas = ${JSON.stringify(pantallas)};
    const s = document.getElementById('s');
    window.clics = [];
    window.mostrar = k => {
      const p = pantallas[k];
      if (!p.boton) { s.innerHTML = '<h2>Información de contacto</h2>'; return; }
      s.innerHTML = '<p>Pantalla ' + k + '</p><input id="campo' + k + '"><button id="' + p.boton + '">Continuar</button>';
      document.getElementById(p.boton).onclick = () => { window.clics.push(p.boton); s.innerHTML = ''; setTimeout(() => window.mostrar(k + 1), ${retardo}); };
    };
  })();</script>`;
}

interface Registro { llamadas: string[]; planes: Record<string, PlanPreparacion>; pasos: string[]; cancelados: number; escenario?: string; cerrado: number }

interface Fallos {
  abrir?: boolean; paso?: string; cleanup?: boolean;
  /** La etapa cuyo completar() falla (p. ej. en su segundo campo). */
  etapa?: EtapaAfi;
  /** Ganchos para observar el estado del runner DURANTE completar() o el funcional. */
  alCompletar?: (etapa: EtapaAfi) => Promise<void>;
  alFuncional?: (paso: string) => Promise<void>;
  retardo?: number;
}

function simulados(page: Page, pantallas: Pantalla[], fallos: Fallos = {}) {
  const r: Registro = { llamadas: [], planes: {}, pasos: [], cancelados: 0, cerrado: 0 };
  const etapa = async (nombre: EtapaAfi, plan: PlanPreparacion) => {
    r.llamadas.push(nombre); r.planes[nombre] = plan;
    await fallos.alCompletar?.(nombre);
    if (fallos.etapa === nombre) throw new Error('fallo en el segundo campo');
    return [];
  };
  const colaboradores: ColaboradoresAfi = {
    portal: {
      abrir: async () => { if (fallos.abrir) throw new Error('Portal no disponible'); await page.setContent(portalHtml(pantallas, fallos.retardo)); r.llamadas.push('abrir'); },
      enviarUnaVez: async registrar => { await registrar('900123'); await page.evaluate(() => (window as unknown as { mostrar(k: number): void }).mostrar(0)); return '900123'; },
    },
    soporte: {
      login: async () => { r.llamadas.push('login'); },
      registrarCasoCreado: async (_numero, escenario) => { r.escenario = escenario; },
      emularReconocimiento: async () => { r.llamadas.push('emular'); },
      cancelarCasoCreado: async () => { r.cancelados++; if (fallos.cleanup) throw new Error('fallo cleanup'); },
    },
    datosUi: {
      completarInicioSolicitud: plan => etapa('inicio-solicitud', plan),
      completarTelefonos: plan => etapa('telefonos', plan),
      completarInformacionAdicional: plan => etapa('informacion-adicional', plan),
    },
    funcionalUi: {
      ejecutarPaso: async (paso: PasoFuncionalAfi, registrar?: (res: ResultadoOperacionAfi) => Promise<void>) => {
        r.pasos.push(paso.id);
        await fallos.alFuncional?.(paso.id);
        if (fallos.paso === paso.id) throw new Error('fallo funcional');
        const res: ResultadoOperacionAfi = { tipo: paso.operaciones[0].tipo, resultado: 'PASS', observado: {} };
        await registrar?.(res);
        return [res];
      },
    },
    cerrar: async () => { r.cerrado++; },
  };
  return { r, fabrica: async () => colaboradores };
}

async function adjunto(info: TestInfo, nombre: string): Promise<Record<string, unknown>> {
  const a = info.attachments.filter(x => x.name === nombre).at(-1);
  if (!a?.path) throw new Error(`sin adjunto ${nombre}`);
  return JSON.parse(await readFile(a.path, 'utf8'));
}

const HITOS = { apertura: { id: 'P02', esperado: 'Apertura' }, preparacion: { id: 'P03', esperado: 'Preparación' } };

test.describe('C. ejecución del runner', () => {
  test('10/13/14/18. orden de etapas, funcional desde el compilado, cleanup tras éxito y resultado sin PII', async ({ page, context }, info) => {
    const c = compilar(CP04_FACULTATIVO);
    const { r, fabrica } = simulados(page, [{ boton: 'btn-facultativo-continuar' }, { boton: 'btn-facultativo-info-ad-continuar' }, {}]);
    const resultado = await ejecutarCasoAfi(c, { page, context, testInfo: info, hitos: HITOS, colaboradores: fabrica });
    expect(r.llamadas).toEqual(['login', 'abrir', 'inicio-solicitud', 'telefonos', 'informacion-adicional']);
    // Los planes ejecutados son exactamente los del compilado (sin re-resolver).
    for (const etapa of c.preparacion.orden) expect(r.planes[etapa]).toBe(c.preparacion.etapas[etapa]);
    expect(r.pasos).toEqual(c.funcional.pasos.map(p => p.id));
    expect([r.cancelados, r.cerrado, r.escenario]).toEqual([1, 1, 'AFI HU 14.12 CP04 Facultativo']);
    expect(await page.evaluate(() => (window as unknown as { clics: string[] }).clics)).toEqual(['btn-facultativo-continuar', 'btn-facultativo-info-ad-continuar']);
    expect(resultado).toMatchObject({
      metadata: { hu: 'AFI HU 14.12', caso: '228503', nombre: 'CP04 Facultativo' }, perfil: 'facultativo', numeroCaso: '900123',
      resultado: 'PASS', reconocimiento: 'natural', cleanup: 'exitoso',
      pasosTecnicos: [{ id: 'P02', resultado: 'PASS' }, { id: 'P03', resultado: 'PASS' }],
      pasosFuncionales: c.funcional.pasos.map(p => ({ id: p.id, esperado: p.esperado, resultado: 'PASS' })),
    });
    expect(JSON.parse(JSON.stringify(resultado))).toEqual(resultado);
    const archivo = await adjunto(info, 'CP04-resultado.json');
    expect(JSON.stringify([resultado, archivo])).not.toMatch(PII);
    expect(archivo).toMatchObject({ caso: '228503', aportante: 'Facultativo', resultado: 'PASS', pasos: { P02: 'PASS', P03: 'PASS', P04: 'PASS', P05: 'PASS', P06: 'PASS' } });
    // Evidencias del piloto conservadas.
    const nombres = info.attachments.map(a => a.name);
    for (const n of ['CP04-plan-inicio.json', 'CP04-plan-telefonos.json', 'CP04-plan-informacion-adicional.json', 'CP04-plan-funcional.json',
      'CP04-ejecucion-funcional.json', 'caso-creado.json', 'Facultativo-preparacion-0.json', 'Facultativo-telefonos-completos-0.json']) expect(nombres).toContain(n);
    expect(JSON.stringify(await adjunto(info, 'CP04-plan-telefonos.json'))).not.toMatch(PII);
  });

  test('11. etapa sin resoluciones no se ejecuta, pero su pantalla se avanza', async ({ page, context }, info) => {
    const c = compilar(CP04_PENSIONADO);
    expect(c.preparacion.etapas['informacion-adicional']!.resoluciones).toEqual([]);
    const { r, fabrica } = simulados(page, [{ boton: 'btn-pensionado-continuar' }, { boton: 'btn-pensionado-info-ad-continuar' }, {}]);
    await ejecutarCasoAfi(c, { page, context, testInfo: info, colaboradores: fabrica });
    expect(r.llamadas).toEqual(['login', 'abrir', 'inicio-solicitud', 'telefonos']);
    expect(await page.evaluate(() => (window as unknown as { clics: string[] }).clics)).toEqual(['btn-pensionado-continuar', 'btn-pensionado-info-ad-continuar']);
  });

  test('12. una pantalla observada dos veces no repite su etapa', async ({ page, context }, info) => {
    const { r, fabrica } = simulados(page, [{ boton: 'btn-facultativo-continuar' }, { boton: 'btn-facultativo-continuar' }, { boton: 'btn-facultativo-info-ad-continuar' }, {}]);
    await ejecutarCasoAfi(compilar(CP04_FACULTATIVO), { page, context, testInfo: info, colaboradores: fabrica });
    expect(r.llamadas.filter(l => l === 'telefonos')).toHaveLength(1);
    expect(await page.evaluate(() => (window as unknown as { clics: string[] }).clics)).toHaveLength(3);
  });

  test('13b. el funcional ejecutado es el del compilado, no uno conocido por el runner', async ({ page, context }, info) => {
    const soloP05: DefinicionCasoAfi = { ...CP04_EMPRESA, funcional: { ...CP04_EMPRESA.funcional!, pasos: [CP04_EMPRESA.funcional!.pasos[1]] } };
    const { r, fabrica } = simulados(page, [{}]);
    await ejecutarCasoAfi(compilar(soloP05), { page, context, testInfo: info, colaboradores: fabrica });
    expect(r.pasos).toEqual(['P05']);
  });

  test('15. fallo funcional con caso creado: cleanup igual, error original y estado por paso', async ({ page, context }, info) => {
    const { r, fabrica } = simulados(page, [{}], { paso: 'P05' });
    const error = await lanza(ejecutarCasoAfi(compilar(CP04_EMPRESA), { page, context, testInfo: info, hitos: HITOS, colaboradores: fabrica }));
    expect(error.message).toBe('fallo funcional');
    expect([r.cancelados, r.cerrado]).toEqual([1, 1]);
    const archivo = await adjunto(info, 'CP04-resultado.json') as unknown as ResultadoCasoAfi & { pasos: Record<string, string> };
    expect(archivo).toMatchObject({ resultado: 'FAIL', cleanup: 'exitoso', error: 'fallo funcional', numeroCaso: '900123' });
    expect(archivo.pasos).toEqual({ P02: 'PASS', P03: 'PASS', P04: 'PASS', P05: 'FAIL' });
    expect(archivo.errorCleanup).toBeUndefined();
  });

  test('16. sin numeroCaso no se intenta cleanup', async ({ page, context }, info) => {
    const { r, fabrica } = simulados(page, [{}], { abrir: true });
    const error = await lanza(ejecutarCasoAfi(compilar(CP04_EMPRESA), { page, context, testInfo: info, hitos: HITOS, colaboradores: fabrica }));
    expect(error.message).toBe('Portal no disponible');
    expect([r.cancelados, r.cerrado]).toEqual([0, 1]);
    expect(await adjunto(info, 'CP04-resultado.json')).toMatchObject({ resultado: 'FAIL', cleanup: 'no aplica', pasos: { P02: 'FAIL' } });
  });

  test('17. si el cleanup también falla se conserva el error original y se registra errorCleanup', async ({ page, context }, info) => {
    const { r, fabrica } = simulados(page, [{}], { paso: 'P04', cleanup: true });
    const error = await lanza(ejecutarCasoAfi(compilar(CP04_EMPRESA), { page, context, testInfo: info, colaboradores: fabrica }));
    expect(error.message).toBe('fallo funcional');
    expect(r.cancelados).toBe(1);
    expect(await adjunto(info, 'CP04-resultado.json')).toMatchObject({ resultado: 'FAIL', cleanup: 'fallido', error: 'fallo funcional', errorCleanup: 'fallo cleanup' });
  });

  test('17b. solo falla el cleanup: la corrida falla con el error de cleanup', async ({ page, context }, info) => {
    const { fabrica } = simulados(page, [{}], { cleanup: true });
    const error = await lanza(ejecutarCasoAfi(compilar(CP04_EMPRESA), { page, context, testInfo: info, colaboradores: fabrica }));
    expect(error.message).toBe('fallo cleanup');
    expect(await adjunto(info, 'CP04-resultado.json')).toMatchObject({ resultado: 'FAIL', cleanup: 'fallido', errorCleanup: 'fallo cleanup' });
  });
});

// ---------------- 3C. Completitud de ejecución y traza técnica ----------------
type Traza = { eventos: EventoTecnicoAfi[]; etapasPreparacion: EstadoEtapaPreparacion[] };
/** Lee la traza tal como está EN ESTE MOMENTO en disco (se actualiza progresivamente). */
const trazaActual = async (info: TestInfo): Promise<Traza> => JSON.parse(await readFile(info.outputPath('CP04-traza-tecnica.json'), 'utf8'));
const etapaDe = (t: { etapasPreparacion: EstadoEtapaPreparacion[] }, etapa: EtapaAfi) => t.etapasPreparacion.find(e => e.etapa === etapa)!;
const resumen = (eventos: EventoTecnicoAfi[]) => eventos.map(e => [e.evento, e.estado, ...(e.etapa ? [e.etapa] : [])].join(' '));

test.describe('3C. completitud de preparación y traza técnica', () => {
  test('1/8/11/13/14/16. golden path: todas las requeridas aplicadas antes del funcional, traza completa, P02-P06 PASS', async ({ page, context }, info) => {
    const c = compilar(CP04_FACULTATIVO);
    let alEmpezarFuncional: Traza | undefined;
    const { fabrica } = simulados(page, [{ boton: 'btn-facultativo-continuar' }, { boton: 'btn-facultativo-info-ad-continuar' }, {}], {
      alFuncional: async paso => { if (paso === 'P04') alEmpezarFuncional = await trazaActual(info); },
    });
    const resultado = await ejecutarCasoAfi(c, { page, context, testInfo: info, hitos: HITOS, colaboradores: fabrica });
    // 8. Antes del primer paso funcional la completitud ya estaba verificada.
    expect(resumen(alEmpezarFuncional!.eventos).at(-1)).toBe('completitud-preparacion PASS');
    expect(alEmpezarFuncional!.etapasPreparacion.every(e => !e.requerida || e.aplicada)).toBe(true);
    expect(resumen(resultado.trazaTecnica)).toEqual([
      'login-soporte PASS', 'portal-abierto PASS', 'etapa-preparacion PASS inicio-solicitud', 'caso-creado PASS', 'reconocimiento-natural PASS',
      'etapa-preparacion PASS telefonos', 'transicion-preparacion PASS', 'etapa-preparacion PASS informacion-adicional', 'transicion-preparacion PASS',
      'informacion-contacto-alcanzada PASS', 'completitud-preparacion PASS', 'cleanup PASS',
    ]);
    expect(resultado.trazaTecnica.filter(e => e.evento === 'transicion-preparacion').map(e => e.detalle))
      .toEqual(['btn-facultativo-continuar', 'btn-facultativo-info-ad-continuar']);
    expect(resultado.etapasPreparacion).toEqual([
      { etapa: 'inicio-solicitud', declarada: true, resoluciones: c.preparacion.etapas['inicio-solicitud']!.resoluciones.length, requerida: true, aplicada: true, resultado: 'aplicada' },
      { etapa: 'informacion-empresa', declarada: false, resoluciones: 0, requerida: false, aplicada: false, resultado: 'no-declarada' },
      { etapa: 'telefonos', declarada: true, resoluciones: 2, requerida: true, aplicada: true, resultado: 'aplicada' },
      { etapa: 'informacion-adicional', declarada: true, resoluciones: 4, requerida: true, aplicada: true, resultado: 'aplicada' },
    ]);
    // 16. Compatibilidad del piloto.
    const archivo = await adjunto(info, 'CP04-resultado.json');
    expect(archivo.pasos).toEqual({ P02: 'PASS', P03: 'PASS', P04: 'PASS', P05: 'PASS', P06: 'PASS' });
    expect(archivo.trazaTecnica).toEqual(resultado.trazaTecnica);
    // 13-14. Serializable y sin PII (resultado, JSON y traza en disco).
    expect(JSON.parse(JSON.stringify(resultado))).toEqual(resultado);
    expect(JSON.stringify([resultado, archivo, await trazaActual(info)])).not.toMatch(PII);
    expect(info.attachments.map(a => a.name)).toContain('CP04-traza-tecnica.json');
  });

  test('2/9/15. etapa requerida que nunca aparece: EtapaPreparacionNoAlcanzadaError, sin funcional, con cleanup', async ({ page, context }, info) => {
    // El Portal salta de inicio directo a Información de contacto: teléfonos (2 resoluciones) nunca se aplica.
    const { r, fabrica } = simulados(page, [{}]);
    const error = await lanza(ejecutarCasoAfi(compilar(CP04_PENSIONADO), { page, context, testInfo: info, hitos: HITOS, colaboradores: fabrica }));
    expect(error).toBeInstanceOf(EtapaPreparacionNoAlcanzadaError);
    expect(error).not.toBeInstanceOf(CapabilityGapError);
    expect(error.message).toBe('No se completaron todas las etapas de preparación requeridas:\n'
      + '- telefonos: la etapa tenía 2 resolución(es) pero no fue observada/aplicada.');
    expect(r.pasos).toEqual([]); // 9. El funcional no empieza.
    expect(r.cancelados).toBe(1); // 15. Cleanup igual.
    const archivo = await adjunto(info, 'CP04-resultado.json') as unknown as ResultadoCasoAfi & { pasos: Record<string, string> };
    expect(archivo.pasos).toEqual({ P02: 'PASS', P03: 'FAIL' });
    expect(archivo.cleanup).toBe('exitoso');
    expect(etapaDe(archivo, 'telefonos')).toMatchObject({ requerida: true, aplicada: false, resultado: 'pendiente' });
    expect(resumen(archivo.trazaTecnica).slice(-4)).toEqual([
      'informacion-contacto-alcanzada PASS', 'completitud-preparacion PENDIENTE telefonos', 'completitud-preparacion FAIL', 'cleanup PASS',
    ]);
  });

  test('3. etapa vacía que nunca aparece: permitido', async ({ page, context }, info) => {
    const { r, fabrica } = simulados(page, [{ boton: 'btn-pensionado-continuar' }, {}]);
    const resultado = await ejecutarCasoAfi(compilar(CP04_PENSIONADO), { page, context, testInfo: info, colaboradores: fabrica });
    expect(r.llamadas).not.toContain('informacion-adicional');
    expect(etapaDe(resultado, 'informacion-adicional')).toEqual({
      etapa: 'informacion-adicional', declarada: true, resoluciones: 0, requerida: false, aplicada: false, resultado: 'no-requerida' });
  });

  test('4. etapa vacía que aparece: se avanza sin marcarla requerida ni aplicada', async ({ page, context }, info) => {
    const { fabrica } = simulados(page, [{ boton: 'btn-pensionado-continuar' }, { boton: 'btn-pensionado-info-ad-continuar' }, {}]);
    const resultado = await ejecutarCasoAfi(compilar(CP04_PENSIONADO), { page, context, testInfo: info, colaboradores: fabrica });
    expect(etapaDe(resultado, 'informacion-adicional')).toMatchObject({ requerida: false, aplicada: false, resultado: 'no-requerida' });
    expect(resultado.trazaTecnica.some(e => e.etapa === 'informacion-adicional')).toBe(false);
    expect(resultado.trazaTecnica.filter(e => e.evento === 'transicion-preparacion')).toHaveLength(2);
  });

  test('5/12. completar falla: aplicada=false, traza FAIL de la etapa, error original y cleanup', async ({ page, context }, info) => {
    const { r, fabrica } = simulados(page, [{ boton: 'btn-facultativo-continuar' }, {}], { etapa: 'telefonos' });
    const error = await lanza(ejecutarCasoAfi(compilar(CP04_FACULTATIVO), { page, context, testInfo: info, hitos: HITOS, colaboradores: fabrica }));
    expect(error.message).toBe('fallo en el segundo campo');
    expect(r.cancelados).toBe(1);
    const archivo = await adjunto(info, 'CP04-resultado.json') as unknown as ResultadoCasoAfi;
    expect(etapaDe(archivo, 'telefonos')).toMatchObject({ requerida: true, aplicada: false, resultado: 'fallida' });
    expect(archivo.trazaTecnica.find(e => e.etapa === 'telefonos')).toEqual({ evento: 'etapa-preparacion', etapa: 'telefonos', estado: 'FAIL', detalle: '2 resolución(es); Error' });
    expect(resumen(archivo.trazaTecnica).at(-1)).toBe('cleanup PASS');
    expect(r.pasos).toEqual([]);
  });

  test('6/7. una etapa se marca aplicada solo DESPUÉS de completar; inicio-solicitud ya aplicada', async ({ page, context }, info) => {
    const durante: Partial<Record<EtapaAfi, Traza>> = {};
    const { fabrica } = simulados(page, [{ boton: 'btn-facultativo-continuar' }, { boton: 'btn-facultativo-info-ad-continuar' }, {}], {
      alCompletar: async etapa => { if (etapa !== 'inicio-solicitud') durante[etapa] = await trazaActual(info); },
    });
    const resultado = await ejecutarCasoAfi(compilar(CP04_FACULTATIVO), { page, context, testInfo: info, colaboradores: fabrica });
    expect(etapaDe(durante.telefonos!, 'inicio-solicitud').aplicada).toBe(true);
    expect(etapaDe(durante.telefonos!, 'telefonos').aplicada).toBe(false);
    expect(etapaDe(durante['informacion-adicional']!, 'telefonos').aplicada).toBe(true);
    expect(etapaDe(durante['informacion-adicional']!, 'informacion-adicional').aplicada).toBe(false);
    expect(etapaDe(resultado, 'informacion-adicional').aplicada).toBe(true);
  });

  test('10. MAX_PANTALLAS agotado: error específico con transiciones, pendientes y botones públicos', async ({ page, context }, info) => {
    const pantallas = Array.from({ length: 10 }, (_, k) => ({ boton: `btn-otro-${k}` }));
    const { r, fabrica } = simulados(page, pantallas, { retardo: 100 });
    const error = await lanza(ejecutarCasoAfi(compilar(CP04_PENSIONADO), { page, context, testInfo: info, hitos: HITOS, colaboradores: fabrica }));
    expect(error).toBeInstanceOf(InformacionContactoNoAlcanzadaError);
    expect(error.message).toBe('No se alcanzó Información de contacto después de 8 transiciones de preparación. '
      + 'Etapas requeridas pendientes: telefonos. '
      + `Botones observados: ${Array.from({ length: 8 }, (_, k) => `btn-otro-${k}`).join(', ')}.`);
    expect([r.pasos, r.cancelados]).toEqual([[], 1]);
    const archivo = await adjunto(info, 'CP04-resultado.json') as unknown as ResultadoCasoAfi & { pasos: Record<string, string> };
    expect(archivo.pasos.P03).toBe('FAIL');
    expect(resumen(archivo.trazaTecnica)).toContain('informacion-contacto-alcanzada FAIL');
    // Evidencias actuales conservadas.
    expect(info.attachments.map(a => a.name)).toEqual(expect.arrayContaining(['Pensionado-preparacion-7.json', 'controles-observados.json', 'CP04-traza-tecnica.json']));
  });

  test('preflight rechazado: traza vacía y etapas del compilado, sin PII', async ({ page, context }, info) => {
    const c = compilar(CP04_PENSIONADO, sin(ENTORNOS.pensionado, 'AFI_CP01_NUM_CEL'));
    await lanza(ejecutarCasoAfi(c, { page, context, testInfo: info }));
    const traza = await trazaActual(info);
    expect(traza.eventos).toEqual([]);
    expect(etapaDe(traza, 'telefonos')).toMatchObject({ declarada: true, resoluciones: 1, requerida: true, aplicada: false, resultado: 'pendiente' });
    expect(JSON.stringify(traza)).not.toMatch(PII);
  });
});

// ---------------- Frontera del spec ----------------
test('el spec CP04 solo contiene definición -> actor -> compilación -> runner', async () => {
  const spec = await readFile(resolve(__dirname, 'afi-hu14-12-cp04.spec.ts'), 'utf8');
  for (const prohibido of ['resolverEtapa', 'AfiDataUi', 'AfiFunctionalUi', 'BizagiQaSupport', 'AfiliacionesPortal', 'PLAN_FUNCIONAL_CP04', 'page.locator', 'writeFile']) {
    expect(spec, prohibido).not.toContain(prohibido);
  }
  expect(spec).toContain('compilarCasoAfi(definicion, actorDesdeEntorno(definicion.perfil, process.env))');
  expect(spec).toContain('ejecutarCasoAfi(compilado');
});
