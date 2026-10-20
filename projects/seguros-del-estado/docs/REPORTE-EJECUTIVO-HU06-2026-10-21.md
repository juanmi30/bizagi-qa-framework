# HU06 — reporte para la reunión del 2026-10-21

**Para:** Juan Miguel, para la reunión con Daniel, Karen y el PO · **Preparado por:** Claude Code · Ejecuciones en QA del 20/10/2026 (casos 702–706).

## 1. Resumen

| Indicador | Valor |
|---|---|
| CP con recorrido de ejecución completo en QA | **5/5** |
| Pasos PASS reportados | **90/108** |
| CP aprobados funcionalmente por QA | **0/5** |
| Candidato a aprobación | **CP02** (22/22 PASS), con el incidente P-21a aparte |
| Defecto de persistencia reproducido | **CP03: Ramo RCE no se guarda** |
| CP05 | Ruta Individual observada; falta la confirmación funcional del «camino regular» |

## 2. Resultados comprobados (ejecución real en QA)

| CP | Caso | Configuración | Pasos | PASS | FAIL (por confirmar) | NOT_AUTOMATED / parcial |
|---|---|---|---|---|---|---|
| CP01 Generales PN | 704 | Generales · Póliza Nueva · Masiva | 29 | **24** | P1, P19, P24 | P4 (parcial), P28 (manual) |
| CP02 Autos | 705 | Autos · Ramo 48 · Modificación · Masiva | 22 | **22** | — | — · incidente P-21a aparte |
| CP03 Cumplimiento sin RCE | 702 | Ramo 44 (sin la propiedad) · Modificación · Masiva | 25 | **21** | P14, P22, P23 | P1 (agregado) |
| CP04 Cumplimiento con RCE | 703 | Ramo 40 (con la propiedad) · Modificación · Masiva | 23 | **18** | P16, P17, P19 | P15 (sin criterio), P1 (agregado) |
| CP05 Individual | 706 | Autos · Ramo 48 · Modificación · Individual | 9 | **5** | — | P6, P8, P9 (pendientes de QA), P1 (agregado) |
| **Total** | | | **108** | **90** | **9** | **9** |

- **«PASS»** significa comportamiento observado en Bizagi igual al de la matriz.
- **Ningún CP está aprobado:** la aprobación es de QA.
- **Evidencia:** `docs/evidencia/HU06-CP0{1..5}_20261020-*.json`, continuaciones `CONTINUACION_*` y `2026-10-20_continuaciones-702-703-704.json`.
- **Sobre la última transcripción:** los reportes de algunos tramos se sobrescribieron; ese archivo los transcribe de la salida de consola.

## 3. CP05: correspondencia de P8 y P9 con la matriz

| Paso | Matriz (texto exacto) | Observado en el caso 706 | Correspondencia | Qué falta (QA) |
|---|---|---|---|---|
| P8 | «La compuerta identifica el valor Individual y selecciona la transición correspondiente al flujo regular.» | El registro de transiciones del servidor y el diagrama marcan la compuerta **«¿Masivo o correo?»** y la transición a **«Consultar información de solicitud»** | Coincide: la compuerta tomó la rama que no es Masiva. El modelo la llama «¿Masivo o correo?»; V1.1, «¿Masivo?» | Confirmar que esa transición es «la correspondiente al flujo regular» |
| P9 | «El caso continúa por el camino regular hacia el flujo de consulta unitaria y no es enviado al Worker AI ni a Estructurar Información.» | Actividad actual: subproceso **«Consultar información de solicitud»**, con **«Consultar SISE»** dentro. **No** se recorrió «Estructurar información» ni ninguna tarea del Worker AI: el registro del servidor y el dibujo coinciden en 8 elementos | **Parte negativa:** comprobada con evidencia completa. **Parte positiva:** coincide con la descripción, pero la matriz no nombra las actividades del «flujo de consulta unitaria» | Confirmar que «Consultar información de solicitud → Consultar SISE» es el «flujo de consulta unitaria» (P-18) |

- **Por qué P8 y P9 siguen en NOT_AUTOMATED:** la expectativa `RUTA-CONSULTA-UNITARIA` está *pendiente de definición* (P-18). No se aprueba por coincidir con lo observado.
- **Con la confirmación de QA:** P8 y P9 pasan a PASS sin ejecutar nada más, porque la evidencia del caso 706 ya existe.
- **La negativa gráfica:** deja de ser diagnóstica al integrar los PR #9 y #10.
- **P6:** las etiquetas están y la ortografía no tiene hallazgos, pero faltan las expectativas de presentación aprobadas (P-11).

## 4. Decisiones para QA y el PO

### 4.1 Defectos reproducidos (con evidencia suficiente; no hace falta reproducirlos de nuevo)

| CP / paso | Defecto | Evidencia | Decisión pedida |
|---|---|---|---|
| CP03 P23 | **Ramo RCE no queda guardado**: con «Sí», Ramo RCE y Número Póliza RCE, «Guardar» cierra, pero el servidor guarda la fila sin Ramo RCE | Caso 702, fila 1553. Reproducido 2 veces, la segunda eligiendo solo Ramo RCE | ¿Defecto? Registrarlo |
| CP04 P19 · CP02 (incidente) | **P-21a**: tras un rechazo por longitud (Número Póliza de 8 dígitos o placa de 7 caracteres), un valor válido no se confirma con «Guardar» | Caso 703 (Cumplimiento) y caso 705 (Autos); antes, 653 y 669 | ¿Defecto? Para CP02: ¿se aprueba con este incidente aparte? |

### 4.2 Diferencias de presentación o nomenclatura

