# Protocolo de trabajo entre agentes y computadores

Ciclo de una fase: **Orquestador encarga → Claude implementa y entrega checkpoint → Work audita → Orquestador decide con Juan Miguel → siguiente encargo.**

Todos leen los mismos documentos: `CONTEXTO-MAESTRO.md`, `ESTADO-ACTUAL.md` y `DECISIONES.md`.

## 1. Entrega de Claude al cerrar una fase (checkpoint)

Claude crea un commit y escribe `docs/orquestacion/checkpoints/AAAA-MM-DD-<fase>.md` con esta plantilla:

```markdown
# Checkpoint <fase> — <fecha>
- Commit inicial: <hash> · Commit final: <hash>
- Para revisar: `git diff <inicial>..<final> --stat` y `git log <inicial>..<final> --oneline`

1. Resumen técnico (3–6 líneas)
2. Archivos y cambios relevantes (tabla: archivo → motivo)
3. Diferencias respecto al checkpoint anterior
4. Pruebas: comandos exactos y resultados (tsc, @unit, regresiones; E2E: sí/no y casos creados)
5. Estado de los 17 CP (implementado / ejecutado / aprobado y cambios)
6. Bugs y bloqueos (nuevos, reclasificados, resueltos)
7. Evidencias y nivel de observabilidad (qué se vio en QA y qué no es observable)
8. Riesgos conocidos
9. Propuestas que requieren aprobación funcional o de autorización
```

Además, Claude actualiza `ESTADO-ACTUAL.md` y, si corresponde, `DECISIONES.md`.

## 2. Instrucción de inicio para ChatGPT Work (copiar tal cual)

> Eres el auditor técnico independiente del framework de automatización QA de Bizagi. **No modifiques archivos.** Lee `docs/orquestacion/CONTEXTO-MAESTRO.md`, `ESTADO-ACTUAL.md`, `DECISIONES.md` y el checkpoint `docs/orquestacion/checkpoints/<archivo>`. Revisa el diff entre los commits indicados (`git diff <inicial>..<final>`). Para cada afirmación del checkpoint, contrástala con el código y con las pruebas. Clasifica tus hallazgos como ALTA, MEDIA o BAJA, con archivo y línea, evidencia y recomendación mínima. Separa las cuestiones técnicas de las decisiones funcionales pendientes. Termina con un informe para el orquestador: hallazgos, riesgos, qué aprobarías y qué no. No reproduzcas credenciales ni datos personales.

Si Work no tiene acceso al repositorio, Claude genera el paquete sanitizado (`$env:SDE_EXPORTAR="1"; node tools/run.mjs seguros-del-estado exportar.tool --workers=1`) o un `git diff` exportado. El ZIP completo deja de ser necesario cuando el repositorio remoto esté autorizado.

## 3. Reglas de la revisión

- Las recomendaciones de Work **no se aplican automáticamente**: el orquestador decide con Juan Miguel y lo registra en `DECISIONES.md`.
- Claude verifica cada hallazgo contra el código más reciente antes de corregirlo, aplica la corrección mínima suficiente y agrega pruebas de regresión.

## 4. Iniciar un agente desde cero

**Claude Code:**
1. Abrir el repositorio. Claude lee `CLAUDE.md` y, desde ahí, los tres documentos centrales.
2. Comprobar el entorno: `git status`, `git log --oneline -5`, `npm ci` (solo si falta `node_modules`), `npx tsc --noEmit` y `node tools/run.mjs seguros-del-estado --grep "@unit"`.
3. Confirmar que existe el `.env` local del proyecto en el que se va a trabajar, sin imprimir valores.

**Work:** ver §2. **Orquestador:** leer `ESTADO-ACTUAL.md` y el último checkpoint.

## 5. Cambiar de computador (escritorio ↔ portátil)

Fuente canónica: el remoto privado `bizagi-qa-framework` (D-17). Git lleva código, documentación, escenarios, matrices SDE y evidencia sanitizada. **No lleva**: `.env`, `test-results/` (historial local de ejecuciones), capturas, traces, documentos de cliente de la raíz ni el Excel de intermediarios.

### 5.1 Primera vez en el portátil

