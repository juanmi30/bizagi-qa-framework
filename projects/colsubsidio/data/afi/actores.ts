import type { ActorAfi, CampoAfi, PerfilActorAfi, ValorCampo } from './modelo';
import { PERFILES_AFI, type PerfilPublicoAfi } from './perfiles';

/**
 * Representa los actores QA actuales con el modelo ActorAfi SIN mover variables:
 * mapea los nombres .env existentes. Recibe el entorno como parámetro (no lee process.env).
 */
type Entorno = Readonly<Record<string, string | undefined>>;

const publicos = ({ tipoAportante, tipoIdentificacion, tipoEmpleador }: PerfilPublicoAfi) =>
  ({ tipoAportante, tipoIdentificacion, ...(tipoEmpleador ? { tipoEmpleador } : {}) });

const PUBLICOS: Record<PerfilActorAfi, Partial<Record<CampoAfi, ValorCampo>>> = {
  independiente: {},
  empresa: publicos(PERFILES_AFI.empresa),
  pensionado: publicos(PERFILES_AFI.pensionado),
  facultativo: publicos(PERFILES_AFI.facultativo),
};

const TELEFONOS = { numeroCelular: 'AFI_CP01_NUM_CEL', numeroTelefonoFijo: 'AFI_CP01_NUM_CEL_FIJO' };

/** Campo del actor -> variable .env vigente. */
export const VARIABLES_ACTOR: Record<PerfilActorAfi, Partial<Record<CampoAfi, string>>> = {
  independiente: {
    tipoAportante: 'AFI_CP01_TIPO_APORTANTE',
    tipoAfiliado: 'AFI_CP01_TIPO_AFILIADO',
    tipoIdentificacion: 'AFI_CP01_TIPO_IDENTIFICACION',
    numeroIdentificacion: 'AFI_CP01_NUMERO_IDENTIFICACION',
    correo: 'AFI_CP01_CORREO',
    ...TELEFONOS,
    actividad: 'AFI_CP01_ACTIVIDAD',
    ingresoMensual: 'AFI_CP01_INGRESO_MENSUAL',
  },
  empresa: { numeroIdentificacion: 'AFI_QA_EMPRESA_IDENTIFICACION', correo: 'AFI_QA_CORREO' },
  pensionado: { numeroIdentificacion: 'AFI_QA_PENSIONADO_IDENTIFICACION', correo: 'AFI_QA_CORREO', ...TELEFONOS },
  facultativo: {
    numeroIdentificacion: 'AFI_QA_FACULTATIVO_IDENTIFICACION', correo: 'AFI_QA_CORREO', ...TELEFONOS,
    nacionalidad: 'AFI_QA_FACULTATIVO_NACIONALIDAD',
    estadoCivil: 'AFI_QA_FACULTATIVO_ESTADO_CIVIL',
    fondoPensiones: 'AFI_QA_FACULTATIVO_FONDO_PENSIONES',
    salarioBasico: 'AFI_QA_FACULTATIVO_SALARIO_BASICO',
  },
};

/** Una variable ausente deja el dato ausente: el resolver lo reportará como DataGapError. */
export function actorDesdeEntorno(perfil: PerfilActorAfi, entorno: Entorno): ActorAfi {
  const datos: Partial<Record<CampoAfi, ValorCampo>> = { ...PUBLICOS[perfil] };
  for (const [campo, variable] of Object.entries(VARIABLES_ACTOR[perfil]) as [CampoAfi, string][]) {
    const valor = entorno[variable]?.trim();
    if (valor) datos[campo] = valor;
  }
  return { id: `${perfil}Qa`, perfil, datos };
}
