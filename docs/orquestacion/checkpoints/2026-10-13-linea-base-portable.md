# Checkpoint "Línea base auditada y portable" — 2026-10-13

- Commit inicial: el **único** commit de `main`, `chore: establish audited portable baseline`, sin historia anterior. Su hash va en la entrega a Work y se registra aquí en el primer commit posterior al push (un commit no puede contener su propio hash).
- Para revisar: `git show --stat $(git rev-list --max-parents=0 HEAD)`

## 1. Resumen técnico
- Repositorio Git **nuevo** en `PRACTICA/bizagi-qa-framework`, creado con `git archive` del estado vigente (sin `.git`, sin objetos del historial anterior). El repositorio anterior queda intacto como respaldo local y no se publica (D-18).
- Segunda revisión (orquestador): el primer intento de línea base (2 commits, no publicados) aún contenía el nombre de la cuenta administrativa de Colsubsidio, cuya clave sería deducible. Se parametrizó, se saneó el DOCX que también lo nombraba, y la línea base se rehízo desde cero; ese `.git` intermedio se conserva como respaldo local fuera del repositorio.
- Tercera revisión (Work): los 2 XLSX de matrices SDE conservaban 12 vínculos externos por libro, con rutas de perfiles locales. Se eliminaron de forma quirúrgica y la línea base se rehízo otra vez desde cero; el intento anterior (`a1838d1`) quedó completo como respaldo local.
- Se confirmaron los hallazgos de la segunda auditoría de Work y se corrigieron: credencial de la cuenta QA de Colsubsidio en documentos, plantillas, código, recursos y binarios, metadatos de autor en los Office, `.gitignore` insuficiente, exportación sin los documentos centrales y métricas dependientes de `test-results/`.
- GitHub: destino aprobado (D-17); `gh` pendiente de instalar (necesita permisos de Windows) y de autenticar. **Sin remoto y sin push.**

## 2. Archivos y cambios relevantes

| Archivo | Motivo |
|---|---|
| `.gitignore` | Reescrito: `.env` en cualquier carpeta, llaves y certificados, sesiones/`storageState`, traces, HAR y videos, **toda** captura y documento Office/PDF salvo una lista explícita de excepciones revisadas, listados de intermediarios y candidatos, `_crudo/`, paquetes y temporales |
| `ANALISIS-AFI-PARA-FABLE.md`, `ANALISIS-CRD-PARA-FABLE.md`, `projects/colsubsidio/docs/formato-escenario-CRD.md` | Afirmaban usuario **y clave** de la cuenta QA de Colsubsidio → referencia al `.env` local |
| `projects/{_template,demo,conpre}/.env.example`; `tests/{create-case,login}.spec.ts` de _template, demo, conpre y colsubsidio | Marcador `usuario.qa` en plantillas y fallbacks (los fallbacks solo actúan sin `.env`: sin cambio de comportamiento) |
| 2 DOCX y 2 XLSX | Autor y último editor de los metadatos → `QA` (contenido intacto, ZIP verificado) |
| `shared/utils/valoresEnv.ts` (nuevo), `shared/runner/BpmEngine.ts` | Un valor `"${env:NOMBRE}"` en un recurso versionado se resuelve con el `.env` local; si falta, error con el nombre de la variable |
| `projects/colsubsidio/resources/create-case/credito.json`, `helpers/bizagiQaSupport.ts`, `tests/afi-hu14-12-cp03.spec.ts`, `tests/servicio-create-case.real.spec.ts`, `.env.example` | D-20: usuario administrativo QA desde `COLSUBSIDIO_USUARIO_ADMINISTRADOR` (método renombrado a `reasignarAAdministradorQa`); mismo valor efectivo con el `.env` local |
| `projects/seguros-del-estado/fuentes/*.xlsx` (2) | Vínculos externos eliminados: partes `xl/externalLinks/**` (24 por libro), `<externalReferences>`, 21 nombres definidos externos sin uso, 12 relaciones y 12 `Override`. Las demás partes (hojas, textos, estilos, dibujos, imágenes) quedan byte a byte; `extraerDesdeExcel()` sigue igual a `fuentes/matriz.json` |
| `projects/colsubsidio/docs/CLS_CRD_Formato_de_entrada_de_escenario.docx` / `.pdf` | DOCX: 2 menciones de la cuenta → marcador. PDF: queda solo en local (no se puede sanear de forma verificable; ninguna prueba lo usa) |
| Documentos SDE (DEMO-QA, GUIA-REUNION, RECUPERACION) | Ruta local del escritorio → `<ruta-del-repositorio>` |
| `docs/orquestacion/CONTEXTO-MAESTRO.md` | Nombre completo del propietario → nombre y rol |
| `sde/registro.ts`, `sde/metricas.ts`, `sde/trazabilidad.ts` | D-19: reportes de `test-results/` + `docs/evidencia/`; el documento declara qué fuente existe en el equipo |
| `sde/exportar.ts` | El paquete incluye `CLAUDE.md`, `INICIO-CLAUDE-CODE.md` y `docs/orquestacion/`; falla si falta un documento central; `example.test` admitido como dominio de ejemplo |
| `tests/unit/portabilidad.unit.spec.ts` (nuevo), `seguridad`, `clasificacion`, `matriz-manifest`; `colsubsidio/tests/contrato-create-case.spec.ts` | Pruebas de lo anterior (incluye la resolución `${env:...}` y el error sin variable) |
| `CLAUDE.md`, `ESTADO-ACTUAL.md`, `DECISIONES.md` (D-17…D-21, P-05), `PROTOCOLO-AGENTES.md` §5–§6 | Fuente canónica, procedimiento del portátil y de GitHub |

