# Reporte Fase 1B — SDE-CEL: desbloqueo y E2E real

Ejecución: 2026-10-08, 09:00–11:15 (UTC-5), contra `https://test-aiprocesos-sde.bizagi.com/`, con Edge, Playwright 1.61.1 y `--workers=1 --trace off`. Los traces están apagados porque Playwright registraría las claves tecleadas.

## 0. Resultado

| Vertical | Resultado | Caso real | Resumen |
|---|---|---|---|
| **HU06-CP05** Individual → compuerta ¿Masivo? | **PASS (REAL_PASS_PARCIAL)** | **352** (y 348 en la corrida anterior) | 7 de 9 pasos verificados contra QA. P6 (ortografía global) NOT_AUTOMATED; P9 ("no se invoca Worker AI") INTEGRATION_NOT_VERIFIED |
| **HU03-CP02** Individual Autos por póliza | **BLOCKED** | — | Falta la póliza SISE (DATA-09). Además, los intermediarios no pueden iniciar el proceso (ENV-03) y los Individuales que radica el analista quedan detenidos antes de Completar información (BUG-02) |
| **HU06-CP01** Masivo Generales Póliza Nueva | **FAIL (defecto del producto)** | — (Bizagi rechaza la creación) | P2–P8 PASS. P9: la grilla "Documentos Anexos" no ofrece tipos documentales y "Crear" exige el tipo 3 (BUG-01). Los pasos 13–17 y 27–29 se verificaron contra QA en una calibración aparte (§4) |

No se declara ningún PASS sin sesión real, caso real y resultado observado. SISE, Worker AI y las respuestas de Bizagi **no se simularon**.

## 1. Autenticación

| Rol (alias) | Dominio | Login real | Permisos observados |
|---|---|---|---|
| analista | `domain` | ✔ PASS | Portal CE_Analista: Mi Portal, Bandeja, Nuevo Caso, Consultas, Reportes. Puede iniciar "Gestión Solicitudes Centro Expedición" (App > Processes > Centro de Expedición, id 4, formulario de inicio). Trabaja "Estructurar información" |
| intermediario | `externos` | ✔ PASS | Bandeja y Nuevo Caso, **sin procesos habilitados** (`Rest/Processes/All` → categorías vacías) → **ENV-03** |
| intermediario_alerta | `externos` | ✔ PASS | Igual que intermediario (sin procesos) |

`tests/login.spec.ts`: 3/3 PASS en dos corridas.

## 2. Configuración de entorno

- Archivo: `projects/seguros-del-estado/.env`, cargado por `tools/run.mjs` y `playwright.config.ts`. Lo excluye `.gitignore` (`projects/**/.env`). Tiene 54 variables, con los mismos nombres que `.env.example` (lo verifica una prueba @unit).
- **Completado por QA:** `USUARIO_`, `CLAVE_` y `DOMINIO_` de intermediario, analista e intermediario_alerta. Ningún valor se imprimió en consola, reportes ni documentos.
- **Completado por la automatización** (configuración pública y listas paramétricas leídas de QA; solo se rellenaron claves vacías):
  - `SDE_PROCESO_RADICACION` = "Gestión Solicitudes Centro Expedición"
  - `SDE_PROCESO_CATEGORIA` = "App > Processes > Centro de Expedición"
  - `SDE_SUCURSAL` = BOGOTA
  - `SDE_RUTA_*` = Autos / AUTOMÓVILES LIVIANOS INDIVIDUAL / Modificación / Número de póliza / campo "Número de Póliza"
  - `SDE_AUTOS_RAMO`, `SDE_AUTOS_MOVIMIENTO`, `SDE_GEN_RAMO`
- **Criterio sintético declarado:** `SDE_RUTA_CRITERIO_VALOR` es un número de 9 dígitos **no verificado en SISE**. Solo lo usa HU06-CP05, cuya aserción es la ruta, que no depende del resultado de SISE.
- **Pendiente de QA (sin valor):** `SDE_AUTOS_POLIZA` (CP02), `SDE_GEN_MASIVO_NARRATIVA_POLIZAS`, `SDE_EST_TOMADOR_NIT(_2)`, `SDE_DOCS_*` (CP01) y los datos de Fase 2/3. Ver TEST-DATA-GAPS.

## 3. Selectores verificados contra el DOM real

Todos viven en `baseObjects/sde.objects.ts`:

| Área | Selector / regla | Estado |
|---|---|---|
| Login | `#domain` → `#user` / `#password` / `#btn-login` | VERIFICADO |
| Sesión | `#menuListInbox` | VERIFICADO |
| Nuevo caso | `#menuListNew` → `#breadcrumbRoot` → `#allProcesses li.category > h3` (texto exacto) → `li.process` | VERIFICADO |
| Formulario de inicio | diálogo `.ui-dialog.ui-bizagi-start-form-dialog`; campo `div.ui-bizagi-render[data-render-xpath]`; etiqueta `span.ui-bizagi-label > label` | VERIFICADO |
| Combo | `input[role=combobox]` + `aria-controls` → `#listbox-… li[role=option]`. Las cascadas (Línea→Ramo) se re-renderizan: se reabre la lista de forma idempotente | VERIFICADO |
| Radio | `label[for]` exacto dentro del contenedor ("Individual"/"Masiva", "Si"/"No") | VERIFICADO |
| Obligatorio | `.control-required`, solo visible mientras el campo está **vacío** | VERIFICADO |
| Solo lectura | `.ui-bizagi-noneditable-normal` / `label.readonly-control` | VERIFICADO |
| Grupos | `.bzg-form-group` con `:scope > h3` exacto; referencia "Grupo › Etiqueta" | VERIFICADO |
| Botones | `.ui-bizagi-button-container input.ui-bizagi-button` (valor) | VERIFICADO |
| Creación de caso | respuesta `POST /Rest/Handlers/MultiAction` → `CREATENEWCASE.CaseNumber` + UI "Caso N" (viewport 1440×900) | VERIFICADO |
| Forma "quieta" | sin `MultiAction` en curso durante 1,5 s y sin cargador (Bizagi re-ejecuta reglas en bucle, OBS-09) | VERIFICADO |
| Búsqueda / ruta | `#menuQuery` → `td.I_RadNumber` → `ul.gridListWorkItems li .ui-bizagi-wp-app-inbox-activity-name`, con recarga real por consulta porque el buscador del SPA reutiliza resultados | VERIFICADO |
| Abrir actividad | clic en la actividad exacta de la fila + respuesta `WorkItems` (displayName) + zona de botones | VERIFICADO |
| Grillas | `.bzg-form-grid` por `.bz-rn-grid-header-title` exacto; columnas `thead th label`; filas `tbody.ui-bizagi-grid-body > tr`; acciones `li[data-action=add\|edit\|remove\|save]` | VERIFICADO (columnas y acciones); edición y adición solo exploradas (BUG-03) |
| Documentos | grilla en línea: Adicionar → combo Tipo Documental → Guardar fila → `input[type=file]` | VERIFICADO hasta el combo (lista vacía, BUG-01) |
| Completar información de solicitud | — | **PENDIENTE**: no hubo caso propio que llegara a esa actividad |

### Listas paramétricas observadas en QA (para la Fase 2)

| Campo | Opciones reales |
|---|---|
| Línea | Cumplimiento · Generales · Autos |
| Ramo (Autos) | AUTOMÓVILES LIVIANOS INDIVIDUAL · AUTOMÓVILES PESADOS INDIVIDUAL |
| Ramo (Generales) | RC MEDICO PROFESIONAL INDIVIDUAL |
| Tipo de Solicitud (Generales) | Póliza Nueva · Modificación · Renovación. En Autos se asigna solo: "Modificación" (solo lectura) |
| Tipo de Radicación | Individual · Masiva |
| Forma de Consulta Unitaria (Autos, Individual) | Número de póliza · Placa |
| Sucursal | 34 oficinas (p. ej. BOGOTA, MEDELLIN, CALI, OFICINA PRINCIPAL) |
| Ramo (Cumplimiento) | No relevado (Fase 2) |

## 4. Pasos ejecutados y evidencia

### HU06-CP05 — Caso 352 (`evidencia/HU06-CP05_20261008-110858.json`)

