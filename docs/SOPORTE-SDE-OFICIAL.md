# Soporte oficial SDE con lenguaje natural y evidencias originales

Muestra generada offline mediante `npm run sde:hu06:word`:

[20261022_SDE_CEL_HU06_Soporte_Certificacion_Cliente.docx](../test-results/seguros-del-estado/soportes/HU06/2026-10-22T20-47-31-279Z/20261022_SDE_CEL_HU06_Soporte_Certificacion_Cliente.docx).

Es el soporte oficial para QA y cliente por los canales corporativos autorizados por Juan Miguel. **No aplica anonimización**, máscaras ni sustitución de colaboradores: usa nuevamente las capturas originales archivadas. Las demostraciones v4/v5 y los soportes anteriores permanecen intactos. Las contraseñas, tokens y cookies siguen excluidos; esa exclusión técnica no cambia los archivos de ejecución ni las políticas de Colsubsidio u otros proyectos.

## Lectura y conservación

Cada paso conserva número, acción y esperado de la matriz, resultado observado resumido y estado original. Solo se añaden hallazgo, continuidad y revisión QA cuando corresponden. Se eliminó la repetición del intento y la comprobación automática; el resultado natural se obtiene de los hechos registrados (campo/valor, lectura, guardado, extracción, actividad, recorrido o pendiente documental), sin convertir la mera presencia de un control en validación completa. Si un registro futuro no permite un resumen fiable, el documento lo reconoce y remite al original.

El **Detalle técnico y trazabilidad**, separado por caso, conserva causas, códigos, diagnósticos originales completos, observaciones automáticas, procedencia y nombres de las capturas asociadas; los incidentes siguen independientes del resultado. Las observaciones particulares, advertencias de selección, antecedentes de otros casos, espacio editable del analista y aprobación funcional pendiente se conservan. CP02-P18 mantiene FAIL, intento fallido, longitud inconclusa e incidente posterior; P14/P22 explican el alcance parcial.

Verificación de la muestra: cinco CP, **108 pasos: 91 PASS, 12 FAIL y 5 NOT_AUTOMATED**. Selección, casos, resultados y hallazgos del plan coinciden exactamente con la muestra privada anterior. **104 capturas representativas incrustadas**, idénticas por SHA-256 a las originales; se conservan las **166 referencias de capturas** en el plan y sus nombres en el anexo. No se reconstruyeron datos desde imágenes censuradas. **797 archivos protegidos** (fuentes, reportes, imágenes, soportes y documentos previos) permanecen idénticos.

## Logo y configuración

Recurso reutilizable: [logo-seguros-del-estado.png](../projects/seguros-del-estado/assets/branding/logo-seguros-del-estado.png). PNG de **900 × 312**, copiado sin recodificar desde `xl/media/image5.png` del Excel HU06 original. Se inspeccionaron visualmente sus recursos: es la lámpara naranja con el nombre Seguros del Estado, distinto de los logos Gattaca y de la fotografía incluidos en el libro. No se modificó el Excel ni se descargó una imagen externa. [Procedencia y hash](../projects/seguros-del-estado/assets/branding/README.md).

En `projects/seguros-del-estado/certificacion/HU06.json`:

```json
"logoCliente": "../assets/branding/logo-seguros-del-estado.png"
```

La ruta es relativa al directorio `certificacion/`, según el contrato existente del generador. Cada HU puede configurar su recurso sin rutas absolutas; el renderizador recibe los bytes del logo. No se vuelve a extraer en cada ejecución. La inserción reemplaza `[Logo Cliente]`, conserva proporción y respeta la celda efectiva. Los recursos Gattaca y los pies de la plantilla permanecen idénticos por bytes. El generador AFI no se modificó.

## Tres ejemplos antes y después

| Paso | Antes, en la lectura principal | Ahora, basado en la misma corrida |
|---|---|---|
| CP01-P1 | Bloque de ortografía con `EST-ORTOGRAFIA`, `ORT-TERMINO-POLIZA`, fuente y definiciones pendientes, repetido en varios apartados. | «El título “Detalle Polizas Asociadas” aparece sin la tilde de “Pólizas”. Hay diferencias entre los nombres de campos del diseño y los mostrados por Bizagi; falta confirmar cuáles son las etiquetas aprobadas». La revisión pide decidir entre Tipo de Movimiento/Tipo de Solicitud y Tipo de Radicación/Tipo Radicación. |
| CP02-P17 | Texto de tecleo, lectura y confirmación del pop-up mezclado con el resultado y repetido como comprobación automática. | «Tras introducir “DEF456” en “Placa”, se leyó “DEF456”. Se confirmó el formulario. Al leer la fila guardada se comprobó Placa: DEF456». No se afirma persistencia a partir de la mera lectura del campo: la fuente contiene la lectura de la fila guardada. |
| CP02-P18 | Intento de escritura, valor anterior, dificultad de localización y cierre, mezclados en un bloque largo. | «El robot no consiguió introducir la placa larga en la forma esperada; el formulario mostró el valor anterior». El hallazgo aclara que no se demostró aceptación ni rechazo correcto de la longitud; el incidente posterior y la revisión manual se presentan separados. El FAIL histórico permanece. |

