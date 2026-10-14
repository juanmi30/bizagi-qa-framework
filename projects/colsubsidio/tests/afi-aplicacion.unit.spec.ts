import { test, expect, type Page } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PROTOCOLO_DECISION, construirAgentManifest } from '../data/afi/agentManifest';
import {
  REGISTRO_CAMPOS_FUNCIONALES, RegistroCamposInvalidoError, camposDelRegistro, validarRegistroCampos, type RegistroCampos,
} from '../data/afi/aplicacion/campos';
import {
  SALIDA_CONVERSACIONAL_DESDE_PROTOCOLO, aclaracionesPendientes, aplicarRespuestas, mensajeParaQa, validarSalidaAgente,
  type ClarificacionAgente, type SalidaAgente,
} from '../data/afi/aplicacion/conversacion';
import { camposNuevos, contarSalidas, evaluarObjetivoArquitectonico } from '../data/afi/aplicacion/metricas';
import { NavegacionAfiError, alcanzarPantalla } from '../data/afi/aplicacion/navegacion';
import { PANTALLAS_AFI, alcanzable, camposDePantalla, validarModeloPantallas, type PantallaAfi } from '../data/afi/aplicacion/pantallas';
import { ReglasError, incorporarRegla, requiereAclaracion, resolverRegla, validarAlmacenReglas, type AlmacenReglas, type ContextoRegla } from '../data/afi/aplicacion/reglas';
import { CAMPOS_CONTACTO_FUNCIONAL, validarPlanFuncionalAfi, type OperacionFuncionalAfi, type PasoFuncionalAfi } from '../data/afi/funcional';
import { EvidenciasAfi } from '../helpers/afiEvidencia';
import { AfiFunctionalUi } from '../helpers/afiFunctionalUi';
import { PantallaAmbiguaError, PantallaNoReconocidaError, reconocerPantalla } from '../helpers/reconocerPantalla';

/**
 * Fase 4J: generalización (Application Model, Field Registry, reconocimiento, navegación por objetivo, reglas con
 * alcance, flujo conversacional y métricas). Todo con datos FICTICIOS; sin Portal.
 */

const DIR_APLICACION = resolve(__dirname, '../data/afi/aplicacion');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Campo SINTÉTICO compatible: se declara SOLO en el registro.
const SINTETICO: RegistroCampos = {
  ...REGISTRO_CAMPOS_FUNCIONALES,
  campoSintetico: {
    etiqueta: 'Campo sintético', localizacion: { tipo: 'atributo-dominio', atributo: 'formcontrolname', valor: 'campoSintetico' },
    pantalla: 'informacion-contacto', control: 'text', sensibilidad: 'public',
  },
};
const op = (o: Record<string, unknown>) => o as unknown as OperacionFuncionalAfi;
const plan = (...ops: Record<string, unknown>[]) => ({ caso: 'x', pasos: [{ id: 'x', esperado: 'x', operaciones: ops }] });