| P | Estado | Observado en QA |
|---|---|---|
| 2 | PASS | Login real del analista; formulario de inicio del proceso abierto por la ruta de categorías |
| 3 | PASS | Línea=Autos, Ramo=AUTOMÓVILES LIVIANOS INDIVIDUAL; Tipo de Solicitud auto-asignado "Modificación" |
| 4 | PASS | Sucursal=BOGOTA |
| 5 | PASS | Tipo de Radicación=Individual; "Descripción de la Solicitud (Masiva/Múltiple)" no visible; aparece "Forma de Consulta Unitaria" |
| 6 | NOT_AUTOMATED (parcial) | Etiquetas exactas presentes (6). La ortografía global no tiene glosario; hallazgos en OBS |
| 7 | PASS | Forma de Consulta Unitaria=Número de póliza; criterio diligenciado y confirmado; radio = Individual; **CREATENEWCASE CaseNumber 352** y la UI muestra "Caso 352" |
| 8 | PASS | Bizagi lista "Consultar Alertas Intermediario" (flujo unitario) y **nunca** "Estructurar información" |
| 9 | INTEGRATION_NOT_VERIFIED | La ruta unitaria se confirma (P8); que el Worker AI no se invoque no es observable |

Caso registrado automáticamente en `test-results/seguros-del-estado/historico-casos.json`.

### HU03-CP02 — BLOCKED (`evidencia/HU03-CP02_20261008-110950.json`)

El preflight bloquea por `SDE_AUTOS_POLIZA` sin valor. Aunque QA la entregue, sigue bloqueado por:
- **ENV-03:** el intermediario no puede iniciar el proceso.
- **BUG-02:** si radica el analista, el caso no pasa de "Consultar Alertas Intermediario".

El formulario de inicio de CP02 (pasos 2–7) está calibrado, porque comparte DOM con CP05.

### HU06-CP01 — FAIL por defecto (`evidencia/HU06-CP01_20261008-110951.json`)

| P | Estado | Observado |
|---|---|---|
| 2–3 | PASS | Generales / RC MEDICO PROFESIONAL INDIVIDUAL / Póliza Nueva |
| 4–5 | PASS | Etiquetas Línea, Ramo, Tipo de Solicitud, Sucursal; Sucursal obligatoria (vacía) y luego BOGOTA |
| 6 | PASS | Tipo de Radicación=Masiva; visibles "Descripción de la Solicitud (Masiva/Múltiple)" y "Documentos Anexos" |
| 7 | PASS | Línea exacta "Masivo: Solicitud asociada a más de una póliza." |
| 8 | PASS | Descripción editable |
| 9 | **FAIL** | Narrativa OK; **"Documentos Anexos": el combo "Tipo Documental" no ofrece ninguna opción** (BUG-01) |
| 10–29 | NOT_RUN | Sin caso (Bizagi rechaza "Crear": "Debe agregar y adjuntar… ID de tipos documentales: 3") |

**Calibración complementaria** (`tests/calibracion.real.spec.ts`) sobre el caso propio 343 (Generales/Modificación Masiva, que sí se crea):
- P13–P17, P28 y P29: **PASS contra el DOM real** (encabezado, Tipo de Consulta y narrativa en solo lectura; columnas de "Detalle Polizas Asociadas"; pestañas; datos maestros en solo lectura).
- P27: **FAIL**, la etiqueta es "Observaciónes" (BUG-04).

La edición y adición de filas no se automatizó porque Cancelar el pop-up rompe el caso (BUG-03). Esta calibración **no** cuenta como resultado de CP01.

## 5. Defectos funcionales detectados

Se registran aparte y las aserciones no se modificaron. Detalle reproducible en `evidencia/2026-10-08_calibracion-y-bugs.txt`.

| ID | Severidad sugerida | Descripción | Evidencia |
|---|---|---|---|
| **BUG-01** | Alta (bloquea Masivo Póliza Nueva) | "Documentos Anexos" → combo "Tipo Documental" sin opciones en todas las combinaciones Masivas probadas; "Crear" exige el tipo obligatorio 3 → no se puede radicar Masivo de Póliza Nueva | Corrida HU06-CP01 P9 + respuesta `CREATENEWCASE validationMessages` |
| **BUG-02** | Alta, por confirmar | Los casos Individuales radicados por CE_Analista quedan detenidos en "Consultar Alertas Intermediario" (vencida, sin asignado): casos 336, 345–348, 352. El 337 (otro equipo) sí avanzó | Fila del buscador por caso |
| **BUG-03** | Alta | Cancelar el pop-up "Editar/Adicionar Detalle Polizas Asociadas" deja el caso inutilizable: "ArgumentException: Invalid scope action type" al reabrir | Casos 342 (Editar→Cancelar) y 350 (Adicionar→Cancelar), reproducido en caso nuevo |
| **BUG-04** | Baja | Ortografía: "Observaciónes" en Estructurar información | Calibración P27 |
| OBS-01…09 | Baja / por confirmar | Nomenclatura (tildes, "Masiva" vs "Masivo", etiquetas distintas a la matriz), mensaje con ID interno, advertencia "llamadas iterativas" visible al usuario | Archivo de evidencia |

