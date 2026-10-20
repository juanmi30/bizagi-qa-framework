# Avances HU06 — reunión del 2026-10-19 (actualizado en la tarde)

**Para:** Daniel y Karen (QA SDE-CEL) · **Preparado por:** automatización (Claude Code), con Juan Miguel

**Fuentes:**
- Requerimiento HU06 V1.1.
- Matriz `20260928_SDE_CEL_V1_Casos de Prueba_HU06.xlsx`.
- Confirmaciones de Daniel del 19/10: reasignación autorizada y evidencia gráfica válida.
- Confirmaciones de Juan Miguel del 19/10: los documentos solo son obligatorios si la parametrización del formulario lo exige, y la combinación de CP02 es válida (ver la sección 5).

> **Evidencia:** solo de corridas del 19/10 (posteriores al despliegue del 16/10). Lo anterior se cita como histórico.
>
> **Actualización de la tarde:** una auditoría interna (Work) encontró que cuatro verificaciones de la automatización podían dar un PASS sin evidencia suficiente. Se corrigieron y se volvió a revisar todo lo reportado en la mañana (sección 2). **El 22/22 de CP02 en el caso 670 se conserva como resultado histórico, pero ya no es una certificación definitiva**: falta repetir P18 con la verificación corregida.

## 1. Resumen ejecutivo

- **CP01 (Masivo Generales Póliza Nueva) se desbloqueó:** por primera vez desde el 16/10 se creó el caso (**673**). Llegó a «Estructurar información» y se verificó hasta P17. Se detiene en P18 porque el pop-up de Póliza Nueva aún no está calibrado (UI-10), así que P18–P29 quedan pendientes.
- **CP02 (Masivo Autos), caso 670:** de los 22 pasos, **21 siguen sostenidos** con la verificación corregida. **P18** (placa de 7 caracteres) **requiere una corrida nueva**: el «no se registró» se había leído en una grilla que no se refresca.
- **CP05 (Individual), caso 671:** queda **probado con evidencia completa** que el caso no pasa por «Estructurar información», la tarea del Worker AI. Falta confirmar los nombres del camino regular (P-18).
- **CP03 y CP04** siguen esperando los Ramos de Cumplimiento con y sin la propiedad «Póliza RCE».
- **Ningún CP de HU06 está aprobado definitivamente.**

## 2. Ajustes de la auditoría y su efecto

| Verificación | Qué podía pasar antes | Ahora | Efecto en lo reportado |
|---|---|---|---|
| Extracción del Worker (tabla de pólizas) | Se informaba cuántos valores aparecían, sin fallar si faltaban | **Falla** si falta una póliza, placa o NIT de la narrativa, o si aparece un valor que no está en ella. No exige un número exacto de filas | Caso 670: 3/3 pólizas y 3/3 placas, sin valores extra → **se sostiene** |
| Placa de 7 caracteres «no se registra» (CP02 P18) | Bastaba con que el pop-up se cerrara o quedara abierto | Se lee la fila en una **segunda pestaña**, recargada desde el servidor, antes de restaurar. Si no se puede leer, el paso queda pendiente. Si «Guardar» no cierra tras corregir (P-21a), se registra como **incidente aparte** | Caso 670: la lectura se hizo en la grilla de la misma pestaña, que no se refresca → **P18 por repetir** |
| Ruta en la Consulta Gráfica | Se esperaba a que el dibujo «se estabilizara». Una pausa larga podía ocultar un nodo posterior | Se usa el **registro de transiciones que el propio portal descarga** al pulsar «Ruta» (la ruta completa) y la identidad del caso según el servidor. Una ruta «no recorrida» solo se da por probada si el registro y el dibujo coinciden por completo | Revisado en solo lectura: 654 y 670 (Masivo) recorren «Estructurar información»; 656 y 671 (Individual) no, **con evidencia completa** |
| Reasignación de «Estructurar información» | Podía aceptar un work item distinto del original | Exige el **mismo work item**, único y asignado al usuario de pruebas. Si hay ambigüedad, el paso queda bloqueado y no se modifica nada (nunca se usa «Cancelar») | En 669, 670 y 673 ya estaba asignada; no se reasignó |

**Sobre la reasignación hacia otro usuario:** el mecanismo se ejercitó en QA solo hacia el **mismo** usuario de pruebas (caso 668). La reasignación desde otro analista solo está probada en un entorno simulado; todavía no se ha visto en QA.

## 3. Estado por CP

| CP | Pasos | Caso del 19/10 | PASS | FAIL | BLOCKED | Pendiente | Resultado |
|---|---|---|---|---|---|---|---|
| CP01 Masivo Generales PN | 29 | **673** | 15 (P2, P3, P5–P17) | 1 (P1, ortografía «Polizas», OBS-04) | P18 (UI-10) | P4 parcial; P19–P29 sin correr | **FAIL por presentación; recorrido funcional hasta P17** |
| CP02 Masivo Autos | 22 | 670 | 21 sostenidos | 0 | 0 | **P18 por repetir** | Histórico 22/22; **no definitivo** |
| CP03 Cumplimiento sin RCE | 25 | — | — | — | Desde P3 | Ramo sin la propiedad | BLOCKED por dato |
| CP04 Cumplimiento con RCE | 23 | — | — | — | Desde P3 | Ramo con la propiedad | BLOCKED por dato |
| CP05 Individual | 9 | 671 | 5 | 0 | 0 | P6 parcial; P8 y P9 por P-18 | Parcial, no aprobado |

## 4. CP01 y los documentos (P9)

