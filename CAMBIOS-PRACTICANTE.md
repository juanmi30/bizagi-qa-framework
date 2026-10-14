# CAMBIOS-PRACTICANTE

## T0: onboarding y estado inicial

### Objetivo

Instalar el framework en el equipo asignado, verificar su estado inicial y
comprender cómo un escenario escrito en YAML se transforma en una prueba
automatizada ejecutada con Playwright sobre Bizagi Cloud.

---

### Actividades realizadas

- Se revisó la estructura inicial del framework.
- Se ejecutó `npm install`.
- Se instaló Chromium mediante `npx playwright install chromium`.
- Se creó `projects/demo/.env` a partir de `.env.example`, usando valores
  ficticios porque no se ejecutarán pruebas contra ambientes reales.
- Se ejecutó `npm test -- demo --list`.
- Se ejecutó `npx tsc --noEmit`.
- Se revisaron los documentos de arquitectura, estado del proyecto y
  definiciones del frente Colsubsidio.
- Se realizó un recorrido del núcleo compartido, el runner de escenarios y
  los componentes principales de ejecución.
- No se modificaron archivos existentes del framework.

---

### Resultado del estado cero

El comando:

```bash
npm test -- demo --list
````

identificó correctamente 7 pruebas distribuidas en 4 archivos:

* 1 escenario grabado.
* 3 pruebas directas del proyecto demo.
* 2 escenarios registrados desde plantillas YAML.
* 1 prueba adicional de login incluida en el proyecto.

El comando:

```bash
npx tsc --noEmit
```

terminó sin mensajes de error, por lo que la validación de TypeScript pasó
correctamente.

La copia recibida queda establecida como línea base para comparar los
resultados al finalizar el encargo.

---

### Evidencias

* `evidencias/T0-listado-pruebas.png`
* `evidencias/T0-typecheck.png`

---

### Documentos revisados

#### `README.md`

Se revisó la descripción general del framework, su división entre el núcleo
compartido y las carpetas específicas de cada proyecto, los comandos
disponibles, el modelo de escenarios YAML y el modelo híbrido de plantillas,
pasos personalizados y grabaciones.

Se identificó como regla principal que ningún elemento específico de un
cliente debe incorporarse al núcleo compartido.

#### `RESUMEN-PARA-DISENO.md`

Se revisó el estado actual del framework, incluyendo la implementación y
verificación en vivo realizada para CONPRE, el soporte de formularios,
tablas, fechas, listas personalizadas, esperas de integración y números de
caso.

También se revisaron los pendientes y extensiones previstas para el proyecto
Colsubsidio.

#### `FEEDBACK-CRD-DEFINICIONES.md`

Se revisaron las decisiones de diseño aprobadas para Colsubsidio, incluyendo:

* Login con dominio.
* Pasos híbridos que requieren intervención del analista.
* Campos de tipo archivo.
* Esperas de integración.
* Modos de inicio `bandeja`, `buscar` y `servicio`.
* Uso de la API de Bizagi para crear casos mediante el modo servicio.
* Registro del número de caso creado en el histórico del framework.

El nombre de este archivo es diferente al mencionado en el encargo como
`AJUSTE-PLAN-CRD-FEEDBACK.md`. Sin embargo, el propio documento se presenta
como la referencia de definiciones para el frente Colsubsidio. La diferencia
de nombre queda documentada para futura confirmación.

---

### Archivos principales revisados

#### `package.json`

Define los comandos disponibles en el proyecto. El comando principal de
pruebas es:

```json
"test": "node tools/run.mjs"
```

También incluye comandos para crear proyectos, grabar escenarios, adoptar
grabaciones, abrir reportes y ejecutar el lint.

#### `tools/run.mjs`

Es el punto de entrada para ejecutar un proyecto.

Sus responsabilidades principales son:

1. Recibir el nombre del proyecto.
2. Validar que exista dentro de `projects/`.
3. Cargar el archivo `.env` correspondiente.
4. Interpretar opciones propias del framework, como `--escenario` y
   `--fuente`.
5. Establecer la variable de entorno `PROJECT`.
6. Ejecutar Playwright con los argumentos restantes.

#### `playwright.config.ts`

Configura Playwright según el proyecto indicado en `PROJECT`.

Entre sus responsabilidades se encuentran:

* Seleccionar la carpeta del proyecto como directorio de pruebas.
* Cargar las variables de entorno.
* Definir los archivos que Playwright debe descubrir.
* Configurar tiempos de espera, navegador y reintentos.
* Generar reportes HTML y JUnit.
* Guardar resultados en `test-results/<proyecto>/`.

La configuración utiliza Microsoft Edge mediante el canal `msedge`.

#### `shared/runner/registerScenarios.ts`

Descubre los archivos YAML dentro de la carpeta `scenarios/` del proyecto.

Por cada archivo válido:

1. Carga y valida el escenario.
2. Genera un identificador único para la corrida.
3. Registra una prueba de Playwright.
4. Inicia el motor de Bizagi.
5. Ejecuta los pasos definidos.
6. Captura evidencias.
7. Verifica los hazards o resultados esperados.

Los archivos cuyo nombre empieza por `_` se ignoran porque funcionan como
plantillas de ejemplo.

#### `shared/runner/registerGrabado.ts`

Permite registrar escenarios grabados que ya fueron adoptados formalmente.

El archivo grabado contiene únicamente los pasos específicos del flujo. El
núcleo compartido se encarga del login, la sesión, las evidencias y la
verificación de hazards.

#### `shared/runner/scenarioLoader.ts`

Lee y valida los escenarios YAML.

Valida, entre otros elementos:

* Nombre del proceso.
* Nombre del escenario.
* Etiquetas.
* Configuración de inicio.
* Pasos y actividades.
* Campos y tipos de control.
* Tablas y filas.
* Esperas de integración.
* Hazards.

Cuando encuentra un problema, genera mensajes de error en español dirigidos
a analistas funcionales.

También implementa la sustitución de `${unico}` por un valor basado en la
fecha y hora de la corrida.

#### `shared/runner/BpmEngine.ts`

Orquesta la ejecución general del proceso en Bizagi.

Sus responsabilidades incluyen:

* Iniciar sesión con un usuario lógico definido en el `.env`.
* Crear o abrir un caso.
* Cambiar de usuario cuando cambia la asignación de una actividad.
* Diligenciar formularios.
* Ejecutar pasos personalizados.
* Avanzar actividades.
* Esperar loaders e integraciones.
* Leer y conservar los números que ha tenido el caso.
* Consultar si el caso aparece en la bandeja de un usuario.

#### `shared/core/FormActions.ts`

Centraliza las interacciones con formularios Bizagi.

Incluye soporte para:

* Texto.
* Áreas de texto.
* Números.
* Fechas.
* Listas.
* Búsquedas.
* Radios.
* Checkboxes.
* Tablas y ventanas emergentes.

Los campos se localizan principalmente mediante su etiqueta visible. También
se permite un localizador específico como mecanismo de respaldo para campos
difíciles.

#### `shared/utils/ApiHelpers.ts`

Actualmente contiene un método pendiente para consultar el estado de un caso
mediante API.

El método `getCaseState()` todavía lanza un error indicando que su
implementación depende de definir el endpoint y la autenticación del
ambiente.

No se encontró todavía un método `createCase` implementado en este archivo.

---

## Resumen de arquitectura

El framework está dividido en dos capas. La carpeta `shared/` contiene el
núcleo reutilizable para todos los clientes, mientras que
`projects/<proyecto>/` contiene la URL, usuarios, escenarios, recursos,
objetos y pruebas particulares de cada implementación de Bizagi.

La ejecución comienza con el comando `npm test -- <proyecto>`. El script
`tools/run.mjs` valida que la carpeta del proyecto exista, carga su archivo
`.env`, procesa los filtros propios del framework y ejecuta Playwright
estableciendo la variable `PROJECT`.

`playwright.config.ts` utiliza esa variable para seleccionar la carpeta del
proyecto, sus pruebas y la ubicación de los resultados. Los escenarios del
cliente pueden existir como pruebas directas, grabaciones adoptadas o
archivos YAML.

Para los escenarios YAML, `registerScenarios.ts` busca los archivos dentro de
`projects/<proyecto>/scenarios/`. Cada archivo se envía a
`scenarioLoader.ts`, que interpreta su estructura y valida que contenga el
proceso, el inicio, los pasos y los hazards requeridos. Si la plantilla tiene
errores, el framework registra una prueba fallida con un mensaje explicativo
en español.

Cuando el escenario es válido, se registra una prueba de Playwright. Al
comenzar la corrida se genera un identificador `${unico}`, se crea una
instancia de `BpmEngine` y se inicia la sesión con el usuario lógico definido
en el YAML. La identidad y la contraseña reales se obtienen únicamente desde
el `.env` del proyecto.

`BpmEngine` crea o abre el caso y ejecuta cada paso. Para diligenciar los
formularios delega el trabajo a `FormActions`, que localiza los campos por su
etiqueta visible y aplica la interacción correspondiente según el tipo de
control.

Después de cada acción, el motor espera que Bizagi termine de procesar y
vuelve a leer el número visible del caso. Esto permite conservar los números
del proceso principal y de posibles subprocesos durante la ejecución.

Finalmente, el runner ejecuta los hazards definidos en el YAML, captura las
evidencias y permite que Playwright genere los reportes HTML, JUnit, videos,
capturas y trazas dentro de `test-results/<proyecto>/`.

---

### Hallazgos y diferencias identificadas

#### Modos de inicio

El documento de definiciones de Colsubsidio establece que el inicio debe
aceptar:

```yaml
modo: bandeja | buscar | servicio
```

Sin embargo, el archivo `scenarioLoader.ts` recibido actualmente acepta:

```ts
modo: 'bandeja' | 'crear-caso'
```

Por lo tanto, el código recibido todavía no refleja completamente la
enumeración definida para Colsubsidio.

Esta diferencia no fue corregida durante T0 porque las reglas del encargo
indican que no se deben modificar archivos existentes.

#### Histórico de números de caso

`BpmEngine` conserva los números de caso en un `Set<string>` llamado
`numerosVistos`.

Este registro:

* Existe únicamente en memoria durante la ejecución.
* Permite conservar números de proceso principal y subprocesos.
* No se escribe actualmente en un archivo persistente.
* No incluye fecha, escenario ni estado de depuración.

Este hallazgo debe considerarse al retomar T1 y al implementar el registro
del caso creado mediante el modo servicio.

#### Cliente API

`ApiHelpers.ts` contiene únicamente el método pendiente `getCaseState()`.

No se encontró en la copia recibida un stub específico para `createCase`,
aunque los documentos de diseño mencionan que el modo servicio estaba
diseñado y pendiente de implementación.

Para T2 se desarrollará una pieza nueva y autocontenida, sin modificar este
archivo existente.

---

### Decisiones tomadas durante T0

* No se ejecutó `npm audit fix`, porque podría modificar las versiones de las
  dependencias y alterar el estado original del paquete recibido.
* No se utilizaron credenciales reales.
* No se realizaron conexiones a ambientes reales de Bizagi.
* El `.env` del proyecto demo contiene únicamente valores ficticios.
* No se modificó ningún archivo existente del núcleo, los proyectos o la
  configuración raíz.
* Las diferencias encontradas se documentaron en la bitácora en lugar de
  corregirse directamente.
* T1 se deja aplazada hasta aclarar o construir el mecanismo de histórico
  persistente.
* El siguiente frente de trabajo será T2, comenzando por la investigación de
  la API oficial de Bizagi y el análisis de las colecciones compartidas por
  Iván.

---

### Archivos creados durante T0

#### `CAMBIOS-PRACTICANTE.md`

Bitácora obligatoria del encargo. Contiene las actividades realizadas,
decisiones, evidencias, hallazgos y dudas abiertas.

#### `projects/demo/.env`

Copia local de `.env.example` con valores ficticios. Este archivo no debe
subirse al repositorio ni incluir credenciales reales.

#### `evidencias/T0-listado-pruebas.png`

Pantallazo del comando `npm test -- demo --list`.

#### `evidencias/T0-typecheck.png`

Pantallazo del comando `npx tsc --noEmit`.

---

### Dudas abiertas

* Confirmar si `FEEDBACK-CRD-DEFINICIONES.md` corresponde oficialmente al
  documento llamado `AJUSTE-PLAN-CRD-FEEDBACK.md` en el encargo.
* Confirmar el punto exacto de integración del futuro modo
  `inicio.modo: servicio` con el motor.
* Confirmar cómo debe persistirse el histórico de números de caso sin
  modificar directamente el motor actual.
* Confirmar si el modo anterior `crear-caso` debe conservarse por
  compatibilidad o migrarse a la nueva enumeración.
* Confirmar si el futuro cliente API debe integrarse con `ApiHelpers` o
  mantenerse como un módulo independiente.

---

### Estado de T0

* [x] Dependencias instaladas.
* [x] Navegador instalado.
* [x] Proyecto demo configurado localmente.
* [x] `npm test -- demo --list` ejecutado correctamente.
* [x] `npx tsc --noEmit` ejecutado correctamente.
* [x] Evidencias registradas.
* [x] Documentación obligatoria revisada.
* [x] Núcleo compartido y runner recorridos.
* [x] Resumen de arquitectura elaborado.
* [x] Hallazgos y dudas abiertas documentados.
* [x] No se modificaron archivos existentes.

**Resultado:** T0 completada. El framework se encuentra instalado, su estado
cero quedó verificado y su arquitectura general fue comprendida y
documentada.

## 5 de agosto de 2026 — Ajuste del orden de ejecución

Después de completar T0, se continuará con T2 y se dejará T1 temporalmente
pendiente.

La decisión se toma debido a que T2 es la tarea principal del encargo y se
cuenta con insumos concretos compartidos por Iván para investigar e
implementar la creación de casos mediante la API OData de Bizagi.

T1 se retomará posteriormente. Durante la revisión inicial se identificó que
el histórico actual de números de caso se conserva únicamente en memoria
dentro de `BpmEngine` y no existe todavía como un archivo persistente con
fecha, escenario y estado de depuración.

Este cambio corresponde únicamente al orden de ejecución y no modifica el
alcance ni los criterios de aceptación de las tareas.


## 5 de agosto de 2026 — T2.1: investigación del modo servicio

### Objetivo

Investigar cómo crear casos de Bizagi por API para preparar el futuro:

```yaml
inicio:
  modo: servicio
