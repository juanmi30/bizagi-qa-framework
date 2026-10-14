import { CAMPOS_AFI, type CampoAfi, type EtapaAfi } from '../modelo';
import { POLITICAS_AFI } from '../politicas';

/**
 * APPLICATION MODEL AFI — pantallas (Fase 4J, DISEÑO + vertical slice). Capa pura, sin Playwright.
 * Una pantalla se reconoce por VARIAS señales semánticas (encabezado, controles característicos por su campo de dominio),
 * nunca solo por URL. Sus campos se derivan de las políticas del modelo (no se redeclaran aquí).
 *
 * Estado: las firmas se derivan de los selectores y textos YA demostrados por el piloto; aún no gobiernan el runner
 * (que sigue con etapas declaradas). Antes de conectarlas a la navegación real deben verificarse en QA real.
 */

export type SenalPantalla =
  /** Uno de estos textos exactos visible como encabezado. */
  | { tipo: 'encabezado'; textos: readonly string[]; obligatoria?: true }
  /** El control de un campo de dominio visible (su localización la resuelve la capa UI). */
  | { tipo: 'campo'; campo: string; obligatoria?: true };

export interface PantallaAfi {
  id: EtapaAfi;
  senales: readonly SenalPantalla[];
  /** Mínimo de señales presentes (además de todas las obligatorias). */
  minimo: number;
  /** El runtime puede completar sus campos con preparación segura (datos del actor/auxiliares), sin decisión funcional. */
  preparable: boolean;
  /** Acción que avanza a la siguiente pantalla; null si no avanza (punto funcional). */
  avance: { tipo: 'continuar' } | null;
  /** Pantallas conocidas que pueden seguir a esta (tolera orden variable y pantallas condicionales). */
  siguientes: readonly EtapaAfi[];
}

const campos = (...ids: CampoAfi[]): SenalPantalla[] => ids.map(campo => ({ tipo: 'campo', campo }));

export const PANTALLAS_AFI: Readonly<Partial<Record<EtapaAfi, PantallaAfi>>> = Object.freeze({
  'inicio-solicitud': {
    id: 'inicio-solicitud', senales: campos('tipoAportante', 'numeroIdentificacion', 'correo'), minimo: 2,
    preparable: true, avance: { tipo: 'continuar' }, siguientes: ['telefonos', 'informacion-adicional', 'informacion-contacto'],
  },
  telefonos: {
    id: 'telefonos', senales: campos('numeroCelular', 'numeroTelefonoFijo'), minimo: 1,
    preparable: true, avance: { tipo: 'continuar' }, siguientes: ['informacion-adicional', 'informacion-contacto'],
  },
  'informacion-adicional': {
    id: 'informacion-adicional', senales: campos('actividad', 'ingresoMensual', 'nacionalidad', 'estadoCivil', 'fondoPensiones', 'salarioBasico'), minimo: 1,
    preparable: true, avance: { tipo: 'continuar' }, siguientes: ['telefonos', 'informacion-contacto'],
  },
  'informacion-contacto': {
    id: 'informacion-contacto',
    senales: [{ tipo: 'encabezado', textos: ['Información de contacto', 'Ingresa tu información de contacto'], obligatoria: true }, ...campos('departamento', 'ciudadVivienda')],
    minimo: 2, preparable: false, avance: null, siguientes: [],
  },
});

/** Campos de una pantalla: DERIVADOS de las políticas del modelo (declaración única). */
export function camposDePantalla(pantalla: EtapaAfi): CampoAfi[] {
  return CAMPOS_AFI.filter(c => POLITICAS_AFI[c].etapa === pantalla);
}

/** ¿El objetivo es alcanzable desde la pantalla según el grafo de siguientes? */
export function alcanzable(desde: string, objetivo: string, modelo: Readonly<Partial<Record<string, PantallaAfi>>> = PANTALLAS_AFI): boolean {
  const vistos = new Set<string>(), cola = [desde];
  while (cola.length) {
    const p = cola.shift()!;
    if (p === objetivo) return true;
    if (vistos.has(p)) continue;
    vistos.add(p);
    cola.push(...(modelo[p]?.siguientes ?? []));
  }
  return false;
}

/** Validación del modelo: señales suficientes, siguientes conocidos, mínimos alcanzables. */
export function validarModeloPantallas(modelo: Readonly<Partial<Record<string, PantallaAfi>>> = PANTALLAS_AFI): string[] {
  const problemas: string[] = [];
  for (const [id, p] of Object.entries(modelo)) {
    if (!p) continue;
    if (p.id !== id) problemas.push(`${id}: id inconsistente`);
    if (!p.senales.length) problemas.push(`${id}: sin señales`);
    if (p.minimo < 1 || p.minimo > p.senales.length) problemas.push(`${id}: mínimo fuera de rango`);
    if (p.minimo < 2 && p.senales.length < 2 && !p.senales.some(s => s.obligatoria)) problemas.push(`${id}: una sola señal no obligatoria es frágil`);
    for (const s of p.siguientes) if (!modelo[s]) problemas.push(`${id}: siguiente desconocida ${s}`);
    if (!p.avance && p.siguientes.length) problemas.push(`${id}: tiene siguientes pero no acción de avance`);
  }
  return problemas;
}
