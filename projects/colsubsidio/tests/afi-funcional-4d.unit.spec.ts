import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CP04_EMPRESA } from '../data/afi/casos/hu14-12-cp04';
import { validarDefinicionCasoAfi } from '../data/afi/caso';
import { resolverCatalogoFuente, type InstantaneaFuente, type RegistroFuente, type RespuestaEntidad } from '../data/afi/fuentes';
import {
  CONTRATO, compararCatalogos, cumpleBusqueda, evaluarCatalogo, evaluarRegionComponente, evaluarSugerencias, validarPlanFuncionalAfi,
  type OperacionFuncionalAfi, type PasoFuncionalAfi, type ResultadoOperacionAfi,
} from '../data/afi/funcional';
import { AfiFunctionalUi } from '../helpers/afiFunctionalUi';
import { FuenteParametricaPortal, type ProveedorFuenteAfi } from '../helpers/fuenteParametrica';

/**
 * Fase 4D: capabilities funcionales desktop de Información de contacto.
 * Datos FICTICIOS (departamentos y municipios inventados): nada depende de un caso real.
 */

type Op = Record<string, unknown>;
const plan = (...ops: Op[]) => ({ caso: 'x', pasos: [{ id: 'x', esperado: 'x', operaciones: ops }] });
const problemas = (...ops: Op[]) => validarPlanFuncionalAfi(plan(...ops)).map(p => [p.ruta.replace('pasos[0].operaciones', 'op'), p.clase]);
const FUENTE = {
  tipo: 'catalogo-segun-fuente', campo: 'ciudadVivienda', fuente: 'parametrica-ciudad-nacional',
  filtroDesdeCampo: 'departamento', relacion: 'igual', normalizacion: 'texto-es',
} as const;

// ---------- Datos de fuente ficticios ----------
const depto = (codigo: string, descripcion: string, extra: Op = {}): RegistroFuente => ({ sCodigo: codigo, sDescripcion: descripcion, ...extra });
const muni = (descripcion: string, padre: string, extra: Op = {}): RegistroFuente =>
  ({ sCodigo: `${padre}-${descripcion}`, sDescripcion: descripcion, 'kpDepartamento.sCodigo': padre, dsbl: false, ...extra });
const DEPARTAMENTOS: RespuestaEntidad = {
  entidad: 'dep', paginada: false,
  registros: [depto('10', 'DEPTO NORTE'), depto('20', 'DEPTO SUR'), depto('30', 'DISTRITO CAPITAL'), depto('40', 'DEPTO VIEJO', { dsbl: true })],
};
const MUNICIPIOS: RespuestaEntidad = {
  entidad: 'mun', paginada: false,
  registros: [
    muni('VILLA ÁLAMO', '10'), muni('SAN JOSÉ', '10'), muni('PUERTO NUEVO', '10'), muni('PUEBLO CERRADO', '10', { dsbl: true }),
    muni('LAS PEÑAS', '20'), muni('DISTRITO CAPITAL', '30'), muni('ANTIGUA', '40'),
  ],
};
const instantanea = (respuestas: RespuestaEntidad[], extra: Partial<InstantaneaFuente> = {}): InstantaneaFuente =>
  ({ respuestas, lecturasRespaldo: 0, ilegibles: 0, vacias: 0, ...extra });
const resolver = (inst: InstantaneaFuente, filtro: string) => resolverCatalogoFuente('parametrica-ciudad-nacional', inst, filtro, 'texto-es');
const proveedor = (inst: InstantaneaFuente): ProveedorFuenteAfi => ({ instantanea: async () => inst, cerrar: async () => undefined });

// =====================================================================================
test.describe('4D contrato — validación estricta', () => {
  test('A. componentes: catálogo cerrado, relación cerrada, referencia distinta', () => {
    expect(problemas({ tipo: 'componente-visible', componente: 'alerta-territorial' })).toEqual([]);
    expect(problemas({ tipo: 'componente-visible', componente: 'banner-x' })).toEqual([['op[0].componente', 'capability']]);
    expect(problemas({ tipo: 'componente-visible', componente: 'alerta-territorial', selector: '.x' })).toEqual([['op[0].selector', 'invalido']]);
    const pos = { tipo: 'componente-posicion', componente: 'alerta-territorial', relacion: 'debajo-de', referencia: 'subtitulo-localizacion-vivienda' };
    expect(problemas(pos)).toEqual([]);
    expect(problemas({ ...pos, relacion: 'encima-de' })).toEqual([]);
    expect(problemas({ ...pos, referencia: 'pie-de-pagina' })).toEqual([['op[0].referencia', 'capability']]);
    expect(problemas({ ...pos, relacion: 'a-la-izquierda' })).toEqual([['op[0].relacion', 'capability']]);
    expect(problemas({ ...pos, referencia: 'alerta-territorial' })).toEqual([['op[0].referencia', 'invalido']]);
  });

  test('B. campo-estado: editable / solo-lectura; otro valor es capability', () => {
    for (const estado of ['editable', 'solo-lectura']) expect(problemas({ tipo: 'campo-estado', campo: 'ciudadVivienda', estado })).toEqual([]);
    expect(problemas({ tipo: 'campo-estado', campo: 'ciudadVivienda', estado: 'deshabilitado' })).toEqual([['op[0].estado', 'capability']]);
    expect(problemas({ tipo: 'campo-estado', campo: 'barrio', estado: 'editable' })).toEqual([['op[0].campo', 'capability']]);
    expect(problemas({ tipo: 'campo-estado', campo: 'ciudadVivienda' })).toEqual([['op[0].estado', 'invalido']]);
  });

  test('C. campo-valor: dos formas excluyentes', () => {
    const base = { tipo: 'campo-valor', campo: 'ciudadVivienda' };
    expect(problemas({ ...base, valor: 'X', comparacion: 'exacta' })).toEqual([]);
    expect(problemas({ ...base, valor: 'X', comparacion: 'texto-es' })).toEqual([]);
    expect(problemas({ ...base, vacio: true })).toEqual([]);
    expect(problemas({ ...base, valor: 'X', comparacion: 'exacta', vacio: true })).toEqual([['op[0].vacio', 'invalido']]);
    expect(problemas(base)).toEqual([['op[0]', 'invalido']]);
    expect(problemas({ ...base, valor: 'X' })).toEqual([['op[0].comparacion', 'invalido']]);
    expect(problemas({ ...base, valor: '', comparacion: 'exacta' })).toEqual([['op[0].valor', 'invalido']]);
    expect(problemas({ ...base, vacio: false })).toEqual([['op[0].vacio', 'invalido']]);
    expect(problemas({ ...base, vacio: true, comparacion: 'exacta' })).toEqual([['op[0].comparacion', 'invalido']]);
    expect(problemas({ ...base, valor: 'X', comparacion: 'regex' })).toEqual([['op[0].comparacion', 'capability']]);
  });

  test('D. escribir / entrada-rechazada / salir-del-campo', () => {
    expect(problemas({ tipo: 'escribir', campo: 'ciudadVivienda', texto: 'Zxyw' })).toEqual([]);
    expect(problemas({ tipo: 'escribir', campo: 'ciudadVivienda', texto: '' })).toEqual([['op[0].texto', 'invalido']]);
    expect(problemas({ tipo: 'escribir', campo: 'ciudadVivienda', texto: 'x', evidencia: 'e' })).toEqual([['op[0].evidencia', 'invalido']]);
    expect(problemas({ tipo: 'entrada-rechazada', campo: 'ciudadVivienda', texto: '@#$%&*' })).toEqual([]);
    expect(problemas({ tipo: 'salir-del-campo', campo: 'ciudadVivienda' })).toEqual([]);
    expect(problemas({ tipo: 'salir-del-campo', campo: 'ciudadVivienda', elemento: 'h2' })).toEqual([['op[0].elemento', 'invalido']]);
  });

  test('F. catalogo-segun-fuente: fuente, relación, normalización y combinación cerradas', () => {
    expect(problemas(FUENTE)).toEqual([]);
    expect(problemas({ ...FUENTE, fuente: 'dane' })).toEqual([['op[0].fuente', 'capability']]);
    expect(problemas({ ...FUENTE, relacion: 'subconjunto' })).toEqual([['op[0].relacion', 'capability']]);
    expect(problemas({ ...FUENTE, normalizacion: 'ninguna' })).toEqual([['op[0].normalizacion', 'capability']]);
    expect(problemas({ ...FUENTE, filtroDesdeCampo: 'pais' })).toEqual([['op[0].filtroDesdeCampo', 'capability']]);
    expect(problemas({ ...FUENTE, filtroDesdeCampo: 'ciudadVivienda' })).toEqual([['op[0].filtroDesdeCampo', 'invalido']]);
    // La fuente no describe departamento ni se filtra por ciudad.
    expect(problemas({ ...FUENTE, campo: 'departamento', filtroDesdeCampo: 'ciudadVivienda' }))
      .toEqual([['op[0].campo', 'capability'], ['op[0].filtroDesdeCampo', 'capability']]);
    const sinFiltro: Op = { ...FUENTE };
    delete sinFiltro.filtroDesdeCampo;
    expect(problemas(sinFiltro)).toEqual([['op[0].filtroDesdeCampo', 'invalido']]);
  });

  test('G. seleccionar-exacto: normalizacion opcional y cerrada', () => {
    expect(problemas({ tipo: 'seleccionar-exacto', campo: 'departamento', valor: 'X' })).toEqual([]);
    expect(problemas({ tipo: 'seleccionar-exacto', campo: 'departamento', valor: 'X', normalizacion: 'texto-es' })).toEqual([]);
    expect(problemas({ tipo: 'seleccionar-exacto', campo: 'departamento', valor: 'X', normalizacion: 'fonetica' })).toEqual([['op[0].normalizacion', 'capability']]);
  });

  test('P07 sigue fuera: no hay operación para afirmar sugerencias de un texto parcial', () => {
    for (const tipo of ['catalogo-todas-cumplen', 'catalogo-incluye', 'sugerencias-filtradas']) {
      expect(problemas({ tipo, campo: 'ciudadVivienda', texto: 'x' })).toEqual([['op[0].tipo', 'capability']]);
    }
  });
});

