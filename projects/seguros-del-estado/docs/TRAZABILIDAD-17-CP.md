# Trazabilidad 17 CP — SDE-CEL

> Documento GENERADO por `sde/trazabilidad.ts` (prueba `@docs`). No editar a mano: regenerar con
> `$env:SDE_ACTUALIZAR_DOCS="1"; npm test -- seguros-del-estado matriz-manifest --grep @docs`.
> Pasos y resultados esperados: literal de los Excel (`fuentes/matriz.json`). Estado real: último reporte EJECUTADO
> (sesión real) de `test-results/seguros-del-estado/sde/`; un intento BLOCKED en preflight se muestra aparte y no tapa
> la evidencia. Sin reporte ejecutado: estado del manifest. Ningún estado verde sin reporte.

> **Fuentes de ejecución:** historial local `test-results/`: 54 reporte(s) · evidencia versionada `docs/evidencia/`: 7 reporte(s). Si un reporte está en ambas, prevalece la copia local.

## Cobertura (tres indicadores independientes)

| Indicador | CP | Definición |
|---|---|---|
| Implementada | 13/17 (completa: 0) | Escenario declarativo válido. Completa = TODOS los pasos verificados solo por UI (ninguno mixto, con integración pendiente o no automatizado) |
| Ejecutada | 2/17 | Reporte con sesión real contra QA (no cuenta un BLOCKED de preflight) |
| Aprobada | 0/17 | Último reporte ejecutado = REAL_PASS. No cuenta REAL_PASS_PARCIAL (1), FAIL (1) ni BLOCKED (11) |

Una prueba unitaria aprobada no es un CP aprobado; un dato sintético no demuestra la integración con SISE.

## Resumen

| CP | Familia | Fase | Escenario | Actores (credenciales) | Datos | Implementación (pasos solo UI / mixtos UI+pendiente / integración / no autom. / sin cubrir) | Ejecución (evidencia) | Estado funcional | Aprobado |
|---|---|---|---|---|---|---|---|---|---|
| HU06-CP01 | F-MASIVO-ESTRUCTURAR | 1 | 3-hu06-cp01.yaml | analista: READY | CFG-PROCESO: READY<br>INI-GENERALES-MASIVO: READY<br>DOC-SOPORTE: READY<br>DOCS-OBLIGATORIOS: READY | PARCIAL (25/3/0/0/0 de 28) | HU06-CP01_20261013-120048.json | **FAIL** | no |
| HU06-CP02 | F-MASIVO-ESTRUCTURAR | 2 | 4-hu06-cp02.yaml | intermediario: READY<br>analista: READY | CFG-PROCESO: READY<br>INI-AUTOS-MASIVO: MISSING | PARCIAL (19/2/0/0/0 de 21) | NO EJECUTADO<br>último intento: BLOCKED (HU06-CP02_20261013-095835.json) | **BLOCKED** | no |
| HU06-CP03 | F-MASIVO-ESTRUCTURAR | 2 | 5-hu06-cp03.yaml | intermediario: READY<br>analista: READY | CFG-PROCESO: READY<br>INI-CUMPL-MASIVO-SIN-RCE: MISSING | PARCIAL (23/1/0/0/0 de 24) | NO EJECUTADO<br>último intento: BLOCKED (HU06-CP03_20261013-095835.json) | **BLOCKED** | no |
| HU06-CP04 | F-MASIVO-ESTRUCTURAR | 2 | 6-hu06-cp04.yaml | intermediario: READY<br>analista: READY | CFG-PROCESO: READY<br>INI-CUMPL-MASIVO-CON-RCE: MISSING | PARCIAL (20/1/0/1/0 de 22) | NO EJECUTADO<br>último intento: BLOCKED (HU06-CP04_20261013-095835.json) | **BLOCKED** | no |
| HU06-CP05 | F-INDIVIDUAL-RUTA | 1 | 1-hu06-cp05.yaml | analista: READY | CFG-PROCESO: READY<br>INI-INDIVIDUAL-RUTA: READY | PARCIAL (6/2/0/0/0 de 8) | HU06-CP05_20261013-231227.json (caso 434) | **REAL_PASS_PARCIAL** | no |
| HU03-CP01 | F-INDIVIDUAL-CONSULTA | 2 | 7-hu03-cp01.yaml | intermediario: READY | CFG-PROCESO: READY<br>PLACA-MULTIPOLIZA: MISSING | PARCIAL (13/4/3/1/0 de 21) | NO EJECUTADO<br>último intento: BLOCKED (HU03-CP01_20261013-095835.json) | **BLOCKED** | no |
| HU03-CP02 | F-INDIVIDUAL-CONSULTA | 1 | 2-hu03-cp02.yaml | intermediario: READY | CFG-PROCESO: READY<br>POL-AUTOS-VIGENTE: MISSING | PARCIAL (13/4/2/1/0 de 20) | NO EJECUTADO<br>último intento: BLOCKED (HU03-CP02_20261013-155239.json) | **BLOCKED** | no |
| HU03-CP03 | F-INDIVIDUAL-CONSULTA | 2 | 8-hu03-cp03.yaml | intermediario: READY | CFG-PROCESO: READY<br>POL-GENERALES-VIGENTE: MISSING | PARCIAL (12/4/3/1/0 de 20) | NO EJECUTADO<br>último intento: BLOCKED (HU03-CP03_20261013-095835.json) | **BLOCKED** | no |
| HU03-CP04 | F-INDIVIDUAL-CONSULTA | 2 | 9-hu03-cp04.yaml | intermediario: READY | CFG-PROCESO: READY<br>TOMADOR-EXISTENTE: MISSING | PARCIAL (10/4/3/2/0 de 19) | NO EJECUTADO<br>último intento: BLOCKED (HU03-CP04_20261013-095836.json) | **BLOCKED** | no |
| HU03-CP05 | F-INDIVIDUAL-CONSULTA | 2 | 10-hu03-cp05.yaml | intermediario: READY | CFG-PROCESO: READY<br>TOMADOR-INEXISTENTE: MISSING | PARCIAL (10/5/3/2/0 de 20) | NO EJECUTADO<br>último intento: BLOCKED (HU03-CP05_20261013-095836.json) | **BLOCKED** | no |
| HU03-CP06 | F-INDIVIDUAL-CONSULTA | 2 | 11-hu03-cp06.yaml | intermediario: READY | CFG-PROCESO: READY<br>POL-CUMPL-RCE: MISSING | PARCIAL (12/4/3/1/0 de 20) | NO EJECUTADO<br>último intento: BLOCKED (HU03-CP06_20261013-095836.json) | **BLOCKED** | no |
| HU03-CP07 | F-INDIVIDUAL-CONSULTA | 2 | 12-hu03-cp07.yaml | intermediario: READY | CFG-PROCESO: READY<br>POL-CUMPL-RCE: MISSING | PARCIAL (12/4/3/1/0 de 20) | NO EJECUTADO<br>último intento: BLOCKED (HU03-CP07_20261013-095836.json) | **BLOCKED** | no |
| HU03-CP08 | F-INDIVIDUAL-CONSULTA | 2 | 13-hu03-cp08.yaml | intermediario: READY | CFG-PROCESO: READY<br>POL-CUMPL-RCE: MISSING | PARCIAL (12/4/3/1/0 de 20) | NO EJECUTADO<br>último intento: BLOCKED (HU03-CP08_20261013-231254.json) | **BLOCKED** | no |
| HU03-CP09 | F-EXCEPCIONES | 3 | — | intermediario_alerta: READY | CFG-PROCESO: READY<br>POL-AUTOS-VIGENTE: MISSING | NO_IMPLEMENTADA (0/0/0/0/13 de 13) | NO EJECUTADO | **PREPARADO** | no |
| HU03-CP10 | F-EXCEPCIONES | 3 | — | intermediario: READY | CFG-PROCESO: READY<br>POL-OTRO-INTERMEDIARIO: MISSING<br>DOC-SOPORTE: READY | NO_IMPLEMENTADA (0/0/0/0/16 de 16) | NO EJECUTADO | **PREPARADO** | no |
| HU03-CP11 | F-EXCEPCIONES | 3 | — | intermediario: READY | CFG-PROCESO: READY<br>POL-INEXISTENTE-RECONSULTA: MISSING | NO_IMPLEMENTADA (0/0/0/0/20 de 20) | NO EJECUTADO | **PREPARADO** | no |
| HU03-CP12 | F-EXCEPCIONES | 3 | — | intermediario: READY | CFG-PROCESO: READY<br>POL-CUMPL-RCE: MISSING<br>DOC-SOPORTE: READY | NO_IMPLEMENTADA (0/0/0/0/33 de 33) | NO EJECUTADO | **PREPARADO** | no |

## HU06-CP01 — SDE - CEL - HU06 - Validar radicación Masiva para línea Generales y estructuración de información

- **Requisitos:** Requirement 228991: SDE - CEL - RAD - HU06 - FRM - Inicio; Requirement 228992: SDE - CEL - RAD - HU06 - ACC - Inicio; Requirement 230836: SDE - CEL - RAD - HU06 - COM - ¿Masivo?; Requirement 230841: SDE - CEL - RAD - HU06 - ACC - Estructurar Información; Requirement 230842: SDE - CEL - RAD - HU06 - FRM - Estructurar Información; Requirement 230843: SDE - CEL - RAD - HU06 - USR - Estructurar Información; Requirement 230849: SDE - CEL - RAD - HU06 - ROL - Analista de Solicitudes
- **Familia:** F-MASIVO-ESTRUCTURAR · **Fase:** 1 · **Prioridad:** P1
- **Escenario:** `escenarios/3-hu06-cp01.yaml`
- **Brechas:** BUG-01 (FUNCTIONAL_AMBIGUITY), BUG-05 (FUNCTIONAL_DEFECT), BUG-06 (FUNCTIONAL_DEFECT), BUG-03 (FUNCTIONAL_DEFECT), BUG-04 (FUNCTIONAL_DEFECT), UI-10 (UI_CAPABILITY_GAP), DATA-03 (TEST_DATA_GAP), UI-03 (UI_CAPABILITY_GAP), UI-04 (UI_CAPABILITY_GAP), INT-02 (INTEGRATION_VISIBILITY_GAP), FUNC-04 (FUNCTIONAL_AMBIGUITY), FUNC-06 (FUNCTIONAL_AMBIGUITY), FUNC-10 (FUNCTIONAL_AMBIGUITY)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P12 (mixto), P17 (mixto), P28 (mixto)
- **Estado:** FAIL — Al menos un paso de la matriz falló.

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar la radicación Masiva para la línea Generales, verificando las reglas del formulario inicial, la ruta de la compuerta ¿Masivo? y el comportamiento de la actividad Estructurar Información, incluyendo la visualización, edición y obligatoriedad de los campos de la tabla de pólizas asociadas. | Agregado del CP | FAIL |
| 2 | Ingresar al ambiente Bizagi mediante la URL: https://test-aiprocesos-sde.bizagi.com/ | El ambiente de pruebas de Bizagi se encuentra disponible y permite iniciar la gestión de una nueva Radicación. | #1 iniciar_sesion (UI: login real)<br>#2 nuevo_caso (UI: abrir formulario) | PASS |
| 3 | Crear un nuevo caso de Radicación y seleccionar Línea = Generales, junto con un Ramo y Tipo de Solicitud válidos para la prueba. | El formulario presenta la información correspondiente a la Línea, Ramo y Tipo de Solicitud seleccionados. | #2 nuevo_caso (UI: abrir formulario)<br>#3 diligenciar (UI: diligenciar + post-condición) | PASS |
| 4 | Validar la sección de información inicial antes de seleccionar el tipo de radicación. | Los campos Línea, Ramo, Tipo de Solicitud/Movimiento y Sucursal se presentan con las etiquetas, ortografía y capitalización definidas. | #4 verificar (UI: aserciones) | PASS |
| 5 | Seleccionar una Sucursal válida. | La Sucursal queda registrada y se mantiene disponible como dato requerido para continuar con la radicación. | #4 verificar (UI: aserciones)<br>#5 diligenciar (UI: diligenciar + post-condición) | PASS |
| 6 | Seleccionar Tipo de Radicación = Masivo. | Se habilitan los elementos correspondientes a la modalidad Masivo, incluyendo Descripción de la Solicitud (Masiva/Múltiple) y Documentos Anexos. | #6 diligenciar (UI: diligenciar + post-condición) | PASS |
| 7 | Validar el texto de ayuda presentado para Masivo. | Para Generales se muestra: “Masivo: Solicitud asociada a más de una póliza.”, conservando ortografía, tildes y capitalización. | #7 verificar (UI: aserciones) | PASS |
| 8 | Validar la descripción de la solicitud. | El campo Descripción de la Solicitud (Masiva/Múltiple) se encuentra disponible para ingresar la narrativa de la solicitud y permite registrar la información requerida. | #8 verificar (UI: aserciones) | PASS |
| 9 | Ingresar una narrativa que permita identificar más de una póliza y adjuntar los documentos obligatorios parametrizados. | La narrativa y los documentos quedan registrados en el formulario sin errores de presentación, ortografía o capitalización. | #9 diligenciar (UI: diligenciar + post-condición)<br>#10 adjuntar_en_grilla (UI: documento en grilla) | FAIL |
| 10 | Crear la solicitud. | Se crea una única solicitud de radicación masiva y la información registrada queda asociada al caso. | #11 pulsar (UI: botón) | NOT_RUN |
| 11 | Validar la compuerta ¿Masivo?. | La compuerta evalúa el Tipo de Radicación Masivo y dirige el caso por la ruta correspondiente a la modalidad masiva. | #12 verificar_ruta (Actividad actual según Bizagi (buscador)) | NOT_RUN |
| 12 | Validar el procesamiento posterior a la compuerta. | El caso continúa hacia el procesamiento automático del Worker AI y posteriormente hacia la actividad Estructurar Información. | #12 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#13 integracion (INTEGRATION_NOT_VERIFIED) | NOT_RUN |
| 13 | Ingresar a la actividad Estructurar Información. | La actividad se encuentra asignada al Analista Centro de Expedición y presenta la información del caso masivo. | #14 abrir_caso (UI: abrir caso por número) | NOT_RUN |
| 14 | Validar la sección Encabezado. | Se muestran en solo lectura Número de Caso, Creador del Caso, Fecha de Creación, Línea, Ramo y Tipo de Movimiento. | #15 verificar (UI: aserciones) | NOT_RUN |
| 15 | Validar la sección Tipo de Consulta. | Se muestran en solo lectura el Tipo de Radicación = Masivo y la Sucursal asociada al caso. | #16 verificar (UI: aserciones) | NOT_RUN |
| 16 | Validar la sección Información a Consultar. | Se muestra la narrativa original registrada por el intermediario y el campo permanece no editable. | #17 verificar (UI: aserciones) | NOT_RUN |
| 17 | Validar la tabla Pólizas asociadas a la solicitud. | La tabla se encuentra disponible y contiene la información estructurada por el Worker AI, incluyendo las columnas definidas para la actividad. | #13 integracion (INTEGRATION_NOT_VERIFIED)<br>#18 tabla_verificar (UI: tabla) | NOT_RUN |
| 18 | Validar la posibilidad de seleccionar un registro de la tabla para editarlo. | Se habilita el formulario de edición correspondiente al registro seleccionado. | #19 tabla_abrir_fila (UI: editar fila) | NOT_RUN |
| 19 | Validar el formulario de edición para Línea Generales – Movimiento Póliza Nueva. | La Forma de Consulta se encuentra asignada automáticamente como Identificación de Tomador y no permite modificación. | #20 verificar (UI: aserciones) | NOT_RUN |
| 20 | Validar los campos disponibles en el formulario de edición. | Se presentan como obligatorios Tipo de Documento Tomador y Número de Documento Tomador. | #21 verificar (UI: aserciones) | NOT_RUN |
| 21 | Seleccionar Tipo de Documento Tomador = NIT. | Se muestra el campo Dígito de Verificación como campo no editable y asociado al tipo de identificación seleccionado. | #22 diligenciar (UI: diligenciar + post-condición) | NOT_RUN |
| 22 | Intentar cerrar/confirmar el formulario sin diligenciar los campos obligatorios. | El sistema mantiene abierto el formulario y evita confirmar el registro mientras los campos obligatorios no se encuentren diligenciados. | #23 dialogo_confirmar (UI: confirmar pop-up) | NOT_RUN |
| 23 | Diligenciar los campos obligatorios y confirmar la edición. | El registro queda actualizado en la tabla Pólizas asociadas a la solicitud con la información diligenciada. | #24 diligenciar (UI: diligenciar + post-condición)<br>#25 dialogo_confirmar (UI: confirmar pop-up) | NOT_RUN |
| 24 | Validar la opción para agregar un nuevo registro. | Se presenta el formulario de adición con las reglas correspondientes a Línea Generales y al Tipo de Movimiento seleccionado. | #26 tabla_agregar (UI: agregar fila) | NOT_RUN |
| 25 | Agregar un registro válido y confirmar. | El nuevo registro queda incorporado en la colección Pólizas asociadas a la solicitud. | #27 diligenciar (UI: diligenciar + post-condición)<br>#28 dialogo_confirmar (UI: confirmar pop-up) | NOT_RUN |
| 26 | Seleccionar un registro y ejecutar la opción de eliminación. | El registro seleccionado es eliminado de la colección de pólizas asociadas. | #29 tabla_eliminar_fila (UI: eliminar fila) | NOT_RUN |
| 27 | Validar el campo Observaciones. | El analista dispone de un campo editable para registrar observaciones relacionadas con la estructuración del caso. | #30 verificar (UI: aserciones) | NOT_RUN |
| 28 | Validar las pestañas Documentos de la solicitud y Seguimiento. | La pestaña de documentos permite consultar los soportes asociados y la pestaña Seguimiento presenta la trazabilidad del caso. | #31 verificar (UI: aserciones)<br>#32 no_automatizado (NOT_AUTOMATED) | NOT_RUN |
| 29 | Intentar modificar Línea, Ramo, Tipo de Solicitud, Sucursal o Tipo de Radicación desde Estructurar Información. | Los datos maestros permanecen en solo lectura y no pueden ser modificados por el analista. | #33 verificar (UI: aserciones) | NOT_RUN |

