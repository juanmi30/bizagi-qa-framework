import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { actorDesdeEntorno } from '../data/afi/actores';
import {
  CapabilityGapError, DefinicionCasoAfiError, compilarCasoAfi, diagnosticoCasoCompilado, exigirDefinicionCasoAfiValida, validarDefinicionCasoAfi,
  type DefinicionCasoAfi,
} from '../data/afi/caso';
import { CP04_EMPRESA, CP04_FACULTATIVO, CP04_PENSIONADO, DEFINICIONES_CP04 } from '../data/afi/casos/hu14-12-cp04';
import { PLAN_FUNCIONAL_CP04 } from '../data/afi/cp04Funcional';
import { resolverEtapa, type PlanPreparacion } from '../data/afi/resolver';

/** Fase 3A: contrato DefinicionCasoAfi + compilador puro. Sin Playwright de UI; valores ficticios. */

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
const PII = /900000001|100000000[23]|@example\.test|3000000000|6010000000|Colombiana|Soltero|Fondo QA|1500000/;
const actor = (perfil: keyof typeof ENTORNOS) => actorDesdeEntorno(perfil, ENTORNOS[perfil]);

/** Copia mutable como si viniera del agente. */
const json = (d: unknown): Record<string, any> => JSON.parse(JSON.stringify(d)); // eslint-disable-line @typescript-eslint/no-explicit-any
const problemas = (d: unknown) => validarDefinicionCasoAfi(d).map(p => [p.ruta, p.clase]);
const lanza = (fn: () => unknown) => { try { fn(); } catch (e) { return e as Error; } throw new Error('no lanzó'); };
/** Plan comparable incluyendo valores reales (solo dentro del test). */
const crudo = (p: PlanPreparacion) => ({
  resoluciones: p.resoluciones.map(r => [r.campo, r.origen, r.valor, r.estrategia, r.derivadoDe, r.relevanteParaAsercion]),
  gaps: p.gaps.map(g => [g.campo, g.motivo]),
});

