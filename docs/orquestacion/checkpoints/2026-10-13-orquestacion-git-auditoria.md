# Checkpoint "Orquestación, Git y auditoría de Work" — 2026-10-13

- Commits: dos commits de un historial local **previo y no publicado**, que la línea base auditada reemplazó (ver `2026-10-13-linea-base-portable.md`). Esos commits no existen en este repositorio: el contenido de esta fase está incluido en la línea base.

## 1. Resumen técnico
- Se auditó la seguridad del repositorio, se consolidó el `.gitignore` y se creó la línea base local de Git (466 archivos, sin `.env`, documentos de cliente ni capturas). Se retiraron 2 identificadores reales: el usuario de QA de CONPRE en 5 archivos y un correo real en 2.
- Documentación central en `docs/orquestacion/` y `CLAUDE.md`.
- Hallazgos de Work H1–H7 verificados y corregidos en SDE con pruebas de regresión (`tests/unit/auditoria-work.unit.spec.ts` y ajustes en otras).
- GitHub **no configurado**: `gh` no está instalado y falta la aprobación del destino (P-01).

## 2. Archivos y cambios relevantes

| Archivo | Motivo |
|---|---|
| `.gitignore` | Excluye `.env*` (salvo plantillas), resultados, capturas, documentos de cliente de la raíz, Excel de intermediarios, `tmp/`, `image/`, `evidencias/`, `SDE_arranque_*` y paquetes |
| `shared/core/LoginActions.ts`, `shared/runner/BpmEngine.ts` | Solo comentarios: usuario real → marcador (sin cambio de comportamiento) |
| `projects/conpre/tests/login.spec.ts`, `projects/conpre/scenarios/conpre-etapa1-crear-caso.yaml`, `RESUMEN-PARA-DISENO.md` | Usuario real → marcador (fallback y comentarios; el `.env` local sigue definiendo el usuario) |
| `projects/colsubsidio/resources/create-case/afiliaciones.json`, `ANALISIS-AFI-PARA-FABLE.md` | Correo real → `contacto.qa@example.test` |
| `playwright.config.ts` | H6: ajustes opcionales por proyecto (`projects/<p>/playwright.project.json`); sin ese archivo nada cambia |
| `projects/seguros-del-estado/playwright.project.json` | H6: `workers: 1`, `fullyParallel: false` |
| `sde/verticales.ts` | H1: `resultadoPlaywright()`; PARCIAL → failed "NO APROBADO", BLOCKED en ejecución → skipped |
| `sde/metricas.ts`, `sde/trazabilidad.ts` | H2: pasos mixtos; "completa" solo con pasos únicamente UI |
| `data/popups-calibrados.yaml`, `sde/popups.ts`, `sde/capacidades.ts`, `sde/escenario.ts`, escenarios CP01–CP04, `tests/calibracion.real.spec.ts` | H3: barrera de pop-ups en la capability y en el validador |
| `sde/modelo.ts`, `sde/ejecutor.ts`, `sde/registro.ts` | H4: causa por paso y motivo del CP según la causa |
| `sde/capacidades.ts` (`verificar_ruta`) | H5: "no observada en N consultas" en lugar de "nunca" |
| Documentos SDE (RESUMEN, GUIA, SIGUIENTE-FASE, RECUPERACION) | H7 y corrección del conteo de CP05 (6 de 8, no 7/9) |
| `docs/orquestacion/*`, `CLAUDE.md` | Contexto portable y protocolo |

## 3. Diferencias respecto al checkpoint anterior
Primer checkpoint con Git. El anterior era documental: `projects/seguros-del-estado/docs/RESUMEN-EJECUTIVO-REUNION-2026-10-13.md`.

## 4. Pruebas
- `npx tsc --noEmit`: sin errores.
- `node tools/run.mjs seguros-del-estado --grep "@unit"`: **107/107**, sin `--workers` (la configuración forzó 1).
- `node tools/run.mjs demo`: 48/4 (línea base). `node tools/run.mjs colsubsidio login-navegacion.unit`: 6/6.
- **E2E: ninguno.** No se crearon casos ni se abrieron pop-ups en QA.

## 5. Estado de los 17 CP
Implementados 13 · completos 0 (H2) · ejecutados 2 · aprobados 0. Detalle en `ESTADO-ACTUAL.md`.

## 6. Bugs y bloqueos
Sin cambios funcionales. Novedad: la barrera H3 bloquea ahora en ejecución cualquier pop-up (UI-10).

## 7. Evidencias y observabilidad
Sin nuevas ejecuciones en QA. Worker AI, SISE y alertas siguen sin observabilidad; SISE y alertas, además, reportadas por QA como no disponibles.

## 8. Riesgos conocidos
- El escáner busca valores del `.env` y patrones. No detecta nombres de personas que no estén en el `.env` ni datos en imágenes: hace falta revisión humana antes de publicar.
- `playwright.config.ts` es compartido: el cambio es aditivo y tiene regresión, pero Work debe revisarlo.
- Con H1, HU06-CP05 aparecerá como *failed* ("NO APROBADO (parcial)") en Playwright. Es intencional.
- El commit contiene documentos técnicos de Colsubsidio (análisis, formato CRD, fixtures con capturas sintéticas) y las matrices SDE: hay que considerarlos al decidir el destino remoto.

## 9. Propuestas que requieren aprobación
- **P-01:** destino del remoto y alcance de publicación (ver §6 de `PROTOCOLO-AGENTES.md`).
- D-10 a D-16: decisiones técnicas implementadas que quedan para revisión de Work y del orquestador.
