# Promocion segura de CHAMAN

## Regla principal

Se promueve **codigo por commit**, no una carpeta, un CSS suelto ni la base de testing.
El frontend, los servicios y los estilos forman una unica version identificada por el SHA de Git.
Produccion y testing usan el mismo codigo aprobado, pero mantienen variables, secretos, URLs,
MongoDB, Redis y volumenes independientes.

## Flujo obligatorio

1. Crear una rama `codex/*` o `staging/*` desde `main` actualizado.
2. Desplegar todos los servicios sin estado de testing desde el mismo SHA.
3. Ejecutar `npm run audit:deployment-topology`, pruebas, compilaciones y auditoria de secretos.
4. Validar en testing:
   - login y permisos;
   - navegacion y estados vacios;
   - clima con FieldClimate/Open-Meteo automatico;
   - fenologia, enfermedades y riego;
   - Redis, cola y worker NDVI;
   - archivos/camaras cuando correspondan;
   - conteos, claves unicas e integridad de catalogos.
5. Abrir Pull Request hacia `main`. No hacer push directo a `main`.
6. Exigir checks exitosos, revision humana y despliegue de testing exitoso.
   `quality-gates` debe validar también el push final a `main`.
7. Antes de datos o esquemas: crear backup productivo y ensayar una migracion idempotente en testing.
   Mientras Railway no tenga backups/PITR, el backup debe ser lógico y su
   restauración debe ensayarse en un destino aislado antes de cualquier deploy
   productivo; ambas evidencias son obligatorias en el manifiesto de release.
   El procedimiento fail-closed esta en `docs/MONGO-LOGICAL-BACKUP-RESTORE-DRILL.md`.
8. Fusionar el PR. Railway despliega produccion exclusivamente desde `main`.
9. Ejecutar smoke test productivo y conservar el SHA anterior como rollback inmediato.

## Datos

- El clonado admitido es `produccion -> testing`.
- Despues de clonar se eliminan sesiones y tokens de dispositivos.
- Nunca se restaura la base completa de testing sobre produccion.
- Un cambio de catalogo se expresa como script versionado, repetible e idempotente.
- El script se ejecuta primero en testing; en produccion solo despues de backup y aprobacion.
- Las observaciones creadas durante una prueba permanecen en testing salvo una migracion explicita y revisada.

## Diferencias permitidas entre entornos

- URLs, dominios internos y credenciales.
- MongoDB, Redis y volumenes.
- Automatismos con efectos externos: MQTT, captura HikConnect y sincronizaciones programadas pueden estar
  desactivados en testing. Las acciones manuales deben poder probarse contra servicios aislados.

No se permiten diferencias de codigo, componentes, estilos, contratos API ni version de esquema entre
servicios sin estado que declaren el mismo release.

## Protecciones recomendadas en GitHub

- Proteger `main` y exigir Pull Request.
- Exigir los checks `topology-and-secrets`, `frontend-production-build`, pruebas de backend,
  worker satelital y `chaman-meteo-worker-build`.
- Descartar aprobaciones cuando aparezcan nuevos commits.
- Exigir que la rama este actualizada con `main`.
- Impedir force-push y eliminacion de `main`.
- Crear entornos GitHub `testing` y `production`; produccion debe requerir aprobacion manual.

## Railway

- `testing` es persistente y aislado.
- Produccion sigue `main`; testing sigue la rama candidata.
- Wait for CI sólo se habilita cuando `quality-gates` tiene un trigger
  `on: push` que cubre exactamente la rama conectada al servicio.
- Los 14 roles definidos en `deploy/environment-topology.json` deben existir en ambos entornos.
- Antes de aprobar, todos los servicios sin estado de testing deben reportar el mismo SHA.
- Un deployment ID es evidencia, no garantía de recuperación: en Hobby la
  imagen se retiene 72 h y se debe comprobar `canRollback`. El rollback
  arbitrario usa Dashboard/Public API; conservar también el SHA anterior en
  una referencia Git protegida e inmutable porque la CLI sólo redeploy/restart
  el deployment más reciente.
- El procedimiento de manifiesto, preflight y rollback verificable está en
  `docs/RELEASE-SAFETY-CONTROLS.md`.
