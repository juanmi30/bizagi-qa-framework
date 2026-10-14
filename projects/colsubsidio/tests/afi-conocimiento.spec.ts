import { test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { aplicarEnDisco, aplicarVinculosEnDisco, prepararEnDisco, prepararVinculosEnDisco, rutasConocimiento } from '../data/afi/aplicacion/intakeDisco';
import { IntakeError } from '../data/afi/aplicacion/intakeLote';

/**
 * HARNESS técnico del intake de conocimiento (Fase 4O): lo invoca `tools/afi.mjs <proyecto> conocimiento ...`.
 * Sin navegador, sin Portal, sin runtime: solo lee/escribe conocimiento declarativo del proyecto.
 * Variables de CONTROL: AFI_CONOCIMIENTO_ACCION (preparar|aplicar), AFI_CONOCIMIENTO_ENTRADA, AFI_CONOCIMIENTO_REVISION,
 * AFI_CONOCIMIENTO_DECISIONES, AFI_CONOCIMIENTO_DIR_REVISION, AFI_CONOCIMIENTO_DRY_RUN, AFI_CONOCIMIENTO_FECHA,
 * AFI_CONOCIMIENTO_OUTPUT. Sin ellas se omite. Las rutas llegan relativas a la raíz del repositorio.
 */
const ACCION = process.env.AFI_CONOCIMIENTO_ACCION;
const RAIZ = resolve(__dirname, '../../..');

test.describe('AFI intake de conocimiento (harness)', () => {
  test.skip(!ACCION, 'Solo se ejecuta desde tools/afi.mjs conocimiento');

  test('conocimiento', async () => {
    const salida = process.env.AFI_CONOCIMIENTO_OUTPUT;
    const rutas = rutasConocimiento(RAIZ, process.env.PROJECT!, process.env.AFI_CONOCIMIENTO_DIR_REVISION || undefined);
    const emitir = (texto: string, datos: Record<string, unknown>) => (salida ? writeFile(salida, JSON.stringify({ texto, datos }), 'utf8') : Promise.resolve());
    try {
      if (ACCION === 'preparar') {
        const r = prepararEnDisco(rutas, resolve(RAIZ, process.env.AFI_CONOCIMIENTO_ENTRADA!));
        const a = r.artefacto, s = a.resumen;
        await emitir([
          `PREPARADO lote ${a.batchId} sobre revisionBase ${a.revisionBase} (el Application Model NO se modificó)`,
          `  propuestas: recibidas ${s.propuestasRecibidas}, válidas ${s.validas}, rechazadas ${s.rechazadas}, únicas ${s.unicas}, posibles duplicados ${s.posiblesDuplicados}`,
          `  clasificaciones pendientes: ${s.clasificacionesPendientes}; knowledge gaps recibidos: ${s.knowledgeGapsRecibidos}; entidades previstas: ${s.entidadesPrevistas}; runtimeChanges: 0`,
          ...a.propuestas.map(p => `  PENDING_REVIEW ${p.proposalId} -> ${p.entidad}${p.dependeDe.length ? ` (depende de ${p.dependeDe.join(', ')})` : ''}`),
          ...a.rechazadas.map(x => `  RECHAZADA ${x.seccion}[${x.indice}]${x.referencia ? ` ${x.referencia}` : ''}: ${[...new Set(x.problemas.map(p => p.motivo))].join(', ')}`),
          ...a.posiblesDuplicados.map(x => `  POSSIBLE_DUPLICATE ${x.propuestas.join(' / ')} (${x.motivo})`),
          ...a.solicitudesClasificacion.map(x => `  NEEDS_CLASSIFICATION ${x.solicitudId}: ${x.alternativas.join(' | ')}`),
          `revisión: ${r.archivoRevision}`,
          `decisiones: ${r.archivoDecisiones}${r.plantillaNueva ? ' (plantilla nueva: todas las decisiones en null)' : ' (ya existía: no se sobrescribió)'}`,
        ].join('\n'), { ok: true, accion: 'preparar', batchId: a.batchId, revisionBase: a.revisionBase, resumen: s, revision: r.archivoRevision, decisiones: r.archivoDecisiones });
        return;
      }
      if (ACCION === 'aplicar') {
        const dryRun = process.env.AFI_CONOCIMIENTO_DRY_RUN === '1';
        const r = aplicarEnDisco(rutas, resolve(RAIZ, process.env.AFI_CONOCIMIENTO_REVISION!), resolve(RAIZ, process.env.AFI_CONOCIMIENTO_DECISIONES!), process.env.AFI_CONOCIMIENTO_FECHA!, dryRun);
        const x = r.resultado, m = x.metricas;
        const titulo = x.estado === 'YA_APLICADO' ? `YA_APLICADO lote ${x.batchId}: sus entidades ya están en la revisión ${x.revisionAntes}; no se duplica ni sobrescribe nada`
          : `${dryRun ? 'DRY-RUN (no se escribió nada)' : x.estado === 'APLICABLE' ? 'APLICADO' : 'SIN_CAMBIOS en el modelo'} lote ${x.batchId}: revisión ${x.revisionAntes} -> ${x.revisionDespues}${dryRun && x.estado === 'APLICABLE' ? ' (prevista)' : ''}`;
        await emitir([
          titulo,
          ...x.entidadesAnadidas.map(e => `  ${dryRun ? 'se añadiría' : 'añadida'} ${e.entidad} (${e.proposalId})`),
          ...x.decisiones.filter(d => d.decision !== 'APPROVED').map(d => `  ${d.decision} ${d.proposalId}`),
          ...x.sinDecision.map(id => `  sin decisión (sigue PENDING_REVIEW) ${id}`),
          ...x.clasificadas.map(c => `  clasificada ${c.solicitudId} como ${c.tipo} -> nueva propuesta ${c.proposalId} PENDING_REVIEW (requiere revisión)`),
          `  métricas: aprobadas ${m.aprobadas}, rechazadas ${m.rechazadas}, cambios ${m.cambiosSolicitados}, sin decisión ${m.sinDecision}, entidades previstas ${m.entidadesPrevistas}, aplicadas ${r.entidadesAplicadas}, runtimeChanges 0`,
          ...(x.seguimiento ? [`seguimiento: lote ${x.seguimiento.batchId} con las propuestas clasificadas${dryRun ? ' (no escrito)' : ''}`] : []),
          ...r.escritos.map(e => `escrito: ${e}`),
        ].join('\n'), {
          ok: true, accion: 'aplicar', dryRun, estado: x.estado, batchId: x.batchId, revisionAntes: x.revisionAntes, revisionDespues: x.revisionDespues,
          entidadesAnadidas: x.entidadesAnadidas, metricas: { ...m, entidadesAplicadas: r.entidadesAplicadas }, escritos: r.escritos,
          ...(x.seguimiento ? { seguimiento: x.seguimiento.batchId } : {}),
        });
        return;
      }
      // 4R.1: vínculos de observación (sección separada del almacén, revisión humana propia).
      if (ACCION === 'vinculos-preparar') {
        const r = prepararVinculosEnDisco(rutas, resolve(RAIZ, process.env.AFI_CONOCIMIENTO_ENTRADA!));
        const a = r.artefacto;
        await emitir([
          `PREPARADO lote de vínculos ${a.batchId} sobre revisionBase ${a.revisionBase} (el almacén NO se modificó)`,
          ...a.vinculos.map(v => `  PENDING_REVIEW ${v.bindingId}`),
          ...a.rechazados.map(x => `  RECHAZADO [${x.indice}]: ${x.problemas.join('; ')}`),
          `revisión: ${r.archivoRevision}`,
          `decisiones: ${r.archivoDecisiones}${r.plantillaNueva ? ' (plantilla nueva: todas las decisiones en null)' : ' (ya existía: no se sobrescribió)'}`,
        ].join('\n'), { ok: true, accion: ACCION, batchId: a.batchId, revisionBase: a.revisionBase, vinculos: a.vinculos.map(v => v.bindingId), rechazados: a.rechazados.length });
        return;
      }
      if (ACCION === 'vinculos-aplicar') {
        const dryRun = process.env.AFI_CONOCIMIENTO_DRY_RUN === '1';
        const { resultado: x, escritos } = aplicarVinculosEnDisco(rutas, resolve(RAIZ, process.env.AFI_CONOCIMIENTO_REVISION!),
          resolve(RAIZ, process.env.AFI_CONOCIMIENTO_DECISIONES!), process.env.AFI_CONOCIMIENTO_FECHA!, dryRun);
        const titulo = x.estado === 'YA_APLICADO' ? 'YA_APLICADO' : dryRun ? 'DRY-RUN (no se escribió nada)' : x.estado === 'APLICABLE' ? 'APLICADO' : 'SIN_CAMBIOS';
        await emitir([
          `${titulo} lote de vínculos ${x.batchId}: revisión ${x.revisionAntes} -> ${x.revisionDespues}`,
          ...x.aprobados.map(id => `  ${dryRun ? 'se aprobaría' : 'aprobado'} ${id}`),
          ...x.rechazados.map(id => `  REJECTED ${id}`),
          ...x.sinDecision.map(id => `  sin decisión (sigue PENDING_REVIEW) ${id}`),
          ...escritos.map(e => `escrito: ${e}`),
        ].join('\n'), {
          ok: true, accion: ACCION, dryRun, estado: x.estado, batchId: x.batchId, revisionAntes: x.revisionAntes, revisionDespues: x.revisionDespues,
          aprobados: x.aprobados, escritos,
        });
        return;
      }
      throw new Error(`Acción desconocida ${ACCION}`);
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      const codigo = e instanceof IntakeError ? e.codigo : e.name;
      await emitir(e instanceof IntakeError ? `ERROR ${e.message}` : `ERROR ${codigo}: ${e.message}`, { ok: false, error: { codigo, mensaje: e.message } });
      throw e;
    }
  });
});
