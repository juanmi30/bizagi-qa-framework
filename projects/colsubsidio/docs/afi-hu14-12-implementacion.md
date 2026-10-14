# HU 14.12 — implementación CP01 y CP02

Se extiende el piloto local. No se modifica `shared/` ni se implementan CP03/CP04.
Las fuentes literales están en `resources/hu14-12/CP01.json` y `CP02.json`,
extraídas del Excel certificado. Las discrepancias visuales y la resolución
del usuario están documentadas en `resources/hu14-12/README.md`.

## Cobertura implementada

| Caso | Plataforma | Pasos |
|---|---|---|
| CP01 | Desktop | P02-P18 |
| CP01 | Mobile | P19-P32 |
| CP02 | Desktop | P02-P19 |
| CP02 | Mobile | P20-P35 |

Mobile es emulación Playwright en Chromium/Edge, con viewport 400×824,
`hasTouch: true` e `isMobile: true`. El soporte administrativo utiliza un
contexto Desktop separado. No se presenta como prueba en un dispositivo real.

Los specs reutilizan `afiHu1412.ts`: preparación del piloto, guardia
`AFI_CP01_RUN_REAL`, seguimiento del número devuelto por la creación única,
reconocimiento condicional y cleanup en `finally`. Cada corrida tiene su caso.
La ejecución exige un worker y los specs desactivan los retries.

## Datos y recorrido

- Se mantienen los datos autorizados `AFI_CP01_*` del `.env` existente para las
  solicitudes Independiente. No se incluyen credenciales ni identidad en código.
- CP01 conserva Cha → Chapinero y el barrio certificado Bellavista (bel en
  Desktop; bella en Mobile).
- CP02 usa Chi → CHÍA y Soa → SOACHA. El catálogo se compara con Ciudad nacional
  recibida por el portal, filtrada por la relación departamental de Chía
  certificada y por registros activos. No se inventa un catálogo de municipios.
  Si Chromium no conserva el cuerpo, se relee la misma petición GET autorizada
  de paramétricas; no se modifican respuestas del portal ni se repiten POST.
- Localidad en CP02 es condicional: se registra `NO_APLICA` cuando no aparece.
- El barrio CP02 se elige del catálogo real del municipio actual, por autorización
  expresa del usuario. Se adjunta el dato para reutilizarlo durante la corrida.
  Un catálogo ausente o vacío donde se espera Barrio no se marca como PASS.
- La dirección CP01 usa los valores visibles en el soporte P16. Las opciones
  no obligatorias sin dato necesario no se inventan.
- El recorrido observado llega a Documentación y permite descargar el formulario
  antes de cargar documentos. No fue necesario fabricar un documento firmado
  ni enviar una afiliación para inspeccionar la fila final.

## Validación del formulario

`pdfFormulario.ts` utiliza PDF.js para leer texto y bordes vectoriales. Exige
la fila `Dirección de vivienda | Municipio | Rural/Urbano | Departamento | Teléfono`,
delimita la celda de datos bajo Rural/Urbano con sus bordes y comprueba que no
contenga texto. Adjunta la estructura, el PDF original y su renderizado PNG.
No considera suficiente encontrar la etiqueta.

Tres pruebas locales con PDFs independientes verifican aceptación de celda
vacía, rechazo de una celda con URBANO y rechazo de encabezados incorrectos.
No acceden a QA. PDF.js se agregó a las dependencias de desarrollo; la versión
instalada requiere Node 22.13 o posterior (o Node 24). El entorno usado es Node 24.

## Ejecución secuencial

```powershell
$env:PROJECT = 'colsubsidio'
$env:AFI_CP01_RUN_REAL = 'true'
$env:CI = '1'
npx playwright test afi-hu14-12-cp01-desktop.spec.ts --workers=1 --retries=0
npx playwright test afi-hu14-12-cp02-desktop.spec.ts --workers=1 --retries=0
npx playwright test afi-hu14-12-cp01-mobile.spec.ts --workers=1 --retries=0
npx playwright test afi-hu14-12-cp02-mobile.spec.ts --workers=1 --retries=0
```

Sin la guardia las pruebas reales se omiten. Cada `CPxx_resultado.json` conserva
estados por paso, duración, reconocimiento natural/emulado, cleanup y errores
separados. Los pasos no alcanzados permanecen BLOCKED. El error funcional tiene
prioridad sobre un fallo posterior de cleanup.

Para conservar evidencias de varias corridas usar `--output` distinto por corrida.
Los adjuntos con contenido JSON pueden quedar embebidos en el reporte; el JSON
de resultado y el formulario descargado también se escriben como archivos.

## Resultados reales

| Caso | Plataforma | Pasos observados | Resultado | Segundos con cleanup | Cleanup |
|---|---|---|---|---|---|
| CP01 | Desktop | P02-P18 | PASS | 198 | Exitoso |
| CP01 | Mobile | P19-P32 | PASS | 175 | Exitoso |
| CP02 | Desktop | P02-P06 PASS; P07 FAIL; P08-P19 BLOCKED | Fallo funcional en P07 | 171 | Exitoso |
| CP02 | Mobile | P20-P28 PASS; P29-P31 NO_APLICA; P32 FAIL; P33-P35 BLOCKED | Barrio ausente para Soacha | 192 | Exitoso |

Los cuatro resultados finales usaron reconocimiento natural. La rama de
emulación/reasignación sigue conservada, sin certificación de ejecución en
estas corridas. No apareció una validación documental manual en el recorrido
CP01 hasta el formulario descargable.

