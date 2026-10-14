import { expect, type Locator, type Page } from '@playwright/test';
import { LoginActions } from '../../../shared/core/LoginActions';
import { esErrorTransitorioUi, retrySafeUiOperation } from '../../../shared/core/SafeUiRetry';
import { HistorialCasos } from '../../../shared/utils/HistorialCasos';
import { variable } from './afiliacionesPortal';

type HistorialPortal = Pick<HistorialCasos, 'registrar' | 'marcarDepurado' | 'listar'>;

/** Soporte QA acotado a un caso registrado desde la respuesta de creación del portal. */
export class BizagiQaSupport {
  private numero?: string;
  /** Solo un caso presente en el histórico se marca Depurado tras cancelarlo. */
  private enHistorial = false;
  private historialCasos?: HistorialPortal;
  constructor(readonly page: Page, historial?: HistorialPortal) { this.historialCasos = historial; }

  private historial(): HistorialPortal {
    return this.historialCasos ??= new HistorialCasos();
  }

  /**
   * Correlación de un caso recién creado por el portal. El número queda en memoria
   * ANTES de escribir disco: si el histórico falla, el finally aún puede cancelarlo.
   */
  async registrarCasoCreado(numero: string, escenario: string): Promise<void> {
    if (!/^\d+$/.test(numero) || this.numero) throw new Error('Correlación de caso inválida o duplicada');
    this.numero = numero;
    try {
      await this.historial().registrar({ numeroCaso: numero, escenario, modoCreacion: 'portal' });
      this.enHistorial = true;
    } catch (error) {
      // Nunca reenviar la solicitud: el caso ya existe en Bizagi.
      throw new Error(`Bizagi creó el caso ${numero}, pero falló su persistencia en el histórico; `
        + `el cleanup de esta corrida intentará cancelarlo. Detalle: ${(error as Error).message}`);
    }
  }

  /** Recuperación: administra un caso Portal pendiente ya presente en el histórico, sin registrarlo otra vez. */
  async adoptarCasoRegistrado(numero: string): Promise<void> {
    if (!/^\d+$/.test(numero)) throw new Error('Número de caso inválido para adoptar');
    if (this.numero && this.numero !== numero) throw new Error(`Esta instancia ya administra el caso ${this.numero}`);
    const registro = (await this.historial().listar()).filter(c => c.numeroCaso === numero);
    if (registro.length !== 1 || registro[0].modoCreacion !== 'portal' || registro[0].estadoDepuracion !== 'Pendiente de depurar') {
      throw new Error(`El caso ${numero} no es un caso Portal pendiente registrado por el framework`);
    }
    this.numero = numero;
    this.enHistorial = true;
  }

  /** Caso de esta corrida (solo lectura), o undefined si aún no se correlacionó ninguno. */
  casoAdministrado(): string | undefined {
    return this.numero;
  }

  protected caso(): string {
    if (!this.numero) throw new Error('No hay caso de esta corrida autorizado para administrar');
    return this.numero;
  }

  async login(): Promise<void> {
    if (await this.page.locator('#menuListAdmin').isVisible()) return;
    await new LoginActions(this.page).login(
      process.env.USUARIO_admin || variable('BIZAGI_USER'),
      process.env.CLAVE_admin || variable('BIZAGI_PASSWORD'),
    );
    await expect(this.page.locator('#menuListAdmin')).toBeVisible();
  }

  /**
   * Admin → Administración de procesos → Casos desde una carga limpia del Work Portal.
   * Solo navegación: cada intento rehace la cadena completa con locators nuevos, porque la SPA
   * reemplaza nodos del menú/categorías al rerenderizar. Postcondición: diálogo "Casos" visible.
   */
  async abrirAdministracionCasos(timeout = 90_000): Promise<Locator> {
    await this.login();
    const dialogo = () => this.page.getByRole('dialog', { name: 'Casos', exact: true });
    await retrySafeUiOperation({
      nombre: 'Abrir Admin → Administración de procesos → Casos',
      timeout,
      esperaEstado: 15_000,
      accion: async () => {
        // Navegación limpia: no reutilizar selección administrativa de una operación anterior.
        await this.page.goto(variable('BIZAGI_BASE_URL'), { waitUntil: 'domcontentloaded' });
        // El menú puede seguir cargando tras domcontentloaded.
        await this.page.locator('#menuListAdmin').click({ timeout: 30_000 });
        await this.page.getByText('Administración de procesos', { exact: false }).click({ timeout: 10_000 });
        await this.page.locator('#categories').getByText('Casos', { exact: true }).click({ timeout: 10_000 });
      },
      estadoExitoso: () => dialogo().isVisible(),
    });
    return dialogo();
  }

