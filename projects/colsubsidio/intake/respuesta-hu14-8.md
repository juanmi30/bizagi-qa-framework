### Diagnóstico Funcional y de Datos de Prueba por Caso

#### CP01 — Escenario Afiliado Titular - Estado Activo (Vigente / Suspendido)



* **A. Condiciones representables:**
* Pantalla `informacion-contacto` (reconocida en el modelo como punto funcional).




* **B. Preguntas funcionales:**
* Ninguna (el comportamiento de negocio ante cotizante activo está delimitado por la Regla 2 de la HU).




* **C. KNOWLEDGE_GAP:**
* `integracion-sap` (tipo `integracion`): servicio web de validación de afiliación en SAP.


* `sap-estado-afiliado` (tipo `variable`): variable transaccional `sEstadoAfiliado` que retorna SAP.


* `pantalla-bloqueo` (tipo `pantalla-ui`): pantalla de bloqueo de radicación al detectar un afiliado titular activo.




* **D. TESTABILITY_GAP:**
* Ninguno (la evaluación se detiene en la capa KNOWLEDGE_GAP para las entidades no registradas).




* **E. CAPABILITY_GAP:**
* Detención de la radicación y enrutamiento/transición a la pantalla de bloqueo (familia `transicion`).




* **F. Requisitos de datos de prueba:**
* **Perfil:** Persona Natural (e.g., Independiente / Pensionado / Facultativo).


* **Clase de actor:** Cotizante titular en SAP cuya identificación coincide con la del trámite y presenta estado Activo (Vigente o Suspendido).


* **Campos requeridos:** `numeroIdentificacion`, `correo`, `numeroCelular`.





#### CP02 — Escenario Afiliado Titular - Estado Inactivo



* **A. Condiciones representables:**
* Pantalla `informacion-contacto`.




* **B. Preguntas funcionales:**
* Ninguna.




* **C. KNOWLEDGE_GAP:**
* `integracion-sap` (tipo `integracion`): servicio web de validación de afiliación en SAP.


* `sap-estado-afiliado` (tipo `variable`): variable transaccional `sEstadoAfiliado` con valor Inactivo.




* **D. TESTABILITY_GAP:**
* Ninguno.




* **E. CAPABILITY_GAP:**
* Orquestación y validación de la transición para permitir continuar hacia el formulario de datos de contacto (familia `transicion`).




* **F. Requisitos de datos de prueba:**
* **Perfil:** Persona Natural (e.g., Independiente).


* **Clase de actor:** Cotizante titular en SAP con coincidencia exacta de identificación y estado Inactivo.


* **Campos requeridos:** `numeroIdentificacion`, `correo`, `numeroCelular`.





#### CP03 — Escenario No Coincidencia - Beneficiario / Cónyuge (Tercero)



* **A. Condiciones representables:**
* Ninguna condición atómica directa en interfaz sin resolver previamente la transición y el saneamiento.




* **B. Preguntas funcionales:**
* Ninguna.




* **C. KNOWLEDGE_GAP:**
* `integracion-sap` (tipo `integracion`).


* `sap-bp`, `sap-estado-afiliado`, `sap-motivo-retiro`, `sap-grupo` (tipo `variable`): variables transaccionales de la respuesta de SAP sujetas a saneamiento (`null`).


* `coleccion-afiliado` (tipo `variable`): colección de datos del afiliado cuya información de terceros no debe guardarse en el expediente.




* **D. TESTABILITY_GAP:**
* Ninguno.




* **E. CAPABILITY_GAP:**
* Verificación de la supresión de componentes de alerta o mensajes de bloqueo en la interfaz (familia `componente-visual`).


* Avance del trámite hacia el formulario de registro de información personal (familia `transicion`).




* **F. Requisitos de datos de prueba:**
* **Perfil:** Persona Natural (e.g., Independiente / Beneficiario).


* **Clase de actor:** Solicitante afiliado como beneficiario/cónyuge (el registro devuelto por SAP pertenece a un tercero y no coincide como cotizante titular).


* **Campos requeridos:** `numeroIdentificacion`, `correo`, `numeroCelular`.





#### CP04 — Escenario de Aportante / Empresa



* **A. Condiciones representables:**
* Pantalla `informacion-contacto`.




* **B. Preguntas funcionales:**
* Ninguna.




* **C. KNOWLEDGE_GAP:**
* `integracion-sap` (tipo `integracion`).


* Variables de respuesta de la consulta SAP asociadas a datos de identificación de aportantes.




* **D. TESTABILITY_GAP:**
* Ninguno.




* **E. CAPABILITY_GAP:**
* Orquestación del flujo y transición de pantallas para perfil Empresa (familia `transicion`).




* **F. Requisitos de datos de prueba:**
* **Perfil:** Empresa (`empresa`).


