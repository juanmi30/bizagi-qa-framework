import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { leerZip } from '../../../../shared/utils/zip';
import { textoParrafoDocx, elementosXml } from '../../../../shared/utils/xml';
import { consolidarCaso, renderizarSoporteHu, type PasoSoporte, type ConfigSoporteHu } from '../../sde/certificacion';
import { redactarPaso } from '../../sde/redaccionSoporte';
import { excluirSecretosTecnicos } from '../../sde/secretosSoporte';
const RAIZ = resolve(__dirname, '../../../..'), DIR = resolve(RAIZ, 'projects/seguros-del-estado');
const paso = (obtenido: string, extra: Partial<PasoSoporte> = {}): PasoSoporte => ({ n: 1, accion: 'Acción de matriz', esperado: 'Esperado de matriz', estado: 'PASS', obtenido, fuente: 'reporte.json', capturas: [], ...extra });

test.describe('Soporte oficial con lenguaje natural @unit', () => {
  test('conserva identidades autorizadas y excluye únicamente secretos técnicos sintéticos', () => {
    const texto = 'Usuario=QA Corporativo; caso=123; password="secreto-sintetico"; CLAVE_analista=clave-sintetica; token=token-sintetico';
    const limpio = excluirSecretosTecnicos(texto);
    expect(limpio).toContain('Usuario=QA Corporativo; caso=123'); expect(limpio).not.toMatch(/secreto-sintetico|clave-sintetica|token-sintetico/);
    expect(excluirSecretosTecnicos('Authorization: Bearer token-sintetico')).not.toContain('token-sintetico');
    expect(excluirSecretosTecnicos('Cookie: session=valor-sintetico')).not.toContain('valor-sintetico');
    expect(excluirSecretosTecnicos('{"password":"secreto-sintetico","access_token":"token-sintetico"}')).not.toMatch(/secreto-sintetico|token-sintetico/);
    expect(excluirSecretosTecnicos('BIZAGI_PASSWORD=clave-sintetica')).not.toContain('clave-sintetica');
  });
  test('presentación: explica tilde y decisión concreta, sin códigos ni modificación del resultado', () => {
    const p = paso('1 hallazgo(s): Detalle Polizas Asociadas ORT-TERMINO-POLIZA. EST-NOMENCLATURA-ENCABEZADO PENDIENTE DE DEFINICIÓN', { estado: 'FAIL', causas: ['PRODUCTO_POR_CONFIRMAR'] });
    const antes = JSON.stringify(p), r = redactarPaso(p, 'HU06-CP01');
    expect(r.resultado).toContain('sin la tilde'); expect(r.revision).toContain('Tipo de Movimiento');
    expect(r.resultado).not.toMatch(/ORT-|EST-|PRODUCTO_/); expect(JSON.stringify(p)).toBe(antes);
  });
  test('campo, persistencia y recorrido reciben explicaciones distintas sustentadas en la observación', () => {
    const valores = redactarPaso(paso('Diligenciado y confirmado: Placa=DEF456 · Pop-up confirmado; fila verificada: Placa=DEF456'), 'HU06-CP02');
    expect(valores.resultado).toContain('Al leer la fila guardada'); expect(valores.resultado).toContain('DEF456');
    const ruta = redactarPaso(paso('Caso 123, recorrido: Evidencia completa (registro del servidor y dibujo coinciden): coincide con lo esperado.'), 'HU06-CP05');
    expect(ruta.resultado).toContain('recorrido gráfico registrado del caso 123'); expect(ruta.resultado).not.toEqual(valores.resultado);
  });
  test('solo actividad actual no prueba el recorrido; lectura sin persistencia no afirma guardado', () => {
    expect(redactarPaso(paso('Caso 123: Bizagi lista como actividad actual "Consultar SISE"'), 'HU06-CP05').resultado).toContain('no demuestra por sí sola');
    expect(redactarPaso(paso('"Placa": se tecleó DEF456; el formulario muestra "DEF456"; coincide con lo esperado'), 'HU06-CP02').resultado).not.toContain('guardad');
  });
  test('P18 inconcluso y P14/P22 parciales conservan precisión; bloqueo no implica continuación normal', () => {
    const fixture = JSON.parse(readFileSync(resolve(DIR, 'tests/fixtures/qa-hibrida-cp02-alcance.json'), 'utf8'));
    for (const p of fixture.pasos) {
      const r = redactarPaso(p, 'HU06-CP02');
      if (p.n === 18) { expect(r.hallazgo).toMatch(/No quedó demostrado/); expect(r.incidente).toContain('Después'); expect(r.estado).toContain('FAIL'); }
      else expect(`${r.hallazgo} ${r.alcance}`).toMatch(/No se demuestra|no demuestra/);
    }
    const bloqueado = redactarPaso(paso('Sin ejecución', { estado: 'BLOCKED', continuidad: 'detenido' }), 'HU06-CP01');
    expect(bloqueado.continuidad).not.toMatch(/^Sí/); expect(bloqueado.revision).toContain('bloqueo');
  });
  test('logo del cliente: bytes exactos del Excel autorizado, proporción y encabezado con Gattaca intacto', () => {
    const logo = readFileSync(resolve(DIR, 'assets/branding/logo-seguros-del-estado.png'));
    const excel = leerZip(readFileSync(resolve(DIR, 'fuentes/20260928_SDE_CEL_V1_Casos de Prueba_HU06.xlsx')));
    expect(logo.equals(excel.find(e => e.nombre === 'xl/media/image5.png')!.datos)).toBe(true);
    expect(createHash('sha256').update(logo).digest('hex')).toBe('ae2230316a5f4af617a847bd3278e829eeafd2a402d03e9d10a6f4f80913e8a8');
    const cfg = JSON.parse(readFileSync(resolve(DIR, 'certificacion/HU06.json'), 'utf8')) as ConfigSoporteHu;
    expect(resolve(DIR, 'certificacion', cfg.logoCliente!)).toBe(resolve(DIR, 'assets/branding/logo-seguros-del-estado.png'));
    const template = readFileSync(resolve(RAIZ, cfg.template));
    const doc = leerZip(renderizarSoporteHu(cfg, [], { template, logoCliente: logo }));
    expect(doc.find(e => e.nombre === 'word/header1.xml')!.datos.toString()).not.toContain('[Logo Cliente]');
    expect(doc.find(e => e.nombre === 'word/media/sde-logo-cliente.png')!.datos.equals(logo)).toBe(true);
    for (const e of leerZip(template).filter(e => e.nombre.startsWith('word/media/') || /^word\/footer/.test(e.nombre))) expect(doc.find(x => x.nombre === e.nombre)!.datos.equals(e.datos)).toBe(true);
    const header = doc.find(e => e.nombre === 'word/header1.xml')!.datos.toString();
    const dibujoCliente = elementosXml(header, 'wp:inline').find(e => header.slice(e.inicio, e.fin).includes('name="Logo cliente"'))!;
    const medida = header.slice(dibujoCliente.inicio, dibujoCliente.fin).match(/<wp:extent cx="(\d+)" cy="(\d+)"/)!;
    expect(Number(medida[1]) / Number(medida[2])).toBeCloseTo(900 / 312, 4);
  });
  test('108 pasos reales archivados: diagnósticos íntegros en anexo, lectura principal sin bloques técnicos duplicados', () => {
    const cfg = JSON.parse(readFileSync(resolve(DIR, 'certificacion/HU06.json'), 'utf8')) as ConfigSoporteHu;
    const matriz = JSON.parse(readFileSync(resolve(DIR, 'fuentes/matriz.json'), 'utf8'));
    // Se toman los nombres existentes del directorio versionado, sin depender del histórico privado local.
    const carpeta = 'docs/evidencia/cierre-HU06-20261021T185643Z';
    const casos = cfg.casos.map(c => consolidarCaso(RAIZ, DIR, { ...c, fuentes: [carpeta + '/' + readdirSync(resolve(DIR, carpeta)).find((f: string) => f.startsWith(c.cp + '_'))], transcritos: undefined }, matriz.casos.find((m: any) => m.id === c.cp)));
    const antes = JSON.stringify(casos);
    const xml = leerZip(renderizarSoporteHu(cfg, casos, { template: readFileSync(resolve(RAIZ, cfg.template)), logoCliente: readFileSync(resolve(DIR, 'assets/branding/logo-seguros-del-estado.png')) })).find(e => e.nombre === 'word/document.xml')!.datos.toString();
    expect(casos.reduce((n,c) => n+c.pasos.length,0)).toBe(108); expect(JSON.stringify(casos)).toBe(antes);
    let tecnica = false; const principal: string[] = [], anexo: string[] = [];
    for (const p of elementosXml(xml, 'w:p')) {
      const t = textoParrafoDocx(xml,p);
      if (/^CP\d+ - /.test(t)) tecnica=false;
      if (t === 'Detalle técnico y trazabilidad') tecnica=true;
      (tecnica ? anexo : principal).push(t);
    }
    expect(principal.join('\n')).not.toMatch(/EST-ORTOGRAFIA|INI-ETIQUETAS-INFORMACION-INICIAL|ORT-TERMINO-POLIZA|PRODUCTO_POR_CONFIRMAR|Qué intentó realizar el robot|Comprobación automática realizada/);
    expect(principal.filter(t => t.startsWith('Resultado obtenido:'))).toHaveLength(108);
    for (const c of casos) for (const p of c.pasos) for (const d of p.diagnosticosOriginales ?? [p.obtenido]) expect(anexo.join('\n')).toContain(d);
    expect(principal.join('\n')).not.toContain('[ANONIMIZADO]'); expect(xml).toContain('[Espacio para observaciones del analista QA]');
  });
});
