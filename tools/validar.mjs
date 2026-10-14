#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';

import {
  basename,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';

import {
  parse as parseEnv,
} from 'dotenv';

import {
  load as yamlLoad,
} from 'js-yaml';

const raiz = resolve(
  process.env.VALIDAR_BASE_DIR ??
  process.cwd(),
);

/* ==========================================================================
 * T3 — Validador previo de escenarios YAML
 *
 * Uso:
 *
 *   node tools/validar.mjs <proyecto> <escenario.yaml>
 *   node tools/validar.mjs <proyecto> --todos
 *   node tools/validar.mjs <proyecto>
 *
 * La última forma también valida todos los escenarios. Esto además hace al
 * comando tolerante a ambientes donde npm pueda consumir "--todos".
 * ========================================================================== */


/* --------------------------------------------------------------------------
 * Catálogos
 * -------------------------------------------------------------------------- */

/*
 * Catálogo aceptado por el YAML actual + las extensiones aprobadas para T3.
 *
 * "archivo" y "combo-escribible" están incluidos expresamente porque forman
 * parte del alcance solicitado para T3.
 *
 * El scenarioLoader/FormActions de la copia actual todavía no implementa
 * completamente esas dos extensiones. El validador las reconoce para reflejar
 * el catálogo aprobado, pero muestra una advertencia informativa.
 */
const TIPOS_VALIDOS = [
  'texto',
  'área de texto',
  'area de texto',
  'fecha',
  'número',
  'numero',
  'lista',
  'búsqueda',
  'busqueda',
  'radio',
  'checkbox',
  'archivo',
  'combo-escribible',
];

/*
 * Lista canónica utilizada para sugerencias.
 * Evita sugerir simultáneamente "número" y "numero", por ejemplo.
 */
const TIPOS_PREFERIDOS = [
  'texto',
  'área de texto',
  'fecha',
  'número',
  'lista',
  'búsqueda',
  'radio',
  'checkbox',
  'archivo',
  'combo-escribible',
];

const TIPOS_PENDIENTES_EJECUCION = new Set([
  'archivo',
  'combo-escribible',
]);

const MODOS_INICIO_VALIDOS = [
  'bandeja',
  'crear-caso',
  'buscar',
  'servicio',
];

const HAZARDS_VALIDOS = [
  'el_caso_avanza_a',
  'el_caso_ya_no_esta_en_bandeja_de',
  'asignado_a',
  'campo_tiene_valor',
  'la_tabla_tiene_filas',
  'el_caso_termina',
];


/* --------------------------------------------------------------------------
 * Utilidades generales
 * -------------------------------------------------------------------------- */

function esObjeto(valor) {
  return (
    valor !== null &&
    typeof valor === 'object' &&
    !Array.isArray(valor)
  );
}


function esTexto(valor) {
  return (
    typeof valor === 'string' &&
    valor.trim().length > 0
  );
}


function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}


function escaparRegex(texto) {
  return String(texto)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/**
 * Busca una línea que contenga una clave y, opcionalmente, su valor.
 *
 * Es deliberadamente simple: T3 pide línea "cuando sea posible".
 * Funciona tanto con YAML multilínea como con campos inline:
 *
 * - tipo: fecha
 * - { campo: Fecha, valor: "...", tipo: fecha }
 */
function buscarLinea(
  lineas,
  clave,
  valor,
) {
  const regexClave = new RegExp(
    `\\b${escaparRegex(clave)}\\s*:`,
    'i',
  );

  const valorNormalizado =
    valor === undefined
      ? ''
      : normalizar(valor);

  for (
    let i = 0;
    i < lineas.length;
    i += 1
  ) {
    const linea = lineas[i];

    if (!regexClave.test(linea)) {
      continue;
    }

    if (!valorNormalizado) {
      return i + 1;
    }

    if (
      normalizar(linea).includes(
        valorNormalizado,
      )
    ) {
      return i + 1;
    }
  }

  return undefined;
}


function textoLinea(linea) {
  return linea
    ? `línea ${linea}`
    : 'sin línea exacta';
}


/**
 * Distancia Levenshtein.
 *
 * Se utiliza únicamente para sugerencias; no requiere dependencias externas.
 */
function distanciaEdicion(aOriginal, bOriginal) {
  const a = normalizar(aOriginal);
  const b = normalizar(bOriginal);

  const matriz = Array.from(
    {
      length: a.length + 1,
    },
    () =>
      Array(
        b.length + 1,
      ).fill(0),
  );

  for (
    let i = 0;
    i <= a.length;
    i += 1
  ) {
    matriz[i][0] = i;
  }

  for (
    let j = 0;
    j <= b.length;
    j += 1
  ) {
    matriz[0][j] = j;
  }

  for (
    let i = 1;
    i <= a.length;
    i += 1
  ) {
    for (
      let j = 1;
      j <= b.length;
      j += 1
    ) {
      const costo =
        a[i - 1] === b[j - 1]
          ? 0
          : 1;

      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,
        matriz[i][j - 1] + 1,
        matriz[i - 1][j - 1] + costo,
      );
    }
  }

  return matriz[a.length][b.length];
}


