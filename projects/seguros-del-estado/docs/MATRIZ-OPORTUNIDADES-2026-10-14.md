# Matriz de oportunidades de automatización — SDE-CEL (2026-10-14)

Diagnóstico de los 17 CP tras la reunión QA del 14/10 (Karen, Daniel, Juan Miguel). Los números se calcularon con el propio motor (`coberturaPaso`, `maximoAlcanzable`, `leerReportes`) sobre el repositorio de la rama `feat/sde-validaciones-funcionales`; las observaciones reales vienen de las corridas de este día (`docs/evidencia/2026-10-14_validaciones-presentacion.txt`).

**Verificado contra el repositorio:** 17 CP en `fuentes/matriz.json` · 13 escenarios declarativos válidos (HU03-CP09 a CP12 sin escenario) · 2 CP con ejecución real (HU06-CP01, HU06-CP05) · **0 aprobados**.

## Cómo leer esta matriz

| Término | Significado | ¿Cuenta como aprobación? |
|---|---|---|
| Implementado | El escenario cubre el paso con una capability UI (o mixta: UI + parte pendiente/declarada) | No |
| Verificado como CP | Paso PASS en el último reporte **ejecutado** del CP (sesión real) | Solo si todo el CP es REAL_PASS |
| Observado hoy (solo lectura / calibración) | Paso PASS en una precreación sin crear casos o en la calibración del caso 571. **No es ejecución del CP** | No |
| Integración | SISE, alertas, Worker AI: sin traza, siempre INTEGRATION_NOT_VERIFIED | No |
| Bloqueado por dato | El paso necesita un dato de QA que no existe en el `.env` | No |

Una prueba unitaria aprobada nunca es evidencia funcional.

## Matriz por CP

| CP | Pasos (sin Objetivo) | Implementados UI / mixtos | Verificado como CP (último reporte) | Observado hoy (no cuenta) | Integración | No automatizado / sin cubrir | Bloqueado por dato | Máximo alcanzable |
|---|---|---|---|---|---|---|---|---|
| HU06-CP01 | 28 | 24 / 4 (P4, P12, P17, P28) | P2–P8 (13/10, FAIL en P9) | Inicio P2–P3, P5–P9 (precreación); Estructurar P13–P17, P27–P29 (caso 571, Masiva Modificación) | P12, P17 (Worker AI, en pasos mixtos) | — | P18–P26 (NIT de prueba; además UI-10/BUG-03) | REAL_PASS_PARCIAL |
| HU06-CP02 | 21 | 19 / 2 | — | — | P9, P12 (mixtos) | — | P3–P5, P7, P11, P17, P19, P21 | REAL_PASS_PARCIAL |
| HU06-CP03 | 24 | 23 / 1 | — | — | P9 (mixto) | — | P3–P5, P7, P11, P17, P18, P21, P23 | REAL_PASS_PARCIAL |
| HU06-CP04 | 22 | 20 / 1 | — | — | P9 (mixto) | P15 (FUNC-05) | P3–P5, P7, P19, P21, P22 | REAL_PASS_PARCIAL |
| HU06-CP05 | 8 | 6 / 2 (P6, P9) | P2 (14/10 14:51, FAIL en P3 por cambio de formato del Ramo) · antes REAL_PASS_PARCIAL (caso 434) | P2–P5, P7 (precreación); P6 con presentación evaluada | P9 (mixto) | — | — | REAL_PASS_PARCIAL |
| HU03-CP01 | 21 | 13 / 5 | — | P2–P5; P6 presentación evaluada | P10–P12 | — | P4, P5, P7, P13 (placa con varias pólizas) | REAL_PASS_PARCIAL |
| HU03-CP02 | 20 | 13 / 5 | — | P2–P5; P6 presentación evaluada | P10, P12 (+P11 mixto) | — | P4, P5, P7, P11, P13, P14 (póliza Autos) | REAL_PASS_PARCIAL |
| HU03-CP03 | 20 | 12 / 5 | — | P2–P5; P6 presentación evaluada | P10–P12 | — | P4, P5, P7, P13, P14 (póliza Generales) | REAL_PASS_PARCIAL |
| HU03-CP04 | 19 | 10 / 5 | — | P2–P5; P6 presentación evaluada | P10–P12 | P15 (docs PN) | P4–P7, P13 (tomador existente) | REAL_PASS_PARCIAL |
| HU03-CP05 | 20 | 10 / 6 | — | P2–P5; P6 presentación evaluada | P10–P12 | P16 (docs PN) | P4–P7, P13 (tomador inexistente) | REAL_PASS_PARCIAL |
| HU03-CP06 | 20 | 12 / 5 | — | P2–P3 | P10–P12 | — | P4–P7, P13, P14 (ramo Cumplimiento con RCE) | REAL_PASS_PARCIAL |
| HU03-CP07 | 20 | 12 / 5 | — | P2–P3 | P10–P12 | — | P4–P7, P13, P14 (ramo sin RCE) | REAL_PASS_PARCIAL |
| HU03-CP08 | 20 | 12 / 5 | — | P2–P3 | P10–P12 | — | P4–P7, P13, P14 (ramo sin RCE) | REAL_PASS_PARCIAL |
| HU03-CP09 | 13 | 0 | — | — | — | 13 sin cubrir | intermediario con alerta | SIN_ESCENARIO |
| HU03-CP10 | 16 | 0 | — | — | — | 16 sin cubrir | póliza de otro intermediario + carta | SIN_ESCENARIO |
| HU03-CP11 | 20 | 0 | — | — | — | 20 sin cubrir | póliza inexistente en SISE | SIN_ESCENARIO |
| HU03-CP12 | 33 | 0 | — | — | — | 33 sin cubrir | Cumplimiento + RCE sin información | SIN_ESCENARIO |

