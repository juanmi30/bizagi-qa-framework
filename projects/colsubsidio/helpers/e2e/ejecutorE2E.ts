import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import type { CasoAfiCompilado } from '../../data/afi/caso';
import type { ClasificacionGapE2E, PlanE2ECompilado, VerificacionCompilada } from '../../data/afi/e2e/compilador';
import { evaluarColumnas, evaluarMensajes, evaluarPantalla, type TablaObservada } from '../../data/afi/e2e/evaluadores';
import { estadoPaso, type ResultadoPasoE2E, type ResultadoVerificacion } from '../../data/afi/e2e/modelo';
import type { EtapaAfi } from '../../data/afi/modelo';
import type { PlanPreparacion } from '../../data/afi/resolver';
import { botonDeEtapa, colaboradoresReales, ejecutarCasoAfi } from '../afiCaseRunner';
import { AfiDataUi } from '../afiDataUi';
import { AfiliacionesPortal, errorSeguro } from '../afiliacionesPortal';
import { recorrerRuta, rutaEjecutable, type ResultadoRecorrido, type ValoresRecorrido } from './recorridoSemantico';
import { BizagiQaSupport } from '../bizagiQaSupport';
import { mensajeParaReporte } from '../criterioSmokeEmpresaPj';
import { observarEstructura, type EstructuraPantalla } from '../estructuraPantalla';
import { ParametricaBizagi } from '../parametricaBizagi';

/**
 * Ejecutor GENÉRICO de un plan E2E COMPILADO (data/afi/e2e/compilador.ts). No conoce ningún CP: ejecuta solo las
 * verificaciones EJECUTABLES y reporta los gaps que derivó el compilador. El recorrido del Portal usa el runner oficial
 * (ejecutarCasoAfi) y se detiene en el punto funcional (hook alPuntoFuncional); las pantallas se observan con la estructura
 * SANITIZADA. Fail-closed: lo no observado queda BLOCKED con su causa, nunca PASS.
 */

export class RecorridoE2EDetenido extends Error {
  constructor() { super('Recorrido E2E detenido en el último punto soportado'); this.name = 'RecorridoE2EDetenido'; }
}

export interface ObservacionPortal {
  dispositivo: 'desktop' | 'mobile';
  pantallas: { momento: string; boton: string | null; estructura: EstructuraPantalla }[];
  /** Ruta derivada recorrida más allá del punto funcional (llegadas y acciones ejecutadas, sin valores). */
  ruta?: ResultadoRecorrido;
  abierto: boolean;
  caso: boolean;
  cleanup: 'PASS' | 'FAIL' | 'N/A';
  error?: { tipo: string; mensaje: string; clasificacion: ClasificacionGapE2E | 'FRAMEWORK' };
}

export interface DependenciasE2E {
  adminPage: Page;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  testInfo: TestInfo;
  /** Recorrido del Portal compilado (actor READY). Ausente: las verificaciones del Portal quedan BLOCKED con `motivoSinPortal`. */
  compilado?: CasoAfiCompilado;
  motivoSinPortal?: { detalle: string; clasificacion?: ClasificacionGapE2E };
  viewportMobile?: { width: number; height: number };
  /** Datos EN MEMORIA para la ruta derivada (sujetos, archivos) y planes de las etapas que se atraviesan. */
  recorrido?: { valores: ValoresRecorrido; planEtapa(etapa: EtapaAfi): PlanPreparacion };
}

/** Momento de una observación de la ruta derivada. */
const momentoRuta = (pantalla: string, despuesDe: number) => `ruta:${pantalla}:${despuesDe}`;

/** Clasificación de un error del recorrido del Portal (por su clase pública; nunca por el mensaje con datos). */
export function clasificarErrorPortal(e: unknown): ClasificacionGapE2E | 'FRAMEWORK' {
  const nombre = e instanceof Error ? e.name : '';
  const propia = (e as { clasificacion?: string } | null)?.clasificacion;
  if (propia === 'TEST_DATA_GAP') return 'TEST_DATA_GAP';
  if (/DataGap|DatosPruebaNoListos/.test(nombre)) return 'TEST_DATA_GAP';
  if (/CapabilityGap/.test(nombre)) return 'CAPABILITY_GAP';
  return 'FRAMEWORK';
}

/**
 * Pantalla observada para una verificación: por su botón Continuar (o el punto funcional). Si el recorrido falló ESTANDO en
 * esa pantalla (su botón estaba visible en la estructura del fallo), esa estructura es una observación real y se usa.
 */