test.describe('DefinicionCasoAfi — contrato', () => {
  test('1-3. CP04 Empresa, Pensionado y Facultativo son válidas y comparten P04-P06', () => {
    for (const def of DEFINICIONES_CP04) {
      expect(validarDefinicionCasoAfi(def), def.nombre).toEqual([]);
      expect(() => exigirDefinicionCasoAfiValida(def)).not.toThrow();
      expect(def.funcional).toEqual(PLAN_FUNCIONAL_CP04);
      expect([def.caso, def.hu]).toEqual(['228503', 'AFI HU 14.12']);
    }
    expect(DEFINICIONES_CP04.map(d => [d.nombre, d.perfil, d.preparacion.datosCaso.tipoAportante])).toEqual([
      ['CP04 Empresa', 'empresa', 'Empleador'], ['CP04 Pensionado', 'pensionado', 'Pensionado'], ['CP04 Facultativo', 'facultativo', 'Facultativo'],
    ]);
  });

  test('4. round-trip JSON: mismo significado validado y compilado', () => {
    for (const def of DEFINICIONES_CP04) {
      const desconocido: unknown = JSON.parse(JSON.stringify(def));
      expect(desconocido).toEqual(def);
      expect(validarDefinicionCasoAfi(desconocido)).toEqual([]);
      const a = compilarCasoAfi(def, actor(def.perfil as keyof typeof ENTORNOS));
      const b = compilarCasoAfi(desconocido, actor(def.perfil as keyof typeof ENTORNOS));
      expect(diagnosticoCasoCompilado(b)).toEqual(diagnosticoCasoCompilado(a));
      for (const e of a.preparacion.orden) expect(crudo(b.preparacion.etapas[e]!)).toEqual(crudo(a.preparacion.etapas[e]!));
    }
  });

  test('golden sample cp04-empresa.afi.json coincide literalmente con la definición', async () => {
    const ruta = resolve(__dirname, '../data/afi/examples/cp04-empresa.afi.json');
    const esperado = `${JSON.stringify(CP04_EMPRESA, null, 2)}\n`;
    if (process.env.ACTUALIZAR_GOLDEN === '1') { await mkdir(dirname(ruta), { recursive: true }); await writeFile(ruta, esperado, 'utf8'); }
    const golden = await readFile(ruta, 'utf8');
    expect(golden.replace(/\r\n/g, '\n')).toBe(esperado);
    expect(validarDefinicionCasoAfi(JSON.parse(golden))).toEqual([]);
  });

  test('5-6. versión y perfil desconocidos; objeto inválido', () => {
    expect(problemas({ ...json(CP04_EMPRESA), version: 2 })).toEqual([['version', 'contrato']]);
    expect(problemas({ ...json(CP04_EMPRESA), perfil: 'cooperativa' })).toEqual([['perfil', 'contrato']]);
    expect(problemas([])).toEqual([['definicion', 'contrato']]);
    const vacios = json(CP04_EMPRESA);
    vacios.hu = ''; vacios.caso = ' '; delete vacios.nombre; delete vacios.preparacion; delete vacios.funcional;
    expect(problemas(vacios)).toEqual([['hu', 'contrato'], ['caso', 'contrato'], ['nombre', 'contrato'], ['preparacion', 'contrato'], ['funcional', 'contrato']]);
    expect(lanza(() => exigirDefinicionCasoAfiValida(vacios))).toBeInstanceOf(DefinicionCasoAfiError);
  });

  test('7-8. campo desconocido en datosCaso y camposAsercion; datosCaso no plano', () => {
    const d = json(CP04_EMPRESA);
    d.preparacion.datosCaso.tipoAportnte = 'Empleador';
    d.preparacion.camposAsercion = ['tipoAportante', 'departamentto', 'tipoAportante'];
    expect(problemas(d)).toEqual([
      ['preparacion.datosCaso.tipoAportnte', 'contrato'],
      ['preparacion.camposAsercion[1]', 'contrato'], ['preparacion.camposAsercion[2]', 'contrato'],
    ]);
    expect(problemas({ ...d, preparacion: { ...d.preparacion, datosCaso: ['x'], camposAsercion: 'tipoAportante' } }))
      .toEqual([['preparacion.datosCaso', 'contrato'], ['preparacion.camposAsercion', 'contrato']]);
  });

  test('un campo de una etapa no declarada se rechaza (el resolver lo ignoraría en silencio)', () => {
    const d = json(CP04_EMPRESA);
    d.preparacion.datosCaso.departamento = 'ANTIOQUIA';
    d.preparacion.camposAsercion = ['ciudadVivienda'];
    expect(validarDefinicionCasoAfi(d).map(p => p.mensaje)).toEqual([
      'pertenece a la etapa "informacion-contacto", no declarada', 'pertenece a la etapa "informacion-contacto", no declarada']);
  });

  test('9-11. etapas: desconocida, duplicada, orden inválido, vacía', () => {
    const con = (etapas: unknown) => problemas({ ...json(CP04_EMPRESA), preparacion: { ...json(CP04_EMPRESA).preparacion, etapas } });
    expect(con(['inicio-solicitud', 'pago'])).toEqual([['preparacion.etapas[1]', 'contrato']]);
    expect(con(['inicio-solicitud', 'telefonos', 'telefonos'])).toEqual([['preparacion.etapas[2]', 'contrato']]);
    expect(con(['inicio-solicitud', 'informacion-adicional', 'telefonos'])).toEqual([['preparacion.etapas[2]', 'contrato']]);
    expect(con([])).toEqual([['preparacion.etapas', 'contrato']]);
  });

  test('12. propiedades ajenas (selector, script, playwright...) se rechazan en todos los niveles', () => {
    const d = json(CP04_EMPRESA);
    d.selector = '#btn';
    d.preparacion.script = 'alert(1)';
    d.fuente.playwright = true;
    d.funcional.pasos[0].operaciones[0].locator = 'getByText';
    expect(problemas(d)).toEqual([
      ['selector', 'contrato'], ['fuente.playwright', 'contrato'], ['preparacion.script', 'contrato'],
      ['funcional.pasos[0].operaciones[0].locator', 'contrato'],
    ]);
    expect(lanza(() => exigirDefinicionCasoAfiValida(d))).toBeInstanceOf(DefinicionCasoAfiError);
  });

  test('PII nunca en la definición: valores literales y estrategias determinísticas de campos sensibles se rechazan', () => {
    const d = json(CP04_EMPRESA);
    d.preparacion.datosCaso.numeroIdentificacion = '900000001';
    d.preparacion.datosCaso.correo = { estrategia: { tipo: 'deterministic-text', valor: 'x@example.test', motivo: 'm' } };
    // Una REGLA (sin valor) sí es admisible, también en un campo pii.
    d.preparacion.datosCaso.naturaleza = { estrategia: { tipo: 'first-valid-option', orden: 'catalogo' } };
    d.preparacion.datosCaso.claseEmpleador = { estrategia: { tipo: 'first-valid-option', orden: 'aleatorio', regex: '.*' } };
    expect(problemas(d)).toEqual([
      ['preparacion.datosCaso.numeroIdentificacion', 'contrato'], ['preparacion.datosCaso.correo.estrategia.tipo', 'contrato'],
      ['preparacion.datosCaso.claseEmpleador.estrategia.regex', 'contrato'], ['preparacion.datosCaso.claseEmpleador.estrategia.orden', 'contrato'],
    ]);
  });

  test('13. capability gap del plan funcional se propaga como CapabilityGapError, no como contrato', () => {
    const d = json(CP04_EMPRESA);
    d.funcional.pasos[0].operaciones.push({ tipo: 'hover-tooltip', campo: 'departamento' });
    expect(problemas(d)).toEqual([['funcional.pasos[0].operaciones[2].tipo', 'capability']]);
    expect(lanza(() => exigirDefinicionCasoAfiValida(d))).toBeInstanceOf(CapabilityGapError);
    const error = lanza(() => compilarCasoAfi(d, actor('empresa')));
    expect(error).toBeInstanceOf(CapabilityGapError);
    expect(error.message).toContain('La operación "hover-tooltip" no está soportada por AFI.');
  });
});

