# Handoff / Info base — Framework de pruebas Bizagi Cloud + Playwright
Última actualización: julio 2026 (hito "CONPRE en vivo", etapas 1 y 2 completadas).

## 0. ESTADO ACTUAL (léeme primero)
- El framework está **completo** (motor de plantillas + modelo híbrido) y ahora **probado EN VIVO
  contra CONPRE**: se crean casos reales y se diligencian campos por etiqueta.
- **Etapa 1 ✅** crear caso pasando por categoría "Gestión de contratos" + espera de loader.
- **Etapa 2 ✅** diligenciar los 4 campos simples (texto largo, 2 fechas, 1 lista/combo) + "Guardar".
  **La ubicación por etiqueta funciona en el Bizagi real, incluidos los combos personalizados.**
- **Etapa 2 con CERTEZA TOTAL ✅** (Opción A hecha): hazards en las 2 fechas + DIPRE, re-corrida en vivo
  → los 4 campos quedan **guardados**. En el camino se arregló un bug real: **las fechas no se guardaban**.
- **Etapa 3 COMPLETA ✅** (tablas/colecciones): bloque `tablas:` → pop-up "Necesidades planeadas" → se
  llenan sus **~14 campos obligatorios** (listas, 2 buscadores de catálogo, textos, 2 radios, 3 números)
  → Guardar → hazard `la_tabla_tiene_filas` confirma la fila. **Verde en vivo, estable, sin regresiones.**
- **Siguiente:** `${unico}` (identificar casos), arreglo del número de caso "GCON - NNN", y depurar QA.

## 1. Objetivo
Framework reutilizable de pruebas E2E sobre el **Work Portal de Bizagi Cloud**, probando por el
navegador **como un usuario**. Meta: probar un proceso = **escribir datos (YAML), no programar ni grabar**.

## 2. Entorno (restricciones reales)
- Windows 11, Node 24, Playwright. El **Chromium empaquetado no arranca** → se usa **Edge**
  (`channel: 'msedge'` en `playwright.config.ts`). Se corre `--headed` para ver.
- En PowerShell, `--grep`/argumentos con espacios o `|` se rompen; por eso el runner usa
  etiquetas sin espacios (ver §7).

## 3. Arquitectura: dos capas
- `shared/` = núcleo común (sin nada de cliente). `projects/<cliente>/` = lo propio: `.env`,
  `scenarios/*.yaml` (plantillas), `grabados/*.spec.ts`, `custom/*.ts`, `baseObjects/`, `tests/`.
- `projects/_template/` se clona con `npm run new:project`. `projects/demo/` corre en modo esqueleto.
- **IMPORTANTE:** `projects/conpre/` se creó ANTES del motor, por eso hubo que agregarle a mano el
  enganche `tests/scenarios.spec.ts` (una línea: `registerScenarios()`). Todo proyecto nuevo ya lo trae.

## 4. Proyecto real: CONPRE
- URL QA: `https://dev-demo2-gattaca.bizagi.com/`. Login **sin clave por lista**: elegir
  `domain\usuario.qa` + "Ingresar".
- `.env`: `BIZAGI_LOGIN_MODO=lista`, `USUARIO_admin=domain\usuario.qa` (el usuario lógico `admin`
  del YAML mapea a esa identidad).
- Proceso: **"Definición datos iniciales Contratos"**. Creación: Nuevo Caso → categoría
  **"Gestión de contratos"** → proceso → actividad **"Definir datos iniciales"**.

### 4.1 Estructura REAL de los formularios de Bizagi Cloud (clave para el motor)
- Cada campo es `div.ui-bizagi-render` con `span.ui-bizagi-label > label` (rótulo) y el control con
  `aria-labelledby` al id del label → por eso **`getByLabel` ubica bien** texto/fecha/textarea.
  (También hay `data-render-xpath` con el atributo Bizagi, por si se necesita fallback.)