## HU06-CP02 — SDE - CEL - HU06 - Validar radicación Masiva para línea Autos y estructuración por Placa

- **Requisitos:** Requirement 228991: SDE - CEL - RAD - HU06 - FRM - Inicio; Requirement 228992: SDE - CEL - RAD - HU06 - ACC - Inicio; Requirement 230836: SDE - CEL - RAD - HU06 - COM - ¿Masivo?; Requirement 230841: SDE - CEL - RAD - HU06 - ACC - Estructurar Información; Requirement 230842: SDE - CEL - RAD - HU06 - FRM - Estructurar Información; Requirement 230843: SDE - CEL - RAD - HU06 - USR - Estructurar Información; Requirement 230849: SDE - CEL - RAD - HU06 - ROL - Analista de Solicitudes
- **Familia:** F-MASIVO-ESTRUCTURAR · **Fase:** 2 · **Prioridad:** P2
- **Escenario:** `escenarios/4-hu06-cp02.yaml`
- **Brechas:** ENV-03 (ENVIRONMENT_GAP), BUG-01 (FUNCTIONAL_AMBIGUITY), BUG-03 (FUNCTIONAL_DEFECT), BUG-04 (FUNCTIONAL_DEFECT), DATA-06 (TEST_DATA_GAP), UI-03 (UI_CAPABILITY_GAP), UI-05 (UI_CAPABILITY_GAP), INT-02 (INTEGRATION_VISIBILITY_GAP), FUNC-10 (FUNCTIONAL_AMBIGUITY), UI-10 (UI_CAPABILITY_GAP)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P9 (mixto), P12 (mixto)
- **Estado:** BLOCKED (no ejecutado) — Prerrequisitos faltantes (ver bloqueos). TEST_DATA INI-AUTOS-MASIVO: faltan SDE_AUTOS_MASIVO_MOVIMIENTO, SDE_AUTOS_PLACA, SDE_AUTOS_PLACA_2

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar la radicación Masiva para la línea Autos, verificando el formulario inicial, la ruta Masiva y las reglas de Estructurar Información relacionadas con la consulta por Placa. | Agregado del CP | BLOCKED |
| 2 | Ingresar al ambiente Bizagi mediante la URL: https://test-aiprocesos-sde.bizagi.com/ | El ambiente de pruebas se encuentra disponible y permite iniciar una nueva Radicación. | #1 iniciar_sesion (UI: login real)<br>#2 nuevo_caso (UI: abrir formulario) | BLOCKED |
| 3 | Crear un nuevo caso y seleccionar Línea = Autos, junto con un Ramo y Tipo de Solicitud válidos. | El formulario presenta la información correspondiente a la configuración seleccionada. | #2 nuevo_caso (UI: abrir formulario)<br>#3 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 4 | Seleccionar una Sucursal válida. | La Sucursal queda registrada y permite continuar con el diligenciamiento del formulario. | #4 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 5 | Seleccionar Tipo de Radicación = Masivo. | Se habilitan la Descripción de la Solicitud (Masiva/Múltiple) y la sección Documentos Anexos. | #5 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 6 | Validar el texto de ayuda de Masivo. | Se presenta el texto correspondiente a la modalidad Masivo para la línea Autos: “Masivo: Solicitud asociada a más de una póliza.” | #6 verificar (UI: aserciones) | BLOCKED |
| 7 | Diligenciar la narrativa, los campos obligatorios y los documentos requeridos. | El formulario queda diligenciado y permite crear la solicitud. | #7 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 8 | Crear el caso. | Se crea correctamente la solicitud masiva. | #8 pulsar (UI: botón) | BLOCKED |
| 9 | Validar la compuerta ¿Masivo?. | El caso toma la transición Masivo y continúa hacia el procesamiento del Worker AI. | #10 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#11 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 10 | Validar la llegada a Estructurar Información. | El caso queda disponible para el Analista Centro de Expedición en la actividad Estructurar Información. | #9 iniciar_sesion (UI: login real)<br>#12 abrir_caso (UI: abrir caso por número) | BLOCKED |
| 11 | Validar encabezado, Tipo de Consulta e Información a Consultar. | Se muestran los datos maestros en solo lectura, Tipo de Radicación Masivo, Sucursal y narrativa original de la solicitud. | #13 verificar (UI: aserciones) | BLOCKED |
| 12 | Validar la tabla Pólizas asociadas a la solicitud. | La tabla presenta los registros estructurados por el Worker AI y las columnas correspondientes a la información de consulta. | #11 integracion (INTEGRATION_NOT_VERIFIED)<br>#14 tabla_verificar (UI: tabla) | BLOCKED |
| 13 | Seleccionar un registro para editarlo. | Se presenta el formulario de edición correspondiente al registro seleccionado. | #15 tabla_abrir_fila (UI: editar fila) | BLOCKED |
| 14 | Validar las opciones disponibles para la Forma de Consulta de acuerdo con la configuración del caso. | La Forma de Consulta y sus campos se presentan de acuerdo con la Línea, Tipo de Solicitud/Movimiento y reglas configuradas. | #16 verificar (UI: aserciones) | BLOCKED |
| 15 | Seleccionar la Forma de Consulta Placa, cuando la configuración del caso corresponda a esta opción. | Se muestra únicamente el campo Placa para diligenciar la información de consulta. | #16 verificar (UI: aserciones) | BLOCKED |
| 16 | Intentar confirmar el registro sin diligenciar Placa. | El formulario no permite confirmar el registro mientras el campo obligatorio Placa se encuentre vacío. | #17 intentar_diligenciar (UI: prueba negativa de campo)<br>#18 dialogo_confirmar (UI: confirmar pop-up) | BLOCKED |
| 17 | Ingresar una Placa con caracteres alfanuméricos dentro de la longitud permitida. | El valor ingresado es aceptado y el registro puede ser confirmado. | #20 intentar_diligenciar (UI: prueba negativa de campo)<br>#21 dialogo_confirmar (UI: confirmar pop-up) | BLOCKED |
| 18 | Ingresar una Placa que supere los 6 caracteres. | El sistema impide registrar un valor que supere la longitud máxima definida para el campo Placa. | #19 intentar_diligenciar (UI: prueba negativa de campo) | BLOCKED |
| 19 | Confirmar la edición. | La información de consulta queda actualizada en la tabla Pólizas asociadas a la solicitud. | #21 dialogo_confirmar (UI: confirmar pop-up) | BLOCKED |
| 20 | Agregar un nuevo registro mediante el formulario de adición. | El formulario presenta las mismas reglas de visibilidad y obligatoriedad correspondientes al caso. | #22 tabla_agregar (UI: agregar fila) | BLOCKED |
| 21 | Diligenciar y confirmar un registro válido. | El nuevo registro queda almacenado en la tabla de pólizas asociadas. | #23 diligenciar (UI: diligenciar + post-condición)<br>#24 dialogo_confirmar (UI: confirmar pop-up) | BLOCKED |
| 22 | Validar Observaciones, Documentos y Seguimiento. | Las tres secciones presentan la información correspondiente al caso y la trazabilidad registrada. | #25 abrir_pestana (UI: pestaña + contenido)<br>#26 abrir_pestana (UI: pestaña + contenido)<br>#27 verificar (UI: aserciones) | BLOCKED |

## HU06-CP03 — SDE - CEL - HU06 - Validar radicación Masiva de Cumplimiento sin propiedad Póliza RCE

