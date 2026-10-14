import { casoMatriz } from './matriz';
import { estadoActor, estadoDataset, resolverTexto, DatoFaltanteError, type Registro, type Entorno } from './datos';
import type { EscenarioSde, PasoSde, Verificacion } from './escenario';
import { peorEstado, type CausaPaso, type EstadoPaso, type EstadoCp, type ReporteCp, type ResultadoPaso, type ResultadoPasoMatriz } from './modelo';

/**
 * Ejecutor de escenarios SDE. No conoce Playwright: recibe las capabilities por inyección, así su
 * lógica (orden, bloqueos, agregación a la matriz, clasificación del CP, sanitización) se prueba
 * en unitario y la parte de UI se calibra aparte contra QA.
 */

export interface ContextoEjecucion {
  registro: Registro;
  env: Entorno;
  unico: string;
  numeroCaso: string | null;
  actividades: string[];
  sesiones: Set<string>;      // actores con sesión real iniciada
  /** Hay un pop-up de fila abierto (lo marcan las capabilities de tabla). Salir de él sin Guardar destruye el caso (BUG-03). */
  dialogoAbierto: boolean;
  secretos: string[];         // valores que jamás deben aparecer en reportes
  /** Resuelve ${dato:..}/${config:..}/${unico}; lanza DatoFaltanteError si falta. */
  resolver(texto: string): string;
}

/**
 * El AMBIENTE impide ejecutar el paso (DNS, permisos del rol, proceso no habilitado). No es un defecto del producto
 * ni de la automatización: el paso queda BLOCKED (nunca FAIL ni verde) y el escenario se detiene.
 */
export class EntornoError extends Error {
  constructor(mensaje: string) {
    super(`ENTORNO: ${mensaje}`);
    this.name = 'EntornoError';
  }
}

/**
 * Clasifica la causa de una EXCEPCIÓN de capability por su tipo y mensaje (conservador: ante la duda, NO_CLASIFICADO).
 * Un timeout o una excepción desconocida NUNCA se clasifica como producto.
 */
