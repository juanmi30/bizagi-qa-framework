# HU06 — reporte ejecutivo para la reunión del 2026-10-21

**Para:** Juan Miguel · **Preparado por:** Claude Code, 2026-10-20 · Distingue lo histórico (19/10) de lo obtenido hoy (20/10).

## Estado por CP

| CP | Último caso Bizagi | Pasos ejecutados realmente | PASS sustentados | PARTIAL / BLOCKED / FAIL / pendiente | Bloqueo concreto | Próxima acción | Evidencia |
|---|---|---|---|---|---|---|---|
| **CP01** Masivo Generales PN | 673 (19/10, histórico) | P1–P18 de 29 | **15**: P2, P3 y P5–P17 | P4 parcial · P1 FAIL no bloqueante (OBS-04, «Polizas» sin tilde) · P18 BLOCKED (UI-10) · P19–P29 sin ejecutar | Pop-up de Póliza Nueva sin calibrar (UI-10). **673 ya cerró por vencimiento**: P27–P29 no se pueden ejecutar sobre él | Autorizar un caso nuevo de CP01 para calibrar el pop-up (UI-10) y ejecutar P27, P29 y la parte automatizable de P28 | `docs/evidencia/HU06-CP01_20261019-143141.json` |
| **CP02** Masivo Autos | 670 (19/10, histórico) | 22 de 22 | **21** | **P18 inconcluso**: la identidad de la fila no está calibrada (D-60) | No hay identidad estable verificada de la fila. Todos los casos propios están cerrados | Calibrar en un caso abierto si la columna `id` de la grilla identifica la fila de forma estable antes y después de recargar | `docs/evidencia/HU06-CP02_20261019-102802.json` |
| **CP03** Cumplimiento sin RCE | — | **Hoy, en precreación de solo lectura:** P2–P7 | Ninguno como CP (la precreación no cuenta como ejecución); P2–P7 observados PASS | P8 en adelante sin ejecutar | «Crear» requiere autorización. Pop-up de Cumplimiento sin calibrar (UI-10) desde P12 | Cargar los datos en `.env` (ver abajo) y autorizar una corrida hasta P11 | `docs/evidencia/PRECREACION_HU06-CP03_pre-1792514021476.json`, `2026-10-20_sondas-rce-y-recorrido.json` |
| **CP04** Cumplimiento con RCE | — | **Hoy, en precreación de solo lectura:** P2–P7 | Igual que CP03 | Igual que CP03 | Igual que CP03 | Igual que CP03 | `docs/evidencia/PRECREACION_HU06-CP04_pre-1792514071170.json` |
| **CP05** Individual | 671 (19/10, histórico) | P1–P9 | **5**: P2–P5 y P7 | P6 parcial (P-11) · P8 y P9 NOT_AUTOMATED (P-18) | P-18: falta confirmar el camino regular. La negativa gráfica depende del PR #9 | Revisar e integrar el PR #9; confirmar P-18 con QA | `docs/evidencia/2026-10-20_recorrido-grafico-solo-lectura.json` (diagnóstico) |

**Ningún CP de HU06 está aprobado funcionalmente por QA.** El 22/22 de CP02 es histórico y no definitivo.

## Lo que avanzó HOY (20/10)

