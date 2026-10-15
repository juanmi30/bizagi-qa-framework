# Estado actual del framework

**Actualizado: 2026-10-15, por Claude Code — fase P-15 corregida tras la auditoría de Work del PR #3 (F1–F4).** Repositorio: `juanmi30/bizagi-qa-framework` (privado). `main` = `dd7b3ec` (merge del PR #2). Esta página describe la rama `fix/sde-solo-lectura-segura` (PR en borrador, sin fusionar); checkpoints `docs/orquestacion/checkpoints/2026-10-15-solo-lectura-segura.md` y `2026-10-15-correcciones-auditoria-pr3.md`; modalidades de ejecución y casos creados: `docs/orquestacion/SEGURIDAD-SOLO-LECTURA.md`. Fases anteriores: `2026-10-14-validaciones-funcionales.md`, `2026-10-14-cierre-jornada.md` (migración a otro equipo) y `2026-10-15-correcciones-auditoria-pr2.md`. Matriz de oportunidades: `projects/seguros-del-estado/docs/MATRIZ-OPORTUNIDADES-2026-10-14.md`. Todo dato de esta página se verificó en esta sesión, salvo lo marcado como *no auditado*.

## Verificaciones técnicas de esta fecha (rama de validaciones funcionales)

| Control | Resultado |
|---|---|
| `npx tsc --noEmit` | Sin errores |
| SDE `@unit` | **204/204**: 198 anteriores − 9 pruebas de solo lectura reemplazadas + 15 de la corrección F1–F4 (autoguardado, red, evidencia positiva, abrir_caso, modalidad de las specs reales, control funcional) |
| Demo (regresión) | 48 aprobadas / 4 fallidas: los mismos 4 fallos históricos de plantilla sin URL real |
| Colsubsidio | `lifecycle-casos.unit`, `contrato-create-case`, `login-navegacion.unit` y `afi-soporte.unit`: **53/53** |
| CONPRE | Sin cambios; `--list` 6 pruebas en 3 archivos (no se ejecuta porque hace login real) |
| Ejecuciones reales | Vertical E2E oficial: **ninguna** de Claude Code. Juan Miguel ejecutó HU06-CP05 a las 14:51 (FAIL en P3 por el formato nuevo del Ramo, sin caso). Claude Code: precreaciones de **solo lectura** (10 CP, ningún caso), diagnóstico de listas y **1 caso autorizado (571)** de calibración de Estructurar, releído en solo lectura. Sin pop-ups |
| Escaneo de credenciales y PII | Diff de la rama revisado (ver checkpoint) |

**Historial de ejecuciones:** las métricas de abajo salen de `test-results/` (local) y de `docs/evidencia/` (versionada). En un equipo recién clonado solo existe la segunda y da el mismo resultado (ejecutada 2/17, aprobada 0/17; prueba `portabilidad.unit`).

## Seguros del Estado — SDE-CEL (17 CP: HU06 = 5, HU03 = 12)

| Indicador | Valor | Fuente |
|---|---|---|
| Escenarios declarados (implementados) | **13/17** (HU03 CP09–CP12 sin escenario) | `docs/TRAZABILIDAD-17-CP.md` |
| Implementación completa (todos los pasos solo UI) | **0/17**: todos tienen pasos mixtos, de integración o no automatizados | Métrica corregida (H2) |
| CP con ejecución real (último reporte con sesión) | **2/17** (HU06-CP01 y HU06-CP05) | `test-results/seguros-del-estado/sde/` y `docs/evidencia/` |
| CP aprobados | **0/17** | — |

| CP | Estado real | Última ejecución | Detalle |
|---|---|---|---|
| HU06-CP05 | FAIL (no atribuible al producto) | 2026-10-14 14:51 (Juan Miguel), sin caso: P3 falló porque el Ramo ahora se muestra "48 - …" (P-14). Antes: REAL_PASS_PARCIAL (caso 434) | Precreación del 14/10 (no cuenta como CP): P2–P5 y P7 PASS; P6 mixto (UI PASS + ortografía sin hallazgos + expectativas pendientes); P8–P9 no ejecutados. Máximo alcanzable: REAL_PASS_PARCIAL (P6 y P9) |
| HU06-CP01 (oficial) | FAIL | 2026-10-13, sin caso | P2–P8 PASS; P9 FAIL (secuencia de documentos, control de cambios). Precreación del 14/10 (no cuenta como CP): P2, P3 y P5–P8 PASS, P4 mixto (UI + pendientes), P9 parcial (narrativa sin documentos); Estructurar verificado en el caso 571 (P13–P17, P27–P29 PASS; P1 ortografía: OBS-04). **Pendientes para REAL_PASS: P4** (capitalización y orden sin fuente, D-33), **P12, P17** (Worker AI) **y P28** (UI-04). Máximo: REAL_PASS_PARCIAL |
| HU06-CP01 (variante, no cuenta) | Diagnóstico | Caso 429 | Pasos observados en QA sumando todas las fuentes: P2–P11, P13–P16, P18, P22, P28 y P29 (**18 de 29**). P12 y P17 son integración no verificable (Worker AI); P19–P26 bloqueados por UI-10; P27 falla por BUG-04 |
| HU03-CP01 a CP05 | BLOCKED (datos) | Precreación 2026-10-14, sin crear casos | P2–P5 PASS y P6 con presentación evaluada (sin hallazgos) con INT-013403; P7 necesita datos de QA; Completar información depende de SISE |
| HU03-CP06 a CP08 | BLOCKED (datos) | Pre-creación | P2–P3; falta saber qué ramos de Cumplimiento tienen la propiedad RCE |
| HU03-CP09 a CP12 | Sin escenario | — | Pospuestos hasta calibrar "Completar información" |

