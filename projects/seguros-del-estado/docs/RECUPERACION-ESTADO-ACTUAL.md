# Recuperación del estado actual — SDE-CEL (checkpoint de auditoría)

> **Corrección (auditoría de Work):** donde este documento dice "7/9" para HU06-CP05, el conteo correcto es 6 de 8 pasos PASS (P2–P5, P7, P8; P1 es el objetivo); P6 mixto (etiquetas verificadas, ortografía global no automatizada) y P9 integración no verificable.

> **Actualización 2026-10-13 (tarde):** el sprint posterior reclasificó BUG-01 (secuencia, con control de cambios), BUG-02 (actor no conforme) y BUG-03 (ya reportado por QA), e identificó la causa de ENV-03. Estado vigente en `RESUMEN-EJECUTIVO-REUNION-2026-10-13.md`. Corrección a §6.F de este documento: la ejecución "sin `@cp05`" de esa mañana sí creó un caso adicional, el **427** (HU06-CP05, 09:57), por un filtro de pruebas mal interpretado en Windows. Está registrado y su resultado es idéntico al del 425.

Fecha de la auditoría: **2026-10-13**, en el PC nuevo (Windows 11 Pro, Node v22.14.0, TypeScript 5.9.3, Playwright 1.61.1, canal Edge).
Raíz real: `<ruta-del-repositorio>`.

Este documento registra lo **observado** al abrir el repositorio, antes de implementar nada. Las secciones §5 y §6, escritas al cerrar la fase, contienen la entrega completa (A–G).

## 1. Conclusión principal

**La Fase 1C nunca se ejecutó.** El workspace está exactamente en el estado del cierre de la Fase 1B (2026-10-08 11:15).

Evidencia:

| Fuente | Observación |
|---|---|
| Fechas de archivos | Ningún archivo de código, escenario, dato o documento de SDE es posterior al 2026-10-08 11:15. Lo único posterior son los artefactos de una corrida `@unit` (`test-results/.../.last-run.json`, 2026-10-08 11:17:08, `passed`). |
| Código | No existe ninguna pieza propia de la 1C: no hay exportación sanitizada, métricas de tres indicadores, `abrir_pestana`, `intentar_diligenciar` ni `tabla_seleccionar_fila`, ni escenarios de Fase 2 (`escenarios/` solo tiene los 3 verticales). |
| Reportes reales | `test-results/seguros-del-estado/sde/` tiene solo reportes del 2026-10-08 (último CP05: `HU06-CP05_20261008-110858.json`, caso 352). |
| Historial de casos | Últimos casos 350 y 352 (2026-10-08). No hay casos posteriores creados por la automatización. |
| Línea base re-medida hoy | `npx tsc --noEmit` exit 0 · `--list` 57 tests en 9 archivos · `@unit` **47/47** (1.0 min). Idéntico a lo reportado en la 1B. |

No hay Git (`fatal: not a git repository`) ni ZIP de respaldo en la raíz. La carpeta `SDE_arranque_Claude_2026-10-07/` es el paquete de arranque de la Fase 1 (anterior a la 1B, no es un respaldo más reciente) y no se usó como fuente de código.

## 2. Entorno y credenciales

| Verificación | Resultado |
|---|---|
| `projects/seguros-del-estado/.env` | **Existe** (70 líneas) y lo cargan `tools/run.mjs` y `playwright.config.ts`. |
| Nombres de variables vs `.env.example` | Idénticos (diff vacío). |
| Roles `analista`, `intermediario`, `intermediario_alerta` | `USUARIO_`, `CLAVE_` y `DOMINIO_` **con valor** para los tres. Los valores no se imprimieron. |
| Exclusión de Git | `.gitignore` contiene `projects/**/.env`, `test-results/` y `*.log`. |
| Configuración pública | `BIZAGI_BASE_URL`, `SDE_PROCESO_*`, `SDE_SUCURSAL`, `SDE_RUTA_*`, `SDE_AUTOS_RAMO/MOVIMIENTO`, `SDE_GEN_RAMO` con valor. |
| Datos de negocio de QA | **Todos vacíos**, igual que en la 1B: `SDE_AUTOS_POLIZA`, `SDE_GEN_MASIVO_NARRATIVA_POLIZAS`, `SDE_EST_TOMADOR_NIT(_2)`, `SDE_DOCS_*` y todos los de Fase 2/3. |
| Dependencias | `node_modules` presente; Playwright 1.61.1 y Edge operativos (la suite @unit corre). No se reinstaló nada. |

