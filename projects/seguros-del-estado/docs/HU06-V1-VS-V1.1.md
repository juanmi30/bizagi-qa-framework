# HU06: requerimiento V1 frente a V1.1 y precedencia (2026-10-16)

**Fuentes locales** (no versionadas, `*.docx` en `.gitignore`): `20260909_SED_CEL_V1_Documentos_de_requerimientos_HU06_V1.docx` y `…_V1.1.docx`, en la raíz del repositorio y en `HU_06/`.

**Precedencia acordada** (orquestador y Juan Miguel, 2026-10-16):
1. V1.1 para el flujo vigente, sujeta a que QA confirme su vigencia.
2. El diseño de pruebas aprobado (`fuentes/20260928_SDE_CEL_V1_Casos de Prueba_HU06.xlsx`).
3. Las aclaraciones de QA (Daniel, 16/10).

Nada de la V1 que la V1.1 sustituye se aplica.

## Discrepancias

| Tema | V1 | V1.1 | Diseño CP | Decisión |
|---|---|---|---|---|
| Captura de pólizas en Masivo | Campo «Números de Pólizas» separados por «;» | Narrativa de hasta 500 caracteres («Descripción de la Solicitud (Masiva/Múltiple)») | Narrativa (CP01 P8–P9) | **V1.1.** El portal muestra la narrativa |
| Procesamiento | Sin procesamiento posterior | Worker AI asíncrono (Scheduler) que extrae y estructura una tabla | Worker y Estructurar (CP01 P12, CP02 P9–P12) | **V1.1** |
| Validación contra sistemas externos | Fuera de alcance | Fuera de alcance (existencia de pólizas) | — | Coinciden. **Datos ficticios válidos** para la extracción (Daniel, 16/10) |
| Actividad del analista | No existe | «Estructurar Información»: encabezado y narrativa de solo lectura, tabla editable en pop-up, Observaciones, pestañas | CP01 P13–P29, CP02 P10–P22 | **V1.1** |
| Texto de ayuda Masivo | — | Generales/Autos: «Masivo: Solicitud asociada a más de una póliza.» · Cumplimiento: «… de cumplimiento y/o RCE.» | Iguales en CP01, CP02, CP03 y CP04 | Coinciden |
| ¿Cambio de intermediario? | — | Booleano si Renovación o Modificación; «Sí» exige Carta de nombramiento | No figura en los CP (OBS-08) | Se diligencia «No» donde aparece. La regla «Sí» no tiene CP; se propone a QA |
| Documentos | Carga de uno o varios | Obligatorios según parametrización; máximo 20 archivos y 24 MB; formatos .doc, .docx, .xls, .xlsx, JPG, GIF y .ZIP | CP01 P9: «adjuntar los documentos obligatorios parametrizados» | V1.1 **no** describe la secuencia «guardar la fila antes de elegir el tipo» (BUG-01). Sigue pendiente (P-02) |
| Límite de la narrativa | — | 500 caracteres | Sin CP específico | Las narrativas de prueba se mantienen por debajo de 500 (regresión). No se agregó una prueba negativa sin CP aprobado |
| Generales, Póliza Nueva | — | Forma de Consulta «Identificación de Tomador» (no editable); exige Tipo y Número de Documento; NIT → Dígito de Verificación | CP01 P19–P25 | Coinciden |
| Generales/Cumplimiento, Modificación | — | Forma «Número de póliza» (no editable), obligatorio | CP03 P13 | Coinciden |
| Cumplimiento: RCE | — | El booleano «¿Requiere modificar RCE?» aparece si el Ramo **NO** tiene la propiedad «Póliza RCE»; «Sí» exige Ramo RCE y Número de Póliza RCE | CP03 (sin propiedad → pregunta) y CP04 (con propiedad → sin pregunta) | **Coinciden; no hay contradicción.** Falta saber qué Ramos tienen la propiedad (dato paramétrico, P-22) |
| Autos: forma de consulta | — | Párrafo bajo el encabezado de Cumplimiento: «Si el movimiento es Modificación: el analista puede seleccionar Número de póliza o Placa; solo se muestra el campo elegido» | CP02 P14–P15: «seleccionar la Forma de Consulta Placa» | Aplicado **solo a Autos**: el párrafo parece ser de Autos (falta su encabezado). Verificado en QA (caso 651). Que aplique a otras líneas está por confirmar |
| Restricciones de datos | Formato de pólizas | Número de póliza y de póliza RCE: numérico de 9 a 12 · Placa: alfanumérica de hasta 6 | CP02 P17–P18, CP03 P14/P22, CP04 P16–P18 | Coinciden |
| Cierre del pop-up | — | No se permite cerrar con obligatorios vacíos | CP02 P16, CP03 P15/P20, CP04 P18 | Coinciden (verificado en CP02) |
| Asignación de Estructurar | — | **Por carga**: intermediario especial → alcance por Línea/Sucursal → administrador | — | Explica que el work item llegue con demora y que podría asignarse a otro analista |
| CP05 (Individual) | — | «Individual → ruta regular hacia el flujo de consulta unitaria» | P9: «continúa por el camino regular… y **no** es enviado al Worker AI ni a Estructurar» | P9 es una aserción **negativa**: no depende de que el Worker funcione. La ausencia de Estructurar se observa; la del Worker no es observable desde el portal. Los nombres de la ruta siguen pendientes (P-18) |
