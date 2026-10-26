# Contrato documental para el piloto híbrido QA

La propuesta permite revisar un diseño generado por Gemini antes de entregarlo al motor del proyecto. Añade información documental, procedencia, dependencias y necesidades de revisión; **no reemplaza los contratos ejecutables existentes**. La gema propone un diseño; QA revisa el diseño; el runner conserva la autorización de ejecución y QA conserva la aprobación funcional.

## Estructuras que ya existen

| Componente actual | Uso en esta propuesta |
|---|---|
| SDE `sde/escenario.ts`: `EscenarioSde`, `CAPACIDADES`, `VERIFICACIONES`, cargador estricto | El YAML continúa siendo la definición ejecutable. Se referencian sus capacidades expandidas por índice, sin añadir selectores ni instrucciones nuevas al motor. |
| SDE `fuentes/matriz.json` y Excel HU06 | Acciones, objetivo y esperados literales. El puente rechaza cambios, omisiones o duplicación de pasos. No se modificó la matriz. |
| SDE `data/datasets.yaml`, `datos.ts`, `ejecutor.ts:preflight` | Datos documentados, actores, sensibilidad y variables locales. Se comprueban también los datasets requeridos por pasos, antes de cualquier navegador. |
| SDE `expectativas-presentacion.yaml` y `popups-calibrados.yaml` | Reglas de presentación y condiciones de apertura ya registradas. Una regla pendiente no se convierte en una expectativa inventada. |
| AFI `DefinicionCasoAfi` v1 en `caso.ts` | Mantiene perfil, actorRef, preparación, plan funcional y su validador cerrado. No acepta las propiedades de este envelope dentro de un `.afi.json`. |
| AFI `e2e/contrato.ts`: uso, resolución, sujetos, precondiciones y fidelidad | Se reutiliza la separación ASSERTION/SCENARIO/FILLER y CASE_LITERAL/TEST_DATA/GENERATED/SYSTEM. Los ids de campos y verificaciones siguen siendo los del catálogo AFI. |
| AFI `datosPrueba/contrato.ts`, registro y compilador | Se conserva la separación de sensibilidad y resolución, los actor slots y los DataGap/CapabilityGap. Una referencia no crea ni aprovisiona un actor. |
| AFI `afi-agent-intake/v1` | Sigue siendo un intake independiente de conocimiento y datos. Este envelope no mezcla sus listas ni cambia su esquema. |

Se inspeccionaron los contratos, validadores, ejemplos `.afi.json`, manifest y catálogos de ambos proyectos. El cambio productivo de Word se limita a SDE; se reutilizan la plantilla y las utilidades OOXML existentes de AFI, sin alterar el generador AFI.

## Archivos y campos

- [JSON Schema cerrado](contrato.schema.json), versión `qa-diseno-hibrido/v1.1`.
- [Ejemplo completo HU06 CP02](piloto/HU06-CP02.diseno.json), 22 pasos y 12 datos, construido con el cargador SDE.
- [Entrada documental](piloto/entrada-documental.md), transcripción del diseño y datos permitidos, sin credenciales.

| Campo | Significado |
|---|---|
| `hu`, `caso`, `escenario`, `objetivo` | Identidad y propósito. En SDE se contrastan contra la matriz. |
| `nativo` | Motor, archivo nativo y SHA-256. El archivo sigue sujeto a su validador propio. |
| `perfilRevision` | Referencia y hash del perfil semántico registrado localmente. Protege relaciones y obligaciones revisables; la gema no puede aportar un perfil alternativo para evitar los controles. |
| `planEjecucion` | Orden efectivo de capacidades nativas únicas y condiciones causales entre ellas. No es el orden documental de los pasos. |
| `fuentes` | Identificador, ruta documental, localizador y hash. Una modificación exige nueva revisión. Un hash garantiza identidad del archivo, no corrección funcional. |
| `actores` | Usuario lógico y rol documentado; nunca nombres reales, contraseñas o tokens. |
| `precondiciones` | Condiciones descritas y datos que necesitan, con fuente. No son prueba de que hoy se cumplan. |
| `datos` | Campo, uso, resolución, sensibilidad, naturaleza, valor permitido o referencia local, fuente y ejemplos válidos/inválidos por id. |
| `pasos` | Orden documental, acción y esperado literal, campos, actor, datos usados, dependencias causales, evidencia y modalidad. `matriz` enlaza al diseño; `capacidadesNativas` enlaza a las acciones expandidas del motor. |
| `pasos[].responsabilidades` | Trabajo del robot y del analista, parte cubierta automáticamente y pendiente manual, evidencia para cada comprobación y quién decide continuar, con condición y salida si no se completa. Es una definición de cobertura prevista, nunca un resultado PASS. |
| `faltantesDeclarados` | Información que el diseñador identifica como pendiente, fuera del payload ejecutable. El validador también deriva sus propios bloqueos. No se trasladan estas propiedades al contrato AFI. |

