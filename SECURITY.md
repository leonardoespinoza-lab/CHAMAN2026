# Security Policy

## Alcance

Este documento aplica al monorepo CHAMAN2026 y sus servicios asociados: frontend, APIs, motores agronomicos, clima, sensores, workers y procesos programados.

## Principios obligatorios

- No commitear secretos reales.
- Configurar credenciales solo por variables de entorno del proveedor de hosting.
- Mantener roles y permisos multi-tenant en cada ruta de datos.
- Registrar integraciones externas por servicio y propietario.
- Separar datos demo/locales de datos productivos.
- Rotar cualquier secreto historico que haya estado en archivos fuente.

## Variables sensibles

Tratar como secreto:

- MongoDB URI, usuario y password.
- Redis URL/password.
- MQTT/ChirpStack credentials.
- FieldClimate public/private key y usuarios de scraping/login.
- API keys climaticas pagas.
- OAuth client secrets.
- Passwords default o de usuarios demo en ambientes productivos.

## Antes de publicar

1. Ejecutar `npm run audit:secrets`.
2. Revisar `git status --short`.
3. Verificar que no haya `.env`, `logs/`, `dist/`, capturas con datos de clientes ni dumps de base.
4. Usar variables de Railway o del hosting, nunca defaults productivos en codigo.

## Hardening de servicios NestJS

Los servicios backend aplican endurecimiento de seguridad en `main.ts` mediante `applySecurityHardening`.

Variables recomendadas para produccion:

- `SWAGGER_ENABLED=false`: Swagger queda deshabilitado por defecto en `production`, pero esta variable permite declararlo explicitamente.
- `CORS_ORIGINS=https://app.chamanagro.ar,https://chaman2026-production.up.railway.app,https://chamanagro.ar,https://www.chamanagro.ar`: dominios permitidos para consumir las APIs.
- `RATE_LIMIT_MAX=600`: limite de requests por IP dentro de la ventana configurada.
- `RATE_LIMIT_WINDOW_MS=60000`: ventana del rate limit en milisegundos.
- `RBAC_DENY_UNDECORATED=true`: modo estricto para exigir permisos explicitos en rutas nuevas. Activar luego de completar la matriz RBAC de todas las rutas.
- `HTTP_BODY_LIMIT=100mb`: solo en servicios que realmente reciben archivos o payloads grandes.

Controles aplicados por defecto:

- Headers de seguridad basicos.
- `X-Powered-By` deshabilitado.
- HSTS en produccion.
- CORS por allowlist.
- Rate limit basico por IP en produccion.
- Swagger oculto salvo habilitacion explicita.

## Reporte de hallazgos

Registrar hallazgos de seguridad en privado con el responsable del repositorio. No abrir issues publicos con credenciales, tokens o datos de clientes.
