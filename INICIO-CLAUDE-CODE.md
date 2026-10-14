# Briefing para Claude Code — Pruebas automatizadas de Bizagi Cloud con Playwright

## Cómo necesito que me trates
- **No soy desarrolladora.** Soy analista funcional y líder de calidad.
- Explícame **cada paso en español sencillo**. Si usas un término técnico, defínelo en una frase.
- Ve **una cosa a la vez**: dime qué vas a hacer, hazlo, muéstrame el resultado y espera mi "ok" antes de seguir.
- **Antes de ejecutar cualquier comando**, dime en una frase qué hace y qué debería ver yo si sale bien.
- Si algo falla, explícamelo en simple y dame la opción más sencilla para continuar. Sin alarmas.

## Mi objetivo
Dejar funcionando un framework de pruebas automatizadas (Playwright) sobre el Work Portal de
**Bizagi Cloud**, reutilizable para cualquier proyecto. **Ya tengo los archivos del framework en esta carpeta.**

## Qué es este proyecto (para que lo entiendas)
- Prueba la aplicación Bizagi **por el navegador, como un usuario**. NO necesita el código fuente de Bizagi.
- Tiene **dos capas**:
  - `shared/` = **núcleo común** (login, logout, validaciones, objetos de login e inbox). Se construye
    una vez y sirve para todos los proyectos. **No se toca por proyecto.**
  - `projects/<cliente>/` = **lo propio de cada cliente**: su `.env` (URL + usuarios), los localizadores
    de sus procesos, sus pruebas y los resultados esperados ("Hazards").
  - Existe `projects/_template/` (plantilla a clonar) y `projects/demo/` (ejemplo que ya corre).
- Hay un **`README.md`** en la carpeta con el detalle: **léelo primero.**

## Comandos disponibles (ya están en package.json)
- `npm install` y `npx playwright install` → instalación inicial.
- `npm test -- demo --list` → solo **lista** las pruebas (verifica sin correr).
- `npm test -- demo` → corre el proyecto demo.
- `npm test -- <cliente> --grep @smoke` → solo el smoke (login).
- `npm run new:project -- <cliente>` → crea un proyecto nuevo desde la plantilla.
- `npm run codegen -- <URL>` → graba mi navegación y captura los localizadores.

## Qué quiero que hagas, en orden
1. Verifica si tengo **Node.js 20 o superior**. Si no, guíame para instalarlo desde nodejs.org (versión LTS), paso a paso.
2. Confirma que estás en la **carpeta correcta** (debe verse `shared/`, `projects/`, `package.json`).
3. Lee el `README.md` y resúmeme en 3 líneas qué entendiste, para confirmar que estamos alineados.
4. Corre `npm install`. Explícame qué hace y avísame cuándo termine.
5. Corre `npx playwright install`.
6. Corre `npm test -- demo --list` y muéstrame que aparecen **4 pruebas**. Ese es el "todo está vivo".
7. Cuando yo te diga, creamos **mi primer proyecto real**:
   - Te daré el **nombre del cliente** → corre `npm run new:project -- <nombre>`.
   - Te daré la **URL de QA y el usuario** → ayúdame a ponerlos en `projects/<nombre>/.env`.
   - Corre `npm run codegen -- <URL>`; yo haré login y navegaré mi proceso; tú me ayudas a tomar
     los localizadores generados y pegarlos en `projects/<nombre>/baseObjects/`.
   - Ajustamos juntos los **Hazards** (lo que debe pasar tras cada paso) y corremos `npm test -- <nombre>`.

## Qué pongo yo (no lo puedes adivinar)
- La **URL del ambiente de QA** de Bizagi y un **usuario/clave de prueba**.
- El **flujo de negocio** del proceso: qué campos lleno, qué botón sigue, qué debe ocurrir al final.

## Qué NO hay que hacer
- No modificar nada dentro de `shared/` salvo que te lo pida explícitamente (es el núcleo común).
- No pedir ni tocar el código fuente de Bizagi; no se necesita.
- No guardar mis credenciales en ningún archivo que no sea el `.env` local de cada proyecto.

## Para empezar
Confírmame que entendiste el objetivo y **arranca por el paso 1**. Recuerda: una cosa a la vez, en español sencillo, y esperas mi "ok" entre paso y paso.
