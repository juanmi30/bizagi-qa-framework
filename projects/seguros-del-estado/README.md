# Seguros del Estado — Centro de Expedición (SDE-CEL)

Automatización E2E de las matrices HU06 (5 CP) y HU03 (12 CP) sobre `https://test-aiprocesos-sde.bizagi.com/`.
Reunión 2026-10-13: [resumen ejecutivo](docs/RESUMEN-EJECUTIVO-REUNION-2026-10-13.md) · [guía de demostración](docs/DEMO-QA-2026-10-13.md) ·
[control de cambios de documentos](docs/CONTROL-CAMBIOS-DOCUMENTOS-HU06.md).
Estado vigente (2026-10-13): [docs/RECUPERACION-ESTADO-ACTUAL.md](docs/RECUPERACION-ESTADO-ACTUAL.md). Implementados 13/17 CP, ejecutados 2/17, aprobados 0/17
(HU06-CP05 en REAL_PASS_PARCIAL, caso 425; HU06-CP01 en FAIL por BUG-01; el resto BLOCKED por ENV-03 y por datos de QA) ·
Trazabilidad: [docs/TRAZABILIDAD-17-CP.md](docs/TRAZABILIDAD-17-CP.md).

Calibración de solo lectura de "Estructurar información" sobre un caso propio:
`$env:SDE_CALIBRAR_CASO='<n>'; npm test -- seguros-del-estado calibracion --workers=1 --trace off`

## Estructura

```
fuentes/           Excel QA (fuente de verdad) + matriz.json (extracción literal, verificada por prueba)
data/datasets.yaml Registro lógico de datos (sin valores; los valores van en .env)
manifest/          17 CP: familia, fase, datos, escenario, estado, brechas
escenarios/        Escenarios declarativos (prefijo numérico = orden de ejecución) + _bloques/ reutilizables por familia
sde/               Motor SDE: validador, ejecutor, capabilities, datos, trazabilidad
baseObjects/       sde.objects.ts — ÚNICO archivo de selectores (calibración)
tests/             smoke ambiente · login por rol · verticales · exploración · unit/
docs/              Entregables de fase + evidencia sanitizada
```

## Uso

En Windows/PowerShell usar `node tools/run.mjs seguros-del-estado …` con el `--grep` entre comillas y sin espacios (ver la guía de demostración §0); `npm test -- … --grep` no selecciona pruebas desde PowerShell.

```powershell
Copy-Item .env.example .env      # en esta carpeta; completar con datos de QA (no compartir)
npm test -- seguros-del-estado --list
npm test -- seguros-del-estado --grep "@unit"                 # sin red
npm test -- seguros-del-estado --grep "@smoke" --workers=1    # ambiente + login real
$env:SDE_E2E="1"; node tools/run.mjs seguros-del-estado --grep "@e2e" --workers=1 --trace off   # verticales: crean casos reales; sin SDE_E2E=1 quedan BLOCKED (P-06)
$env:SDE_PRECREACION="HU03-CP02,HU06-CP05"; node tools/run.mjs seguros-del-estado precreacion.real --grep "@precreacion" --workers=1 --trace off   # solo lectura + inventario de presentación
$env:SDE_VERIFICAR_BLOQUEOS="1"; npm test -- seguros-del-estado bloqueos --workers=1   # ENV-03 / BUG-01 / BUG-02 en solo lectura
$env:SDE_EXPORTAR="1"; npm test -- seguros-del-estado exportar.tool --workers=1        # paquete sanitizado para compartir
$env:SDE_ACTUALIZAR_DOCS="1"; npm test -- seguros-del-estado matriz-manifest --grep @docs  # regenera la trazabilidad
```

Para compartir el repositorio usar SOLO el paquete de `exportar.tool`: excluye `.env`, reportes, capturas, traces y logs,
y escanea todo (también el interior de los .xlsx) contra los valores reales del `.env`.

## Validaciones de presentación (reunión QA 2026-10-14)

Ortografía, orden y obligatoriedad de campos se declaran en `data/expectativas-presentacion.yaml`: cada expectativa aprobada cita su fuente (paso de la matriz o norma RAE/DLE); lo que ninguna fuente define queda `pendiente_definicion` y el paso no puede quedar verde. Los escenarios las usan con `{ expectativa: <ID> }` (bloques `presentacion-inicio`, `presentacion-estructurar`, `presentacion-completar`). Un paso `verificar` con `no_bloqueante: true` deja el CP en FAIL ante un defecto de presentación, pero el recorrido continúa.

## Reglas

- Sin credenciales o datos → BLOCKED (SKIPPED con anotación), nunca verde. Un bloqueo de ambiente a mitad de corrida (DNS, ENV-03) → BLOCKED, no FAIL.
- Toda spec que inicia sesión declara `trace: 'off'` (lo exige una prueba @unit): un trace registraría la clave tecleada.
- Pop-up de "Detalle Polizas Asociadas": salir sin "Guardar" deja el caso inutilizable (BUG-03). Nunca Cancelar ni abandonarlo.
- `REAL_PASS` exige sesión real, número de caso real y todos los pasos de la matriz verificados. Si hay integración no verificada o pasos no automatizados → `REAL_PASS_PARCIAL`.
- SISE, Worker AI y las compuertas no se interceptan ni se simulan: `INTEGRATION_NOT_VERIFIED` salvo evidencia directa.
- No se reutilizan datos, usuarios ni selectores de otros clientes.
