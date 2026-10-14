# Datos de prueba: Test Data Requirements y Actor Slots (Fases 4P/4Q)

Código: [datosPrueba/contrato.ts](datosPrueba/contrato.ts) · [registro.ts](datosPrueba/registro.ts) · [intake.ts](datosPrueba/intake.ts) · [disco.ts](datosPrueba/disco.ts) · [revisionMd.ts](datosPrueba/revisionMd.ts) · [gateEvidencia.ts](datosPrueba/gateEvidencia.ts) · Envelope: [intakeAgente.ts](intakeAgente.ts) · Almacén: `knowledge/test-data-registry.json`

```
HU/caso -> TestDataRequirement (perfil + condiciones lógicas + campos)
        -> ActorSlot (CLASE de actor reutilizable, no una persona)
        -> secretRef derivado por el framework (AFI_ACTOR_<ACTOR>_<CAMPO> / AFI_SHARED_<REF>)
        -> preflight (presencia en el entorno, nunca contenido) -> READY | MISSING_SECRET | NEEDS_PROVISIONING | NEEDS_REVIEW
```

## 1. Salida del agente: UN envelope

```json
{ "schemaVersion": "afi-agent-intake/v1", "knowledgeProposals": [], "classificationRequests": [], "testDataRequirements": [] }
```

Exactamente un bloque `json` al final del intake; las tres listas siempre. Conocimiento y datos de prueba comparten envelope pero NO modelo: se preparan, revisan y aplican por separado. Las salidas antiguas (4O/4P) se aceptan temporalmente.

## 2. Sensibilidad ≠ resolución

| Dimensión | Pregunta | Valores |
|---|---|---|
| Sensibilidad | ¿Qué tan privado es el dato? | `public` · `pii` |
| Resolución | ¿Cómo lo obtiene el framework? | `ACTOR_SECRET` · `ACTOR_BASE` · `SHARED` · `PUBLIC_CASE` · `DERIVED` · `AUXILIARY` |

Un campo `pii` que el framework resuelve fielmente (p. ej. tipo de afiliado por "primera opción válida") es `AUXILIARY`: **no** genera secreto, nunca. `camposRequeridos` = datos que deben **provisionarse** y acepta SOLO `testData.camposPedibles` (fuente canónica única `CAMPOS_PEDIBLES`); `condiciones` = propiedades lógicas del actor, que pueden mencionar una propiedad auto-resoluble sin crear un secreto. Si el caso **certifica** el valor de un campo auto-resoluble, ese valor pertenece al caso (contrato funcional) y, si no es representable, es un DataGap; nunca un secreto de datos de prueba ni una opción arbitraria.

El manifest (`testData.campos`) distingue: `condicionables`, `requierenSecreto` (= `camposPedibles`), `autoResolubles`, `actorBase`, `compartibles`.

## 3. Flujo del analista

```
node tools/afi.mjs colsubsidio intake preparar <respuesta-del-agente.md>      # prepara conocimiento + datos (no aplica)
  (o solo datos:) node tools/afi.mjs colsubsidio datos preparar <respuesta-del-agente.md>
# leer knowledge/test-data-review/<lote>.review.md y completar <lote>.decisiones.json
node tools/afi.mjs colsubsidio datos aplicar <lote>.review.json <lote>.decisiones.json --dry-run
node tools/afi.mjs colsubsidio datos aplicar <lote>.review.json <lote>.decisiones.json
node tools/afi.mjs colsubsidio datos estado                                   # qué falta y qué hacer
node tools/afi.mjs colsubsidio datos plantilla-env --escribir                 # .env.test-data.example (solo nombres)
# QA consigue el actor y carga los valores en projects/colsubsidio/.env (a mano; ningún comando escribe el .env)
node tools/afi.mjs colsubsidio datos provisionado <actor> --revisor=<alias> --dry-run
node tools/afi.mjs colsubsidio datos provisionado <actor> --revisor=<alias>
```

- **Decisiones**: `APPROVED` / `REJECTED` / `NEEDS_CHANGES` + `revisor`; al aprobar, `correcciones` (id, condiciones, campos con su fuente `slot`/`shared`/`base`/`fallbackBase`), `mismoActorQue`, `actoresDistintosDe`, `estado` (`pendiente-provisionar` por defecto | `provisionado`), y `compartidos` declarados. Hash + revisionBase + todo o nada + historial con el lote (`YA_APLICADO` al reaplicar).
- **provisionado**: no recibe valores; comprueba que TODAS las variables del actor están presentes en el entorno (si faltan, lista los NOMBRES); cambia solo el estado de provisión y deja historial. Pendiente + variables presentes se muestra como *REQUIERE CONFIRMACIÓN DE PROVISIÓN* y nunca se promueve solo.