- **Las listas NO son `<select>` nativos**: son **combos personalizados**. El camino de "lista custom"
  del motor (abrir el control + elegir la opción por su texto exacto) **funciona**.
- **Fechas**: date-picker **Mobiscroll** (`mbsc-calendar`). **IGNORAN `fill()`**: hay que **teclear**
  la fecha (`pressSequentially`, dd/MM/yyyy ej. `15/08/2026`) y luego **cerrar el calendario emergente**
  (Escape + clic afuera), porque si queda abierto bloquea el resto de la forma. Implementado en el caso
  `fecha` de `FormActions`. (El `fill` directo dejaba la fecha vacía al Guardar — bug encontrado en vivo.)
- Hay un `iframe#project-dashboard-download` **decorativo** (descargas), NO es la forma. La forma va
  inline → **CONPRE no necesita `BIZAGI_FORM_IFRAME`**.

### 4.2 Rótulos REALES del formulario "Definir datos iniciales"
`Objeto contractual` (texto largo), `Fecha estimada de contratación` (fecha),
`Fecha inicio proceso de selección` (fecha), `Dependencia ejecutora` (lista), `Necesidades planeadas` (tabla).
Opciones de **Dependencia ejecutora**: `Area de Logística - DIA`, `Area de Marketing - DIC`,
`Dirección D - DID`, `Dirección Programación Presupuestal - DIPRE`. **Elegida: DIPRE.**
El **pop-up "Necesidades planeadas"** (etapa 3, ~14 campos obligatorios, buscadores de catálogo,
sub-tabla anidada) está mapeado aparte en la memoria del proyecto (`conpre-popup-necesidades`).

## 5. Motor de plantillas (data-driven)
Escenario en `scenarios/<nombre>.yaml`: `proceso`, `escenario`, `etiquetas`, `inicio`
(`modo: crear-caso|bandeja`, `usuario` lógico, `categoria` opcional, `proceso_a_crear`),
`pasos` (`actividad`, `usuario?`, `verificar_al_entrar`, `llenar`, `accion`, `personalizado?`),
`hazards`. Campos por **etiqueta visible**; tipos: `texto|área de texto|fecha|número|lista|búsqueda|
radio|checkbox`; escape `localizador:`. Paso puede llevar `tablas:` (colecciones, ver §5.2). Hazards:
`el_caso_avanza_a`, `el_caso_ya_no_esta_en_bandeja_de`, `asignado_a`, `campo_tiene_valor`,
`la_tabla_tiene_filas`, `el_caso_termina`. Valida el YAML en español; evidencia (screenshots).
Piezas en `shared/runner/` (scenarioLoader, BpmEngine, hazards, evidence, registerScenarios, filters)
y `shared/core/FormActions` + `shared/baseObjects/form.objects`.

### 5.1 Extensión A (YA implementada y probada en vivo)
`inicio.categoria` opcional → clic intermedio antes del proceso; `BpmEngine.crearCaso` hace
Nuevo Caso → categoría → proceso con `esperarCarga()` (espera loader + networkidle, sin pausas fijas)
y `clickPorTexto()` (link/menuitem/botón/texto). Tolera clientes sin categoría.

### 5.2 Extensión B — tablas/colecciones (YA implementada y probada en vivo)
Bloque `tablas:` en el paso: `- tabla: <nombre>` con `filas: [ { llenar: [ ...campos... ] } ]`. Por cada
fila `FormActions.agregarFilaTabla` pulsa "Adicionar <tabla>", abre el **pop-up** (`.ui-dialog`), acota la
búsqueda de campos SOLO al pop-up (raíz temporal = el diálogo), reutiliza el mismo llenador de tipos,
pulsa "Guardar" del pop-up y espera a que cierre. Verificación: hazard `la_tabla_tiene_filas: { tabla, minimo }`
(cuenta filas de datos, esperando a que reaparezcan tras el refresco). Se afinó en el motor, además:
- **`búsqueda`** para catálogos de sugerencia de Bizagi: teclea la DESCRIPCIÓN (lo que va tras " - ")
  y elige el `li.ui-bizagi-render-search-item`. Los 2 campos sin etiqueta se ubican con `localizador:` (`data-render-xpath`).
