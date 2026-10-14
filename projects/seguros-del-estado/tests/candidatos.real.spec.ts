import { test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LoginActions } from '../../../shared/core/LoginActions';
import { SdeObjects } from '../baseObjects/sde.objects';
import { cargarRegistro } from '../sde/datos';
import { crearContexto, sanitizar } from '../sde/ejecutor';
import { DIR_SALIDA } from '../sde/registro';
import { esperarCarga, regexExacto } from '../sde/ui';
import { VIEWPORT_SDE } from '../sde/capacidades';

/**
 * EXPLORACIÓN LIMITADA de cuentas de intermediario entregadas por QA (ENV-03). SOLO LECTURA: inicia sesión, lee rol visible y
 * menú, y comprueba si el portal entrega y muestra "Gestión Solicitudes Centro Expedición". NO abre el formulario de inicio ni
 * crea casos. Máximo 3 cuentas; se detiene en la primera habilitada.
 * Entrada: SDE_CANDIDATOS_ARCHIVO = JSON PRIVADO fuera del repositorio [{ id, usuario, clave_intermediario, area }].
 * Clave de acceso: la de prueba común, tomada de CLAVE_intermediario (.env local); nunca se imprime.
 * Salida: test-results/seguros-del-estado/sde/candidatos-<fecha>.json SOLO con identificadores enmascarados.
 */
test.use({ viewport: VIEWPORT_SDE, trace: 'off' }); // trace off: registraría la clave tecleada

interface Candidato { id: string; usuario: string; clave_intermediario: string; area: string }

test('ENV-03: cuentas de intermediario candidatas (máx. 3, solo lectura) @candidatos', async ({ browser }) => {
  const archivo = process.env.SDE_CANDIDATOS_ARCHIVO;
  test.skip(!archivo || !existsSync(archivo), 'SDE_CANDIDATOS_ARCHIVO=<json privado fuera del repo> para correrlo.');
  test.setTimeout(10 * 60_000);
  const candidatos = (JSON.parse(readFileSync(archivo!, 'utf8')) as Candidato[]).slice(0, 3);
  const env = process.env;
  const clave = env.CLAVE_intermediario ?? '';
  const dominio = env.DOMINIO_intermediario || 'externos';
  const proceso = env.SDE_PROCESO_RADICACION ?? '';
  const categoria = (env.SDE_PROCESO_CATEGORIA ?? '').split('>').map((x) => x.trim()).filter(Boolean)[0] ?? '';
  // Todo texto que salga se sanea contra credenciales del .env y contra los usuarios/claves de los candidatos.
  const secretos = [...crearContexto(cargarRegistro(), env, 'candidatos').secretos, ...candidatos.flatMap((c) => [c.usuario, c.clave_intermediario])]
    .filter((x) => x && x.length >= 3);
  const resultados: Record<string, unknown>[] = [];

  for (const c of candidatos) {
    const contexto = await browser.newContext({ baseURL: env.BIZAGI_BASE_URL, ignoreHTTPSErrors: true, viewport: VIEWPORT_SDE });
    const page = await contexto.newPage();
    const r: Record<string, unknown> = { id: c.id, area: c.area };
    try {
      await new LoginActions(page).navegarAlPortal({ timeout: 120_000, intervalo: 4_000 });
      await new LoginActions(page).login(c.usuario, clave, dominio);
      r.autentica = (await page.locator(SdeObjects.bandeja).filter({ visible: true }).count()) > 0;
    } catch (e) {
      r.autentica = false;
      r.error_login = sanitizar((e as Error).message.split('\n')[0], secretos);
      r.mensaje_portal = sanitizar((await page.locator('.error, [class*="error" i]').filter({ visible: true }).allInnerTexts().catch(() => [])).join(' | ').slice(0, 160), secretos);
    }
    if (r.autentica) {
      await esperarCarga(page);
      // Rol: líneas con forma de rol Bizagi (p. ej. CE_Analista). El nombre de la persona NO se registra.
      r.roles = (await page.locator('body').innerText()).split('\n').map((x) => x.trim()).filter((x) => /^[A-Z]{2,}_[A-Za-zÁÉÍÓÚáéíóúñ]+$/.test(x));
      r.menu = await page.locator('[id^="menuList"], #menuQuery').evaluateAll((es) => es.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.id));
      const cuerpos: Promise<string>[] = [];
      page.on('response', (resp) => { if (resp.url().includes(SdeObjects.rutaProcesos) && resp.status() === 200) cuerpos.push(resp.text().catch(() => '')); });
      await page.locator(SdeObjects.nuevoCaso).filter({ visible: true }).click();
      await page.locator(SdeObjects.todosLosProcesos).filter({ visible: true }).click().catch(() => undefined);
      await esperarCarga(page);
      const textos = await Promise.all(cuerpos);
      r.portal_recibe_proceso = textos.some((t) => t.includes(proceso));
      r.respuestas_200 = textos.length;
      r.categoria_visible = categoria ? (await page.locator(`${SdeObjects.arbolCategoria} > ${SdeObjects.arbolCategoriaTexto}`).filter({ hasText: regexExacto(categoria) }).filter({ visible: true }).count()) === 1 : null;
      r.habilitado = r.portal_recibe_proceso === true;
    }
    await contexto.close();
    resultados.push(r);
    console.log(`CANDIDATO ${JSON.stringify(r)}`);
    if (r.habilitado) break; // se detiene en la primera cuenta habilitada
  }
  mkdirSync(DIR_SALIDA, { recursive: true });
  writeFileSync(resolve(DIR_SALIDA, `candidatos-${Date.now()}.json`), JSON.stringify({ fecha: new Date().toISOString(), resultados }, null, 2) + '\n', 'utf8');
});
