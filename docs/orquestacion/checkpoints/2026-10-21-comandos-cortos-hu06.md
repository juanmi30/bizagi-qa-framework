# Checkpoint — comandos cortos HU06 y riqueza del soporte, 21/10/2026

- Rama: `feat/sde-soporte-certificacion-hu`. Base: `babd2c2` (Codex). PR #11 en borrador con HEAD remoto `7cc5f39`; sin push ni merge en esta fase.
- Encargo: «Simplificación operativa SIN regresiones del framework QA» (Juan Miguel). Sin E2E real autorizado en esta fase.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run sde:hu06` | Orquestador `projects/seguros-del-estado/tools/hu.mjs`. Valida la selección (5 CP de `certificacion/HU06.json`, sin `@variante`), el bloqueo H6 y el cupo; ejecuta la suite real con `SDE_E2E=1`, cupo = pendientes + CP (el límite global de QA manda si es menor), `BIZAGI_CORRIDA`, `SDE_POPUPS_CASO_CREADO=1` (D-69), un worker, `--retries=0`, trace off y salidas por corrida; genera el Word aunque haya FAIL; resume ejecución, resultado funcional y soporte por separado; conserva el código de la suite |
| `npm run sde:hu06:simular` | Misma preparación, sin ejecutar nada |
| `npm run sde:hu06:word` | Solo el Word (`SDE_E2E=0`), últimas ejecuciones por CP, archivo nuevo cada vez |

Las variables existen solo en el proceso hijo. Se eliminan del hijo las autorizaciones heredadas (`SDE_AUTORIZO_CALIBRACION_POPUP`, `SDE_SOPORTE_CORRIDA`, `CI`, `CAPTURE`, …). `CI` no se usa porque la configuración lo convierte en 2 reintentos. Sin cambios en `tools/run.mjs`, escenarios, matrices, Colsubsidio, CONPRE ni Demo.

## INCIDENTE: corrida real no autorizada (casos 784, 786, 787)

Al validar la «simulación» se lanzó, desde PowerShell, `npm run sde:hu06 -- --simular`. PowerShell elimina el `--` y npm se queda con `--simular` como opción propia; el orquestador recibió solo `HU06` y ejecutó la corrida REAL. Se detuvo durante CP03.

- Casos creados sin autorización: **784 (CP05), 786 (CP01), 787 (CP02)**. CP03 quedó EN_CURSO sin número registrado: **verificar en Bizagi** si llegó a crearse un caso. Histórico local: 59 casos.
- `test-results/seguros-del-estado/.ejecucion-real.lock` quedó sin liberar por la detención; no se retiró (bloquea nuevas corridas reales hasta que Juan Miguel lo decida).
- Corrección: script `sde:hu06:simular` (sin `--`); el orquestador reconoce `npm_config_simular` como simulación y se detiene ante opciones desconocidas o perdidas (`npm_config_word`, `npm_config_list`, …). Regresión en `tests/unit/orquestador-hu.unit.spec.ts`; el comando exacto del incidente se reprodujo con un runner sintético y ya no llama a la ejecución.
- Las ejecuciones del incidente son reales y quedan archivadas (no se borran ni alteran). El Word las elige por ser las últimas finalizadas de CP01, CP02 y CP05; cada una lleva una nota registrada «ejecución real NO autorizada». CP03 sigue con 780 y advierte la ejecución interrumpida.

## Soporte Word: riqueza preservada y ampliada (sin rehacer el generador)

- Por paso: además de esperado, obtenido, estado, evidencia y fuente, se muestra la **Causa** registrada (producto por confirmar, automatización, dato, no automatizado, sin clasificar…) y los **incidentes registrados aparte** (P-21a) sin cambiar el estado del paso.
- Observaciones por CP en dos bloques separados: **hallazgos automáticos** derivados de los pasos del propio caso (cada línea cita el caso) y **notas registradas para ese caso** (`porCaso` de `certificacion/HU06.json`, con fuente). Las notas de otros casos no se copian: solo se avisa que existen.
- Notas nuevas con su fuente para 782, 776, 780, 783 y 773 (checkpoint de Codex y `persistencia-cp03-780.json`); 780 separa la persistencia de Ramo RCE del error de dato del caso 712.
- Regresión con reportes reales versionados: `tests/unit/soporte-regresion-real.unit.spec.ts` (5 CP, 108 pasos, causas, observaciones sin mezcla, NOT_AUTOMATED, BLOCKED, P-21a como incidente, capturas, aprobación pendiente, fuentes intactas, archivos nuevos).

## Pendientes

Decisión de QA sobre los casos 784/786/787 y el posible caso de CP03; liberar el bloqueo tras confirmar que no hay ejecución en curso; auditoría de D-69; revisión visual del Word en Microsoft Word.
