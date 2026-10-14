#!/usr/bin/env node
// Crea el esqueleto de un Base Object dentro de un proyecto.
// Uso:  npm run new:object -- <proyecto> <NombreObjeto>
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , project, name] = process.argv;
if (!project || !name) { console.error('Uso: npm run new:object -- <proyecto> <NombreObjeto>'); process.exit(1); }
const file = resolve('projects', project, 'baseObjects', `${name.toLowerCase()}.objects.ts`);
if (existsSync(file)) { console.error(`Ya existe ${file}`); process.exit(1); }
writeFileSync(
  file,
  `/** Base Object: ${name} (generado). Captura localizadores con: npm run codegen */\n` +
  `export const ${name}Objects = {\n  // ejemplo: campoX: '#idReal',\n};\n`,
);
console.log(`Creado ${file}`);
