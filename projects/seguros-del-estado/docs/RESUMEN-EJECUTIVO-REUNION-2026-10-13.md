# Resumen ejecutivo — Automatización SDE-CEL (reunión de avances, 13 de octubre de 2026)

## Para la reunión (13 de octubre, 16:30)

**Guía de demostración en solo lectura:** `GUIA-REUNION-QA-2026-10-13.md`. Se ensayó completa: no crea casos (historial 16 → 16).

### Indisponibilidades reportadas por QA

QA confirmó que **hoy no funcionan la consulta a SISE ni la consulta de alertas del intermediario**. Las tratamos como **indisponibilidades del ambiente reportadas por QA**, no como defectos verificados por la automatización: no tenemos acceso a esos servicios ni a sus registros.

| Consecuencia | Detalle |
|---|---|
| HU03 no puede pasar de la creación | Aunque llegue la póliza, P10–P12 (SISE y alertas) y todo "Completar información" dependen de esos servicios. **El primer E2E de HU03 debe esperar a que QA confirme que volvieron** |
| Casos Individuales detenidos | Los Individuales (425, 427 y anteriores) se quedaron en "Consultar Alertas Intermediario" y se cerraron sin avanzar. Es **coherente** con la indisponibilidad de alertas, pero no lo demostramos: queda como posible explicación de la observación BUG-02, junto con el actor no conforme |
| Lo que sí sigue siendo válido | El formulario de inicio de HU03 (P2–P6, sin SISE) y todo HU06 Masivo hasta "Estructurar información" (no usa esas consultas) |

### Qué se mostrará y cómo clasificarlo

| Qué | Tipo | Resultado |
|---|---|---|
| Login de los 3 usuarios y ambiente | Verificación actual | 5/5 |
| Habilitación del intermediario (ENV-03) | Verificación actual | Intermediario INT-013403 habilitado; intermediario_alerta todavía no |
| HU03-CP02 hasta P6 con el intermediario | Verificación actual (sin crear caso) | P2–P6 PASS; P7 bloqueado por la póliza |
| HU06-CP01 en el caso 429 | Verificación actual (solo lectura de un caso ya creado) | P13–P17, P28 y P29 PASS; P27 FAIL (BUG-04) |
| HU06-CP01 creación con documento (caso 429) | Resultado histórico | P2–P11 y P13–P16 PASS con la secuencia del producto (variante; no cuenta para el CP) |
| HU06-CP05 (casos 425 y 427) | Resultado histórico | REAL_PASS_PARCIAL: 6 de 8 pasos PASS (corrección: antes se informó "7/9"); casos ya cerrados |
| Worker AI, SISE, alertas | Limitación de observabilidad | No verificables desde la automatización |

**Cobertura sin cambios:** implementados 13/17, ejecutados 2/17, **aprobados 0/17**.

---

## ACTUALIZACIÓN — HU03 con un intermediario habilitado (13 de octubre, cierre)

**Qué cambió:** del listado de QA se encontró, en la **primera** cuenta comprobada, un intermediario con el rol **CE_Intermediarios** que puede iniciar el proceso. Con ese usuario se exploró HU03 de verdad, en modo **solo lectura**: la automatización no puede pulsar "Crear" y la red bloquea cualquier creación. **No se creó ningún caso.**

| Caso | Con el intermediario real, hasta antes de "Crear" | Qué lo detiene |
|---|---|---|
| HU03-CP02 (Autos por póliza) | **Pasos 2 a 6 verificados** | Falta la póliza Autos de esa clave |
| HU03-CP01 (Autos por placa) | **Pasos 2 a 6 verificados** | Falta la placa con varias pólizas |
| HU03-CP03 (Generales por póliza) | **Pasos 2 a 6 verificados** | Falta la póliza Generales |
| HU03-CP04 / CP05 (Póliza Nueva por tomador) | **Pasos 2 a 6 verificados** | Faltan los tomadores existente e inexistente |
| HU03-CP06 / 07 / 08 (Cumplimiento) | Pasos 2 y 3 | Falta saber qué ramos tienen la propiedad RCE |

Son verificaciones reales de pantalla con el actor correcto. **No son CP ejecutados ni aprobados**: el paso 7 en adelante (consulta a SISE y "Completar información") necesita la póliza.

