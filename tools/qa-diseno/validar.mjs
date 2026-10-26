import { readFileSync } from 'node:fs';
import { validarContrato, validarFuentes } from './contrato.mjs';

// Documental únicamente: no importa Playwright ni abre Bizagi ni carga .env.
try {
  if (process.argv.length !== 3) throw new Error('Uso: node tools/qa-diseno/validar.mjs archivo.diseno.json');
  const valor = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const informe = validarContrato(valor);
  if (informe.valido) informe.errores.push(...validarFuentes(valor));
  informe.valido = informe.errores.length === 0;
  console.log(JSON.stringify(informe, null, 2));
  process.exitCode = informe.valido ? 0 : 1;
} catch {
  console.error('No se pudo validar la entrada JSON. Revise la ruta y el formato; no se muestra su contenido.');
  process.exitCode = 1;
}
