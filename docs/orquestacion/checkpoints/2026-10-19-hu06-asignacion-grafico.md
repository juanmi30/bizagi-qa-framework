# Checkpoint «HU06: reasignación autorizada, evidencia gráfica y avances» — 2026-10-19

## Contexto

- **Merge previo:** el PR #6 se fusionó con merge commit `129a45e6b04b851e6446014c3e5267ffea474be5` (padres `bfabc45` y `09f7f1e`), con contenido idéntico al HEAD revisado. Lo autorizó Juan Miguel en esta sesión sin auditoría de Work: **queda pendiente auditarlo**.
- **Rama:** `feat/sde-hu06-asignacion-grafico`, desde `129a45e`. El PR va en borrador y sin fusionar.
- **Confirmaciones de QA (Daniel, 19/10):**
  1. Se autoriza reasignar «Estructurar información» al analista de pruebas.
  2. La visualización gráfica de la instancia es evidencia válida del recorrido.
- **Reporte para la reunión:** `projects/seguros-del-estado/docs/REPORTE-AVANCES-HU06-2026-10-19.md`.
- **Ejecuciones reales:**
  - `SDE_E2E=1` solo por corrida, con 1 worker y sin reintentos;
  - sin pruebas unitarias en paralelo;
  - solo casos propios.

## 1. Calibración (sin crear casos, salvo uno)

| Qué | Cómo se hizo | Resultado |
|---|---|---|
| «Consulta Gráfica» | Sondas temporales de solo lectura (borradas) sobre 654 (Masivo) y 656 (Individual), ambos cerrados | Diálogo con encabezado «Caso:», nodos `processviewer-hotspot` tipados por BPMN («Estructurar información» = `aiworkertask`) y botón «Ruta», que marca los nodos recorridos (`processviewer-highlighted`) |
| Asignación | Caso 668, creado por la corrida de CP02 | Admin → Casos → Administrar Casos: la asignación de cada work item viene en la respuesta `SearchCases`. La reasignación es: casilla del work item → «Reasignar» → buscar por Nombre Usuario → botón «Reasignar» de la fila del usuario |
| Mecanismo de reasignación | 668, hacia el MISMO usuario de pruebas (sin efecto funcional) | `POST /Rest/Cases/Reassign 200`; la consulta posterior confirma; el analista abre la actividad |
| Ruta «ya asignada» | 668 | Sin escrituras de reasignación; el analista abre la actividad |
| Ruta gráfica completa | 654, 656 y 668 | Masivo: «Estructurar información» recorrida. Individual: no recorrida. **Hallazgo:** la primera lectura se hizo a medio dibujar y daba un PASS trivial en Individual; ahora se espera a que la ruta termine de dibujarse |

**Hito cumplido:** acceso a «Estructurar información» y evidencia gráfica de la **misma instancia**, el caso 668.

## 2. Capacidades nuevas

| Capacidad | Archivo | Detalle |
|---|---|---|
| `asegurar_asignacion` / `asegurarAsignacionActividad` (D-52) | `sde/capacidades.ts` | Escritura funcional; denegada en solo lectura (P-15). Causa nueva `ASIGNACION` → BLOCKED |
| `verificar_recorrido_grafico` / `leerRecorridoGrafico` + `evaluarRecorrido` (D-53) | `sde/capacidades.ts` | Observación. Evaluación pura y testeable |
| `dialogo_confirmar espera: no_registra` (D-54) | `sde/capacidades.ts` | P18 de CP02 |
| Selectores de administración y de la Consulta Gráfica | `baseObjects/sde.objects.ts` | Se agregan Reasignar, Liberar y Cancelar de Administrar Casos a la guardia DOM |
| Spec de calibración `asignacion-recorrido.real` | `tests/` | `[solo lectura]` para el recorrido y `[funcional controlada]` para la asignación. Solo casos del histórico local |

**Integración en los escenarios:**
- **Bloque Masivo** (CP02, CP03, CP04 y la variante de CP01): la verificación gráfica sustituye al paso declarativo del Worker, y se asegura la asignación antes de abrir la actividad.
- **CP01:** P12 gráfico y asignación antes de P13.
- **CP05:** P9 gráfico (no recorre «Estructurar información» ni ninguna tarea `aiworkertask`).
- **CP02:**
  - P18 con `no_registra`;
  - P22 antes de P18;
  - se reabre la actividad para P18.

