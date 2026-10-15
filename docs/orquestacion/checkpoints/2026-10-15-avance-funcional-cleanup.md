# Checkpoint "Avance funcional HU03/HU06 y cleanup de casos QA" — 2026-10-15

- Commit inicial: `1ae1efd` (`main`, merge del PR #3) · Commit final: HEAD de `feat/sde-avance-funcional-cleanup` (PR en borrador hacia `main`, sin fusionar)
- Para revisar: `git diff 1ae1efd..feat/sde-avance-funcional-cleanup --stat`
- Ejecuciones reales autorizadas por Juan Miguel (creación de casos cuando el escenario lo requiera). Se usó `SDE_E2E=1` solo en cada corrida vertical, con un worker, `--retries=0` y trace off.
- No se tocaron los casos 434 ni 571 ni ningún otro histórico. No se pulsó «Cancelar casos», «Terminar», «Desistir» ni Cancelar de un pop-up.

## 1. Cobertura por CP: antes y después (corregida tras la auditoría de Work, PR #4)

**Vocabulario:**
- **Aprobado:** paso PASS con una expectativa aprobada.
- **Parcial:** parte verificada y parte sin fuente aprobada (NOT_AUTOMATED).
- **Observado pendiente:** se vio en QA, pero falta la definición funcional.
- **BLOCKED por dato.**
- **Integración no comprobada.**

La columna «motor» conserva la clasificación exacta del reporte.

| CP | Antes (`main`, última evidencia) | Después (15/10): veredicto funcional | Clasificación exacta del motor |
|---|---|---|---|
| HU06-CP05 | FAIL del 14/10 14:51, sin caso: P3 por el formato del Ramo (P-14); solo P2 PASS | **REAL_PASS_PARCIAL, caso 630.** Aprobados: P2, P3, P4, P5 y P7. Parcial: P6. **P8 observado, pendiente de P-18.** P9: integración (Worker AI) no comprobada | Reporte bruto: P2–P5 y P7 PASS; P6 PASS + NOT_AUTOMATED; P8 PASS (escenario de `17608ac`, reinterpretado: ver `docs/evidencia/2026-10-15_interpretacion-caso-630.md`); P9 INTEGRATION_NOT_VERIFIED. El escenario corregido clasifica P8 como NOT_AUTOMATED |
| HU06-CP01 (oficial) | FAIL del 13/10: P2–P8 PASS, P9 FAIL | **FAIL (`PRODUCTO_POR_CONFIRMAR`), sin caso.** Aprobados: P2, P3 y P5–P8. P4 parcial (no automatizado por completo). **P9 detenido por el comportamiento documental** | P2–P8 PASS (la línea de P4 de presentación: NOT_AUTOMATED); P9: narrativa PASS y `adjuntar_en_grilla` FAIL `PRODUCTO_POR_CONFIRMAR`; P10 en adelante NOT_RUN |
| HU03-CP01 | BLOCKED (datos); precreación del 14/10 | BLOCKED (datos), precreación de solo lectura del 15/10. Aprobados: P2–P5. P6 parcial. **P7 BLOCKED por dato** (placa multipóliza) | P2–P5 PASS; P6 PASS + NOT_AUTOMATED; P7 BLOCKED `DATO` |
| HU03-CP02 | BLOCKED (datos); precreación del 14/10 | Igual que CP01. P6 parcial, con un subpaso no automatizable (sin criterio de tipo y longitud). **P7 BLOCKED por dato** (póliza Autos vigente) | P2–P5 PASS; P6 PASS + NOT_AUTOMATED ×2; P7 BLOCKED `DATO` |
| Resto (13 CP) | Sin cambios | Sin cambios | — |

**Indicadores (`docs/TRAZABILIDAD-17-CP.md`, regenerado):** 17 CP · 13 escenarios · ejecutados 2/17 · **aprobados E2E completos 0/17**. REAL_PASS_PARCIAL no es aprobación; la precreación no cuenta como ejecución del CP.

## 2. Pasos ejecutados en QA (observación) frente a pasos aprobados

- **HU06-CP05 (caso 630):**
  - **Aprobados** (observados y con expectativa aprobada):
    - P2: sesión;
    - P3: Línea y Ramo, con el Tipo de Solicitud asignado;
    - P4: Sucursal;
    - P5: Individual, con los elementos de Masivo ocultos;
    - P7: consulta y Crear (CREATENEWCASE 630).
  - **Parcial:** P6 (etiquetas exactas y ortografía sin hallazgos; orden, obligatoriedad y capitalización sin fuente, P-11).
  - **Observado pendiente:** P8. El buscador lista «Consultar información de solicitud» → «Consultar SISE» y no «Estructurar información». No es una ruta aprobada (P-18).
  - **Integración no comprobada:** P9 (Worker AI).
- **HU06-CP01:**
  - **Aprobados:** P2, P3 y P5–P8. Incluyen la etiqueta de Masivo, la leyenda exacta y la narrativa editable.
  - **Parcial:** P4.
  - **P9:** la narrativa se diligenció. El documento obligatorio no pudo adjuntarse en la secuencia de la matriz: «Tipo Documental» no tiene opciones hasta guardar la fila. Es un comportamiento de la interfaz reproducido, asociado a BUG-01; **no es un defecto de negocio confirmado** (P-02).
- **HU03-CP01/CP02** (precreación de solo lectura, sin Crear):
  - **Aprobados:** P2–P5, como intermediario.
  - **Parcial:** P6.
  - **BLOCKED por dato:** P7.
- **ENV-03 (`@habilitacion`):** el intermediario sí ve el proceso; `intermediario_alerta` no. El control (analista) PASA.

## 3. Validaciones y escenarios nuevos

- **D-43, búsqueda con subprocesos:**
  - El buscador lista un caso en varias filas: proceso principal y subproceso «Consultar Información de Solicitud» → «Consultar SISE».
  - `buscarCaso` une las actividades de todas las filas y elige la fila principal por el proceso configurado.
  - `abrir_caso` pulsa en la fila que lista la actividad.
  - Sin proceso, varias filas siguen siendo una ambigüedad explícita.
- **P-18, ruta observada y no aprobada (corrección de Work):**
  - Los nombres observados se conservan como evidencia en la expectativa `RUTA-CONSULTA-UNITARIA`. Su estado es `pendiente_definicion`, con `actividades_observadas`, a cargo de Daniel/Karen.
  - HU06-CP05 P8 declara esa expectativa y queda NOT_AUTOMATED: nunca PASS.
  - El validador rechaza todo escenario, variante o bloque cuyo `llega_a` incluya una actividad solo observada sin declarar la expectativa.
  - No se inventó otra ruta. «Estructurar información» sigue prohibida.
- **D-44, contra la acumulación, con cupo atómico (corrección de Work):**
  - Cada vertical anota los casos propios pendientes.
  - Con `SDE_MAX_CASOS_PENDIENTES=<n>`, el conteo y el límite se evalúan **dentro** del bloqueo H6, que se mantiene hasta registrar el caso (`conCupoDeCreacion`).
- **Diagnóstico P-17** (`tests/cleanup-diagnostico.real.spec.ts`, solo lectura, `SDE_DIAG_CLEANUP=1`):
  - administración de casos por actor;
  - búsqueda por número de un caso propio del histórico;
  - estado actual de los casos propios con el buscador global, sin abrirlos.
- **Selectores de administración** en `SdeObjects`: los botones que escriben («Cancelar casos», «Terminar», «Copiar/Revocar permisos») están en `componentesEscritura` (guardia DOM).
- **Observación BAJA de Work (PR #3) corregida:** el mensaje de `ProteccionNoInstaladaError` dice si el interceptor de red quedó registrado.

## 4. Comportamientos reproducidos u observados

| Id | Estado 15/10 | Detalle |
|---|---|---|
| BUG-01 | **Comportamiento de interfaz reproducido** (HU06-CP01 P9); **no** es defecto de negocio confirmado | «Tipo Documental» sin opciones hasta guardar la fila («Por favor guarde el registro antes de subir el archivo»). Clasificación del motor: `PRODUCTO_POR_CONFIRMAR`. La decisión funcional está en P-02 |
| Cambio de flujo (no es un bug) | Observado | La consulta unitaria abre un subproceso con fila propia en el buscador. Rompió la automatización (caso 628) y se corrigió con D-43. Los nombres de la ruta están pendientes de P-18 |
| SISE | Indicio | Los casos 628 y 630 siguen en «Consultar SISE» más de una hora después de creados. No se simula ni se da por verificada la integración |

## 5. Integraciones

| Integración | Estado | Tratamiento |
|---|---|---|
| Worker AI (HU06-CP05 P9, CP01 P12/P17) | No observable | INTEGRATION_NOT_VERIFIED |
| SISE (consulta unitaria) | Casos detenidos en «Consultar SISE» | No se espera ni se fuerza; bloquea Completar información (HU03) |
| Alertas del intermediario | Reportada caída por QA | Sin cambios (P-13) |

## 6. Casos creados y estado del cleanup

| Caso | CP / corrida | Resultado | Registro | Cierre |
|---|---|---|---|---|
| 628 | HU06-CP05 `20261015-150353` | FAIL de automatización (buscador con dos filas) | Registrado al responder CREATENEWCASE | Pendiente (no hay mecanismo validado) |
| 630 | HU06-CP05 `20261015-151217` | REAL_PASS_PARCIAL | Registrado | Pendiente |

La segunda corrida se justificó tras corregir la automatización: no fue un reintento ciego. HU06-CP01 no creó caso. Ambos casos están en `docs/evidencia/historico-casos.json` (20 en total).

## 7. Los 18 casos históricos (sin cambiar estados)

- Se consultaron con el buscador global, sin abrirlos: `docs/evidencia/2026-10-15_p17-diagnostico-cleanup.json`.
- Los 18 (336 a 571, incluidos 434 y 571) aparecen en **una fila sin actividad actual ni vencimiento pendiente**.
- El analista no los encuentra en Admin → Casos (`records=0` para 336 y 429).
- **Hipótesis, no decisión:** el proceso los cerró al vencer el temporizador «Máximo tiempo de radicación», visible en los casos nuevos. Debe confirmarlo QA.
- No se marcó ninguno como «Depurado».

## 8. Avance de P-17

1. **Mecanismos de Colsubsidio analizados:** `HistorialCasos`, `RecuperacionCasos`, `cleanup.mjs`/`depurar.mjs` y la cancelación administrativa de `bizagiQaSupport.ts`.
2. **Registro en SDE:** inmediato al responder CREATENEWCASE (`registrarCasoCreado`).
3. **Cierre en SDE, verificado en QA:**
   - el intermediario no tiene menú Admin;
   - el analista ve «Casos» con «Cancelar casos» y «Terminar», pero no encuentra sus casos;
   - cierre funcional: «Desistir» solo existe en Completar información (inalcanzable sin SISE).
4. **Cierre ≠ cancelación ≠ abandono ≠ eliminación:** la distinción está en `SEGURIDAD-SOLO-LECTURA.md`. Hoy los casos quedan abandonados y, al parecer, el proceso los cierra.
5. **Validación sobre un caso desechable:** **no se hizo**, porque ningún actor puede encontrar el caso para cancelarlo. No se implementó `cleanup-pendientes.spec.ts`: un cleanup sin procedimiento validado sería un PASS falso.
6. **Implementado:** el umbral contra la acumulación (D-44) y el diagnóstico reproducible.

## 9. Pruebas

- `npx tsc --noEmit`: sin errores.
- `node tools/run.mjs seguros-del-estado --grep "@unit"`: **221/221** (215 + 4 + 2).
- **Detección del fallo anterior:** con `capacidades.ts` de `1ae1efd` restaurado temporalmente, las 4 regresiones de búsqueda **fallan**. Después se devolvió el archivo corregido (hash `aa94ff92…` verificado).
  - En 3 de ellas la causa es el defecto: una ambigüedad con dos filas.
  - La de una sola fila falla porque el resultado anterior no tenía `filas`.
- **Regresiones del mensaje BAJA:** B2 y B4 (variante) comprueban cada caso del interceptor de red, registrado y no registrado.
- **Pruebas reales (QA):**
  - HU06-CP05 ×2;
  - HU06-CP01 ×1;
  - precreación de solo lectura ×4 CP;
  - `@habilitacion`: 2 PASS y 1 FAIL esperado (ENV-03 de `intermediario_alerta`);
  - diagnóstico P-17 ×3, de solo lectura.
- **Demo, Colsubsidio y CONPRE:** no se tocó `shared/` ni `tools/`.

## 10. Preguntas para QA

**Daniel / Karen:**
1. P-17: ¿el proceso cierra el caso al vencer «Máximo tiempo de radicación»? ¿Cuánto dura ese tiempo y en qué estado queda el caso?
2. P-17: ¿hay un usuario de QA con permiso para administrar los casos del proceso SDE? El analista ve Admin → Casos, pero la búsqueda no devuelve sus casos. ¿Cuál es el procedimiento permitido para cerrar los casos de prueba?
3. P-18: ¿«Consultar información de solicitud» y «Consultar SISE» son el camino regular de consulta unitaria (HU06-CP05 P8)? ¿Qué sigue después: alertas del intermediario y Completar información?
4. ¿SISE está disponible? Los casos 628 y 630 llevan más de una hora en «Consultar SISE».
5. BUG-01 (P-02): ¿la secuencia de documentos de la matriz (HU06-CP01 P9) sigue vigente o cambia el control de cambios?
6. P-07: ¿se pueden dar por cerrados 434 y 571 según la respuesta de la pregunta 1?

**Iván:**
7. Una placa multipóliza (HU03-CP01) y una póliza Autos vigente de la clave de INT-013403 (HU03-CP02).
8. P-12: combinaciones de los masivos.

**Administrador:**
9. Rol de inicio para `intermediario_alerta` (ENV-03).

## 11. Riesgos

- **Cambios de parametrización y flujo en QA sin aviso:** el formato del Ramo (14/10) y el subproceso de consulta (15/10). Los dos rompieron corridas.
- **HU06-CP05 y HU06-CP01 no pueden pasar de REAL_PASS_PARCIAL** sin evidencia del Worker AI.
- **HU06-CP01 oficial** está detenido en P9 por el comportamiento documental asociado a BUG-01, pendiente de decisión funcional (P-02).
- **HU03 depende de SISE y de datos de QA.**
- **Acumulación de casos:** el umbral existe, pero el número lo acuerda QA. El cierre automático no está confirmado.
- **Alcance del cupo atómico:** es el del bloqueo H6, un mismo equipo y su histórico local. Dos computadores con históricos distintos no se coordinan. Además, solo lo aplican las verticales y variantes; la calibración en modo «nuevo» y el diagnóstico de documentos crean casos fuera de ese cupo, siempre con autorización explícita.
- **Riesgo residual de P-15** (sin cambios): si el registro del propio interceptor falla, nada intercepta; la inspección se detiene.
- **P-16:** el efecto de abrir actividades sigue sin calibrar. En esta fase no se abrió ninguna.

## 12. Seguimiento de pendientes

| Pendiente | Estado |
|---|---|
| P-11 | Sin cambios: sin fuente de orden, obligatoriedad ni capitalización |
| P-12 | Sin cambios |
| P-13 | Indicio de SISE detenido |
| P-14 | Formato vigente, datos locales ajustados |
| P-15 | Implementada; BAJA corregida |
| P-16 | Sin observación nueva |
| P-17 | Diagnóstico hecho, cancelación no validable, umbral implementado |
| P-18 | Nueva. HU06-CP05 P8 queda pendiente de definición (expectativa `RUTA-CONSULTA-UNITARIA`) |

## 13. Archivos

| Archivo | Cambio |
|---|---|
| `sde/capacidades.ts` | `buscarCaso` con subprocesos (D-43); `verificar_ruta` y `abrir_caso` pasan el proceso |
| `sde/verticales.ts` | `limiteCasosPendientes` y anotación de pendientes (D-44); cupo atómico `conCupoDeCreacion` dentro del bloqueo H6 (corrección de Work) |
| `sde/soloLectura.ts` | Mensaje BAJA |
| `baseObjects/sde.objects.ts` | Selectores de administración y botones de administración en la guardia DOM |
| `escenarios/1-hu06-cp05.yaml` | P8 declara `RUTA-CONSULTA-UNITARIA` (pendiente): los nombres observados no aprueban el paso (corrección de Work) |
| `data/expectativas-presentacion.yaml`, `sde/presentacion.ts`, `sde/escenario.ts` | Expectativa de ruta pendiente con `actividades_observadas` y regla del validador (P-18) |
| `tests/unit/ruta-pendiente.unit.spec.ts` (nuevo) | Regresiones P-18 |
| `tests/cleanup-diagnostico.real.spec.ts` (nuevo) | Diagnóstico P-17 de solo lectura |
| `tests/bloqueos.real.spec.ts` | `buscarCaso` con el proceso principal |
| `tests/unit/busqueda-casos.unit.spec.ts` (nuevo) | Regresión D-43 |
| `tests/unit/confiabilidad.unit.spec.ts` | Regresión D-44 |
| `tests/unit/solo-lectura.unit.spec.ts` | Regresión BAJA |
| `docs/evidencia/` | Interpretación corregida del caso 630 (`2026-10-15_interpretacion-caso-630.md`); 3 reportes de CP sanitizados (todo valor del `.env` reemplazado por «env:CLAVE»), diagnóstico P-17 e histórico con 628 y 630 |
| `docs/TRAZABILIDAD-17-CP.md` | Regenerado |
| `DECISIONES.md` | D-43, D-44, P-16, P-17, P-18 y P-07 |
| `ESTADO-ACTUAL.md`, `SEGURIDAD-SOLO-LECTURA.md` | Actualizados |

## 14. Correcciones de la auditoría de Work sobre el PR #4 (HEAD auditado `17608ac`)

Veredicto de Work: REQUIERE CORRECCIONES, con dos hallazgos de severidad MEDIA. No hubo ejecuciones contra Bizagi, ni cambios en `.env`, ni en casos de QA (628 y 630 siguen pendientes de conciliación y cierre).

### Corrección 1: P-18, ruta no aprobada presentada como PASS

- **Mecanismo existente, sin inventar una ruta:**
  - Se añadió la expectativa `RUTA-CONSULTA-UNITARIA` en `data/expectativas-presentacion.yaml`, con estado `pendiente_definicion`, a cargo de Daniel/Karen (P-18).
  - Conserva los nombres observados en `actividades_observadas` como evidencia de la interfaz.
- **HU06-CP05 P8** declara la expectativa:
  - el motor clasifica el paso NOT_AUTOMATED aunque la capacidad llegue a la actividad observada;
  - P9, que comparte el paso `[8, 9]`, se agrega como NOT_AUTOMATED;
  - el paso de integración sigue registrado como INTEGRATION_NOT_VERIFIED.
- **Validador** (`sde/escenario.ts`): rechaza cualquier escenario, variante o bloque cuyo `llega_a` incluya una actividad solo observada sin declarar la expectativa. La comparación ignora mayúsculas y espacios.
- **Caso 630:**
  - el reporte bruto no se modificó;
  - la interpretación corregida y trazable está en `docs/evidencia/2026-10-15_interpretacion-caso-630.md` (observación técnica frente a veredicto funcional);
  - la trazabilidad regenerada muestra CP05 con implementación 5/3/0/0/0, porque P8 pasa a mixto.

### Corrección 2: carrera en `SDE_MAX_CASOS_PENDIENTES`

- **Secuencia anterior:** contar pendientes → aplicar el límite → adquirir el bloqueo H6 → crear y registrar. Dos corridas podían leer 19 con límite 20 y terminar con 21.
- **Secuencia nueva** (`conCupoDeCreacion` en `sde/verticales.ts`):
  1. adquirir el bloqueo H6;
  2. contar y aplicar el límite;
  3. ejecutar: crear y registrar (`registrarCasoCreado` se espera dentro de la ejecución);
  4. liberar en `finally`.
- **Reserva:** el cupo de la corrida admitida queda reservado por el propio bloqueo hasta que su caso está registrado. Rechazo, excepción o cancelación liberan en `finally`, así que no quedan reservas fantasma.
- **Infraestructura:** no se agregó ningún bloqueo nuevo; se reutilizó `BloqueoArchivo`.
- **Alcance:** un mismo equipo y su histórico local. No protege entre computadores.

### Pruebas

- `npx tsc --noEmit`: sin errores.
- SDE `@unit`: **232/232**: 221 + 7 del cupo atómico (reemplaza una comprobación estática) + 4 de P-18. Siguen pasando las regresiones de P-06 (activación), P-15 (solo lectura) y UI-10 (barrera de pop-ups).
- **Regresiones del cupo** (servicios simulados: histórico en memoria y el bloqueo de archivo real en una ruta temporal; sin Bizagi):
  - (1) dos corridas simultáneas con 19 y límite 20: solo una autorizada, con espera y sin espera;
  - (2) rechazo: no ejecuta y libera;
  - (3) error al crear: libera y no deja reserva;
  - (4) la siguiente corrida ve el nuevo pendiente;
  - (5) sin límite: solo informa;
  - bloqueo ocupado: CONCURRENCIA sin contar.
  - Además, una prueba reproduce el defecto con la secuencia anterior: termina en 21.
- **Regresiones de P-18:**
  - el catálogo declara la ruta pendiente;
  - el CP05 sintético con llegada observada nunca da P8 PASS ni REAL_PASS;
  - una variante sin la expectativa se rechaza, también con un solo nombre y en otra capitalización;
  - todos los escenarios y variantes del repositorio cargan.
- **Pruebas ajustadas a la semántica corregida, sin debilitarlas:**
  - `clasificacion` (CP05: 5 UI y 3 mixtos; el control solo quita las expectativas);
  - `confiabilidad` H7 (CP05: pendientes `[6, 8, 9]`);
  - `ejecutor` (P8 y P9 NOT_AUTOMATED; la integración sigue registrada).
- **Detección de los defectos con el código auditado:** con `escenario.ts`, `presentacion.ts`, el catálogo, el YAML de CP05 y `verticales.ts` de `17608ac` restaurados temporalmente, fallan 10 de las 12 regresiones nuevas. P8 sale PASS, y el runner aplica el límite fuera del bloqueo.
  - Las 2 que pasan son la reproducción del defecto (pasa a propósito) y la carga de escenarios.
  - Después se restauraron los archivos corregidos, con hash verificado.

### Riesgos residuales

- El cupo no coordina computadores distintos.
- La calibración en modo «nuevo» y el diagnóstico de documentos crean casos fuera del cupo, siempre con autorización explícita.
- Mientras P-18 siga abierta, HU06-CP05 no puede pasar de REAL_PASS_PARCIAL, aunque haya evidencia del Worker AI.
- Nuevos cambios de flujo en QA pueden volver a exigir observaciones pendientes.
