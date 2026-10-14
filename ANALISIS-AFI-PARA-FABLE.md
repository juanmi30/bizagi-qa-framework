# Análisis de grabaciones AFI (Afiliaciones Colsubsidio) — qué información nos entregan
> Fecha: 2026-07-28 · Insumos: 5 grabaciones codegen (ESCENARIO 1–5) de otro proceso de Colsubsidio.
> Objetivo: extraer qué nos enseñan y su impacto en el framework y el plan. NO es implementación.

## 1. Qué es este proceso (y por qué es distinto)
Es **Afiliaciones en línea (AFI)** de Colsubsidio: afiliar a la caja de compensación a distintos tipos de
solicitante — **Independiente (E1), Empleador Persona Natural (E2), Pensionado (E3, abandonado),
Empleador Persona Jurídica (E4), Facultativo (E5)**. Es un proceso **diferente al de Crédito (CRD)** que
veníamos trabajando: otro flujo, otros formularios y —lo más importante— **otra topología de aplicaciones**.

## 2. EL HALLAZGO GRANDE: es MULTI-APLICACIÓN (3 apps en un mismo escenario)
Cada grabación orquesta **tres aplicaciones web a la vez** (el codegen las llama `page`, `page1`, `page2`):

| Rol | Aplicación | URL | ¿Es Bizagi? |
|---|---|---|---|
| **Cliente** (`page`) | Portal público de autoservicio **Angular** | `transacciones.colsubsidio.com/afiliaciones-en-linea/qa` | ❌ No — Angular Material |
| **Analista** (`page1`) | **Work Portal de Bizagi** (back-office de validaciones) | `test-procesosdigitales-colsubsidio.bizagi.com` | ✅ Sí (el mismo del CRD) |
| **Admin** (`page2`) | **Bizagi Management** (forzar trabajos temporizados) | `accounts-colsubsidio.bizagi.com/enterprise` | ✅ Sí (consola admin) |

Un solo caso de prueba **salta entre las tres**: el cliente llena la solicitud en el portal Angular → el
analista entra a Bizagi a validar/reasignar → el admin fuerza los timers de las integraciones. Nuestro
motor hoy asume **un** portal. Esto es lo más nuevo y pesado.

## 3. Retos NUEVOS que revelan (vs. lo que ya tiene el motor)
| # | Reto | Nota |
|---|---|---|
| 1 | **Multi-app / multi-pestaña en un escenario** | El motor debe manejar varias apps con su propia URL y login, y saber en cuál corre cada paso. **Extensión grande.** |
| 2 | **UI Angular Material** (portal cliente) | `mat-select`/`mat-option`, `Selecciona una opción` repetido. Otro set de patrones además de la UI Bizagi. |
| 3 | **Forzar integraciones desde Bizagi Management** | "Trabajos Temporizados" → *Wait WI …* → **"Establecer ahora"** → "Aplicar". Es el workaround de QA para no esperar los timers reales (se conecta con Ext. G, pero como acción de admin). |
| 4 | **Inyectar respuestas de servicios externos** | El reconocimiento por QR se resuelve metiendo en Bizagi `Código Estado Evento: 2` + `Código Respuesta Evento: 200` (simular el callback). Igual que la biometría del CRD. |
| 5 | **Back-office: reasignación de casos** | Admin → Administración de procesos → Casos → `#caseInput` buscar → marcar fila → **Reasignar** al administrador de QA → Terminar. Flujo administrativo, no "bandeja". |
| 6 | **Grid de "Validaciones"** | El analista abre varias "Validaciones" (nth 0..4), responde Sí/No y Guarda por fila. Selectores frágiles (`.nth()`, `.ui-checkbox-state-hover`, `.ui-selectmenu`). |
| 7 | **Cargas de archivo múltiples** | Varios `#file-input-…setInputFiles(...)` + patrones `figure`/`figcaption`. Confirma que Ext. F (archivo) es imprescindible y aparece de varias formas. |
| 8 | **Formularios enormes con dropdowns en cascada** | Departamento→Ciudad→Localidad→Barrio, direcciones (Avenida/Calle + numeroVp/numeroVg/predio), búsquedas de representante/contacto/responsable por identificación. |
| 9 | **Familia de variantes por tipo de solicitante** | E1..E5 son el mismo proceso con ramas distintas → escenarios data-driven con muchas variantes (buen caso para el YAML). |

