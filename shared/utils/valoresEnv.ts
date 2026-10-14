/**
 * Referencias a variables del .env local dentro de recursos versionados (p. ej. JSON de Create Case).
 * Un valor string EXACTAMENTE igual a "${env:NOMBRE}" se reemplaza por process.env.NOMBRE; así un dato sensible
 * (un usuario cuya clave sería deducible, un identificador real) no se versiona. Si la variable falta o está vacía,
 * se lanza un error con el nombre (nunca con un valor): no se inventan datos para que una prueba pase.
 */
const REFERENCIA = /^\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/;

export function resolverValoresEnv<T>(valor: T, env: NodeJS.ProcessEnv = process.env, origen = 'recurso'): T {
  if (typeof valor === 'string') {
    const m = REFERENCIA.exec(valor);
    if (!m) return valor;
    const real = env[m[1]];
    if (!real?.trim()) throw new Error(`Falta ${m[1]} en el .env local (referenciada por ${origen}).`);
    return real as T;
  }
  if (Array.isArray(valor)) return valor.map((v) => resolverValoresEnv(v, env, origen)) as T;
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, resolverValoresEnv(v, env, origen)])) as T;
  }
  return valor;
}
