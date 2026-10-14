# Backlog de capabilities AFI y modelo de variantes de ejecución (Fase 4C)

> **Estado: diseño (4C) + implementación parcial (4D, ver §11).** Lo soportado está SOLO en
> [AFI-AGENT-MANIFEST.json](AFI-AGENT-MANIFEST.json) (`funcional.operaciones`, `ejecucion.contextos`
> con `soportadoRunnerV1: true`). Lo demás de este documento es propuesta.
> El manifest publica los ids de familia de este documento en `backlog.familias` (sección separada,
> `soportado: false`) solo para que el agente clasifique cada `CAPABILITY_GAP`.
>
> **No es material del agente**: contiene el análisis del benchmark CP02 y daría la respuesta.
> No incluirlo en el contexto de un benchmark ni en producción.

Evidencia usada: benchmarks ciegos CP04 y CP02+HU (34 `CAPABILITY_GAP`, cero ambigüedades),
código del piloto histórico (`helpers/afiHu1412.ts`, `cp02Contacto.ts`, `contactoCatalogos.ts`,
`contactoMobile.ts`, `ciudadNacional.ts`, `pdfFormulario.ts`), `resources/hu14-12/CP02.json` y
[docs/afi-hu14-12-implementacion.md](../../docs/afi-hu14-12-implementacion.md).

---

## 1. Desktop / Mobile hoy

| Camino | Cómo se elige el contexto | Desktop | Mobile |
|---|---|---|---|
| Piloto histórico CP01/CP02 | un spec por variante con `test.use(...)` | `afi-hu14-12-cpXX-desktop.spec.ts`, viewport 1365×900 | `afi-hu14-12-cpXX-mobile.spec.ts`, `contextoMobile` = 400×824, `isMobile`, `hasTouch` |
| Contrato (runner v1) | fijo en el harness | `afi-case-file.spec.ts` y `afi-hu14-12-cp04.spec.ts`: `test.use({ viewport: 1365×900 })` | **no existe** |
| `playwright.config.ts` | proyecto único | `devices['Desktop Chrome']`, canal msedge | — |

Cómo funcionaba el piloto:

- **Una sola función** `ejecutarCasoReal(page, context, info, caso, mobile)` para las cuatro combinaciones.
  La variante se elegía por el prefijo `[DESKTOP]` / `[MOBILE]` de cada paso del Excel.
- Los pasos **funcionales** Desktop y Mobile son espejo: CP02 Mobile `P(n+18)` ↔ Desktop `P(n)` para n = 2..17.
  Mismo helper (`ejecutarContactoCP02`) con `mobile: boolean`.
- Lo que cambiaba con `mobile`:
  1. **contexto del navegador** (viewport/touch/isMobile);
  2. **modalidad** de interacción: `touchscreen.tap` vs `mouse.click` al intentar avanzar;
  3. **assertions extra solo mobile**: `verificarAlertaMobile` (geometría: sin desborde, texto no tapado,
     sin superposición con el ícono, dentro del viewport) y "pantalla sin scroll horizontal";
  4. **datos de la variante**: CHÍA/`Chí` en Desktop, SOACHA/`Soa` en Mobile (vienen del diseño, no del contexto);
  5. **alcance**: Desktop incluye P18-P19 (dirección + formulario final); Mobile termina en P35;
  6. **soporte administrativo** en un contexto **Desktop separado** (Bizagi admin no se emula en móvil).
- El runner v1 (`ejecutarCasoAfi`) abre el soporte con `context.newPage()`, es decir, en el **mismo contexto**
  que el Portal. Correcto en desktop; en mobile emularía también Bizagi admin. Es una dependencia para Mobile.

Conclusión: las diferencias 1, 2 y 6 son de **ejecución**; 3 y 5 son **diseño QA** (qué se certifica en
cada variante); 4 son **datos del caso**. Solo las de ejecución son "Desktop/Mobile" propiamente dicho.

## 2. ¿Dónde vive la dimensión Desktop/Mobile?

| Opción | Veredicto |
|---|---|
| **A. En `DefinicionCasoAfi`** (campo `contexto`/`viewport`) | **No.** Mezcla intención funcional con ejecución; obliga a v2; invita al agente a escribir viewports; y una misma intención no podría correr en ambos contextos sin duplicar el JSON. |
| **B. Contexto externo** (lo elige quien ejecuta, como el actor por `perfil`) | **Sí, como base.** Es lo que ya hace el framework (desktop fijo en el harness). |
| **C. Definición superior que expande una funcional en varias ejecuciones** | **Sí, como capa de identidad/planificación**, pero **no** como plantilla que genere las operaciones: CP02 demuestra que Desktop y Mobile difieren en datos (Chía/Soacha), en pasos (P18-P19 solo Desktop) y en assertions (legibilidad solo Mobile). |
| **D.** | La combinación B + C, descrita abajo. |

### Modelo recomendado (tres capas)

