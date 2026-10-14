import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { actorDesdeEntorno } from '../data/afi/actores';
import {
  COMPOSICION, DIAGNOSTICO, ETAPAS_RUNNER_V1_MANIFEST, FAMILIAS_BACKLOG, FAMILIAS_SOPORTADAS, camposAplicables, PROTOCOLO_DECISION, VERSION_AGENT_MANIFEST, construirAgentManifest, serializarAgentManifest,
} from '../data/afi/agentManifest';
import { CAPACIDADES_PREPARACION } from '../data/afi/capacidadesPreparacion';
import { PERFILES_CASO_AFI, VERSION_CASO_AFI, validarDefinicionCasoAfi } from '../data/afi/caso';
import { CONTEXTOS_AFI, CONTEXTOS_EJECUCION_AFI, type ContextoEjecucionAfi } from '../data/afi/contextos';
import { contextoMobile } from '../helpers/contactoMobile';
import { ALERTA_TERRITORIAL_CP04, PLAN_FUNCIONAL_CP04 } from '../data/afi/cp04Funcional';
import {
  CAMPOS_CONTACTO_FUNCIONAL, COMPONENTES_FUNCIONALES_AFI, CONTRATO, FUENTES_AUTORITATIVAS_AFI, REGLAS_REGION, validarPlanFuncionalAfi,
  type CampoContactoFuncional, type TipoOperacionFuncional,
} from '../data/afi/funcional';
import { CAMPOS_AFI, ETAPAS_AFI, type PerfilActorAfi } from '../data/afi/modelo';
import { POLITICAS_AFI } from '../data/afi/politicas';
import { ETAPAS_RUNNER_V1 } from '../helpers/afiCaseRunner';

/** Fase 4B: manifest canónico para consumidores IA. Sin navegador; valores de actor ficticios. */

const DIR = resolve(__dirname, '../data/afi');
const RUTA_JSON = resolve(DIR, 'AFI-AGENT-MANIFEST.json');
const RUTA_INSTRUCCIONES = resolve(DIR, 'AFI-AGENT-INSTRUCTIONS.md');
const RUTA_BACKLOG = resolve(DIR, 'AFI-CAPABILITY-BACKLOG.md');

// Exhaustividad en compilación: si cambia la unión, estos Records dejan de compilar.
const TODOS_PERFILES: Record<PerfilActorAfi, true> = { empresa: true, pensionado: true, facultativo: true, independiente: true };
const TODAS_OPERACIONES: Record<TipoOperacionFuncional, true> = {
  'texto-ausente': true, 'catalogo-opcion-fuera-de': true, 'catalogo-no-vacio': true, 'seleccionar-exacto': true, 'cerrar-catalogo': true,
  'componente-visible': true, 'componente-posicion': true, 'componente-region': true, 'campo-estado': true, 'campo-valor': true, escribir: true,
  'entrada-rechazada': true, 'salir-del-campo': true, 'catalogo-segun-fuente': true, 'sugerencias-segun-fuente': true,
};
const TODOS_CAMPOS_FUNCIONALES: Record<CampoContactoFuncional, true> = { departamento: true, ciudadVivienda: true };
const TODOS_CONTEXTOS: Record<ContextoEjecucionAfi, true> = { desktop: true, mobile: true };

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

const manifest = construirAgentManifest();
const texto = serializarAgentManifest();
const operacion = (tipo: string) => manifest.funcional.operaciones.find(o => o.tipo === tipo)!;

test.describe('AFI agent manifest — archivo', () => {
  test('AFI-AGENT-MANIFEST.json es JSON válido y coincide con construirAgentManifest() (ACTUALIZAR_AGENT_MANIFEST=1 lo regenera)', async () => {
    if (process.env.ACTUALIZAR_AGENT_MANIFEST === '1') await writeFile(RUTA_JSON, texto, 'utf8');
    const archivo = (await readFile(RUTA_JSON, 'utf8')).replace(/\r\n/g, '\n');
    expect(archivo, 'Manifest desactualizado: ejecutar con ACTUALIZAR_AGENT_MANIFEST=1').toBe(texto);
    expect(JSON.parse(archivo)).toEqual(JSON.parse(JSON.stringify(manifest)));
    expect(manifest.schemaVersion).toBe(VERSION_AGENT_MANIFEST);
    expect(VERSION_AGENT_MANIFEST).toBe('afi-agent-manifest/v1');
    expect(manifest.contrato.version).toBe(VERSION_CASO_AFI);
  });
});

