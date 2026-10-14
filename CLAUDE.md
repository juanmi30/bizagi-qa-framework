# Instrucciones para Claude Code

Antes de trabajar, lee en este orden:
1. `docs/orquestacion/CONTEXTO-MAESTRO.md`: arquitectura, roles, seguridad y convenciones.
2. `docs/orquestacion/ESTADO-ACTUAL.md`: estado verificado y prioridades.
3. `docs/orquestacion/DECISIONES.md`: lo aprobado y lo pendiente. No conviertas hipótesis en decisiones.
4. `docs/orquestacion/PROTOCOLO-AGENTES.md`: cómo cerrar una fase (checkpoint) y cómo trabajar entre computadores.

Reglas que no se negocian:
- Credenciales y datos de QA solo en `projects/<p>/.env` local. Nunca se imprimen, se versionan ni se copian a reportes.
- Toda prueba que inicia sesión declara `test.use({ trace: 'off' })`.
- Ningún CP es verde sin sesión real, caso real y evidencia. `REAL_PASS_PARCIAL` no es aprobación.
- SDE: no abrir pop-ups de grillas sin calibración registrada (BUG-03); no crear casos en diagnósticos (modo solo lectura).
- No modificar Colsubsidio, CONPRE ni Demo salvo con una corrección genérica indispensable y su regresión.
- Antes de publicar, hacer push o ejecutar algo destructivo: aprobación explícita de Juan Miguel.
- En PowerShell: `node tools/run.mjs <proyecto> --grep "@etiqueta"` (no `npm test -- … --grep`).

- `test-results/` no viaja con Git: la evidencia histórica que importa se copia sanitizada a `projects/<p>/docs/evidencia/`.

Fuente canónica: este repositorio (`main` del remoto privado `bizagi-qa-framework`). La carpeta anterior `bizagi-cloud-playwright-framework_n` es solo un respaldo local: no se trabaja ni se publica desde ella.

Para la persona que dirige el proyecto, ver también `INICIO-CLAUDE-CODE.md` (cómo comunicarse con ella).
