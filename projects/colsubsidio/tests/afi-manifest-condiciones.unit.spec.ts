import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { construirAgentManifest, publicarCondiciones } from '../data/afi/agentManifest';
import { actorDesdeEntorno } from '../data/afi/actores';
import { MODELO_APLICACION_AFI, construirModeloAplicacion } from '../data/afi/aplicacion/modeloAplicacion';
import { testabilidadCanonica } from '../data/afi/aplicacion/resolucionObservacion';
import { EXPECTATIVAS_POR_ENTIDAD, PROVEEDORES_PRODUCTIVOS, TIPOS_ENTIDAD, superficiesDeEntidad, type TipoEntidad } from '../data/afi/aplicacion/superficies';
import { CATALOGO_PROVEEDORES } from '../data/afi/aplicacion/vinculos';
import { compilarCasoAfi, type DefinicionCasoAfi } from '../data/afi/caso';
import { CLAVES_CONDICION, CLAVES_ENTIDAD_CONDICION, CLAVES_PASO, validarPlanFuncionalAfi } from '../data/afi/funcional';

/**
 * Fase 4R.2: el contrato de `funcional.pasos[].condiciones` publicado en el manifest NO puede divergir del validador ni
 * del compilador. Entidades y vínculos sintéticos; ninguna HU concreta.
 */

const manifest = construirAgentManifest();
const publicado = manifest.funcional.condiciones;
const muestra = (tipo: string) => (tipo === 'valor' ? { tipo, igual: null } : tipo === 'resultado' ? { tipo, igual: 'exito' } : { tipo });
const plan = (condicion: unknown) => ({ caso: 'c', pasos: [{ id: 'P01', esperado: 'Esperado sintético.', operaciones: [], condiciones: [condicion] }] });

