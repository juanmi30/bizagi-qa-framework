# Limitaciones conocidas — proyecto Colsubsidio (CRD)

## Verificación del estado final todavía no reforzada por API

Desde agosto de 2026 ya se dispone de acceso autorizado al **Create Case OData** del ambiente de pruebas de Colsubsidio y T2 deja implementada la creación de casos por servicio.

Sin embargo, esto no significa que la verificación final de negocio ya se haga por API. `ApiHelpers.getCaseState()` continúa pendiente de implementación y no se ha confirmado todavía el contrato específico que se utilizará para consultar/reforzar el estado real de un caso.

Por tanto, los hazards actuales que dependen del Work Portal continúan validando por pantalla. El riesgo de un posible “falso verde” por diferencias entre UI y persistencia permanece para esas verificaciones hasta implementar el refuerzo por API.

### Estado del modo servicio

La creación por API está implementada como pieza independiente mediante:

```text
BizagiApiClient
InicioServicio
HistorialCasos
```

Los Create Case correctos de Gestión de Crédito y Afiliaciones están documentados en:

```text
projects/colsubsidio/resources/create-case/
```

Todavía falta integrar `inicio.modo: servicio` con `scenarioLoader.ts`, `BpmEngine.ts` y el flujo general de `modo: buscar` para continuar automáticamente por UI después de crear el caso.

Ver también:

```text
docs/MODO-SERVICIO.md
FEEDBACK-CRD-DEFINICIONES.md
```

## Escenarios con paso híbrido (OTP) no van al pipeline nocturno

El OTP llega por correo/SMS real (sin workaround): esos escenarios requieren un analista presente y solo corren en local (`--headed`). En CI fallan rápido con mensaje claro (por diseño). El metadato "¿Requiere analista?" del formato de entrada clasifica cada escenario desde el inicio.

## Incidente abierto (2026-10-02): CP04 Empresa no alcanza el punto funcional

"CP04 Empresa actualmente no alcanza el punto funcional previamente demostrado."

- Corridas PASS previas: 2026-09-29 y 2026-09-30 (`test-results/colsubsidio/evidencia-afi/CP04/`).
- Corrida del 2026-10-02 (discovery 4R.2, read-only): tras crear el caso y el reconocimiento natural, el Portal presenta la
  pantalla de datos de empleador persona jurídica (`btn-empleador-pj-continuar`) con `Continuar` deshabilitado: campos
  obligatorios (naturaleza, clase de empleador, CIIU) sin diligenciar. El runner v1 se detiene correctamente
  ("preparación no completada"). Cleanup PASS (caso Depurado).
- Causa no determinada: cambio del Portal/ambiente QA o de los datos de la empresa de prueba. Requiere confirmación con
  QA/Colsubsidio. No es trabajo de 4R.2 ni del proveedor de observación.
