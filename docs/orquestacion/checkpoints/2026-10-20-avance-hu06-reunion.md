# Checkpoint — avance funcional HU06 para la reunión del 21/10 — 2026-10-20

- **Base:** PR #9 (`fix/sde-completitud-ruta-grafica`), HEAD `eaa60b2` (corrección de precedencia, publicada). Rama local nueva `feat/sde-hu06-avance-reunion-2110`, **sin publicar**.
- **Reporte para Juan Miguel:** `projects/seguros-del-estado/docs/REPORTE-EJECUTIVO-HU06-2026-10-21.md`.
- **QA:** solo lectura (Consulta Gráfica de casos propios cerrados; formulario de inicio sin «Crear» con P-15 instalada). **Sin casos nuevos.** Las sondas temporales se borraron.

## Cambios

| Archivo | Cambio | Decisión |
|---|---|---|
| `sde/capacidades.ts` (`leerRecorridoGrafico`) | Acepta el formato real de `TransitionLog` (un GUID por registro) y rechaza registros sin GUID o con tipos distintos | D-62 |
| `sde/capacidades.ts` (`texto_exacto`) | Espera acotada de 10 s a que aparezca la línea | D-64 |
| `tests/unit/precedencia-recorrido.unit.spec.ts` | +3 regresiones del lector con el formato real y con registros malformados | D-62 |
| `tests/unit/ayuda-asincrona.unit.spec.ts` | 3 regresiones (aparece tarde, nunca aparece, dentro de otra línea) | D-64 |
| `docs/evidencia/` | Precreaciones de CP03/CP04, recorrido de solo lectura del 20/10 y resumen de las sondas (sanitizados) | D-63 |

## Resultados

- `tsc` sin errores; SDE `@unit` **347/347**, código 0.
- **Recorrido (solo lectura):** 654, 670 y 673 Masivo con ruta positiva; 656 y 671 Individual con negativa completa (diagnóstico; depende del PR #9).
- **CP03 (Ramo 44) y CP04 (Ramo 40):** P2–P7 PASS en precreación con el intermediario. No cuenta como ejecución del CP.
- **CP01:** el caso 673 cerró por vencimiento; P27–P29 no se pueden ejecutar sobre él.
- **CP02 P18:** sigue inconcluso (D-60); calibrarlo requiere un caso abierto.

## Pendiente de autorización

- Publicar la rama.
- Cargar los Ramos en el `.env`.
- Corridas que crean casos: CP03/CP04 hasta P11, CP01 con UI-10 y CP02 P18.

Detalle, casos afectados y riesgos en el reporte ejecutivo.

## Actualización — corridas autorizadas de CP03 y CP04 (tarde del 20/10)

- **Autorizaciones de Juan Miguel:**
  - publicar la rama: PR #10, en borrador, con base en la rama del PR #9;
  - modificar 3 variables del `.env`: `SDE_CUMPL_RAMO_SIN_RCE`, `SDE_CUMPL_RAMO_CON_RCE` y `SDE_CUMPL_MOVIMIENTO`;
  - crear como máximo 2 casos.
- **Controles:** `SDE_E2E=1` por corrida, worker único y cupo fijado en el proceso: `SDE_MAX_CASOS_PENDIENTES` = 35 y luego 36, sobre 34 registrados, para admitir exactamente un caso por corrida.
- **CP03 → caso 702:** P2–P11, P24 y P25 PASS. P12–P23 BLOCKED por dato (`SDE_CUMPL_RAMO_RCE`), además del pop-up sin calibrar.
- **CP04 → caso 703:** P2–P11 y P23 PASS. P12–P22 BLOCKED por la barrera UI-10, sin ningún clic (D-65). La reasignación desde otro analista confirmó el mismo work item.
- **Inspección de solo lectura sobre el caso 702:** identidad de fila (D-66). Sin escrituras.
- **PR #9:** 67/67 focalizadas en `eaa60b2`. Queda pendiente la decisión sobre el criterio «marcado en el dibujo y ausente del registro» (ver el reporte).
- **Histórico:** 36 casos. Las sondas temporales se borraron.