- **`radio`** booleano de Bizagi: toma el input `true`(Sí)/`false`(No) que sigue a la pregunta y `check(force)`.
- Las opciones de lista se eligen a nivel de página (se dibujan en un "portal", fuera del pop-up).

## 6. Modelo híbrido (casos raros)
Grabado adoptado (`grabados/*.spec.ts`) para flujos no estándar; paso `personalizado:` (`custom/*.ts`)
para una pantalla rara dentro de una plantilla. Comandos `npm run grabar` (codegen→`_crudo/`) y
`npm run adoptar` (quita login/credenciales, pregunta hazards/etiquetas). (Probado simulado, no real aún.)

## 7. Ejecutar / filtrar
```bash
npm test -- <cliente> [--headed]
npm test -- <cliente> --list                 # [plantilla] … y [grabado] …
npm test -- <cliente> --escenario "<txt>"    # una definición (por nombre de archivo o campo escenario:)
npm test -- <cliente> --fuente plantillas|grabados
npm test -- <cliente> --grep @regresion
```
Todos los escenarios llevan el tag universal **`@escenario`**; el runner filtra con tags SIN espacios
(`@escenario`/`@plantilla`/`@grabado`) para no romperse en la consola de Windows. `--escenario` valida
que exista (si no, lista los disponibles) y usa la variable `ESCENARIO_FILTRO` (env) para acotar.

## 8. Reglas de oro
Nada de cliente en `shared/`; ninguna credencial en archivos (solo usuarios lógicos del `.env`);
plantilla por defecto; sin pausas fijas. Cada caso creado en vivo queda en QA (usar `${unico}` para
identificarlos — pendiente, ver §10).

## 9. Estado de verificación
- Login CONPRE: **en vivo, verde** (entrar/salir).
- Login CONPRE, Etapa 1 (crear caso por categoría), Etapa 2 (4 campos + Guardar): **en vivo, verde**.
  Etapa 2 con **4 hazards** (Objeto contractual + 2 fechas + DIPRE): confirma que se GUARDAN (no solo el texto).
- **Etapa 3 (tabla "Necesidades planeadas"): en vivo, verde y estable.** Llena los ~14 campos obligatorios
  del pop-up (listas, 2 buscadores de catálogo, textos, 2 radios, 3 números) y el hazard confirma la fila.
  Corrida serial de las 3 plantillas (etapa 1+2+3): **3/3 verdes, sin regresiones.**
- Motor de plantillas + híbrido: verde en modo esqueleto / páginas de prueba.

## 10. Pendiente (próximos hitos)
1. ~~**Etapa 3 — Extensión B (tablas/colecciones)**~~ ✅ HECHA (ver §5.2 y §9). *Nota:* la sub-tabla
   anidada "Códigos UNSPSC auxiliares" (dentro del pop-up) NO es obligatoria y se omitió; queda como v2 si hace falta.
2. **Extensión C (`${unico}`)** ✅ HECHA y **verificada en vivo**: `generarUnico()`+`aplicarUnico()`
   en `scenarioLoader`; `registerScenarios` genera el token por corrida, lo sustituye en TODO el escenario
   (lo que se teclea Y los hazards) y lo anota en el reporte. Corrida del 2026-07-10: 3 tokens distintos
   (`20260710-110218/110241/110253`), hazards verdes → los identificadores son únicos y no chocan.
3. **Etapa 4** (parcial): identificadores únicos por corrida **confirmados** (ver §10.2). Falta, si se
   quiere, correr 2× la misma plantilla y abrir el reporte HTML (`npm run report -- test-results/conpre/html-report`).
