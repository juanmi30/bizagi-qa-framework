# Checkpoint «HU06 completa: automatización y ejecución» — 2026-10-15

- **Merge previo registrado:** PR #4 fusionado con merge commit `da6536b982d6e43666643406949d927149ba6c80`, cuyos padres son `1ae1efd` y `c844354`. El contenido es idéntico al HEAD aprobado por Work.
- **Commits:** inicial `da6536b` (`main`). Final: HEAD de `feat/sde-hu06-cobertura-completa`, en un PR en borrador sin fusionar.
- **Prioridad:** encargo de QA vía Daniel: automatizar y probar todos los CP de HU06.
- **Aplazados en esta fase:** HU02 piloto e interfaz gráfica.
- **Reporte para QA:** `projects/seguros-del-estado/docs/REPORTE-HU06-2026-10-15.md`.
- **Ejecuciones reales autorizadas por Juan Miguel:** `SDE_E2E=1` solo en cada corrida vertical, con 1 worker y sin reintentos. Se respetaron el bloqueo H6 y el cupo de casos pendientes.
- **Barreras:** UI-10/BUG-03 intactas: no se abrió ningún pop-up y no se pulsó Cancelar, Desistir ni Terminar.

## 1. Matriz de cobertura HU06 (antes → después)

| CP | Pasos matriz | Automatizados | Antes (`main`) | Después (15/10) | Próxima acción |
|---|---|---|---|---|---|
| CP01 | 29 | 28/28 | FAIL P9 (15:13), sin caso | Sin cambios: P2, P3, P5–P8 PASS; P4 parcial; P9 FAIL por confirmar (BUG-01). P17 ahora separa estructura y filas (D-47) | Decisión sobre la secuencia de documentos (P-02); narrativa real; pop-up y NIT |
| CP02 | 22 | 21/21 | **Nunca ejecutado** (preflight BLOCKED) | **Ejecutado, caso 639:** P2–P8, P10, P11 y P22 PASS; P9 Worker no verificable; P12 estructura PASS y filas BLOCKED; P13–P21 BLOCKED por dato | Narrativa con placas reales; placas de QA; calibrar pop-up de Placa |
| CP03 | 25 | 24/24 | Nunca ejecutado | Precreación: P2 PASS; P3 BLOCKED (Ramo sin propiedad RCE) | Ramo sin RCE, póliza y datos RCE (Iván) |
| CP04 | 23 | 21/22 | Nunca ejecutado | Precreación: P2 PASS; P3 BLOCKED (Ramo con propiedad RCE) | Ramo con RCE, movimiento y pólizas (Iván) |
| CP05 | 9 | 8/8 | REAL_PASS_PARCIAL, caso 630 | Sin nueva ejecución; 630 sigue en «Consultar SISE» | P-18 (ruta), SISE y Worker |

**Indicadores:** ejecutados 2/17 → **3/17** · aprobados **0/17** · escenarios 13/17.

- La cobertura efectiva de CP02 pasó de 0 a **10 pasos aprobados en QA**.
- «Automatizados» significa que el paso tiene un paso declarativo. Los pasos del pop-up existen pero no se ejecutan hasta tener calibración y datos.

## 2. Escenarios y capacidades

| Cambio | Archivo | Motivo |
|---|---|---|
| **D-45:** datos de creación separados de los datos del pop-up | `data/datasets.yaml`; escenarios de CP02, CP03 y CP04 | Antes, la falta de placas y pólizas bloqueaba **todo** el CP en el preflight. Ahora solo bloquea los pasos del pop-up, sin abrirlo, y el recorrido continúa |
| CP02 usa el Ramo y el movimiento Autos ya vigentes en QA | `datasets.yaml` | El Tipo de Solicitud se asigna solo y coincide (P3 PASS). Su validez para Masivo debe confirmarla Iván |
| **D-46:** `abrir_caso` espera el work item | `sde/capacidades.ts` | En el caso 637, la actividad aparecía en el buscador antes de que Bizagi entregara el work item |
| **D-47:** filas del Worker solo con narrativa real; estructura siempre | Escenarios de CP01 (P17) y CP02 (P12); `datasets.yaml` | Con narrativa sintética el resultado no es concluyente (1 fila / 0 filas) |
| Diagnóstico de `texto_exacto` | `sde/ui.ts`, `sde/capacidades.ts` | Distingue «ausente» de «dentro de otra línea» |
| `.env.example` sin `SDE_AUTOS_MASIVO_MOVIMIENTO` (ya no se usa) | `.env.example` | La regresión exige que coincida con el registro. El `.env` local no se modificó |

## 3. Ejecuciones reales (QA)

