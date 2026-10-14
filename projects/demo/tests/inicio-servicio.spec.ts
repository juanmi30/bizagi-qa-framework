import { test, expect } from '@playwright/test';

import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InicioServicio } from '../../../shared/core/InicioServicio';
import {
  HistorialCasos,
  type CasoHistorico,
  type NuevoCasoHistorico,
} from '../../../shared/utils/HistorialCasos';

import {
  BizagiApiClient,
  type ParametroInicioBizagi,
} from '../../../shared/utils/BizagiApiClient';

async function crearDirectorioTemporal(): Promise<string> {
  return mkdtemp(
    join(tmpdir(), 'bizagi-historial-pruebas-'),
  );
}

async function eliminarDirectorio(
  directorio: string,
): Promise<void> {
  await rm(directorio, {
    recursive: true,
    force: true,
  });
}

function crearCasoHistoricoMock(
  nuevoCaso: NuevoCasoHistorico,
  fechaHora = '2026-08-06T15:00:00.000Z',
): CasoHistorico {
  return {
    numeroCaso: nuevoCaso.numeroCaso,
    fechaHora,
    escenario: nuevoCaso.escenario,
    modoCreacion: nuevoCaso.modoCreacion ?? 'servicio',
    estadoDepuracion: 'Pendiente de depurar',
  };
}

test.describe('HistorialCasos @t2-servicio', () => {
  test('devuelve una lista vacía cuando el histórico aún no existe', async () => {
    const directorio = await crearDirectorioTemporal();

    try {
      const historial = new HistorialCasos({
        proyecto: 'demo',
        directorioBase: directorio,
      });

      const casos = await historial.listar();

      expect(casos).toEqual([]);
    } finally {
      await eliminarDirectorio(directorio);
    }
  });

  test('registra un caso con fecha, escenario y estado pendiente', async () => {
    const directorio = await crearDirectorioTemporal();
    const fechaFija = new Date(
      '2026-08-06T15:00:00.000Z',
    );

    try {
      const historial = new HistorialCasos({
        proyecto: 'demo',
        directorioBase: directorio,
        ahora: () => fechaFija,
      });

      const registro = await historial.registrar({
        numeroCaso: '555656',
        escenario: 'CRD-01 - Camino feliz',
      });

      expect(registro).toEqual({
        numeroCaso: '555656',
        fechaHora: '2026-08-06T15:00:00.000Z',
        escenario: 'CRD-01 - Camino feliz',
        modoCreacion: 'servicio',
        estadoDepuracion: 'Pendiente de depurar',
      });

      const contenido = await readFile(
        historial.rutaArchivo,
        'utf8',
      );

      const casos = JSON.parse(
        contenido,
      ) as CasoHistorico[];

      expect(casos).toEqual([registro]);
    } finally {
      await eliminarDirectorio(directorio);
    }
  });

  test('conserva los casos anteriores al agregar uno nuevo', async () => {
    const directorio = await crearDirectorioTemporal();
    const fechas = [
      new Date('2026-08-06T15:00:00.000Z'),
      new Date('2026-08-06T15:05:00.000Z'),
    ];

    try {
      const historial = new HistorialCasos({
        proyecto: 'demo',
        directorioBase: directorio,
        ahora: () => fechas.shift() ?? new Date(),
      });

      await historial.registrar({
        numeroCaso: '555656',
        escenario: 'CRD-01',
      });

      await historial.registrar({
        numeroCaso: '555657',
        escenario: 'CRD-02',
      });

      const casos = await historial.listar();

      expect(casos).toHaveLength(2);
      expect(casos[0].numeroCaso).toBe('555656');
      expect(casos[1].numeroCaso).toBe('555657');
      expect(casos[1].estadoDepuracion).toBe(
        'Pendiente de depurar',
      );
    } finally {
      await eliminarDirectorio(directorio);
    }
  });

  test('informa claramente cuando el JSON del histórico está dañado', async () => {
    const directorio = await crearDirectorioTemporal();

    try {
      const historial = new HistorialCasos({
        proyecto: 'demo',
        directorioBase: directorio,
      });

      await mkdir(
        join(
          directorio,
          'test-results',
          'demo',
        ),
        { recursive: true },
      );

      await writeFile(
        historial.rutaArchivo,
        '{ json inválido',
        'utf8',
      );

      await expect(
        historial.listar(),
      ).rejects.toThrow(
        'no contiene un JSON válido',
      );
    } finally {
      await eliminarDirectorio(directorio);
    }
  });
});

