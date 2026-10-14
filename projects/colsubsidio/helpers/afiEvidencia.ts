import type { Page, PageScreenshotOptions, TestInfo } from '@playwright/test';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CLASE_OPERACION_AFI, camposSensiblesAfi, camposSensiblesSinMascara, capturaCliente, capturaTecnica, debeCapturarCliente, estadoEvidencia, nombreEvidenciaCliente,
  valoresSensiblesVigilables,
  type EvidenciaClienteAfi, type EvidenciaTecnicaAfi, type IncidenciaEvidenciaAfi, type ManifiestoEvidenciasAfi, type ModoEvidenciaAfi,
  type MotivoIncidenciaEvidencia, type ResultadoFuncionalAfi, type ResumenEvidenciaAfi,
} from '../data/afi/evidencia';
import type { OperacionFuncionalAfi, PasoFuncionalAfi, ResultadoOperacionAfi } from '../data/afi/funcional';
import type { CampoAfi } from '../data/afi/modelo';
import { REGISTRO_CAMPOS_FUNCIONALES, camposSensiblesDelRegistro, selectorCssCampo, type RegistroCampos } from '../data/afi/aplicacion/campos';
import { selectoresCamposAfi } from './afiDataUi';

/**
 * Registro de evidencias AFI (Fase 4G). Captura evidencia CLIENTE en el instante en que una assertion
 * termina (antes de la operación siguiente), con máscara PII y verificación de fuga; escribe el paquete
 * portable y el manifest. Nunca lanza: un problema de evidencia es EVIDENCE_ERROR, no un FAIL funcional.
 */

/** Controles genéricamente sensibles, además de los campos 'pii' de las políticas (defensa en profundidad). */
const SELECTORES_GENERICOS = ['input[type="email"]', 'input[type="tel"]', 'input[type="password"]'];
const COLOR_MASCARA = '#1F1F1F';
export const CARPETA_EVIDENCIA_AFI = 'evidencia-afi';

/** Observación que el driver funcional entrega JUSTO después de ejecutar una operación (resultado ausente = lanzó). */
export interface ObservacionOperacionAfi {
  operacion: OperacionFuncionalAfi;
  indice: number;
  resultado?: ResultadoOperacionAfi;
}
export type ObservadorOperacionAfi = (observacion: ObservacionOperacionAfi) => Promise<void>;

export interface OpcionesEvidenciasAfi {
  page: Page;
  testInfo: TestInfo;
  modo: ModoEvidenciaAfi;
  /** Prefijo de archivos (p. ej. CP02). */
  prefijo: string;
  metadata: { hu: string; caso: string; nombre: string };
  /** Valores sensibles del caso EN MEMORIA (resueltos/aplicados). Solo se comparan dentro del navegador; nunca se serializan. */
  sensibles: () => Iterable<unknown>;
  /** Solo pruebas: registro de selectores por campo (por defecto, el del driver de datos). */
  selectoresCampos?: Partial<Record<CampoAfi, readonly string[]>>;
  /** Field Registry funcional (por defecto el canónico). */
  registro?: RegistroCampos;
  /** Solo pruebas: sustituye el screenshot. */
  capturar?: (page: Page, opciones: PageScreenshotOptions) => Promise<Buffer>;
}

/**
 * Cuenta valores sensibles visibles en el VIEWPORT fuera de las máscaras (texto y valores de controles).
 * Se ejecuta en el navegador y devuelve solo un número: los valores nunca vuelven al proceso de pruebas.
 */
function fugasVisibles({ selectores, sensibles }: { selectores: string[]; sensibles: string[] }): number {
  const mascara = selectores.join(',');
  const enMascara = (el: Element) => !!mascara && !!el.closest(mascara);
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0
      && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };
  const textos: string[] = [];
  const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
    const padre = n.parentElement;
    if (padre && n.textContent?.trim() && !enMascara(padre) && visible(padre)) textos.push(n.textContent);
  }
  for (const c of Array.from(document.querySelectorAll('input, textarea'))) {
    if (!enMascara(c) && visible(c)) textos.push((c as HTMLInputElement).value);
  }
  const norma = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const todo = norma(textos.join(' '));
  // Números con formato (1.500.000, 300 000 0000): se comparan también solo sus dígitos.
  const digitos = textos.join(' ').replace(/\D+/g, '');
  return sensibles.filter(s => {
    const d = s.replace(/\D+/g, '');
    return todo.includes(norma(s)) || (d.length >= 6 && digitos.includes(d));
  }).length;
}

