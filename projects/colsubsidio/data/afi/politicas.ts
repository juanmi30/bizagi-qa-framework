import type { CampoAfi, PerfilActorAfi, PoliticaCampo } from './modelo';

/**
 * Políticas de los campos que el piloto AFI HU 14.12 realmente recorrió.
 * Son políticas, no datos: un valor solo aparece cuando es auxiliar determinístico
 * ya aceptado por QA en el piloto (y se marca con su motivo).
 *
 * Sensibilidad 'pii' conservadora: sigue la redacción que ya aplica errorSeguro().
 */
const BOGOTA = 'BOGOTÁ, D.C.';
const NO_EMPLEADOR = ['independiente', 'pensionado', 'facultativo'] as const;
/**
 * Exploración QA de Empleador PJ (estructura sanitizada, runner oficial, cleanup): "Información de contacto" presenta departamento
 * y ciudad como mat-select requeridos y vacíos, y Celular / Número de teléfono fijo (marcados *) vacíos, con Continuar
 * deshabilitado; el Correo electrónico llega PRECARGADO (se conserva según estado, no requiere dato). No hay pantalla Teléfonos.
 */
const CONTACTO_PJ_OBSERVADO = 'Exploración QA Empleador PJ, Información de contacto (estructura sanitizada)';
/**
 * Exploración QA Dirección Empleador PJ 2026-10-07 (runner oficial, caso propio cancelado, PII 0; fixture
 * tests/fixtures/estructura-direccion-pj-qa-observada.json): SOLO los 4 obligatorios diligenciados con valores generados
 * (catálogo observado; enteros 10-99 bajo maxlength 3) -> Continuar habilitado -> llegada a "Representante legal".
 * Opcionales vacíos y válidos; "Dirección completa" la compone el Portal (SYSTEM).
 */
const DIRECCION_PJ_OBSERVADA = 'Exploración QA Dirección Empleador PJ 2026-10-07: 4 obligatorios generados -> Continuar habilitado -> Representante legal';
const generableDireccionPj = (estrategia: 'opcion-dominio' | 'entero-rango', restricciones: Readonly<Record<string, unknown>>) => ({
  generable: { perfiles: ['empresa'] as const, etapa: 'direccion' as const, estrategia, restricciones, evidencia: { tipo: 'qa-observado' as const, referencia: DIRECCION_PJ_OBSERVADA } },
  obligatorioParaAvanzar: true, evidencia: DIRECCION_PJ_OBSERVADA,
});
const ENTERO_DIRECCION_PJ = { min: 10, max: 99, maxlength: 3 } as const;
const OPCIONAL_DIRECCION_PJ = { obligatorioParaAvanzar: false, evidencia: `${DIRECCION_PJ_OBSERVADA} (opcional: vacío y válido)` } as const;
/** 4S-R.1: hechos de NEGOCIO de la empresa (no son de prueba): solo del actor; nunca auxiliares ni inventados. */
const DATO_EMPRESA = {
  etapa: 'informacion-empresa', control: 'text', obligatorioParaAvanzar: 'no-verificado', sensibilidad: 'pii',
  delActor: true, perfiles: ['empresa'], segunEstado: true,
} as const;