| Hora | Ejecución | Caso | Resultado |
|---|---|---|---|
| 17:32 | Estado de los casos propios (buscador, solo lectura) | — | 628 y 630 en «Consultar SISE»; los 18 históricos sin actividad |
| ~17:35 | Precreación de solo lectura CP02/CP03/CP04 (×2 para CP02) | — | CP02 P2–P5 y P7 PASS. P6 falló en la precreación, pero en las 3 corridas reales pasó: probablemente es un artefacto del modo de solo lectura, no del producto (inferencia; la causa exacta no se aisló). CP03/CP04 BLOCKED en P3 |
| — | 2 sondas DOM temporales de solo lectura (no versionadas, borradas) | — | No concluyentes |
| 17:40 | HU06-CP02 oficial | **637** | P2–P8 PASS. P9: ruta a Estructurar observada, pero el paso de la matriz queda INTEGRATION_NOT_VERIFIED (Worker AI). P10 FAIL de automatización (WorkItems vacío) |
| 17:42 | Lectura controlada de Estructurar (calibración, sin guardar) | 637 | Se abre; encabezado y pestañas PASS; **1 fila** en la grilla; OBS-04 |
| 17:44 | HU06-CP02 oficial (con D-46) | **638** | P2–P11 PASS (work item en el 2.º intento). P12 FAIL: 0 filas |
| 17:45 y 17:50 | Lecturas controladas | 638 | 0 filas, 1 y 6 minutos después de crearlo |
| 17:50 | HU06-CP02 oficial (con D-47) | **639** | BLOCKED por datos, sin fallos: P2–P8, P10, P11 y P22 PASS |

- El primer intento de CP02 coincidió con 3 pruebas unitarias lanzadas a la vez. Desde entonces, ninguna prueba unitaria se ejecutó en paralelo con una corrida real.
- No se reejecutaron CP01 ni CP05: ningún cambio afectaba sus pasos y habrían creado casos sin ganar evidencia.

## 4. Worker AI y SISE

Detalle en la sección 3 del reporte. En resumen:
- **A (crear y consultar):** sí.
- **B (SISE completa):** no en más de 2 h. No prueba que SISE esté caído.
- **C (invocación del Worker):** no verificable desde el portal. Las Masivas llegan a Estructurar en minutos.
- **D (resultado):** no concluyente con narrativa sintética.
- **E (regla del CP):** pendiente.

## 5. Casos nuevos y cleanup

- **Esta fase:** 637, 638 y 639 (HU06-CP02), registrados al responder CREATENEWCASE. Los tres quedan en «Estructurar información», sin guardar ni avanzar.
- **Total en el histórico:** 23 casos SDE «Pendiente de depurar».
- **Cierre:** ningún caso se cerró. El cleanup sigue sin validar (P-17).
- **Límite de pendientes:** `SDE_MAX_CASOS_PENDIENTES` no estaba configurado (el umbral lo acuerda QA). La fase se limitó a 3 casos, cada uno justificado por una corrección de automatización.

## 6. Pruebas

- `npx tsc --noEmit`: sin errores.
- SDE `@unit`: **237/237** (232 + 5 nuevas).
- **Regresiones nuevas:**
  - `texto_exacto`: línea propia, texto dentro de otra línea y ausente;
  - `abrir_caso`: work item entregado en el 2.º intento, y fallo con motivo e intentos si nunca llega.
- **Ajustes:**
  - `.env.example` coincide con el registro;
  - la portabilidad refleja «ejecutada 3/17».
- **Sin cambios:** las regresiones de P-06, P-15, UI-10, el cupo atómico y P-18 siguen pasando. No se tocó código compartido (`shared/`, `tools/`).

## 7. Pendientes

| Pendiente | Estado |
|---|---|
| P-02 | Secuencia de documentos; bloquea CP01 P9 |
| P-12 | Ramo Autos para Masivo (Iván) |
| P-17 | Cleanup |
| P-18 | Ruta de CP05 |
| UI-10 | Pop-ups; bloquea la edición de filas en CP01–CP04 |
| P-19 (nueva) | Diseño de casos de prueba de HU10 |
| P-20 (nueva) | Evidencia del Worker |

Preguntas en la sección 7 del reporte.

## 8. Riesgos residuales

- La edición de filas de CP01–CP04 sigue fuera de alcance hasta calibrar el pop-up. Un error con el pop-up abierto destruye el caso (BUG-03).
- La validez del Ramo Autos para Masivo no está confirmada.
- Los resultados del Worker con datos sintéticos no son concluyentes.
- Los casos se acumulan mientras no exista cierre (23 pendientes).
- QA cambia flujos y parametrización sin aviso: ya ocurrió el 14/10 y el 15/10.
