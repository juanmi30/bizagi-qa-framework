#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';

import {
  relative,
  resolve,
} from 'node:path';


const raiz = resolve(
  process.env.RESUMEN_BASE_DIR ??
  process.cwd(),
);


/* ==========================================================================
 * Utilidades
 * ========================================================================== */

function decodificarXml(valor = '') {
  return String(valor)
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}


function atributosXml(texto = '') {
  const atributos = {};

  const regex =
    /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g;

  let coincidencia;

  while (
    (
      coincidencia =
        regex.exec(texto)
    ) !== null
  ) {
    atributos[
      coincidencia[1]
    ] = decodificarXml(
      coincidencia[2],
    );
  }

  return atributos;
}


function numeroSeguro(
  valor,
  fallback = 0,
) {
  const numero = Number(valor);

  return Number.isFinite(numero)
    ? numero
    : fallback;
}


function escaparMarkdown(
  valor,
) {
  return String(valor ?? '')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}


function formatearDuracion(
  segundosOriginales,
) {
  const segundos =
    Math.max(
      0,
      Number(
        segundosOriginales,
      ) || 0,
    );

  if (segundos < 1) {
    return `${Math.round(
      segundos * 1000,
    )} ms`;
  }

  if (segundos < 60) {
    const redondeado =
      Math.round(
        segundos * 10,
      ) / 10;

    return `${redondeado} s`;
  }

  const minutos =
    Math.floor(
      segundos / 60,
    );

  const resto =
    Math.round(
      segundos -
      minutos * 60,
    );

  if (resto === 0) {
    return `${minutos} min`;
  }

  return `${minutos} min ${resto} s`;
}


function formatearFecha(
  valor,
) {
  if (!valor) {
    return '';
  }

  const fecha =
    new Date(valor);

  if (
    Number.isNaN(
      fecha.getTime(),
    )
  ) {
    return String(valor);
  }

  return fecha.toISOString();
}


/* ==========================================================================
 * Lectura del JUnit
 * ========================================================================== */

