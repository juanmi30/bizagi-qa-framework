# Revisión exploratoria con dos analistas QA

> Actualización v5: usar la nueva copia y seguir el [cierre de privacidad y revisión en Word](REVISION-WORD-V5.md). La v4 conservaba residuos conocidos y no debe compartirse.

La sesión evalúa comprensión y fidelidad del diseño. No requiere entrar a Bizagi ni editar JSON. Ambos analistas revisan primero de forma independiente y luego comparan respuestas; Juan Miguel registra diferencias y solicitudes de cambio con su fuente documental.

## Material

- [Word de demostración anonimizado — revisión interna](../../test-results/qa-hibrida/fase1.1/HU06_DEMO_ANONIMIZADA_REVISION_INTERNA_v5.docx). Abrir la copia v5, sin distribuir externamente ni usar los soportes privados originales.
- [Entrada documental de CP02](piloto/entrada-documental.md): diseño y datos permitidos ya existentes.
- [Caso estructurado CP02](piloto/HU06-CP02.diseno.json) y [informe de validación](piloto/INFORME-VALIDACION.md), para consulta acompañada por Juan Miguel. El analista puede responder en una tabla o documento; no necesita modificar el JSON.
- [Cobertura de anonimización y pendientes](ANONIMIZACION-DEMO.md).

## Preguntas que cada analista debe responder

1. En CP02-P18, ¿qué intentó el robot, qué pudo leer y qué quedó sin demostrar? ¿Se distingue el incidente posterior de cierre? ¿El texto evita concluir aceptación o rechazo correcto de la placa larga?
2. En P14/P22, ¿se distingue presencia/navegación de validación completa de opciones, contenidos y reglas? Señalar el texto que resulte ambiguo y la fuente que permitiría aclararlo.
3. ¿Se entiende cada estado de continuidad y dónde encontrar la captura y el diagnóstico original? ¿Se mantiene visible el FAIL sin convertirlo en una clasificación definitiva de defecto?
4. ¿Son correctos los datos y sus procedencias? ¿Qué referencias QA deben existir y quién confirmará permisos, vigencia y relaciones? ¿Qué mensajes exactos o reglas faltan en los documentos?
5. ¿Las responsabilidades robot/analista, evidencia pendiente y decisión de continuar son suficientes en P1/P14/P18/P22? ¿Qué condición debe acreditarse y qué ocurre si nadie completa la revisión?
6. ¿El orden efectivo conserva el sentido del diseño? P18 sucede al final después de P22; P19 no depende de P18; Guardar compartido P17/P19 no se repite por referenciarlo dos veces.
7. Revisar cada captura ampliada: ¿quedan nombres, correos, cuentas o iniciales identificables? ¿Se leen los campos, valores, mensajes y recorrido? ¿Las máscaras afectan alguna interpretación? Registrar número de CP/paso e imagen; no copiar datos privados al acta.
8. Revisar paginación en Word: ¿hay texto cortado, capturas ilegibles, tablas divididas o páginas vacías? Falta aún el render automatizado por LibreOffice ausente.

## Registro sugerido

| Analista | CP/paso o sección | Se entiende / requiere ajuste | Respuesta o cambio solicitado | Fuente para resolverlo | Responsable y pendiente |
|---|---|---|---|---|---|
| A | | | | | |
| B | | | | | |

**Aprobar el diseño documental** significa acordar que refleja las fuentes, datos, orden causal y responsabilidades revisadas. La decisión se registrará separadamente y ligada al hash del diseño. No implica aprobar resultados funcionales, autorizar ejecutar/crear casos, certificar datos externos, aprobar la herramienta completa ni permitir distribución externa de evidencias. No hay aprobación registrada en esta entrega.

## Pendientes y siguiente sesión

P18 requiere comprobación manual futura autorizada; P14/P22 tienen cobertura parcial. Las cuentas y opciones no se verificaron en QA. El perfil semántico propuesto necesita revisión. El OCR puede omitir datos; QA debe revisar toda la copia y su legibilidad. El logo no funcional de la plantilla está oculto por formato no calibrado. No hay interfaz ni reanudación implementadas. Gemini debe preguntar antes de producir un contrato completo cuando falten fuentes/reglas.

Con las respuestas de ambos analistas, acordar fuentes y obligaciones y registrar una revisión controlada del contrato. Probar después varios diseños anonimizados con el validador offline antes de plantear integración o ejecución híbrida real.