// =====================================================================================
test.describe('4J B. Field Registry canónico', () => {
  test('los campos funcionales son la PROYECCIÓN del registro; pantalla/control/sensibilidad vienen del modelo', () => {
    expect([...CAMPOS_CONTACTO_FUNCIONAL]).toEqual(Object.keys(REGISTRO_CAMPOS_FUNCIONALES));
    expect(camposDelRegistro().map(c => [c.id, c.pantalla, c.control, c.sensibilidad])).toEqual([
      ['departamento', 'informacion-contacto', 'autocomplete', 'public'],
      ['ciudadVivienda', 'informacion-contacto', 'autocomplete', 'public'],
    ]);
  });

  test('el manifest deriva del registro: catálogo de campos y aplicabilidad por capacidad de control', () => {
    const m = construirAgentManifest();
    expect(m.funcional.campos).toEqual(camposDelRegistro().map(c => ({ campo: c.id, etapa: c.pantalla, control: c.control })));
    const aplicables = (tipo: string) => m.funcional.operaciones.find(o => o.tipo === tipo)!.camposAplicables;
    for (const tipo of ['escribir', 'campo-valor', 'campo-estado', 'entrada-rechazada', 'salir-del-campo', 'seleccionar-exacto', 'catalogo-no-vacio', 'cerrar-catalogo']) {
      expect(aplicables(tipo), tipo).toEqual(['departamento', 'ciudadVivienda']);
    }
    expect(aplicables('sugerencias-segun-fuente')).toEqual(['ciudadVivienda']); // por su fuente
    expect(aplicables('componente-visible')).toEqual([]);
  });

  test('fail-closed: redeclarar lo del modelo, campo nuevo incompleto o localización duplicada invalidan el registro', () => {
    const invalido = (r: RegistroCampos) => { try { validarRegistroCampos(r); } catch (e) { return (e as RegistroCamposInvalidoError).problemas; } return []; };
    expect(invalido({ ...REGISTRO_CAMPOS_FUNCIONALES, departamento: { ...REGISTRO_CAMPOS_FUNCIONALES.departamento, control: 'text' } }))
      .toEqual(['departamento: pantalla/control/sensibilidad vienen de las políticas del modelo; no se redeclaran']);
    expect(invalido({ nuevo: { etiqueta: 'Nuevo', localizacion: { tipo: 'atributo-dominio', atributo: 'formcontrolname', valor: 'nuevo' } } }))
      .toEqual(['nuevo: campo nuevo sin pantalla, control o sensibilidad']);
    expect(invalido({ ...SINTETICO, otro: { ...SINTETICO.campoSintetico, etiqueta: 'Otro' } })).toEqual(['otro: localización duplicada']);
  });

  test('ninguna operación ni el driver UI conocen campos concretos', async () => {
    const driver = sinComentarios(await readFile(resolve(__dirname, '../helpers/afiFunctionalUi.ts'), 'utf8'));
    expect(driver).not.toMatch(/'departamento'|'ciudadVivienda'|formcontrolname/);
  });
});

