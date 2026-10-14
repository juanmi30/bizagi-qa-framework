#!/usr/bin/env node
// Crea un proyecto nuevo clonando projects/_template.
// Uso:  npm run new:project -- <nombre>
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , name] = process.argv;
if (!name) { console.error('Uso: npm run new:project -- <nombre>'); process.exit(1); }
const dest = resolve('projects', name);
if (existsSync(dest)) { console.error(`Ya existe projects/${name}.`); process.exit(1); }
cpSync(resolve('projects', '_template'), dest, { recursive: true });
console.log(`Proyecto creado: projects/${name}`);
console.log(`Siguiente:`);
console.log(`  1) cp projects/${name}/.env.example projects/${name}/.env  y completa URL + usuarios`);
console.log(`  2) npm run codegen -- <URL>   para capturar localizadores`);
console.log(`  3) npm test -- ${name}`);
