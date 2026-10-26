# Entrada documental del piloto HU06 CP02

Transcripcion de la matriz existente; no modifica el Excel ni sus criterios. Los datos adicionales proceden de datasets.yaml. El contrato conserva referencias locales para las opciones y cuentas QA; no incluye credenciales.

## Paso 1

Objetivo:

Resultado esperado: Validar la radicación Masiva para la línea Autos, verificando el formulario inicial, la ruta Masiva y las reglas de Estructurar Información relacionadas con la consulta por Placa.

## Paso 2

Ingresar al ambiente Bizagi mediante la URL: https://test-aiprocesos-sde.bizagi.com/

Resultado esperado: El ambiente de pruebas se encuentra disponible y permite iniciar una nueva Radicación.

## Paso 3

Crear un nuevo caso y seleccionar Línea = Autos, junto con un Ramo y Tipo de Solicitud válidos.

Resultado esperado: El formulario presenta la información correspondiente a la configuración seleccionada.

## Paso 4

Seleccionar una Sucursal válida.

Resultado esperado: La Sucursal queda registrada y permite continuar con el diligenciamiento del formulario.

## Paso 5

Seleccionar Tipo de Radicación = Masivo.

Resultado esperado: Se habilitan la Descripción de la Solicitud (Masiva/Múltiple) y la sección Documentos Anexos.

## Paso 6

Validar el texto de ayuda de Masivo.

Resultado esperado: Se presenta el texto correspondiente a la modalidad Masivo para la línea Autos: “Masivo: Solicitud asociada a más de una póliza.”

## Paso 7

Diligenciar la narrativa, los campos obligatorios y los documentos requeridos.

Resultado esperado: El formulario queda diligenciado y permite crear la solicitud.

## Paso 8

Crear el caso.

Resultado esperado: Se crea correctamente la solicitud masiva.

## Paso 9

Validar la compuerta ¿Masivo?.

Resultado esperado: El caso toma la transición Masivo y continúa hacia el procesamiento del Worker AI.

## Paso 10

Validar la llegada a Estructurar Información.

Resultado esperado: El caso queda disponible para el Analista Centro de Expedición en la actividad Estructurar Información.

## Paso 11

Validar encabezado, Tipo de Consulta e Información a Consultar.

Resultado esperado: Se muestran los datos maestros en solo lectura, Tipo de Radicación Masivo, Sucursal y narrativa original de la solicitud.

## Paso 12

Validar la tabla Pólizas asociadas a la solicitud.

Resultado esperado: La tabla presenta los registros estructurados por el Worker AI y las columnas correspondientes a la información de consulta.

## Paso 13

Seleccionar un registro para editarlo.

Resultado esperado: Se presenta el formulario de edición correspondiente al registro seleccionado.

## Paso 14

Validar las opciones disponibles para la Forma de Consulta de acuerdo con la configuración del caso.

Resultado esperado: La Forma de Consulta y sus campos se presentan de acuerdo con la Línea, Tipo de Solicitud/Movimiento y reglas configuradas.

## Paso 15

Seleccionar la Forma de Consulta Placa, cuando la configuración del caso corresponda a esta opción.

Resultado esperado: Se muestra únicamente el campo Placa para diligenciar la información de consulta.

## Paso 16

Intentar confirmar el registro sin diligenciar Placa.

Resultado esperado: El formulario no permite confirmar el registro mientras el campo obligatorio Placa se encuentre vacío.

## Paso 17

Ingresar una Placa con caracteres alfanuméricos dentro de la longitud permitida.

Resultado esperado: El valor ingresado es aceptado y el registro puede ser confirmado.

## Paso 18

Ingresar una Placa que supere los 6 caracteres.

Resultado esperado: El sistema impide registrar un valor que supere la longitud máxima definida para el campo Placa.

## Paso 19

Confirmar la edición.

Resultado esperado: La información de consulta queda actualizada en la tabla Pólizas asociadas a la solicitud.

## Paso 20

Agregar un nuevo registro mediante el formulario de adición.

Resultado esperado: El formulario presenta las mismas reglas de visibilidad y obligatoriedad correspondientes al caso.

## Paso 21

Diligenciar y confirmar un registro válido.

Resultado esperado: El nuevo registro queda almacenado en la tabla de pólizas asociadas.

## Paso 22

Validar Observaciones, Documentos y Seguimiento.

Resultado esperado: Las tres secciones presentan la información correspondiente al caso y la trazabilidad registrada.

## Datos documentados

- INI-AUTOS-MASIVO.linea: Autos
- INI-AUTOS-MASIVO.tipo_radicacion: Masiva
- INI-AUTOS-MASIVO.narrativa: Ref. QA ${unico}.
- INI-AUTOS-MASIVO.narrativa_polizas: Se solicita realizar la modificación de las pólizas de automóviles 100245678 y 1109876543, asociadas a los vehículos de placas ABC123 y XYZ987, y de la póliza 9023456781 del vehículo de placa KLM456. El cambio corresponde a la actualización de la información registrada, manteniendo sin cambios los datos que no hagan parte del ajuste solicitado.
- EST-FILA-AUTOS-PLACA.placa: DEF456
- EST-FILA-AUTOS-PLACA.placa_nueva_fila: GHJ789
- EST-FILA-AUTOS-PLACA.placa_larga: MNP4567

Las variables funcionales y actores se resuelven localmente; la gema no puede inventar su disponibilidad.