Los textos y códigos íntegros de los tres ejemplos permanecen en el anexo; no se eliminan hallazgos.

## Comandos y regresiones

- `npm run sde:hu06`: conserva el orquestador existente, ejecución de los cinco CP y generación del soporte al terminar, incluso ante FAIL. Su ruta se verificó con el runner sintético; **no se ejecutó Bizagi**.
- `npm run sde:hu06:word`: ejecutado realmente en esta fase, solo sobre resultados archivados. Generó un archivo nuevo con logo, lenguaje natural y capturas originales.
- `npm run sde:hu06:simular`: ruta comprobada por regresión sintética, sin creación de casos.

No se alteró la selección de últimas ejecuciones finalizadas, las continuaciones del mismo caso ni las advertencias. Cada generación sigue creando una carpeta/archivo nuevos, sin sobrescribir documentos editados por QA.

**46/46 regresiones SDE PASS**, incluidos conservación, históricos versionados, redacción, Word, datos/contrato previo y orquestador. Tras ampliar la exclusión de secretos a JSON y variables técnicas, **7/7 focalizadas PASS** y TypeScript correcto. `git diff --check` sin incidencias. La auditoría real `tools/qa-diseno/auditar_oficial.py` compara la muestra con el plan anterior, fuentes, capturas y logos; informe local `tmp/word-oficial/verificacion.json`.

```powershell
$env:SDE_E2E='0'
$env:CI='1'
$env:BIZAGI_BASE_URL='http://portal.sintetico.local'
node tools/run.mjs seguros-del-estado soporte-natural.unit soporte-hu.unit soporte-regresion-real.unit soporte-conservacion.unit qa-hibrida.unit orquestador-hu.unit --grep '@unit' --workers=1 --retries=0 --reporter=list --output=tmp/word-oficial/tests-final
node node_modules/typescript/bin/tsc --noEmit
```

**Colsubsidio: comprobación incompleta por una dependencia local ausente.** Se intentaron sus 32 pruebas de soporte: 8 PASS y 24 fallaron al no encontrar `20260910_CLS_AFI_HU 14.12_V2_Casos_Prueba.xlsx` en la raíz. Los 24 errores corresponden a ese archivo ausente, no a diferencias observadas del render. No se fabricó el Excel ni se cambiaron las pruebas AFI para ocultar la limitación. Hay que disponer del original para repetir la suite completa. El código `projects/colsubsidio/` y `shared/` no se modificó; las pruebas SDE verifican conservación de plantilla, pies, recursos Gattaca y geometría del cliente.

## Presentación y revisión en Word

Se mantuvo la plantilla corporativa. Los títulos quedan unidos al párrafo siguiente; los bloques cortos evitan fragmentación y las capturas mantienen proporción con límite de altura. Los espacios de observaciones siguen editables y no hay protección de edición forzada en el documento. No se añadieron firmas ni aprobaciones.

Se intentó el render local con `render_docx.py`, pero sigue ausente LibreOffice (`soffice.exe`). **No se declara comprobada la paginación visual.** La habilidad [Documentos](C:/Users/jmanrique_gattaca/.codex/plugins/cache/openai-primary-runtime/documents/26.1020.11127/skills/documents/SKILL.md) requiere “Run `render_docx.py` to produce `page-<N>.png` images”; las verificaciones de XML, relaciones y proporciones no sustituyen ese control visual pendiente.

Juan Miguel debe abrir esta nueva muestra oficial en Microsoft Word, actualizar **todo el índice**, revisar todas las páginas en Diseño de impresión y ampliar encabezados/pies y capturas. Confirmar legibilidad de ambos logos, ausencia de recortes/superposiciones, títulos sin quedar aislados y espacios de observaciones utilizables. Guardar la versión revisada con otro nombre para conservar la generada. La revisión funcional y aprobación siguen correspondiendo a QA.

## Archivos y Git

Cambios de esta entrega: `sde/certificacion.ts`, nuevos `sde/redaccionSoporte.ts` y `sde/secretosSoporte.ts`, configuración de logo HU06, `assets/branding/`, pruebas `soporte-natural.unit.spec.ts` y ajustes de expectativas/fixtures en dos pruebas de Word existentes. Auditoría offline nueva y esta documentación. No se modificaron escenarios, matrices, contrato híbrido, instrucciones Gemini, reglas ni protecciones E2E.

Se conservaron los cambios locales anteriores. Rama `feat/sde-soporte-certificacion-hu`, sin commit, push ni merge. Word, `.env`, capturas e informes privados siguen fuera de Git; el logo autorizado y su procedencia son recursos versionables del proyecto.
