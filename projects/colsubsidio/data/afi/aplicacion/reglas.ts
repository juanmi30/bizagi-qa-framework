import type { ControlCampo } from './campos';

/**
 * REGLAS FUNCIONALES CON ALCANCE (Fase 4J). Conocimiento de negocio reutilizable (no capabilities técnicas),
 * persistido de forma versionada y auditable en projects/colsubsidio/knowledge/afi-rules.json. Capa pura.
 *
 * Precedencia: caso > hu > campo > pantalla > módulo > aplicación (la más específica gana). Dos reglas vigentes
 * con la misma clave y el mismo alcance, o empatadas en especificidad para un contexto: conflicto (fail-closed).
 * Una regla resuelta para un contexto NO vuelve a preguntarse; una aclaración de caso no alcanza a otros casos.
 */

/** Claves de regla conocidas: significado funcional, controles a los que aplican y valores admitidos. */
export const CLAVES_REGLA = {
  'autocomplete.coincidencia': {
    controles: ['autocomplete'], valores: ['contiene', 'empieza-por', 'igual'],
    descripcion: 'Cómo deben coincidir las sugerencias con el texto escrito.',
  },
  'autocomplete.diacriticos': {
    controles: ['autocomplete'], valores: ['sensibles', 'insensibles'],
    descripcion: 'Si una letra con tilde y la misma sin tilde se consideran distintas al buscar.',
  },
  'autocomplete.mayusculas': {
    controles: ['autocomplete'], valores: ['sensibles', 'insensibles'],
    descripcion: 'Si mayúsculas y minúsculas se consideran distintas al buscar.',
  },
} as const satisfies Record<string, { controles: readonly ControlCampo[]; valores: readonly string[]; descripcion: string }>;
export type ClaveRegla = keyof typeof CLAVES_REGLA;

export type AlcanceRegla =
  | { nivel: 'aplicacion' }
  | { nivel: 'modulo'; modulo: string }
  | { nivel: 'pantalla'; pantalla: string }
  | { nivel: 'campo'; pantalla: string; campo: string }
  | { nivel: 'hu'; hu: string }
  | { nivel: 'caso'; hu: string; caso: string };

export const ESPECIFICIDAD: Readonly<Record<AlcanceRegla['nivel'], number>> = { aplicacion: 1, modulo: 2, pantalla: 3, campo: 4, hu: 5, caso: 6 };

export interface ReglaFuncional {
  id: string;
  clave: ClaveRegla;
  valor: string;
  /** Texto humano, tal como lo confirmó la fuente. */
  texto: string;
  alcance: AlcanceRegla;
  fuente: { tipo: 'aclaracion-qa' | 'requerimiento' | 'diseno-qa'; referencia: string };
  /** Versión del almacén en que se creó. */
  version: number;
  fecha: string;
  estado: 'vigente' | 'reemplazada';
  reemplazadaPor?: string;
}

export interface AlmacenReglas {
  esquema: 'afi-rules/v1';
  modulo: string;
  version: number;
  reglas: ReglaFuncional[];
  historial: { version: number; fecha: string; accion: 'alta' | 'reemplazo'; regla: string; referencia: string }[];
}

/** Contexto donde se consulta una regla. */
export interface ContextoRegla { modulo: string; pantalla?: string; campo?: string; control?: ControlCampo; hu?: string; caso?: string }

export class ReglasError extends Error {
  constructor(readonly problemas: readonly string[]) {
    super(`Reglas funcionales inválidas:\n${problemas.map(p => `- ${p}`).join('\n')}`);
    this.name = 'ReglasError';
  }
}

/** Indicios de PII: correos o secuencias largas de dígitos (identificaciones, teléfonos). */
const PII = /[\w.+-]+@[\w-]+\.\w|\d{7,}/;
const igualAlcance = (a: AlcanceRegla, b: AlcanceRegla) => JSON.stringify(a) === JSON.stringify(b);

export function aplica(alcance: AlcanceRegla, c: ContextoRegla): boolean {
  switch (alcance.nivel) {
    case 'aplicacion': return true;
    case 'modulo': return alcance.modulo === c.modulo;
    case 'pantalla': return alcance.pantalla === c.pantalla;
    case 'campo': return alcance.pantalla === c.pantalla && alcance.campo === c.campo;
    case 'hu': return alcance.hu === c.hu;
    case 'caso': return alcance.hu === c.hu && alcance.caso === c.caso;
  }
}

