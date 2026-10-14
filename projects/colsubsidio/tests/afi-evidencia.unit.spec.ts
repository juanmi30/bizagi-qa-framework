import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CP04_EMPRESA } from '../data/afi/casos/hu14-12-cp04';
import {
  CLASE_OPERACION_AFI, MODOS_EVIDENCIA_AFI, camposSensiblesAfi, camposSensiblesSinMascara, debeCapturarCliente, estadoEvidencia,
  modoEvidenciaAfi, nombreEvidenciaCliente, valoresSensiblesVigilables, type ManifiestoEvidenciasAfi, type ModoEvidenciaAfi,
} from '../data/afi/evidencia';
import { CONTRATO, type OperacionFuncionalAfi, type TipoOperacionFuncional } from '../data/afi/funcional';
import type { ResultadoCasoAfi } from '../helpers/afiCaseRunner';
import { selectoresCamposAfi } from '../helpers/afiDataUi';
import { EvidenciasAfi } from '../helpers/afiEvidencia';
import { ALERTA, CERRAR, CORREO_ENMASCARADO, EDITABLE, ENTORNO, ESCRIBIR, PASOS, PII, SUGERENCIAS, contacto, correr, definicion, paso, ui } from './fixtures/afiEvidenciaFicticia';

/**
 * Fase 4G: evidencias AFI. Páginas FICTICIAS (sin Portal): departamentos, municipios y datos inventados.
 * La política (qué/cuándo capturar, máscara PII) es del framework; el plan solo declara operaciones.
 */

function registro(page: Page, info: TestInfo, extra: Partial<ConstructorParameters<typeof EvidenciasAfi>[0]> = {}) {
  return new EvidenciasAfi({
    page, testInfo: info, modo: 'cliente', prefijo: 'CPX', metadata: { hu: 'HU X', caso: 'CPX', nombre: 'CPX ficticio' },
    sensibles: () => Object.values(ENTORNO), ...extra,
  });
}
const pngs = (info: TestInfo) => info.attachments.filter(a => a.contentType === 'image/png');

/** Color del píxel (x, y) de un PNG, leído en un canvas de otra página (sin dependencias de decodificación). */
async function pixel(page: Page, png: Buffer, x: number, y: number): Promise<number[]> {
  const lienzo = await page.context().newPage();
  try {
    return await lienzo.evaluate(async ({ src, x, y }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    }, { src: `data:image/png;base64,${png.toString('base64')}`, x, y });
  } finally { await lienzo.close(); }
}

// =====================================================================================
test.describe('4G política pura', () => {
  test('clasificación exhaustiva: cada operación del contrato es interaccion, assertion o mixta', () => {
    expect(Object.keys(CLASE_OPERACION_AFI).sort()).toEqual(Object.keys(CONTRATO).sort());
    const interacciones = (Object.keys(CLASE_OPERACION_AFI) as TipoOperacionFuncional[]).filter(t => CLASE_OPERACION_AFI[t] === 'interaccion');
    expect(interacciones.sort()).toEqual(['cerrar-catalogo', 'escribir', 'salir-del-campo', 'seleccionar-exacto']);
    for (const t of ['componente-visible', 'componente-region', 'componente-posicion', 'campo-estado', 'campo-valor', 'catalogo-segun-fuente', 'sugerencias-segun-fuente'] as const) {
      expect(CLASE_OPERACION_AFI[t]).toBe('assertion');
    }
    expect(CLASE_OPERACION_AFI['entrada-rechazada']).toBe('mixta');
  });

  test('modo de evidencia: por defecto cliente; valores cerrados; captura solo assertions en cliente/todo', () => {
    expect(modoEvidenciaAfi(undefined)).toBe('cliente');
    expect(modoEvidenciaAfi(' ')).toBe('cliente');
    expect(modoEvidenciaAfi('TODO')).toBe('todo');
    expect(() => modoEvidenciaAfi('client')).toThrow('Modo de evidencia desconocido');
    const captura = (m: ModoEvidenciaAfi) => [debeCapturarCliente(m, 'campo-valor'), debeCapturarCliente(m, 'escribir')];
    expect(MODOS_EVIDENCIA_AFI.map(captura)).toEqual([[false, false], [true, false], [false, false], [true, false]]);
  });

  test('E. nombres deterministas, sin valores funcionales', () => {
    expect(nombreEvidenciaCliente('CP02', 'P07', 1, 'sugerencias-segun-fuente', 'PASS')).toBe('CP02-P07-01-sugerencias-segun-fuente.png');
    expect(nombreEvidenciaCliente('CP02', 'P05', 12, 'entrada-rechazada', 'FAIL')).toBe('CP02-P05-12-entrada-rechazada-FAIL.png');
    // Un id de paso raro no inyecta rutas.
    expect(nombreEvidenciaCliente('CP02', '../P1 x', 1, 'campo-valor', 'PASS')).toBe('CP02-P1_x-01-campo-valor.png');
  });

  test('estado de evidencia: completa / parcial / error / desactivada', () => {
    expect(estadoEvidencia('cliente', 3, 0)).toBe('completa');
    expect(estadoEvidencia('cliente', 0, 0)).toBe('completa');
    expect(estadoEvidencia('todo', 2, 1)).toBe('parcial');
    expect(estadoEvidencia('cliente', 0, 2)).toBe('error');
    expect(estadoEvidencia('off', 0, 0)).toBe('desactivada');
    expect(estadoEvidencia('tecnica', 0, 0)).toBe('desactivada');
  });

  test('máscara derivada del modelo: todo campo no public de las políticas tiene selector del driver', () => {
    const selectores = selectoresCamposAfi();
    expect(camposSensiblesAfi().length).toBeGreaterThan(0);
    expect(camposSensiblesSinMascara(selectores)).toEqual([]);
    expect(selectores.numeroIdentificacion).toEqual(['[formcontrolname="identificacion"]']);
    expect(selectores.numeroCelular).toEqual(['#numeroCelular']);
    // Lo public (lo que la evidencia demuestra) no se enmascara por política.
    expect(camposSensiblesAfi()).not.toContain('ciudadVivienda');
    expect(valoresSensiblesVigilables(['abc', ' 900000001 ', true, 900000001, '900000001'])).toEqual(['900000001']);
  });
});

