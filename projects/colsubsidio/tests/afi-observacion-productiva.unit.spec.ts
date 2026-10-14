import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { diagnosticarCondicion } from '../data/afi/aplicacion/gaps';
import { MODELO_APLICACION_AFI, construirModeloAplicacion } from '../data/afi/aplicacion/modeloAplicacion';
import { observarCondicion } from '../data/afi/aplicacion/observacion';
import { ProveedorMemoria } from '../data/afi/aplicacion/proveedoresMemoria';
import { ProveedorTareasPendientes, VinculoTareaInvalidoError, type FuenteTareasPendientes } from '../data/afi/aplicacion/proveedorTareasPendientes';
import {
  ContextoObservacionInvalidoError, ObservacionNoDisponibleError, PROVEEDORES_PRODUCTIVOS, publicarSuperficies,
  type CondicionObservable, type ContextoObservacion, type ObservationProvider, type TipoEntidad,
} from '../data/afi/aplicacion/superficies';
import { BizagiQaSupport } from '../helpers/bizagiQaSupport';
import { FuenteTareasBizagiQa } from '../helpers/fuenteTareasBizagiQa';

/**
 * Fase 4R: frontera ObservationProvider fail-closed y primer proveedor con fuente REAL (tareas pendientes del caso).
 * Todo sintético: entidades, tareas, casos y valores. Ninguna HU concreta.
 */

const CASO = '310801';
const CTX: ContextoObservacion = { caso: 'caso-sintetico', ejecucion: 'ejecucion-1', casoBizagi: CASO };
const MODELO = construirModeloAplicacion({
  actividades: [{ id: 'actividad-a', descripcion: 'Actividad sintética A' }, { id: 'actividad-b', descripcion: 'Actividad sintética B' }],
  rutas: [{ id: 'ruta-a-b', desde: 'actividad-a', hacia: 'actividad-b', descripcion: 'Ruta sintética' }],
  integraciones: [{ id: 'integracion-x', descripcion: 'Integración sintética' }],
  variables: [{ id: 'variable-ambas', descripcion: 'Dato sintético', ambito: { tipo: 'proceso' }, superficies: ['proceso-bpm', 'integracion'] }],
});
const VINCULOS = new Map([['actividad-a', 'Tarea sintética A'], ['actividad-b', 'Tarea sintética B']]);

/** Fuente en memoria: simula Admin → Casos sin red. */
function fuente(pendientes: readonly string[] | Error, caso: string | null = CASO): FuenteTareasPendientes & { lecturas: number } {
  return {
    lecturas: 0,
    casoAdministrado: () => caso ?? undefined,
    async tareasPendientes() { this.lecturas++; if (pendientes instanceof Error) throw pendientes; return pendientes; },
  };
}
const alcanzada = (id: string): CondicionObservable => ({ id: `c-${id}`, entidad: { tipo: 'actividad', id }, expectativa: { tipo: 'alcanzada' } });
const noAlcanzada = (id: string): CondicionObservable => ({ id: `n-${id}`, entidad: { tipo: 'actividad', id }, expectativa: { tipo: 'no-alcanzada' } });
/** Proveedor sintético con observe controlado. */
const fijo = (id: string, superficie: ObservationProvider['superficie'], tipos: TipoEntidad[], observe: ObservationProvider['observe']): ObservationProvider =>
  ({ id, superficie, supports: e => tipos.includes(e.tipo), observe });

