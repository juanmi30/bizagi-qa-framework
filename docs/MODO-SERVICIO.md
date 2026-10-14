# Modo servicio — Create Case por API OData de Bizagi

## 1. Objetivo

El modo servicio prepara casos de Bizagi mediante API para que una prueba E2E pueda comenzar desde un estado avanzado sin recorrer por UI todas las actividades previas.

La secuencia objetivo es:

```text
YAML
 ↓
inicio.modo: servicio
 ↓
InicioServicio
 ↓
BizagiApiClient
 ↓
Create Case OData
 ↓
número de caso
 ↓
HistorialCasos
 ↓
modo buscar (pendiente)
 ↓
BpmEngine + FormActions
 ↓
Work Portal + hazards
```

La integración con `scenarioLoader.ts`, `BpmEngine.ts` y el futuro `modo: buscar` continúa pendiente de revisión del equipo. T2 deja lista y comprobada la pieza de creación por API.

---

## 2. Fuente funcional vigente para Colsubsidio

El 13 de agosto de 2026 se confirmó con Iván que las primeras colecciones de Postman utilizadas durante la exploración inicial **no eran correctas** para implementar Create Case.

La fuente funcional vigente son los dos Create Case específicos entregados posteriormente:

- Gestión de Crédito.
- Afiliaciones.

El ambiente suministrado es un ambiente de pruebas autorizado para este trabajo:

```text
https://test-procesosdigitales-colsubsidio.bizagi.com
```

Los recursos normalizados dentro del proyecto están en:

```text
projects/colsubsidio/resources/create-case/
├── credito.json
└── afiliaciones.json
```

Los valores de `startParameters` se conservaron con los mismos tipos entregados por el equipo.

---

## 3. Contrato Create Case confirmado

### Gestión de Crédito

```text
Process ID: 0188d3ec-f208-4653-be77-788fc76e370c
```

Endpoint:

```http
POST https://test-procesosdigitales-colsubsidio.bizagi.com/odata/data/processes(0188d3ec-f208-4653-be77-788fc76e370c)/start
```

El payload contiene 8 `startParameters`.

Entre los tipos confirmados se encuentran:

```json
{ "xpath": "...bModificarAgencia", "value": "false" }
{ "xpath": "...ksCreadorCaso", "value": 1 }
```

Es importante preservar esa diferencia: `"false"` es string y `1` es number.

### Afiliaciones

```text
Process ID: d5e224d0-4f05-4ebb-9a61-f4cafdc9ed63
```

Endpoint:

```http
POST https://test-procesosdigitales-colsubsidio.bizagi.com/odata/data/processes(d5e224d0-4f05-4ebb-9a61-f4cafdc9ed63)/start
```

El payload contiene 20 `startParameters` y combina:

- strings;
- strings vacíos;
- booleanos;
- fechas ISO representadas como string;
- URLs;
- direcciones IP;
- correo electrónico.

Ejemplo de booleano real:

```json
{ "xpath": "...bAceptaTratamientoDatos", "value": true }
```

`BizagiApiClient` no transforma los valores antes de serializarlos.

---

## 4. Autenticación

Los Create Case correctos entregados para el ambiente de pruebas utilizan un Bearer token preemitido:

```http
Authorization: Bearer <token>
```

Por esa razón el cliente soporta ahora dos formas de resolver la autenticación.

### Opción A — Bearer token preemitido

Es la opción correspondiente al ambiente de pruebas actual de Colsubsidio:

```env
BIZAGI_API_URL=https://test-procesosdigitales-colsubsidio.bizagi.com
BIZAGI_API_TOKEN=<token-bearer-de-pruebas>
```

`autenticar()` devuelve el token configurado sin realizar una llamada adicional.

### Opción B — OAuth `client_credentials`

Se conserva como alternativa soportada por el cliente si posteriormente el equipo entrega una aplicación OAuth:

```env
BIZAGI_API_URL=https://<ambiente>.bizagi.com
BIZAGI_API_CLIENT_ID=
BIZAGI_API_SECRET=
```

En este modo el cliente solicita:

```http
POST {BIZAGI_API_URL}/oauth2/server/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <base64(clientId:clientSecret)>
```

con:

```text
grant_type=client_credentials&scope=api
```

El token se conserva únicamente en memoria durante la ejecución.

---

