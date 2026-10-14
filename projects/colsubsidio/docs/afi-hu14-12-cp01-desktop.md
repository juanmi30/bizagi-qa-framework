# Piloto AFI — HU 14.12 / CP01 Desktop

> Registro histórico del piloto P04-P11. La implementación extendida y su
> cobertura actual se documentan en [HU 14.12 — implementación](afi-hu14-12-implementacion.md).

Playwright Test del proyecto Colsubsidio. Crea una solicitud real desde el portal QA y cancela exclusivamente ese caso en `finally`. Termina después de reabrir Localidad y conservar Chapinero (P11). No avanza Barrio ni completa la afiliación.

## Ejecutar

Desde la raíz, en PowerShell:

```powershell
$env:PROJECT = 'colsubsidio'
$env:AFI_CP01_RUN_REAL = 'true'
$env:CI = '1'
$env:CAPTURE = '1'
npx playwright test afi-hu14-12-cp01-desktop.spec.ts --workers=1
```

Sin `AFI_CP01_RUN_REAL=true` la prueba se omite. El spec desactiva retries incluso en CI. No ejecutar simultáneamente con los mismos datos.

Configuración privada: `projects/colsubsidio/.env`, cargado por la configuración existente. Se consumen solamente variables de entorno:

- Las ocho `AFI_CP01_*` originales: `TIPO_APORTANTE`, `TIPO_AFILIADO`, `TIPO_IDENTIFICACION`, `NUMERO_IDENTIFICACION`, `CORREO`, `CONFIRMACION_CORREO`, `AUTORIZA_DATOS`, `AUTORIZA_INTIMIDAD`.
- Datos adicionales autorizados para las pantallas intermedias: `AFI_CP01_NUM_CEL`, `AFI_CP01_NUM_CEL_FIJO`, `AFI_CP01_ACTIVIDAD`, `AFI_CP01_INGRESO_MENSUAL`.
- `BIZAGI_BASE_URL`, `BIZAGI_LOGIN_DOMINIO` y credenciales existentes (`USUARIO_admin` / `CLAVE_admin`, con fallback `BIZAGI_USER` / `BIZAGI_PASSWORD`).

No se incluyen valores de ejemplo. Capturas, videos y traces permanecen en `test-results/colsubsidio/`, ignorado por el repositorio; pueden contener información privada y no deben publicarse sin revisión.

## Flujo y límites

1. Prevalidar datos y login administrativo para cleanup.
2. Home → formulario inicial, selecciones exactas, identificación mediante interacción normal, correos contenteditable y consentimientos con scroll real del PDF.
3. Un clic en Continuar; capturar el número desde su respuesta `processes(...)/start`. Registrar la propiedad del caso antes de adjuntar evidencia.
4. Esperar la integración. Si avanza naturalmente, no emular reconocimiento.
5. Información personal: teléfonos. Información adicional: actividad e IBC; respetar los datos precargados.
6. Información de contacto: P04–P11 con assertions, screenshots y catálogos JSON.
7. Admin → Administración de procesos → Casos → búsqueda exacta → seleccionar solo el caso padre creado → Cancelar → confirmar el mensaje del mismo caso.

La búsqueda administrativa muestra subprocesos con el mismo radicado visible. Se usa `input[name="CaseAdmin"][data-subprocess="false"][value="<caso de esta corrida>"]` para distinguir el padre. Nunca se utiliza la pestaña de cancelación masiva ni `#btn-admin-cases-invalidate`.

La rama condicional de emulación exige una actividad inequívoca de reconocimiento, controles únicos para los dos códigos y mensaje de validación exitosa. Su ejecución depende de que QA presente esa actividad; un recorrido que avance naturalmente no certifica esta rama ni la reasignación. Ante una pantalla distinta, debe fallar y ejecutar cleanup, sin inferir campos ni actividades.

## Controles de contacto observados

| Elemento | Locator | Comportamiento |
|---|---|---|
| Título | `getByText('Información de contacto', { exact: true })` | Visible al llegar |
| Alerta | `.alertas-warn` filtrado por texto territorial | Texto exacto e imagen `alt="warn"` |
| Departamento | `getByRole('combobox', { name: 'Departamento', exact: true })` | Input con autocomplete Material |
| Ciudad | `getByRole('combobox', { name: 'Ciudad vivienda', exact: true })` | `disabled` después de elegir Bogotá |
| Localidad | `getByRole('combobox', { name: 'Localidad', exact: true })` | Input con autocomplete Material |

Los paneles se resuelven mediante `aria-controls`. No se fijan IDs `mat-option-*`. Los catálogos se leen completos del DOM, con estabilidad en lecturas sucesivas; si aparece virtualización, la prueba falla explícitamente en lugar de presentar una lista parcial como completa.

P08 usa `pressSequentially`. P09 provoca blur con clic en el título. P10 adjunta opciones antes de seleccionar. P11 compara el catálogo reabierto con el inicial y comprueba el valor después de cerrar con Escape.

## Reportes y reutilización

`CP01_resultado.json` registra duración, estado PASS/FAIL/BLOCKED de P04–P11, correlación local, reconocimiento y cleanup. Un fallo de cleanup se registra por separado y no reemplaza el error funcional. Los pasos no alcanzados quedan BLOCKED.

`afiliacionesPortal.ts` permite reutilizar preparación, consentimientos, navegación intermedia y apertura de catálogos en CP02. `bizagiQaSupport.ts` concentra correlación, administración y cleanup. `cp01Contacto.ts` conserva assertions específicas de CP01.

No se modificó `shared/` ni se identificó una necesidad demostrada de cambiar el framework. Antes de promover helpers deben validarse al menos otro caso y la rama de emulación/reasignación en una ejecución que realmente la requiera. La cancelación es best-effort: la terminación forzada del proceso o pérdida de acceso puede requerir cleanup manual usando el registro local de creación.

## Ejecución del 15 de septiembre de 2026

- Playwright: **1 passed**, duración funcional incluyendo cleanup: **154 segundos**.
- P04, P05, P06, P07, P08, P09, P10 y P11: **PASS**.
- Avance natural de la integración; emulación y reasignación **no ejecutadas ni certificadas**.
- Cleanup del caso de exploración y del caso del spec: **exitoso**, con mensaje de cancelación del respectivo caso.
- Departamento: exactamente `BOGOTÁ, D.C.` y `CUNDINAMARCA`.
- Ciudad: `BOGOTÁ, D.C.`, `disabled=true`, `readonly=false`, sin `aria-disabled`.
- Localidad: 19 opciones iniciales y las mismas 19 al reabrir. `Cha` mostró solamente `Chapinero`; selección conservada al cerrar.
- Reporte HTML: `test-results/colsubsidio/html-report/index.html`. El número de caso queda en el JSON local, no en esta documentación.
- Comprobaciones adicionales: TypeScript sin errores y descubrimiento de un único test con `--list`.

Tras la ejecución se endureció la entrada a la rama no recorrida: exige el mensaje conocido de verificación antes de intentar emular. Esa rama sigue pendiente de ejecución real; el PASS documentado corresponde al avance natural observado.