function sugerirTipo(tipo) {
  let mejor;
  let mejorDistancia = Number.POSITIVE_INFINITY;

  for (
    const candidato
    of TIPOS_PREFERIDOS
  ) {
    const distancia =
      distanciaEdicion(
        tipo,
        candidato,
      );

    if (
      distancia <
      mejorDistancia
    ) {
      mejorDistancia =
        distancia;

      mejor = candidato;
    }
  }

  /*
   * No sugerimos algo completamente diferente.
   * Se permite algo más de distancia para palabras largas.
   */
  const limite = Math.max(
    2,
    Math.floor(
      normalizar(tipo).length * 0.35,
    ),
  );

  return mejorDistancia <= limite
    ? mejor
    : undefined;
}


/* --------------------------------------------------------------------------
 * Lectura del proyecto y del .env
 * -------------------------------------------------------------------------- */

function leerVariablesEnv(proyectoDir) {
  const variables = {};

  /*
   * Primero example y después .env.
   * Si existe la misma clave, .env la sobreescribe.
   *
   * Para T3 solo interesa la PRESENCIA de la variable.
   */
  for (
    const archivo
    of ['.env.example', '.env']
  ) {
    const ruta = resolve(
      proyectoDir,
      archivo,
    );

    if (!existsSync(ruta)) {
      continue;
    }

    try {
      Object.assign(
        variables,
        parseEnv(
          readFileSync(
            ruta,
            'utf8',
          ),
        ),
      );
    } catch {
      /*
       * Si el env no puede parsearse, la validación de usuarios
       * simplemente trabajará con las claves que sí hayan podido
       * cargarse desde el otro archivo.
       */
    }
  }

  return variables;
}


function validarUsuario(
  usuario,
  contexto,
  linea,
  variablesEnv,
  problemas,
  advertencias,
) {
  if (!esTexto(usuario)) {
    return;
  }

  const claveUsuario =
    `USUARIO_${usuario}`;

  const tieneUsuarioPropio =
    Object.prototype.hasOwnProperty.call(
      variablesEnv,
      claveUsuario,
    ) &&
    esTexto(
      variablesEnv[claveUsuario],
    );

  const tieneQuickUser =
    Object.prototype.hasOwnProperty.call(
      variablesEnv,
      'BIZAGI_QUICK_USER',
    ) &&
    esTexto(
      variablesEnv.BIZAGI_QUICK_USER,
    );

  /*
   * BpmEngine resuelve:
   *
   * USUARIO_<clave>
   *   ??
   * BIZAGI_QUICK_USER
   *   ??
   * clave literal
   *
   * T3 exige comprobar usuarios contra el .env, por lo que
   * el fallback literal no se considera una configuración
   * suficiente.
   */
  if (
    !tieneUsuarioPropio &&
    !tieneQuickUser
  ) {
    problemas.push({
      linea,
      campo: contexto,
      mensaje:
        `el usuario lógico "${usuario}" no tiene la variable ` +
        `"${claveUsuario}" y tampoco existe "BIZAGI_QUICK_USER" ` +
        'en .env ni .env.example.',
    });

    return;
  }

  /*
   * Es ejecutable gracias al fallback del motor, pero dejamos
   * visible que el usuario lógico no tiene un mapeo propio.
   */
  if (
    !tieneUsuarioPropio &&
    tieneQuickUser
  ) {
    advertencias.push({
      linea,
      campo: contexto,
      mensaje:
        `no existe "${claveUsuario}". El motor utilizará ` +
        '"BIZAGI_QUICK_USER" como fallback. Si este escenario ' +
        `debe representar un usuario diferente, agrega "${claveUsuario}".`,
    });
  }

  const modoLogin =
    normalizar(
      variablesEnv.BIZAGI_LOGIN_MODO ??
      'lista',
    );

  if (modoLogin === 'estandar') {
    const clavePassword =
      `CLAVE_${usuario}`;

    const tieneClavePropia =
      Object.prototype.hasOwnProperty.call(
        variablesEnv,
        clavePassword,
      ) &&
      esTexto(
        variablesEnv[clavePassword],
      );

    const tieneClaveGlobal =
      Object.prototype.hasOwnProperty.call(
        variablesEnv,
        'BIZAGI_PASSWORD',
      ) &&
      esTexto(
        variablesEnv.BIZAGI_PASSWORD,
      );

    if (
      !tieneClavePropia &&
      !tieneClaveGlobal
    ) {
      problemas.push({
        linea,
        campo: contexto,
        mensaje:
          `el usuario "${usuario}" usa login estándar, pero no existe ` +
          `"${clavePassword}" ni el fallback "BIZAGI_PASSWORD".`,
      });
    }
  }
}