## 3. Ejecuciones reales (19/10)

| Hora | Ejecución | Caso | Resultado |
|---|---|---|---|
| 09:51 | Estado de los casos propios | — | 651–656 cerrados el 19/10 05:00 |
| 09:59 | CP02 | 668 | 18 PASS; P18 cerró el pop-up sin registrar (el oráculo anterior lo daba como FAIL); 4 filas |
| 10:19 | Recorrido gráfico 654, 656 y 668 | — | 3 PASS |
| 10:21–10:22 | Asignación 668 (mecanismo + ruta «ya asignada») | 668 | PASS |
| 10:24 | CP02 | 669 | Todo PASS hasta P21; P18: se rechazó y no se registró, pero no cerró tras restaurar (P-21a), así que P22 no corrió |
| 10:28 | CP02 | **670** | **REAL_PASS: 22/22 pasos de la matriz** |
| 10:30 | CP05 | 671 | REAL_PASS_PARCIAL: P2–P5 y P7 PASS; P9 gráfico PASS; P6, P8 y P9 NOT_AUTOMATED (P-11/P-18) |

- **No se ejecutaron:** CP01 (detenido por BUG-01; nada de lo cambiado afecta P2–P9) ni CP03/CP04 (sin Ramos RCE).
- **Casos nuevos:** 668–671, registrados. El histórico suma 33.
- A las 10:16 una ejecución encontró la sesión del analista cerrada (posible inicio de sesión simultáneo del mismo usuario). Se pausaron las corridas y se reanudó sin incidentes.

## 4. Resultados por CP

| CP | Antes (16/10) | Después (19/10) |
|---|---|---|
| CP01 | FAIL en P9 (BUG-01) | Sin cambios; escenario preparado con el recorrido gráfico y la asignación |
| CP02 | 18 PASS (654) | **REAL_PASS (670)**: técnico y sujeto a revisión de QA (Ramo Autos para Masivo P-12, oráculo de P18, P-21) |
| CP03 / CP04 | BLOCKED en P3 | Sin cambios (P-22) |
| CP05 | REAL_PASS_PARCIAL (656) | REAL_PASS_PARCIAL (671); P9 «no Worker/Estructurar» comprobado gráficamente |

**Indicadores:** ejecutados 3/17 · aprobados **1/17** según la métrica de la automatización (CP02).

## 5. Pruebas

- `npx tsc --noEmit`: sin errores.
- SDE `@unit`: **254/254**, con 14 regresiones nuevas:
  - **recorrido** (7): Masivo, Individual, nodo presente no recorrido, transición errada, caso equivocado, sin indicadores o a medio dibujar, nombre fuera del modelo;
  - **asignación** (7): A a G, sobre un Admin → Casos sintético.
- **Pruebas ajustadas a la semántica nueva:** H7 de CP01 `[4, 28]`, ejecutor, P-18, la regla estática de BUG-03 (acepta `no_registra`) y portabilidad (aprobada 1/17).
- **Word:** el generador existente (`tools/afi-soporte*.mjs`) es de Colsubsidio. Adaptarlo exige trabajo significativo, así que no se generó el borrador Word.

## 6. Pendientes y riesgos

| Pendiente | Estado |
|---|---|
| P-02 | Documentos de CP01 |
| P-12 | Ramo Autos para Masivo |
| P-17 | Cierre por vencimiento: confirmado gráficamente; falta que QA lo acepte como limpieza |
| P-18 | Ruta de CP05 |
| P-21 a–e | Comportamientos del pop-up de Autos |
| P-22 | Ramos RCE |
| Auditoría | PR #6 fusionado sin revisión de Work |

**Riesgos:**
- Si «Guardar» no cierra tras un rechazo, el caso puede quedar inutilizable (653, 669). Por eso P18 va al final.
- Inicio de sesión simultáneo del mismo usuario con las pruebas manuales.
- El nombre de la compuerta en el modelo («¿Masivo o correo?») difiere del texto de V1.1 («¿Masivo?»). No se exige el nombre de la compuerta.
