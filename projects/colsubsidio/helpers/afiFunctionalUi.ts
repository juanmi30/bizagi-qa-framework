import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { resolverCatalogoFuente } from '../data/afi/fuentes';
import {
  REGLAS_REGION, compararCatalogos, evaluarCatalogo, evaluarRegionComponente, evaluarSugerencias, normalizarTextoCatalogo, opcionSeleccionada,
  type CampoContactoFuncional, type ComponenteFuncionalAfi, type FuenteAutoritativaAfi,
  type OperacionFuncionalAfi, type PasoFuncionalAfi, type ResultadoOperacionAfi,
} from '../data/afi/funcional';
import { REGISTRO_CAMPOS_FUNCIONALES, camposDelRegistro, type CampoRegistrado, type RegistroCampos } from '../data/afi/aplicacion/campos';
import type { ObservadorOperacionAfi } from './afiEvidencia';
import { normalizarEspacios } from './afiliacionesPortal';
import { ContactoCatalogos } from './contactoCatalogos';
import { FuenteParametricaPortal, type ProveedorFuenteAfi } from './fuenteParametrica';

/**
 * Ejecutor UI del plan funcional AFI (Fase 2D, ampliado en 4D). Traduce campo/componente de dominio -> control,
 * ejecuta, evalúa, captura evidencia y devuelve observaciones. NO decide qué operaciones correr: eso es el plan.
 * Reutiliza ContactoCatalogos para abrir/leer/elegir catálogos y para la evidencia.
 * Selectores, elemento neutro para el blur y proveedores de fuentes son internos: nunca vienen del plan.
 */

/**
 * Traducción ÚNICA de la localización semántica del Field Registry (4J) a un locator. Los campos y su localización
 * se declaran en data/afi/aplicacion/campos.ts; ninguna operación conoce campos concretos.
 */
export function localizarCampo(page: Page, campo: CampoRegistrado): Locator {
  const l = campo.localizacion;
  return l.tipo === 'atributo-dominio' ? page.locator(`[${l.atributo}="${l.valor}"]`) : page.getByRole(l.rol, { name: l.nombre, exact: true });
}

/** Identidad de cada componente en el Portal (demostrada en el piloto HU 14.12). No es una assertion de su texto. */
const COMPONENTES: Record<ComponenteFuncionalAfi, (page: Page) => Locator> = {
  'alerta-territorial': page => page.locator('.alertas-warn').filter({ hasText: 'Solo puedes afiliarte' }),
  'subtitulo-localizacion-vivienda': page => page.getByText('Información de localización vivienda', { exact: true }),
};

/** Título de la pantalla: zona neutra para perder el foco sin navegar, guardar ni elegir opción. */
const TITULO_PANTALLA = /^(Información de contacto|Ingresa tu información de contacto)$/i;
/** Ventana de observación tras teclear, para detectar un carácter que aparece tarde. */
const VENTANA_ENTRADA_MS = 500;
const TOLERANCIA_PX = 1;

export interface OpcionesAfiFunctionalUi {
  /** Espera máxima de las assertions (por defecto, la de la configuración). */
  timeout?: number;
  /** Solo pruebas: sustituye proveedores de fuentes. Por defecto se observan las paramétricas del Portal. */
  fuentes?: Partial<Record<FuenteAutoritativaAfi, ProveedorFuenteAfi>>;
  /** Field Registry a usar (por defecto el canónico). */
  registro?: RegistroCampos;
}

export class AfiFunctionalUi {
  private readonly catalogos: ContactoCatalogos;
  /** Selecciones hechas por el plan: contexto público de la evidencia de catálogos posteriores. */
  private readonly selecciones: Partial<Record<CampoContactoFuncional, string>> = {};
  private readonly fuentes: Record<FuenteAutoritativaAfi, ProveedorFuenteAfi>;
  private readonly espera: { timeout?: number };
  private comparaciones = 0;
  private readonly campos: ReadonlyMap<string, CampoRegistrado>;
  /** Observador de evidencias del paso en curso (Fase 4G). */
  private observador?: ObservadorOperacionAfi;