## 3. Diferencias respecto al checkpoint anterior
El checkpoint `2026-10-13-orquestacion-git-auditoria.md` describía dos commits locales que **no** forman parte de este repositorio. Su contenido está incluido aquí, saneado.

## 4. Pruebas (en la copia canónica)
- `npx tsc --noEmit`: sin errores.
- `node tools/run.mjs seguros-del-estado --grep "@unit"`: **112/112**.
- `node tools/run.mjs demo`: 48/4 (los 4 fallos históricos de plantilla sin URL real).
- Colsubsidio: `login-navegacion.unit` 6/6 · `afi-soporte.unit` 32/32 (usa la plantilla DOCX saneada) · `contrato-create-case` 3/3.
- Colsubsidio `afi-hu14-12-cp03` y `servicio-create-case.real`: E2E, solo listados (compilan y cargan); no se ejecutaron.
- CONPRE: solo `--list` (6 pruebas, 3 archivos).
- **E2E: ninguno.** No se crearon casos ni se abrieron pop-ups.

## 5. Estado de los 17 CP
Sin cambios: implementados 13 · completos 0 · ejecutados 2 · aprobados 0. Con solo la evidencia versionada (equipo recién clonado) el resultado es el mismo.

## 6. Bugs y bloqueos
Sin cambios funcionales. Nuevo riesgo fuera del repositorio: **P-05**, la cuenta QA de Colsubsidio tiene la clave igual al usuario.

## 7. Evidencias y observabilidad
`docs/evidencia/` (versionada) contiene 6 reportes de CP, 1 variante, el histórico de casos y 7 notas de texto, todos sanitizados. Las capturas y los logs de esa carpeta siguen solo en local.

## 8. Riesgos conocidos
- La cuenta administrativa QA de Colsubsidio sigue con la clave igual al usuario (P-05). El nombre ya no está en Git; está solo en el `.env` local de cada equipo. Quien trabaje en Colsubsidio debe agregar `COLSUBSIDIO_USUARIO_ADMINISTRADOR` a su `.env`.
- Los 18 PNG versionados se revisaron uno a uno: muestran solo catálogos públicos y un número de caso de QA.
- Las matrices SDE y los documentos técnicos de Colsubsidio quedan en el repositorio privado (autorizado, D-17).
- `afi-soporte.unit` de Colsubsidio necesita Excel de cliente que no están en Git.

## 9. Propuestas que requieren aprobación
- Aprobación del **primer push** (inventario, escaneo, hash y destino).
- P-05: rotar la clave de la cuenta administrativa QA de Colsubsidio.
