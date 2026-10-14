/**
 * Criterio de éxito del smoke 4S-R.1 (información de la empresa, Empleador PJ). Puro: sin Playwright ni process.env, para que
 * sea verificable con regresiones sintéticas. Un PASS exige TODO; cleanup + PII 0 nunca bastan por sí solos.
 */

/** Únicos cortes que son un final EXITOSO del smoke; cualquier otro error es un fallo (se reporta saneado y falla el test). */
export const CORTES_ESPERADOS_SMOKE = ['PreparacionDetenidaError', 'SmokeDetenido'] as const;
export const BOTON_PJ = 'btn-empleador-pj-continuar';
/** Marcador de "pantalla siguiente" cuando el runner llegó al punto funcional (SmokeDetenido) sin otra transición. */
export const PUNTO_FUNCIONAL = '(punto-funcional)';

export type EstadoEvento = 'PASS' | 'FAIL';

export interface EntradaSmoke {
  /** ids públicos de los botones vistos por el hook antes de cada Continuar (el hook corre DESPUÉS de preparar la pantalla). */
  transiciones: readonly string[];
  /** Evento de la traza técnica del runner para la etapa (indicador independiente de que la pantalla PJ se presentó). */
  etapaInformacionEmpresa: EstadoEvento | null;
  /** Nombre del error con que terminó la ejecución (undefined = terminó sin error). */
  errorNombre?: string;
  /** Mensaje YA saneado por el llamador (o ausente). */
  errorMensajeSaneado?: string;
  cleanup: 'PASS' | 'FAIL' | 'N/A';
  coincidenciasPii: number;
}

export interface ReporteSmoke {
  /** La etapa informacion-empresa se ejecutó: solo ocurre cuando el botón PJ está visible (pantalla presentada). */
  pantallaPjObservada: boolean;
  etapaInformacionEmpresa: EstadoEvento | null;
  /** El hook previo al Continuar PJ se alcanzó (preparación terminada, antes de pulsar). */
  hookContinuarPjAlcanzado: boolean;
  pjCruzada: boolean;
  botonPantallaSiguiente: string | null;
  corteEsperado: string | null;
  errorInesperado: { tipo: string; mensaje?: string } | null;
  transiciones: string[];
  cleanup: EntradaSmoke['cleanup'];
  coincidenciasPii: number;
}

export function reporteSmoke(e: EntradaSmoke): ReporteSmoke {
  const esperado = e.errorNombre !== undefined && (CORTES_ESPERADOS_SMOKE as readonly string[]).includes(e.errorNombre);
  const iPj = e.transiciones.indexOf(BOTON_PJ);
  const siguiente = iPj >= 0
    ? e.transiciones.slice(iPj + 1).find(b => b !== BOTON_PJ) ?? (e.errorNombre === 'SmokeDetenido' ? PUNTO_FUNCIONAL : undefined)
    : undefined;
  return {
    pantallaPjObservada: e.etapaInformacionEmpresa !== null,
    etapaInformacionEmpresa: e.etapaInformacionEmpresa,
    hookContinuarPjAlcanzado: iPj >= 0,
    pjCruzada: siguiente !== undefined,
    botonPantallaSiguiente: siguiente ?? null,
    corteEsperado: esperado ? e.errorNombre! : null,
    errorInesperado: e.errorNombre !== undefined && !esperado
      ? { tipo: e.errorNombre, ...(e.errorMensajeSaneado ? { mensaje: e.errorMensajeSaneado } : {}) } : null,
    transiciones: [...e.transiciones],
    cleanup: e.cleanup,
    coincidenciasPii: e.coincidenciasPii,
  };
}

/** Lista de incumplimientos; vacía = PASS real. */
export function problemasSmoke(r: ReporteSmoke): string[] {
  const p: string[] = [];
  if (r.errorInesperado) p.push(`error inesperado: ${r.errorInesperado.tipo}`);
  if (!r.pantallaPjObservada) p.push('la pantalla PJ no se observó (la etapa informacion-empresa no se ejecutó)');
  if (r.etapaInformacionEmpresa !== 'PASS') p.push(`la etapa informacion-empresa no terminó (${r.etapaInformacionEmpresa ?? 'sin evento'})`);
  if (!r.hookContinuarPjAlcanzado) p.push(`no se alcanzó el Continuar ${BOTON_PJ}`);
  if (!r.pjCruzada || r.botonPantallaSiguiente === null) p.push('no se cruzó la pantalla PJ ni se observó una pantalla siguiente');
  if (!r.corteEsperado) p.push(`la ejecución no terminó en un corte esperado (${CORTES_ESPERADOS_SMOKE.join(' | ')})`);
  if (r.cleanup !== 'PASS') p.push(`cleanup ${r.cleanup}`);
  if (r.coincidenciasPii !== 0) p.push(`PII en artefactos: ${r.coincidenciasPii}`);
  return p;
}

/** Mensaje de error para el reporte: sin códigos ANSI y acotado (el llamador ya redactó secretos). */
export function mensajeParaReporte(mensaje: string): string {
  // eslint-disable-next-line no-control-regex
  return mensaje.replace(/\u001b\[[0-9;]*m/g, '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 6).join(' | ').slice(0, 400);
}
