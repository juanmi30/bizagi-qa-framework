import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { diagnosticoCasoCompilado, exigirDefinicionCasoAfiValida, type CasoAfiCompilado, type DefinicionCasoAfi } from './caso';
import type { DiagnosticoDatosPrueba } from './datosPrueba/registro';
import { agruparGapsRaiz, metricasAutonomia, type PlanE2ECompilado, type RangoE2E } from './e2e/compilador';

/**
 * Loader de archivos *.afi.json (Fase 3D). Toda la validación real es la de caso.ts: aquí solo se
 * lee UTF-8, se parsea como unknown y se delega en exigirDefinicionCasoAfiValida.
 * Sin Playwright ni process.env. Los mensajes nunca incluyen el contenido del archivo.
 */

export const EXTENSION_CASO_AFI = '.afi.json';

export type MotivoCargaCasoAfi = 'ruta-no-local' | 'extension' | 'no-existe' | 'no-es-archivo' | 'lectura' | 'json-invalido';

/** Problema del ARCHIVO (antes del contrato). El contrato inválido sigue siendo DefinicionCasoAfiError. */
export class CargaCasoAfiError extends Error {
  constructor(readonly motivo: MotivoCargaCasoAfi, archivo: string, detalle: string) {
    super(`No se pudo cargar "${archivo}" (${motivo}): ${detalle}`);
    this.name = 'CargaCasoAfiError';
  }
}

/** Solo rutas locales explícitas: nada de URLs (http, https, data, file...) ni patrones glob. */
function exigirRutaLocal(ruta: string): void {
  const nombre = basename(ruta);
  // Un esquema tiene 2+ caracteres; "C:\..." (unidad de Windows) sí es local.
  if (/^[a-z][a-z0-9+.-]+:/i.test(ruta)) throw new CargaCasoAfiError('ruta-no-local', nombre, 'solo se aceptan rutas de archivo locales, no URLs');
  if (/[*?[\]{}]/.test(ruta)) throw new CargaCasoAfiError('ruta-no-local', nombre, 'no se aceptan patrones: un archivo por invocación');
  if (!ruta.toLowerCase().endsWith(EXTENSION_CASO_AFI)) throw new CargaCasoAfiError('extension', nombre, `se espera la extensión ${EXTENSION_CASO_AFI}`);
}

/** Lee, parsea y valida. Lanza CargaCasoAfiError, DefinicionCasoAfiError o CapabilityGapError. */
export async function cargarDefinicionCasoAfi(ruta: string): Promise<DefinicionCasoAfi> {
  if (typeof ruta !== 'string' || !ruta.trim()) throw new CargaCasoAfiError('no-existe', '(vacío)', 'ruta requerida');
  exigirRutaLocal(ruta);
  const nombre = basename(ruta);
  let texto: string;
  try {
    if (!(await stat(ruta)).isFile()) throw new CargaCasoAfiError('no-es-archivo', nombre, 'la ruta no es un archivo');
    texto = await readFile(ruta, 'utf8');
  } catch (error) {
    if (error instanceof CargaCasoAfiError) throw error;
    const codigo = (error as NodeJS.ErrnoException).code;
    if (codigo === 'ENOENT') throw new CargaCasoAfiError('no-existe', nombre, 'el archivo no existe');
    throw new CargaCasoAfiError('lectura', nombre, `no se pudo leer (${codigo ?? 'error'})`);
  }
  let definicion: unknown;
  try {
    definicion = JSON.parse(texto.replace(/^\uFEFF/, ''));
  } catch (error) {
    // El mensaje de V8 puede citar fragmentos del archivo: solo se conserva la posición.
    const posicion = /position (\d+)/.exec((error as Error).message)?.[1];
    throw new CargaCasoAfiError('json-invalido', nombre, `el contenido no es JSON válido${posicion ? ` (posición ${posicion})` : ''}`);
  }
  exigirDefinicionCasoAfiValida(definicion);
  return definicion;
}

// ---------- Resúmenes seguros (humano + máquina) ----------

export interface ResumenAfi {
  texto: string;
  datos: Record<string, unknown> & { modo: string; ok: boolean };
}

