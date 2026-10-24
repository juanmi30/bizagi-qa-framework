# Recuperación de HU06 en el portátil corporativo

El comando `npm run sde:hu06` volvió a ejecutar los cinco CP en Bizagi QA y generar un Word consolidado. La corrida **HU06-20261022T142100Z** terminó con cinco casos reales, 154 capturas y ninguna capacidad `NOT_RUN`. El resultado funcional conserva 3 FAIL y 2 REAL_PASS_PARCIAL; no hay aprobación QA. El código de salida 1 de la suite es coherente con esos estados y no significa que haya fallado la generación del Word.

## Entorno y causas originales

- Rama: `feat/sde-soporte-certificacion-hu`, base `668fac2`. Incluye `babd2c2`, `205bbbf` y los comandos cortos; no faltaban commits de las correcciones anteriores.
- Node v24.18.0, npm 11.16.0, Playwright 1.61.1, TypeScript 5.9.3 y Microsoft Edge operativos. `npm ls --depth=0` sin dependencias faltantes; no fue necesario reinstalar.
- El sandbox de la herramienta bloqueó inicialmente el worker de Playwright con `spawn EPERM`; las pruebas se ejecutaron fuera del sandbox con autorización. Esa restricción no se confundió con un defecto de Bizagi.
- CP05 P3: Línea se seleccionó; Ramo falló porque el dato local omitía `48 -`. La lista real ofrecía `48 - AUTOMÓVILES LIVIANOS INDIVIDUAL`. No falló la apertura del formulario ni la selección del Tipo de Solicitud.
- CP01 P3: mismo problema, faltaba `3 -` en Ramo. La excepción original identificaba explícitamente la opción ausente, aunque la clasificación histórica fuera `NO_CLASIFICADO`.
- Tras corregir Ramo, CP05 reveló otro dato local incompleto: `BOGOTA` frente a la opción real `11 - BOGOTA`. Ese intento no creó caso.
- CP02: login válido, pero `/Rest/Processes/All` no ofrecía el proceso al intermediario configurado (ENV-03, AMBIENTE). No era red ni un selector. Juan Miguel actualizó localmente la cuenta; después la comprobación de habilitación pasó. No se cambiaron permisos en Bizagi ni contraseñas.
- CP03: faltaba `SDE_CUMPL_RAMO_SIN_RCE`. CP04: faltaban `SDE_CUMPL_RAMO_CON_RCE` y `SDE_CUMPL_MOVIMIENTO`.
- Se revisaron JSON, contextos, capturas y fotogramas de los videos originales de CP05/CP01. La inspección temporal de listas con el analista fue en solo lectura, sin Crear, y confirmó los ramos y movimientos de referencia.

## Configuración funcional local

Se respaldó el `.env` antes de modificarlo en `tmp/recuperacion-hu06-20261022/config-original.env.bak` (ignorado por Git). Se conservaron las credenciales y el criterio de consulta Individual existente; no se sustituyeron por datos ficticios. Los datos sintéticos de Masiva y edición son los ya definidos por los datasets del proyecto.

| Variable | Valor funcional corregido |
|---|---|
| `SDE_RUTA_RAMO` | `48 - AUTOMÓVILES LIVIANOS INDIVIDUAL` |
| `SDE_AUTOS_RAMO` | `48 - AUTOMÓVILES LIVIANOS INDIVIDUAL` |
| `SDE_GEN_RAMO` | `3 - RC MEDICO PROFESIONAL INDIVIDUAL` |
| `SDE_SUCURSAL` | `11 - BOGOTA` |
| `SDE_CUMPL_RAMO_SIN_RCE` | `44 - CUMPLIMIENTO ENTIDAD ESTATAL` |
| `SDE_CUMPL_RAMO_CON_RCE` | `40 - RCE DERIVADA DE CUMPLIMIENTO` |
| `SDE_CUMPL_MOVIMIENTO` | `Modificación` |
| `SDE_CUMPL_RAMO_RCE_POPUP` | `RCE DERIVADA DE CUMPLIMIENTO` |

Juan Miguel modificó `USUARIO_intermediario` y `USUARIO_intermediario_alerta` durante el trabajo. Sus valores no se reproducen. La comprobación de habilitación de ambas cuentas terminó 2/2 PASS, sin crear casos. No se ejecutaron escenarios HU03.

## Corrección de código y pruebas

El focalizado CP01 creó 1055 y llegó a Estructurar información, pero `abrir_caso` informó que la sesión había expirado. La captura posterior muestra el portal autenticado: la recarga del SPA podía mostrar el login transitoriamente y la consulta concluía demasiado pronto.

`sde/capacidades.ts` incorpora `confirmarSesionConsulta`: si la navegación devuelve login, espera hasta 15 segundos la bandeja autenticada antes de declarar expiración. Se aplica a búsqueda de casos y administración de casos. No reenvía credenciales, no repite escrituras ni crea casos. Un login persistente queda AMBIENTE; una ambigüedad conserva el error técnico.

Regresión nueva: `tests/unit/sesion-consulta.unit.spec.ts`, cuatro pruebas de login transitorio, persistente, bandeja oculta y ambigua. Comprobaciones realizadas:

- `tsc --noEmit`: PASS, también tras dejar el parche final.
- 65/65 pruebas seleccionadas PASS: sesión, confiabilidad, cierre HU06, orquestador, soporte con reportes reales y regresiones documentales del 21/10. Portal ficticio, un worker, sin reintentos.
- Precreación de listas: 1/1 PASS, cero casos.
- Habilitación: 2/2 PASS, cero casos.
- `git diff --check`: sin errores.

Se preservan P-06, P-15, UI-10, exclusión de ejecución, cupo atómico y autorización de pop-ups por instancia. Sin cambios en `shared/`, reglas de negocio, expectativas funcionales, clasificación de resultados históricos ni otros proyectos.

