import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const esquema = JSON.parse(readFileSync(resolve(raiz, 'docs/qa-hibrida/contrato.schema.json'), 'utf8'));
export const hashContrato = valor => createHash('sha256').update(JSON.stringify(valor)).digest('hex');

/** Validador cerrado del subconjunto usado por NUESTRO schema; no ejecuta ni interpreta código del agente. */
export function validarContrato(valor) {
  const errores = [], faltantes = [];
  function validar(v, s, ruta) {
    if (s.$ref) s = esquema.$defs[s.$ref.split('/').at(-1)];
    const tipo = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
    if (s.type && !(s.type === 'integer' ? Number.isInteger(v) : s.type === tipo)) { errores.push(`${ruta}: tipo incorrecto`); return; }
    if ('const' in s && v !== s.const) errores.push(`${ruta}: version incorrecta`);
    if (s.enum && !s.enum.includes(v)) errores.push(`${ruta}: opcion fuera del catalogo`);
    if (tipo === 'string' && ((s.minLength && v.trim().length < s.minLength) || (s.pattern && !new RegExp(s.pattern).test(v)))) errores.push(`${ruta}: texto invalido`);
    if (s.minimum !== undefined && v < s.minimum) errores.push(`${ruta}: numero fuera de rango`);
    if (s.type === 'object') {
      for (const k of s.required ?? []) if (!(k in v)) errores.push(`${ruta}.${k}: obligatorio`);
      for (const k of Object.keys(v)) {
        if (!Object.hasOwn(s.properties, k)) errores.push(`${ruta}: propiedad no admitida`);
        else validar(v[k], s.properties[k], `${ruta}.${k}`);
      }
    }
    if (s.type === 'array') {
      if (s.minItems && v.length < s.minItems) errores.push(`${ruta}: lista incompleta`);
      v.forEach((x, i) => validar(x, s.items, `${ruta}[${i}]`));
    }
  }
  validar(valor, esquema, 'caso');
  if (errores.length) return { valido: false, errores, faltantes, listoParaEjecutar: false };
  const ids = (xs, nombre) => {
    const conjunto = new Set(xs.map(x => x.id));
    if (conjunto.size !== xs.length) errores.push(`${nombre}: identificadores duplicados`);
    return conjunto;
  };
  const fuentes = ids(valor.fuentes, 'fuentes'), actores = ids(valor.actores, 'actores'), datos = ids(valor.datos, 'datos');
  ids(valor.pasos, 'pasos'); ids(valor.precondiciones, 'precondiciones'); ids(valor.faltantesDeclarados, 'faltantes');
  const referencia = (id, conjunto, tipo) => { if (!conjunto.has(id)) errores.push(`${tipo}: referencia no declarada`); };
  for (const x of [...valor.actores, ...valor.precondiciones, ...valor.datos, ...valor.pasos]) referencia(x.fuente, fuentes, 'fuente');
  for (const p of valor.precondiciones) for (const d of p.datos) referencia(d, datos, 'dato');
  for (const d of valor.datos) {
    if (d.modo === 'literal' && (typeof d.valor !== 'string' || Object.hasOwn(d, 'referencia') || d.sensibilidad !== 'public' || d.naturaleza === 'qa-existente' || !['CASE_LITERAL', 'GENERATED'].includes(d.resolucion))) errores.push('dato: literal no permitido o incompatible');
    if (d.modo === 'referencia' && (!d.referencia || Object.hasOwn(d, 'valor') || !['TEST_DATA', 'SYSTEM', 'GENERATED'].includes(d.resolucion))) errores.push('dato: referencia incompatible');
    if (d.modo === 'faltante') {
      if (Object.hasOwn(d, 'valor') || Object.hasOwn(d, 'referencia')) errores.push('dato: faltante no debe contener un valor');
      faltantes.push({ codigo: 'DATO_FALTANTE', dato: d.id });
    }
    if (d.naturaleza === 'sintetico-permitido' && (!d.autorizacionSintetico || !fuentes.has(d.autorizacionSintetico) || d.sistemaExterno)) errores.push('dato: sintetico sin autorizacion documental o usado como existente externo');
    if (d.naturaleza === 'qa-existente' && (!d.sistemaExterno || d.modo === 'literal')) errores.push('dato: existencia externa debe acreditarse mediante referencia');
    for (const id of [...d.valoresValidos, ...d.valoresInvalidos]) referencia(id, datos, 'ejemplo de dato');
    if (d.valoresValidos.some(id => d.valoresInvalidos.includes(id))) errores.push('dato: ejemplo simultaneamente valido e invalido');
  }
  const todosPasos = new Set(valor.pasos.map(p => p.id));
  const orden = valor.planEjecucion.orden;
  if (new Set(orden).size !== orden.length) errores.push('ejecucion: capacidad repetida; una unidad se ejecuta una sola vez');
  const posiciones = new Map(orden.map((id, i) => [id, i]));
  const grafo = new Map(valor.pasos.map(p => [p.id, p.dependeDe]));
  const visitados = new Set(), activos = new Set();
  function ciclo(id) {
    if (activos.has(id)) return true;
    if (visitados.has(id)) return false;
    activos.add(id);
    if ((grafo.get(id) ?? []).some(ciclo)) return true;
    activos.delete(id); visitados.add(id); return false;
  }
  if (valor.pasos.some(p => ciclo(p.id))) errores.push('dependencias: circularidad');
  for (const edge of valor.planEjecucion.dependencias) {
    if (!posiciones.has(edge.antes) || !posiciones.has(edge.despues) || posiciones.get(edge.antes) >= posiciones.get(edge.despues)) errores.push('dependencias de capacidades: conflicto con orden de ejecucion o ciclo');
  }
  for (const p of valor.pasos) {
    referencia(p.actor, actores, 'actor');
    for (const id of p.datos) referencia(id, datos, 'dato');
    for (const id of p.dependeDe) {
      referencia(id, todosPasos, 'dependencia');
      const previo = valor.pasos.find(x => x.id === id);
      if (previo?.capacidadesNativas.length && p.capacidadesNativas.length
        && Math.max(...previo.capacidadesNativas.map(c => posiciones.get(c) ?? Infinity)) >= Math.min(...p.capacidadesNativas.map(c => posiciones.get(c) ?? -1))) errores.push('dependencia de pasos: conflicto con orden efectivo; la capacidad compartida no se duplica');
    }
    if (p.capacidadesNativas.some(id => !posiciones.has(id))) errores.push('capacidad fuera del plan de ejecucion');
    if (p.modalidad === 'manual' && p.capacidadesNativas.length) errores.push('paso: manual con capacidad automatica declarada');
    if (p.modalidad === 'automatico' && !p.capacidadesNativas.length) errores.push('paso: automatico sin capacidad nativa');
    if (p.modalidad === 'hibrido' && (!p.responsabilidades.analista.length || !p.responsabilidades.pendienteManual.length || p.responsabilidades.continuacion.decide !== 'analista-QA')) errores.push('hibrido: obligaciones o decision humana ausentes');
  }
  for (const f of valor.faltantesDeclarados) {
    for (const p of f.pasos) referencia(p, todosPasos, 'paso faltante');
    faltantes.push({ codigo: 'INFORMACION_QA_PENDIENTE', id: f.id });
  }
  return { valido: errores.length === 0, errores, faltantes, hash: hashContrato(valor),
    requiereRevisionHumana: valor.pasos.some(p => p.modalidad !== 'automatico'),
    listoParaEjecutar: false, motivo: 'Contrato documental: requiere validacion nativa, preflight local y decision humana vinculada al hash. No autoriza Bizagi.' };
}

