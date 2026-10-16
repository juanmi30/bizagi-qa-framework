import { test } from '@playwright/test';
import { cargarRegistro } from '../sde/datos';
import { resolve } from 'node:path';
import { cargarEscenario, DIR_ESCENARIOS, type EscenarioSde, type PasoSde } from '../sde/escenario';
import { crearContexto, ejecutarEscenario } from '../sde/ejecutor';
import { celdasDeFila, crearCapacidadesUi, VIEWPORT_SDE, type UiEntorno } from '../sde/capacidades';
import { registrarCasoCreado } from '../sde/registro';
import { esperarCarga, inventarioCampos, textosVisibles } from '../sde/ui';
import { cargarPresentacion } from '../sde/presentacion';
import { aplicarReglasOrtograficas } from '../../../shared/utils/ValidacionesPresentacion';
import { DIR_SALIDA } from '../sde/registro';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generarUnico } from '../../../shared/runner/scenarioLoader';
import { exclusividadEjecucionReal } from '../sde/verticales';

/**
 * CALIBRACIÓN REAL de "Estructurar información" sobre un caso PROPIO ya existente (SDE_CALIBRAR_CASO=<n>), o sobre uno
 * nuevo (SDE_CALIBRAR_CASO=nuevo): Masiva Generales/Modificación, que no exige el documento bloqueado por BUG-01. Los
 * casos propios dejan "Estructurar información" en ~2 h (observado 2026-10-13), por eso existe el modo "nuevo".
 * El caso nuevo se registra en el historial como CALIBRACION.
 * Objetivo: comprobar contra el DOM real las capabilities de los pasos 13–18 y 27–29 de HU06-CP01 mientras la
 * radicación Masiva de Póliza Nueva está bloqueada por defecto (Tipo Documental sin opciones).
 * - Solo lectura y navegación de pestañas. No guarda ni avanza. NO abre el pop-up de filas salvo el modo DESTRUCTIVO de abajo.
 * - SDE_CALIBRAR_POPUP=DESTRUYE_CASO: abre el pop-up de la fila 1 y vuelca su estructura. ADVERTENCIA (2026-10-13, caso 426):
 *   salir del pop-up sin "Guardar" (Cancelar O cerrar la sesión con el pop-up abierto) deja el caso inutilizable
 *   ("Invalid scope action type", BUG-03). Usar solo con un caso de calibración desechable.
 * - SDE_CALIBRAR_POPUP=GUARDAR_SIN_CAMBIOS (UI-10, 2026-10-16): abre la fila 1 del formulario SDE_CALIBRAR_FORMULARIO, vuelca sus
 *   controles y lo cierra con "Guardar" SIN cambiar nada; comprueba que la fila y el número de filas no cambian. Solo pasa la
 *   barrera si ese formulario está "en_calibracion" y SDE_AUTORIZO_CALIBRACION_POPUP es el caso en ejecución. Si "Guardar" no
 *   cierra el pop-up, el recorrido se detiene (nunca se pulsa Cancelar). Usar solo con un caso PROPIO y desechable.
 * - SDE_CALIBRAR_POPUP=GUARDAR_CON_CAMBIO: igual, pero antes de "Guardar" diligencia UN campo del pop-up (SDE_CALIBRAR_CAMPO,
 *   SDE_CALIBRAR_VALOR, SDE_CALIBRAR_TIPO; por defecto "lista"), vuelca los controles después del cambio y compara la fila.
 * - Modo "nuevo": la narrativa es la del Ciclo 1 aportada por Daniel (QA), FICTICIA (Generales/Modificación, 4 pólizas); P17
 *   compara las pólizas introducidas con las observadas en la grilla (observación, no aserción).
 * - NO es un resultado del CP: el reporte se imprime y adjunta como calibración.
 */
test.use({ viewport: VIEWPORT_SDE, trace: 'off' }); // trace off: registraría la clave tecleada
exclusividadEjecucionReal('calibración Estructurar información'); // H6: puede crear casos: nunca en paralelo con otra ejecución real

const P = (matriz: number[], hacer: string, extra: Record<string, unknown> = {}): PasoSde => ({ matriz, hacer, ...extra });

