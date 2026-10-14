import type { ActorAfi } from './afi/modelo';
import { VARIABLES_ACTOR } from './afi/actores';
import { PERFILES_AFI, type PerfilPublico } from './afi/perfiles';

/**
 * Facade temporal de compatibilidad: perfiles y actores viven en data/afi/.
 * Sin Playwright y sin un ActorAfi propio.
 */
export type PerfilAfi = PerfilPublico;
export const perfilesAfi = PERFILES_AFI;

/** Forma que aún consume completarInformacionAdicionalFacultativo (pantalla no migrada). */
export interface DatosFacultativo {
  nacionalidad: string;
  estadoCivil: string;
  fondoPensiones: string;
  salarioBasico: string;
}

/** Exige los cuatro datos del actor, como antes: falla antes de crear un caso, nombrando solo la variable. */
export function datosFacultativo(actor: ActorAfi): DatosFacultativo {
  const dato = (campo: keyof DatosFacultativo): string => {
    const valor = actor.datos[campo];
    if (typeof valor !== 'string' || !valor) throw new Error(`Falta ${VARIABLES_ACTOR.facultativo[campo]}`);
    return valor;
  };
  return {
    nacionalidad: dato('nacionalidad'),
    estadoCivil: dato('estadoCivil'),
    fondoPensiones: dato('fondoPensiones'),
    salarioBasico: dato('salarioBasico'),
  };
}
