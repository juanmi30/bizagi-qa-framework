# Propuesta de control de cambios — secuencia de "Documentos Anexos" (BUG-01)

Fecha: 2026-10-13. Origen: un QA que conoce el proceso explicó que "primero se guardan los registros y después se adjuntan los documentos" y que esto requiere un control de cambios. Esta propuesta lo **verifica contra QA real**, y su conclusión es más precisa que la explicación original.

## 1. Texto actual de la matriz

HU06-CP01 (y equivalentes en CP02–CP04 P7 y HU03 P7):

| Paso | Acción | Resultado esperado |
|---|---|---|
| P6 | Seleccionar Tipo de Radicación = Masivo. | Se habilitan … Descripción de la Solicitud (Masiva/Múltiple) y Documentos Anexos. |
| P9 | Ingresar una narrativa que permita identificar más de una póliza y **adjuntar los documentos obligatorios parametrizados**. | La narrativa y los documentos quedan registrados en el formulario … |
| P10 | Crear la solicitud. | Se crea una única solicitud de radicación masiva … |

La matriz asume que, en "Documentos Anexos", se elige el tipo documental y se adjunta el archivo como un solo paso, antes de "Crear".

## 2. Secuencia observada en el producto (QA, 2026-10-13, formulario de inicio, sin datos reales)

Evidencia: `tests/diagnostico-documentos.real.spec.ts` (no pulsa "Crear" salvo que se pida) y salidas `test-results/seguros-del-estado/sde/diagnostico-docs-*.json`.

| # | Acción del usuario | Lo que hace Bizagi (observado) |
|---|---|---|
| 1 | "Adicionar" en Documentos Anexos | Fila nueva en edición, **sin llamada al servidor**. Las celdas dicen "Por favor guarde el registro antes de subir el archivo" / "…antes de hacer clic en el botón". La lista "Tipo Documental" solo ofrece `-------------` |
| 2 | Guardar la fila (acción del pie de la grilla), sin tipo | El servidor responde `ADDRELATIONWITHDATA` = success. El pie pasa a Adicionar/Eliminar. **La fila no se refresca**: sigue con el mensaje anterior y la lista vacía |
| 3 | Escribir la narrativa después de guardar (orden natural) | **No cambia nada**: la lista sigue vacía |
| 4 | Algo que vuelva a pintar el formulario (en la prueba: cambiar Sucursal y restaurarla) | La fila muestra su ID real, "No hay archivos" y el control de carga. **La lista ofrece `Sarlaft`, `Solicitud de seguro` y `Otros`** |
| 5 | Elegir "Solicitud de seguro" → control de carga → diálogo "Subir un archivo" → "Subir" | El archivo aparece en la fila |
| 6 | "Crear" | `CREATENEWCASE` success → **caso 428** (Generales, Póliza Nueva, Masiva). Llega a "Estructurar información" con los pasos P13–P17, P28 y P29 verificados |

La lista de tipos documentales no se alimenta por red al abrirla. Sale del render del formulario, por eso solo aparece después de un nuevo render.

### 2.1 Pruebas adicionales (2026-10-13, segundo sprint)

| Prueba | Resultado | Tipo de evidencia |
|---|---|---|
| Tras guardar la fila: **clic en la fila guardada** | Lista vacía | Comprobado en QA |
| Tras guardar la fila: **Adicionar otra fila** | Lista vacía | Comprobado en QA |
| Tras guardar la fila: **volver a marcar "Masiva"** (mismo valor) | Lista vacía | Comprobado en QA |
| Tras guardar la fila: **escribir la narrativa** | Lista vacía | Comprobado en QA |
| Tras guardar la fila: **cambiar Sucursal y restaurarla** | Aparecen los tipos | Comprobado en QA |
| Identificador de cada opción (`data-value` del DOM) | `Sarlaft` = **2**, `Solicitud de seguro` = **3**, `Otros` = **4** | **Comprobado**: el ID 3 que exige el mensaje de "Crear" es "Solicitud de seguro" |
| "Crear" con un documento de tipo **Otros (4)** | **Aceptado → caso 430** | Comprobado en QA |
| "Crear" con un documento de tipo **Sarlaft (2)** | **Aceptado → caso 431** | Comprobado en QA |