## 4. Compartir es una política, no un accidente

"Compartible" significa: **el framework permite compartir ese secreto si un humano lo decide** para un actor concreto. Nunca lo comparte automáticamente. Que hoy dos perfiles usen la misma variable del `.env` es solo evidencia de compatibilidad. Las propuestas usan siempre secretos propios; `shared`, `base` y `fallbackBase` solo existen por decisión explícita en la revisión.

## 5. Gate de evidencia PII — `evidencia-cliente-pii-actor-slots` (ABIERTO)

Un E2E con `actorRef` escribe en el Portal valores SECRET reales del actor, y las capturas cliente pueden mostrarlos. Mientras este gate esté ABIERTO:

- intake, revisión, aplicación y compilación con ActorSlots están permitidos;
- `ejecutar` con `actorRef` y evidencia `cliente` o `todo` se **bloquea en el preflight** (antes del navegador); use `--evidencia=off` o `--evidencia=tecnica` (interna, nunca para el cliente);
- ninguna ejecución con ActorSlot se declara *client-safe*.

Criterios de cierre (en `GATE_EVIDENCIA_PII`): estrategia explícita y revisada de ocultamiento por campo SECRET en la evidencia cliente; pruebas automáticas que lo demuestren para cada campo pedible; decisión documentada sobre quién ve la evidencia técnica.

## Hechos de negocio de la empresa (Fase 4S-R.1)

`codigoCiiu`, `razonSocial`, `actividadEconomicaEmpresa`, `fechaInicioActividad`, `valorNomina`, `numeroTrabajadores`, `afiliadoPrimeraVez` y `cajaCompensacionAnterior` (4S-R.2: condicional, aparece tras `afiliadoPrimeraVez`) son
datos **del actor Empresa** (pii, pedibles; secretos del slot en `.env`). No son datos de prueba neutros: identifican o describen
a la empresa, o cambian el flujo (`afiliadoPrimeraVez`). Solo se usan si el Portal los deja habilitados y vacíos/inválidos. El
Código CIIU también es del actor: que el catálogo del Portal sea cerrado no hace válido cualquier CIIU para una empresa. Ampliar un slot existente con
estos campos pasa SIEMPRE por `datos preparar` → revisión humana → `datos aplicar` (nunca edición manual del registro). Con
`mismoActorQue` hacia un actor existente se le añaden los campos Y las condiciones nuevas del requisito (por id; nada se borra).

Provisión tras `mismoActorQue`: si añade una o más **condiciones nuevas**, el actor vuelve a `pendiente-provisionar` (tener sus
secretos no prueba una condición de negocio) y solo `datos provisionado <actor> --revisor=<alias>` lo devuelve a READY. Si solo
añade **campos**, conserva su provisión: su estado efectivo será MISSING_SECRET mientras falten esos valores en el `.env`.

Los artefactos de `knowledge/review` y `knowledge/test-data-review` son **append-only**: un lote nuevo nunca reemplaza ni borra
uno anterior; re-preparar un lote existente con contenido distinto falla sin escribir (`ArtefactoRevisionInmutableError`).

## 7. Principio de datos mínimos — "Obligatorio en la UI no implica obligatorio en Test Data" (DISEÑO aprobado, NO implementado)

Regla general del framework (aplica a todo caso, HU y perfil). Objetivo: QA suministra **solo** los datos con significado
funcional para la prueba o que deben existir previamente en sistemas externos. El relleno obligatorio irrelevante lo produce el
framework, y solo cuando puede **demostrar** que es seguro hacerlo.

### 7.1 Tres dimensiones ortogonales por campo

Cada campo que el recorrido necesita se describe con tres dimensiones independientes (relevancia, origen, aplicabilidad):

| Dimensión | Valores | Pregunta |
|---|---|---|
| `uso` (lista, 0..n) | `ASSERTION` · `SCENARIO` · `FILLER` | ¿Para qué importa su valor? `ASSERTION`: es objeto directo de una comprobación. `SCENARIO`: determina precondiciones, ramas, integraciones o comportamiento funcional. `FILLER`: obligatorio solo para transitar y demostrado irrelevante. |
| `resolucion` (uno) | `TEST_DATA` · `CASE_LITERAL` · `GENERATED` · `SYSTEM` | ¿De dónde sale el valor? `TEST_DATA`: secreto o dato externo provisionado (Test Data/`.env`). `CASE_LITERAL`: valor **público** fijado por el propio caso. `GENERATED`: generador sintético del framework. `SYSTEM`: lo aporta o deriva RUES, Registraduría, Bizagi o el Portal; no se suministra. |
| `aplicabilidad` | `siempre` · `{ cuando }` · `{ siPresenta }` | ¿Cuándo se necesita? Condición **semántica** (7.2). |

