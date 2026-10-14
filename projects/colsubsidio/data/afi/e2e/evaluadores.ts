import type { ExpectativaPantallaE2E as ExpectativaPantalla } from './contrato';
import type { ResultadoVerificacion } from './modelo';

/**
 * Evaluadores PUROS de verificaciones E2E sobre observaciones ya sanitizadas (tablas paramétricas, estructura de pantalla).
 * Comparación EXACTA: solo se normalizan espacios (y el marcador " *" de obligatorio en etiquetas). Nunca contains/fuzzy.
 */

export const normalizarEspacios = (t: string) => t.replace(/\s+/g, ' ').trim();
/** Etiqueta visible sin el marcador de obligatorio ("Razón social *" -> "Razón social"). */
export const etiquetaLimpia = (t: string) => normalizarEspacios(t).replace(/\s*\*$/, '');

export interface TablaObservada { columnas: readonly string[]; filas: readonly (readonly string[])[] }

export function evaluarColumnas(tabla: TablaObservada, esperadas: readonly string[]): ResultadoVerificacion {
  const presentes = new Set(tabla.columnas.map(normalizarEspacios));
  const faltan = esperadas.filter(c => !presentes.has(normalizarEspacios(c)));
  return faltan.length
    ? { tipo: 'parametrica-columnas', estado: 'FAIL', detalle: `Faltan columnas: ${faltan.join(', ')}. Columnas observadas: ${[...presentes].join(', ')}` }
    : { tipo: 'parametrica-columnas', estado: 'PASS', detalle: `Columnas presentes: ${esperadas.join(', ')}` };
}

export function evaluarMensajes(tabla: TablaObservada, columnaMensaje: string, mensajes: readonly { descripcion: string; texto: string }[]): ResultadoVerificacion {
  const i = tabla.columnas.map(normalizarEspacios).indexOf(normalizarEspacios(columnaMensaje));
  if (i < 0) return { tipo: 'parametrica-mensajes', estado: 'FAIL', detalle: `No existe la columna "${columnaMensaje}"` };
  const textos = tabla.filas.map(f => normalizarEspacios(f[i] ?? ''));
  const resultado = mensajes.map(m => ({ m, n: textos.filter(t => t === normalizarEspacios(m.texto)).length }));
  const faltan = resultado.filter(r => r.n !== 1);
  return faltan.length
    ? { tipo: 'parametrica-mensajes', estado: 'FAIL', detalle: `Sin registro exacto (o duplicado) para: ${faltan.map(r => `${r.m.descripcion} [coincidencias=${r.n}]`).join('; ')}` }
    : { tipo: 'parametrica-mensajes', estado: 'PASS', detalle: `Mensajes exactos presentes: ${mensajes.map(m => m.descripcion).join('; ')}` };
}

/** Estructura mínima que se evalúa (subconjunto de EstructuraPantalla). */
export interface PantallaObservada {
  encabezados: readonly string[];
  migas?: readonly string[];
  controles: readonly { identidad: string; etiqueta?: string; placeholder?: string }[];
}

export function evaluarPantalla(p: PantallaObservada, e: ExpectativaPantalla): ResultadoVerificacion {
  const fallos: string[] = [], ok: string[] = [];
  if (e.titulo) {
    const enc = p.encabezados.map(normalizarEspacios);
    const esperado = normalizarEspacios(e.titulo.texto);
    if (!enc.includes(esperado)) fallos.push(`no se observó el título "${esperado}" (encabezados: ${enc.join(' | ') || 'ninguno'})`);
    else if (e.titulo.unico && enc.length !== 1) fallos.push(`el título no es único: ${enc.length} encabezados (${enc.join(' | ')})`);
    else ok.push(`título "${esperado}"${e.titulo.unico ? ' único' : ''}`);
  }
  const etiquetas = new Set(p.controles.map(c => c.etiqueta).filter((x): x is string => !!x).map(etiquetaLimpia));
  for (const et of e.etiquetasPresentes ?? []) (etiquetas.has(etiquetaLimpia(et)) ? ok : fallos).push(`etiqueta "${etiquetaLimpia(et)}" ${etiquetas.has(etiquetaLimpia(et)) ? 'presente' : 'ausente'}`);
  const textos = new Set([...etiquetas, ...p.controles.map(c => c.placeholder).filter((x): x is string => !!x).map(etiquetaLimpia), ...p.encabezados.map(normalizarEspacios)]);
  for (const et of e.etiquetasAusentes ?? []) (textos.has(etiquetaLimpia(et)) ? fallos : ok).push(`"${etiquetaLimpia(et)}" ${textos.has(etiquetaLimpia(et)) ? 'visible (no debería)' : 'no visible'}`);
  if (e.migaContiene !== undefined) {
    const migas = (p.migas ?? []).map(normalizarEspacios);
    const hay = migas.some(m => m.split(/\s*\/\s*/).includes(normalizarEspacios(e.migaContiene!)));
    (hay ? ok : fallos).push(`miga "${e.migaContiene}" ${hay ? 'presente' : `ausente (migas: ${migas.join(' | ') || 'ninguna'})`}`);
  }
  return fallos.length
    ? { tipo: 'pantalla', estado: 'FAIL', detalle: fallos.join('; ') }
    : { tipo: 'pantalla', estado: 'PASS', detalle: ok.join('; ') };
}
