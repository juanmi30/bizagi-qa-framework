# Checkpoint "P-15: seguridad real de inspecciones en solo lectura" — 2026-10-15

- Commit inicial: `dd7b3ec` (`main`) · Commit final: HEAD de `fix/sde-solo-lectura-segura` (PR en borrador hacia `main`, sin fusionar)
- Para revisar: `git diff dd7b3ec..fix/sde-solo-lectura-segura --stat`
- Sin ejecuciones contra Bizagi, sin casos y sin cambios en `.env`.

## 1. Resumen técnico

- **Problema (Work):** `soloLectura` solo impedía «Crear» (en `pulsar` y en la red). «Guardar», «Siguiente», agregar o eliminar filas, subir documentos y diligenciar sobre un caso existente se ejecutaban. Lo mismo ocurría con los clics directos de Playwright.
- **Corrección (D-38):** política en tres capas en `sde/soloLectura.ts`:
  1. **Capacidades:** clasificadas por su efecto real, con denegación por defecto. Se aplican en un único envoltorio de `crearCapacidadesUi` y en el ejecutor (`deps.soloLectura`).
  2. **Guardia DOM:** neutraliza clics, Enter/Espacio y cargas sobre los componentes que persisten datos (`SdeObjects.componentesEscritura`).
  3. **Red:** aborta `CREATENEWCASE` y `ADDRELATIONWITHDATA` y registra solo el nombre de las demás acciones.
- **Atribución:** un rechazo deja el paso BLOCKED con la causa nueva `POLITICA_SOLO_LECTURA`. Nunca es un defecto del producto.
- **Conteo homogéneo (D-39):** el detalle del incidente ya no mezcla expectativas con verificaciones elementales.

## 2. Acciones mutantes identificadas

| Capacidad / ruta | Efecto | Solo lectura |
|---|---|---|
| `pulsar` (Crear, Guardar, Siguiente, Confirmar Radicación, Desistir…) | Crea, guarda, envía o avanza | Rechazada (toda la capacidad, sin depender del texto) |
| `adjuntar`, `adjuntar_en_grilla` | Sube archivos; agrega y guarda filas (`ADDRELATIONWITHDATA`) | Rechazadas; red y DOM además |
| `tabla_abrir_fila`, `tabla_agregar`, `dialogo_confirmar`, `dialogo_cancelar` | Pop-up de fila: Guardar escribe y cerrar sin guardar destruye el caso (BUG-03) | Rechazadas; cierre de diálogo en DOM |
| `tabla_eliminar_fila` | Elimina | Rechazada |
| `tabla_seleccionar_fila` | Selección que puede persistir (efecto no determinado) | Rechazada |
| `diligenciar`, `intentar_diligenciar` | Sin caso: solo el formulario de inicio. Con caso: Bizagi envía `SUBMITDATA` | Permitidas solo sin caso |
| `abrir_caso` | Abre la actividad; podría asignar el work item (efecto no determinado) | Permitida (necesaria para inspeccionar); documentada |
| Clics directos (`diagnostico-documentos.real`: Adicionar, Guardar fila, Subir; cualquier botón de actividad) | Escritura | Neutralizados por la guardia DOM; el diagnóstico de documentos ya no corre en solo lectura (requiere `SDE_DIAG_CREAR=1`) |
| `fill`/`selectOption` directos sobre un caso existente | Escritura posible (`SUBMITDATA`) | **No cubierto** por el DOM (límite documentado) |

## 3. Archivos

