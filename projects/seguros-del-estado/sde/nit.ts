/**
 * NIT colombiano: dígito de verificación (algoritmo DIAN, pesos primos de derecha a izquierda, módulo 11).
 * Sirve para generar NIT SINTÉTICOS con formato válido (la Matriz Data de HU06-CP01 pide "Número Documento Tomador válido +
 * Dígito de Verificación" con "Datos de Cliente: N/A"). Un NIT sintético NO afirma existencia en DIAN ni en SISE.
 */
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function digitoVerificacionNit(nit: string): number {
  if (!/^\d{1,15}$/.test(nit)) throw new Error(`NIT inválido: debe tener solo dígitos (1 a 15), recibí ${nit.length} caracteres.`);
  const suma = nit.split('').reverse().reduce((acc, d, i) => acc + Number(d) * PESOS[i], 0) % 11;
  return suma > 1 ? 11 - suma : suma;
}

export function esNitValido(nit: string, dv: number | string): boolean {
  return /^\d{1,15}$/.test(nit) && digitoVerificacionNit(nit) === Number(dv);
}