test.describe('compilarCasoAfi', () => {
  test('14. actor completo -> compilado ejecutable con las etapas declaradas', () => {
    for (const def of DEFINICIONES_CP04) {
      const c = compilarCasoAfi(def, actor(def.perfil as keyof typeof ENTORNOS));
      expect([c.ejecutable, c.preparacion.gaps]).toEqual([true, []]);
      expect(c.preparacion.orden).toEqual(['inicio-solicitud', 'telefonos', 'informacion-adicional']);
      expect(Object.keys(c.preparacion.etapas)).toEqual(c.preparacion.orden);
      expect(c.metadata).toEqual({ version: 1, hu: 'AFI HU 14.12', caso: '228503', nombre: def.nombre, fuente: def.fuente });
      expect(c.funcional).toEqual(PLAN_FUNCIONAL_CP04);
      expect(c.funcional).not.toBe(def.funcional); // no comparte objetos con la entrada
    }
  });

  test('15. actor sin datos requeridos -> todos los gaps de todas las etapas, ejecutable=false', () => {
    const { AFI_CP01_NUM_CEL: _, AFI_QA_FACULTATIVO_SALARIO_BASICO: __, AFI_QA_CORREO: ___, ...incompleto } = ENTORNOS.facultativo;
    const c = compilarCasoAfi(CP04_FACULTATIVO, actorDesdeEntorno('facultativo', incompleto));
    expect(c.ejecutable).toBe(false);
    expect(c.preparacion.gaps.map(g => [g.etapa, g.campo, g.motivo])).toEqual([
      ['inicio-solicitud', 'correo', 'sin-fuente-segura'], ['inicio-solicitud', 'confirmacionCorreo', 'sin-fuente-segura'],
      ['telefonos', 'numeroCelular', 'sin-fuente-segura'], ['informacion-adicional', 'salarioBasico', 'sin-fuente-segura'],
    ]);
    // Un gap de dato nunca se convierte en capability gap ni lanza.
    expect(diagnosticoCasoCompilado(c).ejecutable).toBe(false);
  });

  test('campo asertado sin valor explícito -> DataGap asercion-sin-valor-explicito', () => {
    const d = json(CP04_EMPRESA);
    d.preparacion.camposAsercion = ['naturaleza'];
    const c = compilarCasoAfi(d, actor('empresa'));
    expect(c.preparacion.gaps.map(g => [g.etapa, g.campo, g.motivo])).toEqual([['inicio-solicitud', 'naturaleza', 'asercion-sin-valor-explicito']]);
    expect(c.ejecutable).toBe(false);
  });

  test('actor de otro perfil se rechaza', () => {
    expect(() => compilarCasoAfi(CP04_EMPRESA, actor('pensionado'))).toThrow('la definición requiere empresa');
  });

  test('16. los planes compilados son idénticos a los resolverEtapa manuales del spec CP04', () => {
    for (const def of DEFINICIONES_CP04) {
      const a = actor(def.perfil as keyof typeof ENTORNOS);
      const c = compilarCasoAfi(def, a);
      // Exactamente como afi-hu14-12-cp04.spec.ts construye sus planes hoy.
      const manual = {
        'inicio-solicitud': resolverEtapa('inicio-solicitud', { actor: a, datosCaso: { tipoAportante: def.preparacion.datosCaso.tipoAportante as string } }),
        telefonos: resolverEtapa('telefonos', { actor: a }),
        'informacion-adicional': resolverEtapa('informacion-adicional', { actor: a }),
      };
      for (const [etapa, plan] of Object.entries(manual)) {
        expect(crudo(c.preparacion.etapas[etapa as keyof typeof manual]!), `${def.nombre} ${etapa}`).toEqual(crudo(plan));
      }
    }
  });

  test('17. diagnóstico y serialización del compilado redactan PII', () => {
    const c = compilarCasoAfi(CP04_FACULTATIVO, actor('facultativo'));
    // El valor real existe internamente para el runner...
    expect(c.preparacion.etapas.telefonos!.resoluciones[0].valor).toBe('3000000000');
    // ...pero ni el diagnóstico ni una serialización accidental lo exponen.
    const diagnostico = diagnosticoCasoCompilado(c);
    expect(JSON.stringify(diagnostico)).not.toMatch(PII);
    expect(JSON.stringify(c)).not.toMatch(PII);
    expect(diagnostico.preparacion[1]).toEqual({
      etapa: 'telefonos',
      resoluciones: [
        { campo: 'numeroCelular', origen: 'actor', sensibilidad: 'pii', relevanteParaAsercion: false, valor: '[REDACTED]' },
        { campo: 'numeroTelefonoFijo', origen: 'actor', sensibilidad: 'pii', relevanteParaAsercion: false, valor: '[REDACTED]' },
      ],
      gaps: [],
    });
  });

  test('18. las definiciones serializadas no contienen valores del actor ni del .env', () => {
    const serializadas = JSON.stringify(DEFINICIONES_CP04);
    expect(serializadas).not.toMatch(PII);
    // Variables sensibles reales del entorno del proyecto (cargado por tools/run.mjs), si existen.
    for (const [clave, valor] of Object.entries(process.env)) {
      if (valor && valor.trim().length >= 4 && /PASSWORD|CLAVE|TOKEN|USER|USUARIO|CORREO|IDENTIFICACION|NUM_CEL|IBC|INGRESO|ACTIVIDAD|FACULTATIVO_|BASE_URL/i.test(clave)) {
        expect(serializadas.includes(valor.trim()), clave).toBe(false);
      }
    }
  });
});

test('contrato y compilador son puros: sin Playwright, helpers, process.env ni fs', async () => {
  for (const archivo of ['caso.ts', 'casos/hu14-12-cp04.ts']) {
    const fuente = await readFile(resolve(__dirname, '../data/afi', archivo), 'utf8');
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codigo, archivo).not.toMatch(/@playwright|helpers|process\.env|node:fs|require\(/);
  }
});

// Garantiza en compilación que los golden samples cumplen el tipo del contrato.
const _tipado: readonly DefinicionCasoAfi[] = [CP04_EMPRESA, CP04_PENSIONADO, CP04_FACULTATIVO];
void _tipado;