// =====================================================================================
test.describe('4J J. prueba de escalabilidad: un campo SINTÉTICO declarado solo en el registro', () => {
  const OPS_TEXTO = [
    { tipo: 'escribir', campo: 'campoSintetico', texto: 'Abc' },
    { tipo: 'campo-valor', campo: 'campoSintetico', valor: 'Abc', comparacion: 'exacta' },
    { tipo: 'salir-del-campo', campo: 'campoSintetico' },
    { tipo: 'campo-valor', campo: 'campoSintetico', vacio: true },
    { tipo: 'entrada-rechazada', campo: 'campoSintetico', texto: '12#' },
    { tipo: 'campo-estado', campo: 'campoSintetico', estado: 'editable' },
  ];

  test('validador: utilizable con el registro que lo declara; fail-closed sin él; aplicabilidad por control', () => {
    expect(validarPlanFuncionalAfi(plan(...OPS_TEXTO), SINTETICO)).toEqual([]);
    const sinRegistro = validarPlanFuncionalAfi(plan(OPS_TEXTO[0]));
    expect(sinRegistro).toEqual([{ ruta: 'pasos[0].operaciones[0].campo', clase: 'capability', mensaje: 'El campo "campoSintetico" no está soportado por el plan funcional AFI.' }]);
    // Un control de texto no ofrece catálogo: la operación no aplica (capability), sin editar la operación.
    expect(validarPlanFuncionalAfi(plan({ tipo: 'catalogo-no-vacio', campo: 'campoSintetico' }), SINTETICO))
      .toEqual([{ ruta: 'pasos[0].operaciones[0].campo', clase: 'capability', mensaje: 'La operación "catalogo-no-vacio" no aplica al campo "campoSintetico" (control text).' }]);
  });

  test('manifest derivado del registro lo publica con la aplicabilidad correcta', () => {
    const m = construirAgentManifest(SINTETICO);
    expect(m.funcional.campos).toContainEqual({ campo: 'campoSintetico', etapa: 'informacion-contacto', control: 'text' });
    const aplicables = (tipo: string) => m.funcional.operaciones.find(o => o.tipo === tipo)!.camposAplicables;
    for (const t of ['escribir', 'campo-valor', 'entrada-rechazada', 'salir-del-campo', 'campo-estado']) expect(aplicables(t), t).toContain('campoSintetico');
    for (const t of ['seleccionar-exacto', 'catalogo-no-vacio', 'cerrar-catalogo', 'sugerencias-segun-fuente']) expect(aplicables(t), t).not.toContain('campoSintetico');
    expect(camposNuevos(REGISTRO_CAMPOS_FUNCIONALES, SINTETICO)).toEqual(['campoSintetico']);
  });

  test('las operaciones genéricas del driver lo ejecutan sobre un DOM ficticio (sin editarlas)', async ({ page }, info) => {
    await page.setContent(`
      <h2>Información de contacto</h2>
      <input formcontrolname="campoSintetico" id="s" style="width:200px">
      <script>
        const s = document.getElementById('s');
        s.addEventListener('keydown', e => { if (e.key.length === 1 && !/\\p{L}/u.test(e.key)) e.preventDefault(); });
        s.addEventListener('blur', () => { if (s.value !== 'Válido') s.value = ''; });
      </script>`);
    const ui = new AfiFunctionalUi(page, info, { timeout: 1_500, registro: SINTETICO });
    const paso: PasoFuncionalAfi = { id: 'x', esperado: 'x', operaciones: OPS_TEXTO.map(op) };
    const resultados = await ui.ejecutarPaso(paso);
    expect(resultados.map(r => [r.tipo, r.resultado])).toEqual(OPS_TEXTO.map(o => [o.tipo, 'PASS']));
    // Fail-closed en el driver: un campo fuera del registro no se ejecuta.
    const canonico = new AfiFunctionalUi(page, info, { timeout: 1_500 });
    await expect(canonico.ejecutarPaso({ id: 'y', esperado: 'y', operaciones: [op(OPS_TEXTO[5])] })).rejects.toThrow('Campo no registrado en el Field Registry');
  });

  test('evidencia: un campo sensible registrado se enmascara; si no es enmascarable, la evidencia cliente se bloquea', async ({ page }, info) => {
    await page.setContent('<h2>Información de contacto</h2>');
    const mascaras: number[] = [];
    const evidencias = (registro: RegistroCampos) => new EvidenciasAfi({
      page, testInfo: info, modo: 'cliente', prefijo: 'X', metadata: { hu: 'x', caso: 'x', nombre: 'x' }, sensibles: () => [], registro,
      capturar: async (p, o) => { mascaras.push(o.mask?.length ?? 0); return p.screenshot(o); },
    });
    const observar = (e: EvidenciasAfi) => e.observar({ id: 'P1', esperado: 'x', operaciones: [] }, {
      operacion: op({ tipo: 'campo-estado', campo: 'campoSensible', estado: 'editable' }), indice: 0, resultado: { tipo: 'campo-estado', resultado: 'PASS', observado: {} },
    });
    const conPii = (localizacion: RegistroCampos[string]['localizacion']): RegistroCampos => ({
      ...REGISTRO_CAMPOS_FUNCIONALES,
      campoSensible: { etiqueta: 'Sensible', localizacion, pantalla: 'informacion-contacto', control: 'text', sensibilidad: 'pii' },
    });
    await observar(evidencias(REGISTRO_CAMPOS_FUNCIONALES));
    await observar(evidencias(conPii({ tipo: 'atributo-dominio', atributo: 'formcontrolname', valor: 'campoSensible' })));
    expect(mascaras[1]).toBe(mascaras[0] + 1);
    const bloqueada = evidencias(conPii({ tipo: 'nombre-accesible', rol: 'textbox', nombre: 'Sensible' }));
    await observar(bloqueada);
    expect(bloqueada.resumen(0)).toMatchObject({ estado: 'error', erroresCaptura: 1, capturasCliente: 0 });
  });
});

// =====================================================================================
const DOM = {
  contacto: '<h2>Información de contacto</h2><input formcontrolname="departamento"><input formcontrolname="ciudadVivienda">',
  telefonos: '<p>Teléfonos</p><input id="numeroCelular"><input id="numeroTelefonoFijo">',
  adicional: '<input id="actividad"><input id="ingresoMensual">',
  inicio: '<mat-select formcontrolname="tipoAportante">Independiente</mat-select><input formcontrolname="identificacion"><input formcontrolname="correoElectronico">',
};

