# HU06 — reporte ejecutivo para la reunión del 2026-10-21

**Para:** Juan Miguel · **Preparado por:** Claude Code, 2026-10-20 (actualizado tras las corridas autorizadas). Se distingue lo histórico (19/10) de lo obtenido en esta sesión (20/10).

## Estado por CP

| CP | Caso Bizagi | Ramo / movimiento | Pasos ejecutados | PASS sustentados | FAIL / PARTIAL / BLOCKED | Evidencia | Qué impide completarlo | Acción que lo desbloquea |
|---|---|---|---|---|---|---|---|---|
| **CP03** Cumplimiento sin RCE · **NUEVO HOY** | **702** | 44 - CUMPLIMIENTO ENTIDAD ESTATAL (`bEsRCE` = false) · Modificación · Masiva | P2–P11 y P24–P25 (12 de 25) | **12**: P2–P11, P24, P25 | P12–P23 BLOCKED (12; el pop-up no se abrió) · P1 agregado | `docs/evidencia/HU06-CP03_20261020-123853.json` | Pop-up de Cumplimiento sin calibrar (UI-10). Falta el dato `SDE_CUMPL_RAMO_RCE` (opción de la lista «Ramo RCE» del pop-up) | Calibrar el pop-up sobre **el mismo caso 702** (sigue abierto; no hace falta crear otro) y tomar de ahí la opción de Ramo RCE |
| **CP04** Cumplimiento con RCE · **NUEVO HOY** | **703** | 40 - RCE DERIVADA DE CUMPLIMIENTO (`bEsRCE` = true) · Modificación · Masiva | P2–P11 y P23 (11 de 23) | **11**: P2–P11, P23 | P12–P22 BLOCKED por la barrera UI-10 (11; ningún clic) · P1 agregado | `docs/evidencia/HU06-CP04_20261020-124051.json` | Pop-up de Cumplimiento sin calibrar (UI-10). P15 no tiene criterio en la matriz (FUNC-05) | Calibrar el pop-up sobre **el caso 703** (abierto) |
| **CP01** Masivo Generales PN | 673 (19/10, histórico; cerrado) | Generales · Póliza Nueva · Masiva | P1–P18 de 29 | **15**: P2, P3, P5–P17 | P4 parcial · P1 FAIL no bloqueante (OBS-04) · P18 BLOCKED (UI-10) · P19–P29 sin ejecutar | `docs/evidencia/HU06-CP01_20261019-143141.json` | Pop-up de Póliza Nueva sin calibrar. El 673 cerró por vencimiento | Un caso nuevo (pendiente de tu aprobación). Con el ajuste de hoy, P27–P29 se ejecutan aunque el pop-up siga bloqueado (ver abajo) |
| **CP02** Masivo Autos | 670 (19/10, histórico; cerrado) | Autos · Ramo 48 · Modificación · Masiva | 22 de 22 | **21** | **P18 inconcluso** (identidad de fila, D-60) | `docs/evidencia/HU06-CP02_20261019-102802.json` | P18 necesita identidad real de la fila | **Evidencia de hoy:** la columna `id` es la clave de negocio de la fila y no cambia al recargar. Falta comprobarla antes y después de «Guardar» en un caso de Autos (aprobación pendiente) |
| **CP05** Individual | 671 (19/10, histórico; cerrado) | Individual | P1–P9 | **5**: P2–P5, P7 | P6 parcial · P8 y P9 NOT_AUTOMATED (P-18) | `docs/evidencia/2026-10-20_recorrido-grafico-solo-lectura.json` (diagnóstico) | P-18 (camino regular). La negativa gráfica depende de los PR #9 y #10 | Integrar los PR #9 y #10; QA confirma P-18 |

**P25 de CP03 y P23 de CP04:** las pestañas Documentos y Seguimiento están disponibles y Seguimiento muestra la trazabilidad del caso. El caso no tiene documentos adjuntos: la grilla no estaba marcada como obligatoria y Bizagi aceptó «Crear».

**Ningún CP está aprobado funcionalmente.** Los cinco CP tienen pasos obligatorios sin demostrar.

## Lo conseguido en esta sesión (20/10)

