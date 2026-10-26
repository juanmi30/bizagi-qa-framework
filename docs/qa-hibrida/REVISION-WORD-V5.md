# Revisión interna del Word v5

La muestra [HU06_DEMO_ANONIMIZADA_REVISION_INTERNA_v5.docx](../../test-results/qa-hibrida/fase1.1/HU06_DEMO_ANONIMIZADA_REVISION_INTERNA_v5.docx) corrige únicamente los residuos conocidos de la copia v4. **Preparada técnicamente para revisión interna; no autorizada para distribución.** La autorización para compartir corresponde a la revisión humana de privacidad y presentación.

## Correcciones comprobadas

| Ubicación | Corrección |
|---|---|
| CP01-P1 | Colaboradores sustituidos por roles, en resultado obtenido, explicación automática y diagnóstico técnico. |
| CP01-P4 | Colaboradores sustituidos por roles en las tres apariciones, conservando las definiciones y fuentes pendientes. |
| CP05-P6 | Colaboradores sustituidos por roles en las tres apariciones, conservando criterios, incertidumbres y observaciones. |
| CP05-P8 | Confirmación funcional atribuida al rol en las tres apariciones; fecha, alcance y condiciones originales conservados. |
| CP02-P22, `sde-evidencia-050.png` | Dos celdas completas de Usuario cubiertas con píxeles sólidos; cabeceras, actividades y fechas legibles. |
| CP03-P25, `sde-evidencia-074.png` | Mismo tratamiento; eliminado el fragmento corporativo residual. |
| CP04-P23, `sde-evidencia-096.png` | Mismo tratamiento; eliminado el fragmento corporativo residual. |
| CP02-P18 | Solo el título «Causa» pasa a «Clasificaciones históricas». Conserva FAIL, intento fallido, longitud inconclusa, incidente posterior y revisión manual. |

Se inspeccionó todo el XML del paquete, incluidos atributos y contenido duplicado; la sustitución reconoce nombres fragmentados entre runs. No se generó un soporte nuevo desde los históricos: v5 se construyó directamente desde v4. Las tres imágenes se extrajeron **de v5** para inspección visual a resolución completa; el valor de Usuario está totalmente oculto y no se alteraron las actividades ni las fechas. Las otras 102 imágenes conservan exactamente sus bytes de v4. No se inventaron ni sustituyeron logos.

## Conservación y pruebas

- Cinco CP y 108 pasos en su orden: 91 PASS, 12 FAIL y 5 NOT_AUTOMATED. Aprobación funcional QA pendiente.
- Texto completo del cuerpo comparado párrafo a párrafo: solo roles y el título de P18 cambian. Resultados, esperados, observaciones, códigos, fuentes y decisiones pendientes conservados salvo sustituciones personales autorizadas.
- Estructura y atributos del cuerpo conservados, ZIP/XML/relaciones válidos y las 105 imágenes presentes. Los bytes originales de las tres imágenes corregidas no aparecen en ninguna parte del paquete final; no hay capas editables ni metadatos PNG recuperables en esas imágenes.
- **15/15 pruebas Python PASS**, incluidas las 8 previas y 7 de cierre v5. La integración local utiliza v4 sin versionarla; si no está disponible en otro equipo, esa prueba se omite explícitamente. Se comprueban nombres entre runs/atributos, regeneración, máscaras completas, conservación del documento real, rechazo de alteraciones funcionales y aborto si falta una imagen.
- **28/28 regresiones focalizadas del Word PASS**, TypeScript sin errores y `git diff --check` correcto.
- **784 archivos protegidos idénticos** por SHA-256: reportes/evidencias/soportes previos, v4 y los JSON e instrucciones de Gemini incluidos en el manifiesto. Sin cambios de contrato, matrices, lógica E2E ni fuentes de certificación.

