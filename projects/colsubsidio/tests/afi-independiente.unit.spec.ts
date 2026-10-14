import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { actorDesdeEntorno } from '../data/afi/actores';
import { construirAgentManifest, serializarAgentManifest, viabilidadPorPerfil } from '../data/afi/agentManifest';
import { evaluarCapacidad } from '../data/afi/capacidadesPreparacion';
import { compilarCasoAfi, diagnosticoCasoCompilado, validarDefinicionCasoAfi } from '../data/afi/caso';
import { CP04_EMPRESA, CP04_FACULTATIVO, CP04_PENSIONADO } from '../data/afi/casos/hu14-12-cp04';
import { cargarDefinicionCasoAfi, resumenCompilacion } from '../data/afi/loader';
import { REDACTADO, ResolucionCampo, type EstrategiaAuxiliar } from '../data/afi/modelo';
import { resolverEtapa, type PlanPreparacion } from '../data/afi/resolver';
import { preflightCasoAfi } from '../helpers/afiCaseRunner';
import { AfiDataUi } from '../helpers/afiDataUi';
import { AfiliacionesPortal } from '../helpers/afiliacionesPortal';

/** Fase 4E.1: preparación declarativa de informacion-adicional para Independiente. Actor FICTICIO, sin QA. */

const ENTORNO_INDEPENDIENTE = {
  AFI_CP01_TIPO_APORTANTE: 'Aportante QA', AFI_CP01_TIPO_AFILIADO: 'Afiliado QA', AFI_CP01_TIPO_IDENTIFICACION: 'Documento QA',
  AFI_CP01_NUMERO_IDENTIFICACION: '1000000009', AFI_CP01_CORREO: 'independiente.qa@example.test',
  AFI_CP01_NUM_CEL: '3000000000', AFI_CP01_NUM_CEL_FIJO: '6010000000',
  AFI_CP01_ACTIVIDAD: 'Actividad QA', AFI_CP01_INGRESO_MENSUAL: '2500000',
};
/** Valores del actor y de los fondos ficticios: nunca deben aparecer en diagnósticos, evidencias ni manifest. */
const PII = /1000000009|independiente\.qa@example\.test|3000000000|6010000000|Actividad QA|2500000|Fondo (Norte|Sur|Este)/;
const sin = (clave: string) => Object.fromEntries(Object.entries(ENTORNO_INDEPENDIENTE).filter(([k]) => k !== clave));
const actor = (entorno: Record<string, string> = ENTORNO_INDEPENDIENTE) => actorDesdeEntorno('independiente', entorno);
const plan = (...resoluciones: ResolucionCampo[]): PlanPreparacion => ({ resoluciones, gaps: [] });
const fondoAuxiliar = (estrategia: EstrategiaAuxiliar = { tipo: 'first-valid-autocomplete' }) =>
  new ResolucionCampo('fondoPensiones', 'auxiliary', 'pii', false, undefined, estrategia);
const RUTA_FIXTURE = resolve(__dirname, 'fixtures/cp02-desktop-compilacion.afi.json');