**Correcciones que esto permitió:**
- Etiquetas reales de Póliza Nueva: "Tipo de Documento del Tomador" y "Número de Documento del Tomador".
- El formulario Individual **no tiene** la tabla de documentos; se retiró ese paso supuesto.
- "Placa" es a la vez opción de consulta y campo: la automatización ahora distingue los dos.

**Rol:** el Plan Maestro habla de un rol "Radicador"; en el portal el rol que funciona se llama **CE_Intermediarios**. No damos por hecho que sean el mismo.

**Fuente de pólizas:** el intermediario no tiene casos en su bandeja ni herramientas de consulta, así que **no hay fuente autorizada en el portal**. Se dejó la solicitud exacta para QA (TEST-DATA-GAPS.md §0000000).

**Cobertura (sin cambios en los indicadores):** implementados 13/17, ejecutados 2/17, aprobados 0/17.

**Primera ejecución completa recomendada:** **HU03-CP02**, en cuanto QA entregue la póliza Autos vigente de la clave del intermediario. Es la que más reutiliza: los pasos 2 a 6 ya están verificados, y "Completar información" (pasos 13 a 21) desbloquea a la vez CP01 y CP03 a CP08.

---

## ACTUALIZACIÓN — Sprint de consolidación HU06 (13 de octubre, tarde)

### Avances nuevos respecto al cierre anterior
1. **Comprobado (ya no inferido):** "Solicitud de seguro" **es** el tipo documental obligatorio 3. Su identificador en la lista del portal es 3, el mismo número que exige el mensaje de "Crear".
2. **Nuevo posible defecto, BUG-06:** "Crear" exige el tipo 3, pero **acepta la radicación con un documento de otro tipo** (Sarlaft u Otros). Casos 430 y 431.
3. **BUG-05 reforzado:** probamos cuatro acciones normales de un usuario después de guardar la fila del documento. **Ninguna** actualiza la lista de tipos; solo cambiar un campo como Sucursal lo hace.
4. **ENV-03, configuración exacta identificada:** el Plan Maestro (hoja "Configuración del Entorno") indica que el intermediario necesita el **rol "Radicador"** vinculado a "Tipo de usuario" (Intermediario Principal o Colaborador) y la persona **"PER - Intermediario" con su Clave Intermediario**. Hay una prueba lista para confirmar la habilitación en cuanto el administrador la aplique (sección 5 de la guía de demostración).
5. **Dos pasos más de HU06-CP01 verificados en QA:** **P18** (el pop-up de edición abre) y **P22** ("Guardar" sin los campos obligatorios mantiene el pop-up abierto).
6. **HU06-CP05 P9:** el portal **no muestra** la ejecución del Worker AI ni siquiera en un caso Masivo donde sí corrió. La falta de rastro en el caso Individual no prueba nada. Queda "integración no verificable" y se especifica la evidencia técnica necesaria (sección de bloqueos).

### Lo que salió mal (y cómo se corrigió)
- El intento de verificar P19–P26 en el caso 430 **dejó ese caso inutilizable** (BUG-03). Las etiquetas del pop-up de Póliza Nueva **no son** las columnas de la tabla: "Tipo documento del Tomador" no existe como etiqueta y "Número de Documento Tomador" aparece dos veces, así que el pop-up no se pudo cerrar con "Guardar". El 430 era un caso de diagnóstico sobrante, pero es un caso perdido.
- **Correcciones aplicadas:**
  - la automatización ahora se detiene en el primer cierre fallido;
  - verificar la edición exige una confirmación explícita de riesgo;
  - los NIT de prueba se retiraron hasta tener las etiquetas reales (**UI-10**).
- Los casos 430 y 431 se crearon esperando que "Crear" los **rechazara**; Bizagi los aceptó. Así se descubrió BUG-06.

### Estado de HU06-CP01, paso a paso (contra el Excel original)

