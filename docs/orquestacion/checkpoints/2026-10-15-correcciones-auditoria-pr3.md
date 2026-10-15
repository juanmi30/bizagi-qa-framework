# Checkpoint "Correcciones de la auditoría de Work sobre el PR #3 (F1–F4) y modalidades de ejecución" — 2026-10-15

- Commit inicial: `32dd48a` (HEAD auditado) · Commit final: HEAD de `fix/sde-solo-lectura-segura` (PR #3, borrador, sin fusionar)
- Para revisar: `git diff 32dd48a..fix/sde-solo-lectura-segura --stat`
- Veredicto de Work: **REQUIERE CORRECCIONES** (F1–F4). Sin ejecuciones contra Bizagi, sin casos y sin cambios en `.env`.

## 1. Resumen técnico

**Regla operativa de Juan Miguel:** en QA autorizado se crean y modifican los casos que las pruebas necesiten. La protección evita escrituras **accidentales** en las ejecuciones declaradas de solo lectura, y el framework responde por los casos que crea.

### Dos modalidades (D-40), reutilizando la bandera existente

| Modalidad | Cómo se activa | Qué la gobierna |
|---|---|---|
| Solo lectura | `soloLectura: true` | La política P-15 |
| Ejecución funcional controlada | Por defecto | P-06, H6, UI-10 y datos autorizados; escribe lo que el escenario exige |

### Hallazgos de Work

| Hallazgo | Problema | Corrección |
|---|---|---|
| F1 (ALTA) | La red solo abortaba `CREATENEWCASE` y `ADDRELATIONWITHDATA`; el autoguardado `SUBMITDATA` de `fill`/`selectOption` y las acciones desconocidas llegaban al servicio | En solo lectura, la red aborta **toda** acción del endpoint de acciones de Bizagi fuera del formulario de inicio identificado (también las sin nombre) |
| F2 (ALTA) | `numeroCaso: null` se tomaba como precreación | Evidencia **positiva**: `nuevo_caso` confirma el diálogo de inicio (`marcarFormularioInicio`) y el estado se comparte con la red. Se retira al iniciar sesión, pulsar, verificar la ruta, abrir un caso o si el diálogo desaparece |
| F3 (ALTA) | Specs reales declaradas de solo lectura sin la protección activada (BUG-01, ENV-03, BUG-02, `candidatos`) | Cada spec real declara su modalidad: `[solo lectura]` con la protección activada, o `[funcional controlada: …]`. Dos regresiones estáticas lo verifican en todas las specs reales |
| F4 (MEDIA) | `abrir_caso` se trataba como lectura | Clase «efecto no determinado»: denegada en solo lectura y permitida en funcional controlada. La calibración de un caso existente y los diagnósticos que abren actividades pasan a funcional controlada |

### Casos creados (D-41)

- **Registro y seguimiento:** implementados (`HistorialCasos`).
- **Cierre físico SDE:** no implementado ni validado. Propuesta operativa en P-17.

## 2. Archivos

| Archivo | Cambio |
|---|---|
| `sde/soloLectura.ts` | Modalidades, clase `no_determinado`, evidencia positiva (`ContextoLectura.formularioInicio`), red que aborta todo fuera del formulario de inicio, registro por contexto (`registroDe`) |
| `sde/capacidades.ts` | `marcarFormularioInicio` / `salirDeFormularioInicio`; `nuevo_caso` aporta la evidencia y otras capacidades la retiran; el envoltorio vuelve a comprobar que el diálogo sigue visible |
| `sde/ejecutor.ts` | `ContextoEjecucion.formularioInicio` |
| `tests/bloqueos.real.spec.ts` | Modalidad declarada por prueba; `soloLectura: true` en ENV-03 ×2 y BUG-02; BUG-01, BUG-03, TRAZA y UI-10 como funcional controlada |
| `tests/candidatos.real.spec.ts` | `protegerSoloLectura` sobre su contexto propio |
| `tests/calibracion.real.spec.ts`, `tests/diagnostico-documentos.real.spec.ts` | Funcional controlada declarada |
| `tests/unit/solo-lectura.unit.spec.ts` | Reescrito: 15 regresiones |
| `SEGURIDAD-SOLO-LECTURA.md`, `DECISIONES.md` (D-40, D-41, P-16 actualizada, P-17), `ESTADO-ACTUAL.md`, `CONTEXTO-MAESTRO.md` | Documentación |

## 3. Pruebas

- `npx tsc --noEmit`: sin errores.
- `node tools/run.mjs seguros-del-estado --grep "@unit"`: **204/204**. Incluye las regresiones de P-06, UI-10 (barrera de pop-ups), clasificación de resultados, R1 y R2.
- `--list`: 241 pruebas en 30 archivos cargan.
- **Regresiones nuevas** (`solo-lectura.unit.spec.ts`, 15):
  - clasificación completa;
  - autoguardado de `fill` y `selectOption` abortado en solo lectura y permitido en funcional;
  - acción desconocida o sin nombre bloqueada (solo se registra el nombre);
  - formulario existente con `numeroCaso: null`: rechazado en capacidades y red;
  - precreación identificada: `diligenciar` y `SUBMITDATA` permitidos, Crear y alta de filas bloqueados, y nueva denegación al salir del diálogo;
  - `abrir_caso` restringido y disponible según la modalidad;
  - escrituras rechazadas antes de ejecutarse;
  - verificaciones observacionales funcionando;
  - ejecutor: BLOCKED por `POLITICA_SOLO_LECTURA`, sin invocar nada;
  - guardia DOM;
  - control funcional: escribe;
  - F3 ×3: modalidad declarada, protección en `iniciar_sesion`.
- **Detección de los fallos anteriores:**
  - **F1, F2 y F4:** una spec temporal no versionada, con funciones presentes en ambas versiones, falla **4 de 4** con `soloLectura.ts`, `capacidades.ts` y `ejecutor.ts` de `32dd48a` y pasa 4 de 4 con la corrección. Después se restauraron los archivos (hash verificado) y se eliminó la spec temporal.
  - **F3:** las dos regresiones estáticas fallan con las specs reales de `32dd48a`: `candidatos` no activaba la protección y 7 pruebas de `bloqueos` no declaraban su modalidad.
- **Demo y Colsubsidio:** no aplican; no se tocó código compartido.

## 4. Estado de los 17 CP

Sin cambios: implementados 13/17 (completos 0) · ejecutados 2/17 · **aprobados 0/17**.

## 5. Casos creados (D-41, P-17)

- **Registro:** `registrarCasoCreado` registra en cuanto Bizagi responde `CREATENEWCASE` (CP, actor, corrida y política de cleanup). Hay 18 casos SDE «Pendiente de depurar» en el histórico local.
- **Reutilizable:** `HistorialCasos`, `RecuperacionCasos`, `npm run cleanup`/`depurar` y el patrón de cancelación administrativa de Colsubsidio.
- **Falta en SDE:** un procedimiento de cierre permitido y validado por QA (permiso de administrar casos o cierre funcional). No se inventa ni se ejecuta a ciegas, y no se tocan 434, 571 ni otros casos preexistentes.

## 6. Riesgos residuales

- Las rutas REST distintas del endpoint de acciones no se interceptan (consultas legítimas).
- Dentro del formulario de inicio identificado se permiten las acciones no verificadas (no hay caso).
- Componentes de escritura no listados quedan fuera de la capa DOM (la red sigue aplicando).
- El efecto de abrir una actividad sigue sin calibrar (P-16).
- Acumulación de casos SDE sin cierre hasta que exista P-17.
