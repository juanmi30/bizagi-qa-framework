import { expect, type Locator, type Page } from '@playwright/test';
import type { DatosFacultativo } from '../data/actoresAfi';
import { errorSaneado } from '../data/afi/redaccionSegura';
import { opcionDeDominio } from '../data/afi/datosPrueba/generacion';

export const AFI_HOME = 'https://transacciones.colsubsidio.com/afiliaciones-en-linea/qa/home';
export const ALERTA_TERRITORIAL = 'Solo puedes afiliarte si resides en Bogotá o Cundinamarca. Si vives en otro departamento, debes buscar la caja correspondiente a tu región.';
export const normalizarEspacios = (texto: string): string => texto.replace(/\s+/g, ' ').trim();

export interface SolicitudAfi {
  tipoAportante: string;
  /** Omitir únicamente cuando cualquier opción habilitada sea funcionalmente neutra. */
  tipoAfiliado?: string;
  empleador?: { tipo: string; naturaleza?: string; clase?: string };
  tipoIdentificacion: string;
  numeroIdentificacion: string;
  correo: string;
  confirmacionCorreo: string;
  autorizaDatos: boolean;
  autorizaIntimidad: boolean;
}

export function variable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor?.trim()) throw new Error(`Falta ${nombre}`);
  return valor;
}

function booleano(nombre: string): boolean {
  const valor = variable(nombre).trim().toLowerCase();
  if (['true', '1', 'si', 'sí'].includes(valor)) return true;
  if (['false', '0', 'no'].includes(valor)) return false;
  throw new Error(`Booleano inválido: ${nombre}`);
}

export function validarDatosCP01(): void {
  for (const campo of ['TIPO_APORTANTE', 'TIPO_AFILIADO', 'TIPO_IDENTIFICACION',
    'NUMERO_IDENTIFICACION', 'CORREO', 'CONFIRMACION_CORREO', 'AUTORIZA_DATOS', 'AUTORIZA_INTIMIDAD']) {
    variable(`AFI_CP01_${campo}`);
  }
  booleano('AFI_CP01_AUTORIZA_DATOS');
  booleano('AFI_CP01_AUTORIZA_INTIMIDAD');
}

/**
 * Evita que errores de fill/select y assertions impriman configuración privada. Delegado en redaccionSegura (4S-R.1):
 * conserva la CLASE del error y su metadata, y no deforma texto normal con valores cortos (sin reemplazo por substring).
 */
export function errorSeguro(error: unknown, entorno: Readonly<Record<string, string | undefined>> = process.env): Error {
  return errorSaneado(error, entorno);
}

/** Pantalla del Portal que impide crear el trámite porque el aportante ya tiene uno abierto (texto público de la UI). */
export const SOLICITUD_EN_CURSO = 'Ya tienes una solicitud en curso';

/**
 * PRECONDICIÓN DE DATOS no cumplida (no es un fallo del framework ni de la UI): el actor tiene una solicitud de afiliación en
 * curso, así que el Portal no crea el caso. Nunca se reintenta ni se cancela un trámite ajeno.
 */
export class SolicitudEnCursoError extends Error {
  readonly clasificacion = 'TEST_DATA_GAP';
  readonly precondicion = 'sin-solicitud-afiliacion-en-curso';
  constructor() {
    super(`El Portal no creó el caso: "${SOLICITUD_EN_CURSO}". El actor no cumple la precondición "sin solicitud de afiliación en curso".`);
    this.name = 'SolicitudEnCursoError';
  }
}

/** (4S-R.2) Evidencia SEGURA de una interacción de autocomplete: solo booleanos y conteos (nunca textos de opciones). */
export interface DetalleAutocomplete { panelAbierto: boolean; opcionesVisibles: number; coincidencias: number; clic: boolean; verificada: boolean }

export class AfiliacionesPortal {
  constructor(readonly page: Page) {}

  async abrir(): Promise<void> {
    await this.page.goto(AFI_HOME, { waitUntil: 'domcontentloaded' });
    await expect(this.page.getByRole('button', { name: 'Iniciar solicitud de afiliación', exact: true })).toBeVisible({ timeout: 45_000 });
  }

