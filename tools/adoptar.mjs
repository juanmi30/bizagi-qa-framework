#!/usr/bin/env node
// Adopta una grabación CRUDA -> escenario formal del framework.
// Uso:
//   npm run adoptar -- <cliente> <nombre>              (grabado de caso completo)
//   npm run adoptar -- <cliente> <nombre> --como paso  (paso personalizado)
// Qué hace: quita el login grabado (y CUALQUIER credencial), envuelve los pasos con
// el molde del núcleo (login lógico + esperas + evidencia + hazards) y deja los
// hazards/etiquetas como huecos para completarlos en la adopción asistida.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const argv = process.argv.slice(2);
let como = '';
const libres = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--como') como = argv[++i] ?? '';
  else if (a.startsWith('--como=')) como = a.slice('--como='.length);
  else libres.push(a);
}
const [cliente, nombre] = libres;
if (!cliente || !nombre) {
  console.error('Uso: npm run adoptar -- <cliente> <nombre> [--como paso]');
  process.exit(1);
}

const projectDir = resolve('projects', cliente);
if (!existsSync(projectDir)) {
  console.error(`No existe el proyecto "${cliente}".`);
  process.exit(1);
}
const esPaso = /^paso$/i.test(como);
const crudo = esPaso
  ? resolve(projectDir, 'custom', '_crudo', `${nombre}.ts`)
  : resolve(projectDir, 'grabados', '_crudo', `${nombre}.spec.ts`);
if (!existsSync(crudo)) {
  console.error(`No encontré la grabación cruda: ${relative(process.cwd(), crudo)}`);
  console.error(`Primero grábala con:  npm run grabar -- ${cliente} ${nombre}${esPaso ? ' --como paso' : ''}`);
  process.exit(1);
}

const texto = readFileSync(crudo, 'utf8');
const lineas = texto.split(/\r?\n/);

// 1) Toma solo las acciones (await page.*)
const acciones = lineas.filter((l) => /^\s*await\s+page\./.test(l));
// 2) Corta todo el login: hasta el clic en "Ingresar" (inclusive)
const idxLogin = acciones.findLastIndex((l) => /Ingresar/i.test(l));
let pasos = idxLogin >= 0 ? acciones.slice(idxLogin + 1) : acciones.slice();
// 3) Quita cualquier resto de login/credencial por seguridad
const esLogin = (l) => /goto\(|Password|UserName|getByLabel\(['"]Usuario['"]\)|Ingresar|selectOption\(['"]domain/i.test(l);
const antes = pasos.length;
pasos = pasos.filter((l) => !esLogin(l));
const quitadasCred = acciones.length - pasos.length;
const traiaCredenciales = /domain\\|Password|UserName|selectOption\(['"]domain/i.test(texto);

const cuerpo = pasos.map((l) => '    ' + l.trim()).join('\n');
const titulo = nombre.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

let destino;
let contenido;
if (esPaso) {
  destino = resolve(projectDir, 'custom', `${nombre}.ts`);
  contenido = `import type { PasoContext } from '@shared';

// Paso personalizado adoptado desde una grabación. El motor lo invoca en medio de
// una plantilla, con la sesión ya iniciada. Recibe la página abierta y el contexto.
export default async function ({ page }: PasoContext): Promise<void> {
${cuerpo.replace(/^ {4}/gm, '  ')}
}
`;
} else {
  destino = resolve(projectDir, 'grabados', `${nombre}.spec.ts`);
  contenido = `import { registerGrabado } from '@shared';

// Escenario GRABADO adoptado. Sin login ni credenciales: el molde hace el login
// del núcleo con el usuario lógico del .env. Completa etiquetas y hazards abajo.
registerGrabado(
  {
    escenario: '${titulo}',
    usuario: 'admin',        // usuario LÓGICO del .env (USUARIO_admin=...)
    etiquetas: [],           // <- se completan en la adopción (ej: 'regresion')
    hazards: [],             // <- se completan en la adopción
    archivo: '${nombre}',
  },
  async ({ page }) => {
${cuerpo}
  },
);
`;
}

mkdirSync(resolve(destino, '..'), { recursive: true });
writeFileSync(destino, contenido, 'utf8');

console.log('Adopción mecánica lista:');
console.log(`  • Login grabado eliminado y reemplazado por el login del núcleo.`);
console.log(`  • Credenciales quitadas: ${traiaCredenciales ? 'sí' : 'no se detectaron'} (${quitadasCred} línea(s) de login/credencial).`);
console.log(`  • Pasos conservados: ${pasos.length}.`);
console.log(`  • Escenario formal: ${relative(process.cwd(), destino)}`);
console.log(`  • La grabación cruda queda de respaldo en _crudo/ (no se ejecuta).`);
console.log('');
console.log('FALTA la adopción asistida: definir etiquetas y hazards (te los pregunto en el chat).');
