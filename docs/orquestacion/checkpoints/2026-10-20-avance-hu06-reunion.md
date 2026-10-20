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

## Cierre de la sesión de ejecución (noche del 20/10)

- **702/703:** abiertos hasta el 21/10 a las 04:39/04:41. Pop-up de Cumplimiento calibrado sobre ellos y continuaciones P12–P23 / P12–P22.
  - **CP03:** 25/25 ejecutados, 21 PASS, FAIL en P14, P22 y P23.
  - **CP04:** 23/23 ejecutados, 18 PASS, FAIL en P16–P17 y P19; P15 NOT_AUTOMATED.
- **CP01, caso 704** (nuevo, autorizado): vertical P2–P17, P27 y P29 con la barrera por bloque. Pop-up de Póliza Nueva calibrado con etiquetas reales y P18–P26 en continuaciones. 29/29 ejecutados, 24 PASS, FAIL en P1, P19 y P24.
- **CP02, caso 705** (nuevo, autorizado): 22/22 PASS. P18 se verificó por la clave de fila (D-66) en otra pestaña. Incidente P-21a separado → REAL_PASS_PARCIAL.
- **Hallazgos para QA:**
  - Ramo RCE no se almacena (702, reproducido 2 veces);
  - P-21a en Cumplimiento (703) y en Autos (705);
  - campos numéricos aceptan letras al escribir;
  - nomenclatura «Identificación del tomador».
- **Problema de evidencia:** los reportes de continuación se sobrescribieron (mismo nombre). Se corrigió y los tramos perdidos se transcribieron en `2026-10-20_continuaciones-702-703-704.json`.
- **PR #9 `feb678e`:** decisión del 20/10 (marcado solo en el dibujo → inconcluso); 343/343. **PR #10:** merge del #9 (`6ac5351`) + sesión; 357/357.
- **Métricas:** ejecutada 5/17, aprobada 0/17. El último reporte de CP02 es REAL_PASS_PARCIAL por P-21a.
- **Histórico:** 38 casos. Sin casos adicionales ni recreaciones.

## CP05 — caso 706 (autorización de un único caso, 20/10)

- **Controles:** `SDE_E2E=1`, cupo 39 sobre 38 registrados, worker único. Código: rama del PR #10 en `46332b6` (incluye el PR #9; 357/357).
- **Configuración:** Autos, Ramo 48, Modificación, Individual, Forma de Consulta Unitaria = Número de póliza (datos de QA del `.env`, los mismos de 656/671).
- **Resultado:** 9/9 ejecutados. **PASS:** P2–P5 y P7. **NOT_AUTOMATED:** P1 (agregado), P6 (P-11) y P8–P9 (P-18) → REAL_PASS_PARCIAL.
- **Ruta:** «¿Masivo o correo?» → «Consultar información de solicitud» → «Consultar SISE». La Consulta Gráfica da negativa completa (8/8: no recorre «Estructurar información» ni `aiworkertask`); es diagnóstico porque usa los PR sin integrar.
- **Totales:** histórico 39 casos; métricas: ejecutada 5/17, aprobada 0/17. No se crearon más casos.

## Preparación de la integración y del reporte (sin QA)

- **Cadena:** `main` 77f5739 → PR #9 `feb678e` (343/343) → PR #10 `df787bf` (357/357). Revisión focalizada sin hallazgos bloqueantes.
- **Recomendación:** fusionar el #9, cambiar la base del #10 a `main`, correr `@unit` y fusionar el #10. No se fusionó nada.
- **Reporte del 21/10:** 5/5 CP con recorrido, 90/108 PASS, 0/5 aprobados por QA, correspondencia de P8/P9 de CP05 y tabla de decisiones para QA. Sin casos ni ejecuciones E2E nuevas.
