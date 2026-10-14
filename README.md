# Framework de Pruebas E2E - Bizagi Cloud + Playwright

Framework **reutilizable** para automatizar pruebas funcionales sobre **cualquier proyecto
Bizagi Cloud**. Patron Base Object Model. Filosofia: explicito por encima de la sobreingenieria.

Idea central: **se prueba la aplicacion en linea por el navegador** (no se necesita el codigo
fuente de Bizagi). Un **nucleo compartido** se construye una sola vez; cada proyecto solo
"enchufa" su URL y sus procesos.

## Las dos capas

```
shared/      NUCLEO COMPARTIDO  -> se construye una vez, sirve para TODOS los proyectos
projects/    UNA CARPETA POR PROYECTO -> aqui se enchufa cada cliente
```

### shared/ (no se toca por proyecto)
```
shared/
  core/      PlaywrightMethods, LoginActions, LogoutActions
  utils/     Validations (isVisible...), FileHelpers, ApiHelpers
  baseObjects/  login + inbox (comunes a todo Work Portal Bizagi Cloud)
  hazards/   login
  index.ts   se importa asi:  import { LoginActions, Validations } from '@shared'
```

### projects/<nombre>/ (lo propio de cada cliente)
```
projects/
  _template/   plantilla base (se clona; no se ejecuta directo)
  demo/        ejemplo concreto que ya corre
  <tu-cliente>/
    .env            URL + usuarios de ESE proyecto
    baseObjects/    localizadores de SUS procesos
    hazards/        resultados esperados de SUS flujos
    assets/         valores esperados
    resources/      archivos a cargar (PDFs...)
    tests/          sus pruebas (login.spec reutiliza el nucleo; create-case es plantilla)
```

## Instalacion

```bash
npm install
npx playwright install --with-deps chromium
```

## Crear un proyecto nuevo (lo que repites por cada cliente)

```bash
npm run new:project -- colpensiones          # clona la plantilla
cp projects/colpensiones/.env.example projects/colpensiones/.env   # completa URL + usuarios
npm run codegen -- https://colpensiones.bizagi.com    # captura localizadores reales
# -> pega los selectores en projects/colpensiones/baseObjects/process.objects.ts
npm test -- colpensiones                     # ejecuta
```

## Ejecutar

```bash
npm test -- demo                  # toda la suite del proyecto "demo"
npm test -- demo --grep @smoke    # solo smoke (login)
npm test -- demo --headed         # viendo el navegador
npm run report -- test-results/demo/html-report   # abre el reporte del ultimo run
```

Cada proyecto deja sus resultados en `test-results/<proyecto>/` (reporte, screenshots, video, traces).

## Escenarios por plantilla (data-driven)

Como Bizagi (BPM) siempre funciona igual —crear caso -> abrir actividad -> diligenciar ->
Siguiente -> avanza segun el flujo—, los procesos **no se graban ni se programan**: se
**describen en un archivo YAML** y un motor generico en `shared/` los ejecuta.

```
projects/<cliente>/scenarios/<nombre>.yaml   # el "guion" del caso de prueba
```

Se llena leyendo el **documento de requerimientos** (trazabilidad: requisito -> escenario ->
prueba). Palabras clave en espanol; los campos se ubican **por su etiqueta visible** (sin
selectores grabados). Plantilla comentada campo a campo: `projects/_template/scenarios/_ejemplo.yaml`
(los archivos que empiezan con `_` no se ejecutan).

```yaml
proceso: Radicación por aviso web
escenario: Radicador completa la información
etiquetas: [regresion]            # -> tags @regresion (filtra con --grep)
inicio:
  modo: crear-caso                # o "bandeja" (el caso ya llega a la bandeja)
  usuario: radicador1             # clave logica; identidad real en el .env
  proceso_a_crear: Radicación por aviso web
pasos:
  - actividad: Completar información
    verificar_al_entrar:
      - { campo: Observaciones, debe_estar: vacío }
    llenar:
      - { campo: Fecha del evento, valor: "2026-06-15", tipo: fecha }
      - { campo: Ciudad, valor: Bogotá, tipo: búsqueda }
    accion: Siguiente
hazards:
  - el_caso_avanza_a: Creación de caso de indemnización
  - el_caso_ya_no_esta_en_bandeja_de: radicador1
```

Tipos de campo: `texto | área de texto | fecha | número | lista | búsqueda | radio | checkbox`.
Hazards: `el_caso_avanza_a`, `el_caso_ya_no_esta_en_bandeja_de`, `asignado_a`,
`campo_tiene_valor: { campo, valor }`, `la_tabla_tiene_filas: { tabla, minimo }`,
`el_caso_termina: true`.
Para un campo dificil, la plantilla admite un `localizador:` opcional (apunta a
`projects/<cliente>/baseObjects`). Ningun selector de cliente vive en `shared/`.

**Categorias, tablas y `${unico}`:**
- `inicio.categoria: <grupo>` — si el Work Portal agrupa los procesos, el motor hace el clic
  intermedio en esa categoria antes del proceso (opcional; se omite si el cliente no la usa).
- `tablas:` dentro de un paso — colecciones que se llenan por **pop-up** ("Adicionar"): por cada
  fila abre el pop-up, llena SUS campos (mismos tipos, buscados solo dentro del pop-up) y guarda.
  Se verifica con el hazard `la_tabla_tiene_filas: { tabla, minimo }`.
- `${unico}` en cualquier `valor:` — se reemplaza por la **fecha-hora de la corrida**
  (ej. `20260707-143205`) para identificar los casos creados y no chocar entre corridas.