test.describe('4R.2 contrato ↔ manifest', () => {
  test('el archivo regenerado publica la sección y la estructura del contrato la menciona', async () => {
    const ARCHIVO = JSON.parse(await readFile(resolve(__dirname, '../data/afi/AFI-AGENT-MANIFEST.json'), 'utf8'));
    expect(ARCHIVO.funcional?.condiciones).toEqual(JSON.parse(JSON.stringify(publicado)));
    expect(manifest.contrato.estructura.join(' ')).toContain('condiciones?[{ entidad { tipo, id }, expectativa }]');
  });

  test('forma = claves del validador: exactamente esas se aceptan; cualquier otra se rechaza', () => {
    expect(publicado.forma).toMatchObject({ paso: [...CLAVES_PASO], condicion: [...CLAVES_CONDICION], entidad: [...CLAVES_ENTIDAD_CONDICION] });
    const base = { entidad: { tipo: 'actividad', id: 'actividad-a' }, expectativa: { tipo: 'alcanzada' } };
    expect(validarPlanFuncionalAfi(plan(base))).toEqual([]);
    for (const extra of ['proveedor', 'superficie', 'localizacion', 'nombreTarea', 'endpoint']) {
      expect(validarPlanFuncionalAfi(plan({ ...base, [extra]: 'x' })).length, extra).toBeGreaterThan(0);
      expect(validarPlanFuncionalAfi(plan({ ...base, entidad: { ...base.entidad, [extra]: 'x' } })).length, extra).toBeGreaterThan(0);
    }
  });

  test('tipos y expectativas publicados = los que el validador acepta; los demás se rechazan', () => {
    const tiposPublicados = publicado.tipos.map(t => t.tipo);
    // Solo los tipos con alguna superficie fuera de portal-ui (pantalla/campo se certifican con operaciones).
    expect(tiposPublicados).toEqual(TIPOS_ENTIDAD.filter(t => superficiesDeEntidad(t).some(s => s !== 'portal-ui')));
    for (const { tipo, expectativas } of publicado.tipos) {
      expect(expectativas.map(e => e.tipo), tipo).toEqual([...EXPECTATIVAS_POR_ENTIDAD[tipo as TipoEntidad]]);
      for (const e of expectativas) expect(validarPlanFuncionalAfi(plan({ entidad: { tipo, id: 'entidad-x' }, expectativa: muestra(e.tipo) })), `${tipo}.${e.tipo}`).toEqual([]);
      for (const ajena of Object.values(EXPECTATIVAS_POR_ENTIDAD).flat().filter(x => !EXPECTATIVAS_POR_ENTIDAD[tipo as TipoEntidad].includes(x))) {
        expect(validarPlanFuncionalAfi(plan({ entidad: { tipo, id: 'entidad-x' }, expectativa: muestra(ajena) })).length, `${tipo}.${ajena}`).toBeGreaterThan(0);
      }
    }
    // Los tipos NO publicados compilan como CAPABILITY_GAP (no se representan con condiciones).
    const actor = actorDesdeEntorno('empresa', { AFI_QA_EMPRESA_IDENTIFICACION: '900000001', AFI_QA_CORREO: 'empresa.qa@example.test' });
    const def = (tipo: TipoEntidad, id: string): DefinicionCasoAfi => ({
      version: 1, hu: 'HU sintética', caso: 'c', nombre: 'Sintetico', perfil: 'empresa',
      preparacion: { datosCaso: { tipoAportante: 'Empleador' }, camposAsercion: [], etapas: ['inicio-solicitud'] },
      funcional: plan({ entidad: { tipo, id }, expectativa: muestra(EXPECTATIVAS_POR_ENTIDAD[tipo][0]) }) as DefinicionCasoAfi['funcional'],
    });
    for (const tipo of TIPOS_ENTIDAD.filter(t => !tiposPublicados.includes(t))) {
      const registradas = tipo === 'pantalla-ui' ? MODELO_APLICACION_AFI.ui.pantallas : tipo === 'campo-ui' ? MODELO_APLICACION_AFI.ui.campos : MODELO_APLICACION_AFI.ui.transiciones;
      // Sin entidades aprobadas del tipo (hoy: transicion-ui) no hay nada que compilar.
      if (!registradas.length) { expect(tipo).toBe('transicion-ui'); continue; }
      const id = registradas[0];
      expect(compilarCasoAfi(def(tipo, id), actor).observacion.gaps[0].estado, tipo).toBe('CAPABILITY_GAP');
    }
  });

  test('proveedores: solo los productivos (exactamente el validado en 4R); nada técnico del vínculo ni proveedores solo disponibles', () => {
    expect(publicado.proveedoresProductivos).toEqual(PROVEEDORES_PRODUCTIVOS.map(p => p.id));
    expect(publicado.proveedoresProductivos).toEqual(['tareas-pendientes-bizagi']);
    const texto = JSON.stringify(manifest);
    const productivos = new Set(PROVEEDORES_PRODUCTIVOS.map(p => p.id));
    for (const id of Object.keys(CATALOGO_PROVEEDORES).filter(x => !productivos.has(x))) expect(texto, id).not.toContain(id);
    expect(texto).not.toMatch(/"nombreTarea"|"localizacion"|"vinculosObservacion"|"historialVinculos"/);
  });

  test('observablesHoy se DERIVA del compilador: hoy vacío; con vínculo + proveedor productivo aparece exactamente eso', () => {
    // Provider productivo != entidad observable: sin vínculos aprobados, nada es observable hoy.
    expect(publicado.observablesHoy).toEqual([]);
    expect(testabilidadCanonica().proveedoresHabilitados).toEqual(['tareas-pendientes-bizagi']);
    expect(testabilidadCanonica().vinculos).toEqual([]);
    const modelo = construirModeloAplicacion({ actividades: [{ id: 'actividad-a', descripcion: 'Actividad sintética' }], rutas: [{ id: 'ruta-r', descripcion: 'Ruta sintética' }] });
    const vinculos = [{ entidad: { tipo: 'actividad' as const, id: 'actividad-a' }, superficie: 'proceso-bpm' as const, proveedor: 'tareas-pendientes-bizagi', localizacion: { nombreTarea: 'Tarea sintética' } }];
    // Disponible pero no habilitado: nada observable. Habilitado: solo actividad.alcanzada (nunca no-alcanzada ni la ruta).
    expect(publicarCondiciones({ modelo, vinculos, proveedoresHabilitados: [] }).observablesHoy).toEqual([]);
    expect(publicarCondiciones({ modelo, vinculos, proveedoresHabilitados: ['tareas-pendientes-bizagi'] }).observablesHoy)
      .toEqual([{ tipo: 'actividad', id: 'actividad-a', expectativa: 'alcanzada' }]);
  });

  test('semántica publicada: NO_OBSERVABLE, rol del esperado y reglas clave; instrucciones y contrato la referencian', async () => {
    expect(publicado.noObservable).toMatch(/ni PASS ni FAIL[\s\S]*Nunca se convierte en FAIL/);
    expect(publicado.rol).toMatch(/MISMO esperado/);
    const reglas = publicado.reglas.join('\n');
    expect(reglas).toMatch(/SOLO si su \(entidad, expectativa\) figura en observablesHoy/);
    expect(reglas).toMatch(/Nunca proveedor, superficie, localización, nombre de tarea, selector, endpoint/);
    expect(reglas).toMatch(/implementado pero no productivo no hace observable nada/);
    expect(await readFile(resolve(__dirname, '../data/afi/AFI-AGENT-INSTRUCTIONS.md'), 'utf8')).toContain('funcional.condiciones.observablesHoy');
    expect(await readFile(resolve(__dirname, '../data/afi/AFI-CASE-CONTRACT.md'), 'utf8')).toContain('funcional.pasos[].condiciones');
  });
});
