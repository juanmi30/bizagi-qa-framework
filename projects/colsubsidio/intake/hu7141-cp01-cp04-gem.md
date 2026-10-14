
### A. Test Data Role Matrix Corregida

| Rol de Negocio en la HU                          | Tipo de Actor / Slot                  | Identificador / Requisito Creado                  | Condición de Negocio de Datos                                                                                                                 | Ocurrencias            | Estado / Diagnóstico                                                                  |
| ------------------------------------------------ | ------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| **Aportante / Empresa (CP01)**             | Actor Principal (`perfil: empresa`) | `empresa-juridica-rues-con-representante-legal` | Empleador Jurídico existente en RUES, no afiliado a Colsubsidio, con información/número del Representante Legal retornado por RUES.         | CP01                   | **REPRESENTABLE** (como requisito de datos de prueba)                            |
| **Aportante / Empresa (CP02, CP03, CP04)** | Actor Principal (`perfil: empresa`) | `empresa-juridica-rues-sin-representante-legal` | Empleador Jurídico existente en RUES, no afiliado a Colsubsidio, sin Representante Legal retornado por RUES (formulario inicia sin ese dato). | CP02, CP03, CP04       | **REPRESENTABLE** (como requisito de datos de prueba)                            |
| **Representante Legal**                    | Participante Secundario               | N/A                                               | Datos condicionales específicos del Representante Legal.                                                                                      | CP01, CP02, CP03, CP04 | **`TEST_DATA_MODEL_GAP`** (el contrato actual solo soporta al actor principal) |
| **Contacto con la Caja**                   | Participante Secundario               | N/A                                               | Datos condicionales específicos del Contacto con la Caja.                                                                                     | CP01, CP02, CP03, CP04 | **`TEST_DATA_MODEL_GAP`** (el contrato actual solo soporta al actor principal) |
| **Responsable del Portal**                 | Participante Secundario               | N/A                                               | Datos condicionales específicos del Responsable del Portal.                                                                                   | CP01, CP02, CP03, CP04 | **`TEST_DATA_MODEL_GAP`** (el contrato actual solo soporta al actor principal) |

---

### B. Resumen de Propuestas Knowledge por Tipo y Cantidad

**Total de propuestas declarativas creadas:** `36`

1. **`pantalla-ui` (`5` propuestas):**

* `pantalla-ingresa-informacion-empresa`
* `pantalla-representante-legal`
* `pantalla-contacto-caja`
* `pantalla-responsable-portal`
* `pantalla-documentos`

2. **`campo-ui` (`23` propuestas - con scope por pantalla/rol):**

* **Empresa (`1`):** `campo-tipo-sociedad` (pantalla: `pantalla-ingresa-informacion-empresa`)
* **Representante Legal (`7` - pantalla: `pantalla-representante-legal`):**
* `representante-legal-tipo-identificacion`
* `representante-legal-numero-identificacion`
* `representante-legal-primer-nombre`
* `representante-legal-segundo-nombre`
* `representante-legal-primer-apellido`
* `representante-legal-segundo-apellido`
* `representante-legal-nombre-completo`
* **Contacto con la Caja (`8` - pantalla: `pantalla-contacto-caja`):**
* `contacto-caja-tipo-identificacion`
* `contacto-caja-numero-identificacion`
* `contacto-caja-primer-nombre`
* `contacto-caja-segundo-nombre`
* `contacto-caja-primer-apellido`
* `contacto-caja-segundo-apellido`
* `contacto-caja-nombre-completo`
* `contacto-caja-correo`
* **Responsable del Portal (`7` - pantalla: `pantalla-responsable-portal`):**
* `responsable-portal-tipo-identificacion`
* `responsable-portal-numero-identificacion`
* `responsable-portal-primer-nombre`
* `responsable-portal-segundo-nombre`
* `responsable-portal-primer-apellido`
* `responsable-portal-segundo-apellido`
* `responsable-portal-nombre-completo`

3. **`actividad` (`1` propuesta):**

* `actividad-registrar-informacion-cliente` (proceso BPM)

4. **`integracion` (`3` propuestas):**

* `integracion-giass`
* `integracion-rues`
* `integracion-registraduria`

5. **`variable` (`1` propuesta):**