## 4. Pistas útiles que nos regalan
- **PISTA para el bloqueo de login (¡importante!)**: en AFI, el login al **Work Portal de Bizagi** usa
  dominio **`domain`** (no `colsubsidio`) + usuario y clave de QA (en el `.env` local; no se documentan), y la grabación
  continúa (funciona). En CRD yo había puesto `BIZAGI_LOGIN_DOMINIO=colsubsidio`. **El dominio correcto
  para el back-office parece ser `domain`.** Vale la pena reintentar el smoke del login con eso.
- El **número de caso** aparece explícito (288939, 289205, 289510…) y se busca por `#caseInput` →
  valida el diseño de Ext. H (`modo: buscar`) y del histórico de números.
- Reconfirma, con otro proceso, que **archivo, esperas, multi-usuario y `${unico}`** son transversales
  (ya están en el plan) — buena señal de que el rumbo sirve para más de un proceso.

## 5. Advertencias sobre estas grabaciones (son MAPA, no producto)
- **Están rotas como código**: usan `page1`/`page2` que **nunca se declaran** (codegen multi-contexto no
  las exporta). No corren tal cual; solo sirven de guía.
- **Selectores extremadamente frágiles**: posicionales (`#mat-select-value-13`, `.nth(3)`,
  `.ui-checkbox-state-hover`, `div.filter(hasText:/^Selecciona una opción$/)`). **No adoptar**: convertir
  a plantilla por etiqueta.
- **Traen credenciales de terceros en claro** (un correo `@gattaca.co` con su contraseña para Bizagi
  Management). Al incorporarlas hay que **sanearlas** (van al `.env`, nunca al repo/grabación).
- Mucho ruido de codegen: `CapsLock`, clics de más, Enters repetidos (el humano esperando), doble
  "Establecer ahora".

## 6. Implicación para el plan de trabajo
1. **AFI es un frente/proyecto SEPARADO de CRD** (otro proceso, otras apps). Sugiero `projects/colsubsidio-afi/`
   propio, reutilizando todo lo transversal ya construido (login-dominio D, archivo F, esperas G,
   buscar H, `${unico}`, multi-usuario).
2. **La pieza nueva y grande es MULTI-APLICACIÓN.** Propongo una extensión mayor (para diseñar con calma):
   `apps:` nombradas en el YAML (p. ej. `cliente`, `analista`, `admin`) cada una con su URL/login, y que
   cada paso indique en qué app corre (`en: cliente`). El motor mantiene una página/contexto por app.
3. **Recomendación de secuencia:** primero **cerrar el tren CRD** (ya encaminado: falta credenciales +
   Ext. E/F y los escenarios C1..C4). AFI entra como **fase 2** apenas CRD demuestre el modelo de punta a
   punta. Así no abrimos dos frentes a medias.
4. **Decisión de alcance que urge:** ¿el **portal Angular** (transacciones) entra en el alcance de
   automatización, o solo la parte de **Bizagi**? Es la diferencia de esfuerzo más grande de todo el
   proyecto (automatizar Angular Material con dropdowns en cascada es caro y frágil).

## 7. Preguntas abiertas (para el equipo / Fable)
1. **Alcance:** ¿automatizamos el portal Angular del cliente + Bizagi (E2E real, 3 apps), o solo el
   back-office Bizagi (más barato y estable)?
2. **Login:** ¿confirmas que el Work Portal se entra con dominio `domain` + la cuenta de QA del `.env` local? (desbloquea CRD).
3. **Timers:** ¿forzar los "Trabajos Temporizados" desde Bizagi Management es parte de la estrategia
   (requiere acceso admin) o preferimos esperar los tiempos reales de integración?
4. **Reconocimiento/QR:** ¿la inyección de `Código Estado/Respuesta Evento` en Bizagi es el método QA
   oficial para saltarse el reconocimiento biométrico?
5. **Diseño multi-app:** ¿el `apps:` en el YAML te suena, o prefieres un escenario por app enlazados por
   el número de caso?
