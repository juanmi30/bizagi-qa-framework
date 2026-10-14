# Siguiente fase — backlog priorizado SDE-CEL

## 0000. Tras el sprint de consolidación HU06 (2026-10-13)

| Orden | Disparador externo | Trabajo inmediato (ya preparado) |
|---|---|---|
| 1 | El administrador aplica la configuración del Plan Maestro: rol "Radicador" + "Tipo de usuario" + "PER - Intermediario" con Clave | `node tools/run.mjs seguros-del-estado habilitacion.real --workers=1 --trace off` → debe dar `3 passed`. Luego HU03-CP02 (falta la póliza Autos) y calibración de solo lectura de "Completar información de solicitud" (UI-09) |
| 2 | QA entrega capturas o la definición del pop-up "Detalle Polizas Asociadas" (Póliza Nueva, Autos, Cumplimiento) | Corregir etiquetas en `3-hu06-cp01.yaml` (P19–P25) y en CP02–04, recargar NIT sintéticos válidos (la Matriz Data lo permite, cliente N/A) y ejecutar P18–P26 |
| 3 | El funcional aprueba el control de cambios y decide BUG-05 y BUG-06 | `secuencia: guardar_primero` en P9 del escenario oficial |
| 4 | BUG-04 corregido | P27 de todos los HU06 deja de fallar. CP01 NO llega a REAL_PASS solo con 2, 3 y 4: P12/P17 (Worker AI) siguen sin traza; el máximo sin esa evidencia es REAL_PASS_PARCIAL |
| 5 | Evidencia técnica del Worker AI (logs o API) y glosario de etiquetas | Cerrar P9 y P6 de HU06-CP05 |

## 000. Tras el sprint del 2026-10-13 (tarde)

Resumen para la reunión: `RESUMEN-EJECUTIVO-REUNION-2026-10-13.md`. Guía de demostración: `DEMO-QA-2026-10-13.md`.

| Orden | Disparador | Trabajo inmediato |
|---|---|---|
| 1 | Administrador Bizagi asigna rol y permiso de inicio a los intermediarios (ENV-03, causa identificada) | `node tools/run.mjs seguros-del-estado bloqueos --grep "ENV-03"` (con `SDE_VERIFICAR_BLOQUEOS=1`) para confirmar; luego HU03-CP02 y calibración de "Completar información de solicitud" (UI-09) |
| 2 | QA entrega dos NIT de prueba | HU06-CP01 P18–P26 con la variante o con el escenario oficial (si se aprueba el control de cambios) |
| 3 | El funcional aprueba `CONTROL-CAMBIOS-DOCUMENTOS-HU06.md` | Pasar `secuencia: guardar_primero` al P9 del escenario oficial y actualizar `fuentes/` con el Excel nuevo |
| 4 | El funcional decide FUNC-10 (actor que radica HU06) | Ajustar actores de HU06 CP01/CP05 o CP02–04 y repetir CP05 si cambia el radicador |

## 00. Punto de partida real tras la recuperación y la Fase 1C (2026-10-13)

Estado completo en `RECUPERACION-ESTADO-ACTUAL.md`. Resumen:
- **Fase 1C ejecutada**: export sanitizado, métricas de tres indicadores, clasificación ambiente/producto, trace off obligatorio, UI-04/05/06, bloques reutilizables y escenarios de los 10 CP de Fase 2.
- **Cobertura:** implementada 13/17 · ejecutada 2/17 (HU06-CP05, HU06-CP01) · aprobada **0/17** (CP05 = REAL_PASS_PARCIAL, caso 425).
- **Bloqueos externos vigentes** (verificados el 2026-10-13): ENV-03, BUG-01, BUG-02 (por confirmar), BUG-03 (ampliado) y todos los datos de negocio.

**Próxima fase propuesta: "Fase 2-A — desbloqueo y primera ejecución de la familia Individual"**, condicionada a QA. No tiene sentido otra ronda de código sin desbloqueos: lo que falta depende de ambiente y datos.

| Orden | Disparador (externo) | Trabajo técnico inmediato |
|---|---|---|
| 1 | ENV-03 resuelto (o confirmación escrita de que radica solo el Analista) | Correr `@cp02` (HU03). Calibrar "Completar información de solicitud" (UI-09) solo con lectura y quitar los `[PENDIENTE]` de los bloques `individual-hasta-completar`, `correo-facturacion` y `cierre-completar`. Esto desbloquea a la vez CP01 y CP03–08 |
| 2 | Datos HU03 (póliza Autos, placa multipóliza, póliza Generales, tomadores) | Ejecutar HU03 CP01–CP05 en orden, uno por caso, con `--workers=1 --trace off` |
| 3 | Decisión sobre el pop-up (BUG-03) | Acordar con QA cómo cerrar el pop-up de forma segura (siempre con "Guardar" de una fila válida) **antes** de ejecutar HU06 CP02–04, cuyos pasos negativos dejan el pop-up abierto si fallan |
| 4 | BUG-01 corregido + tipo documental 3 | `@cp01` completo |
| 5 | Usuario con alerta real, póliza de otro intermediario, póliza inexistente | Escenarios de excepción HU03 CP09–CP12 (Fase 3) con los mismos bloques: solo cambian los pasos 14+ |

