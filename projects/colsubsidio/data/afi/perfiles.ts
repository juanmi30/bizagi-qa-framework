/**
 * Única fuente de metadatos PÚBLICOS de perfil observados en el piloto (CP04).
 * Independiente no se incluye: su etiqueta de tipo de aportante solo existe en .env.
 */
export interface PerfilPublicoAfi {
  nombre: string;
  tipoAportante: string;
  tipoIdentificacion: string;
  tipoEmpleador?: string;
}

export const PERFILES_AFI = {
  empresa: { nombre: 'Empresa', tipoAportante: 'Empleador', tipoIdentificacion: 'NIT', tipoEmpleador: 'Jurídica' },
  pensionado: { nombre: 'Pensionado', tipoAportante: 'Pensionado', tipoIdentificacion: 'Cédula de Ciudadanía' },
  facultativo: { nombre: 'Facultativo', tipoAportante: 'Facultativo', tipoIdentificacion: 'Cédula de Ciudadanía' },
} as const satisfies Record<string, PerfilPublicoAfi>;

export type PerfilPublico = keyof typeof PERFILES_AFI;