```
MatrizCasoAfi (identidad padre, planificación)            ← futuro; no es contrato del agente
  hu, caso: "CP02", perfil
  variantes: [
    { variante: "desktop", contexto: "desktop", definicion: <DefinicionCasoAfi v1>, pasos: "P02-P19" },
    { variante: "mobile",  contexto: "mobile",  definicion: <DefinicionCasoAfi v1>, pasos: "P20-P35" },
  ]
        │ expande a
        ▼
EjecucionAfi = DefinicionCasoAfi v1 × ContextoEjecucionAfi   ← unidad de ejecución, reporte y cleanup
        │
        ▼
ContextoEjecucionAfi ∈ { desktop, mobile }                   ← catálogo cerrado del framework (contextos.ts)
```

- **`DefinicionCasoAfi` v1 no cambia**: sigue siendo intención funcional, agnóstica del contexto.
- **`ContextoEjecucionAfi`** es un catálogo cerrado del framework ([contextos.ts](contextos.ts)): opciones de
  navegador, modalidad de interacción, soporte, límites. Nunca aparece en el JSON.
- **`EjecucionAfi`** = (definición, contexto). Es la identidad del resultado: `hu / caso / perfil / contexto`.
- **`MatrizCasoAfi`** agrupa variantes bajo el caso padre. Cuando la intención es idéntica en ambos contextos,
  **varias variantes apuntan a la misma definición** (misma intención × desktop × mobile, sin duplicar
  operaciones). Cuando el diseño las diferencia (CP02), cada variante tiene su definición.
- "Clic" y "tap" son la misma operación funcional: el driver elige la modalidad según el contexto.
- Una assertion que solo aplica en un contexto (legibilidad en ancho móvil) es una **capability funcional**
  (`componente-visual`), que el diseño incluye en la variante que la pide. No es parte del contexto.

## 3. Granularidad de casos (CP02)

El sistema debe modelar CP02 como **un caso padre con dos ejecuciones**:

```
CP02                              identidad padre (metadata)
├── CP02 / Independiente / Desktop   pasos P02-P19   contexto desktop
└── CP02 / Independiente / Mobile    pasos P20-P35   contexto mobile
```

- La partición se hace por el **prefijo de variante** del paso (`[DESKTOP]` / `[MOBILE]`), igual que el piloto;
  no se cambia el Excel.
- Los ids de paso se conservan tal como los certifica el diseño (P20…P35 en Mobile); no se renumeran.
- Con v1, la identidad de variante se expresa en `nombre` (`"CP02 Independiente Desktop"`) y `caso` conserva el
  id padre. El contexto lo aplica quien ejecuta.
- El resultado del padre es el agregado de sus ejecuciones; una variante no ejecutable (contexto no soportado)
  deja al padre **no certificado**, nunca PASS parcial silencioso.

## 4. Entrada dinámica del agente: `ContextoTrabajoAfi` (conceptual)

```jsonc
{
  "metadata":      { "hu", "caso", "nombre", "perfil"?, "fuente" },   // OBLIGATORIA
  "disenoQa":      { "hoja", "pasos": [{ "id", "accion", "esperado" }] }, // OBLIGATORIO
  "requerimiento": { "texto" | "referencia" },                        // RECOMENDADO; obligatorio para producción
  "objetivo":      { "hoja", "variante"?: "desktop" | "mobile", "pasos"?: "P02-P19" } // OBLIGATORIO si el diseño mezcla variantes
}
```

| Parte | Obligatoria | Uso |
|---|---|---|
| metadata | sí | identidad autoritativa; nunca se infiere del diseño |
| diseño QA | sí | alcance: lo único que se certifica |
| requerimiento | recomendado (producción: sí) | desambiguar términos del diseño ("coincidir", fuente de un catálogo) |
| objetivo | sí si hay variantes | qué variante traducir; sin él y con variantes mezcladas → `INFORMACION_INSUFICIENTE` |

No se implementa parser ni API en esta fase.

## 5. Jerarquía de fuentes (demostrada en benchmarks)

```
metadata       → identidad autoritativa (hu, caso, nombre, perfil, variante)
diseño QA      → qué se certifica
requerimiento  → comportamiento de negocio que ACLARA el diseño
manifest       → qué puede demostrar el framework
contrato       → representación ejecutable
```

Reglas (publicadas en `protocoloDecision.fuentes`):

1. El requerimiento **aclara**, no **amplía**: un requisito de la HU que el diseño no pide no se certifica ni se
   reporta como gap del caso.
2. Contradicción requerimiento ↔ diseño en una condición observable → `INFORMACION_INSUFICIENTE` con ambas
   versiones. Nunca se elige en silencio.
3. Discrepancia metadata ↔ diseño en identidad (caso, perfil, variante) → `INFORMACION_INSUFICIENTE`.
4. El manifest no reinterpreta el diseño: si la capability no existe, es `CAPABILITY_GAP`, aunque la HU sea clara.

