# Contexto maestro — Framework de automatización QA para Bizagi Cloud

> Documento central y **único** de contexto. Claude Code, ChatGPT Work y el orquestador leen este archivo, `ESTADO-ACTUAL.md` y `DECISIONES.md`, y no mantienen versiones paralelas. Si algo aquí contradice el código, manda el código: se corrige este documento.

## 1. Objetivo y filosofía

Automatizar pruebas funcionales de procesos **Bizagi Cloud** desde el navegador, como un usuario (Playwright + TypeScript). No se necesita el código fuente de Bizagi.

Principios:
1. **Núcleo genérico, proyectos aislados.** Lo común vive en `shared/`; lo propio de cada cliente, en `projects/<cliente>/`.
2. **Declarativo antes que artesanal.** Los casos de prueba (CP) se describen en YAML y se ejecutan con capacidades reutilizables. No se escribe un archivo de código por CP.
3. **Nada de falsos verdes.** Un resultado solo es verde con sesión real, caso real y evidencia. Lo que no se puede observar se declara: no se simula.
4. **Selectores estrictos.** Texto exacto y elemento único. Nada de `.first()` a ciegas, `force: true`, esperas fijas ni errores silenciados.
5. **Seguridad por diseño.** Credenciales solo en `.env` local; trazas apagadas en pruebas con login; nada sensible en Git ni en paquetes compartidos.

## 2. Arquitectura real

| Componente | Ruta | Qué hace |
|---|---|---|
| Configuración Playwright | `playwright.config.ts` | Elige el proyecto con `PROJECT` (lo fija `tools/run.mjs`); carga `projects/<p>/.env`. Acepta ajustes por proyecto en `projects/<p>/playwright.project.json` (p. ej. `workers`) |
| Ejecutor | `tools/run.mjs` | `node tools/run.mjs <proyecto> [args de Playwright]`. Invoca el CLI de Playwright con el mismo Node y sin shell: los argumentos llegan literales (D-29) |
| Núcleo | `shared/core`, `shared/runner`, `shared/utils`, `shared/baseObjects` | Login por dominio/lista, motor de escenarios genérico, cliente API de Bizagi, historial de casos, ZIP/XLSX sin dependencias |
| Herramientas | `tools/*.mjs` | Crear proyectos y page objects, grabar, adoptar grabaciones, depurar, limpiar, resumir; herramientas AFI de Colsubsidio |
| Proyectos | `projects/_template`, `demo`, `colsubsidio`, `conpre`, `seguros-del-estado` | Cada uno con su `.env`, objetos, escenarios y pruebas |

### Seguros del Estado (SDE-CEL): el motor más reciente

`projects/seguros-del-estado/`:

| Pieza | Ruta | Rol |
|---|---|---|
| Matriz literal de los 17 CP | `fuentes/*.xlsx` + `fuentes/matriz.json` | Fuente de verdad; una prueba verifica que el JSON coincide con el Excel |
| Manifest | `manifest/casos.yaml` | Familia, fase, actores, datos, escenario, estado y brechas por CP |
| Datos lógicos | `data/datasets.yaml` | Qué dato necesita cada CP y de dónde sale. Valores solo en `.env` |
| Escenarios | `escenarios/*.yaml`, `escenarios/_bloques/`, `escenarios/_variantes/` | Pasos declarativos con su mapeo a los pasos del Excel; bloques reutilizables (`incluir` + `con`); variantes diagnósticas que nunca cuentan para el CP |
| Ejecutor | `sde/ejecutor.ts` | Preflight, orden, bloqueos, causa por paso, clasificación del CP, sanitización |
| Capacidades UI | `sde/capacidades.ts`, `sde/ui.ts` | Login, nuevo caso, diligenciar, adjuntar, pulsar, ruta, tablas, pestañas, pruebas negativas, protección de solo lectura, barrera de pop-ups |
| Selectores | `baseObjects/sde.objects.ts` | Único lugar de selectores, cada uno marcado [VERIFICADO] o [PENDIENTE] |
| Pop-ups permitidos | `data/popups-calibrados.yaml` + `sde/popups.ts` | Barrera BUG-03: sin calibración y cierre seguro verificados, no se abre ningún pop-up |
| Expectativas de presentación | `data/expectativas-presentacion.yaml` + `sde/presentacion.ts` (lógica genérica en `shared/utils/ValidacionesPresentacion.ts`) | Ortografía (reglas RAE/DLE), etiquetas aprobadas, orden y obligatoriedad, cada una con su fuente; lo no definido queda `pendiente_definicion` y nunca es verde |
| Solo lectura (P-15) | `sde/soloLectura.ts` + `docs/orquestacion/SEGURIDAD-SOLO-LECTURA.md` | Capacidades clasificadas por efecto (escritura rechazada antes de ejecutarse; lo no clasificado se deniega), guardia DOM y guardia de red. Complementa a P-06. No es una garantía universal: ver límites |
| Métricas y trazabilidad | `sde/metricas.ts`, `sde/trazabilidad.ts` → `docs/TRAZABILIDAD-17-CP.md` | Tres indicadores independientes: implementado, ejecutado, aprobado |
| Exportación sanitizada | `sde/exportar.ts`, `tests/exportar.tool.spec.ts` | Paquete para compartir con escaneo de secretos |

## 3. Roles

| Rol | Quién | Responsabilidad | No hace |
|---|---|---|---|
| Dirección funcional | **Juan Miguel** (líder QA, propietario del repositorio) | Prioridades de negocio, autorizaciones (publicar, acciones destructivas, datos), decisiones funcionales finales | — |
| Orquestador | **ChatGPT** (conversación principal) | Decide prioridades y estrategia; evalúa informes de Work con Juan Miguel; redacta el siguiente encargo | No edita el repositorio |
| Auditor | **ChatGPT Work — GPT-6.1 Sol** | Revisa checkpoints sin modificar archivos, contrasta afirmaciones con código y pruebas, clasifica hallazgos, recomienda | No sobrescribe implementaciones sin decisión del orquestador |
| Implementador | **Claude Code** | Código, pruebas, depuración, ejecución, documentación y checkpoints | No publica, no actúa de forma destructiva ni decide temas funcionales sin autorización |

Procedimiento de transferencia: `PROTOCOLO-AGENTES.md`.

## 4. Reutilización y aislamiento

- Un proyecto no usa credenciales, datos, selectores ni conocimiento de otro.
- Cambios en `shared/`, `tools/` o `playwright.config.ts`: solo si son genéricos, pequeños, compatibles y con regresión de Demo y Colsubsidio. La línea base de Demo es 48 aprobadas y 4 fallos históricos de plantilla.
- Antes de crear una capacidad nueva se busca una existente. No se duplican capacidades con otro nombre.

## 5. Seguridad y datos

| Regla | Mecanismo |
|---|---|
| Credenciales y datos de QA solo en `projects/<p>/.env` (fuera de Git) | `.gitignore`; las plantillas `.env.example` no llevan valores |
| Sin trazas en pruebas que inician sesión (Playwright registraría la clave tecleada) | `test.use({ trace: 'off' })`, exigido por una prueba unitaria |
| Reportes sanitizados | `sanitizar()` enmascara credenciales y datos marcados `sensible` |
| `test-results/` nunca se comparte (capturas con nombres reales, reportes HTML) | Fuera de Git y de la exportación |
| Documentos de cliente, Excel de intermediarios, capturas y temporales | Excluidos de Git (ver `.gitignore`) |
| No se reproducen nombres de personas, usuarios, claves, pólizas ni documentos en reportes | Identificadores enmascarados (p. ej. `INT-013403`) |
| El escáner de exportación solo detecta patrones y valores conocidos del `.env` | No equivale a anonimización completa: revisión humana antes de publicar |

