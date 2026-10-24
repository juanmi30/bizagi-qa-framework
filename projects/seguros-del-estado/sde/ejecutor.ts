import { casoMatriz } from './matriz';
import { estadoActor, estadoDataset, resolverTexto, DatoFaltanteError, type Registro, type Entorno } from './datos';
import type { EscenarioSde, PasoSde, Verificacion } from './escenario';
import { cargarPresentacion, type CatalogoPresentacion } from './presentacion';
import { exigirSoloLectura } from './soloLectura';
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
  /** Solo la creación verificada de esta ejecución puede originar este permiso; la gráfica aporta la identidad servidor. */
  casoCreado?: { numero: string; unico: string; corrida: string; instancia?: string };
  actividades: string[];
  sesiones: Set<string>;      // actores con sesión real iniciada
  /** Hay un pop-up de fila abierto (lo marcan las capabilities de tabla). Salir de él sin Guardar destruye el caso (BUG-03). */
  dialogoAbierto: boolean;
  /**
   * Evidencia POSITIVA de estar en el formulario de inicio sin caso (P-15/F2): la pone nuevo_caso al confirmar el diálogo y
   * la retiran las capacidades que salen de él. La ausencia de número de caso NO es evidencia de precreación.
   */
  formularioInicio?: boolean;
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
  // Acción rechazada por la política de solo lectura (P-15): no es un defecto ni una falla de automatización.
  if (nombre === 'SoloLecturaError' || /^POLÍTICA SOLO LECTURA:/.test(m)) return 'POLITICA_SOLO_LECTURA';
  // Asignación de la actividad (confirmación de QA, 2026-10-19): permiso, disponibilidad o ambigüedad; nunca un defecto del producto.
  if (nombre === 'AsignacionError' || /^ASIGNACIÓN:/.test(m)) return 'ASIGNACION';
  if (/^NO VERIFICABLE:/.test(m)) return 'AUTOMATIZACION';
  // Verificación sin evidencia suficiente (pantalla no identificada o vacía): nunca aprobada ni atribuida al producto (R1).
  if (nombre === 'NoConcluyenteError' || /^NO CONCLUYENTE:/.test(m)) return 'AUTOMATIZACION';
  // La protección de solo lectura no quedó instalada: la inspección se detiene (falla técnica, nunca defecto de Bizagi).
  if (nombre === 'ProteccionNoInstaladaError' || /^PROTECCIÓN SOLO LECTURA NO INSTALADA:/.test(m)) return 'AUTOMATIZACION';
  if (/Bizagi rechazó|no ofrece ninguna opción|ruta NO esperada|NO fue recorrido|no quedó marcada|el formulario muestra .* tras diligenciar|se confirmó sin los campos obligatorios|no muestra "|extracción distinta de la narrativa|quedó registrado «/.test(m)) return 'PRODUCTO_POR_CONFIRMAR';
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

/**
 * `incidente`: hecho distinto del resultado del paso que no debe ocultarse como advertencia (p. ej. P-21a: tras restaurar un
 * valor válido «Guardar» no cierra el pop-up). Se registra aparte, detiene el recorrido e impide que el CP quede REAL_PASS.
 */
export interface SalidaCapacidad { estado?: EstadoPaso; detalle?: string; causa?: CausaPaso; incidente?: { causa: CausaPaso; detalle: string } }
export type Capacidad = (paso: PasoSde, ctx: ContextoEjecucion) => Promise<SalidaCapacidad | void>;
export type Verificador = (v: Verificacion, ctx: ContextoEjecucion) => Promise<{ ok: boolean; detalle: string }>;

export interface Dependencias {
  capacidades: Record<string, Capacidad>;
  verificar: Verificador;
  evidencia: (nombre: string) => Promise<string | undefined>;
  ahora?: () => Date;
  /** Catálogo de expectativas de presentación (por defecto data/expectativas-presentacion.yaml). */
  presentacion?: CatalogoPresentacion;
  /** P-15: la ejecución es de solo lectura; el ejecutor rechaza las capacidades de escritura antes de invocarlas. */
  soloLectura?: boolean;
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
  // Incluye la causa de un incidente técnico posterior a un defecto observado (R2): queda trazado sin sustituir al defecto.
  return [...new Set(pasos.filter(filtro).flatMap((p) => [p.causa, p.incidente?.causa]).filter((c): c is CausaPaso => !!c))];
}

function clasificar(matriz: ResultadoPasoMatriz[], ctx: ContextoEjecucion, pasos: ResultadoPaso[] = []): { estado: EstadoCp; motivo: string; atribucion: ReporteCp['atribucion'] } {
  const estados = matriz.map((m) => m.estado);
  if (estados.includes('FAIL')) {
    const causas = [...new Set(pasos.filter((p) => p.estado === 'FAIL').map((p) => p.causa ?? 'NO_CLASIFICADO'))];
    // Solo una verificación observada distinta de lo esperado (o una respuesta explícita de Bizagi) apunta al producto.
    const producto = causas.includes('PRODUCTO_POR_CONFIRMAR');
    const incidentes = [...new Set(pasos.filter((p) => p.incidente).map((p) => p.incidente!.causa))];
    return {
      estado: 'FAIL',
      atribucion: producto ? 'PRODUCTO_POR_CONFIRMAR' : 'NO_ATRIBUIBLE_AL_PRODUCTO',
      motivo: `Al menos un paso de la matriz falló (causa: ${causas.join(', ')})` +
        (incidentes.length ? ` [incidente técnico posterior al defecto observado: ${incidentes.join(', ')}; ver el paso]` : '') + (producto
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
  // Un incidente separado (p. ej. P-21a) no se oculta tras un CP verde: el CP queda parcial hasta que QA lo resuelva.
  const incidentes = pasos.filter((p) => p.incidente);
  if (pendientes.length === 0 && incidentes.length) {
    return {
      estado: 'REAL_PASS_PARCIAL',
      atribucion: 'NO_APLICA',
      motivo: `Sesión y caso reales y todos los pasos de la matriz verificados, pero hubo ${incidentes.length} incidente(s) separado(s) ` +
        `que impiden darlo por aprobado: ${incidentes.map((p) => `${p.incidente!.causa}: ${p.incidente!.detalle}`).join('; ')}`,
    };
  }
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
  // Barrera UI-10/BUG-03: el pop-up NO se abrió (ningún clic). Los pasos de su bloque (mismos datasets de "requiere") quedan
  // BLOCKED sin ejecutarse y el recorrido sigue con los pasos independientes: la UI no cambió (20/10, Cumplimiento y CP01 P27–P29).
  let bloquePopup: Set<string> | null = null;
  for (let i = 0; i < esc.pasos.length; i++) {
    const paso = esc.pasos[i];
    const r: ResultadoPaso = { indice: i + 1, hacer: paso.hacer, matriz: paso.matriz, estado: 'NOT_RUN', detalle: '' };
    resultados.push(r);
    if (detenido) { r.detalle = 'No ejecutado: un paso previo falló.'; continue; }
    if (detenerAlCerrar && !ctx.dialogoAbierto) { detenido = true; r.detalle = 'No ejecutado: un paso previo falló (se detuvo tras cerrar el pop-up).'; continue; }
    if (bloquePopup && (paso.requiere ?? []).some((d) => bloquePopup!.has(d))) {
      r.estado = 'BLOCKED';
      r.causa = 'AUTOMATIZACION';
      r.detalle = 'No ejecutado: depende del pop-up que la barrera UI-10 no abrió (sin calibración registrada); sin efectos en el caso.';
      continue;
    }
    // Datos que solo este paso necesita: si faltan, se bloquea el paso (sin efectos) y se sigue con los demás.
    const faltan = (paso.requiere ?? []).map((ds) => estadoDataset(ctx.registro, ds, ctx.env)).filter((e) => e.estado === 'MISSING');
    if (faltan.length) {
      r.estado = 'BLOCKED';
      r.causa = 'DATO';
      r.detalle = `Datos faltantes para este paso: ${faltan.map((f) => `${f.id} (${f.faltantes.join(', ')})`).join('; ')}`;
      continue;
    }
    const t0 = Date.now();
    // Observaciones del paso FUERA del try (R2, auditoría de Work del PR #2): una excepción posterior no debe borrar lo ya
    // observado. "fallas" cuenta las verificaciones que SÍ se ejecutaron y no se cumplieron (defecto funcional observado).
    const notas: string[] = [];
    let ok = true;
    let fallas = 0;
    // Dos unidades distintas, nunca mezcladas (observación BAJA de Work, PR #2): "completadas" cuenta las COMPROBACIONES
    // declaradas en el paso (cada entrada de "verificar", una expectativa cuenta como una) que terminaron; "individuales"
    // cuenta las verificaciones elementales ejecutadas (una expectativa aprobada puede contener varias).
    let completadas = 0;
    let individuales = 0;
    const pendientes: string[] = [];
    let incidente = false;
    try {
      // P-15: en solo lectura la política se aplica ANTES de buscar la capacidad (también a las inyectadas o sustituidas).
      if (deps.soloLectura) exigirSoloLectura(paso.hacer, ctx);
      const cap = deps.capacidades[paso.hacer] ?? CAPACIDADES_DECLARATIVAS[paso.hacer];
      if (!cap) throw new Error(`capability "${paso.hacer}" no implementada en este ejecutor`);
      const salida = (await cap(paso, ctx)) ?? {};
      if (salida.detalle) notas.push(salida.detalle);
      for (const v of paso.verificar ?? []) {
        // Expectativa del catálogo de presentación: aprobada → se verifican sus verificaciones (citando la fuente);
        // pendiente de definición → no se verifica y el paso no puede quedar verde.
        if ('expectativa' in v) {
          const id = v.expectativa;
          const e = (deps.presentacion ?? cargarPresentacion()).expectativas[id];
          if (!e) throw new Error(`expectativa "${id}" no existe en el catálogo de presentación`);
          if (e.estado !== 'aprobada') { pendientes.push(id); notas.push(`… ${id} PENDIENTE DE DEFINICIÓN (${e.responsable}): ${e.pendiente}`); completadas++; continue; }
          for (const sub of e.verificar as Verificacion[]) {
            const res = await deps.verificar(sub, ctx);
            individuales++;
            notas.push(`${res.ok ? '✔' : '✘'} [${id} · fuente: ${e.fuente}] ${res.detalle}`);
            if (!res.ok) { ok = false; fallas++; }
          }
          completadas++;
          continue;
        }
        const res = await deps.verificar(v, ctx);
        individuales++;
        completadas++;
        notas.push(`${res.ok ? '✔' : '✘'} ${res.detalle}`);
        if (!res.ok) { ok = false; fallas++; }
      }
      r.estado = !ok ? 'FAIL' : pendientes.length ? 'NOT_AUTOMATED' : (salida.estado ?? 'PASS');
      // Verificación no cumplida = comportamiento observado distinto al esperado (por confirmar, nunca "defecto" directo).
      r.causa = !ok ? 'PRODUCTO_POR_CONFIRMAR' : pendientes.length ? 'NO_AUTOMATIZADO' : (salida.causa ?? CAUSA_DE_ESTADO[r.estado]);
      r.detalle = notas.join(' | ');
      if (salida.incidente) {
        r.incidente = { causa: salida.incidente.causa, detalle: sanitizar(salida.incidente.detalle, ctx.secretos) };
        incidente = true;
        r.detalle += ` | ⚠ INCIDENTE SEPARADO (${salida.incidente.causa}; no forma parte del resultado del paso): ${salida.incidente.detalle}`;
      }
    } catch (e) {
      const causa = causaDeExcepcion(e);
      const mensaje = (e as Error).message.split('\n').slice(0, 3).join(' ');
      const previas = notas.length ? `${notas.join(' | ')} | ` : '';
      if (fallas > 0) {
        // Ya había un defecto funcional OBSERVADO en este paso: se conserva como FAIL atribuido al producto (por
        // confirmar) y la excepción se registra APARTE como incidente técnico. No pasa a BLOCKED ni desaparece.
        const total = (paso.verificar ?? []).length;
        r.estado = 'FAIL';
        r.causa = 'PRODUCTO_POR_CONFIRMAR';
        r.incidente = { causa, detalle: sanitizar(mensaje, ctx.secretos) };
        incidente = true;
        r.detalle = `${previas}⚠ INCIDENTE posterior (${causa}; no sustituye lo observado): ${mensaje}` +
          ` | Comprobaciones del paso completadas: ${completadas} de ${total} declaradas (verificaciones elementales ejecutadas: ${individuales}); las restantes no se ejecutaron.`;
      } else {
        // Sin defecto previo: comportamiento anterior (BLOCKED o FAIL técnico según la causa), conservando lo observado.
        // Un rechazo de la política de solo lectura (P-15) es BLOCKED: ni defecto del producto ni de la automatización.
        r.causa = causa;
        r.estado = causa === 'DATO' || causa === 'AMBIENTE' || causa === 'POLITICA_SOLO_LECTURA' || causa === 'ASIGNACION' || (e as Error)?.name === 'BarreraPopupError' ? 'BLOCKED' : 'FAIL';
        r.detalle = `${previas}${mensaje}`;
      }
    }
    r.ms = Date.now() - t0;
    r.detalle = sanitizar(r.detalle, ctx.secretos);
    r.evidencia = await deps.evidencia(`${esc.id}_p${String(i + 1).padStart(2, '0')}_${paso.hacer}`).catch(() => undefined);
    // Paso de verificación NO BLOQUEANTE con una diferencia observada: solo miró la pantalla (no la cambió), así que el
    // estado de la UI sigue siendo confiable. Queda FAIL (y el CP también) y el recorrido continúa.
    // Un incidente técnico (R2) siempre detiene: el estado de la UI ya no es confiable aunque el paso sea no bloqueante.
    const observacionSegura = ['verificar', 'tabla_verificar', 'intentar_diligenciar'].includes(paso.hacer)
      || (paso.hacer === 'dialogo_confirmar' && paso.espera === 'cierra' && !ctx.dialogoAbierto);
    const sigue = !incidente && observacionSegura && paso.no_bloqueante === true && r.estado === 'FAIL' && r.causa === 'PRODUCTO_POR_CONFIRMAR';
    if (sigue) r.detalle += ' | No bloqueante: el recorrido continúa (el CP queda FAIL).';
    if (r.estado === 'BLOCKED' && /^BARRERA POP-UP/.test(r.detalle) && (paso.requiere ?? []).length && !ctx.dialogoAbierto) {
      bloquePopup = new Set(paso.requiere);
      r.detalle += ` | Barrera antes de cualquier clic: los pasos que requieren ${[...bloquePopup].join(', ')} quedan BLOCKED y el recorrido sigue con los independientes.`;
      continue;
    }
    // Un FAIL (o un dato o ambiente que faltaba a mitad de un paso) detiene: el estado de la UI ya no es confiable.
    if (!sigue && (r.estado === 'FAIL' || r.estado === 'BLOCKED' || r.incidente)) {
      // Si lo que falló fue el intento de cerrar el pop-up con "Guardar", ya no hay nada más que hacer: se detiene
      // (caso 430, 2026-10-13: seguir intentando pasos con el pop-up abierto no lo salva).
      const cierreFallido = paso.hacer === 'dialogo_confirmar' && (paso.espera === 'cierra' || paso.espera === 'no_registra');
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