Combinaciones legales (las valida el compilador; cualquier otra es error del contrato):

| Regla | |
|---|---|
| `FILLER` excluye `ASSERTION` y `SCENARIO` | Un dato no puede ser irrelevante y relevante a la vez. |
| `GENERATED` exige `uso: ["FILLER"]` y autorización `generable` (7.3) | Nunca se genera un dato relevante. |
| `FILLER` sin autorización `generable` demostrada se resuelve como `TEST_DATA` | Regla de duda: provisional hasta tener evidencia. |
| `CASE_LITERAL` exige un campo público y un `valor` | Los secretos o datos externos **nunca** son literales del caso. |
| `TEST_DATA` exige que el campo sea pedible para ese sujeto y **no** lleva valor | El valor vive solo en el entorno. |
| `SYSTEM` no lleva valor; admite `uso: []` o `["ASSERTION"]` | P. ej. una precarga que el caso verifica. |
| Solo `SYSTEM` admite `uso` vacío | Un campo que no es del sistema y no tiene uso es, por definición, `FILLER`. |

Regla de duda: si no puede demostrarse que un campo es irrelevante para aserciones, precondiciones, integraciones o
bifurcaciones, **no** es `FILLER`: su `uso` es `SCENARIO` (o `ASSERTION`) y su `resolucion` es `TEST_DATA` o `CASE_LITERAL`.
Nunca se genera en silencio ni se elige una respuesta solo para simplificar la automatización (p. ej. responder una pregunta del
formulario para evitar un campo condicional: esa respuesta es `SCENARIO` y debe ser el hecho real del actor).

### 7.2 Aplicabilidad: condiciones semánticas

La condición se expresa por su **causa funcional**, no por su efecto en pantalla:

```json
{ "campo": "cajaCompensacionAnterior", "sujeto": "principal", "uso": ["SCENARIO"], "resolucion": "TEST_DATA",
  "aplicabilidad": { "cuando": { "campo": "afiliadoPrimeraVez", "sujeto": "principal", "operador": "igual", "valor": "No" } } }
```

- Operadores: `igual`, `distinto`, `en` (lista). El valor de comparación es un literal **público**; si el campo referido es
  secreto, la condición se evalúa solo en memoria (nunca se imprime).
- Un `TEST_DATA` condicional solo es exigible cuando la condición aplica: si se puede evaluar antes de la UI (el campo referido
  ya está resuelto en memoria), el preflight lo exige o no; si no aplica, **no** deja al actor en MISSING_SECRET.
- La aparición del campo en la UI es una **consecuencia verificable** de la regla (el runner puede comprobarla), no la regla.
- `siPresenta: { pantalla, campo }` (ids de Knowledge) existe **solo** como mecanismo explícito cuando la condición funcional
  aún no es conocida/aprobada; el compilador lo acompaña de un KNOWLEDGE_GAP de advertencia hasta que la regla se aprueba.

### 7.3 Autorización de FILLER + GENERATED (autoridad: políticas/Knowledge, nunca el agente)

Un campo solo es generable si su política lo declara para ese contexto:

```ts
generable?: {
  perfiles: PerfilActorAfi[];                 // perfiles a los que aplica (la evidencia de un perfil NO autoriza a otros)
  etapa: EtapaAfi;                             // pantalla/etapa
  estrategia: 'fecha-pasada' | 'entero-rango' | 'texto-sintetico' | 'opcion-dominio' | 'archivo-sintetico';
  restricciones: Record<string, unknown>;      // dominio válido (rango, formato, catálogo aprobado, tipo/tamaño de archivo)
  evidencia: { tipo: 'knowledge' | 'req' | 'qa-aceptado' | 'qa-observado'; referencia: string }; // por qué no altera el escenario
}
```

El agente (Gemini) puede **proponer** `uso: ["FILLER"]` con `resolucion: "GENERATED"`; el compilador **rechaza** esa
clasificación (y la degrada a `TEST_DATA`, con su gap) si: (a) no existe `generable` para ese perfil/etapa; (b) el campo
participa en alguna aserción, condición `cuando` de otro campo, relación o expectativa del caso; o (c) Knowledge le asocia una
regla de flujo, aprobación o integración. Que una estrategia funcione en otra HU o perfil es evidencia útil, pero **no**
constituye autorización global.

