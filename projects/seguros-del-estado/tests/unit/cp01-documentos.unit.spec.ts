import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { cargarRegistro } from '../../sde/datos';
import { cargarEscenario, DIR_ESCENARIOS, type PasoSde, type Verificacion } from '../../sde/escenario';
import { causaDeExcepcion, crearContexto, ejecutarEscenario, type Capacidad } from '../../sde/ejecutor';
import { crearCapacidadesUi, type UiEntorno } from '../../sde/capacidades';

/**
 * HU06-CP01 P9 (P-02; Juan Miguel, 2026-10-19: los documentos solo son obligatorios si la parametrización del formulario lo exige).
 * Formulario de inicio SINTÉTICO que imita la grilla «Documentos Anexos» calibrada hoy en QA (sin «Crear»): Adicionar crea una
 * fila con combo «Tipo Documental» y el aviso «Por favor guarde el registro antes de subir el archivo»; Guardar la persiste (cambia
 * la clave y la repinta con el control de carga). Nada sale a QA.
 */
const reg = cargarRegistro();
interface Grilla { marcada?: boolean; tiposAlAgregar?: string[]; tiposTrasGuardar?: string[]; subidaPersiste?: boolean }

const formulario = (g: Grilla) => `<!doctype html><html><body>
  <div class="ui-bizagi-render bzg-form-grid${g.marcada ? ' ui-bizagi-render-required' : ''}"><div class="bz-rn-grid-header-title">Documentos Anexos</div>
    <table><thead><tr><th><label>Tipo Documental</label></th><th><label>Documento</label></th></tr></thead><tbody class="ui-bizagi-grid-body"></tbody></table>
    <ul><li data-action="add">Adicionar</li><li data-action="save" style="display:none">Guardar</li></ul></div>
  <ul role="listbox" id="lb" style="display:none"></ul>
  <div class="ui-dialog" role="dialog" id="carga" style="display:none"><div class="ui-dialog-title">Subir un archivo</div><input type="file"><button>Subir</button></div>
  <script>
    const g = ${JSON.stringify(g)}; const $ = (s) => document.querySelector(s);
    let guardado = false; let clave = 18873; window.filasAgregadas = 0;
    const fila = (valor) => '<tr data-bizagi-component="cells" data-key="' + clave + '"><td><input role="combobox" aria-controls="lb" value="' + valor + '"></td><td>' +
      (guardado ? '<li class="ui-bizagi-render-upload-wrapper"><a>Documento</a></li><span class="archivo">No hay archivos</span>' : 'Por favor guarde el registro antes de subir el archivo') + '</td></tr>';
    $('[data-action=add]').onclick = () => { guardado = false; window.filasAgregadas++; $('tbody').insertAdjacentHTML('beforeend', fila('Por favor seleccione...')); $('[data-action=save]').style.display = ''; };
    $('[data-action=save]').onclick = () => { const v = $('tbody tr:last-child input').value; guardado = true; clave = 306; $('tbody tr:last-child').outerHTML = fila(v); $('[data-action=save]').style.display = 'none'; };
    document.addEventListener('click', (ev) => {
      const combo = ev.target.closest('input[role=combobox]');
      if (combo) {
        const lb = $('#lb'); if (lb.style.display === '') { lb.style.display = 'none'; return; }
        lb.innerHTML = ['-------------', ...((guardado ? g.tiposTrasGuardar : g.tiposAlAgregar) ?? [])].map((t) => '<li role="option">' + t + '</li>').join('');
        lb.style.display = ''; return;
      }
      const op = ev.target.closest('#lb li');
      if (op) { $('tbody tr:last-child input').value = op.textContent; $('#lb').style.display = 'none'; return; }
      if (ev.target.closest('.ui-bizagi-render-upload-wrapper a')) { $('#carga').style.display = ''; return; }
      if (ev.target.closest('#carga button')) { $('#carga').style.display = 'none'; if (g.subidaPersiste !== false) $('tbody tr:last-child .archivo').textContent = 'soporte-prueba.pdf'; }
    });
  </script></body></html>`;

const P = (extra: Record<string, unknown> = {}): PasoSde => ({ matriz: [9], hacer: 'adjuntar_en_grilla', grilla: 'Documentos Anexos', secuencia: 'segun_obligatoriedad',
  tipo_documental: 'Tipo Sintético A', archivo: 'docs/soporte-prueba.pdf', ...extra });
async function adjuntar(page: Page, g: Grilla, extra: Record<string, unknown> = {}) {
  await page.setContent(formulario(g));
  const ui: UiEntorno = { browser: page.context().browser()!, paginaInicial: page, paginas: new Map([['analista', page]]), contextos: [], actual: 'analista', registrarCaso: () => undefined };
  return crearCapacidadesUi(ui).capacidades.adjuntar_en_grilla(P(extra), crearContexto(reg, {}, 'u'));
}
const agregadas = (page: Page) => page.evaluate(() => (window as unknown as { filasAgregadas: number }).filasAgregadas);