```

La investigación técnica tomó como referencia la documentación oficial de Bizagi para OData/OAuth. Las primeras colecciones de Postman compartidas durante esta fase se utilizaron únicamente como material exploratorio; posteriormente Iván confirmó que no correspondían a los Create Case correctos para la implementación y quedaron reemplazadas por los insumos específicos recibidos después.

### Contrato técnico identificado

La creación de un caso se realiza mediante:

```http
POST {BIZAGI_API_URL}/odata/data/processes({PROCESS_ID})/start
Authorization: Bearer {token}
Content-Type: application/json
```

con:

```json
{
  "startParameters": [
    {
      "xpath": "M_Proceso.Campo",
      "value": "valor"
    }
  ]
}
```

El cliente debe extraer el número de caso desde `response.value`.

### Autenticación investigada

Se documentó OAuth `client_credentials` como mecanismo soportado por Bizagi:

```http
POST {BIZAGI_API_URL}/oauth2/server/token
```

con:

```text
grant_type=client_credentials&scope=api
```

Esta alternativa se conservó en el cliente, pero el ambiente de pruebas entregado posteriormente por Colsubsidio utiliza un Bearer token preemitido.

### Fuentes oficiales

- https://help.bizagi.com/platform/en/api_odata_authentication.htm
- https://help.bizagi.com/platform/en/api_odata.htm
- https://help.bizagi.com/platform/en/api_odata_d_processes.htm
- https://help.bizagi.com/platform/en/api_odata_d_userprocesses.htm
- https://help.bizagi.com/platform/en/oauth_apps_options.htm
- https://help.bizagi.com/platform/en/createcasesasstring.htm

### Resultado T2.1

- [x] OData investigado.
- [x] Endpoint Create Case identificado.
- [x] Estructura `startParameters` documentada.
- [x] OAuth `client_credentials` investigado como alternativa.
- [x] SOAP documentado únicamente como alternativa heredada.

---

## 6 de agosto de 2026 — T2.2: `BizagiApiClient`

### Archivo creado

```text
shared/utils/BizagiApiClient.ts
```

Se implementó un cliente independiente encargado de:

- resolver la autenticación;
- crear casos mediante OData;
- conservar el token únicamente en memoria;
- serializar `startParameters` sin alterar sus tipos;
- aplicar timeout configurable;
- devolver el número de caso como string;
- presentar errores comprensibles en español.

### Configuración

Inicialmente se implementó OAuth `client_credentials`. Después de recibir los Create Case correctos, el cliente se ajustó para soportar también:

```env
BIZAGI_API_TOKEN=
```

La prioridad actual es:

```text
BIZAGI_API_TOKEN
        ↓ si no existe