Que las credenciales tengan valor **no** prueba que sigan vigentes: se re-verifican con `@login` (§5).

## 3. Reconciliación de la antigua Fase 1C (estado observado el 2026-10-13, antes de cambios)

| Actividad | Estado observado | Evidencia y comentario |
|---|---|---|
| Exportación sanitizada | **PENDIENTE** | No existe herramienta. `docs/evidencia/` contiene `2026-10-07_qa-login-dominio.png` y logs; las capturas del reporte HTML muestran nombre y correo del usuario QA (anotado en la 1B). |
| Métricas funcionales (implementada / ejecutada / aprobada) | **PENDIENTE** | `TRAZABILIDAD-17-CP.md` muestra un solo "Estado" por CP. Ningún documento separa los tres indicadores. |
| Preflight y clasificación | **PARCIAL** | Implementados y verificados en unitario (BLOCKED sin datos, FAIL sin caso real, PARCIAL ≠ PASS). Riesgos encontrados: (a) la trazabilidad usa el **último** reporte, así que una corrida BLOCKED en este PC (o un FAIL por DNS) **taparía** la evidencia real del CP05; (b) un actor sin proceso habilitado (ENV-03) se clasificaría como FAIL de producto en vez de bloqueo ambiental; (c) Playwright marca *passed* un `REAL_PASS_PARCIAL` sin que el resumen técnico lo distinga. |
| Registro de casos creados por automatización | **IMPLEMENTADO Y VERIFICADO** | `registrarCasoCreado` se llama al recibir `CREATENEWCASE`; el caso 352 quedó registrado automáticamente. |
| Regresión HU06-CP05 | **IMPLEMENTADO Y VERIFICADO** (2026-10-08) | `REAL_PASS_PARCIAL`, caso 352, 7/9 pasos. Se reutiliza esa evidencia; no hace falta crear otro caso salvo cambio de código en su ruta. |
| UI-04 Pestañas y contenido | **PENDIENTE** | Solo se verifica que las pestañas estén visibles (P28 de la calibración, caso 343). No hay navegación ni verificación de contenido. |
| UI-05 Negativas de campos | **PENDIENTE** | Solo existe una prueba unitaria de truncado por `maxlength`; no hay capability. |
| UI-06 Selección única en colecciones | **PENDIENTE** | — |
| Operaciones de grilla | **IMPLEMENTADO SIN VERIFICACIÓN SUFICIENTE** | `tabla_abrir_fila`/`tabla_agregar`/`dialogo_confirmar`/`tabla_eliminar_fila` probadas en DOM sintético. En QA solo se verificaron columnas y acciones; la edición real está bloqueada por BUG-03 y por datos. |
| HU06 CP02–04 | **PENDIENTE** | Manifest en PREPARADO, sin escenario. |
| HU03 CP01, CP03–08 | **PENDIENTE** | Manifest en PREPARADO, sin escenario. |
| Investigación ENV-03 | **BLOQUEADO POR DEPENDENCIA EXTERNA** (último dato: 2026-10-08) | Se re-verifica en solo lectura. |
| BUG-01 / BUG-02 / BUG-03 | **BLOQUEADO POR DEPENDENCIA EXTERNA** (último dato: 2026-10-08) | Se re-verifican BUG-01 y BUG-02 sin crear casos. BUG-03 **no** se reproduce otra vez. |
| Test Data SISE | **BLOQUEADO POR DEPENDENCIA EXTERNA** | Ningún dato de negocio entregado (§2). |
| Regresiones | **IMPLEMENTADO Y VERIFICADO** (2026-10-08) | Se re-miden al cierre. |
| Documentación | **PARCIAL** | Vigente al 2026-10-08. Falta cobertura en tres indicadores y el estado recuperado. |