1. **PR #9, último defecto técnico:** corregida la precedencia de la clasificación. Una ambigüedad ajena al nodo prohibido ya no oculta un recorrido prohibido demostrado. Publicado en el mismo PR (HEAD `eaa60b2`).
2. **Regresión real encontrada en QA, sin falsos PASS:**
   - **Qué pasaba:** la validación de «registro malformado» de la corrección C (PR #7, ya en `main`) rechazaba **todo** `TransitionLog` real. Bizagi envía cada transición en dos registros con un GUID vacío. Por eso la Consulta Gráfica quedaba siempre inconclusa.
   - **Corrección:** se hizo con la evidencia real del formato.
   - **Validación en solo lectura:** 654, 670 y 673 (Masivo) recorren «Estructurar información»; 656 y 671 (Individual) dan negativa con evidencia completa (diagnóstico pendiente de integrar el PR #9).
3. **CP03 y CP04 desbloqueados en datos, sin inferir por nombre:** el servidor entrega la propiedad del Ramo (`kmRamoPoliza.bEsRCE`) al elegirlo, y coincide con la regla de V1.1 (la pregunta «¿Requiere Modificar RCE?» aparece solo sin la propiedad).
   - 44 → `false`, con la pregunta;
   - 40 y 54 → `true`, sin la pregunta;
   - 45, 46 y 47 → sin valor, con la pregunta.

   **Precreación de solo lectura:** CP03 (Ramo 44) y CP04 (Ramo 40) pasan P2–P7 con el intermediario.
4. **Falso FAIL corregido:** la ayuda «Masivo: … de cumplimiento y/o RCE.» se actualiza por regla después de elegir Masiva. `texto_exacto` ahora espera de forma acotada.
5. **Pruebas unitarias SDE:** **347/347** (341 en el PR #9 + 6 de hoy). Son pruebas sintéticas: no son resultados funcionales.

## Estado de Git

- **PR #7:** fusionado (`main` = `77f5739`).
- **PR #9:** abierto, en borrador. HEAD `eaa60b2` con la corrección de precedencia, publicado. **Sin fusionar.**
- **Rama local `feat/sde-hu06-avance-reunion-2110`** (sobre el PR #9): contiene la corrección del formato de `TransitionLog`, la espera de `texto_exacto`, la evidencia de hoy y este reporte. **No está publicada**; requiere tu aprobación.

## Pendiente de autorización o evidencia

| Acción | Caso afectado | Riesgo |
|---|---|---|
| Publicar la rama de hoy (push) y abrir un PR en borrador | — | Ninguno sobre QA |
| Cargar en el `.env` local: `SDE_CUMPL_RAMO_SIN_RCE=44 - CUMPLIMIENTO ENTIDAD ESTATAL`, `SDE_CUMPL_RAMO_CON_RCE=40 - RCE DERIVADA DE CUMPLIMIENTO`, `SDE_CUMPL_MOVIMIENTO=Modificación` | — | Ninguno; no lo hice porque el `.env` es tuyo |
| Corrida de CP03 y de CP04 hasta P11 (crea 2 casos; se detiene en la barrera UI-10 del pop-up) | 2 casos nuevos | Cupo y limpieza (P-17: cierre por vencimiento aún sin aceptación formal de QA) |
| Caso nuevo de CP01 para calibrar UI-10 de Póliza Nueva y ejecutar P27–P29 | 1 caso nuevo | Abrir el pop-up sin calibración puede inutilizar el caso (BUG-03) |
| Calibrar la identidad de fila para CP02 P18 | 1 caso nuevo | Igual que el anterior |
| QA: confirmar que `bEsRCE` es la propiedad «Póliza RCE», P-18 (camino regular de CP05) y P-02 (documentos de CP01) | — | — |

## Qué se puede afirmar responsablemente en la reunión

- **CP01:** se crea el caso Masivo Generales PN y se verificó hasta P17 (caso 673). El pop-up de edición (P18–P26) sigue pendiente de calibración.
- **CP02:** se sostienen 21 de 22 pasos con evidencia; P18 queda inconcluso por identidad de fila.
- **CP03 y CP04:**
  - los Ramos con y sin la propiedad RCE ya se identifican desde el propio sistema, sin suponerlo por el nombre;
  - el formulario de inicio de ambos se verificó hasta P7 sin crear casos;
  - falta autorizar la creación.
- **CP05:** la ruta Individual no pasa por el Worker AI en el diagnóstico gráfico. Sigue pendiente hasta integrar el PR #9 y confirmar P-18.
- **No se puede afirmar** que algún CP esté aprobado ni que los cinco estén completos.