// ---------- DOM mínimo de información adicional Independiente (ids del piloto) ----------
interface ConfigDom {
  fondos?: { texto: string; deshabilitada?: true }[];
  fondoPrecargado?: string;
  /** El control sigue inválido aunque se elija una opción. */
  fondoQuedaInvalido?: true;
}
function independiente(c: ConfigDom = {}): string {
  const fondos = c.fondos ?? [{ texto: 'Fondo Norte', deshabilitada: true }, { texto: 'Selecciona' }, { texto: 'Fondo Sur' }, { texto: 'Fondo Este' }];
  return `
    <style>mat-select{display:block;min-height:20px;border:1px solid #999;margin:4px}</style>
    <p>Ingresa la información solicitada</p>
    <input type="text" id="fondo" formcontrolname="fondo" class="${c.fondoPrecargado ? '' : 'ng-invalid'}" value="${c.fondoPrecargado ?? ''}"
      aria-controls="p-fondo" aria-expanded="false">
    <div id="p-fondo" role="listbox" hidden>${fondos.map(f => `<div role="option" ${f.deshabilitada ? 'aria-disabled="true"' : ''}>${f.texto}</div>`).join('')}</div>
    <mat-select id="actividad" role="combobox" aria-controls="p-actividad" aria-expanded="false"><span class="valor"></span></mat-select>
    <div id="p-actividad" role="listbox" hidden>${['Actividad QA Plus', 'Actividad QA', 'Otra'].map(o => `<div role="option">${o}</div>`).join('')}</div>
    <input type="text" id="ingresoMensual" class="ng-invalid">
    <button type="button" id="btn-independiente-info-ad-continuar">Continuar</button>
    <script>(() => {
      window.selecciones = { fondo: 0, actividad: 0 }; window.continuar = 0;
      document.getElementById('btn-independiente-info-ad-continuar').addEventListener('click', () => window.continuar++);
      const fondo = document.getElementById('fondo'), pFondo = document.getElementById('p-fondo');
      fondo.addEventListener('click', () => { pFondo.hidden = false; fondo.setAttribute('aria-expanded', 'true'); });
      pFondo.querySelectorAll('[role=option]').forEach(o => o.addEventListener('click', () => {
        if (o.getAttribute('aria-disabled') === 'true') return;
        window.selecciones.fondo++;
        fondo.value = o.textContent;
        if (!${c.fondoQuedaInvalido ? 'true' : 'false'}) fondo.classList.remove('ng-invalid');
        pFondo.hidden = true; fondo.setAttribute('aria-expanded', 'false');
      }));
      const act = document.getElementById('actividad'), pAct = document.getElementById('p-actividad');
      act.addEventListener('click', () => { pAct.hidden = false; act.setAttribute('aria-expanded', 'true'); });
      pAct.querySelectorAll('[role=option]').forEach(o => o.addEventListener('click', () => {
        window.selecciones.actividad++;
        act.querySelector('.valor').textContent = o.textContent; pAct.hidden = true; act.setAttribute('aria-expanded', 'false');
      }));
      const ingreso = document.getElementById('ingresoMensual');
      ingreso.addEventListener('input', () => ingreso.classList.toggle('ng-invalid', !/^\\d+$/.test(ingreso.value)));
    })();</script>`;
}
async function montar(page: Page, c?: ConfigDom): Promise<AfiDataUi> {
  await page.setContent(independiente(c));
  return new AfiDataUi(new AfiliacionesPortal(page));
}
const contadores = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { selecciones: { fondo: number; actividad: number }; continuar: number };
  return { ...w.selecciones, continuar: w.continuar };
});
const falla = (p: Promise<unknown>) => p.then(() => new Error('no falló'), (e: Error) => e);

// =====================================================================================
test.describe('4E.1 resolver + capacidades (puro)', () => {
  test('resolverEtapa(informacion-adicional, independiente): fondo auxiliar, actividad e ingreso del actor; todo materializable', () => {
    const p = resolverEtapa('informacion-adicional', { actor: actor() });
    expect(p.gaps).toEqual([]);
    expect(p.resoluciones.map(r => [r.campo, r.origen, r.estrategia])).toEqual([
      ['fondoPensiones', 'auxiliary', { tipo: 'first-valid-autocomplete' }], ['actividad', 'actor', undefined], ['ingresoMensual', 'actor', undefined],
    ]);
    const materializaciones = p.resoluciones.map(r => evaluarCapacidad('informacion-adicional', r));
    expect(materializaciones.map(m => 'materializacion' in m ? m.materializacion.modo : m.problema))
      .toEqual(['primera-sugerencia', 'texto', 'texto']);
    expect(JSON.stringify(p)).not.toMatch(PII);
  });

  test('actividad o ingreso ausentes => DataGap (nunca se inventan), no CapabilityGap', () => {
    for (const [variable, campo] of [['AFI_CP01_ACTIVIDAD', 'actividad'], ['AFI_CP01_INGRESO_MENSUAL', 'ingresoMensual']] as const) {
      const p = resolverEtapa('informacion-adicional', { actor: actor(sin(variable)) });
      expect(p.gaps.map(g => [g.campo, g.motivo]), campo).toEqual([[campo, 'sin-fuente-segura']]);
      const def = { ...CP04_EMPRESA, perfil: 'independiente' as const, nombre: 'x', preparacion: { datosCaso: {}, camposAsercion: [], etapas: ['inicio-solicitud', 'informacion-adicional'] as const } };
      const c = compilarCasoAfi({ ...def, preparacion: { ...def.preparacion, etapas: [...def.preparacion.etapas] } }, actor(sin(variable)));
      expect(c.ejecutable, campo).toBe(false);
      expect(c.preparacion.gaps.map(g => [g.etapa, g.campo]), campo).toEqual([['informacion-adicional', campo]]);
    }
  });

  test('fondo con valor del actor => valor concreto; sin valor => primera sugerencia; inicioAlfabetico se respeta', () => {
    const concreto = evaluarCapacidad('informacion-adicional', new ResolucionCampo('fondoPensiones', 'actor', 'pii', false, 'Fondo Sur'));
    expect('materializacion' in concreto && concreto.materializacion).toEqual({ modo: 'texto', texto: 'Fondo Sur' });
    const alfa = evaluarCapacidad('informacion-adicional', fondoAuxiliar({ tipo: 'first-valid-autocomplete', inicioAlfabetico: true }));
    expect('materializacion' in alfa && alfa.materializacion).toEqual({ modo: 'primera-sugerencia', inicioAlfabetico: true });
    // Los demás autocompletes (sin capability de preparación) siguen siendo gap.
    const ciudad = evaluarCapacidad('informacion-adicional', new ResolucionCampo('ciudadVivienda', 'auxiliary', 'public', false, undefined, { tipo: 'first-valid-autocomplete' }));
    expect(ciudad).toEqual({ problema: 'El driver de informacion-adicional no puede ejecutar "ciudadVivienda": campo no soportado en esta etapa.' });
  });
});