  /**
   * Presupuesto de buscarCaso (ms). `total` es ÚNICO e incluye aperturas y reconstrucciones.
   * reconstruirSinResultado: tiempo en cero sobre la misma vista antes de rehacer Admin → Casos.
   * minimoReapertura: con menos presupuesto restante no se reabre (una apertura no es interrumpible).
   */
  protected presupuestoBusqueda = { total: 180_000, intervalo: 3_000, esperaResultados: 1_000, reconstruirSinResultado: 40_000, minimoReapertura: 30_000 };

  /**
   * Búsqueda por número exacto con propagación lenta del Portal, en dos niveles:
   * A) repetir la búsqueda sobre la vista actual; B) si la vista desaparece o sigue en cero
   * demasiado tiempo (stale), reabrir Admin → Casos y buscar EL MISMO número.
   * Solo navega y consulta: nunca crea, modifica, cancela, reasigna ni guarda.
   */
  async buscarCaso(): Promise<Locator> {
    const numero = this.caso();
    const p = this.presupuestoBusqueda;
    const inicio = Date.now(), limite = inicio + p.total;
    const restante = () => Math.max(0, limite - Date.now());
    const esperar = (ms: number) => this.page.waitForTimeout(Math.min(ms, restante()));
    let busquedas = 0, reaperturas = 0, coincidencias = 0, errorReapertura = '';
    // Cada interacción acotada: una vista que desaparece a mitad no consume el presupuesto total.
    const paso = () => Math.max(1, Math.min(15_000, restante()));

    let dialogo = await this.abrirAdministracionCasos(Math.min(90_000, Math.max(1, restante())));
    let vistaDesde = Date.now();
    const vistaViva = async () => {
      try { return await dialogo.isVisible() && await dialogo.locator('#caseInput').isVisible(); }
      catch (e) { if (esErrorTransitorioUi(e)) return false; throw e; }
    };

    while (restante() > 0) {
      // Nivel B: UI desaparecida/reemplazada o vista en cero demasiado tiempo.
      if (!await vistaViva() || Date.now() - vistaDesde >= p.reconstruirSinResultado) {
        if (restante() >= p.minimoReapertura) {
          reaperturas++;
          try { dialogo = await this.abrirAdministracionCasos(Math.min(90_000, restante())); }
          catch (e) { errorReapertura = (e as Error).message.split('\n')[0]; break; }
          vistaDesde = Date.now();
        } else if (!await vistaViva()) break; // Sin tiempo para reabrir y sin vista: diagnóstico.
      }
      // Nivel A: la búsqueda por número exacto es idempotente; Admin no refresca solo.
      try {
        await dialogo.locator('#caseInput').fill(numero, { timeout: paso() });
        await dialogo.locator('#btn-admin-case-search').click({ timeout: paso() });
        busquedas++;
      } catch (e) {
        // Un rerender solo obliga a repetirla; la siguiente vuelta decide si reconstruir.
        if (!esErrorTransitorioUi(e)) throw e;
        await esperar(1_000);
        continue;
      }
      await esperar(p.esperaResultados);
      coincidencias = await dialogo.locator(`input[name="CaseAdmin"][data-subprocess="false"][value="${numero}"]`).count();
      if (coincidencias > 1) throw new Error(`Correlación ambigua: el caso ${numero} tiene ${coincidencias} coincidencias en Admin → Casos`);
      if (coincidencias === 1) return dialogo;
      await esperar(p.intervalo);
    }

    const visible = (l: Locator) => l.isVisible().catch(() => false);
    const sn = (b: boolean) => (b ? 'sí' : 'no');
    throw new Error(`El caso ${numero} no apareció en Admin → Casos dentro del tiempo de propagación `
      + `(tiempoTotal=${Math.round((Date.now() - inicio) / 1000)}s, busquedas=${busquedas}, reaperturasAdmin=${reaperturas}, `
      + `dialogoVisible=${sn(await visible(dialogo))}, inputBusquedaVisible=${sn(await visible(dialogo.locator('#caseInput')))}, `
      + `coincidenciasFinales=${coincidencias}${errorReapertura ? `, errorReapertura=${errorReapertura}` : ''})`);
  }

  async actividades(): Promise<string[]> {
    const dialogo = await this.buscarCaso();
    return dialogo.locator('input[name="workItemAdmin"]').evaluateAll(es =>
      es.map(e => (e as HTMLInputElement).value.split('|')[2]));
  }

