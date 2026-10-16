# Checkpoint «HU06: E2E posterior al despliegue» — 2026-10-16

## Contexto

- **Merge del PR #5:** `bfabc45cccea459d2d8fe0dc82906881c49f28be`, con padres `da6536b` y `516e411`. El contenido es idéntico al HEAD aprobado por Work.
- **Rama:** `feat/sde-hu06-e2e-post-despliegue`, desde `bfabc45`. El PR va en borrador y sin fusionar.
- **Contexto de QA:** HU06 se desplegó en QA el 16/10. Daniel aclaró que la narrativa Masiva admite pólizas y placas ficticias (no se validan contra SISE). Se dispone del requerimiento V1 y del V1.1.
- **Reporte para QA:** `projects/seguros-del-estado/docs/REPORTE-HU06-2026-10-16.md`.
- **Discrepancias V1 / V1.1:** `projects/seguros-del-estado/docs/HU06-V1-VS-V1.1.md`.
- **Condiciones de las ejecuciones reales** (autorizadas por Juan Miguel):
  - `SDE_E2E=1` solo en cada corrida;
  - un worker y sin reintentos;
  - el bloqueo H6 y el cupo de casos pendientes;
  - ninguna corrida unitaria en paralelo;
  - solo casos propios. No se tocaron sesiones ni casos de las pruebas manuales de Juan Miguel.

## 1. Hito 1: análisis y corrección de suposiciones

**Precedencia (D-48):** V1.1, más el diseño de CP y las aclaraciones de QA. La V1 (pólizas separadas por «;») quedó sustituida. La regla RCE de V1.1 coincide con CP03/CP04.

**Suposiciones corregidas:**
- **Datos reales para la extracción:** se eliminaron `NARRATIVA-REAL-*` y `NARRATIVA-POLIZAS`. Las narrativas son **ficticias y versionadas**:
  - Generales Póliza Nueva: NIT de tomadores;
  - Autos: pólizas y placas;
  - Cumplimiento: narrativa del Ciclo 1 de Daniel, de 436 caracteres.
- **Datos para la edición:** también son ficticios: placas, NIT y pólizas en `EST-FILA-*`. Solo «Ramo RCE» sigue siendo un dato paramétrico de QA.
- **Las 0 filas de 638 y 639:** la narrativa no tenía identificadores. No fue el Worker.
- **CP05 P9:** es una aserción **negativa**: no se envía al Worker ni a Estructurar. No depende de que el Worker funcione.
- **El Worker en CP01 y CP02 (D-51):** solo cubre la invocación, que no es observable. La tabla visible se juzga con `tabla_verificar`.
- **Observaciones BAJA de Work sobre el PR #5:** corregidas en el reporte y el checkpoint del 15/10. CP01 no tuvo caso; Estructurar «no se observó»; P9 de 637 es INTEGRATION_NOT_VERIFIED.

## 2. Hito 2: preparación (código)

| Cambio | Archivo |
|---|---|
| `tabla_verificar.comparar`: valores introducidos frente a observados (observación, no aserción) | `sde/capacidades.ts`, `sde/escenario.ts` (validador) |
| `celdasDeFila` (lectura exacta de una fila por su grilla) | `sde/capacidades.ts` |
| `dialogo_confirmar` relee la grilla hasta 15 s | `sde/capacidades.ts` |
| Modos de calibración `GUARDAR_SIN_CAMBIOS` y `GUARDAR_CON_CAMBIO`; modo «nuevo» con la narrativa del Ciclo 1 | `tests/calibracion.real.spec.ts` |
| Pop-up de Autos `calibrado`, con mapeo y evidencia (D-49) | `data/popups-calibrados.yaml` |
| CP02 P13–P21 según el diseño y V1.1 (D-50) | `escenarios/4-hu06-cp02.yaml` |
| Valor temporal de Sucursal con el formato vigente | `escenarios/_variantes/hu06-cp01-secuencia-producto.yaml` |
| Variables que dejaron de usarse | `.env.example` (el `.env` local no se tocó) |
| CP02 incluye `EST-FILA-AUTOS-PLACA` | `manifest/casos.yaml` |

## 3. Hito 3: ejecuciones reales (16/10)

