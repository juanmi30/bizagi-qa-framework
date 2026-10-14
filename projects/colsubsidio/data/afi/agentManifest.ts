import { publicarContratoE2E } from './e2e/contrato';
import { actorDesdeEntorno, VARIABLES_ACTOR } from './actores';
import { CAPACIDADES_PREPARACION, capacidad, evaluarCapacidad, type CapacidadCampo } from './capacidadesPreparacion';
import { PERFILES_CASO_AFI, VERSION_CASO_AFI, validarDefinicionCasoAfi } from './caso';
import { CONTEXTOS_AFI, CONTEXTOS_EJECUCION_AFI, type ContextoEjecucionAfi } from './contextos';
import { REGISTRO_CAMPOS_FUNCIONALES, camposConCapacidad as camposDelRegistroCon, camposDelRegistro, type RegistroCampos } from './aplicacion/campos';
import { MODELO_APLICACION_AFI, entidadesDelModelo, publicarModelo, type ModeloAplicacion } from './aplicacion/modeloAplicacion';
import { resolverCondicion, testabilidadCanonica, type TestabilidadCompilacion } from './aplicacion/resolucionObservacion';
import { publicarContratoIntake } from './aplicacion/propuestas';
import { publicarContratoDatosPrueba, type RegistroDatosPrueba } from './datosPrueba/registro';
import { publicarEnvelopeIntake } from './intakeAgente';
import {
  DESCRIPCION_ENTIDAD, EXPECTATIVAS_POR_ENTIDAD, PROVEEDORES_PRODUCTIVOS, TIPOS_ENTIDAD, publicarSuperficies, superficiesDeEntidad,
  type Expectativa, type TipoExpectativa,
} from './aplicacion/superficies';
import {
  CAPACIDAD_REQUERIDA, CAMPOS_CONTACTO_FUNCIONAL, CLAVES_CONDICION, CLAVES_ENTIDAD_CONDICION, CLAVES_PASO, IGUAL_POR_EXPECTATIVA, COMPARACIONES_VALOR, COMPONENTES_FUNCIONALES_AFI, CONTRATO, ESTADOS_CAMPO, FUENTES_AUTORITATIVAS_AFI, NORMALIZACIONES,
  COINCIDENCIAS_BUSQUEDA, DIACRITICOS_BUSQUEDA, MAYUSCULAS_BUSQUEDA, REGIONES_COMPONENTE, REGLAS_REGION, RELACIONES_FUENTE, RELACIONES_POSICION,
  normalizarTextoCatalogo,
  type ComponenteFuncionalAfi, type FuenteAutoritativaAfi, type TipoOperacionFuncional,
} from './funcional';
import { CAMPOS_AFI, ETAPAS_AFI, ResolucionCampo, type CampoAfi, type EstrategiaAuxiliar, type EtapaAfi, type PerfilActorAfi } from './modelo';
import { PERFILES_AFI } from './perfiles';
import { POLITICAS_AFI } from './politicas';

/**
 * Manifest canónico de capabilities AFI para consumidores IA (Fase 4B).
 * Todo lo enumerable se DERIVA de las fuentes reales (ETAPAS_AFI, CAMPOS_AFI, POLITICAS_AFI,
 * CAPACIDADES_PREPARACION, CONTRATO funcional, CAMPOS_CONTACTO_FUNCIONAL, PERFILES_CASO_AFI).
 * Lo único escrito a mano es SEMÁNTICA, y va en Records tipados por la unión de origen:
 * si cambia la unión, TypeScript obliga a actualizarla.
 *
 * Enseña capabilities, no respuestas: sin casos concretos, valores de actores, PII ni selectores.
 * AFI-AGENT-MANIFEST.json se regenera con ACTUALIZAR_AGENT_MANIFEST=1 (tests/afi-agent-manifest.unit.spec.ts).
 */

export const VERSION_AGENT_MANIFEST = 'afi-agent-manifest/v1';

/**
 * Espejo de ETAPAS_RUNNER_V1 (helpers/afiCaseRunner.ts). No se importa porque el runner arrastra
 * Playwright y esta capa es pura; un unit test exige que sean idénticos.
 */
export const ETAPAS_RUNNER_V1_MANIFEST = ['inicio-solicitud', 'informacion-empresa', 'telefonos', 'informacion-adicional'] as const satisfies readonly EtapaAfi[];

/** Etapa donde el runner entrega el control al plan funcional: la de los campos funcionales. */
function puntoFuncional(registro: RegistroCampos = REGISTRO_CAMPOS_FUNCIONALES): EtapaAfi {
  const etapas = [...new Set(camposDelRegistro(registro).map(c => c.pantalla))];
  if (etapas.length !== 1) throw new Error(`Los campos funcionales deben pertenecer a una sola etapa; hay ${etapas.join(', ')}`);
  return etapas[0];
}

// ---------- Preparación ----------

type Admision = CapacidadCampo['admite'][number];

/** Cómo se expresa cada forma de resolución que un control admite. */
const FORMAS_RESOLUCION: Record<Admision, { forma: string; significado: string }> = {
  'valor-texto': {
    forma: 'valor-concreto',
    significado: 'Texto literal. Lo aporta el actor del perfil, una derivación del framework o, SOLO si el campo es public, datosCaso.',
  },
  'texto-deterministico': {
    forma: 'estrategia-deterministic',
    significado: '{ "estrategia": { "tipo": "deterministic-text" | "deterministic-number", "valor", "motivo" } }. Prohibida en campos no public.',
  },
  'valor-booleano': { forma: 'valor-booleano', significado: 'true / false literal.' },
  'booleano-requerido': {
    forma: 'estrategia-boolean-required',
    significado: '{ "estrategia": { "tipo": "boolean-required", "valor": true, "motivo" } }.',
  },
  'primera-sugerencia': {
    forma: 'estrategia-first-valid-autocomplete',
    significado: '{ "estrategia": { "tipo": "first-valid-autocomplete" } }: en un autocomplete VACÍO, primera sugerencia visible y habilitada '
      + 'en el orden del catálogo; si ya trae valor no se toca. Sin opción válida => falla.',
  },
  'primera-opcion': {
    forma: 'estrategia-first-valid-option',
    significado: '{ "estrategia": { "tipo": "first-valid-option", "orden": "catalogo" | "alfabetico" } }: primera opción habilitada.',
  },
  'opcion-generada': {
    forma: 'politica-generable',
    significado: 'Solo por política (autorización generable del perfil, AFI-TEST-DATA §7.3): opción determinista del catálogo observado. El caso nunca la declara.',
  },
};

/** Estrategias que el contrato admite en datosCaso. */
const ESTRATEGIAS_CASO: Record<Exclude<EstrategiaAuxiliar['tipo'], 'generated-option'>, { significado: string; muestra: (cap: CapacidadCampo) => EstrategiaAuxiliar }> = {
  'first-valid-option': {
    significado: 'Delegar en "cualquier opción válida" del catálogo; el framework elige la primera habilitada (orden catalogo o alfabetico).',
    muestra: () => ({ tipo: 'first-valid-option', orden: 'catalogo' }),
  },
  'first-valid-autocomplete': {
    significado: 'Primera sugerencia válida de un autocompletar. El contrato la acepta, pero solo sirve donde materializablePorCampos la lista.',
    muestra: () => ({ tipo: 'first-valid-autocomplete' }),
  },
  'deterministic-text': {
    significado: 'Texto literal fijo con motivo. Nunca en campos no public.',
    muestra: cap => ({ tipo: 'deterministic-text', valor: cap.opciones?.[0] ?? 'x', motivo: 'muestra' }),
  },
  'deterministic-number': {
    significado: 'Número literal fijo (solo dígitos) con motivo. Nunca en campos no public.',
    muestra: () => ({ tipo: 'deterministic-number', valor: '1', motivo: 'muestra' }),
  },
  'boolean-required': {
    significado: 'Casilla que debe marcarse (valor true) con motivo.',
    muestra: () => ({ tipo: 'boolean-required', valor: true, motivo: 'muestra' }),
  },
};

/** ¿AfiDataUi materializaría esta estrategia en este campo? Usa evaluarCapacidad (misma fuente que el compilador). */
function materializable(etapa: EtapaAfi, campo: CampoAfi, estrategia: EstrategiaAuxiliar): boolean {
  const r = new ResolucionCampo(campo, 'auxiliary', POLITICAS_AFI[campo].sensibilidad, false, undefined, estrategia);
  return !('problema' in evaluarCapacidad(etapa, r));
}

/** ¿El contrato admite esta estrategia en datosCaso para este campo? Usa el validador real. */
function admitidaEnDatosCaso(etapa: EtapaAfi, campo: CampoAfi, estrategia: EstrategiaAuxiliar): boolean {
  const def = {
    version: VERSION_CASO_AFI, hu: 'sonda', caso: 'sonda', nombre: 'sonda', perfil: PERFILES_CASO_AFI[0],
    preparacion: { datosCaso: { [campo]: { estrategia } }, camposAsercion: [], etapas: [etapa] },
    funcional: { caso: 'sonda', pasos: [{ id: 'sonda', esperado: 'sonda', operaciones: [{ tipo: 'catalogo-no-vacio', campo: CAMPOS_CONTACTO_FUNCIONAL[0] }] }] },
  };
  return !validarDefinicionCasoAfi(def).some(p => p.ruta.startsWith(`preparacion.datosCaso.${campo}`));
}

const camposConCapacidad = () => (Object.entries(CAPACIDADES_PREPARACION) as [EtapaAfi, Record<string, CapacidadCampo>][])
  .flatMap(([etapa, tabla]) => Object.entries(tabla).map(([campo, cap]) => ({ etapa, campo: campo as CampoAfi, cap })));

// ---------- Viabilidad de preparación por perfil (4E.1) ----------

/** 'segun-estado' (4S-R.1): sin fuente del framework, pero solo se exige si la pantalla lo presenta habilitado y vacío/inválido
 * (entonces: dato del actor provisionado en su slot o DataGap EN PANTALLA). No bloquea la etapa. */
type ViaPreparacion = 'actor' | 'derivacion' | 'auxiliar' | 'segun-estado';

