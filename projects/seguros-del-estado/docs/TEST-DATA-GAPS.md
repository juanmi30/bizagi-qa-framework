# Test data gaps — SDE-CEL

Actualizado el **2026-10-13 (recuperación en el PC nuevo + Fase 1C)**. READY/MISSING se **calcula** en cada corrida (`sde/datos.ts`) desde `projects/seguros-del-estado/.env`.
Aquí no hay valores: solo qué dato hace falta, para qué CP y en qué variable va. QA entrega los valores escribiéndolos en el `.env` local (ignorado por Git), nunca por chat ni en documentos compartidos.

> **2026-10-13 (QA):** la consulta a SISE y la consulta de alertas del intermediario **no están funcionando** (indisponibilidad reportada por QA, no verificada por nosotros). Aun con la póliza, HU03 no puede pasar de la creación hasta que QA confirme que volvieron.

## 0000000. HU03 con el intermediario habilitado: lo que falta exactamente (2026-10-13)

El formulario de inicio de HU03 está calibrado con el actor real. CP01–CP05 llegan en solo lectura hasta el paso 6, y lo único que los detiene en el paso 7 es el dato SISE. La bandeja del intermediario está vacía y su menú no tiene consulta de pólizas, así que **no hay fuente autorizada en el portal**.

**Solicitud a QA** (cargar en el `.env` local, nunca por chat). Todas las pólizas deben pertenecer a la **clave intermediario de INT-013403** (área 11-BOGOTA), estar **vigentes en SISE** y **sin alerta bloqueante**:

| Prioridad | Variable | Para | Condiciones |
|---|---|---|---|
| 1 | `SDE_AUTOS_POLIZA` | HU03-CP02 (y la reconsulta de CP11) | Autos, Ramo AUTOMÓVILES LIVIANOS INDIVIDUAL o PESADOS, con vehículo/placa asociado |
| 2 | `SDE_PLACA_MULTIPOLIZA` + `SDE_PLACA_MULTIPOLIZA_N` | HU03-CP01 | Placa con más de una póliza vigente de esa clave, y cuántas debe retornar SISE |
| 3 | `SDE_GEN_POLIZA` | HU03-CP03 | Generales, Ramo RC MEDICO PROFESIONAL INDIVIDUAL (único ramo listado), Modificación |
| 4 | `SDE_TOMADOR_EXISTENTE_TIPO/_NUM` | HU03-CP04 | Tomador existente en SISE. El tipo debe ser una opción de "Tipo de Documento del Tomador" |
| 5 | `SDE_TOMADOR_INEXISTENTE_TIPO/_NUM` | HU03-CP05 | Documento que QA **confirma inexistente** en SISE |
| 6 | `SDE_CUMPL_RAMO_CON_RCE`, `SDE_CUMPL_RAMO_SIN_RCE`, `SDE_CUMPL_MOVIMIENTO` y sus pólizas | HU03-CP06–CP08 | Indicar **cuáles** de los 6 ramos de Cumplimiento listados tienen la propiedad Póliza RCE: RCE DERIVADA DE CUMPLIMIENTO, CUMPLIMIENTO ENTIDAD ESTATAL, CUMPLIMIENTO PARTICULAR, sus dos variantes ONLINE y RCE CONTRATOS RAPIE |

## 000000. Cuenta de intermediario habilitada (2026-10-13)

- Del Excel de QA (35 usuarios únicos) se comprobó **1** cuenta, en solo lectura: **INT-013403** (área 11-BOGOTA), con rol **CE_Intermediarios** y el proceso habilitado. Quedó registrada en el `.env` local como `USUARIO_intermediario`, con su clave en `SDE_INTERMEDIARIO_CLAVE`. La cuenta anterior quedó comentada en el mismo `.env`. Detalle enmascarado en `evidencia/2026-10-13_cuentas-intermediario.txt`.
- **HU03-CP02 sigue BLOCKED solo por datos:** `SDE_AUTOS_POLIZA` debe ser una póliza **Autos vigente cuya clave intermediario sea la de INT-013403**, sin alerta bloqueante y con vehículo asociado. La misma regla de clave aplica a HU03 CP01, CP03 y CP06–CP08.
- `intermediario_alerta` (HU03-CP09) sigue sin rol. Si el Excel tiene un usuario con alerta bloqueante, QA debe indicar cuál.