- **Requisitos:** Requirement 228991: SDE - CEL - RAD - HU06 - FRM - Inicio; Requirement 228992: SDE - CEL - RAD - HU06 - ACC - Inicio; Requirement 230836: SDE - CEL - RAD - HU06 - COM - ¿Masivo?; Requirement 230841: SDE - CEL - RAD - HU06 - ACC - Estructurar Información; Requirement 230842: SDE - CEL - RAD - HU06 - FRM - Estructurar Información; Requirement 230843: SDE - CEL - RAD - HU06 - USR - Estructurar Información; Requirement 230849: SDE - CEL - RAD - HU06 - ROL - Analista de Solicitudes
- **Familia:** F-MASIVO-ESTRUCTURAR · **Fase:** 2 · **Prioridad:** P2
- **Escenario:** `escenarios/5-hu06-cp03.yaml`
- **Brechas:** ENV-03 (ENVIRONMENT_GAP), BUG-03 (FUNCTIONAL_DEFECT), BUG-04 (FUNCTIONAL_DEFECT), DATA-07 (TEST_DATA_GAP), UI-03 (UI_CAPABILITY_GAP), UI-05 (UI_CAPABILITY_GAP), INT-02 (INTEGRATION_VISIBILITY_GAP), FUNC-02 (FUNCTIONAL_AMBIGUITY), OBS-11 (FUNCTIONAL_AMBIGUITY), FUNC-10 (FUNCTIONAL_AMBIGUITY), UI-10 (UI_CAPABILITY_GAP)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P9 (mixto)
- **Estado:** BLOCKED (no ejecutado) — Prerrequisitos faltantes (ver bloqueos). TEST_DATA INI-CUMPL-MASIVO-SIN-RCE: faltan SDE_CUMPL_RAMO_SIN_RCE, SDE_CUMPL_POLIZA_SIN_RCE, SDE_CUMPL_RAMO_RCE, SDE_CUMPL_POLIZA_RCE

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar la radicación Masiva de una solicitud de Cumplimiento cuyo Ramo no tenga la propiedad Póliza RCE, verificando que Estructurar Información presente la pregunta ¿Requiere modificar RCE? y aplique correctamente sus reglas de obligatoriedad. | Agregado del CP | BLOCKED |
| 2 | Ingresar al ambiente Bizagi mediante la URL: https://test-aiprocesos-sde.bizagi.com/ | El ambiente de pruebas se encuentra disponible y permite iniciar una nueva Radicación. | #1 iniciar_sesion (UI: login real)<br>#2 nuevo_caso (UI: abrir formulario) | BLOCKED |
| 3 | Crear un nuevo caso seleccionando Línea = Cumplimiento (Fianzas) y un Ramo sin propiedad Póliza RCE. Seleccionar un Tipo de Solicitud/Movimiento válido. | El formulario presenta la configuración correspondiente al Ramo seleccionado. | #2 nuevo_caso (UI: abrir formulario)<br>#3 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 4 | Seleccionar una Sucursal válida. | La Sucursal queda registrada y se habilita la continuación del formulario. | #4 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 5 | Seleccionar Tipo de Radicación = Masivo. | Se habilitan los campos correspondientes a la modalidad Masivo. | #5 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 6 | Validar el texto de ayuda. | Se presenta: “Masivo: Solicitud asociada a más de una póliza de cumplimiento y/o RCE.” | #6 verificar (UI: aserciones) | BLOCKED |
| 7 | Diligenciar la descripción narrativa y los documentos requeridos. | La información queda registrada y el formulario permite crear el caso. | #7 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 8 | Crear la solicitud. | Se crea correctamente una solicitud con Tipo de Radicación Masivo. | #8 pulsar (UI: botón) | BLOCKED |
| 9 | Validar la compuerta ¿Masivo?. | La compuerta identifica Masivo y direcciona el caso hacia el Worker AI y posteriormente hacia Estructurar Información. | #10 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#11 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 10 | Ingresar a Estructurar Información. | El caso se encuentra disponible para el Analista Centro de Expedición. | #9 iniciar_sesion (UI: login real)<br>#12 abrir_caso (UI: abrir caso por número) | BLOCKED |
| 11 | Validar los datos maestros. | Línea, Ramo, Tipo de Movimiento, Sucursal y Tipo de Radicación se muestran correctamente y permanecen en solo lectura. | #13 verificar (UI: aserciones) | BLOCKED |
| 12 | Seleccionar un registro de la tabla para editarlo. | Se presenta el formulario de edición correspondiente a la configuración de Cumplimiento. | #14 tabla_abrir_fila (UI: editar fila) | BLOCKED |
| 13 | Validar la Forma de Consulta para Cumplimiento – Movimiento Modificación. | La Forma de Consulta se establece como Número de póliza de acuerdo con las reglas documentadas. | #15 verificar (UI: aserciones) | BLOCKED |
| 14 | Validar el campo Número de póliza. | Se muestra el campo Número de póliza y este acepta únicamente valores numéricos con longitud entre 9 y 12 caracteres. | #16 intentar_diligenciar (UI: prueba negativa de campo) | BLOCKED |
| 15 | Intentar confirmar el registro sin diligenciar Número de póliza. | El formulario impide confirmar el registro mientras el campo obligatorio permanezca vacío. | #17 intentar_diligenciar (UI: prueba negativa de campo)<br>#18 dialogo_confirmar (UI: confirmar pop-up) | BLOCKED |
| 16 | Validar la pregunta ¿Requiere modificar RCE?. | Al tratarse de un Ramo sin propiedad Póliza RCE, se muestra la pregunta ¿Requiere modificar RCE?. | #19 verificar (UI: aserciones) | BLOCKED |
| 17 | Seleccionar ¿Requiere modificar RCE? = No. | Los campos Ramo RCE y Número de Póliza RCE no se muestran como campos requeridos para el registro. | #20 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 18 | Confirmar el registro con la respuesta No. | El registro se guarda correctamente sin exigir Ramo RCE ni Número de Póliza RCE. | #20 diligenciar (UI: diligenciar + post-condición)<br>#21 dialogo_confirmar (UI: confirmar pop-up) | BLOCKED |
| 19 | Editar nuevamente el registro y seleccionar ¿Requiere modificar RCE? = Sí. | Se habilitan los campos Ramo RCE y Número de Póliza RCE como campos obligatorios. | #22 tabla_abrir_fila (UI: editar fila)<br>#23 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 20 | Intentar confirmar sin diligenciar Ramo RCE y Número de Póliza RCE. | El sistema impide cerrar/confirmar el formulario mientras los campos obligatorios no estén diligenciados. | #24 dialogo_confirmar (UI: confirmar pop-up) | BLOCKED |
| 21 | Diligenciar Ramo RCE y un Número de Póliza RCE válido. | Los campos quedan diligenciados y el registro puede ser confirmado. | #25 diligenciar (UI: diligenciar + post-condición)<br>#27 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 22 | Validar Número de Póliza RCE. | El campo acepta únicamente valores numéricos con longitud entre 9 y 12 caracteres. | #26 intentar_diligenciar (UI: prueba negativa de campo) | BLOCKED |
| 23 | Confirmar el registro. | El registro actualizado queda almacenado en la tabla Pólizas asociadas a la solicitud con la información de RCE. | #28 dialogo_confirmar (UI: confirmar pop-up) | BLOCKED |
| 24 | Validar Observaciones. | El analista puede ingresar texto libre en el campo Observaciones. | #31 verificar (UI: aserciones) | BLOCKED |
| 25 | Validar Documentos de la solicitud y Seguimiento. | Los documentos asociados y la trazabilidad del caso se encuentran disponibles para consulta. | #29 abrir_pestana (UI: pestaña + contenido)<br>#30 abrir_pestana (UI: pestaña + contenido) | BLOCKED |

## HU06-CP04 — SDE - CEL - HU06 - Validar radicación Masiva de Cumplimiento con propiedad Póliza RCE

- **Requisitos:** Requirement 228991: SDE - CEL - RAD - HU06 - FRM - Inicio; Requirement 228992: SDE - CEL - RAD - HU06 - ACC - Inicio; Requirement 230836: SDE - CEL - RAD - HU06 - COM - ¿Masivo?; Requirement 230841: SDE - CEL - RAD - HU06 - ACC - Estructurar Información; Requirement 230842: SDE - CEL - RAD - HU06 - FRM - Estructurar Información; Requirement 230843: SDE - CEL - RAD - HU06 - USR - Estructurar Información; Requirement 230849: SDE - CEL - RAD - HU06 - ROL - Analista de Solicitudes
- **Familia:** F-MASIVO-ESTRUCTURAR · **Fase:** 2 · **Prioridad:** P2
- **Escenario:** `escenarios/6-hu06-cp04.yaml`
- **Brechas:** ENV-03 (ENVIRONMENT_GAP), BUG-03 (FUNCTIONAL_DEFECT), BUG-04 (FUNCTIONAL_DEFECT), DATA-07 (TEST_DATA_GAP), UI-03 (UI_CAPABILITY_GAP), UI-05 (UI_CAPABILITY_GAP), INT-02 (INTEGRATION_VISIBILITY_GAP), FUNC-02 (FUNCTIONAL_AMBIGUITY), FUNC-05 (FUNCTIONAL_AMBIGUITY), OBS-11 (FUNCTIONAL_AMBIGUITY), FUNC-10 (FUNCTIONAL_AMBIGUITY), UI-10 (UI_CAPABILITY_GAP)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P9 (mixto), P15 (no automatizado)
- **Estado:** BLOCKED (no ejecutado) — Prerrequisitos faltantes (ver bloqueos). TEST_DATA INI-CUMPL-MASIVO-CON-RCE: faltan SDE_CUMPL_RAMO_CON_RCE, SDE_CUMPL_MOVIMIENTO, SDE_CUMPL_POLIZA_CON_RCE, SDE_CUMPL_POLIZA_CON_RCE_2

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar la radicación Masiva de una solicitud de Cumplimiento cuyo Ramo tenga la propiedad Póliza RCE, verificando que la actividad Estructurar Información aplique correctamente la condición de los campos asociados a RCE. | Agregado del CP | BLOCKED |
| 2 | Ingresar al ambiente Bizagi mediante la URL: https://test-aiprocesos-sde.bizagi.com/ | El ambiente de pruebas se encuentra disponible. | #1 iniciar_sesion (UI: login real)<br>#2 nuevo_caso (UI: abrir formulario) | BLOCKED |
| 3 | Crear un nuevo caso seleccionando Línea = Cumplimiento (Fianzas) y un Ramo con propiedad Póliza RCE. | El formulario presenta la configuración correspondiente al Ramo seleccionado. | #2 nuevo_caso (UI: abrir formulario)<br>#3 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 4 | Seleccionar una Sucursal válida. | La Sucursal queda registrada correctamente. | #4 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 5 | Seleccionar Tipo de Radicación = Masivo. | Se habilitan los campos correspondientes a la modalidad Masivo. | #5 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 6 | Validar el texto de ayuda. | Se muestra “Masivo: Solicitud asociada a más de una póliza de cumplimiento y/o RCE.”, con ortografía y capitalización correctas. | #6 verificar (UI: aserciones) | BLOCKED |
| 7 | Diligenciar la narrativa y documentos requeridos. | La información queda registrada y permite crear el caso. | #7 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 8 | Crear la solicitud. | Se crea correctamente el caso de radicación Masiva. | #8 pulsar (UI: botón) | BLOCKED |
| 9 | Validar la compuerta ¿Masivo?. | El caso toma la transición Masivo y continúa hacia el Worker AI. | #10 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#11 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 10 | Ingresar a Estructurar Información. | El caso se encuentra disponible para el Analista Centro de Expedición. | #9 iniciar_sesion (UI: login real)<br>#12 abrir_caso (UI: abrir caso por número) | BLOCKED |
| 11 | Validar el encabezado y la información de radicación. | Los datos maestros, Tipo de Radicación y Sucursal se visualizan correctamente y permanecen en solo lectura. | #13 verificar (UI: aserciones) | BLOCKED |
| 12 | Seleccionar un registro de la tabla para editarlo. | Se presenta el formulario de edición con las reglas correspondientes al Ramo y Movimiento seleccionados. | #14 tabla_abrir_fila (UI: editar fila) | BLOCKED |
| 13 | Validar la Forma de Consulta. | La Forma de Consulta se presenta de acuerdo con la regla correspondiente a Línea Cumplimiento y Tipo de Movimiento. | #15 verificar (UI: aserciones) | BLOCKED |
| 14 | Validar la información relacionada con RCE. | Al corresponder a un Ramo con propiedad Póliza RCE, no se presenta la pregunta ¿Requiere modificar RCE? como condición para habilitar los campos RCE. | #16 verificar (UI: aserciones) | BLOCKED |
| 15 | Validar los campos Ramo RCE y Número de Póliza RCE. | Los campos se comportan de acuerdo con la condición de propiedad Póliza RCE definida para el Ramo y no se habilita una pregunta de modificación RCE que no corresponda a la configuración. | #17 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 16 | Validar Número de Póliza, cuando la Forma de Consulta corresponda a Número de póliza. | El campo acepta únicamente valores numéricos con longitud entre 9 y 12 caracteres. | #18 intentar_diligenciar (UI: prueba negativa de campo) | BLOCKED |
| 17 | Ingresar un valor no numérico en Número de Póliza. | El sistema impide registrar el valor no numérico en el campo. | #18 intentar_diligenciar (UI: prueba negativa de campo) | BLOCKED |
| 18 | Ingresar un Número de Póliza con longitud inferior o superior al rango permitido. | El sistema impide confirmar el registro mientras el valor no cumpla la longitud de 9 a 12 caracteres. | #19 intentar_diligenciar (UI: prueba negativa de campo)<br>#20 dialogo_confirmar (UI: confirmar pop-up) | BLOCKED |
| 19 | Confirmar un registro válido. | El registro queda almacenado correctamente en la tabla Pólizas asociadas a la solicitud. | #21 diligenciar (UI: diligenciar + post-condición)<br>#22 dialogo_confirmar (UI: confirmar pop-up) | BLOCKED |
| 20 | Agregar un nuevo registro. | El formulario de adición presenta las mismas reglas de visibilidad, obligatoriedad y validación correspondientes al caso. | #23 tabla_agregar (UI: agregar fila) | BLOCKED |
| 21 | Diligenciar un registro válido y confirmarlo. | El nuevo registro queda incorporado a la colección de pólizas asociadas. | #24 diligenciar (UI: diligenciar + post-condición)<br>#25 dialogo_confirmar (UI: confirmar pop-up) | BLOCKED |
| 22 | Validar la opción de eliminar un registro. | El registro seleccionado puede ser eliminado de la tabla. | #26 tabla_eliminar_fila (UI: eliminar fila) | BLOCKED |
| 23 | Validar Observaciones, Documentos y Seguimiento. | Las secciones se encuentran disponibles y presentan la información correspondiente al caso. | #27 abrir_pestana (UI: pestaña + contenido)<br>#28 abrir_pestana (UI: pestaña + contenido)<br>#29 verificar (UI: aserciones) | BLOCKED |

## HU06-CP05 — SDE - CEL - HU06 - Validar radicación Individual y ruta de la compuerta ¿Masivo?

