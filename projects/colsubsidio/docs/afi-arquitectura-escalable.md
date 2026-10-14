# AFI — Arquitectura escalable (Fase 4J)

**Objetivo:** una HU nueva de Afiliaciones que use pantallas y tipos de control ya conocidos debe requerir **cero cambios de código del framework**. El código solo cambia cuando aparece una primitive técnica genuinamente nueva.

Estado de cada pieza: ✅ implementado y probado · 🧪 vertical slice (probado, no conectado al runner) · 📐 diseño.

## 1. Capas

```
Conocimiento (declarativo, versionado)          Runtime (código, cambia poco)
─────────────────────────────────────           ──────────────────────────────
Application Model  pantallas + campos     ───►   reconocerPantalla · alcanzarPantalla
Field Registry     campos funcionales     ───►   operaciones genéricas (driver UI), validador, manifest, máscaras
Reglas con alcance knowledge/afi-rules.json ─►   contexto aclarado para el agente
Diseño QA + HU     (entrada por caso)     ───►   agente -> DefinicionCasoAfi | aclaraciones | gap técnico
```

Una HU nueva solo toca la columna izquierda; si necesita tocar la derecha, eso es un `FRAMEWORK_GAP` y se mide (§9).

## 2. Application Model 📐/🧪 — `data/afi/aplicacion/pantallas.ts`

- **Pantalla**: id semántico estable (`EtapaAfi`), **señales** (encabezado con textos exactos, controles característicos por su campo de dominio), `minimo` de señales, `preparable`, acción de avance (`continuar`) y `siguientes` posibles.
- **Campos de la pantalla**: se **derivan** de `POLITICAS_AFI` (`camposDePantalla`), no se redeclaran.
- **Campo** (preparación): `POLITICAS_AFI` ya declara pantalla, control, sensibilidad, origen y reglas de resolución; su localización vive en el driver de datos. **Campo** (funcional): Field Registry (§3).
- Las firmas actuales se derivan de selectores/textos ya demostrados en el piloto; **no se han verificado en QA real** y no gobiernan todavía el runner.

## 3. Field Registry ✅ — `data/afi/aplicacion/campos.ts`

- Registro único: `REGISTRO_CAMPOS_FUNCIONALES` (hoy `departamento`, `ciudadVivienda`). Cada entrada: etiqueta + **localización semántica** (`atributo-dominio` formcontrolname o `nombre-accesible`). Para campos que ya existen en el modelo, pantalla/control/sensibilidad se **toman de las políticas**; redeclararlos es error.
- **Capacidades por control** (`CAPACIDADES_CONTROL`: estado, valor, texto, catálogo, sugerencias) y **capacidad requerida por operación** (`CAPACIDAD_REQUERIDA` en `funcional.ts`): la aplicabilidad es genérica.
- Consumidores (sin conocer campos concretos): validador (`validarPlanFuncionalAfi(plan, registro)`), driver UI (`localizarCampo`), manifest (`funcional.campos`, `camposAplicables`), máscara PII de evidencias (campos no públicos; si no hay máscara expresable → evidencia cliente bloqueada).
- Fail-closed: campo fuera del registro → capability; operación cuya capacidad no ofrece el control → capability; campo nuevo incompleto o localización duplicada → registro inválido.
- **Registrar `localidad`** en el futuro = una entrada en el registro (+ su política en el modelo si es de preparación). Ninguna operación se edita. Si su comportamiento requiere una capacidad que no existe (p. ej. sugerencias sin fuente autoritativa), eso sí es primitive nueva.

## 4. Reconocimiento de pantalla ✅ — `helpers/reconocerPantalla.ts`

`reconocerPantalla(page)` evalúa en una instantánea (sin esperar ni navegar) las señales de cada pantalla del modelo y devuelve **exactamente una**; `PantallaNoReconocidaError` si ninguna, `PantallaAmbiguaError` si varias. Un encabezado obligatorio ausente descarta la pantalla. Una señal sobre un campo sin localización conocida invalida el modelo (no cuenta como "ausente").

## 5. Navegación por objetivo 🧪 — `data/afi/aplicacion/navegacion.ts`