  /** Mat-select puede ignorar el clic mientras su catálogo todavía está vacío. */
  async abrirCatalogo(control: Locator): Promise<Locator> {
    await expect(async () => {
      if (await control.getAttribute('aria-expanded') !== 'true') await control.click();
      const panelId = await control.getAttribute('aria-controls');
      expect(panelId, 'El control debe asociar un panel').toBeTruthy();
      await expect(this.page.locator(`[id="${panelId}"]`).getByRole('option').first()).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 45_000, intervals: [500, 1_000, 2_000] });
    const panelId = await control.getAttribute('aria-controls');
    return this.page.locator(`[id="${panelId}"]`);
  }

  /** Primitiva reutilizada por afiDataUi: selecciona EXACTAMENTE el valor. */
  async elegirConfigurado(campo: string, valor: string): Promise<void> {
    await this.elegirExactoEn(this.page.locator(`mat-select[formcontrolname="${campo}"]`), valor);
  }

  /** Misma primitiva sobre un control ya localizado (catálogos identificados por id en el piloto). */
  async elegirExactoEn(control: Locator, valor: string): Promise<void> {
    const panel = await this.abrirCatalogo(control);
    const opcion = panel.getByRole('option', { name: valor, exact: true });
    // No inferir ni normalizar a otro producto/tipo de afiliado. poll: el mensaje de fallo no incluye el locator
    // (que lleva el valor, posiblemente PII), igual que elegirAutocompleteExacto.
    await expect.poll(() => opcion.count(), { message: 'Catálogo: debe existir exactamente una opción igual al valor configurado' }).toBe(1);
    await opcion.click();
    await expect(panel).toBeHidden();
  }

  /** Presupuesto ÚNICO de la lectura del PDF en autorizar(); protegido para pruebas rápidas. */
  protected presupuestoAutorizacion = { timeout: 45_000, intervals: [300, 500, 1_000] };