/* --------------------------------------------------------------------------
 * Validación de recursos
 * -------------------------------------------------------------------------- */

function validarArchivo(
  valor,
  contexto,
  linea,
  resourcesDir,
  problemas,
) {
  if (!esTexto(valor)) {
    problemas.push({
      linea,
      campo: contexto,
      mensaje:
        'un campo de tipo "archivo" debe tener en "valor" ' +
        'el nombre o ruta relativa del archivo.',
    });

    return;
  }

  let rutaRelativa =
    valor
      .trim()
      .replaceAll('\\', '/');

  if (
    rutaRelativa.startsWith(
      'resources/',
    )
  ) {
    rutaRelativa =
      rutaRelativa.slice(
        'resources/'.length,
      );
  }

  const rutaFinal = resolve(
    resourcesDir,
    rutaRelativa,
  );

  /*
   * Impide que "../" salga de resources/.
   */
  const relativaSegura =
    relative(
      resourcesDir,
      rutaFinal,
    );

  const fueraDeResources =
    relativaSegura === '..' ||
    relativaSegura.startsWith(
      `..${sep}`,
    ) ||
    isAbsolute(
      relativaSegura,
    );

  if (fueraDeResources) {
    problemas.push({
      linea,
      campo: contexto,
      mensaje:
        `el archivo "${valor}" apunta fuera de resources/. ` +
        'Los archivos del escenario deben vivir dentro de esa carpeta.',
    });

    return;
  }

  if (!existsSync(rutaFinal)) {
    problemas.push({
      linea,
      campo: contexto,
      mensaje:
        `no existe el archivo ` +
        `"resources/${rutaRelativa}".`,
    });
  }
}


/* --------------------------------------------------------------------------
 * Validación de campos
 * -------------------------------------------------------------------------- */