El schema rechaza propiedades no previstas. El validador local implementa explícitamente el subconjunto utilizado por este schema: objetos cerrados, referencias a definiciones, tipos, valores enumerados, constantes, patrones y mínimos. No pretende validar esquemas arbitrarios ni sustituir un validador JSON Schema general.

## Datos sin invenciones

La **sensibilidad** indica privacidad; la **resolución** indica cómo obtener el dato; la **naturaleza** indica si es un literal público, un sintético permitido o un dato QA que debe existir. Son dimensiones distintas.

- `literal`: únicamente público y sustentado en una fuente. No se permite para PII, secretos ni registros que deban existir en sistemas externos.
- `referencia`: nombre lógico o referencia canónica que resuelve el framework localmente. No contiene el valor real. En SDE debe coincidir con la variable del dataset, no una variable inventada por Gemini. AFI mantiene sus actorRef/slots y sus propias reglas de secretRef; no se copian las variables SDE a AFI.
- `faltante`: falta el dato; no puede llevar a la vez valor ni referencia resuelta. Se informa antes de ejecutar.
- `sintetico-permitido`: necesita una fuente documental de autorización. No puede declararse a la vez como un registro existente de un sistema externo.
- `qa-existente`: exige referencia y sistema externo. La mera presencia de esa referencia no demuestra existencia, vigencia, pertenencia a un intermediario ni relaciones con otro sujeto: QA debe aprovisionar y acreditar esas condiciones.

Ejemplo: las placas y pólizas del Worker AI de **Masiva** están autorizadas en los datasets actuales. Eso no permite reutilizarlas como pólizas existentes para una consulta **Individual a SISE**. Si la fuente no aclara ese requisito, la gema debe pedirlo y proponer revisión manual, sin inventarlo.

Los ejemplos válidos e inválidos remiten a datos declarados y con procedencia. No se generan automáticamente a partir de una regla supuesta. En el piloto se reutilizan las placas ya documentadas y la negativa de más de seis caracteres; no se añadieron criterios funcionales.

## Validaciones y alcance real

1. **Contrato documental:** estructura cerrada, referencias, ids únicos, dependencias causales sin ciclos compatibles con el orden efectivo, compatibilidad de dato, sensibilidad y sintéticos, cobertura de revisión manual y faltantes.
2. **Fuentes:** rutas locales permitidas, confinamiento al repositorio incluso ante enlaces, existencia y hash. No se abren `.env`, URLs ni secretos.
3. **Puente SDE:** cargador nativo, matriz literal en su orden original, objetivo, campos, roles, actores de paso, capacidades expandidas y valores/referencias de datasets. Deriva los datos exigidos por cada paso del escenario expandido y los compara exactamente; protege precondiciones, plan, dependencias, modalidades y obligaciones contra el perfil local. No inventa una conversión YAML ni modifica escenarios.
4. **Preflight SDE:** usa el preflight vigente, ampliando el inventario a los datasets `requiere` de todos los pasos. Acepta un entorno como parámetro; sus diagnósticos contienen nombres, nunca valores. La muestra usa `{}` para no leer la configuración privada.
5. **Revisión humana:** decisión independiente ligada al hash exacto del contrato. Cambiar el diseño invalida esa decisión. `revisionVigente` comprueba la coherencia del registro, no autentica al revisor; la futura interfaz tendrá que hacerlo.
6. **Ejecución posterior:** siempre por el runner existente, con su autorización E2E, cupo, serialización y barreras. Este validador nunca abre Bizagi ni declara `listoParaEjecutar=true`.

El resultado `VALIDO_PARA_REVISION` **no significa que haya datos QA disponibles ni aprobación funcional**. Los DataGap y CapabilityGap nativos conservan su significado. La propuesta es aditiva: en esta fase el puente estricto implementado es SDE; AFI conserva sus validadores y su ejemplo nativo se comprueba por regresión. Un puente de intake AFI equivalente queda para la siguiente fase; el wrapper genérico por sí solo no certifica fidelidad AFI.

## Orden, dependencias y capacidades compartidas

En CP02 los 22 pasos permanecen en el orden de la matriz. El runner expande 34 capacidades, ejecutadas una sola vez en orden 1–34. P18 usa 31–34, después de P22 (27–30). P19 usa 23 y no depende de P18. P17 y P19 comparten la capacidad 23: sus referencias documentan cobertura común y no implican repetir Guardar.