test('calibración Estructurar información sobre caso propio @calibracion', async ({ page, browser }, testInfo) => {
  const numero = process.env.SDE_CALIBRAR_CASO;
  test.skip(!numero, 'Defina SDE_CALIBRAR_CASO=<número de un caso PROPIO en Estructurar información> o "nuevo".');
  testInfo.setTimeout(30 * 60_000);
  const registro = cargarRegistro();
  const nuevo = numero === 'nuevo';
  const popup = process.env.SDE_CALIBRAR_POPUP === 'DESTRUYE_CASO'; // ver advertencia BUG-03 en la cabecera
  const guardarConCambio = process.env.SDE_CALIBRAR_POPUP === 'GUARDAR_CON_CAMBIO';
  const guardarSinCambios = process.env.SDE_CALIBRAR_POPUP === 'GUARDAR_SIN_CAMBIOS' || guardarConCambio;
  const cambio = guardarConCambio
    ? { campo: process.env.SDE_CALIBRAR_CAMPO ?? '', valor: process.env.SDE_CALIBRAR_VALOR ?? '', tipo: process.env.SDE_CALIBRAR_TIPO ?? 'lista' }
    : null;
  if (cambio && (!cambio.campo || !cambio.valor)) throw new Error('GUARDAR_CON_CAMBIO exige SDE_CALIBRAR_CAMPO y SDE_CALIBRAR_VALOR.');
  const formulario = process.env.SDE_CALIBRAR_FORMULARIO ?? 'detalle-polizas-modificacion-generales';
  // Narrativa del Ciclo 1 (Daniel, QA): datos FICTICIOS; la extracción del Worker AI no exige pólizas existentes (V1.1).
  const POLIZAS_CICLO1 = ['100245678', '1109876543', '9023456781', '12012345678'];
  const NARRATIVA_CICLO1 = `Se solicita realizar la modificación de las pólizas ${POLIZAS_CICLO1.slice(0, 3).join(', ')} y ${POLIZAS_CICLO1[3]}. El cambio corresponde a la actualización de información registrada en cada una de las pólizas, de acuerdo con las condiciones definidas para la solicitud. Se requiere validar que la modificación sea aplicada correctamente a todas las pólizas relacionadas, manteniendo sin cambios la información que no haga parte del ajuste solicitado.`;
  // SDE_CALIBRAR_EDICION=ACEPTO_RIESGO_BUG03: ejecuta EXACTAMENTE los pasos P18–P26 del escenario oficial de HU06-CP01 (edición/adición/eliminación
  // de filas). Cada pop-up se cierra con "Guardar" (si algo falla dentro, el ejecutor sigue hasta cerrarlo: política BUG-03).
  // DESTRUCTIVO si alguna etiqueta del pop-up no coincide (caso 430 quedó inutilizable el 2026-10-13): exige confirmación explícita.
  const edicion = process.env.SDE_CALIBRAR_EDICION === 'ACEPTO_RIESGO_BUG03';
  const pasosEdicion = edicion
    ? cargarEscenario(resolve(DIR_ESCENARIOS, '3-hu06-cp01.yaml'), registro).pasos.filter((x) => x.matriz.some((n) => n >= 18 && n <= 26))
    : [];
  const unico = generarUnico();
  const crear: PasoSde[] = !nuevo ? [] : [
    P([2], 'nuevo_caso', { proceso: '${config:SDE_PROCESO_RADICACION}', categoria: '${config:SDE_PROCESO_CATEGORIA}' }),
    P([3], 'diligenciar', { campos: [
      { campo: 'Línea', valor: 'Generales', tipo: 'lista' },
      { campo: 'Ramo', valor: '${config:SDE_GEN_RAMO}', tipo: 'lista' },
      { campo: 'Tipo de Solicitud', valor: 'Modificación', tipo: 'lista' },
      { campo: 'Sucursal', valor: '${config:SDE_SUCURSAL}', tipo: 'lista' },
      { campo: 'Tipo de Radicación', valor: 'Masiva', tipo: 'radio' },
    ] }),
    // Campo obligatorio fuera de la matriz (OBS-08).
    P([9], 'diligenciar', { campos: [
      { campo: '¿Su solicitud requiere cambio de intermediario?', valor: 'No', tipo: 'radio' },
      { campo: 'Descripción de la Solicitud (Masiva/Múltiple)', valor: `Ref. QA ${unico}. ${NARRATIVA_CICLO1}`, tipo: 'area' },
    ] }),
    P([10], 'pulsar', { boton: 'Crear', capturar_numero_caso: true }),
    P([11], 'verificar_ruta', { actor: 'analista', llega_a: 'Estructurar información', no_llega_a: ['Consultar Alertas Intermediario'], maximo_minutos: 15 }),
  ];
  const esc: EscenarioSde = {
    id: 'HU06-CP01', titulo: 'CALIBRACIÓN Estructurar información (no es resultado del CP)', etiquetas: [], actores: ['analista'],
    datasets: [], cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'solo lectura + cancelar' }, archivo: 'calibracion',
    pasos: [
      P([2], 'iniciar_sesion', { actor: 'analista' }),
      ...crear,
      P([13], 'abrir_caso', { actor: 'analista', actividad: 'Estructurar información', maximo_minutos: 1 }),
      // Presentación (reunión QA 2026-10-14), primero: no depende de las etiquetas calibradas antes. No bloqueantes.
      P([1], 'verificar', { no_bloqueante: true, verificar: [{ expectativa: 'EST-ORTOGRAFIA' }] }),
      P([27], 'verificar', { no_bloqueante: true, verificar: [{ expectativa: 'EST-ETIQUETA-OBSERVACIONES' }] }),
      P([14], 'verificar', { verificar: [{ solo_lectura: ['Número de Caso', 'Creador del Caso', 'Fecha de Creación', 'Línea', 'Ramo', 'Tipo de Solicitud'] }] }),
      P([15], 'verificar', { verificar: [{ solo_lectura: ['Tipo Radicación', 'Sucursal'] }, { valor: { campo: 'Tipo Radicación', igual: 'Masiva' } }] }),
      P([16], 'verificar', { verificar: [{ visible: 'Información a Consultar' }, { solo_lectura: ['Descripción Solicitud Masiva'] }] }),
      // Solo estructura de la grilla (las filas dependen de la narrativa real). NO se abre ni cancela el pop-up:
      // Cancelar deja el caso inutilizable ("Invalid scope action type", BUG-03 reproducido en casos 342 y 350).
      P([17], 'tabla_verificar', { tabla: 'Detalle Polizas Asociadas', columnas: ['Forma Consulta', 'Tipo documento del Tomador', 'Número de Documento Tomador', 'Placa', 'Número Póliza', '¿Requiere modificar RCE?', 'Ramo RCE', 'Número Póliza RCE'],
        ...(nuevo ? { comparar: { 'Número Póliza': POLIZAS_CICLO1 } } : {}) }),
      // Modo DESTRUCTIVO: abre el pop-up de la fila 1, vuelca su estructura y termina (el caso queda inutilizable, BUG-03).
      ...(edicion ? pasosEdicion : popup ? [P([18], 'tabla_abrir_fila', { tabla: 'Detalle Polizas Asociadas', fila: 1, formulario: 'detalle-polizas-modificacion-generales' })] : guardarSinCambios ? [
        P([18], 'tabla_abrir_fila', { tabla: 'Detalle Polizas Asociadas', fila: 1, formulario }),
        ...(cambio ? [P([19], 'diligenciar', { campos: [cambio] })] : []),
        P([19], 'dialogo_confirmar', { espera: 'cierra' }),
        P([17], 'tabla_verificar', { tabla: 'Detalle Polizas Asociadas', minimo_filas: 1 }),
      ] : [
        P([28], 'verificar', { verificar: [{ visible: 'Documentos de la solicitud' }, { visible: 'Seguimiento/Trazabilidad' }] }),
        P([29], 'verificar', { verificar: [{ solo_lectura: ['Línea', 'Ramo', 'Tipo de Solicitud', 'Sucursal', 'Tipo Radicación'] }] }),
        // UI-04: navegación real de pestañas (solo lectura; calibrada en los casos 426 y 571).
        // Observaciones ANTES de las pestañas: al abrir Seguimiento el campo deja de verse (caso 571, 2026-10-14).
        P([27], 'verificar', { verificar: [{ editable: ['Observaciones'] }] }),
        P([28], 'abrir_pestana', { pestana: 'Documentos de la solicitud' }),
        P([28], 'abrir_pestana', { pestana: 'Seguimiento/Trazabilidad', contiene: ['Estructurar información'] }),
      ]),
    ],
  };
  const ctx = crearContexto(registro, process.env, unico);
  if (!nuevo) ctx.numeroCaso = numero!;
  const ui: UiEntorno = {
    browser, paginaInicial: page, paginas: new Map(), contextos: [],
    registrarCaso: (n, actor) => registrarCasoCreado({ cp: 'CALIBRACION Estructurar (Masiva Generales/Modificación)', numero: n, actor, unico, cleanup: 'CLEANUP_NOT_APPLICABLE' }),
    // Funcional controlada (P-15/F4): abre la actividad de un caso propio (efecto no determinado) y, en modo "nuevo", crea
    // un caso. No se presenta como solo lectura; sus pasos no guardan ni avanzan (salvo los modos destructivos explícitos).
    soloLectura: false,
  };
  const { capacidades, verificar } = crearCapacidadesUi(ui);
  // Inventario de presentación de Estructurar al abrir la actividad (propuesta para QA; sin valores del caso).
  let presentacion: Record<string, unknown> | null = null;
  let estructuraPopup: unknown = null;
  let filaAntes: string | null = null;
  let filaDespues: string | null = null;
  let estructuraTrasCambio: unknown = null;
  const r = await ejecutarEscenario(esc, {
    capacidades: { ...capacidades,
      // UI-10: estructura del pop-up (rótulos y tipo de control, sin valores) y contenido de la fila ANTES de guardar sin cambios.
      tabla_abrir_fila: async (p, c) => {
        const salida = await capacidades.tabla_abrir_fila(p, c);
        if (ui.dialogo) {
          estructuraPopup = await inventarioCampos(ui.dialogo);
          filaAntes = ui.tabla?.contenidoFila?.join(' | ') ?? null;
        }
        return salida;
      },
      diligenciar: async (p, c) => {
        const salida = await capacidades.diligenciar(p, c);
        if (ui.dialogo && cambio) estructuraTrasCambio = await inventarioCampos(ui.dialogo);
        return salida;
      },
      dialogo_confirmar: async (p, c) => {
        const salida = await capacidades.dialogo_confirmar(p, c);
        if (guardarSinCambios && filaAntes != null) {
          const pg = ui.actual ? ui.paginas.get(ui.actual)! : page;
          filaDespues = (await celdasDeFila(pg, 'Detalle Polizas Asociadas', 1))?.join(' | ') ?? '(sin fila 1)';
        }
        return salida;
      },
      abrir_caso: async (p, c) => {
      const salida = await capacidades.abrir_caso(p, c);
      if (!presentacion && ui.actual) {
        const pg = ui.paginas.get(ui.actual)!;
        const cat = cargarPresentacion();
        const textos = await textosVisibles(pg);
        presentacion = { actividad: 'Estructurar información', caso: c.numeroCaso, fecha: new Date().toISOString(),
          nota: 'Inventario OBSERVADO en QA (solo lectura). Propuesta para aprobación de QA; no es una expectativa aprobada.',
          campos: await inventarioCampos(pg), hallazgos_ortograficos: aplicarReglasOrtograficas(textos, cat.reglas_ortograficas, cat.conocidos), textos_revisados: textos };
      }
      return salida;
    } }, verificar, soloLectura: ui.soloLectura,
    evidencia: async (n) => { const f = await page.screenshot({ fullPage: true }).catch(() => null); if (f) await testInfo.attach(n, { body: f, contentType: 'image/png' }); return n; },
  }, ctx);
  if (estructuraPopup || filaDespues != null) {
    // Solo rótulos y tipos de control del pop-up; la fila contiene datos FICTICIOS de la narrativa controlada.
    console.log(`UI10-POPUP ${JSON.stringify({ formulario, estructura: estructuraPopup, cambio, estructura_tras_cambio: estructuraTrasCambio, fila_antes: filaAntes, fila_despues: filaDespues })}`);
  }
  if (presentacion) {
    mkdirSync(DIR_SALIDA, { recursive: true });
    writeFileSync(`${DIR_SALIDA}/PRESENTACION_ESTRUCTURAR_${Date.now()}.json`, JSON.stringify(presentacion, null, 2) + '\n', 'utf8');
    console.log(`PRESENTACION-ESTRUCTURAR ${JSON.stringify(presentacion)}`);
  }
  // Estructura de las pestañas (solo etiquetas, roles y clases; sin datos del caso) para calibrar SdeObjects.pestana.
  const pestanas = await page.evaluate((nombres) => [...document.querySelectorAll('body *')]
    .filter((e) => nombres.includes(((e as HTMLElement).innerText ?? '').trim()) && e.children.length <= 2)
    .map((e) => {
      const cadena: string[] = [];
      for (let x: Element | null = e; x && cadena.length < 4; x = x.parentElement) cadena.push(`${x.tagName.toLowerCase()}${x.getAttribute('role') ? `[role=${x.getAttribute('role')}]` : ''}.${(x as HTMLElement).className}`.slice(0, 140));
      return { texto: (e as HTMLElement).innerText.trim(), aria: e.getAttribute('aria-selected'), controls: e.getAttribute('aria-controls'), href: e.getAttribute('href'), cadena };
    }), ['Documentos de la solicitud', 'Seguimiento/Trazabilidad']);
  await testInfo.attach('pestanas.json', { body: JSON.stringify(pestanas, null, 2), contentType: 'application/json' });
  console.log(`PESTAÑAS
${JSON.stringify(pestanas, null, 2)}`);
  if (ui.dialogo) {
    // El formulario del pop-up se pinta después del diálogo: se espera a su primer campo (solo como condición de espera).
    await ui.dialogo.locator('[class~="ui-bizagi-render"]').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
    await esperarCarga(page);
    const marco = await ui.dialogo.evaluate((dlg) => ({ iframes: dlg.querySelectorAll('iframe').length, etiquetas: [...dlg.querySelectorAll('label')].map((l) => (l as HTMLElement).innerText.trim()).filter(Boolean) }));
    console.log(`POPUP-ETIQUETAS ${JSON.stringify(marco)}`);
    // Estructura del pop-up: etiquetas, tipo de control y restricciones. Nunca valores (solo su longitud).
    const estructura = await ui.dialogo.evaluate((dlg) => [...dlg.querySelectorAll('[class~="ui-bizagi-render"]')]
      .filter((c) => (c as HTMLElement).offsetParent !== null && c.querySelector('label'))
      .map((c) => ({
        etiqueta: (c.querySelector('label') as HTMLElement).innerText.trim(),
        clases: (c as HTMLElement).className.split(/\s+/).filter((k) => /readonly|required|noneditable/.test(k)),
        controles: [...c.querySelectorAll('input:not([type=hidden]), select, textarea')].map((i) => ({
          tag: i.tagName.toLowerCase(), tipo: (i as HTMLInputElement).type, rol: i.getAttribute('role'), readonly: (i as HTMLInputElement).readOnly,
          maxlength: i.getAttribute('maxlength'), longitudValor: ((i as HTMLInputElement).value ?? '').length,
        })),
        marcaObligatorio: !!c.querySelector('.control-required'),
      })));
    const botones = await ui.dialogo.getByRole('button').evaluateAll((bs) => bs.filter((b) => (b as HTMLElement).offsetParent !== null).map((b) => ((b as HTMLInputElement).value || (b as HTMLElement).innerText).trim()));
    await testInfo.attach('popup.json', { body: JSON.stringify({ estructura, botones }, null, 2), contentType: 'application/json' });
    console.log(`POPUP\n${JSON.stringify({ estructura, botones }, null, 2)}`);
  }
  const resumen = r.pasos.map((p) => `#${p.indice} ${p.hacer} [${p.estado}] P${p.matriz.join(',')} :: ${p.detalle}`).join('\n');
  console.log(`CALIBRACIÓN caso ${ctx.numeroCaso ?? numero}\n${resumen}`);
  await testInfo.attach('calibracion.txt', { body: resumen, contentType: 'text/plain' });
  for (const c of ui.contextos) await c.close().catch(() => undefined);
});
