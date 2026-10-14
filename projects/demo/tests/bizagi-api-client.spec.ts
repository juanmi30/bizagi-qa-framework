import { test, expect } from '@playwright/test';
import { BizagiApiClient } from '../../../shared/utils/BizagiApiClient';

interface LlamadaFetch {
  url: string;
  init?: RequestInit;
}

function crearFetchSecuencial(respuestasIniciales: Response[]): {
  fetchFn: typeof fetch;
  llamadas: LlamadaFetch[];
} {
  const respuestas = [...respuestasIniciales];
  const llamadas: LlamadaFetch[] = [];

  const fetchFn: typeof fetch = async (input, init) => {
    llamadas.push({ url: String(input), init });
    const respuesta = respuestas.shift();
    if (!respuesta) throw new Error('El mock no tiene más respuestas configuradas.');
    return respuesta;
  };

  return { fetchFn, llamadas };
}

function respuestaJson(
  contenido: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(contenido), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function configuracionOAuth(
  adicionales: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    BIZAGI_API_URL: 'https://qa-ejemplo.bizagi.com',
    BIZAGI_API_CLIENT_ID: 'cliente-prueba',
    BIZAGI_API_SECRET: 'secreto-prueba',
    BIZAGI_API_TIMEOUT_MS: '30000',
    ...adicionales,
  };
}

function configuracionToken(
  adicionales: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    BIZAGI_API_URL: 'https://qa-ejemplo.bizagi.com',
    BIZAGI_API_TOKEN: 'token-preemitido-prueba',
    BIZAGI_API_TIMEOUT_MS: '30000',
    ...adicionales,
  };
}

