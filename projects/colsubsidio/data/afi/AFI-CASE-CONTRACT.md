# Contrato de caso AFI (`DefinicionCasoAfi` v1)

Código: [caso.ts](caso.ts) · Plan funcional: [funcional.ts](funcional.ts) · Ejemplo: [examples/cp04-empresa.afi.json](examples/cp04-empresa.afi.json) · Golden samples: [casos/hu14-12-cp04.ts](casos/hu14-12-cp04.ts)

## 1. Qué produce el agente

Un **documento JSON** por caso/variante. Solo datos: nada de TypeScript, Playwright, locators, selectores CSS, funciones, RegExp, callbacks, imports ni `process.env`. Debe sobrevivir `JSON.stringify` → `JSON.parse` sin perder significado.

```
version, hu, caso, nombre, fuente?   metadata reproducible (sin rutas locales, timestamps ni ambiente)
perfil                               perfil lógico: empresa | pensionado | facultativo | independiente
actorRef?                            actor lógico del Test Data Registry (4P), mismo perfil; ver §12
preparacion { datosCaso, camposAsercion, etapas }
funcional   PlanFuncionalAfi
```

El contrato es **estricto**: cualquier propiedad no prevista (`selector`, `script`, `locator`, `regex`, `playwright`...) invalida la definición en cualquier nivel.

## 2. Preparación vs funcional

| | Preparación | Funcional |
|---|---|---|
| Propósito | llegar al punto de prueba | acciones y assertions del diseño QA |
| Motor | `resolverEtapa` + actor + políticas → `AfiDataUi` | `PlanFuncionalAfi` → `AfiFunctionalUi` |
| Puede inventar | preparación auxiliar segura | **nunca** una assertion ni el objetivo del caso |

Un campo objeto de prueba (p. ej. `departamento` en CP04) va en `funcional`, no en `preparacion`.

Las operaciones funcionales nombran **catálogos cerrados**: campos (`CampoContactoFuncional`), componentes visuales (`ComponenteFuncionalAfi`) y fuentes autoritativas (`FuenteAutoritativaAfi`), definidos en [funcional.ts](funcional.ts). Un id fuera del catálogo es `CapabilityGapError`; nunca se acepta un selector o un texto de la UI en su lugar. Añadir operaciones o ids es aditivo: no cambia la forma de la definición v1.

## 3. `datosCaso`: qué va

Solo valores o reglas que **pertenecen al caso** según el diseño: la variante que se prueba. Ejemplo CP04 Empresa: `{ "tipoAportante": "Empleador" }`. También se admite una regla explícita del caso sin valor: `{ "estrategia": { "tipo": "first-valid-option", "orden": "catalogo" } }`.

## 4. `datosCaso`: qué NO va

- **PII**: identificación, correo, teléfonos, salario... Un valor literal en un campo no `public` se rechaza, y también una estrategia `deterministic-*` (lleva un valor literal).
- Lo que el framework ya resuelve: `confirmacionCorreo` (derived), consentimientos, `naturaleza`, `claseEmpleador` (auxiliary), datos del actor.
- Campos de etapas no declaradas en `preparacion.etapas` (el resolver los ignoraría en silencio).

## 5. `camposAsercion`

Campos cuyo **valor** es resultado esperado del caso. Es explícito: aparecer en `datosCaso` no convierte un campo en assertion (en CP04 `tipoAportante` define la variante pero P04-P06 no lo validan, así que `camposAsercion: []`). Un campo asertado sin valor explícito en `datosCaso` produce un DataGap: el framework nunca inventa un esperado.

## 6. `etapas`

Subconjunto de `ETAPAS_AFI`, sin duplicados, en el orden del catálogo. El compilador prepara **solo** las declaradas (un caso puede terminar antes).

## 7. Tres tipos de problema

