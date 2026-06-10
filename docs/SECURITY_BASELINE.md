# Security Baseline

## Controles minimos antes de nube

1. Variables sensibles solo en Railway/hosting.
2. MongoDB con usuario dedicado, TLS y allowlist si aplica.
3. Redis privado, sin exposicion publica.
4. CORS limitado a dominios del frontend.
5. Logs sin tokens, passwords ni payloads completos de sensores.
6. Usuarios demo deshabilitados o eliminados en produccion.
7. Rotacion de claves historicas encontradas en codigo.
8. Backups automaticos de MongoDB.
9. Health checks por servicio.
10. Separacion de ambientes: local, staging, production.

## Hallazgos iniciales detectados

- Hay servicios con defaults historicos de credenciales/API keys en `env.ts`.
- Hay carpetas legacy y generadas que no deben mezclarse en el primer deploy.
- `sdc-modelos` usa dependencia local por ruta relativa; el deploy debe respetar monorepo.

## Recomendacion

Antes del primer push publico o despliegue productivo, rotar todas las claves que alguna vez estuvieron versionadas o compartidas por chat/documentos.