test.describe('InicioServicio @t2-servicio', () => {
  test('crea el caso, lo registra y devuelve su número', async () => {
    const llamadasCliente: Array<{
      procesoId: string;
      parametros: ParametroInicioBizagi[];
    }> = [];

    const registros: NuevoCasoHistorico[] = [];

    const clienteMock: Pick<
      BizagiApiClient,
      'crearCaso'
    > = {
      crearCaso: async (
        procesoId,
        parametros = [],
      ): Promise<string> => {
        llamadasCliente.push({
          procesoId,
          parametros,
        });

        return '555656';
      },
    };

    const historialMock: Pick<
      HistorialCasos,
      'registrar'
    > = {
      registrar: async (
        registro,
      ): Promise<CasoHistorico> => {
        registros.push(registro);
        return crearCasoHistoricoMock(registro);
      },
    };

    const inicioServicio = new InicioServicio(
      clienteMock,
      historialMock,
    );

    const parametros: ParametroInicioBizagi[] = [
      {
        xpath:
          'M_SolicitudTramite.sNumeroIdentificacion',
        value: '1015410818',
      },
    ];

    const numeroCaso = await inicioServicio.iniciar({
      procesoId:
        '0188d3ec-f208-4653-be77-788fc76e370c',
      escenario: 'CRD-01 - Camino feliz',
      parametros,
    });

    expect(numeroCaso).toBe('555656');

    expect(llamadasCliente).toEqual([
      {
        procesoId:
          '0188d3ec-f208-4653-be77-788fc76e370c',
        parametros,
      },
    ]);

    expect(registros).toEqual([
      {
        numeroCaso: '555656',
        escenario: 'CRD-01 - Camino feliz',
        modoCreacion: 'servicio',
      },
    ]);
  });

  test('no llama a Bizagi cuando falta el nombre del escenario', async () => {
    let llamadasCliente = 0;

    const clienteMock: Pick<
      BizagiApiClient,
      'crearCaso'
    > = {
      crearCaso: async (): Promise<string> => {
        llamadasCliente += 1;
        return '555656';
      },
    };

    const historialMock: Pick<
      HistorialCasos,
      'registrar'
    > = {
      registrar: async (
        registro,
      ): Promise<CasoHistorico> =>
        crearCasoHistoricoMock(registro),
    };

    const inicioServicio = new InicioServicio(
      clienteMock,
      historialMock,
    );

    await expect(
      inicioServicio.iniciar({
        procesoId:
          '0188d3ec-f208-4653-be77-788fc76e370c',
        escenario: '   ',
      }),
    ).rejects.toThrow(
      'requiere el nombre del escenario',
    );

    expect(llamadasCliente).toBe(0);
  });

  test('advierte que el caso ya fue creado cuando falla el histórico', async () => {
    const clienteMock: Pick<
      BizagiApiClient,
      'crearCaso'
    > = {
      crearCaso: async (): Promise<string> =>
        '555656',
    };

    const historialMock: Pick<
      HistorialCasos,
      'registrar'
    > = {
      registrar: async (): Promise<never> => {
        throw new Error(
          'No fue posible escribir el archivo.',
        );
      },
    };

    const inicioServicio = new InicioServicio(
      clienteMock,
      historialMock,
    );

    await expect(
      inicioServicio.iniciar({
        procesoId:
          '0188d3ec-f208-4653-be77-788fc76e370c',
        escenario: 'CRD-01 - Camino feliz',
      }),
    ).rejects.toThrow(
      'Bizagi creó el caso 555656, pero no fue posible registrarlo',
    );
  });

  test('integra el cliente simulado con un histórico real temporal', async () => {
    const directorio = await crearDirectorioTemporal();

    try {
      const clienteMock: Pick<
        BizagiApiClient,
        'crearCaso'
      > = {
        crearCaso: async (): Promise<string> =>
          '555700',
      };

      const historial = new HistorialCasos({
        proyecto: 'demo',
        directorioBase: directorio,
        ahora: () =>
          new Date('2026-08-06T15:30:00.000Z'),
      });

      const inicioServicio = new InicioServicio(
        clienteMock,
        historial,
      );

      const numeroCaso =
        await inicioServicio.iniciar({
          procesoId:
            '0188d3ec-f208-4653-be77-788fc76e370c',
          escenario:
            'CRD-02 - Camino alterno',
          parametros: [],
        });

      const casos = await historial.listar();

      expect(numeroCaso).toBe('555700');
      expect(casos).toEqual([
        {
          numeroCaso: '555700',
          fechaHora:
            '2026-08-06T15:30:00.000Z',
          escenario:
            'CRD-02 - Camino alterno',
          modoCreacion: 'servicio',
          estadoDepuracion:
            'Pendiente de depurar',
        },
      ]);
    } finally {
      await eliminarDirectorio(directorio);
    }
  });
});