* `variable-flag-registraduria` (superficies: `proceso-bpm`, `integracion`)

6. **`notificacion` (`3` propuestas):**

* `notificacion-aprobacion-empleador`
* `notificacion-cierre-inactividad`
* `notificacion-recordatorio-retoma`

---

### C. Lista de Diagnósticos Cuyo Primer Bloqueo Cambió

1. **Integraciones Externas (`integracion-giass`, `integracion-rues`, `integracion-registraduria`):**

* *Anterior:* `TESTABILITY_GAP` (ausencia de proveedor productivo en la superficie).
* *Nuevo Primer Bloqueo:* **`KNOWLEDGE_GAP`** (la entidad no está registrada en el Application Model). Una vez aprobada la propuesta de conocimiento, su estado pasará a `TESTABILITY_GAP` por falta de proveedor productivo.

2. **Variable de Proceso/BD (`variable-flag-registraduria`):**

* *Anterior:* `TESTABILITY_GAP` (superficie de variables sin proveedor).
* *Nuevo Primer Bloqueo:* **`KNOWLEDGE_GAP`** (entidad no registrada en el Application Model).

3. **Notificaciones por Correo (`notificacion-aprobacion-empleador`, `notificacion-cierre-inactividad`, `notificacion-recordatorio-retoma`):**

* *Anterior:* `TESTABILITY_GAP` (superficie de notificación sin proveedor).
* *Nuevo Primer Bloqueo:* **`KNOWLEDGE_GAP`** (entidades no registradas en el Application Model).

4. **Campos UI de Formularios (Desagregación y Scope por Pantalla):**

* *Anterior:* `KNOWLEDGE_GAP` con entidades globales ambiguas (`campo-tipo-identificacion`, etc.).
* *Nuevo Primer Bloqueo:* **`KNOWLEDGE_GAP`** ajustado a entidades scoped por pantalla y rol (`representante-legal-tipo-identificacion`, `contacto-caja-correo`, etc.).

---

