/**
 * Modelo de estados SDE. Separa lo que la UI muestra de lo que se verificó directamente,
 * para que ningún reporte confunda "la pantalla avanzó" con "la integración funcionó".
 */

/** Estado de un paso del escenario (y, agregado, de un paso de la matriz Excel). */
export type EstadoPaso =
  | 'PASS'                      // verificado directamente en QA
  | 'UI_PASS'                   // lo observable en UI cumple; el mecanismo interno no se vio
  | 'INTEGRATION_NOT_VERIFIED'  // SISE / Worker AI / compuerta: sin traza/log/respuesta accesible
  | 'NOT_AUTOMATED'             // el paso de la matriz no tiene automatización (se declara, no se oculta)
  | 'FAIL'
  | 'BLOCKED'                   // faltan credenciales, datos o ambiente
  | 'NOT_RUN';                  // no se ejecutó porque un paso previo falló o quedó bloqueado

/** Estado de un CP completo. */
export type EstadoCp =
  | 'PREPARADO'          // modelado (manifest/datos), sin escenario ejecutable aún
  | 'EJECUTABLE'         // escenario listo; falta correrlo contra QA
  | 'BLOCKED'            // escenario listo pero sin credenciales/datos/ambiente
  | 'FAIL'
  | 'REAL_PASS_PARCIAL'  // sesión real + caso real + sin fallos, pero con pasos no automatizados o integración no verificada
  | 'REAL_PASS';         // todos los pasos de la matriz PASS/UI_PASS con sesión y caso reales

/** Peor estado primero: sirve para agregar varios resultados sobre un mismo paso de la matriz. */
const GRAVEDAD: EstadoPaso[] = ['FAIL', 'BLOCKED', 'NOT_RUN', 'NOT_AUTOMATED', 'INTEGRATION_NOT_VERIFIED', 'UI_PASS', 'PASS'];

export function peorEstado(estados: EstadoPaso[]): EstadoPaso {
  if (estados.length === 0) return 'NOT_AUTOMATED';
  return [...estados].sort((a, b) => GRAVEDAD.indexOf(a) - GRAVEDAD.indexOf(b))[0];
}

/**
 * Causa probable de un resultado no verde. NUNCA se atribuye al producto una excepción genérica o un timeout:
 * PRODUCTO_POR_CONFIRMAR solo cuando el comportamiento OBSERVADO difiere de lo esperado (verificación que no se cumple o
 * respuesta explícita de Bizagi), y aun así requiere confirmación funcional.
 */
export type CausaPaso =
  | 'PRODUCTO_POR_CONFIRMAR'     // se observó un comportamiento distinto al esperado
  | 'AUTOMATIZACION'             // selector/etiqueta/calibración: la automatización no encontró o no pudo operar el control
  | 'AMBIENTE'                   // DNS, red, permisos, servicio caído
  | 'CONFIGURACION'              // .env local incompleto (URL del portal, credenciales de un actor)
  | 'CONCURRENCIA'               // otra ejecución real de SDE en curso (bloqueo entre procesos)
  | 'DATO'                       // dato de prueba faltante
  | 'INTEGRACION_NO_VERIFICADA'  // SISE / Worker AI / compuerta sin traza
  | 'NO_AUTOMATIZADO'            // paso sin criterio objetivo automatizable
  | 'POLITICA_SOLO_LECTURA'      // la política de solo lectura (P-15) rechazó una acción de escritura: no se ejecutó
  | 'ASIGNACION'                 // la actividad no está disponible para el analista de pruebas o no se pudo reasignar (permiso, ambigüedad)
  | 'NO_CLASIFICADO';            // excepción sin patrón reconocido: revisar a mano

export interface ResultadoPaso {
  indice: number;          // posición en el escenario (1..n)
  hacer: string;           // capability ejecutada
  matriz: number[];        // pasos del Excel que cubre
  estado: EstadoPaso;
  causa?: CausaPaso;       // solo para estados no verdes ejecutados (no para NOT_RUN)
  detalle: string;         // SIEMPRE sanitizado (sin valores sensibles)
  evidencia?: string;      // nombre del adjunto en el reporte
  /**
   * Excepción técnica ocurrida DESPUÉS de observar un defecto funcional en el mismo paso (R2). El paso conserva el FAIL
   * funcional (causa PRODUCTO_POR_CONFIRMAR) y el incidente se registra aparte, con su propia causa.
   */
  incidente?: { causa: CausaPaso; detalle: string };
  ms?: number;
}

export interface ResultadoPasoMatriz {
  n: number;
  accion: string;
  esperado: string;
  estado: EstadoPaso;
  cubierto_por: number[];  // índices de pasos del escenario
}

export interface ReporteCp {
  cp: string;
  escenario: string;
  inicio: string;
  fin: string;
  unico: string;
  estado: EstadoCp;
  motivo: string;
  numero_caso: string | null;
  actividades_observadas: string[];
  pasos: ResultadoPaso[];
  matriz: ResultadoPasoMatriz[];
  bloqueos: string[];      // nombres de variables / datasets faltantes (nunca valores)
  cleanup: { politica: string; razon: string };
  /** Causas de todo lo que no quedó verde (pasos y bloqueos previos), sin repetir. Ausente en reportes anteriores a H4. */
  causas?: CausaPaso[];
  /**
   * A quién se atribuye un FAIL: PRODUCTO_POR_CONFIRMAR solo si algún paso falló por un comportamiento OBSERVADO distinto
   * al esperado; NO_ATRIBUIBLE_AL_PRODUCTO si todas las fallas son de automatización, ambiente o excepciones sin clasificar.
   * NO_APLICA para estados que no son FAIL.
   */
  atribucion?: 'PRODUCTO_POR_CONFIRMAR' | 'NO_ATRIBUIBLE_AL_PRODUCTO' | 'NO_APLICA';
}
