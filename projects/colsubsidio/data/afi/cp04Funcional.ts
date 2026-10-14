import type { PlanFuncionalAfi } from './funcional';

/**
 * 228503 - CP04 P04-P06 como plan funcional declarativo (datos públicos del diseño QA).
 * Fuente: 20260910_CLS_AFI_HU 14.12_V2_Casos_Prueba.xlsx y soportes 20260911.
 * P02/P03 siguen en el spec (preparación).
 */

/** Mismo texto que ALERTA_TERRITORIAL del Portal (un unit test los mantiene iguales). */
export const ALERTA_TERRITORIAL_CP04 = 'Solo puedes afiliarte si resides en Bogotá o Cundinamarca. Si vives en otro departamento, debes buscar la caja correspondiente a tu región.';

export const PLAN_FUNCIONAL_CP04: PlanFuncionalAfi = {
  caso: '228503 - CP04',
  pasos: [
    {
      id: 'P04',
      esperado: 'No se muestra ninguna alerta amarilla de cobertura territorial.',
      operaciones: [
        { tipo: 'texto-ausente', texto: ALERTA_TERRITORIAL_CP04, coincidencia: 'exacta' },
        { tipo: 'texto-ausente', texto: 'Solo puedes afiliarte si resides en Bogotá o Cundinamarca', coincidencia: 'contiene', evidencia: 'CP04_P04_sin_alerta' },
      ],
    },
    {
      id: 'P05',
      esperado: 'El desplegable muestra todas las opciones nacionales paramétricas (No se restringe únicamente a Bogotá D.C. y Cundinamarca).',
      operaciones: [
        { tipo: 'catalogo-opcion-fuera-de', campo: 'departamento', excluir: ['BOGOTÁ, D.C.', 'CUNDINAMARCA'], normalizacion: 'texto-es', evidencia: 'CP04_P05_departamentos' },
        // Departamento de prueba del soporte certificado, precondición de P06.
        { tipo: 'seleccionar-exacto', campo: 'departamento', valor: 'ANTIOQUIA' },
      ],
    },
    {
      id: 'P06',
      esperado: 'El campo de Ciudad de vivienda se comporta según las reglas originales de este tipo de aportante, sin las restricciones forzadas desarrolladas para Independientes.',
      operaciones: [
        { tipo: 'catalogo-no-vacio', campo: 'ciudadVivienda', evidencia: 'CP04_P06_ciudades' },
        { tipo: 'catalogo-opcion-fuera-de', campo: 'ciudadVivienda', excluir: ['BOGOTÁ, D.C.'], normalizacion: 'texto-es' },
        // No se elige ciudad ni se avanza a dirección.
        { tipo: 'cerrar-catalogo', campo: 'ciudadVivienda' },
      ],
    },
  ],
};
