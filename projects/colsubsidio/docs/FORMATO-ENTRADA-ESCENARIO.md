# Formato de entrada de escenario — Automatización de pruebas Bizagi
> **Versión 2 (2026-07-23).** Novedades: columna "Tipo de campo", "Usuario por actividad" y el
> metadato "¿Requiere analista?". Lo llena el analista funcional leyendo el requerimiento; el equipo
> de automatización lo convierte en un escenario YAML del framework.

## 1. Identificación
- **Cliente / Proyecto:**
- **Proceso Bizagi:**
- **URL del ambiente de QA:**
- **Usuario(s) de prueba y su rol:** *(las CLAVES nunca van en este formato: se entregan por canal aparte y viven en el `.env` del proyecto)*
- **Quién llena esto / fecha:**
- **ID del escenario** (ej. COBRO-01):
- **¿Requiere analista? (OTP u otro paso manual): sí / no** — *si "sí", el escenario solo corre en local con un analista presente; no va al pipeline nocturno.*

## 2. Objetivo (1–2 frases)

## 3. Tipo de escenario
Marca uno: **Camino feliz · Camino alterno · Validación o regla · Excepción**

## 4. Precondiciones
Qué debe existir ANTES de empezar (un usuario con cierto rol, un caso ya creado, un dato maestro cargado…).

## 5. Datos de prueba (valores concretos, no genéricos)
| Campo (texto tal cual aparece en pantalla) | Tipo de campo | Valor a ingresar |
|---|---|---|
|  |  |  |
|  |  |  |

**Catálogo de tipos de campo** (usar estos nombres):
`texto · fecha-calendario · lista · buscador · radio-si-no · tabla-popup · archivo · solo-lectura · combo-escribible`

> Guía rápida: **texto** = se escribe (incluye números y áreas de texto) · **fecha-calendario** = campo con
> calendario · **lista** = se elige de un desplegable · **buscador** = se escribe y se elige de las sugerencias ·
> **radio-si-no** = opciones Sí/No · **tabla-popup** = tabla con botón "Adicionar" que abre una ventana ·
> **archivo** = se carga un documento (indicar el nombre; el archivo va a `resources/` del proyecto) ·
> **solo-lectura** = solo se verifica, no se escribe · **combo-escribible** = lista donde se teclea y se confirma con Enter.

## 6. Pasos, en lenguaje de negocio
Numéralos como se los explicarías a alguien que nunca ha visto el proceso. Sé **literal** con los nombres
de los botones y actividades.

**Usuario por actividad:** si una actividad la ejecuta OTRO usuario (cambio de asignación), indícalo en el
paso, por ejemplo: *"5. (usuario: aprobador1) Aprobar la solicitud y clic en 'Siguiente'"*.
*(Las credenciales de cada usuario viven en el `.env`, nunca en este formato.)*

1.
2.
3.

## 7. Resultado esperado (el "entonces")
Qué debe verse o pasar al final: un mensaje, el número de caso generado, que avanza a tal actividad, etc.
*(Esto se convierte en el "hazard" que la prueba automatizada valida.)*

## 8. Apoyo visual (opcional, pero ayuda muchísimo)
Pantallazos de cada actividad señalando los campos, o un video corto de la navegación.
Campos difíciles a tener en cuenta: ¿la forma abre en un recuadro embebido (iframe)? ¿hay tablas/grids?
¿campos con autocompletar o búsqueda? ¿carga de archivos? ¿pasos con espera de integración?

## 9. Dudas o cosas por confirmar
