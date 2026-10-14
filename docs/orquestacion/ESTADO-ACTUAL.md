# Estado actual del framework

**Actualizado: 2026-10-13 (noche), por Claude Code.** Repositorio canónico: `bizagi-qa-framework` (línea base auditada `chore: establish audited portable baseline`, único commit de `main`; detalle en el checkpoint `docs/orquestacion/checkpoints/2026-10-13-linea-base-portable.md`). Todo dato de esta página se verificó en esta sesión, salvo lo marcado como *no auditado*.

## Verificaciones técnicas de esta fecha (copia canónica)

| Control | Resultado |
|---|---|
| `npx tsc --noEmit` | Sin errores |
| SDE `@unit` | **112/112** (107 anteriores + 5 de portabilidad) |
| Demo (regresión) | 48 aprobadas / 4 fallidas: los mismos 4 fallos históricos de plantilla sin URL real |
| Colsubsidio | `login-navegacion.unit` 6/6 · `afi-soporte.unit` 32/32 · `contrato-create-case` 3/3 |
| CONPRE | Solo listado (`--list`): 6 pruebas en 3 archivos; no se ejecutó |
| E2E | **Ninguno** en esta fase; no se crearon casos ni se abrieron pop-ups |
| Escaneo de credenciales y PII | Ver checkpoint de la línea base |

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
| HU06-CP05 | REAL_PASS_PARCIAL | Caso 427 (2026-10-13); también 425 | **6 de 8 pasos PASS** (P2–P5, P7, P8). P6 mixto (ortografía sin glosario) y P9 integración no verificable (Worker AI). **Corrección:** antes se informó "7/9". Radicó CE_Analista (actor de HU06 sin definir, FUNC-10) |
| HU06-CP01 (oficial) | FAIL | 2026-10-13, sin caso | P2–P8 PASS; P9 FAIL con la secuencia de documentos de la matriz (control de cambios propuesto) |
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

**Decisiones pendientes:** control de cambios de documentos, BUG-05/BUG-06, FUNC-10 (actor de HU06), ticket de BUG-03, datos SISE y mapeo de UI-10. Ver `DECISIONES.md`.

**Prioridades:**
1. Cuando QA confirme que SISE y alertas volvieron y entregue la póliza Autos de la clave de INT-013403: E2E de HU03-CP02 y calibración de UI-09.
2. Mapeo de UI-10 (captura o definición de QA) y una corrida controlada de HU06-CP01 P18–P26.
3. Evidencia técnica del Worker AI para P9 de CP05 y P12/P17 de CP01. **Sin ella, ni CP01 ni CP05 pueden pasar de REAL_PASS_PARCIAL** (H7).

**Documentos del proyecto:** `projects/seguros-del-estado/docs/` (RESUMEN-EJECUTIVO, TRAZABILIDAD, TEST-DATA-GAPS, CONTROL-CAMBIOS, GUIA-REUNION, DEMO).

## Otros proyectos

| Proyecto | Estado verificado hoy | Notas |
|---|---|---|
| Demo | Regresión 48/4 (línea base) | Plantilla de ejemplo; los 4 fallos son pruebas sin URL real |
| Colsubsidio (Afiliaciones) | `login-navegacion.unit` 6/6 | Proyecto amplio (AFI, Knowledge, Test Data). *Estado funcional no auditado en esta fase* |
| CONPRE | *No auditado* | — |
| _template | Plantilla | — |