function validarCampo(
  campoRaw,
  contexto,
  lineas,
  resourcesDir,
  problemas,
  advertencias,
) {
  if (!esObjeto(campoRaw)) {
    problemas.push({
      campo: contexto,
      mensaje:
        'el campo no tiene el formato esperado.',
    });

    return;
  }

  const campo = campoRaw;

  if (!esTexto(campo.campo)) {
    problemas.push({
      campo: `${contexto}.campo`,
      mensaje:
        'falta "campo" con la etiqueta visible del control.',
    });
  }

  if (campo.valor === undefined) {
    problemas.push({
      linea: buscarLinea(
        lineas,
        'campo',
        campo.campo,
      ),
      campo: `${contexto}.valor`,
      mensaje:
        `falta "valor"${esTexto(campo.campo)
          ? ` para "${campo.campo}"`
          : ''
        }.`,
    });
  }

  if (campo.tipo != null) {
    const tipo =
      String(campo.tipo);

    const lineaTipo =
      buscarLinea(
        lineas,
        'tipo',
        tipo,
      );

    if (
      !TIPOS_VALIDOS.includes(
        tipo,
      )
    ) {
      const sugerencia =
        sugerirTipo(tipo);

      problemas.push({
        linea: lineaTipo,
        campo: `${contexto}.tipo`,
        mensaje:
          `tipo "${tipo}" no existe.` +
          (
            sugerencia
              ? ` ¿Quisiste decir "${sugerencia}"?`
              : ` Tipos válidos: ${TIPOS_PREFERIDOS.join(', ')}.`
          ),
      });
    } else if (
      TIPOS_PENDIENTES_EJECUCION.has(
        tipo,
      )
    ) {
      advertencias.push({
        linea: lineaTipo,
        campo: `${contexto}.tipo`,
        mensaje:
          `el tipo "${tipo}" pertenece al catálogo aprobado, ` +
          'pero la copia actual de scenarioLoader/FormActions todavía ' +
          'no implementa completamente su ejecución.',
      });
    }

    if (tipo === 'archivo') {
      validarArchivo(
        campo.valor,
        `${contexto}.valor`,
        buscarLinea(
          lineas,
          'valor',
          campo.valor,
        ),
        resourcesDir,
        problemas,
      );
    }
  }
}


/* --------------------------------------------------------------------------
 * Validación estructural completa
 * -------------------------------------------------------------------------- */

