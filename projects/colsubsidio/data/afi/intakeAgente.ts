import { readFileSync } from 'node:fs';

/**
 * ENVELOPE ÚNICO DE INTAKE DEL AGENTE (Fase 4Q). El agente produce EXACTAMENTE UN bloque JSON al final del intake:
 *
 *   { "schemaVersion": "afi-agent-intake/v1", "knowledgeProposals": [], "classificationRequests": [], "testDataRequirements": [] }
 *
 * Las tres listas existen siempre (pueden ir vacías). Compartir envelope NO mezcla modelos: conocimiento (4N/4O) y datos de
 * prueba (4P) se preparan, revisan y aplican por separado. Compatibilidad temporal: se acepta la salida antigua (un objeto
 * 4O { knowledgeProposals, classificationRequests? } y/o un objeto 4P { testDataRequirements }), sin mezclarla con el canónico.
 * Los mensajes de error nunca citan el contenido de la salida.
 */

export const ESQUEMA_ENVELOPE_INTAKE = 'afi-agent-intake/v1';
export const CLAVES_ENVELOPE_INTAKE = ['knowledgeProposals', 'classificationRequests', 'testDataRequirements'] as const;

export interface EnvelopeIntakeAgente {
  schemaVersion: typeof ESQUEMA_ENVELOPE_INTAKE;
  knowledgeProposals: unknown[];
  classificationRequests: unknown[];
  testDataRequirements: unknown[];
}

export interface EnvelopeLeido {
  envelope: EnvelopeIntakeAgente;
  formato: 'canonico' | 'legado';
  /** Legado 4O: el objeto de conocimiento TAL CUAL (su hash determina el batchId de 4O; se conserva). */
  conocimientoLegado?: unknown;
}