  /** Rama pendiente de validación en QA: el piloto observado resolvió la integración sin emular. */
  async emularReconocimiento(): Promise<void> {
    const actividades = await this.actividades();
    const candidatas = actividades.filter(nombre => /reconocimiento/i.test(nombre));
    expect(candidatas.length, 'Debe existir una actividad inequívoca de reconocimiento del caso propio').toBe(1);
    const nombre = candidatas[0];
    let dialogo = this.page.getByRole('dialog', { name: 'Casos', exact: true });
    let enlace = dialogo.getByRole('link', { name: nombre, exact: true });
    if (!(await enlace.isVisible()) || !(await enlace.isEnabled())) {
      await this.reasignarAAdministradorQa(nombre);
      dialogo = await this.buscarCaso();
      enlace = dialogo.getByRole('link', { name: nombre, exact: true });
    }
    await expect(enlace).toHaveCount(1);
    await enlace.click();
    // Guardas de identidad de pantalla: nunca escribir códigos en otra actividad.
    await expect(this.page.getByText(`Afiliaciones › ${nombre}`, { exact: true })).toBeVisible({ timeout: 45_000 });
    for (const [label, valor] of [['Código Estado Evento', '2'], ['Código Respuesta Evento', '200']]) {
      const render = this.page.locator('.ui-bizagi-render').filter({ has: this.page.getByText(label, { exact: true }) });
      const input = render.locator('input:visible:not([type="hidden"])');
      await expect(input, `Control único para ${label}`).toHaveCount(1);
      await expect(input).toBeEditable();
      await input.fill(valor);
    }
    await this.page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await this.page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(this.page.getByText('¡Validación exitosa!', { exact: true })).toBeVisible({ timeout: 60_000 });
  }

  /**
   * Selecciona una sola actividad del caso propio; nunca reasigna resultados por posición.
   * Destino: COLSUBSIDIO_USUARIO_ADMINISTRADOR del .env local (nombre de usuario visible en Bizagi; no se versiona).
   */
  async reasignarAAdministradorQa(nombreActividad: string): Promise<void> {
    const usuario = variable('COLSUBSIDIO_USUARIO_ADMINISTRADOR');
    const dialogo = await this.buscarCaso();
    const numero = this.caso();
    const actividades = dialogo.locator('input[name="workItemAdmin"]');
    const valores = await actividades.evaluateAll(es => es.map(e => (e as HTMLInputElement).value));
    const candidatos = valores.filter(v => {
      const partes = v.split('|');
      return partes[0] === numero && partes[2] === nombreActividad && partes[3] === numero;
    });
    expect(candidatos.length, 'Una actividad inequívoca del caso de esta corrida').toBe(1);
    for (const casilla of await dialogo.locator('input[type="checkbox"]:checked').all()) await casilla.uncheck();
    const actividad = actividades.and(dialogo.locator(`[value=${JSON.stringify(candidatos[0])}]`));
    await actividad.check();
    await expect(dialogo.locator('input[name="workItemAdmin"]:checked')).toHaveCount(1);
    await dialogo.locator('#btn-admin-case-reassign').click();
    await dialogo.locator('#userNameReassignInput').fill(usuario);
    await dialogo.locator('#btn-users-table-search').click();
    // La búsqueda también devuelve usuarios cuyo nombre contiene el buscado; el name exacto evita elegirlos.
    const reasignar = dialogo.locator(`button[name=${JSON.stringify(usuario)}]`);
    await expect(reasignar).toHaveCount(1);
    await reasignar.click();
    await expect(dialogo.getByRole('tabpanel', { name: 'Administrar Casos', exact: true }))
      .toContainText(/reasignad[ao]/i, { timeout: 30_000 });
  }

  async esperarValidacionesCliente(): Promise<void> {
    let nombre = '';
    let reconocimientoFinalizado = false, resultadoContinuado = false;
    const limite = Date.now() + 8 * 60_000;
    while (!nombre && Date.now() < limite) {
      const actividades = await this.actividades();
      if (actividades.includes('Reconocimiento Finalizado') && !reconocimientoFinalizado) {
        await this.emularReconocimiento();
        reconocimientoFinalizado = true;
        continue;
      }
      if (actividades.includes('Resultado Proceso de Reconocimiento') && !resultadoContinuado) {
        const dialogo = await this.buscarCaso();
        await dialogo.getByRole('link', { name: 'Resultado Proceso de Reconocimiento', exact: true }).click();
        await expect(this.page.getByText('¡Validación exitosa!', { exact: true })).toBeVisible();
        await this.page.getByRole('button', { name: 'Continuar', exact: true }).click();
        await expect(this.page.getByText('¡Validación exitosa!', { exact: true })).toBeHidden({ timeout: 60_000 });
        resultadoContinuado = true;
        continue;
      }
      const candidatas = actividades.filter(n => n === 'Realizar validaciones cliente');
      expect(candidatas.length, 'No hay actividades documentales ambiguas').toBeLessThanOrEqual(1);
      if (candidatas.length === 1) nombre = candidatas[0];
      if (!nombre) await this.page.waitForTimeout(5_000);
    }
    expect(nombre, 'La actividad documental aparece tras las integraciones del caso propio').not.toBe('');
  }