function validarDocumento(
  doc,
  raw,
  proyectoDir,
) {
  const problemas = [];
  const advertencias = [];

  const lineas =
    raw.split(/\r?\n/);

  const resourcesDir =
    resolve(
      proyectoDir,
      'resources',
    );

  const variablesEnv =
    leerVariablesEnv(
      proyectoDir,
    );


  if (!esObjeto(doc)) {
    problemas.push({
      mensaje:
        'el archivo está vacío o no tiene el formato esperado "clave: valor".',
    });

    return {
      problemas,
      advertencias,
    };
  }


  /* ----------------------------------------------------------------------
   * Cabecera
   * ---------------------------------------------------------------------- */

  if (!esTexto(doc.proceso)) {
    problemas.push({
      campo: 'proceso',
      mensaje:
        'falta "proceso" con el nombre del proceso.',
    });
  }

  if (!esTexto(doc.escenario)) {
    problemas.push({
      campo: 'escenario',
      mensaje:
        'falta "escenario" con el nombre del caso de prueba.',
    });
  }

  if (
    doc.etiquetas != null &&
    !(
      Array.isArray(
        doc.etiquetas,
      ) &&
      doc.etiquetas.every(
        esTexto,
      )
    )
  ) {
    problemas.push({
      linea: buscarLinea(
        lineas,
        'etiquetas',
      ),
      campo: 'etiquetas',
      mensaje:
        '"etiquetas" debe ser una lista de textos.',
    });
  }


  /* ----------------------------------------------------------------------
   * Inicio
   * ---------------------------------------------------------------------- */

  if (!esObjeto(doc.inicio)) {
    problemas.push({
      linea: buscarLinea(
        lineas,
        'inicio',
      ),
      campo: 'inicio',
      mensaje:
        'falta el bloque "inicio" con "modo" y "usuario".',
    });
  } else {
    const inicio = doc.inicio;

    if (
      !MODOS_INICIO_VALIDOS.includes(
        inicio.modo,
      )
    ) {
      problemas.push({
        linea: buscarLinea(
          lineas,
          'modo',
          inicio.modo,
        ),
        campo: 'inicio.modo',
        mensaje:
          `"inicio.modo" debe ser ${MODOS_INICIO_VALIDOS
            .map((m) => `"${m}"`)
            .join(' o ')}. Valor actual: ${JSON.stringify(inicio.modo)}.`,
      });
    }

    if (!esTexto(inicio.usuario)) {
      problemas.push({
        linea: buscarLinea(
          lineas,
          'usuario',
        ),
        campo: 'inicio.usuario',
        mensaje:
          'falta el usuario lógico con el que inicia el escenario.',
      });
    } else {
      validarUsuario(
        inicio.usuario,
        'inicio.usuario',
        buscarLinea(
          lineas,
          'usuario',
          inicio.usuario,
        ),
        variablesEnv,
        problemas,
        advertencias,
      );
    }

    if (
      inicio.modo ===
        'crear-caso' &&
      !esTexto(
        inicio.proceso_a_crear,
      )
    ) {
      problemas.push({
        campo:
          'inicio.proceso_a_crear',
        mensaje:
          'como "inicio.modo" es "crear-caso", falta ' +
          '"inicio.proceso_a_crear".',
      });
    }
  }


  /* ----------------------------------------------------------------------
   * Pasos
   * ---------------------------------------------------------------------- */

  if (
    !Array.isArray(doc.pasos) ||
    doc.pasos.length === 0
  ) {
    problemas.push({
      linea: buscarLinea(
        lineas,
        'pasos',
      ),
      campo: 'pasos',
      mensaje:
        'falta la lista "pasos" con al menos un paso.',
    });
  } else {
    doc.pasos.forEach(
      (pasoRaw, indicePaso) => {
        const numeroPaso =
          indicePaso + 1;

        const contextoPaso =
          `pasos[${indicePaso}]`;

        if (!esObjeto(pasoRaw)) {
          problemas.push({
            campo: contextoPaso,
            mensaje:
              `Paso #${numeroPaso}: no tiene el formato esperado.`,
          });

          return;
        }

        const paso = pasoRaw;

        if (!esTexto(paso.actividad)) {
          problemas.push({
            campo:
              `${contextoPaso}.actividad`,
            mensaje:
              `Paso #${numeroPaso}: falta "actividad".`,
          });
        }

        if (paso.usuario != null) {
          if (!esTexto(paso.usuario)) {
            problemas.push({
              linea: buscarLinea(
                lineas,
                'usuario',
                paso.usuario,
              ),
              campo:
                `${contextoPaso}.usuario`,
              mensaje:
                `Paso #${numeroPaso}: "usuario" está vacío.`,
            });
          } else {
            validarUsuario(
              paso.usuario,
              `${contextoPaso}.usuario`,
              buscarLinea(
                lineas,
                'usuario',
                paso.usuario,
              ),
              variablesEnv,
              problemas,
              advertencias,
            );
          }
        }

        if (
          paso.personalizado != null &&
          !esTexto(
            paso.personalizado,
          )
        ) {
          problemas.push({
            linea: buscarLinea(
              lineas,
              'personalizado',
            ),
            campo:
              `${contextoPaso}.personalizado`,
            mensaje:
              `Paso #${numeroPaso}: "personalizado" debe ser ` +
              'el nombre de un snippet.',
          });
        }


        /* llenar -------------------------------------------------------- */

        if (paso.llenar != null) {
          if (
            !Array.isArray(
              paso.llenar,
            )
          ) {
            problemas.push({
              linea: buscarLinea(
                lineas,
                'llenar',
              ),
              campo:
                `${contextoPaso}.llenar`,
              mensaje:
                `Paso #${numeroPaso}: "llenar" debe ser una lista.`,
            });
          } else {
            paso.llenar.forEach(
              (
                campo,
                indiceCampo,
              ) => {
                validarCampo(
                  campo,
                  `${contextoPaso}.llenar[${indiceCampo}]`,
                  lineas,
                  resourcesDir,
                  problemas,
                  advertencias,
                );
              },
            );
          }
        }


        /* tablas -------------------------------------------------------- */

        if (paso.tablas != null) {
          if (
            !Array.isArray(
              paso.tablas,
            )
          ) {
            problemas.push({
              linea: buscarLinea(
                lineas,
                'tablas',
              ),
              campo:
                `${contextoPaso}.tablas`,
              mensaje:
                `Paso #${numeroPaso}: "tablas" debe ser una lista.`,
            });
          } else {
            paso.tablas.forEach(
              (
                tablaRaw,
                indiceTabla,
              ) => {
                const contextoTabla =
                  `${contextoPaso}.tablas[${indiceTabla}]`;

                if (
                  !esObjeto(
                    tablaRaw,
                  )
                ) {
                  problemas.push({
                    campo:
                      contextoTabla,
                    mensaje:
                      'la tabla no tiene el formato esperado.',
                  });

                  return;
                }

                if (
                  !esTexto(
                    tablaRaw.tabla,
                  )
                ) {
                  problemas.push({
                    campo:
                      `${contextoTabla}.tabla`,
                    mensaje:
                      'falta "tabla" con el nombre visible de la colección.',
                  });
                }

                if (
                  !Array.isArray(
                    tablaRaw.filas,
                  ) ||
                  tablaRaw.filas.length ===
                    0
                ) {
                  problemas.push({
                    campo:
                      `${contextoTabla}.filas`,
                    mensaje:
                      'falta "filas" con al menos una fila.',
                  });

                  return;
                }

                tablaRaw.filas.forEach(
                  (
                    filaRaw,
                    indiceFila,
                  ) => {
                    const contextoFila =
                      `${contextoTabla}.filas[${indiceFila}]`;

                    if (
                      !esObjeto(
                        filaRaw,
                      ) ||
                      !Array.isArray(
                        filaRaw.llenar,
                      ) ||
                      filaRaw.llenar.length ===
                        0
                    ) {
                      problemas.push({
                        campo:
                          `${contextoFila}.llenar`,
                        mensaje:
                          'falta "llenar" con al menos un campo.',
                      });

                      return;
                    }

                    filaRaw.llenar.forEach(
                      (
                        campo,
                        indiceCampo,
                      ) => {
                        validarCampo(
                          campo,
                          `${contextoFila}.llenar[${indiceCampo}]`,
                          lineas,
                          resourcesDir,
                          problemas,
                          advertencias,
                        );
                      },
                    );
                  },
                );
              },
            );
          }
        }


        /* esperar_integracion ------------------------------------------ */

        if (
          paso.esperar_integracion !=
          null
        ) {
          const espera =
            paso.esperar_integracion;

          if (!esObjeto(espera)) {
            problemas.push({
              linea: buscarLinea(
                lineas,
                'esperar_integracion',
              ),
              campo:
                `${contextoPaso}.esperar_integracion`,
              mensaje:
                '"esperar_integracion" debe ser un bloque.',
            });
          } else {
            if (
              espera.hasta_llegar_a !=
                null &&
              !esTexto(
                espera.hasta_llegar_a,
              )
            ) {
              problemas.push({
                linea: buscarLinea(
                  lineas,
                  'hasta_llegar_a',
                ),
                campo:
                  `${contextoPaso}.esperar_integracion.hasta_llegar_a`,
                mensaje:
                  '"hasta_llegar_a" debe contener el nombre de una actividad.',
              });
            }

            if (
              espera.maximo_minutos !=
                null &&
              (
                typeof espera.maximo_minutos !==
                  'number' ||
                espera.maximo_minutos <=
                  0
              )
            ) {
              problemas.push({
                linea: buscarLinea(
                  lineas,
                  'maximo_minutos',
                  espera.maximo_minutos,
                ),
                campo:
                  `${contextoPaso}.esperar_integracion.maximo_minutos`,
                mensaje:
                  '"maximo_minutos" debe ser un número mayor que 0.',
              });
            }
          }
        }


        if (
          paso.verificar_al_entrar !=
            null &&
          !Array.isArray(
            paso.verificar_al_entrar,
          )
        ) {
          problemas.push({
            linea: buscarLinea(
              lineas,
              'verificar_al_entrar',
            ),
            campo:
              `${contextoPaso}.verificar_al_entrar`,
            mensaje:
              '"verificar_al_entrar" debe ser una lista.',
          });
        }
      },
    );
  }


  /* ----------------------------------------------------------------------
   * Hazards
   * ---------------------------------------------------------------------- */

  if (
    !Array.isArray(doc.hazards) ||
    doc.hazards.length === 0
  ) {
    problemas.push({
      linea: buscarLinea(
        lineas,
        'hazards',
      ),
      campo: 'hazards',
      mensaje:
        'falta la lista "hazards" con al menos una verificación.',
    });
  } else {
    doc.hazards.forEach(
      (
        hazardRaw,
        indiceHazard,
      ) => {
        const contexto =
          `hazards[${indiceHazard}]`;

        if (!esObjeto(hazardRaw)) {
          problemas.push({
            campo: contexto,
            mensaje:
              `Hazard #${indiceHazard + 1}: no tiene el formato esperado.`,
          });

          return;
        }

        const claves =
          Object.keys(
            hazardRaw,
          );

        const desconocidas =
          claves.filter(
            (clave) =>
              !HAZARDS_VALIDOS.includes(
                clave,
              ),
          );

        if (
          desconocidas.length >
          0
        ) {
          problemas.push({
            linea: buscarLinea(
              lineas,
              desconocidas[0],
            ),
            campo: contexto,
            mensaje:
              `Hazard #${indiceHazard + 1}: clave(s) no reconocida(s): ` +
              `${desconocidas.join(', ')}. Válidas: ` +
              `${HAZARDS_VALIDOS.join(', ')}.`,
          });
        }


        /*
         * Estos hazards contienen claves lógicas de usuario,
         * por lo tanto también deben existir en el .env.
         */
        for (
          const claveUsuario
          of [
            'el_caso_ya_no_esta_en_bandeja_de',
            'asignado_a',
          ]
        ) {
          if (
            esTexto(
              hazardRaw[
                claveUsuario
              ],
            )
          ) {
            const usuario =
              hazardRaw[
                claveUsuario
              ];

            validarUsuario(
              usuario,
              `${contexto}.${claveUsuario}`,
              buscarLinea(
                lineas,
                claveUsuario,
                usuario,
              ),
              variablesEnv,
              problemas,
              advertencias,
            );
          }
        }
      },
    );
  }


  return {
    problemas,
    advertencias,
  };
}


