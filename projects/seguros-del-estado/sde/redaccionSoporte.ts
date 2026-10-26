import type { PasoSoporte } from './certificacion';
import { explicarPaso } from './hallazgosHumanos';

/** Lectura de observaciones, nunca cálculo de estados ni sustitución del diagnóstico original. */
export function redactarPaso(p: PasoSoporte, cp: string) {
  const h = explicarPaso(p, cp), t = p.obtenido;
  const frases: string[] = [];
  const agregar = (s: string) => { if (s && !frases.includes(s)) frases.push(s); };
  let revision = '', alcance = '', incidente = '';
  const manual = !['PASS', 'UI_PASS'].includes(p.estado) || !!p.incidentes?.length;
  if (h.categoria === 'Comprobación de longitud inconclusa') return {
    resultado: `${h.ocurrio} ${h.comprobado}`, estado: `${p.estado} — longitud inconclusa; no hay clasificación definitiva de defecto.`,
    hallazgo: h.pendiente, alcance: '', revision: h.revision, incidente: h.incidentePosterior, continuidad: h.continuidad,
  };
  if (/Paso agregado del CP/.test(t)) {
    agregar(p.estado === 'FAIL' ? 'El objetivo del caso no se completó satisfactoriamente: hay comprobaciones con diferencias o pendientes en los pasos siguientes.'
      : p.estado === 'NOT_AUTOMATED' ? 'Este paso resume el objetivo completo del caso. Las comprobaciones automáticas no sustituyen la revisión funcional pendiente.'
      : 'El resultado de este objetivo reúne las comprobaciones registradas en los demás pasos del caso.');
    if (manual) revision = 'Revisar los pasos que conservan diferencias o comprobaciones pendientes antes de aprobar el objetivo del caso.';
  }
  if (/ORT-TERMINO-POLIZA/.test(t) && /hallazgo\(s\)/.test(t)) agregar('El título «Detalle Polizas Asociadas» aparece sin la tilde de «Pólizas».');
  if (/EST-NOMENCLATURA-ENCABEZADO.*PENDIENTE/.test(t)) {
    agregar('Hay diferencias entre los nombres de campos del diseño y los mostrados por Bizagi; falta confirmar cuáles son las etiquetas aprobadas.');
    revision = 'Confirmar si deben mostrarse «Tipo de Movimiento» o «Tipo de Solicitud», y «Tipo de Radicación» o «Tipo Radicación», antes de registrar esas diferencias como defectos.';
  }
  const definiciones: [string, string][] = [
    ['INI-ETIQUETA-TIPO-SOLICITUD', 'el nombre aprobado de Tipo de Solicitud/Movimiento'],
    ['INI-ORDEN-CAMPOS', 'el orden de los campos'], ['INI-OBLIGATORIEDAD', 'la lista completa de campos obligatorios'],
    ['INI-CAPITALIZACION', 'la capitalización de las etiquetas'], ['INI-SI-AFIRMATIVO', 'el contexto de la opción «Si»'],
  ];
  const pendientes = definiciones.filter(([codigo]) => t.includes(codigo) && t.includes('PENDIENTE DE DEFINICIÓN')).map(([, nombre]) => nombre);
  if (pendientes.length) {
    agregar(`Se comprobaron las etiquetas observadas, pero siguen pendientes de definición ${pendientes.join(', ')}.`);
    revision = `Obtener de los responsables funcionales una definición aprobada de ${pendientes.join(', ')}. La norma ortográfica por sí sola no resuelve estas decisiones.`;
  }
  if (/La matriz no define el comportamiento esperado de Ramo RCE/.test(t)) {
    agregar('La matriz no define cómo deben comportarse Ramo RCE y Número de Póliza RCE cuando el Ramo tiene la propiedad Póliza RCE. Esa regla quedó sin comprobación objetiva.');
    revision = 'Definir el comportamiento esperado de ambos campos para un Ramo con la propiedad Póliza RCE antes de completar la prueba.';
  }
  const diferencia = t.match(/"([^"]+)" = (.*?) \(NO coincide: muestra "([^"]*)"\)/);
  if (diferencia) {
    agregar(`El campo «${diferencia[1]}» mostró «${diferencia[3]}»; el diseño esperaba «${diferencia[2]}».`);
    revision = `Confirmar el texto aprobado de «${diferencia[1]}» y determinar si la diferencia entre «${diferencia[3]}» y «${diferencia[2]}» debe registrarse como defecto.`;
  }
  const restriccion = t.match(/"([^"]+)": se tecleó (.*?); el formulario muestra "([^"]*)"; se esperaba "([^"]*)"/);
  if (restriccion) {
    agregar(`Al introducir «${restriccion[2]}» en «${restriccion[1]}», el campo mostró «${restriccion[3]}». La prueba esperaba ${restriccion[4] ? `«${restriccion[4]}»` : 'que el campo quedara vacío'}.`);
    revision = `Comprobar manualmente la restricción de «${restriccion[1]}» con ese dato y confirmar si corresponde a un defecto. La lectura del campo no prueba por sí sola su persistencia.`;
  }
  if (/la fila .* no quedó con los valores esperados/.test(t)) {
    agregar('Después de guardar y volver a leer la tabla, la fila no coincidió con los valores esperados.');
    revision = 'Contrastar el dato introducido con la fila guardada y su identidad; confirmar si la diferencia procede del formulario, de la lectura o del procesamiento de los datos.';
  }
  const sesion = t.match(/Sesión real iniciada como "([^"]+)"/);
  if (sesion) agregar(`Se inició sesión con el usuario de pruebas «${sesion[1]}».`);
  const inicio = t.match(/Formulario de inicio de "([^"]+)" abierto/);
  if (inicio) agregar(`Se abrió el formulario de inicio de «${inicio[1]}».`);
  for (const m of t.matchAll(/Diligenciado y confirmado: (.*?)(?= · |$)/g)) {
    const datos = m[1].split('; ').map(d => d.startsWith('Descripción de la Solicitud') ? 'la descripción de la solicitud con la narrativa de esta corrida' : d.replace('=', ': '));
    agregar(`Se diligenció y confirmó ${datos.join('; ')}.`);
  }
  const creado = t.match(/CaseNumber (\d+) y la UI muestra "Caso \d+"/);
  if (creado) agregar(`Al pulsar «Crear», Bizagi confirmó el caso ${creado[1]} y lo mostró en pantalla.`);
  const actividad = t.match(/Caso (\d+): Bizagi lista como actividad actual "([^"]+)"/);
  if (actividad) agregar(`Bizagi mostró «${actividad[2]}» como actividad actual del caso ${actividad[1]}. La lista de actividades actuales no demuestra por sí sola qué tareas se ejecutaron antes.`);
  const recorrido = t.match(/Caso (\d+), recorrido/);
  if (recorrido) agregar(/Evidencia completa .*coincide con lo esperado|Ruta positiva observada: coincide/.test(t)
    ? `Se contrastó el recorrido gráfico registrado del caso ${recorrido[1]} con el esperado y la comprobación coincidió.`
    : `Se registró el recorrido gráfico del caso ${recorrido[1]}; su alcance y cualquier limitación constan en el detalle técnico.`);
  if (/se reasignó al usuario de pruebas/.test(t)) agregar('Se reasignó la actividad al usuario de pruebas y se confirmó que seguía siendo la misma actividad.');
  else if (/ya está asignada al usuario de pruebas/.test(t)) agregar('La actividad ya estaba asignada al usuario de pruebas; no fue necesario reasignarla.');
  const abierto = t.match(/Caso (\d+) abierto por "([^"]+)" en "([^"]+)"/);
  if (abierto) agregar(`El usuario «${abierto[2]}» abrió «${abierto[3]}» del caso ${abierto[1]}.`);
  for (const m of t.matchAll(/solo_lectura: ([^·]+)/g)) agregar(`Se comprobó que estos campos no permiten edición: ${m[1].trim()}.`);
  for (const m of t.matchAll(/(?:^|[✔·]\s*)obligatorio: ([^·]+)/g)) agregar(`Se observó obligatoriedad en ${m[1].trim()}.`);
  for (const m of t.matchAll(/editable: ([^·]+)/g)) agregar(`Se comprobó que «${m[1].trim()}» permite edición.`);
  for (const m of t.matchAll(/"([^"]+)" (visible \(\d+\)|no visible \(encontrados \d+\))/g)) agregar(`«${m[1]}» ${m[2].startsWith('no') ? 'no se mostró' : 'se mostró'} en la vista comprobada.`);
  for (const m of t.matchAll(/"([^"]+)" = ([^·]*?) \(coincide\)/g)) agregar(`«${m[1]}» mostró «${m[2]}», como se esperaba.`);
  const ayuda = t.match(/línea de texto exacta “([^”]+)”/);
  if (ayuda) agregar(`Se mostró el texto de ayuda esperado: «${ayuda[1]}».`);
  const tabla = t.match(/"([^"]+)": (\d+) fila\(s\); columnas/);
  if (tabla) agregar(`La tabla «${tabla[1]}» mostró ${tabla[2]} filas.`);
  for (const m of t.matchAll(/([\p{L} ]+): (\d+) de (\d+) esperados extraídos/gu)) agregar(`Se encontraron ${m[2]} de los ${m[3]} valores esperados en «${m[1].trim()}».`);
  const edicion = t.match(/Pop-up de edición abierto para la fila (\d+) de "([^"]+)"/);
  if (edicion) agregar(`Se abrió el formulario de edición de la fila ${edicion[1]} de «${edicion[2]}».`);
  const adicion = t.match(/Pop-up de adición abierto en "([^"]+)" \((\d+) fila/);
  if (adicion) agregar(`Se abrió el formulario para agregar un registro a «${adicion[1]}», que tenía ${adicion[2]} filas.`);
  const tecleo = t.match(/"([^"]+)": se tecleó (.*?); el formulario muestra "([^"]*)"; coincide/);
  if (tecleo) agregar(`Tras introducir ${tecleo[2] ? `«${tecleo[2]}»` : 'un valor vacío'} en «${tecleo[1]}», se leyó ${tecleo[3] ? `«${tecleo[3]}»` : 'el campo vacío'}.`);
  if (/Pop-up confirmado/.test(t)) agregar('Se confirmó el formulario.');
  const fila = t.match(/fila verificada: (.*?)(?= · |$)/);
  if (fila) agregar(`Al leer la fila guardada se comprobó ${fila[1].replace(/=/g, ': ')}.`);
  if (/El pop-up permanece abierto/.test(t)) agregar('El formulario permaneció abierto al intentar confirmar. Este hecho no demuestra por sí solo la validación de todos sus campos.');
  const eliminado = t.match(/Fila (\d+) eliminada de "([^"]+)" \((\d+) → (\d+)\)/);
  if (eliminado) agregar(`Se eliminó la fila ${eliminado[1]} de «${eliminado[2]}» y la tabla pasó de ${eliminado[3]} a ${eliminado[4]} filas.`);
  for (const m of t.matchAll(/Pestaña "([^"]+)" activa con su panel visible/g)) agregar(`Se abrió «${m[1]}» y se comprobó que su panel era visible.`);
  if (/navegación por pestañas pendiente/.test(t)) {
    alcance = 'Solo se comprobó la presencia de las pestañas; su navegación y contenido quedaron pendientes.';
    revision = 'Abrir Documentos de la solicitud y Seguimiento/Trazabilidad y contrastar su contenido con lo exigido por el diseño.';
  }
  if (cp === 'HU06-CP02' && [14,22].includes(p.n)) { alcance=h.pendiente; revision=h.revision; }
  if (p.incidentes?.length) incidente='Se registró una dificultad adicional, separada del estado del paso. El incidente íntegro se conserva en el detalle técnico.';
  if (!frases.length) agregar('La observación archivada no permite resumir con precisión qué ocurrió en este paso. Debe revisarse el registro íntegro del detalle técnico antes de concluir.');
  if (manual && !revision) revision=p.causas?.includes('AUTOMATIZACION') ? 'La herramienta no completó la operación o la lectura. Revisar manualmente este campo o formulario y el punto de fallo del detalle técnico; no hay evidencia suficiente para atribuirlo al producto.'
    : p.estado === 'BLOCKED' ? 'Resolver el bloqueo registrado antes de intentar este paso; no se dispone de una comprobación funcional.'
    : 'El registro no aporta una decisión funcional más específica. QA debe revisar la observación íntegra y completar la comprobación pendiente.';
  const continuidad = h.continuidadEstado === 'terminacion_dificultad_recuperacion' ? h.continuidad
    : p.continuidad === 'detenido' ? 'No se acredita una continuación normal: hay acciones posteriores sin ejecutar o bloqueadas.'
    : h.continuidadEstado === 'continuacion_normal' ? 'Sí. Se registraron acciones posteriores. Esto no demuestra que todos los criterios estén cubiertos ni autoriza repetir una escritura.'
    : 'No se puede determinar con la evidencia disponible si se continuó después de este paso.';
  return { resultado: frases.join(' '), estado: p.estado === 'FAIL' ? `${p.estado} — ${h.categoria.toLowerCase()}, pendiente de confirmación.` : p.estado,
    hallazgo: manual ? (alcance || h.categoria) : '', alcance, revision, incidente, continuidad };
}