## 4. Decisiones tomadas en la auditoría

1. **No se recrea nada existente.** Los 3 escenarios, el motor, los selectores verificados y la evidencia de la 1B se conservan. Lo nuevo se construye sobre ellos.
2. **No se crean casos nuevos para re-demostrar el CP05.** La evidencia del caso 352 sigue vigente. Solo se re-ejecuta si cambia código de su ruta, y entonces se anota el nuevo caso.
3. **Verificación de bloqueos en solo lectura:** login, `Rest/Processes/All` por rol, buscador para los casos propios detenidos y el formulario de inicio sin pulsar "Crear". No se toca "Cancelar" del pop-up (BUG-03) ni casos ajenos.
4. **Orden de trabajo:** Prioridad A (exactitud y seguridad) → re-verificación de bloqueos en QA → capabilities UI-04/05/06 con pruebas sintéticas y calibración de solo lectura donde sea posible → escenarios de Fase 2 (quedarán BLOCKED por datos, sin declararse automatizados de punta a punta) → regresiones y documentación.

## 5. Re-verificación en QA (2026-10-13)

Detalle textual: `docs/evidencia/2026-10-13_recuperacion-y-bloqueos.txt`. Todo con `--workers=1 --trace off`.

| Ítem | Resultado hoy | Cómo se verificó |
|---|---|---|
| Ambiente + login 3 roles | **PASS 5/5** | `@smoke` |
| ENV-03 | **VIGENTE** | Respuesta 200 de `/Rest/Processes/All` que recibe el propio portal: intermediario e intermediario_alerta sin el proceso; analista con él |
| BUG-01 | **VIGENTE** | Formulario Masiva / Póliza Nueva sin pulsar "Crear": "Tipo Documental" sin opciones. No se creó caso |
| BUG-02 | **REPRODUCIDO, sigue POR CONFIRMAR** | Caso nuevo 425 en "Consultar Alertas Intermediario". Los casos 336, 345–348 y 352 ya no tienen actividades abiertas: se cerraron sin avanzar (~2 h después) |
| BUG-03 | **VIGENTE y AMPLIADO** | El caso propio 426 quedó con "Invalid scope action type" sin pulsar Cancelar: basta con salir del pop-up sin Guardar (cerrar la sesión con el pop-up abierto) |
| BUG-04 | **VIGENTE** | Calibración sobre el caso 426: no existe la etiqueta "Observaciones" (la UI dice "Observaciónes") |
| HU06-CP05 | **REAL_PASS_PARCIAL, caso 425** | Regresión real tras cambiar `nuevo_caso` (mismos 7/9 pasos que el caso 352) |
| UI-04 pestañas | **VERIFICADO EN QA** | Caso 426: ambas pestañas se activan con su panel; Seguimiento muestra "Estructurar información" |
| Pop-up de fila | Abre (VERIFICADO); estructura relevada | Caso 426: "Forma Consulta", "Número Póliza" (`maxlength=20`, OBS-11), "Digito de Verificacion del Tomador" (OBS-10); botones Guardar y Cancelar |

## 6. Cierre de la fase (entrega)

### A. Recuperación del estado

- **Qué encontré:** el repositorio en el PC nuevo era una copia íntegra del cierre de la Fase 1B (2026-10-08 11:15), sin Git ni ZIP posterior. `node_modules`, Edge y Playwright 1.61.1 estaban operativos y el `.env` presente, con credenciales de los 3 roles.
- **Fase 1C:** **no se había ejecutado**. No había ningún archivo, capability, escenario, reporte ni caso posterior al 8 de octubre (§1).
- **Qué se recuperó:** nada tuvo que reinstalarse. Las credenciales siguen vigentes (login 3/3). Al `.env` local solo se le agregaron, vacías, las 4 claves nuevas de datos, para que tenga los mismos nombres que `.env.example`.

### B. Cambios realizados (todos dentro de `projects/seguros-del-estado/`)

