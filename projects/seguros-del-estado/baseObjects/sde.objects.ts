/**
 * Base Object SDE — ÚNICO lugar con selectores del Work Portal SDE.
 *
 * CALIBRACIÓN contra el DOM REAL de QA (2026-10-08, sesión CE_Analista e intermediario):
 *   [VERIFICADO]  observado en QA y usado con éxito por la automatización.
 *   [PENDIENTE]   aún no observado (actividades posteriores / grillas): falla con
 *                 "[calibrar SdeObjects.<clave>]" en vez de adivinar.
 * Ningún selector se "adivina" con .first() ni coincidencias difusas.
 */

const SINONIMOS_ACCION = { Agregar: ['Agregar', 'Adicionar', 'Nuevo'], Editar: ['Editar', 'Modificar'], Eliminar: ['Eliminar', 'Borrar'] };

export const SdeObjects = {
  // --- Login [VERIFICADO] ---
  login: {
    dominio: '#domain',          // valores: domain | externos | segurosdelestado.com
    usuario: '#user',
    clave: '#password',
    ingresar: '#btn-login',
  },

  // --- Work Portal [VERIFICADO] ---
  /** Indicadores de "procesando". */
  carga: '.k-loading-mask, .bz-loading, .ui-bizagi-loading-icon, [class*="loader" i], [class*="spinner" i]',
  /** Menú superior: su presencia confirma sesión iniciada (ambos roles). */
  bandeja: '#menuListInbox',
  /** Menú "Nuevo Caso" → "Todos los procesos" → categorías (li.category > h3) → proceso (li.process > span). */
  nuevoCaso: '#menuListNew',
  todosLosProcesos: '#breadcrumbRoot',
  /**
   * Administración de casos (P-17), patrón del Work Portal verificado en Colsubsidio: menú Admin → "Administración de procesos"
   * → categoría "Casos" → diálogo con búsqueda por número. [VERIFICADO SDE 2026-10-15: analista sí, intermediario no]
   * `adminInvalidar` («Cancelar casos»; en Colsubsidio el id es #btn-admin-case-invalidate) cancela casos: solo se detecta su presencia y está en componentesEscritura (nunca se pulsa en diagnóstico).
   */
  menuAdmin: '#menuListAdmin',
  adminCategorias: '#categories',
  adminCasoNumero: '#caseInput',
  adminCasoBuscar: '#btn-admin-case-search',
  /** Consulta de Administrar Casos (GET, solo lectura). [VERIFICADO SDE 2026-10-15] */
  rutaBusquedaAdmin: '/Rest/Queries/SearchCases',
  adminInvalidar: '#btn-admin-cases-invalidate',
  /**
   * Reasignación (Administrar Casos, calibrada en el caso propio 668, 2026-10-19): casilla del work item por actividad
   * (value «caso|idWorkItem|actividad»), botón Reasignar, búsqueda del usuario por Nombre Usuario y botón «Reasignar» de su fila.
   * En la misma vista existe «Cancelar» (#btn-admin-case-invalidate): NUNCA se usa.
   */
  adminWorkItem: 'input[name="workItemAdmin"]',
  /**
   * «Consulta Gráfica» de una instancia (calibrada en los casos propios 654 y 656, 2026-10-19): ícono de la fila del buscador,
   * diálogo con encabezado «Caso:», nodos del diagrama tipados por BPMN y botón «Ruta», que marca los nodos recorridos.
   */
  // La clase cubre el caso en que el tooltip de jQuery UI retiró el atributo title (caso 668).
  iconoConsultaGrafica: '.ui-bizagi-wp-app-inbox-cases-ico-view, [title="Ver Consulta Gráfica"]',
  dialogoConsultaGrafica: '.ui-dialog:has(.ui-dialog-title:text-is("Consulta Gráfica"))',
  nodoGrafico: '.processviewer-hotspot',
  nodoRecorrido: '.processviewer-hotspot.processviewer-highlighted',
  /** Respuestas que el portal pide para la Consulta Gráfica (GET, solo lectura). [VERIFICADO SDE 2026-10-19, sonda sobre 654, 670 y 671] */
  rutaCasoGrafico: '/Rest/Cases/WorkitemsGuid',       // al abrir el diálogo: currentCase { idCase, radicationNumber }
  rutaTransicionesCaso: '/Rest/Cases/TransitionLog',  // al pulsar «Ruta»: [{ guidTaskFrom, guidTaskTo, ... }] = ruta completa
  adminReasignar: '#btn-admin-case-reassign',
  adminUsuarioReasignar: '#userNameReassignInput',
  adminBuscarUsuario: '#btn-users-table-search',
  /** Botones de administración que ESCRIBEN (Terminar caso, copiar/revocar permisos): solo se detectan. [VERIFICADO SDE 2026-10-15] */
  adminEscritura: ['#btn-admin-case-finish', '#btn-copyPermissions', '#btn-revokePermissions'],
  arbolCategoria: '#allProcesses li.category',
  arbolCategoriaTexto: 'h3',
  arbolProceso: '#allProcesses li.process',
  /** Caja de búsqueda global de casos (barra superior, placeholder "Buscar"). [VERIFICADO] */
  buscadorCasos: '#menuQuery',
  /** Fila de resultado de búsqueda: columnas Número del caso | Proceso | Actividad | ... [VERIFICADO] */
  filaResultado: 'tr:has(td)',
  /** Número del caso en su fila (td.I_RadNumber). [VERIFICADO] */
  numeroEnFila: 'td.I_RadNumber',
  /** Actividades ACTUALES del caso en su fila (una por li, con idTask oculto). [VERIFICADO] */
  actividadesEnFila: 'ul.gridListWorkItems li .ui-bizagi-wp-app-inbox-activity-name',
  /** Endpoint de acciones del formulario; su respuesta CREATENEWCASE trae CaseNumber. [VERIFICADO] */
  rutaAcciones: '/Rest/Handlers/MultiAction',
  /** Procesos que el usuario puede iniciar (por rol). Intermediarios: categorías vacías (ENV-03). [VERIFICADO] */
  rutaProcesos: '/Rest/Processes/All',

  // --- Formularios [VERIFICADO en el formulario de inicio] ---
  /** Contenedor de UN campo: div.ui-bizagi-render[data-render-xpath] (etiqueta en span.ui-bizagi-label > label). */
  contenedorCampo: '[class~="ui-bizagi-render"]',
  /** Contenedor del campo al que pertenece una etiqueta (ancestro más cercano equivalente a contenedorCampo). */
  contenedorDeEtiqueta: 'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ui-bizagi-render ")][1]',
  /** Grupo/sección con título (ej. "Tipo de Consulta", "Informacion a Consultar"). */
  grupo: '.bzg-form-group',
  grupoTitulo: 'h3.ui-bizagi-container-group-header',
  /** Separador para referenciar un campo dentro de un grupo: "Informacion a Consultar › Sucursal". */
  separadorGrupo: ' › ',
  /** Etiqueta de un CAMPO (no la de una opción de radio): span.ui-bizagi-label > label. [VERIFICADO 2026-10-08] */
  etiquetaCampo: '.ui-bizagi-label label',
  /** Marcas dentro del contenedor. "control-required" solo aparece mientras el campo obligatorio está VACÍO. */
  marcaObligatorio: '.control-required',
  marcaSoloLectura: '.ui-bizagi-noneditable-normal, .readonly-control',
  claseSoloLectura: /(^|\s)ui-bizagi-render-readonly(\s|$)/,
  claseObligatorio: /(^|\s)ui-bizagi-render-required(\s|$)/,
  /** Controles de entrada. */
  controles: 'input:not([type="hidden"]), select, textarea, [contenteditable="true"]',
  /** Combo Bizagi: input[role=combobox] cuyo aria-controls apunta a su listbox. */
  combo: 'input[role="combobox"]',
  opcionesDe: (listboxId: string): string => `#${listboxId} [role="option"], #${listboxId} li`,
  /** Opción de radio (incluye booleanos "Si"/"No"): label[for] dentro del contenedor. */
  radioOpcion: 'label[for]',
  /** Zona de botones de la actividad / formulario de inicio (input.ui-bizagi-button). */
  areaBotones: '.ui-bizagi-button-container',
  /** Diálogos jQuery UI (el formulario de inicio es uno: .ui-bizagi-start-form-dialog). */
  dialogo: '.ui-dialog[role="dialog"]',
  dialogoInicio: '.ui-dialog.ui-bizagi-start-form-dialog',
  /** Título de la actividad abierta. [PENDIENTE] */
  tituloActividad: '.ui-bizagi-wp-app-inbox-activity-name, [class*="activity-name" i], [class*="workitem-name" i], [class*="task-name" i]',

  // --- Grillas Bizagi [VERIFICADO en "Documentos Anexos" del formulario de inicio] ---
  /** Render de grilla: div.bzg-form-grid con label propio y título .bz-rn-grid-header-title. */
  grilla: '.bzg-form-grid',
  grillaTitulo: '.bz-rn-grid-header-title, :scope > .ui-bizagi-label label',
  grillaColumnas: 'thead th label',
  /** Botones del pie: li[data-action="add|remove|save|cancel"] (title "Adicionar <grilla>"). */
  accionGrilla: (accion: 'add' | 'remove' | 'save' | 'cancel' | 'edit'): string => `li[data-action="${accion}"]`,
  /** Acción por fila. [PENDIENTE: edición de fila en "Pólizas asociadas"] */
  accionTabla: (accion: 'Agregar' | 'Editar' | 'Eliminar'): string =>
    SINONIMOS_ACCION[accion].map((s) => `[title="${s}"], [aria-label="${s}"], button:text-is("${s}")`).join(', '),
  accionTablaBarra: (accion: 'Agregar' | 'Editar' | 'Eliminar'): string =>
    `xpath=.//*[(${SINONIMOS_ACCION[accion].map((s) => `@title="${s}" or @aria-label="${s}" or (self::button and normalize-space(.)="${s}")`).join(' or ')}) and not(ancestor::tr)]`,
  filaDatos: 'tbody.ui-bizagi-grid-body > tr[data-bizagi-component="cells"], tbody tr:has(td)',
  grillaVacia: '[data-bizagi-component="emptyTable"]',
  /** Carga de archivo en una fila de grilla de documentos: enlace → diálogo "Subir un archivo" → botón "Subir". [VERIFICADO 2026-10-13, caso 428] */
  cargaArchivoFila: 'li.ui-bizagi-render-upload-wrapper > a',
  dialogoCargaTitulo: 'Subir un archivo',
  botonSubir: 'Subir',
  confirmarDialogo: ['Guardar', 'Aceptar', 'Confirmar'],
  /** Fila seleccionada de una grilla: control de selección marcado o marca de fila activa. [PENDIENTE: tabla de pólizas HU03-CP01] */
  seleccionFila: 'input[type="radio"], input[type="checkbox"]',
  filaSeleccionadaClase: /(^|\s)(ui-bizagi-grid-row-selected|ui-state-active|ui-state-highlight|selected)(\s|$)/,
  /** Pestañas del formulario (Documentos de la solicitud / Seguimiento/Trazabilidad). [PENDIENTE: navegación; visibles VERIFICADO] */
  pestana: '[role="tab"], .ui-tabs-nav > li',
  pestanaActivaClase: /(^|\s)(ui-tabs-active|ui-state-active|active)(\s|$)/,
  /** Mensajes de validación junto al campo o en el centro de notificaciones. */
  mensajeValidacion: '.ui-bizagi-notifications-container, #NotificationCenter, .ui-bizagi-validation-message, [role="alert"]',
  /**
   * Textos de PRESENTACIÓN que revisa la verificación "ortografia": etiquetas de campo, opciones de radio, títulos de grupo,
   * títulos y columnas de grillas y pestañas. Los botones se toman de areaBotones. Nunca valores diligenciados. [VERIFICADO: etiquetas, grupos, grillas]
   */
  textosPresentacion: ['.ui-bizagi-label label', '[class~="ui-bizagi-render"] label[for]', 'h3.ui-bizagi-container-group-header', '.bz-rn-grid-header-title', 'thead th label', '[role="tab"]'],
  /**
   * Componentes que PERSISTEN datos en el Work Portal (P-15, guardia DOM de solo lectura): zona de botones de la actividad o
   * del formulario de inicio, acciones de grilla (Adicionar/Guardar/Eliminar/Editar fila), botones de diálogos (Guardar,
   * Cancelar, Subir) y controles de carga de archivos. Clasificados por su función en Bizagi, no por el texto del botón.
   */
  componentesEscritura: ['.ui-bizagi-button-container button', '.ui-bizagi-button-container input', 'li[data-action]',
    '.ui-dialog-buttonpane button', '.ui-dialog-titlebar-close', 'li.ui-bizagi-render-upload-wrapper > a', 'input[type="file"]',
    '#btn-admin-cases-invalidate', '#btn-admin-case-invalidate', '#btn-admin-case-reassign', '#btn-admin-case-release', '#btn-admin-case-finish', '#btn-copyPermissions', '#btn-revokePermissions'],
  /** Notificación de Bizagi ("Debe revisar lo siguiente:"). Se registra como hallazgo, no se oculta. */
  notificacion: '.ui-bizagi-notifications-container, #NotificationCenter',
};
