import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { inspect } from 'node:util';
import { resolve } from 'node:path';
import { actorDesdeEntorno } from '../data/afi/actores';
import { DataGapError, REDACTADO, type ActorAfi } from '../data/afi/modelo';
import { POLITICAS_AFI } from '../data/afi/politicas';
import { resolverCampo, resolverPreparacion } from '../data/afi/resolver';

/** Resolver de datos AFI: determinístico, sin navegador ni Bizagi. Valores ficticios. */

const facultativo = (fondo = 'FONDO QA A'): ActorAfi => ({
  id: 'facultativoQa', perfil: 'facultativo',
  datos: {
    tipoAportante: 'Facultativo', tipoIdentificacion: 'Cédula de Ciudadanía',
    numeroIdentificacion: '1000000001', correo: 'facultativo.qa@example.test',
    nacionalidad: 'NACIONALIDAD QA', fondoPensiones: fondo, salarioBasico: '1000',
  },
});

const ENTORNO_INDEPENDIENTE = {
  AFI_CP01_TIPO_APORTANTE: 'Independiente QA', AFI_CP01_TIPO_AFILIADO: 'Afiliado QA',
  AFI_CP01_TIPO_IDENTIFICACION: 'Cédula de Ciudadanía', AFI_CP01_NUMERO_IDENTIFICACION: '2000000002',
  AFI_CP01_CORREO: 'independiente.qa@example.test', AFI_CP01_NUM_CEL: '3000000000',
  AFI_CP01_NUM_CEL_FIJO: '6010000000', AFI_CP01_ACTIVIDAD: 'Actividad QA', AFI_CP01_INGRESO_MENSUAL: '2000',
};

const gap = (accion: () => unknown): DataGapError => {
  try { accion(); } catch (e) { if (e instanceof DataGapError) return e; throw e; }
  throw new Error('Se esperaba DataGapError');
};