  /** Decisiones QA por documento; solo opera sobre el caso registrado. */
  async aprobarValidacionesCliente(reportar: (paso: string, estado: 'PASS' | 'FAIL') => void = () => {}): Promise<void> {
    await this.esperarValidacionesCliente();
    const actividad = 'Realizar validaciones cliente';
    const paso = async (nombre: string, accion: () => Promise<void>) => {
      try { await accion(); reportar(nombre, 'PASS'); }
      catch (e) { reportar(nombre, 'FAIL'); throw e; }
    };
    await paso('reasignacion', () => this.reasignarAAdministradorQa(actividad));
    const abrir = async () => {
      const dialogo = await this.buscarCaso();
      const enlace = dialogo.getByRole('link', { name: actividad, exact: true });
      await expect(enlace).toHaveCount(1);
      await expect(enlace).toBeVisible();
      await expect(enlace).toBeEnabled();
      await enlace.click();
      await expect(this.page.getByText('Afiliaciones › ' + actividad, { exact: true }))
        .toBeVisible({ timeout: 60_000 });
    };
    await paso('actividadAbierta', abrir);
    const tabla = this.page.getByRole('table').filter({
      has: this.page.getByRole('columnheader', { name: 'Tipo de Documento', exact: true }),
    });
    await expect(tabla).toHaveCount(1);
    const encabezados = await tabla.getByRole('columnheader').allTextContents();
    const columnaTipo = encabezados.findIndex(t => t.trim() === 'Tipo de Documento');
    const columnaEstado = encabezados.findIndex(t => t.trim() === 'Estado');
    expect(columnaTipo).toBeGreaterThanOrEqual(0);
    expect(columnaEstado).toBeGreaterThanOrEqual(0);
    const filas = tabla.getByRole('row').filter({
      has: this.page.getByRole('link', { name: 'Validaciones', exact: true }),
    });
    expect(await filas.count(), 'La tabla Documentos contiene filas para validar').toBeGreaterThan(0);
    const documentos: string[] = [];
    for (const fila of await filas.all()) {
      const texto = (await fila.getByRole('cell').nth(columnaTipo).innerText()).trim();
      expect(texto, 'Tipo de documento identificable').not.toBe('');
      documentos.push(texto);
    }
    expect(new Set(documentos).size, 'Tipos de documento inequívocos').toBe(documentos.length);
    const filaDocumento = (texto: string) => filas.filter({
      has: this.page.getByText(texto, { exact: true }),
    });
    for (const documento of documentos) {
      await paso('documento: ' + documento, async () => {
        const fila = filaDocumento(documento);
        await expect(fila).toHaveCount(1);
        const estado = fila.getByRole('cell').nth(columnaEstado);
        if ((await estado.innerText()).trim() === 'Aprobado') return;
        await expect(estado).toHaveText('Por revisar');
        const enlace = fila.getByRole('link', { name: 'Validaciones', exact: true });
        await expect(enlace).toHaveCount(1);
        await enlace.click();
        const modal = this.page.getByRole('dialog', { name: 'Validaciones', exact: true });
        await expect(modal).toBeVisible();
        await expect(modal.getByText(documento, { exact: true })).toBeVisible();
        const aprobadoVisible = await modal.getByText('¿Documento aprobado?', { exact: true }).isVisible();
        const pregunta = aprobadoVisible ? '¿Documento aprobado?' : '¿Requiere documento?';
        await expect(modal.getByText(pregunta, { exact: true })).toBeVisible();
        const campo = modal.locator('.ui-bizagi-render').filter({
          has: this.page.getByText(pregunta, { exact: true }),
        });
        await expect(campo).toHaveCount(1);
        const radio = campo.getByRole('radio', { name: aprobadoVisible ? /^S[ií]$/i : /^No$/i });
        await expect(radio).toHaveCount(1);
        if (!(await radio.isChecked())) {
          await radio.focus();
          await radio.press('Space');
        }
        await expect(radio).toBeChecked();
        await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
        await expect(modal).toBeHidden({ timeout: 45_000 });
        await expect(estado).toHaveText('Aprobado', { timeout: 45_000 });
      });
    }
    const verificarFilas = async () => {
      await expect(filas).toHaveCount(documentos.length);
      for (const documento of documentos) {
        const fila = filaDocumento(documento);
        await expect(fila).toHaveCount(1);
        await expect(fila.getByRole('cell').nth(columnaEstado)).toHaveText('Aprobado');
      }
    };

    await verificarFilas();
    const resultado = this.page.locator('.ui-bizagi-render').filter({
      has: this.page.getByText(/^Resultado de Afiliación\s*:?\s*$/),
    }).getByRole('combobox');
    await paso('resultadoAfiliacion', async () => {
      await expect(resultado).toHaveCount(1);
      await resultado.click();
      const panelId = await resultado.getAttribute('aria-controls');
      expect(panelId, 'Catálogo asociado al resultado').toBeTruthy();
      const panel = this.page.locator('[id=' + JSON.stringify(panelId) + ']');
      await expect(panel).toBeVisible();
      const opcion = panel.getByText('Aprobado', { exact: true });
      await expect(opcion).toHaveCount(1);
      await opcion.click();
      await expect(resultado).toHaveValue('Aprobado');
    });
    await paso('guardar', async () => {
      const [respuesta] = await Promise.all([
        this.page.waitForResponse(r => r.url().includes('/Rest/Handlers/MultiAction')
          && /SAVE/i.test(decodeURIComponent(r.request().postData() || '')), { timeout: 45_000 }),
        this.page.getByRole('button', { name: 'Guardar', exact: true }).click(),
      ]);
      expect(respuesta.ok(), 'Guardar responde correctamente').toBe(true);
      await respuesta.finished();
      // Reabrir el mismo caso verifica persistencia antes de completar la actividad.
      await abrir();
      await verificarFilas();
      await expect(resultado).toHaveValue('Aprobado');
    });
    await paso('siguiente', async () => {
      await this.page.getByRole('button', { name: 'Siguiente', exact: true }).click();
      await expect(this.page.getByText('Afiliaciones › ' + actividad, { exact: true }))
        .toBeHidden({ timeout: 60_000 });
    });
    await paso('actividadCompletada', async () => {
      const limite = Date.now() + 120_000;
      let activa = true;
      while (activa && Date.now() < limite) {
        activa = (await this.actividades()).includes(actividad);
        if (activa) await this.page.waitForTimeout(3_000);
      }
      expect(activa, 'La actividad ya no está activa en el caso propio').toBe(false);
    });
  }


