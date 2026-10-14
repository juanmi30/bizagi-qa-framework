import { piiEnMetadato } from '../aplicacion/sensibilidad';
import { CAMPOS_AFI, type CampoAfi, type PerfilActorAfi } from '../modelo';
import { POLITICAS_AFI } from '../politicas';
import { DatosPruebaError, ETIQUETAS_CAMPO, clasificarCampo, esCampoPersona, esCompartible, etiquetaDato, type CampoDato } from './contrato';
import type { LoteDatosPrueba, PosibleDuplicadoDatos } from './intake';
import type { RegistroDatosPrueba } from './registro';

/**
 * REVISIÓN LEGIBLE de un lote de datos de prueba (Fase 4Q): `<lote>.review.md`, para un analista QA (no desarrollador).
 * Determinista (mismo lote -> mismo texto). Nunca contiene valores; tampoco nombres de variables mientras el actor no esté
 * aprobado (se derivan al aplicar).
 */

const etiqueta = (c: CampoDato) => etiquetaDato(c);
void ETIQUETAS_CAMPO;
const MOTIVO: Record<PosibleDuplicadoDatos['motivo'], string> = {
  'condiciones-relacionadas': 'sus condiciones se contienen o se parecen',
  'reutilizacion-no-permitida': 'misma clase de actor, pero el caso pide un actor propio',
  'campos-no-cubiertos': 'misma clase de actor, pero el actor existente no declara todos los campos pedidos',
};

/** Lo que el framework resolverá solo para el perfil (sin secretos), salvo lo que el actor ya aporta. */
function automaticos(perfil: PerfilActorAfi, propios: readonly CampoAfi[]): string[] {
  return CAMPOS_AFI
    .filter(c => !propios.includes(c) && (POLITICAS_AFI[c].perfiles?.includes(perfil) ?? true))
    .flatMap(c => {
      const r = clasificarCampo(c);
      if (r === 'DERIVED') return [`  • ${etiqueta(c)} (se deriva de ${POLITICAS_AFI[c].derivacion!.dependeDe.map(etiqueta).join(', ')})`];
      if (r === 'AUXILIARY') return [`  • ${etiqueta(c)} (preparación automática segura)`];
      if (r === 'ACTOR_BASE') return [`  • ${etiqueta(c)} (dato público del perfil)`];
      return [];
    });
}

