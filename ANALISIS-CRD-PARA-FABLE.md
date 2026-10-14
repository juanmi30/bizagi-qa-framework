# Análisis de insumos Colsubsidio (CRD) y ajuste del plan — para feedback
> ✅ **RESPONDIDO (2026-07-23):** las decisiones aprobadas están en `FEEDBACK-CRD-DEFINICIONES.md`
> (documento de referencia del frente Colsubsidio). Este análisis queda como histórico.
> Contexto: framework E2E reutilizable para Bizagi Cloud (Playwright). Filosofía: probar un proceso =
> **escribir un YAML en español**, no programar ni grabar. Ya probado en vivo con el cliente CONPRE
> (crear caso, campos, fechas, listas, tablas/pop-ups, hazards, `${unico}`). Detalle: `RESUMEN-PARA-DISENO.md`
> y `RESUMEN-PARA-FABLE.md`. Este doc analiza los insumos del **segundo cliente** y propone el plan ajustado.

## 1. Los insumos recibidos (2026-07-17)
El equipo entregó, para **Colsubsidio – Gestión de Crédito (CRD)** (`test-procesosdigitales-colsubsidio.bizagi.com`):
- **Formato de entrada de escenario** diligenciado (docx/pdf + extracto en `projects/colsubsidio/docs/`):
  flujo E2E de crédito con integraciones (OTP, SAP/ASCARD, motor de decisiones, biometría, activación).
- **3 grabaciones Playwright** (saneadas, en `projects/colsubsidio/grabados/_crudo/`):
  CRD01 caso completo exitoso · CRD02 validación SAP · CRD03 rechazo biometría (código 18).

## 2. Qué nos enseñaron las grabaciones
1. **El formato del equipo mapea casi 1:1 al YAML** (datos→`llenar`, pasos→`pasos`, resultado→`hazards`).
   Confirma la apuesta: los analistas pueden escribir escenarios sin programar.
2. **Hay pasos que no son de UI**: integraciones asíncronas con "pantalla de espera" (SAP, motor,
   biometría). En CRD03 el humano presionó **6 veces Enter** en el buscador esperando el caso —
   señal clara de que el motor necesita **esperas por estado** (hasta que aparezca la siguiente
   actividad), con timeouts largos configurables. Nunca reintentos ciegos.
3. **No todo puede ser 100% autónomo**: el **OTP** llega por correo/SMS en el momento (servicio real,
   sin workaround). Se necesita un **modo híbrido**: el test pausa, un analista ingresa el código, y
   la automatización continúa.
4. **Multi-usuario real**: en un flujo pueden participar varios usuarios. El YAML ya soporta `usuario:`
   por paso (con identidades/claves en el `.env`); ahora es requisito de primera clase.
5. **Interacciones nuevas**: carga de **archivo PDF** ("Recibir PDF firmado"), **login con dominio**
   (select antes de usuario/clave), combos **escribibles** (Estado Civil: se teclea + Enter), campos
   dentro de **filas con id repetido** (`#passLevelWidget`).
6. **Abrir el caso por búsqueda global** (por su número), no solo por bandeja → se apoya en el
   `numeroCasoActual()` ya construido (se relee y guarda histórico).
7. **Subproceso real al final** (activación de producto) → validará el diseño del histórico de números.
8. **Las grabaciones son mapa, no producto**: traen selectores frágiles (`getByText('Si').nth(3)`,
   `.ui-checkbox-state-hover`) y hasta **credenciales en texto plano** (se sanearon al ingresar; la
   clave vive en el `.env`). Se adoptan convirtiéndolas a plantilla por etiqueta.

## 3. Decisiones ya tomadas (por la líder de calidad)
- **OTP → modo híbrido con analista.** El test pausa en ese paso; el analista ingresa el código; sigue.
- **Usuarios por actividad.** El analista indica usuario (y sus credenciales en `.env`) por actividad
  cuando hay cambio de asignación.
- **Verificación del estado final solo por pantalla** (sin acceso a BD/API).

## 4. Extensiones propuestas al motor (bocetos para feedback)

**D — Login con dominio** (pequeña). Nuevo parámetro `.env`:
```
BIZAGI_LOGIN_DOMINIO=colsubsidio   # si existe, el login primero elige el dominio (select #domain)
```

**E — Paso híbrido (pausa de analista)** — la clave del OTP. Boceto:
```yaml
- actividad: Capturar el OTP
  hibrido:
    mensaje: "Ingresa el código OTP recibido en el correo/celular de prueba"
    esperar_campo: Ingresar Código Verificación   # el motor espera a que el analista lo llene
    maximo_minutos: 5
  accion: Siguiente        # cuando el campo tiene valor, el motor retoma y avanza
```
Idea de implementación: correr `--headed`; el motor muestra el mensaje (banner/console), espera a que
el campo tenga valor (poll) y retoma. Alternativa: esperar un clic del analista en "continuar".

**F — Tipo de campo `archivo`** (carga de documentos):
```yaml
- { campo: Documento firmado, valor: contrato-prueba.pdf, tipo: archivo }   # vive en resources/
```

**G — Espera de integración** (asíncronas con pantalla de espera):
```yaml
- esperar_integracion: { hasta_llegar_a: "Registrar información adicional", maximo_minutos: 5 }
```
(Espera a que la pantalla de espera desaparezca y aparezca la actividad destino.)

**H — Abrir caso por búsqueda global** (además de bandeja):
```yaml
inicio:
  modo: buscar             # busca el caso por su número (del histórico) en el buscador global
```

**Menores:** combo escribible (variante de `lista`: teclear + Enter), ubicación por fila para ids
repetidos (`localizador` con contexto de fila).

## 5. Plan de trabajo ajustado (orden propuesto)
1. **Confirmar con el equipo**: credenciales exactas (en el `.env` local; nunca en documentos) y etiqueta del número de caso
   en este portal.
2. **Extensión D (login dominio)** + smoke de login Colsubsidio → primera victoria rápida.
3. **Escenario CRD por etapas** (igual que CONPRE): C1 = crear caso + primer formulario (hasta antes
   del OTP) → C2 = **+ paso híbrido OTP (Ext. E)** + espera SAP (Ext. G) → C3 = información adicional +
   oferta (radios/listas, ya soportado) → C4 = biometría + **archivo PDF (Ext. F)** + activación
   (subproceso → valida histórico de números) → hazard final: estado "Aprobado" **por pantalla**.
4. **Camino alterno CRD03** (biometría = 18): barato una vez exista el camino feliz.
5. **Actualizar el formato del equipo**: campo "usuario por actividad" y nota "OTP: lo ingresa el
   analista (modo híbrido)".
6. CONPRE sigue como suite de regresión (3/3 verde); los pendientes viejos no cambian.

## 6. Preguntas para feedback (Fable)
1. ¿El **paso híbrido** (E): mejor "esperar a que el campo tenga valor" o "esperar clic en continuar"?
   ¿Riesgos de timeouts/CI? ¿Cómo reportarlo en la evidencia (marcar el paso como manual)?
2. ¿La **espera de integración** (G): mejor como paso explícito del YAML o implícita en cada `accion`
   (esperar siempre a la actividad siguiente)? ¿Timeout por defecto razonable?
3. ¿El boceto de `modo: buscar` (H) es suficiente o conviene generalizar "cómo abrir el caso" (bandeja |
   buscar | url)?
4. ¿Ven riesgo en el orden del plan (login → tramos C1..C4 → alterno)? ¿Qué moverían?
5. ¿Algo del formato del equipo que convenga estandarizar ya (p. ej. columna "tipo de campo")?
