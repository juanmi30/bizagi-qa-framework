import { test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { DatosPruebaError } from '../data/afi/datosPrueba/contrato';
import { aplicarDatosEnDisco, leerRegistro, prepararDatosEnDisco, provisionEnDisco, rutasDatos } from '../data/afi/datosPrueba/disco';
import { plantillaEnvDatosPrueba, rutaPlantillaEnv, textoEstadoDatos, textoRequeridosDatos } from '../data/afi/datosPrueba/registro';

/**
 * HARNESS técnico de datos de prueba (Fases 4P/4Q): lo invoca `tools/afi.mjs <proyecto> datos ...`.
 * Sin navegador. Lee el Test Data Registry desde disco y SOLO la PRESENCIA de variables del entorno; nunca imprime valores
 * ni toca el .env. Variables de CONTROL: AFI_DATOS_ACCION, AFI_DATOS_FILTRO, AFI_DATOS_ESCRIBIR, AFI_DATOS_ENTRADA,
 * AFI_DATOS_REVISION, AFI_DATOS_DECISIONES, AFI_DATOS_ACTOR, AFI_DATOS_REVISOR, AFI_DATOS_DRY_RUN, AFI_DATOS_FECHA, AFI_DATOS_OUTPUT.
 */
const ACCION = process.env.AFI_DATOS_ACCION;
const RAIZ = resolve(__dirname, '../../..');

test.describe('AFI datos de prueba (harness)', () => {
  test.skip(!ACCION, 'Solo se ejecuta desde tools/afi.mjs datos');

  test('datos', async () => {
    const salida = process.env.AFI_DATOS_OUTPUT;
    const proyecto = process.env.PROJECT!;
    const emitir = (texto: string, datos: Record<string, unknown>) => (salida ? writeFile(salida, JSON.stringify({ texto, datos }), 'utf8') : Promise.resolve());
    const rutas = rutasDatos(RAIZ, proyecto);
    const dryRun = process.env.AFI_DATOS_DRY_RUN === '1';
    const fecha = process.env.AFI_DATOS_FECHA!;
    try {
      if (ACCION === 'estado') {
        const r = textoEstadoDatos(leerRegistro(rutas), process.env, { proyecto });
        await emitir(r.texto, { ok: true, accion: 'estado', revision: leerRegistro(rutas).revision, resumen: r.resumen, actores: r.diagnosticos });
        return;
      }
      if (ACCION === 'requeridos') {
        const filtro = process.env.AFI_DATOS_FILTRO;
        const r = textoRequeridosDatos(leerRegistro(rutas), process.env, filtro, { proyecto });
        await emitir(r.texto, { ok: true, accion: 'requeridos', ...(filtro ? { filtro } : {}), casos: r.casos });
        return;
      }
      if (ACCION === 'plantilla-env') {
        const plantilla = plantillaEnvDatosPrueba(leerRegistro(rutas));
        if (process.env.AFI_DATOS_ESCRIBIR === '1') {
          const ruta = rutaPlantillaEnv(resolve(RAIZ, 'projects', proyecto));
          await writeFile(ruta, plantilla, 'utf8');
          const escrito = relative(RAIZ, ruta).split(sep).join('/');
          await emitir(`${plantilla}\nescrito: ${escrito}`, { ok: true, accion: 'plantilla-env', escrito });
        } else await emitir(plantilla.trimEnd(), { ok: true, accion: 'plantilla-env' });
        return;
      }
      if (ACCION === 'preparar') {
        const r = prepararDatosEnDisco(rutas, resolve(RAIZ, process.env.AFI_DATOS_ENTRADA!), proyecto);
        const l = r.lote, s = l.resumen;
        await emitir([
          `PREPARADO lote de datos ${l.batchId} sobre la revisión ${l.revisionBase} del Test Data Registry (el registro NO se modificó)`,
          `  requisitos: recibidos ${s.requisitosRecibidos}, válidos ${s.validos}, rechazados ${s.rechazados}; reutilizaciones exactas ${s.reutilizados}; actores propuestos ${s.propuestas}; posibles duplicados ${s.posiblesDuplicados}`,
          ...l.propuestas.map(p => `  PENDING_REVIEW ${p.proposalId} -> actor ${p.propuesta.slot.id} (perfil ${p.propuesta.slot.perfil}; ${p.propuesta.requisitos.length} requisito(s))`),
          ...l.reutilizados.map(x => `  REUTILIZA ${x.requisito} -> actor existente ${x.slot}`),
          ...l.posiblesDuplicados.map(x => `  POSSIBLE_DUPLICATE ${x.a} / ${x.b} (${x.motivo})`),
          ...l.rechazados.map(x => `  RECHAZADO [${x.indice}]${x.referencia ? ` ${x.referencia}` : ''}: ${[...new Set(x.problemas.map(p => p.motivo))].join(', ')}`),
          `para leer: ${r.archivoMd}`,
          `revisión: ${r.archivoRevision}`,
          `decisiones: ${r.archivoDecisiones}${r.plantillaNueva ? ' (plantilla nueva: todas las decisiones en null)' : ' (ya existía: no se sobrescribió)'}`,
          `siguiente: node tools/afi.mjs ${proyecto} datos aplicar ${r.archivoRevision} ${r.archivoDecisiones} --dry-run`,
        ].join('\n'), { ok: true, accion: 'preparar', batchId: l.batchId, revisionBase: l.revisionBase, resumen: s, revision: r.archivoRevision, decisiones: r.archivoDecisiones, legible: r.archivoMd });
        return;
      }
      if (ACCION === 'aplicar') {
        const r = aplicarDatosEnDisco(rutas, resolve(RAIZ, process.env.AFI_DATOS_REVISION!), resolve(RAIZ, process.env.AFI_DATOS_DECISIONES!), fecha, dryRun);
        const x = r.resultado;
        const titulo = x.estado === 'YA_APLICADO' ? `YA_APLICADO lote ${x.batchId}: sus cambios ya están en la revisión ${x.revisionAntes}; no se duplica ni sobrescribe nada`
          : `${dryRun ? 'DRY-RUN (no se escribió nada)' : x.estado === 'APLICABLE' ? 'APLICADO' : 'SIN_CAMBIOS en el registro'} lote ${x.batchId}: revisión ${x.revisionAntes} -> ${x.revisionDespues}${dryRun && x.estado === 'APLICABLE' ? ' (prevista)' : ''}`;
        await emitir([
          titulo,
          ...x.altas.map(a => `  ${dryRun ? 'se crearía' : 'creado'} el actor ${a}`),
          ...x.reutilizaciones.map(u => `  ${u.requisito} ${dryRun ? 'usaría' : 'usa'} el actor ${u.slot}`),
          ...x.rechazadas.map(id => `  REJECTED ${id}`), ...x.cambiosSolicitados.map(id => `  NEEDS_CHANGES ${id}`),
          ...x.sinDecision.map(id => `  sin decisión (sigue PENDING_REVIEW) ${id}`),
          ...r.escritos.map(e => `escrito: ${e}`),
          ...(x.altas.length && !dryRun ? [`siguiente: node tools/afi.mjs ${proyecto} datos estado`] : []),
        ].join('\n'), {
          ok: true, accion: 'aplicar', dryRun, estado: x.estado, batchId: x.batchId, revisionAntes: x.revisionAntes, revisionDespues: x.revisionDespues,
          altas: x.altas, reutilizaciones: x.reutilizaciones, rechazadas: x.rechazadas, cambiosSolicitados: x.cambiosSolicitados, sinDecision: x.sinDecision, escritos: r.escritos,
        });
        return;
      }
      if (ACCION === 'provisionado') {
        const r = provisionEnDisco(rutas, process.env.AFI_DATOS_ACTOR!, process.env.AFI_DATOS_REVISOR ?? '', fecha, process.env, dryRun);
        const x = r.resultado;
        const texto = x.estado === 'YA_PROVISIONADO' ? `YA_PROVISIONADO ${x.actorRef}: no se cambia nada`
          : `${dryRun ? 'DRY-RUN (no se escribió nada): se marcaría' : 'PROVISIONADO: marcado'} ${x.actorRef} como provisionado (revisión ${x.revisionAntes} -> ${x.revisionDespues}). `
            + 'Todas sus variables están configuradas (no se muestran valores).';
        await emitir([texto, ...r.escritos.map(e => `escrito: ${e}`)].join('\n'), {
          ok: true, accion: 'provisionado', dryRun, estado: x.estado, actorRef: x.actorRef, revisionAntes: x.revisionAntes, revisionDespues: x.revisionDespues, escritos: r.escritos,
        });
        return;
      }
      throw new Error(`Acción desconocida ${ACCION}`);
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      const codigo = e instanceof DatosPruebaError ? e.codigo : e.name;
      await emitir(`ERROR ${e.message}`, { ok: false, error: { codigo, mensaje: e.message } });
      throw e;
    }
  });
});
