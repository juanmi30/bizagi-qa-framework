# Reporte Fase 1 — SDE-CEL (Seguros del Estado · Centro de Expedición)

> **Actualización 2026-10-08:** este reporte describe el cierre de la Fase 1 (sin credenciales). El estado vigente
> (login real, E2E de HU06-CP05, defectos BUG-01..04) está en **[REPORTE-FASE1B.md](REPORTE-FASE1B.md)**.

Ejecución: 2026-10-07 22:10 → 2026-10-08 00:25 (hora local) · Windows 11, Node 24.18.0, Playwright 1.61.1, Microsoft Edge (`channel: msedge`).

## 0. Resultado en una línea

**0 de 17 CP en E2E real.** Los 3 verticales están implementados, pero quedan **BLOCKED** porque **no hay credenciales SDE** (QA confirmó el 2026-10-07 que hoy no existen) ni datos de prueba. Lo único ejecutado contra QA real es la **disponibilidad del ambiente y la estructura del login**, sin enviar credenciales.

## 1. Clasificación por CP

| CP | Fase | Clasificación | Motivo / evidencia |
|---|---|---|---|
| HU06-CP05 | 1 | **BLOCKED** | Escenario listo (`escenarios/1-hu06-cp05.yaml`). Faltan credenciales del intermediario, `SDE_PROCESO_RADICACION` y el dataset INI-INDIVIDUAL-RUTA → `evidencia/HU06-CP05_20261008-002214.json` |
| HU03-CP02 | 1 | **BLOCKED** | Escenario listo (`2-hu03-cp02.yaml`). Faltan credenciales y POL-AUTOS-VIGENTE → `evidencia/HU03-CP02_20261008-002215.json` |
| HU06-CP01 | 1 | **BLOCKED** | Escenario listo (`3-hu06-cp01.yaml`). Faltan credenciales del intermediario y del analista, INI-GENERALES-MASIVO y EST-FILA-GENERALES-PN → `evidencia/HU06-CP01_20261008-002215.json` |
| HU06-CP02/03/04, HU03-CP01, CP03–08 | 2 | **PREPARADO** | Modelados en manifest y datos; sin escenario (no se crean stubs) |
| HU03-CP09–12 | 3 | **PREPARADO** | Modelados; reservados para la fase de excepciones |

Números de caso generados: **ninguno** (no hubo sesión). `historico-casos.json` de SDE: vacío. Cleanup: **no aplica**, no se creó ni alteró nada en QA.

### Paso 2 de las matrices ("Ingresar al ambiente…")

| Parte del esperado | Estado | Evidencia |
|---|---|---|
| "El ambiente se encuentra disponible" | **PASS real** (sin sesión) | `tests/ambiente.smoke.spec.ts`: HTTP < 400, `#domain` visible con dominios seleccionables; al elegir dominio aparecen `#user`, `#password` y `#btn-login`, con usuario vacío (no se escribió nada). Captura: `evidencia/2026-10-07_qa-login-dominio.png` |
| "…permite iniciar una nueva Radicación / autenticarse con un intermediario" | **BLOCKED** | `tests/login.spec.ts` × 3 roles: SKIPPED con anotación BLOCKED |

Observado en QA (2026-10-07): `GET https://test-aiprocesos-sde.bizagi.com/` → 200 (SPA Bizagi). Login en dos pasos: primero `select#domain` con las opciones `domain` (Bizagi), `externos` y `segurosdelestado.com`; el selector se oculta al elegir y aparecen Usuario y Contraseña, más los botones "Ingresar" e "Iniciar sesión de Administrador".

## 2. Comandos ejecutados y resultados

