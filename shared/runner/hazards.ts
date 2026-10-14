import { Page } from '@playwright/test';
import type { Hazard, VerificacionEntrada } from './scenarioLoader';
import type { BpmEngine } from './BpmEngine';

/**
 * Verificaciones de negocio (hazards) del motor data-driven.
 * Cada función devuelve un resultado legible en espanol (ok + descripción),
 * para que el reporte muestre exactamente qué se comprobó.
 */
export interface ResultadoHazard {
  descripcion: string;
  ok: boolean;
  detalle?: string;
}

/** Verifica UN hazard de la lista final del escenario. */
export async function verificarHazard(page: Page, engine: BpmEngine, h: Hazard): Promise<ResultadoHazard> {
  if ('el_caso_avanza_a' in h) {
    const act = h.el_caso_avanza_a;
    // Solo elementos VISIBLES (evita quedar atascado en una copia oculta del texto).
    const ok = await page.locator(`:text("${act}") >> visible=true`).first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    return { descripcion: `El caso avanza a "${act}"`, ok };
  }
  if ('el_caso_ya_no_esta_en_bandeja_de' in h) {
    const user = h.el_caso_ya_no_esta_en_bandeja_de;
    await engine.numeroCasoActual(); // refresca el número visible ahora
    const nums = engine.numerosDelCaso();
    const presente = await engine.casoEnBandejaDe(user); // busca por cualquiera de los números
    return { descripcion: `El caso ${nums.join('/') || '(sin número)'} ya no está en la bandeja de "${user}"`, ok: !presente };
  }
  if ('asignado_a' in h) {
    const user = h.asignado_a;
    await engine.numeroCasoActual();
    const nums = engine.numerosDelCaso();
    const presente = await engine.casoEnBandejaDe(user);
    return { descripcion: `El caso ${nums.join('/') || '(sin número)'} está asignado a "${user}"`, ok: presente };
  }
  if ('campo_tiene_valor' in h) {
    const { campo, valor } = h.campo_tiene_valor;
    const actual = (await engine.formulario.leerCampo(campo)).trim();
    return {
      descripcion: `El campo "${campo}" tiene el valor "${valor}"`,
      ok: actual === String(valor),
      detalle: `valor actual: "${actual}"`,
    };
  }
  if ('la_tabla_tiene_filas' in h) {
    const { tabla, minimo } = h.la_tabla_tiene_filas;
    const n = await engine.formulario.contarFilas(tabla);
    return {
      descripcion: `La tabla "${tabla}" tiene al menos ${minimo} fila(s)`,
      ok: n >= minimo,
      detalle: `filas encontradas: ${n}`,
    };
  }
  if ('el_caso_termina' in h) {
    await engine.numeroCasoActual().catch(() => undefined);
    const nums = engine.numerosDelCaso();
    const enBandeja = await engine.casoEnBandejaDe(engine.usuarioEnSesion() ?? '');
    return { descripcion: `El caso ${nums.join('/') || '(sin número)'} termina`, ok: !enBandeja };
  }
  return { descripcion: 'Hazard no reconocido', ok: false };
}

/** Verifica las reglas "al entrar" a una actividad (antes de diligenciar). */
export async function verificarEntrada(
  engine: BpmEngine,
  verificaciones: VerificacionEntrada[] = [],
): Promise<ResultadoHazard[]> {
  const resultados: ResultadoHazard[] = [];
  for (const v of verificaciones) {
    if (v.debe_estar === 'vacío' || v.debe_estar === 'vacio') {
      const vacio = await engine.formulario.campoEstaVacio(v.campo);
      resultados.push({ descripcion: `Al entrar, "${v.campo}" debe estar vacío`, ok: vacio });
    } else if (v.tiene_valor != null) {
      const actual = (await engine.formulario.leerCampo(v.campo)).trim();
      resultados.push({
        descripcion: `Al entrar, "${v.campo}" = "${v.tiene_valor}"`,
        ok: actual === v.tiene_valor,
        detalle: `valor actual: "${actual}"`,
      });
    }
  }
  return resultados;
}
