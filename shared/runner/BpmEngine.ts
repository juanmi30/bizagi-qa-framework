import { Page } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LoginActions } from '../core/LoginActions';
import { LogoutActions } from '../core/LogoutActions';
import { FormActions } from '../core/FormActions';
import { InicioServicio } from '../core/InicioServicio';
import type { ParametroInicioBizagi } from '../utils/BizagiApiClient';
import { resolverValoresEnv } from '../utils/valoresEnv';
import { InboxObjects } from '../baseObjects/inbox.objects';
import type { Scenario, Paso } from './scenarioLoader';

/** Indicadores de "procesando" de Bizagi (loader, spinner, pantalla de espera de integración). */
const SELECTOR_CARGA =
  '.k-loading-mask, .bz-loading, [class*="loading" i], [class*="loader" i], [class*="spinner" i], [class*="procesando" i]';

/**
 * BpmEngine (COMPARTIDO)
 * Orquesta la "coreografía" de Bizagi que siempre es igual:
 *   iniciar (crear caso o tomarlo de la bandeja) -> por cada paso: [cambiar de usuario
 *   si aplica] -> llenar la forma -> avanzar. Reutiliza login/logout y FormActions.
 *
 * Usuarios: la plantilla usa claves lógicas (ej. "radicador1"). La identidad real y el
 * modo de login salen del .env del proyecto:
 *   BIZAGI_LOGIN_MODO = lista | estandar | fichas
 *   USUARIO_<clave> = identidad real (ej. domain\usuario.qa)
 *   CLAVE_<clave>   = contraseña (solo modo estandar)
 *   DOMINIO_<clave> = dominio del login (opcional, modo estandar; si falta, BIZAGI_LOGIN_DOMINIO)
 */
export class BpmEngine {
  private readonly login: LoginActions;
  private readonly logout: LogoutActions;
  private readonly form: FormActions;
  private usuarioActual?: string;
  /** Números que ha tenido el caso (padre + subprocesos), en orden de aparición. */
  private readonly numerosVistos = new Set<string>();

  constructor(private readonly page: Page, opciones: { iframe?: string } = {}) {
    this.login = new LoginActions(page);
    this.logout = new LogoutActions(page);
    this.form = new FormActions(page, opciones.iframe);
  }

  /** Acceso al llenador de formas (lo usa el runner para verificaciones y hazards). */
  get formulario(): FormActions {
    return this.form;
  }

  // --- Resolución de usuarios desde el .env ---
  private identidad(clave: string): string {
    return process.env['USUARIO_' + clave] ?? process.env.BIZAGI_QUICK_USER ?? clave;
  }
  private modoLogin(): string {
    return (process.env.BIZAGI_LOGIN_MODO ?? 'lista').toLowerCase();
  }

  private async entrarComo(clave: string): Promise<void> {
    const id = this.identidad(clave);
    switch (this.modoLogin()) {
      case 'estandar':
        await this.login.login(
          id,
          process.env['CLAVE_' + clave] ?? process.env.BIZAGI_PASSWORD ?? '',
          process.env['DOMINIO_' + clave] || undefined,
        );
        break;
      case 'fichas':
        await this.login.quickLogin(id);
        break;
      case 'lista':
      default:
        await this.login.selectUserLogin(id);
    }
    this.usuarioActual = clave;
  }

  /** Cambio de asignación: si el paso lo toma otro usuario, logout + login. */
  private async cambiarUsuarioSiHaceFalta(clave?: string): Promise<void> {
    if (!clave || clave === this.usuarioActual) return;
    await this.logout.logout();
    await this.entrarComo(clave);
  }

  // --- Inicio del caso ---
  async iniciar(sc: Scenario): Promise<void> {
    await this.entrarComo(sc.inicio.usuario);
    switch (sc.inicio.modo) {
      case 'crear-caso':
        await this.crearCaso(sc.inicio.proceso_a_crear ?? '', sc.inicio.categoria);
        break;
      case 'servicio':
        await this.crearCasoPorServicio(sc);
        break;
      case 'buscar':
        await this.abrirCasoPorNumero(sc.inicio.numero_caso ?? '');
        break;
      case 'bandeja':
      default:
        await this.abrirCaso('', sc.pasos[0]?.actividad ?? '');
    }
    await this.numeroCasoActual(); // recordar el número del caso para los hazards
  }