test.describe('4J C. reconocimiento de pantalla', () => {
  test('modelo válido; campos de cada pantalla derivados del modelo de datos', () => {
    expect(validarModeloPantallas()).toEqual([]);
    expect(camposDePantalla('telefonos')).toEqual(['numeroCelular', 'numeroTelefonoFijo']);
    expect(camposDePantalla('informacion-contacto')).toEqual(['departamento', 'ciudadVivienda', 'localidad', 'barrio']);
  });

  test('exactamente una pantalla por varias señales; ninguna o varias -> error', async ({ page }) => {
    for (const [html, esperada] of [[DOM.contacto, 'informacion-contacto'], [DOM.telefonos, 'telefonos'], [DOM.adicional, 'informacion-adicional'], [DOM.inicio, 'inicio-solicitud']] as const) {
      await page.setContent(html);
      expect((await reconocerPantalla(page)).pantalla, esperada).toBe(esperada);
    }
    await page.setContent('<h2>Otra pantalla</h2><input id="desconocido">');
    await expect(reconocerPantalla(page)).rejects.toBeInstanceOf(PantallaNoReconocidaError);
    // Solo un campo del contacto, sin el encabezado obligatorio: no basta.
    await page.setContent('<input formcontrolname="departamento"><input formcontrolname="ciudadVivienda">');
    await expect(reconocerPantalla(page)).rejects.toBeInstanceOf(PantallaNoReconocidaError);
    await page.setContent(DOM.telefonos + DOM.adicional);
    await expect(reconocerPantalla(page)).rejects.toThrow(PantallaAmbiguaError);
  });

  test('una firma sobre un campo sin localización conocida es un modelo inválido (no "ausente")', async ({ page }) => {
    await page.setContent(DOM.contacto);
    const modelo = { x: { id: 'direccion', senales: [{ tipo: 'campo', campo: 'viaPrincipal' }, { tipo: 'campo', campo: 'numeroVp' }], minimo: 1, preparable: true, avance: null, siguientes: [] } } as unknown as Record<string, PantallaAfi>;
    await expect(reconocerPantalla(page, { modelo })).rejects.toThrow('sin localización conocida');
  });
});

// =====================================================================================
test.describe('4J D. navegación por objetivo', () => {
  function guion(secuencia: string[]) {
    let i = 0;
    const preparadas: string[] = [], continuadas: string[] = [];
    return {
      preparadas, continuadas,
      acciones: {
        reconocer: async () => { const p = secuencia[i]; if (p === '?') throw new PantallaNoReconocidaError([]); return p; },
        preparar: async (p: string) => { preparadas.push(p); },
        continuar: async (p: string) => { continuadas.push(p); i++; },
      },
    };
  }

  test('orden normal, reordenado, pantalla condicional ausente o repetida: llega al objetivo', async () => {
    for (const secuencia of [
      ['inicio-solicitud', 'telefonos', 'informacion-adicional', 'informacion-contacto'],
      ['inicio-solicitud', 'informacion-adicional', 'telefonos', 'informacion-contacto'],
      ['inicio-solicitud', 'informacion-contacto'],
      ['inicio-solicitud', 'telefonos', 'telefonos', 'informacion-contacto'],
    ]) {
      const g = guion(secuencia);
      const r = await alcanzarPantalla('informacion-contacto', g.acciones);
      expect(r.recorrido).toEqual(secuencia);
      expect(g.preparadas).toEqual([...new Set(secuencia.slice(0, -1))]); // cada pantalla se prepara una sola vez
      expect(g.continuadas).toEqual(secuencia.slice(0, -1));
    }
  });

  test('falla ante pantalla desconocida, ciclo, objetivo inalcanzable o desconocido', async () => {
    await expect(alcanzarPantalla('informacion-contacto', guion(['inicio-solicitud', '?']).acciones)).rejects.toBeInstanceOf(PantallaNoReconocidaError);
    await expect(alcanzarPantalla('informacion-contacto', guion(['telefonos', 'telefonos', 'telefonos']).acciones)).rejects.toMatchObject({ motivo: 'ciclo' });
    await expect(alcanzarPantalla('telefonos', guion(['informacion-contacto']).acciones)).rejects.toMatchObject({ motivo: 'objetivo-inalcanzable' });
    await expect(alcanzarPantalla('direccion', guion(['inicio-solicitud']).acciones)).rejects.toBeInstanceOf(NavegacionAfiError);
    expect(alcanzable('inicio-solicitud', 'informacion-contacto')).toBe(true);
  });

  test('vertical slice con reconocimiento REAL sobre DOM ficticio (sin tocar el runner)', async ({ page }) => {
    const pantallas = [DOM.inicio, DOM.adicional, DOM.telefonos, DOM.contacto];
    let k = 0;
    await page.setContent(pantallas[0]);
    const r = await alcanzarPantalla('informacion-contacto', {
      reconocer: async () => (await reconocerPantalla(page)).pantalla,
      preparar: async () => undefined,
      continuar: async () => { await page.setContent(pantallas[++k]); },
    });
    expect(r.recorrido).toEqual(['inicio-solicitud', 'informacion-adicional', 'telefonos', 'informacion-contacto']);
  });
});

