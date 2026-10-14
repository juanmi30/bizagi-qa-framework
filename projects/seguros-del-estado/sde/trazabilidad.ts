import { resolve } from 'node:path';
import { cargarMatriz } from './matriz';
import { cargarManifest } from './manifest';
import { cargarRegistro, estadoActor, estadoDataset, type Entorno } from './datos';
import { cargarEscenario, DIR_ESCENARIOS, type EscenarioSde } from './escenario';
import { DIR_EVIDENCIA_VERSIONADA, DIR_SALIDA } from './registro';
import { coberturaCp, inventarioReportes, leerReportes, maximoAlcanzable, pendientesParaRealPass, totales, type CoberturaCp } from './metricas';

/**
 * Genera docs/TRAZABILIDAD-17-CP.md desde las fuentes (matriz literal, manifest, escenarios y el
 * último reporte EJECUTADO de cada CP; un intento bloqueado en preflight no tapa una ejecución real). Así el
 * documento no puede afirmar más de lo ejecutado. Cobertura en tres indicadores independientes (sde/metricas.ts).
 */

const PLAN: Record<string, string> = {
  iniciar_sesion: 'UI: login real', nuevo_caso: 'UI: abrir formulario', diligenciar: 'UI: diligenciar + post-condición',
  adjuntar: 'UI: adjuntar', adjuntar_en_grilla: 'UI: documento en grilla', dialogo_cancelar: 'UI: cancelar pop-up',
  verificar: 'UI: aserciones', pulsar: 'UI: botón', verificar_ruta: 'Actividad actual según Bizagi (buscador)',
  abrir_caso: 'UI: abrir caso por número', tabla_verificar: 'UI: tabla', tabla_abrir_fila: 'UI: editar fila',
  tabla_agregar: 'UI: agregar fila', dialogo_confirmar: 'UI: confirmar pop-up', tabla_eliminar_fila: 'UI: eliminar fila',
  tabla_seleccionar_fila: 'UI: seleccionar fila (única)', abrir_pestana: 'UI: pestaña + contenido', intentar_diligenciar: 'UI: prueba negativa de campo',
  integracion: 'INTEGRATION_NOT_VERIFIED', no_automatizado: 'NOT_AUTOMATED',
};

const celda = (s: string) => s.replace(/\|/g, '\\|');