// =====================================================================================
test.describe('4D modelo puro — seleccionar-exacto y comparación', () => {
  test('G. sin normalizacion conserva EXACTAMENTE la semántica anterior', () => {
    const op = { tipo: 'seleccionar-exacto', campo: 'departamento', valor: 'DEPTO NORTE' } as const;
    expect(evaluarCatalogo(op, ['DEPTO NORTE', 'DEPTO SUR'])).toEqual({
      tipo: 'seleccionar-exacto', campo: 'departamento', valorEsperado: 'DEPTO NORTE', resultado: 'PASS', observado: { coincidenciasExactas: 1 } });
    expect(evaluarCatalogo(op, ['Depto Norte'])).toMatchObject({ resultado: 'FAIL', observado: { coincidenciasExactas: 0 } });
    expect(evaluarCatalogo(op, ['DEPTO NORTE', 'DEPTO NORTE'])).toMatchObject({ resultado: 'FAIL', observado: { coincidenciasExactas: 2 } });
    // Contrato previo intacto: mismos requeridos.
    expect(CONTRATO['seleccionar-exacto'].requeridas).toEqual(['campo', 'valor']);
  });

  test('G. con texto-es admite mayúsculas/tildes/puntuación y elige la opción OBSERVADA; ambigüedad => FAIL', () => {
    const op = { tipo: 'seleccionar-exacto', campo: 'departamento', valor: 'Depto Norté.', normalizacion: 'texto-es' } as const;
    expect(evaluarCatalogo(op, ['DEPTO NORTE', 'DEPTO SUR'])).toEqual({
      tipo: 'seleccionar-exacto', campo: 'departamento', valorEsperado: 'Depto Norté.', resultado: 'PASS',
      observado: { normalizacion: 'texto-es', coincidenciasNormalizadas: 1, valorSeleccionado: 'DEPTO NORTE' },
    });
    expect(evaluarCatalogo(op, ['DEPTO NORTE', 'Depto, Norte'])).toEqual({
      tipo: 'seleccionar-exacto', campo: 'departamento', valorEsperado: 'Depto Norté.', resultado: 'FAIL',
      observado: { normalizacion: 'texto-es', coincidenciasNormalizadas: 2 },
    });
    expect(evaluarCatalogo(op, ['DEPTO SUR']).resultado).toBe('FAIL');
  });

  test('comparación como multiconjunto normalizado: faltantes, sobrantes, duplicados', () => {
    expect(compararCatalogos(['villa alamo', 'SAN JOSE'], ['SAN JOSÉ', 'VILLA ÁLAMO'], 'texto-es')).toEqual({ igual: true, faltantes: [], sobrantes: [] });
    expect(compararCatalogos(['SAN JOSÉ'], ['SAN JOSÉ', 'VILLA ÁLAMO'], 'texto-es')).toEqual({ igual: false, faltantes: ['VILLA ÁLAMO'], sobrantes: [] });
    expect(compararCatalogos(['SAN JOSÉ', 'LAS PEÑAS'], ['SAN JOSÉ'], 'texto-es')).toEqual({ igual: false, faltantes: [], sobrantes: ['LAS PEÑAS'] });
    expect(compararCatalogos(['SAN JOSÉ', 'SAN JOSE'], ['SAN JOSÉ'], 'texto-es')).toEqual({ igual: false, faltantes: [], sobrantes: ['SAN JOSE'] });
  });
});