`alcanzarPantalla(objetivo, { reconocer, preparar, continuar })`: reconoce → si es el objetivo, fin → prepara (solo pantallas `preparable`, una vez) → continúa → repite. Tolera reordenamiento, pantallas condicionales y ausencia de pantallas no requeridas; falla ante pantalla desconocida, objetivo inalcanzable (grafo `siguientes`), ciclo y exceso de transiciones.

**Migración propuesta** (📐): (1) ejecutar el reconocimiento en paralelo al runner v1 en QA real y comparar con las etapas observadas (solo registro); (2) cuando coincida en todos los perfiles, sustituir el bucle de transición del runner por `alcanzarPantalla('informacion-contacto', …)` conservando la completitud de preparación; (3) permitir `alcanzar:` en un contrato v2. `etapas` del contrato v1 no cambia.

## 6. Reglas funcionales con alcance ✅ — `data/afi/aplicacion/reglas.ts`

- Alcances: aplicación < módulo < pantalla < campo < HU < caso (gana la más específica; empate = conflicto, fail-closed).
- Claves con significado funcional y valores cerrados (`autocomplete.coincidencia | diacriticos | mayusculas`); una regla solo aplica a los controles de su clave.
- **No se sembró ninguna regla**: la única evidencia confirmada viene de una HU y un campo; no hay base para declararla de alcance módulo/aplicación. Cuando QA la confirme como general, entra por `incorporarRegla` con esa fuente.

## 7. Modelo de aclaración ✅ — `data/afi/aplicacion/conversacion.ts`

`ClarificacionAgente { id, pregunta, motivo, tipo, opciones?, alcanceSugerido, bloquea, clave? }` con tipos `regla-negocio | dato-prueba | condicion | resultado-observable | alcance`. `mensajeParaQa` produce "Necesito confirmar N cosas antes de generar este caso." + preguntas numeradas. `aplicarRespuestas` persiste las reglas de negocio (con alcance confirmado) y deja el resto como respuestas del caso; devuelve `ContextoAclaradoAgente` para reenviar al compilador del agente. `aclaracionesPendientes` omite lo que el conocimiento ya resuelve.

## 8. Pregunta de negocio vs gap de framework ✅

| Salida | Audiencia | Lenguaje | Resolución |
|---|---|---|---|
| `CLARIFICATION_REQUIRED` | analista QA | funcional (se rechaza jerga técnica) | conversación |
| `FRAMEWORK_GAP` | equipo de automatización | capability y familia | desarrollo; **nunca** se muestra como pregunta al QA |

Correspondencia con el protocolo actual del manifest: `INFORMACION_INSUFICIENTE → CLARIFICATION_REQUIRED`, `CAPABILITY_GAP → FRAMEWORK_GAP`. El manifest v1 aún emite los nombres anteriores (📐: publicar el contrato conversacional en el manifest cuando se conecte la API del agente).

## 9. Persistencia ✅ — `knowledge/afi-rules.json`

Esquema `afi-rules/v1`: versión monotónica del almacén; cada regla con clave, valor, **texto humano**, alcance, fuente (`aclaracion-qa | requerimiento | diseno-qa` + referencia), versión, fecha y estado (`vigente | reemplazada`, con `reemplazadaPor`); `historial` de altas y reemplazos. Validación: PII (correos, secuencias largas de dígitos), claves/valores cerrados, un solo vigente por clave+alcance. Recomendación: el archivo se cambia solo por la función de alta y por revisión de código (auditable en git).

## 10. Métricas de escala ✅ — `data/afi/aplicacion/metricas.ts`

Por caso: sesiones del agente, preguntas funcionales, gaps técnicos, campos nuevos en el registro, operaciones nuevas, cambios de código (runtime vs declarativos), minutos hasta compilable. `evaluarObjetivoArquitectonico` comprueba 0 operaciones nuevas, 0 cambios runtime y solo cambios declarativos; las preguntas se registran **sin umbral** hasta tener datos.

## 10b. Modelo multi-superficie de testabilidad (Fase 4L) 🧪

`REQUISITO → CONDICIÓN OBSERVABLE → SUPERFICIE → PROVEEDOR → EVIDENCIA` (`data/afi/aplicacion/superficies.ts`).