// =====================================================================================
test.describe('4R.1 proveedor correcto y expectativas certificables', () => {
  test('actividad vinculada y pendiente en el caso correlacionado: PASS por proceso-bpm, evidencia sin caso ni tarea', async () => {
    const p = new ProveedorTareasPendientes(fuente(['Otra tarea', 'Tarea sintética A']), VINCULOS);
    const r = await observarCondicion(alcanzada('actividad-a'), MODELO, [p], CTX);
    expect([r.resultado, r.superficie, r.proveedor]).toEqual(['PASS', 'proceso-bpm', 'tareas-pendientes-bizagi']);
    expect(r.medicion).toEqual({ tipo: 'presencia', presente: true });
    expect(JSON.stringify(r)).not.toMatch(new RegExp(`${CASO}|Tarea sintética`));
    expect(diagnosticarCondicion(alcanzada('actividad-a'), MODELO, [p])).toEqual({ estado: 'REPRESENTABLE', superficie: 'proceso-bpm', proveedor: 'tareas-pendientes-bizagi' });
  });

  test('instantánea: la negación NO es certificable -> TESTABILITY_GAP atómico de esa expectativa, sin consultar la fuente', async () => {
    const f = fuente([]);
    const p = new ProveedorTareasPendientes(f, VINCULOS);
    const r = await observarCondicion(noAlcanzada('actividad-a'), MODELO, [p], CTX);
    expect(r).toMatchObject({ resultado: 'NO_OBSERVABLE', gap: { clase: 'provider-superficie', superficiesCandidatas: ['proceso-bpm'], capacidad: 'observar actividad no-alcanzada' } });
    expect(f.lecturas).toBe(0);
    expect(diagnosticarCondicion(noAlcanzada('actividad-a'), MODELO, [p])).toMatchObject({ estado: 'TESTABILITY_GAP', gap: { capacidad: 'observar actividad no-alcanzada' } });
  });

  test('ruta, variable e integración no son soportadas por la fuente de tareas: TESTABILITY_GAP intacto', () => {
    const p = new ProveedorTareasPendientes(fuente([]), VINCULOS);
    const casos: [CondicionObservable, string][] = [
      [{ id: 'r', entidad: { tipo: 'ruta', id: 'ruta-a-b' }, expectativa: { tipo: 'tomada' } }, 'observar ruta'],
      [{ id: 'v', entidad: { tipo: 'variable', id: 'variable-ambas' }, expectativa: { tipo: 'valor', igual: null } }, 'observar variable'],
      [{ id: 'i', entidad: { tipo: 'integracion', id: 'integracion-x' }, expectativa: { tipo: 'resultado', igual: 'exito' } }, 'observar integracion'],
    ];
    for (const [c, capacidad] of casos) expect(diagnosticarCondicion(c, MODELO, [p]), c.id).toMatchObject({ estado: 'TESTABILITY_GAP', gap: { capacidad } });
  });

  test('actividad registrada SIN vínculo declarativo: no soportada (TESTABILITY_GAP), nunca adivinada por nombre', async () => {
    const p = new ProveedorTareasPendientes(fuente(['actividad-b', 'Actividad sintética B']), new Map([['actividad-a', 'Tarea sintética A']]));
    expect(diagnosticarCondicion(alcanzada('actividad-b'), MODELO, [p])).toMatchObject({ estado: 'TESTABILITY_GAP', gap: { capacidad: 'observar actividad' } });
    expect((await observarCondicion(alcanzada('actividad-b'), MODELO, [p], CTX)).resultado).toBe('NO_OBSERVABLE');
  });

  test('vínculos inválidos (vacío o con posible PII) se rechazan al construir', () => {
    expect(() => new ProveedorTareasPendientes(fuente([]), new Map([['actividad-a', '  ']]))).toThrow(VinculoTareaInvalidoError);
    expect(() => new ProveedorTareasPendientes(fuente([]), new Map([['actividad-a', 'Tarea de 1023456789']]))).toThrow(VinculoTareaInvalidoError);
  });
});