## Actividades accesibles hoy (verificado el 2026-10-14)

| Actividad | Actor | Estado hoy | Qué se puede automatizar ya |
|---|---|---|---|
| Formulario de inicio (Individual y Masiva) | analista e intermediario (INT-013403) | **Accesible** (con Ramo/Sucursal en el formato nuevo "<código> - <nombre>", P-14) | Presentación (ortografía, etiquetas aprobadas), reglas de visibilidad por Tipo de Radicación/Forma de Consulta, obligatoriedad del criterio. Todo sin crear casos (precreación) |
| Compuerta ¿Masivo? → Estructurar información | analista | **Accesible**: el caso 571 llegó en minutos | Lectura completa de Estructurar (P13–P17, P27–P29) y su presentación. El pop-up de filas sigue vetado (BUG-03/UI-10) |
| Compuerta ¿Masivo? (Individual) → Consultar alertas → Completar información | intermediario | **No accesible**: SISE y alertas sin servicio (Daniel), UI-09 nunca observado | Nada nuevo; el bloque `presentacion-completar` queda listo |
| Worker AI | — | La grilla del caso 571 tuvo 1 fila; sin traza del servicio | Solo resultado visible (INT-02) |
| Excepciones HU03 (CP09–CP12) | intermediario / intermediario_alerta | No accesibles (datos y SISE) | Sin escenario; no se crean sin datos READY |

## Validaciones de campos incorporadas y posibles

| Pantalla | Incorporadas en esta fase (con fuente) | Pendientes de definición (no se deducen del portal) |
|---|---|---|
| Inicio | Ortografía por norma RAE/DLE (`INI-ORTOGRAFIA`); Línea, Ramo, Sucursal (`HU06-CP01 P4`); Descripción de la Solicitud (Masiva/Múltiple) y Documentos Anexos (`HU06-CP01 P6`); texto de ayuda de Masivo (`P7`) | Orden de campos (P-11), obligatoriedad completa (P-11), capitalización/glosario (P-11), etiqueta "Tipo de Solicitud/Movimiento" (FUNC-01) |
| Estructurar información | Ortografía (`EST-ORTOGRAFIA`: detecta OBS-04); etiqueta "Observaciones" (`P27`); solo lectura de datos maestros (P14, P15, P29) | Nomenclatura del encabezado ("Tipo de Movimiento" vs "Tipo de Solicitud", "Tipo de Radicación" vs "Tipo Radicación") |
| Completar información | Ortografía (`COM-ORTOGRAFIA`), lista para ejecutar | Glosario completo (UI-09 sin observar) |
| Pop-up de filas (Estructurar) | — | Obligatorios del pop-up (P20) quedan bajo la barrera BUG-03/UI-10 |

Propuesta para aprobar orden y obligatoriedad: `docs/evidencia/2026-10-14_inventario-presentacion.json` (inventario observado de 11 pantallas: etiqueta, grupo, orden de lectura, marca de obligatorio con el campo vacío, solo lectura).

## Riesgos de ejecución

1. **Parametrización cambiante en QA:** Ramo y Sucursal cambiaron de formato entre el 13 y el 14/10 (P-14). La selección es exacta por diseño: un cambio así hace fallar la vertical (no atribuible al producto) hasta ajustar el `.env`.
2. **BUG-03:** abrir el pop-up de filas sin poder cerrarlo con "Guardar" destruye el caso. Se mantiene vetado.
3. **Casos que crean registros reales:** solo con `SDE_E2E=1` (P-06) o la calibración autorizada caso por caso.
4. **Ventana de ~2 h** de los casos propios en Estructurar: la lectura debe hacerse dentro de ella.
5. **Campos duplicados (OBS-12):** "Ramo" y "Sucursal" visibles dos veces en el inicio Individual; si una regla de negocio los usa, una referencia sin grupo puede volverse ambigua (la automatización falla en vez de elegir uno).

## Dependencias de QA

| Quién | Qué |
|---|---|
| Daniel / Karen | Fuente de orden, obligatoriedad y capitalización (P-11); confirmar BUG-04 corregido, OBS-01/OBS-03 no reproducidos, OBS-12 y el formato nuevo de Ramo/Sucursal (P-14) |
| Daniel / Iván | Lógica de combinaciones masivas (P-12); caminos alternos para integraciones caídas (P-13); FUNC-01 |
| QA datos | Pólizas Autos y Generales del intermediario, placa con varias pólizas, tomadores existente e inexistente, ramos de Cumplimiento con y sin RCE, NIT de prueba |
| Juan Miguel | Decidir qué hacer con los casos 434 y 571 (P-07; 571 quedó en Estructurar información) |
