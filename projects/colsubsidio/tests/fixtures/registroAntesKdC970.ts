import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashRegistro, type LoteDatosPrueba } from '../../data/afi/datosPrueba/intake';
import { REGISTRO_DATOS_PRUEBA_AFI, type RegistroDatosPrueba } from '../../data/afi/datosPrueba/registro';

/**
 * Registro de datos de prueba TAL COMO ESTABA antes de aplicar kd-c970835c84c0dbf0 (revisión 10), derivado del registro vigente
 * deshaciendo SOLO lo que su historial atribuye a ese lote y a las provisiones posteriores. No se fabrica: se VERIFICA contra el
 * `hashRegistroBase` del propio lote; si no coincide, lanza (y las pruebas que lo usan fallan en vez de simular sobre otra base).
 * Las pruebas dejan así de depender de la revisión vigente del store real (que evoluciona por decisiones humanas).
 */
export const LOTE_KD_C970 = 'kd-c970835c84c0dbf0';
const RAIZ = resolve(__dirname, '../..');

export function loteKdC970(): LoteDatosPrueba {
  return JSON.parse(readFileSync(resolve(RAIZ, `knowledge/test-data-review/${LOTE_KD_C970}.review.json`), 'utf8'));
}

export function registroAntesKdC970(): RegistroDatosPrueba {
  const lote = loteKdC970();
  const vigente: RegistroDatosPrueba = JSON.parse(JSON.stringify(REGISTRO_DATOS_PRUEBA_AFI));
  if (vigente.revision === lote.revisionBase && hashRegistro(vigente) === lote.hashRegistroBase) return vigente;
  const primera = vigente.historial.findIndex(h => h.lote === LOTE_KD_C970);
  if (primera < 0) throw new Error(`el registro vigente no contiene ${LOTE_KD_C970} y no está en su revisión base`);
  // Se deshace lo que añadió CADA lote aplicado desde kd-c970 (inclusive), leyendo su propio artefacto de revisión:
  // requisitos, ocurrencias, campos y condiciones. Las provisiones posteriores se descartan con el historial.
  const lotes = [...new Set(vigente.historial.slice(primera).map(h => h.lote).filter((x): x is string => !!x))];
  for (const id of lotes) {
    const l: LoteDatosPrueba = id === LOTE_KD_C970 ? lote
      : JSON.parse(readFileSync(resolve(RAIZ, `knowledge/test-data-review/${id}.review.json`), 'utf8'));
    for (const { propuesta } of l.propuestas) {
      const h = vigente.historial.find(x => x.lote === id && x.propuesta === propuesta.proposalId);
      if (!h) continue;
      const s = vigente.slots.find(x => x.id === h.slot)!;
      s.origen.requisitos = s.origen.requisitos.filter(r => !propuesta.requisitos.includes(r));
      const claves = new Set(propuesta.ocurrencias.map(o => JSON.stringify(o)));
      const previas = s.origen.ocurrencias.filter(o => !claves.has(JSON.stringify(o)));
      s.origen.ocurrencias = previas.length ? previas : s.origen.ocurrencias; // las ocurrencias ya existentes no se habían duplicado
      s.condiciones = s.condiciones.filter(c => c.id === s.condiciones[0].id || !propuesta.slot.condiciones.some(x => x.id === c.id));
      s.campos = s.campos.filter(c => ['numeroIdentificacion', 'correo'].includes(c.campo));
      s.estado = 'provisionado';
    }
  }
  const base: RegistroDatosPrueba = { ...vigente, revision: lote.revisionBase, historial: vigente.historial.slice(0, primera) };
  if (hashRegistro(base) !== lote.hashRegistroBase) throw new Error(`no se pudo verificar la revisión base de ${LOTE_KD_C970} (hash distinto)`);
  return base;
}