BIZAGI_API_CLIENT_ID + BIZAGI_API_SECRET
```

De esta forma el mismo cliente soporta el ambiente de pruebas actual y una posible aplicación OAuth futura.

### Pruebas genéricas

Archivo:

```text
projects/demo/tests/bizagi-api-client.spec.ts
```

La cobertura actual valida:

- Bearer token preemitido sin llamada OAuth;
- OAuth `client_credentials` como alternativa;
- creación exitosa;
- endpoint, método, Authorization y Content-Type;
- body `startParameters`;
- autenticación faltante;
- OAuth incompleto;
- autenticación OAuth rechazada;
- proceso inexistente;
- respuesta sin número de caso;
- timeout;
- GUID vacío.

---

## 6 de agosto de 2026 — T2.3: inicio por servicio e histórico

### Archivos creados

```text
shared/core/InicioServicio.ts
shared/utils/HistorialCasos.ts
```

`InicioServicio` coordina:

```text
crear caso
 ↓
obtener número
 ↓
registrar histórico
 ↓
devolver número
```

`HistorialCasos` persiste en:

```text
test-results/<proyecto>/historico-casos.json
```

Cada registro contiene:

- número de caso;
- fecha y hora;
- escenario;
- modo de creación;
- estado de depuración.

Si el caso fue creado pero falla la escritura local, se informa el número ya creado y se evita recomendar un reintento automático.

### Pruebas

Archivo:

```text
projects/demo/tests/inicio-servicio.spec.ts
```

Cobertura:

- histórico inexistente;
- registro persistente;
- conservación de registros anteriores;
- JSON dañado;
- coordinación cliente/histórico;
- escenario ausente;
- falla de persistencia posterior a la creación;
- integración con archivo temporal real.

---

## 12 de agosto de 2026 — T2.4: contratos específicos de Create Case

Iván entregó Create Case específicos para:

- Gestión de Crédito;
- Afiliaciones.

A partir de estos insumos se comprobó que el cliente debe conservar los tipos originales de cada `value`.

Ejemplos relevantes:

```json
{ "xpath": "...bModificarAgencia", "value": "false" }
{ "xpath": "...ksCreadorCaso", "value": 1 }
{ "xpath": "...bAceptaTratamientoDatos", "value": true }
```

Esto confirmó que `ParametroInicioBizagi.value` no debe limitarse a `string`.

Durante esta etapa se construyeron inicialmente fixtures de contrato y se verificó que los parámetros terminaran exactamente dentro de `startParameters`.

---

## 13 de agosto de 2026 — Corrección con insumos definitivos de Iván

### Aclaración recibida

Iván confirmó que:

1. Los primeros Postman compartidos no eran la fuente correcta para implementar Create Case.
2. Los dos Create Case entregados posteriormente son los correctos y contienen la información necesaria para continuar.
3. La URL, el Bearer token y los datos corresponden a un ambiente de pruebas autorizado para este trabajo.

Por tanto, cualquier conclusión anterior basada funcionalmente en las primeras colecciones queda reemplazada por esta actualización.

### Ambiente confirmado

```text
https://test-procesosdigitales-colsubsidio.bizagi.com
```

### Process IDs confirmados

Gestión de Crédito:

```text
0188d3ec-f208-4653-be77-788fc76e370c
```

Afiliaciones:

```text
d5e224d0-4f05-4ebb-9a61-f4cafdc9ed63
```

### Recursos definitivos incorporados

Los datos específicos de Colsubsidio se trasladaron al proyecto correspondiente en lugar de mantenerlos dentro de `demo`:

```text
projects/colsubsidio/resources/create-case/
├── credito.json
├── afiliaciones.json
└── README.md
```

Los recursos conservan:

- URL del ambiente test;
- process ID correcto;
- todos los XPaths;
- valores suministrados por el equipo;
- tipos de datos originales.

Los antiguos fixtures específicos dentro de `projects/demo/resources/mocks/` se retiraron para evitar mantener datos de Colsubsidio dentro del proyecto demo.

También se retiraron las pruebas exploratorias:

```text
projects/demo/tests/insumo-ivan.spec.ts
projects/demo/tests/contrato-ivan.spec.ts
```

Su cobertura fue reemplazada por una prueba específica dentro de Colsubsidio.

### Autenticación corregida

Los Create Case correctos utilizan directamente:

```http
Authorization: Bearer <token>
```

Por esta razón `BizagiApiClient.autenticar()` se ajustó para usar `BIZAGI_API_TOKEN` cuando está configurado, sin ejecutar una llamada innecesaria a `/oauth2/server/token`.

OAuth `client_credentials` se conserva como alternativa para un ambiente futuro que suministre Client ID y Client Secret.

### Configuración local

Se preparó:

```text
projects/colsubsidio/.env
```

con la configuración del ambiente de pruebas suministrado por el equipo.

El archivo está cubierto por:

```gitignore
projects/**/.env
```

También se actualizó:

```text
projects/colsubsidio/.env.example
```

para documentar:

```text
BIZAGI_API_URL
BIZAGI_API_TOKEN
BIZAGI_API_TIMEOUT_MS
BIZAGI_PROCESS_ID_CREDITO
BIZAGI_PROCESS_ID_AFILIACIONES
BIZAGI_RUN_REAL_API
```

### Contratos específicos sin red

Se agregó:

```text
projects/colsubsidio/tests/contrato-create-case.spec.ts
```

La prueba ejecuta dos contratos:

```text
Gestión de Crédito
Afiliaciones
```

Utiliza `BizagiApiClient` real y únicamente sustituye la red mediante un `fetch` controlado.

Valida:

- URL exacta construida con el process ID;
- método `POST`;
- Bearer Authorization;
- `Content-Type: application/json`;
- body con `startParameters` exactos;
- preservación de tipos (`true !== "true"`, `1 !== "1"`);
- lectura de `response.value`.

### Prueba real preparada

Se agregó:

```text
projects/colsubsidio/tests/servicio-create-case.real.spec.ts
```

Esta prueba utiliza:

```text
InicioServicio REAL
 ↓
BizagiApiClient REAL
 ↓
fetch REAL
 ↓