/* --------------------------------------------------------------------------
 * Parseo de un archivo
 * -------------------------------------------------------------------------- */

function validarArchivoYaml(
  archivo,
  proyectoDir,
) {
  let raw;

  try {
    raw = readFileSync(
      archivo,
      'utf8',
    );
  } catch {
    return {
      archivo,
      problemas: [
        {
          mensaje:
            'no se pudo abrir el archivo.',
        },
      ],
      advertencias: [],
    };
  }

  let doc;

  try {
    doc = yamlLoad(raw);
  } catch (error) {
    const linea =
      error?.mark?.line != null
        ? error.mark.line + 1
        : undefined;

    return {
      archivo,
      problemas: [
        {
          linea,
          campo: 'YAML',
          mensaje:
            'el archivo no es un YAML válido. Revisa la sangría, ' +
            'los ":" y que no existan tabuladores. ' +
            `Detalle: ${error?.reason ?? error?.message ?? 'error de sintaxis'}.`,
        },
      ],
      advertencias: [],
    };
  }

  const resultado =
    validarDocumento(
      doc,
      raw,
      proyectoDir,
    );

  return {
    archivo,
    ...resultado,
  };
}


/* --------------------------------------------------------------------------
 * Presentación
 * -------------------------------------------------------------------------- */