// =====================================================================================
test.describe('4E.1 AfiDataUi — informacion-adicional Independiente', () => {
  test('plan completo: fondo = primera sugerencia habilitada (orden de catálogo), actividad y ingreso exactos del actor, orden de pantalla', async ({ page }) => {
    const ui = await montar(page);
    const registradas: unknown[] = [];
    const aplicadas = await ui.completarInformacionAdicional(resolverEtapa('informacion-adicional', { actor: actor() }), async a => { registradas.push(a.diagnostico()); });
    // "Fondo Norte" está deshabilitada y "Selecciona" es un placeholder: se ignoran. Determinista: primera válida del catálogo.
    await expect(page.locator('#fondo')).toHaveValue('Fondo Sur');
    await expect(page.locator('#fondo')).not.toHaveClass(/ng-invalid/);
    await expect(page.locator('#actividad .valor')).toHaveText('Actividad QA');
    await expect(page.locator('#ingresoMensual')).toHaveValue('2500000');
    await expect(page.locator('#ingresoMensual')).not.toHaveClass(/ng-invalid/);
    expect(aplicadas.map(a => [a.campo, a.origen, a.modo])).toEqual([
      ['fondoPensiones', 'auxiliary', 'ejecutado'], ['actividad', 'actor', 'ejecutado'], ['ingresoMensual', 'actor', 'ejecutado'],
    ]);
    // Valor observado registrado (privado) y redactado en el diagnóstico: el fondo es pii.
    expect(aplicadas[0].valorEfectivo).toBe('Fondo Sur');
    expect(aplicadas[0].diagnostico()).toEqual({
      campo: 'fondoPensiones', origen: 'auxiliary', sensibilidad: 'pii', relevanteParaAsercion: false,
      estrategia: { tipo: 'first-valid-autocomplete' }, aplicado: true, modo: 'ejecutado', valorEfectivo: REDACTADO,
    });
    // Una sola selección por control; el driver no pulsa Continuar.
    expect(await contadores(page)).toEqual({ fondo: 1, actividad: 1, continuar: 0 });
    expect(JSON.stringify([aplicadas, registradas])).not.toMatch(PII);
    // Determinista: la misma pantalla produce la misma selección.
    const otra = await montar(page);
    const [fondo] = await otra.completarInformacionAdicional(plan(fondoAuxiliar()));
    expect(fondo.valorEfectivo).toBe('Fondo Sur');
  });

  test('fondo con valor del actor se elige exacto (sin primera sugerencia)', async ({ page }) => {
    const ui = await montar(page);
    const [a] = await ui.completarInformacionAdicional(plan(new ResolucionCampo('fondoPensiones', 'actor', 'pii', false, 'Fondo Este')));
    await expect(page.locator('#fondo')).toHaveValue('Fondo Este');
    expect([a.modo, a.valorEfectivo]).toEqual(['ejecutado', 'Fondo Este']);
  });

  test('fondo ya precargado: no se toca ni se selecciona de nuevo', async ({ page }) => {
    const ui = await montar(page, { fondoPrecargado: 'Fondo Este' });
    const [a] = await ui.completarInformacionAdicional(plan(fondoAuxiliar()));
    expect([a.modo, a.valorEfectivo]).toEqual(['precargado', 'Fondo Este']);
    expect(a.diagnostico().valorEfectivo).toBe(REDACTADO);
    expect((await contadores(page)).fondo).toBe(0);
    await expect(page.locator('#p-fondo')).toBeHidden();
  });

  test('sin opciones habilitadas válidas => FAIL cerrado, sin seleccionar', async ({ page }) => {
    const ui = await montar(page, { fondos: [{ texto: 'Fondo Norte', deshabilitada: true }, { texto: 'Selecciona' }] });
    const error = await falla(ui.completarInformacionAdicional(plan(fondoAuxiliar())));
    expect(error.message).toContain('Autocomplete: al menos una opción válida habilitada');
    expect((await contadores(page)).fondo).toBe(0);
    await expect(page.locator('#fondo')).toHaveValue('');
  });

  test('inicioAlfabetico descarta opciones que no empiezan por letra', async ({ page }) => {
    const ui = await montar(page, { fondos: [{ texto: '123 Fondo' }, { texto: 'Fondo Sur' }] });
    const [a] = await ui.completarInformacionAdicional(plan(fondoAuxiliar({ tipo: 'first-valid-autocomplete', inicioAlfabetico: true })));
    expect(a.valorEfectivo).toBe('Fondo Sur');
  });

  test('opción ambigua (texto repetido) => FAIL sin seleccionar', async ({ page }) => {
    const ui = await montar(page, { fondos: [{ texto: 'Fondo Sur' }, { texto: 'Fondo Sur' }] });
    const error = await falla(ui.completarInformacionAdicional(plan(fondoAuxiliar())));
    expect(error.message).toContain('la opción elegida debe ser inequívoca');
    expect((await contadores(page)).fondo).toBe(0);
  });

  test('campo inválido tras seleccionar => FAIL (una sola selección, sin reintentar)', async ({ page }) => {
    const ui = await montar(page, { fondoQuedaInvalido: true });
    const error = await falla(ui.completarInformacionAdicional(plan(fondoAuxiliar())));
    expect(error.message).toContain('Autocomplete válido tras seleccionar');
    expect((await contadores(page)).fondo).toBe(1);
  });

  test('autocomplete completamente vacío => FAIL cerrado (el catálogo no ofrece opciones)', async ({ page }) => {
    test.setTimeout(120_000); // abrirCatalogo espera hasta 45 s a que aparezca una opción antes de fallar.
    const ui = await montar(page, { fondos: [] });
    const error = await falla(ui.completarInformacionAdicional(plan(fondoAuxiliar())));
    expect(error.message).not.toBe('no falló');
    expect((await contadores(page)).fondo).toBe(0);
    await expect(page.locator('#fondo')).toHaveValue('');
  });

  test('mensajes de fallo sin valores del actor', async ({ page }) => {
    const ui = await montar(page);
    const error = await falla(ui.completarInformacionAdicional(plan(new ResolucionCampo('actividad', 'actor', 'pii', false, 'Actividad Inexistente'))));
    expect(error.message).not.toContain('Actividad Inexistente');
  });
});

