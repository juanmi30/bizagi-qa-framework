### 1. Control de Identidad de Casos (Case Identity Lock)

A continuación se presenta la tabla de control construida a partir de la hoja de cálculo autoritativa `20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx` (pestañas `CP01` a `CP05`):

| CP | Perfil / Tipo de Aportante | Condición SAP Principal | Resultado Funcional Principal |
| --- | --- | --- | --- |
| **CP01** | `pensionado`<br> | El solicitante **no existe** en la base de datos ni servicio web de SAP.

 | Permite continuar la solicitud por la ruta "Continua" sin generar bloqueo y avanza a fase de reconocimiento facial.

 |
| **CP02** | `independiente`<br> | El solicitante **existe exclusivamente como beneficiario o cónyuge** (persona a cargo activa) en SAP y no como cotizante titular.

 | Permite continuar la solicitud por la ruta "Continua" sin generar bloqueo y avanza a fase de reconocimiento facial (ejecutando el saneamiento automático a `null` de las variables de respuesta de SAP).

 |
| **CP03** | `facultativo`<br> | El solicitante figura como **afiliado cotizante titular activo** en Colsubsidio dentro de SAP.

 | Detiene la radicación, toma la ruta "No continua SAP" y despliega la pantalla de bloqueo por afiliación activa.

 |
| **CP04** | `pensionado`<br> | El solicitante figura en SAP como afiliado cotizante titular, pero su estado es **inactivo o cuenta con motivo de retiro** (no activo).

 | Permite continuar la solicitud por la ruta "Continua" sin generar bloqueo y avanza a fase de reconocimiento facial.

 |
| **CP05** | `pensionado`<br> | El solicitante figura en SAP **simultáneamente como afiliado titular activo y como beneficiario o cónyuge**.

 | Detiene la radicación por presencia de cotizante activo, toma la ruta "No continua SAP" y despliega la pantalla de bloqueo.

 |

---

### 2. Análisis Humano Corregido por Caso de Prueba

#### CP01 — Pensionado que NO existe en SAP

* **A. Condiciones representables:**
* Formulario inicial de solicitud para el perfil `pensionado` (etapas de preparación `inicio-solicitud` y `telefonos` en el Portal).




* **B. Preguntas funcionales:**
* Ninguna.




* **C. KNOWLEDGE_GAP:**
* **Paso 3:** `notificacion-inicio-tramite-correo` (tipo `notificacion`): Emisión de notificación por correo electrónico con el número de caso generado.


* **Paso 4:** `actividad-ejecutar-sap` (tipo `actividad`): Subproceso/actividad automática BPM que ejecuta la consulta en SAP.


* **Pasos 4, 5 y 8:** `integracion-servicio-sap` (tipo `integracion`): Servicio web de validación de afiliación de SAP y sus trazas.


* **Paso 6:** `ruta-continua` (tipo `ruta`): Transición de proceso "Continua" activada al no registrarse bloqueo.


* **Paso 7:** `solicitud-fase-reconocimiento-facial` (`classificationRequest`): Fase de reconocimiento facial alcanzada (requiere definir si se clasifica como `pantalla-ui` o `actividad`).




* **D. TESTABILITY_GAP:**
* Ninguno (las condiciones quedan bloqueadas en la primera capa KNOWLEDGE_GAP).




* **E. CAPABILITY_GAP:**
* Ninguno.




* **F. Requisitos de datos de prueba:**
* **Perfil:** `pensionado`.


* **Clase de actor requerida:** Persona natural pensionada que no exista en la base de datos de SAP (no registrada como cotizante ni como beneficiario/cónyuge).


* **Campos requeridos a provisionar:** `numeroIdentificacion`, `correo`, `numeroCelular`, `numeroTelefonoFijo`.





---

#### CP02 — Independiente que figura exclusivamente como Beneficiario / Cónyuge en SAP

* **A. Condiciones representables:**
* Formulario inicial para perfil `independiente` (`inicio-solicitud`, `telefonos`, `informacion-adicional`).