- **Requisitos:** Requirement 228991: SDE - CEL - RAD - HU06 - FRM - Inicio; Feature 228994: SDE - CEL - RAD - HU06 - Flujo
- **Familia:** F-INDIVIDUAL-RUTA · **Fase:** 1 · **Prioridad:** P1
- **Escenario:** `escenarios/1-hu06-cp05.yaml`
- **Brechas:** ENV-03 (ENVIRONMENT_GAP), BUG-02 (FUNCTIONAL_AMBIGUITY), INT-01 (INTEGRATION_VISIBILITY_GAP), FUNC-10 (FUNCTIONAL_AMBIGUITY)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P6 (mixto), P9 (mixto)
- **Estado:** REAL_PASS_PARCIAL — Sesión y caso reales, sin fallos; 3 paso(s) de la matriz no verificados directamente: P1=NOT_AUTOMATED, P6=NOT_AUTOMATED, P9=INTEGRATION_NOT_VERIFIED

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar que una solicitud con Tipo de Radicación Individual tome la transición correspondiente en la compuerta ¿Masivo? y continúe por el flujo regular, sin ingresar a Estructurar Información. | Agregado del CP | NOT_AUTOMATED |
| 2 | Ingresar al ambiente Bizagi mediante la URL: https://test-aiprocesos-sde.bizagi.com/ | El ambiente de pruebas se encuentra disponible y permite iniciar una nueva Radicación. | #1 iniciar_sesion (UI: login real)<br>#2 nuevo_caso (UI: abrir formulario) | PASS |
| 3 | Crear un nuevo caso y seleccionar una combinación válida de Línea, Ramo y Tipo de Solicitud. | El formulario presenta la configuración correspondiente a los valores seleccionados. | #2 nuevo_caso (UI: abrir formulario)<br>#3 diligenciar (UI: diligenciar + post-condición) | PASS |
| 4 | Seleccionar una Sucursal válida. | La Sucursal queda registrada correctamente. | #4 diligenciar (UI: diligenciar + post-condición) | PASS |
| 5 | Seleccionar Tipo de Radicación = Individual. | El formulario cambia a la modalidad Individual y no presenta los elementos exclusivos de la modalidad Masivo que no correspondan a esta ruta. | #5 diligenciar (UI: diligenciar + post-condición) | PASS |
| 6 | Validar el formulario de inicio. | Los campos, etiquetas, opciones y textos visibles presentan correcta ortografía y capitalización. | #6 verificar (UI: aserciones)<br>#7 no_automatizado (NOT_AUTOMATED) | NOT_AUTOMATED |
| 7 | Diligenciar la información requerida para la radicación Individual y crear el caso. | El caso es creado con Tipo de Radicación = Individual. | #8 diligenciar (UI: diligenciar + post-condición)<br>#9 pulsar (UI: botón) | PASS |
| 8 | Validar la compuerta ¿Masivo?. | La compuerta identifica el valor Individual y selecciona la transición correspondiente al flujo regular. | #10 verificar_ruta (Actividad actual según Bizagi (buscador)) | PASS |
| 9 | Validar la actividad posterior a la compuerta. | El caso continúa por el camino regular hacia el flujo de consulta unitaria y no es enviado al Worker AI ni a Estructurar Información. | #10 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#11 integracion (INTEGRATION_NOT_VERIFIED) | INTEGRATION_NOT_VERIFIED |

## HU03-CP01 — SDE - CEL - HU03 - Validar radicación Individual de Autos mediante consulta por Placa

- **Requisitos:** Requirement 231435: SDE - CEL - RAD - GEN - Flujo; Requirement 231437: SDE - CEL - RAD - INT - Consultar SISE; Requirement 231510: SDE - CEL - RAD - SUB - Consultar información de la solicitud; Requirement 231440: SDE - CEL - RAD - INT - Consultar alertas intermediarios; Requirement 231442: SDE - CEL - RAD - FRM - Completar Información de la solicitud; Requirement 231443: SDE - CEL - RAD - ACC - Completar Información de la solicitud; Requirement 231506: SDE - CEL - RAD - COM - Acción a tomar
- **Familia:** F-INDIVIDUAL-CONSULTA · **Fase:** 2 · **Prioridad:** P2
- **Escenario:** `escenarios/7-hu03-cp01.yaml`
- **Brechas:** ENV-03 (ENVIRONMENT_GAP), BUG-02 (FUNCTIONAL_AMBIGUITY), DATA-08 (TEST_DATA_GAP), UI-06 (UI_CAPABILITY_GAP), UI-09 (UI_CAPABILITY_GAP), INT-01 (INTEGRATION_VISIBILITY_GAP), FUNC-03 (FUNCTIONAL_AMBIGUITY)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P6 (mixto), P10 (integracion), P11 (integracion), P12 (integracion), P18 (mixto), P19 (no automatizado), P21 (mixto), P22 (mixto)
- **Estado:** BLOCKED (no ejecutado) — Prerrequisitos faltantes (ver bloqueos). TEST_DATA PLACA-MULTIPOLIZA: faltan SDE_PLACA_MULTIPOLIZA, SDE_PLACA_MULTIPOLIZA_N

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar la radicación Individual para la línea Autos mediante consulta por Placa, verificando la integración con SISE, consulta de alertas, selección de una única póliza cuando existan varios resultados y las reglas del formulario Completar Información. | Agregado del CP | BLOCKED |
| 2 | Ingresar al ambiente Bizagi mediante la URL https://test-aiprocesos-sde.bizagi.com/. | El ambiente se encuentra disponible y permite autenticarse con un intermediario habilitado para la prueba. | #1 iniciar_sesion (UI: login real) | BLOCKED |
| 3 | Crear un nuevo caso de Radicación. | El formulario de inicio se presenta correctamente y permite diligenciar una nueva solicitud. | #2 nuevo_caso (UI: abrir formulario) | BLOCKED |
| 4 | Seleccionar Línea = Autos, Ramo, Tipo de Solicitud/Movimiento y Sucursal correspondientes a la data preparada para el caso. | El formulario presenta las opciones parametrizadas correspondientes a Autos. | #3 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 5 | Seleccionar Tipo de Radicación = Individual y Forma de Consulta = Placa. | El formulario habilita únicamente los campos correspondientes a la consulta individual por Placa. | #4 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 6 | Validar caracterización, ortografía y capitalización del formulario de inicio. | Las etiquetas, mensajes, campos, obligatoriedades, tipos de control y textos se presentan conforme al requerimiento, sin errores ortográficos ni inconsistencias de mayúsculas/minúsculas. | #5 verificar (UI: aserciones)<br>#6 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 7 | Ingresar una Placa válida asociada a más de una póliza disponible en SISE y completar los campos/documentos obligatorios parametrizados. | El formulario queda diligenciado con información válida y permite crear la solicitud. | #7 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 8 | Seleccionar Crear e identificar el número único del caso. | Se genera correctamente un número de caso y la información registrada queda asociada a la radicación. | #8 pulsar (UI: botón) | BLOCKED |
| 9 | Validar el paso por la compuerta ¿Masivo?. | Al corresponder a una radicación Individual, el caso continúa por el camino No/Individual y no se dirige a Estructurar Información. | #9 verificar_ruta (Actividad actual según Bizagi (buscador)) | BLOCKED |
| 10 | Validar la ejecución del subproceso Realizar consultas / Consultar información de la solicitud. | Se ejecuta la consulta correspondiente y se envía al servicio SISE la Placa registrada como criterio de búsqueda. | #10 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 11 | Validar la respuesta de la integración. | SISE retorna las pólizas vigentes asociadas a la Placa y la información correspondiente queda almacenada para continuar el flujo. | #10 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 12 | Validar la ejecución de Consultar alertas Intermediarios. | Se consulta la clave del intermediario y se obtiene su información de alertas antes de asignar Completar Información. | #11 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 13 | Validar la asignación de Completar Información. | La actividad queda asignada al intermediario correspondiente y presenta el encabezado precargado con los datos de la solicitud. | #12 abrir_caso (UI: abrir caso por número) | BLOCKED |
| 14 | Validar la tabla Seleccione la póliza asociada a la solicitud. | Se muestran todas las pólizas retornadas para la Placa y la tabla permite seleccionar únicamente un registro. | #13 tabla_verificar (UI: tabla)<br>#14 tabla_seleccionar_fila (UI: seleccionar fila (única))<br>#15 tabla_seleccionar_fila (UI: seleccionar fila (única)) | BLOCKED |
| 15 | Seleccionar una de las pólizas retornadas. | Se visualizan los datos de la póliza seleccionada, Tomador, Asegurado e Información del Vehículo correspondientes exclusivamente al registro seleccionado. | #15 tabla_seleccionar_fila (UI: seleccionar fila (única)) | BLOCKED |
| 16 | Validar editabilidad de la información precargada. | Los datos retornados por SISE permanecen en solo lectura, excepto aquellos definidos expresamente como editables. | #16 verificar (UI: aserciones) | BLOCKED |
| 17 | Validar la regla ¿Requiere actualizar el correo electrónico?. | Al seleccionar Sí, se habilita Nuevo correo Electrónico de Facturación como obligatorio; al seleccionar No, no se exige un nuevo correo. | #17 diligenciar (UI: diligenciar + post-condición)<br>#18 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 18 | Validar Comentarios y tabla de documentos. | El campo de comentarios se encuentra disponible y la tabla permite adicionar documentos según la parametrización correspondiente. | #19 verificar (UI: aserciones)<br>#20 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 19 | Validar ortografía, capitalización, etiquetas y estructura completa de Completar Información. | Todos los grupos, campos, mensajes, botones y nombres visibles mantienen la nomenclatura funcional definida. | #21 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 20 | Validar los botones disponibles para el escenario exitoso. | Se presentan únicamente Desistir Solicitud y Confirmar Radicación. | #22 verificar (UI: aserciones) | BLOCKED |
| 21 | Seleccionar Confirmar Radicación. | La información requerida queda almacenada y la decisión de continuar queda registrada. | #23 pulsar (UI: botón)<br>#24 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#25 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 22 | Validar la compuerta Acción a tomar. | La compuerta evalúa Continuar solicitud y direcciona el caso hacia la etapa de análisis. | #24 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#25 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |

## HU03-CP02 — SDE - CEL - HU03 - alidar radicación Individual de Autos mediante consulta por Póliza

- **Requisitos:** Requirement 231435: SDE - CEL - RAD - GEN - Flujo; Requirement 231437: SDE - CEL - RAD - INT - Consultar SISE; Requirement 231510: SDE - CEL - RAD - SUB - Consultar información de la solicitud; Requirement 231440: SDE - CEL - RAD - INT - Consultar alertas intermediarios; Requirement 231442: SDE - CEL - RAD - FRM - Completar Información de la solicitud; Requirement 231443: SDE - CEL - RAD - ACC - Completar Información de la solicitud; Requirement 231506: SDE - CEL - RAD - COM - Acción a tomar
- **Familia:** F-INDIVIDUAL-CONSULTA · **Fase:** 1 · **Prioridad:** P1
- **Escenario:** `escenarios/2-hu03-cp02.yaml`
- **Brechas:** ENV-03 (ENVIRONMENT_GAP), BUG-02 (FUNCTIONAL_AMBIGUITY), DATA-09 (TEST_DATA_GAP), DATA-05 (TEST_DATA_GAP), UI-01 (UI_CAPABILITY_GAP), INT-01 (INTEGRATION_VISIBILITY_GAP), FUNC-03 (FUNCTIONAL_AMBIGUITY)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P6 (mixto), P10 (integracion), P11 (mixto), P12 (integracion), P17 (mixto), P18 (no automatizado), P20 (mixto)
- **Estado:** BLOCKED (no ejecutado) — Prerrequisitos faltantes (ver bloqueos). TEST_DATA POL-AUTOS-VIGENTE: faltan SDE_AUTOS_POLIZA

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar la consulta individual de una póliza de Autos, verificando la integración con SISE, precarga de información de póliza, Tomador, Asegurado y vehículo, y las reglas de Completar Información. | Agregado del CP | BLOCKED |
| 2 | Ingresar a Bizagi mediante https://test-aiprocesos-sde.bizagi.com/. | El ambiente permite iniciar la radicación. | #1 iniciar_sesion (UI: login real)<br>#2 nuevo_caso (UI: abrir formulario) | BLOCKED |
| 3 | Crear un nuevo caso de Radicación. | El formulario de inicio se presenta correctamente y permite diligenciar una nueva solicitud. | #2 nuevo_caso (UI: abrir formulario) | BLOCKED |
| 4 | Seleccionar Línea = Autos, Ramo, Tipo de Solicitud/Movimiento y Sucursal correspondientes a la data preparada para el caso. | El formulario presenta las opciones parametrizadas correspondientes a Autos. | #3 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 5 | Seleccionar Tipo de Radicación = Individual y Forma de Consulta = Numero de Poliza. | Se habilita el campo Número de póliza y se presentan únicamente los campos aplicables al escenario. | #4 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 6 | Validar reglas, obligatoriedad, tipo de dato, ortografía y capitalización. | El formulario presenta correctamente la caracterización funcional de cada campo. | #5 verificar (UI: aserciones)<br>#6 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 7 | Ingresar una póliza válida de Autos asociada al intermediario y completar los campos/documentos obligatorios parametrizados. | El formulario queda diligenciado con información válida y permite crear la solicitud. | #7 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 8 | Seleccionar Crear e identificar el número único del caso. | Se genera correctamente un número de caso y la información registrada queda asociada a la radicación. | #8 pulsar (UI: botón) | BLOCKED |
| 9 | Validar el paso por la compuerta ¿Masivo?. | Al corresponder a una radicación Individual, el caso continúa por el camino No/Individual y no se dirige a Estructurar Información. | #9 verificar_ruta (Actividad actual según Bizagi (buscador)) | BLOCKED |
| 10 | Validar la ejecución del subproceso Realizar consultas / Consultar información de la solicitud. | Se ejecuta la consulta correspondiente y se envía al servicio SISE la poliza registrada como criterio de búsqueda. | #10 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 11 | Validar la respuesta de la integración. | SISE retorna la póliza vigente y la información correspondiente queda almacenada para continuar el flujo. | #10 integracion (INTEGRATION_NOT_VERIFIED)<br>#13 verificar (UI: aserciones) | BLOCKED |
| 12 | Validar la ejecución de Consultar alertas Intermediarios. | Se consulta la clave del intermediario y se obtiene su información de alertas antes de asignar Completar Información. | #11 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 13 | Validar la asignación de Completar Información. | La actividad queda asignada al intermediario correspondiente y presenta el encabezado precargado con los datos de la solicitud. | #12 abrir_caso (UI: abrir caso por número) | BLOCKED |
| 14 | Validar Información de Póliza, Tomador y Asegurado. | La información recuperada desde SISE es visible y permanece en solo lectura. | #13 verificar (UI: aserciones) | BLOCKED |
| 15 | Validar Información del Vehículo. | Se presentan Placa y demás datos del vehículo relacionados con la póliza consultada, de acuerdo con la respuesta de SISE. | #14 verificar (UI: aserciones) | BLOCKED |
| 16 | Validar la actualización de correo electrónico. | Si se selecciona actualizar correo, el nuevo correo se habilita y se vuelve obligatorio. | #15 diligenciar (UI: diligenciar + post-condición)<br>#16 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 17 | Validar Comentarios y documentos. | Ambas secciones se encuentran disponibles y permiten registrar información según las reglas configuradas. | #17 verificar (UI: aserciones)<br>#18 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 18 | Validar ortografía, capitalización y presentación del formulario. | Los nombres de campos, grupos, mensajes y botones presentan la nomenclatura definida. | #19 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 19 | Validar los botones disponibles para el escenario exitoso. | Se presentan únicamente Desistir Solicitud y Confirmar Radicación. | #20 verificar (UI: aserciones) | BLOCKED |
| 20 | Confirmar la radicación. | La información queda almacenada y el caso toma la decisión Continuar solicitud. | #21 pulsar (UI: botón)<br>#22 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#23 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 21 | Validar el avance del flujo. | El caso continúa hacia Análisis. | #22 verificar_ruta (Actividad actual según Bizagi (buscador)) | BLOCKED |

