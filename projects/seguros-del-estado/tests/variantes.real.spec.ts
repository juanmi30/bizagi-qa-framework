import { test } from '@playwright/test';
import { DIR_VARIANTES, listarEscenarios } from '../sde/escenario';
import { VIEWPORT_SDE } from '../sde/capacidades';
import { registrarVerticales } from '../sde/verticales';

/**
 * VARIANTES DIAGNÓSTICAS (escenarios/_variantes/*.yaml): misma matriz y mismas aserciones, pero con una secuencia
 * observada en el producto que DIFIERE de la aprobada (p. ej. guardar la fila de documentos antes del tipo documental).
 * Sirven para comparar la matriz con el producto y sustentar un control de cambios. Crean casos reales, por eso solo
 * corren con SDE_VARIANTES=1. Sus reportes se guardan como VARIANTE_<CP>_*.json: NUNCA cuentan como ejecución ni
 * aprobación del CP (las métricas solo leen <CP>_*.json).
 */
test.describe.configure({ mode: 'default', retries: 0 });
test.use({ viewport: VIEWPORT_SDE, trace: 'off' }); // trace off: registraría la clave tecleada (iniciar_sesion)

test.describe('Variantes de secuencia (no cuentan para cobertura) @variante', () => {
  test.skip(process.env.SDE_VARIANTES !== '1', 'Variantes desactivadas: SDE_VARIANTES=1 (crean casos reales).');
  registrarVerticales(listarEscenarios(DIR_VARIANTES), {
    titulo: '[VARIANTE]', etiquetas: ['@variante'], prefijoReporte: 'VARIANTE_',
    prefijoMotivo: 'VARIANTE (secuencia del producto, NO la aprobada en la matriz; no cuenta para el CP): ',
  });
});