Herramientas modificadas: `demo_anonima.py` incorpora el saneamiento de colaboradores y la cobertura íntegra de las dos celdas de Usuario de la tabla calibrada. `privacidad_word.py` centraliza las sustituciones en XML; `cerrar_demo_v5.py` realiza el cierre puntual y audita la copia antes de publicarla. `sde/certificacion.ts` ajusta únicamente el título de P18 para futuras generaciones. La auditoría falla si faltan las imágenes o cambia contenido funcional no autorizado.

```powershell
python -m unittest discover -s tools/qa-diseno -p 'test_*.py'
```

La generación puntual no sobrescribe destinos:

```powershell
python tools/qa-diseno/cerrar_demo_v5.py --base test-results/qa-hibrida/fase1.1/HU06_DEMO_ANONIMIZADA_REVISION_INTERNA_v4.docx --salida test-results/qa-hibrida/fase1.1/HU06_DEMO_ANONIMIZADA_REVISION_INTERNA_v5.docx --informe tmp/qa-hibrida-v5/verificacion.json
```

Si v5 ya existe, el comando se detiene; no se debe borrar ni sobrescribir una versión revisada para repetir la prueba. La suite usa salidas temporales independientes.

## Qué debe hacer Juan Miguel en Microsoft Word

1. Abrir **v5**, comprobar el nombre y usar **Guardar como** para crear `HU06_DEMO_ANONIMIZADA_REVISION_INTERNA_v5_REVISADA_EN_WORD.docx`, conservando la copia generada.
2. En el índice, pulsar botón derecho → **Actualizar campo** → **Actualizar toda la tabla**. También se puede usar **Referencias → Actualizar tabla**. Revisar que los títulos y números de página correspondan. Si Word ofrece actualizar otros campos, usar **Ctrl+A → F9** y elegir actualizar toda la tabla cuando lo solicite.
3. Activar **Vista → Diseño de impresión** y recorrer todas las páginas. Comprobar portada, índice, tablas, saltos, encabezados/pies, textos cortados, espacios anómalos y tamaño/legibilidad de las capturas.
4. Ampliar las capturas de CP02-P22, CP03-P25 y CP04-P23: Usuario debe quedar totalmente cubierto y actividades/fechas visibles. Revisar también todas las demás imágenes y las cuatro ubicaciones textuales, tanto en el cuerpo como en el anexo técnico.
5. En CP02-P18, confirmar que se lee «Clasificaciones históricas» y que sigue claro el FAIL inconcluso, sin concluir aceptación ni rechazo correcto de la placa larga.
6. Guardar la copia revisada y registrar quién revisó, fecha y si quedan ajustes de privacidad o presentación. Esa revisión no aprueba resultados funcionales ni autoriza Bizagi. Compartir únicamente después de la autorización humana correspondiente.

## Limitaciones pendientes

Se intentó `render_docx.py` sobre v5 y faltó LibreOffice (`soffice.exe`). Tampoco se encontró Word en las rutas estándar consultadas para conversión local. **No se declara comprobada la paginación ni la presentación visual completa.** No se instalaron herramientas ni se enviaron evidencias a servicios externos. La habilidad [Documentos](C:/Users/jmanrique_gattaca/.codex/plugins/cache/openai-primary-runtime/documents/26.1020.11127/skills/documents/SKILL.md) exige “Run `render_docx.py` to produce `page-<N>.png` images”; las comprobaciones estructurales y la inspección de tres PNG no sustituyen ese control pendiente.

Las reglas corrigen residuos conocidos y una tabla calibrada de dos filas; no garantizan anonimización universal de futuras vistas, nuevas personas o más filas. La inspección humana completa de privacidad sigue siendo necesaria. v4 y las versiones anteriores permanecen intactas y no se consideran aprobadas para compartir.

Rama: `feat/sde-soporte-certificacion-hu`, con cambios anteriores conservados y trabajo local sin commit. Sin Bizagi, casos nuevos, push ni merge. `.env`, Word y evidencias originales permanecen fuera de Git. Informe local: `test-results/qa-hibrida/fase1.1/verificacion-v5.json`.