4. **Etapa 5 (docs)** ✅ HECHA: `README.md` y `_template/scenarios/_ejemplo.yaml` documentan `categoria`,
   `tablas:` y `${unico}` (+ hazard `la_tabla_tiene_filas`). *Menor pendiente:* `INICIO-CLAUDE-CODE.md`
   dice "4 pruebas" en `--list` (ya son más).
5. **Número de caso** ✅ REDISEÑADO (genérico; falta verificar en vivo): se lee **por etiqueta**
   configurable en el `.env` (`BIZAGI_CASE_NUMBER_LABEL`, default "Número de caso"; o
   `BIZAGI_CASE_NUMBER_SELECTOR`), sin asumir el formato "GCON" en `shared/`. Además **se relee** (no se
   cachea) y se guarda el **histórico** de números, porque en procesos con subprocesos el número cambia;
   los hazards de bandeja/asignación buscan por CUALQUIERA de los números. **Pendiente:** validar/ajustar
   con los escenarios grabados que entregará el equipo.
6. **Depurar QA**: durante las pruebas se crearon varios casos reales (GCON-053 en adelante; etapa 3 y las
   exploraciones sumaron ~una docena más, hasta pasado GCON-065). Limpiar cuando aplique; `${unico}` ayudará.
7. **NUEVO CLIENTE — `projects/colsubsidio/` (Crédito CRD)**: insumos del equipo en `docs/` y 3
   grabaciones saneadas en `grabados/_crudo/`. **Definiciones APROBADAS (2026-07-23) en
   `FEEDBACK-CRD-DEFINICIONES.md`** — ese doc es la referencia del frente Colsubsidio. En corto:
   - **Ext. D** login con dominio (`BIZAGI_LOGIN_DOMINIO`) · **Ext. E** paso `hibrido:` para OTP
     (espera valor + confirmación 5 s; bloqueado en CI; marca `[MANUAL]` en evidencia) ·
     **Ext. F** tipo `archivo` (con smoke temprano tras C1) · **Ext. G** esperas en dos capas
     (implícita 90 s + `esperar_integracion:`; timeouts en `.env`) ·
     **Ext. H** `inicio.modo: bandeja|buscar|servicio` (`buscar` ahora; `servicio` diseñado+stub).
   - Orden: login D → smoke F → escenarios C1→C4 → alterno CRD03 → regresión CONPRE al final.
   - Formato del equipo v2 en `projects/_template/docs/FORMATO-ENTRADA-ESCENARIO.md` (tipo de campo,
     usuario por actividad, "¿requiere analista?"). Limitación "solo por pantalla" documentada en
     `projects/colsubsidio/docs/LIMITACIONES.md`.

## 11. Escenarios existentes en conpre
- `scenarios/conpre-etapa1-crear-caso.yaml` — smoke mínimo (crear caso + abrir actividad). Verde en vivo.
- `scenarios/conpre-etapa2-datos-iniciales.yaml` — 4 campos + Guardar (con hazards de valor). Verde en vivo.
- `scenarios/conpre-etapa3-necesidades.yaml` — 4 campos + agrega una fila a "Necesidades planeadas"
  (pop-up con ~14 campos: listas, 2 buscadores, textos, radios, números) + hazard de fila. Verde en vivo.

## 12. Preguntas abiertas de diseño (para pensar en paralelo)
- **Segundo Bizagi (versión vieja)** que la usuaria también certifica: ¿variantes en el núcleo?,
  ¿pruebas que se saltan?, ¿proyecto aparte?
- **Datos de prueba**: ¿fijos en YAML o desde requerimientos? (`${unico}` es el primer paso).
- **CI/Azure DevOps**: pipeline (PR→smoke, main→suite), JUnit + reporte, navegador en CI.
- **Trazabilidad CMMI/MEP e indicadores**: requisito→escenario→prueba; métricas.
- **Formularios difíciles**: tablas (en curso), lookups/búsqueda, popups, cargas de archivo.
