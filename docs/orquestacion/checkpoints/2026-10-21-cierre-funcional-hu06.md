# Checkpoint — cierre funcional E2E HU06, 21/10/2026

- Rama: `feat/sde-soporte-certificacion-hu`. Base: `205bbbfb919c0b350c079056380e11f8cc36ef8c`.
- Commit final: el commit local que incorpora este checkpoint. Sin push ni merge.
- Autorización: encargo adjunto de Juan Miguel «Cierre funcional E2E HU06: ejecución completa y autónoma», sección 1: suite real, cinco casos iniciales, repeticiones focalizadas y calibración dentro de HU06. Se mantuvieron P-06, P-15, UI-10, H6, un worker, trace off y cero reintentos automáticos.

## Resultado real

Se ejecutó **una suite completa**, seguida de **tres CP focalizados** y una última repetición de **dos CP**. Diez casos nuevos: **773, 775, 776, 777, 778, 779, 780, 781, 782 y 783**. El salto de numeración no se adjudica al framework. Cupos comprobados antes de crear: **46 + 5 = 51**, **51 + 3 = 54**, **54 + 2 = 56**. El histórico conserva sus 46 registros anteriores sin cambios y añade diez; no se declaró cleanup físico ni se marcaron casos como depurados.

| CP seleccionado | Caso | Resultado automático / pasos matriz | Alcance ejecutado |
|---|---|---|---|
| CP01 | **782** | FAIL: 24 PASS, 3 FAIL, 2 NOT_AUTOMATED / 29 | Hasta P29; edición, adición, Guardar y eliminación de su fila dentro del mismo vertical. Ninguna capacidad NOT_RUN. Fallan objetivo/presentación y textos de Forma Consulta en P19/P24; P4/P28 siguen no automatizados. |
| CP02 | **776** | **REAL_PASS: 22/22 PASS** | Hasta P22, con P18 al final como ya establecía el escenario. Extracción 3/3 pólizas y 3/3 placas; lectura independiente por identidad real de fila. No se alteró la implementación de P18 ni se validó por posición. |
| CP03 | **780** | FAIL: 21 PASS, 4 FAIL / 25 | Hasta P25, sin continuaciones. Se seleccionó una opción RCE real del pop-up y se guardó; aceptación de letras y falta de persistencia Ramo RCE conservan FAIL. Objetivo agregado también FAIL. |
| CP04 | **783** | FAIL: 18 PASS, 4 FAIL, 1 NOT_AUTOMATED / 23 | Todos los pasos posibles ejecutados: secciones, cierre sin cambios, adición/eliminación y negativa final. P16/P17 aceptan letras; Guardar no cierra en P19 tras la negativa de ocho dígitos. El reporte conserva causa NO_CLASIFICADO para ese cierre: no se presenta como defecto de producto confirmado. P15 sigue sin criterio funcional. |
| CP05 | **773** | **REAL_PASS_PARCIAL: 7 PASS, 2 NOT_AUTOMATED / 9** | P8/P9 PASS: registro y gráfico de la instancia actual completos, 8 elementos coincidentes, ruta regular aprobada y sin Worker/Estructurar. P6 continúa pendiente; P1 agregado no es aprobación. |

**108 pasos de matriz: 92 PASS, 11 FAIL y 5 NOT_AUTOMATED. Ninguna capacidad NOT_RUN en las cinco ejecuciones seleccionadas.** Recorrido ejecutado no significa aprobación funcional QA. Los pop-ups de CP01/CP02/CP03 se completaron dentro del vertical; CP04 conserva el cierre fallido como límite real de seguridad, al final. Nunca se pulsaron Cancelar, Escape o X para salir de un pop-up.

## Correcciones mínimas y comparación