/**
 * ¿Cómo puede el FRAMEWORK (sin datosCaso) materializar este campo para este perfil? Derivado de POLITICAS_AFI,
 * del mapeo del actor (actores.ts) y de evaluarCapacidad (la misma regla que aplica el compilador).
 * Es viabilidad de CAPABILITY: que el actor tenga el dato en el entorno se verifica al compilar (DataGap).
 */
function viasCampo(perfil: PerfilActorAfi, etapa: EtapaAfi, campo: CampoAfi): { vias: ViaPreparacion[]; bloqueo?: string } {
  const p = POLITICAS_AFI[campo];
  const cap = capacidad(etapa, campo);
  if (!cap) return { vias: [], bloqueo: 'sin capability de preparación en esta etapa' };
  const muestra = cap.control === 'checkbox' ? true : cap.opciones?.[0] ?? 'x';
  const concreto = (origen: 'actor' | 'derived') => !('problema' in evaluarCapacidad(etapa, new ResolucionCampo(campo, origen, p.sensibilidad, false, muestra)));
  const actorLoProvee = campo in VARIABLES_ACTOR[perfil] || campo in actorDesdeEntorno(perfil, {}).datos;
  const vias: ViaPreparacion[] = [];
  if (p.delActor && actorLoProvee && concreto('actor')) vias.push('actor');
  if (p.derivacion && concreto('derived')) vias.push('derivacion');
  if (p.auxiliar && materializable(etapa, campo, p.auxiliar)) vias.push('auxiliar');
  if (p.segunEstado && !vias.length && p.delActor && concreto('actor')) vias.push('segun-estado');
  return vias.length ? { vias } : { vias, bloqueo: 'ni actor, ni derivación, ni estrategia auxiliar materializable: solo con un valor explícito del caso' };
}

export function viabilidadPorPerfil(runner: readonly EtapaAfi[]) {
  return PERFILES_CASO_AFI.map(perfil => ({
    perfil,
    etapas: runner.map(etapa => {
      const campos = CAMPOS_AFI.filter(c => POLITICAS_AFI[c].etapa === etapa && (POLITICAS_AFI[c].perfiles?.includes(perfil) ?? true))
        .map(campo => ({ campo, ...viasCampo(perfil, etapa, campo) }));
      const bloqueos = campos.filter(c => c.bloqueo).map(c => ({ campo: c.campo, motivo: c.bloqueo! }));
      return {
        etapa,
        estado: !campos.length ? 'no-requerida' as const : bloqueos.length ? 'bloqueada' as const : 'soportada' as const,
        campos: campos.map(({ campo, vias }) => ({ campo, vias })),
        ...(bloqueos.length ? { bloqueos } : {}),
      };
    }),
  }));
}

// ---------- Etapas ----------

const NOTAS_ETAPA: Record<EtapaAfi, string> = {
  'inicio-solicitud': 'Obligatoria en runner v1: única forma demostrada de crear el caso Bizagi.',
  'informacion-empresa': 'Preparación SEGÚN ESTADO (4S-R.1), solo Empleador Persona Jurídica (botón btn-empleador-pj-continuar). '
    + 'Ausente o deshabilitado: no se toca; precarga válida: se conserva; habilitado y vacío/inválido: dato legítimo del caso/actor '
    + '(o auxiliar si la política lo permite) o DataGap EN PANTALLA. Sus gaps de datos no bloquean la compilación.',
  telefonos: 'Preparación del runner v1. Si el perfil no tiene campos aplicables queda "no-requerida" (no falla).',
  'informacion-adicional': 'Preparación del runner v1. Si el perfil no tiene campos aplicables queda "no-requerida" (no falla).',
  'informacion-contacto': 'Existe en el MODELO, pero el runner v1 NO la ejecuta como preparación: es el punto donde comienza el plan funcional. '
    + 'NO declararla en preparacion.etapas (sus campos no tienen capability de preparación: falla al compilar). '
    + 'Sus campos solo se leen/manipulan con operaciones funcionales.',
  direccion: 'Existe en el MODELO, pero el runner v1 NO la orquesta y no hay operaciones funcionales sobre ella. '
    + 'Un diseño que requiera llegar o actuar en Dirección es CAPABILITY_GAP.',
};

// ---------- Funcional ----------

interface SemanticaOperacion {
  /** Descripción de cada parámetro; sus claves deben coincidir con CONTRATO (lo verifica un test). */
  parametros: Record<string, { tipo: string; valores?: readonly string[]; descripcion: string }>;
  alcance: string;
  semantica: string;
  garantiza: readonly string[];
  noGarantiza: readonly string[];
  observado: readonly string[];
}

const EVIDENCIA = { tipo: 'string', descripcion: 'Nombre de la captura de evidencia (opcional, sin espacios ni PII).' };
const CAMPO = { tipo: 'CampoContactoFuncional', descripcion: 'Campo de catálogo sobre el que actúa; ver camposAplicables.' };
const COMPONENTE = { tipo: 'ComponenteFuncional', descripcion: 'Componente visual con nombre; ver funcional.componentes. Nunca un selector.' };

