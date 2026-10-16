# Estado actual del framework

**Actualizado: 2026-10-15 (noche), por Claude Code — fase «HU06 completa: automatización y ejecución» (prioridad de QA vía Daniel).** Repositorio: `juanmi30/bizagi-qa-framework` (privado). `main` = `da6536b` (merge del PR #4). Esta página describe la rama `feat/sde-hu06-cobertura-completa` (PR en borrador, sin fusionar); checkpoint `docs/orquestacion/checkpoints/2026-10-15-hu06-cobertura-completa.md`; **reporte para QA: `projects/seguros-del-estado/docs/REPORTE-HU06-2026-10-15.md`**. Fase anterior (PR #4): `2026-10-15-avance-funcional-cleanup.md`. Checkpoints anteriores de P-15: `2026-10-15-solo-lectura-segura.md` y `2026-10-15-correcciones-auditoria-pr3.md`; modalidades de ejecución y casos creados: `docs/orquestacion/SEGURIDAD-SOLO-LECTURA.md`. Fases anteriores: `2026-10-14-validaciones-funcionales.md`, `2026-10-14-cierre-jornada.md` (migración a otro equipo) y `2026-10-15-correcciones-auditoria-pr2.md`. Matriz de oportunidades: `projects/seguros-del-estado/docs/MATRIZ-OPORTUNIDADES-2026-10-14.md`. Todo dato de esta página se verificó en esta sesión, salvo lo marcado como *no auditado*.

## Verificaciones técnicas de esta fecha (rama HU06 completa)

| Control | Resultado |
|---|---|
| `npx tsc --noEmit` | Sin errores |
| SDE `@unit` | **237/237**: 232 de `main` + 3 de `texto_exacto` + 2 de `abrir_caso` con work item demorado |
| Ejecuciones reales del 15/10 (Claude Code, autorizadas) | Fase PR #4: HU06-CP05 ×2 (casos 628 y 630), HU06-CP01 oficial (sin caso). Fase HU06: **HU06-CP02 ×3 (casos 637, 638 y 639)**, lecturas controladas de Estructurar (637 y 638), precreación de solo lectura de CP02–CP04 y estado de los casos propios. Detalle en el checkpoint |
| Demo, Colsubsidio, CONPRE | Sin cambios de código compartido (`shared/`, `tools/`) en esta rama; no se reejecutaron |
| Escaneo de credenciales y PII | Diff y evidencia nueva revisados contra todos los valores del `.env` (ver checkpoint) |

**Historial de ejecuciones:** las métricas de abajo salen de `test-results/` (local) y de `docs/evidencia/` (versionada). En un equipo recién clonado solo existe la segunda y da el mismo resultado (ejecutada 3/17, aprobada 0/17; prueba `portabilidad.unit`).

## Seguros del Estado — SDE-CEL (17 CP: HU06 = 5, HU03 = 12)

| Indicador | Valor | Fuente |
|---|---|---|
| Escenarios declarados (implementados) | **13/17** (HU03 CP09–CP12 sin escenario) | `docs/TRAZABILIDAD-17-CP.md` |
| Implementación completa (todos los pasos solo UI) | **0/17**: todos tienen pasos mixtos, de integración o no automatizados | Métrica corregida (H2) |
| CP con ejecución real (último reporte con sesión) | **3/17** (HU06-CP01, HU06-CP02 y HU06-CP05) | `test-results/seguros-del-estado/sde/` y `docs/evidencia/` |
| CP aprobados | **0/17** | — |

| CP | Estado real | Última ejecución | Detalle |
|---|---|---|---|
| HU06-CP05 | **REAL_PASS_PARCIAL** (no es aprobación) | 2026-10-15 15:12, **caso 630** | **Aprobados:** P2, P3, P4, P5 y P7. **Parcial:** P6 (etiquetas PASS y ortografía sin hallazgos + expectativas sin fuente, NOT_AUTOMATED). **P8 observado, pendiente de P-18:** el reporte bruto dice PASS, pero la ruta observada («Consultar información de solicitud» → «Consultar SISE», sin «Estructurar información») no tiene aprobación funcional; interpretación corregida en `docs/evidencia/2026-10-15_interpretacion-caso-630.md`; el escenario corregido lo deja NOT_AUTOMATED. **P9:** Worker AI no comprobado. Corrida previa (caso 628): FAIL de automatización (dos filas en el buscador por el subproceso; corregido en D-43). Máximo alcanzable: REAL_PASS_PARCIAL |
| HU06-CP01 (oficial) | FAIL (`PRODUCTO_POR_CONFIRMAR`: comportamiento observado, **no** defecto de negocio confirmado) | 2026-10-15 15:13, sin caso | **Aprobados:** P2, P3 y P5–P8. **P4:** parcial (etiquetas y obligatoriedad de Sucursal PASS; orden, capitalización y obligatoriedad sin fuente, NOT_AUTOMATED). **P9 detenido por el comportamiento documental** (narrativa PASS; «Tipo Documental» sin opciones hasta guardar la fila, comportamiento de interfaz asociado a BUG-01 y pendiente de decisión funcional, P-02). Se detuvo antes de Crear. Precreación del 14/10 (no cuenta como CP): P2, P3 y P5–P8 PASS, P4 mixto (UI + pendientes), P9 parcial (narrativa sin documentos); Estructurar verificado en el caso 571 (P13–P17, P27–P29 PASS; P1 ortografía: OBS-04). **Pendientes para REAL_PASS: P4** (capitalización y orden sin fuente, D-33), **P12, P17** (Worker AI) **y P28** (UI-04). Máximo: REAL_PASS_PARCIAL |
| HU06-CP02 | **BLOCKED por datos** (ejecutado, sin fallos) | 2026-10-15 17:50, **caso 639** | Radica el intermediario y estructura el analista. **PASS:** P2–P8, P10, P11 y P22 (Observaciones y pestañas). **P9:** ruta a Estructurar en minutos; el Worker AI no es verificable. **P12:** columnas PASS; filas BLOCKED sin narrativa real (D-47; con narrativa sintética, 637: 1 fila, 638 y 639: 0). **P13–P21:** BLOCKED por dato (placas) sin abrir el pop-up (UI-10). Corridas previas: 637 (FAIL de automatización en P10, corregido en D-46) y 638 (P12 con 0 filas, reclasificado en D-47) |
| HU06-CP03 / CP04 | BLOCKED (datos) | Precreación 2026-10-15 (sin caso) | P2 PASS como intermediario; P3 BLOCKED: falta saber qué Ramo de Cumplimiento tiene (CP04) o no tiene (CP03) la propiedad Póliza RCE. Datos del pop-up separados por paso (D-45) |
| HU06-CP01 (variante, no cuenta) | Diagnóstico | Caso 429 | Pasos observados en QA sumando todas las fuentes: P2–P11, P13–P16, P18, P22, P28 y P29 (**18 de 29**). P12 y P17 son integración no verificable (Worker AI); P19–P26 bloqueados por UI-10; P27 falla por BUG-04 |
| HU03-CP01 a CP05 | BLOCKED (datos) | Precreación 2026-10-15 (CP01, CP02; solo lectura, sin crear casos) | CP01 y CP02: **P2–P5 PASS** con INT-013403 (ENV-03 verificado hoy: el intermediario sí ve el proceso); **P6 parcial** (etiquetas y ortografía PASS + expectativas sin fuente, NOT_AUTOMATED; en CP02 además un subpaso no automatizable); **P7 BLOCKED por dato**: placa multipóliza (CP01) y póliza Autos vigente (CP02). Completar información depende de SISE |
| HU03-CP06 a CP08 | BLOCKED (datos) | Pre-creación | P2–P3; falta saber qué ramos de Cumplimiento tienen la propiedad RCE |
| HU03-CP09 a CP12 | Sin escenario | — | Pospuestos hasta calibrar "Completar información" |

**Bloqueos y riesgos:**
- **SISE y la consulta de alertas del intermediario**: QA reporta que hoy no funcionan. Observado el 15/10 a las 17:32: los casos 628 y 630 siguen en «Consultar SISE» más de 2 h después de creados (indicio, no verificación del servicio).
- **Worker AI (P-20):** las Masivas llegan a Estructurar en minutos, pero su resultado no es concluyente con narrativa sintética (637: 1 fila; 638 y 639: 0). Hace falta una narrativa con pólizas o placas reales. Bloquea cualquier E2E de HU03 más allá de la creación.
- **P-17 (cleanup):** ningún actor configurado puede cancelar casos. El intermediario no tiene Admin; el analista lo tiene, pero no encuentra sus casos. Los 18 históricos aparecen sin actividad actual (posible cierre automático, por confirmar). Umbral de pendientes disponible (`SDE_MAX_CASOS_PENDIENTES`).
- **UI-09:** "Completar información de solicitud" nunca se ha observado.
- **UI-10:** etiquetas reales del pop-up "Detalle Polizas Asociadas" desconocidas. La barrera H3 impide abrirlo.
- **BUG-03** (ya reportado por QA, ticket pendiente de registrar): salir del pop-up sin "Guardar" destruye el caso. Casos 342, 350, 426 y 430 inutilizables.
- **BUG-04** ("Observaciónes"): **no reproducido** el 14/10 (caso 571 muestra "Observaciones"); QA debe confirmar si se corrigió.
- **OBS-04** ("Detalle Polizas Asociadas" sin tilde): reproducido el 14/10 por la verificación de ortografía. **OBS-01** y **OBS-03** no se reproducen en el inicio. **OBS-12** (nuevo, por confirmar): Ramo y Sucursal duplicados en el inicio Individual.
- **P-14 / ENV-04:** Ramo y Sucursal se muestran ahora como "<código> - <nombre>" (cambio entre el 13 y el 14/10); datos locales ajustados.
- **BUG-05** (refresco de la grilla de documentos) y **BUG-06** (Crear acepta un tipo documental distinto del obligatorio): por confirmar.
- **ENV-03:** resuelto para la cuenta INT-013403 (rol CE_Intermediarios); `intermediario_alerta` sigue sin rol (verificado de nuevo el 15/10 con `@habilitacion`).
- **Datos:** ninguna póliza, placa ni tomador real; no hay fuente autorizada en el portal.

**Incidente 2026-10-13 (Claude Code):** al correr una prueba unitaria con `--grep "no se pisan"` desde Git Bash, `tools/run.mjs` partió el filtro por los espacios (se lanzaba con shell sin entrecomillar) y Playwright seleccionó pruebas reales. Se ejecutó **HU06-CP05 contra QA y se creó el caso 434** (REAL_PASS_PARCIAL, mismo resultado que 427; sin pop-ups ni acciones destructivas); HU03-CP08 quedó BLOCKED en preflight. Causa raíz corregida en `tools/run.mjs` con prueba de regresión. Activación explícita de las E2E reales: P-06 **resuelta** (D-34, `SDE_E2E=1`). Pendiente de Juan Miguel: qué hacer con los casos 434 y 571 (P-07).

**Confiabilidad (esta rama):** H1 veredicto E2E y JUnit con estado, causa y atribución · H4 causas estructuradas en preflight y ejecución · H6 bloqueo entre procesos para el histórico y las ejecuciones reales · H7 pendientes estructurales y «máximo alcanzable» por CP. Detalle en el checkpoint.

**Correcciones de la auditoría de Work (PR #1):**
- **P0 (D-27):** bloqueo sin carreras. Se publica de forma atómica por enlace, se recupera solo un huérfano demostrable y todo lo demás falla cerrado. Recuperación manual en `RECUPERACION-BLOQUEOS.md`; alcance: un mismo equipo.
- **P1 (D-28):** una certificación solo es satisfactoria con todos los CP en REAL_PASS. REAL_PASS + BLOCKED termina ahora con código distinto de cero. Diagnóstico, precreación y exploración solo aplican con `SDE_TIPO_EJECUCION` explícito.
- **P2 (D-29):** el runner ya no pasa por un shell, así que los argumentos llegan literales y `%VARIABLE%` no se expande.

**Deuda no bloqueante (auditoría final de Work, PR #1):**
- P-08: `SDE_TIPO_EJECUCION` persiste en la sesión.
- P-09: el veredicto global no aparece en los tableros que solo leen JUnit.
- P-10: falta un estado final explícito en `veredicto-e2e.json`.

**Modalidades (D-40):** *solo lectura* (P-15: capacidades por efecto, red que aborta toda acción fuera del formulario de inicio identificado, guardia DOM; rechazo = BLOCKED `POLITICA_SOLO_LECTURA`) y *ejecución funcional controlada* (por defecto; crea y modifica lo que el escenario exige bajo P-06, H6 y UI-10). **Casos creados (D-41):** registro y seguimiento implementados (20 casos SDE registrados como pendientes: 18 históricos + 628 y 630); cierre o limpieza física en SDE **no implementado ni validado** (P-17; diagnóstico del 15/10 y umbral D-44). Detalle en `SEGURIDAD-SOLO-LECTURA.md`.

**Validaciones de presentación (fase del 14/10, D-30 a D-35):** catálogo `data/expectativas-presentacion.yaml` con fuente por expectativa; ortografía por norma RAE/DLE en inicio, Estructurar y Completar; orden, obligatoriedad y capitalización **pendientes de definición** (P-11), nunca verdes. P-06 implementada: las verticales reales exigen `SDE_E2E=1`.

**Decisiones pendientes:** P-11 (fuente de orden/obligatoriedad/capitalización), P-12 (masivos con Iván), P-13 (integraciones caídas), P-14 (formato de Ramo/Sucursal), P-16 (efecto de abrir actividades), P-17 (cierre de casos), P-18 (ruta de consulta unitaria), control de cambios de documentos, BUG-05/BUG-06, FUNC-10 (actor de HU06), ticket de BUG-03, datos SISE y mapeo de UI-10. Ver `DECISIONES.md`.

**Prioridades:**
0. QA aprueba (o corrige) la propuesta de orden y obligatoriedad (`docs/evidencia/2026-10-14_inventario-presentacion.json`): con eso las expectativas pendientes pasan a verificarse.
1. QA responde P-17 (¿cierre automático por «Máximo tiempo de radicación»? ¿usuario con permiso de administrar casos?) y P-18 (nombres de la ruta de consulta unitaria). Con eso se valida el cleanup sobre un caso desechable o se documenta el cierre automático.
2. Cuando QA confirme que SISE y alertas volvieron y entregue la póliza Autos de la clave de INT-013403 y la placa multipóliza: E2E de HU03-CP01/CP02 y calibración de UI-09.
3. BUG-01 (P-02): decisión sobre la secuencia de documentos; mientras siga, HU06-CP01 oficial no pasa de P9. Después, mapeo de UI-10 (captura o definición de QA) y una corrida controlada de HU06-CP01 P18–P26.
4. Evidencia técnica del Worker AI para P9 de CP05 y P12/P17 de CP01, y automatizar el contenido de las pestañas (P28 de CP01, UI-04) en el escenario oficial. **Mientras falte, ni CP01 ni CP05 pueden pasar de REAL_PASS_PARCIAL** (H7; la trazabilidad muestra el «máximo alcanzable» de cada CP).

**Siguiente entregable de diseño (P-19):** casos de prueba de **HU10**, solicitados por Daniel. Se inicia con su documento funcional; no se inventan escenarios.

**Plan de producto** (aplazado mientras HU06 sea la prioridad de QA; sin implementar en esta fase):
- HU02 como piloto certificado para medir la automatización rápida.
- Importación Gemini Gem → JSON.
- Revisión y aprobación gráfica de propuestas.
- Ejecución guiada para analistas sin terminal.
- Integración con el generador Word de soporte de certificación.
- Cleanup reutilizable y verificable (P-17).

**Documentos del proyecto:** `projects/seguros-del-estado/docs/` (RESUMEN-EJECUTIVO, TRAZABILIDAD, TEST-DATA-GAPS, CONTROL-CAMBIOS, GUIA-REUNION, DEMO).

## Otros proyectos

| Proyecto | Estado verificado hoy | Notas |
|---|---|---|
| Demo | Regresión 48/4 (línea base) | Plantilla de ejemplo; los 4 fallos son pruebas sin URL real |
| Colsubsidio (Afiliaciones) | `lifecycle-casos.unit` 12/12, `contrato` 3/3, `login-navegacion.unit` 6/6, `afi-soporte.unit` 32/32 | Proyecto amplio (AFI, Knowledge, Test Data). *Estado funcional no auditado en esta fase* |
| CONPRE | *No auditado* | — |
| _template | Plantilla | — |