  /** Depurado solo después de la confirmación física; cualquier fallo deja el caso Pendiente. */
  async cancelarCasoCreado(): Promise<void> {
    await this.cancelarEnBizagi();
    if (!this.enHistorial) return;
    try { await this.historial().marcarDepurado(this.caso()); }
    catch (error) {
      throw new Error(`El caso ${this.caso()} se canceló en Bizagi, pero no se pudo marcar Depurado en el histórico; `
        + `márcalo con npm run depurar -- <proyecto> --marcar ${this.caso()}. Detalle: ${(error as Error).message}`);
    }
  }

  protected async cancelarEnBizagi(): Promise<void> {
    const dialogo = await this.buscarCaso();
    for (const casilla of await dialogo.locator('input[type="checkbox"]:checked').all()) await casilla.uncheck();
    await dialogo.locator(`input[name="CaseAdmin"][data-subprocess="false"][value="${this.caso()}"]`).check();
    await expect(dialogo.locator('input[name="CaseAdmin"]:checked')).toHaveCount(1);
    await expect(dialogo.locator('input[name="workItemAdmin"]:checked')).toHaveCount(0);
    // Singular: botón de los resultados seleccionados; nunca #btn-admin-cases-invalidate.
    await dialogo.locator('#btn-admin-case-invalidate').click();
    const confirmar = this.page.getByRole('dialog', { name: 'Información', exact: true });
    await expect(confirmar).toContainText('Está seguro de que desea cancelar el(los) caso(s) seleccionado(s)?');
    await confirmar.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await expect(confirmar).toBeHidden({ timeout: 45_000 });
    // La confirmación de resultado se valida antes de considerar el cleanup exitoso.
    await expect(dialogo.getByRole('tabpanel', { name: 'Administrar Casos', exact: true }))
      .toContainText(`La operación ${this.caso()} ha sido cancelada`, { timeout: 45_000 });
  }
}
