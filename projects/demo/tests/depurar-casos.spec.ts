import { test, expect } from '@playwright/test';

import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';

import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import {
  join,
  resolve,
} from 'node:path';


interface ResultadoComando {
  codigo: number | null;
  stdout: string;
  stderr: string;
}


interface CasoHistoricoPrueba {
  numeroCaso: string;
  fechaHora: string;
  escenario: string;
  modoCreacion: 'servicio';
  estadoDepuracion: 'Pendiente de depurar' | 'Depurado';
}


const rutaDepurar = resolve(
  process.cwd(),
  'tools',
  'depurar.mjs',
);


function casosIniciales(): CasoHistoricoPrueba[] {
  return [
    {
      numeroCaso: '111111',
      fechaHora: '2026-08-19T15:00:00.000Z',
      escenario: 'Escenario de prueba 1',
      modoCreacion: 'servicio',
      estadoDepuracion: 'Pendiente de depurar',
    },
    {
      numeroCaso: '222222',
      fechaHora: '2026-08-19T15:05:00.000Z',
      escenario: 'Escenario de prueba 2',
      modoCreacion: 'servicio',
      estadoDepuracion: 'Pendiente de depurar',
    },
  ];
}


async function crearDirectorioTemporal(): Promise<string> {
  return mkdtemp(
    join(
      tmpdir(),
      'bizagi-depurar-',
    ),
  );
}


async function prepararProyecto(
  directorioBase: string,
  proyecto = 'proyecto-prueba',
  crearHistorico = true,
): Promise<void> {
  await mkdir(
    join(
      directorioBase,
      'projects',
      proyecto,
    ),
    {
      recursive: true,
    },
  );

  if (!crearHistorico) {
    return;
  }

  const directorioResultados = join(
    directorioBase,
    'test-results',
    proyecto,
  );

  await mkdir(
    directorioResultados,
    {
      recursive: true,
    },
  );

  await writeFile(
    join(
      directorioResultados,
      'historico-casos.json',
    ),
    JSON.stringify(
      casosIniciales(),
      null,
      2,
    ) + '\n',
    'utf8',
  );
}


async function ejecutarDepurar(
  directorioBase: string,
  argumentos: string[],
): Promise<ResultadoComando> {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(
      process.execPath,
      [
        rutaDepurar,
        ...argumentos,
      ],
      {
        cwd: process.cwd(),

        env: {
          ...process.env,
          DEPURAR_BASE_DIR:
            directorioBase,
        },
      },
    );

    let stdout = '';
    let stderr = '';

    proceso.stdout.on(
      'data',
      (datos: Buffer) => {
        stdout += datos.toString();
      },
    );

    proceso.stderr.on(
      'data',
      (datos: Buffer) => {
        stderr += datos.toString();
      },
    );

    proceso.on(
      'error',
      rechazar,
    );

    proceso.on(
      'close',
      (codigo) => {
        resolver({
          codigo,
          stdout,
          stderr,
        });
      },
    );
  });
}


async function leerHistorico(
  directorioBase: string,
  proyecto = 'proyecto-prueba',
): Promise<CasoHistoricoPrueba[]> {
  const contenido = await readFile(
    join(
      directorioBase,
      'test-results',
      proyecto,
      'historico-casos.json',
    ),
    'utf8',
  );

  return JSON.parse(
    contenido,
  ) as CasoHistoricoPrueba[];
}