export function vistaPantalla(obs: Pick<ObservacionPortal, 'pantallas'>, momento: { boton: string } | 'punto-funcional' | { pantalla: string; despuesDe: number }):
  { vista: ObservacionPortal['pantallas'][number]; enFallo: boolean } | undefined {
  if (typeof momento === 'object' && 'pantalla' in momento) {
    const v = obs.pantallas.find(x => x.momento === momentoRuta(momento.pantalla, momento.despuesDe));
    return v ? { vista: v, enFallo: false } : undefined;
  }
  const boton = momento === 'punto-funcional' ? undefined : momento.boton;
  const directa = obs.pantallas.find(x => boton === undefined ? x.momento === 'punto-funcional' : x.boton === boton);
  if (directa) return { vista: directa, enFallo: false };
  const fallo = boton === undefined ? undefined : obs.pantallas.find(x => x.momento === 'fallo' && x.estructura.botones.some(b => b.id === boton));
  return fallo ? { vista: fallo, enFallo: true } : undefined;
}

const VACIA: EstructuraPantalla = { encabezados: [], migas: [], controles: [], botones: [], alertas: [], tooltips: [], spinners: [] };

async function recorrerPortal(d: DependenciasE2E & { compilado: CasoAfiCompilado }, dispositivo: 'desktop' | 'mobile', plan: PlanE2ECompilado): Promise<ObservacionPortal> {
  const obs: ObservacionPortal = { dispositivo, pantallas: [], abierto: false, caso: false, cleanup: 'N/A' };
  let contexto = d.context, page = d.page;
  if (dispositivo === 'mobile') {
    contexto = await d.browser.newContext({ viewport: d.viewportMobile ?? { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page = await contexto.newPage();
  }
  let numero: string | undefined, cancelado: boolean | undefined;
  try {
    await ejecutarCasoAfi(d.compilado, {
      page, context: contexto, testInfo: d.testInfo, evidencia: 'off', prefijoEvidencia: `E2E-${dispositivo}`,
      // Solo el Portal se emula como Mobile; el soporte Bizagi queda en el contexto de escritorio.
      ...(dispositivo === 'mobile' ? { contextoSoporte: d.context } : {}),
      diagnosticoAntesDeContinuar: async ({ boton }) => { obs.pantallas.push({ momento: 'antes-de-continuar', boton, estructura: await observarEstructura(page) }); },
      // Más allá del punto funcional: la ruta DERIVADA de Knowledge hasta donde no haya bloqueos; luego observar y detener.
      alPuntoFuncional: async () => {
        obs.pantallas.push({ momento: 'punto-funcional', boton: null, estructura: await observarEstructura(page) });
        const ruta = rutaEjecutable(plan.recorrido);
        if (d.recorrido && (ruta.length > 1 || ruta.some(p => p.acciones.length))) {
          const datos = d.recorrido;
          obs.ruta = { llegadas: [], acciones: [] };
          const r = await recorrerRuta({ pantallas: ruta }, {
            page, valores: datos.valores,
            prepararEtapa: async etapa => { await new AfiDataUi(new AfiliacionesPortal(page)).completarEtapa(etapa, datos.planEtapa(etapa)); },
            observar: async (pantalla, n) => { obs.pantallas.push({ momento: momentoRuta(pantalla, n), boton: null, estructura: await observarEstructura(page) }); },
          });
          obs.ruta = r;
        }
        throw new RecorridoE2EDetenido();
      },
      colaboradores: async runtime => {
        const reales = await colaboradoresReales(runtime, d.compilado);
        const soporte = reales.soporte as BizagiQaSupport;
        return {
          ...reales,
          portal: {
            abrir: async () => { await reales.portal.abrir(); obs.abierto = true; },
            enviarUnaVez: registrar => reales.portal.enviarUnaVez(async n => { numero = n; obs.caso = true; await registrar(n); }),
          },
          soporte: {
            login: () => soporte.login(), registrarCasoCreado: (n, e) => soporte.registrarCasoCreado(n, e),
            emularReconocimiento: () => soporte.emularReconocimiento(),
            cancelarCasoCreado: async () => { try { await soporte.cancelarCasoCreado(); cancelado = true; } catch (e) { cancelado = false; throw e; } },
          },
        };
      },
    });
  } catch (e) {
    if (!(e instanceof Error && e.name === 'RecorridoE2EDetenido')) {
      obs.error = { tipo: e instanceof Error ? e.name : 'Error', mensaje: mensajeParaReporte(errorSeguro(e).message), clasificacion: clasificarErrorPortal(e) };
      obs.pantallas.push({ momento: 'fallo', boton: null, estructura: await observarEstructura(page).catch(() => VACIA) });
    }
  } finally {
    obs.cleanup = numero === undefined ? 'N/A' : cancelado ? 'PASS' : 'FAIL';
    if (dispositivo === 'mobile') await contexto.close().catch(() => undefined);
  }
  return obs;
}

export interface ResultadoE2E { pasos: ResultadoPasoE2E[]; portal: ObservacionPortal[]; tablas: Record<string, TablaObservada | { error: string }> }

type Ejecutable = Extract<VerificacionCompilada, { estado: 'EJECUTABLE' }>;

export async function ejecutarCasoE2E(plan: PlanE2ECompilado, d: DependenciasE2E): Promise<ResultadoE2E> {
  const ejecutables = plan.pasos.flatMap(p => p.verificaciones.filter((v): v is Ejecutable => v.estado === 'EJECUTABLE').map(v => ({ p, v })));
  // ---- 1. Bizagi (solo lectura): cada entidad se lee una vez ----
  const tablas: Record<string, TablaObservada | { error: string }> = {};
  let accesoBizagi: ResultadoVerificacion | undefined;
  const bizagi = ejecutables.filter(x => x.v.tipo === 'bizagi-acceso' || x.v.tipo.startsWith('parametrica'));
  if (bizagi.length) {
    try { await new BizagiQaSupport(d.adminPage).login(); accesoBizagi = { tipo: 'bizagi-acceso', estado: 'PASS', detalle: 'Ambiente Bizagi cargado con el usuario configurado' }; }
    catch (e) { accesoBizagi = { tipo: 'bizagi-acceso', estado: 'FAIL', detalle: `No se pudo ingresar a Bizagi (${e instanceof Error ? e.name : 'Error'})` }; }
    for (const { v } of bizagi) {
      const def = v.def;
      if ((def.tipo !== 'parametrica-columnas' && def.tipo !== 'parametrica-mensajes') || tablas[def.entidad] || accesoBizagi.estado !== 'PASS') continue;
      try { tablas[def.entidad] = await new ParametricaBizagi(d.adminPage).leerTabla(def.entidad, def.busqueda); }
      catch (e) { tablas[def.entidad] = { error: mensajeParaReporte(errorSeguro(e).message) }; }
    }
  }
  // ---- 2. Portal: un recorrido por dispositivo con verificaciones ejecutables (mobile solo si desktop no quedó bloqueado por datos) ----
  const portal: ObservacionPortal[] = [];
  const necesita = (disp: 'desktop' | 'mobile') => ejecutables.some(x => x.p.dispositivo === disp && (x.v.tipo.startsWith('portal') || x.v.tipo === 'pantalla' || x.v.tipo === 'accion'));
  if (d.compilado) {
    const c = { ...d, compilado: d.compilado };
    if (necesita('desktop')) portal.push(await recorrerPortal(c, 'desktop', plan));
    const desk = portal.find(o => o.dispositivo === 'desktop');
    if (necesita('mobile') && !(desk?.error && desk.error.clasificacion === 'TEST_DATA_GAP')) portal.push(await recorrerPortal(c, 'mobile', plan));
  }
  const desktop = portal.find(o => o.dispositivo === 'desktop');

  // ---- 3. Evaluación paso a paso ----
  const pasos = plan.pasos.map((p): ResultadoPasoE2E => {
    const obs = portal.find(o => o.dispositivo === p.dispositivo);
    const sinPortal = (): ResultadoVerificacion => {
      if (!d.compilado) return { tipo: 'portal', estado: 'BLOCKED', detalle: d.motivoSinPortal?.detalle ?? 'Sin recorrido del Portal compilado', ...(d.motivoSinPortal?.clasificacion ? { clasificacion: d.motivoSinPortal.clasificacion } : {}) };
      const e = (obs ?? desktop)?.error;
      const detalle = !obs ? `Recorrido del Portal (${p.dispositivo}) no ejecutado: bloqueado por el recorrido desktop (${desktop?.error?.tipo ?? 'sin causa'})`
        : e ? `Recorrido del Portal (${p.dispositivo}) detenido antes: ${e.tipo}` : 'Pantalla no observada en el recorrido';
      const clas = e && e.clasificacion !== 'FRAMEWORK' ? e.clasificacion : !e && obs ? 'CAPABILITY_GAP' as const : undefined;
      return { tipo: 'portal', estado: 'BLOCKED', detalle, ...(clas ? { clasificacion: clas } : {}) };
    };
    const vs = p.verificaciones.map((v): ResultadoVerificacion => {
      if (v.estado === 'GAP') return { tipo: v.tipo, estado: 'BLOCKED', detalle: `${v.gap.motivo}${v.gap.requiere?.length ? ` Requiere: ${v.gap.requiere.join('; ')}` : ''}`, clasificacion: v.gap.clasificacion };
      const def = v.def;
      switch (def.tipo) {
        case 'bizagi-acceso': return accesoBizagi ?? { tipo: def.tipo, estado: 'BLOCKED', detalle: 'Bizagi no consultado' };
        case 'parametrica-columnas':
        case 'parametrica-mensajes': {
          const t = tablas[def.entidad];
          if (!t) return { tipo: def.tipo, estado: 'BLOCKED', detalle: 'Bizagi no disponible para leer la paramétrica' };
          if ('error' in t) return { tipo: def.tipo, estado: 'FAIL', detalle: `Lectura de la paramétrica falló: ${t.error}` };
          return def.tipo === 'parametrica-columnas' ? evaluarColumnas(t, def.columnas) : evaluarMensajes(t, def.columnaMensaje, def.mensajes);
        }
        case 'portal-apertura':
          return obs?.abierto ? { tipo: def.tipo, estado: 'PASS', detalle: 'Pantalla de inicio del Portal cargada' } : { ...sinPortal(), tipo: def.tipo };
        case 'portal-caso-creado':
          if (obs?.caso) return { tipo: def.tipo, estado: 'PASS', detalle: 'El Portal creó el caso (número registrado para cleanup)' };
          if (obs?.error) return { tipo: def.tipo, estado: obs.error.clasificacion === 'FRAMEWORK' ? 'FAIL' : 'BLOCKED', detalle: `No se creó el caso: ${obs.error.tipo}`,
            ...(obs.error.clasificacion !== 'FRAMEWORK' ? { clasificacion: obs.error.clasificacion } : {}) };
          return { ...sinPortal(), tipo: def.tipo };
        case 'pantalla': {
          if (!obs || !d.compilado) { const s = sinPortal(); return { ...s, tipo: def.tipo, detalle: `${def.pantalla}: ${s.detalle}` }; }
          const momento = !v.momento || v.momento === 'punto-funcional' ? 'punto-funcional' as const
            : 'pantalla' in v.momento ? v.momento : { boton: botonDeEtapa(v.momento.etapa, d.compilado.perfil) ?? '(sin botón)' };
          const encontrada = vistaPantalla(obs, momento);
          if (!encontrada) { const s = sinPortal(); return { ...s, tipo: def.tipo, detalle: `${def.pantalla}: ${s.detalle}` }; }
          const r = evaluarPantalla(encontrada.vista.estructura, v.expectativa ?? {});
          return { ...r, detalle: `${def.pantalla}: ${r.detalle}${encontrada.enFallo ? ` (observada en la pantalla donde se detuvo el recorrido: ${obs.error?.tipo})` : ''}` };
        }
        case 'accion': {
          // Acción del recorrido derivado: PASS si se ejecutó (o, para "avanzar hasta", si se llegó) en ESTA corrida.
          if (!obs || !d.compilado || !v.momento || typeof v.momento !== 'object' || !('pantalla' in v.momento)) return { ...sinPortal(), tipo: def.tipo };
          const m = v.momento;
          const hecho = def.accion === 'avanzar' && def.hasta && !def.pantalla ? obs.ruta?.llegadas.includes(m.pantalla)
            : obs.ruta?.acciones.some(a => a.pantalla === m.pantalla && a.accion === def.accion && a.indice === m.despuesDe);
          if (hecho) return { tipo: def.tipo, estado: 'PASS', detalle: `${def.accion}${def.sujeto ? ` (${def.sujeto})` : ''} en ${m.pantalla}: ejecutada por el recorrido derivado` };
          const s = sinPortal();
          return { ...s, tipo: def.tipo, detalle: `${def.accion} en ${m.pantalla}: ${s.detalle}` };
        }
        default:
          return { tipo: def.tipo, estado: 'BLOCKED', detalle: 'Verificación sin ejecutor', clasificacion: 'CAPABILITY_GAP' };
      }
    });
    return { paso: p.paso, dispositivo: p.dispositivo, estado: estadoPaso(vs), verificaciones: vs };
  });
  return { pasos, portal, tablas };
}
