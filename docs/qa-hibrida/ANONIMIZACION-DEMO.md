# Copia de demostración: alcance y revisión pendiente

> **Cierre posterior v5:** la revisión humana detectó nombres de colaboradores y valores parciales de Usuario en v4 que el OCR auxiliar no había señalado. Corregidos en [v5 y su guía de revisión](REVISION-WORD-V5.md). Usar v5 para la siguiente revisión interna; el registro siguiente documenta la fase anterior, sin certificar la distribución de v4.

Usar [HU06_DEMO_ANONIMIZADA_REVISION_INTERNA_v4.docx](../../test-results/qa-hibrida/fase1.1/HU06_DEMO_ANONIMIZADA_REVISION_INTERNA_v4.docx). Está marcada **NO APTA PARA DISTRIBUCIÓN EXTERNA**. Las versiones v1/v2/v3 son intermedias de calibración y no son la muestra de revisión. Los soportes anteriores no se reclasifican como anónimos.

## Qué se hizo

Se generó un soporte nuevo desde los reportes existentes y se construyó otro paquete DOCX, sobre copias, con **105 imágenes reemplazadas** (104 capturas representativas y una imagen de plantilla). Las máscaras grises son píxeles sólidos, sin transparencias, capas recuperables ni imágenes originales debajo. Los PNG se recodifican sin metadatos. El paquete no conserva los bytes de ninguna imagen original; tampoco miniaturas, comentarios, objetos embebidos, customXML ni propiedades personalizadas. Se limpian autores, correos, cuentas y textos identificables reconocidos en XML; se retiran relaciones externas. Las relaciones internas y XML se comprobaron.

| Zona | Tratamiento en la copia |
|---|---|
| Avatar superior y panel lateral de perfil | Máscaras fijas en las capturas calibradas de 1440×900. |
| Creador del caso | Valor cubierto en el encabezado, sin cubrir el número del caso ni sus fechas. |
| Tarjetas de Usuarios: nombres, correos, cuentas e iniciales | Máscara por anclajes OCR y zona de respaldo del panel lateral inferior; puede cubrir también accesos auxiliares de Plan/Eventos. |
| Vistas de 1475×900 | Se distingue Consulta Gráfica (valor del Usuario Creador cubierto, recorrido visible) del listado del portal (avatar superior cubierto, cabeceras legibles). |
| Identidad reconocida fuera de esas zonas | OCR local, con máscaras sobre coincidencias de identidad aprendidas de los encabezados/tarjetas, correos y números no catalogados como sintéticos permitidos. |
| `word/media/image1.png`, 612×473 | Imagen no funcional del logo de la plantilla: cubierta íntegramente por formato no calibrado. Revisar su sustitución por una marca autorizada si QA la necesita. |

Se mantienen legibles campos, placas, valores sintéticos autorizados y recorrido en las zonas funcionales principales. El OCR puede confundir o unir un número sintético con otro texto y cubrir un fragmento de narrativa o una referencia de corrida; **QA debe señalar cualquier pérdida de legibilidad o de contexto**. Las máscaras no constituyen prueba de rechazo, persistencia ni cierre. En particular, la imagen final de P18 no demuestra por sí sola cómo se comportó la entrada de placa larga.

## Verificación realizada

- **8/8 pruebas de privacidad PASS:** máscaras sólidas, campos funcionales conservados en fixtures, gráfico legible, respaldo de tarjetas/iniciales si el OCR omite Usuarios, formatos desconocidos retenidos, metadatos y partes ocultas retirados, fuentes intactas y aborto sin salida parcial cuando falta una imagen.
- Auditoría del DOCX real: 5 CP, 108 pasos y estados originales, ZIP/XML/relaciones válidos, 104 capturas representativas en el soporte privado de origen y sus 105 imágenes reemplazadas en la copia. Los 776 históricos del manifiesto previo conservan su hash.
- Revisión local de las 105 imágenes mediante hojas de contacto, con ampliaciones de zonas clave (P18, campos, tarjetas y gráfico). Un segundo OCR sobre las imágenes procesadas no detectó correos, tokens de identidad aprendidos ni números ajenos al catálogo permitido. Es un control auxiliar, no una garantía universal.
- XML de la copia sin correos reconocibles, cuentas `INT-...` ni rutas personales de Windows. Se revisó el contenido incrustado, además de metadatos.

El inventario local con rectángulos y hashes está en `tmp/qa-hibrida-fase11/demo/anonimizacion.json`; las hojas en `revision-01.png` a `revision-07.png`; el segundo control en `revision-ocr.json`. Los OCR originales y la carpeta `entrada` son privados y no deben compartirse. Los informes sin texto privado se adjuntan junto al Word en `test-results/qa-hibrida/fase1.1/`.

## Revisión que falta

Cada una de las 105 imágenes requiere revisión humana de privacidad residual y legibilidad antes de compartir externamente. Atención especial a encabezados, Usuarios, miniaturas/avatares, narrativa y números que OCR pueda haber leído mal. El logo está totalmente oculto; el panel auxiliar puede perder controles ajenos al campo evaluado. Registrar CP/paso e imagen, sin copiar la identidad privada al acta.

Falta revisar la paginación renderizada del Word: el render local no pudo producir páginas porque no está instalado LibreOffice. QA puede revisar la copia en Word durante la sesión. La aprobación del diseño no aprueba anonimización externa ni el resultado funcional.

## Herramientas offline

`tools/qa-diseno/demo_anonima.py` extrae y construye copias sin sobrescribir destinos; requiere Pillow y el OCR JSON local de `ocr-capturas.ps1` (WinRT de Windows). `auditar_demo.py` contrasta planes, fuentes, imágenes y manifiesto. No se añadieron servicios ni se enviaron imágenes fuera del equipo. El helper legado `tools/enmascarar-capturas.ps1` no garantiza esta cobertura: no basta su enmascaramiento parcial para aprobar una distribución.