  constructor(readonly page: Page, private readonly info: TestInfo, opciones: OpcionesAfiFunctionalUi = {}) {
    this.campos = new Map(camposDelRegistro(opciones.registro ?? REGISTRO_CAMPOS_FUNCIONALES).map(c => [c.id, c]));
    this.catalogos = new ContactoCatalogos(page, info, Object.fromEntries([...this.campos.values()].map(c => [c.etiqueta, localizarCampo(page, c)])));
    this.espera = opciones.timeout === undefined ? {} : { timeout: opciones.timeout };
    // Se crea ya: debe observar las respuestas que el Portal pida desde la carga.
    const portal = opciones.fuentes?.['parametrica-ciudad-nacional'] ?? new FuenteParametricaPortal(page);
    this.fuentes = { 'parametrica-ciudad-nacional': portal };
  }

  /**
   * Ejecuta en orden; registra cada observación (también la FAIL) antes de afirmar.
   * `observar` (Fase 4G) se invoca INMEDIATAMENTE después de cada operación, antes de la siguiente
   * (que podría cerrar un catálogo o cambiar un valor), también si la operación lanzó. Con observador,
   * las capturas nombradas por el plan (`evidencia`) conservan su JSON pero no su screenshot: la
   * evidencia visual la decide el framework.
   */
  async ejecutarPaso(
    paso: PasoFuncionalAfi,
    registrar?: (resultado: ResultadoOperacionAfi) => Promise<void>,
    observar?: ObservadorOperacionAfi,
  ): Promise<ResultadoOperacionAfi[]> {
    const resultados: ResultadoOperacionAfi[] = [];
    this.observador = observar;
    try {
      for (const [indice, op] of paso.operaciones.entries()) {
        let resultado: ResultadoOperacionAfi;
        try {
          resultado = await this.ejecutar(op);
        } catch (error) {
          await observar?.({ operacion: op, indice });
          throw error;
        }
        await observar?.({ operacion: op, indice, resultado });
        resultados.push(resultado);
        await registrar?.(resultado);
        expect(resultado.resultado, `${paso.esperado} [${op.tipo}${resultado.campo ? ` ${resultado.campo}` : ''}: ${JSON.stringify(resultado.observado)}]`).toBe('PASS');
      }
    } finally {
      this.observador = undefined;
    }
    return resultados;
  }

  /** Evidencia nombrada por el plan: sin observador, comportamiento v1 (JSON + screenshot); con observador, solo el JSON. */
  private async evidenciaPlan(nombre: string, datos?: unknown): Promise<void> {
    if (!this.observador) return this.catalogos.evidencia(nombre, datos);
    if (datos !== undefined) await this.info.attach(`${nombre}.json`, { body: JSON.stringify(datos), contentType: 'application/json' });
  }

  async cerrar(): Promise<void> {
    await Promise.all([...new Set(Object.values(this.fuentes))].map(f => f.cerrar()));
  }

  /** Definición registrada del campo; fail-closed si el plan nombra un campo fuera del registro. */
  private definicion(campo: string): CampoRegistrado {
    const c = this.campos.get(campo);
    if (!c) throw new Error(`Campo no registrado en el Field Registry: ${JSON.stringify(String(campo).slice(0, 40))}`);
    return c;
  }

  private control(campo: CampoContactoFuncional): Locator { return this.catalogos.campo(this.definicion(campo).etiqueta); }