const politicas: Record<CampoAfi, PoliticaCampo> = {
  // ---------- inicio-solicitud ----------
  tipoAportante: {
    etapa: 'inicio-solicitud', control: 'select', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: true,
    evidencia: 'prepararSolicitud: elegirConfigurado exacto; define la regla territorial de HU 14.12 (CP01 vs CP04)',
  },
  tipoAfiliado: {
    etapa: 'inicio-solicitud', control: 'select', obligatorioParaAvanzar: true, sensibilidad: 'pii',
    delActor: true, perfiles: NO_EMPLEADOR,
    auxiliar: { tipo: 'first-valid-option', orden: 'alfabetico' },
    evidencia: 'CP01 lo toma de AFI_CP01_TIPO_AFILIADO; CP04 elige la primera habilitada en orden alfabético',
  },
  tipoEmpleador: {
    etapa: 'inicio-solicitud', control: 'select', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: true, perfiles: ['empresa'],
    evidencia: 'perfilesAfi.empresa.empleador.tipo',
  },
  naturaleza: {
    etapa: 'inicio-solicitud', control: 'select', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: true, perfiles: ['empresa'],
    auxiliar: { tipo: 'first-valid-option', orden: 'alfabetico' },
    evidencia: 'CP04 Empresa: sin configurar, primera habilitada en orden alfabético',
  },
  claseEmpleador: {
    etapa: 'inicio-solicitud', control: 'select', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: true, perfiles: ['empresa'],
    auxiliar: { tipo: 'first-valid-option', orden: 'alfabetico' },
    evidencia: 'CP04 Empresa: sin configurar, primera habilitada en orden alfabético',
  },
  tipoIdentificacion: {
    etapa: 'inicio-solicitud', control: 'select', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: true,
    evidencia: 'perfilesAfi / AFI_CP01_TIPO_IDENTIFICACION; debe corresponder a la identidad QA',
  },
  numeroIdentificacion: {
    etapa: 'inicio-solicitud', control: 'text', obligatorioParaAvanzar: true, sensibilidad: 'pii',
    delActor: true,
    evidencia: 'Identidad QA real (AFI_QA_*_IDENTIFICACION / AFI_CP01_NUMERO_IDENTIFICACION); nunca se inventa',
  },
  correo: {
    etapa: 'inicio-solicitud', control: 'text', obligatorioParaAvanzar: true, sensibilidad: 'pii',
    delActor: true,
    evidencia: 'AFI_QA_CORREO / AFI_CP01_CORREO',
  },
  confirmacionCorreo: {
    etapa: 'inicio-solicitud', control: 'text', obligatorioParaAvanzar: true, sensibilidad: 'pii',
    delActor: false,
    derivacion: { dependeDe: ['correo'], derivar: ({ correo }) => correo },
    evidencia: 'CP04 usa confirmacionCorreo: actor.correo',
  },
  recibioAyudaAsesor: {
    etapa: 'inicio-solicitud', control: 'radio', obligatorioParaAvanzar: 'no-verificado', sensibilidad: 'public',
    delActor: false, perfiles: ['empresa'],
    auxiliar: { tipo: 'deterministic-text', valor: 'No', motivo: 'La solicitud QA automatizada se prepara sin asesor' },
    evidencia: 'prepararSolicitud: #recibioAyudaAsesorNo para empleador',
  },
  autorizaDatos: {
    etapa: 'inicio-solicitud', control: 'checkbox', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: false,
    auxiliar: { tipo: 'boolean-required', valor: true, motivo: 'Autorización necesaria para habilitar Continuar' },
    evidencia: 'autorizar("terminos"); CP04 usa autorizaDatos: true',
  },
  autorizaIntimidad: {
    etapa: 'inicio-solicitud', control: 'checkbox', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: false,
    auxiliar: { tipo: 'boolean-required', valor: true, motivo: 'Autorización necesaria para habilitar Continuar' },
    evidencia: 'autorizar("intimidad"); CP04 usa autorizaIntimidad: true',
  },

  // ---------- informacion-empresa (4S-R.1, Empleador Persona Jurídica; preparación SEGÚN ESTADO) ----------
  razonSocial: {
    ...DATO_EMPRESA,
    evidencia: 'Snapshot PJ 06-Oct: habilitado, vacío e inválido (el 02-Oct llegó deshabilitado: precarga RUES). Identidad de la '
      + 'empresa: solo actor, jamás auxiliar',
  },
  codigoCiiu: {
    ...DATO_EMPRESA, control: 'autocomplete', obligatorioParaAvanzar: true,
    evidencia: 'Snapshot PJ 06-Oct: requerido, habilitado, vacío. Que el catálogo sea cerrado solo prueba validez SINTÁCTICA para el '
      + 'control, no que un CIIU sea el de la empresa: dato del actor; se busca y se elige SOLO la opción que coincide',
  },
  actividadEconomicaEmpresa: {
    ...DATO_EMPRESA,
    evidencia: 'Snapshot PJ 06-Oct: habilitado, vacío e inválido. Sigue al CIIU en REQ 7.14; se re-evalúa tras el CIIU (el Portal '
      + 'podría derivarlo). Distinto de "actividad" del Independiente',
  },
  fechaInicioActividad: { ...DATO_EMPRESA, evidencia: 'Snapshot PJ 06-Oct: habilitado, vacío e inválido' },
  valorNomina: { ...DATO_EMPRESA, evidencia: 'Snapshot PJ 06-Oct: habilitado, con contenido e inválido' },
  numeroTrabajadores: { ...DATO_EMPRESA, evidencia: 'Snapshot PJ 06-Oct: habilitado, vacío e inválido' },
  cajaCompensacionAnterior: {
    ...DATO_EMPRESA, control: 'autocomplete',
    evidencia: 'Smoke PJ 06-Oct (4S-R.2): "Caja de compensación anterior" aparece DESPUÉS de responder "¿Afiliado por primera vez?" '
      + '(requerido, habilitado, vacío, inválido). Hecho de la empresa: solo actor, opción exacta del catálogo; nunca la primera',
  },
  afiliadoPrimeraVez: {
    ...DATO_EMPRESA, control: 'radio',
    evidencia: 'Snapshot PJ 06-Oct: radios Si/No sin marcar, inválido. Condiciona "Caja de compensación anterior" (REQ 7.14): no es neutral',
  },

  // ---------- telefonos ----------
  numeroCelular: {
    etapa: 'telefonos', control: 'text', obligatorioParaAvanzar: true, sensibilidad: 'pii',
    delActor: true, perfiles: NO_EMPLEADOR,
    porPerfil: { empresa: { etapa: 'informacion-contacto', obligatorioParaAvanzar: true, evidencia: `${CONTACTO_PJ_OBSERVADO}: "Celular *" vacío` } },
    evidencia: 'completarTelefonos / CP04 pensionado-facultativo con AFI_CP01_NUM_CEL',
  },
  numeroTelefonoFijo: {
    etapa: 'telefonos', control: 'text', obligatorioParaAvanzar: 'no-verificado', sensibilidad: 'pii',
    delActor: true, perfiles: NO_EMPLEADOR,
    porPerfil: { empresa: { etapa: 'informacion-contacto', obligatorioParaAvanzar: true, evidencia: `${CONTACTO_PJ_OBSERVADO}: "Número de teléfono fijo *" vacío` } },
    evidencia: 'completarTelefonos / CP04 pensionado-facultativo con AFI_CP01_NUM_CEL_FIJO',
  },

  // ---------- informacion-adicional ----------
  fondoPensiones: {
    etapa: 'informacion-adicional', control: 'autocomplete', obligatorioParaAvanzar: true, sensibilidad: 'pii',
    delActor: true, perfiles: ['independiente', 'facultativo'],
    auxiliar: { tipo: 'first-valid-autocomplete' },
    evidencia: 'Independiente: "QA autoriza cualquier opción válida" si no llega precargado; Facultativo: AFI_QA_FACULTATIVO_FONDO_PENSIONES',
  },
  actividad: {
    etapa: 'informacion-adicional', control: 'select', obligatorioParaAvanzar: true, sensibilidad: 'pii',
    delActor: true, perfiles: ['independiente'],
    evidencia: 'completarInformacionAdicional: opción exacta AFI_CP01_ACTIVIDAD',
  },
  ingresoMensual: {
    etapa: 'informacion-adicional', control: 'text', obligatorioParaAvanzar: true, sensibilidad: 'pii',
    delActor: true, perfiles: ['independiente'],
    evidencia: 'completarInformacionAdicional: AFI_CP01_INGRESO_MENSUAL',
  },
  nacionalidad: {
    etapa: 'informacion-adicional', control: 'select', obligatorioParaAvanzar: true, sensibilidad: 'pii',
    delActor: true, perfiles: ['facultativo'],
    auxiliar: { tipo: 'first-valid-option', orden: 'catalogo' },
    evidencia: 'completarInformacionAdicionalFacultativo: AFI_QA_FACULTATIVO_NACIONALIDAD; irrelevante para HU 14.12',
  },
  estadoCivil: {
    etapa: 'informacion-adicional', control: 'select', obligatorioParaAvanzar: true, sensibilidad: 'pii',
    delActor: true, perfiles: ['facultativo'],
    auxiliar: { tipo: 'first-valid-option', orden: 'catalogo' },
    evidencia: 'completarInformacionAdicionalFacultativo: AFI_QA_FACULTATIVO_ESTADO_CIVIL; irrelevante para HU 14.12',
  },
  salarioBasico: {
    etapa: 'informacion-adicional', control: 'text', obligatorioParaAvanzar: true, sensibilidad: 'pii',
    delActor: true, perfiles: ['facultativo'],
    evidencia: 'AFI_QA_FACULTATIVO_SALARIO_BASICO; validación de rango no demostrada, no se inventa',
  },

  // ---------- informacion-contacto ----------
  departamento: {
    etapa: 'informacion-contacto', control: 'autocomplete', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: false,
    auxiliar: { tipo: 'first-valid-option', orden: 'catalogo' },
    porPerfil: { empresa: { control: 'select', evidencia: CONTACTO_PJ_OBSERVADO } },
    evidencia: 'Objeto de assertion en CP01/CP02/CP04; CP03 P08 lo usa solo para avanzar',
  },
  ciudadVivienda: {
    etapa: 'informacion-contacto', control: 'autocomplete', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: false,
    derivacion: { dependeDe: ['departamento'], derivar: ({ departamento }) => departamento === BOGOTA ? BOGOTA : undefined },
    auxiliar: { tipo: 'first-valid-autocomplete', inicioAlfabetico: true },
    porPerfil: { empresa: { control: 'select', evidencia: CONTACTO_PJ_OBSERVADO } },
    evidencia: 'CP01 P07 / CP02 P09: Bogotá precarga y bloquea la ciudad; CP02 P07 filtra por prefijo',
  },
  localidad: {
    etapa: 'informacion-contacto', control: 'autocomplete', obligatorioParaAvanzar: 'no-verificado', sensibilidad: 'public',
    delActor: false, perfiles: ['independiente'],
    auxiliar: { tipo: 'first-valid-autocomplete', inicioAlfabetico: true },
    evidencia: 'CP02 opcionValida(); solo aparece para algunos municipios',
  },
  barrio: {
    etapa: 'informacion-contacto', control: 'autocomplete', obligatorioParaAvanzar: 'no-verificado', sensibilidad: 'public',
    delActor: false, perfiles: ['independiente'],
    auxiliar: { tipo: 'first-valid-autocomplete', inicioAlfabetico: true },
    evidencia: 'CP02 opcionValida(); CP01 P16 exige un barrio válido para avanzar',
  },

  // ---------- direccion ----------
  viaPrincipal: {
    etapa: 'direccion', control: 'select', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: false, perfiles: ['independiente'],
    auxiliar: { tipo: 'first-valid-option', orden: 'catalogo' },
    porPerfil: { empresa: generableDireccionPj('opcion-dominio', { dominio: 'catálogo observado en pantalla', seleccion: 'opcionDeDominio(semilla HU|CP|versión|campo)' }) },
    evidencia: 'completarDireccionCertificada (CP01 P16 usa "Avenida Calle")',
  },
  letrasVp: {
    etapa: 'direccion', control: 'select', obligatorioParaAvanzar: 'no-verificado', sensibilidad: 'public',
    delActor: false, perfiles: ['independiente'],
    auxiliar: { tipo: 'first-valid-option', orden: 'catalogo' },
    porPerfil: { empresa: OPCIONAL_DIRECCION_PJ },
    evidencia: 'completarDireccionCertificada',
  },
  sectorVp: {
    etapa: 'direccion', control: 'select', obligatorioParaAvanzar: 'no-verificado', sensibilidad: 'public',
    delActor: false, perfiles: ['independiente'],
    auxiliar: { tipo: 'first-valid-option', orden: 'catalogo' },
    porPerfil: { empresa: OPCIONAL_DIRECCION_PJ },
    evidencia: 'completarDireccionCertificada',
  },
  letrasVg: {
    etapa: 'direccion', control: 'select', obligatorioParaAvanzar: 'no-verificado', sensibilidad: 'public',
    delActor: false, perfiles: ['independiente'],
    auxiliar: { tipo: 'first-valid-option', orden: 'catalogo' },
    porPerfil: { empresa: OPCIONAL_DIRECCION_PJ },
    evidencia: 'completarDireccionCertificada',
  },
  numeroVp: {
    etapa: 'direccion', control: 'text', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: false, perfiles: ['independiente'],
    auxiliar: { tipo: 'deterministic-number', valor: '16', motivo: 'Valor aceptado en QA (soporte CP01 P16)' },
    porPerfil: { empresa: generableDireccionPj('entero-rango', ENTERO_DIRECCION_PJ) },
    evidencia: 'completarDireccionCertificada',
  },
  numeroVg: {
    etapa: 'direccion', control: 'text', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: false, perfiles: ['independiente'],
    auxiliar: { tipo: 'deterministic-number', valor: '8', motivo: 'Valor aceptado en QA (soporte CP01 P16)' },
    porPerfil: { empresa: generableDireccionPj('entero-rango', ENTERO_DIRECCION_PJ) },
    evidencia: 'completarDireccionCertificada',
  },
  numeroPredio: {
    etapa: 'direccion', control: 'text', obligatorioParaAvanzar: true, sensibilidad: 'public',
    delActor: false, perfiles: ['independiente'],
    auxiliar: { tipo: 'deterministic-number', valor: '8', motivo: 'Valor aceptado en QA (soporte CP01 P16)' },
    porPerfil: { empresa: generableDireccionPj('entero-rango', ENTERO_DIRECCION_PJ) },
    evidencia: 'completarDireccionCertificada',
  },
};