const SEMANTICA_OPERACIONES: Record<TipoOperacionFuncional, SemanticaOperacion> = {
  'texto-ausente': {
    parametros: {
      texto: { tipo: 'string', descripcion: 'Texto literal cuya presencia visible se descarta.' },
      coincidencia: {
        tipo: 'enum', valores: ['exacta', 'contiene'],
        descripcion: 'exacta: un elemento cuyo texto completo es igual (espacios normalizados). contiene: subcadena sin distinguir mayúsculas.',
      },
      evidencia: EVIDENCIA,
    },
    alcance: 'Página completa, en el momento en que se ejecuta el paso.',
    semantica: 'PASS si ningún elemento visible de la página coincide con el texto configurado (espera hasta el timeout de assertion a que desaparezca).',
    garantiza: ['Que el texto configurado no está visible según la coincidencia elegida, en ese momento.'],
    noGarantiza: [
      'Ausencia de un componente visual (alerta, banner, ícono, color) si su texto cambia o no se conoce.',
      'Ausencia de otra alerta o mensaje con texto diferente.',
      'Que el texto no aparezca después (tras otra acción del plan o del usuario).',
      'Nada sobre catálogos, campos o su estado.',
    ],
    observado: ['coincidencia', 'visibles'],
  },
  'catalogo-opcion-fuera-de': {
    parametros: {
      campo: CAMPO,
      excluir: { tipo: 'string[]', descripcion: 'Conjunto no vacío de opciones a excluir; se comparan tras la normalización.' },
      normalizacion: { tipo: 'enum', valores: ['texto-es'], descripcion: 'Ver normalizaciones.' },
      evidencia: EVIDENCIA,
    },
    alcance: 'Catálogo desplegado del campo (se abre y se espera a que sus opciones se estabilicen).',
    semantica: 'PASS si existe AL MENOS UNA opción cuyo texto normalizado no pertenece al conjunto excluir normalizado.',
    garantiza: ['Existe al menos una opción fuera del conjunto excluir tras normalización.'],
    noGarantiza: [
      'Que el catálogo sea completo (p. ej. nacional) ni que contenga una opción concreta.',
      'Una cantidad concreta de opciones.',
      'Pertenencia de las opciones a una paramétrica específica.',
      'Que las opciones excluidas estén o no presentes.',
    ],
    observado: ['cantidadOpciones', 'cantidadFuera', 'condicionCumplida'],
  },
  'catalogo-no-vacio': {
    parametros: { campo: CAMPO, evidencia: EVIDENCIA },
    alcance: 'Catálogo desplegado del campo.',
    semantica: 'PASS si el catálogo tiene al menos una opción.',
    garantiza: ['Existe al menos una opción.'],
    noGarantiza: [
      'Contenido correcto de las opciones.',
      'Ausencia de restricciones o filtros de negocio.',
      'Pertenencia de las opciones a un departamento o paramétrica.',
      'Que el campo sea editable o se comporte "normalmente".',
    ],
    observado: ['cantidadOpciones', 'condicionCumplida'],
  },
  'seleccionar-exacto': {
    parametros: {
      campo: CAMPO,
      valor: { tipo: 'string', descripcion: 'Texto de la opción. Sin normalizacion: literal (mayúsculas, tildes y puntuación cuentan).' },
      normalizacion: {
        tipo: 'enum', valores: [...NORMALIZACIONES],
        descripcion: 'Opcional. Si se indica, compara valor y opciones normalizados y elige la opción OBSERVADA que coincide. '
          + 'Úsala cuando el literal del diseño identifica la opción sin certificar su escritura (composicion: identidad-vs-literal).',
      },
    },
    alcance: 'Catálogo desplegado del campo; ACCIÓN que modifica el formulario.',
    semantica: 'Sin normalizacion: PASS si existe exactamente UNA opción con ese texto literal; entonces la selecciona. '
      + 'Con normalizacion: PASS si exactamente UNA opción coincide tras normalizar; se selecciona esa opción tal como la muestra la UI. '
      + '0 o >1 coincidencias: FAIL sin seleccionar.',
    garantiza: [
      'Existe exactamente una opción coincidente (literal, o normalizada si se indicó) y queda seleccionada en el campo.',
      'Con normalizacion, la observación registra el valor pedido y el valor realmente seleccionado.',
    ],
    noGarantiza: [
      'Efectos posteriores de la selección (campos dependientes, precargas, bloqueos).',
      'Ninguna assertion sobre el resto del catálogo.',
      'Con normalizacion, que la opción tenga la misma escritura que el diseño.',
    ],
    observado: ['coincidenciasExactas', 'coincidenciasNormalizadas', 'valorSeleccionado'],
  },
  'cerrar-catalogo': {
    parametros: { campo: CAMPO },
    alcance: 'Catálogo del campo, que debe estar abierto por una operación anterior.',
    semantica: 'Cierra el catálogo abierto sin seleccionar. FAIL si no estaba abierto o si no se cierra.',
    garantiza: ['Se cierra el catálogo abierto.'],
    noGarantiza: ['Valor del campo tras cerrar.', 'Ninguna assertion sobre las opciones.'],
    observado: ['catalogoAbierto', 'cerrado'],
  },
  'componente-visible': {
    parametros: { componente: COMPONENTE, evidencia: EVIDENCIA },
    alcance: 'Pantalla actual, en el momento del paso (espera hasta el timeout de assertion a que aparezca).',
    semantica: 'PASS si el componente nombrado está visible y es único.',
    garantiza: ['El componente identificado por el framework está visible en ese momento.'],
    noGarantiza: [
      'Su texto completo (el framework lo identifica, no certifica su contenido).',
      'Color, ícono, estilo o legibilidad.',
      'Su ubicación respecto de otros elementos.',
      'Que siga visible después.',
    ],
    observado: ['componente', 'visible', 'coincidencias'],
  },
  'componente-posicion': {
    parametros: {
      componente: COMPONENTE,
      relacion: { tipo: 'enum', valores: [...RELACIONES_POSICION], descripcion: 'Posición vertical del componente respecto de la referencia.' },
      referencia: { tipo: 'ComponenteFuncional', descripcion: 'Otro componente de funcional.componentes.' },
      evidencia: EVIDENCIA,
    },
    alcance: 'Pantalla actual, en el momento del paso; ambos componentes deben estar visibles.',
    semantica: 'debajo-de: el borde superior del componente está en o bajo el borde inferior de la referencia. encima-de: a la inversa.',
    garantiza: ['Ambos componentes visibles y la relación vertical declarada entre ellos.'],
    noGarantiza: [
      'Que sean contiguos ni la distancia entre ellos.',
      'Alineación horizontal.',
      'Ubicación absoluta en la pantalla ("parte superior"): usar componente-region.',
      'Contenido o estilo de los componentes.',
    ],
    observado: ['visibles', 'separacion'],
  },
  'componente-region': {
    parametros: {
      componente: COMPONENTE,
      region: { tipo: 'enum', valores: [...REGIONES_COMPONENTE], descripcion: 'Región canónica de la pantalla; su regla la define el framework (ver regla).' },
      evidencia: EVIDENCIA,
    },
    alcance: 'Pantalla actual, contra el viewport real del contexto de ejecución (nunca declarado en el JSON).',
    semantica: `PASS si el componente está visible, es único y cumple la regla de la región. superior: ${REGLAS_REGION.superior.descripcion}`,
    garantiza: ['Que el componente visible se encuentra en la región canónica declarada de la pantalla.'],
    noGarantiza: [
      'Posición exacta.',
      'Relación con otro componente (usar componente-posicion).',
      'Texto, color o ícono del componente.',
      'Adaptación a otros tamaños de pantalla o contextos.',
      'Que la posición persista tras cambios posteriores del layout.',
    ],
    observado: ['componente', 'regionEsperada', 'regla', 'visible', 'viewportAncho', 'viewportAlto', 'centroY', 'limiteY', 'condicionCumplida', 'motivo'],
  },
  'campo-estado': {
    parametros: {
      campo: CAMPO,
      estado: { tipo: 'enum', valores: [...ESTADOS_CAMPO], descripcion: 'editable: el usuario puede editar/interactuar. solo-lectura: visible pero bloqueado para edición.' },
      evidencia: EVIDENCIA,
    },
    alcance: 'Campo en la pantalla actual; espera a que el estado se estabilice.',
    semantica: 'PASS si el campo está visible y en el estado funcional declarado. Cómo se demuestra lo decide el framework según el control.',
    garantiza: ['Que el campo es editable por el usuario, o que está bloqueado para edición, en ese momento.'],
    noGarantiza: ['Valor del campo.', 'Contenido del catálogo.', 'Causa del cambio de estado.', 'Que el servidor rechace un valor.'],
    observado: ['estadoEsperado', 'visible', 'editable'],
  },
  'campo-valor': {
    parametros: {
      campo: CAMPO,
      valor: { tipo: 'string', descripcion: 'Valor esperado (dato público de catálogo). Excluyente con vacio; exige comparacion.' },
      comparacion: {
        tipo: 'enum', valores: [...COMPARACIONES_VALOR],
        descripcion: 'exacta: igual con espacios normalizados (solo si el requisito certifica la escritura). '
          + 'texto-es: igual tras la normalización texto-es (valor que identifica una opción de negocio; composicion: identidad-vs-literal).',
      },
      vacio: { tipo: 'true', descripcion: 'Exige campo vacío. Excluyente con valor y comparacion.' },
      evidencia: EVIDENCIA,
    },
    alcance: 'Valor MOSTRADO por el campo; espera hasta el timeout de assertion a que se estabilice en el esperado.',
    semantica: 'Dos formas excluyentes: { valor, comparacion } o { vacio: true }. PASS si el valor mostrado cumple.',
    garantiza: ['El valor visible del campo en ese momento.'],
    noGarantiza: [
      'Persistencia en backend.',
      'Causa del valor (precarga, selección previa...).',
      'Estado editable o de solo lectura.',
      'Que el valor no haya sido distinto antes: espera a que se estabilice, así que no demuestra que una entrada nunca se mostró (usar entrada-rechazada).',
    ],
    observado: ['comparacion', 'valorObservado'],
  },
  escribir: {
    parametros: {
      campo: CAMPO,
      texto: { tipo: 'string', descripcion: 'Texto que el usuario teclea (dato público de prueba).' },
    },
    alcance: 'ACCIÓN sobre el campo: lo enfoca, borra su contenido con el teclado y teclea carácter a carácter.',
    semantica: 'Interacción de teclado realista (pasa por los filtros de teclado de la UI). No contiene ninguna assertion.',
    garantiza: ['Se intentó introducir ese texto en el campo.'],
    noGarantiza: ['Que el campo lo aceptara.', 'Filtrado o sugerencias del catálogo.', 'El valor final del campo.'],
    observado: ['caracteres', 'escrito'],
  },
  'entrada-rechazada': {
    parametros: {
      campo: CAMPO,
      texto: { tipo: 'string', descripcion: 'Caracteres que el campo debe rechazar (dato público de prueba).' },
      evidencia: EVIDENCIA,
    },
    alcance: 'Campo editable; ACCIÓN + assertion: teclea carácter a carácter y observa el valor tras cada uno y durante una ventana breve.',
    semantica: 'PASS si el campo es editable y ninguno de los caracteres cambia el valor mostrado, ni al teclearlo ni poco después. '
      + 'Un campo no editable es FAIL (no prueba un filtro de entrada).',
    garantiza: ['Ninguno de los caracteres tecleados se plasmó en el campo durante la observación.'],
    noGarantiza: [
      'El tipo de teclado virtual o sus teclas disponibles.',
      'Contenido pegado o dictado.',
      'Validación del servidor.',
      'El motivo del rechazo.',
    ],
    observado: ['caracteres', 'aceptados', 'cambiosTardios', 'valorSinCambios', 'editable'],
  },
  'salir-del-campo': {
    parametros: { campo: CAMPO },
    alcance: 'ACCIÓN: el campo pierde el foco por una interacción del usuario en una zona neutra de la pantalla.',
    semantica: 'PASS si el campo pierde el foco sin navegar. FAIL sin interactuar si la zona neutra está tapada (p. ej. por las opciones).',
    garantiza: ['El campo perdió el foco sin navegar, guardar ni elegir una opción.'],
    noGarantiza: ['Qué hace la UI con el contenido al perder el foco (verificarlo con campo-valor).'],
    observado: ['neutroLibre', 'sinFoco', 'sinNavegar'],
  },
  'catalogo-segun-fuente': {
    parametros: {
      campo: CAMPO,
      fuente: { tipo: 'FuenteAutoritativa', descripcion: 'Id de funcional.fuentes; debe describir el campo.' },
      filtroDesdeCampo: { tipo: 'CampoContactoFuncional', descripcion: 'Campo cuyo valor ACTUAL filtra la fuente (no es un selector); debe estar en los filtros de la fuente.' },
      relacion: { tipo: 'enum', valores: [...RELACIONES_FUENTE], descripcion: 'igual: el conjunto observado es exactamente el esperado por la fuente.' },
      normalizacion: { tipo: 'enum', valores: [...NORMALIZACIONES], descripcion: 'Ver normalizaciones; aplica al filtro y a la comparación.' },
      evidencia: EVIDENCIA,
    },
    alcance: 'Catálogo desplegado del campo frente a la fuente autoritativa, filtrada por el valor actual del campo filtro.',
    semantica: 'PASS si el conjunto de opciones (normalizado, con duplicados) es igual al esperado. '
      + 'La fuente falla cerrada: incompleta, vacía, ilegible, ambigua o sin relación para el filtro => FAIL con motivo.',
    garantiza: [
      'Conjunto observado = conjunto que la fuente declara para el filtro actual.',
      'La UI representa el catálogo recibido de la fuente según la relación declarada.',
    ],
    noGarantiza: [
      'Que la fuente esté bien configurada frente a una referencia externa independiente.',
      'Orden de las opciones.',
      'Información que la fuente no entregó.',
      'Qué pasa al escribir en el campo (filtrado predictivo).',
    ],
    observado: ['fuente', 'filtro', 'completa', 'cantidadEsperada', 'cantidadObservada', 'faltantes', 'sobrantes', 'motivo', 'lecturasGetRespaldo'],
  },
  'sugerencias-segun-fuente': semanticaSugerencias(),
};