## 6. Escenarios declarativos (SDE)

```yaml
id: HU03-CP02                 # debe existir en fuentes/matriz.json
titulo: ...
actores: [intermediario]      # alias de data/datasets.yaml (el actor funcional correcto del CP)
datasets: [CFG-PROCESO, POL-AUTOS-VIGENTE]
cleanup: { politica: CLEANUP_NOT_APPLICABLE, razon: ... }
pasos:
  - incluir: sesion-y-formulario          # bloque reutilizable
    con: { actor: intermediario, p_sesion: [2], p_formulario: [2, 3] }
  - matriz: [7]                            # pasos del Excel que cubre
    hacer: diligenciar                     # capacidad
    requiere: [POL-AUTOS-VIGENTE]          # opcional: dato que solo este paso necesita
    campos: [{ campo: Número de Póliza, valor: "${dato:POL-AUTOS-VIGENTE.poliza}", tipo: texto }]
```

El validador es estricto: rechaza claves, capacidades o verificaciones desconocidas, pasos que no existen en la matriz, datasets sin declarar y pop-ups sin `formulario` registrado.

## 7. Evidencias y estados

| Estado de un CP | Significado | ¿Aprobado? | En Playwright/JUnit |
|---|---|---|---|
| `REAL_PASS` | Sesión y caso reales, y **todos** los pasos de la matriz verificados | Sí | passed |
| `REAL_PASS_PARCIAL` | Real y sin fallos, pero con pasos no observables o no automatizables | **No** | **failed** ("NO APROBADO") |
| `BLOCKED` | Faltan datos, credenciales o ambiente (preflight o durante la ejecución) | No | skipped, con el motivo |
| `FAIL` | Un paso de la matriz no se cumplió. La **causa** de cada paso dice si es producto por confirmar, automatización, ambiente, dato o no clasificada | No | failed |

Cada paso además puede ser `INTEGRATION_NOT_VERIFIED` (SISE, Worker AI, compuertas) o `NOT_AUTOMATED`.

**Tipos de prueba:**
- **Unitaria** (`@unit`): lógica de la herramienta, sin QA. **No es un CP.**
- **Pre-creación / calibración** (solo lectura): verifican pantallas reales con el actor correcto **sin crear casos**. No cuentan como ejecución del CP.
- **Variante** (`escenarios/_variantes`): secuencia distinta de la aprobada. **Nunca** cuenta para el CP.
- **E2E completo**: el vertical oficial con sesión, caso y evidencia reales.

Evidencias: `test-results/<p>/` (local, nunca se comparte), copias sanitizadas en `projects/<p>/docs/evidencia/`, historial de casos creados en `test-results/<p>/historico-casos.json`.

## 8. Convenciones

- **Comandos en Windows/PowerShell:** usar `node tools/run.mjs <proyecto> …`, con `--grep "@etiqueta"` entre comillas y sin espacios ni `|`. `npm test -- … --grep` no selecciona pruebas desde PowerShell.
- **Verticales reales de SDE: solo con `SDE_E2E=1`** (P-06). Sin la variable, cada vertical queda BLOCKED por CONFIGURACION antes de tocar QA.
- **SDE se ejecuta siempre en un worker** (`projects/seguros-del-estado/playwright.project.json`) y sin reintentos en verticales: crean casos reales.
- **Todo cambio de código** pasa por `npx tsc --noEmit` y las unitarias del proyecto, más la regresión de Demo y Colsubsidio si toca piezas compartidas.
- **Etiquetas:** cada vertical lleva `@<ID-CP>` (p. ej. `@HU06-CP05`), que es única; `@cp01` se repite entre historias de usuario.
- **Commits** en español, del tipo `tipo: descripción` (`feat`, `fix`, `docs`, `chore`, `test`), sin datos sensibles.
