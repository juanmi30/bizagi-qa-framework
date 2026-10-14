# Auditoría de reutilización — SDE-CEL (Fase 1)

Fecha: 2026-10-07/08 · Copia de trabajo: `bizagi-cloud-playwright-framework_n` (sin Git; ver §1).

## 1. Aislamiento verificado

- **Sin Git** en la copia (no existe `.git` ni el binario `git`). No se creó rama; los cambios se controlaron con una **línea base SHA-256** de 355 archivos (`shared/`, `tools/`, `projects/colsubsidio|conpre|demo|_template`, `playwright.config.ts`, `package.json`, `tsconfig.json`, `.gitignore`), tomada antes de modificar nada.
- Única copia del framework en `Downloads` (`…_n`). Ninguna otra ruta tocada.
- **Diff contra la línea base al cierre:**

  | Tipo | Archivo |
  |---|---|
  | Modificado | `shared/core/LoginActions.ts` |
  | Modificado | `shared/runner/BpmEngine.ts` |
  | Agregado | `projects/demo/tests/login-dominio.unit.spec.ts` (regresión del cambio compartido) |
  | Sin cambios | todo `projects/colsubsidio/`, `projects/conpre/`, `projects/_template/`, `tools/`, configuración raíz |

- `.env` de Colsubsidio/CONPRE/Demo: **no leídos ni impresos**. Solo se comparó por hash que `projects/demo/.env` es idéntico a su `.env.example`.
- No se copió a SDE ningún usuario, clave, dato, Knowledge, selector, regla, policy ni runner AFI. Los patrones AFI se miraron solo para aprender; el único ejemplo revisado (`afi-data-ui.unit.spec.ts`) resultó ser un portal Angular, no Bizagi, y no aportó DOM utilizable.

## 2. Inventario de capacidades del motor existente

Evidencia: **L** = lectura del código, **P** = probado en esta fase.

| Capacidad | Dónde | Estado real | Uso en SDE |
|---|---|---|---|
| Login estándar + dominio | `LoginActions.login` (Ext. D, `BIZAGI_LOGIN_DOMINIO`) | **L+P**: un solo dominio global | Reutilizado. Se agregó el dominio por usuario (§3) |
| Login lista / fichas | `selectUserLogin` / `quickLogin` | L | No aplica: el portal SDE es de dominio + usuario + clave (**observado en QA**) |
| Navegación resiliente | `navegarAlPortal` + `SafeUiRetry` | L + regresión Colsubsidio 6/6 | Reutilizado tal cual |
| Crear caso | `BpmEngine.crearCaso` / `clickPorTexto` | L: `getByText(exact:false).first()` (**difuso**) | **No** reutilizado: SDE exige texto exacto y un único candidato |
| Formularios por etiqueta | `FormActions.llenarCampo` | L: `getByLabel(exact:false)…first()` | **No** reutilizado para SDE: "Ramo" capturaría "Ramo RCE" y "Número de póliza" capturaría "Número de Póliza RCE" |
| Catálogo / autocompletar | `FormActions.buscarYElegir` | L: con *fallback* difuso | No se necesitó en los verticales |
| Fechas (Kendo/Mobiscroll) | `FormActions.llenarFecha` | L | No se necesitó |
| Documentos (subir archivos) | `PlaywrightMethods.pwUpload` | L: **no existe en el DSL** YAML | Nueva capability SDE `adjuntar` |
| Roles / cambio de usuario | `BpmEngine.entrarAPaso` (logout + login) | L: depende de `LogoutActions` con selectores genéricos | SDE usa **un BrowserContext por actor**; no depende del logout |
| Bandeja / asignación | `casoEnBandejaDe` | L: busca `tr:has-text(num)` (subcadena) | SDE: fila con celda **exactamente** igual al número |
| Número de caso | `numeroCasoActual` (`BIZAGI_CASE_NUMBER_LABEL/SELECTOR`) | L | Mismas variables de entorno, con lectura estricta en SDE |
| Colecciones | `FormActions.agregarFilaTabla` | L: solo **agregar** vía "Adicionar <tabla>" | SDE: abrir fila, agregar, confirmar/permanecer, eliminar y **fila exacta** |
| Esperas / integraciones | `esperarAvance` (Ext. G) | L: el modo implícito traga timeouts (`catch(() => undefined)`) | SDE: sondeo acotado y estricto de la actividad (`verificar_ruta`) |
| Hazards | `runner/hazards.ts` | L: 6 tipos; **sin** solo lectura, obligatorio, visibilidad, texto exacto ni botones | SDE: 10 verificaciones declarativas |
| DSL YAML | `scenarioLoader.ts` | L: no rechaza claves desconocidas dentro de los pasos | SDE: validador estricto propio |
| Modo esqueleto | `registerScenarios.ts` | L: sin URL **pasa en verde** sin ejecutar | Excluido: SDE no usa `registerScenarios` (se borró `scenarios.spec.ts`) |
| Evidencias | `capturarEvidencia` | L | SDE adjunta capturas por paso + reporte JSON sanitizado |
| Histórico de casos / cleanup | `HistorialCasos`, `tools/cleanup.mjs` | L | **Reutilizado** `HistorialCasos` (modo `portal`). Sin cleanup físico (política CLEANUP_NOT_APPLICABLE) |
| API OData | `BizagiApiClient` / `InicioServicio` | L | No usado. Es candidato para fase 2 si SDE habilita la API (ver SIGUIENTE-FASE) |
| Lector XLSX | `shared/utils/xlsx.ts` | **P** | Reutilizado para la fidelidad matriz↔Excel |
| Validador YAML | `tools/validar.mjs` | L | No aplica al formato SDE; su equivalente es el validador de `sde/escenario.ts` |