Ejemplo real de "aclarar": CP02 P07 dice "municipios que coincidan con 'Chi' (ej. 'Chía')". El diseño no dice
si "coincidir" es *empieza por* o *contiene*, ni si ignora tildes. El piloto observó `CACHIPAY` y `CHIPAQUE`
pero no `CHÍA` (el Portal distingue tildes). Si la HU define la regla, la aplica; si no, ese requisito es
`INFORMACION_INSUFICIENTE`, no una elección del agente.

---

## 6. Taxonomía de familias

Principios comunes:

- **Operaciones genéricas parametrizadas por campo/componente**, nunca por caso ("validar-ciudad-…-cp02" está prohibido).
- **Composición**: una acción (`escribir`, `salir-del-campo`) + una assertion (`campo-valor`) antes que operaciones compuestas por paso.
- Cada operación nueva debe declarar en el manifest `semantica`, `garantiza`, `noGarantiza`, `observado`, como las actuales.
- Nombres de campo/componente son **catálogos cerrados** que el driver mapea a la UI; el diseño nunca aporta selectores.
- Operaciones nuevas son **aditivas** al contrato v1 (nuevos `tipo` en `CONTRATO`); solo lo marcado como
  *decisión de contrato* cambia la forma del JSON.

### componente-visual

- **Intención:** presencia, texto, ubicación relativa y legibilidad de un componente con nombre.
- **Operaciones propuestas:**
  - `componente-visible { componente, texto?: { valor, coincidencia } }`
  - `componente-ausente { componente }` (cierra el `noGarantiza` de `texto-ausente`)
  - `componente-posicion { componente, relacion: "debajo-de" | "encima-de", referencia }`
  - `componente-legible { componente }`: dentro del viewport, sin desborde, texto no tapado, sin superposición interna
  - `pantalla-sin-desborde {}`: sin scroll horizontal ("se adapta al viewport")
- **Catálogo `ComponenteFuncional`:** p. ej. `alerta-territorial`, `subtitulo-localizacion-vivienda`. Motivo:
  el diseño dice "Información de localización **de** vivienda" y la UI "Información de localización vivienda";
  la identidad debe resolverla el driver una vez, no un literal del diseño.
- **Garantiza:** visibilidad, texto exacto (espacios normalizados) y relación geométrica por cajas, en ese momento;
  en legibilidad, las comprobaciones geométricas del piloto.
- **No garantiza:** color o estilo ("amarilla" identifica el componente, no es assertion), contraste, tamaño de
  fuente, legibilidad humana, render de un dispositivo real, que el componente siga visible después.
- **Propiedades visuales (color, ícono):** solo si un diseño las exige explícitamente; hoy ninguno lo hace. No se propone.
- **Campos:** no aplica (componentes, no campos). **Driver:** registro de componentes; geometría (portar `verificarAlertaMobile`).
- **Fuente externa:** no.

### estado-campo

- **Intención:** si un campo admite edición.
- **Operación:** `campo-estado { campo, estado: "editable" | "no-editable" }`. Opcional `"deshabilitado"` solo si un diseño
  distingue deshabilitado de solo lectura (CP02 no: "bloqueado en modo solo lectura" = no editable).
- **Garantiza:** estado del control (visible, habilitado, no readonly) en ese momento, según el tipo de control.
- **No garantiza:** que el backend rechace el valor; que no sea modificable por otro medio; estado futuro.
  Si el diseño exige "impide la modificación manual" como comportamiento, se compone con `entrada-validacion`.
- **Campos:** todos los funcionales. **Driver:** semántica por tipo de control (input autocomplete vs `mat-select`, aria-disabled).
- **Fuente externa:** no.

### valor-campo

- **Intención:** el valor mostrado por un campo.
- **Operación:** `campo-valor { campo, valor, comparacion: "exacta" | "texto-es" }` o `campo-valor { campo, vacio: true }`.
- **Precarga automática:** no requiere operación propia: `seleccionar-exacto(A)` seguido de `campo-valor(B)` sin acción
  intermedia expresa "B se precarga al elegir A".
- **Garantiza:** texto mostrado en ese momento.
- **No garantiza:** persistencia en backend, código interno del valor, que la precarga sea la causa (solo que no hubo otra acción del plan).
- **Campos:** todos los funcionales (valores públicos de catálogo; nunca campos no `public`). **Driver:** texto de `mat-select` vs `value` de input.
- **Fuente externa:** no.

### catalogo-semantico

