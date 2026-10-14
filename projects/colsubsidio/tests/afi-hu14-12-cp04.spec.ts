import { test, expect } from '@playwright/test';
import { actorDesdeEntorno } from '../data/afi/actores';
import { modoReconocimientoPantalla } from '../data/afi/aplicacion/reconocimientoSombra';
import { compilarCasoAfi } from '../data/afi/caso';
import { DEFINICIONES_CP04 } from '../data/afi/casos/hu14-12-cp04';
import { ejecutarCasoAfi } from '../helpers/afiCaseRunner';

// 228503, CP04 P03-P06; P07 y P08 repiten esos pasos para los otros aportantes.
// Fuente: 20260910_CLS_AFI_HU 14.12_V2_Casos_Prueba.xlsx y soportes 20260911.
// Definición canónica (contrato AFI) -> actor del entorno -> compilación pura -> runner AFI v1.
// P02/P03 son hitos técnicos del runner (etiquetas de reporte del piloto), no del contrato.
const HITOS = {
  apertura: { id: 'P02', esperado: 'Pantalla de inicio visible.' },
  preparacion: { id: 'P03', esperado: 'La pantalla de Información de contacto carga exitosamente.' },
};

test.describe('228503 - AFI HU 14.12 CP04', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.use({ viewport: { width: 1365, height: 900 } });

  for (const definicion of DEFINICIONES_CP04) {
    test(definicion.nombre, async ({ page, context }, info) => {
      test.setTimeout(12 * 60_000);
      expect(info.config.workers, 'CP04 requiere workers=1').toBe(1);
      expect(info.project.retries, 'CP04 requiere retries=0').toBe(0);
      // Datos sensibles solo en ejecución: el perfil lógico se materializa desde el entorno.
      const compilado = compilarCasoAfi(definicion, actorDesdeEntorno(definicion.perfil, process.env));
      // Configuración de ejecución (no del caso): AFI_SCREEN_RECOGNITION=shadow solo observa (Fase 4K).
      const reconocimientoPantalla = modoReconocimientoPantalla(process.env.AFI_SCREEN_RECOGNITION);
      await ejecutarCasoAfi(compilado, { page, context, testInfo: info, hitos: HITOS, reconocimientoPantalla });
    });
  }
});
