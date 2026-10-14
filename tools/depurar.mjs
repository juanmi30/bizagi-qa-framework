import {
  access,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';

import {
  randomUUID,
} from 'node:crypto';

import {
  resolve,
} from 'node:path';


const ESTADO_PENDIENTE = 'Pendiente de depurar';
const ESTADO_DEPURADO = 'Depurado';


/**
 * Durante las pruebas se puede sustituir la raíz mediante
 * DEPURAR_BASE_DIR. En uso normal se trabaja desde la raíz
 * actual del framework.
 */
const raiz = resolve(
  process.env.DEPURAR_BASE_DIR ?? process.cwd(),
);


/**
 * Escapa caracteres que podrían romper una tabla Markdown.
 */
function escaparMarkdown(valor) {
  return String(valor ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}


/**
 * Devuelve las rutas utilizadas por la herramienta.
 */
function obtenerRutas(proyecto) {
  return {
    proyecto: resolve(
      raiz,
      'projects',
      proyecto,
    ),

    resultados: resolve(
      raiz,
      'test-results',
      proyecto,
    ),

    historico: resolve(
      raiz,
      'test-results',
      proyecto,
      'historico-casos.json',
    ),

    reporte: resolve(
      raiz,
      'test-results',
      proyecto,
      'casos-creados.md',
    ),
  };
}


/**
 * Comprueba que el proyecto exista dentro de projects/.
 */
async function validarProyecto(
  proyecto,
  rutas,
) {
  if (!proyecto) {
    throw new Error(
      'Debes indicar el proyecto. Ejemplo: ' +
      'node tools/depurar.mjs colsubsidio',
    );
  }

  try {
    await access(rutas.proyecto);
  } catch {
    throw new Error(
      `El proyecto "${proyecto}" no existe dentro de projects/.`,
    );
  }
}


/**
 * Lee y valida el histórico.
 */
async function leerHistorico(
  proyecto,
  rutas,
) {
  let contenido;

  try {
    contenido = await readFile(
      rutas.historico,
      'utf8',
    );
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `No existe un histórico de casos para el proyecto "${proyecto}". ` +
        `Se esperaba encontrar test-results/${proyecto}/historico-casos.json.`,
      );
    }

    throw new Error(
      `No fue posible leer el histórico del proyecto "${proyecto}".`,
    );
  }

  let casos;

  try {
    casos = JSON.parse(contenido);
  } catch {
    throw new Error(
      `El histórico del proyecto "${proyecto}" no contiene un JSON válido.`,
    );
  }

  if (!Array.isArray(casos)) {
    throw new Error(
      `El histórico del proyecto "${proyecto}" no tiene el formato esperado.`,
    );
  }

  if (casos.length === 0) {
    throw new Error(
      `El histórico de casos del proyecto "${proyecto}" está vacío. ` +
      'No hay casos creados para reportar.',
    );
  }

  /*
   * Compatibilidad:
   * si un registro antiguo no tuviera estado, se considera pendiente.
   */
  return casos.map((caso) => ({
    ...caso,

    estadoDepuracion:
      caso.estadoDepuracion ??
      ESTADO_PENDIENTE,
  }));
}


/**
 * Genera el Markdown solicitado por T1.
 */
function construirReporte(
  proyecto,
  casos,
) {
  const lineas = [
    `# Casos creados — ${proyecto}`,
    '',
    'Reporte de casos creados por la automatización.',
    '',
    '> Este reporte no elimina ni cierra casos en Bizagi. ' +
      'La depuración física debe realizarla un analista.',
    '',
    '| Número de caso | Fecha-hora | Escenario | Modo | Estado |',
    '|---|---|---|---|---|',
  ];

  for (const caso of casos) {
    lineas.push(
      `| ${escaparMarkdown(caso.numeroCaso)} ` +
      `| ${escaparMarkdown(caso.fechaHora)} ` +
      `| ${escaparMarkdown(caso.escenario)} ` +
      `| ${escaparMarkdown(caso.modoCreacion ?? 'servicio')} ` +
      `| ${escaparMarkdown(caso.estadoDepuracion)} |`,
    );
  }

  lineas.push(
    '',
    `Total de casos: ${casos.length}`,
    '',
    `Pendientes de depurar: ${
      casos.filter(
        (caso) =>
          caso.estadoDepuracion ===
          ESTADO_PENDIENTE,
      ).length
    }`,
    '',
    `Depurados: ${
      casos.filter(
        (caso) =>
          caso.estadoDepuracion ===
          ESTADO_DEPURADO,
      ).length
    }`,
    '',
  );

  return lineas.join('\n');
}


/**
 * Escritura atómica del histórico (mismo mecanismo que HistorialCasos):
 * temporal en el mismo directorio + rename, para no truncarlo nunca.
 */