// =====================================================================================
const CTX: ContextoRegla = { modulo: 'afiliaciones', pantalla: 'informacion-contacto', campo: 'campoA', control: 'autocomplete', hu: 'HU-A', caso: 'C1' };
const AUD = (referencia: string) => ({ fuente: { tipo: 'aclaracion-qa' as const, referencia }, fecha: '2026-09-29' });

test.describe('4J E/H. reglas con alcance y persistencia', () => {
  test('almacén persistido: válido, versionado y sin reglas generales no confirmadas', async () => {
    const almacen = validarAlmacenReglas(JSON.parse(await readFile(resolve(__dirname, '../knowledge/afi-rules.json'), 'utf8')));
    expect(almacen).toMatchObject({ esquema: 'afi-rules/v1', modulo: 'afiliaciones', version: 1, reglas: [], historial: [] });
  });

  test('precedencia: caso > hu > campo > pantalla > módulo > aplicación; control no aplicable -> sin regla', () => {
    let a: AlmacenReglas = { esquema: 'afi-rules/v1', modulo: 'afiliaciones', version: 1, reglas: [], historial: [] };
    const niveles = [
      { nivel: 'aplicacion' }, { nivel: 'modulo', modulo: 'afiliaciones' }, { nivel: 'pantalla', pantalla: 'informacion-contacto' },
      { nivel: 'campo', pantalla: 'informacion-contacto', campo: 'campoA' }, { nivel: 'hu', hu: 'HU-A' }, { nivel: 'caso', hu: 'HU-A', caso: 'C1' },
    ] as const;
    const valores = ['igual', 'contiene', 'empieza-por', 'igual', 'contiene', 'empieza-por'];
    niveles.forEach((alcance, i) => {
      a = incorporarRegla(a, { clave: 'autocomplete.coincidencia', valor: valores[i], texto: `Regla ${alcance.nivel}`, alcance, ...AUD(`ref-${i}`) });
      expect(resolverRegla(a, 'autocomplete.coincidencia', CTX)!.alcance.nivel).toBe(alcance.nivel);
    });
    expect(a.version).toBe(7);
    // Otro caso de la misma HU hereda la regla de HU, no la del caso (la aclaración de caso no contamina).
    expect(resolverRegla(a, 'autocomplete.coincidencia', { ...CTX, caso: 'C2' })!.alcance.nivel).toBe('hu');
    // Otra HU del módulo, en otra pantalla: módulo.
    expect(resolverRegla(a, 'autocomplete.coincidencia', { modulo: 'afiliaciones', hu: 'HU-B', pantalla: 'otra' })!.alcance.nivel).toBe('modulo');
    expect(resolverRegla(a, 'autocomplete.coincidencia', { ...CTX, control: 'text' })).toBeUndefined();
  });

  test('una regla confirmada no se vuelve a preguntar; reemplazo auditable; PII y duplicados rechazados', () => {
    let a: AlmacenReglas = { esquema: 'afi-rules/v1', modulo: 'afiliaciones', version: 1, reglas: [], historial: [] };
    expect(requiereAclaracion(a, 'autocomplete.diacriticos', CTX)).toBe(true);
    a = incorporarRegla(a, { clave: 'autocomplete.diacriticos', valor: 'sensibles', texto: 'Las tildes distinguen.', alcance: { nivel: 'modulo', modulo: 'afiliaciones' }, ...AUD('ref-1') });
    expect(requiereAclaracion(a, 'autocomplete.diacriticos', { ...CTX, hu: 'HU-Z', caso: 'C9' })).toBe(false);
    a = incorporarRegla(a, { clave: 'autocomplete.diacriticos', valor: 'insensibles', texto: 'Corregido: no distinguen.', alcance: { nivel: 'modulo', modulo: 'afiliaciones' }, ...AUD('ref-2') });
    expect(a.reglas.map(r => [r.id, r.estado, r.reemplazadaPor])).toEqual([['R0001', 'reemplazada', 'R0002'], ['R0002', 'vigente', undefined]]);
    expect(a.historial.map(h => h.accion)).toEqual(['alta', 'reemplazo']);
    expect(resolverRegla(a, 'autocomplete.diacriticos', CTX)!.valor).toBe('insensibles');
    expect(() => incorporarRegla(a, { clave: 'autocomplete.mayusculas', valor: 'sensibles', texto: 'Dato 3001234567', alcance: { nivel: 'aplicacion' }, ...AUD('x') })).toThrow(ReglasError);
    expect(() => incorporarRegla(a, { clave: 'autocomplete.mayusculas', valor: 'quizas', texto: 'x', alcance: { nivel: 'aplicacion' }, ...AUD('x') })).toThrow('valor no admitido');
    const duplicado = { ...a, reglas: [...a.reglas, { ...a.reglas[1], id: 'R9999' }] };
    expect(() => validarAlmacenReglas(duplicado)).toThrow('duplica clave y alcance');
  });
});

