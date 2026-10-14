import { test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { rutasConocimiento } from '../data/afi/aplicacion/intakeDisco';
import { DatosPruebaError } from '../data/afi/datosPrueba/contrato';
import { rutasDatos } from '../data/afi/datosPrueba/disco';
import { prepararIntakeUnificado } from '../data/afi/intakeUnificado';

/**
 * HARNESS técnico del intake UNIFICADO (Fase 4Q): `tools/afi.mjs <proyecto> intake preparar <salida>`.
 * Orquesta los preparadores existentes (4O conocimiento, 4Q datos de prueba) sobre el MISMO envelope; no aplica nada.
 * Variables de CONTROL: AFI_INTAKE_ACCION, AFI_INTAKE_ENTRADA, AFI_INTAKE_OUTPUT. Sin navegador.
 */
const ACCION = process.env.AFI_INTAKE_ACCION;
const RAIZ = resolve(__dirname, '../../..');

test.describe('AFI intake unificado (harness)', () => {
  test.skip(!ACCION, 'Solo se ejecuta desde tools/afi.mjs intake');

  test('intake', async () => {
    const salida = process.env.AFI_INTAKE_OUTPUT;
    const proyecto = process.env.PROJECT!;
    const emitir = (texto: string, datos: Record<string, unknown>) => (salida ? writeFile(salida, JSON.stringify({ texto, datos }), 'utf8') : Promise.resolve());
    try {
      const r = prepararIntakeUnificado(resolve(RAIZ, process.env.AFI_INTAKE_ENTRADA!), rutasConocimiento(RAIZ, proyecto), rutasDatos(RAIZ, proyecto), proyecto);
      const lineas: string[] = [`INTAKE PREPARADO (formato ${r.formato}; nada se aplicó)`];
      const datos: Record<string, unknown> = { ok: true, accion: 'preparar', formato: r.formato };
      if (r.conocimiento) {
        const k = r.conocimiento;
        lineas.push(`CONOCIMIENTO lote ${k.artefacto.batchId}: ${k.artefacto.resumen.unicas} propuesta(s), ${k.artefacto.resumen.clasificacionesPendientes} clasificación(es)`,
          `  revisión: ${k.archivoRevision}`, `  decisiones: ${k.archivoDecisiones}`,
          `  aplicar: node tools/afi.mjs ${proyecto} conocimiento aplicar ${k.archivoRevision} ${k.archivoDecisiones} --dry-run`);
        datos.conocimiento = { batchId: k.artefacto.batchId, revision: k.archivoRevision, decisiones: k.archivoDecisiones, resumen: k.artefacto.resumen };
      } else lineas.push('CONOCIMIENTO: sin propuestas ni clasificaciones (no se preparó lote)');
      if (r.datosPrueba) {
        const d = r.datosPrueba;
        lineas.push(`DATOS DE PRUEBA lote ${d.lote.batchId}: ${d.lote.resumen.propuestas} actor(es) propuesto(s), ${d.lote.resumen.reutilizados} reutilización(es), ${d.lote.resumen.rechazados} rechazado(s)`,
          `  para leer: ${d.archivoMd}`, `  revisión: ${d.archivoRevision}`, `  decisiones: ${d.archivoDecisiones}`,
          `  aplicar: node tools/afi.mjs ${proyecto} datos aplicar ${d.archivoRevision} ${d.archivoDecisiones} --dry-run`);
        datos.datosPrueba = { batchId: d.lote.batchId, revision: d.archivoRevision, decisiones: d.archivoDecisiones, legible: d.archivoMd, resumen: d.lote.resumen };
      } else lineas.push('DATOS DE PRUEBA: sin requisitos (no se preparó lote)');
      await emitir(lineas.join('\n'), datos);
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      const codigo = e instanceof DatosPruebaError ? e.codigo : (e as { codigo?: string }).codigo ?? e.name;
      await emitir(`ERROR ${e.message}`, { ok: false, error: { codigo, mensaje: e.message } });
      throw e;
    }
  });
});