| Pasos | Estado | Evidencia |
|---|---|---|
| P1 | Objetivo (resume los demás) | — |
| P2–P8 | **PASS** | Escenario oficial (sin crear caso) y variante 429 |
| P9 | **FAIL** con la secuencia de la matriz; **PASS** con la secuencia del producto | Oficial: lista vacía. Variante 429: documento adjunto. Pendiente del control de cambios |
| P10–P11 | **PASS** en la variante (creación y paso a Estructurar) | Casos 428 y 429 |
| P12 | Integración no verificable (Worker AI) | — |
| P13–P16 | **PASS** | Casos 428, 429 y 430 |
| P17 | Tabla y columnas **PASS**; el contenido depende del Worker AI | Con narrativa sintética genera 1 fila vacía |
| **P18** | **PASS** (nuevo) | Caso 430 |
| P19–P21, P23–P26 | **Pendientes de calibrar (UI-10)** | Etiquetas reales del pop-up desconocidas |
| **P22** | **PASS** (nuevo) | Caso 430 |
| P27 | **FAIL** por BUG-04 ("Observaciónes") | Casos 426, 428 y 429 |
| P28 | **PASS** (pestañas y documento adjunto visible) | Calibración 429 |
| P29 | **PASS** | Casos 428 y 429 |

**18 de 29 pasos** de CP01 ya se vieron funcionar en QA (P2–P11, P13–P16, P18, P22, P28 y P29), parte de ellos solo con la secuencia del producto. **CP01 no está aprobado:** P9 depende del control de cambios, P27 de BUG-04 y P19–P26 de UI-10.

### Cobertura real y potencial

| | Real hoy | Potencial inmediato (si se cumplen las condiciones) |
|---|---|---|
| Implementados | 13/17 | 13/17 |
| Ejecutados en QA | 2/17 | Hasta **13/17** con ENV-03 resuelto, etiquetas del pop-up y datos de HU03 |
| Aprobados | **0/17** | **CP01:** aun con el control de cambios aprobado, BUG-04 corregido y UI-10 calibrado, P12 y P17 dependen del Worker AI sin traza: sin evidencia técnica de esa integración el máximo alcanzable es REAL_PASS_PARCIAL. **CP05:** no puede aprobarse sin evidencia técnica del Worker AI (P9) y un glosario de nomenclatura (P6) |

### Casos creados hoy (todos propios y registrados)

| Caso | Para qué | Estado |
|---|---|---|
| 425 | HU06-CP05 | Cerrado por el ambiente (~2 h) |
| 426 | Calibración | **Inutilizable** (BUG-03) |
| 427 | HU06-CP05 (no intencional) | Cerrado |
| 428 | Diagnóstico de documentos (primera Póliza Nueva Masiva creada) | Estructurar información |
| 429 | Variante HU06-CP01 | Estructurar información |
| 430 | Prueba del tipo 3 y calibración de edición | **Inutilizable** (BUG-03) |
| 431 | Prueba del tipo 3 | Estructurar información |

### Bloqueos externos que quedan
1. **ENV-03:** asignar el rol "Radicador", el "Tipo de usuario" y "PER - Intermediario" (con su Clave) a los usuarios intermediario e intermediario_alerta.
2. **UI-10:** capturas del pop-up "Detalle Polizas Asociadas" para Póliza Nueva, Autos y Cumplimiento (o la definición de la forma), o la corrección de BUG-03.
3. **Control de cambios** de documentos, BUG-05 y BUG-06: decisión del funcional.
4. **BUG-04:** corregir "Observaciónes". Hasta entonces P27 falla en todos los casos de HU06.
5. **HU06-CP05 P9:** evidencia técnica de que el Worker AI no se invoca en Individual. Por ejemplo, el registro de ejecución del Worker AI o el log de integraciones de Bizagi para los casos 425 y 429, o acceso de solo lectura a la API de Bizagi (ENV-02).
6. **HU06-CP05 P6:** un glosario o lista aprobada de etiquetas para validar ortografía y nomenclatura.
7. **FUNC-10:** qué actor radica en HU06.
8. **BUG-03:** número de ticket.

### Acciones concretas para el equipo
- **Administrador Bizagi:** punto 1. Luego ejecutar la comprobación de habilitación de la guía de demostración: debe pasar para los dos intermediarios.
- **Funcional:** puntos 3, 4, 6 y 7, y confirmar BUG-06.
- **QA:** punto 2 (capturas), ticket de BUG-03 y datos de HU03.
- **Equipo técnico Bizagi:** punto 5.

---

## Sprint anterior (13 de octubre, mediodía)

### En una frase

Hoy **destrabamos la radicación Masiva de Póliza Nueva**, que considerábamos un defecto (BUG-01). Se puede crear siguiendo la secuencia real del producto, y la demostramos en QA con dos casos (428 y 429) que llegaron hasta "Estructurar información". También **identificamos la causa del bloqueo del Intermediario** (ENV-03): su usuario no tiene un rol autorizado para iniciar el proceso. Ningún caso de prueba quedó todavía aprobado al 100 %, y no lo presentamos como tal.