/** Declaración de función (elevada): el Record de arriba la referencia. */
function semanticaSugerencias(): SemanticaOperacion {
  return {
  parametros: {
    campo: CAMPO,
    fuente: { tipo: 'FuenteAutoritativa', descripcion: 'Id de funcional.fuentes; debe describir el campo.' },
    filtroDesdeCampo: { tipo: 'CampoContactoFuncional', descripcion: 'Campo cuyo valor ACTUAL filtra la fuente (no es un selector).' },
    normalizacion: { tipo: 'enum', valores: [...NORMALIZACIONES], descripcion: 'Solo para decidir si una sugerencia PERTENECE a la fuente; no se usa en la búsqueda.' },
    textoBusqueda: { tipo: 'string', descripcion: 'Texto parcial ya escrito en el campo (con escribir), tal como lo declara el diseño.' },
    coincidencia: { tipo: 'enum', valores: [...COINCIDENCIAS_BUSQUEDA], descripcion: 'contiene: la sugerencia contiene el texto como subcadena.' },
    diacriticos: {
      tipo: 'enum', valores: [...DIACRITICOS_BUSQUEDA],
      descripcion: 'sensibles: las tildes cuentan (una letra con tilde no coincide con la misma letra sin tilde).',
    },
    mayusculas: {
      tipo: 'enum', valores: [...MAYUSCULAS_BUSQUEDA],
      descripcion: 'Tratamiento de mayúsculas/minúsculas en la búsqueda. Sin valor por defecto: debe declararlo el diseño o el '
        + 'requerimiento. Si ninguno lo define y el resultado depende de ello, el requisito es INFORMACION_INSUFICIENTE (no elegir).',
    },
    evidencia: EVIDENCIA,
  },
  alcance: 'Sugerencias del panel YA abierto tras escribir, sin interactuar con el control; frente a la fuente filtrada por el valor actual del campo filtro.',
  semantica: 'PASS si el campo muestra exactamente textoBusqueda, hay al menos una sugerencia visible, todas pertenecen al conjunto '
    + 'que la fuente declara para el filtro actual y todas cumplen la regla de búsqueda. Comparación en Unicode NFC (misma letra '
    + 'con tilde en distinta codificación es igual; nunca se quitan tildes). No escribe, no hace clic, no selecciona ni cierra el panel.',
  garantiza: [
    'Existe al menos una sugerencia visible.',
    'Cada sugerencia visible pertenece al conjunto válido de la fuente bajo el filtro actual.',
    'Cada sugerencia visible cumple la coincidencia declarada respecto del texto de búsqueda, con el tratamiento de diacríticos y mayúsculas declarado.',
  ],
  noGarantiza: [
    'Que se muestren TODAS las coincidencias posibles (la UI puede limitar las sugerencias).',
    'Orden de las sugerencias.',
    'Comportamiento con otros textos de búsqueda.',
    'Una regla general de mayúsculas/minúsculas más allá del texto probado.',
    'Búsqueda aproximada, fonética o por raíz.',
    'Que la fuente esté bien configurada frente a una referencia externa independiente.',
    'Selección de una sugerencia, persistencia del valor o reapertura posterior del catálogo.',
  ],
  observado: ['fuente', 'filtro', 'textoBusqueda', 'coincidencia', 'diacriticos', 'mayusculas', 'fuenteCompleta',
    'cantidadSugerencias', 'fueraDeFuente', 'noCumplenBusqueda', 'motivo'],
  };
}

const DESCRIPCION_COMPONENTES: Record<ComponenteFuncionalAfi, string> = {
  'alerta-territorial': 'Alerta de cobertura territorial de la pantalla de información de contacto.',
  'subtitulo-localizacion-vivienda': 'Subtítulo de la sección de localización de la vivienda en información de contacto.',
};

const SEMANTICA_FUENTES: Record<FuenteAutoritativaAfi, { descripcion: string; certifica: string; noCertifica: readonly string[] }> = {
  'parametrica-ciudad-nacional': {
    descripcion: 'Paramétrica de municipios (Ciudad nacional) con su relación municipio -> departamento y estado activo, '
      + 'tal como la recibe la UI. El departamento se resuelve en la propia fuente a partir del valor actual del campo filtro.',
    certifica: 'La UI representa el catálogo recibido de la paramétrica según la relación declarada (solo registros activos).',
    noCertifica: [
      'Que la paramétrica esté conceptualmente bien configurada respecto de una fuente externa independiente.',
      'Municipios que la fuente no entregó.',
    ],
  },
};

// ---------- Contexto de ejecución (Fase 4C) ----------

const SELECCION_CONTEXTO: Record<ContextoEjecucionAfi, string> = {
  desktop: 'Único contexto del harness y del runner v1; se aplica siempre, sin que el JSON lo declare.',
  mobile: 'No seleccionable por contrato: el runner v1 no lo ejecuta. Una variante mobile es CAPABILITY_GAP (familia contexto-ejecucion).',
};

// ---------- Backlog (NO soportado; Fase 4C) ----------

/**
 * Familias canónicas de capabilities faltantes. Detalle en AFI-CAPABILITY-BACKLOG.md (un test exige cada id allí);
 * ese documento NO es material del agente (contiene el análisis del benchmark), por eso el manifest no lo referencia.
 */
interface FamiliaBacklog {
  familia: string;
  intencion: string;
  /** parcial: parte de la familia ya existe como operaciones soportadas; el resto sigue siendo CAPABILITY_GAP. */
  cobertura: 'ninguna' | 'parcial';
  operacionesSoportadas: readonly TipoOperacionFuncional[];
  pendiente?: string;
}

export const FAMILIAS_BACKLOG: readonly FamiliaBacklog[] = [
  {
    familia: 'componente-visual', intencion: 'Presencia, texto, ubicación relativa y legibilidad de un componente visual con nombre.',
    cobertura: 'parcial', operacionesSoportadas: ['componente-visible', 'componente-posicion', 'componente-region'],
    pendiente: 'Ausencia de un componente, certificar su texto, color e ícono, legibilidad, adaptación responsive, '
      + 'regiones distintas de "superior", componentes no catalogados.',
  },
  {
    familia: 'catalogo-semantico', intencion: 'Conjunto exacto de opciones, o igualdad/subconjunto frente a una fuente autoritativa.',
    cobertura: 'parcial', operacionesSoportadas: ['catalogo-segun-fuente', 'seleccionar-exacto'],
    pendiente: 'Conjunto exacto enumerado por el diseño, relación subconjunto, "todas las opciones cumplen una regla", "incluye una opción", otras fuentes.',
  },
  {
    familia: 'entrada-validacion', intencion: 'Escribir, borrar y salir de un campo, observando rechazo o limpieza de la entrada.',
    cobertura: 'parcial', operacionesSoportadas: ['escribir', 'entrada-rechazada', 'salir-del-campo', 'campo-valor'],
    pendiente: 'Borrar un campo sin escribir, pegar o dictar contenido, mensajes de validación.',
  },
  {
    familia: 'autocomplete', intencion: 'Sugerencias filtradas por lo escrito, selección y restauración del catálogo completo al reabrir.',
    cobertura: 'parcial', operacionesSoportadas: ['escribir', 'sugerencias-segun-fuente', 'seleccionar-exacto', 'catalogo-segun-fuente', 'cerrar-catalogo'],
    pendiente: 'Sugerencias solo en campos descritos por una fuente autoritativa (hoy ciudad de vivienda), solo coincidencia "contiene" '
      + 'con diacríticos sensibles; faltan otras coincidencias (empieza por), diacríticos insensibles, completitud de las sugerencias, '
      + 'campos sin fuente (localidad, barrio) y comparar con un catálogo capturado antes.',
  },
  { familia: 'campos-adicionales', intencion: 'Campos funcionales hoy no nombrables (localidad, barrio...) y su presencia condicional.', cobertura: 'ninguna', operacionesSoportadas: [] },
  { familia: 'transicion', intencion: 'Avance permitido o bloqueado de la pantalla y validación mostrada al intentarlo.', cobertura: 'ninguna', operacionesSoportadas: [] },
  {
    familia: 'etapas-posteriores', intencion: 'Llegar y actuar en pantallas posteriores (dirección, documentación) y verificar el formulario final.',
    cobertura: 'ninguna', operacionesSoportadas: [],
  },
  {
    familia: 'orquestacion-plan', intencion: 'Pasos condicionales, valores elegidos en la corrida y reutilizados, y capturas para comparar después.',
    cobertura: 'ninguna', operacionesSoportadas: [],
  },
  { familia: 'contexto-ejecucion', intencion: 'Ejecutar una variante en un contexto distinto de desktop (mobile emulado).', cobertura: 'ninguna', operacionesSoportadas: [] },
];

/** Familias completamente cubiertas: salen del backlog (Fase 4D). */
export const FAMILIAS_SOPORTADAS = [
  { familia: 'estado-campo', intencion: 'Editable o de solo lectura de un campo funcional.', operaciones: ['campo-estado'] },
  {
    familia: 'valor-campo', intencion: 'Valor exacto o vacío de un campo, incluida una precarga tras otra acción del plan.',
    operaciones: ['campo-valor'],
  },
] as const satisfies readonly { familia: string; intencion: string; operaciones: readonly TipoOperacionFuncional[] }[];

// ---------- Fidelidad composicional (4F) ----------

/** Una secuencia de operaciones de un ejemplo: solo tipos del contrato (TypeScript lo exige). */
type Secuencia = readonly TipoOperacionFuncional[];

/**
 * Cómo COMPONER operaciones existentes para que un resultado esperado quede demostrado sin falsos positivos.
 * Genérico: sin casos, pasos ni valores de ninguna HU. Fuente canónica; las instrucciones solo la resumen.
 */
