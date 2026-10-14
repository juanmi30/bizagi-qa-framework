import { test, expect } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarRegistro } from '../../sde/datos';
import { crearContexto } from '../../sde/ejecutor';
import { DOCUMENTOS_PORTABLES, escanearSecretos, generarExport, motivoExclusion, seleccionarArchivos } from '../../sde/exportar';
import { escribirZip, leerZip } from '../../../../shared/utils/zip';

/** Protección de credenciales y exportación sanitizada. Sin navegador ni QA. */

const RAIZ = resolve(__dirname, '..', '..', '..', '..');
const DIR_TESTS = resolve(__dirname, '..');

test.describe('Seguridad y exportación SDE @unit', () => {
  test('toda spec SDE que inicia sesión apaga el trace (registraría la clave tecleada)', () => {
    const specs = readdirSync(DIR_TESTS).filter((f) => f.endsWith('.spec.ts'));
    const sinTraceOff = specs.filter((f) => {
      const s = readFileSync(resolve(DIR_TESTS, f), 'utf8');
      const inicia = /\.login\(|iniciar_sesion|crearCapacidadesUi/.test(s);
      return inicia && !/test\.use\(\{[^}]*trace:\s*'off'/.test(s);
    });
    expect(sinTraceOff).toEqual([]);
  });

  test('política: .env, resultados, capturas, traces y logs se excluyen; .env.example se incluye', () => {
    expect(motivoExclusion('projects/seguros-del-estado/.env')).toMatch(/credenciales/);
    expect(motivoExclusion('projects/seguros-del-estado/.env.local')).toMatch(/credenciales/);
    expect(motivoExclusion('projects/seguros-del-estado/.env.example')).toBeNull();
    expect(motivoExclusion('test-results/seguros-del-estado/sde/HU06-CP05_x.json')).toMatch(/Playwright/);
    expect(motivoExclusion('projects/seguros-del-estado/docs/evidencia/2026-10-07_qa-login-dominio.png')).toMatch(/captura/);
    expect(motivoExclusion('artifacts/trace.zip')).toMatch(/trace/);
    expect(motivoExclusion('projects/seguros-del-estado/docs/evidencia/2026-10-08_fase1b_corrida-sde.log')).toMatch(/log/);
    expect(motivoExclusion('projects/seguros-del-estado/sde/ejecutor.ts')).toBeNull();
  });

  test('la selección no incluye otros proyectos ni el .env, y sí el código SDE y shared', () => {
    const { incluidos } = seleccionarArchivos(RAIZ);
    expect(incluidos.some((r) => r.startsWith('projects/colsubsidio/') || r.startsWith('projects/conpre/') || r.startsWith('projects/demo/'))).toBe(false);
    expect(incluidos).not.toContain('projects/seguros-del-estado/.env');
    expect(incluidos).toContain('projects/seguros-del-estado/.env.example');
    expect(incluidos).toContain('projects/seguros-del-estado/sde/ejecutor.ts');
    expect(incluidos).toContain('shared/utils/zip.ts');
    expect(incluidos.some((r) => r.startsWith('node_modules/') || r.startsWith('test-results/'))).toBe(false);
  });

  test('el escaneo detecta valores del .env, patrones de secreto y secretos dentro de un .xlsx, sin exponer el valor', () => {
    const xlsx = escribirZip([{ nombre: 'xl/sharedStrings.xml', datos: Buffer.from('<si><t>usuario.qa.ficticio</t></si>') }]);
    const h = escanearSecretos([
      { ruta: 'a.md', datos: Buffer.from('linea 1\nla clave es Secreta#99 ok') },
      { ruta: 'b.txt', datos: Buffer.from('CLAVE_analista=algo123') },
      // Fixtures armados por partes: el propio archivo de prueba también pasa por el escaneo del paquete.
      { ruta: 'c.json', datos: Buffer.from(['{"auth":"Bearer', 'abcdefghijklmnopqrstuvwxyz123"}'].join(' ')) },
      { ruta: 'd.md', datos: Buffer.from(['contacto: persona.real', 'segurosdelestado.com'].join('@')) },
      { ruta: 'm.xlsx', datos: xlsx },
      { ruta: 'limpio.md', datos: Buffer.from('CLAVE_analista=\nusuario@example.com\nuser@1.2.3') },
    ], ['Secreta#99', 'usuario.qa.ficticio']);
    expect(h.map((x) => `${x.ruta}:${x.linea}`)).toEqual(['a.md:2', 'b.txt:1', 'c.json:1', 'd.md:1', 'm.xlsx!xl/sharedStrings.xml:1']);
    expect(JSON.stringify(h)).not.toContain('Secreta#99');
    expect(JSON.stringify(h)).not.toContain('usuario.qa.ficticio');
  });

  test('con un hallazgo no se genera el paquete; sin hallazgos el zip contiene el manifiesto', ({}, testInfo) => {
    const raiz = testInfo.outputPath('repo');
    mkdirSync(resolve(raiz, 'projects', 'seguros-del-estado'), { recursive: true });
    writeFileSync(resolve(raiz, 'package.json'), '{}');
    writeFileSync(resolve(raiz, 'projects', 'seguros-del-estado', '.env'), 'CLAVE_analista=Secreta#99');
    writeFileSync(resolve(raiz, 'projects', 'seguros-del-estado', 'nota.md'), 'texto limpio');
    mkdirSync(resolve(raiz, 'docs', 'orquestacion'), { recursive: true });
    for (const d of DOCUMENTOS_PORTABLES) writeFileSync(resolve(raiz, d), '# doc');
    const ok = generarExport(raiz, ['Secreta#99']);
    expect(ok.hallazgos).toEqual([]);
    expect(leerZip(ok.zip!).map((e) => e.nombre)).toEqual([
      'package.json', 'CLAUDE.md', 'docs/orquestacion/CONTEXTO-MAESTRO.md', 'docs/orquestacion/DECISIONES.md',
      'docs/orquestacion/ESTADO-ACTUAL.md', 'docs/orquestacion/PROTOCOLO-AGENTES.md', 'projects/seguros-del-estado/nota.md', 'MANIFIESTO-EXPORT.md',
    ]);
    writeFileSync(resolve(raiz, 'projects', 'seguros-del-estado', 'nota.md'), 'se filtró Secreta#99');
    const mal = generarExport(raiz, ['Secreta#99']);
    expect(mal.zip).toBeNull();
    expect(mal.manifiesto).toContain('projects/seguros-del-estado/nota.md:1');
    expect(mal.manifiesto).not.toContain('Secreta#99');
  });

  test('el paquete exportable de este repositorio no contiene valores del .env local ni patrones de secreto @seguridad', () => {
    test.setTimeout(120_000);
    const secretos = crearContexto(cargarRegistro(), process.env, 'scan').secretos;
    const r = generarExport(RAIZ, secretos);
    expect(r.hallazgos, r.manifiesto).toEqual([]);
  });
});