ambiente test Colsubsidio
 ↓
número real de caso
 ↓
HistorialCasos REAL
```

Como crea casos en el ambiente de pruebas, está deshabilitada por defecto y exige:

```text
BIZAGI_RUN_REAL_API=true
```

Ejecución en PowerShell:

```powershell
$env:BIZAGI_RUN_REAL_API="true"
npm test -- colsubsidio --grep "@t2-real"
```

Se contemplan overrides opcionales para repetir la prueba con datos nuevos sin editar los recursos:

```text
BIZAGI_CREDITO_NUMERO_IDENTIFICACION
BIZAGI_AFILIACIONES_NUMERO_IDENTIFICACION
BIZAGI_AFILIACIONES_CORREO
```

### Verificación técnica final

Las pruebas de T2 quedan separadas de manera intencional:

```text
projects/demo
  @t2-api       -> cliente genérico
  @t2-servicio  -> inicio + histórico

projects/colsubsidio
  @t2-contrato  -> contrato exacto de Crédito y Afiliaciones
  @t2-real      -> llamada real opt-in al ambiente test
```

Comandos de verificación sin crear casos reales:

```bash
npm test -- demo --grep "@t2-"
npm test -- colsubsidio --grep "@t2-contrato"
npx tsc --noEmit
```

Resultados obtenidos sobre la copia corregida:

```text
projects/demo @t2-        -> 18 passed
colsubsidio @t2-contrato -> 2 passed
TypeScript                -> sin errores
```

La prueba real se verificó también con el flag deshabilitado:

```text
colsubsidio @t2-real -> 2 skipped
```

Esto confirma que la protección evita crear casos por accidente.

Se intentó además una ejecución real desde el entorno aislado usado para revisar el paquete. Dicho entorno no pudo resolver por DNS `test-procesosdigitales-colsubsidio.bizagi.com`, por lo que la solicitud no llegó al servidor y no se creó ningún caso. Esta limitación corresponde al entorno de revisión y no constituye un fallo del contrato ni del ambiente de Colsubsidio. La prueba real queda preparada para ejecutarse desde el equipo/red autorizada mediante el flag indicado anteriormente.

### Documentación actualizada

Se reescribió:

```text
docs/MODO-SERVICIO.md
```

para reflejar exclusivamente el estado vigente:

- primeras colecciones reemplazadas;
- ambiente test confirmado;
- Bearer token como autenticación actual;
- OAuth como alternativa;
- process IDs correctos;
- recursos específicos bajo `projects/colsubsidio/`;
- contratos sin red;
- prueba real opt-in;
- integración con YAML/motor aún pendiente.

### Estado actual de T2

- [x] Create Case de Gestión de Crédito incorporado con datos correctos.
- [x] Create Case de Afiliaciones incorporado con datos correctos.
- [x] Bearer token soportado por `BizagiApiClient`.
- [x] OAuth `client_credentials` conservado como alternativa.
- [x] Contratos específicos de ambos procesos preparados.
- [x] Datos específicos movidos al proyecto Colsubsidio.
- [x] `.env` de test preparado.
- [x] Prueba real preparada y protegida por flag.
- [x] Histórico persistente disponible.
- [x] Documentación corregida.
- [ ] Ejecutar `@t2-real` cuando se decida crear casos de prueba.
- [ ] Integrar `inicio.modo: servicio` con `scenarioLoader.ts` y `BpmEngine.ts`.
- [ ] Implementar/reutilizar `modo: buscar` para abrir el caso creado y continuar por UI.

**Resultado:** T2 queda corregida y alineada con los Create Case definitivos entregados por Iván. La pieza API puede validarse contra el ambiente de pruebas de forma explícita, mientras la integración con el flujo YAML/UI continúa como siguiente decisión de arquitectura.

## 18 de agosto de 2026 — T1: herramienta de depuración de casos de prueba

### Objetivo

Implementar una herramienta que permita consultar los casos creados por la automatización y llevar control de cuáles requieren depuración manual.

La herramienta no elimina, cierra ni modifica casos directamente en Bizagi. Su propósito es únicamente generar un reporte para el analista y mantener el estado local de depuración.

---

### Contexto encontrado en el framework

Durante T0 se identificó que `BpmEngine` conserva durante la ejecución los números visibles del caso mediante:

```ts
numeroCasoActual()
```

y el conjunto:

```ts
numerosVistos
```

Este mecanismo original conserva los números únicamente en memoria durante la ejecución.

Posteriormente, como parte de T2, se implementó:

```text
shared/utils/HistorialCasos.ts
```

que persiste los casos creados mediante servicio en:

```text
test-results/<proyecto>/historico-casos.json
```

Este histórico contiene:

* Número de caso.
* Fecha y hora.
* Escenario.
* Modo de creación.
* Estado de depuración.

T1 reutiliza este mismo archivo como fuente de información, evitando mantener dos históricos diferentes.

---

### Archivo creado: `tools/depurar.mjs`

Se implementó una herramienta de línea de comandos que:

1. Recibe el nombre de un proyecto.
2. Valida que el proyecto exista dentro de `projects/`.
3. Busca:

```text
test-results/<proyecto>/historico-casos.json
```

4. Lee y valida el histórico.
5. Genera:

```text
test-results/<proyecto>/casos-creados.md
```

6. Permite marcar uno o varios casos como depurados.
7. Actualiza el histórico persistente.
8. Regenera automáticamente el reporte con el nuevo estado.

---

### Reporte generado

El comando:

```bash
npm run depurar -- <proyecto>
```

genera un archivo Markdown con las columnas:

```text
Número de caso
Fecha-hora
Escenario
Estado
```

Los estados permitidos son:

```text
Pendiente de depurar
Depurado
```

Los casos nuevos se consideran por defecto:

```text
Pendiente de depurar
```

También se agregaron al final del reporte los siguientes conteos:

```text
Total de casos
Pendientes de depurar
Depurados
```

Estos conteos no eran obligatorios para T1, pero facilitan la lectura del reporte por parte del analista.

---

### Ejemplo del reporte

Ruta:

```text
test-results/colsubsidio/casos-creados.md
```

Estructura:

```md
# Casos creados — colsubsidio

Reporte de casos creados por la automatización.

> Este reporte no elimina ni cierra casos en Bizagi. La depuración física debe realizarla un analista.

| Número de caso | Fecha-hora | Escenario | Estado |
|---|---|---|---|
| 294922 | 2026-08-13T20:10:12.567Z | CRD - Create Case API real | Depurado |
| 294924 | 2026-08-13T20:10:13.790Z | AFI - Create Case API real | Depurado |
| ... | ... | ... | Pendiente de depurar |

Total de casos: 8

Pendientes de depurar: 6

