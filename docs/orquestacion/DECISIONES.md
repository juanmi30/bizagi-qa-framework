# Registro de decisiones

Estados: **aprobada** (decidida por Juan Miguel o por el orquestador con él), **implementada-propuesta** (aplicada por Claude como decisión técnica ordinaria; queda pendiente de revisión de Work y del orquestador), **pendiente** (requiere decisión funcional o de autorización). Las hipótesis no se registran como decisiones.

| # | Fecha | Decisión | Fundamento | Estado |
|---|---|---|---|---|
| D-01 | 2026-10-07 | SDE es un proyecto aislado dentro del framework; no reutiliza datos, selectores ni Knowledge de Colsubsidio | Clientes distintos | aprobada |
| D-02 | 2026-10-08 | Un CP solo es verde con sesión real, caso real y evidencia; `REAL_PASS_PARCIAL` no es aprobación | Evitar falsos positivos | aprobada |
| D-03 | 2026-10-08 | SISE, Worker AI y compuertas no se simulan: `INTEGRATION_NOT_VERIFIED` salvo evidencia directa | Sin acceso a trazas | aprobada |
| D-04 | 2026-10-13 | HU03 se radica con el actor **Intermediario**; CE_Analista no se usa para aprobar HU03 | Confirmado por QA | aprobada |
| D-05 | 2026-10-13 | BUG-02 reclasificado: observación de una ejecución con actor no conforme, no un defecto | Confirmación de QA (D-04) | aprobada |
| D-06 | 2026-10-13 | BUG-03 ya reportado por QA: no se reproduce ni se abre el pop-up sin un cierre seguro | Destruye casos | aprobada |
| D-07 | 2026-10-13 | La secuencia de documentos del producto se ejecuta solo como **variante** (no cuenta para CP01) hasta que se apruebe el control de cambios | No modificar el Excel sin control de cambios | aprobada |
| D-08 | 2026-10-13 | NIT sintéticos con DV válido son aceptables para HU06-CP01 (Matriz Data: "Datos de Cliente N/A") mientras no se demuestre una validación de existencia | Indicación de Juan Miguel | aprobada |
| D-09 | 2026-10-13 | SISE y alertas se tratan como indisponibilidades reportadas por QA, no como defectos verificados | Indicación de Juan Miguel | aprobada |
| D-10 | 2026-10-13 | Diagnósticos y calibraciones con un caso existente corren en **modo solo lectura** (la red bloquea `CREATENEWCASE`) | No crear casos por accidente | implementada-propuesta |
| D-11 | 2026-10-13 | H1: `REAL_PASS_PARCIAL` se muestra como *failed* ("NO APROBADO") en Playwright/JUnit; `BLOCKED` en ejecución como *skipped* | Auditoría de Work | implementada-propuesta |
| D-12 | 2026-10-13 | H2: un paso con UI + integración o no automatizado cuenta como **mixto**; "implementación completa" exige solo pasos UI | Auditoría de Work | implementada-propuesta |
| D-13 | 2026-10-13 | H3: barrera de pop-ups por registro (`data/popups-calibrados.yaml`) en la capability; abrir exige calibración, mapeo, evidencia, cierre seguro, o autorización explícita por caso | Auditoría de Work; BUG-03 | implementada-propuesta |
| D-14 | 2026-10-13 | H4: cada paso no verde lleva una **causa**; una excepción genérica nunca se atribuye al producto | Auditoría de Work | implementada-propuesta |
| D-15 | 2026-10-13 | H6: `playwright.config.ts` acepta `projects/<p>/playwright.project.json`; SDE fija `workers: 1` | Auditoría de Work; historial compartido | implementada-propuesta |
| D-16 | 2026-10-13 | Git local con línea base sanitizada; documentos de cliente, capturas, `.env`, Excel de intermediarios y temporales fuera de Git | Seguridad | implementada-propuesta |
| D-17 | 2026-10-13 | Destino remoto: repositorio **PRIVADO** `bizagi-qa-framework` en la cuenta personal de GitHub de Juan Miguel, con todos los proyectos (antes P-01) | La empresa lo autorizó (comunicado por Juan Miguel) | aprobada |
| D-18 | 2026-10-13 | Nueva línea base sin el historial local previo (2 commits no publicados, uno con un identificador real). El repositorio original se conserva solo como respaldo local | Indicación de Juan Miguel; auditoría de Work | aprobada |
| D-19 | 2026-10-13 | Métricas de ejecución desde `test-results/` (local) **y** `docs/evidencia/` (versionada); el documento declara qué fuente existe en el equipo | Tras clonar no existe `test-results/` (auditoría de Work) | implementada-propuesta |
| D-20 | 2026-10-13 | Cuenta administrativa QA de Colsubsidio (clave igual al usuario): su nombre **no se versiona**. Sale del `.env` local (`COLSUBSIDIO_USUARIO_ADMINISTRADOR`): destino de reasignación en `bizagiQaSupport.ts` y usuario creador en `credito.json` mediante `${env:...}` (`shared/utils/valoresEnv.ts`). Sin la variable, la prueba falla nombrándola; no se inventa un valor. El DOCX del formato CRD se saneó y su PDF quedó solo en local | Auditoría de Work y orquestador: la clave sería deducible | implementada-propuesta |
| D-21 | 2026-10-13 | Binarios versionados por lista explícita en `.gitignore` (18 PNG revisados sin datos personales, 2 DOCX, 1 PDF, 2 XLSX); metadatos de autor de los Office neutralizados; los 2 XLSX sin vínculos externos (12 por libro, con rutas de perfiles locales, sin ningún uso en fórmulas, nombres ni validaciones) | Auditoría de Work | implementada-propuesta |
| P-05 | — | **Rotar la clave de la cuenta administrativa QA de Colsubsidio** (hoy igual al usuario, valor predeterminado). Responsable: Juan Miguel con el cliente. Hasta entonces, el nombre de esa cuenta no puede aparecer en Git, reportes ni paquetes | Riesgo de seguridad fuera del repositorio | **pendiente** |
| P-02 | — | Control de cambios de la secuencia de documentos (HU06) y BUG-05/BUG-06 | Decisión funcional | **pendiente** |
| P-03 | — | FUNC-10: qué actor radica en HU06 (hoy CP01/CP05 usan Analista y CP02–04 Intermediario) | Decisión funcional | **pendiente** |
| P-04 | — | Fuente de datos SISE (pólizas de la clave de INT-013403) y mapeo de UI-10 | Datos de QA | **pendiente** |