## HU03-CP03 — SDE - CEL - HU03 - Validar radicación Individual de Generales mediante consulta por Póliza

- **Requisitos:** Requirement 231435: SDE - CEL - RAD - GEN - Flujo; Requirement 231437: SDE - CEL - RAD - INT - Consultar SISE; Requirement 231510: SDE - CEL - RAD - SUB - Consultar información de la solicitud; Requirement 231440: SDE - CEL - RAD - INT - Consultar alertas intermediarios; Requirement 231442: SDE - CEL - RAD - FRM - Completar Información de la solicitud; Requirement 231443: SDE - CEL - RAD - ACC - Completar Información de la solicitud; Requirement 231506: SDE - CEL - RAD - COM - Acción a tomar
- **Familia:** F-INDIVIDUAL-CONSULTA · **Fase:** 2 · **Prioridad:** P2
- **Escenario:** `escenarios/8-hu03-cp03.yaml`
- **Brechas:** ENV-03 (ENVIRONMENT_GAP), BUG-02 (FUNCTIONAL_AMBIGUITY), DATA-10 (TEST_DATA_GAP), UI-09 (UI_CAPABILITY_GAP), INT-01 (INTEGRATION_VISIBILITY_GAP), FUNC-03 (FUNCTIONAL_AMBIGUITY), FUNC-08 (FUNCTIONAL_AMBIGUITY)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P6 (mixto), P10 (integracion), P11 (integracion), P12 (integracion), P17 (mixto), P18 (no automatizado), P20 (mixto), P21 (mixto)
- **Estado:** BLOCKED (no ejecutado) — Prerrequisitos faltantes (ver bloqueos). TEST_DATA POL-GENERALES-VIGENTE: faltan SDE_GEN_POLIZA

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar una radicación Individual de la línea Generales consultada por Número de póliza, comprobando la precarga de datos desde SISE y las reglas aplicables en Completar Información. | Agregado del CP | BLOCKED |
| 2 | Ingresar a Bizagi mediante https://test-aiprocesos-sde.bizagi.com/. | El ambiente permite iniciar la radicación. | #1 iniciar_sesion (UI: login real) | BLOCKED |
| 3 | Crear un nuevo caso de Radicación. | El formulario de inicio se presenta correctamente y permite diligenciar una nueva solicitud. | #2 nuevo_caso (UI: abrir formulario) | BLOCKED |
| 4 | Seleccionar Línea = General, Ramo, Tipo de Solicitud/Movimiento = Modificacion. y Sucursal correspondientes a la data preparada para el caso. | El formulario presenta las opciones parametrizadas correspondientes a Autos. | #3 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 5 | Seleccionar Tipo de Radicación = Individual. | Se habilita el campo Número de póliza y se presentan únicamente los campos aplicables al escenario. | #4 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 6 | Validar reglas, obligatoriedad, tipo de dato, ortografía y capitalización. | El formulario presenta correctamente la caracterización funcional de cada campo. | #5 verificar (UI: aserciones)<br>#6 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 7 | Ingresar una póliza existente asociada al intermediario y completar los campos/documentos obligatorios parametrizados. | El formulario queda diligenciado con información válida y permite crear la solicitud. | #7 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 8 | Seleccionar Crear e identificar el número único del caso. | Se genera correctamente un número de caso y la información registrada queda asociada a la radicación. | #8 pulsar (UI: botón) | BLOCKED |
| 9 | Validar el paso por la compuerta ¿Masivo?. | Al corresponder a una radicación Individual, el caso continúa por el camino No/Individual y no se dirige a Estructurar Información. | #9 verificar_ruta (Actividad actual según Bizagi (buscador)) | BLOCKED |
| 10 | Validar la ejecución del subproceso Realizar consultas / Consultar información de la solicitud. | Se ejecuta la consulta correspondiente y se envía al servicio SISE la poliza registrada como criterio de búsqueda. | #10 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 11 | Validar la respuesta de la integración. | SISE retorna las póliza vigente y la información correspondiente queda almacenada para continuar el flujo. | #10 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 12 | Validar la ejecución de Consultar alertas Intermediarios. | Se consulta la clave del intermediario y se obtiene su información de alertas antes de asignar Completar Información. | #11 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 13 | Validar la asignación de Completar Información. | La actividad queda asignada al intermediario correspondiente y presenta el encabezado precargado con los datos de la solicitud. | #12 abrir_caso (UI: abrir caso por número) | BLOCKED |
| 14 | Validar Información de Póliza, Tomador y Asegurado. | Los datos se muestran correctamente y permanecen no editables. | #13 verificar (UI: aserciones) | BLOCKED |
| 15 | Validar que no se presente información exclusiva de Autos. | No se muestra el bloque de Información del Vehículo para la línea Generales. | #14 verificar (UI: aserciones) | BLOCKED |
| 16 | Validar actualización del correo electrónico. | Si se solicita actualización, el campo Nuevo correo Electrónico de Facturación queda visible y obligatorio. | #15 diligenciar (UI: diligenciar + post-condición)<br>#16 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 17 | Validar Comentarios y documentos. | Las secciones permiten registrar la información correspondiente. | #17 verificar (UI: aserciones)<br>#18 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 18 | Validar etiquetas, textos, tildes y capitalización. | El formulario no presenta inconsistencias de nomenclatura ni ortografía. | #18 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 19 | Validar los botones disponibles para el escenario exitoso. | Se presentan únicamente Desistir Solicitud y Confirmar Radicación. | #19 verificar (UI: aserciones) | BLOCKED |
| 20 | Confirmar la radicación. | Se almacena la información y la decisión de continuar. | #20 pulsar (UI: botón)<br>#21 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#22 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 21 | Validar Acción a tomar. | El caso continúa hacia Análisis. | #21 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#22 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |

## HU03-CP04 — SDE - CEL - HU03 - Validar Póliza Nueva de Generales con Tomador existente

- **Requisitos:** Requirement 231435: SDE - CEL - RAD - GEN - Flujo; Requirement 231437: SDE - CEL - RAD - INT - Consultar SISE; Requirement 231510: SDE - CEL - RAD - SUB - Consultar información de la solicitud; Requirement 231440: SDE - CEL - RAD - INT - Consultar alertas intermediarios; Requirement 231442: SDE - CEL - RAD - FRM - Completar Información de la solicitud; Requirement 231443: SDE - CEL - RAD - ACC - Completar Información de la solicitud; Requirement 231506: SDE - CEL - RAD - COM - Acción a tomar
- **Familia:** F-INDIVIDUAL-CONSULTA · **Fase:** 2 · **Prioridad:** P2
- **Escenario:** `escenarios/9-hu03-cp04.yaml`
- **Brechas:** ENV-03 (ENVIRONMENT_GAP), BUG-02 (FUNCTIONAL_AMBIGUITY), DATA-11 (TEST_DATA_GAP), DATA-05 (TEST_DATA_GAP), UI-09 (UI_CAPABILITY_GAP), INT-01 (INTEGRATION_VISIBILITY_GAP), FUNC-03 (FUNCTIONAL_AMBIGUITY), FUNC-08 (FUNCTIONAL_AMBIGUITY), FUNC-09 (FUNCTIONAL_AMBIGUITY)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P6 (mixto), P10 (integracion), P11 (integracion), P12 (integracion), P14 (mixto), P15 (no automatizado), P17 (no automatizado), P19 (mixto), P20 (mixto)
- **Estado:** BLOCKED (no ejecutado) — Prerrequisitos faltantes (ver bloqueos). TEST_DATA TOMADOR-EXISTENTE: faltan SDE_TOMADOR_EXISTENTE_TIPO, SDE_TOMADOR_EXISTENTE_NUM

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar una solicitud de Póliza Nueva de Generales cuando el Tomador consultado ya existe en SISE, comprobando la precarga de sus datos y las reglas de edición aplicables. | Agregado del CP | BLOCKED |
| 2 | Ingresar a Bizagi mediante https://test-aiprocesos-sde.bizagi.com/. | El ambiente permite iniciar la radicación. | #1 iniciar_sesion (UI: login real) | BLOCKED |
| 3 | Crear un nuevo caso de Radicación. | El formulario de inicio se presenta correctamente y permite diligenciar una nueva solicitud. | #2 nuevo_caso (UI: abrir formulario) | BLOCKED |
| 4 | Seleccionar Línea = General, Ramo, Tipo de Solicitud/Movimiento = Nueva Poliza. y Sucursal correspondientes a la data preparada para el caso. | El formulario presenta las opciones parametrizadas correspondientes a Autos. | #3 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 5 | Seleccionar Tipo de Radicación = Individual. | Se habilita el campo Número de póliza y se presentan únicamente los campos aplicables al escenario. | #4 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 6 | Validar reglas, obligatoriedad, tipo de dato, ortografía y capitalización. | El formulario presenta correctamente la caracterización funcional de cada campo. | #4 diligenciar (UI: diligenciar + post-condición)<br>#5 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 7 | Ingresar Tipo y Número de Documento pertenecientes a un Tomador existente y completar los campos/documentos obligatorios parametrizados. | El formulario queda diligenciado con información válida y permite crear la solicitud. | #6 diligenciar (UI: diligenciar + post-condición)<br>#7 verificar (UI: aserciones) | BLOCKED |
| 8 | Seleccionar Crear e identificar el número único del caso. | Se genera correctamente un número de caso y la información registrada queda asociada a la radicación. | #8 pulsar (UI: botón) | BLOCKED |
| 9 | Validar el paso por la compuerta ¿Masivo?. | Al corresponder a una radicación Individual, el caso continúa por el camino No/Individual y no se dirige a Estructurar Información. | #9 verificar_ruta (Actividad actual según Bizagi (buscador)) | BLOCKED |
| 10 | Validar la ejecución del subproceso Realizar consultas / Consultar información de la solicitud. | Se ejecuta la consulta correspondiente y se envía al servicio SISE El numero de identificacion del tomador registrado como criterio de búsqueda. | #10 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 11 | Validar la respuesta de la integración. | SISE retorna los datos del tomador y la información correspondiente queda almacenada para continuar el flujo. | #10 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 12 | Validar la ejecución de Consultar alertas Intermediarios. | Se consulta la clave del intermediario y se obtiene su información de alertas antes de asignar Completar Información. | #11 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 13 | Validar la asignación de Completar Información. | La actividad queda asignada al intermediario correspondiente y presenta el encabezado precargado con los datos de la solicitud. | #12 abrir_caso (UI: abrir caso por número) | BLOCKED |
| 14 | Validar el comportamiento de ¿Requiere editar datos del tomador? conforme a la configuración de Póliza Nueva. | Al habilitar la edición se muestran como editables únicamente los datos autorizados para el escenario; al no habilitarla, la información permanece precargada. | #13 verificar (UI: aserciones)<br>#14 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 15 | Validar documentos requeridos para Póliza Nueva. | La tabla presenta los tipos documentales parametrizados y exige aquellos configurados como obligatorios. | #15 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 16 | Validar Comentarios. | El campo se encuentra disponible para diligenciamiento. | #16 verificar (UI: aserciones) | BLOCKED |
| 17 | Validar etiquetas, textos, tildes y capitalización. | El formulario no presenta inconsistencias de nomenclatura ni ortografía. | #15 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 18 | Validar los botones disponibles para el escenario exitoso. | Se presentan únicamente Desistir Solicitud y Confirmar Radicación. | #17 verificar (UI: aserciones) | BLOCKED |
| 19 | Confirmar la radicación. | Se almacena la información y la decisión de continuar. | #18 pulsar (UI: botón)<br>#19 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#20 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 20 | Validar Acción a tomar. | El caso continúa hacia Análisis. | #19 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#20 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |

## HU03-CP05 — SDE - CEL - HU03 - Validar Póliza Nueva de Generales con Tomador no existente