### 1. Cobertura de los 17 casos de prueba (CP)

Contamos tres indicadores **por separado**, porque significan cosas distintas:

| Indicador | Qué significa | Inicio del día | Cierre del sprint |
|---|---|---|---|
| **Implementado** | El CP está escrito como escenario automatizado | 3 | **13** |
| **Ejecutado en QA** | Corrió contra el ambiente real con usuario real | 2 | **2** (HU06-CP05 y HU06-CP01) |
| **Aprobado** | Cumplió todos los pasos de la matriz con evidencia | 0 | **0** |

Lo que hay detrás de esos números:
- **HU06-CP05** (radicación Individual): **parcialmente aprobado** (REAL_PASS_PARCIAL). Tiene 6 de 8 pasos verificados en QA (casos 425 y 427; P1 es el objetivo — corrección: antes se informó "7 de 9"). Los 2 restantes no son observables: la invocación del Worker AI y la ortografía global sin glosario.
- **HU06-CP01** (Masiva Generales Póliza Nueva): con la secuencia **escrita en la matriz** sigue fallando en el paso 9. Con la **secuencia real del producto** (variante de diagnóstico, que **no cuenta** como aprobación) se verificaron en QA **16 de 29 pasos**: del 2 al 11, del 13 al 16, el 28 y el 29. El reporte guardado marca P28 como FAIL por un error de asignación del escenario, ya corregido; sus dos verificaciones pasaron. P17 verificó la tabla, pero queda como integración no verificable porque depende del Worker AI. Pendientes:
  - P27 falla por BUG-04 (ortografía de "Observaciónes").
  - P18–P26 esperan los NIT de prueba.
  - P12 es la integración con el Worker AI, que no es observable.
- Los otros **11 CP implementados** esperan datos de QA y, los de HU03, el permiso del Intermediario.
- **HU03 CP09–CP12** aún no están implementados. Se priorizó lo que podía ejecutarse.

Las 86 pruebas unitarias aprobadas validan la herramienta, **no** son casos funcionales.

### 2. Resultados en QA de este sprint

| Qué | Resultado | Caso |
|---|---|---|
| Diagnóstico de la secuencia de documentos, sin crear caso | Se identificó la secuencia que habilita los tipos documentales | — |
| Radicación Masiva Póliza Nueva con la secuencia del producto | **Creada** y llegó a Estructurar información | **428** |
| Variante automatizada de HU06-CP01 (secuencia del producto) | P2–P11, P13–P16, P28 y P29 verificados (16 pasos); P27 falla por BUG-04 | **429** |
| HU06-CP01 oficial (secuencia de la matriz) | Falla en P9, como se esperaba; no crea caso | — |
| Comparación de roles analista vs. intermediario | Causa de ENV-03 identificada | — |

Un caso adicional, el **427** (HU06-CP05), se creó por una ejecución que no estaba prevista. Está registrado y su resultado es idéntico al del 425.

### 3. Cambios realizados

- **Documentos en grillas:** la automatización soporta las dos secuencias, la de la matriz y la del producto, y sube archivos con el diálogo real "Subir un archivo" (calibrado hoy).
- **Variantes de diagnóstico:** permiten ejecutar una secuencia distinta de la aprobada para compararla. Sus resultados se guardan aparte y **nunca** se cuentan como aprobación del CP.
- **Seguridad del pop-up (BUG-03):** una regla automática impide que un escenario abra el pop-up de pólizas sin tener los datos para cerrarlo guardando. Detectó y corrigió dos riesgos, uno en un escenario existente y otro en la variante nueva.
- **Diagnóstico de permisos:** prueba de solo lectura que compara qué ve cada rol en el portal.
- **Guía de demostración** con comandos verificados en PowerShell (`DEMO-QA-2026-10-13.md`).

### 4. BUG-01 — reclasificado: era una secuencia, no una lista vacía