// =====================================================================================
test.describe('4D fuente autoritativa — resolución pura (fail-closed)', () => {
  test('E. catálogo completo del departamento, solo registros activos', () => {
    const r = resolver(instantanea([DEPARTAMENTOS, MUNICIPIOS]), 'DEPTO NORTE');
    expect(r).toEqual({ ok: true, esperadas: ['VILLA ÁLAMO', 'SAN JOSÉ', 'PUERTO NUEVO'], claveFiltro: '10', registrosFuente: 7 });
  });

  test('E. relación por departamento: el filtro sale del VALOR actual y de la propia fuente', () => {
    expect(resolver(instantanea([DEPARTAMENTOS, MUNICIPIOS]), 'Depto Sur')).toMatchObject({ ok: true, esperadas: ['LAS PEÑAS'], claveFiltro: '20' });
    expect(resolver(instantanea([MUNICIPIOS, DEPARTAMENTOS]), 'distrito capital')).toMatchObject({ ok: true, esperadas: ['DISTRITO CAPITAL'] });
  });

  test('E. departamento desconocido, inactivo, vacío o ambiguo', () => {
    const inst = instantanea([DEPARTAMENTOS, MUNICIPIOS]);
    expect(resolver(inst, 'DEPTO OESTE')).toMatchObject({ ok: false, motivo: 'filtro-no-resoluble' });
    expect(resolver(inst, 'DEPTO VIEJO')).toMatchObject({ ok: false, motivo: 'filtro-no-resoluble' });
    expect(resolver(inst, '  ')).toMatchObject({ ok: false, motivo: 'filtro-vacio' });
    const duplicado: RespuestaEntidad = { entidad: 'dep2', paginada: false, registros: [depto('20', 'DEPTO NORTE')] };
    expect(resolver(instantanea([DEPARTAMENTOS, duplicado, MUNICIPIOS]), 'DEPTO NORTE')).toMatchObject({ ok: false, motivo: 'filtro-ambiguo' });
  });

  test('E. relación inexistente: padre sin municipios, o solo inactivos', () => {
    const sinHijos: RespuestaEntidad = { ...DEPARTAMENTOS, registros: [...DEPARTAMENTOS.registros, depto('50', 'DEPTO ISLA')] };
    expect(resolver(instantanea([sinHijos, MUNICIPIOS]), 'DEPTO ISLA')).toMatchObject({ ok: false, motivo: 'relacion-inexistente' });
    const inactivos: RespuestaEntidad = { ...MUNICIPIOS, registros: [muni('A', '10', { dsbl: true })] };
    expect(resolver(instantanea([DEPARTAMENTOS, inactivos]), 'DEPTO NORTE')).toMatchObject({ ok: false, motivo: 'relacion-inexistente' });
  });

  test('E. respuesta vacía, no observada, paginada, ilegible o ambigua', () => {
    expect(resolver(instantanea([DEPARTAMENTOS], { vacias: 1 }), 'DEPTO NORTE')).toMatchObject({ ok: false, motivo: 'fuente-vacia' });
    expect(resolver(instantanea([DEPARTAMENTOS]), 'DEPTO NORTE')).toMatchObject({ ok: false, motivo: 'fuente-no-observada' });
    expect(resolver(instantanea([DEPARTAMENTOS, { ...MUNICIPIOS, paginada: true }]), 'DEPTO NORTE')).toMatchObject({ ok: false, motivo: 'fuente-incompleta' });
    expect(resolver(instantanea([DEPARTAMENTOS, MUNICIPIOS], { ilegibles: 1 }), 'DEPTO NORTE')).toMatchObject({ ok: false, motivo: 'fuente-ilegible' });
    expect(resolver(instantanea([DEPARTAMENTOS, MUNICIPIOS, { ...MUNICIPIOS, entidad: 'mun2' }]), 'DEPTO NORTE')).toMatchObject({ ok: false, motivo: 'fuente-ambigua' });
  });

  test('E. sin heurística: un municipio conocido no resuelve un departamento que la fuente no entregó', async () => {
    const soloMunicipios: RespuestaEntidad = { entidad: 'mun', paginada: false, registros: [muni('CHÍA', '25'), muni('SOACHA', '25')] };
    expect(resolver(instantanea([soloMunicipios]), 'CUNDINAMARCA')).toMatchObject({ ok: false, motivo: 'filtro-no-resoluble' });
    // Ni la fuente, ni el proveedor, ni el driver conocen municipios, departamentos o códigos de un caso.
    for (const archivo of ['../data/afi/fuentes.ts', '../helpers/fuenteParametrica.ts', '../helpers/afiFunctionalUi.ts']) {
      const fuente = await readFile(resolve(__dirname, archivo), 'utf8');
      expect(fuente, archivo).not.toMatch(/CH[IÍ]A|SOACHA|CUNDINAMARCA|BOGOT|['"](11|25)['"]|cp02/i);
      // Tampoco reutiliza el helper histórico (que deducía el departamento desde un municipio del caso).
      expect(fuente, archivo).not.toMatch(/from '\.\/(ciudadNacional|cp02Contacto|contactoMobile)'|new CiudadNacional\(/);
    }
  });
});

// =====================================================================================
// DOM mínimo de Información de contacto (autocompletes estilo mat-autocomplete), configurable.
interface ConfigDom {
  modo?: 'libre' | 'filtro' | 'diferido';
  limpiarAlSalir?: boolean;
  alerta?: 'debajo' | 'arriba' | 'ninguna' | 'doble';
  deshabilitarAlBloquear?: boolean;
  tapaTitulo?: boolean;
  /** Alto (px) de contenido previo al subtítulo: empuja los componentes hacia abajo. */
  espaciador?: number;
  ciudades?: Record<string, string[]>;
  /** Filtro en vivo al escribir: como el Portal (contiene, sin distinguir mayúsculas, respetando tildes) o quitando tildes. */
  buscar?: 'ninguno' | 'portal' | 'sin-tildes';
  /** Un clic en el campo repinta el catálogo completo (restablece el filtro). */
  resetAlClic?: boolean;
  /** Sugerencias añadidas al filtrar aunque no estén en el catálogo. */
  extraSugerencias?: string[];
  /** Sin coincidencias el panel se cierra (como mat-autocomplete). */
  cerrarSiVacio?: boolean;
}
const CIUDADES_UI: Record<string, string[]> = {
  'DEPTO NORTE': ['VILLA ÁLAMO', 'SAN JOSÉ', 'PUERTO NUEVO'],
  'DEPTO SUR': ['LAS PEÑAS'],
  'DISTRITO CAPITAL': ['DISTRITO CAPITAL'],
};
function contacto(c: ConfigDom = {}): string {
  const cfg = {
    modo: 'libre', limpiarAlSalir: false, bloqueaCon: 'DISTRITO CAPITAL', departamentos: Object.keys(c.ciudades ?? CIUDADES_UI), ciudades: CIUDADES_UI,
    buscar: 'ninguno', resetAlClic: false, extraSugerencias: [], cerrarSiVacio: false, ...c,
  };
  const alerta = '<div class="alertas-warn"><img alt="warn">Solo puedes afiliarte si resides en la zona de cobertura.</div>';
  const subtitulo = '<p>Información de localización vivienda</p>';
  const bloque = c.alerta === 'arriba' ? alerta + subtitulo : c.alerta === 'ninguna' ? subtitulo
    : c.alerta === 'doble' ? subtitulo + alerta + alerta : subtitulo + alerta;
  return `
    ${c.tapaTitulo ? '<div style="position:fixed;top:0;left:0;width:100%;height:120px;background:#fff;z-index:9"></div>' : ''}
    <h2>Información de contacto</h2>
    ${c.espaciador ? `<div style="height:${c.espaciador}px"></div>` : ''}
    ${bloque}
    <input role="combobox" formcontrolname="departamento" id="dep" aria-expanded="false">
    <div id="p-dep" role="listbox" hidden></div>
    <input role="combobox" formcontrolname="ciudadVivienda" id="ciu" aria-expanded="false">
    <div id="p-ciu" role="listbox" hidden></div>
    <button id="continuar" onclick="window.clics++">Continuar</button>
    <script>(() => {
      const CFG = ${JSON.stringify(cfg)};
      window.clics = 0; window.teclas = []; window.clicsCiu = 0;
      const $ = id => document.getElementById(id);
      const dep = $('dep'), ciu = $('ciu');
      const pintar = (panel, ops) => { panel.innerHTML = ops.map(o => '<div role="option">' + o + '</div>').join(''); };
      const abrir = (input, panel) => { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', panel.id); };
      const cerrar = (input, panel) => { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-controls'); };
      pintar($('p-dep'), CFG.departamentos);
      const cambiarDep = d => {
        const bloqueo = d === CFG.bloqueaCon;
        ciu.value = bloqueo ? d : '';
        ciu.readOnly = bloqueo && !CFG.deshabilitarAlBloquear;
        ciu.disabled = bloqueo && !!CFG.deshabilitarAlBloquear;
        pintar($('p-ciu'), CFG.ciudades[d] || []);
      };
      for (const [input, panel] of [[dep, $('p-dep')], [ciu, $('p-ciu')]]) {
        input.addEventListener('click', () => { if (!input.readOnly && !input.disabled) abrir(input, panel); });
        input.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(input, panel); });
        panel.addEventListener('click', e => {
          const o = e.target.closest('[role=option]'); if (!o) return;
          input.value = o.textContent; cerrar(input, panel);
          if (input === dep) cambiarDep(o.textContent);
        });
      }
      ciu.addEventListener('click', () => {
        window.clicsCiu++;
        if (CFG.resetAlClic && !ciu.readOnly) pintar($('p-ciu'), CFG.ciudades[dep.value] || []);
      });
      const plano = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
      ciu.addEventListener('input', () => {
        if (CFG.buscar === 'ninguno') return;
        const q = ciu.value.toLocaleUpperCase('es');
        const cumple = o => CFG.buscar === 'portal' ? o.toLocaleUpperCase('es').includes(q) : plano(o.toLocaleUpperCase('es')).includes(plano(q));
        const visibles = [...(CFG.ciudades[dep.value] || []), ...CFG.extraSugerencias].filter(cumple);
        pintar($('p-ciu'), visibles);
        if (!visibles.length && CFG.cerrarSiVacio) cerrar(ciu, $('p-ciu')); else abrir(ciu, $('p-ciu'));
      });
      ciu.addEventListener('keydown', e => {
        window.teclas.push(e.key);
        if (CFG.modo === 'filtro' && e.key.length === 1 && !/\\p{L}/u.test(e.key)) e.preventDefault();
      });
      ciu.addEventListener('input', () => {
        if (CFG.modo === 'diferido') setTimeout(() => { ciu.value = ciu.value.replace(/[^\\p{L}]/gu, ''); }, 150);
      });
      ciu.addEventListener('blur', () => {
        if (CFG.limpiarAlSalir && !(CFG.ciudades[dep.value] || []).includes(ciu.value)) ciu.value = '';
      });
    })();</script>`;
}

const RAPIDO = 1_500;
async function montar(page: Page, info: TestInfo, cfg: ConfigDom = {}, fuente?: InstantaneaFuente): Promise<AfiFunctionalUi> {
  await page.setContent(contacto(cfg));
  return new AfiFunctionalUi(page, info, { timeout: RAPIDO, fuentes: fuente ? { 'parametrica-ciudad-nacional': proveedor(fuente) } : undefined });
}
const ejecutar = async (ui: AfiFunctionalUi, ...operaciones: OperacionFuncionalAfi[]): Promise<ResultadoOperacionAfi[]> => {
  const registradas: ResultadoOperacionAfi[] = [];
  const paso: PasoFuncionalAfi = { id: 'x', esperado: 'esperado de prueba', operaciones };
  await ui.ejecutarPaso(paso, async r => { registradas.push(r); }).catch(() => undefined);
  return registradas;
};
const uno = async (ui: AfiFunctionalUi, op: OperacionFuncionalAfi) => (await ejecutar(ui, op))[0];
const adjunto = (info: TestInfo, nombre: string) => {
  // La última con ese nombre: dos drivers en un mismo test reinician el contador de evidencias automáticas.
  const a = [...info.attachments].reverse().find(x => x.name === nombre);
  return a?.body ? JSON.parse(a.body.toString()) : undefined;
};
const elegir = (valor: string): OperacionFuncionalAfi => ({ tipo: 'seleccionar-exacto', campo: 'departamento', valor });
/** Assertion de sugerencias (4E) con la regla declarada por el caso; mayúsculas SIEMPRE explícitas. */
const sugerencias = (textoBusqueda: string, mayusculas: 'sensibles' | 'insensibles' = 'insensibles', extra: Op = {}): OperacionFuncionalAfi => ({
  tipo: 'sugerencias-segun-fuente', campo: 'ciudadVivienda', fuente: 'parametrica-ciudad-nacional', filtroDesdeCampo: 'departamento',
  normalizacion: 'texto-es', textoBusqueda, coincidencia: 'contiene', diacriticos: 'sensibles', mayusculas, ...extra,
}) as OperacionFuncionalAfi;

test.describe('4D driver — componentes', () => {
  const visible = { tipo: 'componente-visible', componente: 'alerta-territorial' } as const;
  const debajo = { tipo: 'componente-posicion', componente: 'alerta-territorial', relacion: 'debajo-de', referencia: 'subtitulo-localizacion-vivienda' } as const;

  test('A. visible PASS; ausente o duplicado FAIL', async ({ page }, info) => {
    expect(await uno(await montar(page, info), { ...visible, evidencia: 'alerta' })).toEqual({
      tipo: 'componente-visible', resultado: 'PASS', observado: { componente: 'alerta-territorial', visible: true, coincidencias: 1 } });
    expect(info.attachments.map(a => a.name)).toContain('alerta');
    expect(await uno(await montar(page, info, { alerta: 'ninguna' }), visible)).toMatchObject({ resultado: 'FAIL', observado: { visible: false, coincidencias: 0 } });
    expect(await uno(await montar(page, info, { alerta: 'doble' }), visible)).toMatchObject({ resultado: 'FAIL', observado: { coincidencias: 2 } });
  });

  test('A. posición correcta e incorrecta', async ({ page }, info) => {
    expect(await uno(await montar(page, info), debajo)).toMatchObject({ resultado: 'PASS', observado: { visibles: true } });
    expect(await uno(await montar(page, info), { ...debajo, relacion: 'encima-de' })).toMatchObject({ resultado: 'FAIL' });
    const arriba = await montar(page, info, { alerta: 'arriba' });
    expect(await uno(arriba, debajo)).toMatchObject({ resultado: 'FAIL' });
    expect(await uno(arriba, { ...debajo, relacion: 'encima-de' })).toMatchObject({ resultado: 'PASS' });
    expect(await uno(await montar(page, info, { alerta: 'ninguna' }), debajo)).toMatchObject({ resultado: 'FAIL', observado: { visibles: false } });
  });
});

test.describe('4D driver — estado y valor de campo', () => {
  const estadoCampo = (e: 'editable' | 'solo-lectura') => ({ tipo: 'campo-estado', campo: 'ciudadVivienda', estado: e }) as const;

  test('B. editable / solo lectura (readonly o deshabilitado según el control)', async ({ page }, info) => {
    let ui = await montar(page, info);
    expect(await uno(ui, estadoCampo('editable'))).toEqual({
      tipo: 'campo-estado', campo: 'ciudadVivienda', resultado: 'PASS', observado: { estadoEsperado: 'editable', visible: true, editable: true } });
    expect(await uno(ui, estadoCampo('solo-lectura'))).toMatchObject({ resultado: 'FAIL', observado: { editable: true } });
    await ejecutar(ui, elegir('DISTRITO CAPITAL'));
    expect(await uno(ui, estadoCampo('solo-lectura'))).toMatchObject({ resultado: 'PASS', observado: { editable: false } });
    expect(await uno(ui, estadoCampo('editable'))).toMatchObject({ resultado: 'FAIL' });
    ui = await montar(page, info, { deshabilitarAlBloquear: true });
    await ejecutar(ui, elegir('DISTRITO CAPITAL'));
    expect(await uno(ui, estadoCampo('solo-lectura'))).toMatchObject({ resultado: 'PASS' });
  });

  test('C. valor exacto, texto-es y vacío; espera la precarga', async ({ page }, info) => {
    const ui = await montar(page, info);
    const valor = (v: string, comparacion: 'exacta' | 'texto-es') => ({ tipo: 'campo-valor', campo: 'ciudadVivienda', valor: v, comparacion }) as const;
    const vacio = { tipo: 'campo-valor', campo: 'ciudadVivienda', vacio: true } as const;
    expect(await uno(ui, vacio)).toEqual({
      tipo: 'campo-valor', campo: 'ciudadVivienda', resultado: 'PASS', observado: { comparacion: 'vacio', valorObservado: '' } });
    await ejecutar(ui, elegir('DISTRITO CAPITAL')); // precarga ciudad
    expect(await uno(ui, valor('DISTRITO CAPITAL', 'exacta'))).toMatchObject({ resultado: 'PASS', valorEsperado: 'DISTRITO CAPITAL' });
    expect(await uno(ui, valor('Distrito Capital', 'exacta'))).toMatchObject({ resultado: 'FAIL', observado: { valorObservado: 'DISTRITO CAPITAL' } });
    expect(await uno(ui, valor('Distrito, Capital', 'texto-es'))).toMatchObject({ resultado: 'PASS' });
    expect(await uno(ui, vacio)).toMatchObject({ resultado: 'FAIL' });
  });
});

test.describe('4D driver — escribir, entrada rechazada, salir del campo', () => {
  test('D. escribir usa teclado real: pasa por el filtro de teclas y limpia el contenido previo', async ({ page }, info) => {
    const ui = await montar(page, info, { modo: 'filtro' });
    await page.locator('#ciu').evaluate(e => { (e as HTMLInputElement).value = 'Previo'; });
    expect(await uno(ui, { tipo: 'escribir', campo: 'ciudadVivienda', texto: 'Ab1' })).toEqual({
      tipo: 'escribir', campo: 'ciudadVivienda', resultado: 'PASS', observado: { caracteres: 3 } });
    // Un fill habría dejado "Ab1": el filtro de teclado de la UI descartó el dígito.
    await expect(page.locator('#ciu')).toHaveValue('Ab');
    expect(await page.evaluate(() => (window as unknown as { teclas: string[] }).teclas)).toEqual(expect.arrayContaining(['A', 'b', '1', 'Backspace']));
  });

  test('D. entrada rechazada PASS con filtro; FAIL si se plasma; FAIL si aparece y luego se borra', async ({ page }, info) => {
    const rechazar = (texto: string) => ({ tipo: 'entrada-rechazada', campo: 'ciudadVivienda', texto }) as const;
    expect(await uno(await montar(page, info, { modo: 'filtro' }), rechazar('123'))).toEqual({
      tipo: 'entrada-rechazada', campo: 'ciudadVivienda', resultado: 'PASS',
      observado: { caracteres: 3, aceptados: 0, cambiosTardios: 0, valorSinCambios: true } });
    expect(await uno(await montar(page, info, { modo: 'filtro' }), rechazar('@#$%&*'))).toMatchObject({ resultado: 'PASS' });
    expect(await uno(await montar(page, info), rechazar('123'))).toMatchObject({ resultado: 'FAIL', observado: { aceptados: 3 } });
    // Por qué no basta escribir + campo-valor vacío: si la UI muestra los caracteres y los borra después,
    // campo-valor (que espera a que el valor se estabilice) daría PASS; entrada-rechazada da FAIL.
    let ui = await montar(page, info, { modo: 'diferido' });
    expect(await uno(ui, rechazar('123'))).toMatchObject({ resultado: 'FAIL', observado: { aceptados: 3 } });
    ui = await montar(page, info, { modo: 'diferido' });
    const compuesto = await ejecutar(ui, { tipo: 'escribir', campo: 'ciudadVivienda', texto: '123' }, { tipo: 'campo-valor', campo: 'ciudadVivienda', vacio: true });
    expect(compuesto.map(r => r.resultado)).toEqual(['PASS', 'PASS']);
    // Un campo no editable no prueba ningún filtro.
    ui = await montar(page, info);
    await ejecutar(ui, elegir('DISTRITO CAPITAL'));
    expect(await uno(ui, rechazar('123'))).toMatchObject({ resultado: 'FAIL', observado: { editable: false } });
  });

  test('D. salir del campo: pierde el foco sin navegar ni pulsar botones; la UI limpia el texto libre', async ({ page }, info) => {
    const ui = await montar(page, info, { limpiarAlSalir: true });
    const url = page.url();
    const r = await ejecutar(ui,
      elegir('DEPTO NORTE'),
      { tipo: 'escribir', campo: 'ciudadVivienda', texto: 'Zxyw' },
      { tipo: 'campo-valor', campo: 'ciudadVivienda', valor: 'Zxyw', comparacion: 'exacta' },
      { tipo: 'salir-del-campo', campo: 'ciudadVivienda' },
      { tipo: 'campo-valor', campo: 'ciudadVivienda', vacio: true });
    expect(r.map(x => [x.tipo, x.resultado])).toEqual([
      ['seleccionar-exacto', 'PASS'], ['escribir', 'PASS'], ['campo-valor', 'PASS'], ['salir-del-campo', 'PASS'], ['campo-valor', 'PASS']]);
    expect(r[3].observado).toEqual({ neutroLibre: true, sinFoco: true, sinNavegar: true });
    await expect(page.locator('#ciu')).not.toBeFocused();
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => (window as unknown as { clics: number }).clics)).toBe(0);
  });

  test('D. salir del campo no interactúa si la zona neutra está tapada', async ({ page }, info) => {
    const ui = await montar(page, info, { tapaTitulo: true });
    await page.locator('#ciu').focus();
    expect(await uno(ui, { tipo: 'salir-del-campo', campo: 'ciudadVivienda' })).toEqual({
      tipo: 'salir-del-campo', campo: 'ciudadVivienda', resultado: 'FAIL', observado: { neutroLibre: false } });
    await expect(page.locator('#ciu')).toBeFocused();
  });

  test('G. seleccionar-exacto normalizado elige la opción real; sin normalizar sigue siendo literal', async ({ page }, info) => {
    let ui = await montar(page, info);
    const [r] = await ejecutar(ui, { tipo: 'seleccionar-exacto', campo: 'departamento', valor: 'Depto Norte', normalizacion: 'texto-es' });
    expect(r).toEqual({ tipo: 'seleccionar-exacto', campo: 'departamento', valorEsperado: 'Depto Norte', resultado: 'PASS',
      observado: { normalizacion: 'texto-es', coincidenciasNormalizadas: 1, valorSeleccionado: 'DEPTO NORTE' } });
    await expect(page.locator('#dep')).toHaveValue('DEPTO NORTE');
    ui = await montar(page, info);
    expect(await uno(ui, elegir('Depto Norte'))).toMatchObject({ resultado: 'FAIL', observado: { coincidenciasExactas: 0 } });
    await expect(page.locator('#dep')).toHaveValue('');
  });
});

test.describe('4D driver — catalogo-segun-fuente', () => {
  const fuente = instantanea([DEPARTAMENTOS, MUNICIPIOS]);

  test('F. igualdad PASS con evidencia segura (filtro desde el valor actual)', async ({ page }, info) => {
    const ui = await montar(page, info, {}, fuente);
    const [, r] = await ejecutar(ui, elegir('DEPTO NORTE'), FUENTE);
    expect(r).toEqual({
      tipo: 'catalogo-segun-fuente', campo: 'ciudadVivienda', resultado: 'PASS',
      observado: { fuente: 'parametrica-ciudad-nacional', filtro: 'DEPTO NORTE', completa: true, cantidadEsperada: 3, cantidadObservada: 3, faltantes: 0, sobrantes: 0, lecturasGetRespaldo: 0 },
    });
    expect(adjunto(info, 'fuente-parametrica-ciudad-nacional-ciudadVivienda-1.json')).toEqual({
      fuente: 'parametrica-ciudad-nacional', campo: 'ciudadVivienda', campoFiltro: 'departamento', filtro: 'DEPTO NORTE',
      relacion: 'igual', normalizacion: 'texto-es', resultado: 'PASS', claveFiltro: '10', completa: true,
      cantidadEsperada: 3, esperadas: ['VILLA ÁLAMO', 'SAN JOSÉ', 'PUERTO NUEVO'],
      cantidadObservada: 3, observadas: ['VILLA ÁLAMO', 'SAN JOSÉ', 'PUERTO NUEVO'],
      faltantes: [], sobrantes: [], lecturasGetRespaldo: 0, respuestasIlegibles: 0,
    });
  });

  test('F. faltantes y sobrantes FAIL, con diferencias en la evidencia', async ({ page }, info) => {
    const ui = await montar(page, info, { ciudades: { ...CIUDADES_UI, 'DEPTO NORTE': ['VILLA ÁLAMO', 'LAS PEÑAS'] } }, fuente);
    const [, r] = await ejecutar(ui, elegir('DEPTO NORTE'), { ...FUENTE, evidencia: 'fuente-norte' });
    expect(r).toMatchObject({ resultado: 'FAIL', observado: { faltantes: 2, sobrantes: 1 } });
    expect(adjunto(info, 'fuente-norte.json')).toMatchObject({ faltantes: ['SAN JOSÉ', 'PUERTO NUEVO'], sobrantes: ['LAS PEÑAS'], resultado: 'FAIL' });
  });

  test('F. normalización: la UI puede escribir sin tildes/mayúsculas', async ({ page }, info) => {
    const ui = await montar(page, info, { ciudades: { ...CIUDADES_UI, 'DEPTO NORTE': ['Villa Alamo', 'San José', 'PUERTO NUEVO'] } }, fuente);
    expect((await ejecutar(ui, elegir('DEPTO NORTE'), FUENTE))[1]).toMatchObject({ resultado: 'PASS' });
  });

  test('F. fuente incompleta o no resoluble => FAIL con motivo, aunque la UI coincida', async ({ page }, info) => {
    let ui = await montar(page, info, {}, instantanea([DEPARTAMENTOS, { ...MUNICIPIOS, paginada: true }]));
    expect((await ejecutar(ui, elegir('DEPTO NORTE'), FUENTE))[1]).toMatchObject({ resultado: 'FAIL', observado: { completa: false, motivo: 'fuente-incompleta' } });
    ui = await montar(page, info, {}, instantanea([MUNICIPIOS]));
    expect((await ejecutar(ui, elegir('DEPTO NORTE'), FUENTE))[1]).toMatchObject({ resultado: 'FAIL', observado: { motivo: 'filtro-no-resoluble' } });
    const evidencia = adjunto(info, 'fuente-parametrica-ciudad-nacional-ciudadVivienda-1.json');
    expect(evidencia).toMatchObject({ completa: false, motivo: 'filtro-no-resoluble', resultado: 'FAIL' });
  });

  test('composición P02-P10 (datos ficticios): componentes, estado, valor, entrada, blur, sugerencias, fuente y reselección', async ({ page }, info) => {
    const ui = await montar(page, info, { modo: 'filtro', limpiarAlSalir: true, buscar: 'portal', resetAlClic: true }, fuente);
    const ciudad = 'ciudadVivienda' as const;
    const pasos: OperacionFuncionalAfi[][] = [
      [{ tipo: 'componente-visible', componente: 'alerta-territorial' }, { tipo: 'componente-region', componente: 'alerta-territorial', region: 'superior' },
        { tipo: 'componente-posicion', componente: 'alerta-territorial', relacion: 'debajo-de', referencia: 'subtitulo-localizacion-vivienda' }],
      [{ tipo: 'seleccionar-exacto', campo: 'departamento', valor: 'Depto Norte', normalizacion: 'texto-es' }, { tipo: 'campo-estado', campo: ciudad, estado: 'editable' }],
      [FUENTE, { tipo: 'cerrar-catalogo', campo: ciudad }],
      [{ tipo: 'entrada-rechazada', campo: ciudad, texto: '123' }, { tipo: 'entrada-rechazada', campo: ciudad, texto: '@#$%&*' }],
      [{ tipo: 'escribir', campo: ciudad, texto: 'Zxyw' }, { tipo: 'salir-del-campo', campo: ciudad }, { tipo: 'campo-valor', campo: ciudad, vacio: true }],
      [{ tipo: 'escribir', campo: ciudad, texto: 'osé' }, { tipo: 'campo-valor', campo: ciudad, valor: 'osé', comparacion: 'exacta' }, sugerencias('osé')],
      [{ tipo: 'seleccionar-exacto', campo: ciudad, valor: 'SAN JOSÉ' }, { tipo: 'campo-valor', campo: ciudad, valor: 'SAN JOSÉ', comparacion: 'exacta' },
        FUENTE, { tipo: 'cerrar-catalogo', campo: ciudad }, { tipo: 'campo-valor', campo: ciudad, valor: 'SAN JOSÉ', comparacion: 'exacta' }],
      [{ tipo: 'seleccionar-exacto', campo: 'departamento', valor: 'DISTRITO CAPITAL' },
        { tipo: 'campo-valor', campo: ciudad, valor: 'DISTRITO CAPITAL', comparacion: 'exacta' }, { tipo: 'campo-estado', campo: ciudad, estado: 'solo-lectura' }],
      [{ tipo: 'seleccionar-exacto', campo: 'departamento', valor: 'DEPTO NORTE' }, { tipo: 'campo-estado', campo: ciudad, estado: 'editable' },
        FUENTE, { tipo: 'escribir', campo: ciudad, texto: 'José' }, { tipo: 'seleccionar-exacto', campo: ciudad, valor: 'SAN JOSÉ' }],
    ];
    const definicion = { caso: 'ficticio', pasos: pasos.map((operaciones, i) => ({ id: `F${i + 1}`, esperado: `esperado ${i + 1}`, operaciones })) };
    expect(validarPlanFuncionalAfi(JSON.parse(JSON.stringify(definicion)))).toEqual([]);
    for (const p of definicion.pasos) await ui.ejecutarPaso(p);
    await expect(page.locator('#ciu')).toHaveValue('SAN JOSÉ');
  });
});

// =====================================================================================
// Proveedor real contra un servidor HTTP local (el respaldo GET usa page.request, que page.route no intercepta).
interface Respuesta { status?: number; cuerpo: string }
const estado: {
  respuestas: Record<string, (n: number) => Respuesta>;
  conteo: Record<string, number>;
  pagina: string;
} = { respuestas: {}, conteo: {}, pagina: '' };
let servidor: Server;
let base = '';

const odata = (registros: RegistroFuente[], extra: Op = {}) => JSON.stringify({
  value: registros.map(r => ({ parameters: Object.entries(r).map(([xpath, value]) => ({ xpath, value })) })), ...extra });
const RUTA_DEP = '/odata/data/entities(dep)/values';
const RUTA_MUN = '/odata/data/entities(mun)/values';
const pedir = (peticiones: { metodo: 'GET' | 'POST'; ruta: string }[], cuerpo = '') => `<!doctype html><body>${cuerpo}<script>
  (async () => {
    for (const p of ${JSON.stringify(peticiones)}) await fetch(p.ruta, { method: p.metodo }).then(r => r.text()).catch(() => '');
    document.title = 'listo';
  })();</script></body>`;

test.describe('4D proveedor FuenteParametricaPortal (HTTP local)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    servidor = createServer((req, res) => {
      const ruta = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
      const clave = `${req.method} ${ruta}`;
      estado.conteo[clave] = (estado.conteo[clave] ?? 0) + 1;
      if (ruta === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(estado.pagina); return; }
      const r = estado.respuestas[ruta]?.(estado.conteo[clave]) ?? { status: 404, cuerpo: '' };
      res.writeHead(r.status ?? 200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(r.cuerpo);
    });
    await new Promise<void>(ok => servidor.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });
  test.afterAll(async () => { await new Promise(ok => servidor.close(ok)); });
  test.beforeEach(() => { estado.respuestas = {}; estado.conteo = {}; });

  async function observar(page: Page, peticiones: Parameters<typeof pedir>[0]): Promise<InstantaneaFuente> {
    estado.pagina = pedir(peticiones);
    const fuente = new FuenteParametricaPortal(page);
    await page.goto(`${base}/`);
    await expect(page).toHaveTitle('listo');
    const inst = await fuente.instantanea();
    await fuente.cerrar();
    return inst;
  }
  const GETS = [{ metodo: 'GET', ruta: RUTA_DEP }, { metodo: 'GET', ruta: RUTA_MUN }] as const;

  test('E. catálogo completo leído de las respuestas del Portal (formato Bizagi) y resuelto', async ({ page }) => {
    estado.respuestas[RUTA_DEP] = () => ({ cuerpo: odata([...DEPARTAMENTOS.registros]) });
    estado.respuestas[RUTA_MUN] = () => ({ cuerpo: odata([...MUNICIPIOS.registros]) });
    const inst = await observar(page, [...GETS]);
    expect(inst).toMatchObject({ lecturasRespaldo: 0, ilegibles: 0, vacias: 0 });
    expect(inst.respuestas.map(r => [r.entidad, r.registros.length, r.paginada])).toEqual([[RUTA_DEP, 4, false], [RUTA_MUN, 7, false]]);
    expect(resolver(inst, 'DEPTO NORTE')).toMatchObject({ ok: true, esperadas: ['VILLA ÁLAMO', 'SAN JOSÉ', 'PUERTO NUEVO'] });
    expect(estado.conteo[`GET ${RUTA_MUN}`]).toBe(1);
  });

  test('E. respuesta paginada queda marcada incompleta; vacía queda vacía', async ({ page }) => {
    estado.respuestas[RUTA_DEP] = () => ({ cuerpo: odata([]) });
    estado.respuestas[RUTA_MUN] = () => ({ cuerpo: odata([...MUNICIPIOS.registros], { '@odata.nextLink': 'siguiente' }) });
    const inst = await observar(page, [...GETS]);
    expect(inst.vacias).toBe(1);
    expect(inst.respuestas.map(r => r.paginada)).toEqual([true]);
    expect(resolver(inst, 'DEPTO NORTE')).toMatchObject({ ok: false, motivo: 'fuente-incompleta' });
  });

  test('E. cuerpo no legible en GET: relee UNA vez la misma petición GET', async ({ page }) => {
    estado.respuestas[RUTA_DEP] = () => ({ cuerpo: odata([...DEPARTAMENTOS.registros]) });
    estado.respuestas[RUTA_MUN] = n => ({ cuerpo: n === 1 ? 'cuerpo-perdido' : odata([...MUNICIPIOS.registros]) });
    const inst = await observar(page, [...GETS]);
    expect(inst).toMatchObject({ lecturasRespaldo: 1, ilegibles: 0 });
    expect(estado.conteo[`GET ${RUTA_MUN}`]).toBe(2);
    expect(resolver(inst, 'DEPTO NORTE')).toMatchObject({ ok: true });
  });

  test('E. nunca repite un POST: queda ilegible y la fuente falla cerrada', async ({ page }) => {
    estado.respuestas[RUTA_DEP] = () => ({ cuerpo: odata([...DEPARTAMENTOS.registros]) });
    estado.respuestas[RUTA_MUN] = () => ({ cuerpo: 'cuerpo-perdido' });
    const inst = await observar(page, [{ metodo: 'GET', ruta: RUTA_DEP }, { metodo: 'POST', ruta: RUTA_MUN }]);
    expect(estado.conteo[`POST ${RUTA_MUN}`]).toBe(1);
    expect(estado.conteo[`GET ${RUTA_MUN}`]).toBeUndefined();
    expect(inst).toMatchObject({ lecturasRespaldo: 0, ilegibles: 1 });
    expect(resolver(inst, 'DEPTO NORTE')).toMatchObject({ ok: false, motivo: 'fuente-ilegible' });
  });

  test('E. conserva la ÚLTIMA respuesta de cada entidad', async ({ page }) => {
    estado.respuestas[RUTA_DEP] = () => ({ cuerpo: odata([...DEPARTAMENTOS.registros]) });
    estado.respuestas[RUTA_MUN] = n => ({ cuerpo: odata(n === 1 ? [muni('VIEJO', '10')] : [...MUNICIPIOS.registros]) });
    const inst = await observar(page, [...GETS, { metodo: 'GET', ruta: RUTA_MUN }]);
    expect(resolver(inst, 'DEPTO NORTE')).toMatchObject({ ok: true, esperadas: ['VILLA ÁLAMO', 'SAN JOSÉ', 'PUERTO NUEVO'] });
  });

  test('F. integración: driver con el proveedor real sobre el Portal simulado', async ({ page }, info) => {
    estado.respuestas[RUTA_DEP] = () => ({ cuerpo: odata([...DEPARTAMENTOS.registros]) });
    estado.respuestas[RUTA_MUN] = () => ({ cuerpo: odata([...MUNICIPIOS.registros]) });
    estado.pagina = pedir([...GETS], contacto());
    const ui = new AfiFunctionalUi(page, info, { timeout: RAPIDO }); // proveedor por defecto: creado antes de cargar
    await page.goto(`${base}/`);
    await expect(page).toHaveTitle('listo');
    const r = await ejecutar(ui, elegir('DEPTO NORTE'), FUENTE);
    await ui.cerrar();
    expect(r.map(x => x.resultado)).toEqual(['PASS', 'PASS']);
    expect(r[1].observado).toMatchObject({ completa: true, cantidadEsperada: 3, cantidadObservada: 3 });
  });
});

