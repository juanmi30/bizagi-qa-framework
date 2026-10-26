import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validarDisenoSde } from '../../sde/disenoQa';
import { explicarPaso } from '../../sde/hallazgosHumanos';
import { consolidarCaso, renderizarSoporteHu, type PasoSoporte } from '../../sde/certificacion';
import { leerZip } from '../../../../shared/utils/zip';
import { exigirDefinicionCasoAfiValida } from '../../../colsubsidio/data/afi/caso';

const RAIZ = resolve(__dirname, '../../../..');
const url = pathToFileURL(resolve(RAIZ, 'tools/qa-diseno/contrato.mjs')).href;
const api = () => (new Function('u', 'return import(u)'))(url);
const piloto = () => JSON.parse(readFileSync(resolve(RAIZ, 'docs/qa-hibrida/piloto/HU06-CP02.diseno.json'), 'utf8'));
const paso = (estado: string, causas: string[] = []): PasoSoporte => ({ n: 1, accion: 'Comprobar campo', esperado: 'Rechazar letras', obtenido: 'Diagnóstico exacto original', estado, causas, fuente: 'reporte.json', capturas: [] });

test.describe('Piloto híbrido sin Bizagi @unit', () => {
  test('piloto fiel a matriz, escenarios y datos nativos; datos ausentes se detectan sin navegador', async () => {
    const r = await validarDisenoSde(piloto(), {});
    expect(r.errores).toEqual([]); expect(r.valido).toBe(true);
    expect(r.bloqueosNativos.join(' ')).toContain('USUARIO_intermediario');
    expect(r.bloqueosNativos.join(' ')).toContain('SDE_AUTOS_RAMO');
    expect(r.listoParaEjecutar).toBe(false); expect(r.aperturaBizagi).toBe('NO_REALIZADA');
  });
  for (const cambio of ['esperado', 'literal', 'cobertura', 'rol', 'omitir-dato', 'campos', 'actor-paso']) {
    test(`rechaza deriva respecto al motor nativo: ${cambio}`, async () => {
      const p = piloto();
      if (cambio === 'esperado') p.pasos[3].esperado = 'Regla inventada';
      if (cambio === 'literal') p.datos.find((d: any) => d.modo === 'literal').valor = 'Valor inventado';
      if (cambio === 'cobertura') p.pasos[3].capacidadesNativas = [999];
      if (cambio === 'rol') p.actores[0].rol = 'Administrador';
      if (cambio === 'omitir-dato') p.datos.pop();
      if (cambio === 'campos') p.pasos[3].campos = ['Campo inventado'];
      if (cambio === 'actor-paso') p.pasos[3].actor = 'analista';
      expect((await validarDisenoSde(p)).valido).toBe(false);
    });
  }
  for (const cambio of ['secreto', 'externo-ficticio', 'dependencia', 'selector', 'fuente', 'manual-automatico']) {
    test(`contrato cerrado: rechaza ${cambio}`, async () => {
      const p = piloto(), { validarContrato } = await api();
      if (cambio === 'secreto') { p.datos[0].sensibilidad = 'secret'; p.datos[0].modo = 'literal'; p.datos[0].valor = 'secreto-ficticio'; }
      if (cambio === 'externo-ficticio') { const d = p.datos.find((d: any) => d.naturaleza === 'sintetico-permitido'); d.sistemaExterno = 'SISE'; }
      if (cambio === 'dependencia') p.pasos.find((s: any) => s.id === 'P19').dependeDe = ['P18'];
      if (cambio === 'selector') p.pasos[0].selector = '#inventado';
      if (cambio === 'fuente') p.datos[0].fuente = 'inexistente';
      if (cambio === 'manual-automatico') p.pasos[3].modalidad = 'manual';
      expect(validarContrato(p).valido).toBe(false);
    });
  }
  test('fuente cambiada invalida el piloto; decisión humana caduca al editar', async () => {
    const p = piloto(), { validarFuentes, revisionVigente, hashContrato } = await api();
    const decision = { version: 'qa-revision/v1', decision: 'aprobado-diseno', revisor: 'qa-logico', hash: hashContrato(p) };
    expect(revisionVigente(p, decision)).toBe(true);
    p.escenario += ' cambio'; expect(revisionVigente(p, decision)).toBe(false);
    p.fuentes[0].sha256 = '0'.repeat(64); expect(validarFuentes(p).length).toBeGreaterThan(0);
    p.nativo.referencia = '../fuera.json'; expect(validarFuentes(p).length).toBeGreaterThan(0);
  });
  test('un dato faltante produce un diagnóstico previo, sin inventar un valor', async () => {
    const p = piloto(), { validarContrato } = await api();
    p.datos[0].modo = 'faltante'; delete p.datos[0].referencia; delete p.datos[0].valor;
    const r = validarContrato(p); expect(r.valido).toBe(true); expect(r.faltantes[0].codigo).toBe('DATO_FALTANTE'); expect(r.listoParaEjecutar).toBe(false);
    const nativo = await validarDisenoSde(p, {});
    expect(nativo.valido).toBe(true); expect(nativo.listoParaEjecutar).toBe(false);
  });
  test('AFI mantiene su contrato y rechaza código o selectores en el JSON nativo', () => {
    const p = JSON.parse(readFileSync(resolve(RAIZ, 'projects/colsubsidio/data/afi/examples/cp04-empresa.afi.json'), 'utf8'));
    expect(() => exigirDefinicionCasoAfiValida(p)).not.toThrow();
    p.selector = '#inventado'; expect(() => exigirDefinicionCasoAfiValida(p)).toThrow();
  });
  test('permite representar un vacío explícito de prueba negativa y lo distingue de un dato faltante', async () => {
    const p = piloto(), { validarContrato } = await api();
    const d = p.datos.find((d: any) => d.modo === 'literal'); d.valor = '';
    expect(validarContrato(p).valido).toBe(true);
    d.modo = 'faltante'; expect(validarContrato(p).valido).toBe(false);
  });
});