| # | Comando | Resultado |
|---|---|---|
| 1 | `Invoke-WebRequest https://test-aiprocesos-sde.bizagi.com/` | 200, HTML de la SPA Bizagi |
| 2 | Exploración headless del login (script temporal con Playwright y Edge, sin credenciales) | Estructura y dominios del login (§1) |
| 3 | `npm run new:project -- seguros-del-estado` | Proyecto creado desde `_template` |
| 4 | Línea base: `$env:CI='1'; npm test -- demo --workers=2 --reporter=line` | 42 passed / **4 failed preexistentes** (placeholders de plantilla sin URL) |
| 5 | `npm test -- demo login-dominio --workers=1 --retries=0` | **6 passed** (regresión del cambio compartido) |
| 6 | `npx tsc --noEmit` | exit 0 |
| 7 | `npm test -- seguros-del-estado --list` | `Total: 50 tests in 8 files` |
| 8 | `$env:CI='1'; npm test -- seguros-del-estado --workers=1 --retries=0 --reporter=list` | **43 passed, 7 skipped, 0 failed** → `evidencia/2026-10-08_corrida-sde.log` |
| 9 | `$env:CI='1'; npm test -- demo --workers=2 --retries=0` | **48 passed**, 4 failed (los mismos 4 de la línea base) → `evidencia/2026-10-08_regresion-demo.log` |
| 10 | `$env:CI='1'; npm test -- colsubsidio login-navegacion.unit --workers=1 --retries=0` | **6 passed** (red simulada) → `evidencia/2026-10-08_regresion-colsubsidio-login.log` |
| 11 | `$env:SDE_ACTUALIZAR_DOCS='1'; npm test -- seguros-del-estado matriz-manifest --grep "@docs"` | Genera `docs/TRAZABILIDAD-17-CP.md` |
| 12 | Diff SHA-256 contra la línea base | Solo cambiaron `shared/core/LoginActions.ts` y `shared/runner/BpmEngine.ts`, y se agregó un test en `demo` (AUDITORIA §1) |

`$env:CI='1'` se usó para correr *headless* (`playwright.config.ts`: `headless: !!CI`). Con `CI`, la configuración también activa `retries: 2`; por eso todas las corridas pasaron `--retries=0`, y los verticales fuerzan `retries: 0` en el propio archivo.

### Desglose de la suite SDE (50 tests)

| Grupo | Tests | Resultado | Naturaleza |
|---|---|---|---|
| `ambiente.smoke.spec.ts` | 2 | 2 PASS | **Real contra QA** (sin credenciales) |
| `login.spec.ts` | 3 | 3 SKIPPED → BLOCKED | Real; falta `USUARIO_/CLAVE_/DOMINIO_<rol>` |
| `verticales.spec.ts` | 3 | 3 SKIPPED → BLOCKED | Real; deja un reporte JSON con los bloqueos |
| `exploracion.real.spec.ts` | 1 | SKIPPED | Solo con `SDE_EXPLORAR=1` y credenciales |
| `unit/matriz-manifest` | 6 | 6 PASS | Fidelidad Excel↔JSON↔transcripción, manifest, trazabilidad |
| `unit/datos-escenario` | 15 | 15 PASS | Registro de datos, `.env.example` alineado, validador estricto (8 rechazos) |
| `unit/ejecutor` | 9 | 9 PASS | Capabilities falsas: BLOCKED, no verde sin sesión ni caso, sanitización, HistorialCasos |
| `unit/ui-sintetico` | 11 | 11 PASS | **DOM sintético** estilo Bizagi: valida la lógica, **no** el DOM real |

Ningún test del proyecto pasa en "modo esqueleto": SDE no registra `registerScenarios`.

## 3. Aserciones que prueban las unitarias (garantías del motor)

- Sin credenciales o datos, el CP queda **BLOCKED**, no se ejecuta ninguna capability y se listan las variables faltantes (nunca valores).
- Sin **sesión real** o sin **número de caso real**, el CP es **FAIL** aunque "todo pase".
- Un paso con `integracion` o `no_automatizado` impide `REAL_PASS`: el máximo es `REAL_PASS_PARCIAL`, con la lista de pasos no verificados.
- Un fallo detiene el escenario y los pasos siguientes quedan `NOT_RUN`.
- Clave, usuario y datos SISE nunca aparecen en el reporte (`«oculto»`).
- Etiquetas: exactitud con tildes ("Linea" ≠ "Línea"); dos etiquetas iguales visibles = error de ambigüedad; en listas, "Autos" no selecciona "Autos Pesados".
- Post-condición: un valor truncado por `maxlength` se detecta ("ABC1234" → "ABC123"), que es la base de la prueba Placa > 6.
- Tablas: se edita la fila exacta; el pop-up sin obligatorios **debe** seguir abierto (si se cierra, el paso 22 falla); la fila agregada se identifica por valores y se elimina **esa** fila. Dos controles negativos demuestran que las aserciones detectan el error.