## 3. Cambios en `shared/`, con justificación

**Único cambio: dominio de login por usuario lógico (`DOMINIO_<clave>`).**

- *Por qué:* en QA SDE el login exige elegir un dominio (`domain`, `externos`, `segurosdelestado.com`), y el intermediario (externo) y el analista (interno) probablemente usan dominios distintos. El núcleo solo admitía un `BIZAGI_LOGIN_DOMINIO` global.
- *Cambio:* `LoginActions.login(user, password, dominioUsuario?)`. El tercer parámetro es opcional; si llega vacío o ausente se usa el global. `BpmEngine.entrarComo` pasa `process.env['DOMINIO_' + clave]`. Son 8 líneas.
- *Retrocompatibilidad probada:*
  - `projects/demo/tests/login-dominio.unit.spec.ts`: **6/6** (firma de 2 argumentos sin dominio; el global se mantiene; el del usuario tiene prioridad; el vacío cae al global; BpmEngine con y sin `DOMINIO_<clave>`).
  - `projects/colsubsidio/tests/login-navegacion.unit.spec.ts`: **6/6** (red simulada, sin tocar QA de Colsubsidio).
  - Suite `demo` completa: **48 passed**. Los **4 fallos son los mismos de la línea base**: `login.spec` y `create-case.spec` son placeholders de plantilla que fallan sin URL real. Hay log antes y después.
- **No** se promovieron a `shared/` las verificaciones nuevas (solo lectura, obligatorio, botones exactos, tablas). Son universales para Bizagi, pero **aún no están calibradas contra un DOM real**. Promoverlas sin evidencia contradiría la regla de cambios "pequeños y comprobados". Quedan como candidatas en SIGUIENTE-FASE.

## 4. Lo construido en SDE (todo dentro de `projects/seguros-del-estado/`)

| Pieza | Archivo | Rol |
|---|---|---|
| Matriz literal | `fuentes/*.xlsx`, `fuentes/matriz.json`, `sde/matriz.ts` | 17 CP extraídos del Excel; una prueba compara JSON y Excel en cada corrida |
| Registro de datos | `data/datasets.yaml`, `sde/datos.ts` | Datasets lógicos, READY/MISSING calculado, valores solo en `.env`, enmascarado |
| Manifest 17 CP | `manifest/casos.yaml`, `sde/manifest.ts` | Familia, fase, actores, datos, escenario, estado y brechas |
| Escenarios | `escenarios/1-hu06-cp05.yaml`, `2-hu03-cp02.yaml`, `3-hu06-cp01.yaml` | Verticales declarativos, cada paso anclado a un paso del Excel |
| Validador | `sde/escenario.ts` | Rechaza capabilities, verificaciones o claves desconocidas, pasos inexistentes y datos no declarados |
| Ejecutor | `sde/ejecutor.ts`, `sde/modelo.ts` | Preflight BLOCKED, ejecución, agregación por paso de matriz, clasificación y sanitización |
| Capabilities UI | `sde/capacidades.ts`, `sde/ui.ts` | 13 capabilities UI y 2 declarativas (`integracion`, `no_automatizado`) |
| Selectores | `baseObjects/sde.objects.ts` | Único lugar con selectores; login **observado**, el resto **PENDIENTE_CALIBRAR** |
| Trazabilidad | `sde/trazabilidad.ts` → `docs/TRAZABILIDAD-17-CP.md` | Generada desde el código y el último reporte |
| Pruebas | `tests/*.spec.ts`, `tests/unit/*.unit.spec.ts` | Smoke real, login por rol, verticales, exploración y unitarias |

Plantilla adaptada: se eliminaron `create-case.spec.ts`, `scenarios.spec.ts`, `scenarios/_ejemplo.yaml`, `process.objects.ts`, `process.hazards.ts`, `expected.values.ts` y `docs/FORMATO-ENTRADA-ESCENARIO.md` (usuarios, procesos y flujos de ejemplo). `login.spec.ts` se reescribió como login real por rol, que queda BLOCKED sin credenciales.

## 4b. Fase 1B (2026-10-08): calibración contra el DOM real