  /**
   * inicio.modo: servicio — crea el caso por API (OData) con el JSON de Create Case del proyecto
   * (processId + startParameters), lo registra en el histórico y ABRE el caso por su número en el
   * Work Portal para continuar por UI. La autenticación/URL de la API salen del .env (ver
   * BizagiApiClient); el número creado se conserva en el histórico de números para los hazards.
   */
  private async crearCasoPorServicio(sc: Scenario): Promise<void> {
    const relativa = sc.inicio.recurso ?? '';
    const ruta = resolve(process.cwd(), 'projects', process.env.PROJECT ?? '', 'resources', relativa);
    let recurso: { processId?: string; startParameters?: ParametroInicioBizagi[] };
    try {
      recurso = JSON.parse(readFileSync(ruta, 'utf8'));
    } catch {
      throw new Error(
        `No se pudo leer el recurso de Create Case para "inicio.modo: servicio": "${relativa}". ` +
        `Verifica que exista projects/${process.env.PROJECT}/resources/${relativa}.`,
      );
    }
    // Valores "${env:NOMBRE}" del recurso salen del .env local (datos sensibles fuera de Git).
    recurso = resolverValoresEnv(recurso, process.env, relativa);
    const procesoId = (recurso.processId ?? '').trim();
    if (!procesoId) {
      throw new Error(`El recurso "${relativa}" no define "processId" (GUID del proceso en Bizagi).`);
    }
    const numero = await new InicioServicio().iniciar({
      procesoId,
      escenario: sc.escenario,
      parametros: recurso.startParameters ?? [],
    });
    this.numerosVistos.add(numero);
    // Continuar por UI: abrir el caso recién creado (si el escenario tiene pasos que ejecutar).
    if (sc.pasos.length > 0) {
      await this.abrirCasoPorNumero(numero);
    }
  }

  /**
   * inicio.modo: buscar — abre un caso por su número en el buscador global del Work Portal.
   * Lo reutiliza el modo servicio para abrir el caso recién creado por API.
   */
  private async abrirCasoPorNumero(numero: string): Promise<void> {
    const num = (numero ?? '').trim();
    if (!num) throw new Error('No se indicó el número del caso a abrir (inicio.numero_caso).');
    const buscar = this.page.getByRole('textbox', { name: 'Buscar' }).first();
    await buscar.click();
    await buscar.fill(num);
    await buscar.press('Enter');
    await this.esperarCarga();
    await this.page
      .locator(`tr:has-text("${num}"), [role="row"]:has-text("${num}"), a:has-text("${num}"), :text("${num}")`)
      .first()
      .click();
    await this.esperarCarga();
  }

  /**
   * Crea un caso desde el Work Portal: menú "Nuevo Caso" -> (categoría opcional) -> proceso.
   * Espera el loader entre pasos (sin pausas fijas). Tolera clientes sin categoría.
   */
  private async crearCaso(proceso: string, categoria?: string): Promise<void> {
    await this.page.locator(InboxObjects.newCaseButton).first().click();
    if (categoria) {
      await this.clickPorTexto(categoria);
      await this.esperarCarga();
    }
    await this.clickPorTexto(proceso);
    await this.esperarCarga();
  }

  /** Clic en un elemento por su texto visible (link/menuitem/botón, y como último recurso texto). */
  private async clickPorTexto(texto: string): Promise<void> {
    const p = this.page;
    const objetivo = p.getByRole('link', { name: texto })
      .or(p.getByRole('menuitem', { name: texto }))
      .or(p.getByRole('button', { name: texto }))
      .or(p.getByText(texto, { exact: false }))
      .first();
    await objetivo.click();
  }

  /** Espera a que un loader (si aparece) se oculte y a que la red quede en reposo. */
  private async esperarCarga(): Promise<void> {
    await this.page.locator(SELECTOR_CARGA).first()
      .waitFor({ state: 'hidden', timeout: 30_000 })
      .catch(() => undefined);
    await this.page.waitForLoadState('networkidle').catch(() => undefined);
  }

  // --- Extensión G: esperas de integración (timeouts configurables por .env) ---
  private segundosAccion(): number {
    const v = Number(process.env.ESPERA_ACCION_SEGUNDOS);
    return Number.isFinite(v) && v > 0 ? v : 90;
  }
  private minutosIntegracion(): number {
    const v = Number(process.env.ESPERA_INTEGRACION_MINUTOS);
    return Number.isFinite(v) && v > 0 ? v : 5;
  }

