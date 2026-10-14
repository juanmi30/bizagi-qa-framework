# Feedback y ajustes al plan — Colsubsidio (CRD) y extensiones del motor
> Fecha: 2026-07-23 · Autora: Karen (Dirección de Calidad) con revisión de Fable (Claude)
> Para: Claude Code — aplicar estas definiciones al repositorio y ajustar el plan de trabajo.
> Responde a las "Preguntas para feedback" del documento de análisis de insumos CRD (2026-07-17).
> **Este es el documento de definiciones de referencia para el frente Colsubsidio.**

---

## 1. Decisiones sobre las preguntas de feedback

### E — Paso híbrido (OTP): detección de valor + confirmación de avance
**Decisión:** el motor espera a que el campo tenga valor, **pero no avanza de inmediato**: al detectar
valor muestra "Detectado, avanzando en 5 segundos…" con posibilidad de frenar. Evita avanzar con un
OTP a medio teclear (riesgo del valor a secas) sin duplicar trabajo manual (costo del clic obligatorio).

Reglas de implementación:
- **Incompatible con CI:** si `CI=true` y el escenario tiene paso `hibrido:`, fallar rápido ANTES de
  ejecutar, con mensaje claro: "Este escenario requiere analista; ejecutar en local con --headed".
- **Evidencia:** el paso queda marcado como `[MANUAL]` en el reporte, con timestamp de cuándo se
  ingresó el valor. Necesario para trazabilidad CMMI: distinguir qué verificó el robot y qué hizo un humano.
- Ejecución en `--headed`; mensaje visible al analista (banner en página o consola).
- `maximo_minutos` configurable por paso (default 5).

### G — Espera de integración: en dos capas
**Decisión:** ambas.
1. **Implícita y moderada en toda `accion:`** — tras avanzar, esperar a que aparezca la actividad
   siguiente. Timeout por defecto: **90 segundos**.
2. **Explícita (`esperar_integracion:`)** solo donde el analista sabe que hay integración lenta
   (SAP, motor de decisiones, biometría), con `hasta_llegar_a:` y `maximo_minutos:` propio (default 5).

Timeouts configurables por `.env` (los ambientes de integración son volubles):
```
ESPERA_ACCION_SEGUNDOS=90
ESPERA_INTEGRACION_MINUTOS=5
```
El YAML del analista queda limpio en el ~90% de los pasos; solo declara espera donde el negocio la explica.

### H — Apertura/inicio del caso: enumeración de TRES modos
**Decisión (ajustada por Karen):** generalizar `inicio.modo` como enumeración con tres valores:

```yaml
inicio:
  modo: bandeja | buscar | servicio
```

| Modo | Qué hace | Estado |
|---|---|---|
| `bandeja` | Toma el caso desde la bandeja del Work Portal (comportamiento actual). | ✅ Implementado |
| `buscar` | Abre el caso por su número (del histórico `numeroCasoActual()`) usando el buscador global. | 🔨 Implementar ahora |
| `servicio` | Crea el caso vía **web service de Bizagi (`createCase`** — OData/SOAP según el ambiente) y la prueba de UI arranca directo en la actividad de interés. | 📐 Diseñar ahora, implementar cuando haya credenciales de API |

Notas sobre `servicio`:
- **Valor estratégico:** "plantar" casos por servicio abarata los escenarios alternos y las suites
  grandes (no hay que recorrer por UI todo lo previo para probar una actividad tardía).
- **Prerrequisito:** credenciales/endpoint de API del ambiente en `.env`
  (`BIZAGI_API_URL`, `BIZAGI_API_USER`, `BIZAGI_API_PASSWORD` o token). Hoy NO confirmadas en Colsubsidio.
- **Diseño ahora, implementación diferida:** dejar la enumeración, la validación del YAML y el stub
  en `ApiHelpers` (error claro: "modo servicio requiere credenciales de API; ver .env.example").
  Coherente con la decisión vigente de trabajar "solo por pantalla" mientras no haya acceso a API.
- El caso creado por servicio se registra en el mismo histórico de números que los demás.

### Menores confirmados
- **D — Login con dominio:** `BIZAGI_LOGIN_DOMINIO` en `.env`; si existe, el login elige primero el dominio. Aprobado tal cual.
- **F — Campo tipo `archivo`:** aprobado tal cual (`{ campo: X, valor: archivo.pdf, tipo: archivo }`, vive en `resources/`).
- **Combo escribible** (variante de lista: teclear + Enter) y **localizador con contexto de fila**
  (ids repetidos tipo `#passLevelWidget`): aprobados.