// =====================================================================================
const PREGUNTAS: ClarificacionAgente[] = [
  {
    id: 'q1', tipo: 'regla-negocio', clave: 'autocomplete.coincidencia', bloquea: true,
    pregunta: '¿Las sugerencias deben contener lo escrito en cualquier parte o empezar por ello?',
    motivo: 'El diseño pide verificar coincidencias sin decir cómo se comparan.',
    opciones: [{ valor: 'contiene', etiqueta: 'En cualquier parte' }, { valor: 'empieza-por', etiqueta: 'Al inicio' }],
    alcanceSugerido: { nivel: 'modulo', modulo: 'afiliaciones' },
  },
  {
    id: 'q2', tipo: 'dato-prueba', bloquea: true,
    pregunta: '¿Qué texto debe escribirse en el campo para esta prueba?',
    motivo: 'El resultado depende del texto y el diseño no lo fija.',
    alcanceSugerido: { nivel: 'caso', hu: 'HU-A', caso: 'C1' },
  },
];

test.describe('4J F/G. aclaraciones para QA vs gaps de framework', () => {
  test('CLARIFICATION_REQUIRED: lenguaje funcional, mensaje breve para el analista', () => {
    const s: SalidaAgente = { resultado: 'CLARIFICATION_REQUIRED', audiencia: 'analista-qa', clarificaciones: PREGUNTAS };
    expect(validarSalidaAgente(s)).toEqual([]);
    expect(mensajeParaQa(s)).toBe('Necesito confirmar 2 cosas antes de generar este caso.\n\n'
      + '1. ¿Las sugerencias deben contener lo escrito en cualquier parte o empezar por ello? (En cualquier parte / Al inicio)\n'
      + '2. ¿Qué texto debe escribirse en el campo para esta prueba?');
  });

  test('nunca jerga técnica al QA; un gap técnico no genera preguntas funcionales', () => {
    const tecnica: SalidaAgente = {
      resultado: 'CLARIFICATION_REQUIRED', audiencia: 'analista-qa',
      clarificaciones: [{ ...PREGUNTAS[1], id: 'q3', pregunta: '¿Necesitas capability de orquestacion-plan?' }],
    };
    expect(validarSalidaAgente(tecnica)).toContain('q3: lenguaje técnico en texto para QA');
    const gap: SalidaAgente = { resultado: 'FRAMEWORK_GAP', audiencia: 'automatizacion', gaps: [{ paso: 'P1', requisito: 'x', capabilityFaltante: 'y', familia: 'transicion' }] };
    expect(validarSalidaAgente(gap)).toEqual([]);
    expect(mensajeParaQa(gap)).toBeUndefined();
    // Correspondencia con las salidas del protocolo actual.
    expect(Object.keys(SALIDA_CONVERSACIONAL_DESDE_PROTOCOLO).sort()).toEqual(Object.keys(PROTOCOLO_DECISION.salidas).sort());
    expect(SALIDA_CONVERSACIONAL_DESDE_PROTOCOLO).toMatchObject({ INFORMACION_INSUFICIENTE: 'CLARIFICATION_REQUIRED', CAPABILITY_GAP: 'FRAMEWORK_GAP' });
  });

  test('respuestas -> regla persistida con alcance + contexto estructurado para el agente; la regla no se repregunta', () => {
    const inicial: AlmacenReglas = { esquema: 'afi-rules/v1', modulo: 'afiliaciones', version: 1, reglas: [], historial: [] };
    const { almacen, contexto } = aplicarRespuestas(PREGUNTAS, [
      { clarificacionId: 'q1', valor: 'contiene', texto: 'Deben contener lo escrito en cualquier parte.' },
      { clarificacionId: 'q2', valor: 'Abc', texto: 'Escribir Abc.' },
    ], inicial, CTX, { fecha: '2026-09-29', referencia: 'sesion-qa-1' });
    expect(almacen.version).toBe(2);
    expect(almacen.reglas).toHaveLength(1); // el dato de prueba NO se persiste como regla
    expect(contexto).toEqual({
      version: 'afi-contexto-aclarado/v1',
      reglas: [{ clave: 'autocomplete.coincidencia', valor: 'contiene', texto: 'Deben contener lo escrito en cualquier parte.', alcance: { nivel: 'modulo', modulo: 'afiliaciones' } }],
      respuestasDeCaso: [{ pregunta: PREGUNTAS[1].pregunta, tipo: 'dato-prueba', valor: 'Abc', texto: 'Escribir Abc.' }],
    });
    // Otro caso del módulo: la regla ya no se pregunta; el dato de prueba sí.
    expect(aclaracionesPendientes(PREGUNTAS, almacen, { ...CTX, hu: 'HU-B', caso: 'C7' }).map(c => c.id)).toEqual(['q2']);
    expect(() => aplicarRespuestas(PREGUNTAS, [{ clarificacionId: 'q1', valor: 'contiene', texto: 'x' }], inicial, CTX, { fecha: '2026-09-29', referencia: 'r' }))
      .toThrow('Faltan respuestas bloqueantes: q2');
    expect(() => aplicarRespuestas(PREGUNTAS, [{ clarificacionId: 'q1', valor: 'fonetica', texto: 'x' }], inicial, CTX, { fecha: '2026-09-29', referencia: 'r' }))
      .toThrow('no es una de las opciones');
  });
});