  /**
   * Espera a que el caso "aterrice": que se vaya la pantalla de procesando y, si se sabe a
   * dónde debe llegar, que aparezca esa actividad. `estricto` = falla con mensaje claro si no
   * llega (se usa en la espera EXPLÍCITA que declaró el analista).
   */
  private async esperarAvance(actividad: string | undefined, timeoutMs: number, estricto = false): Promise<void> {
    const inicio = Date.now();
    await this.page.locator(SELECTOR_CARGA).first()
      .waitFor({ state: 'hidden', timeout: timeoutMs })
      .catch(() => undefined);
    if (actividad) {
      const restante = Math.max(5_000, timeoutMs - (Date.now() - inicio));
      const destino = this.page.locator(`:text("${actividad}") >> visible=true`).first();
      const llego = await destino.waitFor({ state: 'visible', timeout: restante })
        .then(() => true).catch(() => false);
      if (!llego && estricto) {
        throw new Error(
          `La integración no terminó a tiempo: no apareció "${actividad}" tras esperar ` +
          `${Math.round(timeoutMs / 60_000)} minuto(s). Revisa si el ambiente está lento o si ` +
          `el nombre de la actividad cambió (esperar_integracion.hasta_llegar_a).`,
        );
      }
    }
    await this.page.waitForLoadState('networkidle').catch(() => undefined);
  }

  /** Abre un caso desde la bandeja, por su número (preferido) o por su actividad. */
  private async abrirCaso(numero: string, actividad: string): Promise<void> {
    const clave = numero || actividad;
    await this.page
      .locator(`tr:has-text("${clave}"), [role="row"]:has-text("${clave}")`)
      .first()
      .click();
    await this.page.waitForLoadState('networkidle');
  }

  // --- Ejecución de un paso (separada para permitir verificaciones "al entrar") ---
  /** Llega a la actividad del paso; si la toma otro usuario, hace logout+login y abre el caso. */
  async entrarAPaso(paso: Paso): Promise<void> {
    if (paso.usuario && paso.usuario !== this.usuarioActual) {
      await this.logout.logout();
      await this.entrarComo(paso.usuario);
      await this.abrirCaso(await this.numeroCasoActual(), paso.actividad);
    }
  }

  /** Diligencia los campos del paso y agrega las filas de sus tablas/colecciones (pop-ups). */
  async diligenciar(paso: Paso): Promise<void> {
    for (const campo of paso.llenar ?? []) {
      await this.form.llenarCampo(campo);
    }
    for (const tabla of paso.tablas ?? []) {
      for (const fila of tabla.filas) {
        await this.form.agregarFilaTabla(tabla.tabla, fila.llenar);
      }
    }
  }

  /** Ejecuta un PASO PERSONALIZADO: carga custom/<nombre>.ts y lo corre en esta sesión. */
  async ejecutarPersonalizado(nombre: string): Promise<void> {
    const proyecto = process.env.PROJECT ?? '';
    const ruta = resolve(process.cwd(), 'projects', proyecto, 'custom', `${nombre}.ts`);
    const mod = await import(pathToFileURL(ruta).href);
    // Según cómo se empaquete el TS, la función puede quedar en distintos niveles.
    const candidatos = [mod?.default?.default, mod?.default, mod];
    const fn = candidatos.find((c) => typeof c === 'function') as
      | ((ctx: { page: Page; engine: BpmEngine; usuario?: string }) => Promise<void>)
      | undefined;
    if (!fn) {
      throw new Error(`El paso personalizado "${nombre}" no exporta una función por defecto (export default) en custom/${nombre}.ts`);
    }
    await fn({ page: this.page, engine: this, usuario: this.usuarioActual });
  }