- **Taxonomía cerrada** de entidades: `pantalla-ui`, `campo-ui`, `actividad`, `ruta`, `integracion`, `variable`, `notificacion`, cada una con sus expectativas (`visible`, `alcanzada`, `tomada`, `resultado`, `valor`, `emitida` y negaciones). Un dato interno no es campo UI; una ruta no es pantalla; un id pertenece a un solo tipo.
- **Superficies**: `portal-ui`, `proceso-bpm`, `integracion`, `notificacion`, cada una con los tipos que observa.
- **Proveedor** (`ObservationProvider { id, superficie, supports, observe }`): mide un HECHO neutro (`presencia`, `valor`, `resultado`) y devuelve evidencia portable; el veredicto lo calcula `evaluarExpectativa` con la expectativa del CASO. La misma condición puede observarse por otro proveedor sin reescribir el caso. Sin proveedor: `NO_OBSERVABLE` + gap.
- **Application Model extendido** (`modeloAplicacion.ts`): `ui` (pantallas 4J + Field Registry, proyectados) + `proceso` (actividades, rutas) + `integraciones` + `variables` + `notificaciones`, todo declarativo; hoy vacío fuera de UI (sin conocimiento de HU concretas).
- **Diagnóstico** (`gaps.ts`): `CLARIFICATION_REQUIRED` (falta entidad o expectativa: qué significa PASS/FAIL) · `KNOWLEDGE_GAP` (definida pero no registrada: se declara) · `TESTABILITY_GAP` (definida y registrada, sin proveedor) · `INVALIDA` (clase de entidad equivocada). Nunca se pregunta a QA qué validar si la condición ya está definida.
- **Taxonomía de gaps extensible**: `conocimiento-declarativo` (no runtime), `provider-superficie`, `operacion-interaccion`, `orquestacion`; la familia de backlog es opcional y nunca se fuerza.
- **Deduplicación**: `GapTecnico { idSemantico, clase, superficie, capacidad, ocurrencias[] }`; N casos con la misma capacidad = 1 gap técnico.
- **Declarativo vs runtime** (`clasificarIncorporacion`): entidades, campos compatibles y reglas son declarativos; proveedores, superficies, interacciones y orquestación son runtime.
- **Métricas** (`medirSuperficies`): superficies requeridas, proveedores reutilizados/nuevos, entidades declarativas nuevas, gaps únicos y ocurrencias; `sinRuntimeNuevo`.
- **Manifest futuro** (`publicarSuperficies`): superficies, observaciones soportadas y estado `con-proveedor`/`sin-proveedor`. Diseñado, **no publicado** en el manifest del agente.
- Vertical slice: solo proveedores **en memoria** (`proveedoresMemoria.ts`). Ningún proveedor productivo implementa aún la interfaz: la UI real sigue en el runner (AfiFunctionalUi, reconocerPantalla) sin adaptar.

## 10c. Intake de conocimiento declarativo (Fase 4N) ✅

`KNOWLEDGE_GAP → KnowledgeProposal → validación → PENDING_REVIEW → APPROVED | REJECTED | NEEDS_CHANGES → (solo APPROVED) almacén → Application Model → re-diagnóstico` (`data/afi/aplicacion/propuestas.ts`).