export class EvidenciasAfi {
  private readonly evidencias: EvidenciaClienteAfi[] = [];
  private readonly incidencias: IncidenciaEvidenciaAfi[] = [];
  private readonly porPaso = new Map<string, number>();
  private readonly selectores: string[];
  private readonly sinMascara: string[];
  private secuencia = 0;

  constructor(private readonly o: OpcionesEvidenciasAfi) {
    const campos = o.selectoresCampos ?? selectoresCamposAfi();
    // Campos funcionales sensibles del Field Registry (4J): se enmascaran sin editar esta clase; si su localización
    // no es expresable como máscara, la evidencia cliente queda bloqueada (fail-closed).
    const registro = camposSensiblesDelRegistro(o.registro ?? REGISTRO_CAMPOS_FUNCIONALES);
    this.sinMascara = [...camposSensiblesSinMascara(campos), ...registro.filter(c => !selectorCssCampo(c)).map(c => c.id)];
    // Solo los controles de campos sensibles (lo 'public' queda visible: es lo que la evidencia demuestra).
    this.selectores = [...new Set([
      ...camposSensiblesAfi().flatMap(c => campos[c] ?? []),
      ...registro.map(selectorCssCampo).filter((s): s is string => !!s),
      ...SELECTORES_GENERICOS,
    ])];
  }

  get modo(): ModoEvidenciaAfi { return this.o.modo; }

  /** Carpeta del paquete portable de esta corrida (dentro del output del test). */
  get carpeta(): string { return this.o.testInfo.outputPath(CARPETA_EVIDENCIA_AFI, this.o.prefijo); }

  /** Observador para AfiFunctionalUi.ejecutarPaso. Nunca lanza. */
  observador(paso: PasoFuncionalAfi): ObservadorOperacionAfi {
    return obs => this.observar(paso, obs);
  }

  async observar(paso: PasoFuncionalAfi, { operacion, indice, resultado }: ObservacionOperacionAfi): Promise<void> {
    if (!debeCapturarCliente(this.o.modo, operacion.tipo)) return;
    const status = resultado?.resultado ?? 'FAIL';
    const secuencia = ++this.secuencia;
    const orden = (this.porPaso.get(paso.id) ?? 0) + 1;
    this.porPaso.set(paso.id, orden);
    const incidencia = (motivo: MotivoIncidenciaEvidencia, detalle?: string) => {
      this.incidencias.push({ secuencia, paso: paso.id, indiceOperacion: indice, operacion: operacion.tipo, status, estado: 'EVIDENCE_ERROR', motivo, ...(detalle ? { detalle } : {}) });
    };
    try {
      // Fail-closed: sin máscara garantizada no hay evidencia cliente.
      if (this.sinMascara.length) return incidencia('mascara-incompleta', `${this.sinMascara.length} campo(s) sensibles sin selector`);
      const { page } = this.o;
      const sensibles = valoresSensiblesVigilables(this.o.sensibles());
      if (sensibles.length) {
        const fugas = await page.evaluate(fugasVisibles, { selectores: this.selectores, sensibles });
        if (fugas) return incidencia('pii-visible-sin-mascara', `${fugas} valor(es) sensibles visibles`);
      }
      // Viewport tal como está: sin scroll ni animaciones forzadas (no se altera un estado efímero).
      const opciones: PageScreenshotOptions = { fullPage: false, mask: this.selectores.map(s => page.locator(s)), maskColor: COLOR_MASCARA };
      const imagen = await (this.o.capturar ?? ((p, op) => p.screenshot(op)))(page, opciones);
      const archivo = nombreEvidenciaCliente(this.o.prefijo, paso.id, orden, operacion.tipo, status);
      await mkdir(this.carpeta, { recursive: true });
      const ruta = join(this.carpeta, archivo);
      await writeFile(ruta, imagen);
      await this.o.testInfo.attach(archivo, { path: ruta, contentType: 'image/png' });
      this.evidencias.push({
        secuencia, paso: paso.id, esperado: paso.esperado, orden, indiceOperacion: indice, operacion: operacion.tipo,
        claseOperacion: CLASE_OPERACION_AFI[operacion.tipo] as EvidenciaClienteAfi['claseOperacion'], status,
        clasificacion: 'cliente', tipo: 'screenshot', alcance: 'viewport', archivo, contentType: 'image/png', mascarasPii: this.selectores.length,
      });
    } catch (error) {
      incidencia('captura-fallida', error instanceof Error ? error.name : 'Error');
    }
  }