## 00000. NIT sintéticos y UI-10 (2026-10-13, investigación sin abrir pop-ups)

**Conclusión: NIT sintéticos TODAVÍA NO VERIFICADOS por el formulario. Ningún rechazo funcional demostrado; causa demostrada del bloqueo P19–P26: UI-10.**

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| NIT usados en el caso 430 | `999000001-2` y `999000002-1` (SINTÉTICOS) | `.env` local (ya retirados) |
| ¿Formato y DV válidos? | Sí. El algoritmo DIAN coincide con el DV publicado de DIAN (800197268-4), Bancolombia (890903938-8) y Davivienda (860034313-7) | `sde/nit.ts` + `tests/unit/nit.unit.spec.ts` |
| ¿El formulario los evaluó? | **No.** P21 falló al no encontrar la etiqueta "Tipo documento del Tomador" y P23 al encontrar **dos** "Número de Documento Tomador": el NIT nunca se escribió. El cierre falló con los obligatorios vacíos | Registro de la corrida (`docs/evidencia/2026-10-13_sprint2-consolidacion.txt`) |
| ¿Hay validación de existencia (DIAN/SISE) al guardar la fila? | **Desconocido**: nunca se llegó a guardar. La columna del número enlaza a `kmTomadorTransitorio` (entidad transitoria), lo que sugiere que la validación contra SISE ocurriría después (hipótesis, sin verificar) | Render de Estructurar (caso 431) |

**Mapeo disponible sin abrir el pop-up** (Render de "Estructurar información", caso 431). El pop-up NO viene en este render: Bizagi lo genera al abrirlo, así que sus etiquetas no se pueden obtener de forma no destructiva.

| Columna de la grilla | Enlace de datos (`xpath`) | Tipo |
|---|---|---|
| Forma Consulta | `kpFormaConsulta` | combo, obligatorio, no editable |
| Tipo documento del Tomador | `kmHistorialPoliza.kmTomador.kpTipoIdentificacion` | combo |
| Número de Documento Tomador | `kmHistorialPoliza.kmTomadorTransitorio.sNumeroIdentificacion` | texto |
| Placa | `kmHistorialPoliza.sPlaca` | texto |
| Número Póliza | `kmHistorialPoliza.sNumeroPoliza` | texto |
| ¿Requiere modificar RCE? | `kmHistorialPoliza.bRequieremodificarRCE` | booleano |
| Ramo RCE / Número Póliza RCE | `kmHistorialPoliza.kpRamoRCE` / `kmHistorialPoliza.sNumeroPolizaRCE` | combo / texto |

Hipótesis para UI-10 (por confirmar): el pop-up tiene un "Número de Documento Tomador" por entidad (`kmTomador` y `kmTomadorTransitorio`). Seleccionar los campos por su `data-render-xpath` (atributo verificado en el DOM real desde la Fase 1B) evitaría la ambigüedad.

**Próximo paso seguro:** pedir a QA o a desarrollo la definición del formulario de edición de `xDetallePolizasAsociadas` (etiquetas, `xpath`, obligatoriedad y visibilidad por Forma Consulta), o una captura del pop-up para Póliza Nueva. Con eso se ajustan P19–P25 y se hace **una** corrida controlada con los NIT sintéticos. Mientras no exista ese mapeo, no se abren pop-ups en QA.

## 0000. Sprint de consolidación (2026-10-13)

- **Fuente autorizada revisada:** el Plan Maestro V4, hoja "2. Matriz Data de Pruebas", **no trae valores**. Para HU06 pide datos *válidos por formato* con **"Datos de Cliente Requerido: N/A"**: NIT + número + dígito de verificación (CP01), placa alfanumérica de hasta 6 (CP02) y número de póliza válido (CP03/CP04). Un dato **sintético con formato válido** (por ejemplo, NIT con DV calculado) cumple ese prerrequisito y se clasifica como **SINTÉTICO**, nunca como dato real.
- **El bloqueo real de HU06 CP01 P18–P26 y CP02–04 ya no son los datos, son las etiquetas del pop-up (UI-10).** Con NIT sintéticos se intentó P18–P26 en el caso 430: las etiquetas tomadas de la grilla no existen en el pop-up y el caso quedó inutilizable (BUG-03). Los NIT sintéticos **se retiraron del `.env`** hasta calibrar las etiquetas.
- **Lo que se necesita de QA para HU06:** una captura del pop-up "Editar/Adicionar Detalle Polizas Asociadas" para Póliza Nueva (Generales), Modificación Autos y Cumplimiento con y sin RCE, o la definición de la forma (nombres exactos de los campos). Alternativa: la corrección de BUG-03.
- `SDE_DOCS_GENERALES_MASIVO` = "Solicitud de seguro" pasa de inferido a **COMPROBADO**: es la opción con `data-value` 3.