| Archivo | Cambio y por qué |
|---|---|
| `sde/ejecutor.ts` | `EntornoError`: un bloqueo de ambiente (DNS, ENV-03) deja el paso en BLOCKED. Si no hay FAIL, los NOT_RUN posteriores a un bloqueo dejan el CP en **BLOCKED**, no en FAIL |
| `sde/capacidades.ts` | `nuevo_caso` detecta ENV-03 en la respuesta que recibe el portal. Nuevas `abrir_pestana` (UI-04), `intentar_diligenciar` (UI-05) y `tabla_seleccionar_fila` (UI-06). `resolverFila` se comparte con `tabla_eliminar_fila`. Corrección: las columnas sin título ya no desalinean los índices. `buscarCaso` se exporta para la verificación de bloqueos |
| `sde/ui.ts` | `teclear`: prueba negativa tecla a tecla, devuelve lo que el campo muestra |
| `sde/escenario.ts` | Validador para las 3 capabilities nuevas. **Bloques reutilizables** (`incluir` + `con`) expandidos antes de la validación estricta. Orden numérico de los escenarios |
| `sde/metricas.ts` (nuevo) | Tres indicadores independientes. La evidencia es el último reporte **ejecutado**: un BLOCKED de preflight no la tapa |
| `sde/trazabilidad.ts` | Usa las métricas: tabla de cobertura y "último intento" separado de la evidencia |
| `sde/exportar.ts` (nuevo) + `tests/exportar.tool.spec.ts` | Paquete sanitizado: solo framework + SDE. Excluye `.env`, resultados, capturas, traces y logs. Escanea todo, también los `.xlsx`, y no genera el zip si hay un hallazgo |
| `baseObjects/sde.objects.ts` | `rutaProcesos` (VERIFICADO), pestañas (VERIFICADO el 2026-10-13), selección de fila y mensajes [PENDIENTE] |
| `tests/*.spec.ts` que inician sesión | `trace: 'off'` declarado en el código, ya no solo por línea de comandos |
| `tests/bloqueos.real.spec.ts` (nuevo) | Re-verificación de solo lectura de ENV-03 / BUG-01 / BUG-02 / BUG-03 (`SDE_VERIFICAR_BLOQUEOS=1`) |
| `tests/calibracion.real.spec.ts` | Modo `SDE_CALIBRAR_CASO=nuevo` (crea un caso de calibración Masiva/Modificación registrado), pestañas y modo de pop-up **explícitamente destructivo** (`SDE_CALIBRAR_POPUP=DESTRUYE_CASO`) |
| `tests/unit/` | Nuevos: `seguridad`, `clasificacion`, `capacidades-ui` y `bloques`. Ajustado: `datos-escenario` (el conteo sale del manifest) |
| `escenarios/4…13-*.yaml` + `escenarios/_bloques/*.yaml` | 10 escenarios de Fase 2 sobre 6 bloques (ver C) |
| `data/datasets.yaml`, `.env.example`, `manifest/casos.yaml` | Literales de la matriz para HU03, 4 variables nuevas, manifest de los 10 CP nuevos (BLOCKED), BUG-02/03 actualizados, UI-09 y OBS-11 |
| `docs/evidencia/historico-casos.json` | Se **enmascaró** un valor sensible del `.env` que la Fase 1B había dejado en la copia compartible (lo detectó el escaneo nuevo). Se agregaron los casos 425 y 426 |
| Documentos | Este archivo, TEST-DATA-GAPS (§00 + solicitud a QA), SIGUIENTE-FASE (§00), AUDITORIA (§6), README, TRAZABILIDAD (regenerada) |

**`shared/`, `tools/`, `playwright.config.ts`, Colsubsidio, CONPRE y Demo: sin cambios** (verificado por fechas de modificación; ver F).

### C. Cobertura de los 17 CP

Generada desde los reportes reales en `TRAZABILIDAD-17-CP.md`. **Implementada 13/17 · Ejecutada 2/17 · Aprobada 0/17.** "Implementada" significa que existe un escenario declarativo válido. **No** significa calibrado contra QA: las etiquetas `[PENDIENTE]` de cada escenario lo indican.

