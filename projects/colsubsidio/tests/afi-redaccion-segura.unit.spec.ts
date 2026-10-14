import { test, expect } from '@playwright/test';
import { CapabilityGapError } from '../data/afi/funcional';
import { CapabilityGapPreparacionError } from '../data/afi/capacidadesPreparacion';
import { DataGapError } from '../data/afi/modelo';
import { DataGapPantallaError } from '../data/afi/preparacionSegunEstado';
import { LARGO_MINIMO_DISTINTIVO, MARCA_PRIVADO, errorSaneado, sanearTexto, valoresSensibles } from '../data/afi/redaccionSegura';
import { EtapaPreparacionNoAlcanzadaError, PreparacionDetenidaError } from '../helpers/afiCaseRunner';
import { errorSeguro } from '../helpers/afiliacionesPortal';

/**
 * Redacción segura (4S-R.1). H: TODAS las pruebas usan entornos SINTÉTICOS pasados por parámetro; ninguna lee el .env real
 * (el resultado no cambia con los secretos que QA tenga configurados).
 */

const ENTORNO = {
  AFI_ACTOR_EMPRESA_FICTICIA_AFILIADO_PRIMERA_VEZ: 'Si',
  AFI_ACTOR_EMPRESA_FICTICIA_NUMERO_TRABAJADORES: '5',
  AFI_ACTOR_EMPRESA_FICTICIA_CODIGO_CIIU: '4711',
  AFI_ACTOR_EMPRESA_FICTICIA_NUMERO_IDENTIFICACION: '900123456',
  AFI_ACTOR_EMPRESA_FICTICIA_RAZON_SOCIAL: 'Razon Ficticia QA SAS',
  AFI_SHARED_BUZON_QA_CORREO: 'buzon.qa@example.test',
  // No sensibles: nunca se redactan.
  AFI_CP01_TIPO_APORTANTE: 'Independiente', PATH: '/usr/bin',
};

