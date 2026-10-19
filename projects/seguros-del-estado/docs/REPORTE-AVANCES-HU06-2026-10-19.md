# Avances HU06 — reunión del 2026-10-19

**Para:** Daniel y Karen (QA SDE-CEL) · **Preparado por:** automatización (Claude Code), con Juan Miguel

**Fuentes:**
- Requerimiento HU06 V1.1.
- Matriz `20260928_SDE_CEL_V1_Casos de Prueba_HU06.xlsx`.
- Confirmaciones de Daniel del 19/10: reasignación autorizada y evidencia gráfica válida.

> **Evidencia:** solo de corridas del 19/10 (posteriores al despliegue del 16/10 y a la calibración de hoy). Lo anterior se cita como histórico.

## 1. Resumen ejecutivo

- **Los 5 CP de HU06 están automatizados.** Hoy se ejecutaron en QA **CP02** (Masivo Autos) y **CP05** (Individual).
- **CP02 pasó todos sus pasos en QA por primera vez** (caso **670**): 22 de 22, de la radicación a la edición de la tabla.
  - Es un **resultado técnico de la automatización**. Queda **sujeto a su revisión** antes de considerarlo aprobado (ver la sección 5).
- **CP05** (caso **671**):
  - Ruta Individual comprobada en la consulta gráfica: **no pasa por «Estructurar información»**, que es la tarea del Worker AI.
  - Falta confirmar los nombres del camino regular (P-18).
- **CP01** sigue detenido en los documentos (P9). **CP03 y CP04** esperan los Ramos de Cumplimiento con y sin la propiedad «Póliza RCE».

**Problemas operativos resueltos hoy:**

| Problema | Solución |
|---|---|
| «Estructurar información» se asigna por carga y podía quedar en otro analista | La automatización consulta la asignación en **Admin → Casos** y, solo si es de otro usuario, la **reasigna** al analista de pruebas con el mecanismo del portal. Después comprueba que la reasignación quedó guardada |
| La ruta por la compuerta no se podía demostrar | La automatización abre la **Consulta Gráfica** del caso, pulsa **«Ruta»** y lee los nodos que el portal marca como recorridos, no los que solo existen en el modelo |

## 2. Estado por CP

| CP | Pasos | Automatizados | Ejecutado hoy (caso) | PASS | FAIL | BLOCKED | Pendiente / parcial | Resultado |
|---|---|---|---|---|---|---|---|---|
| CP01 Masivo Generales PN | 29 | 28/28 | No (16/10: se detiene en P9, sin caso) | — | — | — | — | Detenido por documentos (P-02) |
| CP02 Masivo Autos | 22 | 21/21 | **Sí (670)** | **22** | 0 | 0 | 0 | **Todos los pasos PASS** (pendiente de su revisión) |
| CP03 Cumplimiento sin RCE | 25 | 24/24 | No | — | — | Desde P3 | — | BLOCKED: falta el Ramo sin la propiedad |
| CP04 Cumplimiento con RCE | 23 | 21/22 | No | — | — | Desde P3 | — | BLOCKED: falta el Ramo con la propiedad |
| CP05 Individual | 9 | 8/8 | **Sí (671)** | 5 | 0 | 0 | P6 parcial; P8 y P9 pendientes de P-18 | Parcial, no aprobado |

**Detalle de CP05 P9:** la matriz pide que el caso «continúa por el camino regular… y no es enviado al Worker AI ni a Estructurar».
- **La segunda parte está comprobada en la Consulta Gráfica.**
- **La primera depende de confirmar los nombres del camino regular (P-18).** Por eso el paso no se da por aprobado.

## 3. Evidencias demostrables

| Qué | Dónde | Caso |
|---|---|---|
| Radicación, número de caso y ruta Masiva | `docs/evidencia/HU06-CP02_20261019-102802.json` (paso a paso) | 670 |
| Consulta Gráfica: ruta recorrida | `docs/evidencia/2026-10-19_asignacion-y-recorrido-grafico.json` | 654, 656, 668 y, en las corridas, 669, 670 y 671 |
| Asignación y reasignación | Mismo archivo. En 668 se ejercitó el mecanismo completo (`Reasignar`, confirmado por la consulta posterior); en 669 y 670 ya estaba asignada y no se tocó | 668–670 |
| Estructurar información y tabla del Worker | Caso 670: 3 filas con las 3 pólizas y las 3 placas ficticias de la narrativa | 670 |
| Edición de la tabla | Elegir Placa, obligatoriedad, guardar, agregar fila y rechazo de una placa de 7 caracteres | 670 |