- **Intención:** qué opciones ofrece un catálogo, con un oráculo explícito.
- **Operaciones:**
  - `catalogo-exacto { campo, opciones[], normalizacion }`: igualdad de conjunto con opciones **listadas por el diseño**
    (p. ej. "única y exclusivamente A y B"). Solo si el diseño enumera las opciones.
  - `catalogo-segun-fuente { campo, fuente, relacion: "igual" | "subconjunto" }`: comparación con una **fuente autoritativa**
    del catálogo `FuenteAutoritativa` (ver §7). El filtro (p. ej. departamento) es el valor **actual** de otro campo,
    no un literal ni un código.
  - `catalogo-todas-cumplen { campo, regla: "contiene" | "empieza-por", texto, normalizacion }`
  - `catalogo-incluye { campo, valor, normalizacion }`
  - Ajuste menor: `seleccionar-exacto` con `normalizacion` opcional (el diseño escribe "Cundinamarca", la opción es mayúscula).
- **Garantiza:** la relación declarada entre opciones observadas (catálogo estabilizado, sin virtualización) y el oráculo.
- **No garantiza:** que la paramétrica esté bien configurada (es el oráculo, no el objeto de prueba); orden; opciones que el
  Portal cargue después.
- **"Únicamente municipios del departamento X":** `igual` o `subconjunto` lo decide el diseño. CP02 P04 + P08
  ("listado completo… configurados en la paramétrica") ⇒ `igual`.
- **Campos:** catálogos funcionales. **Driver:** `catalogoEstable` (existe). **Fuente externa:** sí para `catalogo-segun-fuente`.

### entrada-validacion

- **Intención:** qué hace un campo con lo que el usuario escribe.
- **Operaciones:**
  - `escribir { campo, texto }`: acción, tecla a tecla (nunca `fill`, que salta filtros de teclado). Observado: valor antes/después.
  - `entrada-rechazada { campo, texto }`: escribe carácter a carácter y exige que el valor no cambie con ninguno.
  - `borrar { campo }`, `salir-del-campo { campo }` (blur por clic/tap en zona neutra que decide el driver).
  - Limpieza automática = `escribir` + `campo-valor(texto)` + `salir-del-campo` + `campo-valor(vacio)`.
- **Garantiza:** efecto observable en el valor del campo con eventos de teclado del navegador.
- **No garantiza:** tipo de teclado virtual (`inputmode`), pegar, dictado/IME, validación del servidor; en mobile es teclado emulado.
- **Campos:** campos de texto/autocomplete funcionales. **Driver:** escritura por teclas, blur neutro, tap en mobile.
- **Fuente externa:** no.

### autocomplete

- **Intención:** filtrado predictivo, selección y restauración.
- **Operaciones:** no requiere operaciones propias; se compone de:
  `escribir(prefijo)` → `catalogo-todas-cumplen` + `catalogo-incluye` (sobre las sugerencias abiertas) →
  `seleccionar-exacto` → `campo-valor` → reabrir y comparar con `catalogo-segun-fuente` o `catalogo-igual-captura`
  (`orquestacion-plan`) → `cerrar-catalogo` → `campo-valor`.
- **Garantiza / no garantiza:** los de cada operación. Adicionalmente no garantiza tiempo de respuesta del filtrado ("en tiempo real").
- **Regla de coincidencia:** siempre explícita (`contiene` / `empieza-por`, `normalizacion`). Si diseño y HU no la definen →
  `INFORMACION_INSUFICIENTE` (ver §5).
- **Driver:** distinguir "sugerencias tras escribir" de "catálogo al abrir sin texto".

### campos-adicionales

- **Intención:** ampliar `CampoContactoFuncional` con `localidad` y `barrio` (ya existen en `CAMPOS_AFI`, etapa
  `informacion-contacto`), y futuros campos del mismo tipo.
- **Operaciones:** ninguna nueva; todas las familias anteriores pasan a aceptarlos. Añade `campo-visible { campo }` /
  `campo-ausente { campo }` para su presencia.
- **Garantiza / no garantiza:** los de la operación usada. `campo-ausente` no explica por qué falta.
- **Driver:** mapeo de cada campo a su control. **Fuente externa:** si un diseño pide "localidades de X según la paramétrica", sí.
- **Nota:** Localidad es condicional en el diseño ("si el municipio habilita…"); Barrio no. La condicionalidad es `orquestacion-plan`.

### transicion

- **Intención:** intentar avanzar y observar el resultado.
- **Operaciones:**
  - `avanzar { esperado: "permitido" | "bloqueado" }`: el driver conoce el botón de la pantalla actual y la modalidad (clic/tap).
    `permitido`: sale de la pantalla actual y alcanza la siguiente conocida. `bloqueado`: tras el intento real sigue en la pantalla.
  - `campo-validacion { campo, estado: "invalido" }`: el campo queda marcado inválido/requerido (validez, aria-invalid).
- **Garantiza:** permanencia o salida de la pantalla; estado de validación del campo.
- **No garantiza:** el texto de un mensaje (si el diseño no lo cita); qué datos se guardaron; la razón del bloqueo.
- **"Exige seleccionar una opción válida":** sin texto de mensaje en el diseño ⇒ `campo-validacion`, no un mensaje inventado.
- **Driver:** botón por pantalla (ya existe para preparación: `BOTON_PANTALLA`). **Orquestación:** `permitido` cambia de pantalla → ver etapas.