`dependeDe` expresa una condición causal entre pasos completos; no una lista automática de predecesores documentales. Cuando dos pasos comparten una capacidad, no se crea una dependencia del paso consigo mismo: se describe en las condiciones del plan nativo (por ejemplo, capacidad 22 antes de 23). Se rechazan circularidades, orden invertido, referencias inexistentes, capacidades duplicadas y dependencias incompatibles con el recorrido. Estas comprobaciones no cambian Playwright ni implementan otro runner.

Para cada paso híbrido se conserva el esperado completo. `cubiertoAutomaticamente` delimita lo que intentarán las capacidades existentes; `pendienteManual` expresa la parte restante, con evidencia, responsable y condición de continuación. Si no se completa la intervención, se detiene o se cierra documentalmente con pendiente sin reanudar, según la definición. Este contrato no implementa una pausa/reanudación real ni habilita continuar una ejecución histórica. En P18 se revisan por separado longitud y recuperación; P14/P22 requieren revisar reglas y contenidos además de presencia/navegación.

## Cambios legítimos y revisión controlada

El perfil [HU06-CP02-v1.1.json](../../projects/seguros-del-estado/data/qa-hibrida/HU06-CP02-v1.1.json) está marcado **propuesta para revisión**, sin aprobación QA. Es una línea base técnica inspeccionable, independiente del JSON que proponga la gema. El puente registra una ruta concreta y no acepta que el intake seleccione otra para rebajar obligaciones. El Schema comprueba estructura; por sí solo no garantiza fidelidad funcional.

Una revisión futura aprobada por QA debe: registrar la fuente y referencia real de la decisión; conservar la versión previa; crear una nueva versión del perfil con el cambio y su motivo; actualizar expresamente el registro del puente y los hashes calculados localmente; revisar los cambios de fuentes nativas solo si corresponden; y ejecutar las regresiones de fidelidad. La aprobación documental anterior deja de ser vigente al cambiar el hash. No se fabrica una aprobación para legitimar cambios en esta fase. AFI mantiene su contrato nativo y no acepta estas propiedades nuevas dentro de sus casos.

## Comprobación sin Bizagi

```powershell
node tools/qa-diseno/validar.mjs docs/qa-hibrida/piloto/HU06-CP02.diseno.json
node tools/run.mjs seguros-del-estado qa-diseno.tool --grep '@qa-diseno' --workers=1 --retries=0 --reporter=line --output=tmp/qa-diseno
```

El primer comando valida estructura y fuentes. El segundo añade fidelidad SDE y preflight con entorno vacío; no solicita fixtures de navegador ni ejecuta capacidades UI. El informe completo queda en `test-results/qa-hibrida/HU06-CP02-validacion.json`. Su ausencia de valores reales es intencional; la validación local futura puede recibir un entorno autorizado sin registrarlo en el JSON.

## Revisión futura sin editar JSON

La futura interfaz mostrará una ficha con objetivo, rol, precondiciones, tabla de pasos, datos y sus fuentes, faltantes y diferencias con el diseño. El analista podrá corregir campos de la ficha y aprobar el **diseño**, sin ver ni editar JSON. La interfaz guardará el contrato y una decisión aparte, autenticada y vinculada al hash. Habrá acciones diferentes para aprobar diseño, autorizar ejecución y aprobar resultado funcional. Gemini no emite ninguna de esas aprobaciones.

## Riesgos y siguiente fase

- Un archivo documental puede estar equivocado aunque su hash sea correcto. QA debe resolver ambigüedades y versiones de fuente.
- Sin sesión real no se demuestra que las opciones, permisos y parametrización sigan vigentes. Esta fase no los consultó.
- PII mal etiquetada requiere catálogos, revisión humana y controles adicionales; el wrapper no es un anonimizador general.
- Los índices expandidos de SDE son verificables, pero cambian si cambia el escenario. El hash impide reutilizar silenciosamente una revisión vieja; a futuro conviene una identidad semántica estable por capacidad.
- El mensaje de continuidad se basa en acciones posteriores registradas, no en una promesa de que una acción concreta sea independiente o repetible.
- Los pop-ups conservan UI-10/BUG-03. Un diseño válido no prueba un cierre seguro ni autoriza cancelar o forzar su cierre.

Para las próximas 2–3 semanas: acordar con QA la ficha mínima, completar datos y esperados de presentación/mensajes, revisar este piloto con dos analistas y registrar vocabulario comprensible. Después, probar el intake con varios diseños anonimizados, medir faltantes y fidelidad, implementar el puente AFI y la revisión autenticada. Una ejecución híbrida futura debe autorizarse por separado y mantener las barreras actuales. No hace falta construir todavía una interfaz ni un motor nuevo.