| CP / paso | Diferencia | Decisión pedida |
|---|---|---|
| CP01 P19 y P24 | «Forma Consulta» muestra «Identificación **del tomador**»; la matriz dice «Identificación **de Tomador**». El campo sí se asigna solo y es de solo lectura | ¿Corregir la UI o aceptar el texto? |
| CP01 P1 | «Detalle **Polizas** Asociadas» sin tilde (OBS-04) | ¿Corregir? |
| CP01 P21 | El rótulo «Digito de Verificacion del Tomador» va sin tildes. Funcionalmente cumple: visible y de solo lectura | ¿Corregir? |

### 4.3 Expectativas ambiguas o por definir

| CP / paso | Punto | Decisión pedida |
|---|---|---|
| CP03 P14/P22 · CP04 P16/P17 | Los campos numéricos **aceptan escribir letras**; no se probó si «Guardar» las rechaza. La matriz dice «acepta únicamente valores numéricos» / «impide registrar» | ¿Debe impedirse al escribir o basta con rechazar al guardar? |
| CP04 P15 | La matriz no define cómo deben comportarse Ramo RCE y Número Póliza RCE con un Ramo **con** la propiedad (FUNC-05) | Definir el criterio |
| CP05 P8/P9 | «Camino regular / flujo de consulta unitaria» (sección 3) | Confirmar P-18 |
| CP05 P6 · CP01 P4 | Orden, obligatoriedad y capitalización aprobados del formulario de inicio (P-11) | Aprobar la fuente |
| CP03 | La lista «Ramo RCE» ofrece Ramos de **todas** las líneas (incluidas las de Autos). Se eligió «RCE DERIVADA DE CUMPLIMIENTO» por su propiedad `bEsRCE` | ¿Debería filtrarse? ¿Qué Ramo RCE corresponde? |
| CP03/CP04 | La propiedad «Póliza RCE» se tomó del campo del sistema `bEsRCE` (44 = false; 40 y 54 = true) | Confirmar que es la propiedad del requerimiento |
| CP01 P21 | Al elegir NIT se **vacía** el número de documento precargado por el Worker | ¿Es lo esperado? |
| CP01/CP03/CP04 | Bizagi aceptó «Crear» sin documentos (la grilla no estaba marcada como obligatoria). El 13/10 «Crear» exigía un tipo documental (P-02) | ¿Es el comportamiento esperado? |

### 4.4 Partes manuales

| CP / paso | Parte manual |
|---|---|
| CP01 P28 | Revisar el contenido de las pestañas «Documentos de la solicitud» y «Seguimiento/Trazabilidad». La navegación sí está automatizada |
| CP01 P4 | Parte de la presentación depende de P-11 |

## 5. Observaciones (no son resultados del CP)

- **Reasignación:** en el caso 703, «Estructurar información» estaba asignada a otro analista. Se reasignó y se confirmó el mismo work item.
- **Grilla sin refresco:** no refleja de inmediato lo guardado o eliminado; sí al reabrir (P-21c).
- **Métricas del framework:** ejecutada 5/17, aprobada 0/17.
  - Toman el último reporte de cada CP, sin las continuaciones.
  - Por eso CP03 y CP04 figuran como BLOCKED en esa métrica, aunque se ejecutaron completos sobre los mismos casos.

## 6. Integración técnica: PR #9 y PR #10 (sin fusionar)

| PR | HEAD | Base | Contenido | Pruebas |
|---|---|---|---|---|
| **#9** | `feb678e` | `main` (`77f5739`) | Completitud del recorrido gráfico (Issue #8), precedencia FAIL/inconcluso y la decisión del 20/10 (marcado solo en el dibujo → inconcluso). 8 archivos | Focalizadas del recorrido 69/69; SDE `@unit` **343/343** |
| **#10** | `df787bf` | rama del #9 | Formato real de `TransitionLog`, Ramos RCE, barrera UI-10 por bloque, identidad de fila (P18), continuaciones, calibraciones, evidencia y reporte. Delta propio: 32 archivos (sobre todo evidencia) | SDE `@unit` **357/357** en su HEAD |

- **Ancestros:** `main` → #9 → #10 forman una cadena lineal, sin divergencias.
- **Sin archivos sensibles:** ninguno de los dos versiona `.env`, `AGENTS.md` ni `test-results/`.

**Revisión focalizada (sin hallazgos bloqueantes):**
- **Precedencia:** FAIL solo con el nodo prohibido demostrado por el registro de la instancia (GUID único). Queda inconcluso si la ambigüedad toca al propio nodo, si solo el dibujo lo marca o si no hay registro. La identidad de otro caso no produce veredicto.
- **Registro real:** se acepta un GUID por registro, como envía Bizagi; los malformados se rechazan.
- **Lectura gráfica:** la espera se acota al diálogo y exige que cada GUID esté representado una sola vez y marcado.
- **Delta del #10:**
  - P18 se lee por clave; si la clave falta, se repite o no cuadra, queda inconcluso.
  - Las esperas son acotadas y no cambian veredictos.
  - La barrera por bloque solo actúa si el pop-up no se abrió.

**Recomendación:** aprobar ambos merges, en este orden.
1. Fusionar el **PR #9** en `main`.
2. Cambiar la base del **PR #10** a `main`. Su diff queda reducido a su delta propio, porque los commits del #9 ya estarán en `main`.
3. Correr una vez `node tools/run.mjs seguros-del-estado --grep "@unit"` sobre el resultado: se esperan 357/357.
4. Fusionar el PR #10.

Fusionar el #10 sin el #9 no es posible sin arrastrar el #9 (lo contiene). Fusionar solo el #9 deja la Consulta Gráfica real siempre inconclusa: el formato de `TransitionLog` se corrige en el #10.