### etapas-posteriores

- **Intención:** continuar después de Información de contacto (Dirección, Documentación) y verificar el formulario final.
- **Operaciones / etapas:**
  - etapa `direccion` orquestada por el runner (existe en el modelo, no en el runner) con datos del **actor** (dirección es no public);
  - etapa nueva `documentacion` (no existe en `ETAPAS_AFI`) y acción `descargar-formulario-final`;
  - `documento-celda { documento: "formulario-final", fila, columna, esperado: "vacia" | { valor }, entre?: [col, col] }`
    (portar `pdfFormulario.ts`: PDF.js, bordes vectoriales).
- **Garantiza:** contenido y posición de una celda del PDF descargado en esa corrida.
- **No garantiza:** el documento radicado final, firmas, ni otros formatos del formulario.
- **Decisión de contrato:** hoy el plan funcional corre en **una** pantalla y la preparación termina antes. Continuar la
  preparación **después** del plan funcional exige ordenar preparación/funcional como segmentos (ver §9).
- **Fuente externa:** no (el PDF es el objeto de prueba).

### orquestacion-plan

- **Intención:** lo que no es una assertion sino el flujo del plan.
- **Necesidades:**
  1. **Paso condicional** ("si el municipio habilita Localidad"): resultado `NO_APLICA`.
     Opción aditiva sin cambiar la forma: operación `requiere-campo-visible { campo }` que termina el paso en `NO_APLICA`.
     Opción estructural: `aplicaSi` en `PasoFuncionalAfi` (decisión de contrato).
  2. **Valor de la corrida** ("una localidad válida", "un barrio válido"): `seleccionar-primera-valida { campo, como }` y
     `escribir { campo, desde: como, prefijo: n }`. Aditivo (parámetros string), pero introduce referencias entre operaciones.
  3. **Captura para comparar** (restauración del listado completo sin fuente nombrada): `capturar-catalogo { campo, como }`
     y `catalogo-igual-captura { campo, captura }`.
  4. **Plan multi-pantalla** tras `avanzar permitido` (ver `etapas-posteriores`).
- **Garantiza:** coherencia interna de la corrida (misma opción reutilizada, mismo catálogo comparado).
- **No garantiza:** que el valor elegido sea el del soporte certificado (el diseño no lo fija).
- **Nuevo resultado de paso:** `NO_APLICA` en `ResultadoCasoAfi` (hoy solo PASS/FAIL).

### contexto-ejecucion

- **Intención:** ejecutar una variante en `mobile`.
- **No es una operación:** es `ContextoEjecucionAfi` (§2). Requiere:
  - que el harness/runner reciban el contexto desde fuera del JSON (flag del CLI o matriz);
  - soporte administrativo en contexto desktop separado (hoy `context.newPage()` comparte contexto);
  - modalidad tap en las acciones del driver (`avanzar`, `salir-del-campo`, abrir catálogos);
  - reporte con la identidad `…/contexto`.
- **No garantiza (emulación):** dispositivo real, teclado virtual, selector nativo del SO, navegador móvil real.
- **Fuente externa:** no.

---

## 7. Fuentes autoritativas de catálogo

"El catálogo muestra únicamente los municipios del departamento X configurados en la paramétrica Ciudad nacional"
**no** se puede certificar comprobando que haya opciones (`catalogo-no-vacio`) ni que haya una fuera de un conjunto.

| Alternativa | Honesta | Estado | Comentario |
|---|---|---|---|
| Lista esperada en el caso | solo si el diseño la enumera | posible hoy como `catalogo-exacto` | Para municipios el diseño no la enumera; el agente no puede inventarla y quedaría desfasada de la paramétrica. |
| Paramétrica observada en el tráfico del Portal | sí, con condiciones | **demostrada** en el piloto (`ciudadNacional.ts`, P04/P22 PASS) | Lee las respuestas OData GET que el Portal ya pide, filtra por relación municipio→departamento y registros activos, exige respuesta completa (no paginada) y compara igualdad. Falla cerrado si no puede leer. |
| Consulta directa al backend (Bizagi) | sí, más fuerte | no demostrada | Independiente del tráfico del Portal; requiere credenciales y conocer la entidad. |
| Regla genérica observable | no | — | Sin la relación departamento→municipio, "pertenece a X" no es observable. |

Recomendación:

- Catálogo cerrado **`FuenteAutoritativa`** en el framework (p. ej. `parametrica-ciudad-nacional`), con un proveedor
  intercambiable (hoy: tráfico observado; mañana: consulta backend). El contrato solo nombra el id y la `relacion`.
- El filtro se toma del **valor seleccionado** en el campo padre (departamento), resolviendo su código en la misma fuente.
  Eliminar la heurística del piloto que deduce el código del departamento desde un municipio certificado del caso
  (válida para el piloto, no generalizable).
