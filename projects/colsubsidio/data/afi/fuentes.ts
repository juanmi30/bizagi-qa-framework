import { normalizarTextoCatalogo, type FuenteAutoritativaAfi, type NormalizacionAfi } from './funcional';

/**
 * Fuentes autoritativas de catálogo (Fase 4D) — capa PURA: resuelve el catálogo esperado a partir de
 * una instantánea de lo que el proveedor observó. Sin Playwright, sin casos, sin valores de ejemplo.
 *
 * Límite del oráculo: certifica que la UI representa el catálogo RECIBIDO de la fuente según la relación
 * declarada. NO certifica que la paramétrica esté bien configurada frente a una fuente externa independiente.
 */

export type RegistroFuente = Readonly<Record<string, unknown>>;

/** Última respuesta observada de una entidad paramétrica. */
export interface RespuestaEntidad {
  /** Identificador técnico de la entidad (ruta), solo para diagnóstico. */
  entidad: string;
  registros: readonly RegistroFuente[];
  /** La respuesta anunciaba más páginas: incompleta. */
  paginada: boolean;
}

export interface InstantaneaFuente {
  respuestas: readonly RespuestaEntidad[];
  /** Respuestas GET cuyo cuerpo se releyó con la misma petición autenticada. */
  lecturasRespaldo: number;
  /** Respuestas de la fuente que no se pudieron leer (y no se releyeron). */
  ilegibles: number;
  /** Respuestas legibles sin registros. */
  vacias: number;
}

export type MotivoFuente =
  | 'fuente-no-observada' | 'fuente-vacia' | 'fuente-ilegible' | 'fuente-ambigua' | 'fuente-incompleta'
  | 'filtro-vacio' | 'filtro-no-resoluble' | 'filtro-ambiguo' | 'relacion-inexistente';

export type ResolucionFuente =
  | { ok: true; esperadas: string[]; claveFiltro: string; registrosFuente: number }
  | { ok: false; motivo: MotivoFuente; detalle: string };

/** Registro Bizagi OData ({ parameters: [{ xpath, value }] }) -> { xpath: value }. */
export function parametrosRegistro(registro: unknown): RegistroFuente {
  const parametros = (registro as { parameters?: unknown })?.parameters;
  if (!Array.isArray(parametros)) return {};
  return Object.fromEntries(parametros
    .filter((p): p is { xpath: string; value?: unknown } => typeof p?.xpath === 'string')
    .map(p => [p.xpath, p.value]));
}

// ---------- parametrica-ciudad-nacional ----------

/** Forma demostrada de la paramétrica Ciudad nacional y de su entidad padre (piloto HU 14.12). */
const DESCRIPCION = 'sDescripcion';
const CODIGO = 'sCodigo';
const RELACION_PADRE = 'kpDepartamento.sCodigo';
const INACTIVO = 'dsbl';

const activo = (r: RegistroFuente) => r[INACTIVO] !== true;
const esHijo = (r: RegistroFuente) => RELACION_PADRE in r && DESCRIPCION in r;
const esPadreCandidato = (r: RegistroFuente) => CODIGO in r && DESCRIPCION in r && !(RELACION_PADRE in r);
const texto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

function resolverCiudadNacional(inst: InstantaneaFuente, valorFiltro: string, normalizacion: NormalizacionAfi): ResolucionFuente {
  const falla = (motivo: MotivoFuente, detalle: string): ResolucionFuente => ({ ok: false, motivo, detalle });
  const norma = (s: string) => (normalizacion === 'texto-es' ? normalizarTextoCatalogo(s) : s);

  // Una respuesta ilegible podría ser una versión más reciente de la fuente: no se certifica con datos quizá viejos.
  if (inst.ilegibles) return falla('fuente-ilegible', `${inst.ilegibles} respuesta(s) de la fuente no se pudieron leer`);
  const hijas = inst.respuestas.filter(r => r.registros.length && r.registros.every(esHijo));
  if (!hijas.length) {
    if (inst.vacias) return falla('fuente-vacia', `${inst.vacias} respuesta(s) sin registros; ninguna con municipios`);
    return falla('fuente-no-observada', 'no se observó ninguna respuesta con registros municipio -> departamento');
  }
  if (hijas.length > 1) return falla('fuente-ambigua', `${hijas.length} entidades distintas con forma de municipio`);
  const [municipios] = hijas;
  if (municipios.paginada) return falla('fuente-incompleta', 'la respuesta de municipios está paginada');

  const filtro = texto(valorFiltro);
  if (!filtro) return falla('filtro-vacio', 'el campo que filtra no tiene valor');

  // El código del departamento se resuelve en la PROPIA fuente, por el valor actual del campo filtro.
  const coincidentes = inst.respuestas.filter(r => r !== municipios)
    .flatMap(r => r.registros.filter(esPadreCandidato))
    .filter(r => activo(r) && norma(texto(r[DESCRIPCION])) === norma(filtro));
  const codigos = [...new Set(coincidentes.map(r => texto(r[CODIGO])))];
  const referenciados = new Set(municipios.registros.map(r => texto(r[RELACION_PADRE])));
  const relacionados = codigos.filter(c => referenciados.has(c));
  if (!codigos.length) return falla('filtro-no-resoluble', 'ningún registro padre activo de la fuente coincide con el valor del filtro');
  if (!relacionados.length) return falla('relacion-inexistente', 'el registro padre existe pero ningún municipio lo referencia');
  if (relacionados.length > 1) return falla('filtro-ambiguo', `${relacionados.length} códigos padre coinciden con el valor del filtro`);

  const [clave] = relacionados;
  const esperadas = municipios.registros.filter(r => texto(r[RELACION_PADRE]) === clave && activo(r)).map(r => texto(r[DESCRIPCION]));
  if (!esperadas.length) return falla('relacion-inexistente', 'el registro padre no tiene municipios activos');
  return { ok: true, esperadas, claveFiltro: clave, registrosFuente: municipios.registros.length };
}

const RESOLUTORES: Record<FuenteAutoritativaAfi, typeof resolverCiudadNacional> = {
  'parametrica-ciudad-nacional': resolverCiudadNacional,
};

/** Catálogo esperado según la fuente y el valor actual del campo filtro. Fail-closed: nunca inventa. */
export function resolverCatalogoFuente(fuente: FuenteAutoritativaAfi, inst: InstantaneaFuente, valorFiltro: string, normalizacion: NormalizacionAfi): ResolucionFuente {
  return RESOLUTORES[fuente](inst, valorFiltro, normalizacion);
}