function imprimirProblema(
  problema,
  simbolo = '•',
) {
  const prefijo = [
    problema.linea
      ? `línea ${problema.linea}`
      : undefined,
    problema.campo,
  ]
    .filter(Boolean)
    .join(' — ');

  console.log(
    `  ${simbolo} ${
      prefijo
        ? `${prefijo}: `
        : ''
    }${problema.mensaje}`,
  );
}


function imprimirResultado(
  resultado,
) {
  const nombre =
    basename(
      resultado.archivo,
    );

  if (
    resultado.problemas.length ===
    0
  ) {
    console.log(
      `✔ ${nombre}`,
    );
  } else {
    console.log(
      `✘ ${nombre}`,
    );

    for (
      const problema
      of resultado.problemas
    ) {
      imprimirProblema(
        problema,
      );
    }
  }

  for (
    const advertencia
    of resultado.advertencias
  ) {
    imprimirProblema(
      advertencia,
      '⚠',
    );
  }

  console.log('');
}


/* --------------------------------------------------------------------------
 * Resolución de argumentos
 * -------------------------------------------------------------------------- */

function resolverEscenario(
  proyectoDir,
  argumento,
) {
  if (!argumento) {
    return undefined;
  }

  const candidatos = [];

  if (isAbsolute(argumento)) {
    candidatos.push(
      argumento,
    );
  } else {
    candidatos.push(
      resolve(
        proyectoDir,
        'scenarios',
        argumento,
      ),
    );

    candidatos.push(
      resolve(
        proyectoDir,
        argumento,
      ),
    );
  }

  return candidatos.find(
    (ruta) =>
      existsSync(ruta),
  );
}