Depurados: 2
```

Los casos utilizados para esta verificación provienen de ejecuciones reales del Create Case realizadas durante T2 sobre el ambiente test de Colsubsidio.

---

### Opción `--marcar`

La herramienta permite actualizar el estado de uno o varios casos.

Ejemplo:

```bash
npm run depurar -- colsubsidio --marcar 294922
```

También soporta varios números separados por coma:

```bash
npm run depurar -- colsubsidio --marcar 294922,294924
```

Antes de realizar la actualización, la herramienta comprueba que todos los números solicitados existan en el histórico.

Si alguno no existe, la operación falla completamente y el histórico no se modifica parcialmente.

---

### Compatibilidad con argumentos enviados por npm

Durante la prueba manual se detectó que, en el ambiente utilizado, npm podía transformar:

```bash
npm run depurar -- colsubsidio --marcar 294924
```

en una ejecución equivalente a:

```text
node tools/depurar.mjs colsubsidio 294924
```

es decir, `--marcar` no llegaba al proceso Node.

Para evitar que el comportamiento dependa de la versión o forma de ejecución de npm, se ajustó `leerArgumentos()` para aceptar ambas formas:

```text
node tools/depurar.mjs colsubsidio --marcar 294924
```

y:

```text
node tools/depurar.mjs colsubsidio 294924
```

Ejecutar únicamente:

```text
node tools/depurar.mjs colsubsidio
```

continúa generando el reporte sin modificar ningún estado.

Esta compatibilidad quedó cubierta también mediante una prueba automatizada de regresión.

---

### Integración en `package.json`

Inicialmente se evitó modificar `package.json` debido a la regla general del encargo de no modificar archivos existentes sin revisión.

Posteriormente se confirmó con Iván que podía realizarse el ajuste mínimo necesario para habilitar exactamente el comando solicitado por T1.

Se agregó únicamente:

```json
"depurar": "node tools/depurar.mjs"
```

Con esto la interfaz final de la herramienta es:

```bash
npm run depurar -- <proyecto>
```

y:

```bash
npm run depurar -- <proyecto> --marcar <caso1,caso2>
```

No se modificaron dependencias ni otras configuraciones de `package.json`.

---

### Manejo de errores

La herramienta presenta mensajes en español y evita mostrar stack traces crudos al usuario.

Se manejan explícitamente los siguientes escenarios:

#### Proyecto inexistente

Ejemplo:

```text
El proyecto "proyecto-inexistente" no existe dentro de projects/.
```

#### Histórico inexistente

Ejemplo:

```text
No existe un histórico de casos para el proyecto "demo".
```

#### Histórico vacío

Se informa que no hay casos creados para reportar.

#### JSON inválido

Se informa que el histórico no contiene un JSON válido.

#### Número de caso inexistente

Ejemplo:

```text
No se encontraron los siguientes números de caso en el histórico: 999999.
```

La actualización no se realiza parcialmente si existe un número inválido.

---

### Archivo creado: `projects/demo/tests/depurar-casos.spec.ts`

Se implementaron pruebas automatizadas utilizando proyectos e históricos temporales.

Las pruebas no modifican el histórico real de Colsubsidio.

Casos cubiertos:

1. Generación correcta de `casos-creados.md`.
2. Confirmación de que generar el reporte no modifica el histórico.
3. Marcado de varios casos como depurados.
4. Compatibilidad con la variante donde npm no reenvía `--marcar`.
5. Proyecto inexistente.
6. Histórico inexistente.
7. Número de caso inexistente sin modificación parcial del histórico.

La batería también valida:

* Código de salida correcto.
* Mensajes en español.
* Contenido del reporte.
* Persistencia de estados.

---

### Validación manual

Se verificó primero:

```bash
npm run depurar -- colsubsidio
```

La herramienta encontró ocho casos registrados y generó correctamente:

```text
test-results/colsubsidio/casos-creados.md
```

Posteriormente se utilizó la función de marcado y se confirmó que los estados se actualizaran tanto en:

```text
historico-casos.json
```

como en:

```text
casos-creados.md
```

Después de las verificaciones realizadas, el reporte mostraba:

```text
Casos totales: 8
Pendientes de depurar: 6
Depurados: 2
```

---

### Relación entre T1 y T2

El flujo actual queda integrado de la siguiente manera:

```text
T2
Create Case
     ↓
Bizagi devuelve número
     ↓
InicioServicio
     ↓
HistorialCasos
     ↓
historico-casos.json
     ↓

T1
npm run depurar
     ↓
casos-creados.md
     ↓
analista realiza depuración física
     ↓
--marcar
     ↓
estado = Depurado
```

De esta manera T1 y T2 reutilizan el mismo histórico persistente.

---

### Decisiones tomadas

* No se implementó ninguna operación que cierre o elimine casos de Bizagi.
* La depuración física continúa siendo responsabilidad de un analista.
* El histórico es la fuente de verdad del estado de depuración.
* El reporte Markdown se puede regenerar en cualquier momento.
* La operación de marcado valida todos los números antes de escribir.
* Se agregó compatibilidad para dos formas de recepción de argumentos.
* Las pruebas automatizadas utilizan directorios temporales.
* No se utilizan casos reales para las pruebas automatizadas.
* Se modificó `package.json` únicamente para agregar el script `depurar`, después de confirmar el cambio con Iván.

---

### Archivos asociados a T1

#### Nuevo

```text
tools/depurar.mjs
projects/demo/tests/depurar-casos.spec.ts
```

#### Generado en ejecución

```text
test-results/<proyecto>/casos-creados.md
```

#### Reutilizado de T2

```text
test-results/<proyecto>/historico-casos.json
shared/utils/HistorialCasos.ts
```

#### Modificado con autorización

```text
package.json
```

Cambio:

```json
"depurar": "node tools/depurar.mjs"
```

---

### Estado de T1

* [x] Comando `npm run depurar -- <proyecto>`.
* [x] Lectura del histórico persistente.
* [x] Reporte `casos-creados.md`.
* [x] Número de caso.
* [x] Fecha-hora.
* [x] Escenario.
* [x] Estado de depuración.
* [x] Estado por defecto `Pendiente de depurar`.
* [x] Opción `--marcar`.
* [x] Marcado de múltiples casos.
* [x] Persistencia del estado.
* [x] Regeneración del reporte.
* [x] Proyecto inexistente.
* [x] Histórico inexistente.
* [x] Histórico vacío.
* [x] Número inexistente.
* [x] Mensajes en español.
* [x] Sin stack traces crudos.
* [x] Pruebas automatizadas.
* [x] Compatibilidad de argumentos npm.
* [x] Validación manual con histórico de Colsubsidio.
* [x] No se cierran ni eliminan casos en Bizagi.

**Resultado:** T1 completada. La herramienta permite identificar los casos creados por la automatización, generar un reporte de depuración y mantener el control de los casos ya atendidos sin modificar directamente los casos existentes en Bizagi.

## 19 de agosto de 2026 — T3: validador previo de escenarios YAML

### Objetivo

Implementar una herramienta de validación previa para escenarios YAML que permita
detectar errores de estructura, configuración y referencias antes de ejecutar
Playwright.

El objetivo principal es evitar ejecuciones innecesarias cuando el escenario ya
contiene errores que pueden identificarse de forma estática.

El comando final implementado es:

```bash
npm run validar -- <proyecto>
````

También permite validar un escenario específico:

```bash
npm run validar -- <proyecto> <escenario.yaml>
```

y todos los escenarios explícitamente:

```bash
npm run validar -- <proyecto> --todos
```

---

### Análisis previo

Se revisó `shared/runner/scenarioLoader.ts` para identificar la estructura que
actualmente acepta el framework.

El loader existente ya valida elementos como:

* `proceso`
* `escenario`
* `etiquetas`
* bloque `inicio`
* `inicio.modo`
* `inicio.usuario`
* `inicio.proceso_a_crear`
* lista de `pasos`
* `actividad`
* campos de `llenar`
* tablas y filas
* esperas de integración
* hazards

También se revisó `BpmEngine.ts` para identificar la forma real en que el
framework resuelve usuarios lógicos desde las variables de entorno:

```text
USUARIO_<clave>
CLAVE_<clave>
BIZAGI_QUICK_USER
BIZAGI_PASSWORD
```

`FormActions.ts` fue utilizado como referencia para conocer los tipos de controles
que actualmente entiende el framework.

No se modificaron `scenarioLoader.ts`, `BpmEngine.ts` ni `FormActions.ts` como
parte de T3.

---

### Archivo creado: `tools/validar.mjs`

Se creó una utilidad independiente para validar archivos YAML sin iniciar
Playwright ni conectarse a Bizagi.

La herramienta utiliza `js-yaml` para cargar los escenarios y acumula todos los
problemas encontrados antes de finalizar.

La validación cubre cuatro áreas principales:

#### 1. Estructura del escenario

