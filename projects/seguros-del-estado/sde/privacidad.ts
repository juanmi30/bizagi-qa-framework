import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { escribirZip, leerZip } from '../../../shared/utils/zip';

/**
 * COPIA de un soporte Word para mostrar fuera del equipo QA: oculta en las capturas el nombre y el correo de los usuarios
 * de QA (OCR de Windows, sin servicios externos). El soporte original, sus capturas archivadas y su trazabilidad no se
 * tocan: se lee el DOCX, se procesan copias de sus imágenes en una carpeta temporal propia y se escribe un DOCX nuevo.
 */
export const SCRIPT_ENMASCARAR = resolve(__dirname, '..', 'tools', 'enmascarar-capturas.ps1');

/** Fragmentos identificables de los usuarios QA (variables USUARIO_* de los actores): sin dominio, partes de 4+ letras. */
export function fragmentosUsuarios(env: Record<string, string | undefined>, variables: string[]): string[] {
  const t = new Set<string>();
  for (const v of variables.filter((x) => /^USUARIO_/i.test(x))) {
    const usuario = (env[v] ?? '').trim().split('\\').pop() ?? '';
    for (const parte of [usuario.split('@')[0], ...usuario.split(/[.\s_@-]+/)]) if (parte.length >= 4) t.add(parte.toLowerCase());
  }
  return [...t];
}

export function copiaSinDatosPersonales(o: { docx: string; salida: string; fragmentos: string[] }): { docx: string; imagenes: number; zonas: number; sinZonas: string[] } {
  if (!o.fragmentos.length) throw new Error('No hay fragmentos de usuarios QA que ocultar (variables USUARIO_* vacías).');
  const entradas = leerZip(readFileSync(o.docx));
  const imagenes = entradas.filter((e) => /^word\/media\/sde-evidencia-\d+\.png$/.test(e.nombre));
  const tmp = mkdtempSync(resolve(tmpdir(), 'sde-demo-'));
  try {
    const [dEnt, dSal] = [resolve(tmp, 'entrada'), resolve(tmp, 'salida')];
    mkdirSync(dEnt);
    for (const e of imagenes) writeFileSync(resolve(dEnt, basename(e.nombre)), e.datos);
    const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_ENMASCARAR, '-Entrada', dEnt, '-Salida', dSal],
      { encoding: 'utf8', env: { ...process.env, SDE_TOKENS_OCULTAR: o.fragmentos.join('|') }, maxBuffer: 16 * 1024 * 1024, timeout: 30 * 60_000 });
    if (r.status !== 0) throw new Error(`El enmascarado falló (código ${r.status}): ${(r.stderr || '').slice(0, 500)}`);
    const zonas = new Map(r.stdout.split(/\r?\n/).filter((l) => l.startsWith('{')).map((l) => { const j = JSON.parse(l) as { archivo: string; zonas: number }; return [j.archivo, j.zonas]; }));
    const salida = entradas.map((e) => {
      if (!imagenes.includes(e)) return e;
      const f = resolve(dSal, basename(e.nombre));
      if (!existsSync(f)) throw new Error(`Falta la copia enmascarada de ${e.nombre}.`);
      return { nombre: e.nombre, datos: readFileSync(f) };
    });
    mkdirSync(resolve(o.salida, '..'), { recursive: true });
    writeFileSync(o.salida, escribirZip(salida), { flag: 'wx' }); // nunca sobrescribe
    return { docx: o.salida, imagenes: imagenes.length, zonas: [...zonas.values()].reduce((n, z) => n + z, 0), sinZonas: imagenes.map((e) => basename(e.nombre)).filter((n) => !zonas.get(n)) };
  } finally {
    rmSync(tmp, { recursive: true, force: true }); // solo la carpeta temporal propia
  }
}
