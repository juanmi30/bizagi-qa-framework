/**
 * Cliente mínimo para consumir la API OData de Bizagi.
 *
 * Responsabilidades:
 * 1. Resolver un token Bearer para la API (token preemitido o OAuth client_credentials).
 * 2. Crear un caso para un proceso mediante su GUID.
 * 3. Devolver el número de caso informado por Bizagi.
 *
 * No depende de un proyecto específico. La configuración se obtiene desde variables
 * de entorno y el transporte HTTP se puede sustituir en pruebas.
 */

export interface ParametroInicioBizagi {
  xpath: string;
  value?: unknown;
  type?: string;
  rows?: unknown[];
}

interface ConfiguracionBizagiApi {
  apiUrl: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
  timeoutMs: number;
}

interface DependenciasBizagiApiClient {
  /**
   * Se puede reemplazar en pruebas para simular el servidor de Bizagi.
   * En ejecución normal utiliza el fetch global de Node.js.
   */
  fetchFn?: typeof fetch;

  /**
   * Se puede reemplazar en pruebas para no modificar process.env.
   */
  env?: NodeJS.ProcessEnv;
}

export class BizagiApiClient {
  private readonly fetchFn: typeof fetch;
  private readonly env: NodeJS.ProcessEnv;
  private accessToken?: string;

  constructor(dependencias: DependenciasBizagiApiClient = {}) {
    this.fetchFn = dependencias.fetchFn ?? fetch;
    this.env = dependencias.env ?? process.env;
  }

