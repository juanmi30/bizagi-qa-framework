# Recuperación manual de bloqueos entre procesos

`shared/utils/BloqueoArchivo.ts` impide que dos procesos del **mismo equipo** hagan a la vez algo que no admite concurrencia. Cubre el histórico de casos de todos los proyectos y las ejecuciones reales de SDE.

**Alcance:** el bloqueo coordina procesos de un mismo equipo. **No** coordina equipos distintos contra el mismo ambiente QA, porque cada equipo tiene su propio `test-results/`. Esa coordinación sigue siendo organizativa: una sola persona ejecuta a la vez en QA.

## Archivos de bloqueo

| Archivo (siempre bajo `test-results/`, nunca versionado) | Protege |
|---|---|
| `test-results/<proyecto>/historico-casos.json.lock` | Registrar un caso y marcarlo como depurado |
| `test-results/seguros-del-estado/.ejecucion-real.lock` | Ejecuciones reales de SDE: runner de verticales, calibración y diagnóstico de documentos |
| `<bloqueo>.recuperacion` | Recuperación en curso de un bloqueo huérfano |
| `<bloqueo>.<uuid>.tmp` | Temporal de adquisición; uno que haya quedado no afecta la exclusión |

Cada bloqueo es un JSON con `pid`, `equipo`, `inicio`, `descripcion` y `token`. No contiene datos sensibles.

## Cuándo se recupera solo y cuándo no

- **Se recupera solo:** el bloqueo tiene metadatos válidos, es de este equipo y su proceso ya no existe. Es el caso de un proceso terminado abruptamente (cierre de terminal, `kill`).
- **No se recupera solo (fallo cerrado).** El proceso que lo pide espera; al agotar la espera, falla con `BloqueoOcupadoError` y un diagnóstico. Ocurre cuando:
  - los metadatos son ilegibles o están incompletos, incluido el formato anterior sin `token`;
  - el bloqueo es de otro equipo;
  - el proceso dueño sigue vivo, aunque el bloqueo sea antiguo (puede estar colgado, o el pid pudo reutilizarse);
  - existe `<bloqueo>.recuperacion`, porque una recuperación quedó a medias.

## Procedimiento

1. Lee el diagnóstico del error y el contenido del bloqueo, por ejemplo `Get-Content test-results\seguros-del-estado\.ejecucion-real.lock`.
2. Confirma que **no** hay otra ejecución en curso en este equipo:
   - `Get-Process -Id <pid>` no debe devolver un proceso, o el que devuelve no debe ser `node`;
   - no debe haber otra terminal ejecutando pruebas del proyecto.
3. Si el bloqueo es de otro equipo, confirma con la persona de ese equipo que terminó.
4. Solo entonces borra el bloqueo y, si existe, su `.recuperacion`:
   `Remove-Item test-results\seguros-del-estado\.ejecucion-real.lock, test-results\seguros-del-estado\.ejecucion-real.lock.recuperacion -ErrorAction SilentlyContinue`
5. **Ejecución real de SDE:** si el proceso dueño murió en medio de una ejecución real, revisa el histórico de casos (`test-results/seguros-del-estado/`) antes de volver a ejecutar, porque pudo crear un caso.

**Nunca** borres un bloqueo cuyo proceso dueño sigue vivo.
