# Modalidades de ejecución en QA: solo lectura y ejecución funcional controlada (P-15)

**Regla operativa (Juan Miguel, 2026-10-15):** trabajamos en un ambiente QA autorizado y podemos crear, modificar y ejecutar los casos que las pruebas necesiten. El objetivo no es prohibir la escritura. Es evitar escrituras **accidentales** cuando una ejecución se declara de solo lectura, y responsabilizarse de los casos que creamos (registro y cierre controlado).

## Dos modalidades

| | Inspección de solo lectura | Ejecución funcional controlada (por defecto) |
|---|---|---|
| Cómo se declara | `soloLectura: true` en el `UiEntorno` (y `deps.soloLectura` en el ejecutor). En las specs reales, el título lo dice: «[solo lectura]» | Sin `soloLectura`. En diagnósticos, el título lo dice: «[funcional controlada: …]» |
| Promesa | No modifica nada persistente | Hace lo que el escenario exige: crea, diligencia, guarda, adjunta, agrega o elimina registros y avanza actividades |
| Controles | La política P-15 de este documento | P-06 (`SDE_E2E=1` para las verticales), bloqueo de ejecución real (H6), barrera de pop-ups (UI-10/BUG-03), datos autorizados del `.env`, registro de casos creados |
| Rechazo | El paso queda **BLOCKED** con causa `POLITICA_SOLO_LECTURA`: es una restricción de automatización, nunca un defecto de Bizagi | — |
| Se detiene para revisión | Cualquier acción ambigua (se deniega) | Operaciones excepcionales o destructivas, sobre casos ajenos o sin una estrategia segura de cierre (p. ej. Cancelar un pop-up, BUG-03) |

Una prueba que necesita guardar, adjuntar o abrir actividades **no** se fuerza a funcionar en solo lectura: se declara funcional controlada. Una regresión (`solo-lectura.unit.spec.ts`, F3) comprueba en todas las specs reales que la modalidad declarada coincide con la protección instalada y que ninguna prueba de solo lectura ejecuta escritura ni abre actividades.

## Solo lectura: tres capas (`projects/seguros-del-estado/sde/soloLectura.ts`)

| Capa | Qué hace |
|---|---|
| 1. Capacidades | Antes de ejecutar, `exigirSoloLectura` aplica la clasificación de abajo, con un envoltorio central en `crearCapacidadesUi` y en el ejecutor. Lo no clasificado se deniega |
| 2. Red | En el endpoint de acciones de Bizagi (`/Rest/Handlers/MultiAction`), **fuera del formulario de inicio identificado se aborta toda acción**: `SUBMITDATA` (autoguardado al teclear o elegir, aunque se use `fill` o `selectOption` directo), `EXECUTERULE` y cualquier acción desconocida o sin nombre. Dentro del formulario de inicio solo se abortan `CREATENEWCASE` y `ADDRELATIONWITHDATA`. Se registra el nombre de cada acción, nunca los datos |
| 3. Navegador | La guardia DOM neutraliza clics, Enter/Espacio y cargas de archivo sobre componentes que persisten datos (`SdeObjects.componentesEscritura`: botones de la actividad, acciones de grilla, botones y cierre de diálogos, cargas), también con Playwright directo. Registra solo rótulos |

### Evidencia positiva del formulario de inicio (F2)

Escribir en un formulario solo se permite si `nuevo_caso` **abrió el formulario de inicio en esta ejecución y su diálogo sigue visible**.

**Cómo funciona el permiso:**
- `marcarFormularioInicio` concede un permiso **ligado al elemento exacto** del diálogo, con un token propio.
- La guardia de red lo **revalida en cada solicitud**, en la página que la emite. Lo mismo hace la capa de capacidades antes de diligenciar.
- Basta con que el elemento ya no esté, esté oculto o haya sido reemplazado (navegación, cambio de contenido de la SPA o un diálogo nuevo idéntico) para que el permiso se **revoque de forma definitiva**, también ante ediciones con Playwright directo.
- Volver a un formulario exige una **nueva** identificación, con un token nuevo.
- `iniciar_sesion`, `pulsar`, `verificar_ruta` y `abrir_caso` lo revocan explícitamente.

La ausencia de número de caso **no** es evidencia de precreación: un formulario existente con `numeroCaso: null` queda denegado tanto en las capacidades como en la red.

### Instalación de la protección

`protegerSoloLectura` registra primero, y una sola vez, el interceptor de red. Mientras la protección no esté `completa`, ese interceptor aborta toda acción.

- **Si falla una parte** (interceptor, script de inicio o guardia en las páginas abiertas), queda `fallida` y se lanza `ProteccionNoInstaladaError`. Es una falla de automatización que detiene la inspección.
- **Ninguna capacidad corre** sobre un contexto cuya protección no esté completa.
- **Un reintento** completa lo que faltó sin duplicar el interceptor. Una protección ya completa se devuelve tal cual.