test.describe('Lenguaje humano del Word @unit', () => {
  for (const [causa, categoria] of [['PRODUCTO_POR_CONFIRMAR', 'Posible problema funcional'], ['AUTOMATIZACION', 'Fallo de automatización'], ['DATO', 'Información insuficiente para ejecutar'], ['AMBIENTE', 'Condición de ejecución pendiente']]) {
    test(`distingue ${causa} sin modificar el resultado`, () => {
      const p = paso('FAIL', [causa]), antes = JSON.stringify(p);
      expect(explicarPaso(p).categoria).toBe(categoria); expect(JSON.stringify(p)).toBe(antes);
    });
  }
  test('sin evidencia no afirma continuidad; manual y causa desconocida no se atribuyen al producto', () => {
    expect(explicarPaso(paso('NOT_AUTOMATED')).categoria).toBe('Revisión manual necesaria');
    expect(explicarPaso(paso('FAIL', ['NO_CLASIFICADO'])).categoria).toBe('Resultado pendiente de revisión');
    expect(explicarPaso(paso('PASS')).continuidad).toContain('No se puede determinar');
  });
  test('deduce continuidad solo de acciones registradas posteriores, conserva estado y diagnóstico', ({}, info) => {
    const dir = info.outputPath('repo'); mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'r.json'), JSON.stringify({ pasos: [{ indice: 1, estado: 'FAIL', detalle: 'Original | sin recortar', causa: 'DATO' }, { indice: 2, estado: 'NOT_RUN', detalle: 'No ejecutado' }], matriz: [{ n: 1, estado: 'FAIL', cubierto_por: [1] }] }));
    const c = consolidarCaso(dir, dir, { cp: 'HU99-CP01', numeroCaso: '1', configuracion: '', fuentes: ['r.json'] }, { titulo: 'Prueba', pasos: [{ n: 1, accion: 'Revisar', esperado: 'Esperado original' }] });
    expect(c.pasos[0].continuidad).toBe('detenido'); expect(c.pasos[0].diagnosticosOriginales).toEqual(['Original | sin recortar']);
  });
  test('Word conserva diagnóstico exacto, códigos, incidente, fuentes, observaciones y aprobación pendiente', () => {
    const p = { ...paso('FAIL', ['AUTOMATIZACION']), continuidad: 'continuo' as const, diagnosticosOriginales: ['Original | intacto'], incidentes: ['AMBIENTE: incidente original'] };
    const c = { cp: 'HU99-CP01', titulo: 'Caso', numeroCaso: '1', configuracion: 'Configuración', pasos: [p], observaciones: ['Nota QA original'], resumen: { FAIL: 1 } };
    const antes = JSON.stringify(c);
    const cfg = { hu: 'HU99', salida: 'x.docx', template: '', logoCliente: null, cliente: 'Piloto', proyecto: 'Piloto', nombrePruebas: 'Piloto', iteracion: '1', fechaInicio: 'Pendiente', fechaFinalizacion: 'Pendiente', seccion: 'Piloto', encabezado: 'Piloto', casos: [] };
    const template = readFileSync(resolve(RAIZ, 'projects/colsubsidio/templates/soporte-certificacion-cliente-referencia.docx'));
    const xml = leerZip(renderizarSoporteHu(cfg, [c], { template })).find(e => e.nombre === 'word/document.xml')!.datos.toString('utf8');
    for (const t of ['Fallo de automatización'.toLowerCase(), '¿Se pudo continuar?', '¿Qué necesita revisar QA?', 'Detalle técnico y trazabilidad', 'Original | intacto', 'AUTOMATIZACION', 'AMBIENTE: incidente original', 'Nota QA original', 'reporte.json', 'Aprobación funcional QA']) expect(xml).toContain(t);
    expect(xml.indexOf('fallo de automatización')).toBeLessThan(xml.lastIndexOf('Detalle técnico y trazabilidad'));
    expect(JSON.stringify(c)).toBe(antes);
  });
});
