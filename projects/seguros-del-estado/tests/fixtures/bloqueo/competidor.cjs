// FIXTURE (no es una prueba): proceso Node independiente que compite por un bloqueo. Lo lanza bloqueo-archivo.unit.spec.ts.
// Uso: node competidor.cjs <modulo BloqueoArchivo.cjs> <ruta .lock> <archivo seccion> <iteraciones> <retencion ms> [retener]
//  - Modo normal: en cada iteración toma el bloqueo y, DENTRO de la sección crítica, crea <seccion> con "wx". Si ya
//    existe, otro proceso está dentro a la vez: se cuenta como violación de la exclusión mutua.
//  - Modo "retener": toma el bloqueo, avisa "TOMADO" y espera a que lo maten (simula un proceso terminado abruptamente).
const fs = require('node:fs');
const [modulo, ruta, seccion, iteraciones, retencionMs, modo] = process.argv.slice(2);
const { adquirirBloqueo } = require(modulo);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (modo === 'retener') {
    await adquirirBloqueo(ruta, { esperaMs: 10_000, descripcion: 'competidor retenido' });
    process.stdout.write('TOMADO\n');
    setInterval(() => {}, 1000);
    return;
  }
  let dentro = 0;
  let violaciones = 0;
  for (let i = 0; i < Number(iteraciones); i++) {
    const b = await adquirirBloqueo(ruta, { esperaMs: 60_000, descripcion: `competidor ${process.pid}` });
    try {
      try { fs.closeSync(fs.openSync(seccion, 'wx')); } catch { violaciones++; }
      dentro++;
      await dormir(Number(retencionMs));
      try { fs.unlinkSync(seccion); } catch { /* lo borró otro dueño simultáneo: ya contado */ }
    } finally {
      b.liberar();
    }
  }
  process.stdout.write(JSON.stringify({ pid: process.pid, dentro, violaciones }) + '\n');
})().catch((e) => { process.stderr.write(String(e && e.stack || e)); process.exit(2); });
