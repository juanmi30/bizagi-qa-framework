# Seguridad del modo solo lectura (P-15)

Se activa al crear el UI con `soloLectura: true` (`crearCapacidadesUi`) y, en el ejecutor, con `deps.soloLectura`. Lo usan la precreación, la relectura de un caso existente en la calibración y los diagnósticos de solo lectura.

Es **complementario a P-06** (`SDE_E2E=1`), no lo sustituye:

| Control | Qué decide |
|---|---|
| P-06 | **Si** una vertical real puede ejecutarse |
| P-15 | **Qué** puede hacer una ejecución marcada como solo lectura |

Código: `projects/seguros-del-estado/sde/soloLectura.ts`.

## Tres capas

| Capa | Qué hace | Dónde |
|---|---|---|
| 1. Capacidades | Antes de ejecutar, `exigirSoloLectura` clasifica la capacidad por su **efecto real** y rechaza la escritura con `SoloLecturaError`. Lo no clasificado se trata como escritura | Envoltura central en `crearCapacidadesUi` (también para llamadas directas de un spec) y en el ejecutor (también para capacidades inyectadas o sustituidas) |
| 2. Navegador | Una guardia DOM (script de inicio del contexto) neutraliza, en fase de captura, los clics, Enter/Espacio y cargas de archivo sobre componentes que persisten datos en Bizagi (`SdeObjects.componentesEscritura`): zona de botones, acciones de grilla, botones y cierre de diálogos, controles de carga. Cubre el código que usa Playwright directamente. Registra `tipo:rótulo` en `window.__sdeSoloLectura.bloqueados`, nunca valores | `protegerSoloLectura(contexto)`, instalada al iniciar sesión |
| 3. Red | Aborta las acciones de Bizagi **verificadas** como escritura (`CREATENEWCASE`, `ADDRELATIONWITHDATA`) y registra el **nombre** de las demás (`SUBMITDATA`, `EXECUTERULE`, …), sin datos | Ruta `**/Rest/Handlers/MultiAction*` del contexto |

**Atribución:** una acción rechazada deja el paso en **BLOCKED** con causa `POLITICA_SOLO_LECTURA`. No es un defecto del producto ni una falla de automatización, y el CP nunca queda en verde por ello.

## Clasificación de las capacidades (por efecto, no por el texto del botón)

| Clase | Capacidades | Regla en solo lectura |
|---|---|---|
| Observación | `iniciar_sesion`, `verificar`, `verificar_ruta`, `abrir_caso`, `tabla_verificar`, `abrir_pestana`, `integracion`, `no_automatizado` | Permitidas |
| Formulario de inicio | `nuevo_caso`, `diligenciar`, `intentar_diligenciar` | Permitidas **solo si no existe caso** (precreación). Con un caso existente, Bizagi enviaría los valores (`SUBMITDATA`) → rechazadas |
| Escritura | `pulsar` (todo botón), `adjuntar`, `adjuntar_en_grilla`, `tabla_abrir_fila`, `tabla_agregar`, `dialogo_confirmar`, `dialogo_cancelar`, `tabla_eliminar_fila`, `tabla_seleccionar_fila` | Rechazadas antes de ejecutarse |
| No clasificada | Cualquier otra | Rechazada |

**Efecto no determinado** (documentado, sin calibrar todavía):
- `abrir_caso`: abrir una actividad podría hacer que Bizagi asigne el work item al usuario.
- `tabla_seleccionar_fila`: la selección podría persistir; por eso se trata como escritura.

## Rutas que quedan protegidas

- **Capacidades del motor:** todas, al ejecutarse desde el ejecutor o al llamarse directamente desde un spec.
- **Clics y cargas con Playwright directo** sobre los componentes de escritura listados (por ejemplo, «Adicionar» y «Guardar fila» de una grilla, «Subir», «Guardar», «Siguiente», «Crear», cierre de pop-up).
- **Creación de casos y alta de filas de grilla** a nivel de red.

## Límites: NO es una garantía universal

1. **Acciones de red no verificadas:** `SUBMITDATA`, `EXECUTERULE` y otras solo se registran. El nombre exacto de las acciones de guardar o avanzar una actividad en Bizagi no se ha observado; bloquearlas a ciegas podría romper la lectura.
2. **Teclear o elegir valores con Playwright directo** (`fill`, `selectOption`, `check`) sobre un caso existente **no** lo impide la guardia DOM. La precreación necesita teclear en el formulario de inicio. La capa 1 sí lo impide para las capacidades.
3. **Componentes no listados:** un control que persista datos y no esté en `SdeObjects.componentesEscritura` (por ejemplo, un enlace de acción propio de un formulario) queda fuera de la capa 2.
4. **Código que no usa `crearCapacidadesUi` ni un contexto protegido** no tiene ninguna capa.
5. **`abrir_caso`** puede asignar el work item (efecto no determinado).

## Antes de ampliar las inspecciones reales sobre casos existentes

1. Ejecutar una inspección real de solo lectura y revisar `registroSoloLectura[].observadas`, para conocer qué acciones de red emite Bizagi al abrir y leer una actividad.
2. Con esa evidencia, decidir con QA si `SUBMITDATA` y las acciones de guardar o avanzar deben abortarse también en solo lectura (lista de permitidas por actividad).
3. Confirmar con QA si abrir una actividad asigna el work item.
4. Toda inspección nueva usa solo capacidades del motor, o comprueba `bloqueosDom(page)` si hace clics directos.
