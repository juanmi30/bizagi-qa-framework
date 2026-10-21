# HU06 completa y soporte consolidado

> **Forma recomendada (21/10/2026):** `npm run sde:hu06:simular` → `npm run sde:hu06` (ejecuta y genera el Word) y `npm run sde:hu06:word` (solo el Word, sin Bizagi). El orquestador `projects/seguros-del-estado/tools/hu.mjs` aplica este mismo procedimiento sin variables manuales; ver `GUIA-DEMO-HU06-2026-10-21.md`. Lo que sigue es el procedimiento manual equivalente. **No** pasar opciones con `npm run ... -- --opción` desde PowerShell: el `--` se pierde.

Ejecutar desde la raíz del repositorio. Requiere las cuentas QA y los datos autorizados en `.env` local. Para CP03, `SDE_CUMPL_RAMO_RCE_POPUP` contiene la descripción exacta de una opción observada en el pop-up; es independiente de `SDE_CUMPL_RAMO_RCE` del formulario inicial de HU03. No intercambiar los formatos ni inventar una opción.

## 1. Ejecutar los cinco CP

Este bloque reserva explícitamente cinco creaciones sobre el contador local actual. No se debe lanzar otra ejecución real simultáneamente ni usarlo como reintento automático. Los FAIL y parciales conservan código de salida no cero; no significan aprobación QA.

```powershell
$ErrorActionPreference='Stop'
$histHu06=Get-Content test-results/seguros-del-estado/historico-casos.json -Raw | ConvertFrom-Json
$pendientesHu06=@($histHu06 | Where-Object {$_.estadoDepuracion -ne 'Depurado'}).Count
$env:SDE_MAX_CASOS_PENDIENTES=[string]($pendientesHu06+5)
$env:BIZAGI_CORRIDA='HU06-'+(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$salidaHu06='test-results/seguros-del-estado/corridas/'+$env:BIZAGI_CORRIDA
$env:PLAYWRIGHT_HTML_OUTPUT_DIR=$salidaHu06+'/html'
$env:PLAYWRIGHT_JUNIT_OUTPUT_FILE=$salidaHu06+'/junit.xml'
$env:SDE_VEREDICTO_SALIDA=$salidaHu06+'/veredicto-e2e.json'
$env:CI='1'; $env:CAPTURE='1'; $env:SDE_E2E='1'; $env:SDE_TIPO_EJECUCION='certificacion'
$env:SDE_POPUPS_CASO_CREADO='1'
Remove-Item Env:SDE_AUTORIZO_CALIBRACION_POPUP -ErrorAction SilentlyContinue
node tools/run.mjs seguros-del-estado --grep "@hu06" --grep-invert "@variante" --workers=1 --retries=0 --trace off --output="$salidaHu06/artifacts"
```

La autorización del pop-up permanece en memoria de cada CP: creación confirmada por servidor/UI, radicación, instancia de Consulta Gráfica, identificador de ejecución y corrida coincidentes, y número del formulario actual. Solo habilita la excepción existente `en_calibracion`; nunca un formulario desconocido o `sin_calibrar`. No autoriza un caso ajeno ni una continuación en otro proceso. Mantiene P-06, P-15, UI-10 y H6.

CP04 ejecuta primero las secciones independientes; vuelve a abrir la misma actividad, comprueba cierre sin cambios y prueba adición/eliminación de su fila. La negativa de formato y su recuperación quedan al final: un cierre fallido no justifica Cancelar, Escape o X, ni repetir indefinidamente sobre el caso.

## 2. Generar un único Word, sin Bizagi

```powershell
$env:SDE_E2E='0'; $env:SDE_SOPORTE_HU='HU06'
Remove-Item Env:SDE_SOPORTE_CORRIDA -ErrorAction SilentlyContinue
$salidaSoporteHu06='tmp/soporte-HU06-'+(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
node tools/run.mjs seguros-del-estado --grep "@soporte-hu" --workers=1 --retries=0 --reporter=list --output="$salidaSoporteHu06"
```

La salida persistente está en `test-results/seguros-del-estado/soportes/HU06/<fecha-hora>/`. La consola y el plan identifican caso, corrida y fuentes de cada CP. Se selecciona la última ejecución finalizada con caso y reporte consistente; las continuaciones solo pertenecen al mismo caso. Una ejecución nueva sin caso no desplaza silenciosamente la anterior. Un FAIL nuevo con caso sí se muestra. Los cinco CP pueden proceder de la suite inicial y sus repeticiones focalizadas; no se presentan como una única corrida cuando no lo son.

Conservar `test-results/`, `.env` y credenciales localmente. Para compartir, usar únicamente evidencia revisada y sanitizada. No modificar reportes anteriores ni convertir un FAIL o un parcial en aprobación funcional.