// =====================================================================================
test.describe('4J I. métricas de escalabilidad', () => {
  test('conteo por caso y objetivo arquitectónico sin umbrales', () => {
    const salidas: SalidaAgente[] = [
      { resultado: 'CLARIFICATION_REQUIRED', audiencia: 'analista-qa', clarificaciones: PREGUNTAS },
      { resultado: 'GENERABLE', definicion: {} },
    ];
    const conteo = contarSalidas(salidas);
    expect(conteo).toEqual({ sesionesAgente: 2, preguntasFuncionales: 2, gapsTecnicos: 0 });
    const objetivo = evaluarObjetivoArquitectonico({
      hu: 'HU-A', caso: 'C1', ...conteo, camposRegistradosNuevos: camposNuevos(REGISTRO_CAMPOS_FUNCIONALES, SINTETICO),
      operacionesNuevas: [], cambiosCodigo: { runtime: 0, declarativos: 1 },
    });
    expect(objetivo).toEqual({ ceroOperacionesNuevas: true, ceroCambiosRuntime: true, unaSesionHastaCompilable: true, preguntasFuncionales: 2, soloCambiosDeclarativos: true });
  });
});

// =====================================================================================
test('4J blindaje: el modelo de aplicación y el conocimiento no contienen casos, pasos ni valores de HU concretas', async () => {
  const prohibido = /CP0\d|HU\s*1\d|\bP\d{2}\b|Ch[ií]a|Zxyw|Cundinamarca|Bogot|228\d{3}|312\d{3}/i;
  for (const f of await readdir(DIR_APLICACION)) expect(await readFile(resolve(DIR_APLICACION, f), 'utf8'), f).not.toMatch(prohibido);
  expect(await readFile(resolve(__dirname, '../knowledge/afi-rules.json'), 'utf8')).not.toMatch(prohibido);
});
