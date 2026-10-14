/**
 * Redacción SEGURA de errores (4S-R.1). Puro: recibe el entorno como parámetro (las pruebas nunca dependen del .env real).
 *
 * Principios:
 *  A. La sanitización NUNCA cambia la taxonomía: el error saneado conserva su prototipo (clase), `name`, códigos y metadata
 *     (con sus textos también saneados) y su `cause` (saneada recursivamente).
 *  B. Nada de reemplazo ingenuo por substring:
 *     - valor DISTINTIVO (>= LARGO_MINIMO caracteres): se redacta solo como token completo (sin letra/dígito adyacente), del
 *       más largo al más corto. "9876543" se redacta en "fallo con 9876543", pero no dentro de "198765432".
 *     - valor de BAJA ENTROPÍA (más corto): nunca en texto libre (un "Si" dentro de "Sin", un "5" en un timestamp o un contador);
 *       solo cuando aparece como valor independiente ENTRE COMILLAS, la estructura con la que Playwright y el framework citan
 *       valores (p. ej. `{ name: 'Si' }`, `"5"`).
 *  C. Prevención: los errores propios del framework no deberían contener valores; esto es la red de seguridad.
 */

export const MARCA_PRIVADO = '[PRIVADO]';
export const LARGO_MINIMO_DISTINTIVO = 5;

/** Variables cuyo valor es privado: secretos de actor/compartidos y la configuración histórica sensible. */
export const CLAVE_SENSIBLE = /PASSWORD|CLAVE|TOKEN|CORREO|IDENTIFICACION|TIPO_AFILIADO|NUM_CEL|IBC|INGRESO|ACTIVIDAD|FACULTATIVO_|^AFI_(ACTOR|SHARED)_/i;

type Entorno = Readonly<Record<string, string | undefined>>;

export function valoresSensibles(entorno: Entorno): string[] {
  const valores = Object.entries(entorno)
    .filter(([clave, valor]) => CLAVE_SENSIBLE.test(clave) && !!valor && !!valor.trim())
    .map(([, valor]) => valor!.trim());
  return [...new Set(valores)].sort((a, b) => b.length - a.length);
}

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Sanea un texto con la estrategia A/B. Devuelve el mismo string si no hay nada que redactar. */
export function sanearTexto(texto: string, valores: readonly string[]): string {
  let r = texto;
  for (const v of valores) {
    if (v.length >= LARGO_MINIMO_DISTINTIVO) {
      r = r.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapar(v)}(?![\\p{L}\\p{N}])`, 'gu'), MARCA_PRIVADO);
    } else {
      // Baja entropía: solo como valor independiente entre comillas ('Si', "5", `x`).
      r = r.replace(new RegExp(`(['"\`])${escapar(v)}\\1`, 'gu'), `$1${MARCA_PRIVADO}$1`);
    }
  }
  return r;
}

/** Sanea en profundidad metadata diagnóstica (strings, arrays, objetos planos y errores anidados). */
function sanearValor(v: unknown, valores: readonly string[], vistos: WeakMap<object, unknown>): unknown {
  if (typeof v === 'string') return sanearTexto(v, valores);
  if (!v || typeof v !== 'object') return v;
  if (vistos.has(v)) return vistos.get(v);
  if (v instanceof Error) return sanearError(v, valores, vistos);
  if (Array.isArray(v)) {
    const copia: unknown[] = [];
    vistos.set(v, copia);
    for (const x of v) copia.push(sanearValor(x, valores, vistos));
    return copia;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return v; // instancias no planas: se conservan tal cual
  const copia: Record<string, unknown> = {};
  vistos.set(v, copia);
  for (const [k, x] of Object.entries(v)) copia[k] = sanearValor(x, valores, vistos);
  return copia;
}

function sanearError(error: Error, valores: readonly string[], vistos: WeakMap<object, unknown>): Error {
  // Mismo prototipo => misma clase (instanceof y name heredado se conservan).
  const copia = Object.create(Object.getPrototypeOf(error)) as Error;
  vistos.set(error, copia);
  for (const clave of Object.getOwnPropertyNames(error)) {
    const d = Object.getOwnPropertyDescriptor(error, clave)!;
    // Accesores (V8 define `stack` así): se materializa su valor ACTUAL y se guarda saneado como propiedad de datos.
    const valor = 'value' in d ? d.value : (error as unknown as Record<string, unknown>)[clave];
    Object.defineProperty(copia, clave, { configurable: true, writable: true, enumerable: d.enumerable ?? false, value: sanearValor(valor, valores, vistos) });
  }
  return copia;
}

/** Hay algo que redactar en el error (mensaje, stack, metadata o causa)? */
function contiene(error: Error, valores: readonly string[]): boolean {
  const textos: string[] = [];
  const recorrer = (v: unknown, prof: number) => {
    if (prof > 6) return;
    if (typeof v === 'string') textos.push(v);
    else if (v && typeof v === 'object') for (const k of Object.getOwnPropertyNames(v)) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (d && 'value' in d) recorrer(d.value, prof + 1);
    }
  };
  recorrer(error, 0);
  return textos.some(t => sanearTexto(t, valores) !== t);
}

/**
 * Error saneado preservando su taxonomía. Si no hay nada que redactar devuelve EL MISMO objeto (identidad, clase, stack).
 * Una entrada que no es Error se convierte en Error con su texto saneado.
 */
export function errorSaneado(error: unknown, entorno: Entorno): Error {
  const valores = valoresSensibles(entorno);
  if (!(error instanceof Error)) return new Error(sanearTexto(String(error), valores));
  if (!valores.length || !contiene(error, valores)) return error;
  return sanearError(error, valores, new WeakMap());
}