- `shared/` **sin cambios** en esta fase. Diff contra la línea base re-verificado: los mismos 2 archivos de la Fase 1.
- Reutilizado del núcleo:
  - `LoginActions.login`, con dominio por usuario (cambio de la Fase 1), en los 3 roles.
  - `LoginActions.navegarAlPortal`, con `SafeUiRetry`, para recargar el portal con tolerancia a DNS.
  - `HistorialCasos`, para el registro automático de casos.
- No se reutilizó `BpmEngine.crearCaso` ni `FormActions` (difusos, ver §2). Las capacidades SDE equivalentes ya están **verificadas en QA**.
- Selectores: todo `baseObjects/sde.objects.ts` quedó VERIFICADO, salvo "Completar información de solicitud" y el pop-up de Póliza Nueva (ver REPORTE-FASE1B §3).
- Candidatos a promover a `shared/` en Fase 2, con evidencia real de un portal; falta un segundo portal para generalizar:
  - "forma quieta" por red (`/Rest/Handlers/MultiAction`);
  - número de caso desde `CREATENEWCASE`;
  - actividades actuales desde la fila del buscador (`ul.gridListWorkItems`);
  - grilla Bizagi por `bzg-form-grid`.

## 5. Riesgos

1. ~~Selectores sin calibrar~~ **Mitigado en la Fase 1B**: calibrados contra QA. Pendientes "Completar información de solicitud" y el pop-up de Póliza Nueva.
2. ~~Combos `input[readonly]`~~ **Descartado**: los combos SDE son `input[role=combobox]` sin `readonly`; la solo lectura se marca con `.ui-bizagi-noneditable-normal`.
2b. **Nuevo: forma que se re-renderiza en bucle (OBS-09)** y DNS intermitente. Mitigado con esperas por condición (red y cargadores) y navegación idempotente de 120 s. Si se agrava, los tiempos de las corridas crecen.
2c. **Nuevo: BUG-03** destruye el caso al cancelar el pop-up. La automatización evita "Cancelar" mientras siga abierto.
3. **Ruta inferida.** `verificar_ruta` concluye la ruta por la actividad asignada (UI_PASS). Sin traza del motor ni logs, compuertas, SISE, alertas y Worker AI quedan como INTEGRATION_NOT_VERIFIED.
4. **Etiquetas de la matriz.** La matriz usa variantes (FUNC-01, FUNC-02, FUNC-07). Las aserciones exactas pueden fallar por nomenclatura y no por defecto funcional; hay que confirmarlas con el analista funcional.
5. **`tools/run.mjs` con `shell: true`.** Un `--grep` con espacios se parte (`--grep "dominio por usuario"` → "No tests found"). Conviene usar etiquetas sin espacios o filtrar por archivo. Está anotado para una mejora genérica.

## 6. Fase 1C (2026-10-13): reutilización y aislamiento

- **`shared/`, `tools/`, `playwright.config.ts` y los demás proyectos no se modificaron.** Todo el cambio vive en `projects/seguros-del-estado/`.
- **Reutilizado de `shared/` sin cambios:** `utils/zip.ts` (`leerZip`/`escribirZip`) para el paquete sanitizado y para escanear el interior de los `.xlsx`; `utils/HistorialCasos` para registrar los casos 425 y 426; `core/LoginActions`; `runner/scenarioLoader.generarUnico`.
- **Reutilizado dentro de SDE (sin duplicar):** `contenedorTabla`/`filasQueCoinciden` alimentan `resolverFila`, que ahora comparten `tabla_eliminar_fila` y la nueva `tabla_seleccionar_fila`. `campo`/`valorMostrado`/`infoCampo` sustentan `teclear` (UI-05). `crearContexto().secretos` es la única fuente de valores a enmascarar, tanto en los reportes como en el escaneo de exportación.
- **Nuevo y genérico (candidato a `shared/` cuando lo valide un segundo portal):** bloques de escenario con parámetros (`incluir` + `con`, expandidos antes del validador estricto) y métricas de tres indicadores (`sde/metricas.ts`).
- **Corrección de un error latente propio:** `contenedorTabla` descartaba las cabeceras vacías, lo que desalineaba los índices de columna frente a las celdas cuando la grilla tiene una columna de selección o de acciones sin título. Ahora conserva las posiciones.

## 7. Sprint del 2026-10-13 (tarde)

- **Sin cambios fuera de `projects/seguros-del-estado/`.**
- `sde/verticales.ts` (nuevo): el registro de pruebas por escenario se movió desde `tests/verticales.spec.ts` para reutilizarlo en `tests/variantes.real.spec.ts` sin duplicarlo. El comportamiento de los verticales no cambió.
- `adjuntar_en_grilla` amplía la capability existente (`secuencia: guardar_primero` + `refrescar_con`) en lugar de crear otra. La carga real por el diálogo "Subir un archivo" reemplaza la búsqueda de un `input[type=file]` en la fila, que nunca existió en el DOM real.
- Regla estática nueva (`tests/unit/secuencia-variantes.unit.spec.ts`): ningún escenario abre el pop-up de filas sin garantizar los datos para cerrarlo con "Guardar" (BUG-03).