**Cómo se comportan hoy los documentos** (revisado en el formulario de inicio, **sin pulsar «Crear»**):
- La grilla «Documentos Anexos» empieza vacía y **no está marcada como obligatoria**.
- Al agregar una fila, la lista «Tipo Documental» **no ofrece ningún tipo**, ni antes ni después de guardar la fila.
- Cambiar la Sucursal para repintar el formulario **vacía la grilla**. Por eso la secuencia alternativa del 13/10 ya no sirve.

**Decisión aplicada (confirmada por Juan Miguel):** los documentos solo son obligatorios si la parametrización lo exige.
- **Sin evidencia de obligatoriedad,** la automatización continúa sin adjuntar.
- **Si un día la grilla aparece como obligatoria,** agrega la fila, elige el tipo y adjunta un PDF sintético. Luego comprueba que el documento quedó registrado.

**Resultado en QA (caso 673):**
- Bizagi **aceptó «Crear» sin documentos**, el caso llegó a «Estructurar información» y la Consulta Gráfica lo confirma.
- La tabla muestra los **3 NIT ficticios de la narrativa**, sin valores extra.
- **P19–P22** (reglas de Póliza Nueva) **no se ejecutaron:** dependen del pop-up sin calibrar (UI-10). No se dan por aprobados.

**Para su revisión:** el 13/10, «Crear» exigía un tipo documental obligatorio (ID 3). Hoy no lo exige. ¿Es el comportamiento esperado después del despliegue? (P-02)

## 5. CP02: condiciones del resultado

1. **Combinación (P-12), resuelta para CP02:** Juan Miguel ejecutó CP02 manualmente con:
   - Línea Autos;
   - Ramo «48 - AUTOMÓVILES LIVIANOS INDIVIDUAL»;
   - Tipo de Solicitud Modificación;
   - Radicación Masiva.

   Es válida para CP02. No se extiende a otras combinaciones.
2. **P15:** la automatización **selecciona** «Placa», como dice la matriz.
3. **P18:** se exige que la placa de 7 caracteres no quede registrada, comprobado con la lectura independiente. **Pendiente de una corrida nueva** (solo hace falta P18; no hay que repetir CP02 completo).
4. **P9:** la ruta hacia la tarea del Worker AI se comprobó en la Consulta Gráfica. La extracción se comprobó con la aserción corregida.

## 6. Lo que aprendimos de la tabla de pólizas (CP02)

**Probado:**
- **Extracción:** 3/3 pólizas y 3/3 placas, sin valores extra.
- **Forma de Consulta:** al elegir «Placa» solo se muestra Placa; con Placa vacía no se puede guardar.
- **Guardado y adición:** una placa válida se guarda; agregar una fila deja 4 filas.

**Por confirmar (P-21):**
- **a.** Tras rechazar una placa de 7 caracteres y corregirla, «Guardar» no cerró el pop-up (casos 653 y 669). El caso puede quedar inutilizable.
- **b.** Al cambiar a «Placa» se vacía el Número Póliza.
- **c.** La grilla tarda en mostrar lo guardado.
- **d.** El Worker deja vacía la columna «Forma Consulta».
- **e.** Con 7 caracteres el pop-up queda abierto (653, 669) o se cierra (668, 670). **Que el valor no se registró está por verificar** con la lectura independiente.

**Sin calibrar** (no se tocan por seguridad, BUG-03): los pop-ups de Generales Póliza Nueva, Generales Modificación y Cumplimiento.

## 7. Casos

| Caso | Creado por | CP | Estado |
|---|---|---|---|
| 668, 669, 670 | Automatización | CP02 | Cerrados al vencer el temporizador |
| 671 | Automatización | CP05 | Cerrado al vencer el temporizador |
| **673** | Automatización | **CP01** | En «Estructurar información» |

Todos están registrados. No se tocaron casos ajenos ni históricos.

## 8. Bloqueos reales en QA

| Tipo | Pendiente | Responsable |
|---|---|---|
| QA funcional | P-02: confirmar que hoy no hay documentos obligatorios en Generales Póliza Nueva Masiva; P-18: camino regular de CP05; P-21 a–e: pop-up de Autos | Daniel / Karen |
| Calibración (UI-10) | Pop-up «Detalle Polizas Asociadas» de Póliza Nueva. Bloquea CP01 P18–P26. Puede hacerse sobre el caso 673 con su autorización | QA + Claude Code |
| Datos | Ramos de Cumplimiento con y sin la propiedad «Póliza RCE» (CP03/CP04, P-22) | Iván / QA |
| Ambiente | «Consultar SISE» no se completa en el camino Individual | QA |
| Limpieza | Aceptar el cierre al vencer el temporizador como limpieza de los casos de prueba (P-17) | Daniel / Karen |

## 9. ¿Qué se automatizó, qué se probó, qué falta y por qué?

- **Automatizado:**
  - los 5 CP;
  - la reasignación y la Consulta Gráfica, con las verificaciones corregidas;
  - el manejo de documentos según su obligatoriedad.
- **Probado hoy en QA:**
  - **CP01** hasta P17 (caso 673);
  - **CP02** con 21 de 22 pasos sostenidos (caso 670);
  - **CP05** con la ruta Individual probada (caso 671).
- **Falta y por qué:**
  - **CP01 P18–P29:** falta calibrar el pop-up (UI-10);
  - **CP02 P18:** falta una corrida con la lectura independiente;
  - **CP03 y CP04:** faltan los Ramos RCE;
  - **CP05:** falta confirmar el camino regular.

Ninguno de estos bloqueos es un defecto confirmado del producto.
