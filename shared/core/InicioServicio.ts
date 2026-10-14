import {
  BizagiApiClient,
  type ParametroInicioBizagi,
} from '../utils/BizagiApiClient';
import {
  HistorialCasos,
} from '../utils/HistorialCasos';

/**
 * Datos necesarios para iniciar un caso mediante la API.
 */
export interface SolicitudInicioServicio {
  /**
   * GUID del proceso publicado en la API OData de Bizagi.
   */
  procesoId: string;

  /**
   * Nombre del escenario que originó el caso.
   * Se guarda en el histórico para trazabilidad y depuración.
   */
  escenario: string;

  /**
   * Datos iniciales enviados al proceso.
   */
  parametros?: ParametroInicioBizagi[];
}

/**
 * Pieza autocontenida para el futuro inicio.modo: servicio.
 *
 * Su responsabilidad termina cuando:
 * 1. Bizagi crea el caso.
 * 2. El número queda guardado en el histórico.
 * 3. El número se devuelve al motor.
 *
 * La apertura posterior del caso en la UI será responsabilidad
 * del flujo de integración con BpmEngine.
 */
export class InicioServicio {
  constructor(
    private readonly cliente: Pick<
      BizagiApiClient,
      'crearCaso'
    > = new BizagiApiClient(),

    private readonly historial: Pick<
      HistorialCasos,
      'registrar'
    > = new HistorialCasos(),
  ) {}

  async iniciar(
    solicitud: SolicitudInicioServicio,
  ): Promise<string> {
    const escenario = solicitud.escenario.trim();

    /*
     * Se valida antes de llamar a Bizagi para evitar crear un caso
     * que después no pueda registrarse con trazabilidad.
     */
    if (!escenario) {
      throw new Error(
        'El modo servicio requiere el nombre del escenario para ' +
        'registrar el caso en el histórico.',
      );
    }

    const numeroCaso = await this.cliente.crearCaso(
      solicitud.procesoId,
      solicitud.parametros ?? [],
    );

    try {
      await this.historial.registrar({
        numeroCaso,
        escenario,
        modoCreacion: 'servicio',
      });
    } catch (error: unknown) {
      const detalle =
        error instanceof Error
          ? error.message
          : String(error);

      /*
       * Es importante indicar que el caso ya fue creado.
       * Reintentar automáticamente podría generar un duplicado.
       */
      throw new Error(
        `Bizagi creó el caso ${numeroCaso}, pero no fue posible ` +
        'registrarlo en el histórico. No ejecutes nuevamente el ' +
        `escenario hasta registrar o depurar manualmente este caso. ` +
        `Detalle: ${detalle}`,
      );
    }

    return numeroCaso;
  }
}