  /**
   * Resuelve el token Bearer que se usará contra Bizagi.
   *
   * Prioridad:
   * 1. BIZAGI_API_TOKEN: token preemitido (caso actual del ambiente de pruebas
   *    compartido por Colsubsidio).
   * 2. OAuth client_credentials con BIZAGI_API_CLIENT_ID + BIZAGI_API_SECRET.
   *
   * El token se conserva únicamente en memoria durante la ejecución.
   */
  async autenticar(): Promise<string> {
    if (this.accessToken) return this.accessToken;

    const config = this.obtenerConfiguracion();

    if (config.token) {
      this.accessToken = config.token;
      return config.token;
    }

    if (!config.clientId || !config.clientSecret) {
      throw new Error(
        'No hay un método de autenticación configurado para la API de Bizagi. ' +
        'Configura BIZAGI_API_TOKEN o, alternativamente, ' +
        'BIZAGI_API_CLIENT_ID y BIZAGI_API_SECRET en el .env.',
      );
    }

    const credenciales = Buffer
      .from(`${config.clientId}:${config.clientSecret}`, 'utf8')
      .toString('base64');

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'api',
    });

    const response = await this.solicitar(
      `${config.apiUrl}/oauth2/server/token`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credenciales}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
      'La API de Bizagi no respondió dentro del tiempo esperado durante la autenticación. Verifica la disponibilidad del ambiente o aumenta BIZAGI_API_TIMEOUT_MS.',
      'No fue posible conectarse con la API de Bizagi durante la autenticación. Verifica la URL y la disponibilidad del ambiente.',
    );

    if (!response.ok) {
      throw new Error(
        'No fue posible autenticarse en la API de Bizagi. ' +
        'Verifica el Client ID, el Client Secret, el alcance API y el usuario ' +
        `asociado a la aplicación OAuth. Código HTTP: ${response.status}.`,
      );
    }

    const data = await this.leerJson(response);
    const token = data.access_token;

    if (typeof token !== 'string' || token.trim() === '') {
      throw new Error(
        'Bizagi respondió a la autenticación, pero no devolvió un access_token válido.',
      );
    }

    this.accessToken = token.trim();
    return this.accessToken;
  }

  /**
   * Crea un caso mediante:
   * POST /odata/data/processes(<GUID>)/start
   *
   * @param procesoId GUID del proceso en Bizagi.
   * @param parametros Parámetros del formulario de inicio.
   * @returns Número del caso creado.
   */
  async crearCaso(
    procesoId: string,
    parametros: ParametroInicioBizagi[] = [],
  ): Promise<string> {
    const proceso = procesoId.trim();

    if (!proceso) {
      throw new Error(
        'No se puede crear el caso porque no se indicó el GUID del proceso de Bizagi.',
      );
    }

    const config = this.obtenerConfiguracion();
    const token = this.accessToken ?? await this.autenticar();

    const response = await this.solicitar(
      `${config.apiUrl}/odata/data/processes(${encodeURIComponent(proceso)})/start`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startParameters: parametros,
        }),
      },
      'La API de Bizagi no respondió dentro del tiempo esperado al crear el caso. Verifica la disponibilidad del ambiente o aumenta BIZAGI_API_TIMEOUT_MS.',
      'No fue posible conectarse con la API de Bizagi al crear el caso. Verifica la URL y la disponibilidad del ambiente.',
    );

    if (response.status === 404) {
      throw new Error(
        'Bizagi no encontró el proceso solicitado. Verifica el GUID del proceso ' +
        'y que el usuario asociado a la autenticación tenga permiso para iniciarlo.',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Bizagi rechazó la creación del caso por autenticación o permisos. ' +
        'Verifica el token Bearer o la aplicación OAuth configurada.',
      );
    }

    if (!response.ok) {
      throw new Error(
        'Bizagi no pudo crear el caso. Verifica el GUID del proceso y los ' +
        `parámetros de inicio. Código HTTP: ${response.status}.`,
      );
    }

    const data = await this.leerJson(response);
    const numeroCaso = data.value;

    if (
      (typeof numeroCaso !== 'string' && typeof numeroCaso !== 'number') ||
      String(numeroCaso).trim() === ''
    ) {
      throw new Error(
        'Bizagi respondió exitosamente, pero no devolvió el número del caso en el campo "value".',
      );
    }

    return String(numeroCaso).trim();
  }

  /**
   * Obtiene y valida la configuración sin exponer valores de autenticación.
   */
  private obtenerConfiguracion(): ConfiguracionBizagiApi {
    const apiUrl = this.env.BIZAGI_API_URL?.trim();
    const token = this.env.BIZAGI_API_TOKEN?.trim();
    const clientId = this.env.BIZAGI_API_CLIENT_ID?.trim();
    const clientSecret = this.env.BIZAGI_API_SECRET?.trim();

    if (!apiUrl) {
      throw new Error(
        'El modo servicio requiere BIZAGI_API_URL en el .env (ver .env.example).',
      );
    }

    if (!token && !clientId && !clientSecret) {
      throw new Error(
        'El modo servicio requiere autenticación para la API. Configura ' +
        'BIZAGI_API_TOKEN o BIZAGI_API_CLIENT_ID y BIZAGI_API_SECRET ' +
        'en el .env (ver .env.example).',
      );
    }

    if (!token && Boolean(clientId) !== Boolean(clientSecret)) {
      throw new Error(
        'La configuración OAuth está incompleta. Debes configurar juntos ' +
        'BIZAGI_API_CLIENT_ID y BIZAGI_API_SECRET.',
      );
    }

    let url: URL;

    try {
      url = new URL(apiUrl);
    } catch {
      throw new Error(
        'BIZAGI_API_URL no contiene una URL válida. ' +
        'Debe comenzar por http:// o https://.',
      );
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(
        'BIZAGI_API_URL debe utilizar el protocolo http:// o https://.',
      );
    }

    const timeoutConfigurado = Number(this.env.BIZAGI_API_TIMEOUT_MS);
    const timeoutMs =
      Number.isFinite(timeoutConfigurado) && timeoutConfigurado > 0
        ? timeoutConfigurado
        : 30_000;

    return {
      apiUrl: apiUrl.replace(/\/+$/, ''),
      token,
      clientId,
      clientSecret,
      timeoutMs,
    };
  }

  /**
   * Ejecuta una solicitud aplicando timeout y convirtiendo errores técnicos
   * de fetch en mensajes comprensibles en español.
   */
  private async solicitar(
    url: string,
    init: RequestInit,
    mensajeTimeout: string,
    mensajeConexion: string,
  ): Promise<Response> {
    const { timeoutMs } = this.obtenerConfiguracion();
    const controller = new AbortController();
    const temporizador = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await this.fetchFn(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(mensajeTimeout);
      }

      const causa =
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : error instanceof Error
            ? error.message
            : String(error);

      throw new Error(`${mensajeConexion} Detalle técnico: ${causa}`);
    } finally {
      clearTimeout(temporizador);
    }
  }

  /**
   * Intenta interpretar una respuesta como JSON sin mostrar un stack trace
   * técnico si el cuerpo está vacío o no es JSON.
   */
  private async leerJson(
    response: Response,
  ): Promise<Record<string, unknown>> {
    try {
      const data: unknown = await response.json();

      if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data as Record<string, unknown>;
      }

      return {};
    } catch {
      return {};
    }
  }
}