test.describe('Redacción segura de errores', () => {
  test('solo variables sensibles; del valor más largo al más corto', () => {
    expect(valoresSensibles(ENTORNO)).toEqual(['Razon Ficticia QA SAS', 'buzon.qa@example.test', '900123456', '4711', 'Si', '5']);
    expect(LARGO_MINIMO_DISTINTIVO).toBe(5);
  });

  test('A. un valor corto "Si" no modifica "Sin coincidencia" ni otras palabras', () => {
    const t = 'Sin coincidencia única; Siguiente paso; Sí; Simulación';
    expect(sanearTexto(t, valoresSensibles(ENTORNO))).toBe(t);
    const e = new Error(t);
    expect(errorSeguro(e, ENTORNO)).toBe(e); // nada que redactar: el MISMO objeto
  });

  test('B. un valor corto "5" no destruye timestamps, contadores ni mensajes por aparición incidental', () => {
    const t = 'Timeout 15000ms exceeded at 2026-10-05T15:45:05Z after 5 attempts (5/5); code 4711-b';
    expect(sanearTexto(t, valoresSensibles(ENTORNO))).toBe(t);
  });

  test('B2. un valor corto SÍ se protege como valor independiente entre comillas (estructura con que se citan valores)', () => {
    expect(sanearTexto(`getByRole('option', { name: 'Si', exact: true })`, valoresSensibles(ENTORNO)))
      .toBe(`getByRole('option', { name: '${MARCA_PRIVADO}', exact: true })`);
    expect(sanearTexto('Expected: "5" Received: "6"', valoresSensibles(ENTORNO))).toBe(`Expected: "${MARCA_PRIVADO}" Received: "6"`);
  });

  test('C/F. un secreto distintivo como token exacto se redacta (también varios, del más largo al más corto)', () => {
    const t = 'fallo con 900123456 para Razon Ficticia QA SAS (buzon.qa@example.test)';
    const r = sanearTexto(t, valoresSensibles(ENTORNO));
    expect(r).toBe(`fallo con ${MARCA_PRIVADO} para ${MARCA_PRIVADO} (${MARCA_PRIVADO})`);
    for (const v of ['900123456', 'Razon Ficticia', 'buzon.qa']) expect(r).not.toContain(v);
    // Token exacto: no dentro de otro número más largo.
    expect(sanearTexto('ref 19001234567', valoresSensibles(ENTORNO))).toBe('ref 19001234567');
  });

  test('D. DataGapPantallaError saneado sigue siendo DataGapPantallaError (clase, name, etapa y faltantes)', () => {
    const e = new DataGapPantallaError('informacion-empresa', [{ campo: 'razonSocial', motivo: 'sin-dato', fuentesEsperadas: ['test-case', 'actor'] }]);
    const conValor = Object.assign(e, { message: `${e.message} 900123456` });
    const s = errorSeguro(conValor, ENTORNO) as DataGapPantallaError;
    expect(s).not.toBe(conValor);
    expect(s).toBeInstanceOf(DataGapPantallaError);
    expect([s.name, s.etapa, s.faltantes]).toEqual(['DataGapPantallaError', 'informacion-empresa', [{ campo: 'razonSocial', motivo: 'sin-dato', fuentesEsperadas: ['test-case', 'actor'] }]]);
    expect(s.message).not.toContain('900123456');
    expect(s.message).toContain(MARCA_PRIVADO);
  });

  test('E. CapabilityGap saneado sigue siendo CapabilityGap (incluida la subclase de preparación)', () => {
    const e = new CapabilityGapPreparacionError([{ ruta: 'informacion-empresa.codigoCiiu', clase: 'capability', mensaje: 'fallo con Razon Ficticia QA SAS' }]);
    const s = errorSeguro(e, ENTORNO);
    expect(s).toBeInstanceOf(CapabilityGapPreparacionError);
    expect(s).toBeInstanceOf(CapabilityGapError);
    expect(s.name).toBe('CapabilityGapPreparacionError');
    expect(JSON.stringify((s as CapabilityGapPreparacionError).problemas)).not.toContain('Razon Ficticia');
    expect(s.message).not.toContain('Razon Ficticia');
  });

  test('G. propiedades diagnósticas seguras se conservan: name, code, metadata, cause (saneada) y stack sin el valor', () => {
    const causa = new DataGapError('codigoCiiu', 'sin-fuente-segura', ['actor']);
    const e = Object.assign(new Error('falla 900123456', { cause: causa }), { code: 'E_AFI', intentos: 3, detalle: { campo: 'codigoCiiu', valor: '900123456' } });
    const s = errorSeguro(e, ENTORNO) as typeof e;
    expect([s.code, s.intentos, s.detalle]).toEqual(['E_AFI', 3, { campo: 'codigoCiiu', valor: MARCA_PRIVADO }]);
    expect(s.cause).toBeInstanceOf(DataGapError);
    expect(s.stack).not.toContain('900123456');
    // Errores de taxonomía del runner que no contienen valores: se devuelven intactos.
    for (const x of [new PreparacionDetenidaError('btn-empleador-pj-continuar'), new EtapaPreparacionNoAlcanzadaError([{ etapa: 'telefonos', resoluciones: 2 }])]) {
      expect(errorSeguro(x, ENTORNO)).toBe(x);
    }
  });

  test('H. el resultado depende solo del entorno recibido (nunca del .env real)', () => {
    const e = new DataGapPantallaError('informacion-empresa', [{ campo: 'codigoCiiu', motivo: 'sin-dato' }]);
    expect(errorSeguro(e, {})).toBe(e);
    expect(errorSeguro(e, ENTORNO)).toBe(e); // el mensaje del framework no contiene valores (prevención)
    expect(errorSaneado('texto 900123456', ENTORNO).message).toBe(`texto ${MARCA_PRIVADO}`);
  });
});
