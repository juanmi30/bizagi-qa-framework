import type { PasoSoporte } from './certificacion';

/** Presentación únicamente: no calcula ni sustituye el estado o la causa registrada. */
export function explicarPaso(p: PasoSoporte, cp?: string) {
  const causas = p.causas ?? [];
  const categoria = causas.includes('PRODUCTO_POR_CONFIRMAR') ? 'Posible problema funcional'
    : causas.includes('AUTOMATIZACION') ? 'Fallo de automatización'
    : causas.some(c => ['DATO', 'CONFIGURACION'].includes(c)) ? 'Información insuficiente para ejecutar'
    : causas.some(c => ['AMBIENTE', 'ASIGNACION', 'CONCURRENCIA', 'POLITICA_SOLO_LECTURA'].includes(c)) ? 'Condición de ejecución pendiente'
    : ['NOT_AUTOMATED', 'INTEGRATION_NOT_VERIFIED'].includes(p.estado) ? 'Revisión manual necesaria'
    : ['PASS', 'UI_PASS'].includes(p.estado) ? 'Comprobación satisfactoria' : 'Resultado pendiente de revisión';
  let ocurrio = p.obtenido.replace(/[✔✘]/g, '').replace(/\s*\|\s*/g, '. ').replace(/\s+/g, ' ').trim();
  const diferencia = p.obtenido.match(/"([^"]+)" = (.*?) \(NO coincide: muestra "([^"]*)"\)/);
  if (diferencia) ocurrio = `El campo «${diferencia[1]}» mostró «${diferencia[3]}». La comprobación esperaba «${diferencia[2]}».`;
  if (/la restricción del campo no se aplicó/.test(p.obtenido)) ocurrio = 'El campo conservó un valor que la prueba esperaba que rechazara. El detalle del valor y del control se conserva en el diagnóstico técnico.';
  if (/la fila .* no quedó con los valores esperados/.test(p.obtenido)) ocurrio = 'Después de guardar y volver a leer la tabla, no se encontraron todos los valores esperados en la fila.';
  const significado = categoria === 'Posible problema funcional' ? 'Se observó una diferencia frente al diseño. QA debe confirmar si corresponde a un defecto; el informe no modifica el criterio esperado.'
    : categoria === 'Fallo de automatización' ? 'La herramienta no logró operar o comprobar el control. Este resultado no demuestra un defecto del formulario.'
    : categoria === 'Información insuficiente para ejecutar' ? 'Hay que completar o corregir datos o configuración antes de repetir la comprobación.'
    : categoria === 'Condición de ejecución pendiente' ? 'Revisar la disponibilidad del ambiente, la asignación o las condiciones de ejecución antes de repetir.'
    : categoria === 'Comprobación satisfactoria' ? 'La comprobación registrada cumplió su expectativa. Esto no aprueba el caso completo ni sustituye la aprobación de QA.'
    : 'La evidencia disponible no permite cerrar esta validación automáticamente. El analista debe revisar el diseño y completar la comprobación.';
  const dificilRecuperacion = [...(p.incidentes ?? []), ...(p.diagnosticosOriginales ?? []), p.obtenido].some(t => /no (?:se pudo cerrar|cerró)|NO se pudo cerrar|no cerr[oó] el pop-up|qued[oó] inutilizable|no se pudo recuperar/i.test(t));
  const continuidadEstado = dificilRecuperacion ? 'terminacion_dificultad_recuperacion' : p.continuidad === 'continuo' ? 'continuacion_normal' : 'desconocida';
  const continuidad = dificilRecuperacion ? 'Terminación con dificultad de recuperación. El registro describe problemas al comprobar o cerrar el formulario; no demuestra una continuación normal.'
    : p.continuidad === 'continuo' ? 'Continuación normal. Se registraron acciones posteriores; esto no demuestra que todos los criterios estén cubiertos ni autoriza repetir una escritura.'
    : 'Continuidad desconocida. No se puede determinar con esta fuente si se continuó; puede ser el último paso, un bloqueo o un resultado transcrito.';
  const revision = p.incidentes?.length ? 'Revisar también el incidente separado: el estado del paso se conserva y no permite aprobar automáticamente el caso.'
    : categoria === 'Comprobación satisfactoria' ? 'QA conserva la revisión y aprobación funcional del caso completo.'
    : categoria === 'Información insuficiente para ejecutar' ? 'El responsable de los datos debe aportar la información faltante; QA debe confirmar su procedencia y validez.'
    : categoria === 'Fallo de automatización' ? 'Soporte debe revisar la interacción y QA debe comprobar manualmente el comportamiento mientras tanto.'
    : 'QA debe contrastar lo observado con la fuente documental y registrar su decisión.';
  const base = { categoria, ocurrio, significado, continuidad, continuidadEstado, revision,
    intentado: p.accion, comprobado: ocurrio, pendiente: revision, incidentePosterior: '' };
  if (cp === 'HU06-CP02' && p.n === 18 && /el formulario muestra .* tras diligenciar/i.test(p.obtenido)) {
    return { ...base, categoria: 'Comprobación de longitud inconclusa',
      intentado: 'El robot intentó introducir una placa de más de seis caracteres y comprobar su registro sin modificar la fila.',
      ocurrio: 'El robot no consiguió introducir la placa larga en la forma esperada; el formulario mostró el valor anterior. El FAIL histórico se conserva.',
      comprobado: 'Se registró una discrepancia entre el dato que el robot intentó escribir y el valor que pudo leer. Esto no identifica por sí solo su causa.',
      pendiente: 'No quedó demostrado que Bizagi permita placas de más de seis caracteres ni que valide correctamente esa longitud.',
      significado: 'El criterio de longitud no se comprobó satisfactoriamente. Los códigos históricos no equivalen a una clasificación definitiva de defecto.',
      incidentePosterior: /No se encontró visible.*Placa|NO se pudo cerrar|no cerr[oó]/i.test(p.obtenido)
        ? 'Después falló la localización o comprobación del campo Placa y se registró una dificultad al cerrar o recuperar el formulario. Se conserva como hecho posterior separado del criterio de longitud.' : '',
      revision: 'QA debe repetir manualmente la entrada de la placa larga, observar el valor visible y comprobar en una lectura independiente si se registró; revisar por separado el cierre y la recuperación del formulario.' };
  }
  if (cp === 'HU06-CP02' && p.n === 14) return { ...base,
    categoria: 'Comprobación automática de alcance parcial', revision: 'QA debe revisar las opciones y reglas que no se comprobaron explícitamente. El estado histórico se conserva.',
    comprobado: p.estado === 'PASS' ? 'Se comprobó la presencia de Forma Consulta y la ausencia de Número de Documento Tomador en la vista observada.' : 'La comprobación automática de presencia de controles no terminó satisfactoriamente; consulte el resultado original.',
    pendiente: 'La presencia del control no demuestra que todas sus opciones o reglas de configuración sean correctas. QA debe contrastar el catálogo y comportamiento exigidos por el diseño.' };
  if (cp === 'HU06-CP02' && p.n === 22) return { ...base,
    categoria: 'Comprobación automática de alcance parcial', revision: 'QA debe revisar contenido y reglas de las secciones; presencia y navegación no equivalen a validación completa.',
    comprobado: 'El registro contiene comprobaciones de visibilidad, editabilidad y navegación por Observaciones, Documentos y Seguimiento. Su alcance exacto se conserva en el diagnóstico.',
    pendiente: 'No se demuestra con ello la corrección de todos los contenidos, mensajes o reglas de esas secciones. QA debe revisar las obligaciones del resultado esperado que no tienen una comprobación explícita.' };
  return base;
}
