# Adopción híbrida QA fase 1

Trabajo offline autorizado por Juan Miguel. Sin Bizagi, casos nuevos, cambios de criterios, edición de matrices, push ni merge.

SDE: el Word incorpora resumen y explicaciones para el analista, continuidad sustentada en pasos posteriores registrados, y sección secundaria con estados, causas, procedencia, incidentes y diagnósticos originales. Conserva consolidación por HU, capturas y aprobación QA pendiente. La muestra usa exclusivamente ejecuciones anteriores; 108 pasos y sus estados preservados. Verificación de 422 archivos históricos idénticos y 104 capturas representativas incrustadas.

Contrato: envelope documental `qa-diseno-hibrido/v1`, schema cerrado y validador offline, con puente de fidelidad/preflight a SDE. Reutiliza conceptos de AFI v1/E2E y conserva intactos sus validadores. No introduce un motor, interfaz o dependencias nuevas. Propuesta, límites y siguientes pasos: [contrato](../../qa-hibrida/PROPUESTA-CONTRATO.md).

Piloto: HU06-CP02, 22 pasos y 12 datos documentados; 20 pasos automáticos y P1/P18 híbridos, con responsabilidades manuales explícitas. Entorno vacío de demostración detecta datos faltantes sin exponer valores. No se afirma disponibilidad real ni autorización de ejecución. [Informe y entregables](../../qa-hibrida/piloto/INFORME-VALIDACION.md).

Validación final: TypeScript correcto; 40/40 regresiones y herramienta offline PASS; `sde:hu06:word` produce un archivo nuevo, sin alterar resultados anteriores. `render_docx.py` no pudo renderizar por LibreOffice ausente: comprobación estructural completada y paginación visual pendiente. La revisión con analistas QA sigue siendo el siguiente paso, no una aprobación ya obtenida.
