# Guía de la reunión QA — demostración SOLO LECTURA (13 de octubre de 2026)

**Ninguno de estos comandos crea casos.** Se ejecutó la secuencia completa el 13/10 a las 16:15 en PowerShell: el historial pasó de 16 a 16 casos. Las pruebas que tocan QA corren en modo solo lectura: la red bloquea cualquier "Crear" y la automatización se niega a pulsarlo.

Abrir PowerShell en la raíz del repositorio:

```powershell
Set-Location "<ruta-del-repositorio>"
```

## Cómo leer lo que se muestra

| Tipo | Qué es | Ejemplo en la demo |
|---|---|---|
| **Verificación actual** | Se ejecuta ahora contra QA y se ve en pantalla | Pasos 1 a 4 |
| **Resultado histórico** | Evidencia guardada de una corrida anterior; no se repite (crearía un caso) | Paso 5 (casos 429, 425 y 427) |
| **Limitación de observabilidad** | Algo que la herramienta no puede ver: Worker AI, SISE, alertas | P12 y P17 de HU06-CP01; P9 de HU06-CP05 |

## Orden recomendado (~8 minutos con Bizagi respondiendo)

| # | Comando (copiar tal cual) | Qué se ve | Resultado esperado |
|---|---|---|---|
| 1 | `node tools/run.mjs seguros-del-estado --grep "@smoke" --workers=1 --trace off` | Portal disponible y login de los 3 usuarios | `5 passed` |
| 2 | `node tools/run.mjs seguros-del-estado habilitacion.real --workers=1 --trace off` | Qué usuarios pueden iniciar el proceso | `2 passed` (intermediario habilitado y analista de control) y `1 failed` (intermediario_alerta, **esperado**: sigue sin rol) |
| 3 | `$env:SDE_PRECREACION="HU03-CP02"; node tools/run.mjs seguros-del-estado precreacion.real --workers=1 --trace off; Remove-Item Env:SDE_PRECREACION` | **HU03 hasta P6** con el intermediario: Línea, Ramo, Sucursal, Individual y "Número de póliza" | P2–P6 PASS y P7 BLOCKED (falta la póliza). Resumen: `1 passed`, `1 skipped` (la prueba de listas, apagada) |
| 4 | `$env:SDE_CALIBRAR_CASO="429"; node tools/run.mjs seguros-del-estado calibracion --workers=1 --trace off; Remove-Item Env:SDE_CALIBRAR_CASO` | **HU06-CP01 en vivo** sobre el caso 429 (Póliza Nueva Masiva): solo lectura, pestañas y documento | P13–P17, P28 y P29 PASS; P27 FAIL (**BUG-04**, "Observaciónes"). Resumen técnico: `1 passed` |
| 5 | Ver abajo (lectura de evidencias, sin Bizagi) | Resultados históricos de HU06-CP01 (429) y HU06-CP05 (425/427) | Tablas por paso |

**Paso 5: evidencias históricas** (lee los reportes guardados; no se conecta a Bizagi):

```powershell
foreach ($f in @('VARIANTE_HU06-CP01_20261013-115152.json','HU06-CP05_20261013-091148.json','HU06-CP05_20261013-095717.json')) { node -e "const r=require('./projects/seguros-del-estado/docs/evidencia/' + process.argv[1]); console.log('== ' + r.cp + ' | caso ' + r.numero_caso + ' | ' + r.estado + ' | ' + r.inicio.slice(0,16) + ' UTC'); r.matriz.forEach(function(m){ console.log('  P' + m.n + ' ' + m.estado) })" $f }
```

Qué decir al mostrarlo:
- **429 (variante HU06-CP01, secuencia del producto):** P2–P11 y P13–P16 PASS, incluida la creación con el documento real. **P28 aparece FAIL por un error de asignación del escenario, ya corregido**; el paso 4 muestra P28 en PASS. Esta variante **no cuenta** como aprobación de CP01.
- **425 y 427 (HU06-CP05):** REAL_PASS_PARCIAL: 6 de 8 pasos PASS (P2–P5, P7, P8; P1 es el objetivo); P6 mixto (etiquetas verificadas, ortografía global no automatizada) y P9 integración no verificable. Ambos casos están **cerrados** hoy, así que no se pueden mostrar en vivo.

## Qué NO ejecutar en la reunión

| Comando | Por qué |
|---|---|
| `verticales`, `--grep "@e2e"` o `--grep "@HU06-CP05"` sin `precreacion.real` | Corren verticales reales: **crean casos** |
| `variantes.real` con `SDE_VARIANTES=1` | Crea un caso |
| `calibracion` con `SDE_CALIBRAR_CASO="nuevo"` | Crea un caso |
| Variables `SDE_CALIBRAR_POPUP`, `SDE_CALIBRAR_EDICION`, `SDE_DIAG_CREAR` | Destruyen o crean casos (BUG-03) |
| `npm test -- …` desde PowerShell | El `--grep` no funciona; podría ejecutar todo |
| Abrir el reporte HTML | Las capturas muestran el nombre del usuario QA |

## Plan alternativo si Bizagi no responde

1. Si el paso 1 falla con "ENTORNO" o "no resolvió": el ambiente QA no está disponible. Se reporta así y no se reintenta más de una vez.
2. Mostrar **sin conexión**:
   - El paso 5 (evidencias históricas).
   - Las pruebas de la herramienta: `node tools/run.mjs seguros-del-estado --grep "@unit" --workers=1` → `97 passed` (~2,5 min). Validan reglas y seguridad, **no** son casos funcionales.
   - Los documentos: `docs/RESUMEN-EJECUTIVO-REUNION-2026-10-13.md`, `docs/TRAZABILIDAD-17-CP.md` (cobertura 13/2/0) y `docs/CONTROL-CAMBIOS-DOCUMENTOS-HU06.md`.
3. El caso 429 puede cerrarse solo con el tiempo. Si el paso 4 dice "no está en Estructurar información", usar el **431** (misma prueba, `SDE_CALIBRAR_CASO="431"`) o pasar al paso 5.