## 5. Configuración de Colsubsidio

`projects/colsubsidio/.env.example` documenta la configuración esperada.

El `.env` local contiene la configuración del ambiente de pruebas y está cubierto por:

```gitignore
projects/**/.env
```

Variables utilizadas:

```env
BIZAGI_BASE_URL=https://test-procesosdigitales-colsubsidio.bizagi.com
BIZAGI_API_URL=https://test-procesosdigitales-colsubsidio.bizagi.com
BIZAGI_API_TOKEN=<token>
BIZAGI_API_TIMEOUT_MS=30000
BIZAGI_PROCESS_ID_CREDITO=0188d3ec-f208-4653-be77-788fc76e370c
BIZAGI_PROCESS_ID_AFILIACIONES=d5e224d0-4f05-4ebb-9a61-f4cafdc9ed63
BIZAGI_RUN_REAL_API=false
```

Aunque el equipo confirmó que los valores pertenecen al ambiente de pruebas y pueden utilizarse, la configuración se mantiene en `.env` para evitar acoplar el código a un token que puede cambiar o expirar.

---

## 6. BizagiApiClient

Archivo:

```text
shared/utils/BizagiApiClient.ts
```

Interfaz de parámetros:

```ts
export interface ParametroInicioBizagi {
  xpath: string;
  value?: unknown;
  type?: string;
  rows?: unknown[];
}
```

Métodos principales:

```ts
autenticar(): Promise<string>
```

```ts
crearCaso(
  procesoId: string,
  parametros?: ParametroInicioBizagi[],
): Promise<string>
```

`value: unknown` es intencional porque los Create Case reales mezclan string, number y boolean.

El cuerpo enviado por `crearCaso()` es exactamente:

```json
{
  "startParameters": [
    { "xpath": "...", "value": "..." }
  ]
}
```

El número retornado por Bizagi se lee desde `response.value` y se entrega como string.

---

## 7. InicioServicio e histórico

`shared/core/InicioServicio.ts` coordina:

```text
crear caso
 ↓
obtener número
 ↓
registrar histórico
 ↓
devolver número
```

`shared/utils/HistorialCasos.ts` persiste en:

```text
test-results/<proyecto>/historico-casos.json
```

Cada entrada contiene:

```json
{
  "numeroCaso": "555656",
  "fechaHora": "2026-08-13T00:00:00.000Z",
  "escenario": "CRD - Create Case API real",
  "modoCreacion": "servicio",
  "estadoDepuracion": "Pendiente de depurar"
}
```

Si Bizagi crea el caso pero falla la persistencia, el error informa el número ya creado para evitar un reintento automático que genere duplicados.

---

## 8. Pruebas sin conexión externa

### Cliente API genérico

```bash
npm test -- demo --grep "@t2-api"
```

Valida, entre otros:

- Bearer token preemitido sin llamada OAuth;
- OAuth `client_credentials` como alternativa;
- creación de caso;
- URL, headers y body;
- configuración faltante o incompleta;
- proceso inexistente;
- respuesta sin número de caso;
- timeout;
- GUID vacío.

### Inicio e histórico

```bash
npm test -- demo --grep "@t2-servicio"
```

Valida la coordinación de `InicioServicio` y la persistencia de `HistorialCasos` con mocks/directorios temporales.

### Contrato específico de Colsubsidio

```bash
npm test -- colsubsidio --grep "@t2-contrato"
```

Archivo:

```text
projects/colsubsidio/tests/contrato-create-case.spec.ts
```

Ejecuta un contrato para Crédito y otro para Afiliaciones utilizando los recursos correctos de `projects/colsubsidio/resources/create-case/`.

La red se simula, pero `BizagiApiClient` es real. Las pruebas comprueban que:

- el endpoint coincida con el `processId` entregado;
- se envíe `POST`;
- se use Bearer;
- el body sea `{"startParameters": ...}`;
- los parámetros y sus tipos se conserven exactamente.

---

## 9. Prueba real contra el ambiente de test

Archivo:

```text
projects/colsubsidio/tests/servicio-create-case.real.spec.ts
```

Estas pruebas están **deshabilitadas por defecto** porque crean casos reales dentro del ambiente de pruebas.

Para habilitarlas en PowerShell:

```powershell
$env:BIZAGI_RUN_REAL_API="true"
npm test -- colsubsidio --grep "@t2-real"
```