// =====================================================================================
test.describe('4G captura en el driver funcional', () => {
  test('A/J. assertion PASS -> screenshot image/png adjunto; B. interacción sola -> ninguno', async ({ page }, info) => {
    await page.setContent(contacto());
    const ev = registro(page, info);
    const driver = ui(page, info);
    await driver.ejecutarPaso(paso('P01', ESCRIBIR('Vil'), { tipo: 'salir-del-campo', campo: 'ciudadVivienda' }), undefined, ev.observador(paso('P01')));
    expect(pngs(info)).toEqual([]);
    await driver.ejecutarPaso(paso('P02', ALERTA), undefined, ev.observador(paso('P02', ALERTA)));
    expect(pngs(info).map(a => [a.name, a.contentType])).toEqual([['CPX-P02-01-componente-visible.png', 'image/png']]);
    expect(ev.resumen(0)).toMatchObject({ estado: 'completa', capturasCliente: 1, erroresCaptura: 0 });
    // El archivo existe dentro del paquete y es un PNG.
    const png = await readFile(pngs(info)[0].path!);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });

  test('C. assertion FAIL -> captura best-effort con sufijo FAIL y el error funcional original se conserva', async ({ page }, info) => {
    await page.setContent(contacto());
    const ev = registro(page, info);
    const p = paso('P03', { tipo: 'campo-valor', campo: 'ciudadVivienda', valor: 'NO EXISTE', comparacion: 'exacta' }, ALERTA);
    const error = await ui(page, info).ejecutarPaso(p, undefined, ev.observador(p)).then(() => undefined, (e: Error) => e);
    expect(error?.message).toContain('Esperado P03 [campo-valor ciudadVivienda');
    // La operación siguiente no se ejecuta: solo la captura de la FAIL.
    expect(pngs(info).map(a => a.name)).toEqual(['CPX-P03-01-campo-valor-FAIL.png']);
  });

  test('C. operación que lanza (sin resultado) -> se intenta capturar como FAIL', async ({ page }, info) => {
    await page.setContent(contacto());
    const ev = registro(page, info);
    await ev.observar(paso('P04'), { operacion: EDITABLE, indice: 0 });
    expect(pngs(info).map(a => a.name)).toEqual(['CPX-P04-01-campo-estado-FAIL.png']);
  });

  test('D. estado efímero: la captura ocurre con las sugerencias abiertas, ANTES de la operación que las cierra', async ({ page }, info) => {
    await page.setContent(contacto());
    const estados: { panelVisible: boolean; opciones: string[] }[] = [];
    const ev = registro(page, info, {
      capturar: async (p, op) => {
        estados.push({ panelVisible: await p.locator('#p-ciu').isVisible(), opciones: await p.locator('#p-ciu [role=option]').allTextContents() });
        return p.screenshot(op);
      },
    });
    const p = paso('P07', ESCRIBIR('San'), SUGERENCIAS('San'), CERRAR);
    await ui(page, info).ejecutarPaso(p, undefined, ev.observador(p));
    expect(estados).toEqual([{ panelVisible: true, opciones: ['SAN JOSÉ'] }]);
    await expect(page.locator('#p-ciu')).toBeHidden(); // la operación siguiente sí cerró el panel
    expect(pngs(info).map(a => a.name)).toEqual(['CPX-P07-01-sugerencias-segun-fuente.png']);
  });

  test('evidencia nombrada por el plan: con observador conserva el JSON, sin screenshot sin máscara', async ({ page }, info) => {
    await page.setContent(contacto());
    const ev = registro(page, info);
    const p = paso('P08', { ...ALERTA, evidencia: 'alerta-del-plan' } as OperacionFuncionalAfi);
    await ui(page, info).ejecutarPaso(p, undefined, ev.observador(p));
    expect(info.attachments.map(a => a.name)).not.toContain('alerta-del-plan');
    expect(pngs(info).map(a => a.name)).toEqual(['CPX-P08-01-componente-visible.png']);
  });

  test('G. máscara PII: el control sensible visible queda cubierto en la imagen; lo public se ve', async ({ page }, info) => {
    await page.setContent(`<body style="margin:0;background:#fff">${contacto(CORREO_ENMASCARADO)}</body>`);
    const ev = registro(page, info);
    await ev.observar(paso('P09'), { operacion: ALERTA, indice: 0, resultado: { tipo: 'componente-visible', resultado: 'PASS', observado: {} } });
    const [adjunto] = pngs(info);
    expect(adjunto?.name).toBe('CPX-P09-01-componente-visible.png');
    const png = await readFile(adjunto.path!);
    const caja = (await page.locator('#correo').boundingBox())!;
    expect(await pixel(page, png, Math.round(caja.x + caja.width / 2), Math.round(caja.y + caja.height / 2))).toEqual([0x1f, 0x1f, 0x1f]);
    const publico = (await page.locator('#dep').boundingBox())!;
    expect(await pixel(page, png, Math.round(publico.x + publico.width - 3), Math.round(publico.y + publico.height / 2))).not.toEqual([0x1f, 0x1f, 0x1f]);
    // El DOM no se modificó.
    await expect(page.locator('#correo')).toHaveValue(ENTORNO.AFI_QA_CORREO);
  });

  test('H. valor sensible visible fuera de las máscaras -> captura rechazada (fail-closed), sin imagen', async ({ page }, info) => {
    await page.setContent(contacto('<p>Identificación 900.000.001 en texto libre</p>'));
    const ev = registro(page, info);
    await ev.observar(paso('P10'), { operacion: ALERTA, indice: 0, resultado: { tipo: 'componente-visible', resultado: 'PASS', observado: {} } });
    expect(pngs(info)).toEqual([]);
    expect(ev.resumen(0)).toMatchObject({ estado: 'error', capturasCliente: 0, erroresCaptura: 1 });
  });

  test('H. registro de máscara incompleto (campo pii sin selector) -> ninguna evidencia cliente', async ({ page }, info) => {
    await page.setContent(contacto());
    const incompleto = { ...selectoresCamposAfi() };
    delete incompleto.numeroCelular;
    const ev = registro(page, info, { selectoresCampos: incompleto });
    await ev.observar(paso('P11'), { operacion: ALERTA, indice: 0, resultado: { tipo: 'componente-visible', resultado: 'PASS', observado: {} } });
    expect(pngs(info)).toEqual([]);
    expect(ev.resumen(0)).toMatchObject({ estado: 'error', erroresCaptura: 1 });
  });

  test('modo off/tecnica: sin screenshots cliente', async ({ page }, info) => {
    await page.setContent(contacto());
    for (const modo of ['off', 'tecnica'] as const) {
      const ev = registro(page, info, { modo });
      await ev.observar(paso('P12'), { operacion: ALERTA, indice: 0, resultado: { tipo: 'componente-visible', resultado: 'PASS', observado: {} } });
      expect(ev.resumen(0).estado).toBe('desactivada');
    }
    expect(pngs(info)).toEqual([]);
  });
});

