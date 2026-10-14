# Create Case — Colsubsidio

Estos recursos representan los **Create Case correctos** compartidos por Iván el 12–13 de agosto de 2026 para el ambiente de pruebas de Colsubsidio.

Los archivos anteriores de Postman usados durante la exploración inicial fueron confirmados como incorrectos y no deben utilizarse como fuente funcional para T2.

Archivos:

- `credito.json`: Gestión de Crédito, processId `0188d3ec-f208-4653-be77-788fc76e370c`.
- `afiliaciones.json`: Afiliaciones, processId `d5e224d0-4f05-4ebb-9a61-f4cafdc9ed63`.

Ambos apuntan a:

```text
https://test-procesosdigitales-colsubsidio.bizagi.com
```

Los valores de `startParameters` se conservaron tal como fueron entregados, incluyendo diferencias de tipo como `"false"`, `true` y `1`.

La autenticación del ambiente de pruebas se configura mediante `BIZAGI_API_TOKEN` en `projects/colsubsidio/.env`.

## Pruebas

Contrato sin red:

```bash
npm test -- colsubsidio --grep "@t2-contrato"
```

Create Case real en el ambiente de pruebas (crea casos):

```powershell
$env:BIZAGI_RUN_REAL_API="true"
npm test -- colsubsidio --grep "@t2-real"
```

Para repetir una prueba con datos distintos se pueden sobrescribir:

```text
BIZAGI_CREDITO_NUMERO_IDENTIFICACION
BIZAGI_AFILIACIONES_NUMERO_IDENTIFICACION
BIZAGI_AFILIACIONES_CORREO
BIZAGI_AFILIACIONES_FECHA_HORA
```