- **Requisitos:** Requirement 231435: SDE - CEL - RAD - GEN - Flujo; Requirement 231437: SDE - CEL - RAD - INT - Consultar SISE; Requirement 231510: SDE - CEL - RAD - SUB - Consultar información de la solicitud; Requirement 231440: SDE - CEL - RAD - INT - Consultar alertas intermediarios; Requirement 231442: SDE - CEL - RAD - FRM - Completar Información de la solicitud; Requirement 231443: SDE - CEL - RAD - ACC - Completar Información de la solicitud; Requirement 231506: SDE - CEL - RAD - COM - Acción a tomar
- **Familia:** F-INDIVIDUAL-CONSULTA · **Fase:** 2 · **Prioridad:** P2
- **Escenario:** `escenarios/10-hu03-cp05.yaml`
- **Brechas:** ENV-03 (ENVIRONMENT_GAP), BUG-02 (FUNCTIONAL_AMBIGUITY), DATA-12 (TEST_DATA_GAP), DATA-05 (TEST_DATA_GAP), UI-09 (UI_CAPABILITY_GAP), INT-01 (INTEGRATION_VISIBILITY_GAP), FUNC-03 (FUNCTIONAL_AMBIGUITY), FUNC-08 (FUNCTIONAL_AMBIGUITY), FUNC-09 (FUNCTIONAL_AMBIGUITY)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P6 (mixto), P10 (integracion), P11 (integracion), P12 (integracion), P14 (mixto), P15 (mixto), P16 (no automatizado), P18 (no automatizado), P20 (mixto), P21 (mixto)
- **Estado:** BLOCKED (no ejecutado) — Prerrequisitos faltantes (ver bloqueos). TEST_DATA TOMADOR-INEXISTENTE: faltan SDE_TOMADOR_INEXISTENTE_TIPO, SDE_TOMADOR_INEXISTENTE_NUM

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar una solicitud de Póliza Nueva cuando el Tomador no existe en SISE, comprobando el comportamiento del formulario, edición de información y documentos requeridos. | Agregado del CP | BLOCKED |
| 2 | Ingresar a Bizagi mediante https://test-aiprocesos-sde.bizagi.com/. | El ambiente permite iniciar la radicación. | #1 iniciar_sesion (UI: login real) | BLOCKED |
| 3 | Crear un nuevo caso de Radicación. | El formulario de inicio se presenta correctamente y permite diligenciar una nueva solicitud. | #2 nuevo_caso (UI: abrir formulario) | BLOCKED |
| 4 | Seleccionar Línea = General, Ramo, Tipo de Solicitud/Movimiento = Nueva Poliza. y Sucursal correspondientes a la data preparada para el caso. | El formulario presenta las opciones parametrizadas correspondientes a Autos. | #3 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 5 | Seleccionar Tipo de Radicación = Individual. | Se habilita el campo Número de póliza y se presentan únicamente los campos aplicables al escenario. | #4 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 6 | Validar reglas, obligatoriedad, tipo de dato, ortografía y capitalización. | El formulario presenta correctamente la caracterización funcional de cada campo. | #4 diligenciar (UI: diligenciar + post-condición)<br>#5 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 7 | Ingresar Tipo y Número de Documento correspondiente a una persona no existente en SISE. y completar los campos/documentos obligatorios parametrizados. | El formulario queda diligenciado con información válida y permite crear la solicitud. | #6 diligenciar (UI: diligenciar + post-condición)<br>#7 verificar (UI: aserciones) | BLOCKED |
| 8 | Seleccionar Crear e identificar el número único del caso. | Se genera correctamente un número de caso y la información registrada queda asociada a la radicación. | #8 pulsar (UI: botón) | BLOCKED |
| 9 | Validar el paso por la compuerta ¿Masivo?. | Al corresponder a una radicación Individual, el caso continúa por el camino No/Individual y no se dirige a Estructurar Información. | #9 verificar_ruta (Actividad actual según Bizagi (buscador)) | BLOCKED |
| 10 | Validar la ejecución del subproceso Realizar consultas / Consultar información de la solicitud. | Se ejecuta la consulta correspondiente y se envía al servicio SISE El numero de identificacion del tomador registrado como criterio de búsqueda. | #10 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 11 | Validar la respuesta de la integración. | SISE no retorna informacion de la Persona. | #10 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 12 | Validar la ejecución de Consultar alertas Intermediarios. | Se consulta la clave del intermediario y se obtiene su información de alertas antes de asignar Completar Información. | #11 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 13 | Validar la asignación de Completar Información. | La actividad queda asignada al intermediario correspondiente y presenta el encabezado precargado con los datos de la solicitud. | #12 abrir_caso (UI: abrir caso por número) | BLOCKED |
| 14 | Validar la activiad Completar Información para Póliza Nueva sin Tomador existente. | Se presenta la información disponible del formulario inicial y los campos permitidos para completar/ajustar los datos del Tomador. | #13 verificar (UI: aserciones)<br>#14 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 15 | Validar el comportamiento de ¿Requiere editar datos del tomador? conforme a la configuración de Póliza Nueva. | Al habilitar la edición se muestran como editables únicamente los datos autorizados para el escenario; al no habilitarla, la información permanece precargada. | #13 verificar (UI: aserciones)<br>#14 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 16 | Validar documentos requeridos para Póliza Nueva. | La tabla presenta los tipos documentales parametrizados y exige aquellos configurados como obligatorios. | #15 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 17 | Validar Comentarios. | El campo se encuentra disponible para diligenciamiento. | #16 verificar (UI: aserciones) | BLOCKED |
| 18 | Validar etiquetas, textos, tildes y capitalización. | El formulario no presenta inconsistencias de nomenclatura ni ortografía. | #15 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 19 | Validar los botones disponibles para el escenario exitoso. | Se presentan únicamente Desistir Solicitud y Confirmar Radicación. | #17 verificar (UI: aserciones) | BLOCKED |
| 20 | Confirmar la radicación. | Se almacena la información y la decisión de continuar. | #18 pulsar (UI: botón)<br>#19 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#20 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 21 | Validar Acción a tomar. | El caso continúa hacia Análisis. | #19 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#20 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |

## HU03-CP06 — SDE - CEL - HU03 - Validar Cumplimiento con Ramo asociado a Póliza RCE

- **Requisitos:** Requirement 231435: SDE - CEL - RAD - GEN - Flujo; Requirement 231437: SDE - CEL - RAD - INT - Consultar SISE; Requirement 231510: SDE - CEL - RAD - SUB - Consultar información de la solicitud; Requirement 231440: SDE - CEL - RAD - INT - Consultar alertas intermediarios; Requirement 231442: SDE - CEL - RAD - FRM - Completar Información de la solicitud; Requirement 231443: SDE - CEL - RAD - ACC - Completar Información de la solicitud; Requirement 231506: SDE - CEL - RAD - COM - Acción a tomar
- **Familia:** F-INDIVIDUAL-CONSULTA · **Fase:** 2 · **Prioridad:** P2
- **Escenario:** `escenarios/11-hu03-cp06.yaml`
- **Brechas:** ENV-03 (ENVIRONMENT_GAP), BUG-02 (FUNCTIONAL_AMBIGUITY), DATA-13 (TEST_DATA_GAP), UI-09 (UI_CAPABILITY_GAP), INT-01 (INTEGRATION_VISIBILITY_GAP), FUNC-02 (FUNCTIONAL_AMBIGUITY), FUNC-03 (FUNCTIONAL_AMBIGUITY), FUNC-08 (FUNCTIONAL_AMBIGUITY)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P6 (mixto), P10 (integracion), P11 (integracion), P12 (integracion), P17 (mixto), P18 (no automatizado), P20 (mixto), P21 (mixto)
- **Estado:** BLOCKED (no ejecutado) — Prerrequisitos faltantes (ver bloqueos). TEST_DATA POL-CUMPL-RCE: faltan SDE_CUMPL_MOVIMIENTO, SDE_CUMPL_RAMO_RCE, SDE_CUMPL_RAMO_CON_RCE, SDE_CUMPL_POLIZA_CON_RCE, SDE_CUMPL_RAMO_SIN_RCE, SDE_CUMPL_POLIZA_SIN_RCE, SDE_CUMPL_POLIZA_RCE

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar la radicación Individual de Cumplimiento cuando el Ramo contempla Póliza RCE, verificando las consultas independientes de póliza principal y RCE y la precarga de ambas informaciones. | Agregado del CP | BLOCKED |
| 2 | Ingresar a Bizagi mediante https://test-aiprocesos-sde.bizagi.com/. | El ambiente permite iniciar la radicación. | #1 iniciar_sesion (UI: login real) | BLOCKED |
| 3 | Crear un nuevo caso de Radicación. | El formulario de inicio se presenta correctamente y permite diligenciar una nueva solicitud. | #2 nuevo_caso (UI: abrir formulario) | BLOCKED |
| 4 | Seleccionar Línea = Cumpimiento, Ramo = Poliza RCE, Tipo de Solicitud/Movimiento y Sucursal correspondientes a la data preparada para el caso. | El formulario presenta las opciones parametrizadas correspondientes a Autos. | #3 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 5 | Seleccionar Tipo de Radicación = Individual. | Se habilita el campo Número de póliza y se presentan únicamente los campos aplicables al escenario. | #4 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 6 | Validar reglas, obligatoriedad, tipo de dato, ortografía y capitalización. | El formulario presenta correctamente la caracterización funcional de cada campo. | #4 diligenciar (UI: diligenciar + post-condición)<br>#5 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 7 | Ingresar Número de Póliza principal y completar los campos/documentos obligatorios parametrizados. | El formulario queda diligenciado con información válida y permite crear la solicitud. | #6 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 8 | Seleccionar Crear e identificar el número único del caso. | Se genera correctamente un número de caso y la información registrada queda asociada a la radicación. | #7 pulsar (UI: botón) | BLOCKED |
| 9 | Validar el paso por la compuerta ¿Masivo?. | Al corresponder a una radicación Individual, el caso continúa por el camino No/Individual y no se dirige a Estructurar Información. | #8 verificar_ruta (Actividad actual según Bizagi (buscador)) | BLOCKED |
| 10 | Validar la ejecución del subproceso Realizar consultas / Consultar información de la solicitud. | Se ejecuta la consulta correspondiente y se envía al servicio SISE la poliza registrada como criterio de búsqueda. | #9 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 11 | Validar la respuesta de la integración. | SISE retorna la póliza vigente y la información correspondiente queda almacenada para continuar el flujo. | #9 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 12 | Validar la ejecución de Consultar alertas Intermediarios. | Se consulta la clave del intermediario y se obtiene su información de alertas antes de asignar Completar Información. | #10 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 13 | Validar la asignación de Completar Información. | La actividad queda asignada al intermediario correspondiente y presenta el encabezado precargado con los datos de la solicitud. | #11 abrir_caso (UI: abrir caso por número) | BLOCKED |
| 14 | Validar información de la Póliza principal. | Tomador, Asegurado y datos de póliza se encuentran precargados y en solo lectura. | #12 verificar (UI: aserciones) | BLOCKED |
| 15 | Validar el bloque Póliza RCE. | Se presenta la información retornada para la Póliza RCE y permanece en solo lectura. | #13 verificar (UI: aserciones) | BLOCKED |
| 16 | Validar actualización del correo electrónico. | Si se solicita actualización, el campo Nuevo correo Electrónico de Facturación queda visible y obligatorio. | #14 diligenciar (UI: diligenciar + post-condición)<br>#15 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 17 | Validar Comentarios y documentos. | Las secciones permiten registrar la información correspondiente. | #16 verificar (UI: aserciones)<br>#17 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 18 | Validar etiquetas, textos, tildes y capitalización. | El formulario no presenta inconsistencias de nomenclatura ni ortografía. | #17 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 19 | Validar los botones disponibles para el escenario exitoso. | Se presentan únicamente Desistir Solicitud y Confirmar Radicación. | #18 verificar (UI: aserciones) | BLOCKED |
| 20 | Confirmar la radicación. | Se almacena la información y la decisión de continuar. | #19 pulsar (UI: botón)<br>#20 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#21 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 21 | Validar Acción a tomar. | El caso continúa hacia Análisis. | #20 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#21 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |

## HU03-CP07 — SDE - CEL - HU03 - Validar Cumplimiento sin Ramo RCE que requiere RCE

- **Requisitos:** Requirement 231435: SDE - CEL - RAD - GEN - Flujo; Requirement 231437: SDE - CEL - RAD - INT - Consultar SISE; Requirement 231510: SDE - CEL - RAD - SUB - Consultar información de la solicitud; Requirement 231440: SDE - CEL - RAD - INT - Consultar alertas intermediarios; Requirement 231442: SDE - CEL - RAD - FRM - Completar Información de la solicitud; Requirement 231443: SDE - CEL - RAD - ACC - Completar Información de la solicitud; Requirement 231506: SDE - CEL - RAD - COM - Acción a tomar
- **Familia:** F-INDIVIDUAL-CONSULTA · **Fase:** 2 · **Prioridad:** P2
- **Escenario:** `escenarios/12-hu03-cp07.yaml`
- **Brechas:** ENV-03 (ENVIRONMENT_GAP), BUG-02 (FUNCTIONAL_AMBIGUITY), DATA-13 (TEST_DATA_GAP), UI-09 (UI_CAPABILITY_GAP), INT-01 (INTEGRATION_VISIBILITY_GAP), FUNC-02 (FUNCTIONAL_AMBIGUITY), FUNC-03 (FUNCTIONAL_AMBIGUITY), FUNC-08 (FUNCTIONAL_AMBIGUITY)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P6 (mixto), P10 (integracion), P11 (integracion), P12 (integracion), P17 (mixto), P18 (no automatizado), P20 (mixto), P21 (mixto)
- **Estado:** BLOCKED (no ejecutado) — Prerrequisitos faltantes (ver bloqueos). TEST_DATA POL-CUMPL-RCE: faltan SDE_CUMPL_MOVIMIENTO, SDE_CUMPL_RAMO_RCE, SDE_CUMPL_RAMO_CON_RCE, SDE_CUMPL_POLIZA_CON_RCE, SDE_CUMPL_RAMO_SIN_RCE, SDE_CUMPL_POLIZA_SIN_RCE, SDE_CUMPL_POLIZA_RCE

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar una solicitud de Cumplimiento cuyo Ramo principal no corresponde a RCE pero la solicitud requiere información adicional de Póliza RCE. | Agregado del CP | BLOCKED |
| 2 | Ingresar a Bizagi mediante https://test-aiprocesos-sde.bizagi.com/. | El ambiente permite iniciar la radicación. | #1 iniciar_sesion (UI: login real) | BLOCKED |
| 3 | Crear un nuevo caso de Radicación. | El formulario de inicio se presenta correctamente y permite diligenciar una nueva solicitud. | #2 nuevo_caso (UI: abrir formulario) | BLOCKED |
| 4 | Seleccionar Línea = Cumpimiento, Ramo = Poliza sin RCE, Tipo de Solicitud/Movimiento y Sucursal correspondientes a la data preparada para el caso. | El formulario presenta las opciones parametrizadas correspondientes a Autos. | #3 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 5 | Seleccionar Tipo de Radicación = Individual. | Se habilita el campo Número de póliza y se presentan únicamente los campos aplicables al escenario. | #4 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 6 | Validar reglas, obligatoriedad, tipo de dato, ortografía y capitalización. | El formulario presenta correctamente la caracterización funcional de cada campo. | #4 diligenciar (UI: diligenciar + post-condición)<br>#5 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 7 | Seleccionar que la solicitud requiere RCE y diligenciar la Póliza principal y Póliza RCE, adicioal completar los campos/documentos obligatorios parametrizados. | El formulario queda diligenciado con información válida y permite crear la solicitud. | #6 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 8 | Seleccionar Crear e identificar el número único del caso. | Se genera correctamente un número de caso y la información registrada queda asociada a la radicación. | #7 pulsar (UI: botón) | BLOCKED |
| 9 | Validar el paso por la compuerta ¿Masivo?. | Al corresponder a una radicación Individual, el caso continúa por el camino No/Individual y no se dirige a Estructurar Información. | #8 verificar_ruta (Actividad actual según Bizagi (buscador)) | BLOCKED |
| 10 | Validar la ejecución del subproceso Realizar consultas / Consultar información de la solicitud. | Se ejecuta la consulta correspondiente y se envía al servicio SISE la poliza registrada como criterio de búsqueda. | #9 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 11 | Validar la respuesta de la integración. | SISE retorna la póliza vigente y la información correspondiente queda almacenada para continuar el flujo. | #9 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 12 | Validar la ejecución de Consultar alertas Intermediarios. | Se consulta la clave del intermediario y se obtiene su información de alertas antes de asignar Completar Información. | #10 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 13 | Validar la asignación de Completar Información. | La actividad queda asignada al intermediario correspondiente y presenta el encabezado precargado con los datos de la solicitud. | #11 abrir_caso (UI: abrir caso por número) | BLOCKED |
| 14 | Validar información de la Póliza principal. | Tomador, Asegurado y datos de póliza se encuentran precargados y en solo lectura. | #12 verificar (UI: aserciones) | BLOCKED |
| 15 | Validar el bloque Póliza RCE. | Se presenta la información retornada para la Póliza RCE y permanece en solo lectura. | #13 verificar (UI: aserciones) | BLOCKED |
| 16 | Validar actualización del correo electrónico. | Si se solicita actualización, el campo Nuevo correo Electrónico de Facturación queda visible y obligatorio. | #14 diligenciar (UI: diligenciar + post-condición)<br>#15 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 17 | Validar Comentarios y documentos. | Las secciones permiten registrar la información correspondiente. | #16 verificar (UI: aserciones)<br>#17 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 18 | Validar etiquetas, textos, tildes y capitalización. | El formulario no presenta inconsistencias de nomenclatura ni ortografía. | #17 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 19 | Validar los botones disponibles para el escenario exitoso. | Se presentan únicamente Desistir Solicitud y Confirmar Radicación. | #18 verificar (UI: aserciones) | BLOCKED |
| 20 | Confirmar la radicación. | Se almacena la información y la decisión de continuar. | #19 pulsar (UI: botón)<br>#20 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#21 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 21 | Validar Acción a tomar. | El caso continúa hacia Análisis. | #20 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#21 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |

