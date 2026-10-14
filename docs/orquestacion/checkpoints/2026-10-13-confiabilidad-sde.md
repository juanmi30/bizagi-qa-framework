# Checkpoint "Confiabilidad SDE-CEL (H1, H4, H6, H7)" — 2026-10-13

- Commit inicial: `551b84e` (`main`) · Commit final: HEAD de la rama `fix/sde-confiabilidad-resultados` (Pull Request en borrador hacia `main`, sin fusionar)
- Para revisar: `git diff 551b84e..fix/sde-confiabilidad-resultados --stat` y `git log 551b84e..fix/sde-confiabilidad-resultados --oneline`

## 1. Resumen técnico
- **H1:** un único camino lleva el estado funcional a Playwright/JUnit, con trazabilidad de estado, causa y atribución. Un reporter de SDE escribe un veredicto E2E y marca la corrida como fallida cuando ningún CP llegó a ejecutarse. Una fixture sintética comprueba el JUnit y el código de salida reales.
- **H4:** las causas de preflight y de ejecución son coherentes, los errores de red se clasifican como AMBIENTE y un BLOCKED sin causa queda NO_CLASIFICADO. Todo FAIL declara su atribución.
- **H6:** bloqueo exclusivo entre procesos, aplicado al histórico de casos y a las ejecuciones reales de SDE.
- **H7:** pendientes estructurales y «máximo alcanzable» por CP. P28 de HU06-CP01 figura como pendiente.
- **Incidente:** una ejecución E2E real accidental creó el caso 434. La causa raíz, el runner, quedó corregida.

## 2. Archivos y cambios relevantes

| Archivo | Hallazgo | Motivo |
|---|---|---|
| `projects/seguros-del-estado/sde/verticales.ts` | H1, H4, H6 | `aplicarResultado` (único camino a Playwright con anotaciones); el bloqueo de preflight usa `reporteBloqueado`; bloqueo de ejecución real con liberación en `finally`; advertencia si `workers>1`; helper `exclusividadEjecucionReal` |
| `projects/seguros-del-estado/sde/veredicto.ts` (nuevo) | H1 | Veredicto E2E: NO CONCLUYENTE si ningún CP E2E se ejecutó (fuerza error); JSON con conteo por estado y causa |
| `playwright.config.ts`, `projects/seguros-del-estado/playwright.project.json` | H1 | Clave opcional `reporters` por proyecto (aditiva: los otros proyectos no cambian); SDE agrega el veredicto |
| `projects/seguros-del-estado/sde/modelo.ts` | H4 | Causas `CONFIGURACION` y `CONCURRENCIA`; `ReporteCp.causas` y `ReporteCp.atribucion` (opcionales: los reportes históricos siguen siendo válidos) |
| `projects/seguros-del-estado/sde/ejecutor.ts` | H4 | `causaDeBloqueo`, `reporteBloqueado`; red y navegación → AMBIENTE; BLOCKED sin causa → NO_CLASIFICADO; motivo de BLOCKED con causas; atribución del FAIL |
| `projects/seguros-del-estado/sde/capacidades.ts` | H4 | La única capability que devuelve BLOCKED declara `causa: 'DATO'` |
| `shared/utils/BloqueoArchivo.ts` (nuevo) | H6 | Bloqueo entre procesos: creación atómica, huérfanos por pid o antigüedad, liberación en `finally` y al salir |
| `shared/utils/HistorialCasos.ts` | H6 | Registrar y marcar como depurado: lectura, modificación y escritura exclusivas |
| `projects/seguros-del-estado/sde/registro.ts` | H6 | Ruta del bloqueo de ejecución real (`test-results/`, nunca versionada) |
| `tests/calibracion.real.spec.ts`, `tests/diagnostico-documentos.real.spec.ts` | H6 | Pueden crear casos: toman el mismo bloqueo |
| `projects/seguros-del-estado/sde/metricas.ts`, `projects/seguros-del-estado/sde/trazabilidad.ts` | H7 | `coberturaPaso`, `pendientesParaRealPass` y `maximoAlcanzable`; la trazabilidad los publica por CP |
| `manifest/casos.yaml`, `escenarios/3-hu06-cp01.yaml` | H7 | HU06-CP01 declara la brecha UI-04; la cabecera del escenario enumera sus pendientes (sin implementar ni eliminar P28) |
| `tools/run.mjs` | Incidente | En Windows entrecomilla los argumentos con espacios o símbolos |
| `tests/unit/resultados-pipeline.unit.spec.ts`, `tests/unit/confiabilidad.unit.spec.ts`, `tests/fixtures/resultados-pw/*` (nuevos) | Todos | Pruebas de regresión |
| `tests/unit/clasificacion.unit.spec.ts` | H4 | La aserción exige ahora el motivo con la causa explícita |
| `docs/TRAZABILIDAD-17-CP.md` (regenerado), `docs/evidencia/HU06-CP05_20261013-231227.json` (nuevo) | H7, incidente | Máximo alcanzable y pendientes; evidencia del caso 434 (sanitizada; solo configuración no secreta) |

