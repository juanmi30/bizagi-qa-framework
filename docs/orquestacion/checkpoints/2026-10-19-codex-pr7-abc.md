# Checkpoint Codex — correcciones focalizadas PR #7 A/B/C — 2026-10-19

- HEAD inicial auditado: `5ede0d560b1ca3cbfb165e8e13f79d9b23ba3371`.
- HEAD final de implementación: `e5d7f2c35bf18498d253e81e8f3a610c8e2122dc`; el commit posterior solo agrega este cierre documental.
- Revisión: `git diff 5ede0d5..e5d7f2c --stat` y `git log 5ede0d5..HEAD --oneline`.
- Rama: `feat/sde-hu06-asignacion-grafico`; PR #7 existente, en borrador; sin merge.
- Encargo: relevo temporal de Claude Code autorizado por Juan Miguel; sin agentes paralelos ni ejecuciones reales.

## Correcciones y archivos

| Archivo | Cambio |
|---|---|
| `projects/seguros-del-estado/sde/escenario.ts` | A: rechaza `comparar` vacío, nulo, columnas sin nombre y listas sin valores útiles. Ausencia de `comparar` sigue permitiendo verificaciones de estructura. |
| `projects/seguros-del-estado/sde/capacidades.ts` | A: la presencia de `comparar`, incluso vacío, activa la evaluación; expectativas insuficientes en ejecución nunca aprueban. B: retira la lectura independiente por posición y devuelve inconcluso con causa explícita; preserva recuperación P-21a. C: exige radicación e identidad de instancia/flujo para negativas, rechaza contradicciones y registros malformados sin introducir esperas de animación. |
| `projects/seguros-del-estado/tests/unit/correcciones-pr7.unit.spec.ts` | A: regresiones de expectativas vacías y resolución dinámica, preservando coincidencia, faltantes y extras. B: portales sin identidad acreditada quedan inconclusos, incluyendo placa inválida persistida, otra fila válida y orden cambiado; P-21a separado. |
| `projects/seguros-del-estado/tests/unit/identidad-pr7.unit.spec.ts` | Validación declarativa y lectura gráfica completa en portal sintético, desde respuestas HTTP hasta veredicto. |
| `projects/seguros-del-estado/tests/unit/asignacion-recorrido.unit.spec.ts` | Fixtures de ruta completa explicitan identidades sintéticas de instancia y flujo; mismas comprobaciones funcionales anteriores. |
| `docs/orquestacion/ESTADO-ACTUAL.md`, `DECISIONES.md`, este checkpoint | Actualización mínima, autorización conservadora D-60 y entrega verificable. |

## Evidencia y límites

**B no está validado positivamente en QA.** Se revisaron el código, las evidencias sanitizadas y los artefactos locales conservados buscando identificadores. La evidencia del 19/10 documenta claves que cambian al persistir documentos, pero no acredita una identidad estable de las filas de pólizas. `data-key` aparece en una prueba sintética de documentos; no se extrapola al portal real. Juan Miguel autorizó expresamente la protección conservadora y la calibración posterior. `leerCeldaPersistida` devuelve `null`: no abre otra pestaña ni lee por índice. Esto impide tanto certificar no persistencia como atribuir persistencia al producto sin evidencia. P18 queda NOT_AUTOMATED/AUTOMATIZACION; una falla de recuperación conserva el incidente P-21a.

Para habilitar P18 se necesita evidencia real de radicación/instancia/registro capturada antes de editar, una nueva lectura del servidor del mismo registro y rechazo de identidades ausentes, duplicadas o contradictorias. Las pruebas con claves sintéticas NO demuestran que esas claves existan en Bizagi.

Para C se utilizan exclusivamente campos documentados en `projects/seguros-del-estado/docs/evidencia/2026-10-19_correcciones-pr7.json`: `WorkitemsGuid.currentCase.idCase/radicationNumber`, parámetros `idCase/idWorkFlow` de ambas consultas y GUID de origen/destino de `TransitionLog`. Se compara la instancia de la respuesta con su petición y con el registro; el encabezado vincula el diálogo a la radicación solicitada. Sin vínculo completo, una negativa no se aprueba. Una respuesta de transiciones malformada no se filtra para aparentar completitud. Se conserva la comparación del dibujo y el registro, sin esperas fijas nuevas.

## Validación

Comandos ejecutados con `CI=1`, `SDE_E2E=0`, `BIZAGI_BASE_URL=http://portal.sintetico.local` y `--retries=0` para Playwright:

```powershell
npx tsc --noEmit
node tools/run.mjs seguros-del-estado correcciones-pr7.unit identidad-pr7.unit asignacion-recorrido.unit --grep "@unit" --retries=0
node tools/run.mjs seguros-del-estado --grep "@unit" --retries=0
```