async function guardarHistorico(
  ruta,
  casos,
) {
  const temporal =
    `${ruta}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(
      temporal,
      JSON.stringify(
        casos,
        null,
        2,
      ) + '\n',
      'utf8',
    );

    await rename(
      temporal,
      ruta,
    );
  } catch (error) {
    await unlink(temporal).catch(() => {});
    throw error;
  }
}


/**
 * Marca como depurados los números solicitados.
 *
 * Primero valida que TODOS existan para evitar actualizaciones
 * parciales cuando uno de los números fue escrito incorrectamente.
 */
function marcarCasos(
  casos,
  numeros,
) {
  const solicitados = [
    ...new Set(
      numeros
        .map((numero) => numero.trim())
        .filter(Boolean),
    ),
  ];

  if (solicitados.length === 0) {
    throw new Error(
      'La opción --marcar requiere al menos un número de caso. ' +
      'Ejemplo: --marcar 294922,294924',
    );
  }

  const existentes = new Set(
    casos.map(
      (caso) =>
        String(caso.numeroCaso),
    ),
  );

  const noEncontrados =
    solicitados.filter(
      (numero) =>
        !existentes.has(numero),
    );

  if (noEncontrados.length > 0) {
    throw new Error(
      `No se encontraron los siguientes números de caso en el histórico: ` +
      `${noEncontrados.join(', ')}.`,
    );
  }

  return casos.map((caso) => {
    if (
      solicitados.includes(
        String(caso.numeroCaso),
      )
    ) {
      return {
        ...caso,
        estadoDepuracion:
          ESTADO_DEPURADO,
      };
    }

    return caso;
  });
}


/**
 * Interpreta:
 *
 * node tools/depurar.mjs <proyecto>
 *
 * node tools/depurar.mjs <proyecto>
 *   --marcar 294922,294924
 */
function leerArgumentos() {
  const args = process.argv.slice(2);

  const proyecto = args[0] ?? '';

  const indiceMarcar =
    args.indexOf('--marcar');

  let marcar = [];
  let debeMarcar = false;

  /*
   * Forma normal:
   *
   * node tools/depurar.mjs colsubsidio --marcar 294922,294924
   */
  if (indiceMarcar >= 0) {
    const valor =
      args[indiceMarcar + 1] ?? '';

    marcar = valor.split(',');
    debeMarcar = true;
  }

  /*
   * Compatibilidad con algunas ejecuciones mediante npm en las
   * que el flag --marcar puede ser consumido y Node recibe:
   *
   * node tools/depurar.mjs colsubsidio 294922,294924
   *
   * Solo se interpreta el segundo argumento como números para
   * marcar. Ejecutar únicamente:
   *
   * node tools/depurar.mjs colsubsidio
   *
   * continúa generando el reporte sin modificar el histórico.
   */
  if (
    indiceMarcar < 0 &&
    args.length >= 2 &&
    !args[1].startsWith('--')
  ) {
    marcar = args[1].split(',');
    debeMarcar = true;
  }

  return {
    proyecto,
    marcar,
    debeMarcar,
  };
}


async function ejecutar() {
  const {
    proyecto,
    marcar,
    debeMarcar,
  } = leerArgumentos();

  const rutas =
    obtenerRutas(proyecto);

  await validarProyecto(
    proyecto,
    rutas,
  );

  let casos =
    await leerHistorico(
      proyecto,
      rutas,
    );

  if (debeMarcar) {
    casos = marcarCasos(
      casos,
      marcar,
    );

    await guardarHistorico(
      rutas.historico,
      casos,
    );

    console.log(
      `✓ Se marcaron como depurados: ${
        marcar
          .map((numero) => numero.trim())
          .filter(Boolean)
          .join(', ')
      }`,
    );
  }

  const reporte =
    construirReporte(
      proyecto,
      casos,
    );

  await mkdir(
    rutas.resultados,
    {
      recursive: true,
    },
  );

  await writeFile(
    rutas.reporte,
    reporte,
    'utf8',
  );

  const pendientes =
    casos.filter(
      (caso) =>
        caso.estadoDepuracion ===
        ESTADO_PENDIENTE,
    ).length;

  const depurados =
    casos.filter(
      (caso) =>
        caso.estadoDepuracion ===
        ESTADO_DEPURADO,
    ).length;

  console.log(
    `✓ Reporte generado: test-results/${proyecto}/casos-creados.md`,
  );

  console.log(
    `  Casos totales: ${casos.length}`,
  );

  console.log(
    `  Pendientes: ${pendientes}`,
  );

  console.log(
    `  Depurados: ${depurados}`,
  );
}


ejecutar().catch((error) => {
  const mensaje =
    error instanceof Error
      ? error.message
      : String(error);

  console.error(
    `Error: ${mensaje}`,
  );

  process.exitCode = 1;
});