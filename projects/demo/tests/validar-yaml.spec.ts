import { test, expect } from '@playwright/test';

import {
  cp,
  mkdir,
  mkdtemp,
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


const rutaValidador = resolve(
  process.cwd(),
  'tools',
  'validar.mjs',
);

const rutaFixtures = resolve(
  process.cwd(),
  'projects',
  'demo',
  'tests',
  'fixtures',
  'validar',
);


async function crearEntornoTemporal(): Promise<string> {
  const raiz = await mkdtemp(
    join(
      tmpdir(),
      'bizagi-validar-',
    ),
  );

  const proyecto = join(
    raiz,
    'projects',
    'proyecto-prueba',
  );

  await mkdir(
    join(
      proyecto,
      'scenarios',
    ),
    {
      recursive: true,
    },
  );

  await mkdir(
    join(
      proyecto,
      'resources',
      'documentos',
    ),
    {
      recursive: true,
    },
  );

  /*
   * Usuario válido para los escenarios correctos.
   *
   * Se utiliza modo lista para que no haga falta CLAVE_analista1.
   */
  await writeFile(
    join(
      proyecto,
      '.env.example',
    ),
    [
      'BIZAGI_LOGIN_MODO=lista',
      'USUARIO_analista1=usuario.real.prueba',
      '',
    ].join('\n'),
    'utf8',
  );

  return raiz;
}


async function copiarFixture(
  raiz: string,
  nombre: string,
): Promise<void> {
  await cp(
    join(
      rutaFixtures,
      nombre,
    ),
    join(
      raiz,
      'projects',
      'proyecto-prueba',
      'scenarios',
      nombre,
    ),
  );
}


async function ejecutarValidador(
  raiz: string,
  argumentos: string[],
): Promise<ResultadoComando> {
  return new Promise(
    (
      resolver,
      rechazar,
    ) => {
      const proceso = spawn(
        process.execPath,
        [
          rutaValidador,
          ...argumentos,
        ],
        {
          cwd: process.cwd(),

          env: {
            ...process.env,
            VALIDAR_BASE_DIR: raiz,
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


test.describe(
  'Validador YAML @t3-validar',
  () => {

    test(
      'acepta un escenario válido',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await copiarFixture(
            raiz,
            'valido.yaml',
          );

          const resultado =
            await ejecutarValidador(
              raiz,
              [
                'proyecto-prueba',
                'valido.yaml',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(0);

          expect(
            resultado.stdout,
          ).toContain(
            '✔ valido.yaml',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Problemas encontrados: 0',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'El escenario es válido',
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
      'detecta errores estructurales',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await copiarFixture(
            raiz,
            'invalido-estructura.yaml',
          );

          const resultado =
            await ejecutarValidador(
              raiz,
              [
                'proyecto-prueba',
                'invalido-estructura.yaml',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(1);

          expect(
            resultado.stdout,
          ).toContain(
            'inicio.proceso_a_crear',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'pasos',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'hazards',
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
      'sugiere el tipo más parecido cuando existe un typo',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await copiarFixture(
            raiz,
            'invalido-tipo.yaml',
          );

          const resultado =
            await ejecutarValidador(
              raiz,
              [
                'proyecto-prueba',
                'invalido-tipo.yaml',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(1);

          expect(
            resultado.stdout,
          ).toContain(
            'tipo "busquda" no existe',
          );

          expect(
            resultado.stdout,
          ).toContain(
            '¿Quisiste decir "búsqueda"?',
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
      'detecta un usuario no declarado en el env',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await copiarFixture(
            raiz,
            'invalido-usuario.yaml',
          );

          const resultado =
            await ejecutarValidador(
              raiz,
              [
                'proyecto-prueba',
                'invalido-usuario.yaml',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(1);

          expect(
            resultado.stdout,
          ).toContain(
            'usuario_fantasma',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'USUARIO_usuario_fantasma',
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
      'detecta un archivo inexistente dentro de resources',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await copiarFixture(
            raiz,
            'invalido-recurso.yaml',
          );

          const resultado =
            await ejecutarValidador(
              raiz,
              [
                'proyecto-prueba',
                'invalido-recurso.yaml',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(1);

          expect(
            resultado.stdout,
          ).toContain(
            'resources/documentos/archivo-que-no-existe.pdf',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Advertencias: 1',
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
      'muestra múltiples errores del mismo YAML sin detenerse en el primero',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await copiarFixture(
            raiz,
            'invalido-multiples.yaml',
          );

          const resultado =
            await ejecutarValidador(
              raiz,
              [
                'proyecto-prueba',
                'invalido-multiples.yaml',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(1);

          expect(
            resultado.stdout,
          ).toContain(
            'falta "proceso"',
          );

          expect(
            resultado.stdout,
          ).toContain(
            '"inicio.modo"',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'otro_fantasma',
          );

          expect(
            resultado.stdout,
          ).toContain(
            '¿Quisiste decir "texto"?',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'faltante.pdf',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'maximo_minutos',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'hazard_inventado',
          );

          const coincidencia =
            resultado.stdout.match(
              /Problemas encontrados: (\d+)/,
            );

          expect(
            coincidencia,
          ).not.toBeNull();

          expect(
            Number(
              coincidencia?.[1],
            ),
          ).toBeGreaterThanOrEqual(5);
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
      'valida todos los escenarios del proyecto y acumula resultados',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await copiarFixture(
            raiz,
            'valido.yaml',
          );

          await copiarFixture(
            raiz,
            'invalido-tipo.yaml',
          );

          await copiarFixture(
            raiz,
            'invalido-usuario.yaml',
          );

          const resultado =
            await ejecutarValidador(
              raiz,
              [
                'proyecto-prueba',
                '--todos',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(1);

          expect(
            resultado.stdout,
          ).toContain(
            'Escenarios revisados: 3',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Válidos: 1',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Con errores: 2',
          );

          /*
           * Aunque uno falle, debe haber validado también los demás.
           */
          expect(
            resultado.stdout,
          ).toContain(
            '✔ valido.yaml',
          );

          expect(
            resultado.stdout,
          ).toContain(
            '✘ invalido-tipo.yaml',
          );

          expect(
            resultado.stdout,
          ).toContain(
            '✘ invalido-usuario.yaml',
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
      'sin segundo argumento también valida todos los escenarios',
      async () => {
        const raiz =
          await crearEntornoTemporal();

        try {
          await copiarFixture(
            raiz,
            'valido.yaml',
          );

          const resultado =
            await ejecutarValidador(
              raiz,
              [
                'proyecto-prueba',
              ],
            );

          expect(
            resultado.codigo,
          ).toBe(0);

          expect(
            resultado.stdout,
          ).toContain(
            'Escenarios revisados: 1',
          );

          expect(
            resultado.stdout,
          ).toContain(
            'Todos los escenarios son válidos',
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