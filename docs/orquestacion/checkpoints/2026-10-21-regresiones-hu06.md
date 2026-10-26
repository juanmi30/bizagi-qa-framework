# Checkpoint — regresiones HU06 del 21/10/2026

- Rama local: `feat/sde-soporte-certificacion-hu` (PR #11 existente).
- Commit inicial: `7cc5f399856dd30c06f2bef94cf4b0882190c907`. Commit final: consultar el commit que incorpora este checkpoint.
- Alcance: diagnóstico local y correcciones focalizadas. Sin conexión a Bizagi, casos nuevos, publicación ni merge.

## Diagnóstico previo a la implementación

| CP / reporte local | Evidencia y causa |
|---|---|
| CP01, `HU06-CP01_20261021-130525.json` | La narrativa de P9 terminó PASS; el siguiente `adjuntar_en_grilla` falló antes de cargar: barrera incondicional por **3 filas precargadas**. El contexto muestra tipos documentales y controles de carga vacíos. Causa AUTOMATIZACION; no es localización ni escritura de narrativa. |
| CP03, `HU06-CP03_20261021-130635.json` | Narrativa e intermediario de P7 PASS; documentos falla por **5 filas precargadas**, antes de cargar. El contexto confirma la nueva parametrización. Misma causa. |
| CP04, `HU06-CP04_20261021-130721.json` | Narrativa de P7 PASS; documentos falla por **5 filas precargadas**, según JSON y captura. No se conservó un contexto de error equivalente al de CP03; no se inventa. Misma barrera demostrada. |
| CP02, caso **772**, `HU06-CP02_20261021-130546.json` | P12 encontró **3 filas**, con **3/3 pólizas** y **0/3 placas esperadas**. El escenario exige mínimo 1 fila y cobertura de tres valores por columna; no exige exactamente 3 filas. Caso **711**, reporte `HU06-CP02_20261020-184643.json`: mismas columnas, 3 filas, pólizas y placas 3/3. Narrativas equivalentes salvo referencia única. |
| CP05, caso **770**, `HU06-CP05_20261021-130452.json` | Gráfico final PASS: 8 GUID reconciliados con 8 nodos marcados, sin Worker/Estructurar. P8/P9 estaban frenados por catálogo desactualizado. P6 continúa pendiente; P1 es el objetivo agregado, no un error autónomo del ejecutor. |

Los reportes están en `test-results/seguros-del-estado/sde/`; se inspeccionaron capturas, contextos y videos disponibles antes de editar. Los fotogramas muestreados localmente resultaron blancos y no aportan una lectura adicional de la tabla. El error-context de CP02 es posterior al cierre de la actividad y no muestra sus celdas. Las capturas no conservan valores legibles suficientes de las filas.

**Límite de CP02:** el reporte conserva encabezados (incluido `id`) y resumen de coincidencias, pero no los valores reales de las claves, las celdas ni la respuesta Render de 772. No permite distinguir placas no extraídas, retardo del Worker o lectura por texto de un control. No se confirma defecto del producto, ni se alteran el FAIL histórico o su causa `PRODUCTO_POR_CONFIRMAR`. D-66 aporta identidad parcial de otro caso; no demuestra las claves de 772 ni permite resolver P18.

## Corrección y archivos

- `sde/capacidades.ts`: admite la estructura documental precargada observada (columnas, tipo seleccionado y control de carga únicos). La presencia de filas no prueba obligatoriedad; sin marca continúa sin adjuntar. Con marca y tipo configurado usa la fila exacta y única, sin Adicionar ni cambiar tipos; ausencia de dato bloquea y ambigüedad conserva la barrera. El helper reutiliza la carga existente, verifica nombre/tamaño recibido por el input y archivo/tipo visibles después de subir. El PDF sintético local existe, pesa 691 bytes y contiene cabecera y cierre PDF; no se intentó subir en los fallos originales.
- La comparación P12 toma una instantánea DOM y añade cantidades de identidades coherentes/únicas, celdas vacías y controles presentes, sin imprimir claves. No cambia la extracción por texto, las expectativas, la validación estable de P18 ni la clasificación del resultado.
- `data/expectativas-presentacion.yaml` y `escenarios/1-hu06-cp05.yaml`: incorporan exclusivamente la confirmación funcional del 20/10 ya registrada en `certificacion/HU06.json`, CP05.validacionPosterior. Exigen llegada a Consultar SISE y recorrido positivo del proceso padre; **P8 y P9 también dependen del gráfico completo de la misma instancia**, sin Worker/Estructurar. No se inventa un hotspot padre para la tarea del subproceso. P6 pendiente impide aprobar el CP entero.
- Regresiones: `regresiones-hu06-20261021.unit.spec.ts`, `ruta-pendiente.unit.spec.ts`, `confiabilidad.unit.spec.ts`, `ejecuciones-seleccion.unit.spec.ts`, `ejecutor.unit.spec.ts`, `clasificacion.unit.spec.ts` y `runner-argumentos.unit.spec.ts` (estos últimos conservan la agregación del criterio aprobado y aíslan los listados).
- Sin cambios en el generador Word, selector productivo, otros proyectos, HU03, expectativas de presentación pendientes o controles de concurrencia/UI-10.

## Selección del soporte y preservación

La selección real local mantiene CP01 **710**, CP03 **712** y CP04 **713**, advirtiendo los FAIL posteriores sin caso (técnicamente FINALIZADA, no INTERRUMPIDA). CP02 **772 FAIL** y CP05 **770 parcial** sí se seleccionan: no se ocultan resultados negativos con caso. El plan y el Word ya identifican selección y advertencias. La regresión usa un repositorio ficticio HU99, comprueba estas dos reglas y verifica que no muta sus fuentes.

**Incidente durante las comprobaciones offline:** los `--list` anidados de pruebas preexistentes regeneró el HTML/JUnit convencional pese a aislar el output de la ejecución principal. Se añadió `--reporter=list` a todos los listados anidados del runner en estas pruebas SDE. El manifiesto SHA-256 previo permite verificar **574/576 archivos originales idénticos**: los 56 adjuntos eliminados del HTML se recuperaron byte a byte desde sus originales intactos. Los dos archivos auxiliares `html-report/index.html` y `junit/results.xml` originales fueron sobrescritos y no pudieron recuperarse; no se reconstruyen presentándolos como históricos. **Todos los JSON SDE, metadatos, capturas, videos, contextos y soportes originales permanecen idénticos.** Detalle local en `tmp/hu06-evidencias-antes.json` y `tmp/hu06-integridad-no-recuperados.json`. No se versionan esos artefactos ni datos QA.

## Validación offline

TypeScript: `npx tsc --noEmit`, sin errores.

Comando focalizado (PowerShell; portal ficticio, sin E2E):

```powershell
$env:CI='1'; $env:SDE_E2E='0'; $env:BIZAGI_BASE_URL='http://portal.sintetico.local'
node tools/run.mjs seguros-del-estado regresiones-hu06-20261021.unit ruta-pendiente.unit confiabilidad.unit datos-escenario.unit --grep "@unit" --retries=0 --reporter=list --output=tmp/hu06-regresiones-ruta-documentos
```

Resultado: **57/57 PASS**. Nueva regresión documental/P12: 10 pruebas; contra la implementación inicial, 7 fallaban (6 exponen la barrera documental y 1 exige el nuevo diagnóstico de P12; P12 ya fallaba correctamente). Fixture de carga corregido para declarar el rol real del diálogo; no se relajó el selector. Regresión aislada del selector tras proteger su listado: **7/7 PASS**. Listado controlado HU06 sin variantes: exactamente 5 CP, sin ejecutar ninguno.

Suite completa: `node tools/run.mjs seguros-del-estado --grep "@unit" --retries=0 --reporter=list --output=tmp/hu06-unitarias-regresion-20261021` (mismas variables). Resultado: **383 pruebas ejecutadas: 381 PASS y 2 aserciones obsoletas de CP05** (ejecutor y métricas aún esperaban P8/P9 pendientes). Se actualizaron conforme al criterio ya aprobado, manteniendo P6 y el CP parciales. Repetición de esas dos pruebas con el mismo comando y `--last-failed`: **2/2 PASS**. No se afirma un 383/383 en una sola corrida. Además, repetición de `confiabilidad.unit runner-argumentos.unit ejecutor.unit`: **40/40 PASS**. Logs locales `tmp/hu06-unitarias-regresion-20261021.log`, `tmp/hu06-unitarias-repeticion-20261021.log` y `tmp/hu06-controles-final.log`.

## Límites y siguiente validación

No se recertifica ninguno de los 17 CP ni se modifican sus resultados históricos. P6 de CP05, P18 de CP02, P-06, P-15 y UI-10 se preservan. Las pruebas de carga son sintéticas y no prueban compatibilidad completa con una sesión QA actual. El arreglo documental elimina la barrera reproducida; un rechazo real de Crear por requisitos no marcados seguirá requiriendo calibración funcional.

No hace falta crear casos para este diagnóstico ni para las regresiones. Una confirmación integral posterior requiere autorización explícita y cupo aprobado para **un único CP**, inicialmente CP01 (máximo un caso); no ejecutar toda HU06. Antes, se puede autorizar una inspección de precreación de ese CP (cero casos). CP02 requiere primero inspeccionar en solo lectura las celdas y la identidad del caso existente, si sigue disponible, sin crear otro. Ninguna de esas propuestas se ejecutó en esta fase.

Recomendación: auditoría independiente del diff local antes de publicar en el PR #11 o autorizar una comprobación real.