  /** Primitiva reutilizada por afiDataUi: flujo real de autorización con lectura del documento. */
  async autorizar(campo: string, autorizado: boolean, titulo: string): Promise<void> {
    const casilla = this.page.locator(`input[formcontrolname="${campo}"]`);
    if (!autorizado) {
      await expect(casilla).not.toBeChecked();
      return;
    }
    await casilla.click();
    const dialogo = this.page.getByRole('dialog', { name: titulo, exact: true });
    await expect(dialogo).toBeVisible();
    const visor = dialogo.locator('.ng2-pdf-viewer-container');
    const aceptar = dialogo.getByRole('button', { name: 'Aceptar', exact: true });
    const corto = { timeout: 2_000 };
    const estadoVisor = () => visor.evaluate(el => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollTop: Math.round(el.scrollTop) }), undefined, corto);
    const aceptarBloqueado = () => aceptar.evaluate(el => el.classList.contains('disabled') || (el as HTMLButtonElement).disabled, undefined, corto);
    // Estado funcional, no "scrollable en 15 s": el PDF puede tardar en renderizar o caber completo.
    // Sin volver a pulsar la casilla: solo se observa el visor y se desplaza.
    try {
      await expect(async () => {
        if (!await aceptarBloqueado()) return; // Documento completo visible: Aceptar ya habilitado.
        const { scrollHeight, clientHeight } = await estadoVisor();
        if (scrollHeight <= clientHeight) throw new Error('PDF aún sin overflow y Aceptar bloqueado');
        await visor.hover(corto);
        await this.page.mouse.wheel(0, 1_200);
        await expect.poll(() => visor.evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 3, undefined, corto), { timeout: 1_000 }).toBe(true);
        await expect(aceptar).not.toHaveClass(/\bdisabled\b/, corto);
      }).toPass(this.presupuestoAutorizacion);
    } catch (error) {
      const leer = async <T>(f: () => Promise<T>) => { try { return await f(); } catch { return undefined; } };
      const sn = (b: boolean | undefined) => (b === undefined ? 'desconocido' : b ? 'sí' : 'no');
      const v = await leer(estadoVisor), bloqueado = await leer(aceptarBloqueado);
      throw new Error(`No se pudo completar la autorización "${campo}" ("${titulo}"): dialogoVisible=${sn(await leer(() => dialogo.isVisible()))}, `
        + `visorVisible=${sn(await leer(() => visor.isVisible()))}, scrollable=${sn(v && v.scrollHeight > v.clientHeight)}, `
        + `scrollHeight=${v?.scrollHeight ?? '?'}, clientHeight=${v?.clientHeight ?? '?'}, scrollTop=${v?.scrollTop ?? '?'}, `
        + `aceptarBloqueado=${sn(bloqueado)}`, { cause: error });
    }
    await expect(aceptar).toBeEnabled();
    await aceptar.click();
    await expect(dialogo).toBeHidden();
    await expect(casilla).toBeChecked();
  }

  async preparar(): Promise<void> {
    await this.prepararSolicitud({
      tipoAportante: variable('AFI_CP01_TIPO_APORTANTE'),
      tipoAfiliado: variable('AFI_CP01_TIPO_AFILIADO'),
      tipoIdentificacion: variable('AFI_CP01_TIPO_IDENTIFICACION'),
      numeroIdentificacion: variable('AFI_CP01_NUMERO_IDENTIFICACION'),
      correo: variable('AFI_CP01_CORREO'),
      confirmacionCorreo: variable('AFI_CP01_CONFIRMACION_CORREO'),
      autorizaDatos: booleano('AFI_CP01_AUTORIZA_DATOS'),
      autorizaIntimidad: booleano('AFI_CP01_AUTORIZA_INTIMIDAD'),
    });
  }

  async prepararSolicitud(datos: SolicitudAfi, registrar?: (campo: string, opciones: string[], seleccion: string) => Promise<void>): Promise<void> {
    await this.iniciarSolicitud();
    await this.elegirConfigurado('tipoAportante', datos.tipoAportante);
    const campos: [string, string | undefined][] = datos.empleador
      ? [['tipoEmpleador', datos.empleador.tipo], ['naturaleza', datos.empleador.naturaleza], ['claseEmpleador', datos.empleador.clase]]
      : [['tipoAfiliado', datos.tipoAfiliado]];
    for (const [campo, configurado] of campos) {
      if (configurado !== undefined) { await this.elegirConfigurado(campo, configurado); continue; }
      await this.elegirPrimeraHabilitada(campo, 'alfabetico', registrar);
    }
    const tipoIde = this.page.locator('mat-select[formcontrolname="tipoIde"]');
    if (datos.empleador && await tipoIde.isDisabled()) {
      await expect(tipoIde).toHaveText(datos.tipoIdentificacion);
    } else await this.elegirConfigurado('tipoIde', datos.tipoIdentificacion);
    await this.escribirIdentificacion(datos.numeroIdentificacion);
    await this.escribirCorreo('correoElectronico', datos.correo);
    await this.escribirCorreo('correoElectronicoConfirmacion', datos.confirmacionCorreo);
    // La solicitud QA automatizada de Empresa se prepara sin intervención de un asesor.
    if (datos.empleador) await this.elegirRadio('recibioAyudaAsesorNo');
    await this.autorizar('terminos', datos.autorizaDatos, 'Autorización para el tratamiento de datos');
    await this.autorizar('intimidad', datos.autorizaIntimidad, 'Autorización para el derecho de intimidad');
    await this.esperarInicioCompleto();
  }

  // ---- Primitivas de inicio-solicitud (compartidas con afiDataUi) ----

  async iniciarSolicitud(): Promise<void> {
    await this.page.getByRole('button', { name: 'Iniciar solicitud de afiliación', exact: true }).click();
  }

  /** Primera opción visible, habilitada y no placeholder; nunca inventa un valor fuera del catálogo. */
  async elegirPrimeraHabilitada(campo: string, orden: 'catalogo' | 'alfabetico',
    registrar?: (campo: string, opciones: string[], seleccion: string) => Promise<void>): Promise<{ opciones: string[]; seleccion: string }> {
    return this.elegirPrimeraHabilitadaEn(this.page.locator(`mat-select[formcontrolname="${campo}"]`), orden, registrar, campo);
  }

  /** GENERATED: opción determinista (opcionDeDominio) entre las habilitadas del catálogo observado. Nunca la primera implícita. */
  async elegirOpcionGeneradaEn(control: Locator, semilla: string): Promise<{ opciones: string[]; seleccion: string }> {
    const panel = await this.abrirCatalogo(control);
    const habilitadas = panel.locator('[role="option"]:visible:not([aria-disabled="true"])');
    await expect(habilitadas.first()).toBeEnabled();
    const opciones = (await habilitadas.allTextContents()).map(normalizarEspacios).filter(t => t && !/^(Selecciona|Seleccione)\b/i.test(t));
    const seleccion = opcionDeDominio(opciones, semilla);
    await panel.getByRole('option', { name: seleccion, exact: true }).click();
    await expect(panel).toBeHidden();
    return { opciones, seleccion };
  }

  /** Misma primitiva sobre un control ya localizado (catálogos identificados por id en el piloto). */
  async elegirPrimeraHabilitadaEn(control: Locator, orden: 'catalogo' | 'alfabetico',
    registrar?: (campo: string, opciones: string[], seleccion: string) => Promise<void>, campo = 'catálogo'): Promise<{ opciones: string[]; seleccion: string }> {
    const panel = await this.abrirCatalogo(control);
    const habilitadas = panel.locator('[role="option"]:visible:not([aria-disabled="true"])');
    await expect(habilitadas.first()).toBeEnabled();
    const opciones = (await habilitadas.allTextContents()).map(normalizarEspacios)
      .filter(texto => texto && !/^(Selecciona|Seleccione)\b/i.test(texto));
    const seleccion = (orden === 'alfabetico' ? [...opciones].sort((a, b) => a.localeCompare(b, 'es')) : opciones)[0];
    expect(seleccion, `${campo}: opción pública habilitada`).toBeTruthy();
    await registrar?.(campo, opciones, seleccion);
    await panel.getByRole('option', { name: seleccion, exact: true }).click();
    await expect(panel).toBeHidden();
    return { opciones, seleccion };
  }

  /**
   * Primitiva reutilizada por afiDataUi (generaliza el fondo del piloto Independiente): en un autocomplete
   * VACÍO y habilitado, abre el catálogo, espera que sea estable y elige UNA vez la primera opción visible y
   * habilitada en el orden del catálogo (opcionalmente solo las que empiezan por letra). Si ya trae valor,
   * no lo toca. Falla cerrado: sin opción válida, opción ambigua, catálogo vacío/inestable o campo inválido.
   * Los mensajes nunca incluyen valores (el campo puede ser PII).
   */
  async elegirPrimeraSugerenciaValida(campo: Locator, inicioAlfabetico: boolean): Promise<
    { modo: 'precargado'; valor: string } | { modo: 'ejecutado'; valor: string; opciones: string[] }
  > {
    await expect(campo, 'Autocomplete visible').toBeVisible();
    const actual = normalizarEspacios(await campo.inputValue());
    if (actual) {
      await expect(campo, 'Autocomplete precargado válido').not.toHaveClass(/\bng-invalid\b/);
      return { modo: 'precargado', valor: actual };
    }
    await expect(campo, 'Autocomplete vacío y editable').toBeEditable();
    const panel = await this.abrirCatalogo(campo);
    // Catálogo completo y estable (misma regla que catalogoEstable, sin importar ese helper para evitar un ciclo).
    expect(await panel.locator('cdk-virtual-scroll-viewport,.cdk-virtual-scroll-content-wrapper').count(), 'Autocomplete sin virtualización').toBe(0);
    const habilitadas = panel.locator('[role="option"]:visible:not([aria-disabled="true"])');
    let opciones: string[] = [], anterior = '', iguales = 0;
    await expect.poll(async () => {
      opciones = (await habilitadas.allTextContents()).map(normalizarEspacios);
      const actual = JSON.stringify(opciones);
      // abrirCatalogo ya exigió una opción visible; aquí la lista de HABILITADAS puede ser estable y vacía (=> falla abajo).
      iguales = actual === anterior ? iguales + 1 : 0;
      anterior = actual;
      return iguales;
    }, { message: 'Autocomplete: catálogo estable', timeout: 30_000, intervals: [300, 500, 1_000] }).toBeGreaterThanOrEqual(2);
    const validas = opciones.filter(o => o && !/^(Selecciona|Seleccione)\b/i.test(o) && (!inicioAlfabetico || /^\p{L}/u.test(o)));
    expect(validas.length, 'Autocomplete: al menos una opción válida habilitada').toBeGreaterThan(0);
    const [seleccion] = validas;
    const opcion = panel.getByRole('option', { name: seleccion, exact: true });
    expect(await opcion.count(), 'Autocomplete: la opción elegida debe ser inequívoca').toBe(1);
    await opcion.click();
    await expect(panel).toBeHidden();
    await expect.poll(async () => normalizarEspacios(await campo.inputValue()) === seleccion, { message: 'Autocomplete: opción seleccionada' }).toBe(true);
    await campo.blur();
    await expect(campo, 'Autocomplete válido tras seleccionar').not.toHaveClass(/\bng-invalid\b/);
    return { modo: 'ejecutado', valor: seleccion, opciones: validas };
  }

  /**
   * (4S-R.1) Autocompletar PREDICTIVO: escribe el valor dado, espera sugerencias estables y elige la ÚNICA opción habilitada
   * que `coincide`. Nunca otra (ni la primera por conveniencia). Sin coincidencia única devuelve el motivo y el llamador
   * decide la taxonomía. Ningún mensaje incluye el valor (puede ser dato del actor).
   *
   * Verificación SEMÁNTICA tras el click: el Portal puede mostrar en el input una representación distinta del label de la
   * opción (p. ej. solo el código). Se acepta lo mostrado si `coincide` con el valor pedido (misma regla segura) y el control
   * queda válido; vacío, otro código (también uno más largo, "47110" para "4711") o control inválido -> 'no-verificada'.
   */
  async elegirSugerenciaCoincidente(campo: Locator, valor: string, coincide: (opcion: string) => boolean, espera = 15_000): Promise<
    ({ resultado: 'seleccionada'; seleccion: string } | { resultado: 'sin-coincidencia' | 'ambigua' | 'no-verificada' }) & { detalle: DetalleAutocomplete }
  > {
    const detalle: DetalleAutocomplete = { panelAbierto: false, opcionesVisibles: 0, coincidencias: 0, clic: false, verificada: false };
    const fin = <R extends string>(resultado: R) => ({ resultado, detalle });
    await expect(campo, 'Autocomplete visible').toBeVisible();
    await expect(campo, 'Autocomplete vacío y editable').toBeEditable();
    await campo.click();
    await campo.fill('');
    await campo.pressSequentially(valor);
    let opciones: string[] = [], anterior = '', iguales = 0, panel: Locator | undefined;
    try {
      await expect.poll(async () => {
        if (await campo.getAttribute('aria-expanded') !== 'true') await campo.click();
        const id = await campo.getAttribute('aria-controls');
        if (!id) return false;
        panel = this.page.locator(`[id="${id}"]`);
        opciones = (await panel.locator('[role="option"]:visible:not([aria-disabled="true"])').allTextContents()).map(normalizarEspacios);
        const actual = JSON.stringify(opciones);
        iguales = actual === anterior ? iguales + 1 : 0;
        anterior = actual;
        if (panel && await campo.getAttribute('aria-expanded') === 'true') detalle.panelAbierto = true;
        return opciones.length > 0 && iguales >= 2;
      }, { message: 'Autocomplete: sugerencias estables', timeout: espera, intervals: [300, 500, 1_000] }).toBe(true);
    } catch { detalle.opcionesVisibles = opciones.length; return fin('sin-coincidencia'); }
    detalle.opcionesVisibles = opciones.length;
    const coincidentes = opciones.filter(coincide);
    detalle.coincidencias = coincidentes.length;
    if (!coincidentes.length) return fin('sin-coincidencia');
    // Inequívoca: exactamente UNA opción visible coincide (dos textos iguales también son ambigüedad).
    if (coincidentes.length > 1) return fin('ambigua');
    const [seleccion] = coincidentes;
    const opcion = panel!.getByRole('option', { name: seleccion, exact: true });
    if (await opcion.count() !== 1) return fin('ambigua');
    await opcion.click();
    detalle.clic = true;
    // Cierre y estabilización del autocompletar; luego, lo que REALMENTE muestra el control (nunca el label de la opción).
    await expect(panel!).toBeHidden();
    await campo.blur();
    const invalido = () => campo.evaluate(e => e.classList.contains('ng-invalid') || e.getAttribute('aria-invalid') === 'true');
    try {
      await expect.poll(async () => coincide(normalizarEspacios(await campo.inputValue())) && !await invalido(),
        { message: 'Autocomplete: selección verificada', timeout: espera, intervals: [250, 500, 1_000] }).toBe(true);
    } catch { return fin('no-verificada'); }
    detalle.verificada = true;
    return { resultado: 'seleccionada', seleccion, detalle };
  }

  async escribirIdentificacion(valor: string): Promise<void> {
    const identificacion = this.page.locator('input[formcontrolname="identificacion"]');
    await expect(identificacion).toHaveAttribute('readonly', '');
    await identificacion.click();
    await expect(identificacion).toBeEditable();
    await identificacion.pressSequentially(valor);
    expect(await identificacion.inputValue() === valor, 'Identificación ingresada correctamente').toBe(true);
  }

  async escribirCorreo(campo: 'correoElectronico' | 'correoElectronicoConfirmacion', valor: string): Promise<void> {
    const correo = this.page.locator(`[formcontrolname="${campo}"]`);
    await correo.click();
    await correo.fill(valor);
    expect(await correo.innerText() === valor, `${campo}: valor ingresado correctamente`).toBe(true);
  }

  async elegirRadio(id: string): Promise<void> {
    await this.page.locator(`#${id}`).check();
  }

  async esperarInicioCompleto(): Promise<void> {
    await expect(this.page.locator('#btn-inicio-solicitud-continuar')).toBeEnabled();
  }

  async completarTelefonos(): Promise<void> {
    for (const [id, clave] of [['numeroCelular', 'AFI_CP01_NUM_CEL'], ['numeroTelefonoFijo', 'AFI_CP01_NUM_CEL_FIJO']]) {
      const campo = this.page.locator(`#${id}`);
      await campo.click();
      await campo.fill(''); // Puede venir precargado de una solicitud previa del mismo titular.
      await campo.pressSequentially(variable(clave));
      await expect.poll(async () => await campo.inputValue() === variable(clave), { message: `${clave}: valor ingresado correctamente` }).toBe(true);
    }
    await this.page.getByText('Datos de contacto', { exact: true }).click();
    await expect(this.page.locator('#btn-independiente-continuar')).toBeEnabled();
    await this.page.locator('#btn-independiente-continuar').click();
    await expect(this.page.getByText('Ingresa la información solicitada', { exact: true })).toBeVisible({ timeout: 45_000 });
  }

  // ---- Primitivas de preparación (compartidas con afiDataUi) ----

  /** Limpia y escribe; teclado para campos que solo reaccionan a teclas. Sale del campo. */
  async escribirCampoTexto(campo: Locator, valor: string, teclado = false): Promise<void> {
    await campo.click();
    await campo.fill(''); // Puede venir precargado de una solicitud previa del mismo titular.
    if (teclado) await campo.pressSequentially(valor);
    else await campo.fill(valor);
    await campo.blur();
  }

  /** Autocompletar: escribe el valor y elige la ÚNICA opción con ese texto exacto. */
  async elegirAutocompleteExacto(control: string, valor: string): Promise<void> {
    const campo = this.page.locator(`input[formcontrolname="${control}"]`);
    await campo.click();
    await campo.fill('');
    await campo.pressSequentially(valor);
    const panel = await this.abrirCatalogo(campo);
    const opcion = panel.getByRole('option', { name: valor, exact: true });
    // Sin normalizar ni aceptar una opción parecida; el mensaje no incluye el valor.
    await expect.poll(() => opcion.count(), { message: `${control}: debe existir exactamente una opción igual al valor configurado` }).toBe(1);
    await opcion.click();
    await expect(panel).toBeHidden();
    await expect.poll(async () => await campo.inputValue() === valor, { message: `${control}: opción exacta seleccionada` }).toBe(true);
    await expect(campo).not.toHaveClass(/\bng-invalid\b/);
  }

  async completarInformacionAdicionalFacultativo(datos: DatosFacultativo): Promise<void> {
    await expect(this.page.locator('#btn-facultativo-info-ad-continuar')).toBeVisible();
    await this.elegirConfigurado('nacionalidad', datos.nacionalidad);
    await this.elegirConfigurado('estadoCivil', datos.estadoCivil);
    await this.elegirAutocompleteExacto('fondo', datos.fondoPensiones);
    const salario = this.page.locator('input[formcontrolname="salarioBasico"]');
    await this.escribirCampoTexto(salario, datos.salarioBasico, true);
    await expect(salario).not.toHaveClass(/\bng-invalid\b/);
    await expect(this.page.locator('#btn-facultativo-info-ad-continuar')).toBeEnabled();
  }

  async completarInformacionAdicional(): Promise<void> {
    const fondo = this.page.locator('#fondo');
    // QA autoriza cualquier opción válida cuando el fondo no llega precargado.
    if (await fondo.isVisible() && await fondo.isEnabled() && !(await fondo.inputValue()).trim()) {
      const catalogo = await this.abrirCatalogo(fondo);
      const opcion = catalogo.getByRole('option', { disabled: false }).filter({ visible: true }).first();
      await expect(opcion).toBeVisible();
      const texto = normalizarEspacios(await opcion.innerText());
      expect(texto.length).toBeGreaterThan(0);
      await opcion.click();
      await expect(catalogo).toBeHidden();
      await expect(fondo).toHaveValue(texto);
      await fondo.blur();
      await expect(fondo).not.toHaveClass(/\bng-invalid\b/);
    }

    const panel = await this.abrirCatalogo(this.page.locator('#actividad'));
    await panel.getByRole('option', { name: variable('AFI_CP01_ACTIVIDAD'), exact: true }).click();
    const ingreso = this.page.locator('#ingresoMensual');
    await ingreso.click();
    await ingreso.press('ControlOrMeta+A');
    await ingreso.pressSequentially(variable('AFI_CP01_INGRESO_MENSUAL'));
    await this.page.getByText('Ingresa la información solicitada', { exact: true }).click();
    await expect(this.page.locator('#btn-independiente-info-ad-continuar')).toBeEnabled();
    await this.page.locator('#btn-independiente-info-ad-continuar').click();
  }

  /** Observa la respuesta originada por ESTE clic; nunca crea un caso por API aparte. */
  async enviarUnaVez(registrar: (numero: string) => Promise<void>): Promise<string> {
    const origen = new URL(variable('BIZAGI_BASE_URL')).origin;
    const respuesta = this.page.waitForResponse(r => {
      const url = new URL(r.url());
      return url.origin === origen && /\/odata\/data\/processes\([^)]+\)\/start$/.test(url.pathname)
        && r.request().method() === 'POST';
    }, { timeout: 60_000 });
    // Precondición de datos observada en QA: el Portal muestra "Ya tienes una solicitud en curso" y NO crea el caso. Se
    // reconoce en cuanto aparece (error tipificado) en vez de agotar la espera de la respuesta de creación.
    const enCurso = this.page.getByRole('heading', { name: SOLICITUD_EN_CURSO, exact: true });
    const bloqueo = enCurso.waitFor({ state: 'visible', timeout: 60_000 })
      .then((): never => { throw new SolicitudEnCursoError(); }, () => new Promise<never>(() => {}));
    bloqueo.catch(() => {}); // si gana la creación, su rechazo tardío no queda sin manejar
    // Promise.all observa inmediatamente rechazos de ambos caminos, sin reenviar.
    const [, numero] = await Promise.all([
      this.page.locator('#btn-inicio-solicitud-continuar').click(),
      Promise.race([bloqueo, respuesta.then(async r => {
        if (!r.ok()) throw new Error(`Inicio de solicitud rechazado: HTTP ${r.status()}`);
        const data = await r.json() as { value?: unknown };
        const caso = String(data.value ?? '').trim();
        if (!/^\d+$/.test(caso)) throw new Error('Respuesta de creación sin número de caso reconocible; no reenviar.');
        await registrar(caso); // Se registra para cleanup antes de cualquier aserción posterior.
        return caso;
      })]),
    ]);
    return numero;
  }
}
