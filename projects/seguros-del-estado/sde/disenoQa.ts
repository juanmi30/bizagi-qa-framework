import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cargarEscenario } from './escenario';
import { cargarRegistro, type Entorno } from './datos';
import { casoMatriz } from './matriz';
import { preflight } from './ejecutor';
import { readFileSync } from 'node:fs';

const RAIZ = resolve(__dirname, '../../..');
const modulo = pathToFileURL(resolve(RAIZ, 'tools/qa-diseno/contrato.mjs')).href;

/** Puente de validación offline, NO runner. El contrato no reemplaza YAML, matriz, catálogo ni autorización E2E. */
export async function validarDisenoSde(valor: unknown, entorno: Entorno = {}) {
  // import nativo de .mjs preservado al compilar CommonJS en Playwright.
  const { validarContrato, validarFuentes } = await (new Function('url', 'return import(url)'))(modulo);
  const informe = validarContrato(valor);
  if (!informe.valido) return informe;
  const d = valor as any;
  const errores = [...validarFuentes(d)];
  if (d.nativo.motor !== 'sde' || !/^projects\/seguros-del-estado\/escenarios\/[^/]+\.yaml$/.test(d.nativo.referencia)) errores.push('Destino nativo SDE no admitido');
  if (errores.length) return { ...informe, valido: false, errores };
  const registro = cargarRegistro();
  const esc = cargarEscenario(resolve(RAIZ, d.nativo.referencia), registro);
  const matriz = casoMatriz(esc.id);
  const rutaPerfil = esc.id === 'HU06-CP02' ? 'projects/seguros-del-estado/data/qa-hibrida/HU06-CP02-v1.1.json' : null;
  if (!rutaPerfil || d.perfilRevision.referencia !== rutaPerfil) return { ...informe, valido: false, errores: ['Perfil semantico revisable no registrado para este caso'] };
  const perfil = JSON.parse(readFileSync(resolve(RAIZ, rutaPerfil), 'utf8'));
  const canon = (x: any): string => JSON.stringify(x, (_k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
  if (perfil.nativoSha256 !== d.nativo.sha256) errores.push('Perfil semantico desactualizado frente al escenario');
  if (canon(d.precondiciones) !== canon(perfil.precondiciones)) errores.push('Precondiciones modificadas sin actualizar el perfil de revision');
  if (canon(d.planEjecucion) !== canon(perfil.planEjecucion)) errores.push('Orden o condiciones causales distintos del perfil revisable');
  if (canon(d.planEjecucion.orden) !== canon(esc.pasos.map((_p, i) => i + 1))) errores.push('Plan no coincide con orden nativo unico');
  let actorActual = '';
  const actoresPaso = esc.pasos.map(p => { if (p.hacer === 'iniciar_sesion') actorActual = p.actor as string; return p.actor ?? actorActual; });
  if (d.caso !== esc.id || d.hu !== esc.id.split('-')[0] || d.objetivo !== matriz.pasos[0].esperado) errores.push('Identidad u objetivo distintos de la matriz');
  if (d.pasos.length !== matriz.pasos.length) errores.push('Faltan pasos de la matriz o hay pasos inventados');
  if (canon(d.pasos.map((p: any) => p.matriz)) !== canon(matriz.pasos.map(p => p.n))) errores.push('Orden documental distinto de la matriz');
  for (const p of d.pasos) {
    const original = matriz.pasos.find(m => m.n === p.matriz);
    const indices = esc.pasos.flatMap((paso, i) => paso.matriz.includes(p.matriz) ? [i + 1] : []);
    if (!original || p.accion !== original.accion || p.esperado !== original.esperado) errores.push('Accion o esperado no fieles a la matriz');
    if (JSON.stringify(indices) !== JSON.stringify(p.capacidadesNativas)) errores.push('Cobertura nativa incompleta o inventada');
    const protegido = perfil.pasos.find((x: any) => x.matriz === p.matriz);
    if (!protegido || ['dependeDe', 'modalidad', 'responsabilidades'].some(k => canon(p[k]) !== canon(protegido[k]))) errores.push('Dependencias u obligaciones semanticas modificadas sin revision del perfil');
    const refs = [...new Set(indices.flatMap(i => {
      const texto = JSON.stringify(esc.pasos[i - 1]);
      const directas = [...texto.matchAll(/\$\{dato:([^}]+)\}/g)].map(m => m[1]);
      const configuradas = [...texto.matchAll(/\$\{config:([^}]+)\}/g)].flatMap(m => Object.entries(registro.datasets).flatMap(([id, ds]) => ds.propiedades.filter(x => x.env === m[1]).map(x => `${id}.${x.nombre}`)));
      return [...directas, ...configuradas];
    }))];
    if (canon([...p.datos].sort()) !== canon(refs.sort())) errores.push('Datos por paso distintos de los exigidos por el escenario');
    const campos = [...new Set(indices.flatMap(i => ((esc.pasos[i - 1].campos ?? []) as { campo: string }[]).map(c => c.campo)))];
    if (JSON.stringify(campos) !== JSON.stringify(p.campos)) errores.push('Campos distintos del escenario nativo');
    if (indices.length && !d.actores.some((a: any) => a.id === p.actor && a.referenciaLogica === actoresPaso[indices[0] - 1])) errores.push('Actor distinto del paso nativo');
    if (p.modalidad === 'automatico' && indices.some(i => esc.pasos[i - 1].hacer === 'no_automatizado')) errores.push('Paso manual marcado automatico');
    if (!d.actores.some((a: any) => a.id === p.actor && esc.actores.includes(a.referenciaLogica))) errores.push('Actor fuera del escenario');
  }
  if (new Set(d.pasos.map((p: any) => p.matriz)).size !== d.pasos.length) errores.push('Paso de matriz duplicado');
  for (const actor of d.actores) if (registro.actores[actor.referenciaLogica]?.rol !== actor.rol) errores.push('Rol distinto del registro');
  // Ninguna referencia QA ni literal de dataset se acepta por autodeclaración de la gema.
  for (const dato of d.datos) {
    const [dataset, propiedad] = dato.id.split('.');
    const canonico = registro.datasets[dataset]?.propiedades.find(p => p.nombre === propiedad);
    if (!canonico) { errores.push('Dato fuera del registro SDE'); continue; }
    if (canonico.env && dato.modo !== 'faltante' && (dato.modo !== 'referencia' || dato.referencia !== canonico.env || dato.valor)) errores.push('Dato QA debe usar la referencia nativa sin valor literal');
    if (canonico.valor !== undefined && (dato.modo !== 'literal' || dato.valor !== canonico.valor)) errores.push('Literal distinto del dataset autorizado');
    if (canonico.sensible && dato.sensibilidad === 'public') errores.push('Sensibilidad rebajada respecto al registro');
  }
  const datasets = [...new Set([...esc.datasets, ...esc.pasos.flatMap(p => p.requiere ?? [])])];
  const obligatorios = datasets.flatMap(id => registro.datasets[id].propiedades.filter(p => !p.opcional).map(p => `${id}.${p.nombre}`));
  if (obligatorios.some(id => !d.datos.some((x: any) => x.id === id))) errores.push('Faltan datos requeridos por el escenario');
  const bloqueos = preflight({ ...esc, datasets }, registro, entorno);
  return { ...informe, valido: errores.length === 0, errores, bloqueosNativos: bloqueos,
    estadoDocumental: errores.length ? 'INVALIDO' : 'VALIDO_PARA_REVISION',
    listoParaEjecutar: false, aperturaBizagi: 'NO_REALIZADA',
    motivo: 'Validacion documental y preflight sin navegador. Falta revision humana, disponibilidad real y autorizacion E2E fuera del contrato.' };
}