// =====================================================================================
async function json<T = Record<string, unknown>>(info: TestInfo, nombre: string): Promise<T> {
  const a = info.attachments.filter(x => x.name === nombre);
  expect(a, `adjunto único ${nombre}`).toHaveLength(1);
  return JSON.parse(await readFile(a[0].path!, 'utf8'));
}

test.describe('4G runner: manifest, paquete y resultado', () => {
  test('F/K/L/M/N. manifest relaciona paso/operación/archivo; JSON únicos, sin rutas absolutas ni PII', async ({ page }, info) => {
    const resultado = await correr(page, info);
    expect(resultado.resultado).toBe('PASS');
    expect(resultado.evidencia).toEqual({ modo: 'cliente', estado: 'completa', capturasCliente: 3, adjuntosTecnicos: expect.any(Number), erroresCaptura: 0, manifiesto: 'CP99-evidencias.json' });
    // N. Exactamente un adjunto lógico por artefacto.
    const nombres = info.attachments.map(a => a.name);
    expect(nombres.length).toBe(new Set(nombres).size);
    for (const n of ['CP99-traza-tecnica.json', 'CP99-ejecucion-funcional.json', 'CP99-resultado.json', 'CP99-evidencias.json']) expect(nombres.filter(x => x === n)).toHaveLength(1);
    // K. Manifest application/json.
    expect(info.attachments.find(a => a.name === 'CP99-evidencias.json')!.contentType).toBe('application/json');
    const m = await json<ManifiestoEvidenciasAfi>(info, 'CP99-evidencias.json');
    // F. Relación inequívoca con caso/paso/operación/archivo y con el resultado.
    expect(m).toMatchObject({ version: 1, hu: CP04_EMPRESA.hu, caso: 'CP99', resultado: 'PASS', resultadoArchivo: 'CP99-resultado.json', evidencia: resultado.evidencia });
    expect(m.evidencias.map(e => [e.secuencia, e.paso, e.orden, e.indiceOperacion, e.operacion, e.status, e.clasificacion, e.archivo])).toEqual([
      [1, 'P02', 1, 0, 'componente-visible', 'PASS', 'cliente', 'CP99-P02-01-componente-visible.png'],
      [2, 'P02', 2, 1, 'campo-estado', 'PASS', 'cliente', 'CP99-P02-02-campo-estado.png'],
      [3, 'P03', 1, 1, 'sugerencias-segun-fuente', 'PASS', 'cliente', 'CP99-P03-01-sugerencias-segun-fuente.png'],
    ]);
    expect(m.evidencias[0]).toMatchObject({ esperado: 'Esperado P02', tipo: 'screenshot', contentType: 'image/png', alcance: 'viewport' });
    expect(m.pasos).toEqual([{ id: 'P02', esperado: 'Esperado P02', resultado: 'PASS' }, { id: 'P03', esperado: 'Esperado P03', resultado: 'PASS' }, { id: 'P04', esperado: 'Esperado P04', resultado: 'PASS' }]);
    expect(m.tecnica.every(t => t.clasificacion === 'tecnica')).toBe(true);
    expect(m.tecnica.filter(t => t.tipo === 'video' || t.tipo === 'trace').map(t => t.gestion)).toEqual(['playwright', 'playwright']);
    expect(m.tecnica.map(t => t.archivo)).toContain('CP99-traza-tecnica.json');
    expect(m.incidencias).toEqual([]);
    // Cada evidencia del manifest es un adjunto image/png con el mismo nombre.
    for (const e of m.evidencias) expect(info.attachments.find(a => a.name === e.archivo)?.contentType).toBe('image/png');
    // L/M. Sin rutas absolutas ni PII (manifest y resultado).
    const r = await json(info, 'CP99-resultado.json');
    const texto = JSON.stringify([m, r]);
    expect(texto).not.toMatch(PII);
    expect(texto).not.toMatch(/[A-Za-z]:[\\/]|\\\\|\/(Users|home|tmp)\//);
    expect(texto).not.toContain(info.outputDir.replace(/\\/g, '\\\\'));
    expect(r).toMatchObject({ resultado: 'PASS', evidencia: { estado: 'completa' } });
    expect(Object.keys(m.evidencias[0]).sort()).not.toContain('actorId');
    // Paquete portable: manifest, resultado y PNGs en la misma carpeta.
    const paquete = info.outputPath('evidencia-afi', 'CP99');
    expect(JSON.parse(await readFile(resolve(paquete, 'CP99-evidencias.json'), 'utf8'))).toEqual(m);
    expect(JSON.parse(await readFile(resolve(paquete, 'CP99-resultado.json'), 'utf8'))).toEqual(r);
    for (const e of m.evidencias) expect((await readFile(resolve(paquete, e.archivo))).subarray(1, 4).toString()).toBe('PNG');
  });

  test('I. el screenshot falla: PASS funcional intacto, evidencia error con EVIDENCE_ERROR', async ({ page }, info) => {
    const resultado = await correr(page, info, { opcionesEvidencia: { capturar: async () => { throw new TypeError('disco lleno'); } } });
    expect(resultado.resultado).toBe('PASS');
    expect(resultado.pasosFuncionales.every(p => p.resultado === 'PASS')).toBe(true);
    expect(resultado.evidencia).toMatchObject({ estado: 'error', capturasCliente: 0, erroresCaptura: 3 });
    const m = await json<ManifiestoEvidenciasAfi>(info, 'CP99-evidencias.json');
    expect(m.resultado).toBe('PASS');
    expect(m.incidencias.map(i => [i.paso, i.operacion, i.estado, i.motivo, i.detalle])).toEqual([
      ['P02', 'componente-visible', 'EVIDENCE_ERROR', 'captura-fallida', 'TypeError'],
      ['P02', 'campo-estado', 'EVIDENCE_ERROR', 'captura-fallida', 'TypeError'],
      ['P03', 'sugerencias-segun-fuente', 'EVIDENCE_ERROR', 'captura-fallida', 'TypeError'],
    ]);
    expect(pngs(info)).toEqual([]);
  });

  test('I. evidencia parcial: una captura rechazada no reetiqueta el PASS', async ({ page }, info) => {
    let n = 0;
    const resultado = await correr(page, info, { opcionesEvidencia: { capturar: async (p, op) => { if (++n === 2) throw new Error('x'); return p.screenshot(op); } } });
    expect([resultado.resultado, resultado.evidencia?.estado, resultado.evidencia?.capturasCliente]).toEqual(['PASS', 'parcial', 2]);
  });

  test('H. PII del actor visible sin máscara en la pantalla funcional: ninguna evidencia cliente, PASS funcional', async ({ page }, info) => {
    const resultado = await correr(page, info, {}, contacto('<p>Contacto: empresa.qa@example.test</p>'));
    expect(resultado.resultado).toBe('PASS');
    expect(resultado.evidencia).toMatchObject({ estado: 'error', capturasCliente: 0, erroresCaptura: 3 });
    const m = await json<ManifiestoEvidenciasAfi>(info, 'CP99-evidencias.json');
    expect(m.incidencias.every(i => i.motivo === 'pii-visible-sin-mascara')).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(PII);
    expect(pngs(info)).toEqual([]);
  });

  test('C. fallo funcional: captura FAIL en el manifest, resultado FAIL y error original', async ({ page }, info) => {
    const pasos = [paso('P02', ALERTA), paso('P05', { tipo: 'campo-valor', campo: 'ciudadVivienda', valor: 'NO EXISTE', comparacion: 'exacta' })];
    const error = await correr(page, info, {}, contacto(), pasos).then(() => undefined, (e: Error) => e);
    expect(error?.message).toContain('Esperado P05');
    const m = await json<ManifiestoEvidenciasAfi>(info, 'CP99-evidencias.json');
    expect(m.resultado).toBe('FAIL');
    expect(m.evidencias.map(e => [e.paso, e.status, e.archivo])).toEqual([
      ['P02', 'PASS', 'CP99-P02-01-componente-visible.png'], ['P05', 'FAIL', 'CP99-P05-01-campo-valor-FAIL.png'],
    ]);
    expect(m.pasos.map(p => p.resultado)).toEqual(['PASS', 'FAIL']);
  });

  test('modo off: sin screenshots ni manifest; resultado con evidencia desactivada', async ({ page }, info) => {
    const resultado = await correr(page, info, { evidencia: 'off' });
    expect(resultado.evidencia).toMatchObject({ modo: 'off', estado: 'desactivada', capturasCliente: 0 });
    expect(pngs(info)).toEqual([]);
    expect(info.attachments.map(a => a.name)).not.toContain('CP99-evidencias.json');
  });

  test('O. regresión: pasos con su id en el reporte, sin duplicados y resultado compatible', async ({ page }, info) => {
    const resultado: ResultadoCasoAfi = await correr(page, info);
    expect(resultado.pasosFuncionales.map(p => [p.id, p.resultado])).toEqual([['P02', 'PASS'], ['P03', 'PASS'], ['P04', 'PASS']]);
    expect(resultado).toMatchObject({ numeroCaso: '900123', cleanup: 'exitoso', resultado: 'PASS' });
    const fuente = await readFile(resolve(__dirname, '../helpers/afiCaseRunner.ts'), 'utf8');
    expect(fuente).toContain('test.step(`${paso.id}: ${paso.esperado}`');
    // El contrato v1 no cambió: la evidencia no es un campo de la definición.
    expect(Object.keys(definicion(PASOS)).sort()).toEqual(['caso', 'funcional', 'hu', 'nombre', 'perfil', 'preparacion', 'version', ...(CP04_EMPRESA.fuente ? ['fuente'] : [])].sort());
  });
});