test.describe(
  'Comando depurar @t1-depurar',
  () => {
    test(
      'genera casos-creados.md sin modificar el histórico',
      async () => {
        const directorio =
          await crearDirectorioTemporal();

        try {
          await prepararProyecto(
            directorio,
          );

          const historicoAntes =
            await leerHistorico(
              directorio,
            );

          const resultado =
            await ejecutarDepurar(
              directorio,
              [
                'proyecto-prueba',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(0);

          expect(
            resultado.stderr,
          ).toBe('');

          expect(
            resultado.stdout,
          ).toContain(
            'Reporte generado',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Casos totales: 2',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Pendientes: 2',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Depurados: 0',
          );

          const reporte =
            await readFile(
              join(
                directorio,
                'test-results',
                'proyecto-prueba',
                'casos-creados.md',
              ),
              'utf8',
            );

          expect(reporte).toContain(
            '| Número de caso | Fecha-hora | Escenario | Modo | Estado |',
          );

          expect(reporte).toContain(
            '111111',
          );

          expect(reporte).toContain(
            '222222',
          );

          expect(reporte).toContain(
            'Escenario de prueba 1',
          );

          expect(reporte).toContain(
            'Pendiente de depurar',
          );

          const historicoDespues =
            await leerHistorico(
              directorio,
            );

          expect(
            historicoDespues,
          ).toEqual(
            historicoAntes,
          );
        } finally {
          await rm(
            directorio,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );


    test(
      'marca varios casos como depurados',
      async () => {
        const directorio =
          await crearDirectorioTemporal();

        try {
          await prepararProyecto(
            directorio,
          );

          const resultado =
            await ejecutarDepurar(
              directorio,
              [
                'proyecto-prueba',
                '--marcar',
                '111111,222222',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(0);

          expect(
            resultado.stdout,
          ).toContain(
            'Se marcaron como depurados: 111111, 222222',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Pendientes: 0',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Depurados: 2',
          );

          const historico =
            await leerHistorico(
              directorio,
            );

          expect(
            historico[0]
              .estadoDepuracion,
          ).toBe(
            'Depurado',
          );

          expect(
            historico[1]
              .estadoDepuracion,
          ).toBe(
            'Depurado',
          );

          const reporte =
            await readFile(
              join(
                directorio,
                'test-results',
                'proyecto-prueba',
                'casos-creados.md',
              ),
              'utf8',
            );

          expect(
            reporte.match(
              /\| Depurado \|/g,
            ),
          ).toHaveLength(2);
        } finally {
          await rm(
            directorio,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );


    test(
      'tolera la forma en que npm puede reenviar el número sin --marcar',
      async () => {
        const directorio =
          await crearDirectorioTemporal();

        try {
          await prepararProyecto(
            directorio,
          );

          /*
           * Simula lo observado al ejecutar:
           *
           * npm run depurar -- proyecto-prueba --marcar 111111
           *
           * cuando npm termina invocando:
           *
           * node tools/depurar.mjs proyecto-prueba 111111
           */
          const resultado =
            await ejecutarDepurar(
              directorio,
              [
                'proyecto-prueba',
                '111111',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(0);

          const historico =
            await leerHistorico(
              directorio,
            );

          expect(
            historico[0]
              .estadoDepuracion,
          ).toBe(
            'Depurado',
          );

          expect(
            historico[1]
              .estadoDepuracion,
          ).toBe(
            'Pendiente de depurar',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Pendientes: 1',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Depurados: 1',
          );
        } finally {
          await rm(
            directorio,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );


    test(
      'informa cuando el proyecto no existe',
      async () => {
        const directorio =
          await crearDirectorioTemporal();

        try {
          await mkdir(
            join(
              directorio,
              'projects',
            ),
            {
              recursive: true,
            },
          );

          const resultado =
            await ejecutarDepurar(
              directorio,
              [
                'proyecto-inexistente',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(1);

          expect(
            resultado.stderr,
          ).toContain(
            'no existe dentro de projects/',
          );
        } finally {
          await rm(
            directorio,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );


    test(
      'informa cuando el proyecto no tiene histórico',
      async () => {
        const directorio =
          await crearDirectorioTemporal();

        try {
          await prepararProyecto(
            directorio,
            'proyecto-prueba',
            false,
          );

          const resultado =
            await ejecutarDepurar(
              directorio,
              [
                'proyecto-prueba',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(1);

          expect(
            resultado.stderr,
          ).toContain(
            'No existe un histórico de casos',
          );
        } finally {
          await rm(
            directorio,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );


    test(
      'no modifica el histórico cuando se intenta marcar un caso inexistente',
      async () => {
        const directorio =
          await crearDirectorioTemporal();

        try {
          await prepararProyecto(
            directorio,
          );

          const historicoAntes =
            await leerHistorico(
              directorio,
            );

          const resultado =
            await ejecutarDepurar(
              directorio,
              [
                'proyecto-prueba',
                '--marcar',
                '999999',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(1);

          expect(
            resultado.stderr,
          ).toContain(
            'No se encontraron los siguientes números de caso',
          );

          expect(
            resultado.stderr,
          ).toContain(
            '999999',
          );

          const historicoDespues =
            await leerHistorico(
              directorio,
            );

          expect(
            historicoDespues,
          ).toEqual(
            historicoAntes,
          );
        } finally {
          await rm(
            directorio,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );
  },
);