// =====================================================================================
test.describe('4R.2 superficie incorrecta y frontera', () => {
  test('un proveedor de otra superficie que dice soportar la actividad nunca la observa', async () => {
    const intruso = new ProveedorMemoria('ui-intrusa', 'portal-ui', ['actividad'], { presentes: { actividad: ['actividad-a'] } });
    const r = await observarCondicion(alcanzada('actividad-a'), MODELO, [intruso], CTX);
    expect(r).toMatchObject({ resultado: 'NO_OBSERVABLE', gap: { superficiesCandidatas: ['proceso-bpm'] } });
    expect(diagnosticarCondicion(alcanzada('actividad-a'), MODELO, [intruso]).estado).toBe('TESTABILITY_GAP');
  });

  test('una medición incompatible con la expectativa es error-proveedor, no FAIL', async () => {
    const roto = fijo('roto', 'proceso-bpm', ['actividad'], async () => ({ medicion: { tipo: 'valor', existe: true, valor: 'x' }, evidencia: { tipo: 't', referencia: 'r' } }));
    const r = await observarCondicion(alcanzada('actividad-a'), MODELO, [roto], CTX);
    expect(r).toMatchObject({ resultado: 'NO_OBSERVABLE', noObservado: { intentos: [{ superficie: 'proceso-bpm', proveedor: 'roto', motivo: 'error-proveedor' }] } });
  });
});

// =====================================================================================
test.describe('4R.3 fail-closed: infraestructura, autenticación, dato ausente', () => {
  for (const motivo of ['infraestructura', 'autenticacion'] as const) {
    test(`${motivo} de la fuente -> NO_OBSERVABLE (${motivo}), nunca FAIL`, async () => {
      const p = new ProveedorTareasPendientes(fuente(new ObservacionNoDisponibleError(motivo)), VINCULOS);
      const r = await observarCondicion(alcanzada('actividad-a'), MODELO, [p], CTX);
      expect(r).toEqual({
        condicion: 'c-actividad-a', entidad: { tipo: 'actividad', id: 'actividad-a' }, expectativa: { tipo: 'alcanzada' },
        resultado: 'NO_OBSERVABLE', noObservado: { intentos: [{ superficie: 'proceso-bpm', proveedor: 'tareas-pendientes-bizagi', motivo }] },
      });
    });
  }

  test('tarea vinculada ausente en la instantánea -> dato-ausente (pudo pasar o no llegar), nunca FAIL', async () => {
    const r = await observarCondicion(alcanzada('actividad-a'), MODELO, [new ProveedorTareasPendientes(fuente(['Otra tarea']), VINCULOS)], CTX);
    expect(r).toMatchObject({ resultado: 'NO_OBSERVABLE', noObservado: { intentos: [{ motivo: 'dato-ausente' }] } });
  });

  test('sin correlación runtime, o con otro caso que el administrado -> dato-ausente sin leer la fuente', async () => {
    for (const [ctx, administrado] of [[{ caso: 'c', ejecucion: 'e' }, CASO], [CTX, '999001'], [CTX, null]] as const) {
      const f = fuente(['Tarea sintética A'], administrado);
      const r = await observarCondicion(alcanzada('actividad-a'), MODELO, [new ProveedorTareasPendientes(f, VINCULOS)], ctx);
      expect(r.noObservado?.intentos[0].motivo).toBe('dato-ausente');
      expect(f.lecturas).toBe(0);
    }
  });

  test('error inesperado del proveedor: error-proveedor; su mensaje (con PII sintética) no aparece en el resultado ni en consola', async () => {
    const SECRETO = 'buzon.sintetico@example.test 1023456789';
    const llamadas: unknown[] = [];
    const originales = { log: console.log, error: console.error, warn: console.warn };
    for (const k of ['log', 'error', 'warn'] as const) console[k] = (...a: unknown[]) => { llamadas.push(a); };
    try {
      const p = new ProveedorTareasPendientes(fuente(new Error(`fallo con ${SECRETO}`)), VINCULOS);
      const r = await observarCondicion(alcanzada('actividad-a'), MODELO, [p], CTX);
      expect(r.noObservado?.intentos[0].motivo).toBe('error-proveedor');
      expect(JSON.stringify(r)).not.toMatch(/buzon|example|1023456789/);
    } finally { Object.assign(console, originales); }
    expect(llamadas).toEqual([]);
  });

  test('un intento fallido no bloquea la siguiente superficie efectiva; todos fallidos conservan cada motivo', async () => {
    const valor = { 'variable-ambas': 'v' };
    const caido = fijo('bpm-caido', 'proceso-bpm', ['variable'], async () => { throw new ObservacionNoDisponibleError('infraestructura'); });
    const integracion = new ProveedorMemoria('integracion-memoria', 'integracion', ['variable'], { variables: valor });
    const c: CondicionObservable = { id: 'v', entidad: { tipo: 'variable', id: 'variable-ambas' }, expectativa: { tipo: 'valor', igual: 'v' } };
    expect(await observarCondicion(c, MODELO, [caido, integracion], CTX)).toMatchObject({ resultado: 'PASS', superficie: 'integracion' });
    const otroCaido = fijo('int-caido', 'integracion', ['variable'], async () => ({ noObservable: 'autenticacion' }));
    expect((await observarCondicion(c, MODELO, [caido, otroCaido], CTX)).noObservado?.intentos.map(i => i.motivo)).toEqual(['infraestructura', 'autenticacion']);
  });
});