- **Contrato** `afi-knowledge-proposal/v1`: una entidad atómica (unión discriminada por los 7 tipos, cada uno con sus datos propios; lo desconocido queda pendiente, nunca inventado), alias, origen (fuente + ocurrencias), evidencia semántica, estado y revisiones (revisor abstracto, fecha, versión, comentario, hash del contenido).
- **Validación fail-closed**: esquema, `NO_ATOMICA` (tipo compuesto o varias entidades), estructura por tipo, referencias registradas, fuente/ocurrencias/evidencia, PII, selectores, código, proveedores, instrucciones ejecutables, `YA_REGISTRADA`, `CONFLICTO_TIPO`, `NO_ES_ENTIDAD` (reglas y expectativas no son entidades).
- **Tipo ambiguo**: `SolicitudClasificacion` (`NEEDS_CLASSIFICATION`, alternativas excluyentes); la persona elige UN tipo y nace una propuesta normal.
- **Deduplicación**: solo se fusiona lo inequívoco (mismo tipo, id y datos); nombres similares (`claveNormalizada`), mismo id con datos distintos o misma clave con otro tipo → `POSSIBLE_DUPLICATE`.
- **Aplicación** (`aplicarPropuestasAprobadas`): solo APPROVED cuyo contenido no cambió desde la aprobación; lote atómico (un conflicto anula todo); nueva revisión del almacén con historial; declarativo, sin runtime ni proveedores.
- **Persistencia**: `knowledge/application-model.json` (`afi-application-model/v1`, `revision`, `entidades`, `historial`), hoy vacío; el modelo canónico y el manifest se construyen desde él. Migración 4J progresiva: una entidad TS pasa al almacén cuando se toque, nunca en bloque.
- **Agente**: salida adicional machine-readable `knowledgeProposals` (y `classificationRequests`), recibida por `recibirPropuestasDelAgente`: todo entra como `PENDING_REVIEW`; auto-aprobaciones rechazadas. Publicada en el manifest desde 4O (`knowledgeIntake`); complementa, no reemplaza, el bloque humano `KNOWLEDGE_GAP`.
- **Métricas** (`medirIntake`): gaps de conocimiento, propuestas generadas/únicas/aprobadas/rechazadas/pendientes, posibles duplicados, entidades añadidas, `cambiosRuntime: 0` y pasadas hasta dejar `KNOWLEDGE_GAP`.

## 10d. Intake operativo a disco (Fase 4O) ✅

```
salida del agente (JSON o .md con UN bloque json)  --preparar-->  knowledge/review/<lote>.review.json  (+ <lote>.decisiones.json, todo en null)
humano completa <lote>.decisiones.json (proposalId + hash + revisionBase)  --aplicar [--dry-run]-->  application-model.json (revision+1) + manifest
```

- **CLI**: `node tools/afi.mjs <proyecto> conocimiento preparar <salida>` y `... conocimiento aplicar <review> <decisiones> [--dry-run]` (`tools/afi-conocimiento.mjs` → harness `tests/afi-conocimiento.spec.ts` → `intakeLote.ts` puro + `intakeDisco.ts` E/S).
- **PII contextual** (`sensibilidad.ts`): contenido semántico estricto; metadatos de fuente admiten fechas compactas (`YYYYMMDD[hhmm[ss]]`) e ids documentales con prefijo alfabético; correos y números personales se bloquean en ambos.
- **Artefacto de revisión** determinista (`afi-knowledge-review/v1`): propuestas válidas con hash y dependencias, rechazadas (motivo; sin copiar su contenido), posibles duplicados, solicitudes de clasificación, `revisionBase` + hash del almacén base, métricas. Sin decisiones.
- **Decisiones** (`afi-knowledge-decisions/v1`): APPROVED / REJECTED / NEEDS_CHANGES por proposalId + hash; `null` = sin decidir. Aprobar las dos partes de un POSSIBLE_DUPLICATE exige `noEsDuplicadoDe`. Clasificar produce una propuesta PENDING_REVIEW en un lote de seguimiento: nunca aprueba.
- **Aplicar**: lote, revisionBase y hash del almacén (conflicto si cambió) → hashes → orden topológico de dependencias dentro del lote (una dependencia no aprobada o un ciclo fallan) → almacén final validado → candado + escritura temporal + rename → manifest regenerado → `<lote>.resultado.json`. Reaplicar = `YA_APLICADO` (el historial guarda el `lote`).
- Aprobar una pantalla o un campo UI la vuelve **conocida**, no operable: firmas y localización siguen siendo código.

## 10e. Cierre de observabilidad productiva (Fase 4R) 🧪

**Fuentes reales encontradas en el repo** (nada más existe; `ApiHelpers.getCaseState` es un stub que lanza):

| Fuente | Qué da | Estado |
|---|---|---|
| OData `POST /odata/data/processes(<guid>)/start` (`BizagiApiClient`) | crear caso → número | QA real; único endpoint autorizado (MODO-SERVICIO §11) |
| OData `/odata/data/entities(<id>)/values` (interceptado en el Portal) | catálogos paramétricos | QA real; no es estado de caso |
| Work Portal Admin → Casos (`BizagiQaSupport.actividades`) | tareas **pendientes ahora** del caso propio | QA real, solo lectura |
| Recognizer 4K (`reconocerPantalla`, shadow) | pantalla actual | 2 corridas CP04: 1 match / 3 por corrida, 1 **ambigua** en cada una |

