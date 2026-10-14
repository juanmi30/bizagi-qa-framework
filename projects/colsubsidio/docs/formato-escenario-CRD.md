# Formato de entrada de escenario — Colsubsidio · Gestión de Crédito (CRD)
> Versión texto del documento del equipo (`CLS_CRD_Formato_de_entrada_de_escenario.docx`; el PDF original se conserva solo en local),
> extraída para consulta rápida. Entregado: 2026-07-17.

## 1. Identificación
- **Cliente / Proyecto:** Colsubsidio – Crédito
- **Proceso Bizagi:** Gestión de crédito
- **URL QA:** https://test-procesosdigitales-colsubsidio.bizagi.com/
- **Usuario de prueba:** cuenta de QA configurada en el `.env` local (`BIZAGI_USER`)
- **Quién llena / fecha:** Analista/Promotor

## 2. Objetivo
Validar el flujo completo de gestión de crédito, de punta a punta: desde la creación del caso hasta la
aprobación final del producto, verificando que el caso avance por todas las integraciones
(**OTP, SAP/ASCARD, motor de decisiones, validación biométrica y activación de producto**) y quede
registrado con estado **"Aprobado" en base de datos**.

## 3. Tipo de escenario
Camino feliz (CRD01) · Caminos alternos: Validación SAP (CRD02), Rechazo biometría (CRD03).

## 4. Precondiciones
- Usuario de prueba con rol habilitado para iniciar "Gestión de crédito".
- Número de identificación **válido y aprobable** en SAP/ASCARD y en el motor de decisiones (cliente con cupo).
- Acceso al **correo y celular de prueba** para recibir el código OTP.

## 5. Datos de prueba (según el equipo)
| Campo | Valor |
|---|---|
| Tipo de Identificación | Cédula de Ciudadanía |
| Número de Identificación | 1015418260 |
| Número de celular / Confirmar | número concreto (mismo valor) |
| Correo electrónico / Confirmar | correo concreto (mismo valor) |
| Código OTP | **el recibido en el momento de la prueba** |
| Número de Celular Secundario | número concreto |
| Estado Civil | Soltero(a) |
| Salario Mensual | ej. $2.500.000 (grabación: 4.300.000) |
| ¿Tienes fuentes adicionales? | No |
| ¿Deseas Ajustar el Cupo Aprobado? | No |
| Modalidad de pago | Pagar una cuota fija mensual |
| ¿Cuándo Deseas Pagar la Cuota? | Primera quincena |
| ¿Maneja Recursos Públicos? / ¿Ejerce Poder Político? / ¿Tiene Reconocimiento Público? | Sí / Sí / Sí |
| Resultado validación biométrica | **2 = Aprobar** (18 = rechazo, ver CRD03) |
| Documento firmado | archivo PDF de prueba |
| Autorización de Retención (envío / firmado) | Sí / Sí |

## 6. Pasos (lenguaje de negocio)
1. Ingresar al Work Portal (URL QA).
2. "Nuevo caso" → proceso **Gestión de Crédito**.
3. Responder "No" a "¿Deseas modificar la agencia…?".
4. Diligenciar Tipo y Número de Identificación → botón **"Crear"** → avanza a **"Registrar información inicial"**.
5. Celular + confirmación; correo + confirmación → **"Siguiente"** → avanza a **"Capturar el OTP"**.
6. Recibir el OTP (correo/SMS) e ingresarlo → **"Siguiente"** → corre la integración **SAP/ASCARD**.
7. Avanza a **"Registrar información adicional"**: celular secundario, información personal, Estado Civil, Salario Mensual; "¿Fuentes adicionales?" = No → **"Siguiente"** → corre el **motor de decisiones** (cupo).
8. Avanza a **"Realizar configuración oferta"**: no ajustar cupo; "cuota fija mensual"; "Primera quincena"; las 3 preguntas de ley = Sí → **"Siguiente"** → corre la **validación biométrica**.
9. En **"Recibir result de valida bio desde valid"**: valor **2** (aprobar) → sigue.
10. Avanza a **"Recibir PDF firmado desde validador"**: **cargar el archivo PDF** de prueba; autorizaciones de retención = Sí y Sí.
11. Avanza al **subproceso de activación de producto** (integraciones automáticas).
12. El caso **finaliza "Aprobado"** y queda registrado en base de datos.

## 7. Resultado esperado (→ hazards)
El caso recorre todas las actividades sin errores; OTP y biometría válidos; el motor de decisiones
determina cupo; el caso finaliza con estado **"Aprobado"** y queda **persistido en BD** con ese estado.

## 8. Apoyo visual
Video de referencia (proceso similar, "Novedades de Cupo"):
https://drive.google.com/drive/folders/1DKh8yOPsb0LyrogZxr0z006U3N6pB5fV

## 9. Notas del equipo
- Las **integraciones tienen tiempos de espera** con una pantalla de "integración en ejecución".

## Grabaciones asociadas (en `grabados/_crudo/`)
- `CRD01-caso-completo-exitoso.spec.ts` — flujo completo hasta activación.
- `CRD02-validacion-sap.spec.ts` — tramo de validación SAP (correo/celular + OTP).
- `CRD03-rechazo-biometria.spec.ts` — camino alterno: biometría = 18 (rechazo).