export const COMPOSICION = {
  analisis: {
    instruccion: 'Antes de dar por representado un resultado esperado compuesto, identifica sus partes y materializa solo las necesarias.',
    partes: ['estado inicial relevante', 'acción', 'estado intermedio relevante', 'evento disparador', 'estado final'],
  },
  reglas: [
    {
      id: 'transicion-demostrada',
      regla: 'Si el esperado describe una transición (estado A → acción o evento → estado B) y afirmar solo B podría pasar aunque A '
        + 'nunca hubiera ocurrido, afirma A ANTES de la acción o evento que produce B, siempre que una operación soportada lo permita. '
        + 'Si no existe operación para afirmar A, es CAPABILITY_GAP; no se omite A.',
    },
    {
      id: 'minimo-suficiente',
      regla: 'Materializa solo los estados que distinguen el comportamiento pedido de un falso positivo razonable. '
        + 'Si el esperado describe únicamente un estado final, sin transición que distinguir, no añadas assertions intermedias.',
    },
    {
      id: 'identidad-vs-literal',
      regla: 'Si el diseño usa un literal para IDENTIFICAR una opción o valor de negocio y no certifica su escritura exacta '
        + '(mayúsculas, tildes, puntuación), represéntalo con la normalización publicada que corresponda: normalizacion en '
        + 'seleccionar-exacto, comparacion "texto-es" en campo-valor. Que el diseño no afirme la escritura NO implica comparación literal. '
        + 'Usa comparación literal (sin normalizacion; comparacion "exacta") solo si el requisito certifica el texto exacto. '
        + 'Nunca asumas una normalización que el manifest no publique.',
    },
  ],
  ejemplos: [
    {
      regla: 'transicion-demostrada',
      requisito: '"el usuario escribe un valor no válido y, al salir del campo, el campo se limpia"',
      insuficiente: ['escribir', 'salir-del-campo', 'campo-valor'] as Secuencia,
      porque: 'el último campo-valor (vacío) pasaría también si el campo hubiera rechazado el texto desde el principio: nunca se probó que se limpiara.',
      suficiente: ['escribir', 'campo-valor', 'salir-del-campo', 'campo-valor'] as Secuencia,
      como: 'primer campo-valor: el texto escrito está presente; segundo campo-valor: vacío tras salir del campo.',
    },
    {
      regla: 'minimo-suficiente',
      requisito: '"tras elegir la opción A, el campo B muestra el valor V"',
      suficiente: ['seleccionar-exacto', 'campo-valor'] as Secuencia,
      como: 'solo se pide el estado final de B después de la acción: no hace falta afirmar el valor previo de B.',
    },
    {
      regla: 'identidad-vs-literal',
      requisito: '"seleccionar la opción Opción Uno del catálogo" (identifica la opción; no certifica cómo se escribe)',
      suficiente: ['seleccionar-exacto'] as Secuencia,
      como: 'con normalizacion; si luego se verifica el valor del campo, campo-valor con comparacion "texto-es".',
      contraste: '"el campo muestra exactamente OPCIÓN UNO, en mayúsculas y con tilde" certifica la escritura: comparación literal.',
    },
  ],
} as const;

// ---------- Fidelidad del diagnóstico (4I-A) ----------

/**
 * Cómo DIAGNOSTICAR un requisito antes de declarar CAPABILITY_GAP o INFORMACION_INSUFICIENTE.
 * Genérico: sin HU, casos, pasos, campos ni valores de ningún diseño. Fuente canónica; las instrucciones solo la resumen.
 */
export const DIAGNOSTICO = {
  ambiguedadAntesDeCapability: true,
  composicionAntesDeGap: true,
  backlogNoImplicaGap: true,
  /** Lo que debe poder especificarse ANTES de consultar funcional.operaciones, cuando determina PASS/FAIL. */
  condicionObservable: ['dato de entrada', 'condición', 'relación de coincidencia o comparación', 'evento', 'resultado observable'],
  /** Orden de búsqueda para una condición observable ya inequívoca. */
  busqueda: [
    'una operación individual que garantice la condición (garantiza/noGarantiza)',
    'una composición mínima de operaciones soportadas que la demuestre sin falsos positivos (ver composicion)',
    'solo si ninguna composición fiel existe: CAPABILITY_GAP',
  ],
  reglas: [
    {
      id: 'ambiguedad-antes-de-capability',
      regla: 'Antes de consultar el manifest, especifica para la condición: dato de entrada, condición, relación de coincidencia o '
        + 'comparación, evento y resultado observable. Si alguno es necesario para decidir PASS/FAIL y ninguna fuente lo define: '
        + 'INFORMACION_INSUFICIENTE, y se detiene el análisis de capabilities de ESA condición.',
    },
    {
      id: 'composicion-antes-de-gap',
      regla: 'Para cada condición observable inequívoca busca primero una operación individual que la garantice; si no existe, una '
        + 'composición mínima de operaciones soportadas. Un comportamiento que emerge de una composición fiel es REPRESENTABLE: '
        + 'no se describe como capability faltante. Solo si ninguna composición fiel existe: CAPABILITY_GAP.',
    },
    {
      id: 'backlog-no-implica-gap',
      regla: 'Que una familia relacionada figure en backlog NO es evidencia de un gap: el backlog describe cobertura global incompleta, '
        + 'no el requisito concreto. Un gap exige demostrar que ninguna operación ni composición soportada representa la condición.',
    },
    {
      id: 'gap-minimo-de-campo',
      regla: 'Si la operación genérica existe pero el campo concreto no está en funcional.campos, reporta únicamente el gap del '
        + 'CAMPO: es KNOWLEDGE_GAP (un campo de interfaz claramente identificado se declara en el Field Registry, no se programa). '
        + 'No añadas un gap de la operación salvo que exista además otro comportamiento realmente no representable (CAPABILITY_GAP).',
    },
    {
      id: 'condicionalidad',
      regla: 'Una frase condicional ("si aplica", "cuando corresponda") no es automáticamente un gap. Si las fuentes definen qué '
        + 'activa la condición y cómo se observa, pero el contrato no puede expresar un paso condicional: CAPABILITY_GAP. Si las '
        + 'fuentes no determinan cuándo es verdadera ni qué la provoca: INFORMACION_INSUFICIENTE.',
    },
    {
      id: 'minimo-suficiente-evidencia',
      regla: 'Pide solo la información que cambia PASS/FAIL. Si el requisito exige reconocer inequívocamente un estado o una '
        + 'pantalla, basta una firma semántica que la identifique: no exijas el literal exacto de todos sus textos ni '
        + 'preguntes datos que no alteran el veredicto. Exige el literal solo si el requisito certifica ese texto.',
    },
    {
      id: 'transicion-destino',
      regla: 'En avances o cambios de pantalla/estado: si el destino o estado resultante está claramente definido pero no es '
        + 'representable, CAPABILITY_GAP; si el destino o estado esperado no está identificado suficientemente, INFORMACION_INSUFICIENTE. '
        + 'Las reglas de composicion (transicion-demostrada) siguen aplicando a lo representable.',
    },
    {
      id: 'condicion-atomica',
      regla: 'Antes de diagnosticar, descompón cada paso en condiciones ATÓMICAS independientes. Cada una recorre su propia '
        + 'precedencia y puede detenerse en una capa distinta; nunca saltes capas dentro de una misma condición.',
    },
    {
      id: 'stop-primera-capa',
      regla: 'Para cada condición atómica, DETENTE en la primera capa bloqueante (INFORMACION_INSUFICIENTE, KNOWLEDGE_GAP, '
        + 'TESTABILITY_GAP, CAPABILITY_GAP). Entidad no registrada: no analices proveedores ni emitas TESTABILITY_GAP para ella. '
        + 'Sin proveedor: no analices acciones ni orquestación para ella. Una sola salida por condición en cada pasada.',
    },
    {
      id: 'regla-con-predicado',
      regla: 'Una regla de negocio (predicado -> consecuencia) solo se aplica si las fuentes DEMUESTRAN su predicado en el '
        + 'escenario del caso. Predicado falso: la consecuencia no aparece. No infieras la regla inversa ni la extiendas a un '
        + 'escenario vecino por compartir perfil, proceso o integración. Predicado no establecido y consecuencia que cambia '
        + 'PASS/FAIL: INFORMACION_INSUFICIENTE.',
    },
    {
      id: 'trazabilidad-de-consecuencias',
      regla: 'Toda expectativa derivada del requerimiento declara fuente, predicado que la activa y consecuencia. Si el diseño '
        + 'del caso no activa el predicado, esa consecuencia no entra al caso (no se amplía el alcance).',
    },
  ],
  ejemplos: [
    {
      regla: 'composicion-antes-de-gap',
      requisito: '"se introduce texto libre en un campo catalogado y, al perder el foco, el campo queda vacío"',
      composicion: ['escribir', 'campo-valor', 'salir-del-campo', 'campo-valor'] as Secuencia,
      resultado: 'REPRESENTABLE por composición: valor presente tras escribir, vacío tras salir del campo.',
      noEs: 'una capability faltante de "limpieza automática al perder el foco": el comportamiento emerge de la composición.',
    },
    {
      regla: 'gap-minimo-de-campo',
      requisito: '"el campo X, que no está en funcional.campos, no acepta caracteres especiales"',
      operacionExistente: 'entrada-rechazada' as TipoOperacionFuncional,
      gaps: [{ salida: 'KNOWLEDGE_GAP', conocimientoFaltante: 'declarar el campo X (tipo campo-ui) en el Field Registry' }],
      noEs: 'además un gap de "rechazo de caracteres": esa operación ya existe. Tampoco un CAPABILITY_GAP: nombrar un campo es conocimiento declarativo.',
    },
    {
      regla: 'backlog-no-implica-gap',
      requisito: 'un requisito cuya familia relacionada (p. ej. entrada-validacion) aparece en backlog con cobertura parcial',
      familiaRelacionada: 'entrada-validacion',
      resultado: 'Si una operación o composición soportada demuestra el requisito concreto, es REPRESENTABLE aunque la familia siga en backlog.',
    },
    {
      regla: 'ambiguedad-antes-de-capability',
      requisito: '"escriba algunos caracteres de una opción válida y verifique las coincidencias"',
      faltante: ['qué entrada se escribe, cuando esa entrada afecta el resultado', 'la relación de coincidencia requerida'],
      noAsumir: ['contiene', 'prefijo', 'mayúsculas/minúsculas', 'diacríticos'],
      resultado: 'INFORMACION_INSUFICIENTE, sin analizar capabilities.',
      siDefinido: 'Si una fuente define explícitamente la entrada y la relación de coincidencia, se continúa al análisis de capabilities.',
    },
    {
      regla: 'condicionalidad',
      requisito: '"si aplica, verifique el campo X"',
      casos: [
        { cuando: 'las fuentes definen qué activa la condición y cómo se observa, pero el contrato no expresa pasos condicionales', resultado: 'CAPABILITY_GAP (familia orquestacion-plan)' },
        { cuando: 'las fuentes no determinan cuándo aplica ni qué lo provoca', resultado: 'INFORMACION_INSUFICIENTE' },
      ],
    },
    {
      regla: 'minimo-suficiente-evidencia',
      requisito: '"se muestra la pantalla de bloqueo"',
      resultado: 'Definido: la pantalla se reconoce por su firma semántica. No es INFORMACION_INSUFICIENTE por no conocer el texto literal de sus mensajes.',
      contraste: '"el mensaje dice exactamente T" sí certifica el texto: entonces T es necesario.',
    },
    {
      regla: 'transicion-destino',
      requisito: '"al continuar, el sistema avanza"',
      casos: [
        { cuando: 'la pantalla o estado de destino está identificado pero no es representable', resultado: 'CAPABILITY_GAP (familia transicion)' },
        { cuando: 'no se identifica a qué pantalla o estado debe llegar', resultado: 'INFORMACION_INSUFICIENTE' },
      ],
    },
    {
      regla: 'condicion-atomica',
      requisito: '"avanza por la ruta X y muestra la pantalla Y"',
      condiciones: ['ruta X tomada', 'pantalla Y visible'],
      resultado: 'Dos condiciones con su propia precedencia: una puede ser KNOWLEDGE_GAP y la otra CAPABILITY_GAP.',
    },
    {
      regla: 'stop-primera-capa',
      requisito: 'la entidad X está claramente definida pero no está registrada en el Application Model',
      resultado: 'KNOWLEDGE_GAP únicamente (sin analizar proveedores).',
      despues: 'Una vez registrada X, una nueva evaluación puede dar TESTABILITY_GAP si ninguna de sus superficies tiene proveedor.',
    },
    {
      regla: 'regla-con-predicado',
      requisito: 'regla "si el registro corresponde a un tercero, se limpian las variables del registro"',
      casos: [
        { cuando: 'el caso establece que el registro es de un tercero', resultado: 'la limpieza es una expectativa del caso, trazada a la regla' },
        { cuando: 'el caso establece que no existe registro', resultado: 'la limpieza NO aparece: la regla no dice qué ocurre sin registro' },
        { cuando: 'el caso no establece si el registro es de un tercero y la limpieza cambia PASS/FAIL', resultado: 'INFORMACION_INSUFICIENTE' },
      ],
    },
  ],
} as const;