**Observabilidad por superficie:** `proceso-bpm` → solo `actividad.alcanzada` (instantánea de tareas pendientes). `ruta`, `variable`, `integracion`, `notificacion` → **sin fuente** (TESTABILITY_GAP). `proceso-bpm` e `integracion` podrían compartir una fuente (datos del caso por OData), pero el repo no la demuestra: no se fusionan ni se separan proveedores hasta confirmarla.

**Frontera fail-closed** (`superficies.ts`, `observacion.ts`, `gaps.ts`):
- `observe()` puede devolver `{ noObservable: infraestructura | autenticacion | dato-ausente | error-proveedor }` o lanzar `ObservacionNoDisponibleError`; cualquier otro error = `error-proveedor`. Resultado `NO_OBSERVABLE` + `noObservado.intentos`, nunca FAIL; se prueba la siguiente superficie efectiva. Mensajes de error nunca se copian.
- `ObservationProvider.expectativas` (opcional): lo que el proveedor CERTIFICA. Ausente = todas (compatibilidad 4L). Observación y diagnóstico usan la misma regla (`proveedorCertifica`); el gap es atómico (`observar actividad no-alcanzada`).
- Medición de tipo incompatible = `error-proveedor`. Medición de valor se publica sin el valor (PII).
- `ContextoObservacion` solo admite `caso`, `ejecucion`, `casoBizagi` (correlación runtime numérica): un `actorRef` o estado de provisión se rechaza.

**Primer proveedor con fuente real** (`proveedorTareasPendientes.ts` + `helpers/fuenteTareasBizagiQa.ts`): `proceso-bpm`, solo `actividad`, solo `alcanzada`. Tarea vinculada presente → PASS; ausente → `dato-ausente` (ya pasó, no llegó o es automática). **No registrado en `PROVEEDORES_PRODUCTIVOS`**: el vínculo actividad → nombre de tarea Bizagi no tiene lugar declarativo (el contrato 4N rechaza campos extra y localizadores) y el adaptador no se ha corrido en QA real.

**Pendiente para cerrar el resto** (decisiones/insumos, no código por HU):
1. Vínculo técnico declarativo (actividad → tarea; ruta → transición; variable → xpath/atributo; integración → interfaz) en el almacén, con su revisión humana.
2. Confirmar con el cliente un endpoint de LECTURA de caso (workitems/datos) y el alcance del token; una consulta GET sobre un caso propio, autorizada antes de ejecutarla.
3. Notificaciones: requiere un buzón QA controlado con API de lectura (p. ej. Graph/IMAP) o el log de correos de Bizagi; no existe ninguno.
4. `pantalla-ui.visible`: firmas sin ambigüedad en QA real y firma de la pantalla declarada (hoy sin señales).
5. `reconocimiento-facial` sigue `NEEDS_CLASSIFICATION`.

## 10f. Vínculos de observación + puente al runner (Fase 4R.1) 🧪

`condición del caso → entidad → vínculo aprobado → proveedor → fuente`, sin ids concretos en runtime.