## HU03-CP08 — SDE - CEL - HU03 - Validar Cumplimiento sin Ramo RCE que no requiere RCE

- **Requisitos:** Requirement 231435: SDE - CEL - RAD - GEN - Flujo; Requirement 231437: SDE - CEL - RAD - INT - Consultar SISE; Requirement 231510: SDE - CEL - RAD - SUB - Consultar información de la solicitud; Requirement 231440: SDE - CEL - RAD - INT - Consultar alertas intermediarios; Requirement 231442: SDE - CEL - RAD - FRM - Completar Información de la solicitud; Requirement 231443: SDE - CEL - RAD - ACC - Completar Información de la solicitud; Requirement 231506: SDE - CEL - RAD - COM - Acción a tomar
- **Familia:** F-INDIVIDUAL-CONSULTA · **Fase:** 2 · **Prioridad:** P2
- **Escenario:** `escenarios/13-hu03-cp08.yaml`
- **Brechas:** ENV-03 (ENVIRONMENT_GAP), BUG-02 (FUNCTIONAL_AMBIGUITY), DATA-13 (TEST_DATA_GAP), UI-09 (UI_CAPABILITY_GAP), INT-01 (INTEGRATION_VISIBILITY_GAP), FUNC-02 (FUNCTIONAL_AMBIGUITY), FUNC-03 (FUNCTIONAL_AMBIGUITY), FUNC-08 (FUNCTIONAL_AMBIGUITY)
- **Máximo alcanzable hoy:** REAL_PASS_PARCIAL — pendientes para REAL_PASS: P6 (mixto), P10 (integracion), P11 (integracion), P12 (integracion), P17 (mixto), P18 (no automatizado), P20 (mixto), P21 (mixto)
- **Estado:** BLOCKED (no ejecutado) — No ejecutado (causa: DATO; no es un resultado del producto). Ver bloqueos. TEST_DATA POL-CUMPL-RCE: faltan SDE_CUMPL_MOVIMIENTO, SDE_CUMPL_RAMO_RCE, SDE_CUMPL_RAMO_CON_RCE, SDE_CUMPL_POLIZA_CON_RCE, SDE_CUMPL_RAMO_SIN_RCE, SDE_CUMPL_POLIZA_SIN_RCE, SDE_CUMPL_POLIZA_RCE

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar una radicación Individual de Cumplimiento que no requiere Póliza RCE, comprobando que únicamente se consulte y presente la información de la póliza principal. | Agregado del CP | BLOCKED |
| 2 | Ingresar a Bizagi mediante https://test-aiprocesos-sde.bizagi.com/. | El ambiente permite iniciar la radicación. | #1 iniciar_sesion (UI: login real) | BLOCKED |
| 3 | Crear un nuevo caso de Radicación. | El formulario de inicio se presenta correctamente y permite diligenciar una nueva solicitud. | #2 nuevo_caso (UI: abrir formulario) | BLOCKED |
| 4 | Seleccionar Línea = Cumpimiento, Ramo = Poliza sin RCE, Tipo de Solicitud/Movimiento y Sucursal correspondientes a la data preparada para el caso. | El formulario presenta las opciones parametrizadas correspondientes a Autos. | #3 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 5 | Seleccionar Tipo de Radicación = Individual. | Se habilita el campo Número de póliza y se presentan únicamente los campos aplicables al escenario. | #4 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 6 | Validar reglas, obligatoriedad, tipo de dato, ortografía y capitalización. | El formulario presenta correctamente la caracterización funcional de cada campo. | #4 diligenciar (UI: diligenciar + post-condición)<br>#5 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 7 | Seleccionar que no requiere RCE y diligenciar únicamente la Póliza principal y completar los campos/documentos obligatorios parametrizados. | El formulario queda diligenciado con información válida y permite crear la solicitud. | #6 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 8 | Seleccionar Crear e identificar el número único del caso. | Se genera correctamente un número de caso y la información registrada queda asociada a la radicación. | #7 pulsar (UI: botón) | BLOCKED |
| 9 | Validar el paso por la compuerta ¿Masivo?. | Al corresponder a una radicación Individual, el caso continúa por el camino No/Individual y no se dirige a Estructurar Información. | #8 verificar_ruta (Actividad actual según Bizagi (buscador)) | BLOCKED |
| 10 | Validar la ejecución del subproceso Realizar consultas / Consultar información de la solicitud. | Se ejecuta la consulta correspondiente y se envía al servicio SISE la poliza registrada como criterio de búsqueda. | #9 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 11 | Validar la respuesta de la integración. | SISE retorna la póliza vigente y la información correspondiente queda almacenada para continuar el flujo. | #9 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 12 | Validar la ejecución de Consultar alertas Intermediarios. | Se consulta la clave del intermediario y se obtiene su información de alertas antes de asignar Completar Información. | #10 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 13 | Validar la asignación de Completar Información. | La actividad queda asignada al intermediario correspondiente y presenta el encabezado precargado con los datos de la solicitud. | #11 abrir_caso (UI: abrir caso por número) | BLOCKED |
| 14 | Validar información de la Póliza principal. | Tomador, Asegurado y datos de póliza se encuentran precargados y en solo lectura. | #12 verificar (UI: aserciones) | BLOCKED |
| 15 | Validar que no se muestre información RCE. | No se presenta un bloque de Póliza RCE al no haber sido requerida. | #13 verificar (UI: aserciones) | BLOCKED |
| 16 | Validar actualización del correo electrónico. | Si se solicita actualización, el campo Nuevo correo Electrónico de Facturación queda visible y obligatorio. | #14 diligenciar (UI: diligenciar + post-condición)<br>#15 diligenciar (UI: diligenciar + post-condición) | BLOCKED |
| 17 | Validar Comentarios y documentos. | Las secciones permiten registrar la información correspondiente. | #16 verificar (UI: aserciones)<br>#17 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 18 | Validar etiquetas, textos, tildes y capitalización. | El formulario no presenta inconsistencias de nomenclatura ni ortografía. | #17 no_automatizado (NOT_AUTOMATED) | BLOCKED |
| 19 | Validar los botones disponibles para el escenario exitoso. | Se presentan únicamente Desistir Solicitud y Confirmar Radicación. | #18 verificar (UI: aserciones) | BLOCKED |
| 20 | Confirmar la radicación. | Se almacena la información y la decisión de continuar. | #19 pulsar (UI: botón)<br>#20 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#21 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |
| 21 | Validar Acción a tomar. | El caso continúa hacia Análisis. | #20 verificar_ruta (Actividad actual según Bizagi (buscador))<br>#21 integracion (INTEGRATION_NOT_VERIFIED) | BLOCKED |

## HU03-CP09 — SDE - CEL - HU03 - Validar intermediario con alerta bloqueante

- **Requisitos:** Requirement 231435: SDE - CEL - RAD - GEN - Flujo; Requirement 231437: SDE - CEL - RAD - INT - Consultar SISE; Requirement 231510: SDE - CEL - RAD - SUB - Consultar información de la solicitud; Requirement 231440: SDE - CEL - RAD - INT - Consultar alertas intermediarios; Requirement 231442: SDE - CEL - RAD - FRM - Completar Información de la solicitud; Requirement 231443: SDE - CEL - RAD - ACC - Completar Información de la solicitud; Requirement 231506: SDE - CEL - RAD - COM - Acción a tomar
- **Familia:** F-EXCEPCIONES · **Fase:** 3 · **Prioridad:** P3
- **Escenario:** sin escenario (PREPARADO: no se crea un stub)
- **Brechas:** DATA-14 (TEST_DATA_GAP), UI-01 (UI_CAPABILITY_GAP), UI-07 (UI_CAPABILITY_GAP), INT-01 (INTEGRATION_VISIBILITY_GAP)
- **Máximo alcanzable hoy:** SIN_ESCENARIO
- **Estado:** PREPARADO

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar que una radicación realizada por un intermediario con alerta bloqueante no pueda continuar y que Completar Información presente únicamente las opciones permitidas para este escenario. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 2 | Ingresar con un intermediario cuya data genere una alerta bloqueante. | El usuario puede iniciar la radicación. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 3 | Crear una radicación Individual con información válida. | El caso queda creado correctamente. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 4 | Validar formulario inicial, reglas, ortografía y capitalización. | Los elementos se muestran correctamente. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 5 | Validar la compuerta ¿Masivo?. | El caso toma la ruta Individual. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 6 | Validar la consulta correspondiente a SISE. | La información de la solicitud es consultada. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 7 | Validar Consultar alertas Intermediarios. | El servicio recibe la clave del intermediario y retorna una alerta bloqueante. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 8 | Ejecutar el escenario para cualquiera de los códigos bloqueantes definidos: EN PROCESO DE CANCELACIÓN, SIN IDONEIDAD, SIN SARLAFT o SIN CONTRATO. | El sistema identifica la alerta como bloqueante. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 9 | Ingresar a Completar Información. | Se presenta el mensaje: “Para continuar con tu solicitud, se requiere una aprobación previa. Comunícate con tu gestor comercial para solicitarla y conocer los pasos a seguir.” | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 10 | Validar visibilidad del formulario. | La información operativa para continuar la radicación no queda disponible para gestión. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 11 | Validar botones. | Únicamente se muestra Desistir Solicitud. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 12 | Validar ortografía y capitalización del mensaje y botón. | El texto corresponde exactamente a la definición funcional. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 13 | Seleccionar Desistir Solicitud. | El sistema no ejecuta validaciones adicionales de información y registra la decisión de finalizar. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 14 | Validar Acción a tomar. | La compuerta toma Finalizar solicitud y dirige el caso al evento terminal. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |

## HU03-CP10 — SDE - CEL - HU03 - Validar póliza asociada a otro intermediario y Carta de nombramiento

