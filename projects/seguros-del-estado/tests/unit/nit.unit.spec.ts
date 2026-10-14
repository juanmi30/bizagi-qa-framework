import { test, expect } from '@playwright/test';
import { digitoVerificacionNit, esNitValido } from '../../sde/nit';

/** Dígito de verificación DIAN. Fixtures: NIT públicos de entidades con su DV publicado. */
test.describe('NIT sintéticos con dígito de verificación válido @unit', () => {
  test('coincide con el DV publicado de NIT públicos conocidos', () => {
    expect(digitoVerificacionNit('800197268')).toBe(4); // DIAN
    expect(digitoVerificacionNit('890903938')).toBe(8); // Bancolombia
    expect(digitoVerificacionNit('860034313')).toBe(7); // Davivienda
  });

  test('NIT sintéticos usados en SDE (no afirman existencia en DIAN ni SISE)', () => {
    expect(digitoVerificacionNit('999000001')).toBe(2);
    expect(digitoVerificacionNit('999000002')).toBe(1);
    expect(esNitValido('999000001', '2')).toBe(true);
    expect(esNitValido('999000001', 3)).toBe(false);
  });

  test('control: entradas no numéricas se rechazan', () => {
    expect(() => digitoVerificacionNit('99A000001')).toThrow(/solo dígitos/);
    expect(esNitValido('', 0)).toBe(false);
  });
});
