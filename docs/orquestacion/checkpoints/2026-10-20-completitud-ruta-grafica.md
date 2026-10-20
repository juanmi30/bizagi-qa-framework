# Checkpoint — Issue #8, completitud del recorrido gráfico — 2026-10-20

- Base verificada, local y remota: `77f5739eafc20d6c70bb74e5a2fb0735f2247899` (merge del PR #7).
- Rama: `fix/sde-completitud-ruta-grafica`.
- Commit de implementación: `748548e06b4e6db4ea3979e5070978750cb9ca25`; el commit posterior contiene solo el cierre documental.
- Revisión: `git diff 77f5739..748548e --stat` y `git log 77f5739..HEAD --oneline`.
- Incidencia: https://github.com/juanmi30/bizagi-qa-framework/issues/8. PR nuevo en borrador, sin merge, al cerrar esta fase.

## Causa y corrección

La evaluación filtraba los nodos existentes en el gráfico por pertenencia al registro. Si el registro contenía tres GUID ejecutados y solo dos estaban representados y marcados, no detectaba el tercero y podía declarar completa la evidencia de una negativa. La señal de espera repetía el mismo error: filtraba el DOM antes de aplicar `every`, por lo que un GUID ausente no impedía la señal de éxito. La consulta global del DOM también podía incluir elementos ajenos al diálogo del caso.

Se compara cada GUID ejecutado con el modelo leído del diálogo. La evidencia completa exige identidad suficiente de radicación, instancia y flujo (A/B/C preservadas), registro no vacío, representación única de cada GUID y todos sus nodos marcados, sin nodos recorridos ajenos al registro ni nodos marcados sin identidad. Los GUID desconocidos y las ambigüedades dejan NOT_AUTOMATED; una ausencia en evidencia incompleta tampoco demuestra que una actividad exigida haya faltado.

La espera usa la misma condición de representación única y marcado, acotada al elemento del diálogo abierto. El plazo existente solo limita la espera; no certifica la completitud. No se agregan esperas de animación ni excepciones por nombre de GUID.

Se conservan el FAIL por actividad prohibida inequívocamente recorrida y el PASS de evidencia completa con expectativa funcional aprobada. Una ruta positiva observada sin registro sigue pudiendo aprobar únicamente esa observación, sin declarar evidencia completa ni probar negativas. Los nodos estáticos no recorridos no se exigen en TransitionLog. Los GUID repetidos como extremos de varias transiciones se consolidan: repetición de una referencia no equivale a dos elementos del modelo con el mismo identificador.

## Evidencia del formato y límites

La fuente conservada `projects/seguros-del-estado/docs/evidencia/2026-10-19_correcciones-pr7.json` documenta `guidTaskFrom/guidTaskTo`, el identificador del hotspot y la identidad de `WorkitemsGuid` y sus parámetros. No acredita una transformación que permita descartar extremos ejecutados ausentes del dibujo. Si Bizagi representa legítimamente algún elemento técnico de otra manera, se necesita evidencia y una correspondencia explícita antes de automatizar esa reconciliación. Hasta entonces queda inconcluso, nunca se inventa una excepción ni se atribuye un defecto al producto.

No se ejecutó Bizagi ni se crearon casos. Las respuestas, GUID y diálogos de las regresiones nuevas son sintéticos. No se alteran evidencias, métricas ni resultados históricos de CP02/CP05. La corrección técnica no confirma la expectativa funcional pendiente de la ruta regular de CP05 (P-18) y no resuelve P18 de CP02 (D-60).

## Archivos

| Archivo | Motivo |
|---|---|
| `projects/seguros-del-estado/sde/capacidades.ts` | Reconciliación completa, detección de ausencia y ambigüedad; señal de espera por GUID dentro del diálogo. |
| `projects/seguros-del-estado/tests/unit/completitud-recorrido.unit.spec.ts` | 21 regresiones nuevas: evaluación pura y lectura del portal sintético con el predicado real de espera. |
| `projects/seguros-del-estado/tests/unit/asignacion-recorrido.unit.spec.ts` | El fixture que se llama completo ya no incluye `g-flujo-sin-hotspot` sin representación. Ese mismo supuesto erróneo se conserva explícitamente como contraejemplo inconcluso en la nueva suite. No se modifica ninguna expectativa funcional real. |
| `docs/orquestacion/ESTADO-ACTUAL.md`, `DECISIONES.md` y este checkpoint | Estado actual, decisión técnica propuesta D-61 y entrega verificable. |

## Pruebas y comparación

Entorno de Playwright: `CI=1`, `SDE_E2E=0`, `BIZAGI_BASE_URL=http://portal.sintetico.local`; sin reintentos. Comandos:

```powershell
npx tsc --noEmit
node tools/run.mjs seguros-del-estado completitud-recorrido.unit --grep "@unit" --retries=0
node tools/run.mjs seguros-del-estado completitud-recorrido.unit asignacion-recorrido.unit identidad-pr7.unit --grep "@unit" --retries=0
node tools/run.mjs seguros-del-estado --grep "@unit" --retries=0
```

- **Antes:** las 21 regresiones nuevas se ejecutaron sobre el código intacto de `77f5739`; **9 fallaron y 12 pasaron** (código 1). No se cambió producción hasta terminar esa corrida. Se reprodujeron falsos PASS de GUID ausentes, GUID sin excepción acreditada, duplicado marcado, nodo marcado sin identidad y GUID vacío. También un FAIL funcional injustificado por actividad exigida ausente con registro no reconciliado, y tres señales de completitud incorrectas en el lector (ausente, duplicado y nodo de otro diálogo).
- **Después:** TypeScript sin errores; **57/57 focalizadas aprobadas**, incluyendo las **21/21 nuevas**, con código nativo 0. **331/331 unitarias SDE aprobadas** (310 anteriores + 21 nuevas), **7,8 min, código nativo 0**. El código se capturó con `$codigoIssue8=$LASTEXITCODE; Write-Output "PLAYWRIGHT_EXIT=$codigoIssue8"; exit $codigoIssue8`.
- Los controles verifican estados y señales, no solo mensajes. Hay controles positivos de PASS completo, negativa con identidad incompleta, nodo prohibido FAIL, duplicidad con marcas contradictorias, extremos repetidos legítimos, nodos estáticos y observación positiva sin registro. En el lector sintético se evalúa una vez el predicado real en el navegador y se simula el vencimiento si no hay señal; no se fabrica el veredicto funcional ni se espera 60 s por una ausencia conocida.

## Alcance y auditoría

Sin cambios en `shared/`, `tools/`, configuración, escenarios, datasets, expectativas pendientes, HU03/HU10 u otros proyectos. P-06, P-15, UI-10, concurrencia y A/B/C se conservan; se comprueban con la suite SDE completa. Los 17 CP mantienen su estado histórico: 13 escenarios declarados, 3 CP con ejecución real histórica, ninguna aprobación nueva.

`.env` y `AGENTS.md` se conservan fuera de Git. Escaneo de líneas agregadas y archivos nuevos: sin coincidencias con valores del .env de longitud >=4 ni credenciales de cualquier longitud, y sin patrones de tokens o claves privadas; no se imprimieron valores. `git diff --check` sin problemas. Logs y artefactos sintéticos quedan en rutas locales ignoradas; no se publica `test-results/`.

Revisión recomendada: limitar la auditoría al alcance de Issue #8, repetir el contraejemplo de tres GUID frente a dos representados, revisar que no existan excepciones técnicas sin evidencia, comprobar el ámbito del diálogo y confirmar que una negativa incompleta nunca se aprueba. Mantener el PR en borrador y la incidencia abierta hasta revisión; sin merge autorizado en esta fase.
