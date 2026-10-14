// FIXTURE (no es una prueba): sustituye al CLI de Playwright en las pruebas del runner (BIZAGI_RUNNER_CLI).
// Registra en RECEPTOR_SALIDA, como JSON, exactamente los argumentos que recibió. No ejecuta ninguna prueba.
require('node:fs').writeFileSync(process.env.RECEPTOR_SALIDA, JSON.stringify(process.argv.slice(2)));