* **B. Preguntas funcionales:**
* Ninguna.




* **C. KNOWLEDGE_GAP:**
* **Paso 3:** `notificacion-inicio-tramite-correo` (tipo `notificacion`).


* **Paso 4:** `actividad-ejecutar-sap` (tipo `actividad`).


* **Pasos 4, 5 y 8:** `integracion-servicio-sap` (tipo `integracion`).


* **Paso 6:**
* `ruta-continua` (tipo `ruta`): Transición "Continua" al no existir coincidencia de cotizante titular.


* `variable-sbp` (tipo `variable`): Variable `sBP` saneada a `null` al detectar tercero.


* `variable-sestadoafiliado` (tipo `variable`): Variable `sEstadoAfiliado` saneada a `null`.


* `variable-smotivoretiro` (tipo `variable`): Variable `sMotivoRetiro` saneada a `null`.


* `variable-sgrupo` (tipo `variable`): Variable `sGrupo` saneada a `null`.




* **Paso 7:** `solicitud-fase-reconocimiento-facial` (`classificationRequest`).




* **D. TESTABILITY_GAP:**
* Ninguno.




* **E. CAPABILITY_GAP:**
* Ninguno.




* **F. Requisitos de datos de prueba:**
* **Perfil:** `independiente`.


* **Clase de actor requerida:** Persona natural independiente registrada en SAP exclusivamente dentro del grupo de personas a cargo (beneficiario o cónyuge activo), sin figurar como cotizante titular.


* **Campos requeridos a provisionar:** `numeroIdentificacion`, `correo`, `numeroCelular`, `numeroTelefonoFijo`, `actividad`, `ingresoMensual`.





---

#### CP03 — Facultativo que figura como Afiliado Cotizante Titular Activo en SAP

* **A. Condiciones representables:**
* Formulario inicial para perfil `facultativo` (`inicio-solicitud`, `telefonos`, `informacion-adicional`).




* **B. Preguntas funcionales:**
* Ninguna.




* **C. KNOWLEDGE_GAP:**
* **Paso 3:** `notificacion-inicio-tramite-correo` (tipo `notificacion`).


* **Paso 4:** `actividad-ejecutar-sap` (tipo `actividad`).


* **Pasos 4, 5 y 8:** `integracion-servicio-sap` (tipo `integracion`).


* **Pasos 6 y 7:** `ruta-no-continua-sap` (tipo `ruta`): Transición tomada al detectar cotizante titular activo.


* **Paso 7:** `pantalla-bloqueo-afiliacion-activa` (tipo `pantalla-ui`): Pantalla de bloqueo desplegada por estar afiliado activo.




* **D. TESTABILITY_GAP:**
* Ninguno.




* **E. CAPABILITY_GAP:**
* Ninguno.




* **F. Requisitos de datos de prueba:**
* **Perfil:** `facultativo`.


* **Clase de actor requerida:** Persona natural facultativa registrada en SAP como cotizante titular con estado activo en la CCF.


* **Campos requeridos a provisionar:** `numeroIdentificacion`, `correo`, `numeroCelular`, `numeroTelefonoFijo`, `salarioBasico`.





---

#### CP04 — Pensionado que figura como Afiliado Cotizante Titular Inactivo en SAP

* **A. Condiciones representables:**
* Formulario inicial para perfil `pensionado` (`inicio-solicitud`, `telefonos`).




* **B. Preguntas funcionales:**
* Ninguna.




* **C. KNOWLEDGE_GAP:**
* **Paso 3:** `notificacion-inicio-tramite-correo` (tipo `notificacion`).


* **Paso 4:** `actividad-ejecutar-sap` (tipo `actividad`).


* **Pasos 4, 5 y 8:** `integracion-servicio-sap` (tipo `integracion`).


* **Paso 6:** `ruta-continua` (tipo `ruta`): Transición "Continua" tomada al figurar como inactivo o con motivo de retiro.


* **Paso 7:** `solicitud-fase-reconocimiento-facial` (`classificationRequest`).