| CP | Implementación | Ejecución real | Estado funcional | Último caso | Pasos | Dependencias pendientes |
|---|---|---|---|---|---|---|
| HU06-CP01 | Escenario 1B (completo) | Sí (2026-10-08) | **FAIL** (BUG-01) | — (Bizagi rechaza Crear) | P2–P8 PASS; P9 FAIL; P10–P29 NOT_RUN. P13–P17, P28 y P29 re-verificados en calibración (caso 426), sin valor de CP | BUG-01, BUG-03, datos de narrativa y NIT |
| HU06-CP02 | Nuevo, bloques | No | BLOCKED (datos) | — | 22 pasos declarados; pop-up de Autos [PENDIENTE] | ENV-03, placa(s), narrativa, BUG-03 |
| HU06-CP03 | Nuevo, bloques | No | BLOCKED (datos) | — | 25 pasos; listas de Cumplimiento [PENDIENTE] | ENV-03, ramos/pólizas RCE, OBS-11, BUG-03 |
| HU06-CP04 | Nuevo, bloques (P15 FUNC-05 declarado) | No | BLOCKED (datos) | — | 23 pasos | ENV-03, pólizas, FUNC-05, BUG-03 |
| HU06-CP05 | Escenario 1B | **Sí (2026-10-13)** | **REAL_PASS_PARCIAL** | **425** (antes 352) | 7/9 PASS; P6 NOT_AUTOMATED; P9 INTEGRATION_NOT_VERIFIED | Radica el analista (desviación por ENV-03); sin traza del Worker AI |
| HU03-CP01 | Nuevo, bloques + UI-06 | No | BLOCKED (datos) | — | 22 pasos; Completar información [PENDIENTE] (UI-09) | ENV-03, BUG-02, placa multipóliza |
| HU03-CP02 | Escenario 1B | No (intento BLOCKED 2026-10-08) | BLOCKED | — | 21 pasos | ENV-03, BUG-02, `SDE_AUTOS_POLIZA` |
| HU03-CP03 | Nuevo, bloques | No | BLOCKED | — | 21 pasos | ENV-03, BUG-02, póliza Generales |
| HU03-CP04 | Nuevo, bloques | No | BLOCKED | — | 20 pasos (P14 edición autorizada declarada) | ENV-03, BUG-02, tomador existente, documento PN |
| HU03-CP05 | Nuevo, bloques | No | BLOCKED | — | 21 pasos | ENV-03, BUG-02, tomador inexistente confirmado |
| HU03-CP06 | Nuevo, bloques | No | BLOCKED | — | 21 pasos | ENV-03, BUG-02, pólizas Cumplimiento/RCE |
| HU03-CP07 | Nuevo, bloques | No | BLOCKED | — | 21 pasos | ídem; pregunta RCE en el inicio [PENDIENTE] |
| HU03-CP08 | Nuevo, bloques | No | BLOCKED | — | 21 pasos | ídem |
| HU03-CP09–CP12 | **No implementados** (PREPARADO) | No | — | — | — | Usuario con alerta real, póliza de otro intermediario, póliza inexistente, RCE inexistente. Se dejan para cuando exista la base HU03 calibrada (Prioridad E no debía retrasar los verticales) |

### D. Defectos y bloqueos

| ID | Clasificación | Estado al 2026-10-13 |
|---|---|---|
| ENV-03 | **Bloqueo ambiental** | Vigente. Falta que QA o el administrador habiliten el proceso o confirmen que solo radica el Analista. No se tocó ningún permiso |
| BUG-01 | **Defecto funcional o de parametrización** (impide ejecutar) | Vigente: la lista "Tipo Documental" está vacía y "Crear" exige el tipo 3 |
| BUG-02 | **Posible defecto por confirmar** | Reproducido (caso 425). Puede ser esperado si las alertas requieren la clave de un intermediario, y el radicador es analista por ENV-03. No se trata como defecto confirmado |
| BUG-03 | **Defecto funcional confirmado** (destruye casos) | Ampliado: cualquier salida del pop-up sin Guardar. Casos 342, 350 y 426 inutilizables (todos propios) |
| BUG-04 | **Error de nomenclatura** | Vigente ("Observaciónes") |
| OBS-10 | Nomenclatura | "Digito de Verificacion del Tomador" sin tildes en el pop-up |
| OBS-11 | **Diferencia respecto de la matriz, por confirmar** | `maxlength=20` en "Número Póliza" frente a la regla de 9–12 numéricos. Puede validarse al Guardar; no se pudo comprobar sin destruir otro caso |
| UI-09 | **Escenario aún no calibrado** | "Completar información de solicitud" nunca se ha podido observar |
| Worker AI / SISE / alertas | **Comportamiento no observable** | INTEGRATION_NOT_VERIFIED (INT-01/02) |