- **Antes:** "la lista de tipos documentales está vacía y Crear exige el tipo 3, así que no se puede radicar".
- **Ahora (verificado en QA):** los tipos existen (`Sarlaft`, `Solicitud de seguro`, `Otros`). Aparecen después de **guardar la fila** del documento **y** de que el formulario se vuelva a pintar. Con "Solicitud de seguro" la radicación se crea; es una inferencia que ese sea el tipo obligatorio 3.
- **Propuesta de control de cambios:** `CONTROL-CAMBIOS-DOCUMENTOS-HU06.md`, con el texto actual, la secuencia observada, el texto propuesto y el impacto por CP.
- **Hallazgo nuevo, BUG-05 (por confirmar):** después de guardar la fila, la grilla **no se actualiza sola**. Un usuario no vería los tipos hasta que algo vuelva a pintar el formulario.

### 5. BUG-02 — reclasificado según el rol correcto

Los casos Individuales detenidos en "Consultar Alertas Intermediario" fueron radicados con **CE_Analista**, que no es el actor de HU03. Ahora es una **observación de una ejecución con actor no conforme**, no un defecto. No se usará al analista para aprobar casos de HU03.

### 6. BUG-03 — ya reportado por QA

El error del pop-up "Detalle Polizas Asociadas" (casos 342, 350 y 426) ya tiene ticket de QA: **número pendiente de registrar**. No se volvió a reproducir y la automatización ahora lo evita por diseño.

### 7. ENV-03 y datos pendientes

- **ENV-03, causa identificada:** el analista ve el rol `CE_Analista` y el proceso dentro de "App › Processes › Centro de Expedición". El intermediario **no tiene rol visible**, solo ve Bandeja y Nuevo Caso, y el servidor le devuelve la lista de procesos **vacía**. Es un tema de **autorización**: asignar un rol al usuario y permitirle iniciar el proceso. No es un problema de credenciales ni de configuración del proceso.
- **Datos que siguen faltando:** póliza Autos vigente del intermediario sin alerta; dos NIT de tomador (para P18–P26 de CP01); placas; pólizas de Generales y Cumplimiento con y sin RCE; tomadores existente e inexistente; narrativas con pólizas reales. Detalle en `TEST-DATA-GAPS.md`.

### 8. Qué necesitamos

| De quién | Qué | Desbloquea |
|---|---|---|
| **Administrador Bizagi** | Asignar a los usuarios intermediario e intermediario_alerta el rol que pueda iniciar "Gestión Solicitudes Centro Expedición" | Los 8 CP de HU03 implementados y la radicación de HU06 CP02–04 |
| **Funcional** | Aprobar o ajustar el control de cambios de documentos y decidir sobre BUG-05 | Que HU06-CP01 oficial pueda pasar |
| **Funcional** | Confirmar que "Solicitud de seguro" es el tipo obligatorio 3 | Cerrar la inferencia |
| **Funcional** | Indicar qué actor radica en HU06 (FUNC-10). Hoy CP01 y CP05 usan al analista y CP02–04 al intermediario | La validez de CP01 y CP05 |
| **QA** | Número del ticket de BUG-03 | Trazabilidad |
| **QA (datos)** | Los datos listados en el punto 7 | CP01 completo, HU03 y HU06 CP02–04 |

### 9. Próximos pasos priorizados

1. Cuando el intermediario tenga permisos: ejecutar HU03-CP02 y calibrar "Completar información de solicitud", la pantalla que desbloquea casi toda HU03.
2. Con los NIT de prueba: completar HU06-CP01 P18–P26 (edición de filas, siempre cerrando con "Guardar").
3. Al aprobarse el control de cambios: pasar la secuencia del producto al escenario oficial de CP01.
4. Con los datos de Cumplimiento y Autos: ejecutar HU06 CP02–CP04.
5. Implementar HU03 CP09–CP12 sobre los mismos bloques cuando HU03 esté calibrado.

### Anexo — Control técnico al cierre del sprint

| Control | Resultado |
|---|---|
| Revisión de tipos (TypeScript) | Sin errores |
| Pruebas de la herramienta (unitarias) | 86/86 |
| Ambiente y login real de los 3 roles | 5/5 |
| Regresión de otros proyectos | Demo 48 aprobadas y 4 fallos históricos de plantilla, sin cambios; Colsubsidio 6/6 |
| Aislamiento | Ningún archivo fuera del proyecto Seguros del Estado fue modificado |
| Paquete para compartir | Generado, sin secretos del `.env` (134 archivos; excluye `.env`, capturas y logs). El escaneo no detecta nombres de personas que no estén en el `.env`, así que las capturas nunca se comparten |
| Casos creados hoy (todos propios y registrados) | 425, 426 (inutilizable por BUG-03), 427 (no intencional), 428 y 429 |