| Hora | Ejecución | Caso | Resultado |
|---|---|---|---|
| 15:14 | TRAZA de 637 y 630 (solo nombres) | — | La traza solo expone subprocesos; la invocación del Worker no es observable |
| 15:18 | Estado de los casos propios (buscador) | — | 571, 628, 630 y 637–639 cerrados con «Fecha Solución» = vencimiento del temporizador (P-17) |
| 15:23 | CP02 oficial | **651** | **Extracción 3/3 pólizas y 3/3 placas**; P2–P12 y P22 PASS; pop-up BLOCKED (datos reales, ya corregido) |
| 15:24–15:28 | Calibración UI-10 ×3 | 651 | Guardar sin cambios → cierra; Forma Consulta = Placa → solo Placa → cierra; al reabrir persiste |
| 15:30 | CP02 oficial | **652** | P13–P17 y P19 PASS; P18 (verificación de lo mostrado) mal planteada → rediseñada |
| 15:32 | CP02 oficial | **653** | P18 PASS (7 caracteres no se registran). Después, con un valor válido, «Guardar» no cerró (P-21a) |
| 15:37 | CP02 oficial | **654** | **18 PASS**: P2–P8, P10–P17, P19–P22. P18 falló por automatización (tras las pestañas no se ve la grilla); P9 y P12 INTEGRATION_NOT_VERIFIED |
| 15:39 | Calibración «nuevo» con la narrativa del Ciclo 1 | **655** | **Extracción 4/4 pólizas**; Estructurar completo PASS |
| 15:40 | CP05 oficial | **656** | REAL_PASS_PARCIAL: P2–P5 y P7 PASS; P6, P8 (P-18) y P9 NOT_AUTOMATED; Estructurar no observado |
| 15:41 y 15:43 | Variante CP01 ×2 | — (sin caso) | Sucursal en formato viejo, corregido; después «Tipo Documental» no aparece tras re-pintar |
| 15:43 | CP01 oficial | — (sin caso) | **BUG-01 reproducido después del despliegue** en P9 |
| 15:59 | Estado de los casos propios | — | 651–655 en Estructurar; 656 en «Consultar SISE» |

## 4. Estado por CP: antes y después del despliegue

| CP | Antes (15/10) | Después (16/10) |
|---|---|---|
| CP01 | FAIL en P9, sin caso | FAIL en P9, sin caso: **igual**. Además, la variante del producto ya no funciona |
| CP02 | BLOCKED, caso 639: 10 PASS | Caso 654: **18 PASS**; extracción verificada; edición, obligatoriedad, guardado, adición y persistencia comprobados |
| CP03 / CP04 | BLOCKED en P3 | Sin cambios (P-22) |
| CP05 | REAL_PASS_PARCIAL, caso 630 | REAL_PASS_PARCIAL, caso 656, con P8 correctamente pendiente |

**Indicadores:** ejecutados 3/17 · aprobados **0/17** · escenarios 13/17. Ningún resultado previo al despliegue se cuenta como aprobación nueva.

## 5. Casos y cleanup

- **Casos nuevos:** 651–656, registrados en el histórico, que suma 29.
- **Cierre:** ninguno se cerró a mano. La evidencia de P-17 apunta a un cierre automático al vencer el temporizador.
- **Caso 653:** posiblemente inutilizable (pop-up abierto al terminar). Es propio y desechable.

## 6. Pruebas

- `npx tsc --noEmit`: sin errores.
- SDE `@unit`: **240/240** (suite completa, sin E2E en paralelo).
- **Nuevas regresiones:**
  - narrativas ficticias: ≤ 500 caracteres; los valores comparados aparecen en la narrativa; formatos de V1.1;
  - barrera UI-10: solo abren los formularios calibrados con evidencia.
- **Pruebas ajustadas a la semántica corregida:**
  - H7: pendientes de CP01 `[4, 12, 28]`;
  - manifest;
  - `.env.example`.

## 7. Pendientes y riesgos

| Pendiente | Estado |
|---|---|
| P-02 | Crítico para CP01 |
| P-17 | Cierre automático por confirmar |
| P-18 | Ruta de CP05 |
| P-21 | Comportamientos del pop-up |
| P-22 | Ramos RCE |
| UI-10 | Generales PN, Generales Modificación y Cumplimiento siguen sin calibrar |

**Riesgos:**
- Si un «Guardar» se rechaza y luego no se recupera, el caso puede quedar inutilizable (653).
- Cada corrida que edita la tabla usa un caso nuevo.
- La invocación del Worker no es observable.