// =====================================================================================
// 4D.1: región canónica "superior" (centro vertical, desde el inicio de la página, en la mitad superior de la 1ª pantalla).
const REGION = (componente: 'alerta-territorial' | 'subtitulo-localizacion-vivienda' = 'alerta-territorial') =>
  ({ tipo: 'componente-region', componente, region: 'superior' }) as const;
/** Componentes ficticios en posiciones absolutas exactas (px) para probar la regla en sus límites. */
const posicionados = ({ alerta, subtitulo = 0, alto = 40, largo = 0 }: { alerta?: number; subtitulo?: number; alto?: number; largo?: number }) => `
  <body style="margin:0">
    <p style="position:absolute;top:${subtitulo}px;margin:0;height:20px">Información de localización vivienda</p>
    ${alerta === undefined ? '' : `<div class="alertas-warn" style="position:absolute;top:${alerta}px;left:0;height:${alto}px;margin:0;padding:0;overflow:hidden">Solo puedes afiliarte</div>`}
    ${largo ? `<div style="height:${largo}px"></div>` : ''}
  </body>`;

test.describe('4D.1 componente-region', () => {
  test.use({ viewport: { width: 1365, height: 900 } }); // viewport desktop canónico del harness

  test('contrato: región cerrada; sin geometría aportada por el plan', () => {
    expect(problemas(REGION())).toEqual([]);
    expect(problemas({ ...REGION(), region: 'inferior' })).toEqual([['op[0].region', 'capability']]);
    expect(problemas({ ...REGION(), componente: 'banner-x' })).toEqual([['op[0].componente', 'capability']]);
    expect(problemas({ ...REGION(), umbral: 0.3 })).toEqual([['op[0].umbral', 'invalido']]);
    expect(problemas({ ...REGION(), viewport: { width: 1, height: 1 } })).toEqual([['op[0].viewport', 'invalido']]);
    expect(problemas({ tipo: 'componente-region', componente: 'alerta-territorial' })).toEqual([['op[0].region', 'invalido']]);
  });

  test('A. regla pura: límite inclusivo, fuera por arriba y viewport/geometría inválidos', () => {
    const vp = { width: 1365, height: 900 };
    expect(evaluarRegionComponente('superior', { top: 430, height: 40 }, vp)).toEqual({ cumple: true, centroY: 450, limiteY: 450 });
    expect(evaluarRegionComponente('superior', { top: 430.5, height: 40 }, vp)).toMatchObject({ cumple: false, centroY: 450.5 });
    expect(evaluarRegionComponente('superior', { top: -100, height: 40 }, vp)).toMatchObject({ cumple: false });
    for (const malo of [null, { width: 0, height: 900 }, { width: 1365, height: 0 }, { width: 1365, height: Number.NaN }]) {
      expect(evaluarRegionComponente('superior', { top: 10, height: 10 }, malo)).toEqual({ cumple: false, motivo: 'viewport-no-disponible' });
    }
    expect(evaluarRegionComponente('superior', null, vp)).toEqual({ cumple: false, motivo: 'geometria-no-disponible' });
    expect(evaluarRegionComponente('superior', { top: Number.NaN, height: 10 }, vp)).toEqual({ cumple: false, motivo: 'geometria-no-disponible' });
  });

  test('A. dentro PASS, fuera FAIL, límite exacto según la regla, con evidencia observable', async ({ page }, info) => {
    const ui = new AfiFunctionalUi(page, info, { timeout: RAPIDO });
    await page.setContent(posicionados({ alerta: 100 }));
    expect(await uno(ui, { ...REGION(), evidencia: 'region-alerta' })).toEqual({
      tipo: 'componente-region', resultado: 'PASS',
      observado: {
        componente: 'alerta-territorial', regionEsperada: 'superior', regla: 'centro-vertical-en-mitad-superior-de-la-primera-pantalla',
        visible: true, viewportAncho: 1365, viewportAlto: 900, centroY: 120, limiteY: 450, condicionCumplida: true,
      },
    });
    expect(adjunto(info, 'region-alerta.json')).toMatchObject({ condicionCumplida: true, centroY: 120 });
    await page.setContent(posicionados({ alerta: 700 }));
    expect(await uno(ui, REGION())).toMatchObject({ resultado: 'FAIL', observado: { centroY: 720, condicionCumplida: false } });
    await page.setContent(posicionados({ alerta: 430 })); // centro = 450 = mitad: PASS (inclusivo)
    expect(await uno(ui, REGION())).toMatchObject({ resultado: 'PASS', observado: { centroY: 450 } });
    await page.setContent(posicionados({ alerta: 431 })); // centro = 451: FAIL
    expect(await uno(ui, REGION())).toMatchObject({ resultado: 'FAIL', observado: { centroY: 451 } });
  });

  test('A. componente no visible => FAIL sin geometría', async ({ page }, info) => {
    const ui = new AfiFunctionalUi(page, info, { timeout: RAPIDO });
    await page.setContent(posicionados({}));
    expect(await uno(ui, REGION())).toEqual({
      tipo: 'componente-region', resultado: 'FAIL',
      observado: { componente: 'alerta-territorial', regionEsperada: 'superior', regla: 'centro-vertical-en-mitad-superior-de-la-primera-pantalla', visible: false, condicionCumplida: false },
    });
  });

  test('A. viewport ausente en el contexto => FAIL seguro', async ({ browser }, info) => {
    // El proyecto hereda deviceScaleFactor del dispositivo Desktop; es incompatible con viewport null.
    const contexto = await browser.newContext({ viewport: null, deviceScaleFactor: undefined });
    try {
      const page = await contexto.newPage();
      await page.setContent(posicionados({ alerta: 10 }));
      expect(page.viewportSize()).toBeNull();
      const r = await uno(new AfiFunctionalUi(page, info, { timeout: RAPIDO }), REGION());
      expect(r).toMatchObject({ resultado: 'FAIL', observado: { visible: true, motivo: 'viewport-no-disponible', condicionCumplida: false } });
      expect(r.observado).not.toHaveProperty('centroY');
    } finally { await contexto.close(); }
  });

  test('A. independiente del scroll: se mide desde el inicio de la página', async ({ page }, info) => {
    const ui = new AfiFunctionalUi(page, info, { timeout: RAPIDO });
    await page.setContent(posicionados({ alerta: 100, largo: 3000 }));
    // Un paso anterior pudo desplazar la pantalla: el resultado no cambia con el scroll actual.
    for (const y of [0, 50, 2000]) {
      await page.evaluate(desplazamiento => window.scrollTo(0, desplazamiento), y);
      expect(await uno(ui, REGION()), `scroll ${y}`).toMatchObject({ resultado: 'PASS', observado: { centroY: 120 } });
    }
  });

  test('B. la misma regla sirve para otro componente catalogado; la implementación no conoce componentes', async ({ page }, info) => {
    const ui = new AfiFunctionalUi(page, info, { timeout: RAPIDO });
    await page.setContent(posicionados({ subtitulo: 50 }));
    expect(await uno(ui, REGION('subtitulo-localizacion-vivienda'))).toMatchObject({ resultado: 'PASS', observado: { centroY: 60 } });
    await page.setContent(posicionados({ subtitulo: 600 }));
    expect(await uno(ui, REGION('subtitulo-localizacion-vivienda'))).toMatchObject({ resultado: 'FAIL', observado: { centroY: 610 } });
    // Regla y evaluación genéricas: sin nombres de componentes, casos ni textos de la UI.
    const funcional = await readFile(resolve(__dirname, '../data/afi/funcional.ts'), 'utf8');
    const regla = funcional.slice(funcional.indexOf('// ---------- Regiones canónicas'), funcional.indexOf('/** Opción a elegir tras'));
    expect(regla.length).toBeGreaterThan(100);
    expect(regla).not.toMatch(/alerta|subtitulo|territorial|CP0\d|P02|Solo puedes/i);
    const driver = await readFile(resolve(__dirname, '../helpers/afiFunctionalUi.ts'), 'utf8');
    const caso = driver.slice(driver.indexOf("case 'componente-region'"), driver.indexOf("case 'campo-estado'"));
    expect(caso).not.toMatch(/alerta|subtitulo|territorial|CP0\d|P02/i);
  });

  test('C. composición P02 (UI ficticia): visible + superior + debajo del subtítulo', async ({ page }, info) => {
    const plan02 = (ui: AfiFunctionalUi) => ejecutar(ui,
      { tipo: 'componente-visible', componente: 'alerta-territorial' },
      REGION(),
      { tipo: 'componente-posicion', componente: 'alerta-territorial', relacion: 'debajo-de', referencia: 'subtitulo-localizacion-vivienda' });
    const resultados = async (cfg: ConfigDom) => (await plan02(await montar(page, info, cfg))).map(r => r.resultado);
    expect(await resultados({})).toEqual(['PASS', 'PASS', 'PASS']);
    // Visible y debajo del subtítulo, pero fuera de la región superior: falla en la región y el paso se detiene.
    expect(await resultados({ espaciador: 1200 })).toEqual(['PASS', 'FAIL']);
    // En la región superior pero ENCIMA del subtítulo.
    expect(await resultados({ alerta: 'arriba' })).toEqual(['PASS', 'PASS', 'FAIL']);
    // Cada assertion por separado en la variante empujada: posición relativa sí, región no.
    const ui = await montar(page, info, { espaciador: 1200 });
    expect((await uno(ui, { tipo: 'componente-posicion', componente: 'alerta-territorial', relacion: 'debajo-de', referencia: 'subtitulo-localizacion-vivienda' })).resultado).toBe('PASS');
    expect((await uno(ui, REGION())).resultado).toBe('FAIL');
  });
});

