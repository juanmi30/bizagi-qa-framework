import type { DefinicionCasoAfi } from '../caso';
import { PLAN_FUNCIONAL_CP04 } from '../cp04Funcional';
import { PERFILES_AFI } from '../perfiles';

/**
 * GOLDEN SAMPLES del contrato DefinicionCasoAfi: 228503 - CP04 por tipo de aportante.
 * Los ejecuta el spec real afi-hu14-12-cp04.spec.ts vía compilarCasoAfi + ejecutarCasoAfi (Fase 3B).
 * Referencian el mismo PLAN_FUNCIONAL_CP04; al serializarse cada definición es autocontenida.
 */
const cp04 = (perfil: 'empresa' | 'pensionado' | 'facultativo'): DefinicionCasoAfi => ({
  version: 1,
  hu: 'AFI HU 14.12',
  caso: '228503',
  nombre: `CP04 ${PERFILES_AFI[perfil].nombre}`,
  fuente: { tipo: 'diseno-qa', referencia: '20260910_CLS_AFI_HU 14.12_V2_Casos_Prueba.xlsx' },
  perfil,
  preparacion: {
    // La variante del caso: el tipo de aportante lo fija el diseño, no el actor.
    datosCaso: { tipoAportante: PERFILES_AFI[perfil].tipoAportante },
    // P04-P06 no validan valores de preparación.
    camposAsercion: [],
    etapas: ['inicio-solicitud', 'telefonos', 'informacion-adicional'],
  },
  funcional: PLAN_FUNCIONAL_CP04,
});

export const CP04_EMPRESA = cp04('empresa');
export const CP04_PENSIONADO = cp04('pensionado');
export const CP04_FACULTATIVO = cp04('facultativo');
export const DEFINICIONES_CP04 = [CP04_EMPRESA, CP04_PENSIONADO, CP04_FACULTATIVO] as const;
