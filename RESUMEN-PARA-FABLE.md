# Resumen de avance — hasta el 10 de julio de 2026
> Para revisar lo logrado. El detalle completo del framework está en `RESUMEN-PARA-DISENO.md`;
> los hallazgos durables de Bizagi están en la memoria del proyecto (`memory/`).

## 0. En una línea
Se cerró la **Etapa 2 con certeza total**, se completó la **Etapa 3 (tablas/colecciones)**, se agregó
**`${unico}`** (identificadores por corrida) y se **rediseñó el número de caso** para que sea reusable.
Todo **probado EN VIVO contra CONPRE** y **verde**: las 3 plantillas corren 3/3, sin regresiones.

---

## 1. Lo que avanzamos

### A) Etapa 2 — Opción A: certeza total (y un bug real encontrado)
- Se agregaron **hazards** a las 2 fechas + DIPRE. Al re-correr se descubrió que **las fechas NO se
  guardaban** (el "verde" anterior solo miraba el texto).
- **Causa:** las fechas de Bizagi (calendario **Mobiscroll**) ignoran el llenado programático.
- **Arreglo:** se **teclea** la fecha y se **cierra el calendario emergente**. → Etapa 2 verde con los 4
  campos **guardados y verificados**.

### B) Etapa 3 — tablas/colecciones (pop-up "Necesidades planeadas")
- Nuevo bloque **`tablas:`** en el YAML: abre el pop-up "Adicionar", llena sus campos **solo dentro del
  pop-up**, guarda y verifica con el hazard **`la_tabla_tiene_filas`**.
- El pop-up resultó ser un **formulario de ~14 campos obligatorios** (listas, **2 buscadores de catálogo**,
  textos, radios, números). Se mapeó y se llenó una fila completa en vivo.

### C) `${unico}` — identificadores por corrida (Extensión C)
- Escribir `${unico}` en cualquier `valor:` → se reemplaza por la **fecha-hora de la corrida**
  (ej. `20260710-110241`), en lo que se teclea **y** en los hazards.
- **Verificado en vivo:** 3 tokens distintos en una corrida; cada caso queda identificable y no chocan
  entre corridas.

### D) Número de caso — reusable (no atado a CONPRE)
- Antes estaba "hardcodeado" y no matcheaba CONPRE ("GCON - NNN"). Ahora se lee **por etiqueta visible**,
  **configurable en el `.env`** (`BIZAGI_CASE_NUMBER_LABEL`, default "Número de caso").
- **Se relee** (no se cachea) y se guarda el **histórico** de números, porque un proceso con **subprocesos**
  puede cambiar el número; los hazards de bandeja buscan por cualquiera de ellos.
- Verificación fina de bandeja/asignación: **pendiente**, se hará con los grabados del equipo.

### E) Documentación (Etapa 5)
- `README.md` y `_template/scenarios/_ejemplo.yaml` documentan `categoria`, `tablas:` y `${unico}`.

---

## 2. Hallazgos de Bizagi (aplican a cualquier proyecto, no solo CONPRE)
| Tema | Qué aprendimos |
|---|---|
| **Fechas** | Calendario Mobiscroll: ignora `fill`; hay que teclear + cerrar el calendario. |
| **Listas** | Combos personalizados; sus opciones se dibujan "fuera" del pop-up (a nivel de página). |
| **Buscadores de catálogo** | De sugerencia: filtran por la **descripción** (escribir una palabra con sentido, ej. "Servicios"). |
| **Radios Sí/No** | Personalizados; se marca el input `true`/`false` que sigue a la pregunta. |
| **Guardar** | Recarga la forma; al verificar filas hay que esperar a que la fila reaparezca. |
| **Número de caso** | Se muestra junto a una etiqueta ("Número de caso" → "GCON - NNN"); puede cambiar entre subprocesos. |

---

## 3. Cambios de código (todo en el núcleo compartido `shared/`)
- **`core/FormActions.ts`** — `fecha` (tecleo + cierre calendario), `búsqueda` (catálogos), `radio`
  booleano, tablas (`agregarFilaTabla`, `contarFilas`) y `leerValorPorEtiqueta` (número de caso).
- **`runner/scenarioLoader.ts`** — bloque `tablas:`, hazard `la_tabla_tiene_filas`, `generarUnico()` + `aplicarUnico()`.
- **`runner/registerScenarios.ts`** — genera y sustituye `${unico}` por corrida.
- **`runner/BpmEngine.ts`** — procesa tablas; número de caso configurable + histórico (subprocesos).
- **`runner/hazards.ts`** — `la_tabla_tiene_filas`; hazards de bandeja buscan por cualquier número del caso.
- Escenarios `conpre-etapa2/3`, y `.env` / `.env.example` (parámetro del número de caso).

> Al ser cambios del núcleo, **todo proyecto Bizagi** se beneficia.

---

## 4. Estado de verificación (en vivo, CONPRE — 2026-07-10)
- ✅ Login · ✅ Etapa 1 · ✅ Etapa 2 (guardan) · ✅ Etapa 3 (tabla + fila) — **3/3 verdes, sin regresiones.**
- ✅ `${unico}` en vivo (3 tokens únicos). ✅ TypeScript sin errores.

---

## 5. Pendiente / siguiente
1. **Número de caso — bandeja/asignación**: verificar y ajustar con los **escenarios grabados** que
   entregará el equipo (los escenarios CONPRE actuales no cambian de usuario/subproceso).
2. **Depurar QA**: limpiar los casos de prueba creados (identificables por su `${unico}`).
3. Sub-tabla anidada "Códigos UNSPSC auxiliares" (dentro del pop-up): no obligatoria, quedó para v2.
4. Menor: `INICIO-CLAUDE-CODE.md` dice "4 pruebas" en `--list` (ya son más).