- `sde/popups.ts`, `ejecutor.ts`, `capacidades.ts`: opt-in `SDE_POPUPS_CASO_CREADO=1`. El permiso solo nace tras CREATENEWCASE exitoso y número confirmado en UI; se completa con radicación/idCase/idFlujo consistentes de la Consulta Gráfica. Antes de abrir se exige número coincidente del formulario y el mismo `unico` y `BIZAGI_CORRIDA`. Solo pasa la excepción existente `en_calibracion`, nunca un formulario `sin_calibrar` o desconocido. No se guarda ni se transfiere a otro proceso/caso. No se modifica globalmente el catálogo UI-10.
- `escenario.ts`, `ejecutor.ts`, `capacidades.ts`: diferencia funcional observable conserva FAIL y continúa solo con opt-in en capacidades acotadas: lectura de tabla, prueba negativa con recuperación prevista, verificación o postcondición después de cerrar. Un error técnico, incidente o cierre fallido sigue deteniendo. Las expectativas se conservan. CP01 separa la observación de texto de la operación de adicionar.
- CP04 hace primero lo independiente; Seguimiento oculta la grilla, por lo que reabre la misma actividad antes del pop-up. Comprueba Guardar sin cambios, agrega/elimina su fila y deja la negativa y su recuperación para el final. No se cambia el contenido de la matriz ni se convierte la negativa en PASS.
- `datasets.yaml` y `.env.example`: dato **`SDE_CUMPL_RAMO_RCE_POPUP`** separado del Ramo inicial usado por HU03. La descripción exacta se obtuvo de las opciones del pop-up de 777; no se inventó ni se usó un prefijo de código. El valor se conserva solo en `.env`. No se cambiaron escenarios HU03.
- `veredicto.ts`: `SDE_VEREDICTO_SALIDA` permite conservar el veredicto por corrida, junto con HTML/JUnit/output separados. La primera corrida escribió el archivo convencional; su resultado se archivó en su propia carpeta y el convencional anterior se restauró exactamente desde el respaldo previo.
- `tests/unit/cierre-hu06.unit.spec.ts`: 18 regresiones nuevas. Sin cambios en `shared/`, `tools/`, Colsubsidio, CONPRE, Demo, el generador Word o la selección productiva.

CP01 de la suite inicial (775) se detenía después de guardar por diferencia de texto en P19; la primera repetición (779) encontró la misma observación dentro de la adición P24. El último vertical (782) conserva ambos FAIL y alcanza P29. CP03 inicial (777) bloqueó por dato RCE faltante; se calibró sin crear otro caso y 780 ejecutó todo el bloque. CP04 inicial (778) llegó al cierre fallido antes de las secciones; 781 detectó la grilla oculta al reordenar. 783 incorpora la reapertura y registra lo independiente antes de reproducir el cierre final fallido. No se repitió la suite completa ni se ocultaron esos resultados históricos.

## Diagnóstico CP02 y persistencia RCE

Inspección focalizada de **772**, sin editar: tres filas con `id`/business-key coherentes; **0/3 placas tanto por texto DOM como en controles**; la colección `rows` de Render conserva **3/3 pólizas y 0/3 placas**. El caso 711 archivado tenía 3/3 de ambas; 776, con narrativa equivalente salvo referencia única, también obtuvo 3/3 de ambas. Esto descarta que las placas estuvieran únicamente ocultas en inputs o en otra columna en la inspección de 772. **No hay respuesta directa del Worker AI**: no se identifica por qué esa ejecución omitió placas ni se atribuye automáticamente al producto. No se cambió la expectativa ni el FAIL histórico de 772.

En **780**, P21 verificó la selección de una descripción real de Ramo RCE. Tras Guardar y en una reapertura independiente, una fila única con identidad coherente conserva el Número Póliza RCE esperado, pero muestra Ramo RCE vacío. Posible defecto de persistencia, pendiente de QA; no se explica por un dato con código del formulario inicial. La inspección no pudo correlacionar directamente la fila de `rows` con ese campo del modelo en su resumen: el resultado positivo de persistencia no se inventa. La combinación del Ramo principal sigue la calibración D-63 y se comprobaron los comportamientos visibles con/sin pregunta RCE; no se obtuvo un nuevo booleano `bEsRCE` en el resumen de esta inspección.

## Soporte y conservación

**Un Word HU06**, generado offline después de terminar QA:

`test-results/seguros-del-estado/soportes/HU06/2026-10-21T19-22-55-105Z/20261021_SDE_CEL_HU06_Soporte_Certificacion_Cliente.docx`

Plan: `HU06-soporte-plan.json` en la misma carpeta. Selección: 782/776/780/783/773, con sus identificadores de corrida y fuentes; sin continuaciones ni validaciones posteriores de otro caso. **282 capturas persistentes nuevas en diez ejecuciones; 154 pertenecen a las cinco seleccionadas.** El Word usa la última captura de cada paso cubierto: 104/108 pasos tienen imagen; los cuatro restantes son objetivos agregados sin captura propia. Hay 101 archivos fuente únicos embebidos, con reutilización legítima de una misma acción que cubre varios pasos. Se verificó cada ruta CP/ejecución y el hash de cada imagen utilizada frente al PNG original, XML bien formado y relaciones de imagen existentes.