  /** Resumen para el resultado de ejecución (sin escribir nada). */
  resumen(adjuntosTecnicos: number): ResumenEvidenciaAfi {
    const { modo, prefijo } = this.o;
    return {
      modo, estado: estadoEvidencia(modo, this.evidencias.length, this.incidencias.length),
      capturasCliente: this.evidencias.length, adjuntosTecnicos, erroresCaptura: this.incidencias.length,
      ...(modo === 'off' ? {} : { manifiesto: `${prefijo}-evidencias.json` }),
    };
  }

  /**
   * Escribe el paquete (manifest + copia de resultado) y adjunta el manifest UNA vez.
   * Con modo off no escribe nada. Nunca lanza: devuelve false si no pudo escribir el paquete.
   */
  async cerrar(entrada: {
    resultado: ResultadoFuncionalAfi;
    resumen: ResumenEvidenciaAfi;
    pasos: { id: string; esperado: string; resultado?: ResultadoFuncionalAfi }[];
    /** Ruta del <prefijo>-resultado.json ya escrito: se copia al paquete. */
    resultadoRuta?: string;
    tecnicos: readonly string[];
  }): Promise<boolean> {
    const { modo, prefijo, metadata, testInfo } = this.o;
    if (modo === 'off') return true;
    const politica = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'object' && v && 'mode' in v ? String((v as { mode: unknown }).mode) : 'off');
    const tecnica: EvidenciaTecnicaAfi[] = [
      ...entrada.tecnicos.map(archivo => ({ clasificacion: 'tecnica' as const, tipo: 'json' as const, archivo, contentType: 'application/json', gestion: 'runner' as const })),
      { clasificacion: 'tecnica', tipo: 'video', gestion: 'playwright', politica: politica(testInfo.project.use.video) },
      { clasificacion: 'tecnica', tipo: 'trace', gestion: 'playwright', politica: politica(testInfo.project.use.trace) },
    ];
    const manifiesto: ManifiestoEvidenciasAfi = {
      version: 1, hu: metadata.hu, caso: metadata.caso, nombre: metadata.nombre,
      resultado: entrada.resultado, resultadoArchivo: `${prefijo}-resultado.json`,
      evidencia: entrada.resumen,
      politica: { modo, captura: 'assertion', alcance: 'viewport', mascaraPii: 'politicas-afi', camposSinMascara: [...this.sinMascara] },
      pasos: entrada.pasos, evidencias: [...this.evidencias], incidencias: [...this.incidencias],
      tecnica: capturaTecnica(modo) || capturaCliente(modo) ? tecnica : [],
    };
    try {
      await mkdir(this.carpeta, { recursive: true });
      const ruta = join(this.carpeta, `${prefijo}-evidencias.json`);
      await writeFile(ruta, JSON.stringify(manifiesto, null, 2), 'utf8');
      if (entrada.resultadoRuta) await copyFile(entrada.resultadoRuta, join(this.carpeta, `${prefijo}-resultado.json`));
      await testInfo.attach(`${prefijo}-evidencias.json`, { path: ruta, contentType: 'application/json' });
      return true;
    } catch {
      return false;
    }
  }
}