* **Clase de actor:** Aportante/Empleador para verificación de identidad y estado en la consulta SAP.


* **Campos requeridos:** `numeroIdentificacion`, `correo`.





#### CP05 — Escenario Adicional (Variante de Afiliación)



* **A. Condiciones representables:**
* Pantalla `informacion-contacto`.




* **B. Preguntas funcionales:**
* Ninguna.




* **C. KNOWLEDGE_GAP:**
* `integracion-sap` (tipo `integracion`).


* Variables de la respuesta SAP para perfiles individuales.




* **D. TESTABILITY_GAP:**
* Ninguno.




* **E. CAPABILITY_GAP:**
* Validación de transiciones y continuidad del trámite en portal (familia `transicion`).




* **F. Requisitos de datos de prueba:**
* **Perfil:** Facultativo (`facultativo`).


* **Clase de actor:** Solicitante con perfil Facultativo o Pensionado para evaluación de respuesta SAP.


* **Campos requeridos:** `numeroIdentificacion`, `correo`, `numeroCelular`.





```json
{
  "schemaVersion": "afi-agent-intake/v1",
  "knowledgeProposals": [
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-integracion-sap",
      "entidad": {
        "tipo": "integracion",
        "id": "integracion-sap",
        "descripcion": "Servicio web de validacion de estado de afiliacion SAP de la CCF"
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP01",
            "paso": "Paso 1",
            "condicion": "Invocacion y consulta de respuesta de integracion SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": "Paso 1",
            "condicion": "Invocacion y consulta de respuesta de integracion SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": "Paso 1",
            "condicion": "Invocacion y consulta de respuesta de integracion SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": "Paso 1",
            "condicion": "Invocacion y consulta de respuesta de integracion SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": "Paso 1",
            "condicion": "Invocacion y consulta de respuesta de integracion SAP"
          }
        ]
      },
      "evidenciaSemantica": "Servicio web de SAP encargado de retornar el estado de afiliacion de la CCF utilizando parametros del solicitante (HU_14.8_220071.md, Paso 1).",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-pantalla-bloqueo",
      "entidad": {
        "tipo": "pantalla-ui",
        "id": "pantalla-bloqueo",
        "descripcion": "Pantalla de bloqueo de radicacion para afiliados titulares activos"
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP01",
            "paso": "Paso 2",
            "condicion": "Enrutamiento a pantalla de bloqueo si el afiliado titular esta activo"
          }
        ]
      },
      "evidenciaSemantica": "Si el estado es Activo (Vigente o Suspendido), se detiene la radicacion y se enruta a la pantalla de bloqueo (HU_14.8_220072.md, Regla 2).",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-var-sap-sbp",
      "entidad": {
        "tipo": "variable",
        "id": "sap-bp",
        "descripcion": "Codigo de socio de negocio BP de la respuesta de SAP",
        "superficies": [
          "integracion",
          "proceso-bpm"
        ],
        "ambito": {
          "tipo": "integracion",
          "integracion": "integracion-sap"
        }
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": "Paso 2",
            "condicion": "Limpieza automatica de variable sBP a null"
          }
        ]
      },
      "evidenciaSemantica": "Se asignara un valor vacio (null) a la variable sBP antes de avanzar (HU_14.8_220072.md, Regla 3).",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-var-sap-sestadoafiliado",
      "entidad": {
        "tipo": "variable",
        "id": "sap-estado-afiliado",
        "descripcion": "Estado del afiliado en la respuesta de SAP",
        "superficies": [
          "integracion",
          "proceso-bpm"
        ],
        "ambito": {
          "tipo": "integracion",
          "integracion": "integracion-sap"
        }
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP01",
            "paso": "Paso 1",
            "condicion": "Evaluacion de estado Activo"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": "Paso 1",
            "condicion": "Evaluacion de estado Inactivo"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": "Paso 2",
            "condicion": "Limpieza automatica de variable sEstadoAfiliado a null"
          }
        ]
      },
      "evidenciaSemantica": "Evaluacion de variable sEstadoAfiliado y saneamiento a null en escenario beneficiario/conyuge (HU_14.8_220072.md, Reglas 2 y 3).",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-var-sap-smotivoretiro",
      "entidad": {
        "tipo": "variable",
        "id": "sap-motivo-retiro",
        "descripcion": "Motivo de retiro del afiliado en la respuesta de SAP",
        "superficies": [
          "integracion",
          "proceso-bpm"
        ],
        "ambito": {
          "tipo": "integracion",
          "integracion": "integracion-sap"
        }
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": "Paso 2",
            "condicion": "Limpieza automatica de variable sMotivoRetiro a null"
          }
        ]
      },
      "evidenciaSemantica": "Se asignara un valor vacio (null) a la variable sMotivoRetiro antes de avanzar (HU_14.8_220072.md, Regla 3).",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-var-sap-sgrupo",
      "entidad": {
        "tipo": "variable",
        "id": "sap-grupo",
        "descripcion": "Grupo de poblacion del afiliado en la respuesta de SAP",
        "superficies": [
          "integracion",
          "proceso-bpm"
        ],
        "ambito": {
          "tipo": "integracion",
          "integracion": "integracion-sap"
        }
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": "Paso 2",
            "condicion": "Limpieza automatica de variable sGrupo a null"
          }
        ]
      },
      "evidenciaSemantica": "Se asignara un valor vacio (null) a la variable sGrupo antes de avanzar (HU_14.8_220072.md, Regla 3).",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-var-coleccion-afiliado",
      "entidad": {
        "tipo": "variable",
        "id": "coleccion-afiliado",
        "descripcion": "Coleccion de informacion del afiliado en respuesta de SAP",
        "superficies": [
          "proceso-bpm",
          "integracion"
        ],
        "ambito": {
          "tipo": "proceso"
        }
      },
      "origen": {
        "fuente": "20260810_CLS_AFI_HU 14.8 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": "Paso 3",
            "condicion": "Omision de guardado de datos cuando el registro corresponde a un tercero"
          }
        ]
      },
      "evidenciaSemantica": "En caso de detectar que el registro de SAP corresponde a un tercero, el sistema no realizara el guardado de informacion (HU_14.8_220071.md, Paso 3).",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    }
  ],
  "classificationRequests": [],
  "testDataRequirements": [
    {
      "schemaVersion": "afi-test-data-requirement/v1",
      "id": "req-actor-titular-activo",
      "perfil": "independiente",
      "condiciones": [
        {
          "id": "titular-estado-activo",
          "descripcion": "Solicitante registrado como cotizante titular en SAP con coincidencia exacta de tipo y numero de identificacion y estado Activo (Vigente o Suspendido)"
        }
      ],
      "camposRequeridos": [
        "numeroIdentificacion",
        "correo",
        "numeroCelular"
      ],
      "ocurrencias": [
        {
          "hu": "HU 14.8",
          "caso": "CP01",
          "paso": "Paso 1"
        }
      ],
      "reutilizable": true
    },
    {
      "schemaVersion": "afi-test-data-requirement/v1",
      "id": "req-actor-titular-inactivo",
      "perfil": "independiente",
      "condiciones": [
        {
          "id": "titular-estado-inactivo",
          "descripcion": "Solicitante registrado como cotizante titular en SAP con coincidencia exacta de tipo y numero de identificacion y estado Inactivo"
        }
      ],
      "camposRequeridos": [
        "numeroIdentificacion",
        "correo",
        "numeroCelular"
      ],
      "ocurrencias": [
        {
          "hu": "HU 14.8",
          "caso": "CP02",
          "paso": "Paso 1"
        }
      ],
      "reutilizable": true
    },
    {
      "schemaVersion": "afi-test-data-requirement/v1",
      "id": "req-actor-tercero-beneficiario",
      "perfil": "independiente",
      "condiciones": [
        {
          "id": "no-coincidencia-tercero",
          "descripcion": "Solicitante registrado en SAP como beneficiario o conyuge de un tercero (sin coincidencia de identidad como cotizante titular)"
        }
      ],
      "camposRequeridos": [
        "numeroIdentificacion",
        "correo",
        "numeroCelular"
      ],
      "ocurrencias": [
        {
          "hu": "HU 14.8",
          "caso": "CP03",
          "paso": "Paso 1"
        }
      ],
      "reutilizable": true
    },
    {
      "schemaVersion": "afi-test-data-requirement/v1",
      "id": "req-actor-empresa-aportante",
      "perfil": "empresa",
      "condiciones": [
        {
          "id": "empresa-validacion-sap",
          "descripcion": "Solicitante con perfil Empresa/Empleador para validacion de coincidencia de identidad en respuesta de SAP"
        }
      ],
      "camposRequeridos": [
        "numeroIdentificacion",
        "correo"
      ],
      "ocurrencias": [
        {
          "hu": "HU 14.8",
          "caso": "CP04",
          "paso": "Paso 1"
        }
      ],
      "reutilizable": true
    },
    {
      "schemaVersion": "afi-test-data-requirement/v1",
      "id": "req-actor-facultativo-pensionado",
      "perfil": "facultativo",
      "condiciones": [
        {
          "id": "afiliado-facultativo-sap",
          "descripcion": "Solicitante con perfil Facultativo o Pensionado para validacion de respuesta de SAP"
        }
      ],
      "camposRequeridos": [
        "numeroIdentificacion",
        "correo",
        "numeroCelular"
      ],
      "ocurrencias": [
        {
          "hu": "HU 14.8",
          "caso": "CP05",
          "paso": "Paso 1"
        }
      ],
      "reutilizable": true
    }
  ]
}

```