- TypeScript: sin errores.
- Suite SDE: **310/310** aprobadas (284 anteriores + 26 nuevas); ejecución final serial: **7,9 min, código nativo 0** (`PLAYWRIGHT_EXIT=0`, capturado con `$codigoPr7=$LASTEXITCODE; Write-Output "PLAYWRIGHT_EXIT=$codigoPr7"; exit $codigoPr7`).
- Focalizadas: **62/62** aprobadas, tras reforzar el escenario de reordenamiento con dos filas antes de guardar.
- Seguridad y clasificación: incluidas en la suite completa (P-06, P-15, cupo, pop-ups, incidentes, pipeline/JUnit); sin debilitarlas.
- Primera corrida focalizada: 61/62; detectó radicación contradictoria con causa NO_CLASIFICADO. Corregida a NoConcluyenteError/AUTOMATIZACION y verificada en las corridas posteriores.
- El sandbox impidió inicialmente crear el worker de Playwright (spawn EPERM). Las ejecuciones se realizaron con elevación autorizada, manteniendo filtro unitario, URL sintética y E2E desactivadas.
- Escaneo de líneas agregadas y archivos nuevos contra valores del .env de longitud >=4 y credenciales de cualquier longitud: **0 coincidencias**; patrones de tokens y claves privadas: **0**. No se imprimieron valores. Revisión del diff y `git diff --check`: sin problemas.

Comparación contra el HEAD auditado: copia aislada bajo `tmp/pr7-auditado`, creada con `git archive` del hash inicial y los tres archivos focalizados actuales; dependencias existentes compartidas mediante junction. Sin `.env`, `AGENTS.md` ni cambios al árbol principal. Artefactos y logs solo locales e ignorados. Resultado: **22/62 fallan y 40/62 pasan** contra el HEAD auditado. No todos los 22 son falsos PASS:

- A: `{}`, `null` y propiedad presente sin valor devolvían PASS en ejecución; el validador aceptaba `{}`, `null` y columna en blanco. Un valor de columna nulo y una columna en blanco fallaban por excepción, no por falso PASS.
- B: un objetivo desplazado a la segunda fila dejaba persistida la placa inválida mientras la lectura de la primera fila válida devolvía PASS. También aprobaba los modos sin persistencia pero sin identidad demostrada. Los modos que antes devolvían FAIL o NOT_AUTOMATED ahora quedan inconclusos por identidad no calibrada; esos cambios de estado/causa no se cuentan como falsos PASS. P-21a continúa separado.
- C: ausencia de radicación, flujo contradictorio y registro malformado parcialmente válido podían aprobar; radicación incorrecta ya impedía PASS, pero carecía de clasificación técnica explícita. Otra instancia en TransitionLog o en la respuesta de WorkitemsGuid ya dejaba inconcluso en estos fixtures, pero no informaba contradicción explícita.
- Se repitieron además las dos regresiones B reforzadas contra el HEAD auditado (`node tools/run.mjs seguros-del-estado correcciones-pr7.unit --grep "objetivo-" --retries=0`): **2/2 fallan**. Objetivo primero: antes FAIL funcional sin identidad acreditada. Objetivo segundo: **falso PASS demostrado** leyendo la placa válida de la otra fila. Con la protección: ambas NOT_AUTOMATED/AUTOMATIZACION.

Las regresiones no dependen solo de mensajes: comprueban estado, causa, persistencia sintética en servidor y separación del incidente. Las normales de extracción coincidente, póliza/placa faltante, dato extra, ruta positiva y negativa completa siguen pasando.

## Alcance y cierre

- Sin cambios en expectativas HU06, escenarios, datasets, pop-ups, P-06, solo lectura, cupo, Worker, reasignación o documentos CP01.
- Sin cambios en `shared/`, `tools/`, Demo, Colsubsidio o CONPRE; no corresponde regresión de esos proyectos.
- Sin E2E, acceso real a Bizagi, casos nuevos ni nueva evidencia funcional. Se mantienen 13/17 escenarios declarados y 3/17 CP con ejecución histórica; ninguna aprobación nueva. El REAL_PASS histórico de CP02 no es recertificación de P18.
- `AGENTS.md` local conocido se conserva intacto y sin seguimiento. `.env` no se modifica ni se incorpora; no se publica `test-results/`.
- Auditoría recomendada: limitarse a A/B/C y D-60, reproducir los contraejemplos y verificar que ninguna prueba sintética se presenta como calibración real. La calibración positiva de P18 queda pendiente.