## 4. Integraciones

Ninguna integración fue observada: SISE, Consultar alertas, Worker AI y las compuertas ¿Masivo? y Acción a tomar no se interceptaron ni simularon. En los escenarios están declaradas como `integracion` → **INTEGRATION_NOT_VERIFIED**. La ruta, cuando corra, se clasificará **UI_PASS** (inferida por la actividad asignada).

## 5. Pasos que NO se automatizaron (declarados en los escenarios)

| CP | Paso(s) | Razón |
|---|---|---|
| HU06-CP05 | 6 (parcial) | Ortografía de **todos** los textos: no hay glosario. Se verifican las etiquetas exactas conocidas |
| HU03-CP02 | 6 (parcial), 7 (docs), 17 (docs), 18 | Caracterización por campo y tipos documentales sin especificar; sin glosario |
| HU03-CP02 | 10, 11, 12, 20 | INTEGRATION_NOT_VERIFIED (SISE, alertas, Acción a tomar) |
| HU06-CP01 | 11, 12, 17 | INTEGRATION_NOT_VERIFIED (¿Masivo?, Worker AI) |
| HU06-CP01 | 28 (contenido) | Navegación de pestañas sin calibrar |

## 6. Bloqueos (exactos, del reporte de los verticales)

```
ENVIRONMENT: BIZAGI_BASE_URL no configurada            (no hay .env; el valor está en .env.example)
CREDENCIALES actor "intermediario": USUARIO_intermediario, CLAVE_intermediario, DOMINIO_intermediario (o BIZAGI_LOGIN_DOMINIO)
CREDENCIALES actor "analista": USUARIO_analista, CLAVE_analista, DOMINIO_analista (o BIZAGI_LOGIN_DOMINIO)
TEST_DATA CFG-PROCESO: SDE_PROCESO_RADICACION
TEST_DATA INI-INDIVIDUAL-RUTA: SDE_RUTA_LINEA, SDE_RUTA_RAMO, SDE_RUTA_MOVIMIENTO, SDE_SUCURSAL, SDE_RUTA_FORMA_CONSULTA, SDE_RUTA_CRITERIO_CAMPO, SDE_RUTA_CRITERIO_VALOR
TEST_DATA POL-AUTOS-VIGENTE: SDE_AUTOS_RAMO, SDE_AUTOS_MOVIMIENTO, SDE_SUCURSAL, SDE_AUTOS_POLIZA
TEST_DATA INI-GENERALES-MASIVO: SDE_GEN_RAMO, SDE_SUCURSAL, SDE_GEN_MASIVO_NARRATIVA_POLIZAS
TEST_DATA EST-FILA-GENERALES-PN: SDE_EST_TOMADOR_NIT, SDE_EST_TOMADOR_NIT_2
```

## 7. Cómo correr cuando lleguen credenciales y datos

```powershell
Copy-Item projects\seguros-del-estado\.env.example projects\seguros-del-estado\.env   # completar (no compartir)
npm test -- seguros-del-estado --grep "@login" --workers=1 --headed                    # 1) login por rol
$env:SDE_EXPLORAR='1'; npm test -- seguros-del-estado exploracion --workers=1 --headed # 2) calibrar DOM
#    → ajustar SOLO baseObjects/sde.objects.ts según test-results/seguros-del-estado/sde/exploracion-*.json
npm test -- seguros-del-estado --grep "@cp05" --workers=1 --headed                    # 3) vertical 1
npm test -- seguros-del-estado --grep "@cp02" --workers=1 --headed                    # 4) vertical 2
npm test -- seguros-del-estado --grep "@cp01" --workers=1 --headed                    # 5) vertical 3
$env:SDE_ACTUALIZAR_DOCS='1'; npm test -- seguros-del-estado matriz-manifest --grep "@docs"  # 6) trazabilidad
```

Evidencia por corrida: `test-results/seguros-del-estado/sde/<CP>_<unico>.json` (sanitizado), capturas por paso en el reporte HTML (`test-results/seguros-del-estado/html-report`) y casos creados en `test-results/seguros-del-estado/historico-casos.json`. Las capturas, videos y traces crudos pueden contener PII de SISE: quedan locales y no se comparten sin redactar.