test.describe('AFI agent manifest — sincronía con el código', () => {
  test('perfiles = PERFILES_CASO_AFI = PerfilActorAfi', () => {
    expect(manifest.perfiles.map(p => p.perfil)).toEqual([...PERFILES_CASO_AFI]);
    expect([...PERFILES_CASO_AFI].sort()).toEqual(Object.keys(TODOS_PERFILES).sort());
  });

  test('etapas del modelo = ETAPAS_AFI; campos por etapa = POLITICAS_AFI', () => {
    expect(manifest.preparacion.etapasModelo).toEqual([...ETAPAS_AFI]);
    expect(manifest.preparacion.etapas.map(e => e.etapa)).toEqual([...ETAPAS_AFI]);
    expect(manifest.preparacion.etapas.flatMap(e => e.campos).sort()).toEqual([...CAMPOS_AFI].sort());
    for (const e of manifest.preparacion.etapas) for (const c of e.campos) expect(POLITICAS_AFI[c].etapa).toBe(e.etapa);
  });

  test('etapas del runner v1 = ETAPAS_RUNNER_V1; informacion-contacto es punto funcional; direccion no soportada', () => {
    expect([...ETAPAS_RUNNER_V1_MANIFEST]).toEqual([...ETAPAS_RUNNER_V1]);
    expect(manifest.preparacion.etapasRunnerV1).toEqual(['inicio-solicitud', 'informacion-empresa', 'telefonos', 'informacion-adicional']);
    expect(manifest.preparacion.etapaObligatoriaRunnerV1).toBe('inicio-solicitud');
    expect(manifest.preparacion.puntoFuncional).toBe('informacion-contacto');
    // El punto funcional es la pantalla inmediatamente posterior a la última etapa del runner.
    expect(ETAPAS_AFI[ETAPAS_AFI.indexOf(ETAPAS_RUNNER_V1[ETAPAS_RUNNER_V1.length - 1]) + 1]).toBe(manifest.preparacion.puntoFuncional);
    const rol = Object.fromEntries(manifest.preparacion.etapas.map(e => [e.etapa, [e.rol, e.declarableEnPreparacion]]));
    expect(rol).toEqual({
      'inicio-solicitud': ['preparacion-runner-v1', true],
      'informacion-empresa': ['preparacion-runner-v1', true],
      telefonos: ['preparacion-runner-v1', true],
      'informacion-adicional': ['preparacion-runner-v1', true],
      'informacion-contacto': ['punto-funcional', false],
      direccion: ['no-soportada-runner-v1', false],
    });
    const nota = (e: string) => manifest.preparacion.etapas.find(x => x.etapa === e)!.nota;
    expect(nota('informacion-contacto')).toMatch(/MODELO.*runner v1 NO la ejecuta como preparación/);
    expect(nota('direccion')).toMatch(/runner v1 NO la orquesta/);
  });

  test('capacidades de preparación = CAPACIDADES_PREPARACION (orden, control, formas aceptadas)', () => {
    const esperado = Object.entries(CAPACIDADES_PREPARACION).flatMap(([etapa, tabla]) =>
      Object.entries(tabla).map(([campo, cap]) => [etapa, campo, cap.control, cap.admite.length, 'opciones' in cap ? [...cap.opciones] : undefined]));
    expect(manifest.preparacion.capacidades.map(c => [c.etapa, c.campo, c.control, c.acepta.length, 'opcionesObservadas' in c ? c.opcionesObservadas : undefined]))
      .toEqual(esperado);
    for (const e of manifest.preparacion.etapas) {
      expect(e.camposConCapacidadPreparacion).toEqual(Object.keys((CAPACIDADES_PREPARACION as Record<string, object>)[e.etapa] ?? {}));
    }
    // 4E.1: el fondo acepta valor del actor o primera sugerencia válida; es el único autocomplete que la materializa.
    expect(manifest.preparacion.capacidades.find(c => c.campo === 'fondoPensiones')).toMatchObject({
      etapa: 'informacion-adicional', control: 'autocomplete', acepta: ['valor-concreto', 'estrategia-first-valid-autocomplete'],
      resueltoPorFramework: { delActor: true, auxiliar: { tipo: 'first-valid-autocomplete', materializable: true } },
    });
    expect(manifest.preparacion.estrategiasDatosCaso.find(e => e.tipo === 'first-valid-autocomplete')!.materializablePorCampos).toEqual(['fondoPensiones']);
    // Sensibilidad: nunca se ofrece una estrategia con literal en un campo no public.
    const deterministicas = manifest.preparacion.estrategiasDatosCaso.filter(e => e.tipo.startsWith('deterministic-')).flatMap(e => e.materializablePorCampos);
    for (const c of deterministicas) expect(POLITICAS_AFI[c].sensibilidad, c).toBe('public');
  });

  test('operaciones funcionales = CONTRATO = TipoOperacionFuncional; parámetros sincronizados', () => {
    expect(manifest.funcional.operaciones.map(o => o.tipo)).toEqual(Object.keys(CONTRATO));
    expect(Object.keys(CONTRATO).sort()).toEqual(Object.keys(TODAS_OPERACIONES).sort());
    for (const o of manifest.funcional.operaciones) {
      const c = CONTRATO[o.tipo as TipoOperacionFuncional];
      expect(o.parametros.requeridos, o.tipo).toEqual([...c.requeridas]);
      expect(o.parametros.opcionales, o.tipo).toEqual([...c.opcionales]);
      expect(Object.keys(o.parametros.detalle).sort(), o.tipo).toEqual([...c.requeridas, ...c.opcionales].sort());
    }
  });

  test('valores enumerados del manifest los acepta el validador; otros son CapabilityGap', () => {
    const plan = (op: Record<string, unknown>) => ({ caso: 'x', pasos: [{ id: 'x', esperado: 'x', operaciones: [op] }] });
    const campo = CAMPOS_CONTACTO_FUNCIONAL[0];
    const MUESTRAS: Record<TipoOperacionFuncional, Record<string, unknown>> = {
      'texto-ausente': { tipo: 'texto-ausente', texto: 'x', coincidencia: 'exacta' },
      'catalogo-opcion-fuera-de': { tipo: 'catalogo-opcion-fuera-de', campo, excluir: ['x'], normalizacion: 'texto-es' },
      'catalogo-no-vacio': { tipo: 'catalogo-no-vacio', campo },
      'seleccionar-exacto': { tipo: 'seleccionar-exacto', campo, valor: 'x' },
      'cerrar-catalogo': { tipo: 'cerrar-catalogo', campo },
      'componente-visible': { tipo: 'componente-visible', componente: 'alerta-territorial' },
      'componente-posicion': { tipo: 'componente-posicion', componente: 'alerta-territorial', relacion: 'debajo-de', referencia: 'subtitulo-localizacion-vivienda' },
      'componente-region': { tipo: 'componente-region', componente: 'alerta-territorial', region: 'superior' },
      'campo-estado': { tipo: 'campo-estado', campo, estado: 'editable' },
      'campo-valor': { tipo: 'campo-valor', campo, valor: 'x', comparacion: 'exacta' },
      escribir: { tipo: 'escribir', campo, texto: 'x' },
      'entrada-rechazada': { tipo: 'entrada-rechazada', campo, texto: '1' },
      'salir-del-campo': { tipo: 'salir-del-campo', campo },
      'catalogo-segun-fuente': {
        tipo: 'catalogo-segun-fuente', campo: 'ciudadVivienda', fuente: 'parametrica-ciudad-nacional',
        filtroDesdeCampo: 'departamento', relacion: 'igual', normalizacion: 'texto-es',
      },
      'sugerencias-segun-fuente': {
        tipo: 'sugerencias-segun-fuente', campo: 'ciudadVivienda', fuente: 'parametrica-ciudad-nacional', filtroDesdeCampo: 'departamento',
        normalizacion: 'texto-es', textoBusqueda: 'x', coincidencia: 'contiene', diacriticos: 'sensibles', mayusculas: 'sensibles',
      },
    };
    for (const o of manifest.funcional.operaciones) {
      const muestra = MUESTRAS[o.tipo as TipoOperacionFuncional];
      expect(validarPlanFuncionalAfi(plan(muestra)), o.tipo).toEqual([]);
      for (const [param, d] of Object.entries(o.parametros.detalle) as [string, { valores?: readonly string[] }][]) {
        if (!d.valores) continue;
        for (const v of d.valores) expect(validarPlanFuncionalAfi(plan({ ...muestra, [param]: v })), `${o.tipo}.${param}=${v}`).toEqual([]);
        expect(validarPlanFuncionalAfi(plan({ ...muestra, [param]: 'no-existe' })).map(p => [p.ruta.split('.').pop(), p.clase]))
          .toEqual([[param, 'capability']]);
      }
    }
  });

  test('campos funcionales = CAMPOS_CONTACTO_FUNCIONAL, todos en el punto funcional', () => {
    expect(manifest.funcional.campos.map(c => c.campo)).toEqual([...CAMPOS_CONTACTO_FUNCIONAL]);
    expect([...CAMPOS_CONTACTO_FUNCIONAL].sort()).toEqual(Object.keys(TODOS_CAMPOS_FUNCIONALES).sort());
    for (const c of manifest.funcional.campos) expect(c.etapa).toBe(manifest.preparacion.puntoFuncional);
    for (const o of manifest.funcional.operaciones) {
      const esperado = CONTRATO[o.tipo as TipoOperacionFuncional].requeridas.includes('fuente') ? ['ciudadVivienda']
        : CONTRATO[o.tipo as TipoOperacionFuncional].requeridas.includes('campo') ? [...CAMPOS_CONTACTO_FUNCIONAL] : [];
      expect(o.camposAplicables, o.tipo).toEqual(esperado);
      expect(o.camposAplicables).toEqual(camposAplicables(o.tipo as TipoOperacionFuncional));
    }
    // Los campos funcionales solo exponen valores public (campo-valor los observa).
    for (const c of CAMPOS_CONTACTO_FUNCIONAL) expect(POLITICAS_AFI[c].sensibilidad, c).toBe('public');
  });

  test('cada operación declara alcance, semántica, garantiza y noGarantiza', () => {
    for (const o of manifest.funcional.operaciones) {
      expect(o.semantica.trim(), o.tipo).not.toBe('');
      expect(o.alcance.trim(), o.tipo).not.toBe('');
      expect(o.garantiza.length, o.tipo).toBeGreaterThan(0);
      expect(o.noGarantiza.length, o.tipo).toBeGreaterThan(0);
    }
    expect(operacion('texto-ausente').noGarantiza.join('\n')).toMatch(/componente visual[\s\S]*otra alerta o mensaje con texto diferente/);
    expect(operacion('catalogo-opcion-fuera-de').noGarantiza.join('\n')).toMatch(/completo[\s\S]*cantidad concreta[\s\S]*paramétrica específica/);
    expect(operacion('catalogo-no-vacio').noGarantiza.join('\n')).toMatch(/Contenido correcto[\s\S]*restricciones[\s\S]*departamento/);
    expect(operacion('seleccionar-exacto').garantiza[0]).toMatch(/exactamente una opción coincidente \(literal, o normalizada/);
    expect(operacion('catalogo-segun-fuente').noGarantiza.join('\n')).toMatch(/bien configurada frente a una referencia externa/);
    expect(operacion('campo-valor').noGarantiza.join('\n')).toMatch(/entrada-rechazada/);
    expect(operacion('escribir').noGarantiza).toContain('Que el campo lo aceptara.');
    expect(operacion('cerrar-catalogo').garantiza).toEqual(['Se cierra el catálogo abierto.']);
  });
});

test.describe('AFI agent manifest — contexto de ejecución y backlog (4C)', () => {
  test('contextos = CONTEXTOS_EJECUCION_AFI; solo desktop soportado por el runner v1', () => {
    expect(manifest.ejecucion.contextos.map(c => c.contexto)).toEqual([...CONTEXTOS_EJECUCION_AFI]);
    expect(Object.keys(CONTEXTOS_AFI).sort()).toEqual(Object.keys(TODOS_CONTEXTOS).sort());
    expect(manifest.ejecucion.contextos.map(c => [c.contexto, c.soportadoRunnerV1])).toEqual([['desktop', true], ['mobile', false]]);
    for (const c of manifest.ejecucion.contextos) expect(c.soportadoRunnerV1, c.contexto).toBe(CONTEXTOS_AFI[c.contexto].soportadoRunnerV1);
    expect(manifest.ejecucion.reglas.join('\n')).toMatch(/nunca se emite JSON para ella/);
  });

  test('catálogo de contextos = lo que realmente usan harness, CP04 y el piloto mobile', async () => {
    const { viewport } = CONTEXTOS_AFI.desktop.navegador;
    const literal = `viewport: { width: ${viewport.width}, height: ${viewport.height} }`;
    for (const spec of ['afi-case-file.spec.ts', 'afi-hu14-12-cp04.spec.ts']) {
      expect(await readFile(resolve(__dirname, spec), 'utf8'), spec).toContain(literal);
    }
    expect(CONTEXTOS_AFI.desktop.navegador).toMatchObject({ isMobile: false, hasTouch: false });
    expect(CONTEXTOS_AFI.mobile.navegador).toEqual(contextoMobile);
  });

  test('el manifest no expone opciones de navegador: el agente no debe poder escribirlas', () => {
    for (const c of manifest.ejecucion.contextos) expect(Object.keys(c)).not.toContain('navegador');
    for (const { viewport } of Object.values(CONTEXTOS_AFI).map(c => c.navegador)) {
      expect(texto.includes(String(viewport.width)), `${viewport.width}`).toBe(false);
    }
    expect(texto).not.toMatch(/isMobile|hasTouch|userAgent/);
  });

  test('el contrato v1 rechaza contexto/viewport en la definición (no tiene dónde declararlo)', () => {
    const base = {
      version: VERSION_CASO_AFI, hu: 'x', caso: 'x', nombre: 'x', perfil: 'independiente',
      preparacion: { datosCaso: {}, camposAsercion: [], etapas: ['inicio-solicitud'] },
      funcional: { caso: 'x', pasos: [{ id: 'x', esperado: 'x', operaciones: [{ tipo: 'catalogo-no-vacio', campo: 'departamento' }] }] },
    };
    expect(validarDefinicionCasoAfi(base)).toEqual([]);
    for (const extra of [{ contexto: 'mobile' }, { viewport: { width: 1, height: 1 } }]) {
      expect(validarDefinicionCasoAfi({ ...base, ...extra }).map(p => p.clase), Object.keys(extra)[0]).toEqual(['contrato']);
    }
  });

  test('backlog: separado, no soportado, sin solaparse con operaciones, documentado', async () => {
    expect(manifest.backlog.soportado).toBe(false);
    expect(manifest.backlog.familias).toBe(FAMILIAS_BACKLOG);
    const ids = FAMILIAS_BACKLOG.map(f => f.familia);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('contexto-ejecucion');
    // Una familia del backlog nunca es un tipo de operación aceptado por el contrato.
    for (const id of ids) expect(Object.keys(CONTRATO), id).not.toContain(id);
    // Ni el manifest ni las instrucciones apuntan al documento del backlog (contiene el análisis del benchmark).
    expect(texto).not.toContain('AFI-CAPABILITY-BACKLOG');
    expect(await readFile(RUTA_INSTRUCCIONES, 'utf8')).not.toContain('AFI-CAPABILITY-BACKLOG');
    const doc = await readFile(RUTA_BACKLOG, 'utf8');
    for (const id of [...ids, ...FAMILIAS_SOPORTADAS.map(f => f.familia)]) expect(doc, id).toContain(`### ${id}\n`);
  });

  test('4D: solo salen del backlog las familias completas; las parciales declaran lo soportado y lo pendiente', () => {
    const soportadas = FAMILIAS_SOPORTADAS.map(f => f.familia);
    expect(soportadas).toEqual(['estado-campo', 'valor-campo']);
    expect(manifest.funcional.familiasSoportadas).toBe(FAMILIAS_SOPORTADAS);
    for (const f of FAMILIAS_BACKLOG) expect(soportadas, f.familia).not.toContain(f.familia);
    const tipos = Object.keys(CONTRATO);
    for (const f of FAMILIAS_SOPORTADAS) for (const op of f.operaciones) expect(tipos, f.familia).toContain(op);
    for (const f of FAMILIAS_BACKLOG) {
      for (const op of f.operacionesSoportadas) expect(tipos, f.familia).toContain(op);
      if (f.cobertura === 'parcial') {
        expect(f.operacionesSoportadas.length, f.familia).toBeGreaterThan(0);
        expect(f.pendiente?.trim(), f.familia).toBeTruthy();
      } else expect(f.operacionesSoportadas, f.familia).toEqual([]);
    }
    expect(FAMILIAS_BACKLOG.filter(f => f.cobertura === 'parcial').map(f => f.familia))
      .toEqual(['componente-visual', 'catalogo-semantico', 'entrada-validacion', 'autocomplete']);
    // 4E: la única assertion de sugerencias es según fuente; sin reglas libres ni "empieza por".
    expect(tipos.filter(t => /sugerencia/.test(t))).toEqual(['sugerencias-segun-fuente']);
    expect(tipos.some(t => /todas-cumplen|incluye|prefijo|empieza/.test(t))).toBe(false);
  });

  test('4D: catálogos cerrados de componentes y fuentes en el manifest, sin selectores ni textos de la UI', () => {
    expect(manifest.funcional.componentes.map(c => c.componente)).toEqual([...COMPONENTES_FUNCIONALES_AFI]);
    expect(manifest.funcional.fuentes.map(f => f.fuente)).toEqual(Object.keys(FUENTES_AUTORITATIVAS_AFI));
    expect(manifest.funcional.fuentes[0]).toMatchObject({ campos: ['ciudadVivienda'], filtros: ['departamento'] });
    expect(manifest.funcional.fuentes[0].noCertifica.join('\n')).toMatch(/conceptualmente bien configurada/);
    for (const o of manifest.funcional.operaciones) {
      const conComponente = CONTRATO[o.tipo as TipoOperacionFuncional].requeridas.includes('componente');
      expect('componentesAplicables' in o, o.tipo).toBe(conComponente);
    }
    // El estado de campo es funcional: no expone atributos DOM al agente.
    expect(JSON.stringify(operacion('campo-estado'))).not.toMatch(/disabled|readonly|aria-/i);
    // Textos con los que el driver identifica componentes: nunca en el manifest.
    expect(texto).not.toMatch(/Solo puedes afiliarte|localización vivienda|alertas-warn/);
  });
});

test.describe('AFI agent manifest — 4D.1 región y prioridad de ambigüedad', () => {
  test('D. componente-region: sincronizada, región cerrada, garantiza/noGarantiza, sin px/selectores/viewport configurable', () => {
    const op = operacion('componente-region');
    expect(op.parametros.requeridos).toEqual(['componente', 'region']);
    expect(op.parametros.opcionales).toEqual(['evidencia']);
    expect((op.parametros.detalle as Record<string, { valores?: readonly string[] }>).region.valores).toEqual(['superior']);
    expect(op.componentesAplicables).toEqual([...COMPONENTES_FUNCIONALES_AFI]);
    expect(op.garantiza).toEqual(['Que el componente visible se encuentra en la región canónica declarada de la pantalla.']);
    expect(op.noGarantiza.join('\n')).toMatch(/Posición exacta[\s\S]*Relación con otro componente[\s\S]*Texto, color o ícono[\s\S]*otros tamaños[\s\S]*persista/);
    expect(op.semantica).toContain(REGLAS_REGION.superior.descripcion);
    // El agente nunca aporta geometría: ningún parámetro de dimensiones, umbral o viewport.
    for (const p of [...op.parametros.requeridos, ...op.parametros.opcionales]) expect(p).not.toMatch(/px|viewport|ancho|alto|umbral|coordenada|caja/i);
    expect(texto).not.toMatch(/\d+\s*px\b/);
    expect(operacion('componente-posicion').noGarantiza.join('\n')).toMatch(/usar componente-region/);
    const familia = FAMILIAS_BACKLOG.find(f => f.familia === 'componente-visual')!;
    expect(familia.cobertura).toBe('parcial');
    expect(familia.operacionesSoportadas).toContain('componente-region');
    expect(familia.pendiente).toMatch(/Ausencia[\s\S]*texto[\s\S]*color e ícono[\s\S]*legibilidad[\s\S]*responsive/);
  });

  test('E. INFORMACION_INSUFICIENTE se evalúa antes y detiene el análisis de capabilities', async () => {
    expect(PROTOCOLO_DECISION.precedencia).toEqual(['INFORMACION_INSUFICIENTE', 'KNOWLEDGE_GAP', 'TESTABILITY_GAP', 'CAPABILITY_GAP']);
    const [p1, , , p2] = PROTOCOLO_DECISION.pasos;
    expect(p1).toMatchObject({ paso: 1, no: 'INFORMACION_INSUFICIENTE', si: 'paso 2' });
    expect(p1.pregunta).toMatch(/formular la condición observable COMPLETA[\s\S]*varias semánticas[\s\S]*Sin mirar todavía/);
    expect(p1.alNo).toMatch(/DETENERSE[\s\S]*no se analizan capabilities ni se reporta CAPABILITY_GAP/);
    expect(p2).toMatchObject({ paso: 4, requiere: 'paso 3 = sí', no: 'CAPABILITY_GAP' });
    const reglas = PROTOCOLO_DECISION.reglas.join('\n');
    expect(reglas).toMatch(/ANTES de consultar funcional\.operaciones[\s\S]*NO continúes al análisis de capabilities/);
    expect(reglas).toMatch(/nunca resuelve ni oculta una ambigüedad/);
    expect(PROTOCOLO_DECISION.ejemplos.find(e => /coincidan con X/.test(e.diseno))!.resultado).toMatch(/^INFORMACION_INSUFICIENTE/);
    // Instrucciones: el paso de ambigüedad va antes que el de capabilities, con la orden de detenerse.
    const md = await readFile(RUTA_INSTRUCCIONES, 'utf8');
    const protocolo = md.slice(md.indexOf('## Protocolo de decisión'), md.indexOf('## Seguridad'));
    expect(protocolo.indexOf('`INFORMACION_INSUFICIENTE`')).toBeGreaterThan(-1);
    expect(protocolo.indexOf('`INFORMACION_INSUFICIENTE`')).toBeLessThan(protocolo.indexOf('`CAPABILITY_GAP`'));
    expect(protocolo).toMatch(/Detente para ese requisito/);
    expect(protocolo).toMatch(/coincidan con X/);
    // Sin la respuesta del benchmark (ejemplo genérico, sin paso ni valores del caso).
    expect(`${md}\n${texto}`).not.toMatch(/\bChi\b|Ch[ií]a|\bP07\b|CP02/i);
  });
});

test.describe('AFI agent manifest — 4E sugerencias según fuente', () => {
  test('G. operación sincronizada, catálogos cerrados, fuentes y campos aplicables', () => {
    const op = operacion('sugerencias-segun-fuente');
    expect(op.parametros.requeridos).toEqual(['campo', 'fuente', 'filtroDesdeCampo', 'normalizacion', 'textoBusqueda', 'coincidencia', 'diacriticos', 'mayusculas']);
    const detalle = op.parametros.detalle as Record<string, { valores?: readonly string[]; descripcion: string }>;
    expect(detalle.coincidencia.valores).toEqual(['contiene']);
    expect(detalle.diacriticos.valores).toEqual(['sensibles']);
    expect(detalle.mayusculas.valores).toEqual(['sensibles', 'insensibles']);
    // Mayúsculas: sin valor por defecto; si las fuentes no lo definen, es ambigüedad, no elección del agente.
    expect(detalle.mayusculas.descripcion).toMatch(/Sin valor por defecto[\s\S]*INFORMACION_INSUFICIENTE/);
    expect(op.camposAplicables).toEqual(['ciudadVivienda']);
    expect((op as { fuentesAplicables?: string[] }).fuentesAplicables).toEqual(['parametrica-ciudad-nacional']);
    expect((operacion('catalogo-segun-fuente') as { fuentesAplicables?: string[] }).fuentesAplicables).toEqual(['parametrica-ciudad-nacional']);
  });

  test('G. garantiza / noGarantiza; familia autocomplete sigue parcial con lo pendiente', () => {
    const op = operacion('sugerencias-segun-fuente');
    expect(op.garantiza.join('\n')).toMatch(/al menos una sugerencia[\s\S]*pertenece al conjunto válido de la fuente[\s\S]*cumple la coincidencia declarada/);
    const no = op.noGarantiza.join('\n');
    for (const f of [/TODAS las coincidencias/, /Orden/, /otros textos/, /regla general de mayúsculas/, /aproximada, fonética/, /bien configurada/, /Selección[\s\S]*reapertura/]) {
      expect(no).toMatch(f);
    }
    expect(op.semantica).toMatch(/No escribe, no hace clic, no selecciona ni cierra/);
    const familia = FAMILIAS_BACKLOG.find(f => f.familia === 'autocomplete')!;
    expect(familia.cobertura).toBe('parcial');
    expect(familia.operacionesSoportadas).toContain('sugerencias-segun-fuente');
    expect(familia.pendiente).toMatch(/empieza por[\s\S]*diacríticos insensibles[\s\S]*completitud[\s\S]*localidad, barrio/);
    expect(FAMILIAS_SOPORTADAS.map(f => f.familia)).not.toContain('autocomplete');
  });

  test('G. sin selectores, expresiones regulares, código ni datos del caso', () => {
    const op = JSON.stringify(operacion('sugerencias-segun-fuente'));
    expect(op).not.toMatch(/regex|RegExp|function|=>|\$\{|getBy|locator|aria-|\[role|mat-|cdk-/i);
    expect(texto).not.toMatch(/\bChi\b|Ch[ií]a|CHÍA|Soa|CUNDINAMARCA|\bP0\d\b|CP02/);
  });
});

test.describe('AFI agent manifest — 4F fidelidad composicional', () => {
  const ejemplo = (regla: string) => COMPOSICION.ejemplos.find(e => e.regla === regla)!;
  const regla = (id: string) => COMPOSICION.reglas.find(r => r.id === id)!.regla;
  const ACCIONES = ['escribir', 'seleccionar-exacto', 'salir-del-campo', 'cerrar-catalogo'];
  /** ¿Hay una assertion (no acción) antes del evento? */
  const afirmaAntes = (secuencia: readonly string[], evento: string) =>
    secuencia.slice(0, secuencia.indexOf(evento)).some(op => !ACCIONES.includes(op));

  test('fuente canónica en el manifest, generada desde código; ejemplos solo con operaciones del contrato', () => {
    expect(manifest.protocoloDecision.composicion).toBe(COMPOSICION);
    expect(COMPOSICION.reglas.map(r => r.id)).toEqual(['transicion-demostrada', 'minimo-suficiente', 'identidad-vs-literal']);
    expect(COMPOSICION.analisis.partes).toEqual(['estado inicial relevante', 'acción', 'estado intermedio relevante', 'evento disparador', 'estado final']);
    for (const e of COMPOSICION.ejemplos) {
      expect(COMPOSICION.reglas.map(r => r.id)).toContain(e.regla);
      for (const op of [...('insuficiente' in e ? e.insuficiente : []), ...e.suficiente]) expect(Object.keys(CONTRATO), `${e.regla}: ${op}`).toContain(op);
    }
    expect(PROTOCOLO_DECISION.reglas.join('\n')).toMatch(/válido y compilable no basta[\s\S]*composicion/);
  });

  test('A. transición temporal: el estado final solo es insuficiente; se exige el estado intermedio antes del evento', () => {
    const e = ejemplo('transicion-demostrada');
    if (!('insuficiente' in e)) throw new Error('el ejemplo de transición debe mostrar la versión insuficiente');
    expect(afirmaAntes(e.insuficiente, 'salir-del-campo')).toBe(false);
    expect(afirmaAntes(e.suficiente, 'salir-del-campo')).toBe(true);
    // Mismo estado final en ambas: la diferencia es solo el estado intermedio.
    expect(e.suficiente.at(-1)).toBe(e.insuficiente.at(-1));
    expect(e.porque).toMatch(/pasaría también si el campo hubiera rechazado el texto desde el principio/);
    expect(regla('transicion-demostrada')).toMatch(/afirma A ANTES de la acción o evento que produce B[\s\S]*CAPABILITY_GAP; no se omite A/);
  });

  test('B. no redundancia: un requisito solo final no exige assertions intermedias', () => {
    const e = ejemplo('minimo-suficiente');
    expect('insuficiente' in e).toBe(false);
    // Acción y después una sola assertion del estado final; nada afirmado antes de la acción.
    expect(e.suficiente).toEqual(['seleccionar-exacto', 'campo-valor']);
    expect(afirmaAntes(e.suficiente, 'seleccionar-exacto')).toBe(false);
    expect(regla('minimo-suficiente')).toMatch(/solo los estados que distinguen[\s\S]*únicamente un estado final[\s\S]*no añadas assertions intermedias/);
  });

  test('C. normalización: identidad de una opción ≠ assertion explícita de escritura; solo normalizaciones publicadas', () => {
    const r = regla('identidad-vs-literal');
    expect(r).toMatch(/IDENTIFICAR una opción[\s\S]*normalización publicada/);
    expect(r).toMatch(/no afirme la escritura NO implica comparación literal/);
    expect(r).toMatch(/comparación literal[\s\S]*solo si el requisito certifica el texto exacto/);
    expect(r).toMatch(/Nunca asumas una normalización que el manifest no publique/);
    const e = ejemplo('identidad-vs-literal');
    expect('contraste' in e && e.contraste).toMatch(/certifica la escritura: comparación literal/);
    // Las normalizaciones que la regla nombra existen en el contrato.
    const detalle = (tipo: string, param: string) => (operacion(tipo).parametros.detalle as Record<string, { valores?: readonly string[]; descripcion: string }>)[param];
    expect(detalle('seleccionar-exacto', 'normalizacion').valores).toEqual(['texto-es']);
    expect(detalle('campo-valor', 'comparacion').valores).toContain('texto-es');
    expect(detalle('seleccionar-exacto', 'normalizacion').descripcion).toMatch(/identidad-vs-literal/);
    expect(detalle('campo-valor', 'comparacion').descripcion).toMatch(/solo si el requisito certifica la escritura[\s\S]*identidad-vs-literal/);
  });

  test('D. blindaje: sin casos, pasos ni valores de HU; instrucciones resumen cada regla canónica', async () => {
    const md = await readFile(RUTA_INSTRUCCIONES, 'utf8');
    const prohibido = /CP02|\bP06\b|Zxyw|Ch[ií]a|Cundinamarca|Bogot/i;
    expect(md).not.toMatch(prohibido);
    expect(texto).not.toMatch(prohibido);
    expect(JSON.stringify(COMPOSICION)).not.toMatch(/HU 14|CP0\d|\bP\d{2}\b/);
    const seccion = md.slice(md.indexOf('## Composición fiel'), md.indexOf('## Seguridad'));
    expect(seccion).toContain('protocoloDecision.composicion');
    for (const { id } of COMPOSICION.reglas) expect(seccion, id).toContain(`\`${id}\``);
  });
});

test.describe('AFI agent manifest — 4I-A fidelidad del diagnóstico', () => {
  const ejemplo = (regla: string) => DIAGNOSTICO.ejemplos.find(e => e.regla === regla)!;
  const regla = (id: string) => DIAGNOSTICO.reglas.find(r => r.id === id)!.regla;
  const OPERACIONES = manifest.funcional.operaciones.map(o => o.tipo as string);

  test('fuente canónica: diagnostico dentro de protocoloDecision, banderas y orden de búsqueda', () => {
    expect(manifest.protocoloDecision.diagnostico).toBe(DIAGNOSTICO);
    expect(JSON.parse(texto).protocoloDecision.diagnostico).toEqual(JSON.parse(JSON.stringify(DIAGNOSTICO)));
    expect([DIAGNOSTICO.ambiguedadAntesDeCapability, DIAGNOSTICO.composicionAntesDeGap, DIAGNOSTICO.backlogNoImplicaGap]).toEqual([true, true, true]);
    expect(DIAGNOSTICO.reglas.map(r => r.id)).toEqual([
      'ambiguedad-antes-de-capability', 'composicion-antes-de-gap', 'backlog-no-implica-gap', 'gap-minimo-de-campo', 'condicionalidad',
      'minimo-suficiente-evidencia', 'transicion-destino', 'condicion-atomica', 'stop-primera-capa', 'regla-con-predicado', 'trazabilidad-de-consecuencias',
    ]);
    expect(DIAGNOSTICO.busqueda.map(b => b.split(' ').slice(0, 2).join(' '))).toEqual(['una operación', 'una composición', 'solo si']);
    expect(DIAGNOSTICO.busqueda[2]).toMatch(/ninguna composición fiel[\s\S]*CAPABILITY_GAP$/);
    // El paso 2 del protocolo usa ese mismo orden (una sola fuente, sin copiar texto).
    const p2 = PROTOCOLO_DECISION.pasos[3];
    expect('orden' in p2 && p2.orden).toBe(DIAGNOSTICO.busqueda);
    expect(p2.pregunta).toMatch(/composición mínima de operaciones existentes/);
    for (const e of DIAGNOSTICO.ejemplos) expect(DIAGNOSTICO.reglas.map(r => r.id)).toContain(e.regla);
  });

  test('A. comportamiento compuesto por operaciones existentes: representable, no capability faltante', () => {
    const e = ejemplo('composicion-antes-de-gap');
    if (!('composicion' in e)) throw new Error('el ejemplo debe mostrar la composición');
    for (const op of e.composicion) expect(OPERACIONES).toContain(op);
    // Coincide con la composición fiel canónica de una transición (se afirma el estado intermedio).
    expect(e.composicion).toEqual(COMPOSICION.ejemplos.find(x => x.regla === 'transicion-demostrada')!.suficiente);
    expect(e.resultado).toMatch(/^REPRESENTABLE/);
    expect(e.resultado).not.toMatch(/CAPABILITY_GAP/);
    expect(e.noEs).toMatch(/capability faltante[\s\S]*emerge de la composición/);
    expect(regla('composicion-antes-de-gap')).toMatch(/operación individual[\s\S]*composición mínima[\s\S]*no se describe como capability faltante/);
    // Ninguna familia del backlog declara como pendiente lo que ya emerge de esa composición.
    for (const f of FAMILIAS_BACKLOG) expect(f.pendiente ?? '', f.familia).not.toMatch(/limpi|perder el foco|al salir/i);
  });

  test('B. operación existente + campo no catalogado: únicamente el gap del campo', () => {
    const e = ejemplo('gap-minimo-de-campo');
    if (!('gaps' in e)) throw new Error('el ejemplo debe listar los gaps');
    expect(OPERACIONES).toContain(e.operacionExistente);
    expect(e.gaps).toHaveLength(1);
    // 4M: nombrar un campo es conocimiento declarativo, no una capability.
    expect(e.gaps[0]).toEqual({ salida: 'KNOWLEDGE_GAP', conocimientoFaltante: 'declarar el campo X (tipo campo-ui) en el Field Registry' });
    expect(e.noEs).toMatch(/rechazo de caracteres[\s\S]*ya existe/);
    expect(regla('gap-minimo-de-campo')).toMatch(/únicamente el gap del CAMPO[\s\S]*salvo que exista además otro comportamiento/);
  });

  test('C. una familia relacionada en backlog no implica gap si una composición soportada demuestra el requisito', () => {
    const e = ejemplo('backlog-no-implica-gap');
    if (!('familiaRelacionada' in e)) throw new Error('el ejemplo debe nombrar la familia');
    const familia = FAMILIAS_BACKLOG.find(f => f.familia === e.familiaRelacionada)!;
    expect(familia.cobertura).toBe('parcial');
    // La composición de A está íntegramente dentro de lo que esa familia ya soporta.
    const a = ejemplo('composicion-antes-de-gap');
    if (!('composicion' in a)) throw new Error();
    for (const op of a.composicion) expect(familia.operacionesSoportadas).toContain(op);
    expect(e.resultado).toMatch(/REPRESENTABLE aunque la familia siga en backlog/);
    expect(regla('backlog-no-implica-gap')).toMatch(/NO es evidencia de un gap[\s\S]*no el requisito concreto/);
    expect(manifest.backlog.advertencia).toMatch(/no prueba un gap/);
    expect(PROTOCOLO_DECISION.reglas.join('\n')).toMatch(/solo si el requisito concreto lo necesita y ninguna operación ni composición soportada/);
  });

  test('D. búsqueda predictiva con coincidencia indefinida: INFORMACION_INSUFICIENTE antes de capabilities', () => {
    expect(PROTOCOLO_DECISION.precedencia).toEqual(['INFORMACION_INSUFICIENTE', 'KNOWLEDGE_GAP', 'TESTABILITY_GAP', 'CAPABILITY_GAP']);
    expect(DIAGNOSTICO.condicionObservable).toEqual(['dato de entrada', 'condición', 'relación de coincidencia o comparación', 'evento', 'resultado observable']);
    const e = ejemplo('ambiguedad-antes-de-capability');
    if (!('noAsumir' in e)) throw new Error('el ejemplo debe listar lo que no se asume');
    expect(e.resultado).toBe('INFORMACION_INSUFICIENTE, sin analizar capabilities.');
    expect(e.faltante.join('\n')).toMatch(/qué entrada[\s\S]*relación de coincidencia/);
    expect(e.noAsumir).toEqual(['contiene', 'prefijo', 'mayúsculas/minúsculas', 'diacríticos']);
    expect(e.siDefinido).toMatch(/define explícitamente[\s\S]*se continúa al análisis de capabilities/);
    expect(regla('ambiguedad-antes-de-capability')).toMatch(/Antes de consultar el manifest[\s\S]*INFORMACION_INSUFICIENTE[\s\S]*se detiene el análisis de capabilities de ESA condición/);
  });

  test('E. condicionalidad y transición: definida pero no expresable = CAPABILITY_GAP; no definida = INFORMACION_INSUFICIENTE', () => {
    for (const id of ['condicionalidad', 'transicion-destino']) {
      const e = ejemplo(id);
      if (!('casos' in e)) throw new Error(`${id}: casos`);
      expect(e.casos.map(c => c.resultado.split(' ')[0])).toEqual(['CAPABILITY_GAP', 'INFORMACION_INSUFICIENTE']);
      // La familia citada existe en el backlog.
      const familia = e.casos[0].resultado.match(/familia ([\w-]+)/)![1];
      expect(FAMILIAS_BACKLOG.map(f => f.familia)).toContain(familia);
    }
    expect(regla('condicionalidad')).toMatch(/no es automáticamente un gap/);
    expect(regla('transicion-destino')).toMatch(/transicion-demostrada/);
    // Sin cambios en la regla de transición demostrada.
    expect(COMPOSICION.reglas.map(r => r.id)).toEqual(['transicion-demostrada', 'minimo-suficiente', 'identidad-vs-literal']);
  });

  test('F. blindaje: sin HU, casos, pasos, campos ni valores del benchmark; instrucciones resumen cada regla', async () => {
    const prohibido = /HU\s*1\d|CP0\d|\bP\d{2}\b|Localidad|Barrio|Ciudad|Zxyw|\bChi\b|Ch[ií]a?\b|Cundinamarca|Bogot|departamento|ciudadVivienda/i;
    expect(JSON.stringify(DIAGNOSTICO)).not.toMatch(prohibido);
    const md = await readFile(RUTA_INSTRUCCIONES, 'utf8');
    const seccion = md.slice(md.indexOf('## Diagnóstico'), md.indexOf('## Seguridad'));
    expect(seccion).not.toMatch(prohibido);
    expect(seccion).toContain('protocoloDecision.diagnostico');
    for (const { id } of DIAGNOSTICO.reglas) expect(seccion, id).toContain(`\`${id}\``);
    expect(md.split('\n').length).toBeLessThan(120);
  });
});

test.describe('AFI agent manifest — seguridad y protocolo', () => {
  test('sin PII ni valores de actores', () => {
    for (const perfil of Object.keys(ENTORNOS) as (keyof typeof ENTORNOS)[]) {
      const a = actorDesdeEntorno(perfil, ENTORNOS[perfil]);
      for (const [campo, valor] of Object.entries(a.datos)) {
        if (POLITICAS_AFI[campo as keyof typeof POLITICAS_AFI].sensibilidad !== 'public' && typeof valor === 'string') {
          expect(texto.includes(valor), `${perfil}.${campo}`).toBe(false);
        }
      }
    }
    expect(texto).not.toMatch(/AFI_(QA|CP)\w*|@|\d{5,}/);
  });

  test('sin selectores ni locators', () => {
    expect(texto).not.toMatch(/#[a-z][\w-]*|\[[a-z-]+=|formcontrolname|getBy|locator\(|xpath|css=|mat-[a-z]|cdk-|process\.env/i);
  });

  test('no contiene el golden CP04 ni la respuesta del benchmark', () => {
    expect(texto).not.toMatch(/228503|CP0\d|PLAN_FUNCIONAL|cp04|HU 14\.12/i);
    const literales = [ALERTA_TERRITORIAL_CP04, ...PLAN_FUNCIONAL_CP04.pasos.flatMap(p => [p.esperado, ...p.operaciones.flatMap(op => Object.values(op).flat())])]
      .filter((v): v is string => typeof v === 'string' && !(v in TODAS_OPERACIONES) && !(v in TODOS_CAMPOS_FUNCIONALES) && !['exacta', 'contiene', 'texto-es'].includes(v));
    for (const l of literales) expect(texto.includes(l), l).toBe(false);
  });

  test('protocolo: GENERABLE / CAPABILITY_GAP / INFORMACION_INSUFICIENTE con sus formatos', () => {
    expect(Object.keys(PROTOCOLO_DECISION.salidas)).toEqual(['GENERABLE', 'CAPABILITY_GAP', 'INFORMACION_INSUFICIENTE', 'KNOWLEDGE_GAP', 'TESTABILITY_GAP']);
    expect(PROTOCOLO_DECISION.salidas.CAPABILITY_GAP.formato).toEqual(['CAPABILITY_GAP', '', '- paso:', '- requisito:', '- capability faltante:', '- familia:']);
    expect(PROTOCOLO_DECISION.salidas.INFORMACION_INSUFICIENTE.formato)
      .toEqual(['INFORMACION_INSUFICIENTE', '', '- paso:', '- significado conocido:', '- información faltante:']);
    expect(PROTOCOLO_DECISION.pasos.map(p => [p.paso, p.no])).toEqual([[1, 'INFORMACION_INSUFICIENTE'], [2, 'KNOWLEDGE_GAP'], [3, 'TESTABILITY_GAP'], [4, 'CAPABILITY_GAP']]);
    expect(manifest.protocoloDecision).toBe(PROTOCOLO_DECISION);
  });

  test('AFI-AGENT-INSTRUCTIONS.md: corto, referencia el manifest y el protocolo, sin golden ni PII', async () => {
    const md = await readFile(RUTA_INSTRUCCIONES, 'utf8');
    expect(md.split('\n').length).toBeLessThan(120);
    for (const s of ['AFI-AGENT-MANIFEST.json', 'AFI-CASE-CONTRACT.md', 'GENERABLE', 'CAPABILITY_GAP', 'INFORMACION_INSUFICIENTE', 'noGarantiza', 'PII',
      'ejecucion.contextos', 'soportadoRunnerV1', 'backlog', '- familia:', 'requerimiento', 'metadata']) {
      expect(md, s).toContain(s);
    }
    expect(md).not.toMatch(/228503|CP0\d|cp04|PLAN_FUNCIONAL|ANTIOQUIA|CUNDINAMARCA|@|\d{5,}/i);
  });

  test('fuentes: jerarquía metadata > diseño > requerimiento > manifest > contrato; conflicto = INFORMACION_INSUFICIENTE', () => {
    expect(PROTOCOLO_DECISION.fuentes.jerarquia.map(f => f.fuente)).toEqual(['metadata', 'diseno-qa', 'requerimiento', 'manifest', 'contrato']);
    const reglas = PROTOCOLO_DECISION.fuentes.reglas.join('\n');
    expect(reglas).toMatch(/no puede ampliar el alcance/);
    expect(reglas).toMatch(/contradicen[\s\S]*INFORMACION_INSUFICIENTE[\s\S]*nunca elegir en silencio/);
  });

  test('una definición que declara el punto funcional o direccion no pasa el runner v1', () => {
    // El contrato las admite como etapas del MODELO; el manifest las marca como no declarables.
    for (const etapa of ['informacion-contacto', 'direccion'] as const) {
      expect(validarDefinicionCasoAfi({
        version: VERSION_CASO_AFI, hu: 'x', caso: 'x', nombre: 'x', perfil: 'empresa',
        preparacion: { datosCaso: {}, camposAsercion: [], etapas: ['inicio-solicitud', etapa] },
        funcional: { caso: 'x', pasos: [{ id: 'x', esperado: 'x', operaciones: [{ tipo: 'catalogo-no-vacio', campo: 'departamento' }] }] },
      })).toEqual([]);
      expect((ETAPAS_RUNNER_V1 as readonly string[]).includes(etapa)).toBe(false);
    }
  });
});