export class EnvelopeIntakeError extends Error {
  constructor(readonly problemas: readonly string[]) {
    super(`Salida de intake inválida:\n${problemas.map(p => `- ${p}`).join('\n')}`);
    this.name = 'EnvelopeIntakeError';
  }
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const esIntake = (v: unknown): v is Record<string, unknown> => esObjeto(v) && (CLAVES_ENVELOPE_INTAKE as readonly string[]).some(k => k in v);

/** Forma estricta del envelope canónico. */
export function validarEnvelope(v: unknown): string[] {
  if (!esObjeto(v)) return ['el envelope debe ser un objeto JSON'];
  const p: string[] = [];
  if (v.schemaVersion !== ESQUEMA_ENVELOPE_INTAKE) p.push(`schemaVersion ${ESQUEMA_ENVELOPE_INTAKE} requerido`);
  for (const k of Object.keys(v)) if (k !== 'schemaVersion' && !(CLAVES_ENVELOPE_INTAKE as readonly string[]).includes(k)) p.push(`clave no admitida ${k.slice(0, 30)}`);
  for (const k of CLAVES_ENVELOPE_INTAKE) if (!Array.isArray(v[k])) p.push(`${k}: lista requerida (puede estar vacía)`);
  return p;
}

/** Candidatos: el texto completo como JSON, o cada bloque de código json parseable de una respuesta .md/.txt. */
function candidatos(texto: string): unknown[] {
  const limpio = texto.replace(/^﻿/, '');
  try { return [JSON.parse(limpio)]; } catch { /* respuesta con bloques */ }
  return [...limpio.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].flatMap(m => { try { return [JSON.parse(m[1]) as unknown]; } catch { return []; } });
}

/** Extrae el ÚNICO envelope (o la salida legada equivalente) de la respuesta del agente. */
export function extraerEnvelope(texto: string): EnvelopeLeido {
  const todos = candidatos(texto).filter(esIntake);
  const versionados = todos.filter(o => 'schemaVersion' in o);
  const desconocidos = versionados.filter(o => o.schemaVersion !== ESQUEMA_ENVELOPE_INTAKE);
  if (desconocidos.length) throw new EnvelopeIntakeError([`schemaVersion de intake desconocido (se espera ${ESQUEMA_ENVELOPE_INTAKE})`]);
  if (versionados.length > 1) throw new EnvelopeIntakeError([`hay ${versionados.length} envelopes ${ESQUEMA_ENVELOPE_INTAKE}: se espera EXACTAMENTE uno al final del intake`]);
  if (versionados.length === 1) {
    if (todos.length > 1) throw new EnvelopeIntakeError(['además del envelope hay otros bloques JSON de intake: se espera EXACTAMENTE uno']);
    const p = validarEnvelope(versionados[0]);
    if (p.length) throw new EnvelopeIntakeError(p);
    const e = versionados[0] as unknown as EnvelopeIntakeAgente;
    return { envelope: { schemaVersion: ESQUEMA_ENVELOPE_INTAKE, knowledgeProposals: e.knowledgeProposals, classificationRequests: e.classificationRequests, testDataRequirements: e.testDataRequirements }, formato: 'canonico' };
  }
  // Compatibilidad 4O/4P: como mucho un objeto de conocimiento y uno de datos de prueba.
  const conocimiento = todos.filter(o => 'knowledgeProposals' in o || 'classificationRequests' in o);
  const datos = todos.filter(o => 'testDataRequirements' in o && !('knowledgeProposals' in o));
  if (!todos.length) throw new EnvelopeIntakeError([`se esperaba JSON o exactamente un bloque de código json con el envelope ${ESQUEMA_ENVELOPE_INTAKE} (hay 0)`]);
  if (conocimiento.length > 1 || datos.length > 1 || conocimiento.length + datos.length !== todos.length) {
    throw new EnvelopeIntakeError([`se esperaba exactamente un bloque de código json con el envelope ${ESQUEMA_ENVELOPE_INTAKE} (hay ${todos.length} bloques de intake)`]);
  }
  const k = conocimiento[0], d = datos[0];
  const lista = (o: Record<string, unknown> | undefined, clave: string) => (o && Array.isArray(o[clave]) ? o[clave] as unknown[] : []);
  return {
    envelope: {
      schemaVersion: ESQUEMA_ENVELOPE_INTAKE, knowledgeProposals: lista(k, 'knowledgeProposals'), classificationRequests: lista(k, 'classificationRequests'),
      testDataRequirements: [...lista(d, 'testDataRequirements'), ...lista(k, 'testDataRequirements')],
    },
    formato: 'legado',
    // Un objeto 4P mixto (datos + conocimiento) entrega a 4O solo su parte de conocimiento.
    ...(k ? { conocimientoLegado: 'testDataRequirements' in k ? Object.fromEntries(Object.entries(k).filter(([c]) => c !== 'testDataRequirements')) : k } : {}),
  };
}

/** Lee un archivo (JSON, .md o .txt) y extrae su envelope. */
export function leerEnvelope(ruta: string): EnvelopeLeido {
  let texto: string;
  try { texto = readFileSync(ruta, 'utf8'); } catch { throw new EnvelopeIntakeError(['no se puede leer la salida del agente']); }
  return extraerEnvelope(texto);
}

/** Parte de CONOCIMIENTO para 4O (el legado se entrega tal cual: su validación estricta sigue en intakeLote). */
export const salidaConocimiento = (l: EnvelopeLeido): unknown =>
  l.conocimientoLegado ?? { knowledgeProposals: l.envelope.knowledgeProposals, classificationRequests: l.envelope.classificationRequests };

/** Parte de DATOS DE PRUEBA para 4P. */
export const salidaDatosPrueba = (l: EnvelopeLeido) => ({ testDataRequirements: l.envelope.testDataRequirements });

export const tieneConocimiento = (l: EnvelopeLeido) => l.envelope.knowledgeProposals.length + l.envelope.classificationRequests.length > 0;
export const tieneDatosPrueba = (l: EnvelopeLeido) => l.envelope.testDataRequirements.length > 0;

/** Contrato publicado en el manifest (sección agentIntake). */
export function publicarEnvelopeIntake() {
  return {
    schemaVersion: ESQUEMA_ENVELOPE_INTAKE,
    claves: [...CLAVES_ENVELOPE_INTAKE],
    forma: `{ "schemaVersion": "${ESQUEMA_ENVELOPE_INTAKE}", "knowledgeProposals": [...], "classificationRequests": [...], "testDataRequirements": [...] }`,
    reglas: [
      'En modo intake emite EXACTAMENTE UN bloque de código json al final, con este envelope; nunca dos bloques JSON de intake.',
      'Las tres listas existen siempre, aunque estén vacías.',
      'knowledgeProposals/classificationRequests (ver knowledgeIntake) y testDataRequirements (ver testData) son dimensiones independientes: '
        + 'una misma entidad de negocio puede producir un KNOWLEDGE_GAP y un requisito de datos de prueba.',
      'El envelope nunca lleva valores de actores, nombres de variables de entorno ni decisiones de revisión.',
    ],
    compatibilidad: 'Salidas antiguas (un objeto de conocimiento y/o uno de datos de prueba) se aceptan temporalmente; el formato canónico es solo el envelope.',
  };
}
