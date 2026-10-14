import type { HistorialCasos, ModoCreacionCaso } from './HistorialCasos';

export interface ResultadoRecuperacion {
  numeroCaso: string;
  estado: 'CANCELADO' | 'ERROR';
  detalle?: string;
}

interface SolicitudRecuperacion {
  historial: Pick<HistorialCasos, 'listarPendientes' | 'listar'>;
  modoCreacion: ModoCreacionCaso;
  /**
   * Depuración física de UN número exacto del histórico. Es responsable de
   * marcar Depurado solo tras confirmar la cancelación en Bizagi.
   */
  cancelar: (numeroCaso: string) => Promise<void>;
}

/**
 * Recuperación explícita: opera solo números pendientes del histórico en el
 * modo pedido, nunca búsquedas arbitrarias. Un fallo no detiene los demás.
 */
export async function recuperarCasosPendientes(
  { historial, modoCreacion, cancelar }: SolicitudRecuperacion,
): Promise<ResultadoRecuperacion[]> {
  const pendientes = await historial.listarPendientes(modoCreacion);
  const resultados: ResultadoRecuperacion[] = [];

  for (const { numeroCaso } of pendientes) {
    try {
      await cancelar(numeroCaso);
      const registro = (await historial.listar()).find(c => c.numeroCaso === numeroCaso);
      resultados.push(registro?.estadoDepuracion === 'Depurado'
        ? { numeroCaso, estado: 'CANCELADO' }
        : { numeroCaso, estado: 'ERROR', detalle: 'la cancelación terminó sin quedar Depurado en el histórico' });
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error);
      resultados.push({ numeroCaso, estado: 'ERROR', detalle: mensaje.split('\n')[0].slice(0, 200) });
    }
  }

  return resultados;
}

export function resumenRecuperacion(
  modoCreacion: ModoCreacionCaso,
  resultados: ResultadoRecuperacion[],
): string {
  const titulo = modoCreacion === 'portal' ? 'Portal' : 'Servicio';
  const depurados = resultados.filter(r => r.estado === 'CANCELADO').length;
  return [
    `Pendientes ${titulo} encontrados: ${resultados.length}`,
    '',
    ...resultados.map(r => `${r.numeroCaso} -> ${r.estado === 'CANCELADO' ? 'CANCELADO' : `ERROR: ${r.detalle}`}`),
    '',
    `Depurados: ${depurados}`,
    `Pendientes restantes: ${resultados.length - depurados}`,
  ].join('\n');
}