- **Vínculo** (`aplicacion/vinculos.ts`): `{ entidad: {tipo,id}, superficie, proveedor, localizacion }`. Esquema cerrado; la localización solo admite las claves que declara `CATALOGO_PROVEEDORES[proveedor]` (hoy `tareas-pendientes-bizagi: { nombreTarea }`), texto de una línea sin PII/selectores/código/URLs. Entidad registrada con ese tipo, superficie = la del proveedor y efectiva, proveedor que localiza ese tipo. Conjunto: uno por entidad+proveedor (contradictorio) y ninguna localización compartida por dos entidades (ambiguo).
- **Persistencia**: sección SEPARADA del mismo almacén (`vinculosObservacion` + `historialVinculos` en `application-model.json`, opcional: sin ella = ninguno). Las entidades no cambian; el 4O conserva la sección (`...almacen`).
- **Revisión humana**: `conocimiento vinculos-preparar <vinculos.json>` → `kb-*.review.json` + decisiones en null; `conocimiento vinculos-aplicar <review> <decisiones> [--dry-run]` → solo APPROVED con hash + revisor, revisionBase/hash del almacén, candado + escritura atómica, idempotente (`YA_APLICADO`). Un agente no puede auto-aprobar (clave ajena = rechazo).
- **Contrato** (aditivo v1): `funcional.pasos[].condiciones?: [{ entidad, expectativa }]`, la representación verificable del mismo `esperado`. Un paso puede tener `operaciones: []` solo si tiene condiciones. Paso con claves cerradas.
- **Compilador** (`resolucionObservacion.ts`): no registrada → KNOWLEDGE_GAP; solo portal-ui → CAPABILITY_GAP; sin vínculo / expectativa no certificable / proveedor no habilitado → TESTABILITY_GAP (`motivo`). Habilitados por defecto = `PROVEEDORES_PRODUCTIVOS` (vacío). `compilado.observacion` lleva proveedor+superficie, nunca la localización.
- **Runner**: tras las operaciones del paso, `observarCondicionesPaso` usa SOLO el proveedor resuelto; contexto `{caso, ejecucion, casoBizagi}` con el número de la corrida. Reintenta solo `dato-ausente`. Paso/caso `NO_OBSERVABLE` (ni PASS ni FAIL); FAIL de una condición = `CondicionObservableFallidaError`. Resultado en `<prefijo>-observaciones.json` (técnico, sin valores ni textos de la fuente).
- **Disponible ≠ productivo**: `ProveedorTareasPendientes` es `disponible`. Usarlo exige DOS opt-in explícitos: `proveedoresHabilitados` al compilar y `observacion.permitirNoProductivos` al ejecutar; el resultado queda marcado `observacionValidacion: true`.

## 10g. Primer proveedor productivo, alcance parcial (cierre 4R) ✅

- **Validación real (4R.2)**: CP04 Pensionado, entidad + vínculo de VALIDACIÓN solo inyectados en `tests/validacion-tareas-proveedor.real.spec.ts`. Dos corridas independientes (caso nuevo, correlación, `actividad.alcanzada` PASS, cleanup PASS) con el proveedor aún no productivo y doble autorización; smoke post-promoción PASS sin autorizaciones. 0 PII en logs y artefactos.
- **Promoción**: `IDS_PROVEEDORES_PRODUCTIVOS = ['tareas-pendientes-bizagi']`. Su alcance NO se redeclara: `PROVEEDORES_PRODUCTIVOS` lo deriva de `CATALOGO_PROVEEDORES` (ahora en `superficies.ts`, fuente única): `actividad` + `alcanzada` en `proceso-bpm`.
- **Publicación**: `publicarSuperficies` añade `cobertura` por proveedor (entidad → expectativas certificadas) y el estado `parcial`; `proceso-bpm` queda `parcial`, nunca "con-proveedor" por un proveedor parcial.
- **Provider ≠ binding**: sin vínculos aprobados, `observablesHoy` sigue vacío y ningún diagnóstico cambia (test de "mera existencia"). La asociación entre el work item de validación y la pantalla del Portal queda NO DETERMINADA y no se persiste.

## 10h. Preparación según estado: información de la empresa (Fase 4S-R.1) 🧪

- Etapa `informacion-empresa` (Empleador **Persona Jurídica**, botón `btn-empleador-pj-continuar`) dentro del MISMO loop de
  preparación del runner (sin runner paralelo). Política `segunEstado`: ausente o deshabilitado → no se toca; precarga válida →
  se conserva; habilitado y vacío/inválido → dato legítimo del plan o `DataGapPantallaError` (tras preparar lo resoluble y
  re-evaluar). Un control inválido sin política se reporta como `control-no-declarado`. Sus gaps NO bloquean la compilación
  (`PlanPreparacion.condicionales`); una aserción sin valor sigue siendo gap duro.
- Identidad semántica: `codigoCiiu` (el DOM publica la errata `ciuu`, conocida solo por `UI_EMPRESA` en `afiDataUi.ts`),
  `actividadEconomicaEmpresa` (distinta de `actividad` del Independiente), `razonSocial`, `fechaInicioActividad`, `valorNomina`,
  `numeroTrabajadores`, `afiliadoPrimeraVez`.
