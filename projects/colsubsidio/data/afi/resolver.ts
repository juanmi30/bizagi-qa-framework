import {
  CAMPOS_AFI, DataGapError, ETAPAS_AFI, ResolucionCampo,
  type CampoAfi, type ContextoResolucion, type EtapaAfi, type OrigenDato, type PoliticaCampo, type ValorCampo,
} from './modelo';
import { POLITICAS_AFI, politicasDelPerfil } from './politicas';
import { enteroEnRango } from './datosPrueba/generacion';

type Politicas = Readonly<Record<CampoAfi, PoliticaCampo>>;

const esCampo = (campo: string, politicas: Politicas): campo is CampoAfi =>
  Object.prototype.hasOwnProperty.call(politicas, campo);

/**
 * Precedencia:
 * 1. test-case (valor exacto o regla explícita del caso);
 * 2. si el campo es asserted y el caso no lo define -> DataGapError (nunca se inventa el esperado);
 * 3. actor;
 * 4. derived, solo desde valores concretos ya resueltos;
 * 5. auxiliary: devuelve la ESTRATEGIA, no un valor de UI;
 * 6. DataGapError.
 */
export function resolverCampo(
  campo: string,
  contexto: ContextoResolucion,
  politicas: Politicas = POLITICAS_AFI,
): ResolucionCampo {
  return resolver(campo, contexto, politicas, new Set());
}

function resolver(campo: string, contexto: ContextoResolucion, politicas: Politicas, visitando: Set<CampoAfi>): ResolucionCampo {
  if (!esCampo(campo, politicas)) throw new DataGapError(campo, 'campo-desconocido');
  if (visitando.has(campo)) throw new DataGapError(campo, 'dependencia-ciclica');
  const politica = politicas[campo];
  const relevante = contexto.aserciones?.includes(campo) ?? false;
  const nueva = (origen: OrigenDato, valor?: ValorCampo, extra: Partial<Pick<ResolucionCampo, 'estrategia' | 'derivadoDe'>> = {}) =>
    new ResolucionCampo(campo, origen, politica.sensibilidad, relevante, valor, extra.estrategia, extra.derivadoDe);

  const delCaso = contexto.datosCaso?.[campo];
  if (delCaso !== undefined) {
    return typeof delCaso === 'object' ? nueva('test-case', undefined, { estrategia: delCaso.estrategia }) : nueva('test-case', delCaso);
  }
  if (relevante) throw new DataGapError(campo, 'asercion-sin-valor-explicito', ['test-case']);

  const delActor = politica.delActor ? contexto.actor?.datos[campo] : undefined;
  if (delActor !== undefined) return nueva('actor', delActor);

  if (politica.derivacion) {
    visitando.add(campo);
    const conocidos: Partial<Record<CampoAfi, ValorCampo>> = {};
    try {
      for (const dependencia of politica.derivacion.dependeDe) {
        const valor = resolver(dependencia, contexto, politicas, visitando).valor;
        if (valor !== undefined) conocidos[dependencia] = valor;
      }
    } catch (error) {
      // Una dependencia sin dato solo impide derivar; el ciclo sí es un gap propio.
      if (!(error instanceof DataGapError) || error.motivo === 'dependencia-ciclica') throw error;
    } finally {
      visitando.delete(campo);
    }
    const completos = politica.derivacion.dependeDe.every(d => conocidos[d] !== undefined);
    const derivado = completos ? politica.derivacion.derivar(conocidos) : undefined;
    if (derivado !== undefined) return nueva('derived', derivado, { derivadoDe: politica.derivacion.dependeDe });
  }

  // GENERATED: solo con autorización generable para el perfil del actor (§7.3). Determinista por caso + campo.
  const gen = politica.generable;
  if (gen && contexto.actor && gen.perfiles.includes(contexto.actor.perfil)) {
    const semilla = `${contexto.semilla ?? 'afi'}|${campo}`;
    const motivo = `GENERATED ${gen.estrategia} (${gen.evidencia.tipo}: ${gen.evidencia.referencia})`;
    if (gen.estrategia === 'entero-rango') {
      const { min, max } = gen.restricciones as { min: number; max: number };
      const valor = String(enteroEnRango(min, max, semilla));
      return nueva('generated', valor, { estrategia: { tipo: 'deterministic-number', valor, motivo } });
    }
    if (gen.estrategia === 'opcion-dominio') return nueva('generated', undefined, { estrategia: { tipo: 'generated-option', semilla, motivo } });
  }

  if (politica.auxiliar) return nueva('auxiliary', undefined, { estrategia: politica.auxiliar });

  const fuentes: OrigenDato[] = ['test-case'];
  if (politica.delActor) fuentes.push('actor');
  if (politica.derivacion) fuentes.push('derived');
  throw new DataGapError(campo, 'sin-fuente-segura', fuentes);
}

