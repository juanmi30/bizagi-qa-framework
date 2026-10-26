# Piloto HU06 CP02 — revisión de calidad fase 1.1

El contrato `qa-diseno-hibrido/v1.1` es **válido para revisión documental**: conserva 22 pasos de la matriz, acciones y esperados literales, actores y 12 datos documentados. La validación es offline y siempre informa `listoParaEjecutar=false`. No demuestra disponibilidad de QA, aprobación funcional ni una integración Gemini–ejecutor.

| Material de revisión | Archivo |
|---|---|
| Diseño transcrito y datos permitidos | [entrada-documental.md](entrada-documental.md) |
| Caso estructurado | [HU06-CP02.diseno.json](HU06-CP02.diseno.json) |
| Informe reproducible, sin datos privados | [validacion.json](validacion.json) |
| Contrato, controles y actualización futura | [PROPUESTA-CONTRATO.md](../PROPUESTA-CONTRATO.md) |
| Preguntas y borradores para la gema | [INSTRUCCIONES-GEMA-GEMINI.md](../INSTRUCCIONES-GEMA-GEMINI.md) |
| Revisión por dos analistas | [GUIA-REVISION-DOS-ANALISTAS.md](../GUIA-REVISION-DOS-ANALISTAS.md) |

## Cobertura y responsabilidades

Hay **18 pasos declarados automáticos** (P2–P13, P15–P17, P19–P21) y **4 híbridos** (P1, P14, P18 y P22). Es cobertura prevista, no una nueva ejecución ni aprobación. Cada paso declara robot, analista, alcance automático, pendiente manual, evidencia y decisión de continuación.

- P1: QA revisa el objetivo completo y su cobertura, además de las comprobaciones disponibles.
- P14: el registro demuestra presencia de Forma Consulta y ausencia de Número de Documento Tomador en la vista. No demuestra todas las opciones ni sus reglas. QA contrasta catálogo y comportamiento.
- P18: el robot no consiguió introducir la placa larga como esperaba y leyó el valor anterior. **No se demuestra que Bizagi acepte más de seis caracteres ni que rechace correctamente esa longitud.** Después falló la localización/comprobación del campo y se registró dificultad de cierre o recuperación. Son hechos separados; el FAIL y los códigos históricos permanecen. QA debe repetir manualmente la entrada y la lectura independiente, y revisar el cierre por separado, en una fase autorizada.
- P22: visibilidad, editabilidad y navegación no prueban todos los contenidos, mensajes y reglas de las secciones. QA revisa la parte restante del esperado.

Se distinguen continuación normal, terminación con dificultad de recuperación y continuidad desconocida. Las acciones posteriores no garantizan que una escritura pueda repetirse. La ausencia de intervención humana deja pendiente o detiene según el contrato; no existe un nuevo motor de reanudación.

## Orden y fidelidad

La matriz mantiene P1–P22. El escenario nativo tiene **34 capacidades únicas**. P18 usa 31–34 después de P22; P19 no depende de P18. La capacidad 23 corresponde a P17 y P19 y se ejecuta una sola vez. Las dependencias son causales, no una cadena de numeración documental.

El puente compara datos por paso derivados del escenario, precondiciones, dependencias, responsabilidades, modalidad, plan, acciones y esperados. El perfil local está registrado como **propuesta pendiente de revisión QA**, no aprobado. La gema no puede seleccionar otro perfil. Los cambios legítimos requieren nueva versión trazable, decisión QA y actualización explícita del registro y hashes; el Schema solo no garantiza fidelidad. AFI y los escenarios nativos siguen intactos.

## Preflight

El informe usa un **entorno vacío de demostración**, sin leer el `.env` real. Detecta antes de abrir navegador la URL, proceso, credenciales/dominios de actores y opciones Ramo/Movimiento/Sucursal. Solo publica nombres de variables. La presencia futura de valores no demostrará vigencia, permisos ni relaciones en SISE. La narrativa y placas sintéticas de Masiva no son registros existentes externos.

## Verificación

**63/63 regresiones offline PASS**, incluidas fidelidad de datos P17, obligaciones manuales, precondiciones, dependencias, circularidades, orden efectivo y duplicados, P18 inconcluso, alcance parcial P14/P22, conservación del Word, compatibilidad nativa AFI y orquestador sintético. TypeScript sin errores. Las pruebas de anonimización se documentan en el [registro de la muestra](../ANONIMIZACION-DEMO.md).

```powershell
$env:SDE_E2E='0'
$env:CI='1'
$env:BIZAGI_BASE_URL='http://portal.sintetico.local'
node tools/run.mjs seguros-del-estado qa-hibrida.unit qa-hibrida-calidad.unit soporte-hu.unit soporte-regresion-real.unit soporte-conservacion.unit orquestador-hu.unit qa-diseno.tool --grep '@unit|@qa-diseno' --workers=1 --retries=0 --reporter=list --output=tmp/qa-hibrida-fase11/tests
node node_modules/typescript/bin/tsc --noEmit
python -m unittest discover -s tools/qa-diseno -p test_demo_anonima.py
```

`sde:hu06` y sus variantes se verificaron con el runner sintético de regresión, sin Bizagi. `npm run sde:hu06:word` sí se ejecutó offline sobre reportes existentes y produjo un documento nuevo. La versión real de HU06 no se ejecutó.

## Word de revisión

Usar únicamente la copia [HU06_DEMO_ANONIMIZADA_REVISION_INTERNA_v4.docx](../../../test-results/qa-hibrida/fase1.1/HU06_DEMO_ANONIMIZADA_REVISION_INTERNA_v4.docx) para esta revisión interna. Los soportes previos y sus imágenes son privados; no son muestras aprobadas para compartir.

Conserva 5 CP, **108 pasos: 91 PASS, 12 FAIL y 5 NOT_AUTOMATED**, esperados, obtenidos, causas, observaciones, incidentes y aprobación QA pendiente. Los textos identificables de la copia se ocultan; las fuentes privadas permanecen intactas. Fechas de ejecución se toman de los reportes seleccionados y se distingue la generación offline del 22/10/2026. Se validaron ZIP, XML, relaciones, 104 capturas representativas y 105 imágenes reemplazadas; **776 archivos históricos permanecen idénticos** por SHA-256.

Las imágenes incrustadas se revisaron en hojas de contacto y a resolución completa en zonas clave. QA debe revisar cada imagen, privacidad y legibilidad. La paginación final no pudo renderizarse porque falta LibreOffice (`soffice.exe`). La [habilidad Documentos](C:/Users/jmanrique_gattaca/.codex/plugins/cache/openai-primary-runtime/documents/26.1020.11127/skills/documents/SKILL.md) requiere “Run `render_docx.py` to produce `page-<N>.png` images”; la comprobación estructural no sustituye ese control visual pendiente. No se usó conversión externa. **Muestra no apta para distribución externa.**

## Pendientes

QA debe acordar el alcance de los cuatro pasos híbridos y aprobar o corregir la propuesta de dependencias; completar datos y reglas documentadas; y revisar privacidad y presentación. Después conviene probar intake con varios diseños anonimizados y medir fidelidad/faltantes antes de integrar Gemini con el runner. La ficha autenticada sin edición manual de JSON, puente AFI y eventual ejecución híbrida requieren una fase posterior autorizada.
