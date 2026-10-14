import { test, expect } from '@playwright/test';

import {
  mkdir,
  mkdtemp,
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


const rutaResumen = resolve(
  process.cwd(),
  'tools',
  'resumen.mjs',
);


const JUNIT_BASE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="4" failures="1" skipped="1" errors="0" time="65.4">
  <testsuite
    name="tests\\\\escenarios.spec.ts"
    timestamp="2026-08-20T15:00:00.000Z"
    hostname="chromium"
    tests="4"
    failures="1"
    skipped="1"
    time="65.4"
    errors="0">

    <testcase
      name="Escenario verde"
      classname="tests\\\\escenarios.spec.ts"
      time="10">
    </testcase>

    <testcase
      name="Escenario rojo"
      classname="tests\\\\escenarios.spec.ts"
      time="20">
      <failure
        message="La actividad esperada no apareció"
        type="Error">
      </failure>
    </testcase>

    <testcase
      name="Escenario omitido"
      classname="tests\\\\escenarios.spec.ts"
      time="0">
      <skipped>
      </skipped>
    </testcase>

    <testcase
      name="Escenario con paso manual"
      classname="tests\\\\escenarios.spec.ts"
      time="35.4">
      <system-out>
        <![CDATA[
[MANUAL] OTP — usuario: analista1 — fecha: 2026-08-20T15:00:30.000Z
        ]]>
      </system-out>
    </testcase>

  </testsuite>
</testsuites>
`;


async function crearEntornoTemporal(): Promise<string> {
  const raiz = await mkdtemp(
    join(
      tmpdir(),
      'bizagi-resumen-',
    ),
  );

  await mkdir(
    join(
      raiz,
      'projects',
      'proyecto-prueba',
    ),
    {
      recursive: true,
    },
  );

  return raiz;
}


async function escribirJUnit(
  raiz: string,
  contenido = JUNIT_BASE,
): Promise<void> {
  const directorio = join(
    raiz,
    'test-results',
    'proyecto-prueba',
    'junit',
  );

  await mkdir(
    directorio,
    {
      recursive: true,
    },
  );

  await writeFile(
    join(
      directorio,
      'results.xml',
    ),
    contenido,
    'utf8',
  );
}


async function escribirHistorico(
  raiz: string,
  casos: unknown[],
): Promise<void> {
  const directorio = join(
    raiz,
    'test-results',
    'proyecto-prueba',
  );

  await mkdir(
    directorio,
    {
      recursive: true,
    },
  );

  await writeFile(
    join(
      directorio,
      'historico-casos.json',
    ),
    JSON.stringify(
      casos,
      null,
      2,
    ) + '\n',
    'utf8',
  );
}


async function ejecutarResumen(
  raiz: string,
  proyecto = 'proyecto-prueba',
): Promise<ResultadoComando> {
  return new Promise(
    (
      resolver,
      rechazar,
    ) => {
      const proceso = spawn(
        process.execPath,
        [
          rutaResumen,
          proyecto,
        ],
        {
          cwd: process.cwd(),

          env: {
            ...process.env,
            RESUMEN_BASE_DIR: raiz,
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
    },
  );
}


async function leerReporte(
  raiz: string,
): Promise<string> {
  return readFile(
    join(
      raiz,
      'test-results',
      'proyecto-prueba',
      'resumen-ejecutivo.md',
    ),
    'utf8',
  );
}


test.describe(
  'Resumen ejecutivo @t4-resumen',
  () => {

    test(
      'genera un reporte con los cinco bloques requeridos',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await escribirJUnit(
            raiz,
          );

          const resultado =
            await ejecutarResumen(
              raiz,
            );

          expect(
            resultado.codigo,
          ).toBe(0);

          const reporte =
            await leerReporte(
              raiz,
            );

          expect(
            reporte,
          ).toContain(
            '## 1. Escenarios ejecutados',
          );

          expect(
            reporte,
          ).toContain(
            '## 2. Resultado de la corrida',
          );

          expect(
            reporte,
          ).toContain(
            '## 3. Duración',
          );

          expect(
            reporte,
          ).toContain(
            '## 4. Pasos [MANUAL]',
          );

          expect(
            reporte,
          ).toContain(
            '## 5. Casos creados en la corrida',
          );
        } finally {
          await rm(
            raiz,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );


    test(
      'cuenta verdes, rojos y omitidos correctamente',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await escribirJUnit(
            raiz,
          );

          const resultado =
            await ejecutarResumen(
              raiz,
            );

          expect(
            resultado.codigo,
          ).toBe(0);

          expect(
            resultado.stdout,
          ).toContain(
            'Escenarios: 4',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Verdes: 2',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Rojos: 1',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Omitidos: 1',
          );

          const reporte =
            await leerReporte(
              raiz,
            );

          expect(
            reporte,
          ).toContain(
            'La actividad esperada no apareció',
          );
        } finally {
          await rm(
            raiz,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );


    test(
      'formatea la duración total de la corrida',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await escribirJUnit(
            raiz,
          );

          await ejecutarResumen(
            raiz,
          );

          const reporte =
            await leerReporte(
              raiz,
            );

          /*
           * 65.4 segundos =>
           * 1 min 5 s
           */
          expect(
            reporte,
          ).toContain(
            'Duración total:** 1 min 5 s',
          );
        } finally {
          await rm(
            raiz,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );


    test(
      'incluye los pasos manuales encontrados en el JUnit',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await escribirJUnit(
            raiz,
          );

          const resultado =
            await ejecutarResumen(
              raiz,
            );

          expect(
            resultado.codigo,
          ).toBe(0);

          expect(
            resultado.stdout,
          ).toContain(
            'Pasos [MANUAL]: 1',
          );

          const reporte =
            await leerReporte(
              raiz,
            );

          expect(
            reporte,
          ).toContain(
            '[MANUAL] OTP',
          );

          expect(
            reporte,
          ).toContain(
            'analista1',
          );

          expect(
            reporte,
          ).toContain(
            '2026-08-20T15:00:30.000Z',
          );
        } finally {
          await rm(
            raiz,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );


    test(
      'incluye únicamente los casos creados durante la corrida',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await escribirJUnit(
            raiz,
          );

          await escribirHistorico(
            raiz,
            [
              {
                numeroCaso:
                  '100001',
                fechaHora:
                  '2026-08-20T14:59:59.000Z',
                escenario:
                  'Caso anterior',
                modoCreacion:
                  'servicio',
                estadoDepuracion:
                  'Pendiente de depurar',
              },
              {
                numeroCaso:
                  '100002',
                fechaHora:
                  '2026-08-20T15:00:20.000Z',
                escenario:
                  'Caso dentro de corrida',
                modoCreacion:
                  'servicio',
                estadoDepuracion:
                  'Pendiente de depurar',
              },
              {
                numeroCaso:
                  '100003',
                fechaHora:
                  '2026-08-20T15:01:00.000Z',
                escenario:
                  'Segundo caso dentro',
                modoCreacion:
                  'servicio',
                estadoDepuracion:
                  'Pendiente de depurar',
              },
              {
                numeroCaso:
                  '100004',
                fechaHora:
                  '2026-08-20T15:02:00.000Z',
                escenario:
                  'Caso posterior',
                modoCreacion:
                  'servicio',
                estadoDepuracion:
                  'Pendiente de depurar',
              },
            ],
          );

          const resultado =
            await ejecutarResumen(
              raiz,
            );

          expect(
            resultado.codigo,
          ).toBe(0);

          expect(
            resultado.stdout,
          ).toContain(
            'Casos creados en la corrida: 2',
          );

          const reporte =
            await leerReporte(
              raiz,
            );

          expect(
            reporte,
          ).toContain(
            '100002',
          );

          expect(
            reporte,
          ).toContain(
            '100003',
          );

          expect(
            reporte,
          ).not.toContain(
            '100001',
          );

          expect(
            reporte,
          ).not.toContain(
            '100004',
          );
        } finally {
          await rm(
            raiz,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );


    test(
      'genera el reporte aunque no exista histórico de casos',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await escribirJUnit(
            raiz,
          );

          const resultado =
            await ejecutarResumen(
              raiz,
            );

          expect(
            resultado.codigo,
          ).toBe(0);

          const reporte =
            await leerReporte(
              raiz,
            );

          expect(
            reporte,
          ).toContain(
            'No existe un histórico de casos',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Casos creados en la corrida: 0',
          );
        } finally {
          await rm(
            raiz,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );


    test(
      'informa claramente cuando no existen resultados JUnit',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          const resultado =
            await ejecutarResumen(
              raiz,
            );

          expect(
            resultado.codigo,
          ).toBe(1);

          expect(
            resultado.stderr,
          ).toContain(
            'No hay resultados de pruebas',
          );

          expect(
            resultado.stderr,
          ).toContain(
            'npm test -- proyecto-prueba',
          );
        } finally {
          await rm(
            raiz,
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