test.describe('HU06-CP01 P9: documentos según obligatoriedad @unit', () => {
  test('documentos no obligatorios (como en QA hoy): continúa SIN adjuntar y sin tocar la grilla', async ({ page }) => {
    const r = await adjuntar(page, { tiposAlAgregar: [], tiposTrasGuardar: [] });
    expect(r).toMatchObject({ detalle: expect.stringContaining('se continúa SIN adjuntar') });
    expect((r as { estado?: string }).estado).toBeUndefined();
    expect(await agregadas(page)).toBe(0);
  });
  test('obligatoriedad evidenciada y tipo disponible al agregar: registra el documento sintético', async ({ page }) => {
    const r = await adjuntar(page, { marcada: true, tiposAlAgregar: ['Tipo Sintético A', 'Otro'], tiposTrasGuardar: ['Tipo Sintético A', 'Otro'] });
    expect(r).toMatchObject({ detalle: expect.stringMatching(/"Tipo Sintético A" \(tipos ofrecidos al agregar la fila\) con "soporte-prueba\.pdf" registrado/) });
  });
  test('los tipos aparecen recién tras guardar: guarda, reactiva la fila y registra (no se declara defecto)', async ({ page }) => {
    const r = await adjuntar(page, { marcada: true, tiposAlAgregar: [], tiposTrasGuardar: ['Tipo Sintético A'] });
    expect(r).toMatchObject({ detalle: expect.stringContaining('tipos ofrecidos tras guardar la fila y reactivarla') });
  });
  test('archivo subido pero no registrado en la fila: nunca PASS', async ({ page }) => {
    await expect(adjuntar(page, { marcada: true, tiposAlAgregar: ['Tipo Sintético A'], subidaPersiste: false })).rejects.toThrow(/no quedó registrado \(archivo visible: no/);
  });
  test('obligatorio sin ningún tipo seleccionable: FAIL clasificado con evidencia (BUG-01)', async ({ page }) => {
    const err = await adjuntar(page, { marcada: true, tiposAlAgregar: [], tiposTrasGuardar: [] }).catch((e: Error) => e);
    expect(String(err)).toMatch(/no ofrece ninguna opción .* ni al agregar la fila ni tras guardarla y reactivarla/);
    expect(causaDeExcepcion(err)).toBe('PRODUCTO_POR_CONFIRMAR');
  });
  test('obligatorio con el tipo configurado ausente: BLOCKED por dato, listando los ofrecidos', async ({ page }) => {
    expect(await adjuntar(page, { marcada: true, tiposAlAgregar: ['Cédula'] })).toMatchObject({ estado: 'BLOCKED', causa: 'DATO', detalle: expect.stringContaining('no está entre los ofrecidos al agregar la fila (Cédula)') });
  });
  test('obligatorio sin tipo configurado: BLOCKED por dato (no elige uno al azar)', async ({ page }) => {
    expect(await adjuntar(page, { marcada: true, tiposAlAgregar: ['Cédula', 'Tipo Sintético A'] }, { tipo_documental: undefined })).toMatchObject({ estado: 'BLOCKED', causa: 'DATO' });
  });

  test('movimiento distinto de Póliza Nueva: el escenario se detiene ANTES de «Crear»', async () => {
    const esc = cargarEscenario(resolve(DIR_ESCENARIOS, '3-hu06-cp01.yaml'), reg);
    const iCrear = esc.pasos.findIndex((p) => p.hacer === 'pulsar' && p.boton === 'Crear');
    const iPre = esc.pasos.findIndex((p) => p.hacer === 'verificar' && (p.verificar ?? []).some((v) => 'valor' in v && (v as { valor: { campo: string } }).valor.campo === 'Tipo de Solicitud'));
    expect(iPre).toBeGreaterThan(-1);
    expect(iPre).toBeLessThan(iCrear);
    const llamadas: string[] = [];
    const ok: Capacidad = async (p) => { llamadas.push(p.hacer); };
    const r = await ejecutarEscenario(esc, {
      capacidades: new Proxy({ iniciar_sesion: async (_p, c) => { c.sesiones.add('analista'); } } as Record<string, Capacidad>, { get: (t, k: string) => t[k] ?? ok }),
      // El formulario muestra «Modificación»: la precondición de Tipo de Solicitud no se cumple.
      verificar: async (v: Verificacion) => ({ ok: !('valor' in v && (v as { valor: { campo: string } }).valor.campo === 'Tipo de Solicitud'), detalle: JSON.stringify(v) }),
      evidencia: async () => undefined,
    }, crearContexto(reg, { BIZAGI_BASE_URL: 'https://sde.test', BIZAGI_LOGIN_DOMINIO: 'd', USUARIO_analista: 'u', CLAVE_analista: 'c', SDE_PROCESO_RADICACION: 'P',
      SDE_PROCESO_CATEGORIA: 'A > B', SDE_GEN_RAMO: 'R', SDE_SUCURSAL: 'S' }, 'u'));
    expect(llamadas).not.toContain('pulsar');
    expect(r.pasos[iPre]).toMatchObject({ estado: 'FAIL' });
    expect(r.numero_caso).toBeNull();
  });
});