Al finalizar puede deshabilitarse la variable con:

```powershell
Remove-Item Env:BIZAGI_RUN_REAL_API
```

Los datos entregados por Iván se utilizan como valores por defecto. Si una identificación ya fue consumida por una ejecución previa, puede sobrescribirse sin editar el recurso:

```env
BIZAGI_CREDITO_NUMERO_IDENTIFICACION=
BIZAGI_AFILIACIONES_NUMERO_IDENTIFICACION=
BIZAGI_AFILIACIONES_CORREO=
```

La prueba real utiliza:

```text
InicioServicio REAL
 ↓
BizagiApiClient REAL
 ↓
fetch REAL
 ↓
ambiente TEST de Colsubsidio
 ↓
número real de caso
 ↓
HistorialCasos REAL
```

No utiliza `page`, por lo que Playwright actúa como runner de prueba y no necesita abrir el navegador para esta etapa.

Si aparece un error de DNS o conectividad (por ejemplo, el host no puede resolverse), debe validarse que el equipo tenga acceso a la red/VPN desde la cual se expone el ambiente de pruebas. El cliente incluye el detalle técnico de la causa de conexión para facilitar este diagnóstico.

---

## 10. Playwright y HTTP

El transporte actual es `fetch` de Node.js.

Esto es compatible con Playwright Test y mantiene `BizagiApiClient` independiente del runner. `APIRequestContext` de Playwright sigue siendo una alternativa técnica si el equipo decide unificar más adelante las solicitudes HTTP dentro de las abstracciones de Playwright.

No es necesario migrar el cliente para ejecutar Create Case.

---

## 11. Alcance confirmado

El alcance actual de T2 se limita a:

```ts
autenticar()
crearCaso()
```

Los demás métodos presentes en las colecciones antiguas de integración no forman parte de esta tarea y, además, esas primeras colecciones fueron confirmadas como incorrectas para este desarrollo.

No se implementan actualmente:

- consulta de workitems;
- avance de actividades mediante `/next`;
- otros servicios de la capa de integración.

---

## 12. Pendiente para integrar `modo: servicio` en YAML

Todavía se requiere revisar/modificar:

```text
shared/runner/scenarioLoader.ts
shared/runner/BpmEngine.ts
```

El cargador actual acepta:

```ts
modo: 'bandeja' | 'crear-caso'
```

El diseño de Colsubsidio contempla:

```text
bandeja | buscar | servicio
```

La integración definitiva debe resolver:

1. esquema YAML de `servicio`;
2. compatibilidad con `crear-caso`;
3. implementación de `buscar` por número;
4. apertura del caso creado por API;
5. continuación normal por `BpmEngine`, `FormActions` y hazards;
6. unificación del histórico persistente con los casos detectados por UI.

---

## 13. Estado actual

### Implementado

- [x] `BizagiApiClient`.
- [x] Bearer token preemitido.
- [x] OAuth `client_credentials` como alternativa.
- [x] `InicioServicio`.
- [x] `HistorialCasos`.
- [x] Create Case correcto de Crédito incorporado.
- [x] Create Case correcto de Afiliaciones incorporado.
- [x] Contratos HTTP con tipos exactos.
- [x] Prueba real preparada y protegida por flag.
- [x] Configuración del ambiente de test preparada.

### Pendiente

- [ ] Ejecutar deliberadamente `@t2-real` cuando se quiera crear casos de prueba.
- [ ] Integrar `modo: servicio` en YAML.
- [ ] Implementar/reutilizar `modo: buscar`.
- [ ] Conectar el número creado con el flujo UI del motor.
- [ ] Ejecutar regresión completa después de esa integración.

---

## 14. Referencias

Bizagi:

- https://help.bizagi.com/platform/en/api_odata_authentication.htm
- https://help.bizagi.com/platform/en/api_odata.htm
- https://help.bizagi.com/platform/en/api_odata_d_processes.htm
- https://help.bizagi.com/platform/en/api_odata_d_userprocesses.htm
- https://help.bizagi.com/platform/en/oauth_apps_options.htm

Playwright:

- https://playwright.dev/docs/api-testing

Fuente funcional de Colsubsidio para esta implementación:

- Create Case de Gestión de Crédito compartido por Iván.
- Create Case de Afiliaciones compartido por Iván.