/** `registro` (opcional): permite decir qué AÑADIRÍA un mismoActorQue a un actor existente (solo descripciones y etiquetas). */
export function revisionDatosMd(lote: LoteDatosPrueba, proyecto = '<proyecto>', registro?: RegistroDatosPrueba): string {
  const L: string[] = [
    `# Revisión de datos de prueba — lote ${lote.batchId}`, '',
    `Preparado sobre la revisión ${lote.revisionBase} del Test Data Registry. NADA de esto cambia el registro hasta aplicar sus decisiones.`,
    'Este documento no contiene valores: solo condiciones de negocio y qué datos harán falta.', '',
    '## Cómo decidir', '',
    `1. Edite \`${lote.batchId}.decisiones.json\`: en cada propuesta ponga \`"decision"\`: \`APPROVED\`, \`REJECTED\` o \`NEEDS_CHANGES\`, y su \`"revisor"\` (rol o alias, nunca su nombre).`,
    '2. Opcional al aprobar: `"correcciones"` { id, condiciones, campos }, `"mismoActorQue"`, `"actoresDistintosDe"` y `"estado"` (`pendiente-provisionar` | `provisionado`).',
    '3. Compartir un secreto (p. ej. un buzón QA) ocurre SOLO si usted lo decide: declárelo en `"compartidos"` y use `{ "fuente": "shared", "sharedRef": "<id>" }` en ese campo.',
    `4. Pruebe sin escribir: \`node tools/afi.mjs ${proyecto} datos aplicar <review.json> <decisiones.json> --dry-run\`; luego, sin \`--dry-run\`.`,
  ];
  for (const { proposalId, propuesta } of lote.propuestas) {
    const s = propuesta.slot;
    const secretos = s.campos.filter(c => c.fuente === 'slot');
    const base = s.campos.filter(c => c.fuente === 'base');
    const parecidos = lote.posiblesDuplicados.filter(x => x.a === proposalId || x.b === proposalId);
    L.push('', `## ${s.sujeto === 'participante' ? 'PARTICIPANTE' : 'ACTOR'} PROPUESTO: ${s.id}`, `Propuesta: ${proposalId}`, '',
      ...(s.sujeto === 'participante'
        ? ['Sujeto:', `  participante (sujeto secundario del caso${s.perfil ? `, perfil ${s.perfil}` : ''}; roles: ${[...new Set(propuesta.ocurrencias.map(o => o.rol).filter(Boolean))].join(', ') || '-'})`]
        : ['Perfil:', `  ${s.perfil}`]),
      'Debe cumplir:', ...s.condiciones.map(c => `  • ${c.descripcion}`),
      'Lo necesitan:', ...propuesta.ocurrencias.map(o => `  • ${[o.hu, o.caso, o.paso, o.rol ? `rol ${o.rol}` : undefined].filter(Boolean).join(' · ')}`),
      'Campos necesarios:', ...s.campos.map(c => `  • ${etiqueta(c.campo)}${c.cuando ? ` — solo si ${etiqueta(c.cuando.campo)} ${c.cuando.operador} ${Array.isArray(c.cuando.valor) ? c.cuando.valor.join(' | ') : c.cuando.valor}` : ''}`),
      ...(propuesta.distintoDe?.length ? ['Debe ser un sujeto DISTINTO del de:', ...propuesta.distintoDe.map(r => `  • requisito ${r}`)] : []),
      'Qué será secreto (QA debe conseguirlo y guardarlo en el .env al aprobarse):',
      ...(secretos.length ? secretos.map(c => `  • ${etiqueta(c.campo)}${!esCampoPersona(c.campo) && esCompartible(c.campo) ? ' — compartible con otros actores SOLO si usted lo decide' : ''}`) : ['  (ninguno)']),
      'Qué resolverá automáticamente el framework (sin secretos):',
      ...base.map(c => `  • ${etiqueta(c.campo)} (dato público del perfil)`), ...(s.perfil && s.sujeto !== 'participante' ? automaticos(s.perfil, s.campos.map(c => c.campo).filter((c): c is CampoAfi => !esCampoPersona(c))) : []),
      'Posibles reutilizaciones (decida mismoActorQue o actoresDistintosDe):',
      ...(parecidos.length ? parecidos.map(x => {
        const otro = x.a === proposalId ? x.b : x.a;
        const esPropuesta = lote.propuestas.some(p => p.proposalId === otro);
        const linea = `  • ${esPropuesta ? 'propuesta' : 'actor existente'} ${otro}: ${MOTIVO[x.motivo]}`;
        const existente = esPropuesta ? undefined : registro?.slots.find(y => y.id === otro);
        if (!existente) return linea;
        // 4S-R.1: lo que mismoActorQue añadiría a ESE actor (nada se reemplaza ni se borra).
        const condiciones = s.condiciones.filter(c => !existente.condiciones.some(y => y.id === c.id)).map(c => c.descripcion);
        const campos = s.campos.filter(c => !existente.campos.some(y => y.campo === c.campo)).map(c => etiqueta(c.campo));
        return [linea, `      mismoActorQue "${otro}" le añadiría: condiciones: ${condiciones.length ? condiciones.join(' | ') : '(ninguna)'}; `
          + `campos: ${campos.length ? campos.join(', ') : '(ninguno)'}${campos.length ? ' (QA debe cargar esos secretos en el .env antes de volver a usarlo)' : ''}`,
          // Una condición nueva no la prueban los secretos: el actor vuelve a pendiente-provisionar hasta confirmarla.
          ...(condiciones.length ? [`      Al añadir una condición, el actor vuelve a pendiente-provisionar: QA debe confirmar que la cumple con `
            + `\`node tools/afi.mjs ${proyecto} datos provisionado ${otro} --revisor=<su-alias>\` (tener sus secretos no lo prueba).`] : [])].join('\n');
      }) : ['  (ninguna: no se parece a ningún actor aprobado ni a otra propuesta)']),
      'Estado propuesto:',
      `  ${propuesta.reutilizable ? '' : 'actor PROPIO (el caso no puede compartirlo). '}pendiente-provisionar: QA debe conseguir un actor que cumpla las condiciones. Use "provisionado" solo si ya existe.`);
  }
  if (lote.reutilizados.length) {
    L.push('', '## REUTILIZACIONES AUTOMÁTICAS (mismo perfil y mismas condiciones que un actor aprobado)',
      ...lote.reutilizados.map(r => `  • requisito ${r.requisito} usará el actor existente ${r.slot}`));
  }
  if (lote.rechazados.length) {
    L.push('', '## REQUISITOS RECHAZADOS (no se revisan: el agente debe corregirlos)',
      ...lote.rechazados.map(r => `  • [${r.indice}]${r.referencia ? ` ${r.referencia}` : ''}: ${[...new Set(r.problemas.map(p => p.motivo))].join(', ')}`));
  }
  if (!lote.propuestas.length && !lote.reutilizados.length && !lote.rechazados.length) L.push('', 'El lote no contiene requisitos de datos de prueba.');
  const md = `${L.join('\n')}\n`;
  // Última barrera: sin PII (el id del lote es un identificador criptográfico, no cuenta).
  if (piiEnMetadato(md.replace(/kd-[0-9a-f]{16}/g, 'kd-lote'))) throw new DatosPruebaError('LOTE_INVALIDO', [{ motivo: 'PII', detalle: 'posible PII en la revisión legible: no se escribe' }]);
  return md;
}
