# Checkpoint "Correcciones de la auditoría de Work sobre el PR #2" — 2026-10-15

- Commit inicial: `a71f5ab` (HEAD auditado) · Commit final: HEAD de `feat/sde-validaciones-funcionales` (PR #2, borrador, sin fusionar)
- Para revisar: `git diff a71f5ab..feat/sde-validaciones-funcionales --stat`
- Veredicto de Work: **REQUIERE CORRECCIONES** por dos hallazgos de severidad MEDIA (R1, R2). Sin ejecuciones contra Bizagi ni cambios en `.env`.

## 1. Resumen técnico

### R1: falsas aprobaciones de ortografía (D-36)

- **Problema:**
  - una página vacía devolvía `ok` con «0 textos visibles: sin hallazgos»;
  - un error al leer los botones se tragaba con `.catch(() => [])`.
- **Corrección:**
  - `{ ortografia: <pantalla> }` declara qué pantalla se espera. El catálogo define `pantallas` con marcadores citados en la matriz: inicio = Línea, Tipo de Radicación; Estructurar = Número de Caso, Creador del Caso; Completar = ¿Requiere actualizar el correo electrónico?.
  - **Condición para aprobar:** los marcadores deben estar visibles y haber sido recogidos por la lectura de textos. Si no, `NoConcluyenteError` (FAIL por AUTOMATIZACION, nunca PASS ni atribuido al producto).
  - `textosVisibles` solo tolera que no exista zona de botones; cualquier otro error se propaga.
  - Sin umbrales de cantidad. Los marcadores sirven para reconocer la pantalla; no son expectativas aprobadas ni etiquetas copiadas del portal.

### R2: preservar el defecto ante una excepción posterior (D-37)

- **Problema:** si una verificación fallaba y la siguiente lanzaba una excepción de ambiente, el `catch` reescribía el paso. El CP terminaba BLOCKED y el defecto desaparecía.
- **Corrección:**
  - Las observaciones del paso viven fuera del `try`.
  - **Con un defecto ya observado:** el paso conserva el FAIL (PRODUCTO_POR_CONFIRMAR) y todas las observaciones previas. La excepción queda aparte en `ResultadoPaso.incidente` (causa y detalle) y el detalle indica cuántas verificaciones se ejecutaron (las no ejecutadas no se reportan como observadas). El incidente detiene el recorrido, también en pasos `no_bloqueante`.
  - **Sin defecto previo:** se mantiene el comportamiento anterior (BLOCKED o FAIL técnico según la causa) y se conservan las observaciones previas.
  - La causa del incidente se suma a `reporte.causas` y se menciona en el motivo del CP sin cambiar la atribución.

### Ajustes documentales

- «Línea»: es esdrújula.
- La regla del «Si» se retiró y quedó como expectativa pendiente `INI-SI-AFIRMATIVO`.
- Resúmenes de pasos precisados: UI, mixto, parcial y no ejecutado, en evidencia, matriz y estado.
- La referencia antigua a P-06 como pendiente quedó corregida.
- P-07 incluye los casos 434 y 571.
- P-15: límite de `soloLectura`.

## 2. Archivos

| Archivo | Cambio |
|---|---|
| `sde/ui.ts` | `NoConcluyenteError`; `textosVisibles` sin tragar errores |
| `sde/capacidades.ts` | Identificación de pantalla y evidencia positiva en `ortografia` |
| `sde/ejecutor.ts`, `sde/modelo.ts` | Observaciones conservadas, `incidente`, clasificación `NO CONCLUYENTE` → AUTOMATIZACION, motivo con incidentes |
| `sde/presentacion.ts`, `sde/escenario.ts`, `data/expectativas-presentacion.yaml` | `pantallas`; `ortografia` exige una pantalla declarada; sin regla «Si»; `INI-SI-AFIRMATIVO` pendiente |
| `escenarios/_bloques/presentacion-inicio.yaml` | Cita la expectativa pendiente del «Sí» (sin cambio de métricas) |
| `tests/unit/auditoria-pr2.unit.spec.ts` (nuevo), `tests/unit/presentacion.unit.spec.ts` | 16 regresiones R1/R2; pruebas existentes adaptadas a pantallas |
| `DECISIONES.md`, `ESTADO-ACTUAL.md`, checkpoint del 14/10, matriz de oportunidades, resumen de evidencia | Ajustes documentales; D-36, D-37 y P-15 |

## 3. Las regresiones detectan los fallos anteriores

Se ejecutaron las 16 regresiones nuevas con `ui.ts`, `capacidades.ts` y `ejecutor.ts` restaurados temporalmente del HEAD auditado. Después se restauraron las versiones corregidas y se verificó su hash.

- **Con el código anterior: 9 fallan y 7 pasan.**
  - R1: HTML vacío, pantalla no reconocida, excepción al leer los botones, clasificación en el ejecutor y el detalle de la pantalla identificada.
  - R2: FAIL seguido de ambiente, FAIL seguido de ambiente en un paso no bloqueante, FAIL seguido de excepción desconocida, y PASS seguido de ambiente (se perdía la observación previa).
  - **Las 7 que pasan en ambas versiones son controles de comportamiento correcto:**
    - error ortográfico detectado;
    - pantalla sin botones;
    - expectativa pendiente nunca REAL_PASS (con la misma aprobada sí lo es);
    - PASS + PASS, FAIL + PASS, dos FAIL;
    - excepción antes de cualquier resultado.
- **Con la corrección: 16/16.**

## 4. Pruebas

- `npx tsc --noEmit`: sin errores.
- `node tools/run.mjs seguros-del-estado --grep "@unit"`: **191/191** (175 + 16).
- No se modificó código compartido (`shared/`, `tools/`): no aplica la regresión de Demo ni de Colsubsidio.
- **Trazabilidad:** regenerada para comprobar; las métricas por CP no cambian. Se descartó el resultado porque solo añadía un reporte local no versionado.
- **Sin E2E, sin casos y sin abrir UI-10.**

## 5. Estado de los 17 CP

Sin cambios:
- implementados 13/17 (completos 0) · ejecutados 2/17 · **aprobados 0/17**;
- HU06-CP05 FAIL no atribuible al producto (14/10, P-14);
- HU06-CP01 FAIL (13/10);
- 11 BLOCKED;
- 4 sin escenario.

## 6. Riesgos residuales

- **Marcadores de pantalla:** si QA cambia las etiquetas citadas por la matriz, la ortografía queda NO CONCLUYENTE. Falla segura, nunca aprobación.
- **`soloLectura` (P-15):** no prohíbe todas las acciones mutantes. Las inspecciones actuales no las usan; hay que protegerlas antes de ampliar las inspecciones reales.
- **Atribución con incidente:** un FAIL con incidente sigue atribuido al producto (por confirmar) porque el defecto se observó. La confirmación funcional sigue siendo de QA.