/** Solo lee ficheros públicos versionables dentro del repositorio. Nunca abre .env ni sigue enlaces fuera de él. */
export function validarFuentes(valor, base = raiz) {
  const problemas = [];
  for (const f of [valor.nativo, valor.perfilRevision, ...valor.fuentes]) {
    const p = resolve(base, f.referencia), rel = relative(base, p);
    const permitida = /^(docs\/|projects\/(seguros-del-estado|colsubsidio)\/(fuentes|data|escenarios|docs|manifest)\/)/.test(f.referencia)
      && !/(^|\/)(\.[^/]*|secrets?|credentials?)(\/|$)/i.test(f.referencia);
    if (!permitida || isAbsolute(rel) || rel.startsWith('..') || !/\.(json|yaml|md|xlsx)$/i.test(p) || !existsSync(p)) { problemas.push('Fuente local ausente o no permitida'); continue; }
    // realpath evita que un enlace dentro del repositorio permita salir del mismo.
    const real = relative(base, realpath(p));
    if (isAbsolute(real) || real.startsWith('..')) { problemas.push('Fuente fuera del repositorio'); continue; }
    if (createHash('sha256').update(readFileSync(p)).digest('hex') !== f.sha256) problemas.push('Fuente modificada: actualizar y revisar la trazabilidad');
  }
  return problemas;
}
import { realpathSync as realpath } from 'node:fs';

/** Futura UI: la decisión se guarda aparte, ligada al contenido revisado; nunca la produce la gema. */
export function revisionVigente(contrato, decision) {
  return !!decision && Object.keys(decision).sort().join(',') === 'decision,hash,revisor,version'
    && decision.version === 'qa-revision/v1' && decision.decision === 'aprobado-diseno'
    && typeof decision.revisor === 'string' && decision.revisor.trim().length > 0 && decision.hash === hashContrato(contrato);
}