### 7.4 Jerarquía de evidencia antes de preguntar a QA

Para clasificar un campo (uso, generabilidad, condición) se resuelve en este orden y solo se pregunta a QA al final:
1. requisitos oficiales de la HU/REQ; 2. Knowledge aprobada; 3. políticas/capabilities existentes; 4. comportamiento ya
observado en QA; 5. exploración segura de QA (sin modificar datos ajenos; en casos propios con cleanup); 6. consulta a QA /
KNOWLEDGE_GAP. Objetivo: minimizar tanto los secretos manuales como las decisiones manuales.

### 7.5 Generación determinística y conservadora

- Semilla: `hash(HU + CP + versión + campo)`: mismo caso, mismos valores; casos distintos no colisionan.
- Valores **válidos y no extremos** dentro del dominio permitido (nunca mínimos/máximos, fechas límite ni longitudes máximas):
  el relleno no debe introducir boundary testing accidental.
- Sintéticos por construcción (sin PII real; dominios/rangos reservados de prueba; archivos sin datos). Aun así se redactan en
  la evidencia para no mezclarlos con datos reales.
- Genéricos: ningún generador conoce un caso, HU o actor concreto.

### 7.6 Responsabilidad por capa

| Capa | Responsabilidad |
|---|---|
| Gemini (agente) | Interpreta el caso y propone `uso`, `resolucion` y `aplicabilidad` de cada campo. |
| Contrato `.afi.json` | Transporta esa intención; **nunca** lleva valores para `GENERATED` ni para `TEST_DATA`. |
| Compilador | Valida las combinaciones legales (7.1) y la autorización (7.3), deriva gaps cuando no puede demostrarlas y traduce los `TEST_DATA` a `testDataRequirements`. |
| Knowledge / políticas | Autoridad sobre si un campo es generable y bajo qué restricciones. |
| Generadores / capabilities | Producen el valor sintético y determinístico. |
| Test Data / `.env` | Reservado a datos semánticos, externos, secretos o no generables. |

Relación con la resolución actual (§2): `AUXILIARY` ("primera opción válida", determinísticos) es la forma primitiva de
`FILLER + GENERATED`; este principio la formaliza con prueba de irrelevancia, semilla y dominio conservador. Una estrategia de
catálogo nunca es válida para un campo cuyo valor concreto importa al escenario.

## 6. Frontera con matrices humanas de datos (futuro, NO implementado)

- prerrequisito / condición → `TestDataRequirement` / `ActorSlot` (puede llegar al agente);
- dato real → aprovisionamiento de secretos en el `.env` (nunca llega al agente, al registro ni a Git).

## Participantes secundarios (Fase 4S)

Un caso puede necesitar, además del **actor principal** (el aportante), **cero o más participantes**: otras personas con un rol semántico que define el diseño QA. El framework no conoce ningún rol concreto.

Cómo lo piensa el analista:

```text
Actor principal:  aportante que cumple <condición>
Participante rol-x:  persona que cumple <condición>
Participante rol-y:  persona que cumple <otra condición>
```

- **Requisito** (`testDataRequirements`): con `"rol"` es un participante (`perfil` solo si aplica); sin `"rol"`, el actor principal (perfil obligatorio, igual que antes).
- **Slot**: se aprueba como `sujeto: "participante"`. Sus campos solo vienen de un secreto propio (`slot`) o de un compartido declarado; nunca del actor base de un perfil. Sus variables se derivan igual que las de cualquier actor: `AFI_ACTOR_<SLOT>_<CAMPO>`.
- **Revisión**: mismo rol + mismas condiciones **no** es el mismo sujeto. Nunca se agrupan ni se reutilizan solos; aparecen como posibles duplicados (decida `mismoActorQue` o `actoresDistintosDe`). Un participante nunca se fusiona con un actor principal.
- **Caso**: `participantes: [{ rol, actorRef }]` y, SOLO si el diseño lo exige, `relaciones: [{ tipo: "mismo-sujeto" | "distinto-sujeto", sujetos: [rol | "principal", rol | "principal"] }]`. Compartir actor exige `mismo-sujeto` declarado; `distinto-sujeto` se verifica también por identidad en ejecución (sin mostrar valores). Sin relación no se infiere nada.
- **datos estado / requeridos** muestran `Participante (rol …)`, la condición que debe cumplir y la variable que falta.
- **Límite actual**: ninguna operación ni etapa de preparación consume aún un participante. Se modelan, provisionan y verifican antes de ejecutar; diligenciar o comparar sus datos en la UI sigue siendo un CAPABILITY_GAP.