**Limitación visual:** el render se intentó con `tools/afi-soporte-render.mjs`, pero LibreOffice no está instalado. El DOCX está generado y validado estructuralmente; no se afirma revisión visual de páginas ni se instalaron herramientas adicionales.

Respaldo local previo: `tmp/cierre-HU06-20261021T185643Z/evidencia-anterior/`. Control SHA-256: **581 archivos históricos distintos del contador permanecen idénticos**; el contador conserva sus entradas y solo añade los diez casos. Índices HTML/JUnit originales intactos. Evidencia JSON seleccionada sanitizada en `projects/seguros-del-estado/docs/evidencia/cierre-HU06-20261021T185643Z/`; ningún PNG, Word, video o dato de `.env` se agrega a Git. Los resúmenes de las dos inspecciones conservan únicamente cantidades/booleanos, sin claves de registros ni credenciales.

## Validación y comandos

- `npx tsc --noEmit`: sin errores.
- SDE: **199/199 PASS** en la regresión pertinente (incluye las 18 nuevas):

```powershell
$env:CI='1'; $env:SDE_E2E='0'; $env:BIZAGI_BASE_URL='http://portal.sintetico.local'
node tools/run.mjs seguros-del-estado cierre-hu06.unit confiabilidad.unit correcciones-pr7.unit soporte-hu.unit soporte-conservacion.unit ejecuciones-seleccion.unit datos-escenario.unit ejecutor.unit ruta-pendiente.unit regresiones-hu06-20261021.unit clasificacion.unit presentacion.unit resultados-pipeline.unit runner-argumentos.unit solo-lectura.unit --grep "@unit" --retries=0 --reporter=list --output=tmp/cierre-HU06-20261021T185643Z/unit-final
```

- Colsubsidio, sin QA: **32/32 PASS**, `node tools/run.mjs colsubsidio afi-soporte.unit --workers=1 --retries=0 --reporter=list --output=tmp/cierre-HU06-20261021T185643Z/colsubsidio-soporte`.
- Word: **1/1 PASS**, `SDE_SOPORTE_HU=HU06`, sin `SDE_SOPORTE_CORRIDA`, `node tools/run.mjs seguros-del-estado --grep "@soporte-hu" --workers=1 --retries=0 --reporter=list --output=tmp/cierre-HU06-20261021T185643Z/generacion-soporte`.
- E2E inicial: `--grep "@hu06" --grep-invert "@variante" --workers=1 --retries=0 --trace off`, cinco CP exactos. Repeticiones: `--grep "@HU06-CP0[134]"` y después `--grep "@HU06-CP0[14]"`, siempre excluyendo variantes y con nuevas rutas/cupos. Los tres comandos terminaron con código **1**, coherente con FAIL/parciales; no se forzó una salida verde.

Preparación completa del cupo/variables y los dos comandos de uso: `projects/seguros-del-estado/docs/EJECUCION-HU06-CONTROLADA.md`. Los logs de esta fase quedan en `tmp/cierre-HU06-20261021T185643Z/` y los artefactos reales por corrida en `test-results/seguros-del-estado/corridas/`.

## Pendientes y alcance de aprobación

No se recertifican resultados anteriores ni los otros 12 CP. CP02 776 es REAL_PASS automático, sin firma/aprobación humana inventada. Pendientes: textos/presentación de CP01, P6 CP05, contenido P28 CP01, criterio P15 CP04, aceptación de letras en Cumplimiento, persistencia Ramo RCE y diagnóstico del cierre P-21a/BUG-03. Este último conserva causa NO_CLASIFICADO, no un defecto de producto confirmado. El cierre físico de casos/cleanup P-17 sigue pendiente. La automatización por identidad de fila conserva su protección ante identidad insuficiente y no habilita la lectura por posición.

Recomendación: auditoría independiente del diff y del soporte antes de publicar; ninguna publicación o fusión autorizada en esta fase. No crear más casos para insistir sobre los fallos persistentes aquí documentados.