## 000. Actualización del sprint (2026-10-13, tarde)

- **`SDE_DOCS_GENERALES_MASIVO` = "Solicitud de seguro"**, CONFIGURADO a partir de la observación en QA. Es la opción de la lista "Tipo Documental" con la que "Crear" deja de exigir el tipo obligatorio con ID 3 (casos 428 y 429). Es una **inferencia**: el funcional debe confirmar el nombre del tipo 3.
- **Prioridad de datos tras el sprint:**
  1. `SDE_EST_TOMADOR_NIT` y `SDE_EST_TOMADOR_NIT_2`: dos NIT de tomador de prueba. Son lo **único** que falta para HU06-CP01 P18–P26, porque la radicación Masiva Póliza Nueva ya se crea con la secuencia del producto.
  2. `SDE_GEN_MASIVO_NARRATIVA_POLIZAS`: narrativa con pólizas reales para que el Worker AI genere filas útiles. Con texto sintético genera 1 fila vacía.
  3. El resto de datos de HU03 sirve solo cuando se resuelva ENV-03.
- Ninguno de estos datos se inventa: los NIT y pólizas deben venir de QA, en el `.env` local.

## 00. Estado al 2026-10-13 (mañana)

- Credenciales de los 3 roles: **vigentes** en el PC nuevo (login real 3/3).
- **Ningún dato de negocio ha sido entregado** desde la Fase 1B: todas las variables de pólizas, placas, documentos y narrativas siguen vacías.
- Los 10 escenarios nuevos de Fase 2 (HU06 CP02–04, HU03 CP01 y CP03–08) quedan **BLOCKED en preflight** por esos datos. Además, los de HU03 y los masivos que radica el intermediario chocan con **ENV-03**, que sigue vigente.
- Variables **nuevas** (añadidas a `.env.example`; en el `.env` local pueden faltar las claves, se agregan vacías):

| Variable | Dataset | CP | Qué es |
|---|---|---|---|
| `SDE_AUTOS_MASIVO_NARRATIVA` | INI-AUTOS-MASIVO (opcional) | HU06-CP02 | Texto con placas/pólizas reales para que el Worker AI estructure filas editables |
| `SDE_AUTOS_PLACA_2` | INI-AUTOS-MASIVO | HU06-CP02 | Segunda placa válida, **distinta** de `SDE_AUTOS_PLACA` (fila agregada en P20–P21) |
| `SDE_CUMPL_MASIVO_NARRATIVA` | INI-CUMPL-MASIVO-* (opcional) | HU06-CP03/04 | Texto con pólizas de Cumplimiento reales |
| `SDE_CUMPL_POLIZA_CON_RCE_2` | INI-CUMPL-MASIVO-CON-RCE | HU06-CP04 | Segunda póliza (9–12 dígitos), **distinta**, que la prueba agrega y luego elimina |

- Los literales de la matriz que los escenarios necesitan (Línea, Tipo de Radicación, Forma de Consulta) se declararon en `data/datasets.yaml` con `fuente: matriz`.

### Solicitud mínima a QA / funcional (texto listo para enviar)