## 6. Casos creados en QA (todos propios; política CLEANUP_NOT_APPLICABLE)

336, 342, 343, 345, 346, 347, 348, 350 y 352, en `evidencia/historico-casos.json`:
- 336, 342, 343 y 350: exploración y calibración.
- 345–348 y 352: corridas de HU06-CP05.
- **342 y 350** quedaron inutilizables por BUG-03.

No se tocaron casos de otros equipos; el 337 solo se consultó en el buscador. No se hicieron operaciones administrativas ni destructivas.

## 7. Cambios de código en esta fase (solo `projects/seguros-del-estado/`)

| Archivo | Cambio |
|---|---|
| `baseObjects/sde.objects.ts` | Selectores verificados (§3); claves nuevas: árbol de procesos, búsqueda, grillas, rutaAcciones |
| `sde/ui.ts` | Grupos "Grupo › Etiqueta"; texto exacto más interno; combos con `aria-controls` y reapertura idempotente; radios `label[for]`; marcas reales de obligatorio/solo lectura; `unicoVisible` tolerante a re-render (sigue fallando ante ambigüedad); "forma quieta" por red; línea exacta para ayudas multilínea; botones `input` |
| `sde/capacidades.ts` | `nuevo_caso` por árbol; número de caso desde `CREATENEWCASE` y registro inmediato; `verificar_ruta`/`abrir_caso` por buscador con recarga; `adjuntar_en_grilla`; `dialogo_cancelar`; acciones de pie de grilla; navegación tolerante a DNS (120 s); errores de red como ENTORNO; viewport 1440×900 |
| `sde/escenario.ts`, `sde/ejecutor.ts` | `requiere` por paso (BLOCKED sin detener); `llega_a` con lista; CP con pasos bloqueados = BLOCKED (nunca verde); sanitización de credenciales y datos `sensible`, no de configuración |
| `sde/datos.ts` | Propiedades opcionales (vacío, nunca inventado); `describir` muestra valores no sensibles |
| `data/datasets.yaml`, `manifest/casos.yaml` | Valores reales de matriz ("Masiva"), datasets opcionales, nuevas brechas ENV-03 / BUG-01…04 |
| `escenarios/*.yaml` | Los 3 verticales con etiquetas reales, actor real y pasos calibrados |
| `tests/verticales.spec.ts`, `tests/calibracion.real.spec.ts` (nuevo) | Viewport; calibración de solo lectura sobre caso propio |
| `tests/unit/*` | DOM sintético calcado del DOM real; nuevas pruebas (combo sin opción, `.control-required`, línea exacta, `dialogo_cancelar`, `requiere`, sanitización) |
| `.env.example` | Configuración pública prellenada (proceso y categorías) |

`shared/` **no** se modificó en esta fase. El diff contra la línea base sigue siendo solo `shared/core/LoginActions.ts` y `shared/runner/BpmEngine.ts` (Fase 1) más `projects/demo/tests/login-dominio.unit.spec.ts`.

## 8. Resultado de pruebas y regresiones

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm test -- seguros-del-estado --list` | 57 tests en 9 archivos |
| `npm test -- seguros-del-estado --workers=1 --retries=0 --trace off` | **53 passed, 3 skipped, 1 failed**: el failed es HU06-CP01 por BUG-01; los skipped son CP02 BLOCKED, calibración (requiere `SDE_CALIBRAR_CASO`) y exploración |
| unitarias `@unit` | 47/47 |
| `npm test -- demo` | 48 passed / 4 failed **preexistentes** (placeholders de plantilla sin URL), idéntico a la línea base |
| `npm test -- colsubsidio login-navegacion.unit` | 6/6 |
| Escaneo de secretos/PII en `projects/seguros-del-estado` y reportes | 0 credenciales; 0 correos (el único match es la versión del paquete npm) |

## 9. Entorno: observaciones de estabilidad

- **DNS intermitente** de `test-aiprocesos-sde.bizagi.com` (`ERR_NAME_NOT_RESOLVED`, a veces más de 40 s). Se mitiga con navegación idempotente de hasta 120 s; si persiste, el error se reporta como ENTORNO.
- La forma del formulario de inicio re-ejecuta reglas en bucle (OBS-09): los clics sin espera por condición caen sobre controles en repintado.
