Se ha aplicado la corrección en todos los campos `paso` dentro del envelope (`knowledgeProposals`, `classificationRequests` y `testDataRequirements`), asegurando que la propiedad se exprese estrictamente como texto (`string`). Se conserva intacta la semántica del análisis, la aislamiento de perfiles por caso del Case Identity Lock y la trazabilidad de los requerimientos.

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
            "paso": "Paso 3",
            "condicion": "Notificación por correo con número de caso generado"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": "Paso 3",
            "condicion": "Notificación por correo con número de caso generado"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": "Paso 3",
            "condicion": "Notificación por correo con número de caso generado"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": "Paso 3",
            "condicion": "Notificación por correo con número de caso generado"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": "Paso 3",
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
            "paso": "Paso 4",
            "condicion": "Instanciación de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP01",
            "paso": "Paso 5",
            "condicion": "Ejecución técnica de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP01",
            "paso": "Paso 8",
            "condicion": "Consulta de respuesta obtenida de SAP en trazas"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": "Paso 4",
            "condicion": "Instanciación de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": "Paso 5",
            "condicion": "Ejecución técnica de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": "Paso 8",
            "condicion": "Consulta de respuesta obtenida de SAP en trazas"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": "Paso 4",
            "condicion": "Instanciación de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": "Paso 5",
            "condicion": "Ejecución técnica de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": "Paso 8",
            "condicion": "Consulta de respuesta obtenida de SAP en trazas"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": "Paso 4",
            "condicion": "Instanciación de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": "Paso 5",
            "condicion": "Ejecución técnica de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": "Paso 8",
            "condicion": "Consulta de respuesta obtenida de SAP en trazas"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": "Paso 4",
            "condicion": "Instanciación de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": "Paso 5",
            "condicion": "Ejecución técnica de la integración de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": "Paso 8",
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
            "paso": "Paso 4",
            "condicion": "Instanciación del subproceso automático de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": "Paso 4",
            "condicion": "Instanciación del subproceso automático de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": "Paso 4",
            "condicion": "Instanciación del subproceso automático de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": "Paso 4",
            "condicion": "Instanciación del subproceso automático de SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": "Paso 4",
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
            "paso": "Paso 6",
            "condicion": "Ruta Continua tomada al no existir bloqueo por persona no registrada"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": "Paso 6",
            "condicion": "Ruta Continua tomada al no existir bloqueo por ser beneficiario/cónyuge"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": "Paso 6",
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
            "paso": "Paso 6",
            "condicion": "Ruta No continua SAP tomada por afiliación activa de Facultativo"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP03",
            "paso": "Paso 7",
            "condicion": "Instanciación de camino No continua SAP"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": "Paso 6",
            "condicion": "Ruta No continua SAP tomada por afiliación activa de Pensionado"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": "Paso 7",
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
            "paso": "Paso 7",
            "condicion": "Visualización de pantalla de bloqueo parametrizada por afiliación activa"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP05",
            "paso": "Paso 7",
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
            "paso": "Paso 6",
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
            "paso": "Paso 6",
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
            "paso": "Paso 6",
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
            "paso": "Paso 6",
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
            "paso": "Paso 7"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP02",
            "paso": "Paso 7"
          },
          {
            "hu": "HU 14.8",
            "caso": "CP04",
            "paso": "Paso 7"
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
          "paso": "Paso 3"
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
          "paso": "Paso 3"
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
          "paso": "Paso 3"
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
          "paso": "Paso 3"
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
          "paso": "Paso 3"
        }
      ],
      "reutilizable": true
    }
  ]
}

```