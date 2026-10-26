# Migración de PC — 2026-10-26

Juan Miguel autorizó commit y push para trasladar el trabajo al siguiente equipo. Los cambios pendientes de adopción híbrida QA y presentación del Word corresponden a `feat/sde-soporte-certificacion-hu`; se publican en esa rama sin fusionar con `main` ni reescribir historia.

Incluye contrato y validadores, piloto documental HU06-CP02, instrucciones Gemini, redacción del Word, exclusión de secretos, utilidades offline, pruebas y logo SDE autorizado. El logo requiere una excepción explícita en `.gitignore` para que el clon pueda resolver la configuración HU06. No se ejecuta Bizagi ni se crean casos.

Validación previa a publicar: **69/69 regresiones offline PASS**, TypeScript sin errores y `git diff --check` correcto. Revisión de archivos nuevos/modificados contra valores locales del entorno y patrones de claves/tokens: sin coincidencias de credenciales; coincidencias no secretas corresponden a etiquetas funcionales, referencias a nombres de variables y URL documental ya presente en la matriz. No se incluyen archivos `.env`, sesiones ni resultados privados.

## En el nuevo PC

```powershell
git clone --branch feat/sde-soporte-certificacion-hu https://github.com/juanmi30/bizagi-qa-framework.git
cd bizagi-qa-framework
git config pull.ff only
npm ci
node node_modules/typescript/bin/tsc --noEmit
$env:SDE_E2E='0'
$env:CI='1'
$env:BIZAGI_BASE_URL='http://portal.sintetico.local'
node tools/run.mjs seguros-del-estado soporte-natural.unit soporte-hu.unit soporte-regresion-real.unit soporte-conservacion.unit qa-hibrida.unit qa-hibrida-calidad.unit orquestador-hu.unit --grep '@unit' --workers=1 --retries=0 --reporter=list --output=tmp/migracion-pc/tests
```

Leer después `docs/orquestacion/ESTADO-ACTUAL.md`, `docs/SOPORTE-SDE-OFICIAL.md` y los checkpoints híbridos del 22 de octubre. Las variables de la verificación anterior son temporales para pruebas offline; cerrar esa consola antes de configurar una ejecución real autorizada.

## Material que Git no transporta

- `.env` de cada proyecto: recuperar mediante gestor de contraseñas o canal autorizado, a partir de `.env.example`. No versionar ni enviar valores por chat.
- `test-results/`: reportes originales, capturas, planes y Word oficiales o demos v4/v5. Copiar por un canal corporativo seguro conservando rutas relativas; sin ellos el comando Word no recupera las corridas privadas del otro PC. No borrar el equipo anterior hasta comprobar la copia.
- Documentos privados de cliente, incluidos los Excel de Colsubsidio de la raíz. La suite AFI requiere `20260910_CLS_AFI_HU 14.12_V2_Casos_Prueba.xlsx`, ausente en este equipo; 24 pruebas quedaron bloqueadas por esa dependencia en la fase anterior.
- `tmp/`: auditorías y manifiestos locales, si se necesita conservar esas verificaciones. Las utilidades de auditoría histórica requieren sus archivos originales; no son pruebas portables independientes.

No copiar `node_modules/` ni sesiones de autenticación: reinstalar dependencias e iniciar sesión de nuevo. El logo autorizado y los dos Excel SDE ya revisados sí se transportan por Git. La paginación visual del Word sigue pendiente en un equipo con Microsoft Word o LibreOffice.