- Evidencia obligatoria: procedencia, número de registros, completitud, esperados vs observados.
- Fail-closed: fuente paginada, vacía, ilegible o sin relación ⇒ FAIL con motivo, nunca PASS.
- El agente usa la fuente solo si el diseño la nombra (o la HU aclara cuál es) y el manifest la lista.

---

## 8. CP02: los 34 gaps por familia

Mobile P(n+18) es espejo funcional de Desktop P(n) para n = 2..17. Todos los pasos Mobile además requieren `contexto-ejecucion`.

| Desktop | Mobile | Requisito resumido | Familias |
|---|---|---|---|
| P02 | P20 | alerta visible, texto, debajo del subtítulo (+ Mobile: pantalla adaptada, texto legible) | componente-visual |
| P03 | P21 | elegir departamento; Ciudad pasa a editable | *(seleccionar-exacto existe)* + estado-campo |
| P04 | P22 | Ciudad = municipios del departamento según paramétrica | catalogo-semantico (**fuente autoritativa**) |
| P05 | P23 | números/especiales no se plasman | entrada-validacion |
| P06 | P24 | texto libre se limpia al perder foco | entrada-validacion + valor-campo |
| P07 | P25 | sugerencias filtradas por prefijo | autocomplete + catalogo-semantico |
| P08 | P26 | seleccionar, reabrir listado completo, conservar selección | autocomplete + valor-campo + catalogo-semantico (**fuente**) |
| P09 | P27 | Bogotá precarga Ciudad y la bloquea | valor-campo + estado-campo |
| P10 | P28 | vuelve a editable, solo municipios del departamento, reselección predictiva | estado-campo + catalogo-semantico (**fuente**) + autocomplete |
| P11 | P29 | *si aplica* Localidad: rechaza números/especiales | campos-adicionales + orquestacion-plan + entrada-validacion |
| P12 | P30 | *si aplica* Localidad: limpia texto libre | campos-adicionales + orquestacion-plan + entrada-validacion |
| P13 | P31 | *si aplica* Localidad: filtra, selecciona, restaura listado | campos-adicionales + orquestacion-plan + autocomplete |
| P14 | P32 | Barrio rechaza números/especiales | campos-adicionales + entrada-validacion |
| P15 | P33 | Barrio filtra, selecciona, restaura listado | campos-adicionales + orquestacion-plan + autocomplete |
| P16 | P34 | texto libre en Barrio: no avanza, limpia, exige opción válida | campos-adicionales + entrada-validacion + transicion + valor-campo |
| P17 | P35 | Barrio válido (elegido en la corrida) y avanza | campos-adicionales + orquestacion-plan + autocomplete + transicion |
| P18 | — | continuar hasta el formulario final | etapas-posteriores + orquestacion-plan |
| P19 | — | Rural/Urbano vacío entre Municipio y Departamento | etapas-posteriores |

Conteo por familia (pasos que la necesitan, de 34): contexto-ejecucion 16 · campos-adicionales 14 ·
autocomplete 12 · entrada-validacion 12 · orquestacion-plan 11 · catalogo-semantico 8 · valor-campo 8 ·
estado-campo 6 · transicion 4 · componente-visual 2 · etapas-posteriores 2.
**Once familias cubren los 34 gaps**; ninguna operación es específica de CP02.

### Clasificación

| Requiere | Familias |
|---|---|
| **Nueva UI capability** (driver + operación aditiva) | componente-visual, estado-campo, valor-campo, catalogo-semantico (exacto/cumplen/incluye), entrada-validacion, autocomplete (composición), campos-adicionales, transicion (`bloqueado`) |
| **Nuevas etapas / orquestación** | etapas-posteriores (direccion, documentacion, formulario), orquestacion-plan (condicional, valores de corrida, capturas, multi-pantalla), transicion (`permitido`), contexto-ejecucion (runner/harness/soporte) |
| **Fuente autoritativa externa** | catalogo-semantico `catalogo-segun-fuente` (P04, P08, P10, P22, P26, P28) |

### Requisitos que, con capability, seguirían siendo ambiguos

El benchmark los clasificó bien como gap (no hay capability), pero al existir la capability el agente debería marcarlos
`INFORMACION_INSUFICIENTE` salvo que la HU los aclare:

- P07/P25: regla de "coincidir" (empieza/contiene, tildes). Evidencia: fallo real de P07 con `Chi`.
- P21: "selector nativo/adaptado Mobile" (en emulación no hay selector nativo; ¿qué se observa?).
- P25, P31, P33: "bajo las convenciones visuales de Mobile" (sin condición observable).
- P16/P34: "exige seleccionar una opción válida" (¿estado inválido o mensaje con texto?). Se propone estado inválido.

### Observaciones del piloto (no se modifican en esta fase)