  /**
   * Pulsa el botón de avance (si el paso lo define) y espera a que Bizagi aterrice.
   * Extensión G, dos capas:
   *  1) IMPLÍCITA y tolerante en toda `accion:` — espera que se vaya el "procesando" y, si se
   *     conoce, que aparezca la actividad siguiente (`ESPERA_ACCION_SEGUNDOS`, default 90 s).
   *  2) EXPLÍCITA si el paso declara `esperar_integracion:` — espera larga y ESTRICTA para las
   *     integraciones lentas (`ESPERA_INTEGRACION_MINUTOS`, default 5 min).
   */
  async avanzar(paso: Paso, siguienteActividad?: string): Promise<void> {
    if (!paso.accion) return;
    await this.form.clickBoton(paso.accion);
    await this.esperarAvance(siguienteActividad, this.segundosAccion() * 1000);

    if (paso.esperar_integracion) {
      const e = paso.esperar_integracion;
      const minutos = e.maximo_minutos ?? this.minutosIntegracion();
      await this.esperarAvance(e.hasta_llegar_a ?? siguienteActividad, minutos * 60_000, true);
    }
    // Tras avanzar, el caso puede entrar a un subproceso con OTRO número: se relee y se guarda.
    await this.numeroCasoActual().catch(() => undefined);
  }

  /** Conveniencia: entrar + (personalizado o diligenciar) + avanzar. */
  async ejecutarPaso(paso: Paso): Promise<void> {
    await this.entrarAPaso(paso);
    if (paso.personalizado) await this.ejecutarPersonalizado(paso.personalizado);
    else await this.diligenciar(paso);
    await this.avanzar(paso);
  }

  usuarioEnSesion(): string | undefined {
    return this.usuarioActual;
  }

  /** Login público con un usuario lógico del .env (lo usan los grabados adoptados). */
  async iniciarSesion(clave: string): Promise<void> {
    await this.entrarComo(clave);
  }

  // --- Apoyo para hazards: número(s) de caso ---
  // La etiqueta (o un selector) del "número de caso" se configura por proyecto en el .env,
  // así el núcleo no asume el formato de ningún cliente (ej. CONPRE muestra "GCON - NNN").
  private etiquetaNumeroCaso(): string {
    return process.env.BIZAGI_CASE_NUMBER_LABEL ?? 'Número de caso';
  }
  private selectorNumeroCaso(): string | undefined {
    return process.env.BIZAGI_CASE_NUMBER_SELECTOR || undefined;
  }

  /** Lee el número de caso VISIBLE ahora: por selector configurado → por etiqueta → fallback común. */
  private async leerNumeroCaso(): Promise<string> {
    const selector = this.selectorNumeroCaso();
    if (selector) {
      const t = (await this.page.locator(selector).first().textContent().catch(() => '')) ?? '';
      if (t.trim()) return t.replace(/\s+/g, ' ').trim();
    }
    const porEtiqueta = await this.form.leerValorPorEtiqueta(this.etiquetaNumeroCaso());
    if (porEtiqueta) return porEtiqueta;
    const fb = (await this.page.locator(InboxObjects.caseNumber).first().textContent().catch(() => '')) ?? '';
    return fb.replace(/\s+/g, ' ').trim();
  }

  /**
   * Número del caso VISIBLE ahora. Se RELEE cada vez (en un proceso con subprocesos el número
   * puede cambiar) y se acumula en el histórico. Si la pantalla no lo muestra, devuelve el
   * último número conocido del caso.
   */
  async numeroCasoActual(): Promise<string> {
    const actual = await this.leerNumeroCaso();
    if (actual) this.numerosVistos.add(actual);
    return actual || this.ultimoNumero();
  }

  /** Todos los números que ha tenido el caso (padre + subprocesos). */
  numerosDelCaso(): string[] {
    return [...this.numerosVistos];
  }
  private ultimoNumero(): string {
    const todos = this.numerosDelCaso();
    return todos[todos.length - 1] ?? '';
  }

  private async irABandeja(): Promise<void> {
    await this.page.locator(InboxObjects.inboxMenu).first().click().catch(async () => {
      await this.page.goto('/');
    });
    await this.page.locator(InboxObjects.inboxContainer).first().waitFor({ state: 'visible' }).catch(() => undefined);
  }

  /**
   * ¿El caso está en la bandeja del usuario `clave`? Busca por el `numero` dado o, si se omite,
   * por CUALQUIERA de los números del caso (robusto ante subprocesos que cambian el número).
   */
  async casoEnBandejaDe(clave: string, numero?: string): Promise<boolean> {
    await this.cambiarUsuarioSiHaceFalta(clave);
    await this.irABandeja();
    const objetivos = numero ? [numero] : this.numerosDelCaso();
    for (const num of objetivos) {
      if (!num) continue;
      const filas = this.page.locator(`tr:has-text("${num}"), [role="row"]:has-text("${num}")`);
      if ((await filas.count()) > 0) return true;
    }
    return false;
  }
}
