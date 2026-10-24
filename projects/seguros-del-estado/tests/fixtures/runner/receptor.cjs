// FIXTURE (no es una prueba): sustituye al CLI de Playwright en las pruebas del runner (BIZAGI_RUNNER_CLI).
// Registra en RECEPTOR_SALIDA, como JSON, exactamente los argumentos que recibió. No ejecuta ninguna prueba.
// Con RECEPTOR_CORRIDA_SALIDA registra también el identificador de corrida que le entregó el runner (BIZAGI_CORRIDA).
const fs = require('node:fs');
fs.writeFileSync(process.env.RECEPTOR_SALIDA, JSON.stringify(process.argv.slice(2)));
if (process.env.RECEPTOR_CORRIDA_SALIDA) fs.writeFileSync(process.env.RECEPTOR_CORRIDA_SALIDA, process.env.BIZAGI_CORRIDA ?? '');