test.describe('Resolver de datos AFI', () => {
  test('1. test-case tiene prioridad sobre actor, derivado y auxiliar', () => {
    const contexto = { actor: facultativo(), datosCaso: { nacionalidad: 'NACIONALIDAD CASO', confirmacionCorreo: 'distinto@example.test', estadoCivil: 'ESTADO CASO' } };
    for (const [campo, valor] of [['nacionalidad', 'NACIONALIDAD CASO'], ['confirmacionCorreo', 'distinto@example.test'], ['estadoCivil', 'ESTADO CASO']]) {
      const r = resolverCampo(campo, contexto);
      expect([r.origen, r.valor]).toEqual(['test-case', valor]);
    }
  });

  test('2. actor se usa cuando el caso no especifica valor', () => {
    const r = resolverCampo('fondoPensiones', { actor: facultativo() });
    expect([r.origen, r.valor, r.relevanteParaAsercion]).toEqual(['actor', 'FONDO QA A', false]);
  });

  test('3. derived: confirmación desde correo y ciudad bloqueada por Bogotá', () => {
    const confirmacion = resolverCampo('confirmacionCorreo', { actor: facultativo() });
    expect([confirmacion.origen, confirmacion.valor, confirmacion.derivadoDe]).toEqual(['derived', 'facultativo.qa@example.test', ['correo']]);
    const bogota = resolverCampo('ciudadVivienda', { datosCaso: { departamento: 'BOGOTÁ, D.C.' } });
    expect([bogota.origen, bogota.valor]).toEqual(['derived', 'BOGOTÁ, D.C.']);
    // Sin regla aplicable para Cundinamarca: no se deriva, queda auxiliar.
    expect(resolverCampo('ciudadVivienda', { datosCaso: { departamento: 'CUNDINAMARCA' } }).origen).toBe('auxiliary');
  });

  test('4 y 6. auxiliar no asserted devuelve estrategia, nunca un valor inventado', () => {
    const estadoCivil = resolverCampo('estadoCivil', { actor: facultativo() });
    expect(estadoCivil.origen).toBe('auxiliary');
    expect(estadoCivil.valor).toBeUndefined();
    expect(estadoCivil.estrategia).toEqual({ tipo: 'first-valid-option', orden: 'catalogo' });
    const barrio = resolverCampo('barrio', {});
    expect([barrio.origen, barrio.valor, barrio.relevanteParaAsercion]).toEqual(['auxiliary', undefined, false]);
    expect(barrio.estrategia).toEqual({ tipo: 'first-valid-autocomplete', inicioAlfabetico: true });
  });

  test('5. campo asserted sin dato explícito -> DataGapError aunque haya actor o estrategia', () => {
    const departamento = gap(() => resolverCampo('departamento', { aserciones: ['departamento'] }));
    expect(departamento.motivo).toBe('asercion-sin-valor-explicito');
    expect(departamento.message).toBe('No se puede resolver "departamento": el campo es funcionalmente relevante para el caso y no existe un valor explícito. Fuentes aceptadas: test-case.');
    expect(gap(() => resolverCampo('fondoPensiones', { actor: facultativo(), aserciones: ['fondoPensiones'] })).motivo)
      .toBe('asercion-sin-valor-explicito');
    // Ciudad asserted no se completa derivándola: el esperado lo fija el caso.
    expect(gap(() => resolverCampo('ciudadVivienda', { datosCaso: { departamento: 'BOGOTÁ, D.C.' }, aserciones: ['ciudadVivienda'] })).campo)
      .toBe('ciudadVivienda');
  });

  test('regla explícita del caso sobre un campo asserted (criterio CP02)', () => {
    const regla = { estrategia: { tipo: 'first-valid-autocomplete', inicioAlfabetico: true } as const };
    const r = resolverCampo('barrio', { datosCaso: { barrio: regla }, aserciones: ['barrio'] });
    expect([r.origen, r.relevanteParaAsercion, r.estrategia]).toEqual(['test-case', true, regla.estrategia]);
  });

  test('7. campo desconocido -> DataGapError claro, también desde el plan', () => {
    const desconocido = gap(() => resolverCampo('tipoCotizante', {}));
    expect(desconocido.motivo).toBe('campo-desconocido');
    expect(desconocido.message).toBe('No se puede resolver "tipoCotizante": el campo no existe en las políticas de Afiliaciones.');
    const plan = resolverPreparacion({ actor: facultativo(), aserciones: ['cuidad' as never] });
    expect(plan.gaps.map(g => [g.campo, g.motivo])).toContainEqual(['cuidad', 'campo-desconocido']);
  });

  test('8 y 9. PII redactada en diagnóstico, JSON e inspect; valor real disponible internamente', () => {
    const r = resolverCampo('numeroIdentificacion', { actor: facultativo() });
    expect(r.valor).toBe('1000000001');
    expect(r.diagnostico()).toEqual({ campo: 'numeroIdentificacion', origen: 'actor', sensibilidad: 'pii', relevanteParaAsercion: false, valor: REDACTADO });
    expect(JSON.stringify(r)).not.toContain('1000000001');
    expect(inspect(r, { depth: 5 })).not.toContain('1000000001');
    const plan = resolverPreparacion({ actor: facultativo() });
    const serializado = JSON.stringify(plan);
    for (const privado of ['1000000001', 'facultativo.qa@example.test', 'FONDO QA A', 'NACIONALIDAD QA']) expect(serializado).not.toContain(privado);
    expect(resolverCampo('tipoAportante', { actor: facultativo() }).diagnostico().valor).toBe('Facultativo');
    // Los gaps tampoco llevan valores del contexto.
    const sinIdentidad = gap(() => resolverCampo('numeroIdentificacion', { datosCaso: { correo: 'x@example.test' } }));
    expect(sinIdentidad.message).not.toContain('x@example.test');
    expect(sinIdentidad.fuentesEsperadas).toEqual(['test-case', 'actor']);
  });

  test('10 y 11. la capa de dominio no importa Playwright ni lee process.env', async () => {
    for (const archivo of ['modelo', 'politicas', 'resolver', 'actores', 'perfiles']) {
      const fuente = await readFile(resolve(__dirname, '../data/afi', `${archivo}.ts`), 'utf8');
      const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(codigo, archivo).not.toMatch(/@playwright|from ['"]\.\.\/\.\.\/helpers|process\.env/);
    }
    const original = process.env;
    process.env = new Proxy({}, { get: () => { throw new Error('process.env leído'); } }) as NodeJS.ProcessEnv;
    let plan: ReturnType<typeof resolverPreparacion>;
    // Solo el resolver corre bajo la trampa; expect de Playwright sí lee process.env.
    try { plan = resolverPreparacion({ actor: actorDesdeEntorno('independiente', ENTORNO_INDEPENDIENTE) }); }
    finally { process.env = original; }
    expect(plan.gaps).toEqual([]);
    expect(plan.resoluciones.length).toBeGreaterThan(0);
  });

  test('12. dos actores resuelven valores distintos sin cambiar las políticas', () => {
    const antes = JSON.stringify(POLITICAS_AFI);
    expect(resolverCampo('fondoPensiones', { actor: facultativo('FONDO QA A') }).valor).toBe('FONDO QA A');
    expect(resolverCampo('fondoPensiones', { actor: facultativo('FONDO QA B') }).valor).toBe('FONDO QA B');
    // Independiente sin fondo en el actor: misma política, resolución auxiliar.
    expect(resolverCampo('fondoPensiones', { actor: actorDesdeEntorno('independiente', ENTORNO_INDEPENDIENTE) }).origen).toBe('auxiliary');
    expect(JSON.stringify(POLITICAS_AFI)).toBe(antes);
    expect(Object.isFrozen(POLITICAS_AFI.fondoPensiones.auxiliar)).toBe(true);
  });

  test('plan con forma de agente: solo completa preparación y respeta aserciones', () => {
    const plan = resolverPreparacion({
      actor: actorDesdeEntorno('independiente', ENTORNO_INDEPENDIENTE),
      datosCaso: { departamento: 'CUNDINAMARCA', ciudadVivienda: 'CHÍA' },
      aserciones: ['departamento', 'ciudadVivienda'],
    });
    expect(plan.gaps).toEqual([]);
    const por = Object.fromEntries(plan.resoluciones.map(r => [r.campo, r.diagnostico()]));
    expect(por.departamento).toMatchObject({ origen: 'test-case', valor: 'CUNDINAMARCA', relevanteParaAsercion: true });
    expect(por.ciudadVivienda).toMatchObject({ origen: 'test-case', valor: 'CHÍA', relevanteParaAsercion: true });
    expect(por.confirmacionCorreo).toMatchObject({ origen: 'derived', valor: REDACTADO });
    expect(por.barrio).toMatchObject({ origen: 'auxiliary', relevanteParaAsercion: false });
    expect(por.numeroVp).toMatchObject({ origen: 'auxiliary', estrategia: { tipo: 'deterministic-number', valor: '16' } });
    // Solo los asserted son relevantes; ningún auxiliar queda como expectativa.
    expect(plan.resoluciones.filter(r => r.relevanteParaAsercion).map(r => r.campo)).toEqual(['departamento', 'ciudadVivienda']);
    expect(plan.resoluciones.filter(r => r.origen === 'auxiliary').every(r => r.valor === undefined)).toBe(true);
    // Campos de otros perfiles no se piden.
    for (const ajeno of ['nacionalidad', 'tipoEmpleador', 'recibioAyudaAsesor']) expect(por[ajeno]).toBeUndefined();
  });

  test('perfil empresa y actor incompleto reportan gaps estructurados', () => {
    const empresa = resolverPreparacion({ actor: actorDesdeEntorno('empresa', {}) });
    // Empleador PJ captura Celular y Teléfono fijo en Información de contacto (variante porPerfil observada en QA): sin dato -> gap.
    expect(empresa.gaps.map(g => [g.campo, g.motivo]).sort()).toEqual([
      ['confirmacionCorreo', 'sin-fuente-segura'], ['correo', 'sin-fuente-segura'], ['numeroCelular', 'sin-fuente-segura'],
      ['numeroIdentificacion', 'sin-fuente-segura'], ['numeroTelefonoFijo', 'sin-fuente-segura'],
    ]);
    expect(empresa.gaps.find(g => g.campo === 'confirmacionCorreo')!.fuentesEsperadas).toEqual(['test-case', 'derived']);
    const por = Object.fromEntries(empresa.resoluciones.map(r => [r.campo, r]));
    expect([por.tipoEmpleador.origen, por.tipoEmpleador.valor]).toEqual(['actor', 'Jurídica']);
    expect(por.naturaleza.estrategia).toEqual({ tipo: 'first-valid-option', orden: 'alfabetico' });
    expect(por.recibioAyudaAsesor.estrategia).toMatchObject({ tipo: 'deterministic-text', valor: 'No' });
    expect(por.numeroCelular).toBeUndefined();
  });
});