// =====================================================================================
// 4E: sugerencias según fuente. Datos genéricos: un departamento ficticio con nombres que contienen "JOSÉ".
const DEPTOS_E: RespuestaEntidad = { entidad: 'dep', paginada: false, registros: [...DEPARTAMENTOS.registros, depto('60', 'DEPTO ESTE')] };
const MUNIS_ESTE = ['SAN JOSÉ DEL RÍO', 'VILLA JOSÉ', 'JOSEFINA', 'LAGUNA'];
const MUNIS_E: RespuestaEntidad = { ...MUNICIPIOS, registros: [...MUNICIPIOS.registros, ...MUNIS_ESTE.map(m => muni(m, '60'))] };
const FUENTE_E = instantanea([DEPTOS_E, MUNIS_E]);
const UI_E: ConfigDom = { ciudades: { ...CIUDADES_UI, 'DEPTO ESTE': MUNIS_ESTE }, buscar: 'portal', resetAlClic: true };
const REGLA = { coincidencia: 'contiene', diacriticos: 'sensibles' } as const;
const estadoUi = (page: Page) => page.evaluate(() => {
  const ciu = document.getElementById('ciu') as HTMLInputElement;
  const w = window as unknown as { clicsCiu: number; teclas: string[] };
  return {
    valor: ciu.value, expandido: ciu.getAttribute('aria-expanded'), clics: w.clicsCiu, teclas: w.teclas.length,
    opciones: [...document.querySelectorAll('#p-ciu [role=option]')].map(o => o.textContent), panelVisible: !(document.getElementById('p-ciu') as HTMLElement).hidden,
  };
});