// =====================================================================================
test.describe('4R.4 el actor no certifica resultados y los valores no se publican', () => {
  test('el contexto rechaza actorRef, estado de provisión o cualquier clave ajena; casoBizagi debe ser un número', async () => {
    const p = new ProveedorTareasPendientes(fuente(['Tarea sintética A']), VINCULOS);
    for (const extra of [{ actorRef: 'actor-sintetico' }, { provision: 'READY' }, { casoBizagi: 'actor-sintetico' }]) {
      await expect(observarCondicion(alcanzada('actividad-a'), MODELO, [p], { ...CTX, ...extra } as ContextoObservacion)).rejects.toThrow(ContextoObservacionInvalidoError);
    }
  });

  test('sin proveedor, un actor "listo" no cambia nada: NO_OBSERVABLE con el gap 4M de siempre', async () => {
    const r = await observarCondicion(alcanzada('actividad-a'), MODELO, [], CTX);
    expect(r).toEqual({
      condicion: 'c-actividad-a', entidad: { tipo: 'actividad', id: 'actividad-a' }, expectativa: { tipo: 'alcanzada' },
      resultado: 'NO_OBSERVABLE', gap: { clase: 'provider-superficie', superficiesCandidatas: ['proceso-bpm'], capacidad: 'observar actividad' },
    });
  });

  test('variable observada: el veredicto usa el valor, pero el resultado publica solo su existencia', async () => {
    const PII = 'Persona Sintética 1023456789';
    const p = new ProveedorMemoria('bpm-memoria', 'proceso-bpm', ['variable'], { variables: { 'variable-ambas': PII } });
    const igual = await observarCondicion({ id: 'v', entidad: { tipo: 'variable', id: 'variable-ambas' }, expectativa: { tipo: 'valor', igual: PII } }, MODELO, [p], CTX);
    const distinto = await observarCondicion({ id: 'v', entidad: { tipo: 'variable', id: 'variable-ambas' }, expectativa: { tipo: 'valor', igual: 'otro' } }, MODELO, [p], CTX);
    expect([igual.resultado, distinto.resultado]).toEqual(['PASS', 'FAIL']);
    expect(distinto.medicion).toEqual({ tipo: 'valor', existe: true });
    expect(JSON.stringify(distinto)).not.toMatch(/Persona|1023456789/);
  });
});

