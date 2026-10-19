import { test, expect } from '@playwright/test';
import { cargarRegistro } from '../../sde/datos';
import { cargarEscenario, listarEscenarios } from '../../sde/escenario';
import { crearContexto } from '../../sde/ejecutor';

/**
 * Narrativas FICTICIAS controladas de HU06 Masivo (V1.1 y aclaración de Daniel, 2026-10-16): la descripción admite hasta
 * 500 caracteres y la extracción del Worker AI no exige pólizas existentes. Sin QA ni navegador.
 */
const reg = cargarRegistro();
const LIMITE = 500;
const UNICO_LARGO = 'pre-1792103839864'; // el identificador de corrida más largo que usan las precreaciones

const masivos = listarEscenarios().map((r) => cargarEscenario(r, reg)).filter((e) => ['HU06-CP01', 'HU06-CP02', 'HU06-CP03', 'HU06-CP04'].includes(e.id));
const narrativaDe = (e: (typeof masivos)[number]) => {
  const paso = e.pasos.find((p) => (p.campos as { campo: string }[] | undefined)?.some((c) => c.campo === 'Descripción de la Solicitud (Masiva/Múltiple)'))!;
  const campo = (paso.campos as { campo: string; valor: string }[]).find((c) => c.campo === 'Descripción de la Solicitud (Masiva/Múltiple)')!;
  return crearContexto(reg, {}, UNICO_LARGO).resolver(campo.valor);
};

test.describe('HU06 Masivo — narrativas ficticias controladas @unit', () => {
  test('los cuatro CP Masivos diligencian una narrativa de 500 caracteres o menos, con identificadores', () => {
    expect(masivos.map((e) => e.id).sort()).toEqual(['HU06-CP01', 'HU06-CP02', 'HU06-CP03', 'HU06-CP04']);
    for (const e of masivos) {
      const n = narrativaDe(e);
      expect(n.length, `${e.id}: ${n.length} caracteres`).toBeLessThanOrEqual(LIMITE);
      expect(n, e.id).toContain(UNICO_LARGO);
      expect(n, `${e.id}: la narrativa debe mencionar identificadores para que haya algo que extraer`).toMatch(/\d{9,12}/);
    }
  });

  test('cada valor que se compara en la grilla aparece en la narrativa que diligencia el mismo escenario', () => {
    let comparados = 0;
    for (const e of masivos) {
      const n = narrativaDe(e);
      for (const p of e.pasos.filter((x) => x.comparar)) {
        for (const valores of Object.values(p.comparar as Record<string, string[]>)) {
          for (const v of valores) { expect(n, `${e.id}: "${v}"`).toContain(v); comparados++; }
        }
      }
    }
    expect(comparados).toBeGreaterThanOrEqual(9); // CP01: 3 NIT · CP02: 3 pólizas + 3 placas
  });

  test('restricciones de V1.1 en los datos ficticios: pólizas numéricas de 9 a 12 dígitos y placas de hasta 6 alfanuméricos', () => {
    const cp02 = masivos.find((e) => e.id === 'HU06-CP02')!;
    const comparar = cp02.pasos.find((p) => p.comparar)!.comparar as Record<string, string[]>;
    for (const p of comparar['Número Póliza']) expect(p).toMatch(/^\d{9,12}$/);
    for (const p of comparar.Placa) expect(p).toMatch(/^[A-Za-z0-9]{1,6}$/);
  });
});