export function causaDeExcepcion(e: unknown): CausaPaso {
  if (e instanceof DatoFaltanteError) return 'DATO';
  if (e instanceof EntornoError) return 'AMBIENTE';
  const m = (e as Error)?.message ?? '';
  const nombre = (e as Error)?.name ?? '';
  // Red o portal que no responde: el ambiente impide ejecutar (no es el producto ni la automatización).
  if (/net::ERR_|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|page\.goto: Timeout|navigating to .* waiting until/i.test(m)) return 'AMBIENTE';
  if (nombre === 'CalibracionError' || nombre === 'BarreraPopupError' || /^\[calibrar /.test(m)) return 'AUTOMATIZACION';
  if (/No se encontró visible|Se esperaba exactamente 1|Ambigüedad|locator\.|Timeout \d+ms exceeded|intercepts pointer|no está dentro de/.test(m)) return 'AUTOMATIZACION';
  if (/MODO SOLO LECTURA/.test(m)) return 'AUTOMATIZACION';
  if (/Bizagi rechazó|no ofrece ninguna opción|ruta NO esperada|no quedó marcada|el formulario muestra .* tras diligenciar|se confirmó sin los campos obligatorios|no muestra "/.test(m)) return 'PRODUCTO_POR_CONFIRMAR';
  return 'NO_CLASIFICADO';
}

// Un BLOCKED devuelto por una capability sin causa explícita NO se presume dato faltante: queda NO_CLASIFICADO.
const CAUSA_DE_ESTADO: Partial<Record<EstadoPaso, CausaPaso>> = {
  INTEGRATION_NOT_VERIFIED: 'INTEGRACION_NO_VERIFICADA', NOT_AUTOMATED: 'NO_AUTOMATIZADO', BLOCKED: 'NO_CLASIFICADO',
};

/** Causa de un bloqueo previo a ejecutar, por su prefijo (preflight y bloqueo de concurrencia). */
export function causaDeBloqueo(bloqueo: string): CausaPaso {
  if (/^(ENVIRONMENT|CREDENCIALES)\b/.test(bloqueo)) return 'CONFIGURACION';
  if (/^TEST_DATA\b/.test(bloqueo)) return 'DATO';
  if (/^CONCURRENCIA\b/.test(bloqueo)) return 'CONCURRENCIA';
  return 'NO_CLASIFICADO';
}

export interface SalidaCapacidad { estado?: EstadoPaso; detalle?: string; causa?: CausaPaso }
export type Capacidad = (paso: PasoSde, ctx: ContextoEjecucion) => Promise<SalidaCapacidad | void>;
export type Verificador = (v: Verificacion, ctx: ContextoEjecucion) => Promise<{ ok: boolean; detalle: string }>;

export interface Dependencias {
  capacidades: Record<string, Capacidad>;
  verificar: Verificador;
  evidencia: (nombre: string) => Promise<string | undefined>;
  ahora?: () => Date;
}

/** Capabilities que no tocan la UI: declaran honestamente lo que no se puede comprobar. */
export const CAPACIDADES_DECLARATIVAS: Record<string, Capacidad> = {
  integracion: async (p) => ({
    estado: 'INTEGRATION_NOT_VERIFIED',
    detalle: `${p.nombre}: sin acceso a traza/log/respuesta del servicio; esperado "${p.esperado}". Solo hay evidencia indirecta por UI.`,
  }),
  no_automatizado: async (p) => ({ estado: 'NOT_AUTOMATED', detalle: String(p.razon) }),
};

export function crearContexto(registro: Registro, env: Entorno, unico: string): ContextoEjecucion {
  // Se enmascaran credenciales y datos de negocio marcados "sensible" (pólizas, placas, documentos). La configuración
  // y las listas paramétricas (Línea, Ramo, Sucursal...) no son secretas y se muestran para que el reporte sea útil.
  const vars = new Set<string>();
  for (const a of Object.values(registro.actores)) a.variables.forEach((v) => vars.add(v));
  for (const d of Object.values(registro.datasets)) d.propiedades.forEach((p) => p.env && p.sensible && vars.add(p.env));
  vars.add('BIZAGI_PASSWORD');
  const valores = [...vars].map((v) => env[v]?.trim() ?? '').filter((v) => v.length >= 3);
  // El usuario también puede aparecer sin el prefijo de dominio ("domain\\usuario" → "usuario").
  const sinDominio = valores.map((v) => v.split('\\').pop() ?? '').filter((v) => v.length >= 3);
  const secretos = [...new Set([...valores, ...sinDominio])].sort((a, b) => b.length - a.length);
  const ctx: ContextoEjecucion = {
    registro, env, unico, numeroCaso: null, actividades: [], sesiones: new Set(), secretos, dialogoAbierto: false,
    resolver: (t) => resolverTexto(t, { registro, env, unico }),
  };
  return ctx;
}

/** Reemplaza cualquier secreto conocido por «oculto». Se aplica a TODO texto que sale a reportes. */
export function sanitizar(texto: string, secretos: string[]): string {
  let s = texto;
  for (const v of secretos) s = s.split(v).join('«oculto»');
  return s;
}

/** Bloqueos previos a ejecutar: actores y datasets sin valores. Devuelve nombres de variables, nunca valores. */
export function preflight(esc: EscenarioSde, registro: Registro, env: Entorno): string[] {
  const bloqueos: string[] = [];
  const base = env.BIZAGI_BASE_URL ?? '';
  if (!/^https?:\/\//i.test(base) || /[<>]/.test(base)) bloqueos.push('ENVIRONMENT: BIZAGI_BASE_URL no configurada');
  for (const a of esc.actores) {
    const e = estadoActor(registro, a, env);
    if (e.estado === 'MISSING') bloqueos.push(`CREDENCIALES actor "${a}": faltan ${e.faltantes.join(', ')}`);
  }
  for (const d of esc.datasets) {
    const e = estadoDataset(registro, d, env);
    if (e.estado === 'MISSING') bloqueos.push(`TEST_DATA ${d}: faltan ${e.faltantes.join(', ')}`);
  }
  return bloqueos;
}

function agregarMatriz(cp: string, pasos: ResultadoPaso[], estadoGlobal?: EstadoPaso): ResultadoPasoMatriz[] {
  const caso = casoMatriz(cp);
  const filas = caso.pasos.map((pm) => {
    const cubren = pasos.filter((p) => p.matriz.includes(pm.n));
    return {
      n: pm.n, accion: pm.accion, esperado: pm.esperado,
      estado: estadoGlobal ?? peorEstado(cubren.map((p) => p.estado)),
      cubierto_por: cubren.map((p) => p.indice),
    };
  });
  // El paso "Objetivo:" no es una acción: refleja el peor estado de los demás pasos.
  const objetivo = filas.find((f) => /^Objetivo:?$/i.test(f.accion));
  if (objetivo && !estadoGlobal && objetivo.cubierto_por.length === 0) {
    objetivo.estado = peorEstado(filas.filter((f) => f !== objetivo).map((f) => f.estado));
  }
  return filas;
}

/** Causas distintas de los pasos ejecutados que no quedaron verdes (en orden de aparición). */
function causasDe(pasos: ResultadoPaso[], filtro: (p: ResultadoPaso) => boolean = () => true): CausaPaso[] {
  return [...new Set(pasos.filter((p) => p.causa && filtro(p)).map((p) => p.causa!))];
}

function clasificar(matriz: ResultadoPasoMatriz[], ctx: ContextoEjecucion, pasos: ResultadoPaso[] = []): { estado: EstadoCp; motivo: string; atribucion: ReporteCp['atribucion'] } {
  const estados = matriz.map((m) => m.estado);
  if (estados.includes('FAIL')) {
    const causas = [...new Set(pasos.filter((p) => p.estado === 'FAIL').map((p) => p.causa ?? 'NO_CLASIFICADO'))];
    // Solo una verificación observada distinta de lo esperado (o una respuesta explícita de Bizagi) apunta al producto.
    const producto = causas.includes('PRODUCTO_POR_CONFIRMAR');
    return {
      estado: 'FAIL',
      atribucion: producto ? 'PRODUCTO_POR_CONFIRMAR' : 'NO_ATRIBUIBLE_AL_PRODUCTO',
      motivo: `Al menos un paso de la matriz falló (causa: ${causas.join(', ')})` + (producto
        ? ' — comportamiento observado distinto al esperado: posible defecto, POR CONFIRMAR funcionalmente.'
        : causas.every((c) => c === 'AUTOMATIZACION')
          ? ' — falla de AUTOMATIZACIÓN/calibración, NO atribuible al producto.'
          : ' — NO atribuible al producto (automatización, ambiente o excepción sin clasificar): revisar antes de reportar.'),
    };
  }
  // Sin FAIL, los NOT_RUN son consecuencia de un bloqueo a mitad de la corrida: el CP queda BLOCKED.
  if (estados.includes('BLOCKED')) {
    const b = matriz.filter((m) => m.estado === 'BLOCKED').map((m) => `P${m.n}`);
    const causas = causasDe(pasos, (p) => p.estado === 'BLOCKED');
    return {
      estado: 'BLOCKED',
      atribucion: 'NO_APLICA',
      motivo: `Ejecutado contra QA${ctx.numeroCaso ? ` (caso ${ctx.numeroCaso})` : ''} sin fallos, pero ${b.length} paso(s) de la matriz quedaron BLOCKED (causa: ${causas.join(', ') || 'NO_CLASIFICADO'}): ${b.join(', ')}` +
        (estados.includes('NOT_RUN') ? ' (los pasos siguientes no se ejecutaron).' : '.'),
    };
  }
  if (estados.includes('NOT_RUN')) return { estado: 'FAIL', atribucion: 'NO_ATRIBUIBLE_AL_PRODUCTO', motivo: 'Ejecución incompleta (pasos sin correr).' };
  if (ctx.sesiones.size === 0 || !ctx.numeroCaso) {
    return { estado: 'FAIL', atribucion: 'NO_ATRIBUIBLE_AL_PRODUCTO', motivo: 'Sin sesión real o sin número de caso real: no puede considerarse E2E.' };
  }
  const pendientes = matriz.filter((m) => !['PASS', 'UI_PASS'].includes(m.estado));
  if (pendientes.length === 0) return { estado: 'REAL_PASS', atribucion: 'NO_APLICA', motivo: 'Todos los pasos de la matriz verificados en QA.' };
  return {
    estado: 'REAL_PASS_PARCIAL',
    atribucion: 'NO_APLICA',
    motivo: `Sesión y caso reales, sin fallos; ${pendientes.length} paso(s) de la matriz no verificados directamente: ` +
      pendientes.map((m) => `P${m.n}=${m.estado}`).join(', '),
  };
}

/**
 * Reporte de un escenario que NO se ejecutó porque faltan prerrequisitos (preflight) u otra ejecución real está en curso.
 * Cada paso queda BLOCKED con la causa del bloqueo (configuración > concurrencia > dato), nunca FAIL ni verde.
 */
export function reporteBloqueado(esc: EscenarioSde, ctx: ContextoEjecucion, bloqueos: string[], ahora: () => Date = () => new Date()): ReporteCp {
  const causas = [...new Set(bloqueos.map(causaDeBloqueo))];
  const causaPaso = (['CONFIGURACION', 'CONCURRENCIA', 'DATO'] as CausaPaso[]).find((c) => causas.includes(c)) ?? 'NO_CLASIFICADO';
  const pasos: ResultadoPaso[] = esc.pasos.map((p, i) => ({
    indice: i + 1, hacer: p.hacer, matriz: p.matriz, estado: 'BLOCKED', causa: causaPaso, detalle: 'No ejecutado: faltan prerrequisitos.',
  }));
  const momento = ahora().toISOString();
  return {
    cp: esc.id, escenario: esc.archivo, inicio: momento, fin: momento, unico: ctx.unico, cleanup: esc.cleanup,
    estado: 'BLOCKED', motivo: `No ejecutado (causa: ${causas.join(', ')}; no es un resultado del producto). Ver bloqueos.`,
    numero_caso: null, actividades_observadas: [], pasos, matriz: agregarMatriz(esc.id, pasos, 'BLOCKED'), bloqueos,
    causas, atribucion: 'NO_APLICA',
  };
}

export async function ejecutarEscenario(esc: EscenarioSde, deps: Dependencias, ctx: ContextoEjecucion): Promise<ReporteCp> {
  const ahora = deps.ahora ?? (() => new Date());
  const inicio = ahora().toISOString();
  const base = {
    cp: esc.id, escenario: esc.archivo, inicio, unico: ctx.unico, cleanup: esc.cleanup,
  };

  const bloqueos = preflight(esc, ctx.registro, ctx.env);
  if (bloqueos.length) return reporteBloqueado(esc, ctx, bloqueos, ahora);

  const resultados: ResultadoPaso[] = [];
  let detenido = false;
  // BUG-03: si algo falla con el pop-up de una fila ABIERTO, detenerse dejaría el caso inutilizable. El fallo se registra,
  // pero la ejecución sigue hasta el paso que lo cierra con "Guardar"; recién entonces se detiene. El CP sigue siendo FAIL.
  let detenerAlCerrar = false;
  for (let i = 0; i < esc.pasos.length; i++) {
    const paso = esc.pasos[i];
    const r: ResultadoPaso = { indice: i + 1, hacer: paso.hacer, matriz: paso.matriz, estado: 'NOT_RUN', detalle: '' };
    resultados.push(r);
    if (detenido) { r.detalle = 'No ejecutado: un paso previo falló.'; continue; }
    if (detenerAlCerrar && !ctx.dialogoAbierto) { detenido = true; r.detalle = 'No ejecutado: un paso previo falló (se detuvo tras cerrar el pop-up).'; continue; }
    // Datos que solo este paso necesita: si faltan, se bloquea el paso (sin efectos) y se sigue con los demás.
    const faltan = (paso.requiere ?? []).map((ds) => estadoDataset(ctx.registro, ds, ctx.env)).filter((e) => e.estado === 'MISSING');
    if (faltan.length) {
      r.estado = 'BLOCKED';
      r.causa = 'DATO';
      r.detalle = `Datos faltantes para este paso: ${faltan.map((f) => `${f.id} (${f.faltantes.join(', ')})`).join('; ')}`;
      continue;
    }
    const t0 = Date.now();
    try {
      const cap = deps.capacidades[paso.hacer] ?? CAPACIDADES_DECLARATIVAS[paso.hacer];
      if (!cap) throw new Error(`capability "${paso.hacer}" no implementada en este ejecutor`);
      const salida = (await cap(paso, ctx)) ?? {};
      const notas: string[] = salida.detalle ? [salida.detalle] : [];
      let ok = true;
      for (const v of paso.verificar ?? []) {
        const res = await deps.verificar(v, ctx);
        notas.push(`${res.ok ? '✔' : '✘'} ${res.detalle}`);
        if (!res.ok) ok = false;
      }
      r.estado = ok ? (salida.estado ?? 'PASS') : 'FAIL';
      // Verificación no cumplida = comportamiento observado distinto al esperado (por confirmar, nunca "defecto" directo).
      r.causa = !ok ? 'PRODUCTO_POR_CONFIRMAR' : (salida.causa ?? CAUSA_DE_ESTADO[r.estado]);
      r.detalle = notas.join(' | ');
    } catch (e) {
      r.causa = causaDeExcepcion(e);
      r.estado = r.causa === 'DATO' || r.causa === 'AMBIENTE' || (e as Error)?.name === 'BarreraPopupError' ? 'BLOCKED' : 'FAIL';
      r.detalle = (e as Error).message.split('\n').slice(0, 3).join(' ');
    }
    r.ms = Date.now() - t0;
    r.detalle = sanitizar(r.detalle, ctx.secretos);
    r.evidencia = await deps.evidencia(`${esc.id}_p${String(i + 1).padStart(2, '0')}_${paso.hacer}`).catch(() => undefined);
    // Un FAIL (o un dato o ambiente que faltaba a mitad de un paso) detiene: el estado de la UI ya no es confiable.
    if (r.estado === 'FAIL' || r.estado === 'BLOCKED') {
      // Si lo que falló fue el intento de cerrar el pop-up con "Guardar", ya no hay nada más que hacer: se detiene
      // (caso 430, 2026-10-13: seguir intentando pasos con el pop-up abierto no lo salva).
      const cierreFallido = paso.hacer === 'dialogo_confirmar' && paso.espera === 'cierra';
      if (ctx.dialogoAbierto && !cierreFallido) {
        detenerAlCerrar = true;
        r.detalle += ' | Pop-up abierto: se continúa SOLO hasta cerrarlo con "Guardar" (salir sin guardar destruye el caso, BUG-03).';
      } else {
        detenido = true;
        if (ctx.dialogoAbierto) r.detalle += ' | El pop-up NO se pudo cerrar con "Guardar": el caso probablemente quedó inutilizable (BUG-03). Registrarlo.';
      }
    }
  }

  const matriz = agregarMatriz(esc.id, resultados);
  const { estado, motivo, atribucion } = clasificar(matriz, ctx, resultados);
  return {
    ...base, fin: ahora().toISOString(), estado, motivo, numero_caso: ctx.numeroCaso,
    actividades_observadas: [...ctx.actividades], pasos: resultados, matriz, bloqueos: [],
    causas: causasDe(resultados), atribucion,
  };
}
