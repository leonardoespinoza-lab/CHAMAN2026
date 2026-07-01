# Decision tecnica - sdc-api-admin

Fecha: 2026-07-01  
Estado recomendado: legacy/local hasta nueva decision.

## Contexto

El directorio `sdc-api-admin/` existe en el entorno local, pero esta excluido por `.gitignore` y no tiene archivos versionados en Git.

Esto significa que cualquier cambio hecho ahi no queda trazado por commit, review, build remoto ni auditoria normal del repo. Para una plataforma operativa con clientes, ese estado no es aceptable como superficie productiva.

## Decision

Hasta nueva definicion, `sdc-api-admin` no debe considerarse servicio productivo versionado.

Opciones futuras:

1. Retirarlo si ya fue reemplazado por `sdc-app-chaman` + `sdc-api-cliente`.
2. Incorporarlo formalmente al monorepo, quitandolo de `.gitignore`, auditando secretos, aplicando hardening comun, build y tests.
3. Mantenerlo solo como herramienta local, documentada y sin acceso a datos/secretos productivos.

## Riesgos detectados localmente

- CORS abierto.
- Swagger siempre activo.
- Logs con refresh token.
- Sin `applySecurityHardening`.
- Sin `ValidationPipe` global.
- Codigo fuera de Git.

## Reglas hasta resolverlo

- No desplegar `sdc-api-admin` a produccion.
- No agregar credenciales productivas en ese directorio.
- No usarlo como fuente de verdad para cambios de usuarios, permisos o datos productivos.
- Si se modifica para pruebas locales, no asumir que el cambio quedo respaldado.

## Recomendacion

Para Chaman V1, preferir retirar o congelar `sdc-api-admin` y concentrar administracion en los flujos ya versionados de `sdc-app-chaman`, `sdc-api-cliente`, `sdc-auth` y `sdc-datos`.