## 3. Diferencias respecto al checkpoint anterior
Hasta ahora, H1, H4, H6 y H7 tenían correcciones parciales (D-11, D-14, D-15, H7 documental). Esta fase cubre lo que Work señaló como faltante: JUnit real, causas en preflight, concurrencia entre procesos y P28.

## 4. Pruebas
- `npx tsc --noEmit`: sin errores.
- `node tools/run.mjs seguros-del-estado --grep "@unit"`: **130/130**, de las cuales 18 son nuevas.
- Las pruebas nuevas detectan el problema anterior:
  - con el `HistorialCasos` de `main`, de 8 registros simultáneos se pierden 7;
  - 6 aserciones de H4/H7 fallan con el código de `main` y pasan con el nuevo;
  - con el runner de `main`, `--list --grep "sin los documentos portables"` selecciona 5 pruebas reales; con el nuevo, exactamente 1;
  - una corrida con todo BLOCKED termina con código 0 sin el veredicto y con error con él.
- Demo: 48/4, los mismos 4 fallos históricos.
- Colsubsidio: `lifecycle-casos.unit` 12/12, `contrato-create-case` 3/3, `login-navegacion.unit` 6/6 y `afi-soporte.unit` 32/32.
- **E2E: una ejecución real ACCIDENTAL** (ver §6). Ninguna otra.

## 5. Estado de los 17 CP
Sin cambios en las métricas: implementados 13, completos 0, ejecutados 2, aprobados 0.
- HU06-CP05: REAL_PASS_PARCIAL (última evidencia: caso 434).
- HU06-CP01: FAIL en la ejecución oficial; máximo alcanzable REAL_PASS_PARCIAL (pendientes P12, P17 y P28).
- Ningún CP con escenario puede llegar hoy a REAL_PASS.

## 6. Bugs, bloqueos e incidente
- **Incidente (Claude Code):** desde Git Bash, `--grep "no se pisan"` se partió por los espacios en el runner y Playwright seleccionó pruebas reales.
  - **HU06-CP05 se ejecutó contra QA y creó el caso 434**, con resultado REAL_PASS_PARCIAL. No abrió pop-ups ni hizo acciones destructivas.
  - HU03-CP08 quedó BLOCKED en preflight.
  - La causa raíz quedó corregida (D-26), con prueba de regresión.
  - Pendiente: P-06 (¿exigir una activación explícita para E2E reales?) y P-07 (qué hacer con el caso 434).
- Bugs funcionales: sin cambios.

## 7. Evidencias y observabilidad
- El veredicto E2E queda en `test-results/seguros-del-estado/veredicto-e2e.json`, que es local.
- JUnit publica `resultado_funcional`, `causa`, `atribucion`, `BLOCKED` y `skip` como propiedades de cada caso.
- Worker AI, SISE y alertas siguen sin observabilidad.

## 8. Riesgos conocidos
- **Recuperación de bloqueos huérfanos:** se apoya en el pid **del mismo equipo**. Entre equipos que compartan la carpeta se usa la caducidad (6 h para la ejecución real; 2 min para el histórico).
- **Contención en el histórico:** el bloqueo espera hasta 30 s; si no lo obtiene, el registro falla con un mensaje explícito y el caso no se pierde en silencio.
- **Corridas parciales:** el veredicto solo fuerza error cuando **ninguna** prueba E2E se ejecutó. Si hay ejecuciones parciales y algunos bloqueos, el JSON dice «NO SATISFACTORIO», pero el código de salida depende de los fallos de Playwright.
- **Pruebas reales sin bloqueo:** las demás (habilitación, precreación, bloqueos, candidatos) son de solo lectura y no toman el bloqueo.
- **H6 previo:** la prueba que exige `workers = 1` sigue fallando si se pasa `--workers>1`, a propósito; la protección real es ahora el bloqueo.

## 9. Propuestas que requieren aprobación
- P-06 y P-07 (incidente).
- D-22 a D-26: decisiones técnicas para revisión de Work y del orquestador.
