import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  BizagiApiClient,
  type ParametroInicioBizagi,
} from '../../../shared/utils/BizagiApiClient';
import { resolverValoresEnv } from '../../../shared/utils/valoresEnv';

interface RecursoCreateCase {
  nombre: string;
  ambiente: string;
  apiUrl: string;
  processId: string;
  startParameters: ParametroInicioBizagi[];
}

interface LlamadaHttp {
  url: string;
  init?: RequestInit;
}

const casos = [
  { archivo: 'credito.json', numeroCaso: '555900' },
  { archivo: 'afiliaciones.json', numeroCaso: '555901' },
];

async function cargarRecurso(archivo: string): Promise<RecursoCreateCase> {
  const ruta = resolve(
    process.cwd(),
    'projects',
    'colsubsidio',
    'resources',
    'create-case',
    archivo,
  );

  const contenido = await readFile(ruta, 'utf8');
  expect(contenido.trim(), `El recurso está vacío: ${ruta}`).not.toBe('');
  return JSON.parse(contenido) as RecursoCreateCase;
}

test.describe('Contrato Create Case Colsubsidio @t2-contrato', () => {
  for (const caso of casos) {
    test(`${caso.archivo}: conserva exactamente el contrato recibido`, async () => {
      const recurso = await cargarRecurso(caso.archivo);
      const llamadas: LlamadaHttp[] = [];

      const fetchMock: typeof fetch = async (input, init) => {
        llamadas.push({ url: String(input), init });
        return new Response(JSON.stringify({ value: caso.numeroCaso }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const cliente = new BizagiApiClient({
        env: {
          BIZAGI_API_URL: recurso.apiUrl,
          BIZAGI_API_TOKEN: 'token-de-prueba-controlado',
          BIZAGI_API_TIMEOUT_MS: '30000',
        },
        fetchFn: fetchMock,
      });

      const numeroCaso = await cliente.crearCaso(
        recurso.processId,
        recurso.startParameters,
      );

      expect(numeroCaso).toBe(caso.numeroCaso);
      expect(llamadas).toHaveLength(1);

      const llamada = llamadas[0];
      expect(llamada.url).toBe(
        `${recurso.apiUrl}/odata/data/processes(${recurso.processId})/start`,
      );
      expect(llamada.init?.method).toBe('POST');

      const headers = new Headers(llamada.init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer token-de-prueba-controlado');
      expect(headers.get('Content-Type')).toBe('application/json');

      const body = JSON.parse(String(llamada.init?.body)) as {
        startParameters: ParametroInicioBizagi[];
      };

      // toEqual valida también los tipos: true !== "true" y 1 !== "1".
      expect(body).toEqual({ startParameters: recurso.startParameters });
    });
  }

  test('credito.json referencia el usuario creador del .env local y se resuelve solo con el .env', async () => {
    const recurso = await cargarRecurso('credito.json');
    const esCreador = (p: ParametroInicioBizagi) => p.xpath.endsWith('.sUsuarioCreadorCaso');
    expect(recurso.startParameters.find(esCreador)?.value, 'el usuario no se versiona').toBe('${env:COLSUBSIDIO_USUARIO_ADMINISTRADOR}');

    const resuelto = resolverValoresEnv(recurso, { COLSUBSIDIO_USUARIO_ADMINISTRADOR: 'usuario.sintetico' }, 'credito.json');
    expect(resuelto.startParameters.find(esCreador)?.value).toBe('usuario.sintetico');
    // El resto del contrato no cambia (tipos incluidos).
    expect(resuelto.startParameters.filter((p) => !esCreador(p))).toEqual(recurso.startParameters.filter((p) => !esCreador(p)));
    // Sin la variable no se inventa un valor: falla nombrando la variable.
    expect(() => resolverValoresEnv(recurso, {}, 'credito.json')).toThrow('Falta COLSUBSIDIO_USUARIO_ADMINISTRADOR en el .env local');
  });
});
