# Cierre de jornada y migración al portátil — 2026-10-14

Sin cambios de código ni ejecuciones contra Bizagi en este cierre. El estado funcional completo está en `2026-10-14-validaciones-funcionales.md`, `ESTADO-ACTUAL.md` y `DECISIONES.md`; este documento solo añade lo necesario para continuar desde otro equipo.

## 1. Dónde quedó el trabajo

- **Rama:** `feat/sde-validaciones-funcionales`, publicada.
- **PR #2:** en borrador hacia `main`, **pendiente de auditoría de Work. No fusionar.**
- **`main`:** sin cambios en esta fase.
- **Ramas anteriores:** se conservan `fix/sde-confiabilidad-resultados` y el respaldo local `bizagi-cloud-playwright-framework_n`.
- **Estado SDE:**
  - 17 CP · 13 escenarios · 2 ejecutados · **0 aprobados**.
  - HU06-CP05 está en FAIL no atribuible al producto (formato nuevo del Ramo, P-14).
  - Orden, obligatoriedad y capitalización están pendientes de fuente (P-11).
- **Hallazgos:**
  - OBS-04 reproducido.
  - BUG-04 no reproducido; falta que QA confirme el cierre.
  - OBS-12 nuevo, por confirmar.
  - P-14: cambio de parametrización.
- **Casos reales:**
  - **571**, caso de calibración autorizado, quedó en «Estructurar información».
  - **434**: sigue pendiente la decisión sobre él y sobre el 571 (P-07).
- **Barreras activas:**
  - P-06: las verticales reales exigen `SDE_E2E=1`.
  - BUG-03: no se abren pop-ups de filas.
  - Diagnósticos en solo lectura.

## 2. Lo que NO viaja por Git (se traslada por un canal seguro y aprobado)

| Elemento | Motivo |
|---|---|
| `projects/<p>/.env` (SDE, Colsubsidio, CONPRE, Demo) | Credenciales y datos de QA |
| `test-results/` | Historial local: reportes, `PRECREACION_*`, `PRESENTACION_*`, capturas, `historico-casos.json` local. Lo relevante ya está copiado y sanitizado en `projects/seguros-del-estado/docs/evidencia/` |
| Documentos de cliente en la raíz (`*.xlsx`, `*.docx`, `*.md` de HU de Colsubsidio, `Intermedi y suc.xlsx`) y `tmp/` | Datos de cliente; ignorados a propósito |
| `.claude/settings.local.json` | Permisos locales de la herramienta |

## 3. Preparar el portátil

1. Seguir `PROTOCOLO-AGENTES.md` §5.1: clonar, `git config pull.ff only`, `npm ci` y `npx playwright install msedge` solo si hace falta.
2. Cambiar a la rama del PR:
   ```powershell
   git fetch origin
   git switch feat/sde-validaciones-funcionales
   ```
3. Crear la `.env` de SDE desde la plantilla, que trae las 59 variables:
   ```powershell
   Copy-Item projects\seguros-del-estado\.env.example projects\seguros-del-estado\.env
   ```
   Completarla a mano por el canal aprobado. Variables con valor hoy:
   - **Ambiente y modo:** `BIZAGI_BASE_URL`, `BIZAGI_LOGIN_MODO`, `BIZAGI_CASE_NUMBER_LABEL`, `ESPERA_ACCION_SEGUNDOS`, `ESPERA_INTEGRACION_MINUTOS`, `SDE_EXPLORAR`.
   - **Actores** (credenciales):
     - `USUARIO_`, `CLAVE_` y `DOMINIO_` de `intermediario`, `analista` e `intermediario_alerta`;
     - `SDE_INTERMEDIARIO_CLAVE`.
   - **Proceso y datos paramétricos:** `SDE_PROCESO_RADICACION`, `SDE_PROCESO_CATEGORIA`, `SDE_SUCURSAL`, `SDE_RUTA_*`, `SDE_AUTOS_RAMO`, `SDE_AUTOS_MOVIMIENTO`, `SDE_GEN_RAMO`, `SDE_DOCS_GENERALES_MASIVO`.
   - **Datos de negocio** (pólizas, placas, tomadores, Cumplimiento): siguen **vacíos** a la espera de QA.
4. **Variables ajustadas por P-14** el 14/10. El portal muestra ahora `"<código> - <nombre>"`, así que el valor debe ser el texto completo de la opción:
   - `SDE_RUTA_RAMO`
   - `SDE_AUTOS_RAMO`
   - `SDE_GEN_RAMO`
   - `SDE_SUCURSAL`

   Si se copian valores anteriores al 14/10, las verticales y precreaciones fallan en Ramo o Sucursal con «la opción … no está en la lista (visibles: …)». El mensaje lista las opciones reales.
5. **Cuentas de QA necesarias:**
   - analista (rol CE_Analista);
   - intermediario habilitado (rol CE_Intermediarios; cuenta enmascarada `INT-013403`);
   - `intermediario_alerta`, que sigue sin rol (ENV-03).
6. **Si se trabaja Colsubsidio o CONPRE:** sus `.env.example` están incompletos frente a las `.env` reales (deuda previa, no corregida aquí). Trasladar las `.env` completas por el canal seguro. Colsubsidio necesita además los Excel de cliente de la raíz (§5.1).

## 4. Diferencias entre equipos

- **Trazabilidad:** `TRAZABILIDAD-17-CP.md` cuenta los reportes locales de `test-results/`. En un equipo recién clonado muestra «historial local NO disponible»; los estados salen de `docs/evidencia/` y son los mismos.
- **Rutas:** no hay rutas absolutas en el código. Los comandos se lanzan desde la raíz del repositorio.
- **Navegador:** Edge (`channel: 'msedge'`) debe estar instalado.

## 5. Comandos seguros (sin contactar Bizagi)

```powershell
npx tsc --noEmit
node tools/run.mjs seguros-del-estado --grep "@unit"                 # 175 pruebas, sin red
node tools/run.mjs seguros-del-estado --list --grep "@e2e"           # 13 escenarios + 1 variante diagnóstica; no ejecuta nada
```

## 6. Pendiente para Work antes del merge del PR #2

- **Revisar D-30 a D-35:**
  - el mecanismo de expectativas con fuente;
  - las reglas RAE/DLE;
  - `no_bloqueante`;
  - D-33, que hace pendiente P4 de HU06-CP01;
  - P-06.
- **Recalibraciones:** «Tipo de Solicitud» en Estructurar y la verificación de Observaciones antes de las pestañas.
- **Sanitización** de `docs/evidencia/2026-10-14_*` y de `HU06-CP05_20261014-145128.json`.
- **Decisiones que no son de Work:** P-07, P-11 a P-14 y si se autoriza una nueva ejecución de HU06-CP05 con `SDE_E2E=1`.