## 3. Conclusiones (actualizadas)

1. **Lo que reportamos como BUG-01 ("la lista está vacía") era una secuencia incompleta, no un defecto de parametrización.** Los tipos existen y la radicación Masiva de Póliza Nueva **sí puede crearse**.
2. La explicación de QA es correcta pero **incompleta**. Guardar la fila no basta: la grilla **no se actualiza** tras guardar, y un usuario solo ve los tipos si algo vuelve a pintar el formulario. Hay que decidir si esto se acepta o es un defecto de usabilidad, que proponemos registrar como **BUG-05 (por confirmar)**.
3. **"Solicitud de seguro" ES el tipo documental 3**: su `data-value` en la lista es 3, el mismo ID que cita el mensaje de validación. Esto ya no es una inferencia.
4. **Nuevo — BUG-06 (por confirmar):** la validación de "Crear" pide "al menos un archivo para cada tipo documental obligatorio pendiente. ID: 3", pero **acepta la radicación con un documento de tipo 2 o 4** (casos 430 y 431). Valida que exista *algún* documento, no el tipo obligatorio.
5. **Qué acción guarda la fila:** la acción "save" del pie de la grilla (Bizagi responde `ADDRELATIONWITHDATA`). **Qué habilita los tipos:** que el formulario se vuelva a pintar con la fila ya guardada; la lista sale del render, no de una consulta al abrirla. **Acción funcional normal que refresque:** no se encontró ninguna. Las cuatro acciones naturales probadas no refrescan; solo cambiar un campo con cascada (Sucursal) lo hace. Por eso BUG-05 se mantiene como **posible defecto**: el usuario no tiene una forma natural de ver los tipos después de guardar.

## 4. Cambio recomendado en la matriz (texto propuesto)

> **P9a.** Ingresar la narrativa de la solicitud. — *La narrativa queda registrada.*
> **P9b.** En "Documentos Anexos", seleccionar "Adicionar" y guardar el registro. — *El registro queda guardado y habilita el tipo documental y la carga de archivo.*
> **P9c.** Seleccionar el tipo documental obligatorio ("Solicitud de seguro" para Póliza Nueva, confirmar) y adjuntar el archivo con "Subir". — *El documento queda asociado al registro.*

Debe acompañarse de estas decisiones:
- **BUG-06:** la validación de "Crear" debe exigir un documento **del tipo 3 ("Solicitud de seguro")**, no cualquier documento. Si el funcional decide que basta con cualquiera, el mensaje debe cambiar.
- **Refresco (BUG-05)**, una de dos:
  - **Opción A (corregir el producto):** la grilla se refresca al guardar el registro, sin acciones adicionales. Recomendada.
  - **Opción B (aceptar el comportamiento):** documentar en la matriz qué acción del usuario actualiza la lista.

## 5. Consecuencias para los CP

| CP | Impacto |
|---|---|
| HU06-CP01 (P18–P26) | Requiere calibrar las etiquetas reales del pop-up de Póliza Nueva (UI-10). Un intento con etiquetas de la grilla dejó inutilizable el caso 430 |
| HU06-CP01 | Desbloqueado **solo en la variante** `escenarios/_variantes/hu06-cp01-secuencia-producto.yaml`. Sus reportes (`VARIANTE_HU06-CP01_*.json`) no cuentan para CP01. El escenario oficial conserva la secuencia de la matriz y sigue en FAIL hasta que se apruebe el cambio |
| HU06-CP02–CP04 | En Masiva **Modificación** no se exigió documento (casos 343 y 426). Si se agregan documentos, aplicaría la misma secuencia |
| HU03 (P7 "documentos obligatorios") | Sin verificar: el formulario Individual no se ha observado con el actor correcto (ENV-03) |
| Capability `adjuntar_en_grilla` | Soporta las dos secuencias: `secuencia: matriz` (por defecto) y `secuencia: guardar_primero` con `refrescar_con` declarado. La carga real (diálogo "Subir un archivo") quedó calibrada |

Cuando el funcional apruebe el texto, el cambio en el escenario oficial es declarativo: `secuencia: guardar_primero` en el paso P9 de `3-hu06-cp01.yaml` y la actualización de `fuentes/` con la nueva versión del Excel. La matriz no se modifica localmente.
