import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';

/**
 * Registro lógico de datos SDE (data/datasets.yaml) + resolución de valores en ejecución.
 * Los valores de QA viven solo en el .env del proyecto; este módulo nunca los devuelve en
 * textos de reporte: para eso está `describir()`, que muestra la referencia, no el valor.
 */

export type Fuente = 'matriz' | 'qa' | 'generado' | 'config';

export interface Propiedad {
  nombre: string;
  fuente: Fuente;
  env?: string;
  valor?: string;
  sensible?: boolean;
  opcional?: boolean;
}

export interface Dataset {
  id: string;
  descripcion: string;
  actor?: string;
  propiedades: Propiedad[];
  usado_por: string[];
  limpieza?: string;
  nota?: string;
  relaciones?: string;
}

export interface Actor {
  alias: string;
  rol: string;
  variables: string[];
  dominio?: string;
  usado_por: string[];
}

export interface Registro {
  actores: Record<string, Actor>;
  datasets: Record<string, Dataset>;
}

export type Entorno = Record<string, string | undefined>;

export interface EstadoDisponibilidad {
  id: string;
  estado: 'READY' | 'MISSING';
  faltantes: string[];     // nombres de variables de entorno (nunca valores)
}

export const RUTA_REGISTRO = resolve(__dirname, '..', 'data', 'datasets.yaml');

export function cargarRegistro(ruta = RUTA_REGISTRO): Registro {
  const doc = yaml.load(readFileSync(ruta, 'utf8')) as {
    actores?: Record<string, Omit<Actor, 'alias'>>;
    datasets?: Record<string, Omit<Dataset, 'id'>>;
  };
  const problemas: string[] = [];
  const actores: Record<string, Actor> = {};
  for (const [alias, a] of Object.entries(doc?.actores ?? {})) {
    if (!Array.isArray(a?.variables) || a.variables.length === 0) problemas.push(`actor "${alias}": falta "variables"`);
    actores[alias] = { alias, ...a, usado_por: a?.usado_por ?? [] };
  }
  const datasets: Record<string, Dataset> = {};
  for (const [id, d] of Object.entries(doc?.datasets ?? {})) {
    const props = d?.propiedades ?? [];
    if (props.length === 0) problemas.push(`dataset "${id}": sin propiedades`);
    for (const p of props) {
      if (!['matriz', 'qa', 'generado', 'config'].includes(p.fuente)) problemas.push(`dataset "${id}.${p.nombre}": fuente inválida "${p.fuente}"`);
      if ((p.fuente === 'qa' || p.fuente === 'config') && !p.env) problemas.push(`dataset "${id}.${p.nombre}": fuente ${p.fuente} requiere "env"`);
      if ((p.fuente === 'matriz' || p.fuente === 'generado') && p.valor == null) problemas.push(`dataset "${id}.${p.nombre}": fuente ${p.fuente} requiere "valor"`);
      if (p.fuente === 'qa' && p.valor != null) problemas.push(`dataset "${id}.${p.nombre}": un dato de QA no puede tener "valor" en el repositorio`);
    }
    if (d?.actor && !actores[d.actor]) problemas.push(`dataset "${id}": actor "${d.actor}" no declarado`);
    datasets[id] = { id, ...d, propiedades: props, usado_por: d?.usado_por ?? [] };
  }
  if (problemas.length) throw new Error('data/datasets.yaml inválido:\n  • ' + problemas.join('\n  • '));
  return { actores, datasets };
}

const tieneValor = (v: string | undefined): boolean => v != null && v.trim() !== '';

export function estadoActor(reg: Registro, alias: string, env: Entorno = process.env): EstadoDisponibilidad {
  const a = reg.actores[alias];
  if (!a) return { id: alias, estado: 'MISSING', faltantes: [`actor "${alias}" no declarado en datasets.yaml`] };
  const faltantes = a.variables.filter((v) => !tieneValor(env[v]));
  // El dominio es obligatorio si no hay uno global: sin él el login no puede elegir dominio.
  if (a.dominio && !tieneValor(env[a.dominio]) && !tieneValor(env.BIZAGI_LOGIN_DOMINIO)) faltantes.push(`${a.dominio} (o BIZAGI_LOGIN_DOMINIO)`);
  return { id: alias, estado: faltantes.length ? 'MISSING' : 'READY', faltantes };
}