> Para continuar la automatización de SDE-CEL en QA necesitamos, por orden de impacto:
> 1. **ENV-03:** habilitar "Gestión Solicitudes Centro Expedición" para los usuarios intermediario e intermediario_alerta. Hoy el portal les entrega la lista de procesos vacía (verificado el 13/10). Si por diseño solo radica el Analista, confirmarlo por escrito.
> 2. **BUG-02:** confirmar si un caso Individual radicado por CE_Analista debe detenerse en "Consultar Alertas Intermediario". Hoy queda sin asignado y se cierra a las ~2 h (caso 425 del 13/10).
> 3. **BUG-01:** parametrizar la lista "Tipo Documental" de "Documentos Anexos" en radicación Masiva. Hoy está vacía y Póliza Nueva exige el tipo con ID 3. Indicar el nombre de ese tipo.
> 4. **BUG-03:** el pop-up "Detalle Polizas Asociadas" deja el caso inutilizable si se sale sin Guardar (Cancelar o cierre de sesión): "Invalid scope action type", casos 342, 350 y 426.
> 5. **Datos** (cargar en el `.env` local, nunca por chat): póliza Autos vigente del intermediario sin alerta (`SDE_AUTOS_POLIZA`); placa con más de una póliza (`SDE_PLACA_MULTIPOLIZA` y su cantidad); póliza Generales vigente (`SDE_GEN_POLIZA`); tomador existente e inexistente confirmado (`SDE_TOMADOR_*`); ramos de Cumplimiento con y sin propiedad RCE con sus pólizas y una Póliza RCE (`SDE_CUMPL_*`); dos placas y dos pólizas distintas para filas nuevas (`SDE_AUTOS_PLACA(_2)`, `SDE_CUMPL_POLIZA_CON_RCE(_2)`); narrativas masivas con pólizas reales; y el movimiento de Cumplimiento (`SDE_CUMPL_MOVIMIENTO`).
> 6. **Alerta bloqueante:** confirmar si el usuario intermediario_alerta tiene realmente una alerta configurada y cuál (CP09).

## 0. Estado tras la Fase 1B (histórico)

| Ítem | Estado | Nota |
|---|---|---|
| Credenciales intermediario / analista / intermediario_alerta | **READY** | Login real 3/3. Dominios: intermediario `externos`, analista `domain` |
| Proceso y categorías (CFG-PROCESO) | **READY** | Descubierto en QA: "Gestión Solicitudes Centro Expedición" (App > Processes > Centro de Expedición) |
| Sucursal, Línea, Ramo, Movimiento (listas) | **READY** | Valores tomados de las listas reales de QA (BOGOTA; Autos/AUTOMÓVILES LIVIANOS INDIVIDUAL; Generales/RC MEDICO PROFESIONAL INDIVIDUAL) |
| HU06-CP05 criterio de consulta | READY (sintético declarado) | Número de 9 dígitos NO verificado en SISE; válido solo porque CP05 asierta la ruta |
| **HU03-CP02 póliza Autos** (`SDE_AUTOS_POLIZA`) | **MISSING** | Prioridad 1. Además requiere ENV-03 (permiso del intermediario) |
| **HU06-CP01 narrativa real** (`SDE_GEN_MASIVO_NARRATIVA_POLIZAS`) | MISSING | Con texto sintético el Worker AI generó 0 o 1 filas vacías (casos 342, 343, 350) |
| **HU06-CP01 NIT tomador** (`SDE_EST_TOMADOR_NIT`, `_2`) | MISSING | Pasos 21–26 |
| **Tipo documental obligatorio** (`SDE_DOCS_GENERALES_MASIVO`) | MISSING (y **BUG-01**) | Bizagi lo exige (ID 3), pero la lista de la grilla está vacía: hay que corregir la parametrización antes de que el dato sirva |

**Bloqueos que no son de datos** (los debe resolver QA o el administrador del ambiente):
- **ENV-03:** habilitar el proceso "Gestión Solicitudes Centro Expedición" para los usuarios intermediarios. Sin esto, los CP de HU03 no pueden ejecutarse como dice la matriz.
- **BUG-02:** confirmar si un caso Individual radicado por CE_Analista debe quedar en "Consultar Alertas Intermediario" (los casos 336, 345–348 y 352 están detenidos ahí).
- **BUG-01 / BUG-03:** parametrización de tipos documentales en Masivo y error al cancelar el pop-up de "Detalle Polizas Asociadas".

## 1. Prioridad P0 — desbloquea los 3 verticales de Fase 1