- **Requisitos:** Requirement 231435: SDE - CEL - RAD - GEN - Flujo; Requirement 231437: SDE - CEL - RAD - INT - Consultar SISE; Requirement 231510: SDE - CEL - RAD - SUB - Consultar información de la solicitud; Requirement 231440: SDE - CEL - RAD - INT - Consultar alertas intermediarios; Requirement 231442: SDE - CEL - RAD - FRM - Completar Información de la solicitud; Requirement 231443: SDE - CEL - RAD - ACC - Completar Información de la solicitud; Requirement 231506: SDE - CEL - RAD - COM - Acción a tomar
- **Familia:** F-EXCEPCIONES · **Fase:** 3 · **Prioridad:** P3
- **Escenario:** sin escenario (PREPARADO: no se crea un stub)
- **Brechas:** DATA-15 (TEST_DATA_GAP), UI-01 (UI_CAPABILITY_GAP), UI-08 (UI_CAPABILITY_GAP), INT-01 (INTEGRATION_VISIBILITY_GAP)
- **Máximo alcanzable hoy:** SIN_ESCENARIO
- **Estado:** PREPARADO

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar que cuando la clave asociada a la póliza sea diferente a la clave del intermediario que radica la solicitud, el sistema exija una Carta de nombramiento antes de permitir confirmar la radicación. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 2 | Ingresar con un intermediario habilitado. | El usuario accede correctamente. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 3 | Crear una radicación Individual utilizando una póliza perteneciente a otro intermediario. | El caso queda registrado. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 4 | Validar formulario inicial, reglas, ortografía y capitalización. | La información se presenta correctamente. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 5 | Validar ruta Individual. | El caso continúa hacia las consultas. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 6 | Validar consulta a SISE. | El servicio retorna la información de póliza incluyendo la Clave del intermediario asociada. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 7 | Validar comparación de claves. | El sistema identifica que la clave de la póliza es diferente de la clave del intermediario que realiza la radicación. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 8 | Validar consulta de alertas. | La consulta se ejecuta sin una alerta bloqueante adicional para aislar el escenario. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 9 | Ingresar a Completar Información. | Se presenta el mensaje “La información de la póliza no coincide con tu clave. Para realizar el movimiento, adjunta la carta de nombramiento.” | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 10 | Validar visibilidad del formulario. | Los demás campos permanecen ocultos excepto Comentarios y Documentos. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 11 | Validar tabla de documentos. | Existe un registro obligatorio para Carta de nombramiento y se permite cargar los documentos correspondientes. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 12 | Intentar confirmar sin adjuntar Carta de nombramiento. | El sistema no permite completar correctamente la radicación mientras falte el documento obligatorio. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 13 | Adjuntar una Carta de nombramiento válida. | El documento queda almacenado y vinculado al caso. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 14 | Validar botones visibles. | Se presentan únicamente Desistir Solicitud y Confirmar Radicación. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 15 | Validar ortografía, capitalización y mensaje. | Los textos corresponden a la definición funcional. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 16 | Seleccionar Confirmar Radicación. | La solicitud queda confirmada con la Carta de nombramiento asociada. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 17 | Validar Acción a tomar. | El caso toma Continuar solicitud y avanza hacia Análisis. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |

## HU03-CP11 — SDE - CEL - HU03 - Validar póliza inexistente y reconsulta por datos no encontrados

- **Requisitos:** Requirement 231435: SDE - CEL - RAD - GEN - Flujo; Requirement 231437: SDE - CEL - RAD - INT - Consultar SISE; Requirement 231510: SDE - CEL - RAD - SUB - Consultar información de la solicitud; Requirement 231440: SDE - CEL - RAD - INT - Consultar alertas intermediarios; Requirement 231442: SDE - CEL - RAD - FRM - Completar Información de la solicitud; Requirement 231443: SDE - CEL - RAD - ACC - Completar Información de la solicitud; Requirement 231506: SDE - CEL - RAD - COM - Acción a tomar
- **Familia:** F-EXCEPCIONES · **Fase:** 3 · **Prioridad:** P3
- **Escenario:** sin escenario (PREPARADO: no se crea un stub)
- **Brechas:** DATA-16 (TEST_DATA_GAP), UI-01 (UI_CAPABILITY_GAP), INT-01 (INTEGRATION_VISIBILITY_GAP), INT-03 (INTEGRATION_VISIBILITY_GAP)
- **Máximo alcanzable hoy:** SIN_ESCENARIO
- **Estado:** PREPARADO

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar el comportamiento de una radicación cuando la consulta no encuentra información en SISE, permitiendo corregir el criterio utilizado y ejecutar una nueva consulta antes de continuar. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 2 | Ingresar al ambiente Bizagi. | El ambiente está disponible. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 3 | Crear una radicación Individual utilizando Forma de Consulta Número de póliza. | Se habilita el campo correspondiente. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 4 | Ingresar deliberadamente un Número de póliza válido en formato pero inexistente en SISE. | El formulario acepta el valor para la consulta. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 5 | Validar reglas, caracterización, ortografía y capitalización y crear el caso. | Se genera el número único del caso. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 6 | Validar ruta Individual. | El flujo continúa hacia Realizar consultas. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 7 | Validar consumo de SISE. | El servicio recibe el Número de póliza registrado. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 8 | Validar resultado sin información. | El servicio retorna un resultado que indica que no se encontraron registros. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 9 | Validar la actividad Completar Información. | Se presenta el mensaje “Los datos ingresados no coinciden con la información registrada. Revísalos y, si necesitas ayuda, tu gestor comercial podrá orientarte.” | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 10 | Validar campos visibles. | Se muestra únicamente el criterio utilizado para la consulta, en este caso Número de póliza, con el valor original precargado y editable. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 11 | Validar botones visibles. | Se muestran únicamente Desistir Solicitud y Nueva Consulta. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 12 | Validar que no se presenten los bloques de información de póliza, Tomador o Asegurado. | No se muestran datos que no hayan sido retornados por SISE. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 13 | Corregir el Número de póliza utilizando una póliza existente. | El nuevo valor queda registrado como criterio para la reconsulta. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 14 | Seleccionar Nueva Consulta. | La decisión Reconsultar queda registrada. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 15 | Validar la compuerta Acción a tomar. | El caso vuelve al subproceso Consultar información de la solicitud por el camino Reconsultar. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 16 | Validar el nuevo consumo de SISE. | El servicio utiliza el Número de póliza corregido, no el valor anterior. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 17 | Validar resultado exitoso. | La nueva consulta retorna y almacena la información correspondiente a la póliza válida. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 18 | Validar nuevamente Consulta de alertas y Completar Información. | El flujo continúa con la información actualizada y presenta el formulario correspondiente a una consulta exitosa. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 19 | Validar reglas internas, campos precargados y solo lectura. | La información recuperada se muestra correctamente conforme a Línea y Movimiento. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 20 | Confirmar Radicación. | La solicitud queda completa y almacenada. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 21 | Validar Acción a tomar. | El caso toma Continuar solicitud y avanza hacia Análisis. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |

## HU03-CP12 — SDE - CEL - HU03 - Línea Cumplimiento con RCE requerido y Póliza RCE sin información

- **Requisitos:** Requirement 231435: SDE - CEL - RAD - GEN - Flujo; Requirement 231437: SDE - CEL - RAD - INT - Consultar SISE; Requirement 231510: SDE - CEL - RAD - SUB - Consultar información de la solicitud; Requirement 231440: SDE - CEL - RAD - INT - Consultar alertas intermediarios; Requirement 231442: SDE - CEL - RAD - FRM - Completar Información de la solicitud; Requirement 231443: SDE - CEL - RAD - ACC - Completar Información de la solicitud; Requirement 231506: SDE - CEL - RAD - COM - Acción a tomar
- **Familia:** F-EXCEPCIONES · **Fase:** 3 · **Prioridad:** P3
- **Escenario:** sin escenario (PREPARADO: no se crea un stub)
- **Brechas:** DATA-13 (TEST_DATA_GAP), UI-01 (UI_CAPABILITY_GAP), UI-05 (UI_CAPABILITY_GAP), INT-01 (INTEGRATION_VISIBILITY_GAP), INT-03 (INTEGRATION_VISIBILITY_GAP), FUNC-02 (FUNCTIONAL_AMBIGUITY)
- **Máximo alcanzable hoy:** SIN_ESCENARIO
- **Estado:** PREPARADO

| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |
|---|---|---|---|---|
| 1 | Objetivo: | Validar el flujo de una radicación de Línea Cumplimiento con un ramo que no tiene marcada la propiedad Póliza RCE, seleccionando “Sí” en ¿Requiere modificar RCE?, donde la póliza principal retorna información correctamente, pero la Póliza RCE consultada no retorna información, verificando el comportamiento del formulario, las reglas de validación, la edición de los datos y la ejecución de una nueva consulta con un número de Póliza RCE válido. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 2 | Ingresar al ambiente de Bizagi mediante la URL: https://test-aiprocesos-sde.bizagi.com/ | El ambiente de Bizagi se encuentra disponible y permite el acceso al usuario autorizado para ejecutar la prueba. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 3 | Iniciar una nueva radicación y acceder al Formulario de Inicio. | Se presenta el formulario de inicio con los campos configurados para realizar una nueva radicación. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 4 | Seleccionar la Línea Cumplimiento. | La Línea seleccionada corresponde a Cumplimiento y se muestran los campos y opciones asociados a dicha línea. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 5 | Seleccionar un Ramo de Cumplimiento que NO tenga marcada la propiedad “Póliza RCE”. | El Ramo seleccionado corresponde al escenario de prueba y no tiene configurada la propiedad Póliza RCE. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 6 | Seleccionar el Tipo de Solicitud/Movimiento correspondiente a Modificación. | El formulario presenta la configuración correspondiente a una modificación de póliza de Cumplimiento. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 7 | Seleccionar una Sucursal válida y diligenciar los demás campos obligatorios del formulario de inicio. | Todos los campos obligatorios quedan diligenciados y el formulario permite continuar con la selección del tipo de radicación. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 8 | Seleccionar Tipo de Radicación: Individual. | El formulario refleja correctamente la selección de radicación Individual y mantiene la información previamente diligenciada. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 9 | Validar reglas, obligatoriedad, tipo de dato, ortografía y capitalización. | El formulario presenta correctamente la caracterización funcional de cada campo. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 10 | Seleccionar que la solicitud requiere RCE y diligenciar la Póliza principal y Póliza RCE, adicioal completar los campos/documentos obligatorios parametrizados. | El formulario queda diligenciado con información válida y permite crear la solicitud. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 11 | Seleccionar Crear e identificar el número único del caso. | Se genera correctamente un número de caso y la información registrada queda asociada a la radicación. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 12 | Validar el paso por la compuerta ¿Masivo?. | Al corresponder a una radicación Individual, el caso continúa por el camino No/Individual y no se dirige a Estructurar Información. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 13 | Validar la ejecución del subproceso Realizar consultas / Consultar información de la solicitud. | Se ejecuta la consulta correspondiente y se envía al servicio SISE la poliza registrada como criterio de búsqueda. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 14 | Validar la respuesta de la integración. | SISE retorna la póliza vigente y la información correspondiente queda almacenada para continuar el flujo. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 15 | Validar la ejecución de Consultar alertas Intermediarios. | Se consulta la clave del intermediario y se obtiene su información de alertas antes de asignar Completar Información. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 16 | Validar la asignación de Completar Información. | La actividad queda asignada al intermediario correspondiente y presenta el encabezado precargado con los datos de la solicitud. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 17 | Validar información de la Póliza principal. | Tomador, Asegurado y datos de póliza se encuentran precargados y en solo lectura. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 18 | Validar el mensaje presentado para la consulta de la Póliza RCE sin información. | Se presenta el mensaje definido para una consulta sin resultados: “Los datos ingresados no coinciden con la información registrada. Revísalos y, si necesitas ayuda, tu gestor comercial podrá orientarte.” | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 19 | Validar el bloque Póliza RCE. | Los campos correspondientes a la consulta de la Póliza RCE quedan disponibles para revisión/modificación según la regla aplicable y permiten corregir el dato utilizado para la consulta. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 20 | Validar la visibilidad de los botones disponibles después de la consulta sin información. | Se encuentran disponibles Desistir Solicitud y Nueva Consulta, sin permitir continuar con la radicación hasta completar correctamente la información requerida. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 21 | Validar que los campos de la póliza principal que sí retornaron información permanezcan correctamente diligenciados y no editables. | La información válida de la póliza principal se conserva sin modificaciones y los campos maestros mantienen su condición de solo lectura. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 22 | Validar la ortografía, capitalización, etiquetas y textos de ayuda del formulario después de la consulta sin información. | Los textos del formulario, mensajes, etiquetas y botones presentan ortografía correcta y capitalización consistente con el estándar definido. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 23 | Modificar el Número de Póliza RCE ingresando el número de una Póliza RCE válida existente en SISE. | El nuevo número de Póliza RCE es aceptado de acuerdo con las reglas de validación del campo: únicamente valores numéricos y longitud entre 9 y 12 caracteres. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 24 | Validar las reglas del campo Número de Póliza RCE utilizando valores inválidos, como caracteres alfabéticos o una longitud fuera del rango permitido. | El formulario rechaza los valores que no cumplen las reglas de formato y no permite realizar la consulta hasta ingresar un número válido. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 25 | Seleccionar Nueva Consulta. | El caso retorna al proceso de consulta por el camino Reconsultar, utilizando los datos modificados para ejecutar la nueva consulta. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 26 | Validar que se ejecute nuevamente la consulta utilizando el nuevo número de Póliza RCE. | El servicio es invocado nuevamente con el número de Póliza RCE corregido. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 27 | Validar la respuesta de la nueva consulta. | La nueva consulta retorna la información correspondiente a la Póliza RCE válida. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 28 | Validar la precarga de la información de la Póliza RCE después de la reconsulta exitosa. | La información del Tomador y Asegurado de la Póliza RCE queda visible y no editable, conforme a la información retornada por el servicio. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 29 | Validar que la información de la póliza principal permanezca sin alteraciones después de la reconsulta. | La información previamente obtenida de la póliza principal permanece consistente y asociada al caso. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 30 | Validar nuevamente la caracterización de los campos, etiquetas, mensajes, ortografía y capitalización del formulario después de la reconsulta. | El formulario presenta textos, etiquetas, mensajes y nombres de campos correctamente escritos y capitalizados, sin alteraciones ni inconsistencias después de la nueva consulta. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 31 | Cargar un documento válido en la tabla de documentos y registrar una observación de prueba. | El documento queda asociado a la solicitud y la observación queda registrada correctamente. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 32 | Validar las pestañas Documentos de la solicitud y Seguimiento/Trazabilidad. | Los documentos cargados y la trazabilidad del caso se encuentran disponibles y asociados al número único de caso. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 33 | Seleccionar Confirmar Radicación una vez completada correctamente la información requerida. | La solicitud supera las validaciones necesarias y puede continuar por el camino Continuar solicitud hacia la siguiente etapa del proceso. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
| 34 | Validar el estado final del caso y la persistencia de la información. | El caso continúa correctamente en el flujo de análisis, conservando la información de la póliza principal, la Póliza RCE obtenida mediante reconsulta, documentos, observaciones y demás información asociada al número único de caso. | Familia F-EXCEPCIONES (fase 3) | NOT_RUN |