Se validan los bloques principales y sus tipos esperados.

Ejemplos:

* `proceso` y `escenario` deben contener texto.
* `inicio` debe existir.
* `inicio.modo` debe ser válido.
* `inicio.usuario` debe estar definido.
* `crear-caso` requiere `proceso_a_crear`.
* `pasos` debe ser una lista con al menos un elemento.
* cada paso debe contener `actividad`.
* `hazards` debe contener al menos una verificación.
* tablas, filas y campos deben conservar la estructura esperada.

El validador acumula los errores encontrados y no se detiene en el primero.

---

#### 2. Validación de tipos de controles

Se definió un catálogo de tipos admitidos:

```text
texto
área de texto
area de texto
fecha
número
numero
lista
búsqueda
busqueda
radio
checkbox
archivo
combo-escribible
```

Para tipos desconocidos se implementó una sugerencia basada en distancia de
edición.

Ejemplo:

```text
tipo "busquda" no existe.
¿Quisiste decir "búsqueda"?
```

La sugerencia se implementó sin agregar nuevas dependencias al proyecto.

Los tipos `archivo` y `combo-escribible` se reconocen como parte del catálogo
definido para el frente, pero actualmente se muestra una advertencia indicando
que la copia actual de `scenarioLoader` / `FormActions` todavía no implementa
completamente su ejecución.

Las advertencias no cambian el código de salida del comando.

---

#### 3. Validación de usuarios

Los usuarios utilizados en:

```text
inicio.usuario
pasos[].usuario
hazards[].asignado_a
hazards[].el_caso_ya_no_esta_en_bandeja_de
```

se comparan contra las variables declaradas en:

```text
projects/<proyecto>/.env
projects/<proyecto>/.env.example
```

La configuración principal buscada es:

```text
USUARIO_<clave>
```

También se contempla `BIZAGI_QUICK_USER` como fallback del motor.

Para login estándar se verifica además que exista:

```text
CLAVE_<clave>
```

o el fallback global:

```text
BIZAGI_PASSWORD
```

Los valores de credenciales nunca se imprimen en consola.

---

#### 4. Validación de archivos en `resources/`

Para campos declarados como:

```yaml
tipo: archivo
```

se comprueba que el archivo indicado en `valor` exista dentro de:

```text
projects/<proyecto>/resources/
```

Se admiten rutas relativas como:

```text
documentos/cedula.pdf
```

y también referencias que incluyan el prefijo:

```text
resources/documentos/cedula.pdf
```

La herramienta impide resolver rutas que salgan de `resources/` mediante `../`.

---

### Ubicación de errores

Cuando es posible, la salida incluye el número de línea aproximado del YAML y la
ruta lógica del campo.

Ejemplo:

```text
línea 18 — pasos[0].llenar[2].tipo:
tipo "busquda" no existe. ¿Quisiste decir "búsqueda"?
```

Para campos completamente ausentes no siempre existe una línea física que pueda
señalarse, por lo que en esos casos se reporta directamente el bloque o posición
correspondiente.

---

### Validación de todos los escenarios

Ejecutar:

```bash
npm run validar -- colsubsidio
```

valida todos los escenarios ejecutables encontrados dentro de:

```text
projects/colsubsidio/scenarios/
```

También puede utilizarse:

```bash
npm run validar -- colsubsidio --todos
```

Los archivos cuyo nombre comienza por `_` se ignoran por considerarse ejemplos o
plantillas.

La herramienta procesa todos los YAML y presenta un resumen final.

Ejemplo:

```text
Escenarios revisados: 3
Válidos: 1
Con errores: 2
Problemas encontrados: 5
```

---

### Código de salida

El comando utiliza códigos de salida compatibles con ejecución desde pipeline:

```text
0 = todos los escenarios validados correctamente
1 = se encontró al menos un problema
```

Esto permite que la herramienta pueda utilizarse posteriormente como validación
previa dentro de CI/CD.

---

### Compatibilidad con ejecución mediante npm

Durante T1 se había identificado que npm podía consumir algunos argumentos con
prefijo `--`.

Por esta razón T3 se diseñó para que estas dos formas sean equivalentes:

```bash
npm run validar -- <proyecto>
npm run validar -- <proyecto> --todos
```

Ambas validan todos los escenarios del proyecto.

Un segundo argumento terminado en `.yaml` o `.yml` se interpreta como validación
de un escenario específico.

---

### Soporte para pruebas aisladas

Se agregó la variable:

```text
VALIDAR_BASE_DIR
```

para que las pruebas automatizadas puedan crear proyectos temporales y ejecutar
el validador sin modificar los proyectos reales `demo` o `colsubsidio`.

En ejecución normal, si esta variable no existe, la herramienta utiliza el
directorio actual del framework.

---

### Fixtures de prueba

Se crearon escenarios específicos para validar diferentes condiciones:

```text
projects/demo/tests/fixtures/validar/
├── valido.yaml
├── invalido-estructura.yaml
├── invalido-tipo.yaml
├── invalido-usuario.yaml
├── invalido-recurso.yaml
└── invalido-multiples.yaml
```

Los escenarios inválidos cubren errores independientes de:

* estructura;
* tipos de controles;
* usuarios;
* recursos inexistentes;
* múltiples problemas simultáneos.

---

### Pruebas automatizadas

Se creó:

```text
projects/demo/tests/validar-yaml.spec.ts
```

La batería contiene 8 pruebas:

1. Acepta un escenario válido.
2. Detecta errores estructurales.
3. Sugiere el tipo más parecido ante un typo.
4. Detecta un usuario no declarado en el `.env`.
5. Detecta un archivo inexistente dentro de `resources/`.
6. Muestra múltiples errores del mismo YAML sin detenerse en el primero.
7. Valida todos los escenarios del proyecto y acumula resultados.
8. Permite validar todos los escenarios sin necesidad de indicar `--todos`.

Ejecución:

```bash
npm test -- demo --grep "@t3-validar"
```

Resultado:

```text
8 passed
```

Durante las pruebas se detectó además una diferencia semántica en el mensaje
final cuando un proyecto tenía un solo escenario. El comando utilizaba la
cantidad de archivos para decidir entre:

```text
El escenario es válido.
```

y:

```text
Todos los escenarios son válidos.
```

Se corrigió para utilizar el modo de ejecución solicitado por el usuario en
lugar de la cantidad de escenarios encontrada.

---

### Integración en `package.json`

Se agregó únicamente:

```json
"validar": "node tools/validar.mjs"
```

permitiendo utilizar la interfaz final:

```bash
npm run validar -- <proyecto>
```

No se agregaron nuevas dependencias.

---

### Validación sobre Colsubsidio

Se ejecutó:

```bash
npm run validar -- colsubsidio
```

La herramienta encontró un escenario:

```text
crd-c1-crear-caso.yaml
```

y detectó el siguiente problema real:

```text
línea 7 — inicio.usuario:
el usuario lógico "admin" no tiene la variable "USUARIO_admin"
y tampoco existe "BIZAGI_QUICK_USER" en .env ni .env.example.
```

Resultado:

```text
Escenarios revisados: 1
Válidos: 0
Con errores: 1
Problemas encontrados: 1

Validación fallida.
```

El proceso terminó con código:

```text
1
```

Este hallazgo no fue corregido artificialmente para obtener una validación en
verde, ya que representa precisamente el tipo de inconsistencia que T3 busca
detectar antes de ejecutar Playwright.

---

### Archivos asociados a T3

#### Nuevos

```text
tools/validar.mjs
projects/demo/tests/validar-yaml.spec.ts
projects/demo/tests/fixtures/validar/valido.yaml
projects/demo/tests/fixtures/validar/invalido-estructura.yaml
projects/demo/tests/fixtures/validar/invalido-tipo.yaml
projects/demo/tests/fixtures/validar/invalido-usuario.yaml
projects/demo/tests/fixtures/validar/invalido-recurso.yaml
projects/demo/tests/fixtures/validar/invalido-multiples.yaml
```

