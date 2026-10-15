# Checkpoint "Validaciones funcionales SDE (reunión QA 2026-10-14)" — 2026-10-14

- Commit inicial: `f40bde7` (`main`) · Commit final: HEAD de `feat/sde-validaciones-funcionales` (PR en borrador hacia `main`, sin fusionar)
- Para revisar: `git diff f40bde7..feat/sde-validaciones-funcionales --stat` y `git log f40bde7..feat/sde-validaciones-funcionales --oneline`

## 1. Resumen técnico

- **Mecanismo de validaciones de presentación (D-30):** se añadió al validador y al ejecutor existentes, sin una arquitectura paralela.
  - Catálogo por proyecto `data/expectativas-presentacion.yaml`: cada expectativa aprobada cita su fuente; las no definidas quedan `pendiente_definicion` con responsable y dejan el paso en NOT_AUTOMATED.
  - Verificaciones nuevas: `expectativa`, `orden`, `opcional` y `ortografia`.
  - Lógica pura y genérica en `shared/utils/ValidacionesPresentacion.ts`, sin reglas de ningún proyecto.
- **Reglas ortográficas con fuente normativa RAE/DLE (D-31).** Los hallazgos ya registrados se citan por su ID, sin duplicarlos.
- **Pasos `no_bloqueante` (D-32):** un defecto de presentación deja el CP en FAIL sin cortar el recorrido.
- **Validaciones incorporadas a los 13 escenarios**, vinculadas a su paso de la matriz:
  - formulario de inicio: P4 y P6 en HU06-CP01; P6 en HU06-CP05 y en HU03 CP01 a CP08;
  - Estructurar información: P1 de HU06-CP01 (el objetivo nombra «la visualización» de la actividad);
  - Completar información: el paso de nomenclatura de cada HU03.
- **P-06 aprobada e implementada (D-34):** las verticales reales exigen `SDE_E2E=1`.
- **Ejecución real controlada:**
  - precreaciones de solo lectura de 10 CP, sin crear casos;
  - 1 caso autorizado (571) para Estructurar información, releído en solo lectura.
- **Cambio de parametrización en QA:** Ramo y Sucursal se muestran ahora como «<código> - <nombre>». Se detectó, se ajustaron los datos locales y se corrigió el diagnóstico del combo.

## 2. Archivos y cambios relevantes

| Archivo | Motivo |
|---|---|
| `shared/utils/ValidacionesPresentacion.ts` (nuevo) | Comparación con el texto aprobado (exacto / difiere en ortografía / ausente), orden relativo y aplicación de reglas ortográficas. Genérico y puro |
| `projects/seguros-del-estado/data/expectativas-presentacion.yaml` (nuevo) | Reglas RAE/DLE, hallazgos conocidos y 13 expectativas (7 aprobadas con fuente, 6 pendientes con responsable) |
| `sde/presentacion.ts` (nuevo) | Carga y validación estricta del catálogo |
| `sde/escenario.ts` | Verificaciones `orden`, `opcional`, `ortografia` y `expectativa`; clave `no_bloqueante`, solo en `verificar` |
| `sde/ejecutor.ts` | Expectativa aprobada → se verifica citando la fuente; pendiente → NOT_AUTOMATED; `no_bloqueante` continúa solo ante una diferencia observada |
| `sde/capacidades.ts`, `sde/ui.ts`, `baseObjects/sde.objects.ts` | Inventario de campos en orden de lectura (sin valores); textos de presentación visibles; diagnóstico de etiquetas con diferencia de ortografía; `opcional`; el combo informa las opciones reales al fallar |
| `sde/metricas.ts` | Un paso que cita una expectativa pendiente cuenta como declarativo (D-33) |
| `sde/verticales.ts` | `activacionE2e`: P-06 |
| `escenarios/*.yaml`, `_bloques/presentacion-{inicio,estructurar,completar}.yaml` (nuevos), `_bloques/estructurar-secciones.yaml` | Validaciones por CP. «Observaciones» se verifica antes de las pestañas (caso 571). HU06: «Movimiento» → «Tipo de Solicitud» (recalibrado en el caso 571) |
| `tests/precreacion.real.spec.ts` | Se detiene antes de cualquier carga de archivo; vuelca `PRESENTACION_<CP>_*.json` |
| `tests/calibracion.real.spec.ts` | Presentación de Estructurar al abrir la actividad e inventario; etiqueta recalibrada |
| `tests/unit/presentacion.unit.spec.ts` (nuevo), `confiabilidad`, `clasificacion`, `ui-sintetico` | 17 pruebas nuevas de presentación, 2 de P-06 y 1 de diagnóstico del combo; ajustes de H7/H2 justificados por D-33 |
| `manifest/casos.yaml` | BUG-04 no reproducido; OBS-12 y ENV-04 nuevos |
| `docs/MATRIZ-OPORTUNIDADES-2026-10-14.md` (nuevo), `docs/TRAZABILIDAD-17-CP.md` (regenerado), `docs/evidencia/*` | Matriz por CP; evidencia sanitizada: inventario de presentación, resumen de ejecuciones, reporte de HU06-CP05 de las 14:51 e histórico con los casos 434 y 571 |
| `README.md` (SDE), `CONTEXTO-MAESTRO.md`, `DECISIONES.md`, `ESTADO-ACTUAL.md` | Uso, decisiones D-30 a D-35, P-11 a P-14 y estado |

