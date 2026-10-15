/**
 * Validaciones de PRESENTACIÓN de formularios (textos, ortografía, orden de campos), como funciones puras.
 *
 * Genérico: no contiene reglas, textos ni selectores de ningún proyecto. Cada proyecto aporta sus expectativas
 * aprobadas (con su fuente) y sus reglas ortográficas como datos, y recoge del DOM lo observado con sus propios
 * selectores. Aquí solo se compara.
 */

/** Etiqueta de campo sin el formato que añade el portal: marca de obligatorio "*" y ":" final. */
export function textoEtiqueta(t: string): string {
  return t.replace(/\s+/g, ' ').trim().replace(/\s*\*?\s*:?\s*$/, '').trim();
}

/** Clave para detectar diferencias SOLO de ortografía o capitalización: sin tildes, en minúsculas, sin formato. */
export function claveOrtografica(t: string): string {
  return textoEtiqueta(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

export type ComparacionTexto =
  | { estado: 'exacto'; observado: string }
  | { estado: 'difiere_ortografia'; observado: string }
  | { estado: 'ausente' };

/**
 * Compara un texto APROBADO con los observados: exacto (tildes y mayúsculas incluidas), o difiere solo en
 * ortografía/capitalización (mismo texto sin tildes ni mayúsculas), o ausente.
 */
export function compararConAprobado(aprobado: string, observados: string[]): ComparacionTexto {
  const objetivo = textoEtiqueta(aprobado);
  const exacto = observados.find((o) => textoEtiqueta(o) === objetivo);
  if (exacto != null) return { estado: 'exacto', observado: exacto };
  const clave = claveOrtografica(aprobado);
  const parecido = observados.find((o) => claveOrtografica(o) === clave);
  return parecido != null ? { estado: 'difiere_ortografia', observado: parecido } : { estado: 'ausente' };
}

export interface ResultadoOrden {
  ok: boolean;
  /** Esperados que no aparecen (exactos) entre los observados. */
  faltan: string[];
  /** Esperados que aparecen más de una vez: el orden sería ambiguo. */
  repetidos: string[];
  /** Primer par de esperados consecutivos que aparece invertido. */
  inversion?: [string, string];
  /** Orden en que aparecen los esperados entre los observados. */
  observado: string[];
}

/**
 * ¿Aparecen los `esperados` en ese orden RELATIVO dentro de `observados` (en orden de lectura)? Otros campos pueden
 * intercalarse. Un esperado ausente o repetido hace que el orden no sea verificable (ok = false).
 */
export function revisarOrden(esperados: string[], observados: string[]): ResultadoOrden {
  const obs = observados.map(textoEtiqueta);
  const esp = esperados.map(textoEtiqueta);
  const faltan = esp.filter((e) => !obs.includes(e));
  const repetidos = esp.filter((e) => obs.filter((o) => o === e).length > 1);
  const posiciones = esp.map((e) => obs.indexOf(e));
  const observado = esp.filter((e) => obs.includes(e)).sort((a, b) => obs.indexOf(a) - obs.indexOf(b));
  let inversion: [string, string] | undefined;
  for (let i = 1; i < esp.length && !faltan.length && !repetidos.length; i++) {
    if (posiciones[i] < posiciones[i - 1]) { inversion = [esp[i - 1], esp[i]]; break; }
  }
  return { ok: !faltan.length && !repetidos.length && !inversion, faltan, repetidos, inversion, observado };
}

/** Regla ortográfica declarada por el proyecto. `patron` es una expresión regular (se compila con las banderas "gu" + `banderas`). */
export interface ReglaOrtografica {
  id: string;
  patron: string;
  banderas?: string;
  descripcion: string;
  fuente: string;
  /** Texto correcto sugerido, si la regla es un término concreto. */
  correcto?: string;
}

export interface HallazgoOrtografico {
  regla: string;
  texto: string;
  fragmento: string;
  descripcion: string;
  correcto?: string;
  /** Identificador de un hallazgo ya registrado (p. ej. un bug reportado) cuyo fragmento coincide. */
  conocido?: string;
}

/**
 * Aplica las reglas a cada texto observado. `conocidos` asocia fragmentos ya reportados a su identificador, para no
 * presentar como nuevo un hallazgo existente. Un mismo fragmento de un mismo texto se informa una sola vez por regla.
 */
export function aplicarReglasOrtograficas(textos: string[], reglas: ReglaOrtografica[], conocidos: Record<string, string> = {}): HallazgoOrtografico[] {
  const hallazgos: HallazgoOrtografico[] = [];
  const vistos = new Set<string>();
  for (const texto of [...new Set(textos.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean))]) {
    for (const r of reglas) {
      const re = new RegExp(r.patron, `gu${(r.banderas ?? '').replace(/[gu]/g, '')}`);
      for (const m of texto.matchAll(re)) {
        const clave = `${r.id}|${texto}|${m[0]}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        const conocido = Object.entries(conocidos).find(([frag]) => texto.includes(frag))?.[1];
        hallazgos.push({ regla: r.id, texto, fragmento: m[0], descripcion: r.descripcion, ...(r.correcto ? { correcto: r.correcto } : {}), ...(conocido ? { conocido } : {}) });
      }
    }
  }
  return hallazgos;
}