1. **Primeras ejecuciones reales de CP03 y CP04**, con exactamente los dos casos autorizados (702 y 703). Se respetaron P-06, el cupo (un caso por corrida, fijado en el proceso) y el worker único. No hubo escrituras fuera del recorrido del CP.
2. **Ramos sustentados por el sistema** (`kmRamoPoliza.bEsRCE` y la pregunta del formulario), no por el nombre. Las 3 variables autorizadas quedaron en el `.env`.
3. **La barrera UI-10 ya no corta el recorrido entero:** como no hubo ningún clic, los pasos del bloque del pop-up quedan BLOCKED y siguen los independientes. Eso dio P23 en CP04 y permitirá P27–P29 en CP01.
4. **Reasignación real desde otro analista (caso 703):** confirmó el **mismo work item**, único y asignado al usuario de pruebas. Es la primera demostración en QA (D-58).
5. **Identidad de fila (CP02 P18):** en el caso 702, solo lectura, la columna `id` (= `data-business-key` = `rows[i][0]` del servidor) no cambió al recargar; `data-key` sí cambia.
6. **Corrección del formato real de `TransitionLog`** y la espera de la ayuda asíncrona (PR #10).

## Estado de Git

- **PR #7:** fusionado (`main` = `77f5739`).
- **PR #9:** borrador, HEAD `eaa60b2`. Focalizadas 67/67 en su propio HEAD. **Listo para decidir el merge**, con dos advertencias:
  - **Sin el PR #10, la lectura gráfica real queda siempre inconclusa:** el formato de `TransitionLog` lo corrige el #10.
  - **Queda una decisión de criterio sin resolver:** un worker marcado en el dibujo pero ausente del registro sigue siendo FAIL (criterio C del PR #7). Según la sonda del 19/10, el dibujo se genera a partir de ese mismo registro (las marcas aparecen solo después de recibirlo). Esa marca no es una fuente independiente: lo coherente sería «inconcluso por fuentes contradictorias». No lo cambié porque contradice un criterio ya aprobado. Necesita tu decisión.
- **PR #10:** borrador, base = rama del PR #9. Contiene el formato de `TransitionLog`, los Ramos RCE, la ayuda asíncrona, la barrera por bloque, las corridas de CP03/CP04 y este reporte. Unitarias SDE: **350/350**.

## Próximas creaciones o calibraciones (requieren tu aprobación)

| Acción | Caso | Evidencia que se obtendría | Riesgo y mitigación |
|---|---|---|---|
| Calibrar el pop-up de Cumplimiento | **702 y 703, existentes y abiertos** (sin crear casos) | Mapeo de controles, Ramo RCE, cierre seguro con «Guardar» → P12–P23 (CP03) y P12–P22 (CP04) | BUG-03: un cierre sin «Guardar» inutiliza el caso. Se calibra con `SDE_AUTORIZO_CALIBRACION_POPUP=<caso>`, como en 651 (Autos), y solo se cierra con «Guardar» con valores válidos. Antes del 21/10 05:00, que es cuando vencen |
| Caso nuevo de CP01 | 1 caso nuevo | P27–P29 (ahora independientes del pop-up) y, si se autoriza, la calibración del pop-up de Póliza Nueva para P18–P26 | Mismo protocolo UI-10. P28: el contenido de las pestañas sigue en parte manual (NOT_AUTOMATED) |
| CP02 P18 | 1 caso nuevo de Autos | Clave `id` de la fila objetivo antes de editar → «Guardar» → relectura del servidor de la fila con la misma clave, única, aunque se reordenen | Si la clave cambia al persistir, P18 queda inconcluso, nunca PASS |

## Qué se puede afirmar en la reunión

- **CP03 y CP04 dejaron de ser escenarios preparados:** tienen casos reales (702 y 703) con 12 y 11 pasos PASS. La ruta Masiva por el Worker AI hasta «Estructurar información» está verificada en el buscador y en la Consulta Gráfica.
- **Los Ramos con y sin la propiedad «Póliza RCE»** se identifican desde el sistema.
- **CP01:** 15 pasos con el caso 673. **CP02:** 21 de 22 con el 670. **CP05:** 5 pasos, más la ruta Individual en diagnóstico.
- **Lo que falta en CP01, CP03 y CP04 es, sobre todo, la edición de filas en el pop-up (UI-10).** En CP03 y CP04 se puede avanzar sobre los casos ya abiertos.
- **No se puede afirmar** que algún CP esté aprobado ni que los cinco estén completos.