Riesgos abiertos: Completar información nunca se ha observado (UI-09); OBS-11 (Número Póliza `maxlength=20` frente a 9–12); los casos propios se cierran a las ~2 h, así que una calibración debe hacerse en ese plazo.

## 0. Punto de partida tras la Fase 1B (2026-10-08, histórico)

HU06-CP05 en **PASS real (REAL_PASS_PARCIAL)**. HU03-CP02 **BLOCKED**. HU06-CP01 **FAIL por BUG-01**. Detalle en `REPORTE-FASE1B.md`.

**Acciones para desbloquear, en orden de impacto:**

| # | Quién | Acción | Desbloquea |
|---|---|---|---|
| 1 | Admin Bizagi / QA | **ENV-03**: habilitar "Gestión Solicitudes Centro Expedición" a los usuarios intermediarios (hoy `Rest/Processes/All` les devuelve categorías vacías) | Toda HU03 con el actor de la matriz; HU06 radicada por intermediario |
| 2 | Funcional / Dev | **BUG-01**: parametrizar los tipos documentales de "Documentos Anexos" (Masivo; el tipo 3 es obligatorio en Póliza Nueva) | HU06-CP01 (P9→P29) |
| 3 | Funcional / Dev | **BUG-03**: corregir "Invalid scope action type" tras Cancelar el pop-up de "Detalle Polizas Asociadas" | HU06-CP01 P18–P26 sin destruir casos |
| 4 | Funcional | **BUG-02**: confirmar si un Individual radicado por CE_Analista debe detenerse en "Consultar Alertas Intermediario" | Ruta completa de HU03 |
| 5 | QA datos | `SDE_AUTOS_POLIZA`, `SDE_GEN_MASIVO_NARRATIVA_POLIZAS`, `SDE_EST_TOMADOR_NIT(_2)`, nombre del tipo documental 3 | HU03-CP02, HU06-CP01 |

**Al resolverse 1 y 5 (póliza):** cambiar `actores`/`iniciar_sesion` de CP02 si hiciera falta (ya está en intermediario), correr `@cp02` y calibrar "Completar información de solicitud" con `SDE_EXPLORAR=1`. Es la única actividad sin DOM verificado.
**Al resolverse 2 y 3:** correr `@cp01`; no hay que tocar selectores de inicio ni de Estructurar (verificados), solo los del pop-up de "Detalle Polizas Asociadas" para Póliza Nueva (Forma Consulta = Identificación de Tomador, campos del tomador).

## A. Fase 1b (histórico: plan original, ya ejecutado; ver §0)

Orden obligatorio: sin el paso 1 no tiene sentido el 2.

1. **[ENV-01] Credenciales.** QA escribe intermediario y analista en el `.env` local → correr `@login`. *Criterio:* ambos logins en verde.
2. **[UI-01/UI-02] Calibración.** `SDE_EXPLORAR=1` → `exploracion.real.spec.ts`. Con el JSON y las capturas, ajustar **solo** `baseObjects/sde.objects.ts`: contenedor de campo, opciones de lista, zona de botones, número de caso, buscador, título de actividad y acciones de grilla. Confirmar si abrir el formulario ya crea caso. *Criterio:* el escenario HU06-CP05 llega a "Crear" sin errores `[calibrar …]`.
3. **[DATA-01/04] HU06-CP05** → primer E2E. *Esperado:* `REAL_PASS_PARCIAL` (P6 parcial y P8/P9 INTEGRATION_NOT_VERIFIED) con número de caso.
4. **[DATA-09/05] HU03-CP02.** Si "Crear" exige documentos, convertir el `no_automatizado` del P7 en `adjuntar`, con el tipo documental de DOCS-OBLIGATORIOS.
5. **[DATA-02/03] HU06-CP01.** Calibrar la grilla "Pólizas asociadas" y el pop-up (UI-03), confirmar columnas (FUNC-06) y resolver FUNC-04 (vaciar el campo antes del P22 si el Worker AI ya lo llenó).
6. Regenerar `TRAZABILIDAD-17-CP.md` y actualizar `REPORTE-FASE1.md` con números de caso y estados reales.

## B. Backlog por tipo (prioridad: P0 > P1 > P2)