### Clasificación de las capacidades (por efecto, no por el texto del botón)

| Clase | Capacidades | En solo lectura | En funcional controlada |
|---|---|---|---|
| Observación | `iniciar_sesion`, `nuevo_caso` (abre el formulario; aporta la evidencia), `verificar`, `verificar_ruta`, `tabla_verificar`, `abrir_pestana`, `integracion`, `no_automatizado` | Permitidas | Permitidas |
| Formulario de inicio | `diligenciar`, `intentar_diligenciar` | Solo con evidencia positiva de precreación | Permitidas |
| Efecto no determinado | `abrir_caso` (Bizagi podría asignar o bloquear el work item; sin verificar contra QA) | Denegada | Permitida en casos QA autorizados |
| Escritura | `pulsar` (todo botón), `adjuntar`, `adjuntar_en_grilla`, `tabla_abrir_fila`, `tabla_agregar`, `dialogo_confirmar`, `dialogo_cancelar`, `tabla_eliminar_fila`, `tabla_seleccionar_fila` | Denegadas antes de ejecutarse | Permitidas, con la barrera de pop-ups UI-10/BUG-03 |
| No clasificada | Cualquier otra | Denegada | — |

### Modalidad declarada de las specs reales (F3)

| Spec | Modalidad |
|---|---|
| `precreacion.real` | Solo lectura (formulario de inicio con evidencia positiva) |
| `habilitacion.real` | Solo lectura |
| `candidatos.real` | Solo lectura (`protegerSoloLectura` sobre su propio contexto) |
| `bloqueos.real` · ENV-03 ×2, BUG-02, BANDEJA, HISTÓRICO | Solo lectura |
| `bloqueos.real` · BUG-01 | Funcional controlada: agrega una fila en el formulario de inicio y nunca pulsa «Crear» |
| `bloqueos.real` · BUG-03, TRAZA, UI-10 | Funcional controlada: abren actividades y nunca guardan |
| `cleanup-diagnostico.real` (P-17) | Solo lectura: menús de administración, búsqueda por número y buscador global; nunca pulsa «Cancelar casos» ni «Terminar» (además en la guardia DOM). Solo con `SDE_DIAG_CLEANUP=1` |
| `calibracion.real` | Funcional controlada: abre la actividad de un caso propio; en modo «nuevo» crea un caso |
| `diagnostico-documentos.real` | Funcional controlada: escribe; solo corre con `SDE_DIAG_CREAR=1` |
| Verticales (`sde/verticales.ts`) | Funcional controlada, con P-06 |

### Límites conocidos

1. **Llamadas que no van al endpoint de acciones** (`/Rest/Handlers/Render` y otras rutas REST de lectura) no se interceptan: son consultas legítimas. Si Bizagi escribiera por otra ruta, quedaría fuera de la capa 2.
2. **En el formulario de inicio identificado** se permiten las acciones distintas de `CREATENEWCASE` y `ADDRELATIONWITHDATA`. Ahí no existe caso, así que nada persiste mientras «Crear» siga bloqueado.
3. **Componentes de escritura no listados** en `SdeObjects.componentesEscritura` quedan fuera de la capa DOM. La capa 2 sigue aplicando.
4. **Código que no usa `crearCapacidadesUi` ni `protegerSoloLectura`** no tiene protección. La regresión F3 lo detecta en las specs reales que se declaran de solo lectura.

## Ejecución funcional controlada: registro y cierre de los casos creados

### Política esperada (igual que en Afiliaciones/Colsubsidio)

Toda ejecución que cree un caso debe:
1. registrar el número;
2. asociarlo al CP y a la corrida;
3. verificar y conservar la evidencia;
4. intentar el cierre o la limpieza con un mecanismo **validado**, también si el recorrido falla;
5. comprobar que el cierre tuvo éxito;
6. reportar los casos pendientes.

### Mecanismos existentes evaluados

| Mecanismo | Dónde | Reutilizable en SDE |
|---|---|---|
| `HistorialCasos` (registro persistente, estados «Pendiente de depurar» y «Depurado», exclusión entre procesos) | `shared/utils/HistorialCasos.ts` | **Sí, ya en uso**: `registrarCasoCreado` registra el número en cuanto Bizagi responde `CREATENEWCASE`, antes de cualquier verificación, con CP, actor, identificador de corrida y política de cleanup |
| `RecuperacionCasos` (opera solo números pendientes del histórico; un fallo no detiene los demás; Depurado solo tras confirmar) | `shared/utils/RecuperacionCasos.ts` | Sí, genérico |
| `npm run cleanup -- <proyecto>` + `tests/cleanup-pendientes.spec.ts` del proyecto | `tools/cleanup.mjs` | Sí (convención). SDE aún no tiene ese spec, así que la herramienta responde que no soporta cleanup físico |
| `npm run depurar` (resumen y marcado manual) | `tools/depurar.mjs` | Sí |
| Cancelación administrativa: Work Portal › Administrar Casos, un caso exacto, confirmación de Bizagi «La operación N ha sido cancelada» y luego Depurado | `projects/colsubsidio/helpers/bizagiQaSupport.ts` | Patrón reutilizable **si** QA SDE habilita un usuario con permiso de administrar casos y valida el procedimiento |