function leerJUnit(
  rutaJUnit,
) {
  const xml =
    readFileSync(
      rutaJUnit,
      'utf8',
    );

  const raizMatch =
    xml.match(
      /<testsuites\b([^>]*)>/,
    );

  if (!raizMatch) {
    throw new Error(
      'El archivo JUnit no contiene un bloque <testsuites> válido.',
    );
  }

  const atributosRaiz =
    atributosXml(
      raizMatch[1],
    );


  /* ----------------------------------------------------------------------
   * Test cases
   * ---------------------------------------------------------------------- */

  const casos = [];

  const regexTestcase =
    /<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g;

  let matchCaso;

  while (
    (
      matchCaso =
        regexTestcase.exec(xml)
    ) !== null
  ) {
    const attrs =
      atributosXml(
        matchCaso[1],
      );

    const cuerpo =
      matchCaso[2];

    let estado =
      'verde';

    if (
      /<(?:failure|error)\b/i.test(
        cuerpo,
      )
    ) {
      estado = 'rojo';
    } else if (
      /<skipped\b/i.test(
        cuerpo,
      )
    ) {
      estado = 'omitido';
    }

    const errorMatch =
      cuerpo.match(
        /<(?:failure|error)\b([^>]*)>/i,
      );

    const errorAttrs =
      errorMatch
        ? atributosXml(
            errorMatch[1],
          )
        : {};

    casos.push({
      nombre:
        attrs.name ??
        '(sin nombre)',
      clase:
        attrs.classname ??
        '',
      duracion:
        numeroSeguro(
          attrs.time,
        ),
      estado,
      mensajeError:
        errorAttrs.message ??
        '',
    });
  }


  /*
   * Playwright escribe la duración global en <testsuites time="...">.
   * Si no estuviera disponible, usamos la suma de los testcase.
   */
  const duracionTotal =
    numeroSeguro(
      atributosRaiz.time,
      casos.reduce(
        (
          total,
          caso,
        ) =>
          total +
          caso.duracion,
        0,
      ),
    );


  /* ----------------------------------------------------------------------
   * Inicio de corrida
   *
   * En el JUnit real de Playwright, los <testsuite> incluyen timestamp.
   * Tomamos el más antiguo como inicio.
   * ---------------------------------------------------------------------- */

  const timestamps = [];

  const regexSuite =
    /<testsuite\b([^>]*)>/g;

  let matchSuite;

  while (
    (
      matchSuite =
        regexSuite.exec(xml)
    ) !== null
  ) {
    const attrs =
      atributosXml(
        matchSuite[1],
      );

    if (!attrs.timestamp) {
      continue;
    }

    const fecha =
      new Date(
        attrs.timestamp,
      );

    if (
      !Number.isNaN(
        fecha.getTime(),
      )
    ) {
      timestamps.push(
        fecha,
      );
    }
  }

  timestamps.sort(
    (a, b) =>
      a.getTime() -
      b.getTime(),
  );

  const inicioCorrida =
    timestamps[0];

  const finCorrida =
    inicioCorrida
      ? new Date(
          inicioCorrida.getTime() +
          duracionTotal * 1000,
        )
      : undefined;


  /* ----------------------------------------------------------------------
   * Pasos [MANUAL]
   *
   * Se conservan de forma flexible para soportar futuras evidencias del motor:
   *
   * [MANUAL] OTP — usuario: analista1 — fecha: ...
   *
   * Puede aparecer en system-out, propiedades u otro texto del JUnit.
   * ---------------------------------------------------------------------- */

  const manuales = [];

  const regexManual =
    /\[MANUAL\][^<"\r\n]*/gi;

  let matchManual;

  while (
    (
      matchManual =
        regexManual.exec(xml)
    ) !== null
  ) {
    const texto =
      decodificarXml(
        matchManual[0],
      ).trim();

    if (
      texto &&
      !manuales.includes(
        texto,
      )
    ) {
      manuales.push(
        texto,
      );
    }
  }


  const verdes =
    casos.filter(
      (caso) =>
        caso.estado ===
        'verde',
    );

  const rojos =
    casos.filter(
      (caso) =>
        caso.estado ===
        'rojo',
    );

  const omitidos =
    casos.filter(
      (caso) =>
        caso.estado ===
        'omitido',
    );


  return {
    casos,
    verdes,
    rojos,
    omitidos,
    duracionTotal,
    inicioCorrida,
    finCorrida,
    manuales,
  };
}


/* ==========================================================================
 * Histórico de casos
 * ========================================================================== */

function leerCasosDeCorrida(
  rutaHistorico,
  inicioCorrida,
  finCorrida,
) {
  if (
    !existsSync(
      rutaHistorico,
    )
  ) {
    return {
      casos: [],
      estado:
        'sin-historico',
    };
  }

  let historico;

  try {
    historico =
      JSON.parse(
        readFileSync(
          rutaHistorico,
          'utf8',
        ),
      );
  } catch {
    return {
      casos: [],
      estado:
        'historico-invalido',
    };
  }

  if (
    !Array.isArray(
      historico,
    )
  ) {
    return {
      casos: [],
      estado:
        'historico-invalido',
    };
  }


  /*
   * Sin timestamp de la corrida no podemos afirmar honestamente qué
   * casos pertenecen a ella.
   */
  if (
    !inicioCorrida ||
    !finCorrida
  ) {
    return {
      casos: [],
      estado:
        'sin-rango-temporal',
    };
  }


  const inicio =
    inicioCorrida.getTime();

  const fin =
    finCorrida.getTime();

  const casos =
    historico.filter(
      (caso) => {
        const fecha =
          new Date(
            caso?.fechaHora ??
            '',
          );

        if (
          Number.isNaN(
            fecha.getTime(),
          )
        ) {
          return false;
        }

        const tiempo =
          fecha.getTime();

        return (
          tiempo >= inicio &&
          tiempo <= fin
        );
      },
    );


  return {
    casos,
    estado: 'ok',
  };
}


/* ==========================================================================
 * Reporte Markdown
 * ========================================================================== */

function construirReporte(
  proyecto,
  junit,
  casosCorrida,
) {
  const lineas = [];

  lineas.push(
    `# Resumen ejecutivo — ${proyecto}`,
    '',
  );

  if (
    junit.inicioCorrida
  ) {
    lineas.push(
      `**Inicio de la corrida:** ${formatearFecha(junit.inicioCorrida)}`,
      '',
    );
  }


  /* ----------------------------------------------------------------------
   * BLOQUE 1
   * ---------------------------------------------------------------------- */

  lineas.push(
    '## 1. Escenarios ejecutados',
    '',
    `**Total:** ${junit.casos.length}`,
    '',
  );


  /* ----------------------------------------------------------------------
   * BLOQUE 2
   * ---------------------------------------------------------------------- */

  lineas.push(
    '## 2. Resultado de la corrida',
    '',
    `- Verdes: **${junit.verdes.length}**`,
    `- Rojos: **${junit.rojos.length}**`,
    `- Omitidos: **${junit.omitidos.length}**`,
    '',
  );

  if (
    junit.rojos.length >
    0
  ) {
    lineas.push(
      '### Escenarios con error',
      '',
      '| Escenario | Detalle |',
      '|---|---|',
    );

    for (
      const caso
      of junit.rojos
    ) {
      lineas.push(
        `| ${escaparMarkdown(caso.nombre)} | ${
          escaparMarkdown(
            caso.mensajeError ||
            'Error reportado por Playwright',
          )
        } |`,
      );
    }

    lineas.push('');
  } else {
    lineas.push(
      'No se registraron escenarios con error.',
      '',
    );
  }


  /* ----------------------------------------------------------------------
   * BLOQUE 3
   * ---------------------------------------------------------------------- */

  lineas.push(
    '## 3. Duración',
    '',
    `**Duración total:** ${formatearDuracion(junit.duracionTotal)}`,
    '',
  );


  /* ----------------------------------------------------------------------
   * BLOQUE 4
   * ---------------------------------------------------------------------- */

  lineas.push(
    '## 4. Pasos [MANUAL]',
    '',
  );

  if (
    junit.manuales.length ===
    0
  ) {
    lineas.push(
      'No se registraron pasos `[MANUAL]` en esta corrida.',
      '',
    );
  } else {
    for (
      const manual
      of junit.manuales
    ) {
      lineas.push(
        `- ${escaparMarkdown(manual)}`,
      );
    }

    lineas.push('');
  }


  /* ----------------------------------------------------------------------
   * BLOQUE 5
   * ---------------------------------------------------------------------- */

  lineas.push(
    '## 5. Casos creados en la corrida',
    '',
  );

  if (
    casosCorrida.casos.length >
    0
  ) {
    lineas.push(
      '| Número de caso | Escenario | Fecha-hora |',
      '|---|---|---|',
    );

    for (
      const caso
      of casosCorrida.casos
    ) {
      lineas.push(
        `| ${escaparMarkdown(caso.numeroCaso)} | ` +
        `${escaparMarkdown(caso.escenario)} | ` +
        `${escaparMarkdown(caso.fechaHora)} |`,
      );
    }

    lineas.push('');
  } else {
    switch (
      casosCorrida.estado
    ) {
      case 'sin-historico':
        lineas.push(
          'No existe un histórico de casos para este proyecto; no se registran casos creados.',
          '',
        );
        break;

      case 'historico-invalido':
        lineas.push(
          'El histórico de casos no pudo leerse correctamente; no se incluyen casos creados.',
          '',
        );
        break;

      case 'sin-rango-temporal':
        lineas.push(
          'El JUnit no contiene suficiente información temporal para asociar casos a esta corrida.',
          '',
        );
        break;

      default:
        lineas.push(
          'No se registraron casos creados durante esta corrida.',
          '',
        );
        break;
    }
  }


  return (
    lineas.join('\n') +
    '\n'
  );
}


/* ==========================================================================
 * Programa principal
 * ========================================================================== */

function main() {
  const proyecto =
    process.argv[2] ??
    '';

  if (!proyecto) {
    console.error(
      'Error: debes indicar el proyecto.',
    );

    console.error(
      'Ejemplo: npm run resumen -- demo',
    );

    process.exitCode = 1;
    return;
  }


  const proyectoDir =
    resolve(
      raiz,
      'projects',
      proyecto,
    );

  if (
    !existsSync(
      proyectoDir,
    )
  ) {
    console.error(
      `Error: el proyecto "${proyecto}" no existe dentro de projects/.`,
    );

    process.exitCode = 1;
    return;
  }


  const resultadosDir =
    resolve(
      raiz,
      'test-results',
      proyecto,
    );

  const rutaJUnit =
    resolve(
      resultadosDir,
      'junit',
      'results.xml',
    );

  const rutaHistorico =
    resolve(
      resultadosDir,
      'historico-casos.json',
    );

  const rutaReporte =
    resolve(
      resultadosDir,
      'resumen-ejecutivo.md',
    );


  if (
    !existsSync(
      rutaJUnit,
    )
  ) {
    console.error(
      `No hay resultados de pruebas para el proyecto "${proyecto}".`,
    );

    console.error(
      `Se esperaba encontrar: test-results/${proyecto}/junit/results.xml`,
    );

    console.error(
      `Ejecuta primero: npm test -- ${proyecto}`,
    );

    process.exitCode = 1;
    return;
  }


  let junit;

  try {
    junit =
      leerJUnit(
        rutaJUnit,
      );
  } catch (
    error
  ) {
    const mensaje =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `Error: no fue posible leer el JUnit del proyecto "${proyecto}": ${mensaje}`,
    );

    process.exitCode = 1;
    return;
  }


  const casosCorrida =
    leerCasosDeCorrida(
      rutaHistorico,
      junit.inicioCorrida,
      junit.finCorrida,
    );


  const reporte =
    construirReporte(
      proyecto,
      junit,
      casosCorrida,
    );


  mkdirSync(
    resultadosDir,
    {
      recursive: true,
    },
  );

  writeFileSync(
    rutaReporte,
    reporte,
    'utf8',
  );


  console.log(
    `✓ Resumen generado: test-results/${proyecto}/resumen-ejecutivo.md`,
  );

  console.log(
    `  Escenarios: ${junit.casos.length}`,
  );

  console.log(
    `  Verdes: ${junit.verdes.length}`,
  );

  console.log(
    `  Rojos: ${junit.rojos.length}`,
  );

  console.log(
    `  Omitidos: ${junit.omitidos.length}`,
  );

  console.log(
    `  Duración: ${formatearDuracion(junit.duracionTotal)}`,
  );

  console.log(
    `  Pasos [MANUAL]: ${junit.manuales.length}`,
  );

  console.log(
    `  Casos creados en la corrida: ${casosCorrida.casos.length}`,
  );


  /*
   * Importante:
   *
   * El comando resumen reporta una corrida; no reproduce su estado.
   * Una corrida con tests rojos sigue generando correctamente el resumen,
   * por lo que el comando termina en 0 mientras el reporte pueda crearse.
   */
  process.exitCode = 0;
}


main();