### TEST_DATA_GAP
Ver `TEST-DATA-GAPS.md` (P0: ítems 1–10; P1: Fase 2; P2: Fase 3).

### ENVIRONMENT_GAP
| ID | Prioridad | Qué falta | Siguiente acción de QA |
|---|---|---|---|
| ENV-01 | P0 | Credenciales intermediario y analista (+ `intermediario_alerta` en P2) | Solicitar usuarios QA SDE y cargarlos en el `.env` local |
| ENV-02 | P1 | Acceso a la API OData de Bizagi SDE (client_id/secret o token) | Si se habilita, `BizagiApiClient` (ya existe en `shared/`) permitiría consultar actividades y estado del caso **directamente**, para pasar compuertas de UI_PASS a evidencia directa |

### UI_CAPABILITY_GAP
| ID | Prioridad | Brecha | Propuesta |
|---|---|---|---|
| UI-01 | P0 | Selectores sin calibrar | Exploración (A.2) |
| UI-02 | P0 | Número de caso tras "Crear" | Calibrar `BIZAGI_CASE_NUMBER_SELECTOR/LABEL` |
| UI-03 | P0 | Grilla y pop-up de Estructurar Información | Calibrar `accionTabla`/`dialogo`/`filaDatos` |
| UI-04 | P1 | Pestañas Documentos de la solicitud / Seguimiento | Capability `abrir_pestana` + verificación de contenido de la traza (Seguimiento = evidencia de actividades recorridas) |
| UI-05 | P1 | Pruebas negativas (Placa > 6, no numérico, 9–12 dígitos) | Capability `intentar_diligenciar { esperado_mostrado }` que registre el valor resultante sin fallar por post-condición |
| UI-06 | P1 | Selección única en la tabla de pólizas (HU03-CP01) | Capability `tabla_seleccionar_fila` + verificación `seleccion_unica` |
| UI-07 | P2 | Caso termina tras Desistir (CP09) | `verificar_ruta { termina: true }` (caso cerrado en la búsqueda) |
| UI-08 | P2 | Tabla de documentos con "Carta de nombramiento" obligatoria (CP10) | `adjuntar` sobre la fila del tipo documental |

### INTEGRATION_VISIBILITY_GAP
| ID | Prioridad | Brecha | Evidencia que QA o arquitectura debe aportar |
|---|---|---|---|
| INT-01 | P1 | SISE / Consultar alertas sin traza | Log de integración de Bizagi (Admin > Log de interfaces) o acceso de solo lectura a una tabla o atributo con el request/response saneado |
| INT-02 | P1 | Worker AI sin traza | Log o atributo del caso con el estado del procesamiento del Worker AI |
| INT-03 | P2 | Reconsulta con valor corregido | Traza del segundo request SISE (CP11/CP12) |

### FUNCTIONAL_AMBIGUITY (para el analista funcional; afectan aserciones exactas)
| ID | Pregunta concreta |
|---|---|
| FUNC-01 | ¿La etiqueta es "Tipo de Solicitud/Movimiento", "Tipo de Solicitud" o "Tipo de Movimiento"? ¿Cambia entre Inicio y Estructurar Información? |
| FUNC-02 | Nombre exacto de las Líneas en la lista: ¿"Generales" o "General"? ¿"Cumplimiento" o "Cumplimiento (Fianzas)"? |
| FUNC-03 | Nombre exacto de la actividad de análisis tras "Confirmar Radicación" (la matriz dice "Análisis") |
| FUNC-04 | HU06-CP01 P22: si el Worker AI llenó el número de documento, ¿se debe vaciar para probar la obligatoriedad? |
| FUNC-05 | HU06-CP04 P15: ¿cómo deben comportarse Ramo RCE y Número de Póliza RCE cuando el Ramo tiene la propiedad? |
| FUNC-06 | Columnas exactas de "Pólizas asociadas a la solicitud" |
| FUNC-07 | Texto exacto de la opción: "Número de póliza" vs "Numero de Poliza" |
| FUNC-08 | HU03 CP03–08 P4 esperan "opciones correspondientes a Autos" con Línea General o Cumplimiento: ¿error de copia en la matriz? |
| FUNC-09 | HU03 CP04/05 P5 (Póliza Nueva por Tomador) esperan "campo Número de póliza": ¿o es Tipo/Número de documento? |

## C. Fase 2 — cobertura parametrizada

- **F-MASIVO-ESTRUCTURAR** (HU06-CP02/03/04): mismo esqueleto que `3-hu06-cp01.yaml`, variando Línea, Forma de Consulta (Placa / Número de póliza) y la pregunta RCE. Requiere UI-05.
- **F-INDIVIDUAL-CONSULTA** (HU03-CP01, CP03–08): mismo esqueleto que `2-hu03-cp02.yaml`, variando el criterio (Placa / Póliza / Tomador), el bloque de vehículo (Autos sí, Generales no) y el bloque RCE. CP01 requiere UI-06.
- No crear escenarios sin datos READY. Cada uno debe pasar el validador y el manifest debe pasar de PREPARADO a BLOCKED o EJECUTABLE.

