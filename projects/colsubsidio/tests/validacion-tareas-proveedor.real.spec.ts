import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { actorDesdeEntorno } from '../data/afi/actores';
import {
  ALMACEN_APLICACION_AFI, construirModeloAplicacion, extensionDesdeAlmacen, type VinculoObservacion,
} from '../data/afi/aplicacion/modeloAplicacion';
import { testabilidadCanonica, type TestabilidadCompilacion } from '../data/afi/aplicacion/resolucionObservacion';
import { compilarCasoAfi, type DefinicionCasoAfi } from '../data/afi/caso';
import { CP04_PENSIONADO } from '../data/afi/casos/hu14-12-cp04';
import { ejecutarCasoAfi, preflightCasoAfi, type ResultadoCasoAfi } from '../helpers/afiCaseRunner';

/**
 * Fase 4R.2 — VALIDACIÓN REAL DEL MECANISMO (técnica, temporal). NO forma parte del suite normal.
 *
 * 4R.2 (dos corridas PASS) se hizo con el proveedor AÚN no productivo y doble autorización explícita. Tras la promoción
 * (cierre 4R) este spec corre la smoke post-promoción: proveedores CANÓNICOS (sin proveedoresHabilitados explícitos)
 * y SIN permitirNoProductivos. El vínculo sigue siendo solo de validación e inyectado.
 *
 * Demuestra SOLO: caso de la corrida -> Admin devuelve un work item pendiente -> vínculo de VALIDACIÓN exacto ->
 * ProveedorTareasPendientes -> actividad.alcanzada PASS, recorriendo contrato -> compilador -> runner -> fuente real.
 *
 * La entidad y el vínculo existen SOLO en este spec (nunca en application-model.json ni en el manifest). La entidad
 * significa únicamente "work item de validación cuyo vínculo técnico es este nombre": NO representa ningún paso QA ni
 * afirma relación alguna entre ese work item y la pantalla del Portal en la que se observa.
 */

const PROVEEDOR = 'tareas-pendientes-bizagi';
const ENTIDAD = 'actividad-validacion-registro-informacion-cliente';
const VINCULO: VinculoObservacion = {
  entidad: { tipo: 'actividad', id: ENTIDAD }, superficie: 'proceso-bpm', proveedor: PROVEEDOR,
  localizacion: { nombreTarea: 'Registro Información Cliente' },
};
const ALMACEN = extensionDesdeAlmacen(ALMACEN_APLICACION_AFI);
const MODELO = construirModeloAplicacion({
  ...ALMACEN, actividades: [...(ALMACEN.actividades ?? []), { id: ENTIDAD, descripcion: 'Work item de validación técnica del proveedor (sin significado funcional).' }],
});

/** Caso declarativo sintético: preparación de CP04 Pensionado + UN paso con la condición, sin operaciones de UI. */
const DEFINICION: DefinicionCasoAfi = {
  version: 1, hu: 'Validación técnica 4R.2', caso: 'validacion-tareas-pendientes', nombre: 'Validacion Tareas Pensionado',
  perfil: 'pensionado',
  preparacion: CP04_PENSIONADO.preparacion,
  funcional: {
    caso: 'validacion-tareas-pendientes',
    pasos: [{
      id: 'V01', esperado: 'El work item de validación está pendiente en el caso de la corrida.', operaciones: [],
      condiciones: [{ entidad: { tipo: 'actividad', id: ENTIDAD }, expectativa: { tipo: 'alcanzada' } }],
    }],
  },
};
const HITOS = {
  apertura: { id: 'P02', esperado: 'Pantalla de inicio visible.' },
  preparacion: { id: 'P03', esperado: 'La pantalla de Información de contacto carga exitosamente.' },
};

test.describe('4R.2 validación real del proveedor de tareas pendientes', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.use({ viewport: { width: 1365, height: 900 } });

  test('actividad.alcanzada por el circuito completo', async ({ page, context }, info) => {
    test.skip(process.env.AFI_VALIDACION_TAREAS_RUN_REAL !== 'true', 'Requiere AFI_VALIDACION_TAREAS_RUN_REAL=true');
    test.setTimeout(12 * 60_000);
    expect(info.config.workers, 'workers=1').toBe(1);
    expect(info.project.retries, 'retries=0').toBe(0);
    const corrida = (process.env.AFI_VALIDACION_CORRIDA ?? 'x').replace(/[^\w-]/g, '');
    const actor = actorDesdeEntorno('pensionado', process.env);
    // Configuración CANÓNICA de proveedores (solo productivos) + modelo/vínculo de validación inyectados.
    const testabilidad: TestabilidadCompilacion = { ...testabilidadCanonica(), modelo: MODELO, vinculos: [VINCULO] };

    // ---- Comprobado ANTES de navegar: productivo, sin habilitación explícita ni marca de validación ----
    const compilado = compilarCasoAfi(DEFINICION, actor, { testabilidad });
    expect(compilado.observacion.condiciones.map(c => [c.condicion, c.proveedor, c.superficie, c.validacion])).toEqual([['V01#1', PROVEEDOR, 'proceso-bpm', false]]);
    expect(() => preflightCasoAfi(compilado), 'productivo: no requiere permitirNoProductivos').not.toThrow();

    // ---- Corrida real: colaboradores REALES del runner (sin sustituir nada) ----
    let resultado: ResultadoCasoAfi | undefined;
    let errorType: string | undefined;
    try {
      resultado = await ejecutarCasoAfi(compilado, {
        page, context, testInfo: info, hitos: HITOS, evidencia: 'off',
        observacion: { modelo: MODELO, vinculos: [VINCULO], reintentos: { intentos: 3, intervaloMs: 10_000 } },
      });
    } catch (e) { errorType = e instanceof Error ? e.name : 'Error'; }

    const obs = resultado?.observaciones?.[0];
    const salida = {
      corrida,
      reachedFunctionalPoint: !!resultado?.trazaTecnica.some(e => e.evento === 'informacion-contacto-alcanzada' && e.estado === 'PASS'),
      provider: PROVEEDOR, entidad: ENTIDAD, expectativa: 'alcanzada',
      observacion: obs?.resultado ?? 'SIN_OBSERVACION',
      ...(obs?.noObservado ? { motivos: obs.noObservado.intentos.map(i => i.motivo) } : {}),
      // El proveedor solo certifica si la fuente administra el MISMO caso que la corrida le pasa (casoBizagi).
      correlationOk: obs?.resultado === 'PASS',
      validacion: resultado?.observacionValidacion === true,
      resultadoCaso: resultado?.resultado ?? 'FAIL',
      cleanup: resultado ? (resultado.cleanup === 'exitoso' ? 'PASS' : resultado.cleanup === 'no aplica' ? 'N/A' : 'FAIL') : 'desconocido',
      ...(errorType ? { errorType } : {}),
    };
    await mkdir('test-results/colsubsidio/validacion-tareas', { recursive: true });
    await writeFile(`test-results/colsubsidio/validacion-tareas/validacion-${corrida}.json`, JSON.stringify(salida, null, 2), 'utf8');
    console.log(`VALIDACION ${JSON.stringify(salida)}`);
    expect(salida.observacion).toBe('PASS');
    expect(salida.validacion, 'productivo: no es una corrida de validación').toBe(false);
    expect(salida.cleanup).toBe('PASS');
  });
});
