# Inventario de datos AFI — piloto HU 14.12

Referencia temporal para la Fase 2B. Contiene **solo nombres y clasificación**, nunca valores del `.env`.
El modelo ejecutable está en [`afi/`](afi/): `modelo.ts` (tipos, `DataGapError`), `politicas.ts`
(políticas por campo con su evidencia), `resolver.ts` y `actores.ts` (adaptador del `.env` actual).

Clases: **test-case** (parte del requisito/assertion), **actor** (identidad QA reutilizable),
**derived** (se obtiene de otro dato), **auxiliary** (solo sirve para avanzar), **environment/secret**.

## 1. Campos de entrada observados

| Etapa | Campo | Perfiles | Clase | Sensibilidad | Estrategia auxiliar | Fuente actual |
|---|---|---|---|---|---|---|
| inicio-solicitud | tipoAportante | todos | test-case / actor | public | — | `AFI_CP01_TIPO_APORTANTE`, `perfilesAfi` |
| inicio-solicitud | tipoAfiliado | no empleador | actor / auxiliary | pii* | first-valid-option (alfabético) | `AFI_CP01_TIPO_AFILIADO`; CP04 elige automáticamente |
| inicio-solicitud | tipoEmpleador | empresa | actor | public | — | `perfilesAfi.empresa` |
| inicio-solicitud | naturaleza, claseEmpleador | empresa | auxiliary | public | first-valid-option (alfabético) | CP04 elige automáticamente |
| inicio-solicitud | tipoIdentificacion | todos | actor | public | — | `AFI_CP01_TIPO_IDENTIFICACION`, `perfilesAfi` |
| inicio-solicitud | numeroIdentificacion | todos | actor | pii | — (nunca se inventa) | `AFI_CP01_NUMERO_IDENTIFICACION`, `AFI_QA_*_IDENTIFICACION` |
| inicio-solicitud | correo | todos | actor | pii | — | `AFI_CP01_CORREO`, `AFI_QA_CORREO` |
| inicio-solicitud | confirmacionCorreo | todos | derived (= correo) | pii | — | `AFI_CP01_CONFIRMACION_CORREO`; CP04 ya lo deriva |
| inicio-solicitud | recibioAyudaAsesor | empresa | auxiliary | public | deterministic-text "No" | código fijo |
| inicio-solicitud | autorizaDatos, autorizaIntimidad | todos | auxiliary (test-case solo en un CP negativo) | public | boolean-required | `AFI_CP01_AUTORIZA_*`; CP04 fija `true` |
| telefonos | numeroCelular, numeroTelefonoFijo | no empleador | actor | pii | — | `AFI_CP01_NUM_CEL`, `AFI_CP01_NUM_CEL_FIJO` (CP04 los reutiliza) |
| informacion-adicional | fondoPensiones | independiente, facultativo | actor / auxiliary | pii* | first-valid-autocomplete | independiente: "cualquier opción válida"; `AFI_QA_FACULTATIVO_FONDO_PENSIONES` |
| informacion-adicional | actividad | independiente | actor | pii* | — | `AFI_CP01_ACTIVIDAD` |
| informacion-adicional | ingresoMensual | independiente | actor | pii | — | `AFI_CP01_INGRESO_MENSUAL` |
| informacion-adicional | nacionalidad, estadoCivil | facultativo | actor / auxiliary | pii* | first-valid-option (catálogo) | `AFI_QA_FACULTATIVO_NACIONALIDAD`, `AFI_QA_FACULTATIVO_ESTADO_CIVIL` |
| informacion-adicional | salarioBasico | facultativo | actor | pii | — | `AFI_QA_FACULTATIVO_SALARIO_BASICO` |
| informacion-contacto | departamento | todos | test-case (CP01/02/04) / auxiliary (CP03) | public | first-valid-option | literal en cada CP |
| informacion-contacto | ciudadVivienda | todos | test-case / derived (Bogotá) / auxiliary | public | first-valid-autocomplete | literal en cada CP |
| informacion-contacto | localidad, barrio | independiente | test-case (CP01) / auxiliary | public | first-valid-autocomplete, inicio alfabético | CP01 literal; CP02 `opcionValida()` |
| direccion | viaPrincipal, letrasVp, sectorVp, letrasVg | independiente | test-case (CP01 certificado) / auxiliary | public | first-valid-option | `completarDireccionCertificada` |
| direccion | numeroVp, numeroVg, numeroPredio | independiente | test-case (CP01) / auxiliary | public | deterministic-number (valores aceptados en QA) | `completarDireccionCertificada` |

\* `pii` conservador: `errorSeguro()` ya redacta estas variables (`TIPO_AFILIADO`, `ACTIVIDAD`, `FACULTATIVO_*`).

Los resultados esperados, como el texto de la alerta territorial, las listas de departamentos o la ausencia de
"Tipo de población", son **assertions** y no campos de entrada. Siguen en cada CP y en `resources/hu14-12/`.