| # | Qué necesita QA aportar | Variable(s) en `.env` | CP | Estado |
|---|---|---|---|---|
| 1 | **Usuario intermediario** habilitado en QA, con su dominio | `USUARIO_intermediario`, `CLAVE_intermediario`, `DOMINIO_intermediario` (o `BIZAGI_LOGIN_DOMINIO`) | HU06-CP05, HU03-CP02, HU06-CP01 | **READY** (sin procesos: ENV-03) |
| 2 | **Usuario Analista Centro de Expedición**, con su dominio | `USUARIO_analista`, `CLAVE_analista`, `DOMINIO_analista` | HU06-CP01 | **READY** |
| 3 | **Nombre visible del proceso** en "Nuevo caso" (y categoría si el portal agrupa) | `SDE_PROCESO_RADICACION`, `SDE_PROCESO_CATEGORIA` | todos | **READY** |
| 4 | **Sucursal** válida para el intermediario | `SDE_SUCURSAL` | todos | **READY** (BOGOTA) |
| 5 | HU06-CP05: Línea, Ramo, Movimiento, Forma de Consulta, **etiqueta del campo criterio** y **valor del criterio**. La aserción es la ruta; el valor puede no existir en SISE | `SDE_RUTA_LINEA`, `SDE_RUTA_RAMO`, `SDE_RUTA_MOVIMIENTO`, `SDE_RUTA_FORMA_CONSULTA`, `SDE_RUTA_CRITERIO_CAMPO`, `SDE_RUTA_CRITERIO_VALOR` | HU06-CP05 | **READY** (criterio sintético declarado) |
| 6 | HU03-CP02: **póliza de Autos vigente** en SISE, de la **misma clave** que el intermediario, **sin alerta bloqueante** y con vehículo. Más el Ramo y el Movimiento con que se radica | `SDE_AUTOS_RAMO`, `SDE_AUTOS_MOVIMIENTO`, `SDE_AUTOS_POLIZA` | HU03-CP02 | **MISSING**: `SDE_AUTOS_POLIZA` (Ramo y Movimiento READY) |
| 7 | HU06-CP01: **Ramo de Generales** con Movimiento "Póliza Nueva" | `SDE_GEN_RAMO` | HU06-CP01 | **READY** (RC MEDICO PROFESIONAL INDIVIDUAL) |
| 8 | HU06-CP01: **texto de narrativa** con más de una póliza o tomador reales, para que el Worker AI estructure filas | `SDE_GEN_MASIVO_NARRATIVA_POLIZAS` | HU06-CP01 | MISSING |
| 9 | HU06-CP01: dos **NIT de tomador** válidos para editar y agregar filas en Estructurar Información | `SDE_EST_TOMADOR_NIT`, `SDE_EST_TOMADOR_NIT_2` | HU06-CP01 | MISSING |
| 10 | **Documentos obligatorios** parametrizados por Línea/Ramo/Movimiento y modalidad (nombre del tipo documental con ID 3) | `SDE_DOCS_GENERALES_MASIVO`, `SDE_DOCS_INDIVIDUAL` | HU06, HU03 | MISSING. Hoy la lista de la grilla está vacía (BUG-01). Individual Autos/Modificación no exigió documentos |
| — | Archivo PDF de prueba sin PII | `resources/docs/soporte-prueba.pdf` (generado) | HU06-CP01, HU03-CP10/12 | **READY** |

## 2. Prioridad P1 — Fase 2 (HU06 CP02–04, HU03 CP01, CP03–08)