export function generarTrazabilidad(env: Entorno = process.env, dirReportes = DIR_SALIDA, dirVersionado: string | null = DIR_EVIDENCIA_VERSIONADA): string {
  const matriz = cargarMatriz();
  const man = cargarManifest();
  const reg = cargarRegistro();
  const escenarios = new Map<string, EscenarioSde>();
  for (const c of man.casos) if (c.escenario) escenarios.set(c.id, cargarEscenario(resolve(DIR_ESCENARIOS, c.escenario), reg));

  const out: string[] = [
    '# Trazabilidad 17 CP — SDE-CEL',
    '',
    '> Documento GENERADO por `sde/trazabilidad.ts` (prueba `@docs`). No editar a mano: regenerar con',
    '> `$env:SDE_ACTUALIZAR_DOCS="1"; npm test -- seguros-del-estado matriz-manifest --grep @docs`.',
    '> Pasos y resultados esperados: literal de los Excel (`fuentes/matriz.json`). Estado real: último reporte EJECUTADO',
    '> (sesión real) de `test-results/seguros-del-estado/sde/`; un intento BLOCKED en preflight se muestra aparte y no tapa',
    '> la evidencia. Sin reporte ejecutado: estado del manifest. Ningún estado verde sin reporte.',
    '',
  ];
  const inv = inventarioReportes(dirReportes, dirVersionado);
  out.push(
    `> **Fuentes de ejecución:** historial local \`test-results/\`: ${inv.local === null ? '**NO disponible en este equipo** (no se versiona; tras clonar no existe)' : `${inv.local} reporte(s)`}` +
    ` · evidencia versionada \`docs/evidencia/\`: ${inv.versionado} reporte(s). Si un reporte está en ambas, prevalece la copia local.`,
    '',
  );
  const cob = new Map<string, CoberturaCp>();
  for (const c of man.casos) cob.set(c.id, coberturaCp(matriz.find((x) => x.id === c.id)!, c, escenarios.get(c.id), leerReportes(c.id, dirReportes, dirVersionado)));
  const t = totales([...cob.values()]);
  out.push(
    '## Cobertura (tres indicadores independientes)',
    '',
    '| Indicador | CP | Definición |',
    '|---|---|---|',
    `| Implementada | ${t.implementada}/${t.cps} (completa: ${t.implementada_completa}) | Escenario declarativo válido. Completa = TODOS los pasos verificados solo por UI (ninguno mixto, con integración pendiente o no automatizado) |`,
    `| Ejecutada | ${t.ejecutada}/${t.cps} | Reporte con sesión real contra QA (no cuenta un BLOCKED de preflight) |`,
    `| Aprobada | ${t.aprobada}/${t.cps} | Último reporte ejecutado = REAL_PASS. No cuenta REAL_PASS_PARCIAL (${t.parcial}), FAIL (${t.fail}) ni BLOCKED (${t.blocked}) |`,
    '',
    'Una prueba unitaria aprobada no es un CP aprobado; un dato sintético no demuestra la integración con SISE.',
    '',
    '## Resumen',
    '',
    '| CP | Familia | Fase | Escenario | Actores (credenciales) | Datos | Implementación (pasos solo UI / mixtos UI+pendiente / integración / no autom. / sin cubrir) | Ejecución (evidencia) | Estado funcional | Aprobado |',
    '|---|---|---|---|---|---|---|---|---|---|',
  );
  for (const c of man.casos) {
    const k = cob.get(c.id)!;
    const actores = c.actores.map((a) => `${a}: ${estadoActor(reg, a, env).estado}`).join('<br>');
    const datos = c.datasets.map((d) => `${d}: ${estadoDataset(reg, d, env).estado}`).join('<br>');
    const p = k.pasos;
    const impl = `${k.implementacion} (${p.ui}/${p.mixto}/${p.integracion}/${p.no_automatizado}/${p.sin_cubrir} de ${p.total})`;
    const ev = k.evidencia ? `${k.evidencia.archivo}${k.evidencia.reporte.numero_caso ? ` (caso ${k.evidencia.reporte.numero_caso})` : ''}` : 'NO EJECUTADO';
    const intento = k.ultimoIntento && k.ultimoIntento !== k.evidencia ? `<br>último intento: ${k.ultimoIntento.reporte.estado} (${k.ultimoIntento.archivo})` : '';
    out.push(`| ${c.id} | ${c.familia} | ${c.fase} | ${c.escenario ?? '—'} | ${actores} | ${datos} | ${impl} | ${ev}${intento} | **${k.funcional}** | ${k.aprobada ? 'SÍ' : 'no'} |`);
  }

  for (const c of man.casos) {
    const m = matriz.find((x) => x.id === c.id)!;
    const esc = escenarios.get(c.id);
    const rep = cob.get(c.id)!.evidencia?.reporte ?? null;
    out.push('', `## ${c.id} — ${m.titulo}`, '');
    out.push(`- **Requisitos:** ${m.requisitos.join('; ')}`);
    out.push(`- **Familia:** ${c.familia} · **Fase:** ${c.fase} · **Prioridad:** ${c.prioridad}`);
    out.push(`- **Escenario:** ${c.escenario ? `\`escenarios/${c.escenario}\`` : 'sin escenario (PREPARADO: no se crea un stub)'}`);
    out.push(`- **Brechas:** ${c.brechas.map((b) => `${b} (${man.brechas[b]?.tipo ?? '?'})`).join(', ')}`);
    // H7: lo que impide REAL_PASS aunque todo lo automatizado pase (estructural; los fallos observados van en "Estado").
    const pend = pendientesParaRealPass(m, esc);
    out.push(`- **Máximo alcanzable hoy:** ${maximoAlcanzable(m, esc)}` + (esc && pend.length
      ? ` — pendientes para REAL_PASS: ${pend.map((p) => `P${p.n} (${p.cobertura.replace('_', ' ')})`).join(', ')}`
      : ''));
    const intento = cob.get(c.id)!.ultimoIntento?.reporte;
    out.push(`- **Estado:** ${rep ? `${rep.estado} — ${rep.motivo}` : intento ? `${intento.estado} (no ejecutado) — ${intento.motivo} ${intento.bloqueos.join('; ')}` : c.estado}`);
    out.push('', '| Paso | Acción (Excel) | Resultado esperado (Excel) | Cobertura | Estado |', '|---|---|---|---|---|');
    for (const p of m.pasos) {
      let cobertura = 'Familia ' + c.familia + ' (fase ' + c.fase + ')';
      let estado: string = c.estado === 'PREPARADO' ? 'NOT_RUN' : 'BLOCKED';
      if (esc) {
        const pasosEsc = esc.pasos.map((x, i) => ({ ...x, i: i + 1 })).filter((x) => x.matriz.includes(p.n));
        cobertura = pasosEsc.length ? pasosEsc.map((x) => `#${x.i} ${x.hacer} (${PLAN[x.hacer] ?? x.hacer})`).join('<br>')
          : /^Objetivo/i.test(p.accion) ? 'Agregado del CP' : 'NOT_AUTOMATED (sin paso)';
      }
      if (rep) estado = rep.matriz.find((r) => r.n === p.n)?.estado ?? estado;
      out.push(`| ${p.n} | ${celda(p.accion)} | ${celda(p.esperado)} | ${cobertura} | ${estado} |`);
    }
  }
  return out.join('\n') + '\n';
}
