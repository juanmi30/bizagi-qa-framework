# Fuentes certificadas HU 14.12

`CP01.json` y `CP02.json` contienen las acciones y resultados esperados literales
de las hojas CP01 y CP02 de `20260910_CLS_AFI_HU 14.12_V2_Casos_Prueba.xlsx`.
No incluyen el paso 1 (objetivo), porque no es una acción ejecutable.

Contraste con `20260911_CLS_AFI_HU 14.12_Soportes Cetificación Cliente.docx`:

- CP01 Desktop P13: `bel` → `Bellavista`.
- CP01 Mobile P29: `bella` → `Bellavista`.
- CP02 Desktop: `Chi` → `CHÍA`.
- CP02 Mobile: `Soa` → `SOACHA` según el texto del paso.
- CP01 Mobile termina en P32; CP02 Mobile termina en P35.
- La captura CP02 P15 muestra Bogotá / Bosa / búsqueda `ANDAL`, aunque el
  texto de P10 exige volver a Cundinamarca. Esa captura no autoriza a asignar
  un barrio de Bogotá a Chía.
- La captura CP02 P33 también muestra Bogotá. No se debe reemplazar el flujo
  certificado de Cundinamarca por ese estado sin resolver la discrepancia.

Resolución del usuario (17 de septiembre de 2026): CP02 conserva Chía en
Desktop y Soacha en Mobile. Localidad es condicional. Barrio se obtiene
dinámicamente del catálogo del municipio actual y se conserva como dato de
la corrida para búsqueda, selección, reapertura y restauración. Un catálogo
de Barrio vacío se reporta como posible hallazgo/bloqueo. Las capturas de
Bogotá son una inconsistencia visual y no una fuente de datos para CP02.

Los casos históricos son referencias documentales; nunca se usan para preparar,
reasignar ni cancelar una ejecución automatizada.

Las imágenes extraídas se guardan solo en `test-results/colsubsidio/hu14-12-soportes/`.
