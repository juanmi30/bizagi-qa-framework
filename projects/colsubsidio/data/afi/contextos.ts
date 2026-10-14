/**
 * Contextos de ejecución AFI (Fase 4C). Dimensión de EJECUCIÓN, no de intención funcional:
 * DefinicionCasoAfi v1 no los contiene ni los contendrá sin una decisión de contrato
 * (ver AFI-CAPABILITY-BACKLOG.md). Los elige quien ejecuta, igual que el actor se elige por perfil.
 *
 * Capa pura: sin Playwright. Hoy ningún componente del runner la consume; un unit test la
 * mantiene igual a lo que realmente usan el harness (desktop) y el piloto histórico (mobile).
 */

export const CONTEXTOS_EJECUCION_AFI = ['desktop', 'mobile'] as const;
export type ContextoEjecucionAfi = typeof CONTEXTOS_EJECUCION_AFI[number];

export interface DefinicionContextoEjecucion {
  descripcion: string;
  /** Opciones de navegador que lo materializan (framework; nunca van al JSON del caso). */
  navegador: { viewport: { width: number; height: number }; isMobile: boolean; hasTouch: boolean };
  /** Modalidad con la que el driver realiza "clic"/"tap" y la escritura. */
  interaccion: 'mouse-teclado' | 'touch-teclado-emulado';
  /** ¿El camino por contrato (harness afi-case-file + ejecutarCasoAfi) lo ejecuta hoy? */
  soportadoRunnerV1: boolean;
  /** Dónde está demostrado, aunque no sea por contrato. */
  demostradoEn: 'runner-v1' | 'piloto-historico';
  limites: readonly string[];
}

export const CONTEXTOS_AFI: Record<ContextoEjecucionAfi, DefinicionContextoEjecucion> = {
  desktop: {
    descripcion: 'Navegador de escritorio (Chromium/Edge) con viewport ancho.',
    navegador: { viewport: { width: 1365, height: 900 }, isMobile: false, hasTouch: false },
    interaccion: 'mouse-teclado',
    soportadoRunnerV1: true,
    demostradoEn: 'runner-v1',
    limites: ['Un solo viewport: no certifica otros tamaños de escritorio ni otros navegadores.'],
  },
  mobile: {
    descripcion: 'Emulación de navegador móvil en Chromium/Edge: pantalla estrecha e interacción táctil.',
    navegador: { viewport: { width: 400, height: 824 }, isMobile: true, hasTouch: true },
    interaccion: 'touch-teclado-emulado',
    soportadoRunnerV1: false,
    demostradoEn: 'piloto-historico',
    limites: [
      'Es emulación: no es un dispositivo real, ni su navegador, ni su teclado virtual.',
      'No observa el tipo de teclado táctil (inputmode) ni selectores nativos del sistema operativo.',
      'El soporte administrativo (reconocimiento, cleanup) debe correr en un contexto desktop separado.',
    ],
  },
};