- Clasificación: naturaleza, clase de empleador, NIT y DV = PRECARGADOS (sin capability: jamás se tocan); tipo de organización y
  sigla = OPCIONALES; CIIU y demás hechos de negocio de la empresa = DATO DEL ACTOR (pii, pedibles), nunca inventados. Un catálogo
  cerrado solo prueba validez sintáctica: el CIIU del actor se escribe en el autocompletar predictivo y se elige SOLO la opción
  coincidente única (`coincideOpcionCatalogo`); sin coincidencia única o sin panel → CapabilityGap; sin dato → DataGap. Nunca
  "primera opción". La actividad económica se re-observa tras el CIIU (el Portal podría derivarla; no se asume).
- Test Data: lote `kd-c970835c84c0dbf0` amplía los actores Empresa existentes vía `mismoActorQue` (que ahora también añade
  condiciones nuevas del requisito, p. ej. "sin solicitud de afiliación en curso"; nada se reemplaza).
- `diagnosticoAntesDeContinuar` puede devolver `'detener'` (corte técnico con cleanup; `PreparacionDetenidaError`).
- Pendiente: decisión humana del lote de datos `kd-c970835c84c0dbf0` y smoke real autorizado (`smoke-informacion-empresa-pj.real.spec.ts`).
  La variante Empleador Persona Natural no está observada (la etapa no se activa sin el botón PJ).

## 10i. Datos mínimos: obligatorio en la UI ≠ obligatorio en Test Data 📐 (diseño aprobado, no implementado)

Regla general (detalle normativo en [AFI-TEST-DATA.md §7](../data/afi/AFI-TEST-DATA.md)). Cada campo necesario para recorrer un
caso se describe en tres dimensiones ortogonales: `uso` (`ASSERTION`/`SCENARIO`/`FILLER`, lista), `resolucion`
(`TEST_DATA`/`CASE_LITERAL`/`GENERATED`/`SYSTEM`) y `aplicabilidad` (`siempre` o condición semántica `cuando`). Solo los
`TEST_DATA` (datos semánticos, externos, secretos o no generables) llegan a Test Data/`.env`.

```
Gemini --(uso + resolucion + aplicabilidad)--> .afi.json --> compilador --+--> testDataRequirements (TEST_DATA por sujeto; condicionales con cuando)
                                                                          +--> generadores (FILLER + GENERATED autorizado por política/Knowledge)
                                                                          +--> literales del caso (CASE_LITERAL públicos)
                                                                          +--> sistema (SYSTEM: no se suministra; puede verificarse)
                                                                          +--> gaps (clasificación no demostrable -> TEST_DATA requerido)
```

- **Autoridad**: políticas/Knowledge (`generable` por perfil y etapa, con evidencia). El agente propone; el compilador valida
  las combinaciones legales y degrada a `TEST_DATA` un `FILLER` sin autorización o usado en aserciones/condiciones/relaciones.
- **Aplicabilidad**: semántica (`cuando: { campo, sujeto, operador, valor }`); la presencia en UI es consecuencia verificable.
  `siPresenta` solo mientras la regla funcional no esté aprobada (KNOWLEDGE_GAP de advertencia).
- **Evidencia**: REQ → Knowledge → políticas → QA observado → exploración segura → QA (último recurso).
- **Generación**: semilla `hash(HU + CP + versión + campo)`; valores válidos y no extremos; sintéticos; sin conocimiento de casos.
- **Encaje**: evoluciona las estrategias `AUXILIARY` y la preparación según estado (§10h); se implementa junto con el contrato
  E2E declarativo en `.afi.json` (gaps derivados por el compilador, pantallas por id de Knowledge).

## 11. Qué sigue siendo diseño

- Conectar reconocimiento + navegación por objetivo al runner real (requiere verificar firmas en QA real, por perfil).
- Unificar la localización de campos de **preparación** (hoy en `afiDataUi.ts`) dentro del registro.
- Contrato v2 con `alcanzar:`; publicación del contrato conversacional en el manifest; API del agente.
- Principio de datos mínimos (§10i): dimensiones uso/resolucion/aplicabilidad en el contrato, autorización `generable` en políticas, generadores
  determinísticos y reglas del compilador. Contrato E2E declarativo en `.afi.json` (hoy los casos E2E no tienen loader/validador).
- Reglas iniciales de alcance general (pendiente de confirmación de negocio).
- Captura automática de métricas por sesión del agente.