// =====================================================================================
test.describe('4E.1 viabilidad por perfil (manifest derivado)', () => {
  const manifest = construirAgentManifest();
  const viabilidad = (perfil: string) => manifest.preparacion.viabilidadPorPerfil.find(v => v.perfil === perfil)!;

  test('independiente: las tres etapas del runner soportadas, con sus vías', () => {
    expect(viabilidad('independiente').etapas.map(e => [e.etapa, e.estado])).toEqual([
      ['inicio-solicitud', 'soportada'], ['informacion-empresa', 'no-requerida'], ['telefonos', 'soportada'], ['informacion-adicional', 'soportada'],
    ]);
    expect(viabilidad('independiente').etapas[3].campos).toEqual([
      { campo: 'fondoPensiones', vias: ['auxiliar'] }, { campo: 'actividad', vias: ['actor'] }, { campo: 'ingresoMensual', vias: ['actor'] },
    ]);
  });

  test('regresión de perfiles: Empresa, Pensionado y Facultativo sin bloqueos', () => {
    expect(viabilidad('empresa').etapas.map(e => e.estado)).toEqual(['soportada', 'soportada', 'no-requerida', 'no-requerida']);
    // 4S-R.1: los hechos de negocio de la empresa solo se exigen según el estado de la pantalla (vía explícita, no bloqueo).
    expect(viabilidad('empresa').etapas[1].campos.map(c => c.vias)).toEqual(Array(8).fill(['segun-estado']));
    expect(viabilidad('pensionado').etapas.map(e => e.estado)).toEqual(['soportada', 'no-requerida', 'soportada', 'no-requerida']);
    expect(viabilidad('facultativo').etapas.map(e => e.estado)).toEqual(['soportada', 'no-requerida', 'soportada', 'soportada']);
  });

  test('derivada, no manual: un bloqueo aparece explícito con campo y motivo', () => {
    // Información de contacto no tiene capability de PREPARACIÓN: la misma función la marca bloqueada.
    const [ind] = viabilidadPorPerfil(['informacion-contacto']).filter(v => v.perfil === 'independiente');
    expect(ind.etapas[0]).toMatchObject({ etapa: 'informacion-contacto', estado: 'bloqueada' });
    expect(ind.etapas[0].bloqueos!.map(b => b.campo)).toEqual(['departamento', 'ciudadVivienda', 'localidad', 'barrio']);
    expect(ind.etapas[0].bloqueos![0].motivo).toBe('sin capability de preparación en esta etapa');
    expect(manifest.preparacion.reglaViabilidad).toMatch(/solo es GENERABLE si su viabilidad[\s\S]*bloqueada[\s\S]*CAPABILITY_GAP/);
  });

  test('instrucciones y manifest: regla presente, sin PII', async () => {
    const md = await readFile(resolve(__dirname, '../data/afi/AFI-AGENT-INSTRUCTIONS.md'), 'utf8');
    expect(md).toMatch(/viabilidadPorPerfil[\s\S]*solo es GENERABLE si su viabilidad es `soportada` o `no-requerida`/);
    expect(serializarAgentManifest()).not.toMatch(PII);
  });
});

