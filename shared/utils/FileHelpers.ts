import { resolve } from 'node:path';

/**
 * Resuelve la ruta de un recurso DEL PROYECTO ACTIVO: projects/<PROJECT>/resources/<archivo>.
 * El proyecto activo lo define la variable PROJECT (la setea tools/run.mjs).
 */
export function resourcePath(fileName: string): string {
  const project = process.env.PROJECT ?? '';
  return resolve(process.cwd(), 'projects', project, 'resources', fileName);
}