```powershell
# 1. Clonar (pide iniciar sesión en GitHub en el navegador la primera vez; no se comparten tokens)
cd <carpeta-de-trabajo>
git clone https://github.com/<cuenta-de-Juan-Miguel>/bizagi-qa-framework.git
cd bizagi-qa-framework
git config pull.ff only                  # un pull nunca mezcla en silencio: si hay divergencia, se detiene

# 2. Dependencias exactas del package-lock
npm ci
npx playwright install msedge            # solo si Edge no está disponible para Playwright

# 3. Entorno local seguro: un .env por proyecto, a partir de su plantilla
Copy-Item projects\seguros-del-estado\.env.example projects\seguros-del-estado\.env
# Completar el .env A MANO desde un canal autorizado (gestor de contraseñas o entrega directa de QA).
# Nunca por chat, correo sin cifrar ni Git. Repetir para colsubsidio/conpre/demo solo si se van a usar.

# 4. Verificar Node, TypeScript y Playwright
node --version                           # 22.x
npx playwright --version                 # 1.61.x
npx tsc --noEmit
node tools/run.mjs seguros-del-estado --grep "@unit"
```

Las pruebas unitarias de SDE no necesitan el `.env`. Colsubsidio necesita además `COLSUBSIDIO_USUARIO_ADMINISTRADOR` en su `.env` (nombre de la cuenta administrativa QA; no se versiona mientras su clave sea deducible, P-05). `afi-soporte.unit` de Colsubsidio necesita además los Excel de cliente de la raíz (no están en Git): copiarlos por un canal autorizado si se va a trabajar en Colsubsidio.

**5. Recuperar el contexto:** leer `CLAUDE.md` → `CONTEXTO-MAESTRO.md` → `ESTADO-ACTUAL.md` → `DECISIONES.md` → el último archivo de `docs/orquestacion/checkpoints/`.

**6. Continuar con un agente:** Claude Code se abre en la carpeta del repositorio y sigue `CLAUDE.md` (ver §4). ChatGPT Work recibe la instrucción del §2 con el checkpoint más reciente.

**Historial de ejecuciones:** tras clonar no existe `test-results/`. Las métricas (`TRAZABILIDAD-17-CP.md`) se reconstruyen con `docs/evidencia/` y el documento lo declara ("historial local NO disponible en este equipo"). Una ejecución nueva cuenta cuando su reporte sanitizado se copia a `docs/evidencia/` y se versiona.

### 5.2 Cada día, en cualquier equipo

```powershell
git status                               # 1. ¿quedó algo sin publicar en ESTE equipo? Si sí: commit y push antes de seguir
git pull                                 # 2. traer lo último ANTES de trabajar
# ... trabajar ...
git status                               # 3. revisar qué cambió
git add <archivos concretos>             # 4. agregar SOLO lo revisado (nunca "git add ." a ciegas)
git commit -m "fix: descripción breve"
git push                                 # 5. publicar al terminar la sesión, siempre
```

### 5.3 Reglas para no sobrescribir trabajo del otro equipo
- Terminar cada sesión con `git push`; empezar cada sesión con `git status` + `git pull`.
- Si `git pull` dice que las ramas divergieron (con `pull.ff only` se detiene): **no** forzar. Hacer `git log --oneline main..origin/main` para ver qué hay en el remoto y resolver con ayuda.
- Si hay cambios sin commit y hace falta el pull: `git stash`, `git pull`, `git stash pop`, revisar.
- Nunca `git push --force`, `git reset --hard`, `git rebase` sobre lo ya publicado ni reescribir historia.
- El `.env` se mantiene a mano en cada equipo; si cambia una credencial, se actualiza en ambos por el canal autorizado.

## 6. Publicación en GitHub

1. GitHub CLI: `winget install --id GitHub.cli -e --source winget` (instalador oficial; puede pedir permisos). Verificar con `gh --version`.
2. Autenticación: `gh auth login --hostname github.com --git-protocol https --web`. Juan Miguel completa el flujo en el navegador; no se comparten tokens. Verificar con `gh auth status` (no muestra el token).
3. **Antes del primer push**, Juan Miguel aprueba la publicación concreta: inventario, escaneo, hash y destino.
4. Con la aprobación, **desde la copia canónica** (nunca desde la carpeta de respaldo con el historial anterior):
   `gh repo create bizagi-qa-framework --private --source . --remote origin --push`
5. Verificación: `gh repo view <cuenta>/bizagi-qa-framework --json visibility,defaultBranchRef,isPrivate`, `git ls-remote origin` (solo `refs/heads/main`, sin tags) y que el hash de `origin/main` sea el aprobado.