**Esperas (procesos con integraciones):** tras **cada** `accion:` el motor espera de forma implícita
(que desaparezca el "procesando" y aparezca la actividad siguiente; `ESPERA_ACCION_SEGUNDOS`, default 90).
Donde el negocio sabe que corre una **integración lenta** (SAP, motor de decisiones, biometría), el paso
lo declara y ahí la espera es larga y **estricta** (falla con mensaje claro si no llega):
```yaml
    accion: Siguiente
    esperar_integracion:
      hasta_llegar_a: Registrar información adicional
      maximo_minutos: 5          # opcional; default ESPERA_INTEGRACION_MINUTOS del .env
```

```yaml
inicio:
  modo: crear-caso
  usuario: comprador1
  categoria: Gestión de contratos            # clic intermedio (opcional)
  proceso_a_crear: Definición datos iniciales Contratos
pasos:
  - actividad: Definir datos iniciales
    llenar:
      - { campo: Objeto contractual, valor: "Prueba ${unico}", tipo: área de texto }
    tablas:
      - tabla: Necesidades planeadas
        filas:
          - llenar:
              - { campo: Tipo de gasto, valor: "A - Funcionamiento", tipo: lista }
    accion: Guardar
hazards:
  - la_tabla_tiene_filas: { tabla: Necesidades planeadas, minimo: 1 }
```

**Usuarios y login (en el `.env` del proyecto):**
```
BIZAGI_LOGIN_MODO=lista            # lista | estandar | fichas
USUARIO_radicador1=domain\Radicador1
CLAVE_radicador1=****              # solo si el modo es "estandar"
BIZAGI_FORM_IFRAME=iframe#...      # opcional, si la forma se pinta en un iframe
```

**Correr los escenarios:**
```bash
npm test -- <cliente>                    # descubre y corre los .yaml del proyecto
npm test -- <cliente> --grep @plantilla  # solo los escenarios por plantilla
npm test -- <cliente> --grep @regresion  # por etiqueta
```

Si el proyecto no tiene una URL real (`BIZAGI_BASE_URL`), el escenario corre en **modo
esqueleto**: valida que la plantilla es correcta y que el motor la arma, sin ejecutar contra
un Bizagi vivo (util para el `demo`). Cada paso y cada hazard adjunta **evidencia** (screenshot)
al reporte HTML.

### Cuando usar plantilla, paso personalizado o grabado (guia de decision)

La **plantilla es la via por defecto**. Solo se graba lo que la plantilla no pueda expresar.

| ¿Como es la pantalla / el flujo?                     | Que usar                          | Donde vive                                   |
|------------------------------------------------------|-----------------------------------|----------------------------------------------|
| Formulario Bizagi normal                             | **Plantilla** YAML                | `scenarios/<nombre>.yaml`                    |
| Casi todo normal, solo **una pantalla** es rara      | Plantilla + **paso personalizado**| `scenarios/…yaml` + `custom/<nombre>.ts`     |
| **Todo** el flujo es no estandar                     | **Grabado** adoptado              | `grabados/<nombre>.spec.ts`                   |

Grabar y adoptar los casos raros:

```bash
npm run grabar  -- <cliente> <nombre>              # graba el caso completo (codegen en Edge)
npm run grabar  -- <cliente> <nombre> --como paso  # graba SOLO una pantalla (snippet de custom/)
npm run adoptar -- <cliente> <nombre>              # quita login/credenciales y crea el escenario formal
```

Descubrir y filtrar (plantillas + grabados, con su origen marcado):

```bash
npm test -- <cliente> --list                  # lista [plantilla] … y [grabado] …
npm test -- <cliente> --escenario "<texto>"   # corre solo esa definicion (por nombre o por "escenario:")
npm test -- <cliente> --fuente grabados       # corre solo una fuente (plantillas | grabados)
```

Reglas de oro: nada especifico de un cliente entra a `shared/` (los casos raros viven en
`grabados/` o `custom/` del proyecto); **ninguna credencial** en grabaciones ni escenarios,
solo usuarios logicos del `.env`. Las grabaciones crudas de `_crudo/` no se ejecutan.

## Que se reutiliza y que cambia

| | Donde vive | Cambia por proyecto? |
|---|---|---|
| Login/logout, metodos, validaciones | `shared/` | No |
| Objetos login + inbox | `shared/baseObjects` | No |
| URL y usuarios | `projects/<x>/.env` | Si |
| Objetos de los procesos | `projects/<x>/baseObjects` | Si |
| Tests y Hazards de procesos | `projects/<x>/` | Si |

## Localizadores y iframes (Bizagi)

IDs dinamicos: apuntar por nombre de atributo (`[id*="Atributo"]`) o por label, centralizado
en el Base Object. Si la forma se renderiza en `<iframe>`:
`page.frameLocator('iframe#...').locator(selector)`.

## CI (Azure DevOps)

`pipelines/azure-pipelines.yml` corre la suite de un proyecto (variable `PROJECT`).
Para automatizar, el framework vive en **Azure Repos** (repo de TUS tests, separado de Bizagi).
PR -> smoke (@smoke); main/develop -> suite completa. Publica JUnit (Azure Test Plans / MEP)
y el reporte HTML como artefacto.

## Alineacion CMMI / MEP

Trazabilidad: requisito -> criterio de aceptacion -> escenario (Hazard) -> test (.spec).
Indicadores sugeridos: cobertura automatizada, % exito, tiempo de ejecucion, flakiness, defectos.
Recordatorio de ROI: una prueba compensa el esfuerzo hacia la ejecucion ~12; priorizar regresion.