| Error | Significa | Cuándo |
|---|---|---|
| `DefinicionCasoAfiError` | el documento no cumple el contrato (incluido un plan funcional mal formado) | validación; lanza |
| `CapabilityGapError` | el diseño pide una operación que AFI no sabe ejecutar (p. ej. `hover-tooltip`) | validación; lanza |
| DataGap (`GapCompilado`) | falta un dato para preparar (actor incompleto, assertion sin valor explícito) | compilación; se **acumulan** todos y `ejecutable=false` |

Un capability gap nunca se convierte en data gap ni al revés.

## 8. PII

La definición **nunca** contiene PII. Referencia un `perfil`; el runner materializa `actorDesdeEntorno(perfil, entorno)` en ejecución. El compilado lleva valores reales dentro de los `PlanPreparacion` (el runner los necesita), pero solo debe reportarse con `diagnosticoCasoCompilado()`, que redacta todo lo no `public`.

## 9. Uso previsto

```ts
const def: unknown = JSON.parse(salidaDelAgente);
exigirDefinicionCasoAfiValida(def);                 // DefinicionCasoAfiError | CapabilityGapError
const actor = actorDesdeEntorno(def.perfil, process.env);
const compilado = compilarCasoAfi(def, actor);      // puro
if (!compilado.ejecutable) { /* reportar diagnosticoCasoCompilado(compilado).gaps; NO abrir navegador */ }
// Fase futura: ejecutarCasoAfi(compilado)
```

Ejemplo completo CP04 Empresa: [examples/cp04-empresa.afi.json](examples/cp04-empresa.afi.json) (un unit test garantiza que coincide con la definición TypeScript).

## 10. Uso de archivo (`*.afi.json`)

Un archivo = un caso. El CLI no interpreta el JSON: valida argumentos y delega en el harness TypeScript (`tests/afi-case-file.spec.ts`), que usa este mismo `caso.ts` vía [loader.ts](loader.ts).

```
node tools/afi.mjs colsubsidio validar  ruta/caso.afi.json [--json]
node tools/afi.mjs colsubsidio compilar ruta/caso.afi.json [--json]
node tools/afi.mjs colsubsidio ejecutar ruta/caso.afi.json [--json]
npm run afi -- colsubsidio validar ruta/caso.afi.json
```

| Modo | Hace | Navegador |
|---|---|---|
| `validar` | contrato (`exigirDefinicionCasoAfiValida`); sin actor ni compilación | nunca |
| `compilar` | contrato + datos de prueba (`actorParaCaso`: actor por perfil, o slot si hay `actorRef`) + `compilarCasoAfi` + preflight del runner | nunca |
| `ejecutar` | lo anterior (en `beforeAll`, sin navegador) + `ejecutarCasoAfi` (E2E real, `workers=1`, `retries=0`, cleanup) | solo si todo lo anterior pasa |

Solo rutas locales con extensión `.afi.json` (sin URLs, `data:` ni patrones). Exit code `0` solo si el modo termina bien; cualquier problema de archivo, contrato, DataGap, CapabilityGap, preflight o ejecución sale distinto de 0. `--json` imprime un resumen máquina sin PII.

## Etapa `informacion-empresa` (Fase 4S-R.1)

Opcional y solo con efecto para `perfil: "empresa"` cuando el Portal presenta la pantalla de Empleador Persona Jurídica. Se
declara en `preparacion.etapas` después de `inicio-solicitud`. Es **según estado**: el caso no necesita valores para lo que el
Portal precarga; si la pantalla exige un dato que ni el caso ni el actor aportan, la ejecución falla con `DataGapPantallaError`
(nunca se inventa). Un `camposAsercion` de esta etapa sin valor explícito sigue siendo gap de compilación.

## 11. Lo que el contrato NO controla

Pertenece al framework, nunca a la definición: retries, workers, **lifecycle/cleanup** del caso Bizagi, ledger/histórico, credenciales, URLs, timeouts de infraestructura, locators/selectores, login y navegación resiliente.

