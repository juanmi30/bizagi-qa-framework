import { test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generarSoporteAfi, type ResultadoSoporteAfi } from '../data/afi/soporte/generar';

/**
 * HARNESS técnico del soporte de certificación (Fase 4H): lo invoca tools/afi-soporte.mjs. No abre navegador,
 * no ejecuta el caso ni captura el Portal: solo lee diseño QA + paquete 4G + plantilla y escribe el soporte.
 * Variables de CONTROL: AFI_SOPORTE_CASO, AFI_SOPORTE_EVIDENCIAS, AFI_SOPORTE_META, AFI_SOPORTE_DISENO,
 * AFI_SOPORTE_TEMPLATE, AFI_SOPORTE_OUTPUT. Sin ellas se omite.
 */
const CASO = process.env.AFI_SOPORTE_CASO;
const RAIZ = resolve(__dirname, '../../..');

function texto(r: ResultadoSoporteAfi): string {
  const p = r.plan;
  return [
    `${p.estado}${p.motivo ? ` motivo=${p.motivo}` : ''} ${p.caso} numeroCaso=${p.numeroCaso ?? '-'} resultado=${p.resultado}`,
    ...p.problemas.map(x => `  ${x.codigo}${x.paso ? ` ${x.paso}` : ''}: ${x.detalle}`),
    ...p.pasos.map(x => `  Paso ${x.numeroDiseno} (${x.idAfi}) ${x.resultado}  ${x.ordenDocumento.join(' + ') || '(sin evidencia)'}`),
    `cobertura: ${p.cobertura.estado} (${p.cobertura.variante}; incluidos ${p.cobertura.pasosIncluidos.join(',') || '-'}; no incluidos ${p.cobertura.pasosNoIncluidos.length})`,
    `plan: ${r.planArchivo}`,
    ...(r.docx
      ? [`docx: ${r.docx}`, 'estado docx: GENERADO (válido y actualizable). Para FINALIZAR el índice: abrir en Word y aceptar la '
        + `actualización de campos, o: node tools/afi-soporte-render.mjs "${r.docx}" --actualizar`]
      : ['docx: no generado']),
  ].join('\n');
}

test.describe('AFI soporte de certificación (harness)', () => {
  test.skip(!CASO, 'Solo se ejecuta desde tools/afi-soporte.mjs');

  test('generar soporte', async () => {
    const salida = process.env.AFI_SOPORTE_OUTPUT;
    let r: ResultadoSoporteAfi;
    try {
      r = await generarSoporteAfi({
        raiz: RAIZ, proyecto: process.env.PROJECT!, caso: CASO!,
        meta: process.env.AFI_SOPORTE_META!, evidencias: process.env.AFI_SOPORTE_EVIDENCIAS!,
        diseno: process.env.AFI_SOPORTE_DISENO || undefined, template: process.env.AFI_SOPORTE_TEMPLATE || undefined,
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      if (salida) await writeFile(salida, JSON.stringify({ texto: `ERROR ${e.name}: ${e.message}`, datos: { ok: false, error: { tipo: e.name, mensaje: e.message } } }), 'utf8');
      throw e;
    }
    const ok = r.plan.estado === 'GENERABLE';
    if (salida) await writeFile(salida, JSON.stringify({ texto: texto(r), datos: { ok, estado: r.plan.estado, motivo: r.plan.motivo, problemas: r.plan.problemas, plan: r.planArchivo, docx: r.docx } }), 'utf8');
    if (!ok) throw new Error(`${r.plan.estado === 'SOPORTE_NO_GENERABLE' ? 'SOPORTE_NO_GENERABLE' : r.plan.estado}: ${r.plan.motivo}`);
  });
});