  /** Valor mostrado: value de un input; texto de un select (un placeholder cuenta como vacío). */
  private async valorVisible(campo: CampoContactoFuncional, crudo = false): Promise<string> {
    const valor = await this.control(campo).evaluate(el => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
      const texto = (el.textContent ?? '').trim();
      return /^(Selecciona|Seleccione)\b/i.test(texto) ? '' : texto;
    });
    return crudo ? valor : normalizarEspacios(valor);
  }

  private cumple(assertion: Promise<unknown>): Promise<boolean> { return assertion.then(() => true, () => false); }

  private async ejecutar(op: OperacionFuncionalAfi): Promise<ResultadoOperacionAfi> {
    const veredicto = (ok: boolean) => (ok ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL';
    switch (op.tipo) {
      case 'texto-ausente': {
        const texto = op.coincidencia === 'exacta' ? this.page.getByText(op.texto, { exact: true }) : this.page.getByText(op.texto);
        const ausente = await expect(texto).toBeHidden().then(() => true, () => false);
        const visibles = ausente ? 0 : await texto.filter({ visible: true }).count();
        if (ausente && op.evidencia) await this.evidenciaPlan(op.evidencia);
        return { tipo: op.tipo, resultado: ausente ? 'PASS' : 'FAIL', observado: { coincidencia: op.coincidencia, visibles } };
      }
      case 'catalogo-opcion-fuera-de':
      case 'catalogo-no-vacio':
      case 'seleccionar-exacto': {
        const { etiqueta } = this.definicion(op.campo);
        const { opciones } = await this.catalogos.abrir(etiqueta);
        if (op.tipo !== 'seleccionar-exacto' && op.evidencia) {
          // Mismo contenido que antes: opciones, con las selecciones previas del plan si las hay.
          await this.evidenciaPlan(op.evidencia, Object.keys(this.selecciones).length ? { ...this.selecciones, opciones } : opciones);
        }
        const resultado = evaluarCatalogo(op, opciones);
        const elegida = opcionSeleccionada(resultado);
        if (elegida !== undefined && op.tipo === 'seleccionar-exacto') {
          // Con normalización se elige la opción OBSERVADA, no el texto pedido.
          await this.catalogos.elegir(etiqueta, elegida);
          this.selecciones[op.campo] = elegida;
        }
        return resultado;
      }
      case 'cerrar-catalogo': {
        const control = this.control(op.campo);
        // mat-autocomplete retira aria-controls al cerrar: se lee antes.
        const panelId = await control.getAttribute('aria-controls');
        if (!panelId) return { tipo: op.tipo, campo: op.campo, resultado: 'FAIL', observado: { catalogoAbierto: false } };
        await control.press('Escape');
        const cerrado = await expect(this.page.locator(`[id="${panelId}"]`)).toBeHidden().then(() => true, () => false);
        return { tipo: op.tipo, campo: op.campo, resultado: cerrado ? 'PASS' : 'FAIL', observado: { catalogoAbierto: true, cerrado } };
      }
      case 'componente-visible': {
        const componente = COMPONENTES[op.componente](this.page);
        const visible = await this.cumple(expect(componente).toBeVisible(this.espera));
        const coincidencias = await componente.count();
        if (visible && op.evidencia) await this.evidenciaPlan(op.evidencia);
        return { tipo: op.tipo, resultado: veredicto(visible && coincidencias === 1), observado: { componente: op.componente, visible, coincidencias } };
      }
      case 'componente-posicion': {
        const componente = COMPONENTES[op.componente](this.page), referencia = COMPONENTES[op.referencia](this.page);
        const visibles = await this.cumple(Promise.all([expect(componente).toBeVisible(this.espera), expect(referencia).toBeVisible(this.espera)]));
        const base = { componente: op.componente, relacion: op.relacion, referencia: op.referencia };
        if (!visibles) return { tipo: op.tipo, resultado: 'FAIL', observado: { ...base, visibles: false } };
        const [c, r] = [await componente.boundingBox(), await referencia.boundingBox()];
        if (!c || !r) return { tipo: op.tipo, resultado: 'FAIL', observado: { ...base, visibles: false } };
        // Separación vertical en px: >= 0 cumple la relación (con tolerancia de redondeo).
        const separacion = op.relacion === 'debajo-de' ? c.y - (r.y + r.height) : r.y - (c.y + c.height);
        const cumple = separacion >= -TOLERANCIA_PX;
        if (cumple && op.evidencia) await this.evidenciaPlan(op.evidencia);
        return { tipo: op.tipo, resultado: veredicto(cumple), observado: { ...base, visibles: true, separacion: Math.round(separacion) } };
      }
      case 'componente-region': {
        const componente = COMPONENTES[op.componente](this.page);
        const regla = REGLAS_REGION[op.region].id;
        const base = { componente: op.componente, regionEsperada: op.region, regla };
        const visible = await this.cumple(expect(componente).toBeVisible(this.espera)) && await componente.count() === 1;
        if (!visible) return { tipo: op.tipo, resultado: 'FAIL', observado: { ...base, visible: false, condicionCumplida: false } };
        // Viewport REAL del contexto de ejecución (nunca del plan). Posición en coordenadas de página: no depende del scroll.
        const viewport = this.page.viewportSize();
        const caja = await componente.evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top + window.scrollY, height: r.height }; });
        const r = evaluarRegionComponente(op.region, caja, viewport);
        const redondear = (n?: number) => (n === undefined ? undefined : Math.round(n * 10) / 10);
        const observado = {
          ...base, visible: true,
          ...(viewport ? { viewportAncho: viewport.width, viewportAlto: viewport.height } : {}),
          ...(r.centroY !== undefined ? { centroY: redondear(r.centroY)!, limiteY: redondear(r.limiteY)! } : {}),
          ...(r.motivo ? { motivo: r.motivo } : {}),
          condicionCumplida: r.cumple,
        };
        if (op.evidencia) await this.evidenciaPlan(op.evidencia, observado);
        return { tipo: op.tipo, resultado: veredicto(r.cumple), observado };
      }
      case 'campo-estado': {
        const control = this.control(op.campo);
        const visible = await this.cumple(expect(control).toBeVisible(this.espera));
        // "editable": visible y editable por el usuario; "solo-lectura": visible y no editable (deshabilitado o readonly, según el control).
        const cumple = visible && await this.cumple(op.estado === 'editable'
          ? expect(control).toBeEditable(this.espera) : expect(control).not.toBeEditable(this.espera));
        const editable = visible ? await control.isEditable() : false;
        if (cumple && op.evidencia) await this.evidenciaPlan(op.evidencia);
        return { tipo: op.tipo, campo: op.campo, resultado: veredicto(cumple), observado: { estadoEsperado: op.estado, visible, editable } };
      }
      case 'campo-valor': {
        const esperado = 'vacio' in op ? '' : op.valor;
        const norma = (s: string) => ('comparacion' in op && op.comparacion === 'texto-es' ? normalizarTextoCatalogo(s) : normalizarEspacios(s));
        let observado = '';
        // Espera a que el valor se estabilice en el esperado (precargas asíncronas). Ver noGarantiza.
        const cumple = await this.cumple(expect.poll(async () => {
          observado = await this.valorVisible(op.campo);
          return 'vacio' in op ? observado === '' : norma(observado) === norma(esperado);
        }, this.espera).toBe(true));
        if (cumple && op.evidencia) await this.evidenciaPlan(op.evidencia);
        return {
          tipo: op.tipo, campo: op.campo, ...('vacio' in op ? {} : { valorEsperado: op.valor }), resultado: veredicto(cumple),
          observado: { comparacion: 'vacio' in op ? 'vacio' : op.comparacion, valorObservado: observado },
        };
      }
      case 'escribir': {
        const control = this.control(op.campo);
        try {
          // Foco real, borrado por teclado y tecleo carácter a carácter: pasa por los filtros de teclado del Portal (nunca fill).
          await control.click(this.espera);
          await control.press('ControlOrMeta+a');
          await control.press('Backspace');
          await control.pressSequentially(op.texto);
          return { tipo: op.tipo, campo: op.campo, resultado: 'PASS', observado: { caracteres: [...op.texto].length } };
        } catch {
          return { tipo: op.tipo, campo: op.campo, resultado: 'FAIL', observado: { caracteres: [...op.texto].length, escrito: false } };
        }
      }
      case 'entrada-rechazada': {
        const control = this.control(op.campo);
        // Un campo no editable "rechaza" todo trivialmente: eso no prueba un filtro de entrada.
        if (!await this.cumple(expect(control).toBeEditable(this.espera))) {
          return { tipo: op.tipo, campo: op.campo, resultado: 'FAIL', observado: { caracteres: [...op.texto].length, editable: false } };
        }
        const inicial = await this.valorVisible(op.campo, true);
        await control.click(this.espera);
        let aceptados = 0, tardios = 0;
        for (const caracter of op.texto) {
          await control.pressSequentially(caracter);
          if (await this.valorVisible(op.campo, true) !== inicial) aceptados++;
        }
        // Un carácter que aparece tarde (render diferido) también cuenta como plasmado.
        for (let i = 0; i < 5; i++) {
          await this.page.waitForTimeout(VENTANA_ENTRADA_MS / 5);
          if (await this.valorVisible(op.campo, true) !== inicial) tardios++;
        }
        const cumple = aceptados === 0 && tardios === 0;
        if (op.evidencia) await this.evidenciaPlan(op.evidencia);
        return {
          tipo: op.tipo, campo: op.campo, resultado: veredicto(cumple),
          observado: { caracteres: [...op.texto].length, aceptados, cambiosTardios: tardios, valorSinCambios: cumple },
        };
      }
      case 'salir-del-campo': {
        const control = this.control(op.campo);
        const neutro = this.page.getByText(TITULO_PANTALLA).first();
        const url = this.page.url();
        await neutro.scrollIntoViewIfNeeded(this.espera);
        // Solo se hace clic si el punto neutro no está tapado (p. ej. por un panel de opciones): nunca elige una opción.
        const punto = await neutro.evaluate(el => {
          const r = el.getBoundingClientRect();
          const x = r.left + Math.min(r.width / 2, 20), y = r.top + r.height / 2;
          const encima = document.elementFromPoint(x, y);
          return { x, y, libre: !!encima && el.contains(encima) };
        });
        if (!punto.libre) return { tipo: op.tipo, campo: op.campo, resultado: 'FAIL', observado: { neutroLibre: false } };
        await this.page.mouse.click(punto.x, punto.y);
        const sinFoco = await this.cumple(expect(control).not.toBeFocused(this.espera));
        const sinNavegar = this.page.url() === url && await neutro.isVisible();
        return { tipo: op.tipo, campo: op.campo, resultado: veredicto(sinFoco && sinNavegar), observado: { neutroLibre: true, sinFoco, sinNavegar } };
      }
      case 'catalogo-segun-fuente':
        return this.catalogoSegunFuente(op);
      case 'sugerencias-segun-fuente':
        return this.sugerenciasSegunFuente(op);
    }
  }

  /**
   * Lee las sugerencias del panel YA abierto, sin interactuar (sin clic, tecla, selección ni cierre):
   * abrir o reabrir podría restablecer el filtro. undefined = no observables (panel cerrado, virtualizado o inestable).
   */
  private async sugerenciasAbiertas(campo: CampoContactoFuncional): Promise<{ opciones?: string[]; motivo?: string }> {
    const control = this.control(campo);
    if (await control.getAttribute('aria-expanded') !== 'true') return { motivo: 'panel-cerrado' };
    const panelId = await control.getAttribute('aria-controls');
    if (!panelId) return { motivo: 'panel-no-asociado' };
    const panel = this.page.locator(`[id="${panelId}"]`);
    // Adjunto basta: un panel abierto sin opciones no tiene tamaño (Playwright no lo considera visible) y es "sin sugerencias".
    if (!await this.cumple(expect(panel).toBeAttached(this.espera))) return { motivo: 'panel-no-asociado' };
    if (await panel.locator('cdk-virtual-scroll-viewport,.cdk-virtual-scroll-content-wrapper').count()) return { motivo: 'panel-virtualizado' };
    // Filtrado en tiempo real: se espera a que la lista (también vacía) se repita en lecturas consecutivas.
    let opciones: string[] = [], anterior: string | undefined, iguales = 0;
    const estable = await this.cumple(expect.poll(async () => {
      opciones = (await panel.getByRole('option').allTextContents()).map(normalizarEspacios);
      const actual = JSON.stringify(opciones);
      iguales = actual === anterior ? iguales + 1 : 0;
      anterior = actual;
      return iguales;
    }, { timeout: Math.max(this.espera.timeout ?? 30_000, 5_000), intervals: [300, 500, 1_000] }).toBeGreaterThanOrEqual(2));
    if (!estable) return { motivo: 'sugerencias-inestables' };
    // getByRole ya excluye opciones ocultas; con opciones, el panel debe verse.
    if (opciones.length && !await panel.isVisible()) return { motivo: 'panel-no-visible' };
    return { opciones };
  }

  private async sugerenciasSegunFuente(op: Extract<OperacionFuncionalAfi, { tipo: 'sugerencias-segun-fuente' }>): Promise<ResultadoOperacionAfi> {
    const regla = { coincidencia: op.coincidencia, diacriticos: op.diacriticos, mayusculas: op.mayusculas };
    const base = { fuente: op.fuente, textoBusqueda: op.textoBusqueda, ...regla };
    // Estado del control: la búsqueda observada debe ser la declarada; si no, el estado es ambiguo.
    const enControl = await this.valorVisible(op.campo, true);
    const textoCoincide = enControl.normalize('NFC') === op.textoBusqueda.normalize('NFC');
    const filtro = await this.valorVisible(op.filtroDesdeCampo);
    const lectura = textoCoincide ? await this.sugerenciasAbiertas(op.campo) : { motivo: 'texto-distinto-en-control' };
    const instantanea = await this.fuentes[op.fuente].instantanea();
    const resolucion = resolverCatalogoFuente(op.fuente, instantanea, filtro, op.normalizacion);
    const sugerencias = lectura.opciones;
    const evaluacion = sugerencias && resolucion.ok
      ? evaluarSugerencias(sugerencias, resolucion.esperadas, op.textoBusqueda, regla, op.normalizacion) : undefined;
    const motivo = !textoCoincide ? 'texto-distinto-en-control'
      : !sugerencias ? lectura.motivo
        : !resolucion.ok ? resolucion.motivo
          : !sugerencias.length ? 'sin-sugerencias'
            : evaluacion!.cumple ? undefined : 'sugerencias-invalidas';
    const cumple = motivo === undefined;
    const evidencia = {
      campo: op.campo, ...base, campoFiltro: op.filtroDesdeCampo, filtro, normalizacionFuente: op.normalizacion,
      resultado: cumple ? 'PASS' : 'FAIL', ...(motivo ? { motivo } : {}),
      textoEnControlCoincide: textoCoincide,
      fuenteCompleta: resolucion.ok, ...(resolucion.ok ? { cantidadFuente: resolucion.esperadas.length } : { motivoFuente: resolucion.motivo, detalleFuente: resolucion.detalle }),
      cantidadSugerencias: sugerencias?.length ?? 0, sugerencias: sugerencias ?? [],
      fueraDeFuente: evaluacion?.fueraDeFuente ?? [], noCumplenBusqueda: evaluacion?.noCumplenBusqueda ?? [],
      lecturasGetRespaldo: instantanea.lecturasRespaldo, respuestasIlegibles: instantanea.ilegibles,
    };
    const nombre = op.evidencia ?? `sugerencias-${op.fuente}-${op.campo}-${++this.comparaciones}`;
    if (op.evidencia) await this.evidenciaPlan(nombre, evidencia);
    else await this.info.attach(`${nombre}.json`, { body: JSON.stringify(evidencia, null, 2), contentType: 'application/json' });
    return {
      tipo: op.tipo, campo: op.campo, resultado: cumple ? 'PASS' : 'FAIL',
      observado: {
        ...base, filtro, fuenteCompleta: resolucion.ok, cantidadSugerencias: sugerencias?.length ?? 0,
        fueraDeFuente: evaluacion?.fueraDeFuente.length ?? 0, noCumplenBusqueda: evaluacion?.noCumplenBusqueda.length ?? 0,
        ...(motivo ? { motivo } : {}),
      },
    };
  }

  private async catalogoSegunFuente(op: Extract<OperacionFuncionalAfi, { tipo: 'catalogo-segun-fuente' }>): Promise<ResultadoOperacionAfi> {
    const filtro = await this.valorVisible(op.filtroDesdeCampo);
    const { opciones } = await this.catalogos.abrir(this.definicion(op.campo).etiqueta);
    const instantanea = await this.fuentes[op.fuente].instantanea();
    const resolucion = resolverCatalogoFuente(op.fuente, instantanea, filtro, op.normalizacion);
    const comparacion = resolucion.ok ? compararCatalogos(opciones, resolucion.esperadas, op.normalizacion) : undefined;
    const cumple = !!comparacion?.igual;
    // Evidencia segura en TODA comparación (también FAIL): solo datos públicos de catálogo y conteos.
    const evidencia = {
      fuente: op.fuente, campo: op.campo, campoFiltro: op.filtroDesdeCampo, filtro, relacion: op.relacion, normalizacion: op.normalizacion,
      resultado: cumple ? 'PASS' : 'FAIL',
      ...(resolucion.ok
        ? { claveFiltro: resolucion.claveFiltro, completa: true, cantidadEsperada: resolucion.esperadas.length, esperadas: resolucion.esperadas }
        : { completa: false, motivo: resolucion.motivo, detalle: resolucion.detalle }),
      cantidadObservada: opciones.length, observadas: opciones,
      faltantes: comparacion?.faltantes ?? [], sobrantes: comparacion?.sobrantes ?? [],
      lecturasGetRespaldo: instantanea.lecturasRespaldo, respuestasIlegibles: instantanea.ilegibles,
    };
    const nombre = op.evidencia ?? `fuente-${op.fuente}-${op.campo}-${++this.comparaciones}`;
    if (op.evidencia) await this.evidenciaPlan(nombre, evidencia);
    else await this.info.attach(`${nombre}.json`, { body: JSON.stringify(evidencia, null, 2), contentType: 'application/json' });
    return {
      tipo: op.tipo, campo: op.campo, resultado: cumple ? 'PASS' : 'FAIL',
      observado: {
        fuente: op.fuente, filtro, completa: resolucion.ok,
        ...(resolucion.ok ? { cantidadEsperada: resolucion.esperadas.length } : { motivo: resolucion.motivo }),
        cantidadObservada: opciones.length, faltantes: comparacion?.faltantes.length ?? 0, sobrantes: comparacion?.sobrantes.length ?? 0,
        lecturasGetRespaldo: instantanea.lecturasRespaldo,
      },
    };
  }
}
