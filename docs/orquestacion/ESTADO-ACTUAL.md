# Estado actual del framework

**Actualizado: 2026-10-14, por Claude Code (correcciones de la auditoría de Work sobre el PR #1).** Repositorio: `juanmi30/bizagi-qa-framework` (privado). `main` = `2e12b6a`: merge del PR #1 (confiabilidad SDE más las correcciones de Work), aprobado por Work con observaciones y fusionado el 2026-10-14. La rama `fix/sde-confiabilidad-resultados` se conserva hasta confirmar la integración; checkpoints `docs/orquestacion/checkpoints/2026-10-13-confiabilidad-sde.md` y `2026-10-14-correcciones-auditoria-pr1.md`. Todo dato de esta página se verificó en esta sesión, salvo lo marcado como *no auditado*.

## Verificaciones técnicas de esta fecha (rama de confiabilidad)

| Control | Resultado |
|---|---|
| `npx tsc --noEmit` | Sin errores |
| SDE `@unit` | **155/155**: 112 de la línea base, 18 de H1/H4/H6/H7 y 25 de las correcciones de Work (P0 bloqueo, P1 veredicto y P2 runner) |
| Demo (regresión) | 48 aprobadas / 4 fallidas: los mismos 4 fallos históricos de plantilla sin URL real |
| Colsubsidio | `lifecycle-casos.unit`, `contrato-create-case`, `login-navegacion.unit` y `afi-soporte.unit`: **53/53** (el histórico usa el bloqueo nuevo) |
| CONPRE | Sin cambios; `--list` 6 pruebas en 3 archivos (no se ejecuta porque hace login real) |
| E2E | Correcciones de Work: **ninguna**. Fase anterior: **1 ejecución real ACCIDENTAL** (incidente), en la que HU06-CP05 creó el caso **434**; ningún pop-up abierto. Ver «Incidente» abajo |
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
| HU06-CP05 | REAL_PASS_PARCIAL | Caso 434 (2026-10-13, ejecución **accidental**, mismo resultado); antes 427 y 425 | **6 de 8 pasos PASS** (P2–P5, P7, P8). P6 mixto (ortografía sin glosario) y P9 integración no verificable (Worker AI). **Corrección:** antes se informó "7/9". Radicó CE_Analista (actor de HU06 sin definir, FUNC-10) |
| HU06-CP01 (oficial) | FAIL | 2026-10-13, sin caso | P2–P8 PASS; P9 FAIL con la secuencia de documentos de la matriz (control de cambios propuesto). **Pendientes estructurales para REAL_PASS: P12 y P17** (Worker AI sin traza) **y P28** (contenido de las pestañas declarado no automatizado en el escenario oficial, UI-04). Máximo alcanzable hoy: REAL_PASS_PARCIAL |
| HU06-CP01 (variante, no cuenta) | Diagnóstico | Caso 429 | Pasos observados en QA sumando todas las fuentes: P2–P11, P13–P16, P18, P22, P28 y P29 (**18 de 29**). P12 y P17 son integración no verificable (Worker AI); P19–P26 bloqueados por UI-10; P27 falla por BUG-04 |
| HU03-CP01 a CP05 | BLOCKED (datos) | Pre-creación 2026-10-13, sin crear casos | P2–P6 verificados con el intermediario habilitado INT-013403; P7 necesita datos SISE |
| HU03-CP06 a CP08 | BLOCKED (datos) | Pre-creación | P2–P3; falta saber qué ramos de Cumplimiento tienen la propiedad RCE |
| HU03-CP09 a CP12 | Sin escenario | — | Pospuestos hasta calibrar "Completar información" |

**Bloqueos y riesgos:**
- **SISE y la consulta de alertas del intermediario**: QA reporta que hoy no funcionan. Es una indisponibilidad reportada, no verificada por nosotros. Bloquea cualquier E2E de HU03 más allá de la creación.
- **UI-09:** "Completar información de solicitud" nunca se ha observado.
- **UI-10:** etiquetas reales del pop-up "Detalle Polizas Asociadas" desconocidas. La barrera H3 impide abrirlo.
- **BUG-03** (ya reportado por QA, ticket pendiente de registrar): salir del pop-up sin "Guardar" destruye el caso. Casos 342, 350, 426 y 430 inutilizables.
- **BUG-04** ("Observaciónes"): hace fallar P27 en todo HU06.
- **BUG-05** (refresco de la grilla de documentos) y **BUG-06** (Crear acepta un tipo documental distinto del obligatorio): por confirmar.
- **ENV-03:** resuelto para la cuenta INT-013403 (rol CE_Intermediarios); `intermediario_alerta` sigue sin rol.
- **Datos:** ninguna póliza, placa ni tomador real; no hay fuente autorizada en el portal.

**Incidente 2026-10-13 (Claude Code):** al correr una prueba unitaria con `--grep "no se pisan"` desde Git Bash, `tools/run.mjs` partió el filtro por los espacios (se lanzaba con shell sin entrecomillar) y Playwright seleccionó pruebas reales. Se ejecutó **HU06-CP05 contra QA y se creó el caso 434** (REAL_PASS_PARCIAL, mismo resultado que 427; sin pop-ups ni acciones destructivas); HU03-CP08 quedó BLOCKED en preflight. Causa raíz corregida en `tools/run.mjs` con prueba de regresión. Pendiente de Juan Miguel: qué hacer con el caso 434 (P-07) y si las E2E reales deben exigir una activación explícita (P-06).

**Confiabilidad (esta rama):** H1 veredicto E2E y JUnit con estado, causa y atribución · H4 causas estructuradas en preflight y ejecución · H6 bloqueo entre procesos para el histórico y las ejecuciones reales · H7 pendientes estructurales y «máximo alcanzable» por CP. Detalle en el checkpoint.

**Correcciones de la auditoría de Work (PR #1):**
- **P0 (D-27):** bloqueo sin carreras. Se publica de forma atómica por enlace, se recupera solo un huérfano demostrable y todo lo demás falla cerrado. Recuperación manual en `RECUPERACION-BLOQUEOS.md`; alcance: un mismo equipo.
- **P1 (D-28):** una certificación solo es satisfactoria con todos los CP en REAL_PASS. REAL_PASS + BLOCKED termina ahora con código distinto de cero. Diagnóstico, precreación y exploración solo aplican con `SDE_TIPO_EJECUCION` explícito.
- **P2 (D-29):** el runner ya no pasa por un shell, así que los argumentos llegan literales y `%VARIABLE%` no se expande.

**Deuda no bloqueante (auditoría final de Work, PR #1):**
- P-08: `SDE_TIPO_EJECUCION` persiste en la sesión.
- P-09: el veredicto global no aparece en los tableros que solo leen JUnit.
- P-10: falta un estado final explícito en `veredicto-e2e.json`.

**Decisiones pendientes:** control de cambios de documentos, BUG-05/BUG-06, FUNC-10 (actor de HU06), ticket de BUG-03, datos SISE y mapeo de UI-10. Ver `DECISIONES.md`.

**Prioridades:**
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