| Archivo | Cambio |
|---|---|
| `sde/soloLectura.ts` (nuevo) | Clasificación, `exigirSoloLectura`, `SoloLecturaError`, guardia DOM, guardia de red y registro |
| `baseObjects/sde.objects.ts` | `componentesEscritura` (único lugar de selectores) |
| `sde/capacidades.ts` | Envoltorio central; `protegerSoloLectura` sustituye a `protegerContraCreacion`; se quita la comprobación dispersa de `pulsar` |
| `sde/ejecutor.ts`, `sde/modelo.ts` | `deps.soloLectura`; causa `POLITICA_SOLO_LECTURA` → BLOCKED; conteo homogéneo |
| `tests/precreacion.real.spec.ts`, `tests/calibracion.real.spec.ts`, `tests/bloqueos.real.spec.ts` | Pasan `soloLectura` al ejecutor |
| `tests/diagnostico-documentos.real.spec.ts` | Se omite en solo lectura (escribe) |
| `tests/unit/solo-lectura.unit.spec.ts` (reescrito), `tests/unit/auditoria-pr2.unit.spec.ts` | Regresiones P-15 y conteo |
| `docs/orquestacion/SEGURIDAD-SOLO-LECTURA.md` (nuevo), `CONTEXTO-MAESTRO.md`, `DECISIONES.md`, `ESTADO-ACTUAL.md` | D-38, D-39; P-15 implementada; P-16 |

## 4. Pruebas

- `npx tsc --noEmit`: sin errores.
- `node tools/run.mjs seguros-del-estado --grep "@unit"`: **198/198**.
- `--list` de SDE: 235 pruebas en 30 archivos cargan.
- **Regresiones nuevas.** Las 10 exigidas por el encargo, más la clasificación completa:
  - lectura de etiquetas, textos, grillas y pestañas permitida;
  - Guardar y Crear rechazados antes del clic;
  - agregar, eliminar y subir rechazados;
  - «Siguiente», confirmar y cancelar pop-up, y diligenciar con un caso existente, rechazados;
  - acción desconocida bloqueada en el ejecutor sin invocarse, con BLOCKED y `POLITICA_SOLO_LECTURA`;
  - clics, Enter y carga directos neutralizados y registrados sin valores;
  - red: `CREATENEWCASE` y `ADDRELATIONWITHDATA` abortadas, `SUBMITDATA` registrada sin datos;
  - control en modo normal: las mismas acciones sí se ejecutan.
- **Detección del fallo anterior:** con `capacidades.ts` y `ejecutor.ts` de `main` restaurados temporalmente (después se devolvieron los corregidos con hash verificado), **5 de 10 fallan**: Guardar/Crear; agregar/eliminar/subir; navegación, pop-up y diligenciar con caso; acción desconocida; conteo «3 de 2».
  - Las 5 que pasan con el código anterior son la clasificación, la lectura, las dos que prueban directamente el módulo nuevo de navegador y red, y el control en modo normal.
- **Demo y Colsubsidio:** no aplican; no se tocó código compartido (`shared/`, `tools/`).

## 5. Estado de los 17 CP

Sin cambios: implementados 13/17 (completos 0) · ejecutados 2/17 · **aprobados 0/17**.

## 6. Riesgos residuales

Detalle en `SEGURIDAD-SOLO-LECTURA.md`.
- Las acciones de red no verificadas (`SUBMITDATA`, guardar o avanzar actividad) solo se registran.
- `fill`/`selectOption` directos sobre un caso existente no los cubre el DOM.
- Un componente de escritura no listado queda fuera de la capa DOM.
- `abrir_caso` puede asignar el work item.

## 7. Plan para ampliar las inspecciones reales de HU03 y HU06 (P-16)

1. **Calibrar la red en solo lectura**, con autorización y sin crear casos: releer un caso propio en Estructurar (o uno nuevo autorizado) y el formulario de inicio, guardando `registroSoloLectura.observadas`. Así se sabe qué acciones emite Bizagi al abrir y leer.
2. **Con QA:** decidir si `SUBMITDATA` y las acciones de guardar o avanzar se abortan en solo lectura (lista de permitidas por actividad) y confirmar si abrir una actividad asigna el work item.
3. **Ampliar las inspecciones:**
   - HU06: Estructurar completo, pestañas y presentación, sobre casos existentes;
   - HU03: Completar información, cuando SISE responda.
   Solo con capacidades del motor y `soloLectura: true`, revisando `bloqueosDom` si hay clics directos.
4. **Las ejecuciones con escritura** siguen exigiendo `SDE_E2E=1` (P-06) y autorización caso por caso.