#### Modificado

```text
package.json
```

Cambio:

```json
"validar": "node tools/validar.mjs"
```

#### Revisados como referencia

```text
shared/runner/scenarioLoader.ts
shared/runner/BpmEngine.ts
shared/core/FormActions.ts
tsconfig.json
```

---

### Decisiones tomadas

* T3 no ejecuta Playwright.
* T3 no realiza llamadas a Bizagi.
* Se mantiene separado del runner existente.
* No se modificó `scenarioLoader.ts`.
* Se validan todos los errores posibles antes de finalizar.
* Los errores generan exit code `1`.
* Las advertencias no generan exit code `1`.
* No se imprimen credenciales.
* Las pruebas utilizan proyectos temporales.
* Se evita modificar escenarios reales durante las pruebas.
* Los tipos desconocidos pueden recibir sugerencias automáticas.
* `archivo` y `combo-escribible` se reconocen como catálogo aprobado, pero su
  estado actual de ejecución se informa mediante advertencia.
* Los hallazgos reales del proyecto no se modifican únicamente para obtener una
  validación exitosa.

---

### Estado de T3

* [x] Comando `npm run validar -- <proyecto>`.
* [x] Validación de escenario individual.
* [x] Validación de todos los escenarios.
* [x] Validación de sintaxis YAML.
* [x] Validación estructural.
* [x] Validación de tipos de control.
* [x] Sugerencias ante tipos desconocidos.
* [x] Validación de usuarios contra configuración.
* [x] Validación de archivos en `resources/`.
* [x] Acumulación de múltiples errores.
* [x] Línea del error cuando es posible.
* [x] Mensajes comprensibles en español.
* [x] Exit code `0` cuando todo es válido.
* [x] Exit code `1` cuando existen problemas.
* [x] Ejecución apta para futura integración en pipeline.
* [x] Pruebas automatizadas.
* [x] 1 fixture válido y 5 fixtures inválidos.
* [x] 8/8 pruebas automatizadas en verde.
* [x] Validación sobre escenario real de Colsubsidio.

**Resultado:** T3 completada. El framework dispone ahora de una validación
estática previa que permite detectar errores frecuentes en escenarios YAML antes
de iniciar Playwright.

## 20 de agosto de 2026 — T4: reporte ejecutivo de resultados

### Objetivo

Implementar una herramienta que permita generar un resumen ejecutivo en español
a partir de la última corrida de pruebas de un proyecto.

El propósito es ofrecer una vista rápida de los resultados sin necesidad de
abrir directamente el reporte HTML de Playwright o revisar manualmente el XML
JUnit.

El comando final implementado es:

```bash
npm run resumen -- <proyecto>
````

Ejemplo:

```bash
npm run resumen -- demo
```

El resultado se genera en:

```text
test-results/<proyecto>/resumen-ejecutivo.md
```

---

### Análisis previo

Se revisó el archivo JUnit real generado por Playwright en:

```text
test-results/<proyecto>/junit/results.xml
```

Se confirmó que la configuración actual del framework sobrescribe esta ruta en
cada ejecución, por lo que el archivo representa naturalmente la corrida más
reciente del proyecto.

En el JUnit real se identificaron, entre otros, los siguientes datos:

* Número total de tests.
* Tiempo total de la corrida.
* Timestamp de inicio de cada `testsuite`.
* Nombre de cada `testcase`.
* Duración individual.
* Tests omitidos mediante `<skipped>`.
* Tests fallidos mediante `<error>` o `<failure>`.
* `system-out` y propiedades adicionales.

Una corrida real de `demo` utilizada durante el análisis produjo:

```text
39 escenarios
32 verdes
7 rojos
0 omitidos
42.6 segundos
```

Los errores de Playwright aparecieron en el XML mediante elementos `<error>`,
por lo que el reporte contempla tanto `<error>` como `<failure>` para determinar
un resultado rojo.

---

### Archivo creado: `tools/resumen.mjs`

Se implementó una utilidad independiente que:

1. Recibe el nombre del proyecto.
2. Verifica que el proyecto exista.
3. Busca el último archivo JUnit en:

```text
test-results/<proyecto>/junit/results.xml
```

4. Extrae los resultados relevantes.
5. Consulta, cuando existe:

```text
test-results/<proyecto>/historico-casos.json
```

6. Genera:

```text
test-results/<proyecto>/resumen-ejecutivo.md
```

La herramienta no ejecuta nuevamente Playwright ni realiza llamadas a Bizagi.

---

### Estructura del reporte

El resumen ejecutivo se divide en cinco bloques.

#### 1. Escenarios ejecutados

Muestra el total de tests registrados en el JUnit de la última corrida.

Ejemplo:

```text
Total: 39
```

---

#### 2. Resultado de la corrida

Clasifica cada testcase como:

```text
Verde
Rojo
Omitido
```

Un testcase se considera rojo si contiene:

```xml
<failure>
```

o:

```xml
<error>
```

Los tests con:

```xml
<skipped>
```

se consideran omitidos.

Si existen resultados rojos, el reporte agrega una tabla con:

```text
Escenario
Detalle del error
```

De esta forma se mantiene una vista ejecutiva del problema sin incluir el stack
trace completo.

---

#### 3. Duración

La duración total se obtiene del atributo:

```xml
<testsuites time="...">
```

Cuando este dato no está disponible, puede utilizarse como fallback la suma de
las duraciones de los testcase.

La duración se transforma a un formato más legible.

Ejemplos:

```text
0.431 s  → 431 ms
42.616 s → 42.6 s
65.4 s   → 1 min 5 s
```

---

#### 4. Pasos `[MANUAL]`

La herramienta busca evidencias marcadas con:

```text
[MANUAL]
```

dentro del contenido del JUnit.

Esto permite soportar pasos híbridos que posteriormente puedan registrar
evidencias como:

```text
[MANUAL] OTP — usuario: analista1 — fecha: 2026-08-20T15:00:30.000Z
```

Si no existe ninguna evidencia de este tipo, el reporte muestra:

```text
No se registraron pasos [MANUAL] en esta corrida.
```

La copia actual del framework todavía no genera normalmente este tipo de
evidencia durante los escenarios reales, pero su procesamiento quedó cubierto
mediante pruebas automatizadas.

---

#### 5. Casos creados en la corrida

Cuando existe:

```text
test-results/<proyecto>/historico-casos.json
```

la herramienta intenta identificar cuáles casos fueron creados específicamente
durante la última corrida.

Para esto se utiliza:

```text
timestamp inicial del JUnit
+
duración total
=
intervalo aproximado de la corrida
```

Posteriormente se filtran los registros del histórico cuyo `fechaHora` cae dentro
de ese intervalo.

El reporte muestra:

```text
Número de caso
Escenario
Fecha-hora
```

Esto evita incluir todos los casos históricos del proyecto cuando solamente se
necesitan los asociados a la corrida resumida.

Si el proyecto no tiene histórico, el reporte sigue siendo válido y muestra:

```text
No existe un histórico de casos para este proyecto;
no se registran casos creados.
```

Si existe histórico pero ningún caso pertenece al intervalo:

```text
No se registraron casos creados durante esta corrida.
```

---

### Correlación temporal de casos

El JUnit real de Playwright contiene timestamps como:

```text
2026-08-20T15:51:18.373Z
```

y duración total de la corrida.

Esto permite obtener aproximadamente:

```text
Inicio de corrida
↓
timestamp del JUnit