// =====================================================================================
test.describe('4R.5 compatibilidad 4L/4M y registro productivo', () => {
  test('proveedor legado sin expectativas declaradas: certifica todas las del tipo, como antes', async () => {
    const legado = new ProveedorMemoria('bpm-memoria', 'proceso-bpm', ['actividad'], { presentes: { actividad: ['actividad-a'] } });
    expect((await observarCondicion(noAlcanzada('actividad-b'), MODELO, [legado], CTX)).resultado).toBe('PASS');
    expect((await observarCondicion(noAlcanzada('actividad-a'), MODELO, [legado], CTX)).resultado).toBe('FAIL');
    expect(diagnosticarCondicion(noAlcanzada('actividad-a'), MODELO, [legado]).estado).toBe('REPRESENTABLE');
  });

  test('el proveedor real es productivo SOLO en su alcance: proceso-bpm queda parcial (actividad.alcanzada)', () => {
    expect(PROVEEDORES_PRODUCTIVOS).toEqual([{ id: 'tareas-pendientes-bizagi', superficie: 'proceso-bpm', alcance: { tipos: ['actividad'], expectativas: ['alcanzada'] } }]);
    expect(publicarSuperficies().find(s => s.superficie === 'proceso-bpm')).toMatchObject({
      proveedores: ['tareas-pendientes-bizagi'], estado: 'parcial',
      cobertura: [{ proveedor: 'tareas-pendientes-bizagi', observaciones: [{ entidad: 'actividad', expectativas: ['alcanzada'] }] }],
    });
  });

  test('generalidad sobre el modelo canónico: TODA actividad registrada se vuelve observable (alcanzada) solo con su vínculo', () => {
    const actividades = MODELO_APLICACION_AFI.proceso.actividades.map(a => a.id);
    const conVinculo = new ProveedorTareasPendientes(fuente([]), new Map(actividades.map((id, i) => [id, `Tarea sintética ${i}`])));
    const sinVinculo = new ProveedorTareasPendientes(fuente([]), new Map());
    for (const id of actividades) {
      expect(diagnosticarCondicion(alcanzada(id), MODELO_APLICACION_AFI, [sinVinculo]).estado, id).toBe('TESTABILITY_GAP');
      expect(diagnosticarCondicion(alcanzada(id), MODELO_APLICACION_AFI, [conVinculo]).estado, id).toBe('REPRESENTABLE');
      expect(diagnosticarCondicion(noAlcanzada(id), MODELO_APLICACION_AFI, [conVinculo]).estado, id).toBe('TESTABILITY_GAP');
    }
    // El resto de tipos registrados no gana observabilidad.
    const otros: CondicionObservable[] = [
      ...MODELO_APLICACION_AFI.proceso.rutas.map(r => ({ id: r.id, entidad: { tipo: 'ruta' as const, id: r.id }, expectativa: { tipo: 'tomada' as const } })),
      ...MODELO_APLICACION_AFI.variables.map(v => ({ id: v.id, entidad: { tipo: 'variable' as const, id: v.id }, expectativa: { tipo: 'valor' as const, igual: null } })),
      ...MODELO_APLICACION_AFI.integraciones.map(i => ({ id: i.id, entidad: { tipo: 'integracion' as const, id: i.id }, expectativa: { tipo: 'resultado' as const, igual: 'exito' as const } })),
      ...MODELO_APLICACION_AFI.notificaciones.map(n => ({ id: n.id, entidad: { tipo: 'notificacion' as const, id: n.id }, expectativa: { tipo: 'emitida' as const } })),
    ];
    for (const c of otros) expect(diagnosticarCondicion(c, MODELO_APLICACION_AFI, [conVinculo]).estado, c.id).toBe('TESTABILITY_GAP');
  });

  test('blindaje: el runtime nuevo no nombra HU, sistemas, casos, campos ni valores concretos', async () => {
    const prohibido = /HU\s*1\d|14\.8|\bSAP\b|CP0\d|\bP\d{2}\b|correo|Continua|sBP|sEstado|sMotivo|sGrupo|\d{5,}/i;
    for (const f of ['data/afi/aplicacion/observacion.ts', 'data/afi/aplicacion/proveedorTareasPendientes.ts', 'helpers/fuenteTareasBizagiQa.ts']) {
      expect(await readFile(resolve(__dirname, '..', f), 'utf8'), f).not.toMatch(prohibido);
    }
  });
});