**Lectura de la Consulta Gráfica:**

| Ruta | Nodos recorridos | No recorrido |
|---|---|---|
| **Masivo** (670) | Inicio Radicación → «¿Masivo o correo?» → **Estructurar información** (tarea Worker AI, actual) | — |
| **Individual** (671) | Inicio Radicación → «¿Masivo o correo?» → **Consultar información de solicitud** | «Estructurar información» |

Nota: en el modelo la compuerta se llama «¿Masivo o correo?» (el texto de V1.1 la llama «¿Masivo?»).

Las capturas del diagrama muestran el usuario creador, así que se conservan localmente y no se versionan. Se pueden presentar en la reunión.

## 4. Lo que aprendimos de la tabla de pólizas

**Probado en CP02:**
- **Extracción:** el Worker extrae todas las pólizas y placas ficticias de la narrativa (3/3 y 3/3, sin valores extra).
- **Forma de Consulta:** al elegir «Placa» solo se muestra el campo Placa; con Placa vacía no se puede guardar.
- **Guardado y adición:** una placa válida se guarda; agregar una fila deja 4 filas.
- **Persistencia:** el valor guardado se ve al reabrir el caso.
- **Longitud de la placa:** una placa de 7 caracteres **no queda registrada**, aunque con dos comportamientos distintos:
  - casos 653 y 669: el pop-up queda abierto;
  - casos 668 y 670: el pop-up se cierra sin guardar el valor.

**Por confirmar (P-21):**
- **a.** Tras rechazar una placa de 7 caracteres, al corregirla, «Guardar» **no cerró** el pop-up (casos 653 y 669). El caso puede quedar inutilizable.
- **b.** Al cambiar a «Placa» se vacía el Número Póliza.
- **c.** La grilla tarda en mostrar lo guardado.
- **d.** El Worker deja vacía la columna «Forma Consulta».
- **e.** ¿Cuál de los dos comportamientos de la placa de 7 caracteres es el esperado?

**Sin calibrar** (no se tocan por seguridad, BUG-03): los pop-ups de Generales Póliza Nueva, Generales Modificación y Cumplimiento.

## 5. Condiciones del resultado de CP02 (para su revisión)

1. **Ramo Autos para Masivo:** se usa el mismo Ramo Autos de los datos de QA (el de Individual). ¿Es válido para Masivo? (Iván, P-12)
2. **P15:** la automatización **selecciona** «Placa», como dice la matriz («Seleccionar la Forma de Consulta Placa…»).
3. **P18:** se considera cumplido si el valor de 7 caracteres **no queda registrado**, se quede abierto el pop-up o no (ver P-21e).
4. **P9:** la ruta hacia la tarea del Worker AI se comprobó en la Consulta Gráfica. La extracción se comprobó aparte, con los datos de la tabla.

## 6. Pendientes y responsables

| Tipo | Pendiente | Responsable |
|---|---|---|
| QA funcional | P-02 (secuencia de documentos de CP01); P-18 (camino regular de CP05); P-21 a–e (pop-up de Autos) | Daniel / Karen |
| Datos y parametrización | Ramos de Cumplimiento con y sin la propiedad «Póliza RCE» (CP03/CP04, P-22); validez del Ramo Autos para Masivo (P-12) | Iván / QA |
| Ambiente / integración | «Consultar SISE» no se completa en el camino Individual (por confirmar su disponibilidad) | QA |
| Automatización | Calibrar los pop-ups de Generales y Cumplimiento cuando haya casos de esas líneas | Claude Code |
| Cleanup | Confirmar que el cierre al vencer «Máximo tiempo de radicación» es la limpieza aceptada. La Consulta Gráfica muestra que los casos terminan en «Solicitud finalizada por vencimiento» | Daniel / Karen |

## 7. ¿Qué se automatizó, qué se probó, qué falta y por qué?

- **Automatizado:** los 5 CP, más la reasignación y la consulta gráfica como capacidades reutilizables.
- **Probado hoy en QA:**
  - **CP02 completo** (22/22, pendiente de su revisión);
  - **CP05** con la ruta Individual comprobada en el gráfico.
- **Falta y por qué:**
  - **CP01**, por la secuencia de documentos;
  - **CP03 y CP04**, por el dato de Ramos RCE;
  - **CP05**, por la confirmación de su camino regular.

Ninguno de estos bloqueos es un defecto confirmado del producto.

**Casos creados hoy:** 668, 669, 670 y 671 (registrados; se cerrarán al vencer el temporizador). No se tocaron casos ajenos ni históricos.
