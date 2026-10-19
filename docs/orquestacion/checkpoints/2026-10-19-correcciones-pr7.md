# Checkpoint «Correcciones del PR #7 y desbloqueo de HU06-CP01» — 2026-10-19 (tarde)

## Contexto

- **Auditoría de Work del PR #7:** veredicto REQUIERE CORRECCIONES. HEAD auditado `b728e8f4013c08f36f8e78958ec37984084478be`, base `129a45e`.
- **Rama:** la misma, `feat/sde-hu06-asignacion-grafico`. El PR #7 sigue en borrador y sin fusionar.
- **Confirmaciones de Juan Miguel (19/10):**
  1. Los documentos solo son obligatorios si la parametrización del formulario lo exige; se permiten documentos sintéticos autorizados.
  2. CP02 se ejecutó manualmente con Autos, Ramo «48 - AUTOMÓVILES LIVIANOS INDIVIDUAL», Modificación y Masiva: esa combinación es válida para CP02 (P-12, solo CP02).

## 1. Correcciones

| Hallazgo | Corrección | Decisión |
|---|---|---|
| F1 (ALTA) `tabla_verificar.comparar` solo observaba | `evaluarExtraccion`: falla si falta un valor de la narrativa o aparece uno ajeno; informa repeticiones y filas verificadas; no exige un número exacto de filas; expectativa insuficiente → NOT_AUTOMATED | D-55 |
| F2 (ALTA) `no_registra` se fiaba del pop-up o de la grilla de la misma pestaña | `leerCeldaPersistida` (otra pestaña, formulario renderizado de nuevo) ANTES de restaurar + `evaluarNoRegistra`. Recuperación separada de la validación. P-21a = **incidente separado** (`SalidaCapacidad.incidente`): detiene el recorrido y el CP no queda REAL_PASS | D-56 |
| F3 (MEDIA) fin del dibujo por estabilidad | Sonda de solo lectura: el dibujo es un temporizador sin señal en el DOM. La ruta completa sale de `GET /Rest/Cases/TransitionLog` (al pulsar «Ruta») y la identidad, de `WorkitemsGuid.currentCase`. `evaluarRecorrido` distingue ruta positiva observada, negativa con evidencia completa, todavía dibujando, finalización incierta y contradicción | D-57 |
| F4 (MEDIA) `.find()` en la verificación de la reasignación | Exige un único work item, el mismo `idWorkItem` y el usuario objetivo; si no, BLOCKED `ASIGNACION`. Nunca «Cancelar» | D-58 |
| CP01 P9 (prioridad) | `adjuntar_en_grilla secuencia: segun_obligatoriedad` y precondición de Línea y Tipo de Solicitud antes de «Crear» | D-59 |

**Archivos de código:**
- `sde/capacidades.ts`;
- `sde/ejecutor.ts` (incidente separado; causas «extracción distinta» y «quedó registrado»);
- `sde/escenario.ts` (secuencia nueva);
- `baseObjects/sde.objects.ts` (rutas de la Consulta Gráfica);
- escenarios CP01 y CP02.

## 2. Pruebas

- `npx tsc --noEmit`: sin errores.
- SDE `@unit`: **284/284**. Son 30 regresiones nuevas:
  - F1: 7 (`correcciones-pr7`);
  - F2: 8 (`correcciones-pr7`), con un portal sintético de dos pestañas;
  - F3: 10 (`asignacion-recorrido`; reemplazan las 7 anteriores);
  - F4: H, I, J y K (`asignacion-recorrido`);
  - CP01 P9: 8 (`cp01-documentos`).
- **Contra el HEAD auditado:** se usó un worktree temporal fuera del repositorio, ya eliminado, con URL base sintética y sin `.env`. Fallan **32 de 44** regresiones. Las que reproducen el defecto original:
  - F1: el código auditado daba PASS con valores faltantes, inesperados o con expectativa insuficiente;
  - F2: daba PASS con el valor persistido, con el pop-up abierto o cerrado, y con persistencia no verificable;
  - F3: daba PASS con una pausa larga seguida del nodo prohibido y no detectaba la identidad según el servidor;
  - F4: H e I devolvían éxito.

  Las demás fallan por textos o API nuevos. Detalle en `docs/evidencia/2026-10-19_correcciones-pr7.json`.
- **Incidente técnico de la sesión (corregido):** un reemplazo con PowerShell recodificó `correcciones-pr7.unit.spec.ts` y dañó sus tildes. Se reparó a UTF-8 y se repitió la comparación con el HEAD.

## 3. Ejecuciones reales (19/10, tarde)

| Orden | Ejecución | Modalidad | Resultado |
|---|---|---|---|
| 1 | Sonda del dibujo de la ruta (654, 670, 671) | Solo lectura (sonda temporal borrada) | Temporizador de ~215 ms por elemento; `TransitionLog` y `WorkitemsGuid` identificados |
| 2 | `@recorrido-grafico` 654, 656, 670 y 671 | Solo lectura | 4 PASS: Masivo con ruta positiva; Individual con evidencia completa (9/9) |
| 3 | Calibración de «Documentos Anexos» (Generales / PN / Masiva) | Formulario de inicio, **sin «Crear»** | Sin marca de obligatoriedad y sin tipos antes y después de guardar la fila; repintar con Sucursal vacía la grilla; Escape cierra el formulario |
| 4 (14:31) | **HU06-CP01, una corrida controlada** | Funcional (`SDE_E2E=1`) | **Caso 673.** P9 sin documentos → Bizagi aceptó «Crear». P2, P3 y P5–P17 PASS; P1 FAIL no bloqueante (OBS-04); P18 BLOCKED por UI-10; P19–P29 sin correr |

- **Un intento de lectura del recorrido** terminó en «La sesión expiró», pero la captura mostraba el portal con sesión activa: fue un falso «login» transitorio. Se repitió una vez y pasó.
- **Casos nuevos:** solo el 673, registrado. El histórico suma 34 casos. No se repitió CP02.

## 4. Estado de CP02 (caso 670) con las verificaciones corregidas

- **Se sostienen con la evidencia existente:**
  - P12, extracción: el reporte dice «3 de 3 introducidos aparecen», sin otros valores, para pólizas y para placas;
  - P9, ruta positiva (revalidada en solo lectura);
  - P10, asignación: ruta «ya asignada», que no ejercita la verificación posterior.
- **Requiere una corrida nueva:** P18. Su detalle («la fila 1 conserva DEF456») viene de la grilla de la misma pestaña, que no se refresca. El 670 está cerrado, así que no se puede leer su fila ahora.
- **El reporte histórico de 670 no se modificó.**

## 5. Pendientes y riesgos

| Pendiente | Estado |
|---|---|
| CP02 P18 con lectura independiente | Corrida nueva (crea un caso); requiere autorización |
| UI-10, pop-up de Póliza Nueva | Bloquea CP01 P18–P26. Puede calibrarse sobre el caso 673 con autorización de QA |
| P-02 | QA debe confirmar que hoy Generales PN Masiva no exige documentos (el 13/10 «Crear» exigía el tipo ID 3) |
| P-18, P-21, P-22, P-17 | Sin cambios |

**Riesgos:**
- **Lectura independiente de P18:** abre la misma actividad en una segunda pestaña. No está probada en QA; si Bizagi la bloquea, P18 queda no concluyente, nunca PASS.
- **Reasignación hacia otro usuario:** solo se validó sintéticamente.
- **El ejecutor se detiene ante un BLOCKED:** en 673, P27–P29 (que no usan el pop-up) no corrieron.