```json
{
  "schemaVersion": "afi-agent-intake/v1",
  "knowledgeProposals": [
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-pantalla-ingresa-informacion-empresa",
      "entidad": {
        "tipo": "pantalla-ui",
        "id": "pantalla-ingresa-informacion-empresa",
        "descripcion": "Pantalla unificada 'Ingresa la información de la empresa' para aportante Empleador Jurídico/Natural."
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14",
            "caso": "CP01",
            "paso": "Paso 8"
          },
          {
            "hu": "HU 7.14",
            "caso": "CP03",
            "paso": "Paso 5"
          }
        ]
      },
      "evidenciaSemantica": "Pantalla del portal donde se unifica la información general y económica de la empresa.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-pantalla-representante-legal",
      "entidad": {
        "tipo": "pantalla-ui",
        "id": "pantalla-representante-legal",
        "descripcion": "Pantalla 'Ingresa información representante legal' en el portal de afiliaciones."
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 12"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP02",
            "paso": "Paso 5"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP03",
            "paso": "Paso 8"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP04",
            "paso": "Paso 5"
          }
        ]
      },
      "evidenciaSemantica": "Pantalla para la captura, búsqueda y validación del Representante Legal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-pantalla-contacto-caja",
      "entidad": {
        "tipo": "pantalla-ui",
        "id": "pantalla-contacto-caja",
        "descripcion": "Pantalla 'Ingresa información contacto con la caja' en el portal."
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 20"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP02",
            "paso": "Paso 11"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP03",
            "paso": "Paso 15"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP04",
            "paso": "Paso 12"
          }
        ]
      },
      "evidenciaSemantica": "Pantalla para la búsqueda y captura de información del Contacto con la Caja.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-pantalla-responsable-portal",
      "entidad": {
        "tipo": "pantalla-ui",
        "id": "pantalla-responsable-portal",
        "descripcion": "Pantalla 'Ingresa información responsable del portal' en el portal."
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 25"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP02",
            "paso": "Paso 16"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP03",
            "paso": "Paso 21"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP04",
            "paso": "Paso 18"
          }
        ]
      },
      "evidenciaSemantica": "Pantalla para la búsqueda y captura de información del Responsable del Portal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-pantalla-documentos",
      "entidad": {
        "tipo": "pantalla-ui",
        "id": "pantalla-documentos",
        "descripcion": "Pantalla 'Documentos' para la descarga/cargue de formularios y archivos obligatorios."
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14",
            "caso": "CP01",
            "paso": "Paso 28"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP02",
            "paso": "Paso 19"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP03",
            "paso": "Paso 25"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP04",
            "paso": "Paso 22"
          }
        ]
      },
      "evidenciaSemantica": "Pantalla de gestión documental del trámite de afiliación.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-campo-tipo-sociedad",
      "entidad": {
        "tipo": "campo-ui",
        "id": "campo-tipo-sociedad",
        "descripcion": "Campo 'Tipo de sociedad' en la pantalla de información de la empresa.",
        "pantalla": "pantalla-ingresa-informacion-empresa",
        "control": "select"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14",
            "caso": "CP01",
            "paso": "Paso 9"
          },
          {
            "hu": "HU 7.14",
            "caso": "CP03",
            "paso": "Paso 6"
          }
        ]
      },
      "evidenciaSemantica": "Campo removido del formulario unificado de la empresa.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-representante-legal-tipo-identificacion",
      "entidad": {
        "tipo": "campo-ui",
        "id": "representante-legal-tipo-identificacion",
        "descripcion": "Campo 'Tipo de identificación' del Representante Legal.",
        "pantalla": "pantalla-representante-legal",
        "control": "select"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 12"
          }
        ]
      },
      "evidenciaSemantica": "Desplegable de tipo de identificación en el formulario del Representante Legal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-representante-legal-numero-identificacion",
      "entidad": {
        "tipo": "campo-ui",
        "id": "representante-legal-numero-identificacion",
        "descripcion": "Campo 'Número de identificación' del Representante Legal.",
        "pantalla": "pantalla-representante-legal",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 12"
          }
        ]
      },
      "evidenciaSemantica": "Campo de documento de identificación con tooltip informativo en el Representante Legal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-representante-legal-primer-nombre",
      "entidad": {
        "tipo": "campo-ui",
        "id": "representante-legal-primer-nombre",
        "descripcion": "Campo 'Primer nombre' del Representante Legal.",
        "pantalla": "pantalla-representante-legal",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 14"
          }
        ]
      },
      "evidenciaSemantica": "Campo de primer nombre del Representante Legal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-representante-legal-segundo-nombre",
      "entidad": {
        "tipo": "campo-ui",
        "id": "representante-legal-segundo-nombre",
        "descripcion": "Campo 'Segundo nombre' del Representante Legal.",
        "pantalla": "pantalla-representante-legal",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 14"
          }
        ]
      },
      "evidenciaSemantica": "Campo de segundo nombre del Representante Legal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-representante-legal-primer-apellido",
      "entidad": {
        "tipo": "campo-ui",
        "id": "representante-legal-primer-apellido",
        "descripcion": "Campo 'Primer apellido' del Representante Legal.",
        "pantalla": "pantalla-representante-legal",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 14"
          }
        ]
      },
      "evidenciaSemantica": "Campo de primer apellido del Representante Legal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-representante-legal-segundo-apellido",
      "entidad": {
        "tipo": "campo-ui",
        "id": "representante-legal-segundo-apellido",
        "descripcion": "Campo 'Segundo apellido' del Representante Legal.",
        "pantalla": "pantalla-representante-legal",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 14"
          }
        ]
      },
      "evidenciaSemantica": "Campo de segundo apellido del Representante Legal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-representante-legal-nombre-completo",
      "entidad": {
        "tipo": "campo-ui",
        "id": "representante-legal-nombre-completo",
        "descripcion": "Campo 'Nombre completo' del Representante Legal.",
        "pantalla": "pantalla-representante-legal",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP03",
            "paso": "Paso 10"
          }
        ]
      },
      "evidenciaSemantica": "Campo concatenado de ayuda visual en la pantalla del Representante Legal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-contacto-caja-tipo-identificacion",
      "entidad": {
        "tipo": "campo-ui",
        "id": "contacto-caja-tipo-identificacion",
        "descripcion": "Campo 'Tipo de identificación' del Contacto con la Caja.",
        "pantalla": "pantalla-contacto-caja",
        "control": "select"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 20"
          }
        ]
      },
      "evidenciaSemantica": "Desplegable de tipo de documento en la pantalla de Contacto con la Caja.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-contacto-caja-numero-identificacion",
      "entidad": {
        "tipo": "campo-ui",
        "id": "contacto-caja-numero-identificacion",
        "descripcion": "Campo 'Número de identificación' del Contacto con la Caja.",
        "pantalla": "pantalla-contacto-caja",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 20"
          }
        ]
      },
      "evidenciaSemantica": "Campo de número de documento en la pantalla de Contacto con la Caja.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-contacto-caja-primer-nombre",
      "entidad": {
        "tipo": "campo-ui",
        "id": "contacto-caja-primer-nombre",
        "descripcion": "Campo 'Primer nombre' del Contacto con la Caja.",
        "pantalla": "pantalla-contacto-caja",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 21"
          }
        ]
      },
      "evidenciaSemantica": "Campo de primer nombre del Contacto con la Caja.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-contacto-caja-segundo-nombre",
      "entidad": {
        "tipo": "campo-ui",
        "id": "contacto-caja-segundo-nombre",
        "descripcion": "Campo 'Segundo nombre' del Contacto con la Caja.",
        "pantalla": "pantalla-contacto-caja",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 21"
          }
        ]
      },
      "evidenciaSemantica": "Campo de segundo nombre del Contacto con la Caja.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-contacto-caja-primer-apellido",
      "entidad": {
        "tipo": "campo-ui",
        "id": "contacto-caja-primer-apellido",
        "descripcion": "Campo 'Primer apellido' del Contacto con la Caja.",
        "pantalla": "pantalla-contacto-caja",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 21"
          }
        ]
      },
      "evidenciaSemantica": "Campo de primer apellido del Contacto con la Caja.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-contacto-caja-segundo-apellido",
      "entidad": {
        "tipo": "campo-ui",
        "id": "contacto-caja-segundo-apellido",
        "descripcion": "Campo 'Segundo apellido' del Contacto con la Caja.",
        "pantalla": "pantalla-contacto-caja",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 21"
          }
        ]
      },
      "evidenciaSemantica": "Campo de segundo apellido del Contacto con la Caja.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-contacto-caja-nombre-completo",
      "entidad": {
        "tipo": "campo-ui",
        "id": "contacto-caja-nombre-completo",
        "descripcion": "Campo 'Nombre completo' del Contacto con la Caja.",
        "pantalla": "pantalla-contacto-caja",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP03",
            "paso": "Paso 16"
          }
        ]
      },
      "evidenciaSemantica": "Campo concatenado de ayuda visual en la pantalla de Contacto con la Caja.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-contacto-caja-correo",
      "entidad": {
        "tipo": "campo-ui",
        "id": "contacto-caja-correo",
        "descripcion": "Campo 'Correo electrónico' en la pantalla de contacto con la caja.",
        "pantalla": "pantalla-contacto-caja",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14",
            "caso": "CP01",
            "paso": "Paso 21"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP03",
            "paso": "Paso 16"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP04",
            "paso": "Paso 13"
          }
        ]
      },
      "evidenciaSemantica": "Campo de correo electrónico de la Persona de Contacto con la Caja que debe presentarse vacío sin precargar.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-responsable-portal-tipo-identificacion",
      "entidad": {
        "tipo": "campo-ui",
        "id": "responsable-portal-tipo-identificacion",
        "descripcion": "Campo 'Tipo de identificación' del Responsable del Portal.",
        "pantalla": "pantalla-responsable-portal",
        "control": "select"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 25"
          }
        ]
      },
      "evidenciaSemantica": "Desplegable de tipo de documento en la pantalla de Responsable del Portal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-responsable-portal-numero-identificacion",
      "entidad": {
        "tipo": "campo-ui",
        "id": "responsable-portal-numero-identificacion",
        "descripcion": "Campo 'Número de identificación' del Responsable del Portal.",
        "pantalla": "pantalla-responsable-portal",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 25"
          }
        ]
      },
      "evidenciaSemantica": "Campo de número de documento en la pantalla de Responsable del Portal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-responsable-portal-primer-nombre",
      "entidad": {
        "tipo": "campo-ui",
        "id": "responsable-portal-primer-nombre",
        "descripcion": "Campo 'Primer nombre' del Responsable del Portal.",
        "pantalla": "pantalla-responsable-portal",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 26"
          }
        ]
      },
      "evidenciaSemantica": "Campo de primer nombre del Responsable del Portal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-responsable-portal-segundo-nombre",
      "entidad": {
        "tipo": "campo-ui",
        "id": "responsable-portal-segundo-nombre",
        "descripcion": "Campo 'Segundo nombre' del Responsable del Portal.",
        "pantalla": "pantalla-responsable-portal",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 26"
          }
        ]
      },
      "evidenciaSemantica": "Campo de segundo nombre del Responsable del Portal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-responsable-portal-primer-apellido",
      "entidad": {
        "tipo": "campo-ui",
        "id": "responsable-portal-primer-apellido",
        "descripcion": "Campo 'Primer apellido' del Responsable del Portal.",
        "pantalla": "pantalla-responsable-portal",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 26"
          }
        ]
      },
      "evidenciaSemantica": "Campo de primer apellido del Responsable del Portal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-responsable-portal-segundo-apellido",
      "entidad": {
        "tipo": "campo-ui",
        "id": "responsable-portal-segundo-apellido",
        "descripcion": "Campo 'Segundo apellido' del Responsable del Portal.",
        "pantalla": "pantalla-responsable-portal",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 26"
          }
        ]
      },
      "evidenciaSemantica": "Campo de segundo apellido del Responsable del Portal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-responsable-portal-nombre-completo",
      "entidad": {
        "tipo": "campo-ui",
        "id": "responsable-portal-nombre-completo",
        "descripcion": "Campo 'Nombre completo' del Responsable del Portal.",
        "pantalla": "pantalla-responsable-portal",
        "control": "text"
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP03",
            "paso": "Paso 22"
          }
        ]
      },
      "evidenciaSemantica": "Campo concatenado de ayuda visual en la pantalla de Responsable del Portal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-actividad-registrar-informacion-cliente",
      "entidad": {
        "tipo": "actividad",
        "id": "actividad-registrar-informacion-cliente",
        "descripcion": "Actividad 'Registrar información del cliente' en el proceso BPM de Afiliaciones."
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14",
            "caso": "CP01",
            "paso": "Paso 7"
          },
          {
            "hu": "HU 7.14",
            "caso": "CP02",
            "paso": "Paso 4"
          },
          {
            "hu": "HU 7.14",
            "caso": "CP03",
            "paso": "Paso 4"
          },
          {
            "hu": "HU 7.14",
            "caso": "CP04",
            "paso": "Paso 4"
          }
        ]
      },
      "evidenciaSemantica": "Actividad principal BPM alcanzada tras las validaciones iniciales GIASS/RUES.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-integracion-giass",
      "entidad": {
        "tipo": "integracion",
        "id": "integracion-giass",
        "descripcion": "Servicio de integración con GIASS para validaciones iniciales de la empresa."
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14",
            "caso": "CP01",
            "paso": "Paso 7"
          },
          {
            "hu": "HU 7.14",
            "caso": "CP02",
            "paso": "Paso 4"
          }
        ]
      },
      "evidenciaSemantica": "Consumo de servicio GIASS al inicio del proceso de afiliación.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-integracion-rues",
      "entidad": {
        "tipo": "integracion",
        "id": "integracion-rues",
        "descripcion": "Servicio de integración con RUES para validación de empresa y representante legal."
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14",
            "caso": "CP01",
            "paso": "Paso 7"
          },
          {
            "hu": "HU 7.14",
            "caso": "CP01",
            "paso": "Paso 12"
          }
        ]
      },
      "evidenciaSemantica": "Validación RUES para verificar la existencia legal de la empresa y coincidencia del Representante Legal.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-integracion-registraduria",
      "entidad": {
        "tipo": "integracion",
        "id": "integracion-registraduria",
        "descripcion": "Servicio de integración con Registraduría Nacional para consulta de Cédula de Ciudadanía."
      },
      "origen": {
        "fuente": "228334_HU7_14_1_CLS - AFI - INT - Consultar Registraduría.md",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 14"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP03",
            "paso": "Paso 10"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP04",
            "paso": "Paso 7"
          }
        ]
      },
      "evidenciaSemantica": "Subproceso de consulta a Registraduría para verificación de nombres, apellidos y causales de cancelación.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-variable-flag-registraduria",
      "entidad": {
        "tipo": "variable",
        "id": "variable-flag-registraduria",
        "descripcion": "Flag de verificación de información de Registraduría guardado en la BD de Bizagi.",
        "superficies": [
          "proceso-bpm",
          "integracion"
        ]
      },
      "origen": {
        "fuente": "228334_HU7_14_1_CLS - AFI - INT - Consultar Registraduría.md",
        "ocurrencias": [
          {
            "hu": "HU 7.14.1",
            "caso": "CP01",
            "paso": "Paso 14"
          },
          {
            "hu": "HU 7.14.1",
            "caso": "CP02",
            "paso": "Paso 7"
          }
        ]
      },
      "evidenciaSemantica": "Flag en BD que se establece en SI al obtener datos o en NO si no hay registro / falla.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-notificacion-aprobacion-empleador",
      "entidad": {
        "tipo": "notificacion",
        "id": "notificacion-aprobacion-empleador",
        "descripcion": "Notificación 'Notificación aprobación Empleador' enviada por correo."
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14",
            "caso": "CP01",
            "paso": "Paso 32"
          }
        ]
      },
      "evidenciaSemantica": "Notificación enviada al correo del Representante Legal tras la aprobación de la solicitud.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-notificacion-cierre-inactividad",
      "entidad": {
        "tipo": "notificacion",
        "id": "notificacion-cierre-inactividad",
        "descripcion": "Notificación 'Notificación de cierre de caso por inactividad' enviada por correo."
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14",
            "caso": "CP03",
            "paso": "Paso 28"
          }
        ]
      },
      "evidenciaSemantica": "Notificación enviada al Representante Legal cuando la solicitud expira.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    },
    {
      "schemaVersion": "afi-knowledge-proposal/v1",
      "proposalId": "prop-notificacion-recordatorio-retoma",
      "entidad": {
        "tipo": "notificacion",
        "id": "notificacion-recordatorio-retoma",
        "descripcion": "Notificación 'Notificar Recordatorio Retoma Caso' enviada por correo."
      },
      "origen": {
        "fuente": "20260918_CLS_AFI_HU 7.14 y 7.14.1 V1_Casos de prueba.xlsx",
        "ocurrencias": [
          {
            "hu": "HU 7.14",
            "caso": "CP03",
            "paso": "Paso 28"
          }
        ]
      },
      "evidenciaSemantica": "Notificación de recordatorio enviada antes o durante la expiración del caso.",
      "estado": "PENDING_REVIEW",
      "revisiones": []
    }
  ],
  "classificationRequests": [],
  "testDataRequirements": [
    {
      "schemaVersion": "afi-test-data-requirement/v1",
      "id": "empresa-juridica-rues-con-representante-legal",
      "perfil": "empresa",
      "condiciones": [
        {
          "id": "empleador-juridico-rues-con-rep-legal",
          "descripcion": "Aportante tipo Empleador Jurídico existente en RUES, no afiliado a Colsubsidio, con información/número del Representante Legal retornado por RUES."
        }
      ],
      "camposRequeridos": [
        "numeroIdentificacion",
        "correo"
      ],
      "ocurrencias": [
        {
          "hu": "HU 7.14",
          "caso": "CP01"
        }
      ],
      "reutilizable": true
    },
    {
      "schemaVersion": "afi-test-data-requirement/v1",
      "id": "empresa-juridica-rues-sin-representante-legal",
      "perfil": "empresa",
      "condiciones": [
        {
          "id": "empleador-juridico-rues-sin-rep-legal",
          "descripcion": "Aportante tipo Empleador Jurídico existente en RUES, no afiliado a Colsubsidio, sin Representante Legal retornado por RUES."
        }
      ],
      "camposRequeridos": [
        "numeroIdentificacion",
        "correo"
      ],
      "ocurrencias": [
        {
          "hu": "HU 7.14",
          "caso": "CP02"
        },
        {
          "hu": "HU 7.14",
          "caso": "CP03"
        },
        {
          "hu": "HU 7.14",
          "caso": "CP04"
        }
      ],
      "reutilizable": true
    }
  ]
}

```