**Bloqueos y riesgos:**
- **SISE y la consulta de alertas del intermediario**: QA reporta que hoy no funcionan. Es una indisponibilidad reportada, no verificada por nosotros. Bloquea cualquier E2E de HU03 más allá de la creación.
- **UI-09:** "Completar información de solicitud" nunca se ha observado.
- **UI-10:** etiquetas reales del pop-up "Detalle Polizas Asociadas" desconocidas. La barrera H3 impide abrirlo.
- **BUG-03** (ya reportado por QA, ticket pendiente de registrar): salir del pop-up sin "Guardar" destruye el caso. Casos 342, 350, 426 y 430 inutilizables.
- **BUG-04** ("Observaciónes"): **no reproducido** el 14/10 (caso 571 muestra "Observaciones"); QA debe confirmar si se corrigió.
- **OBS-04** ("Detalle Polizas Asociadas" sin tilde): reproducido el 14/10 por la verificación de ortografía. **OBS-01** y **OBS-03** no se reproducen en el inicio. **OBS-12** (nuevo, por confirmar): Ramo y Sucursal duplicados en el inicio Individual.
- **P-14 / ENV-04:** Ramo y Sucursal se muestran ahora como "<código> - <nombre>" (cambio entre el 13 y el 14/10); datos locales ajustados.
- **BUG-05** (refresco de la grilla de documentos) y **BUG-06** (Crear acepta un tipo documental distinto del obligatorio): por confirmar.
- **ENV-03:** resuelto para la cuenta INT-013403 (rol CE_Intermediarios); `intermediario_alerta` sigue sin rol.
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

**Modalidades (D-40):** *solo lectura* (P-15: capacidades por efecto, red que aborta toda acción fuera del formulario de inicio identificado, guardia DOM; rechazo = BLOCKED `POLITICA_SOLO_LECTURA`) y *ejecución funcional controlada* (por defecto; crea y modifica lo que el escenario exige bajo P-06, H6 y UI-10). **Casos creados (D-41):** registro y seguimiento implementados (18 casos SDE pendientes en el histórico local); cierre o limpieza física en SDE **no implementado ni validado** (P-17). Detalle en `SEGURIDAD-SOLO-LECTURA.md`.

**Validaciones de presentación (fase del 14/10, D-30 a D-35):** catálogo `data/expectativas-presentacion.yaml` con fuente por expectativa; ortografía por norma RAE/DLE en inicio, Estructurar y Completar; orden, obligatoriedad y capitalización **pendientes de definición** (P-11), nunca verdes. P-06 implementada: las verticales reales exigen `SDE_E2E=1`.

**Decisiones pendientes:** P-11 (fuente de orden/obligatoriedad/capitalización), P-12 (masivos con Iván), P-13 (integraciones caídas), P-14 (formato de Ramo/Sucursal), control de cambios de documentos, BUG-05/BUG-06, FUNC-10 (actor de HU06), ticket de BUG-03, datos SISE y mapeo de UI-10. Ver `DECISIONES.md`.

**Prioridades:**
0. QA aprueba (o corrige) la propuesta de orden y obligatoriedad (`docs/evidencia/2026-10-14_inventario-presentacion.json`): con eso las expectativas pendientes pasan a verificarse.
1. Cuando QA confirme que SISE y alertas volvieron y entregue la póliza Autos de la clave de INT-013403: E2E de HU03-CP02 y calibración de UI-09.
2. Mapeo de UI-10 (captura o definición de QA) y una corrida controlada de HU06-CP01 P18–P26.
3. Evidencia técnica del Worker AI para P9 de CP05 y P12/P17 de CP01, y automatizar el contenido de las pestañas (P28 de CP01, UI-04) en el escenario oficial. **Mientras falte, ni CP01 ni CP05 pueden pasar de REAL_PASS_PARCIAL** (H7; la trazabilidad muestra el «máximo alcanzable» de cada CP).

**Documentos del proyecto:** `projects/seguros-del-estado/docs/` (RESUMEN-EJECUTIVO, TRAZABILIDAD, TEST-DATA-GAPS, CONTROL-CAMBIOS, GUIA-REUNION, DEMO).

## Otros proyectos

| Proyecto | Estado verificado hoy | Notas |
|---|---|---|
| Demo | Regresión 48/4 (línea base) | Plantilla de ejemplo; los 4 fallos son pruebas sin URL real |
| Colsubsidio (Afiliaciones) | `lifecycle-casos.unit` 12/12, `contrato` 3/3, `login-navegacion.unit` 6/6, `afi-soporte.unit` 32/32 | Proyecto amplio (AFI, Knowledge, Test Data). *Estado funcional no auditado en esta fase* |
| CONPRE | *No auditado* | — |
| _template | Plantilla | — |