* **D. TESTABILITY_GAP:**
* Ninguno.




* **E. CAPABILITY_GAP:**
* Ninguno.




* **F. Requisitos de datos de prueba:**
* **Perfil:** `pensionado`.


* **Clase de actor requerida:** Persona natural pensionada registrada en SAP como cotizante titular pero en estado inactivo o con motivo de retiro.


* **Campos requeridos a provisionar:** `numeroIdentificacion`, `correo`, `numeroCelular`, `numeroTelefonoFijo`.





---

#### CP05 — Pensionado que figura como Afiliado Titular Activo y simultáneamente como Beneficiario/Cónyuge

* **A. Condiciones representables:**
* Formulario inicial para perfil `pensionado` (`inicio-solicitud`, `telefonos`).




* **B. Preguntas funcionales:**
* Ninguna.




* **C. KNOWLEDGE_GAP:**
* **Paso 3:** `notificacion-inicio-tramite-correo` (tipo `notificacion`).


* **Paso 4:** `actividad-ejecutar-sap` (tipo `actividad`).


* **Pasos 4, 5 y 8:** `integracion-servicio-sap` (tipo `integracion`).


* **Pasos 6 y 7:** `ruta-no-continua-sap` (tipo `ruta`): Transición tomada al prevalecer la coincidencia de cotizante titular activo.


* **Paso 7:** `pantalla-bloqueo-afiliacion-activa` (tipo `pantalla-ui`): Pantalla de bloqueo desplegada.




* **D. TESTABILITY_GAP:**
* Ninguno.




* **E. CAPABILITY_GAP:**
* Ninguno.




* **F. Requisitos de datos de prueba:**
* **Perfil:** `pensionado`.


* **Clase de actor requerida:** Persona natural pensionada registrada en SAP tanto en calidad de cotizante titular activo como en calidad de beneficiario/cónyuge.


* **Campos requeridos a provisionar:** `numeroIdentificacion`, `correo`, `numeroCelular`, `numeroTelefonoFijo`.





---

