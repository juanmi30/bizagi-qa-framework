# QA híbrido fase 1.1 — correcciones offline

Trabajo autorizado por Juan Miguel a partir de la revisión independiente de Work. Rama `feat/sde-soporte-certificacion-hu`. Se conservaron los cambios locales de fase 1 y su copia de referencia en `tmp/qa-hibrida-fase11/fase1-original/`. No se leyó ni publicó el `.env` real, no se ejecutó Bizagi ni se crearon casos. Sin commit, push o merge.

## Cambios

- `sde/hallazgosHumanos.ts` y `sde/certificacion.ts`: P18 inconcluso, intento/lectura/no demostrado/incidente posterior/manual; P14/P22 alcance parcial; tres continuidades; diagnóstico técnico original en anexo. Fecha de generación y fechas derivadas de fuentes seleccionadas solo en soportes nuevos. Resultado, causa y diagnóstico histórico sin reclasificar.
- Schema, piloto, `tools/qa-diseno/contrato.mjs` y `sde/disenoQa.ts`: v1.1, orden documental distinto del plan nativo único, dependencias causales, cobertura compartida sin duplicación y responsabilidades robot/analista/evidencia/continuación. Perfil registrado `data/qa-hibrida/HU06-CP02-v1.1.json`, propuesto y pendiente de QA; comparación de datos por paso contra capacidades expandidas y protección semántica. Actualización futura controlada documentada.
- Herramientas `demo_anonima.py`, `ocr-capturas.ps1`, `auditar_demo.py` y pruebas Python: máscaras de píxeles, nuevo paquete sin originales ocultos y comprobación local. AFI, escenarios, datasets y matrices no se modificaron.
- [Contrato](../../qa-hibrida/PROPUESTA-CONTRATO.md), [gema](../../qa-hibrida/INSTRUCCIONES-GEMA-GEMINI.md), [piloto](../../qa-hibrida/piloto/INFORME-VALIDACION.md), [anonimización](../../qa-hibrida/ANONIMIZACION-DEMO.md) y [guía de dos analistas](../../qa-hibrida/GUIA-REVISION-DOS-ANALISTAS.md).

## Verificación

63/63 regresiones offline PASS: Word, conservación de fuentes, históricos versionados, contrato, AFI y orquestador con runner sintético. Tras completar evidencia manual explícita del contrato, 49/49 focalizadas finales PASS y TypeScript sin errores. 8/8 pruebas de privacidad PASS. El wrapper de validación y puente nativo devuelven válido para revisión y `listoParaEjecutar=false`, con entorno vacío de demostración.

Comando Word ejecutado offline: `npm run sde:hu06:word`; fuente nueva privada `test-results/seguros-del-estado/soportes/HU06/2026-10-22T19-17-59-815Z/`. No se ejecutó `sde:hu06` real; sus rutas real/simulación/Word están cubiertas por el runner sintético de la regresión. No hay motor ni interfaz híbrida nueva.

Muestra de revisión interna: `test-results/qa-hibrida/fase1.1/HU06_DEMO_ANONIMIZADA_REVISION_INTERNA_v4.docx`. Auditoría real: XML/relaciones correctos, 5 CP, 108 pasos, 91 PASS/12 FAIL/5 NOT_AUTOMATED, fuentes/selección/causas/obtenidos/observaciones originales preservados; 104 capturas representativas y 105 imágenes recodificadas en la copia. **776 archivos históricos idénticos** por SHA-256. Los OCR originales y fuentes intermedias son privados. El segundo OCR sobre las 105 imágenes finales no detecta correos/tokens de identidad aprendidos/números no catalogados. Eso no certifica privacidad universal.

Las capturas se revisaron en hojas de contacto y con ampliaciones clave. Falta revisión QA individual de privacidad y legibilidad; logo no funcional totalmente cubierto y posible enmascaramiento de fragmentos auxiliares. **No apta para distribución externa**. `render_docx.py` se intentó y no encontró `soffice.exe`; paginación visual pendiente. La ejecución de pruebas necesitó permisos fuera del sandbox para procesos hijos/temporales; las comprobaciones continuaron siendo locales y sin navegador QA.

## Siguiente fase y riesgos

Revisar con dos analistas las obligaciones P1/P14/P18/P22, claridad de continuidad y perfil de dependencias. Resolver faltantes/contradicciones contra fuentes reales, nunca por JSON completo ficticio de Gemini. QA debe confirmar disponibilidad, permisos y datos externos en una fase autorizada. Después evaluar varios diseños anonimizados antes de integrar la gema al ejecutor. La aprobación documental autenticada, puente AFI completo y reanudación real son trabajo posterior. No se registró ninguna aprobación QA.