## D. Mejoras genéricas candidatas a `shared/` (solo con evidencia de QA real)

1. Verificaciones `solo_lectura` / `obligatorio` / `botones_exactos` / `texto_exacto` en `runner/hazards.ts`, una vez calibradas contra **dos** portales (SDE + otro).
2. Modo estricto opcional en `FormActions` (etiqueta exacta y única), sin cambiar el comportamiento por defecto.
3. `tools/run.mjs`: pasar los argumentos sin `shell: true` en Windows (o citarlos) para que `--grep` admita espacios.
4. `registerScenarios`: anotar el "modo esqueleto" como `skip` en lugar de PASS para proyectos que lo pidan (`SKELETON_AS_SKIP=1`), y así evitar falsos verdes.

---

## Prompt sugerido para la Fase 2 (actualizado tras la Fase 1B)

```
Trabaja en projects/seguros-del-estado/. Lee primero docs/REPORTE-FASE1B.md (estado real, selectores
verificados, BUG-01..04, ENV-03), docs/TEST-DATA-GAPS.md y docs/SIGUIENTE-FASE.md §0.
1. Verifica con `npm test -- seguros-del-estado --grep "@login" --workers=1 --trace off` y revisa si ENV-03,
   BUG-01, BUG-02, BUG-03 siguen abiertos (explora sin crear casos; nunca uses Cancelar en el pop-up de
   "Detalle Polizas Asociadas" mientras BUG-03 esté abierto).
2. Corre @cp05 (regresión), luego @cp02 y @cp01 si sus bloqueos se levantaron. Calibra SOLO
   baseObjects/sde.objects.ts para "Completar información de solicitud" y el pop-up de Póliza Nueva.
3. Fase 2 (HU06-CP02/03/04, HU03-CP01, CP03–08): mismo esqueleto que los verticales; listas reales ya
   conocidas (Línea: Autos|Generales|Cumplimiento; Ramos por línea en REPORTE-FASE1B). Solo CP con datos READY.
4. Mantén --workers=1 --trace off, sin fuzzy/.first() ambiguo/sleeps; INTEGRATION_NOT_VERIFIED para SISE/Worker AI.
5. Cierre: tsc, suite SDE, regresión demo + colsubsidio login-navegacion.unit, escaneo de secretos, @docs.
```

### Prompt de la Fase 2 original (referencia histórica)

```
Trabaja en projects/seguros-del-estado/ (copia aislada del framework Bizagi/Playwright). Lee primero
docs/REPORTE-FASE1.md, docs/AUDITORIA-REUTILIZACION.md, docs/TEST-DATA-GAPS.md y docs/SIGUIENTE-FASE.md.

Precondición: el .env local de SDE tiene credenciales de intermediario y analista y los datos P0 (no
imprimas sus valores). Si falta algo, corre la suite: los verticales quedarán BLOCKED con la lista
exacta; repórtala y sigue con lo independiente.

1. Calibración: `npm test -- seguros-del-estado --grep "@login" --workers=1 --headed`; luego
   `SDE_EXPLORAR=1` + `exploracion.real.spec.ts`. Ajusta SOLO baseObjects/sde.objects.ts. No uses
   .first() ambiguo, fuzzy matching, force:true, sleeps ni catch silenciosos en aserciones.
2. Ejecuta, en este orden y con --workers=1, @cp05, @cp02 y @cp01 hasta obtener REAL_PASS o
   REAL_PASS_PARCIAL con número de caso real, o un FAIL explicado. Cada corrección de un fallo debe
   explicar si fue de calibración, de dato o un defecto funcional del producto (este último se reporta,
   no se "arregla" en la prueba).
3. Implementa UI-04, UI-05 y UI-06 como capabilities declarativas en sde/ (validador estricto y pruebas
   unitarias con DOM sintético + control negativo), y escribe los escenarios de la Fase 2
   (HU06-CP02/03/04, HU03-CP01, CP03–08) SOLO para los CP con datos READY.
4. Mantén SISE / Worker AI / compuertas como INTEGRATION_NOT_VERIFIED salvo evidencia directa
   (ENV-02 / INT-01 / INT-02).
5. Al cerrar: npx tsc --noEmit; suite SDE completa; regresión demo + colsubsidio login-navegacion.unit;
   regenera TRAZABILIDAD-17-CP.md (@docs) y actualiza REPORTE con comandos, números de caso, estados por
   paso y lo que sigue bloqueado. No reportes verde sin sesión, caso y resultado observados.
```