export function estadoDataset(reg: Registro, id: string, env: Entorno = process.env): EstadoDisponibilidad {
  const d = reg.datasets[id];
  if (!d) return { id, estado: 'MISSING', faltantes: [`dataset "${id}" no declarado en datasets.yaml`] };
  const faltantes = d.propiedades
    .filter((p) => !p.opcional && (p.fuente === 'qa' || p.fuente === 'config') && !tieneValor(env[p.env!]))
    .map((p) => p.env!);
  return { id, estado: faltantes.length ? 'MISSING' : 'READY', faltantes };
}

export class DatoFaltanteError extends Error {
  constructor(readonly referencia: string, readonly variable?: string) {
    super(`Dato no disponible: ${referencia}${variable ? ` (variable ${variable} vacía)` : ''}`);
    this.name = 'DatoFaltanteError';
  }
}

export interface ContextoDatos {
  registro: Registro;
  env: Entorno;
  unico: string;
}

const REF = /\$\{(dato|config):([^}]+)\}|\$\{unico\}/g;

/** Resuelve ${dato:ID.prop}, ${config:VAR} y ${unico} dentro de un texto. Lanza si falta un dato. */
export function resolverTexto(texto: string, ctx: ContextoDatos): string {
  return texto.replace(REF, (todo, tipo?: string, ref?: string) => {
    if (todo === '${unico}') return ctx.unico;
    if (tipo === 'config') {
      const v = ctx.env[ref!];
      if (!tieneValor(v)) throw new DatoFaltanteError(todo, ref);
      return v!.trim();
    }
    const [id, prop] = ref!.split('.');
    const p = ctx.registro.datasets[id]?.propiedades.find((x) => x.nombre === prop);
    if (!p) throw new DatoFaltanteError(todo);
    if (p.fuente === 'matriz' || p.fuente === 'generado') return resolverTexto(String(p.valor), ctx);
    const v = ctx.env[p.env!];
    if (!tieneValor(v)) {
      if (p.opcional) return ''; // propiedad opcional ausente: texto vacío (nunca un valor inventado)
      throw new DatoFaltanteError(todo, p.env);
    }
    return v!.trim();
  });
}

/** ¿El texto referencia algún dato sensible? (para enmascarar en reportes) */
export function esSensible(texto: string, reg: Registro): boolean {
  for (const m of texto.matchAll(/\$\{dato:([^}.]+)\.([^}]+)\}/g)) {
    if (reg.datasets[m[1]]?.propiedades.find((p) => p.nombre === m[2])?.sensible) return true;
  }
  return false;
}

/**
 * Texto apto para reporte: literales de matriz/generados se muestran; datos de QA/config se muestran
 * como su referencia (ej. «dato:POL-AUTOS-VIGENTE.poliza»), nunca con su valor.
 */
export function describir(texto: string, reg: Registro, unico = '${unico}', env?: Entorno): string {
  return texto.replace(REF, (todo, tipo?: string, ref?: string) => {
    if (todo === '${unico}') return unico;
    if (tipo === 'config') return env?.[ref!]?.trim() ? `${env[ref!]!.trim()}` : `«config:${ref}»`;
    const [id, prop] = ref!.split('.');
    const p = reg.datasets[id]?.propiedades.find((x) => x.nombre === prop);
    if (p && (p.fuente === 'matriz' || p.fuente === 'generado')) return describir(String(p.valor), reg, unico, env);
    // Datos de QA NO sensibles (listas paramétricas) se muestran si se pasa el entorno; los sensibles nunca.
    if (p && env && !p.sensible && env[p.env!]?.trim()) return env[p.env!]!.trim();
    return `«dato:${ref}»`;
  });
}

/** Referencias ${dato:...}/${config:...} usadas en cualquier valor (para validar escenarios). */
export function referencias(valor: unknown): string[] {
  const out: string[] = [];
  const visitar = (v: unknown): void => {
    if (typeof v === 'string') for (const m of v.matchAll(/\$\{(dato|config):([^}]+)\}/g)) out.push(`${m[1]}:${m[2]}`);
    else if (Array.isArray(v)) v.forEach(visitar);
    else if (v && typeof v === 'object') Object.values(v).forEach(visitar);
  };
  visitar(valor);
  return out;
}