function listarEscenarios(
  proyectoDir,
) {
  const scenariosDir =
    resolve(
      proyectoDir,
      'scenarios',
    );

  if (!existsSync(scenariosDir)) {
    return [];
  }

  return readdirSync(
    scenariosDir,
  )
    .filter(
      (archivo) =>
        /\.ya?ml$/i.test(
          archivo,
        ) &&
        !archivo.startsWith('_'),
    )
    .sort()
    .map(
      (archivo) =>
        resolve(
          scenariosDir,
          archivo,
        ),
    );
}


/* --------------------------------------------------------------------------
 * Programa principal
 * -------------------------------------------------------------------------- */

function main() {
  const args =
    process.argv.slice(2);

  const proyecto =
    args[0] ?? '';

  if (!proyecto) {
    console.error(
      'Uso:',
    );

    console.error(
      '  npm run validar -- <proyecto> <escenario.yaml>',
    );

    console.error(
      '  npm run validar -- <proyecto> --todos',
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

  if (!existsSync(proyectoDir)) {
    console.error(
      `Error: no existe el proyecto "${proyecto}" dentro de projects/.`,
    );

    process.exitCode = 1;
    return;
  }


  /*
   * Si npm consume --todos y solo llega el proyecto,
   * validamos todos igualmente.
   */
  const argumentoEscenario =
    args
      .slice(1)
      .find(
        (arg) =>
          /\.ya?ml$/i.test(
            arg,
          ),
      );

  const validarTodos =
    args.includes('--todos') ||
    !argumentoEscenario;


  let archivos = [];


  if (validarTodos) {
    archivos =
      listarEscenarios(
        proyectoDir,
      );

    if (
      archivos.length === 0
    ) {
      console.error(
        `Error: el proyecto "${proyecto}" no tiene escenarios YAML ` +
        'ejecutables dentro de scenarios/.',
      );

      process.exitCode = 1;
      return;
    }

    console.log(
      `Validando proyecto "${proyecto}"...`,
    );

    console.log('');
  } else {
    const ruta =
      resolverEscenario(
        proyectoDir,
        argumentoEscenario,
      );

    if (!ruta) {
      console.error(
        `Error: no existe el escenario "${argumentoEscenario}" ` +
        `en projects/${proyecto}/scenarios/.`,
      );

      process.exitCode = 1;
      return;
    }

    archivos = [
      ruta,
    ];

    console.log(
      `Validando escenario "${argumentoEscenario}"...`,
    );

    console.log('');
  }


  const resultados =
    archivos.map(
      (archivo) =>
        validarArchivoYaml(
          archivo,
          proyectoDir,
        ),
    );


  for (
    const resultado
    of resultados
  ) {
    imprimirResultado(
      resultado,
    );
  }


  const validos =
    resultados.filter(
      (resultado) =>
        resultado.problemas.length ===
        0,
    ).length;

  const invalidos =
    resultados.length -
    validos;

  const totalProblemas =
    resultados.reduce(
      (
        total,
        resultado,
      ) =>
        total +
        resultado.problemas.length,
      0,
    );

  const totalAdvertencias =
    resultados.reduce(
      (
        total,
        resultado,
      ) =>
        total +
        resultado.advertencias.length,
      0,
    );


  console.log(
    '────────────────────────────────────────',
  );

  console.log(
    `Escenarios revisados: ${resultados.length}`,
  );

  console.log(
    `Válidos: ${validos}`,
  );

  console.log(
    `Con errores: ${invalidos}`,
  );

  console.log(
    `Problemas encontrados: ${totalProblemas}`,
  );

  if (
    totalAdvertencias >
    0
  ) {
    console.log(
      `Advertencias: ${totalAdvertencias}`,
    );
  }

  console.log('');


  if (
    totalProblemas >
    0
  ) {
    console.log(
      '✘ Validación fallida.',
    );

    process.exitCode = 1;
  } else {
    if (validarTodos) {
    console.log(
        '✔ Todos los escenarios son válidos.',
    );
    } else {
    console.log(
        '✔ El escenario es válido.',
    );
    }

    process.exitCode = 0;
  }
}


main();