# Checkpoint "Avance funcional HU03/HU06 y cleanup de casos QA" — 2026-10-15

- Commit inicial: `1ae1efd` (`main`, merge del PR #3) · Commit final: HEAD de `feat/sde-avance-funcional-cleanup` (PR en borrador hacia `main`, sin fusionar)
- Para revisar: `git diff 1ae1efd..feat/sde-avance-funcional-cleanup --stat`
- Ejecuciones reales autorizadas por Juan Miguel (creación de casos cuando el escenario lo requiera). Se usó `SDE_E2E=1` solo en cada corrida vertical, con un worker, `--retries=0` y trace off.
- No se tocaron los casos 434 ni 571 ni ningún otro histórico. No se pulsó «Cancelar casos», «Terminar», «Desistir» ni Cancelar de un pop-up.

## 1. Cobertura por CP: antes y después

| CP | Antes (`main`, última evidencia) | Después (15/10) | Avance |
|---|---|---|---|
| HU06-CP05 | FAIL del 14/10 14:51, sin caso: P3 por el formato nuevo del Ramo (P-14); solo P2 PASS | **REAL_PASS_PARCIAL, caso 630**: P2–P5, P7 y P8 PASS; P6 mixto; P9 integración no observable | De 1 a **7 de 9 pasos** de la matriz verificados en QA (P1 objetivo y P9 Worker AI no observables) |
| HU06-CP01 (oficial) | FAIL del 13/10: P2–P8 PASS, P9 FAIL | FAIL del 15/10: P2–P8 PASS, **P9 FAIL reproducido** (BUG-01), sin caso | Sin avance funcional: el producto impide pasar de P9. Estructurar sigue cubierto por la calibración del caso 571 |
| HU03-CP01 | BLOCKED (datos); precreación del 14/10 P2–P6 | BLOCKED (datos); precreación del 15/10 **P2–P6 PASS**; P7 sin placa multipóliza | Igual; ENV-03 confirmado de nuevo |
| HU03-CP02 | BLOCKED (datos); precreación del 14/10 | BLOCKED (datos); precreación del 15/10 **P2–P6 PASS**; P7 no automatizable (sin criterio de tipo y longitud); P8 sin póliza Autos vigente | Igual |
| Resto (13 CP) | Sin cambios | Sin cambios | — |

**Indicadores (`docs/TRAZABILIDAD-17-CP.md`, regenerado):** implementados 13/17 · ejecutados 2/17 · **aprobados 0/17**. REAL_PASS_PARCIAL no es aprobación.

## 2. Pasos ejecutados y verificados en QA

- **HU06-CP05 (caso 630):**
  - P2: sesión del analista.
  - P2–P3: formulario de inicio.
  - P3: Línea y Ramo; Tipo de Solicitud asignado.
  - P4: Sucursal.
  - P5: Individual, con los elementos de Masivo ocultos.
  - P6: etiquetas exactas y ortografía sin hallazgos.
  - P7: forma y criterio de consulta, y Crear (CREATENEWCASE 630).
  - P8–P9: la ruta llega al flujo de consulta unitaria y Estructurar no aparece.
- **HU06-CP01:** P2–P8 PASS, incluidos la etiqueta exacta de Masivo, la narrativa editable y la obligatoriedad de Sucursal. P9 FAIL antes de Crear.
- **HU03-CP01/CP02 (precreación de solo lectura, sin Crear):** P2–P6 PASS como intermediario.
- **ENV-03 (`@habilitacion`):** el intermediario sí ve el proceso; `intermediario_alerta` no. El control (analista) PASA.

## 3. Validaciones y escenarios nuevos

- **D-43, búsqueda con subprocesos:**
  - El buscador lista un caso en varias filas (proceso principal y subproceso «Consultar Información de Solicitud» → «Consultar SISE»).
  - `buscarCaso` une las actividades de todas las filas y elige la fila principal por el proceso configurado.
  - `abrir_caso` pulsa en la fila que lista la actividad.
  - Sin proceso, varias filas siguen siendo ambigüedad explícita.
- **HU06-CP05 P8–P9:** acepta «Consultar información de solicitud» y «Consultar SISE» como llegada al flujo regular de consulta unitaria. El YAML ya aceptaba «cualquier actividad de ese flujo». Los nombres están por confirmar (P-18).
- **D-44, contra la acumulación:** cada vertical anota los casos propios pendientes. Con `SDE_MAX_CASOS_PENDIENTES=<n>` queda BLOCKED (CONFIGURACION) antes de crear otro caso.
- **Diagnóstico P-17** (`tests/cleanup-diagnostico.real.spec.ts`, solo lectura, `SDE_DIAG_CLEANUP=1`):
  - administración de casos por actor;
  - búsqueda por número de un caso propio del histórico;
  - estado actual de todos los casos propios con el buscador global, sin abrirlos.
- **Selectores de administración** en `SdeObjects`: los botones que escriben («Cancelar casos», «Terminar», «Copiar/Revocar permisos») se añadieron a `componentesEscritura` (guardia DOM).
- **Observación BAJA de Work (PR #3) corregida:** el mensaje de `ProteccionNoInstaladaError` dice si el interceptor de red quedó registrado. Si no quedó, ya no afirma que «la red aborta toda acción».

## 4. Bugs nuevos o reproducidos

| Id | Estado 15/10 | Detalle |
|---|---|---|
| BUG-01 | **Reproducido** (HU06-CP01 P9) | «Tipo Documental» sin opciones hasta guardar la fila («Por favor guarde el registro antes de subir el archivo»). PRODUCTO_POR_CONFIRMAR; decisión en P-02 |
| Cambio de flujo (no es bug) | Nuevo | La consulta unitaria abre un subproceso con fila propia en el buscador. Rompió la automatización (caso 628) y se corrigió con D-43 |
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
3. P-18: ¿«Consultar información de solicitud» y «Consultar SISE» son el camino regular de consulta unitaria (HU06-CP05 P9)? ¿Qué sigue después: alertas del intermediario y Completar información?
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
- **HU06-CP01 oficial** está detenido por BUG-01.
- **HU03 depende de SISE y de datos de QA.**
- **Acumulación de casos:** el umbral existe, pero el número lo acuerda QA. El cierre automático no está confirmado.
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
| P-18 | Nueva |

## 13. Archivos

| Archivo | Cambio |
|---|---|
| `sde/capacidades.ts` | `buscarCaso` con subprocesos (D-43); `verificar_ruta` y `abrir_caso` pasan el proceso |
| `sde/verticales.ts` | `limiteCasosPendientes` y anotación de pendientes (D-44) |
| `sde/soloLectura.ts` | Mensaje BAJA |
| `baseObjects/sde.objects.ts` | Selectores de administración y botones de administración en la guardia DOM |
| `escenarios/1-hu06-cp05.yaml` | Llegada al flujo de consulta unitaria |
| `tests/cleanup-diagnostico.real.spec.ts` (nuevo) | Diagnóstico P-17 de solo lectura |
| `tests/bloqueos.real.spec.ts` | `buscarCaso` con el proceso principal |
| `tests/unit/busqueda-casos.unit.spec.ts` (nuevo) | Regresión D-43 |
| `tests/unit/confiabilidad.unit.spec.ts` | Regresión D-44 |
| `tests/unit/solo-lectura.unit.spec.ts` | Regresión BAJA |
| `docs/evidencia/` | 3 reportes de CP sanitizados (todo valor del `.env` reemplazado por «env:CLAVE»), diagnóstico P-17 e histórico con 628 y 630 |
| `docs/TRAZABILIDAD-17-CP.md` | Regenerado |
| `DECISIONES.md` | D-43, D-44, P-16, P-17, P-18 y P-07 |
| `ESTADO-ACTUAL.md`, `SEGURIDAD-SOLO-LECTURA.md` | Actualizados |