Tampoco el **contexto de ejecución** (desktop / mobile, viewport, touch): es una dimensión de ejecución que se elige fuera del JSON ([contextos.ts](contextos.ts)). Hoy el runner v1 solo ejecuta `desktop` (ver `ejecucion` en el manifest).

## 12. Actor lógico (`actorRef`, Fase 4P)

Opcional y compatible con v1: sin `actorRef` el caso usa el actor del perfil (`actorDesdeEntorno`), como siempre. Con `actorRef` el caso pide una **clase de actor** aprobada en el Test Data Registry (`knowledge/test-data-registry.json`) del **mismo perfil**, p. ej. `{ "perfil": "pensionado", "actorRef": "pensionado-condicion-x" }`.

- `actorRef` es un id semántico kebab-case. Nunca un `secretRef`, un nombre de variable, `process.env` ni un valor.
- El framework deriva los nombres de variable (`AFI_ACTOR_<ACTOR>_<CAMPO>`, `AFI_SHARED_<REF>`) y verifica su **presencia** antes de abrir navegador. Si el actor no está `READY` (`MISSING_SECRET`, `NEEDS_PROVISIONING`, `NEEDS_REVIEW`), compilar/ejecutar salen ≠ 0 con un diagnóstico para el analista, sin valores.
- Detalle: [AFI-TEST-DATA.md](AFI-TEST-DATA.md).

## 13. Condiciones observables (`funcional.pasos[].condiciones`, Fase 4R)

Opcional y aditivo a v1. Cuando el `esperado` de un paso no se observa en el Portal sino en el proceso BPM (una actividad, una ruta, un dato...), el paso puede declarar su **representación observable suficiente**:

```json
{ "id": "P07", "esperado": "El caso queda en la actividad X.", "operaciones": [],
  "condiciones": [{ "entidad": { "tipo": "actividad", "id": "actividad-x" }, "expectativa": { "tipo": "alcanzada" } }] }
```

- `esperado` sigue siendo el texto QA; `condiciones` describe el MISMO esperado (no es otra verdad).
- Solo semántica: `entidad { tipo, id }` registrada en el Application Model + `expectativa` de su tipo. Proveedor, superficie, nombre de tarea, selector o endpoint **invalidan** el caso: el framework los resuelve con vínculos aprobados.
- `operaciones` puede ser `[]` solo si hay condiciones.
- El compilador resuelve cada condición: no registrada → `KNOWLEDGE_GAP`; sin vínculo aprobado o sin proveedor **productivo** → `TESTABILITY_GAP`; pantalla/campo UI → `CAPABILITY_GAP` (se certifica con operaciones). Con cualquiera, el caso no es ejecutable.
- En ejecución, una condición que no puede observarse queda `NO_OBSERVABLE`: ni PASS ni FAIL; el caso no queda certificado.
- Lo que hoy es observable está en `funcional.condiciones.observablesHoy` del manifest.

## 14. Participantes secundarios (`participantes`, `relaciones`, Fase 4S)

Opcionales y aditivos a v1. `participantes: [{ "rol": "<rol-semantico>", "actorRef": "<sujeto aprobado>" }]` declara QUIÉNES más necesita el caso; `relaciones: [{ "tipo": "mismo-sujeto" | "distinto-sujeto", "sujetos": ["<rol>|principal", "<rol>|principal"] }]` solo cuando el diseño QA las exige.

- Dos sujetos con el mismo `actorRef` son la misma persona: exige `mismo-sujeto` declarado. `distinto-sujeto` exige actores distintos y se verifica por identidad antes de ejecutar.
- El actor principal nunca es un participante (y al revés), salvo `mismo-sujeto` explícito con `"principal"`.
- Hoy ninguna operación del plan funcional consume un participante: un paso que necesite sus datos sigue siendo `CAPABILITY_GAP`.

## 15. Caso E2E declarativo (`e2e`)

