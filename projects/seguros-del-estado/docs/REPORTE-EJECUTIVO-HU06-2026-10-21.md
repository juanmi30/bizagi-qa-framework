# HU06 — reporte ejecutivo para la reunión del 2026-10-21

**Para:** Juan Miguel · **Preparado por:** Claude Code, 2026-10-20 (cierre de la sesión de ejecución). Se distingue lo histórico (19/10) de lo ejecutado hoy (20/10).

## Resultado: los cinco CP de HU06 tienen ejecución real; cuatro se ejecutaron completos

| CP | Caso (hoy) | Configuración | Ejecutados | PASS | FAIL (por confirmar con QA) | Otros | ¿Completo? |
|---|---|---|---|---|---|---|---|
| **CP01** Generales PN | **704** (nuevo) | Generales · Póliza Nueva · Masiva | **29/29** | **24**: P2, P3, P5–P18, P20–P23, P25–P27, P29 | P1 (ortografía «Polizas», OBS-04) · **P19 y P24** («Forma Consulta» muestra «Identificación del tomador»; matriz: «Identificación de Tomador») | P4 parcial y P28 NOT_AUTOMATED (revisión manual del contenido de las pestañas) | **Ejecutado completo** |
| **CP02** Autos | **705** (nuevo) | Autos · Ramo 48 · Modificación · Masiva | **22/22** | **22** | — | **Incidente separado P-21a** (tras restaurar una placa válida, «Guardar» no cerró) → REAL_PASS_PARCIAL | **Ejecutado completo; todos los pasos PASS** |
| **CP03** Cumplimiento sin RCE | **702** (de hoy) | Ramo 44 (`bEsRCE` = false) · Modificación · Masiva | **25/25** | **21**: P2–P13, P15–P21, P24, P25 | **P14 y P22** (Número Póliza / Número Póliza RCE aceptan escribir letras) · **P23** (**Ramo RCE no se almacena**) | P1 agregado | **Ejecutado completo** |
| **CP04** Cumplimiento con RCE | **703** (de hoy) | Ramo 40 (`bEsRCE` = true) · Modificación · Masiva | **23/23** | **18**: P2–P14, P18, P20–P23 | **P16–P17** (acepta letras) · **P19** (P-21a: tras rechazar 8 dígitos, una póliza válida no se confirma) | P15 NOT_AUTOMATED (la matriz no define el criterio) | **Ejecutado completo** |
| **CP05** Individual | 671 (histórico, 19/10) | Individual | P1–P9 | 5: P2–P5, P7 | — | P6 parcial (P-11) · P8 y P9 pendientes (P-18 y PR #9/#10) | No (sin caso nuevo en esta fase, por instrucción) |

**Ningún CP está aprobado por QA.**
- **Candidato a aprobación funcional:** **CP02** (caso 705, 22/22 PASS), condicionado a que QA acepte el incidente P-21a como hallazgo aparte.
- **Ejecutados completos con hallazgos por confirmar:** CP01, CP03 y CP04. No son candidatos hasta que QA decida sobre esos FAIL.

## Hallazgos funcionales para QA (reproducidos; por confirmar)

| # | Hallazgo | Reproducción | Impacto |
|---|---|---|---|
| 1 | **Ramo RCE no queda almacenado** | Caso 702, fila 1553: «Sí» + Ramo RCE «RCE DERIVADA DE CUMPLIMIENTO» + Número Póliza RCE → «Guardar» cierra; el servidor guarda la fila con Ramo RCE vacío. Reproducido 2 veces, la segunda eligiendo solo Ramo RCE | CP03 P23. Se pierde un dato obligatorio sin aviso |
| 2 | **P-21a en Cumplimiento** | Caso 703: tras rechazar 8 dígitos, una póliza válida no cierra con «Guardar». Antes visto en Autos (653, 669) y hoy también en CP02 (705) | CP04 P19 y el incidente de CP02. Si el usuario no puede guardar, el caso puede quedar bloqueado |
| 3 | Campos numéricos aceptan letras al escribir | Número Póliza (702, 703) y Número Póliza RCE (702). No se probó si «Guardar» rechaza las letras | CP03 P14/P22, CP04 P16–P17 |
| 4 | Nomenclatura de «Forma Consulta» | 704: «Identificación del tomador» frente a «Identificación de Tomador» | CP01 P19 y P24 |
| 5 | Observaciones de presentación | «Digito de Verificacion del Tomador» sin tildes; la lista «Ramo RCE» ofrece Ramos de todas las líneas, incluidas las de Autos; al elegir NIT se vacía el número de documento precargado | Para revisión de QA |

## Cómo se obtuvo (seguridad)

- **Casos nuevos: solo los 2 autorizados** (704 para CP01 y 705 para CP02). 702 y 703 eran de hoy. Controles respetados: `SDE_E2E=1`, cupo fijado para un caso por corrida (37 y 38) y worker único.
- **Pop-ups (UI-10):**
  - se calibraron sobre los casos propios con autorización explícita por caso;
  - nunca se usó Cancelar, Escape ni X;
  - los cuatro casos siguieron utilizables;
  - Cumplimiento y Póliza Nueva quedan en `en_calibracion` por el riesgo P-21a.
- **CP02 P18:** la placa inválida se verificó **por la clave de negocio de la fila** (`id` = `data-business-key`, única), leyendo en otra pestaña. Nunca por posición.
- **Continuaciones:** `tests/continuacion.real.spec.ts` retoma los pasos oficiales del escenario sobre el caso existente y nunca crea casos.
  - **Problema detectado:** los reportes de los tramos usaban el mismo nombre y se sobrescribieron.
  - **Arreglo:** el nombre ahora es único por corrida.
  - **Efecto en la evidencia:** los tramos perdidos se transcribieron de la consola en `docs/evidencia/2026-10-20_continuaciones-702-703-704.json`.

## Evidencia

- **Corridas completas:**
  - `docs/evidencia/HU06-CP01_20261020-142223.json` (704)
  - `HU06-CP02_20261020-142817.json` (705)
  - `HU06-CP03_20261020-123853.json` (702)
  - `HU06-CP04_20261020-124051.json` (703)
- **Continuaciones:**
  - `CONTINUACION_HU06-CP0{1,3,4}_cont-70*.json` (últimos tramos)
  - `2026-10-20_continuaciones-702-703-704.json` (todos los tramos)
- **Calibración:** `data/popups-calibrados.yaml` (mapeo real de controles de Cumplimiento) y `2026-10-20_identidad-fila-y-casos-702-703.json`.

## Estado de los PR

- **PR #9** (`feb678e`):
  - incluye la decisión de hoy: un worker marcado solo en el dibujo y ausente del registro es **inconcluso**; FAIL solo si el registro de la instancia lo demuestra;
  - SDE `@unit` 343/343 en su HEAD;
  - borrador, sin fusionar.
- **PR #10:** integra el PR #9 (merge `6ac5351`) más todo lo de hoy. Borrador, sin fusionar. Unitarias: ver el checkpoint.
- **Orden de integración:** primero el PR #9 y luego el PR #10. Sin el #10, la Consulta Gráfica real queda inconclusa por el formato de `TransitionLog`.

## Próxima acción por CP

| CP | Próxima acción |
|---|---|
| CP01 | QA decide sobre la nomenclatura de «Forma Consulta» (P19 y P24) y define cómo se revisa P28 (manual) |
| CP02 | QA valida los 22 pasos y decide sobre P-21a → candidato a aprobación |
| CP03 | QA confirma el hallazgo de Ramo RCE (P23) y si los campos numéricos deben bloquear letras al escribir (P14 y P22) |
| CP04 | QA confirma P-21a (P19), las letras (P16–P17) y el criterio de P15 |
| CP05 | Integrar los PR #9 y #10; QA confirma P-18 (camino regular). Después se puede re-evaluar sobre 656/671 sin crear casos |
