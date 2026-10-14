import { test } from '@playwright/test';
import { listarEscenarios } from '../sde/escenario';
import { VIEWPORT_SDE } from '../sde/capacidades';
import { registrarVerticales } from '../sde/verticales';

/**
 * Verticales E2E SDE: UNA prueba por escenario de escenarios/*.yaml (lógica en sde/verticales.ts).
 * - Sin credenciales/datos → la prueba se marca SKIPPED con anotación BLOCKED (nunca verde).
 * - No existe "modo esqueleto": o corre contra QA real, o queda bloqueada.
 * - En orden (prefijo numérico del archivo) y en un solo worker: crean casos reales,
 *   no se paralelizan ni se reintentan (un reintento duplicaría casos). Un fallo NO salta los siguientes.
 */
test.describe.configure({ mode: 'default', retries: 0 });
// A 1280×720 el Work Portal colapsa el panel derecho (resumen "Caso N"); 1440×900 lo muestra (verificado en QA).
test.use({ viewport: VIEWPORT_SDE, trace: 'off' }); // trace off: registraría la clave tecleada (iniciar_sesion)

registrarVerticales(listarEscenarios());