## Ejecuciones reales y casos

Focalizados: CP05 tuvo un intento sin caso hasta Sucursal y un intento que creó **1053**, REAL_PASS_PARCIAL, con P8/P9 PASS. CP01 creó **1055**; se continuó sobre ese mismo caso, sin duplicarlo, hasta P29. La continuación conserva los FAIL de texto de Forma Consulta. La ejecución integral siguiente comprobó el recorrido continuo con el parche de sesión.

| CP integral | Caso | Estado | PASS / FAIL / no automatizados | Capturas archivadas |
|---|---|---|---|---|
| CP01 | 1058 | FAIL | 24 / 3 / 2 | 40 |
| CP02 | 1059 | REAL_PASS_PARCIAL | 22 / 0 / 0, con incidente separado | 34 |
| CP03 | 1060 | FAIL | 21 / 4 / 0 | 34 |
| CP04 | 1061 | FAIL | 19 / 3 / 1 | 35 |
| CP05 | 1056 | REAL_PASS_PARCIAL | 7 / 0 / 2 | 11 |

Total: **93 PASS, 10 FAIL y 5 NOT_AUTOMATED de 108 pasos de matriz**. Las cinco ejecuciones finalizaron, todas las capacidades se intentaron y ninguna quedó `NOT_RUN`. Los hallazgos no bloqueantes permitieron continuar con verificaciones independientes. Solo se lanzó una corrida integral, con los cinco CP sin variantes, un worker y cero reintentos.

Casos propios nuevos registrados en este trabajo: **1053, 1055, 1056, 1058, 1059, 1060 y 1061**. Los saltos de numeración no se atribuyen a esta automatización. El histórico local cuenta casos propios de este equipo, no todos los abiertos en Bizagi. No se eliminaron casos.

## Evidencias y Word

- Corrida: `test-results/seguros-del-estado/corridas/HU06-20261022T142100Z/`.
- Capturas persistentes: `test-results/seguros-del-estado/sde/capturas/<CP>_<unico>/`; 154 nuevas en la integral.
- JSON y metadatos: `test-results/seguros-del-estado/sde/` y `sde/ejecuciones/`.
- HTML/JUnit de la integral: `corridas/HU06-20261022T142100Z/reportes/`. Los índices convencionales originales se restauraron desde su copia previa. Verificación SHA-256: **51/51 archivos originales idénticos**, incluidos documentos, videos y adjuntos. Manifiestos locales en `tmp/recuperacion-hu06-20261022/`.
- Word generado por la integral: `test-results/seguros-del-estado/soportes/HU06/2026-10-22T14-33-09-660Z/20261021_SDE_CEL_HU06_Soporte_Certificacion_Cliente.docx`.
- `sde:hu06:word` generó otra versión nueva en `2026-10-22T14-34-47-713Z`, sin Bizagi. Ambos Word son idénticos byte a byte: SHA-256 `6cd188fff368cbfac8ac4cb2908397061123545299a0a041c4234387c77d3b2a`. Cada invocación produjo un único documento consolidado, sin sobrescribir el anterior. El nombre base conserva el del formato existente; la carpeta identifica la generación del 22/10.
- Verificación estructural: ZIP y XML válidos, cero relaciones rotas, cinco CP seleccionados de esta misma corrida, 105 imágenes incrustadas incluyendo 104 capturas representativas de los pasos. Las 104 coinciden por hash con las capturas reales elegidas por el generador. Los cuatro pasos agregados sin captura quedan identificados por el soporte; las 154 capturas de capacidades se conservan aparte.
- El documento incluye causas, incidentes y observaciones automáticas de cada caso, sin copiar notas de otros casos; aprobación funcional QA pendiente. No contiene contraseñas en su texto.
- Límite: `render_docx.py` falló por ausencia de LibreOffice (`soffice.exe`), confirmado también fuera del sandbox. La [habilidad Documentos](C:/Users/jmanrique_gattaca/.codex/plugins/cache/openai-primary-runtime/documents/26.1020.11127/skills/documents/SKILL.md) exige “Run `render_docx.py` to produce `page-<N>.png` images”; por ello no se afirma haber verificado la paginación visual.

Los tres comandos cortos se comprobaron realmente: simulación seleccionó cinco CP sin ejecutar; ejecución creó cinco casos y produjo el Word pese al código funcional 1; regeneración produjo el mismo Word sin crear casos. Logs locales: `integral.log`, `word.log` y `render-final.log` en `tmp/recuperacion-hu06-20261022/`.

## Pendientes de QA y Git

- CP01: ortografía de “Detalle Polizas Asociadas” y texto “Identificación del tomador” frente a la expectativa; presentación inicial y contenido de pestañas pendientes.
- CP02: P-21a/BUG-03 tras la negativa de Placa: restaurar un valor válido y Guardar no cerró el pop-up. Se conserva como incidente separado; los 22 pasos en PASS no aprueban el CP.
- CP03: admite letras en Número Póliza y Número Póliza RCE; la fila no conservó todos los valores esperados tras Guardar. Defectos por confirmar, con capturas.
- CP04: admite letras en Número Póliza; definición funcional RCE pendiente. CP05: presentación P6 pendiente.
- Revisión visual del Word pendiente de un renderizador local disponible. La generación automática y sus comprobaciones estructurales sí terminaron.

No se crearon commits, no se hizo push ni merge. HEAD sigue en `668fac2`; los cambios de código, prueba y documentación quedan locales para revisión. `.env`, respaldos, capturas, documentos y datos privados siguen ignorados por Git. Sin producción, cambios de permisos, contraseñas inventadas, limpieza física ni eliminación de evidencias.