// =====================================================================================
test.describe('4E.1 prueba clave: fixture equivalente al JSON generado (sin navegador)', () => {
  test('validar → PASS y compilar → PASS con actor independiente ficticio; conserva las tres etapas', async () => {
    const def = await cargarDefinicionCasoAfi(RUTA_FIXTURE);
    expect(validarDefinicionCasoAfi(def)).toEqual([]);
    expect(def.preparacion.etapas).toEqual(['inicio-solicitud', 'telefonos', 'informacion-adicional']);
    expect(def.funcional!.pasos.map(p => p.id)).toEqual(['P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10']);
    const compilado = compilarCasoAfi(def, actor());
    expect(compilado.ejecutable).toBe(true);
    expect(compilado.preparacion.gaps).toEqual([]);
    expect(() => preflightCasoAfi(compilado)).not.toThrow();
    expect(compilado.preparacion.etapas['informacion-adicional']!.resoluciones.map(r => r.campo)).toEqual(['fondoPensiones', 'actividad', 'ingresoMensual']);
    const resumen = resumenCompilacion(compilado);
    expect(JSON.stringify([resumen, diagnosticoCasoCompilado(compilado)])).not.toMatch(PII);
  });

  test('es fixture de compilación, no golden: fuera de casos/ y sin uso en specs de ejecución', async () => {
    expect(RUTA_FIXTURE).not.toMatch(/data[\\/]afi[\\/]casos/);
    for (const spec of ['afi-hu14-12-cp04.spec.ts', 'afi-case-file.spec.ts', 'afi-hu14-12-cp02-desktop.spec.ts']) {
      expect(await readFile(resolve(__dirname, spec), 'utf8'), spec).not.toContain('cp02-desktop-compilacion');
    }
  });

  test('regresión CP04: Empresa, Pensionado y Facultativo siguen compilando', () => {
    const entornos = {
      empresa: { AFI_QA_EMPRESA_IDENTIFICACION: '900000001', AFI_QA_CORREO: 'empresa.qa@example.test' },
      pensionado: { AFI_QA_PENSIONADO_IDENTIFICACION: '1000000002', AFI_QA_CORREO: 'p.qa@example.test', AFI_CP01_NUM_CEL: '3000000000', AFI_CP01_NUM_CEL_FIJO: '6010000000' },
      facultativo: {
        AFI_QA_FACULTATIVO_IDENTIFICACION: '1000000003', AFI_QA_CORREO: 'f.qa@example.test', AFI_CP01_NUM_CEL: '3000000000', AFI_CP01_NUM_CEL_FIJO: '6010000000',
        AFI_QA_FACULTATIVO_NACIONALIDAD: 'Colombiana', AFI_QA_FACULTATIVO_ESTADO_CIVIL: 'Soltero(a)',
        AFI_QA_FACULTATIVO_FONDO_PENSIONES: 'Fondo QA', AFI_QA_FACULTATIVO_SALARIO_BASICO: '1500000',
      },
    };
    for (const def of [CP04_EMPRESA, CP04_PENSIONADO, CP04_FACULTATIVO]) {
      const c = compilarCasoAfi(def, actorDesdeEntorno(def.perfil, entornos[def.perfil as keyof typeof entornos]));
      expect(c.ejecutable, def.nombre).toBe(true);
      expect(() => preflightCasoAfi(c), def.nombre).not.toThrow();
    }
  });
});