const metadataDe = ({ version, hu, caso, nombre }: DefinicionCasoAfi | CasoAfiCompilado['metadata']) => ({ version, hu, caso, nombre });

export function resumenValidacion(def: DefinicionCasoAfi): ResumenAfi {
  const datos = {
    modo: 'validar', ok: true, metadata: metadataDe(def), perfil: def.perfil,
    etapas: [...def.preparacion.etapas], pasosFuncionales: (def.funcional?.pasos ?? []).map(p => p.id),
  };
  const texto = ['VALIDO', `version=${def.version}`, `hu=${def.hu}`, `caso=${def.caso}`, `nombre=${def.nombre}`, `perfil=${def.perfil}`,
    `etapas=${def.preparacion.etapas.length} (${def.preparacion.etapas.join(', ')})`,
    `pasosFuncionales=${(def.funcional?.pasos ?? []).length} (${(def.funcional?.pasos ?? []).map(p => p.id).join(', ')})`].join('\n');
  return { texto, datos };
}

/** A partir de diagnosticoCasoCompilado: PII siempre redactada. */
export function resumenCompilacion(c: CasoAfiCompilado): ResumenAfi {
  const diagnostico = diagnosticoCasoCompilado(c);
  const preparacion = diagnostico.preparacion.map(p => ({
    // 4S-R.1: una etapa según estado con solo gaps condicionales también es requerida (igual que en el runner).
    etapa: p.etapa, resoluciones: p.resoluciones.length, requerida: p.resoluciones.length + (p.condicionales?.length ?? 0) > 0, gaps: p.gaps.length,
    ...(p.condicionales ? { segunEstado: p.condicionales.length } : {}),
  }));
  const funcional = c.funcional.pasos.map(p => ({ id: p.id, operaciones: p.operaciones.length }));
  const ancho = Math.max(...preparacion.map(p => p.etapa.length));
  const observadas = c.observacion.condiciones.length + c.observacion.gaps.length > 0;
  const texto = [
    'COMPILADO', `ejecutable=${c.ejecutable}`, `perfil=${c.perfil}`, `nombre=${c.metadata.nombre}`, '',
    'Preparación:', ...preparacion.map(p => `  ${p.etapa.padEnd(ancho)}  resoluciones=${p.resoluciones}  requerida=${p.requerida ? 'sí' : 'no'}${p.gaps ? `  gaps=${p.gaps}` : ''}`
      + (p.segunEstado ? `  segunEstado=${p.segunEstado}` : '')),
    ...(diagnostico.gaps.length ? ['', 'Gaps:', ...diagnostico.gaps.map(g => `  ${g.etapa}.${g.campo}: ${g.motivo}`)] : []),
    '', 'Funcional:', ...funcional.map(p => `  ${p.id} operaciones=${p.operaciones}`),
    // 4S: solo si el caso declara participantes (los casos legacy no cambian su resumen).
    ...(c.participantes.length ? ['', 'Participantes:', ...c.participantes.map(p => `  ${p.rol} -> ${p.actorRef}`),
      ...c.relaciones.map(r => `  relación ${r.tipo}: ${r.sujetos.join(' / ')}`)] : []),
    // 4R.1: solo si el caso declara condiciones observables (los casos legacy no cambian su resumen).
    ...(observadas ? ['', 'Observación:',
      ...c.observacion.condiciones.map(o => `  ${o.condicion} ${o.entidad.tipo}:${o.entidad.id} ${o.expectativa.tipo} -> ${o.proveedor}${o.validacion ? ' (VALIDACIÓN, no productivo)' : ''}`),
      ...c.observacion.gaps.map(g => `  ${g.condicion} ${g.entidad.tipo}:${g.entidad.id} ${g.expectativa}: ${g.estado}${g.motivo ? ` (${g.motivo})` : ''}`)] : []),
  ].join('\n');
  return {
    texto,
    datos: { modo: 'compilar', ok: c.ejecutable, metadata: metadataDe(c.metadata), perfil: c.perfil, ejecutable: c.ejecutable, gaps: diagnostico.gaps, preparacion, funcional, diagnostico },
  };
}