## 2. Variables `AFI_*` del `.env`

| Variable | Clase | Destino sugerido (Fase 2B) |
|---|---|---|
| `AFI_CP01_NUMERO_IDENTIFICACION` | A · PII | Se queda en `.env` |
| `AFI_QA_EMPRESA_IDENTIFICACION` | A · PII | Se queda en `.env` |
| `AFI_QA_PENSIONADO_IDENTIFICACION` | A · PII | Se queda en `.env` |
| `AFI_QA_FACULTATIVO_IDENTIFICACION` | A · PII | Se queda en `.env` |
| `AFI_CP01_CORREO` | A · PII | Se queda en `.env` |
| `AFI_QA_CORREO` | A · PII | Se queda en `.env` |
| `AFI_CP01_NUM_CEL` | A · PII | Se queda en `.env` (ver duda sobre teléfonos sintéticos) |
| `AFI_CP01_NUM_CEL_FIJO` | A · PII | Se queda en `.env` (ver duda sobre teléfonos sintéticos) |
| `AFI_CP01_INGRESO_MENSUAL` | A · PII (dato económico del actor) | Se queda mientras no se conozca la validación de rango |
| `AFI_QA_FACULTATIVO_SALARIO_BASICO` | A · PII (dato económico del actor) | Se queda mientras no se conozca la validación de rango |
| `AFI_CP01_TIPO_APORTANTE` | B · dato de negocio público | Perfil del actor, en código |
| `AFI_CP01_TIPO_IDENTIFICACION` | B · dato de negocio público | Perfil del actor, en código |
| `AFI_CP01_ACTIVIDAD` | B · dato de negocio público | Perfil del actor, o auxiliar si se confirma que es neutra |
| `AFI_CP01_TIPO_AFILIADO` | B · dato de negocio público | Perfil del actor, o auxiliar si se confirma que es neutra |
| `AFI_CP01_CONFIRMACION_CORREO` | C · derivable | Eliminar (= correo) |
| `AFI_CP01_AUTORIZA_DATOS` | D · auxiliar | Eliminar (boolean-required) |
| `AFI_CP01_AUTORIZA_INTIMIDAD` | D · auxiliar | Eliminar (boolean-required) |
| `AFI_QA_FACULTATIVO_NACIONALIDAD` | D · auxiliar | Eliminar (first-valid-option) |
| `AFI_QA_FACULTATIVO_ESTADO_CIVIL` | D · auxiliar | Eliminar (first-valid-option) |
| `AFI_QA_FACULTATIVO_FONDO_PENSIONES` | D · auxiliar | Eliminar (first-valid-autocomplete) |

Estas no son datos sino guardas de ejecución que se pasan por corrida y no van en el `.env`:
`AFI_CP01_RUN_REAL`, `AFI_CP03_RUN_REAL`, `RECOVERY_SMOKE_REAL`, `CLEANUP_PENDIENTES`.

Entorno y secretos que no son AFI y se quedan en el `.env`: `BIZAGI_BASE_URL`, `BIZAGI_USER`, `BIZAGI_PASSWORD`,
`USUARIO_admin`, `CLAVE_admin`, `BIZAGI_API_*`, `BIZAGI_LOGIN_*`, `BIZAGI_PROCESS_ID_*`.

## 3. Dudas abiertas

1. **Teléfonos sintéticos.** Falta confirmar si QA acepta teléfonos sintéticos. Si los acepta, pasan a auxiliar determinístico.
2. **`tipoAfiliado` en CP01.** Hay que confirmar si el valor influye en la regla de HU 14.12 para independientes.
   Si influye, es test-case. En CP04 hoy es auxiliar.
3. **`ingresoMensual` y `salarioBasico`.** El piloto no demuestra su validación de rango (salario mínimo), así que no se inventan.
4. **Campos de dirección opcionales.** No se sabe si `letrasVp`, `sectorVp` y `letrasVg` son obligatorios para avanzar.
   Están marcados como `no-verificado`.
5. **Localidad y barrio según municipio.** Aparecen solo para algunos municipios (CP02 los marca N/A).
   La aplicabilidad del modelo es estática por perfil.
6. **Departamento auxiliar.** Elegir la primera opción puede llevar a Bogotá, que exige localidad y barrio.
   CP03 eligió CUNDINAMARCA/CHÍA a propósito. Falta confirmar qué orden de catálogo conviene.
7. **Fondo independiente precargado.** Si llega precargado, se conserva. La estrategia auxiliar solo aplica cuando está vacío,
   y eso le toca decidirlo a la capa UI.
8. **Sensibilidad `pii` conservadora.** Falta confirmar si `tipoAfiliado`, `actividad`, `nacionalidad`, `estadoCivil` y
   `fondoPensiones` deben tratarse como `pii`.