Fin de corrida
↓
inicio + duración
```

Los casos anteriores o posteriores al intervalo se excluyen del resumen.

Esta lógica se validó mediante mocks con casos creados:

```text
antes de la corrida
dentro de la corrida
dentro de la corrida
después de la corrida
```

y se confirmó que solamente los dos casos intermedios fueran incluidos.

---

### Manejo de ausencia de resultados

Si no existe:

```text
test-results/<proyecto>/junit/results.xml
```

la herramienta no genera un stack trace ni falla de forma poco clara.

Muestra un mensaje como:

```text
No hay resultados de pruebas para el proyecto "proyecto-prueba".

Se esperaba encontrar:
test-results/proyecto-prueba/junit/results.xml

Ejecuta primero:
npm test -- proyecto-prueba
```

En este caso el proceso termina con código de salida:

```text
1
```

---

### Código de salida

El comando `resumen` representa el resultado de la generación del reporte, no el
resultado de las pruebas resumidas.

Por esta razón:

```text
JUnit encontrado + reporte generado correctamente
→ exit code 0
```

incluso si la corrida contiene tests rojos.

En cambio:

```text
sin JUnit / error al generar el reporte
→ exit code 1
```

Esta decisión permite generar correctamente un resumen precisamente cuando una
corrida presenta fallos.

---

### Soporte para pruebas aisladas

Se agregó soporte para:

```text
RESUMEN_BASE_DIR
```

En ejecución normal:

```text
RESUMEN_BASE_DIR no definido
→ se utiliza process.cwd()
```

Durante las pruebas automatizadas se utiliza un directorio temporal.

Esto permite crear:

```text
projects/proyecto-prueba/
test-results/proyecto-prueba/
```

sin modificar resultados reales de `demo` o `colsubsidio`.

---

### Archivo creado: `projects/demo/tests/resumen-ejecutivo.spec.ts`

Se implementó una batería de pruebas utilizando JUnit e históricos simulados.

Las pruebas cubren:

1. Generación del reporte con los cinco bloques requeridos.
2. Conteo correcto de verdes, rojos y omitidos.
3. Formateo de duración.
4. Lectura de evidencias `[MANUAL]`.
5. Inclusión únicamente de casos creados durante la corrida.
6. Generación correcta aunque no exista histórico de casos.
7. Manejo claro cuando no existen resultados JUnit.

Ejecución:

```bash
npm test -- demo --grep "@t4-resumen"
```

Resultado:

```text
7 passed
```

---

### Validación de TypeScript

Después de agregar las pruebas se ejecutó:

```bash
npx tsc --noEmit
```

Resultado:

```text
sin errores
```

---

### Integración en `package.json`

Se agregó:

```json
"resumen": "node tools/resumen.mjs"
```

Con esto la interfaz final queda:

```bash
npm run resumen -- <proyecto>
```

No se agregaron nuevas dependencias.

---

### Validación manual con `demo`

Después de ejecutar las pruebas automatizadas de T4, se ejecutó:

```bash
npm run resumen -- demo
```

Resultado:

```text
Resumen generado: test-results/demo/resumen-ejecutivo.md

Escenarios: 7
Verdes: 7
Rojos: 0
Omitidos: 0
Duración: 2.3 s
Pasos [MANUAL]: 0
Casos creados en la corrida: 0
```

Este resultado corresponde correctamente a la última corrida de `demo`, que en
ese momento había sido:

```bash
npm test -- demo --grep "@t4-resumen"
```

Por tanto, el JUnit contenía únicamente las siete pruebas de T4.

Esto confirma que el reporte trabaja sobre la última corrida y no sobre un
acumulado histórico.

---

### Validación manual con `colsubsidio`

También se ejecutó:

```bash
npm run resumen -- colsubsidio
```

Resultado:

```text
Resumen generado: test-results/colsubsidio/resumen-ejecutivo.md

Escenarios: 2
Verdes: 2
Rojos: 0
Omitidos: 0
Duración: 431 ms
Pasos [MANUAL]: 0
Casos creados en la corrida: 0
```

El resultado corresponde al JUnit más reciente disponible para Colsubsidio.

---

### Validación previa con una corrida mixta

Durante el desarrollo se utilizó también una corrida completa de `demo` con
resultados exitosos y fallidos.

El JUnit reportaba:

```text
39 escenarios
32 verdes
7 rojos
0 omitidos
42.6 s
```

El resumen ejecutivo reprodujo correctamente esos valores y generó una tabla con
los siete escenarios fallidos.

Entre los errores reportados se encontraban pruebas que intentaban conectarse a:

```text
https://demo-no-real.bizagi.com/
```

y terminaban con:

```text
ERR_NAME_NOT_RESOLVED
```

La herramienta condensó estos errores sin incluir los stack traces completos.

---

### Relación con las tareas anteriores

T4 reutiliza resultados generados por distintos componentes del framework.

Flujo:

```text
Playwright
    ↓
results.xml
    ↓
          ┌───────────────────────┐
          │                       │
          │                T1 / T2
          │                       ↓
          │             historico-casos.json
          │                       │
          └───────────┬───────────┘
                      ↓
                    T4
                      ↓
              tools/resumen.mjs
                      ↓
           resumen-ejecutivo.md
```

De esta forma:

* Playwright aporta el resultado de la corrida.
* T1/T2 pueden aportar los casos creados.
* T4 consolida la información en una salida ejecutiva.

---

### Archivos asociados a T4

#### Nuevos

```text
tools/resumen.mjs
projects/demo/tests/resumen-ejecutivo.spec.ts
```

#### Generado en ejecución

```text
test-results/<proyecto>/resumen-ejecutivo.md
```

#### Fuentes utilizadas

```text
test-results/<proyecto>/junit/results.xml
test-results/<proyecto>/historico-casos.json
```

#### Modificado

```text
package.json
```

Cambio:

```json
"resumen": "node tools/resumen.mjs"
```

---

### Decisiones tomadas

* El reporte representa exclusivamente la última corrida disponible.
* No se modifica el reporter de Playwright.
* No se vuelve a ejecutar Playwright al generar el resumen.
* No se realizan llamadas a Bizagi.
* Se consideran rojos tanto `<failure>` como `<error>`.
* Los omitidos se muestran como información adicional.
* Los errores se resumen sin stack trace completo.
* Los casos creados se correlacionan mediante el intervalo temporal de la corrida.
* La ausencia de histórico no impide generar el reporte.
* La ausencia de JUnit sí impide generar un resumen válido.
* Una corrida con tests rojos puede producir correctamente un resumen y, por
  tanto, `resumen` termina con código 0 si el archivo fue generado.
* Los pasos `[MANUAL]` se soportan de forma tolerante aunque todavía no sean
  emitidos normalmente por el motor actual.
* Las pruebas automatizadas utilizan datos temporales y mocks.

---

### Estado de T4

* [x] Comando `npm run resumen -- <proyecto>`.
* [x] Lectura de la última corrida JUnit.
* [x] Archivo `resumen-ejecutivo.md`.
* [x] Cinco bloques requeridos.
* [x] Total de escenarios.
* [x] Resultados verdes.
* [x] Resultados rojos.
* [x] Resultados omitidos.
* [x] Detalle resumido de errores.
* [x] Duración total.
* [x] Pasos `[MANUAL]`.
* [x] Caso sin pasos manuales.
* [x] Casos creados durante la corrida.
* [x] Correlación temporal con el histórico.
* [x] Caso sin histórico.
* [x] Caso sin resultados JUnit.
* [x] Código de salida adecuado.
* [x] 7 pruebas automatizadas.
* [x] 7/7 pruebas en verde.
* [x] Typecheck limpio.
* [x] Validación manual con `demo`.
* [x] Validación manual con `colsubsidio`.

**Resultado:** T4 completada. El framework dispone ahora de un reporte ejecutivo
en Markdown que resume automáticamente la última corrida de un proyecto y
consolida resultados, duración, pasos manuales y casos creados.