/** Error seguro: el llamador debe haber redactado mensajes de origen externo (UI) antes. */
export function resumenError(modo: string, error: unknown, datosPrueba?: DiagnosticoDatosPrueba): ResumenAfi {
  const e = error instanceof Error ? error : new Error(String(error));
  const encabezado = modo === 'validar' ? 'INVALIDO' : modo === 'compilar' ? 'NO COMPILABLE' : 'FAIL';
  // 4P: el diagnóstico máquina de datos de prueba (solo nombres de variables, nunca valores) acompaña al error.
  return { texto: `${encabezado} (${e.name})\n${e.message}`, datos: { modo, ok: false, error: { tipo: e.name, mensaje: e.message }, ...(datosPrueba ? { datosPrueba } : {}) } };
}

// ---------- E2E (sección e2e del .afi.json) ----------

/** Resumen del plan E2E compilado: requisitos de datos derivados y gaps derivados (nunca valores). */
const rango = (r: RangoE2E) => (r.min === r.max ? `${r.min}` : `${r.min}-${r.max}`);

export function resumenCompilacionE2E(def: DefinicionCasoAfi, plan: PlanE2ECompilado, portal: { ejecutable: boolean; motivo?: string }, tiempoMs?: number): ResumenAfi {
  const porClase = new Map<string, number>();
  for (const g of plan.gaps) porClase.set(g.clasificacion, (porClase.get(g.clasificacion) ?? 0) + 1);
  const ejecutables = plan.pasos.flatMap(p => p.verificaciones).filter(v => v.estado === 'EJECUTABLE').length;
  const total = plan.pasos.flatMap(p => p.verificaciones).length;
  const md = plan.metricasDatos;
  const raices = agruparGapsRaiz([{ caso: def.caso, plan }]);
  const a = metricasAutonomia(plan);
  const texto = [
    'COMPILADO E2E', `caso=${def.hu} ${def.caso}`, `actorRef=${def.actorRef ?? '-'}`, `ejecutable=${plan.ejecutable}`,
    `recorridoPortal=${portal.ejecutable && plan.actor.demostrado ? 'compilado' : `no compilado (${portal.motivo ?? (plan.actor.demostrado ? '-' : `actor no demostrado: ${plan.actor.motivo}`)})`}`,
    `verificaciones=${total} (ejecutables ${ejecutables}, con gap ${total - ejecutables})`, '',
    'Requisitos de datos derivados:', ...plan.requisitos.map(r => `  ${r.id} [${r.rol ?? 'principal'}] campos=${r.camposRequeridos.join(', ')}`
      + `${r.camposCondicionales?.length ? ` condicionales=${r.camposCondicionales.map(c => `${c.campo}(si ${c.cuando.campo} ${c.cuando.operador} ${Array.isArray(c.cuando.valor) ? c.cuando.valor.join('|') : c.cuando.valor})`).join(', ')}` : ''}`
      + `${r.distintoDe?.length ? ` distintoDe=${r.distintoDe.join(', ')}` : ''}`),
    'Diagnóstico de datos:', ...plan.diagnosticosDatos.map(d => `  ${d.sujeto}: ${d.status}${d.actorRef ? ` (actor ${d.actorRef})` : ''}${d.motivos.length ? ` — ${d.motivos.join('; ')}` : ''}`),
    '', `Gaps derivados (${plan.gaps.length}): ${[...porClase].map(([k, n]) => `${k}=${n}`).join(', ')}`,
    ...plan.gaps.map(g => `  [${g.clasificacion}] ${g.ubicacion}: ${g.motivo}`),
    '', 'Test Data (campos del caso vs. valores NUEVOS que QA debe aportar; rango = condicionales):',
    ...md.porRequisito.map(m => `  ${m.sujeto}: campos del caso=${rango(m.camposCaso)} · disponibles=${m.disponibles.length}${m.actorRef ? ` (actor ${m.actorRef})` : ''}`
      + ` · nuevos=${rango(m.nuevosRango)}${m.nuevos.length ? ` [${m.nuevos.join(', ')}]` : ''}${m.nuevosCondicionales.length ? ` [+ si aplica: ${m.nuevosCondicionales.join(', ')}]` : ''}`),
    `  TOTAL: campos del caso=${rango(md.camposCaso)} · disponibles=${md.disponibles} · nuevos faltantes=${rango(md.nuevos)}`
      + `${md.noProvisionables.length ? ` · no provisionables (gaps)=${md.noProvisionables.length}` : ''}`,
    '', `Gaps raíz (${raices.length} causas únicas para ${plan.gaps.length} gaps):`,
    ...raices.map(g => `  ${g.prioridad} [${g.clasificacion}] ${g.raiz} · bloquea=${g.bloquea} · desbloquea ${g.ubicaciones.length}`),
    '', `Actor del recorrido: ${plan.actor.demostrado ? (plan.actor.requerido ? `demostrado (${plan.actor.actorRef})` : 'sin escenario que demostrar') : `NO demostrado — ${plan.actor.motivo}`}`,
    '', `Ruta derivada (Knowledge) desde ${plan.recorrido.origen}: ${plan.recorrido.pantallas.map(p => p.pantalla).join(' -> ') || '(sin destinos)'}`,
    ...plan.recorrido.pantallas.map(p => `  ${p.pantalla}: preparación ${p.preparacion.tipo}${p.preparacion.tipo === 'formulario' ? ` (${p.preparacion.sujeto})` : p.preparacion.tipo === 'etapa' ? ` (${p.preparacion.etapa})` : ''}`
      + ` · acciones [${p.acciones.join(', ')}]${(plan.recorrido.bloqueosEn[p.pantalla] ?? []).length ? ` · bloqueada: ${plan.recorrido.bloqueosEn[p.pantalla].map(b => b.raiz.id).join(', ')}` : ''}`),
    ...(plan.recorrido.datosTransito.length ? [`  datos de tránsito derivados: ${plan.recorrido.datosTransito.map(d => `${d.sujeto}.${d.campo} (${d.pantalla})`).join(', ')}`] : []),
    '', `Fidelidad semántica: exactos=${plan.fidelidad.semanticasExactas} · aproximados=${plan.fidelidad.semanticasAproximadas} · no representables=${plan.fidelidad.semanticasNoRepresentables}`,
    ...plan.fidelidad.detalle.map(f => `  P${f.paso}${f.dispositivo === 'mobile' ? 'm' : ''} ${f.representacion.toUpperCase()} (${f.origen}): "${f.fragmento}" — ${f.motivo}`),
    '', 'Autonomía:',
    `  representabilidad sintáctica=${plan.fidelidad.pasosValidos}/${plan.fidelidad.pasos} · semánticas exactas=${plan.fidelidad.semanticasExactas} · aproximadas=${plan.fidelidad.semanticasAproximadas} · no representables=${plan.fidelidad.semanticasNoRepresentables}`,
    `  pasos declarados=${a.pasos} · totalmente ejecutables=${a.pasosTotalmenteEjecutables}`,
    `  verificaciones compiladas=${a.verificacionesCompiladas}/${a.verificaciones} · ejecutables=${a.verificacionesEjecutables} (${a.pctEjecutables}%)`,
    `  declaradas=${a.declaradas} · completas ejecutables=${a.declaradasEjecutables} · parciales=${a.declaradasParciales} · bloqueadas por el recorrido=${a.declaradasBloqueadasPorRecorrido}`,
    `  gaps raíz=${a.gapsRaiz} · capabilities genéricas requeridas=${a.capabilitiesRaiz.length} · Test Data nuevo=${rango(a.testDataNuevos)}`,
    ...(tiempoMs !== undefined ? [`  tiempo archivo->COMPILADO=${tiempoMs} ms`] : []),
  ].join('\n');
  return { texto, datos: { modo: 'compilar', ok: plan.ejecutable, metadata: metadataDe(def), e2e: { plan, portal, raices, autonomia: a, ...(tiempoMs !== undefined ? { tiempoMs } : {}) } } };
}
