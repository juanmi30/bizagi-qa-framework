import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { cargarEscenario } from '../../sde/escenario';
import { cargarRegistro } from '../../sde/datos';
import { evaluarRecorrido, leerRecorridoGrafico } from '../../sde/capacidades';
import { causaDeExcepcion } from '../../sde/ejecutor';

test.use({ baseURL: 'http://portal.sintetico.local', trace: 'off' });

test.describe('A: validación declarativa @unit', () => {
  for (const comparar of [{}, null, { Placa: [] }, { Placa: [' '] }, { Placa: null }, { ' ': ['ABC123'] }]) {
    test(`rechaza antes de ejecutar ${JSON.stringify(comparar)}`, ({}, info) => {
      const archivo = info.outputPath('escenario.json');
      writeFileSync(archivo, JSON.stringify({ id: 'HU06-CP02', titulo: 'Sintético', actores: ['analista'], datasets: [],
        cleanup: { politica: 'CLEANUP_NOT_APPLICABLE', razon: 'unitaria' },
        pasos: [{ matriz: [12], hacer: 'tabla_verificar', tabla: 'T', comparar }] }));
      expect(() => cargarEscenario(archivo, cargarRegistro())).toThrow(/"comparar"/);
    });
  }
});

// Respuestas SINTÉTICAS con los nombres de campos documentados en 2026-10-19_correcciones-pr7.json.
// No demuestran compatibilidad actual de QA ni usan datos reales.
test.describe('C: identidad desde las respuestas hasta el veredicto @unit', () => {
  const variantes = ['completa', 'sin-radicacion', 'radicacion-incorrecta', 'otra-instancia', 'otro-flujo', 'prohibido', 'incompleto', 'contradictorio', 'respuesta-otra-instancia'] as const;
  for (const modo of variantes) {
    test(modo, async ({ page, context }) => {
      const html = `<!doctype html><html><body><div id="menuListInbox">Bandeja</div><div id="inbox">Bandeja</div><input id="menuQuery">
        <table><tbody><tr><td class="I_RadNumber">700</td><td><button class="ui-bizagi-wp-app-inbox-cases-ico-view" id="abrir">Ver</button></td></tr></tbody></table>
        <div class="ui-dialog" hidden id="dlg"><span class="ui-dialog-title">Consulta Gráfica</span>
        <table><tr><th scope="row">Caso:</th><td>700</td></tr></table><button id="ruta">Ruta</button>
        <div id="inicio" class="processviewer-hotspot processviewer-highlighted start">Inicio</div>
        <div id="consulta" class="processviewer-hotspot processviewer-highlighted subprocess">Consultar</div>
        <div id="worker" class="processviewer-hotspot aiworkertask ${modo === 'prohibido' || modo === 'contradictorio' ? 'processviewer-highlighted' : ''}">Estructurar información</div></div>
        <script>document.getElementById('abrir').onclick = async () => {
          await fetch('/Rest/Cases/WorkitemsGuid?idCase=100&idWorkFlow=10'); document.getElementById('dlg').hidden = false;
        }; document.getElementById('ruta').onclick = () => fetch('/Rest/Cases/TransitionLog?idCase=${modo === 'otra-instancia' ? '200' : '100'}&idWorkFlow=${modo === 'otro-flujo' ? '20' : '10'}');</script></body></html>`;
      await context.route('**/*', (r) => {
        const u = r.request().url();
        if (u.includes('WorkitemsGuid')) return r.fulfill({ json: { currentCase: { idCase: modo === 'respuesta-otra-instancia' ? 200 : 100,
          ...(modo === 'sin-radicacion' ? {} : { radicationNumber: modo === 'radicacion-incorrecta' ? '701' : '700' }) } } });
        if (u.includes('TransitionLog')) return r.fulfill({ json: [
          { guidTaskFrom: 'inicio', guidTaskTo: 'consulta' },
          ...(modo === 'prohibido' ? [{ guidTaskFrom: 'consulta', guidTaskTo: 'worker' }] : []),
          ...(modo === 'incompleto' ? [{ guidTaskFrom: 'consulta' }] : []),
        ] });
        return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
      });
      const ejecutar = async () => evaluarRecorrido(await leerRecorridoGrafico(page, '700'), { no_recorrido: ['Estructurar información'], no_recorrido_tipo: ['aiworkertask'] });
      if (['radicacion-incorrecta', 'otra-instancia', 'otro-flujo', 'respuesta-otra-instancia'].includes(modo)) {
        const error = await ejecutar().catch((e: Error) => e);
        expect(error).toBeInstanceOf(Error);
        expect(causaDeExcepcion(error)).toBe('AUTOMATIZACION');
      } else {
        const resultado = await ejecutar();
        // Decisión de Juan Miguel (20/10): FAIL solo si el registro de la instancia demuestra el nodo prohibido; marcado solo en el
        // dibujo y ausente del registro ('contradictorio') es evidencia contradictoria → inconcluso.
        expect(resultado.estado).toBe(modo === 'completa' ? 'PASS' : modo === 'prohibido' ? 'FAIL' : 'NOT_AUTOMATED');
      }
    });
  }
});
