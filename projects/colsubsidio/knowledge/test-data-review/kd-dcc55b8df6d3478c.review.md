# Revisión de datos de prueba — lote kd-dcc55b8df6d3478c

Preparado sobre la revisión 7 del Test Data Registry. NADA de esto cambia el registro hasta aplicar sus decisiones.
Este documento no contiene valores: solo condiciones de negocio y qué datos harán falta.

## Cómo decidir

1. Edite `kd-dcc55b8df6d3478c.decisiones.json`: en cada propuesta ponga `"decision"`: `APPROVED`, `REJECTED` o `NEEDS_CHANGES`, y su `"revisor"` (rol o alias, nunca su nombre).
2. Opcional al aprobar: `"correcciones"` { id, condiciones, campos }, `"mismoActorQue"`, `"actoresDistintosDe"` y `"estado"` (`pendiente-provisionar` | `provisionado`).
3. Compartir un secreto (p. ej. un buzón QA) ocurre SOLO si usted lo decide: declárelo en `"compartidos"` y use `{ "fuente": "shared", "sharedRef": "<id>" }` en ese campo.
4. Pruebe sin escribir: `node tools/afi.mjs colsubsidio datos aplicar <review.json> <decisiones.json> --dry-run`; luego, sin `--dry-run`.

## ACTOR PROPUESTO: empresa-empleador-juridico-rues-con-rep-legal
Propuesta: ps-empresa-empleador-juridico-rues-con-rep-legal

Perfil:
  empresa
Debe cumplir:
  • Aportante tipo Empleador Jurídico existente en RUES, no afiliado a Colsubsidio, con información/número del Representante Legal retornado por RUES.
Lo necesitan:
  • HU 7.14 · CP01
Campos necesarios:
  • Número de identificación
  • Correo electrónico
Qué será secreto (QA debe conseguirlo y guardarlo en el .env al aprobarse):
  • Número de identificación
  • Correo electrónico — compartible con otros actores SOLO si usted lo decide
Qué resolverá automáticamente el framework (sin secretos):
  • Tipo de aportante (dato público del perfil)
  • Tipo de empleador (dato público del perfil)
  • Naturaleza (preparación automática segura)
  • Clase de empleador (preparación automática segura)
  • Tipo de identificación (dato público del perfil)
  • Confirmación del correo (se deriva de Correo electrónico)
  • Recibió ayuda de asesor (preparación automática segura)
  • Autorización de tratamiento de datos (preparación automática segura)
  • Autorización de intimidad (preparación automática segura)
  • Departamento (preparación automática segura)
  • Ciudad de vivienda (se deriva de Departamento)
Posibles reutilizaciones (decida mismoActorQue o actoresDistintosDe):
  (ninguna: no se parece a ningún actor aprobado ni a otra propuesta)
Estado propuesto:
  pendiente-provisionar: QA debe conseguir un actor que cumpla las condiciones. Use "provisionado" solo si ya existe.

## ACTOR PROPUESTO: empresa-empleador-juridico-rues-sin-rep-legal
Propuesta: ps-empresa-empleador-juridico-rues-sin-rep-legal

Perfil:
  empresa
Debe cumplir:
  • Aportante tipo Empleador Jurídico existente en RUES, no afiliado a Colsubsidio, sin Representante Legal retornado por RUES.
Lo necesitan:
  • HU 7.14 · CP02
  • HU 7.14 · CP03
  • HU 7.14 · CP04
Campos necesarios:
  • Número de identificación
  • Correo electrónico
Qué será secreto (QA debe conseguirlo y guardarlo en el .env al aprobarse):
  • Número de identificación
  • Correo electrónico — compartible con otros actores SOLO si usted lo decide
Qué resolverá automáticamente el framework (sin secretos):
  • Tipo de aportante (dato público del perfil)
  • Tipo de empleador (dato público del perfil)
  • Naturaleza (preparación automática segura)
  • Clase de empleador (preparación automática segura)
  • Tipo de identificación (dato público del perfil)
  • Confirmación del correo (se deriva de Correo electrónico)
  • Recibió ayuda de asesor (preparación automática segura)
  • Autorización de tratamiento de datos (preparación automática segura)
  • Autorización de intimidad (preparación automática segura)
  • Departamento (preparación automática segura)
  • Ciudad de vivienda (se deriva de Departamento)
Posibles reutilizaciones (decida mismoActorQue o actoresDistintosDe):
  (ninguna: no se parece a ningún actor aprobado ni a otra propuesta)
Estado propuesto:
  pendiente-provisionar: QA debe conseguir un actor que cumpla las condiciones. Use "provisionado" solo si ya existe.
