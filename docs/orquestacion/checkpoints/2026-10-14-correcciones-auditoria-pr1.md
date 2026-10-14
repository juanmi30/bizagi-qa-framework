# Checkpoint "Correcciones de la auditoría de Work sobre el PR #1" — 2026-10-14

- Commit inicial: `15226fb` (HEAD auditado) · Commit final: HEAD de `fix/sde-confiabilidad-resultados` (PR #1, borrador, sin fusionar)
- Para revisar: `git diff 15226fb..fix/sde-confiabilidad-resultados --stat`
- Veredicto de Work: **REQUIERE CORRECCIONES**, con tres hallazgos. H4 y H7, ya aceptados, no cambian.

## 1. Resumen técnico

### P0 (ALTO): carrera del bloqueo (D-27)

- **Defecto anterior:**
  - `open("wx")` creaba el `.lock` **vacío** y los metadatos se escribían después.
  - Otro proceso que lo leía en ese instante lo tomaba por huérfano, lo borraba y lo creaba, de modo que había dos dueños.
  - La recuperación por antigüedad también permitía dos dueños: dos recuperadores con el mismo juicio obsoleto.
- **Corrección:**
  - **Adquisición:** los metadatos completos, con un token único, se escriben en un temporal y se publican con `link` exclusivo. El `.lock` nunca existe incompleto.
  - **Recuperación automática:** solo de un huérfano demostrable (mismo equipo, pid muerto). Se hace bajo `<bloqueo>.recuperacion` y vuelve a verificar el token.
  - **Fallo cerrado:** todo lo demás (metadatos ilegibles, otro equipo, pid vivo o bloqueo antiguo, recuperación abandonada) se diagnostica, se espera y luego falla con `BloqueoOcupadoError` y el procedimiento manual (`docs/orquestacion/RECUPERACION-BLOQUEOS.md`).
  - **Liberación:** por token.
- La interfaz pública no cambia (`intentarBloqueo`, `adquirirBloqueo`, `conBloqueo`, `BloqueoOcupadoError`). `HistorialCasos` y `verticales.ts` siguen igual.
- **Alcance:** procesos de un mismo equipo.

### P1 (MEDIO): resultado global del pipeline (D-28)

- `veredicto.ts` lee `SDE_TIPO_EJECUCION`. El valor por defecto es `certificacion`.
- En certificación, un resultado que no sea satisfactorio fuerza un código distinto de cero aunque Playwright no tenga pruebas `failed` (caso REAL_PASS + BLOCKED).
- El JUnit de cada CP no cambia: un BLOCKED sigue siendo `skipped` con su causa y no se presenta como defecto.

### P2 (BAJO): expansión del shell (D-29)

- `tools/run.mjs` ejecuta `node <@playwright/test/cli> test …args` con `shell: false`.
- Desaparecen `npx` y cmd.exe, y con ellos el entrecomillado manual.

## 2. Archivos

| Archivo | Hallazgo | Cambio |
|---|---|---|
| `shared/utils/BloqueoArchivo.ts` | P0 | Algoritmo nuevo: enlace atómico, token, recuperación serializada, fallo cerrado y `leerBloqueo` exportado |
| `projects/seguros-del-estado/sde/veredicto.ts` | P1 | `modoEjecucion`, `TipoEjecucion`; `Veredicto` añade `tipo_ejecucion`, `certifica` y `falla_corrida` |
| `tools/run.mjs` | P2 | CLI directo sin shell; `BIZAGI_RUNNER_CLI` solo para pruebas |
| `tests/unit/bloqueo-archivo.unit.spec.ts`, `tests/fixtures/bloqueo/competidor.cjs` (nuevos) | P0 | 13 regresiones, 2 de ellas con procesos Node independientes |
| `tests/unit/resultados-pipeline.unit.spec.ts`, `tests/fixtures/resultados-pw/resultados.sintetico.ts` | P1 | 8 pruebas nuevas; la fixture añade `REAL_PASS_2` y `AUXILIAR` (no es CP) |
| `tests/unit/runner-argumentos.unit.spec.ts`, `tests/fixtures/runner/receptor.cjs` (nuevos) | P2 | 4 pruebas: receptor sintético, control con shell y CLI real con `--list` |
| `tests/unit/confiabilidad.unit.spec.ts` | P0 | Las pruebas H6 se adaptan a la nueva semántica: el bloqueo del hijo lleva token y la antigüedad ya no retira |
| `docs/orquestacion/RECUPERACION-BLOQUEOS.md` (nuevo), `DECISIONES.md`, `ESTADO-ACTUAL.md`, este checkpoint | — | Documentación |

## 3. Evidencia antes y después

- **P0:** se ejecutaron los mismos escenarios contra `BloqueoArchivo.ts` de `15226fb` y contra el nuevo (script de evidencia local, fuera del repositorio).

  | Escenario | `15226fb` | Nuevo |
  |---|---|---|
  | `.lock` vacío de un dueño que aún escribe | Lo reemplaza: **2 dueños** | No adquiere; el archivo queda intacto |
  | Huérfano antiguo con dos recuperadores | **2 dueños** | 1 dueño |
  | Estrés de 6 procesos Node × 60 iteraciones sin retención | **5 secciones críticas simultáneas** (2+0+0+1+0+2) | **0** |

  La regresión de procesos independientes usa esos mismos parámetros (6×60).
- **P1:** con la fixture sintética, REAL_PASS + BLOCKED:
  - antes: código 0, JUnit con 1 `passed` y 1 `skipped`, y veredicto NO SATISFACTORIO;
  - ahora: JUnit igual (1 `passed`, 1 `skipped` con causa `AMBIENTE`), `veredicto.json` con `satisfactorio: false` y `falla_corrida: true`, y **código distinto de cero**.
  - El control sin el reporter sigue dando código 0, lo que demuestra que la diferencia la produce el veredicto.
- **P2:**
  - el control que reproduce el runner anterior (shell y el mismo entrecomillado) recibe `["EXPANDIDO", "\"EXPANDIDO\" con espacios"]`;
  - el runner nuevo entrega idénticos 22 argumentos sintéticos (espacios, comillas, `%VAR%`, `!VAR!`, `& | < > ^ ( ) ;`, `$(...)`, rutas con espacios, barra final, cadena vacía, `--grep`, `--workers` y `--trace`);
  - también se comprobó desde PowerShell real.

## 4. Pruebas

| Control | Resultado |
|---|---|
| `npx tsc --noEmit` | Sin errores |
| SDE `@unit` (`node tools/run.mjs seguros-del-estado --grep "@unit"`) | **155/155** (130 anteriores + 25 nuevas) |
| Demo | 48/4, los mismos 4 fallos históricos (`login` ×3 y `create-case`, plantilla sin URL real) |
| Colsubsidio | `lifecycle-casos.unit`, `contrato-create-case`, `login-navegacion.unit` y `afi-soporte.unit`: **53/53** |
| CONPRE | `--list`: 6 pruebas en 3 archivos (igual que la línea base; no se ejecuta porque hace login real) |
| E2E reales, casos, pop-ups | **Ninguno** |

## 5. Riesgos residuales

- **Exclusión entre equipos:** no está cubierta (ver el alcance).
- **Reutilización de pid:** si el pid de un dueño muerto lo reutiliza otro proceso, no hay recuperación automática y se requiere la manual.
- **Enlaces duros:** se requieren (NTFS, ext4, APFS). En un sistema de archivos sin ellos, la adquisición falla con un mensaje explícito y sin degradarse a un mecanismo inseguro.
- **Recuperación interrumpida:** un `.recuperacion` abandonado bloquea hasta que se recupera a mano. Solo ocurre si un proceso muere en los microsegundos que dura una recuperación.
- **Temporales `.tmp`:** pueden quedar si el proceso muere entre su creación y el enlace. Son inocuos.
- **El veredicto global no queda en JUnit:** JUnit refleja cada CP y el resultado global está en el código de salida y en `veredicto-e2e.json`. Un tablero que solo lea JUnit verá un `skipped`, no el NO SATISFACTORIO.
- **`SDE_TIPO_EJECUCION` persiste en la sesión:** si queda definida en una sesión de PowerShell, las corridas siguientes no certifican. El error es seguro: nunca se anuncia una certificación.
- **Argumentos antes del runner:** su interpretación depende del shell de quien escribe el comando, sea PowerShell o Git Bash.

## 6. Propuestas que requieren aprobación

- D-27, D-28 y D-29, para revisión de Work y del orquestador.
- P-06 y P-07 siguen pendientes.