// ---------- Testabilidad multi-superficie (4L/4M) ----------

/**
 * Taxonomía de entidades, superficies y diagnóstico publicada al agente desde las fuentes canónicas
 * (aplicacion/superficies.ts y aplicacion/modeloAplicacion.ts). Solo proveedores PRODUCTIVOS: hoy ninguno 4L.
 */
export const TESTABILIDAD = {
  advertencia: 'Clasificación para el diagnóstico, no operaciones del JSON. portal-ui se observa con funcional.operaciones; en las demás '
    + 'superficies, un proveedor productivo certifica SOLO su cobertura publicada (superficies[].cobertura, por tipo y expectativa) y una '
    + 'superficie "parcial" no es observable fuera de ella. Un proveedor productivo no hace observable ninguna entidad sin vínculo aprobado: '
    + 'las condiciones del caso se rigen por funcional.condiciones.observablesHoy.',
  entidades: TIPOS_ENTIDAD.map(tipo => ({ tipo, descripcion: DESCRIPCION_ENTIDAD[tipo], superficies: superficiesDeEntidad(tipo) })),
  expectativasPorEntidad: EXPECTATIVAS_POR_ENTIDAD,
  superficies: publicarSuperficies(PROVEEDORES_PRODUCTIVOS),
  /** Entidades ya registradas en el Application Model (UI proyectada de 4J; el resto, vacío hasta que se declare). */
  // 4N: construido desde el modelo APROBADO (UI 4J + almacén declarativo); lo pendiente o rechazado nunca se publica.
  modelo: publicarModelo(MODELO_APLICACION_AFI),
  diagnostico: {
    precedencia: ['INFORMACION_INSUFICIENTE', 'KNOWLEDGE_GAP', 'TESTABILITY_GAP', 'CAPABILITY_GAP'],
    significado: {
      INFORMACION_INSUFICIENTE: 'No está definido QUÉ significa PASS/FAIL (entidad o expectativa). Se pregunta al analista QA.',
      KNOWLEDGE_GAP: 'La entidad está identificada con tipo semántico claro, pero no está en el Application Model. Se declara, no se programa.',
      TESTABILITY_GAP: 'PASS/FAIL definido y entidad registrada, pero ninguna superficie EFECTIVA de la entidad tiene proveedor productivo.',
      CAPABILITY_GAP: 'Falta una forma de ACTUAR u ORQUESTAR (interacción, orquestación, contexto de ejecución), o en portal-ui una operación que garantice el esperado.',
    },
    reglas: [
      'Superficies efectivas: una variable solo se observa por las superficies que declara; el resto de tipos, por las de su tipo.',
      'Frontera portal-ui: su mecanismo productivo son funcional.operaciones; si ninguna garantiza el esperado, sigue siendo CAPABILITY_GAP (compatibilidad).',
      'Un requisito de otra superficie (proceso, integración, notificación) registrado y sin proveedor productivo es TESTABILITY_GAP, no CAPABILITY_GAP.',
      'Cobertura exacta: un proveedor productivo solo cubre las (entidad, expectativa) de su cobertura publicada; fuera de ella (otra expectativa, otro tipo de la misma superficie) sigue siendo TESTABILITY_GAP.',
      'KNOWLEDGE_GAP y TESTABILITY_GAP nunca se formulan como preguntas para QA.',
      'Nunca KNOWLEDGE_GAP y TESTABILITY_GAP para la misma condición en una misma pasada: la primera capa bloqueante detiene la condición.',
      'Deduplica gaps por capacidad técnica ATÓMICA: observar una ruta y leer una variable son gaps distintos aunque compartan paso o superficie.',
      'No fuerces un gap a una familia del backlog que no lo describa honestamente.',
    ],
  },
} as const;

// ---------- Protocolo del agente (no es schema runtime) ----------

export const PROTOCOLO_DECISION = {
  fuentes: {
    jerarquia: [
      { fuente: 'metadata', rol: 'Identidad autoritativa del caso: hu, caso, nombre, perfil y variante objetivo.' },
      { fuente: 'diseno-qa', rol: 'Qué se certifica: pasos, acciones y resultados esperados. Delimita el alcance.' },
      { fuente: 'requerimiento', rol: 'Comportamiento de negocio que aclara lo que el diseño ya pide. Nunca agrega pasos ni assertions.' },
      { fuente: 'manifest', rol: 'Qué puede demostrar el framework.' },
      { fuente: 'contrato', rol: 'Cómo se representa lo generable.' },
    ],
    reglas: [
      'El requerimiento puede precisar una condición del diseño (qué significa "coincidir", cuál es la fuente de un catálogo); no puede ampliar el alcance del caso.',
      'Un requisito del requerimiento que el diseño no pide no se certifica ni se reporta como gap del caso.',
      'Si requerimiento y diseño se contradicen en una condición observable: INFORMACION_INSUFICIENTE indicando ambas versiones; nunca elegir en silencio.',
      'Si la metadata y el diseño discrepan en identidad (caso, perfil, variante): INFORMACION_INSUFICIENTE.',
    ],
  },
  /** Orden obligatorio por requisito (4M): la ambigüedad se decide ANTES y con independencia de lo demás. */
  precedencia: TESTABILIDAD.diagnostico.precedencia,
  pasos: [
    {
      paso: 1,
      pregunta: '¿Puedes formular la condición observable COMPLETA de este requisito sin elegir entre varias semánticas '
        + 'posibles que ni el diseño ni el requerimiento resuelven? (Sin mirar todavía funcional.operaciones.)',
      no: 'INFORMACION_INSUFICIENTE',
      alNo: 'DETENERSE para este requisito: no se analizan capabilities ni se reporta CAPABILITY_GAP para él.',
      si: 'paso 2',
    },
    {
      paso: 2,
      requiere: 'paso 1 = sí',
      pregunta: '¿La entidad de la condición, con su tipo semántico (testabilidad.entidades), ya está registrada '
        + '(testabilidad.modelo, funcional.campos, funcional.componentes)?',
      no: 'KNOWLEDGE_GAP',
      alNo: 'Declararla, no programarla: no la conviertas en CAPABILITY_GAP ni en pregunta para QA.',
      si: 'paso 3',
    },
    {
      paso: 3,
      requiere: 'paso 2 = sí',
      pregunta: '¿Alguna superficie EFECTIVA de la entidad puede observarla hoy? portal-ui: funcional.operaciones; otras superficies: '
        + 'un proveedor productivo en testabilidad.superficies.',
      no: 'TESTABILITY_GAP',
      alNo: 'No es una pregunta para QA: el requisito está definido; falta un proveedor.',
      si: 'paso 4',
    },
    {
      paso: 4,
      requiere: 'paso 3 = sí',
      pregunta: '¿Una operación existente, o si no una composición mínima de operaciones existentes, representa ESA condición sin '
        + 'debilitarla ni aproximarla (revisar garantiza, noGarantiza y composicion), incluidas las acciones y la orquestación que exige?',
      orden: DIAGNOSTICO.busqueda,
      no: 'CAPABILITY_GAP',
      si: 'la operación puede formar parte del JSON',
    },
  ],
  reglas: [
    'Evaluar CADA paso del diseño; si uno solo cae en INFORMACION_INSUFICIENTE, KNOWLEDGE_GAP, TESTABILITY_GAP o CAPABILITY_GAP, no se emite JSON (tampoco parcial).',
    'Modo intake/benchmark: un análisis de uno o varios casos puede reportar una MEZCLA de INFORMACION_INSUFICIENTE, KNOWLEDGE_GAP, '
      + 'TESTABILITY_GAP y CAPABILITY_GAP: un bloque por paso afectado, en ese orden de precedencia.',
    'KNOWLEDGE_GAP y TESTABILITY_GAP nunca se formulan como preguntas para QA. CAPABILITY_GAP conserva su significado: '
      + 'interacción, orquestación o contexto de ejecución faltante (ver testabilidad.diagnostico).',
    'Nunca sustituir un resultado esperado por una assertion más débil: si el esperado exige algo listado en noGarantiza, es CAPABILITY_GAP.',
    'Una etapa del modelo que el runner v1 no orquesta no se vuelve preparación: es CAPABILITY_GAP o el punto funcional.',
    'Ante duda: INFORMACION_INSUFICIENTE si falta definir QUÉ observar; KNOWLEDGE_GAP si la entidad es clara pero no está registrada; '
      + 'TESTABILITY_GAP si está registrada y ninguna superficie efectiva tiene proveedor productivo; CAPABILITY_GAP si falta cómo actuar u '
      + 'orquestar, o una operación de portal-ui que garantice el esperado.',
    'ANTES de consultar funcional.operaciones, formula la condición observable completa de cada requisito. Si para formularla '
      + 'debes elegir entre varias semánticas posibles no resueltas por el diseño ni por el requerimiento: INFORMACION_INSUFICIENTE, '
      + 'y NO continúes al análisis de capabilities para ese requisito.',
    'La existencia, ausencia o cobertura parcial de una capability nunca resuelve ni oculta una ambigüedad: '
      + 'un requisito ambiguo no se reporta como CAPABILITY_GAP, aunque además falte la capability.',
    'Cada CAPABILITY_GAP indica la familia de backlog.familias que lo cubre; si ninguna encaja, familia: sin-familia.',
    'Solo son utilizables las operaciones de funcional.operaciones. Lo pendiente de una familia parcial del backlog sigue siendo '
      + 'CAPABILITY_GAP solo si el requisito concreto lo necesita y ninguna operación ni composición soportada lo demuestra (ver diagnostico).',
    'Componentes, fuentes y campos se nombran solo con los ids de sus catálogos cerrados; nunca con selectores ni textos de la UI.',
    'Un JSON válido y compilable no basta: cada paso debe demostrar su esperado sin falsos positivos (ver composicion).',
  ],
  composicion: COMPOSICION,
  diagnostico: DIAGNOSTICO,
  ejemplos: [
    { diseno: '"el componente X no debe ser visible" y solo existe ausencia de texto', resultado: 'CAPABILITY_GAP' },
    { diseno: '"se comporta normalmente" sin definir qué observar', resultado: 'INFORMACION_INSUFICIENTE' },
    {
      diseno: '"se muestran las entradas que coincidan con X" sin definir la relación de coincidencia (igualdad, empieza por, contiene, tildes)',
      resultado: 'INFORMACION_INSUFICIENTE, sin analizar capabilities',
    },
    { diseno: '"el catálogo contiene al menos una opción fuera de A/B"', resultado: 'GENERABLE con catalogo-opcion-fuera-de' },
    { diseno: '"el proceso pasa a la actividad A" y A no está en testabilidad.modelo', resultado: 'KNOWLEDGE_GAP (declarar la actividad A)' },
    { diseno: '"la variable interna X queda vacía", X registrada y sin proveedor productivo en sus superficies', resultado: 'TESTABILITY_GAP (no preguntar a QA)' },
  ],
  salidas: {
    GENERABLE: { cuando: 'Todos los pasos pasan el protocolo.', formato: 'Únicamente el JSON DefinicionCasoAfi, sin texto adicional.' },
    CAPABILITY_GAP: {
      cuando: 'El diseño es claro pero el framework no puede representarlo fielmente.',
      formato: ['CAPABILITY_GAP', '', '- paso:', '- requisito:', '- capability faltante:', '- familia:'],
    },
    INFORMACION_INSUFICIENTE: {
      cuando: 'El diseño no define una condición observable suficientemente precisa, o las fuentes se contradicen.',
      formato: ['INFORMACION_INSUFICIENTE', '', '- paso:', '- significado conocido:', '- información faltante:'],
    },
    KNOWLEDGE_GAP: {
      cuando: 'La entidad está clara pero no está registrada en el Application Model. Se declara; no pide implementación ni es una capability.',
      formato: ['KNOWLEDGE_GAP', '', '- paso:', '- entidad:', '- tipo:', '- conocimiento declarativo faltante:'],
    },
    TESTABILITY_GAP: {
      cuando: 'PASS/FAIL definido y entidad registrada, pero ninguna superficie efectiva tiene proveedor productivo. Nunca es una pregunta para QA.',
      formato: ['TESTABILITY_GAP', '', '- paso:', '- requisito:', '- entidad:', '- superficies candidatas:', '- observación faltante:'],
    },
  },
} as const;