| Dataset | Qué necesita QA | Variables | CP |
|---|---|---|---|
| INI-AUTOS-MASIVO | Movimiento para Masivo Autos y una **placa válida** (≤ 6 caracteres) | `SDE_AUTOS_MASIVO_MOVIMIENTO`, `SDE_AUTOS_PLACA` | HU06-CP02 |
| INI-CUMPL-MASIVO-SIN-RCE | **Ramo de Cumplimiento SIN** propiedad Póliza RCE; póliza de 9–12 dígitos; Ramo RCE y Póliza RCE válidos | `SDE_CUMPL_RAMO_SIN_RCE`, `SDE_CUMPL_POLIZA_SIN_RCE`, `SDE_CUMPL_RAMO_RCE`, `SDE_CUMPL_POLIZA_RCE` | HU06-CP03 |
| INI-CUMPL-MASIVO-CON-RCE | **Ramo de Cumplimiento CON** propiedad Póliza RCE, su movimiento y una póliza | `SDE_CUMPL_RAMO_CON_RCE`, `SDE_CUMPL_MOVIMIENTO`, `SDE_CUMPL_POLIZA_CON_RCE` | HU06-CP04 |
| PLACA-MULTIPOLIZA | **Placa con más de una póliza vigente** del intermediario y cuántas debe retornar SISE | `SDE_PLACA_MULTIPOLIZA`, `SDE_PLACA_MULTIPOLIZA_N` | HU03-CP01 |
| POL-GENERALES-VIGENTE | Póliza de **Generales** vigente del intermediario (Movimiento Modificación) | `SDE_GEN_POLIZA` | HU03-CP03 |
| TOMADOR-EXISTENTE | Tipo y número de documento de un **tomador existente** en SISE | `SDE_TOMADOR_EXISTENTE_TIPO`, `SDE_TOMADOR_EXISTENTE_NUM` | HU03-CP04 |
| TOMADOR-INEXISTENTE | Documento con formato válido que QA **confirma inexistente** en SISE (no se genera al azar) | `SDE_TOMADOR_INEXISTENTE_TIPO`, `SDE_TOMADOR_INEXISTENTE_NUM` | HU03-CP05 |
| POL-CUMPL-RCE | Pólizas de Cumplimiento: ramo con RCE, ramo sin RCE y Póliza RCE vigente | `SDE_CUMPL_RAMO_CON_RCE`, `SDE_CUMPL_POLIZA_CON_RCE`, `SDE_CUMPL_RAMO_SIN_RCE`, `SDE_CUMPL_POLIZA_SIN_RCE`, `SDE_CUMPL_POLIZA_RCE` | HU03-CP06/07/08 |

## 3. Prioridad P2 — Fase 3 (excepciones HU03 CP09–12)

| Dataset / actor | Qué necesita QA | Variables | CP |
|---|---|---|---|
| actor `intermediario_alerta` | Usuario intermediario cuya clave retorne **alerta bloqueante**, indicando cuál código (EN PROCESO DE CANCELACIÓN, SIN IDONEIDAD, SIN SARLAFT o SIN CONTRATO), y una póliza suya | `USUARIO_/CLAVE_/DOMINIO_intermediario_alerta` | HU03-CP09 |
| POL-OTRO-INTERMEDIARIO | Póliza vigente de **otra clave** de intermediario, sin alerta, y una **carta de nombramiento de prueba** (archivo sin PII) | `SDE_POLIZA_OTRO_INTERMEDIARIO`, `SDE_CARTA_NOMBRAMIENTO_ARCHIVO` | HU03-CP10 |
| POL-INEXISTENTE-RECONSULTA | Número de póliza con formato válido **inexistente** en SISE (confirmado por QA) | `SDE_POLIZA_INEXISTENTE` (+ `SDE_AUTOS_POLIZA` para la reconsulta) | HU03-CP11 |
| POL-CUMPL-RCE (opcional) | Póliza RCE con formato válido **inexistente**, para el primer intento | `SDE_CUMPL_POLIZA_RCE_INEXISTENTE` | HU03-CP12 |

## 4. Relaciones que QA debe garantizar

- **Póliza ↔ clave del intermediario:** misma clave para CP02/03/06–08/11. Distinta para CP10. Si no coinciden, el caso deriva al mensaje de carta de nombramiento y el vertical falla por la razón equivocada.
- **Intermediario ↔ alertas:** el intermediario de los CP exitosos debe estar **sin** alerta bloqueante. El de CP09, **con** una.
- **Placa ↔ pólizas:** para CP01, más de una póliza vigente asociada a la placa.
- **Ramo ↔ propiedad Póliza RCE:** QA debe indicar qué ramos de Cumplimiento tienen la propiedad y cuáles no (CP03/04/06/07/08/12).
- **Narrativa ↔ Worker AI:** el texto masivo debe permitir al Worker AI identificar más de una póliza (HU06-CP01).

## 5. Cleanup y trazabilidad de los datos

- Cada caso creado por la automatización se registra en `test-results/seguros-del-estado/historico-casos.json` (HistorialCasos compartido, modo `portal`), con CP, actor, token `${unico}` y política de cleanup.
- Política Fase 1: **CLEANUP_NOT_APPLICABLE**. Las radicaciones se conservan como evidencia; desistir no es reversible ni forma parte de los CP exitosos. Nunca se opera sobre casos ajenos. Las ediciones de tabla ocurren solo dentro del caso creado por la prueba, y la fila eliminada es la que agregó la propia prueba (`fila_con`).
- Las narrativas incluyen `${unico}` (fecha-hora de la corrida) para identificar en QA los casos de la automatización.