function congelar<T>(objeto: T): T {
  if (objeto && typeof objeto === 'object' && !Object.isFrozen(objeto)) {
    Object.freeze(objeto);
    for (const valor of Object.values(objeto)) congelar(valor);
  }
  return objeto;
}

/** Inmutables: un actor o un caso nunca cambian las políticas. */
export const POLITICAS_AFI: Readonly<Record<CampoAfi, PoliticaCampo>> = congelar(politicas);

/**
 * Políticas EFECTIVAS de un perfil: la base con sus variantes observadas (`porPerfil`). Un perfil sin variantes recibe las
 * mismas políticas base; una variante hace aplicable el campo a ese perfil aunque la base lo restrinja a otros.
 */
export function politicasDelPerfil(perfil: PerfilActorAfi, base: Readonly<Record<CampoAfi, PoliticaCampo>> = POLITICAS_AFI): Readonly<Record<CampoAfi, PoliticaCampo>> {
  const r = {} as Record<CampoAfi, PoliticaCampo>;
  for (const campo of Object.keys(base) as CampoAfi[]) {
    const p = base[campo], v = p.porPerfil?.[perfil];
    if (!v) { r[campo] = p; continue; }
    const { evidencia, ...cambios } = v;
    const efectiva: PoliticaCampo = { ...p, ...cambios, ...(p.perfiles && !p.perfiles.includes(perfil) ? { perfiles: [...p.perfiles, perfil] } : {}), evidencia: `${p.evidencia} | ${perfil}: ${evidencia}` };
    // Con autorización generable propia, la estrategia auxiliar de la base (evidencia de otro perfil) no aplica a este perfil.
    if (v.generable) delete efectiva.auxiliar;
    r[campo] = efectiva;
  }
  return r;
}