- `cp02Contacto.ts` usa el prefijo `Chí` en Desktop; el diseño certifica `Chi` y el informe dice que no se sustituyó.
  El código actual no coincide con el informe.
- El piloto P03 también afirma el catálogo exacto de Departamento y Ciudad vacía, que el esperado de P03 no pide:
  es alcance ampliado, justo lo que la jerarquía de fuentes prohíbe al agente.

---

## 9. Propuesta de contrato futuro (NO implementada)

Todo lo que es **operación nueva** entra en v1 de forma aditiva (nuevo `tipo` en `CONTRATO`, igual que las cinco actuales).
Solo tres puntos cambian la forma del documento y requieren decidir una versión:

| Punto | Opción sin cambio de forma | Opción estructural (v2) |
|---|---|---|
| Paso condicional | operación `requiere-campo-visible` que termina el paso en `NO_APLICA` | `PasoFuncionalAfi.aplicaSi` |
| Continuar la preparación tras el funcional (P18) | — | `segmentos: [preparacion, funcional, preparacion, funcional]` en lugar de `preparacion` + `funcional` |
| Contextos aplicables | fuera del JSON (matriz) | `contextosAplicables?: ContextoEjecucionAfi[]` como **restricción** declarada por el diseño, no como selección |

Recomendación: agotar las opciones sin cambio de forma; abrir v2 solo cuando `etapas-posteriores` sea prioridad
(segmentos), porque es el único punto que v1 no puede expresar aditivamente.

---

## 10. Recomendación para la Fase 4D

Objetivo: que **CP02 Desktop P02-P10** sea `GENERABLE`, sin Mobile, sin Localidad/Barrio y sin etapas posteriores.
Es la porción con mayor reutilización por paso y sin decisión de contrato.

1. **Operaciones aditivas** (driver `AfiFunctionalUi` + `CONTRATO` + semántica del manifest):
   `componente-visible`, `componente-posicion`, `campo-estado`, `campo-valor`, `escribir`, `entrada-rechazada`,
   `salir-del-campo`, `catalogo-todas-cumplen`, `catalogo-incluye`, y `normalizacion` opcional en `seleccionar-exacto`.
2. **`catalogo-segun-fuente` + `FuenteAutoritativa`** con el proveedor de tráfico observado (portar `ciudadNacional.ts`
   sin la heurística del municipio), fail-closed, con evidencia.
3. **Catálogo `ComponenteFuncional`** con `alerta-territorial` y `subtitulo-localizacion-vivienda`.
4. **Re-benchmark ciego** de CP02 Desktop con HU: se espera `GENERABLE` para P02-P06 y P08-P10, `INFORMACION_INSUFICIENTE`
   en P07 si la HU no define "coincidir", y `CAPABILITY_GAP` con familia para P11-P19. Medir que las familias reportadas
   coincidan con §8.
5. Golden sample CP02 Desktop P02-P10 solo después del benchmark, no antes (evitar enseñar la respuesta).

Fase 4E (después): `campos-adicionales` + `orquestacion-plan` (condicional aditivo, valores de corrida, capturas) +
`transicion`. Fase 4F: `contexto-ejecucion` mobile (contexto externo en harness/runner, soporte desktop separado,
tap), reutilizando las mismas definiciones de 4D/4E. Última: `etapas-posteriores`, con la decisión de segmentos/v2.

---

## 11. Estado tras la Fase 4D (implementado)

Operaciones nuevas (aditivas; la forma de `DefinicionCasoAfi` v1 no cambió): `componente-visible`,
`componente-posicion`, `campo-estado`, `campo-valor`, `escribir`, `entrada-rechazada`, `salir-del-campo`,
`catalogo-segun-fuente`, y `normalizacion` opcional en `seleccionar-exacto` (sin ella, semántica literal original).

Catálogos cerrados nuevos (en `funcional.ts`): `ComponenteFuncionalAfi` (`alerta-territorial`,
`subtitulo-localizacion-vivienda`), `FuenteAutoritativaAfi` (`parametrica-ciudad-nacional`: describe
`ciudadVivienda`, filtra por `departamento`), estados, comparaciones, relaciones y normalizaciones.

| Familia | Estado | Qué falta |
|---|---|---|
| estado-campo | **soportada** (sale del backlog) | — (`deshabilitado` como estado distinto solo si un diseño lo exige) |
| valor-campo | **soportada** (sale del backlog) | — |
| componente-visual | parcial | ausencia, texto, legibilidad/ancho, color/ícono |
| catalogo-semantico | parcial | `catalogo-exacto`, `subconjunto`, `todas-cumplen`, `incluye`, otras fuentes |
| entrada-validacion | parcial | borrar sin escribir, pegar/dictar, mensajes |
| autocomplete | parcial | regla de coincidencia de sugerencias (P07), comparar con una captura |
| resto | sin cambios | — |

Decisiones de 4D que modifican lo propuesto arriba:

- **`entrada-rechazada` sí existe.** La composición `escribir` + `campo-valor { vacio }` es engañosa: `campo-valor`
  espera a que el valor se estabilice (necesario para precargas asíncronas), así que da PASS si la UI **muestra** los
  caracteres y los borra después. `entrada-rechazada` observa el valor tras cada tecla y durante una ventana breve,
  y exige que el campo sea editable (un campo bloqueado "rechaza" todo trivialmente). Un unit test demuestra ambos casos.
- **Proveedor generalizado** (`helpers/fuenteParametrica.ts`): conserva la última respuesta por entidad; relee solo GET;
  el departamento se resuelve en la propia fuente por el **valor actual** del campo filtro y debe estar referenciado por los
  municipios. Se eliminó la deducción del departamento desde un municipio del caso. Fail-closed: no observada, vacía,
  ilegible (cualquier respuesta), ambigua, paginada, filtro vacío/no resoluble/ambiguo, relación inexistente.
  El helper histórico `ciudadNacional.ts` se conserva sin cambios para el piloto CP02; el driver declarativo no lo usa.
- **Evidencia** en toda comparación con fuente (también FAIL): fuente, campo, filtro, clave, esperadas/observadas,
  faltantes/sobrantes, completitud, relecturas GET y respuestas ilegibles.

Representable tras 4D (Desktop): P02, P03, P04, P05, P06, P08, P09, P10. P07 no: no hay operación para afirmar qué
sugerencias produce un texto parcial, y la regla ("empieza por"/"contiene", tildes) no está definida en las fuentes:
el agente debe responder `INFORMACION_INSUFICIENTE` (el protocolo evalúa la ambigüedad antes que la capability).

## 12. Fase 4D.1 (implementado)

- Nueva operación `componente-region { componente, region: "superior" }`. Única región: la que pide un requisito actual.
- Regla canónica `centro-vertical-en-mitad-superior-de-la-primera-pantalla`: el centro vertical del componente, medido
  desde el inicio de la página, está en la mitad superior del alto del viewport real del contexto (límite inclusivo).
  Sin viewport válido o sin geometría: FAIL con motivo. El plan nunca aporta dimensiones ni umbrales.
- P02 Desktop se expresa por composición: `componente-visible` + `componente-region` + `componente-posicion`.
  `componente-visual` sigue **parcial** (ausencia, texto, color/ícono, legibilidad, responsive, otras regiones).
- Protocolo: `precedencia` explícita; el paso 1 ordena detenerse sin analizar capabilities si la condición exige elegir
  entre semánticas no resueltas; ejemplo genérico de "coincidir con X". Sin cambios para P07 (ninguna capability nueva).

## 13. Fase 4E (implementado, con una decisión pendiente de QA)

- Nueva assertion `sugerencias-segun-fuente { campo, fuente, filtroDesdeCampo, normalizacion, textoBusqueda, coincidencia: "contiene",
  diacriticos: "sensibles", mayusculas: "sensibles" | "insensibles" }`. No escribe, no hace clic, no selecciona ni cierra: lee el
  panel ya abierto (aria-expanded + aria-controls). Se compone con `escribir` y `campo-valor`.
- Semántica de SUBCONJUNTO no vacío: ≥1 sugerencia; todas pertenecen a la fuente (identidad con `normalizacion`); todas contienen
  el texto (Unicode NFC, sin quitar tildes). No exige todas las coincidencias posibles.
- **Mayúsculas: sin valor por defecto.** El Portal muestra los municipios en mayúsculas y filtra sin distinguirlas (el piloto vio
  CACHIPAY para "Chi"). Con comparación literal, ninguna sugerencia mayúscula contiene un texto con minúsculas: el tratamiento de
  mayúsculas decide el resultado de P07 y la aclaración de QA (contiene, tildes respetadas) no lo define. El framework no lo elige:
  el caso debe declararlo; si diseño y requerimiento no lo definen, el agente debe responder INFORMACION_INSUFICIENTE.
- `autocomplete` sigue **parcial**: solo campos con fuente autoritativa, solo "contiene" con diacríticos sensibles.

## 14. Fase 4E.1 (implementado): preparación Independiente

- `informacion-adicional` admite `actividad` (select, valor del actor) e `ingresoMensual` (texto, valor del actor), y
  `fondoPensiones` admite además `first-valid-autocomplete`: en un autocomplete vacío, primera opción visible y habilitada
  en orden de catálogo, una sola selección, verificación de validez; precargado no se toca; fail-closed.
- `preparacion.viabilidadPorPerfil` (derivada de políticas, mapeo del actor y `evaluarCapacidad`): estado por perfil/etapa
  del runner, vías por campo y bloqueos explícitos. Regla: una etapa declarada solo es GENERABLE si está soportada.
- Corrección de PII: la selección exacta en catálogos ya no expone el valor en el mensaje de error.