---

## 2. Ajuste al orden del plan de trabajo

Se mantiene la estructura por etapas (login → C1..C4 → alterno) con **un cambio**:

1. Confirmar con el equipo: credenciales exactas y etiqueta del número de caso en este portal.
2. **Extensión D** (login dominio) + smoke de login Colsubsidio → primera victoria rápida.
3. **➕ NUEVO — Smoke de la Extensión F (archivo) apenas termine C1:** mini-test aislado de subir un
   PDF a cualquier campo de archivo disponible. Razón: la carga de archivos es de lo más impredecible
   en Bizagi (inputs ocultos, visores embebidos); descubrir un problema en C4 —el tramo más largo, con
   biometría y subproceso encima— sería lo más caro. 10 minutos ahora desriesgan el cierre.
4. C1 = crear caso + primer formulario (hasta antes del OTP).
5. C2 = + paso híbrido OTP (Ext. E) + espera SAP (Ext. G).
6. C3 = información adicional + oferta (radios/listas, ya soportado).
7. C4 = biometría + archivo PDF (Ext. F) + activación (subproceso → valida histórico de números)
   + hazard final: estado "Aprobado" por pantalla.
8. Camino alterno CRD03 (biometría = 18) una vez exista el camino feliz.
9. Implementación de `modo: buscar` (H) donde el plan lo requiera; `modo: servicio` queda diseñado
   y stubbed, pendiente de credenciales.
10. CONPRE sigue como suite de regresión (3/3 verde); pendientes viejos sin cambios.

---

## 3. Estandarización del formato del equipo (aplicar ya)

Actualizar `FORMATO-ENTRADA-ESCENARIO` con:

1. **Columna "Tipo de campo"** en la tabla de datos de prueba, usando el catálogo unificado de la
   ficha técnica: `texto · fecha-calendario · lista · buscador · radio-si-no · tabla-popup · archivo ·
   solo-lectura · combo-escribible` (nuevo). El formato y la ficha técnica deben hablar el mismo idioma.
2. **Campo "Usuario por actividad"**: cuando hay cambio de asignación, el analista indica qué usuario
   ejecuta cada actividad (credenciales viven en `.env`, nunca en el formato).
3. **Metadato del escenario:** `¿Requiere analista? (OTP u otro paso manual): sí/no`.
   Clasifica de entrada qué escenarios pueden ir al pipeline nocturno y cuáles solo corren en local.

---

## 4. Limitación conocida (documentar, no implementar)

**Verificación del estado final solo por pantalla** (decisión vigente por falta de acceso a BD/API en
Colsubsidio). Registrarla como limitación conocida en la documentación del proyecto: es el tipo de
hueco por donde puede colarse un "falso verde" (precedente: bug de fechas CONPRE). Cuando el cliente
otorgue acceso a API, activar la verificación de refuerzo vía `ApiHelpers` es la primera mejora —
y habilita de paso el `modo: servicio`.

---

## 5. Checklist de cierre para Claude Code

- [ ] Extensión D implementada + smoke login Colsubsidio verde.
- [ ] Extensión E implementada con: detección de valor + confirmación 5s, bloqueo en CI, marca `[MANUAL]` con timestamp en evidencia.
- [x] Extensión G en dos capas con timeouts en `.env` (`ESPERA_ACCION_SEGUNDOS`, `ESPERA_INTEGRACION_MINUTOS`). — 2026-07-23. Capa 1 implícita y tolerante en toda `accion:` (espera que se vaya el "procesando" y, si se conoce, la actividad siguiente). Capa 2 explícita `esperar_integracion:` a nivel de PASO (se aplica tras su `accion:`), estricta: falla con mensaje claro. El tope de tiempo del test se ajusta al escenario. **Ambas capas verificadas en vivo contra CONPRE** (éxito y fallo). Regresión 3/3 verde.
- [ ] `inicio.modo` acepta `bandeja | buscar | servicio`; `buscar` implementado; `servicio` validado en YAML + stub en `ApiHelpers` con mensaje claro; `.env.example` con las variables de API comentadas.
- [ ] Extensión F implementada + smoke de archivo tras C1.
- [ ] Combo escribible y localizador por fila implementados.
- [x] Formato del equipo actualizado (tipo de campo, usuario por actividad, metadato "requiere analista"). — 2026-07-23
- [x] Limitación "verificación solo por pantalla" documentada. — 2026-07-23
- [ ] Regresión CONPRE sigue 3/3 verde tras todos los cambios (correr al final).
