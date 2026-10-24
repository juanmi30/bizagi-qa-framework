import { test } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listarEjecuciones, motivoNoSeleccionable, RAIZ_REPO, simularLimpieza } from '../sde/ejecuciones';

/**
 * HISTÓRICOS de ejecuciones SDE: listado y SIMULACIÓN de limpieza. Solo lectura: no abre Bizagi, no borra ni mueve nada
 * (no existe función de borrado; una limpieza real será una fase posterior con autorización y política de retención QA).
 * Uso (PowerShell, raíz del repo):  node tools/run.mjs seguros-del-estado --grep "@historicos"
 * Retención propuesta (pendiente de QA): $env:SDE_RETENCION_DIAS='30' (por defecto 30).
 */
test('ejecuciones almacenadas y simulación de limpieza [solo lectura] @historicos', () => {
  const retencionDias = Number(process.env.SDE_RETENCION_DIAS ?? 30);
  test.skip(!Number.isFinite(retencionDias) || retencionDias < 0, 'SDE_RETENCION_DIAS debe ser un número >= 0.');
  // Las fuentes de las certificaciones declaradas también se protegen (se citan por <CP>_<unico>).
  const referenciadas = new Set<string>();
  const dirCert = resolve(__dirname, '..', 'certificacion');
  for (const f of existsSync(dirCert) ? readdirSync(dirCert).filter((x) => x.endsWith('.json')) : []) {
    try {
      const cfg = JSON.parse(readFileSync(resolve(dirCert, f), 'utf8')) as { casos: { fuentes: string[] }[] };
      for (const c of cfg.casos) for (const fu of c.fuentes) referenciadas.add(fu.split('/').pop()!.replace(/^CONTINUACION_/, '').replace(/\.json$/, ''));
    } catch { /* sin configuración de certificación */ }
  }
  console.log('EJECUCIONES ALMACENADAS (test-results/seguros-del-estado/sde/ejecuciones):');
  for (const l of listarEjecuciones()) {
    const e = l.ejecucion;
    if (!e) { console.log(`  ${l.archivo}: ${l.error}`); continue; }
    const motivo = motivoNoSeleccionable(RAIZ_REPO, e);
    console.log(`  ${e.cp} ${e.unico} · ${e.estado_ejecucion} · ${e.estado_cp ?? '—'} · caso ${e.numero_caso ?? '—'} · inicio ${e.inicio}`
      + ` · corrida ${e.corrida_suite ?? '—'} · ${motivo ? `no seleccionable: ${motivo}` : 'seleccionable'}`);
  }
  const { filas, recuperable, reportesSinMetadatos } = simularLimpieza({ retencionDias, referenciadas });
  console.log(`SIMULACIÓN DE LIMPIEZA (retención propuesta ${retencionDias} días; NO se borra nada):`);
  for (const f of filas) console.log(`  ${f.candidata ? 'CANDIDATA ' : 'PROTEGIDA '} ${f.cp} ${f.unico} · ${(f.bytes / 1024).toFixed(1)} KB${f.protecciones.length ? ` · ${f.protecciones.join('; ')}` : ''}`);
  console.log(`  Espacio recuperable: ${(recuperable / 1024).toFixed(1)} KB en ${filas.filter((f) => f.candidata).length} ejecución(es).`);
  console.log(`  Reportes anteriores sin metadatos de ejecución (no se evalúan; quedan protegidos): ${reportesSinMetadatos}.`);
  console.log('  Siempre protegidos: soportes Word generados y docs/evidencia (versionada).');
});