test.describe('4E sugerencias-segun-fuente — contrato y regla pura', () => {
  test('contrato: parámetros cerrados; mayúsculas obligatorias sin valor por defecto', () => {
    const op = sugerencias('ab') as unknown as Op;
    expect(problemas(op)).toEqual([]);
    expect(problemas({ ...op, mayusculas: 'sensibles' })).toEqual([]);
    const sinMayusculas = { ...op };
    delete sinMayusculas.mayusculas;
    expect(problemas(sinMayusculas)).toEqual([['op[0].mayusculas', 'invalido']]);
    expect(problemas({ ...op, mayusculas: 'auto' })).toEqual([['op[0].mayusculas', 'capability']]);
    expect(problemas({ ...op, coincidencia: 'empieza-por' })).toEqual([['op[0].coincidencia', 'capability']]);
    expect(problemas({ ...op, diacriticos: 'insensibles' })).toEqual([['op[0].diacriticos', 'capability']]);
    expect(problemas({ ...op, textoBusqueda: '' })).toEqual([['op[0].textoBusqueda', 'invalido']]);
    expect(problemas({ ...op, patron: '^A.*' })).toEqual([['op[0].patron', 'invalido']]);
    expect(problemas({ ...op, fuente: 'otra' })).toEqual([['op[0].fuente', 'capability']]);
    expect(problemas({ ...op, campo: 'departamento', filtroDesdeCampo: 'ciudadVivienda' }))
      .toEqual([['op[0].campo', 'capability'], ['op[0].filtroDesdeCampo', 'capability']]);
  });

  test('A. contiene con diacríticos sensibles; NFC; mayúsculas según lo declarado', () => {
    const sensible = { ...REGLA, mayusculas: 'sensibles' } as const, insensible = { ...REGLA, mayusculas: 'insensibles' } as const;
    expect(cumpleBusqueda('Chía', 'Chí', sensible)).toBe(true);
    expect(cumpleBusqueda('Chia', 'Chí', sensible)).toBe(false);
    expect(cumpleBusqueda('Laguna', 'Chí', sensible)).toBe(false);
    // Misma tilde en otra codificación Unicode (i + acento combinante): equivalente tras NFC.
    expect(cumpleBusqueda('Chía', 'Chí', sensible)).toBe(true);
    expect(cumpleBusqueda('Chía', 'Chí', sensible)).toBe(true);
    // Mayúsculas: el resultado DEPENDE de lo declarado (por eso el caso debe declararlo).
    expect(cumpleBusqueda('CHÍA', 'Chí', sensible)).toBe(false);
    expect(cumpleBusqueda('CHÍA', 'Chí', insensible)).toBe(true);
    // Insensible a mayúsculas NO quita tildes.
    expect(cumpleBusqueda('CHIA', 'Chí', insensible)).toBe(false);
    expect(cumpleBusqueda('SAN JOSÉ DEL RÍO', 'osé', insensible)).toBe(true);
    expect(cumpleBusqueda('JOSEFINA', 'osé', insensible)).toBe(false);
  });

  test('B/C. subconjunto no vacío: fuera de fuente, no cumple, vacío', () => {
    const r = { ...REGLA, mayusculas: 'insensibles' } as const;
    expect(evaluarSugerencias(['VILLA JOSÉ'], MUNIS_ESTE, 'osé', r, 'texto-es')).toEqual({ cumple: true, fueraDeFuente: [], noCumplenBusqueda: [] });
    expect(evaluarSugerencias(['San Jose del Rio'], MUNIS_ESTE, 'Jo', r, 'texto-es').cumple).toBe(true); // pertenencia normalizada
    expect(evaluarSugerencias(['VILLA JOSÉ', 'JOSÉ FANTASMA'], MUNIS_ESTE, 'osé', r, 'texto-es'))
      .toEqual({ cumple: false, fueraDeFuente: ['JOSÉ FANTASMA'], noCumplenBusqueda: [] });
    expect(evaluarSugerencias(['VILLA JOSÉ', 'JOSEFINA'], MUNIS_ESTE, 'osé', r, 'texto-es'))
      .toEqual({ cumple: false, fueraDeFuente: [], noCumplenBusqueda: ['JOSEFINA'] });
    expect(evaluarSugerencias([], MUNIS_ESTE, 'osé', r, 'texto-es').cumple).toBe(false);
  });
});