```json
{
  "schemaVersion": "afi-agent-intake/v1",
  "knowledgeProposals": [
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "notificacion-inicio-tramite-correo",
      "entidad": {
        "tipo": "notificacion",
        "id": "notificacion-inicio-tramite-correo",
        "descripcion": "Notificación por correo electrónico enviada al solicitante con el número de caso al iniciar el trámite de afiliación."
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP01",
            "paso": 3,
            "condicion": "Notificación por correo con número de caso generado"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": 3,
            "condicion": "Notificación por correo con número de caso generado"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": 3,
            "condicion": "Notificación por correo con número de caso generado"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": 3,
            "condicion": "Notificación por correo con número de caso generado"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": 3,
            "condicion": "Notificación por correo con número de caso generado"
          }
        ]
      },
      "evidenciaSemantica": "Paso 3 de los casos CP01 a CP05 en Excel indica: 'Se debe iniciar el proceso con un número de caso enviado al correo electronico'.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "integracion-servicio-sap",
      "entidad": {
        "tipo": "integracion",
        "id": "integracion-servicio-sap",
        "descripcion": "Servicio web de validación de SAP encargado de consultar y retornar el estado de afiliación del solicitante en la CCF."
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP01",
            "paso": 4,
            "condicion": "Instanciación de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP01",
            "paso": 5,
            "condicion": "Ejecución técnica de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP01",
            "paso": 8,
            "condicion": "Consulta de respuesta obtenida de SAP en trazas"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": 4,
            "condicion": "Instanciación de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": 5,
            "condicion": "Ejecución técnica de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": 8,
            "condicion": "Consulta de respuesta obtenida de SAP en trazas"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": 4,
            "condicion": "Instanciación de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": 5,
            "condicion": "Ejecución técnica de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": 8,
            "condicion": "Consulta de respuesta obtenida de SAP en trazas"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": 4,
            "condicion": "Instanciación de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": 5,
            "condicion": "Ejecución técnica de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": 8,
            "condicion": "Consulta de respuesta obtenida de SAP en trazas"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": 4,
            "condicion": "Instanciación de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": 5,
            "condicion": "Ejecución técnica de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": 8,
            "condicion": "Consulta de respuesta obtenida de SAP en trazas"
          }
        ]
      },
      "evidenciaSemantica": "Pasos 4, 5 y 8 de CP01-CP05 y HU_14.8_220071.md especifican la invocación, ejecución y lectura de trazas de la integración de SAP.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "actividad-ejecutar-sap",
      "entidad": {
        "tipo": "actividad",
        "id": "actividad-ejecutar-sap",
        "descripcion": "Actividad automática o subproceso de ejecución de validación SAP dentro del proceso BPM de Afiliaciones."
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP01",
            "paso": 4,
            "condicion": "Instanciación del subproceso automático de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": 4,
            "condicion": "Instanciación del subproceso automático de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": 4,
            "condicion": "Instanciación del subproceso automático de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": 4,
            "condicion": "Instanciación del subproceso automático de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": 4,
            "condicion": "Instanciación del subproceso automático de SAP"
          }
        ]
      },
      "evidenciaSemantica": "Paso 4 de los casos CP01 a CP05 en Excel establece: 'El caso instanciara el subproceso de SAP correctamente'.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "ruta-continua",
      "entidad": {
        "tipo": "ruta",
        "id": "ruta-continua",
        "descripcion": "Ruta/transición de proceso 'Continua' tomada cuando la evaluación de la respuesta de SAP permite avanzar sin bloqueo."
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP01",
            "paso": 6,
            "condicion": "Ruta Continua tomada al no existir bloqueo por persona no registrada"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": 6,
            "condicion": "Ruta Continua tomada al no existir bloqueo por ser beneficiario/cónyuge"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": 6,
            "condicion": "Ruta Continua tomada al no existir bloqueo por afiliado inactivo"
          }
        ]
      },
      "evidenciaSemantica": "Paso 6 de CP01, CP02 y CP04 indica explícitamente en el resultado esperado: 'El caso continuar por el camino de Continua'.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "ruta-no-continua-sap",
      "entidad": {
        "tipo": "ruta",
        "id": "ruta-no-continua-sap",
        "descripcion": "Ruta/transición de proceso 'No continua SAP' tomada cuando la respuesta de SAP identifica cotizante activo y detiene la solicitud."
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": 6,
            "condicion": "Ruta No continua SAP tomada por afiliación activa de Facultativo"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": 7,
            "condicion": "Instanciación de camino No continua SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": 6,
            "condicion": "Ruta No continua SAP tomada por afiliación activa de Pensionado"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": 7,
            "condicion": "Instanciación de camino No continua SAP"
          }
        ]
      },
      "evidenciaSemantica": "Pasos 6 y 7 de CP03 y CP05 en Excel indican: 'el caso tomara el camino de No continua SAP'.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "pantalla-bloqueo-afiliacion-activa",
      "entidad": {
        "tipo": "pantalla-ui",
        "id": "pantalla-bloqueo-afiliacion-activa",
        "descripcion": "Pantalla UI de bloqueo mostrada al usuario cuando la consulta en SAP determina que el solicitante figura como afiliado activo."
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": 7,
            "condicion": "Visualización de pantalla de bloqueo parametrizada por afiliación activa"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": 7,
            "condicion": "Visualización de pantalla de bloqueo parametrizada por afiliación activa"
          }
        ]
      },
      "evidenciaSemantica": "Paso 7 de CP03 y CP05 en Excel especifica: 'el caso mostrara la pantalla de bloqueo parametrizada por afiliacion activa en el sistema'.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "variable-sbp",
      "entidad": {
        "tipo": "variable",
        "id": "variable-sbp",
        "descripcion": "Variable de respuesta de SAP (Código de socio de negocio BP) objeto de saneamiento (asignación null) en escenario beneficiario/cónyuge.",
        "superficies": [
          "integracion",
          "proceso-bpm"
        ],
        "ambito": {
          "tipo": "integracion",
          "integracion": "integracion-servicio-sap"
        }
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": 6,
            "condicion": "Saneamiento automático a null de variable sBP al detectar tercero beneficiario/cónyuge"
          }
        ]
      },
      "evidenciaSemantica": "Regla 3 de HU_14.8_220072.md y Paso 6 de CP02: <M_SolicitudTramite.kmInformacionTramite.kmIntegraciones.kmIntegracionSAP.kmResponseSAP.sBP> = null.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "variable-sestadoafiliado",
      "entidad": {
        "tipo": "variable",
        "id": "variable-sestadoafiliado",
        "descripcion": "Variable de respuesta de SAP (Estado del afiliado) objeto de saneamiento (asignación null) en escenario beneficiario/cónyuge.",
        "superficies": [
          "integracion",
          "proceso-bpm"
        ],
        "ambito": {
          "tipo": "integracion",
          "integracion": "integracion-servicio-sap"
        }
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": 6,
            "condicion": "Saneamiento automático a null de variable sEstadoAfiliado al detectar tercero beneficiario/cónyuge"
          }
        ]
      },
      "evidenciaSemantica": "Regla 3 de HU_14.8_220072.md y Paso 6 de CP02: <M_SolicitudTramite.kmInformacionTramite.kmIntegraciones.kmIntegracionSAP.kmResponseSAP.sEstadoAfiliado> = null.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "variable-smotivoretiro",
      "entidad": {
        "tipo": "variable",
        "id": "variable-smotivoretiro",
        "descripcion": "Variable de respuesta de SAP (Motivo de retiro) objeto de saneamiento (asignación null) en escenario beneficiario/cónyuge.",
        "superficies": [
          "integracion",
          "proceso-bpm"
        ],
        "ambito": {
          "tipo": "integracion",
          "integracion": "integracion-servicio-sap"
        }
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": 6,
            "condicion": "Saneamiento automático a null de variable sMotivoRetiro al detectar tercero beneficiario/cónyuge"
          }
        ]
      },
      "evidenciaSemantica": "Regla 3 de HU_14.8_220072.md y Paso 6 de CP02: <M_SolicitudTramite.kmInformacionTramite.kmIntegraciones.kmIntegracionSAP.kmResponseSAP.sMotivoRetiro> = null.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "variable-sgrupo",
      "entidad": {
        "tipo": "variable",
        "id": "variable-sgrupo",
        "descripcion": "Variable de respuesta de SAP (Grupo de población) objeto de saneamiento (asignación null) en escenario beneficiario/cónyuge.",
        "superficies": [
          "integracion",
          "proceso-bpm"
        ],
        "ambito": {
          "tipo": "integracion",
          "integracion": "integracion-servicio-sap"
        }
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": 6,
            "condicion": "Saneamiento automático a null de variable sGrupo al detectar tercero beneficiario/cónyuge"
          }
        ]
      },
      "evidenciaSemantica": "Regla 3 de HU_14.8_220072.md y Paso 6 de CP02: <M_SolicitudTramite.kmInformacionTramite.kmIntegraciones.kmIntegracionSAP.kmResponseSAP.sGrupo> = null.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    }
  ],
  "classificationRequests": [
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "solicitudId": "solicitud-fase-reconocimiento-facial",
      "id": "reconocimiento-facial",
      "descripcion": "Fase/pantalla de validación de reconocimiento facial alcanzada al avanzar la solicitud cuando SAP no genera bloqueo.",
      "alternativas": [
        "pantalla-ui",
        "actividad"
      ],
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP01",
            "paso": 7
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": 7
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": 7
          }
        ]
      },
      "evidenciaSemantica": "Paso 7 de CP01, CP02 y CP04 indica 'llegara a la fase de reconocimineto facial / iniciara la validacion facial', requiriendo clasificar si representa una pantalla-ui o una actividad de BPM.",
      "estado": "NEEDS_CLASSIFICATION"
    }
  ],
  "testDataRequirements": [
    {
      "schemaVersion": "afi-test-data-requirement/v1",
      "id": "req-actor-pensionado-no-registrado-sap",
      "perfil": "pensionado",
      "condiciones": [
        {
          "id": "pensionado-no-registrado-sap",
          "descripcion": "Solicitante con perfil Pensionado que no existe en la base de datos ni servicio web de SAP (no registrado como cotizante titular ni como persona a cargo)."
        }
      ],
      "camposRequeridos": [
        "numeroIdentificacion",
        "correo",
        "numeroCelular",
        "numeroTelefonoFijo"
      ],
      "ocurrencias": [
        {
          "hu": "HU 14.8",
          "caso": "CP01",
          "paso": 3
        }
      ],
      "reutilizable": true
    },
    {
      "schemaVersion": "afi-test-data-requirement/v1",
      "id": "req-actor-independiente-beneficiario-conyuge-sap",
      "perfil": "independiente",
      "condiciones": [
        {
          "id": "independiente-beneficiario-conyuge-sap",
          "descripcion": "Solicitante con perfil Independiente registrado en SAP exclusivamente como beneficiario o cónyuge (persona a cargo activa), sin estar afiliado como cotizante titular."
        }
      ],
      "camposRequeridos": [
        "numeroIdentificacion",
        "correo",
        "numeroCelular",
        "numeroTelefonoFijo",
        "actividad",
        "ingresoMensual"
      ],
      "ocurrencias": [
        {
          "hu": "HU 14.8",
          "caso": "CP02",
          "paso": 3
        }
      ],
      "reutilizable": true
    },
    {
      "schemaVersion": "afi-test-data-requirement/v1",
      "id": "req-actor-facultativo-cotizante-activo-sap",
      "perfil": "facultativo",
      "condiciones": [
        {
          "id": "facultativo-cotizante-activo-sap",
          "descripcion": "Solicitante con perfil Facultativo registrado en SAP como afiliado cotizante titular con estado activo en Colsubsidio."
        }
      ],
      "camposRequeridos": [
        "numeroIdentificacion",
        "correo",
        "numeroCelular",
        "numeroTelefonoFijo",
        "salarioBasico"
      ],
      "ocurrencias": [
        {
          "hu": "HU 14.8",
          "caso": "CP03",
          "paso": 3
        }
      ],
      "reutilizable": true
    },
    {
      "schemaVersion": "afi-test-data-requirement/v1",
      "id": "req-actor-pensionado-cotizante-inactivo-sap",
      "perfil": "pensionado",
      "condiciones": [
        {
          "id": "pensionado-cotizante-inactivo-sap",
          "descripcion": "Solicitante con perfil Pensionado registrado en SAP como afiliado cotizante titular, pero con estado inactivo o con motivo de retiro registrado."
        }
      ],
      "camposRequeridos": [
        "numeroIdentificacion",
        "correo",
        "numeroCelular",
        "numeroTelefonoFijo"
      ],
      "ocurrencias": [
        {
          "hu": "HU 14.8",
          "caso": "CP04",
          "paso": 3
        }
      ],
      "reutilizable": true
    },
    {
      "schemaVersion": "afi-test-data-requirement/v1",
      "id": "req-actor-pensionado-activo-y-beneficiario-sap",
      "perfil": "pensionado",
      "condiciones": [
        {
          "id": "pensionado-activo-y-beneficiario-sap",
          "descripcion": "Solicitante con perfil Pensionado registrado en SAP como afiliado cotizante titular activo y simultáneamente como beneficiario o cónyuge."
        }
      ],
      "camposRequeridos": [
        "numeroIdentificacion",
        "correo",
        "numeroCelular",
        "numeroTelefonoFijo"
      ],
      "ocurrencias": [
        {
          "hu": "HU 14.8",
          "caso": "CP05",
          "paso": 3
        }
      ],
      "reutilizable": true
    }
  ]
}

```