### E. Test Data

`TEST-DATA-GAPS.md` §00 tiene la tabla actualizada, las variables nuevas y el **texto listo para enviar a QA**. Resumen: credenciales y configuración pública están READY. Los **datos de negocio no han llegado** (0 de 22 variables de pólizas, placas, documentos y narrativas). El criterio de HU06-CP05 sigue siendo **sintético** y está declarado como tal. No se enumeraron pólizas ni se consultó SISE al azar.

### F. Calidad técnica

| Control | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm test -- seguros-del-estado --list` | 105 tests en 15 archivos (línea base 1B: 57 en 9) |
| Unitarias SDE `@unit` | **80/80** (línea base 1B: 47/47; +33 nuevas) |
| Suite SDE completa (sin `@cp05`, ya ejecutado hoy) | 103 tests: **85 passed, 17 skipped, 1 failed**. Failed = HU06-CP01 por BUG-01 (esperado; no crea caso). Skipped = 11 verticales BLOCKED (de ellos, HU03-CP05 excluido por el filtro `@cp05`, que coincide con dos CP; ya existe la etiqueta única `@HU03-CP05`) + calibración, exploración, 4 de bloqueos y exportación (herramientas que se activan con su variable). Ningún escenario nuevo quedó verde |
| `@smoke` (ambiente + login real) | 5/5 |
| HU06-CP05 real | REAL_PASS_PARCIAL, caso 425 |
| Regresión Demo | 48 passed / 4 failed: los mismos 4 de plantilla sin URL real que en la línea base (no son regresiones) |
| Regresión Colsubsidio `login-navegacion.unit` | 6/6 |
| Aislamiento | Ningún archivo fuera de `projects/seguros-del-estado/` modificado desde el 2026-10-12 (búsqueda por fecha) |
| Escaneo de secretos del paquete exportable | 0 hallazgos (prueba `@seguridad`, contra los valores reales del `.env` local) tras enmascarar la fuga encontrada en `historico-casos.json` |

Comandos usados: los de README, siempre con `--workers=1 --trace off` contra QA.

**Riesgos:**
1. Una falla con el pop-up abierto destruye el caso propio (BUG-03). Afecta a HU06 CP01–CP04.
2. Los escenarios HU03 dependen de etiquetas no calibradas (UI-09).
3. Los casos propios se cierran a las ~2 h: las calibraciones deben hacerse dentro de ese plazo.
4. Las capturas del reporte HTML local muestran nombre y correo del usuario QA: nunca compartir `test-results/`, solo el paquete de `exportar.tool`.

### G. Siguiente fase

Ver `SIGUIENTE-FASE.md` §00. La Fase 1C queda **cerrada en lo que no dependía de terceros**. La próxima fase es **"Fase 2-A — desbloqueo y primera ejecución de la familia Individual"**, disparada por ENV-03 y los datos de HU03. Sin esos desbloqueos, más código no sube la cobertura ejecutada ni la aprobada.

**Decisiones que requieren a Juan Miguel / QA:**
1. Enviar la solicitud de TEST-DATA-GAPS §00.
2. Definir cómo cerrar el pop-up de forma segura en los CP masivos. Propuesta: terminar siempre con "Guardar" de una fila válida y aceptar que una falla intermedia consuma un caso propio.
3. Confirmar si, mientras siga ENV-03, se acepta el analista como radicador **solo para calibrar** (nunca para aprobar CP de intermediario).