// ---------- Construcción ----------

/**
 * Campos donde la operación es aplicable, DERIVADOS del Field Registry (4J): los de su fuente si la tiene; si nombra
 * un campo, los del registro cuyo control ofrece la capacidad que la operación exige (CAPACIDAD_REQUERIDA).
 */
export function camposAplicables(tipo: TipoOperacionFuncional, registro: RegistroCampos = REGISTRO_CAMPOS_FUNCIONALES): string[] {
  if (CONTRATO[tipo].requeridas.includes('fuente')) return [...new Set(Object.values(FUENTES_AUTORITATIVAS_AFI).flatMap(f => f.campos))];
  const capacidad = CAPACIDAD_REQUERIDA[tipo];
  return CONTRATO[tipo].requeridas.includes('campo') && capacidad ? camposDelRegistroCon(capacidad, registro) : [];
}

/** Contrato machine-readable de intake de conocimiento (4O), derivado de aplicacion/propuestas.ts. */
export const KNOWLEDGE_INTAKE = publicarContratoIntake();

/** Contrato de datos de prueba (4P/4Q), derivado de datosPrueba/: resoluciones, grupos de campos, estados, forma del requisito y actores aprobados. */
export const TEST_DATA = publicarContratoDatosPrueba();

/** Envelope ÚNICO de intake del agente (4Q): un solo bloque JSON con conocimiento y datos de prueba (dimensiones independientes). */
export const AGENT_INTAKE = publicarEnvelopeIntake();

// ---------- Condiciones observables del caso (4R.2) ----------

/** Muestra de expectativa para resolver un (tipo, expectativa): el `igual` no cambia la observabilidad. */
const muestraExpectativa = (tipo: TipoExpectativa): Expectativa =>
  (tipo === 'valor' ? { tipo, igual: null } : tipo === 'resultado' ? { tipo, igual: 'exito' } : { tipo }) as Expectativa;

/**
 * Contrato de `funcional.pasos[].condiciones` publicado al agente. DERIVADO del validador (claves, expectativas,
 * `igual`) y del compilador (observablesHoy = lo que resolverCondicion deja REPRESENTABLE con la configuración dada).
 * Nunca publica vínculos, localizaciones ni proveedores no productivos.
 */
export function publicarCondiciones(t: TestabilidadCompilacion = testabilidadCanonica()) {
  // Tipos que pueden expresarse como condición: los que tienen alguna superficie fuera de portal-ui.
  const tipos = TIPOS_ENTIDAD.filter(tipo => superficiesDeEntidad(tipo).some(s => s !== 'portal-ui'));
  const observablesHoy = entidadesDelModelo(t.modelo).flatMap(([tipo, id]) => EXPECTATIVAS_POR_ENTIDAD[tipo].map(expectativa => ({ tipo, id, expectativa })))
    .filter(x => resolverCondicion('manifest', 0, { entidad: { tipo: x.tipo, id: x.id }, expectativa: muestraExpectativa(x.expectativa) }, t).estado === 'REPRESENTABLE');
  return {
    ruta: 'funcional.pasos[].condiciones',
    opcional: true,
    forma: { paso: [...CLAVES_PASO], condicion: [...CLAVES_CONDICION], entidad: [...CLAVES_ENTIDAD_CONDICION], expectativa: ['tipo', 'igual (solo valor y resultado)'] },
    rol: '`esperado` es el resultado esperado QA literal; `condiciones` es su representación observable SUFICIENTE cuando el hecho no está en el Portal. '
      + 'Describen el MISMO esperado: no son una segunda verdad ni amplían el alcance.',
    tipos: tipos.map(tipo => ({
      tipo,
      expectativas: EXPECTATIVAS_POR_ENTIDAD[tipo].map(e => ({
        tipo: e,
        ...(Object.prototype.hasOwnProperty.call(IGUAL_POR_EXPECTATIVA, e) ? { igual: IGUAL_POR_EXPECTATIVA[e as keyof typeof IGUAL_POR_EXPECTATIVA] } : {}),
      })),
    })),
    pasoSoloCondiciones: '`operaciones` puede ser [] únicamente si el paso declara condiciones.',
    proveedoresProductivos: t.proveedoresHabilitados.filter(id => PROVEEDORES_PRODUCTIVOS.some(p => p.id === id)),
    /** (entidad, expectativa) que HOY compilan como observables: vínculo aprobado + proveedor productivo. */
    observablesHoy,
    noObservable: 'Si en ejecución la fuente no permite concluir (infraestructura, autenticación o dato ausente), el paso queda NO_OBSERVABLE: '
      + 'ni PASS ni FAIL, y el caso no queda certificado. Nunca se convierte en FAIL ni se interpreta como la negación.',
    reglas: [
      'Emite una condición SOLO si su (entidad, expectativa) figura en observablesHoy. Si no figura, no la emitas: diagnostica KNOWLEDGE_GAP (entidad no registrada) o TESTABILITY_GAP (registrada pero no observable hoy).',
      'La condición es solo semántica: { entidad: { tipo, id }, expectativa }. Nunca proveedor, superficie, localización, nombre de tarea, selector, endpoint ni credenciales: los resuelve el framework.',
      'La entidad debe estar en testabilidad.modelo con ese tipo, y la expectativa en las de su tipo.',
      'Un proveedor implementado pero no productivo no hace observable nada: solo cuentan proveedoresProductivos.',
      'pantalla-ui y campo-ui se certifican con funcional.operaciones, nunca con condiciones.',
      'El actor, el perfil o actorRef nunca son evidencia de una condición.',
    ],
  };
}

/**
 * `modelo` (4O): permite regenerar el manifest con un Application Model recién aplicado en el MISMO proceso
 * (tools/afi.mjs conocimiento aplicar); por defecto, el modelo canónico cargado del almacén.
 */