test.describe('BizagiApiClient @t2-api', () => {
  test('usa directamente un Bearer token preemitido sin llamar al endpoint OAuth', async () => {
    let llamadas = 0;
    const fetchNoEsperado: typeof fetch = async () => {
      llamadas += 1;
      throw new Error('No debería ejecutarse fetch para resolver un token preemitido.');
    };

    const cliente = new BizagiApiClient({
      env: configuracionToken(),
      fetchFn: fetchNoEsperado,
    });

    await expect(cliente.autenticar()).resolves.toBe('token-preemitido-prueba');
    expect(llamadas).toBe(0);
  });

  test('autentica correctamente mediante client_credentials como alternativa OAuth', async () => {
    const mock = crearFetchSecuencial([
      respuestaJson({ access_token: 'token-simulado', token_type: 'bearer' }),
    ]);

    const cliente = new BizagiApiClient({
      env: configuracionOAuth(),
      fetchFn: mock.fetchFn,
    });

    const token = await cliente.autenticar();

    expect(token).toBe('token-simulado');
    expect(mock.llamadas).toHaveLength(1);
    expect(mock.llamadas[0].url).toBe(
      'https://qa-ejemplo.bizagi.com/oauth2/server/token',
    );

    const solicitud = mock.llamadas[0].init;
    const headers = new Headers(solicitud?.headers);

    expect(solicitud?.method).toBe('POST');
    expect(headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');

    const credencialesEsperadas = Buffer
      .from('cliente-prueba:secreto-prueba', 'utf8')
      .toString('base64');

    expect(headers.get('Authorization')).toBe(`Basic ${credencialesEsperadas}`);

    const body = String(solicitud?.body);
    expect(body).toContain('grant_type=client_credentials');
    expect(body).toContain('scope=api');
  });

  test('crea un caso usando el Bearer token configurado y devuelve el número', async () => {
    const mock = crearFetchSecuencial([
      respuestaJson({ value: 555656 }),
    ]);

    const cliente = new BizagiApiClient({
      env: configuracionToken(),
      fetchFn: mock.fetchFn,
    });

    const parametros = [
      {
        xpath: 'M_SolicitudTramite.sNumeroIdentificacion',
        value: '1015410818',
      },
      {
        xpath: 'M_SolicitudTramite.bCreadoDesdeServicio',
        value: true,
      },
    ];

    const numeroCaso = await cliente.crearCaso(
      '0188d3ec-f208-4653-be77-788fc76e370c',
      parametros,
    );

    expect(numeroCaso).toBe('555656');
    expect(mock.llamadas).toHaveLength(1);

    const llamadaCreacion = mock.llamadas[0];
    expect(llamadaCreacion.url).toBe(
      'https://qa-ejemplo.bizagi.com/odata/data/' +
      'processes(0188d3ec-f208-4653-be77-788fc76e370c)/start',
    );

    const headers = new Headers(llamadaCreacion.init?.headers);
    expect(llamadaCreacion.init?.method).toBe('POST');
    expect(headers.get('Authorization')).toBe('Bearer token-preemitido-prueba');
    expect(headers.get('Content-Type')).toBe('application/json');

    const body = JSON.parse(String(llamadaCreacion.init?.body)) as Record<string, unknown>;
    expect(body).toEqual({ startParameters: parametros });
  });

  test('informa claramente cuando falta cualquier método de autenticación', async () => {
    const cliente = new BizagiApiClient({
      env: { BIZAGI_API_URL: 'https://qa-ejemplo.bizagi.com' },
    });

    await expect(cliente.autenticar()).rejects.toThrow(
      'El modo servicio requiere autenticación para la API',
    );
  });

  test('informa cuando la configuración OAuth está incompleta', async () => {
    const cliente = new BizagiApiClient({
      env: {
        BIZAGI_API_URL: 'https://qa-ejemplo.bizagi.com',
        BIZAGI_API_CLIENT_ID: 'cliente-sin-secret',
      },
    });

    await expect(cliente.autenticar()).rejects.toThrow(
      'La configuración OAuth está incompleta',
    );
  });

  test('informa cuando la autenticación OAuth es rechazada', async () => {
    const mock = crearFetchSecuencial([
      respuestaJson({ error: 'invalid_client' }, 401),
    ]);

    const cliente = new BizagiApiClient({
      env: configuracionOAuth(),
      fetchFn: mock.fetchFn,
    });

    await expect(cliente.autenticar()).rejects.toThrow(
      'No fue posible autenticarse en la API de Bizagi',
    );
  });

  test('informa cuando el proceso no existe', async () => {
    const mock = crearFetchSecuencial([
      respuestaJson({ error: 'Proceso no encontrado' }, 404),
    ]);

    const cliente = new BizagiApiClient({
      env: configuracionToken(),
      fetchFn: mock.fetchFn,
    });

    await expect(cliente.crearCaso('guid-inexistente', [])).rejects.toThrow(
      'Bizagi no encontró el proceso solicitado',
    );
  });

  test('informa cuando Bizagi no devuelve el número del caso', async () => {
    const mock = crearFetchSecuencial([
      respuestaJson({ resultado: 'Caso creado' }),
    ]);

    const cliente = new BizagiApiClient({
      env: configuracionToken(),
      fetchFn: mock.fetchFn,
    });

    await expect(
      cliente.crearCaso('0188d3ec-f208-4653-be77-788fc76e370c', []),
    ).rejects.toThrow('no devolvió el número del caso en el campo "value"');
  });

  test('informa claramente cuando ocurre un timeout al crear el caso', async () => {
    const fetchTimeout: typeof fetch = async (_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const rechazarPorTimeout = (): void => {
          const error = new Error('Solicitud abortada por el mock.');
          error.name = 'AbortError';
          reject(error);
        };

        if (init?.signal?.aborted) {
          rechazarPorTimeout();
          return;
        }

        init?.signal?.addEventListener('abort', rechazarPorTimeout, { once: true });
      });
    };

    const cliente = new BizagiApiClient({
      env: configuracionToken({ BIZAGI_API_TIMEOUT_MS: '5' }),
      fetchFn: fetchTimeout,
    });

    await expect(
      cliente.crearCaso('0188d3ec-f208-4653-be77-788fc76e370c', []),
    ).rejects.toThrow('La API de Bizagi no respondió dentro del tiempo esperado');
  });

  test('rechaza la creación cuando no se indica el proceso', async () => {
    const cliente = new BizagiApiClient({ env: configuracionToken() });

    await expect(cliente.crearCaso('   ', [])).rejects.toThrow(
      'no se indicó el GUID del proceso',
    );
  });
});