### Cierre ≠ cancelación ≠ limpieza ≠ abandono

| Término | Qué es | En SDE |
|---|---|---|
| Cierre funcional | Terminar el caso por el propio proceso (p. ej. «Desistir Solicitud» en Completar información, HU03-CP09) | Solo donde el proceso lo ofrece; HU03 Completar aún no es accesible (SISE) |
| Cancelación administrativa | Anular el caso desde la administración de Bizagi | Patrón de Colsubsidio; requiere permiso y validación de QA SDE |
| Limpieza de datos | Borrar registros | No disponible ni previsto |
| Abandono | Dejar el caso abierto (p. ej. en Estructurar información) | Es lo que hoy ocurre (`CLEANUP_NOT_APPLICABLE`); queda registrado como pendiente |

### Estado real

- **Registro y seguimiento:** **implementados**. El histórico local tiene 18 casos SDE históricos «Pendiente de depurar» (incluidos 434 y 571) más los creados en la fase del 15/10.
- **Cierre o limpieza física en SDE:** **NO implementado ni validado**.
- **Casos preexistentes:** no se cierra ni se cancela ninguno (434, 571 u otro) sin confirmar su propiedad y el procedimiento permitido (P-07).

### Diagnóstico en QA (2026-10-15, `tests/cleanup-diagnostico.real.spec.ts`, solo lectura)

El diagnóstico solo navega menús y consulta. No crea, no abre, no modifica ni cancela casos. Los botones de administración que escriben están en la guardia DOM.

| Pregunta | Resultado observado |
|---|---|
| ¿El intermediario tiene administración de casos? | **No**: sin menú Admin |
| ¿El analista tiene administración de casos? | Ve Admin → «Administración de procesos» → «Casos», con búsqueda por número, y los botones «Cancelar casos» (`#btn-admin-cases-invalidate`; en Colsubsidio el id es otro), «Terminar» (`#btn-admin-case-finish`) y «Copiar/Revocar permisos» |
| ¿Puede encontrar los casos propios? | **No**: `Rest/Queries/SearchCases` responde 200 con `records=0` para los casos 336 y 429 |
| Estado actual de los casos propios (buscador global, sin abrir) | Los **18 históricos** aparecen en una fila **sin actividad actual ni vencimiento pendiente**. Solo los casos nuevos tienen actividades (temporizador «Máximo tiempo de radicación» y el subproceso de consulta) |

**Lectura (hipótesis, NO decisión):** los casos históricos parecen **cerrados por el propio proceso**, posiblemente al vencer el temporizador «Máximo tiempo de radicación». Eso explicaría además que la búsqueda administrativa no los encuentre. Debe confirmarlo QA (P-17).

**Consecuencias:**
- No se valida ni se implementa una cancelación administrativa: ningún actor configurado puede encontrar los casos.
- No se creó un caso desechable solo para probar el cierre.
- Se implementó la **barrera contra la acumulación** (punto 5 de la propuesta): cada vertical informa los casos propios pendientes. Con `SDE_MAX_CASOS_PENDIENTES=<n>`, la vertical queda BLOCKED por CONFIGURACION antes de crear otro caso si ya hay n o más pendientes. El umbral lo acuerda QA; sin la variable, solo se informa.

### Propuesta operativa (requiere a QA, P-17)

1. QA confirma el procedimiento permitido en SDE: cancelación administrativa (usuario y permiso) o cierre funcional por actividad.
2. Validar ese procedimiento sobre **un** caso desechable creado para ello, con autorización, y documentar la evidencia.
3. Implementar `projects/seguros-del-estado/tests/cleanup-pendientes.spec.ts` reutilizando `RecuperacionCasos` y el patrón de cancelación de Colsubsidio, adaptado a SDE. Así habilitar `npm run cleanup -- seguros-del-estado`.
4. En las verticales y calibraciones que crean casos: cierre en `finally` con el mecanismo validado, comprobación del resultado y estado del cierre en el reporte del CP. Lo no cerrado queda «Pendiente» y se informa.
5. **Contra la acumulación:** antes de crear un caso nuevo, informar los pendientes propios y, si superan un umbral acordado con QA, bloquear la creación hasta el cleanup.