// =====================================================================================
// Adaptador REAL (Admin → Casos) sobre un DOM local: misma ruta de código que en QA, sin Bizagi.

function adminCasos(tareas: readonly string[]): string {
  return `
    <div role="dialog" aria-label="Casos">
      <input id="caseInput"><button id="btn-admin-case-search">Buscar</button><div id="res"></div>
    </div>
    <script>(() => {
      const tareas = ${JSON.stringify(tareas)};
      document.getElementById('btn-admin-case-search').addEventListener('click', () => {
        const n = document.getElementById('caseInput').value;
        document.getElementById('res').innerHTML = '<input type="radio" name="CaseAdmin" data-subprocess="false" value="' + n + '">'
          + tareas.map((t, i) => '<input type="checkbox" name="workItemAdmin" value="' + n + '|' + i + '|' + t + '|' + n + '">').join('');
      });
    })();</script>`;
}

class SoporteLocal extends BizagiQaSupport {
  constructor(page: Page, private readonly tareas: readonly string[], private readonly falla: 'login' | 'admin' | null = null) {
    super(page, { registrar: async () => ({}) as never, marcarDepurado: async () => ({}) as never, listar: async () => [] });
    this.presupuestoBusqueda = { total: 3_000, intervalo: 50, esperaResultados: 20, reconstruirSinResultado: 600, minimoReapertura: 300 };
  }
  override async login(): Promise<void> { if (this.falla === 'login') throw new Error(`login rechazado para ${CASO}`); }
  override async abrirAdministracionCasos(): Promise<Locator> {
    if (this.falla === 'admin') throw new Error(`Admin no disponible para ${CASO}`);
    await this.page.setContent(adminCasos(this.tareas));
    return this.page.getByRole('dialog', { name: 'Casos', exact: true });
  }
}

test.describe('4R.6 adaptador Admin → Casos (DOM local)', () => {
  test('lee las tareas pendientes del caso de la corrida y el proveedor certifica la actividad vinculada', async ({ page }) => {
    const soporte = new SoporteLocal(page, ['Tarea sintética B', 'Tarea sintética A']);
    await soporte.registrarCasoCreado(CASO, 'unit 4R');
    const fuenteReal = new FuenteTareasBizagiQa(soporte);
    expect(await fuenteReal.tareasPendientes()).toEqual(['Tarea sintética B', 'Tarea sintética A']);
    const r = await observarCondicion(alcanzada('actividad-a'), MODELO, [new ProveedorTareasPendientes(fuenteReal, VINCULOS)], CTX);
    expect([r.resultado, r.proveedor]).toEqual(['PASS', 'tareas-pendientes-bizagi']);
  });

  test('clasificación por etapa: sin caso -> dato-ausente; sin sesión -> autenticacion; fallo con sesión -> infraestructura; sin mensajes originales', async ({ page }) => {
    const motivo = async (s: SoporteLocal) => {
      const e = await new FuenteTareasBizagiQa(s).tareasPendientes().then(() => null, (x: unknown) => x);
      expect(e).toBeInstanceOf(ObservacionNoDisponibleError);
      expect((e as Error).message).not.toContain(CASO);
      return (e as ObservacionNoDisponibleError).motivo;
    };
    expect(await motivo(new SoporteLocal(page, []))).toBe('dato-ausente');
    for (const [falla, esperado] of [['login', 'autenticacion'], ['admin', 'infraestructura']] as const) {
      const s = new SoporteLocal(page, [], falla);
      await s.registrarCasoCreado(CASO, 'unit 4R');
      expect(await motivo(s), falla).toBe(esperado);
    }
  });
});