export function construirAgentManifest(registro: RegistroCampos = REGISTRO_CAMPOS_FUNCIONALES, modelo?: ModeloAplicacion, datosPrueba?: RegistroDatosPrueba) {
  const punto = puntoFuncional(registro);
  const runner: readonly EtapaAfi[] = ETAPAS_RUNNER_V1_MANIFEST;
  const campos = camposConCapacidad();
  const tiposOperacion = Object.keys(CONTRATO) as TipoOperacionFuncional[];

  return {
    schemaVersion: VERSION_AGENT_MANIFEST,
    contrato: {
      version: VERSION_CASO_AFI,
      documento: 'AFI-CASE-CONTRACT.md',
      estructura: ['version', 'hu', 'caso', 'nombre', 'fuente?', 'perfil', 'actorRef?', 'participantes?[{ rol, actorRef }]', 'relaciones?[{ tipo, sujetos }]', 'preparacion { datosCaso, camposAsercion, etapas }', 'funcional? { caso, pasos[{ id, esperado, operaciones[], condiciones?[{ entidad { tipo, id }, expectativa }] }] } (opcional solo con e2e)', 'e2e? (ver contrato.e2e)'],
      // Caso E2E completo: recorrido, verificaciones y datos (uso/resolucion/aplicabilidad). Los gaps los deriva el compilador.
      e2e: publicarContratoE2E(),
      camposNoPublicos: CAMPOS_AFI.filter(c => POLITICAS_AFI[c].sensibilidad !== 'public'),
      reglaNoPublicos: 'Nunca un valor literal ni una estrategia deterministic-* en datosCaso: su valor viene del actor en ejecución.',
    },
    perfiles: PERFILES_CASO_AFI.map(perfil => ({
      perfil,
      etiquetaTipoAportante: (PERFILES_AFI as Record<string, { tipoAportante: string }>)[perfil]?.tipoAportante ?? null,
      camposPorEtapa: Object.fromEntries(ETAPAS_AFI.map(etapa => [etapa, CAMPOS_AFI.filter(c =>
        POLITICAS_AFI[c].etapa === etapa && (POLITICAS_AFI[c].perfiles?.includes(perfil) ?? true))])),
    })),
    preparacion: {
      etapasModelo: [...ETAPAS_AFI],
      etapasRunnerV1: [...runner],
      etapaObligatoriaRunnerV1: runner[0],
      puntoFuncional: punto,
      etapas: ETAPAS_AFI.map((etapa, i) => ({
        etapa,
        orden: i + 1,
        rol: runner.includes(etapa) ? 'preparacion-runner-v1' : etapa === punto ? 'punto-funcional' : 'no-soportada-runner-v1',
        declarableEnPreparacion: runner.includes(etapa),
        campos: CAMPOS_AFI.filter(c => POLITICAS_AFI[c].etapa === etapa),
        camposConCapacidadPreparacion: campos.filter(x => x.etapa === etapa).map(x => x.campo),
        nota: NOTAS_ETAPA[etapa],
      })),
      viabilidadPorPerfil: viabilidadPorPerfil(runner),
      reglaViabilidad: 'Una etapa declarada en preparacion.etapas solo es GENERABLE si su viabilidad para el perfil es "soportada" o "no-requerida". '
        + 'Si está "bloqueada", el caso es CAPABILITY_GAP (salvo que el diseño aporte el valor explícito del campo bloqueado y ese campo lo admita). '
        + 'La viabilidad es de capability: los datos del actor se verifican al compilar.',
      reglasRunnerV1: [
        `preparacion.etapas: subconjunto de etapasRunnerV1, en el orden de etapasModelo, incluyendo "${runner[0]}".`,
        'Declarar una etapa del runner sin campos aplicables al perfil es seguro: queda "no-requerida".',
        'Una etapa no declarada no se completa: si el Portal la presenta con datos obligatorios, la preparación no avanza.',
        `Tras la preparación el runner espera la pantalla "${punto}" y ejecuta los pasos funcionales en orden.`,
        'Login, reconocimiento, lifecycle/cleanup, reintentos, timeouts y selectores son del framework, nunca del JSON.',
      ],
      formasResolucion: Object.values(FORMAS_RESOLUCION),
      estrategiasDatosCaso: (Object.keys(ESTRATEGIAS_CASO) as (keyof typeof ESTRATEGIAS_CASO)[]).map(tipo => ({
        tipo,
        significado: ESTRATEGIAS_CASO[tipo].significado,
        /** Campos donde el contrato la admite en datosCaso Y AfiDataUi la materializa. */
        materializablePorCampos: campos.filter(x => {
          const muestra = ESTRATEGIAS_CASO[tipo].muestra(x.cap);
          return admitidaEnDatosCaso(x.etapa, x.campo, muestra) && materializable(x.etapa, x.campo, muestra);
        }).map(x => x.campo),
      })),
      capacidades: campos.map(({ etapa, campo, cap }) => {
        const p = POLITICAS_AFI[campo];
        return {
          etapa,
          campo,
          control: cap.control,
          acepta: cap.admite.map(a => FORMAS_RESOLUCION[a].forma),
          ...(cap.precargable ? { precargable: true } : {}),
          ...(cap.opciones ? { opcionesObservadas: [...cap.opciones] } : {}),
          sensibilidad: p.sensibilidad,
          literalPermitidoEnDatosCaso: p.sensibilidad === 'public',
          perfiles: [...(p.perfiles ?? PERFILES_CASO_AFI)],
          resueltoPorFramework: {
            delActor: p.delActor,
            ...(p.derivacion ? { derivadoDe: [...p.derivacion.dependeDe] } : {}),
            ...(p.auxiliar ? { auxiliar: { tipo: p.auxiliar.tipo, materializable: materializable(etapa, campo, p.auxiliar) } } : {}),
          },
        };
      }),
    },
    funcional: {
      inicio: `Pantalla "${punto}", alcanzada por la preparación del runner v1.`,
      ejecucion: 'Pasos y operaciones en orden, sobre la misma pantalla y sin reinicio: una selección afecta a las operaciones siguientes. El primer FAIL detiene el caso.',
      campos: camposDelRegistro(registro).map(c => ({ campo: c.id, etapa: c.pantalla, control: c.control })),
      componentes: COMPONENTES_FUNCIONALES_AFI.map(componente => ({ componente, descripcion: DESCRIPCION_COMPONENTES[componente] })),
      fuentes: (Object.keys(FUENTES_AUTORITATIVAS_AFI) as FuenteAutoritativaAfi[]).map(fuente => ({
        fuente,
        campos: [...FUENTES_AUTORITATIVAS_AFI[fuente].campos],
        filtros: [...FUENTES_AUTORITATIVAS_AFI[fuente].filtros],
        ...SEMANTICA_FUENTES[fuente],
      })),
      familiasSoportadas: FAMILIAS_SOPORTADAS,
      normalizaciones: {
        'texto-es': {
          descripcion: 'Quita tildes, deja solo letras A-Z y pasa a mayúsculas.',
          ejemplos: ['San José, D.C.', 'Peñol (Viejo)'].map(entrada => ({ entrada, normalizado: normalizarTextoCatalogo(entrada) })),
        },
      },
      condiciones: publicarCondiciones(modelo ? { ...testabilidadCanonica(), modelo } : testabilidadCanonica()),
      operaciones: tiposOperacion.map(tipo => {
        const s = SEMANTICA_OPERACIONES[tipo];
        return {
          tipo,
          camposAplicables: camposAplicables(tipo, registro),
          ...(CONTRATO[tipo].requeridas.includes('componente') ? { componentesAplicables: [...COMPONENTES_FUNCIONALES_AFI] } : {}),
          ...(CONTRATO[tipo].requeridas.includes('fuente') ? { fuentesAplicables: Object.keys(FUENTES_AUTORITATIVAS_AFI) } : {}),
          parametros: {
            requeridos: [...CONTRATO[tipo].requeridas],
            opcionales: [...CONTRATO[tipo].opcionales],
            detalle: s.parametros,
          },
          alcance: s.alcance,
          semantica: s.semantica,
          garantiza: s.garantiza,
          noGarantiza: s.noGarantiza,
          observado: s.observado,
        };
      }),
    },
    ejecucion: {
      principio: 'DefinicionCasoAfi describe la intención funcional. El contexto de ejecución (desktop, mobile) es una dimensión '
        + 'de ejecución: lo elige quien ejecuta, nunca el JSON.',
      contextos: CONTEXTOS_EJECUCION_AFI.map(contexto => ({
        contexto,
        descripcion: CONTEXTOS_AFI[contexto].descripcion,
        soportadoRunnerV1: CONTEXTOS_AFI[contexto].soportadoRunnerV1,
        seleccion: SELECCION_CONTEXTO[contexto],
        limites: CONTEXTOS_AFI[contexto].limites,
      })),
      reglas: [
        'El JSON nunca declara viewport, dispositivo, touch ni navegador: el contrato no tiene dónde y una propiedad extra lo invalida.',
        'Un diseño con variantes por contexto se traduce por variante: una DefinicionCasoAfi por variante, solo para contextos soportadoRunnerV1.',
        'Los pasos de una variante en un contexto no soportado son CAPABILITY_GAP (familia contexto-ejecucion); nunca se emite JSON para ella, porque se ejecutaría en otro contexto.',
        '"Hacer clic" y "hacer tap" son la misma operación funcional: la modalidad la decide el contexto.',
        'Una assertion que solo tiene sentido en un contexto (adaptación al ancho, legibilidad) es una capability funcional, no un contexto.',
      ],
    },
    testabilidad: modelo ? { ...TESTABILIDAD, modelo: publicarModelo(modelo) } : TESTABILIDAD,
    agentIntake: AGENT_INTAKE,
    knowledgeIntake: KNOWLEDGE_INTAKE,
    // 4Q: tras `datos aplicar`, el manifest se regenera con el registro recién aplicado en el MISMO proceso.
    testData: datosPrueba ? publicarContratoDatosPrueba(datosPrueba) : TEST_DATA,
    protocoloDecision: PROTOCOLO_DECISION,
    backlog: {
      soportado: false,
      advertencia: 'NADA de esta sección es utilizable en el JSON. Solo sirve para nombrar la familia de un CAPABILITY_GAP. '
        + 'Que una familia relacionada figure aquí no prueba un gap (protocoloDecision.diagnostico: backlog-no-implica-gap).',
      familias: FAMILIAS_BACKLOG,
    },
  };
}

export type AgentManifestAfi = ReturnType<typeof construirAgentManifest>;

/** Serialización canónica del archivo AFI-AGENT-MANIFEST.json. */
export const serializarAgentManifest = (modelo?: ModeloAplicacion, datosPrueba?: RegistroDatosPrueba) =>
  `${JSON.stringify(construirAgentManifest(REGISTRO_CAMPOS_FUNCIONALES, modelo, datosPrueba), null, 2)}\n`;