## 3. Diferencias respecto al checkpoint anterior

- La ortografía de los formularios deja de ser NOT_AUTOMATED: se verifica con fuente normativa. Orden, obligatoriedad y capitalización siguen sin fuente y quedan pendientes, ahora declaradas explícitamente.
- **HU06-CP01 P4** pasa a pendiente para REAL_PASS (D-33). Las pruebas de H7 y H2 se ajustaron en consecuencia.
- **P-06 resuelta.**

## 4. Pruebas

- `npx tsc --noEmit`: sin errores.
- `node tools/run.mjs seguros-del-estado --grep "@unit"`: **175/175** (155 + 20).
- Demo: 48/4, los mismos 4 fallos históricos.
- Colsubsidio (4 suites unitarias): 53/53.
- CONPRE: `--list` 6 pruebas en 3 archivos.
- P-06 de punta a punta: la vertical HU06-CP05 sin `SDE_E2E=1` queda BLOCKED (CONFIGURACION), sin sesión ni caso; el veredicto es NO CONCLUYENTE y el código de salida 1.
- **Ejecuciones reales** (detalle en `docs/evidencia/2026-10-14_validaciones-presentacion.txt`):
  - **Precreaciones de solo lectura** (red: `CREATENEWCASE` abortado):
    - primera pasada: fallo en Ramo en los 4 CP prioritarios, por el formato nuevo;
    - diagnóstico de listas;
    - segunda pasada completa de 10 CP, ningún caso.
  - **Calibración autorizada:** crea el **caso 571**, que llega a Estructurar. Luego tres lecturas en solo lectura del mismo caso:
    - P14 fallaba por la etiqueta «Movimiento»;
    - tras recalibrar, «Observaciones» fallaba al verificarse después de las pestañas;
    - tras reordenar, todo pasa salvo P1, por OBS-04.
  - **Ninguna vertical E2E oficial** de Claude Code. La de HU06-CP05 de las 14:51 la ejecutó Juan Miguel.

## 5. Estado de los 17 CP

- Implementados 13/17 (completos 0) · ejecutados 2/17 · aprobados **0/17**.
- **HU06-CP05:** pasa de REAL_PASS_PARCIAL (caso 434) a **FAIL no atribuible al producto**, porque su última ejecución real (14:51) tropezó con el formato nuevo del Ramo. El máximo alcanzable no cambia: REAL_PASS_PARCIAL.
- **Resto de CP:** sin cambios de estado. La precreación y la calibración no cuentan como ejecución del CP.

## 6. Bugs, bloqueos y hallazgos

| ID | Tipo | Estado tras esta fase |
|---|---|---|
| BUG-04 «Observaciónes» | Defecto reportado por el cliente | **No reproducido** (caso 571): confirmar si se corrigió |
| OBS-04 «Detalle Polizas Asociadas» | Ortografía | **Reproducido** por la verificación automática (ya registrado; no se duplica) |
| OBS-01, OBS-03 | Ortografía / tipografía | No reproducidos en el inicio |
| OBS-12 | Nuevo, por confirmar | Ramo y Sucursal visibles y editables dos veces en el inicio Individual |
| ENV-04 / P-14 | Ambiente | Ramo y Sucursal con formato «<código> - <nombre>» desde el 14/10. **No es un defecto** |
| BUG-03, UI-10, UI-09, INT-01/02 | — | Sin cambios: pop-up vetado; SISE y alertas sin servicio; Worker AI sin traza |

## 7. Evidencias y observabilidad

- `docs/evidencia/2026-10-14_inventario-presentacion.json`: 11 pantallas, solo etiquetas, grupo, orden, obligatoriedad y solo lectura; sin valores.
- `docs/evidencia/2026-10-14_validaciones-presentacion.txt`, `HU06-CP05_20261014-145128.json` e `historico-casos.json` (con 434 y 571).
- **Lo que no es observable:** el Worker AI (la grilla del caso 571 tuvo 1 fila; su procesamiento no se ve), SISE y las alertas.

## 8. Riesgos conocidos

- Las reglas ortográficas son normativas, pero QA puede vetarlas (D-31). La regla de «Sí» se retiró el 15/10 (observación de Work) y quedó como expectativa pendiente.
- `opcional` y `obligatorio` solo son concluyentes con el campo vacío (Bizagi quita la marca). El inventario lo indica con `conValor`.
- La parametrización de QA cambia sin aviso (P-14). La selección exacta lo detecta como falla de dato, no del producto.
- Los datos locales `.env` cambiaron (Ramo y Sucursal). Otro equipo necesita el mismo ajuste.
- La trazabilidad usa el último reporte ejecutado. Por eso HU06-CP05 aparece en FAIL hasta una nueva ejecución autorizada.

## 9. Propuestas que requieren aprobación

- D-30 a D-33 y D-35: revisión de Work y del orquestador. D-34 ya está aprobada.
- P-11: fuente de orden, obligatoriedad y capitalización (propuesta adjunta).
- P-12: masivos con Iván.
- P-13: integraciones caídas.
- P-14: confirmar el formato de Ramo y Sucursal.
- P-07: casos 434 y **571**.
- Ejecutar HU06-CP05 con `SDE_E2E=1` (crea un caso) para reemplazar el FAIL de las 14:51 con los datos ajustados: requiere autorización.