export function validarAlmacenReglas(a: AlmacenReglas): AlmacenReglas {
  const p: string[] = [];
  if (a.esquema !== 'afi-rules/v1') p.push('esquema desconocido');
  if (!Number.isInteger(a.version) || a.version < 1) p.push('version debe ser un entero >= 1');
  const ids = new Set<string>();
  for (const r of a.reglas) {
    if (ids.has(r.id)) p.push(`${r.id}: id duplicado`);
    ids.add(r.id);
    const def = (CLAVES_REGLA as Record<string, { valores: readonly string[] }>)[r.clave];
    if (!def) p.push(`${r.id}: clave desconocida ${r.clave}`);
    else if (!def.valores.includes(r.valor)) p.push(`${r.id}: valor no admitido para ${r.clave}`);
    if (!(r.alcance?.nivel in ESPECIFICIDAD)) p.push(`${r.id}: alcance inválido`);
    if (!r.texto?.trim() || !r.fuente?.referencia?.trim()) p.push(`${r.id}: texto y fuente requeridos`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) p.push(`${r.id}: fecha AAAA-MM-DD`);
    if (r.version > a.version) p.push(`${r.id}: versión posterior al almacén`);
    if (PII.test(`${r.texto} ${r.fuente?.referencia} ${JSON.stringify(r.alcance)}`)) p.push(`${r.id}: posible PII`);
  }
  const vigentes = a.reglas.filter(r => r.estado === 'vigente');
  for (let i = 0; i < vigentes.length; i++) for (let j = i + 1; j < vigentes.length; j++) {
    if (vigentes[i].clave === vigentes[j].clave && igualAlcance(vigentes[i].alcance, vigentes[j].alcance)) p.push(`${vigentes[j].id}: duplica clave y alcance de ${vigentes[i].id}`);
  }
  if (p.length) throw new ReglasError(p);
  return a;
}

/** Regla vigente más específica para el contexto; undefined si ninguna aplica (entonces hay que aclarar). */
export function resolverRegla(a: AlmacenReglas, clave: ClaveRegla, c: ContextoRegla): ReglaFuncional | undefined {
  if (c.control && !(CLAVES_REGLA[clave].controles as readonly string[]).includes(c.control)) return undefined;
  const candidatas = a.reglas.filter(r => r.estado === 'vigente' && r.clave === clave && aplica(r.alcance, c));
  if (!candidatas.length) return undefined;
  const maxima = Math.max(...candidatas.map(r => ESPECIFICIDAD[r.alcance.nivel]));
  const ganadoras = candidatas.filter(r => ESPECIFICIDAD[r.alcance.nivel] === maxima);
  if (ganadoras.length > 1) throw new ReglasError([`conflicto para ${clave}: ${ganadoras.map(r => r.id).join(', ')} con igual especificidad`]);
  return ganadoras[0];
}

export const requiereAclaracion = (a: AlmacenReglas, clave: ClaveRegla, c: ContextoRegla) => resolverRegla(a, clave, c) === undefined;

/** Alta auditable de una regla (nueva versión del almacén). Reemplaza la vigente de igual clave y alcance. */
export function incorporarRegla(
  a: AlmacenReglas,
  nueva: Omit<ReglaFuncional, 'id' | 'version' | 'estado' | 'reemplazadaPor'>,
): AlmacenReglas {
  const version = a.version + 1;
  const id = `R${String(a.reglas.length + 1).padStart(4, '0')}`;
  const previa = a.reglas.find(r => r.estado === 'vigente' && r.clave === nueva.clave && igualAlcance(r.alcance, nueva.alcance));
  const reglas = a.reglas.map(r => (r === previa ? { ...r, estado: 'reemplazada' as const, reemplazadaPor: id } : r));
  const resultado: AlmacenReglas = {
    ...a, version,
    reglas: [...reglas, { ...nueva, id, version, estado: 'vigente' }],
    historial: [...a.historial, { version, fecha: nueva.fecha, accion: previa ? 'reemplazo' : 'alta', regla: id, referencia: nueva.fuente.referencia }],
  };
  return validarAlmacenReglas(resultado);
}
