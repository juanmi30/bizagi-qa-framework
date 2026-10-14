import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { InicioServicio } from '../../../shared/core/InicioServicio';
import { BizagiApiClient, type ParametroInicioBizagi } from '../../../shared/utils/BizagiApiClient';
import { HistorialCasos } from '../../../shared/utils/HistorialCasos';
import { resolverValoresEnv } from '../../../shared/utils/valoresEnv';

interface RecursoCreateCase {
  nombre: string;
  ambiente: string;
  apiUrl: string;
  processId: string;
  startParameters: ParametroInicioBizagi[];
}

const casos = [
  { archivo: 'credito.json', escenario: 'CRD - Create Case API real' },
  { archivo: 'afiliaciones.json', escenario: 'AFI - Create Case API real' },
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
  // Los valores "${env:NOMBRE}" (datos sensibles fuera de Git) se resuelven con el .env local.
  return resolverValoresEnv(JSON.parse(await readFile(ruta, 'utf8')) as RecursoCreateCase, process.env, archivo);
}

function conOverrides(
  recurso: RecursoCreateCase,
): ParametroInicioBizagi[] {
  return recurso.startParameters.map((parametro) => {
    if (
      parametro.xpath.endsWith('.sNumeroIdentificacion') &&
      recurso.nombre === 'Gestión de Crédito' &&
      process.env.BIZAGI_CREDITO_NUMERO_IDENTIFICACION
    ) {
      return {
        ...parametro,
        value: process.env.BIZAGI_CREDITO_NUMERO_IDENTIFICACION,
      };
    }

    if (
      parametro.xpath.endsWith('.sNumeroIdentificacion') &&
      recurso.nombre === 'Afiliaciones' &&
      process.env.BIZAGI_AFILIACIONES_NUMERO_IDENTIFICACION
    ) {
      return {
        ...parametro,
        value: process.env.BIZAGI_AFILIACIONES_NUMERO_IDENTIFICACION,
      };
    }


    if (
      parametro.xpath.endsWith('.dFechaHoraAceptacion') &&
      process.env.BIZAGI_AFILIACIONES_FECHA_HORA
    ) {
      return {
        ...parametro,
        value: process.env.BIZAGI_AFILIACIONES_FECHA_HORA,
      };
    }

    if (
      parametro.xpath.endsWith('.sCorreoElectronicoPIF') &&
      process.env.BIZAGI_AFILIACIONES_CORREO
    ) {
      return {
        ...parametro,
        value: process.env.BIZAGI_AFILIACIONES_CORREO,
      };
    }

    return parametro;
  });
}

test.describe('Create Case real Colsubsidio @t2-real', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.skip(
    process.env.BIZAGI_RUN_REAL_API !== 'true',
    'Prueba real deshabilitada. Activa BIZAGI_RUN_REAL_API=true para crear casos en el ambiente de test.',
  );

  for (const caso of casos) {
    test(`${caso.archivo}: crea un caso real y lo registra en el histórico`, async () => {
      const recurso = await cargarRecurso(caso.archivo);

      expect(process.env.BIZAGI_API_URL).toBe(recurso.apiUrl);
      expect(process.env.BIZAGI_API_TOKEN?.trim()).toBeTruthy();

      const inicioServicio = new InicioServicio(
        new BizagiApiClient(),
        new HistorialCasos(),
      );

      const numeroCaso = await inicioServicio.iniciar({
        procesoId: recurso.processId,
        escenario: caso.escenario,
        parametros: conOverrides(recurso),
      });

      expect(numeroCaso.trim()).not.toBe('');
      console.log(`[T2 real] ${recurso.nombre}: caso creado ${numeroCaso}`);
    });
  }
});