Un caso completo (más allá del punto funcional) se declara en la sección opcional `e2e` del mismo `.afi.json`; con `e2e`,
`funcional` es opcional. El harness genérico (`AFI_CASE_FILE`, `tools/afi.mjs validar|compilar|ejecutar`) lo carga sin
TypeScript por caso. Contrato: [e2e/contrato.ts](e2e/contrato.ts) (claves cerradas) · compilador: [e2e/compilador.ts](e2e/compilador.ts).

```json
"e2e": {
  "version": 1, "hoja": "<hoja del diseño>",
  "sujetos": [{ "rol": "<rol>", "actorRef": "<opcional>" }],
  "relaciones": [{ "tipo": "distinto-sujeto", "sujetos": ["<rol|principal>", "<rol|principal>"] }],
  "precondiciones": [{ "sujeto": "<rol|principal>", "id": "<kebab>", "descripcion": "<condición de negocio>" }],
  "datos": [{ "campo": "<campo>", "sujeto": "<rol|principal>", "uso": ["SCENARIO"], "resolucion": "TEST_DATA",
              "aplicabilidad": "siempre" | { "cuando": { "campo", "operador", "valor" } } }],
  "pasos": [{ "paso": 3, "accion": "<literal>", "esperado": "<literal>", "dispositivo": "desktop|mobile",
              "verificaciones": [{ "tipo": "pantalla", "pantalla": "<id Knowledge>", "expectativa": { "titulo": { "texto": "..." } } }] }]
}
```

- **Datos** (AFI-TEST-DATA §7): `uso` (ASSERTION/SCENARIO/FILLER) · `resolucion` (TEST_DATA/CASE_LITERAL/GENERATED/SYSTEM) ·
  `aplicabilidad`. Combinaciones ilegales = error de contrato. Solo `TEST_DATA` produce `testDataRequirements` (derivados
  automáticamente por sujeto, con `camposCondicionales` y `distintoDe`); `CASE_LITERAL`/`SYSTEM`/`GENERATED` nunca.
- **Verificaciones**: `bizagi-acceso`, `parametrica-columnas`, `parametrica-mensajes`, `portal-apertura`, `portal-caso-creado`,
  `pantalla` (id Knowledge + expectativa), `condicion` (entidad/expectativa como en §13), `accion`, `diseno`.
- **Gaps**: el archivo NUNCA los declara. El compilador los deriva: KNOWLEDGE (entidad o pantalla no registrada),
  CAPABILITY (el recorrido o la verificación aún no existen), OBSERVABILITY (sin proveedor/vínculo productivo o propiedad no
  verificable objetivamente) y TEST_DATA (dato no provisionable o actor no listo).

### 15.1 Endurecimiento (semántica cerrada, actor demostrado, ruta derivada)

- **Integraciones**: invocación separada del resultado. `{ "tipo": "invocada" | "no-invocada" }` y `{ "tipo": "resultado", "igual": "exito" | "error" }`.
  `igual` solo existe en `resultado` (dominio cerrado) y `valor` (literal); cualquier otro valor invalida el caso.
- **Actor demostrado**: si el principal declara precondiciones o datos de escenario, su `actorRef` debe tener TODAS esas
  condiciones aprobadas. Si no, el compilador deriva `test-data:actor-no-demostrado:principal` y el recorrido del Portal NO
  se compila (nunca con el actor base del perfil).
- **Ruta derivada**: el caso no declara pantallas intermedias ni sus datos de tránsito. El compilador recorre las
  `transicion-ui` de Knowledge desde el punto funcional, deriva qué exige cada pantalla (políticas de su `etapa`, formulario
  ligado a un sujeto, documentos) y los datos de tránsito (a Test Data). `sujetos[].pantalla` liga un sujeto a la pantalla
  donde se captura cuando el caso no la menciona.
- **notaFuente** (paso): documental; no ejecuta, no genera gaps ni aserciones.
- **fidelidad** (paso): fragmentos LITERALES del diseño que las verificaciones aproximan o no pueden representar. Nunca
  cuentan como semántica exacta; el compilador además detecta `detalle` libre en acciones como aproximación.