test.describe('4E sugerencias-segun-fuente — driver', () => {
  async function tras(page: Page, info: TestInfo, cfg: ConfigDom, texto: string, fuente: InstantaneaFuente = FUENTE_E) {
    const ui = await montar(page, info, { ...UI_E, ...cfg }, fuente);
    await ejecutar(ui, elegir('DEPTO ESTE'), { tipo: 'escribir', campo: 'ciudadVivienda', texto });
    return ui;
  }

  test('C. una o varias sugerencias válidas => PASS con evidencia segura', async ({ page }, info) => {
    let ui = await tras(page, info, {}, 'osé');
    expect(await uno(ui, sugerencias('osé', 'insensibles', { evidencia: 'sug-ose' }))).toEqual({
      tipo: 'sugerencias-segun-fuente', campo: 'ciudadVivienda', resultado: 'PASS',
      observado: {
        fuente: 'parametrica-ciudad-nacional', textoBusqueda: 'osé', coincidencia: 'contiene', diacriticos: 'sensibles', mayusculas: 'insensibles',
        filtro: 'DEPTO ESTE', fuenteCompleta: true, cantidadSugerencias: 2, fueraDeFuente: 0, noCumplenBusqueda: 0,
      },
    });
    expect(adjunto(info, 'sug-ose.json')).toMatchObject({
      campo: 'ciudadVivienda', campoFiltro: 'departamento', filtro: 'DEPTO ESTE', textoBusqueda: 'osé', resultado: 'PASS',
      fuenteCompleta: true, cantidadFuente: 4, sugerencias: ['SAN JOSÉ DEL RÍO', 'VILLA JOSÉ'], fueraDeFuente: [], noCumplenBusqueda: [],
    });
    ui = await tras(page, info, {}, 'Villa');
    expect(await uno(ui, sugerencias('Villa'))).toMatchObject({ resultado: 'PASS', observado: { cantidadSugerencias: 1 } });
  });

  test('A. la regla de mayúsculas declarada decide sobre la MISMA UI (no la elige el framework)', async ({ page }, info) => {
    const ui = await tras(page, info, {}, 'osé');
    expect(await uno(ui, sugerencias('osé', 'sensibles'))).toMatchObject({ resultado: 'FAIL', observado: { motivo: 'sugerencias-invalidas', noCumplenBusqueda: 2 } });
    expect(await uno(ui, sugerencias('osé', 'insensibles'))).toMatchObject({ resultado: 'PASS' });
  });

  test('C. sugerencia que no respeta tildes o fuera de fuente => FAIL', async ({ page }, info) => {
    let ui = await tras(page, info, { buscar: 'sin-tildes' }, 'osé');
    expect(await uno(ui, sugerencias('osé', 'insensibles', { evidencia: 'sug-tildes' }))).toMatchObject({ resultado: 'FAIL', observado: { noCumplenBusqueda: 1 } });
    expect(adjunto(info, 'sug-tildes.json')).toMatchObject({ noCumplenBusqueda: ['JOSEFINA'], fueraDeFuente: [] });
    ui = await tras(page, info, { extraSugerencias: ['JOSÉ FANTASMA'] }, 'osé');
    expect(await uno(ui, sugerencias('osé', 'insensibles', { evidencia: 'sug-fuera' }))).toMatchObject({ resultado: 'FAIL', observado: { fueraDeFuente: 1 } });
    expect(adjunto(info, 'sug-fuera.json')).toMatchObject({ fueraDeFuente: ['JOSÉ FANTASMA'] });
  });

  test('C. sin sugerencias => FAIL funcional (nunca PASS vacío), también con el panel cerrado', async ({ page }, info) => {
    let ui = await tras(page, info, {}, 'xyz');
    expect(await uno(ui, sugerencias('xyz'))).toMatchObject({ resultado: 'FAIL', observado: { cantidadSugerencias: 0, motivo: 'sin-sugerencias' } });
    ui = await tras(page, info, { cerrarSiVacio: true }, 'xyz');
    expect(await uno(ui, sugerencias('xyz'))).toMatchObject({ resultado: 'FAIL', observado: { motivo: 'panel-cerrado' } });
  });

  test('B. fuente no disponible, incompleta o filtro no resoluble => FAIL con motivo', async ({ page }, info) => {
    const casos: [InstantaneaFuente, string][] = [
      [instantanea([DEPTOS_E]), 'fuente-no-observada'],
      [instantanea([DEPTOS_E, { ...MUNIS_E, paginada: true }]), 'fuente-incompleta'],
      [instantanea([DEPARTAMENTOS, MUNIS_E]), 'filtro-no-resoluble'],
    ];
    for (const [fuente, motivo] of casos) {
      const ui = await tras(page, info, {}, 'osé', fuente);
      expect(await uno(ui, sugerencias('osé')), motivo).toMatchObject({ resultado: 'FAIL', observado: { fuenteCompleta: false, motivo } });
    }
  });

  test('C. estado ambiguo: el campo no muestra el texto declarado => FAIL', async ({ page }, info) => {
    const ui = await tras(page, info, {}, 'osé');
    expect(await uno(ui, sugerencias('os'))).toMatchObject({ resultado: 'FAIL', observado: { motivo: 'texto-distinto-en-control' } });
  });

  test('D. no muta: no escribe, no hace clic, no selecciona, no cierra ni restablece el filtro', async ({ page }, info) => {
    // resetAlClic: si la assertion hiciera clic, el panel volvería al catálogo completo.
    const ui = await tras(page, info, {}, 'osé');
    const antes = await estadoUi(page);
    expect(antes).toMatchObject({ valor: 'osé', expandido: 'true', panelVisible: true, opciones: ['SAN JOSÉ DEL RÍO', 'VILLA JOSÉ'] });
    for (const op of [sugerencias('osé'), sugerencias('osé', 'sensibles'), sugerencias('os'), sugerencias('osé', 'insensibles', { filtroDesdeCampo: 'departamento' })]) {
      await uno(ui, op);
      expect(await estadoUi(page)).toEqual(antes);
    }
    // Con fuente fallida tampoco toca nada.
    const fallida = await tras(page, info, {}, 'osé', instantanea([DEPTOS_E]));
    const previo = await estadoUi(page);
    await uno(fallida, sugerencias('osé'));
    expect(await estadoUi(page)).toEqual(previo);
  });

  test('E. composición: escribir → valor → sugerencias → seleccionar → valor → reabrir según fuente → cerrar → valor', async ({ page }, info) => {
    const ui = await montar(page, info, UI_E, FUENTE_E);
    const ciudad = 'ciudadVivienda' as const;
    const r = await ejecutar(ui,
      elegir('DEPTO ESTE'),
      { tipo: 'escribir', campo: ciudad, texto: 'osé' },
      { tipo: 'campo-valor', campo: ciudad, valor: 'osé', comparacion: 'exacta' },
      sugerencias('osé'),
      { tipo: 'seleccionar-exacto', campo: ciudad, valor: 'VILLA JOSÉ' },
      { tipo: 'campo-valor', campo: ciudad, valor: 'VILLA JOSÉ', comparacion: 'exacta' },
      FUENTE, // reabre: catálogo completo según la fuente
      { tipo: 'cerrar-catalogo', campo: ciudad },
      { tipo: 'campo-valor', campo: ciudad, valor: 'VILLA JOSÉ', comparacion: 'exacta' });
    expect(r.map(x => `${x.tipo}:${x.resultado}`)).toEqual([
      'seleccionar-exacto:PASS', 'escribir:PASS', 'campo-valor:PASS', 'sugerencias-segun-fuente:PASS', 'seleccionar-exacto:PASS',
      'campo-valor:PASS', 'catalogo-segun-fuente:PASS', 'cerrar-catalogo:PASS', 'campo-valor:PASS']);
    expect(r[6].observado).toMatchObject({ cantidadEsperada: 4, cantidadObservada: 4 });
  });

  test('B. implementación genérica: sin nombres, códigos ni textos de un caso', async () => {
    for (const archivo of ['../data/afi/funcional.ts', '../helpers/afiFunctionalUi.ts']) {
      const fuente = await readFile(resolve(__dirname, archivo), 'utf8');
      expect(fuente, archivo).not.toMatch(/CH[IÍ]A|Ch[ií]a|\bChi\b|SOACHA|CUNDINAMARCA|['"](11|25)['"]|cp02/i);
    }
  });
});

// =====================================================================================
test.describe('4D regresión', () => {
  test('H. golden CP04 sigue válido y el contrato v1 no cambió de forma', () => {
    expect(validarDefinicionCasoAfi(CP04_EMPRESA)).toEqual([]);
    expect(validarDefinicionCasoAfi({ ...CP04_EMPRESA, variante: 'desktop' }).map(p => p.clase)).toEqual(['contrato']);
    const originales = {
      'texto-ausente': { requeridas: ['texto', 'coincidencia'], opcionales: ['evidencia'] },
      'catalogo-opcion-fuera-de': { requeridas: ['campo', 'excluir', 'normalizacion'], opcionales: ['evidencia'] },
      'catalogo-no-vacio': { requeridas: ['campo'], opcionales: ['evidencia'] },
      'seleccionar-exacto': { requeridas: ['campo', 'valor'], opcionales: ['normalizacion'] },
      'cerrar-catalogo': { requeridas: ['campo'], opcionales: [] },
    };
    for (const [tipo, c] of Object.entries(originales)) expect(CONTRATO[tipo as keyof typeof originales], tipo).toEqual(c);
  });

  test('H. el runner cierra las fuentes del driver con sus colaboradores', async () => {
    const runner = await readFile(resolve(__dirname, '../helpers/afiCaseRunner.ts'), 'utf8');
    expect(runner).toMatch(/cerrar: async \(\) => \{ await funcionalUi\.cerrar\(\); await soportePage\.close\(\); \}/);
  });
});
