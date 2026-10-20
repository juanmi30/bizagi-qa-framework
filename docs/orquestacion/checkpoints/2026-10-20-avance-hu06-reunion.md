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