CP02 Desktop P07: el prefijo literal `Chi` muestra `CACHIPAY` y `CHIPAQUE`,
pero no `CHÍA`. P04 ya verificó que CHÍA existe en el catálogo completo de
Cundinamarca. Se conserva la falla contra el resultado esperado certificado,
sin sustituir el prefijo por `Chí` ni cambiar de municipio para producir PASS.
Los pasos siguientes permanecen BLOCKED, no certificados.

CP02 Mobile P32: después de Cundinamarca → Soacha, la pantalla muestra
Departamento y Ciudad vivienda, con Continuar habilitado, pero no existe el
campo Barrio esperado por el paso certificado. No se utiliza una captura de
Bogotá ni se fuerza una localidad para sustituir ese catálogo. Localidad no
aparece y sus pasos condicionales P29-P31 son NO_APLICA. P33-P35 son BLOCKED.
Se reporta como bloqueo contra el caso certificado; no se presume que el
comportamiento actual del producto deba corregirse sin revisión funcional.

Por estos dos bloqueos no se certifica CP02 completo ni su Rural/Urbano final.
El código de los pasos posteriores está implementado, pero no fue alcanzado
en esas corridas y no se presenta como cobertura ejecutada.

Evidencia conservada por ejecución:

Reportes HTML: [CP01 Desktop](../../../test-results/colsubsidio/hu14-12-cp01-desktop-html/index.html),
[CP01 Mobile](../../../test-results/colsubsidio/hu14-12-cp01-mobile-run01-html/index.html),
[CP02 Desktop](../../../test-results/colsubsidio/hu14-12-cp02-desktop-run03-html/index.html),
[CP02 Mobile](../../../test-results/colsubsidio/hu14-12-cp02-mobile-run01-html/index.html).
[Resumen JSON](../../../test-results/colsubsidio/hu14-12-resumen.json) y
[historial por corrida](../../../test-results/colsubsidio/hu14-12-historial.json).

- `test-results/colsubsidio/hu14-12-cp01-desktop-final/` y
  `hu14-12-cp01-desktop-html/`: JSON de resultado, PDF, PNG y reporte con capturas
  y catálogos adjuntos.
- `test-results/colsubsidio/hu14-12-cp01-mobile-run01/` y
  `hu14-12-cp01-mobile-run01-html/`: resultado y evidencia Mobile por paso,
  incluida geometría de alerta.
- `test-results/colsubsidio/hu14-12-cp02-desktop-run03/` y
  `hu14-12-cp02-desktop-run03-html/`: catálogo configurado y observable, filtro
  Chi antes de seleccionar, fallo funcional, trace, video y cleanup.
- `test-results/colsubsidio/hu14-12-cp02-mobile-run01/` y
  `hu14-12-cp02-mobile-run01-html/`: catálogo, Soacha seleccionada, ausencia de
  Localidad/Barrio, captura, video, trace y cleanup.
- `test-results/colsubsidio/hu14-12-resumen.json`: cuatro resultados finales.
- `test-results/colsubsidio/hu14-12-historial.json`: estados y cleanup de las
  catorce corridas reales terminadas. Trece crearon caso y las trece registran
  cleanup exitoso; la corrida DNS no creó caso.

La corrida anterior `hu14-12-run08` también completó CP01 Desktop P02-P18
(225 segundos). La confirmación de 198 segundos verifica la extracción final
de operaciones de Barrio compartidas con CP02.

Validación estática: `npx tsc --noEmit` PASS. Pruebas locales del lector PDF:
3 PASS. No se requieren variables nuevas de `.env`; no se modificó ese archivo.

Durante la implementación se corrigieron: intento de clic en Continuar disabled
mediante coordenadas reales, validación obligatoria nativa de Barrio (el control
no expone `aria-invalid`), reemplazo de teléfonos precargados y apertura por
teclado de selects de dirección cuyo centro puede estar cubierto por prefijos
visuales. Una corrida falló por DNS antes de crear un caso; la resolución se
recuperó en la comprobación siguiente.

En CP02 se resolvió además la lectura incompleta del cuerpo de algunas
respuestas de paramétricas mediante GET de respaldo. Dos corridas exploratorias
presentaron errores al cerrar el trace; no se presentan esas trazas como evidencia
completa. Los JSON de resultado/cleanup permanecen disponibles, y los reportes
finales indicados arriba conservan la evidencia de sus respectivas ejecuciones.

## Archivos

Specs nuevos: `afi-hu14-12-cp02-desktop.spec.ts`,
`afi-hu14-12-cp01-mobile.spec.ts`, `afi-hu14-12-cp02-mobile.spec.ts` y
`afi-hu14-12-pdf.unit.spec.ts`. Se extendió el spec Desktop CP01 existente.

Helpers nuevos: `afiHu1412.ts`, `catalogoAutocomplete.ts`,
`contactoCatalogos.ts`, `contactoMobile.ts`, `ciudadNacional.ts`,
`cp02Contacto.ts`, `formularioFinal.ts` y `pdfFormulario.ts`.
Se reutilizan `afiliacionesPortal.ts`, `bizagiQaSupport.ts` y `cp01Contacto.ts`.
El helper de soporte Bizagi permanece sin cambios.

Fuentes nuevas: `resources/hu14-12/CP01.json`, `CP02.json` y `README.md`.
Se agrega este documento y se enlaza desde la documentación histórica del piloto.
`package.json` y `package-lock.json` incorporan PDF.js con versión fijada.