export interface PlanPreparacion {
  resoluciones: ResolucionCampo[];
  gaps: DataGapError[];
  /**
   * (4S-R.1) Campos `segunEstado` sin fuente segura: solo son DataGap si en pantalla aparecen habilitados y vacíos/inválidos.
   * No dejan el caso como no ejecutable. Ausente = ninguno.
   */
  condicionales?: DataGapError[];
}

/**
 * Resuelve todos los campos que el piloto recorrió para el perfil del actor, más los que el
 * caso nombre explícitamente. Acumula gaps en vez de detenerse en el primero.
 */
export function resolverPreparacion(
  contexto: ContextoResolucion,
  politicas: Politicas = POLITICAS_AFI,
): PlanPreparacion {
  return planificar(contexto, politicas);
}

/**
 * Plan de UNA etapa: mismos perfiles, precedencia y gaps que resolverPreparacion(), limitado a
 * los campos de esa etapa. Un nombre desconocido del caso no tiene etapa y siempre es gap.
 */
export function resolverEtapa(
  etapa: EtapaAfi,
  contexto: ContextoResolucion,
  politicas: Politicas = POLITICAS_AFI,
): PlanPreparacion {
  return planificar(contexto, politicas, etapa);
}

function planificar(contexto: ContextoResolucion, politicasBase: Politicas, etapa?: EtapaAfi): PlanPreparacion {
  // Etapa, familia y obligatoriedad son las del PERFIL del actor (variantes observadas); sin actor, la base.
  const politicas = contexto.actor ? politicasDelPerfil(contexto.actor.perfil, politicasBase) : politicasBase;
  const gaps: DataGapError[] = [];
  const nombrados = [...Object.keys(contexto.datosCaso ?? {}), ...(contexto.aserciones ?? [])];
  // Un nombre mal escrito por el caso/agente nunca se ignora en silencio.
  for (const campo of new Set(nombrados)) {
    if (!esCampo(campo, politicas)) gaps.push(new DataGapError(campo, 'campo-desconocido'));
  }
  const perfil = contexto.actor?.perfil;
  const campos = CAMPOS_AFI
    .filter(c => esCampo(c, politicas))
    .filter(c => !etapa || politicas[c].etapa === etapa)
    .filter(c => nombrados.includes(c) || !politicas[c].perfiles || (perfil !== undefined && politicas[c].perfiles!.includes(perfil)))
    // No obligatorio para avanzar (observado) y no nombrado por el caso: no se diligencia.
    .filter(c => nombrados.includes(c) || politicas[c].obligatorioParaAvanzar !== false)
    .sort((a, b) => ETAPAS_AFI.indexOf(politicas[a].etapa) - ETAPAS_AFI.indexOf(politicas[b].etapa));

  const resoluciones: ResolucionCampo[] = [];
  const condicionales: DataGapError[] = [];
  for (const campo of campos) {
    try { resoluciones.push(resolver(campo, contexto, politicas, new Set())); }
    catch (error) {
      if (!(error instanceof DataGapError)) throw error;
      // Solo la falta de fuente de un campo según estado se difiere a la pantalla; una aserción sin valor sigue siendo gap.
      if (politicas[campo].segunEstado && error.motivo === 'sin-fuente-segura') condicionales.push(error);
      else gaps.push(error);
    }
  }
  return { resoluciones, gaps, ...(condicionales.length ? { condicionales } : {}) };
}
