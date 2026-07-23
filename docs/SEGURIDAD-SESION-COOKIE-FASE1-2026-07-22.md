# Seguridad de sesión web — fase 1

Fecha: 22 de julio de 2026
Estado: validada en `testing` y habilitada en `production`

## Objetivo

Reducir la exposición de credenciales de sesión en el navegador sin alterar el login vigente de producción. La transición se activa por variables de entorno y conserva compatibilidad con los clientes existentes.

## Diseño implementado

- El `refresh token` se entrega en una cookie `Secure`, `HttpOnly` y `SameSite=None`, limitada a la ruta de autenticación de la API.
- El `access token` se mantiene solamente en memoria durante la ejecución de la aplicación; no se persiste en `localStorage` ni en `sessionStorage` cuando el modo cookie está activo.
- `refresh` y `logout` requieren un token CSRF vinculado criptográficamente al `refresh token`.
- Cada renovación rota el `refresh token`; el anterior deja de ser válido.
- El cierre de sesión revoca la sesión y elimina las cookies.
- La aplicación activa el modo mediante `CHAMAN_COOKIE_AUTH_ENABLED=true`; la API lo habilita mediante `COOKIE_AUTH_ENABLED=true` y exige `SESSION_CSRF_SECRET` de al menos 32 caracteres.
- Los clientes antiguos continúan usando el flujo anterior mientras no envíen `X-Chaman-Session: cookie-v1`.

`SameSite=None` es necesario en esta fase porque web y API se sirven desde dominios Railway diferentes. Siempre se combina con `Secure`. Una arquitectura futura bajo un mismo origen permitirá evaluar `SameSite=Lax` o `Strict`.

## Pruebas realizadas

- Compilación de API y web de testing.
- Pruebas unitarias de emisión, atributos, saneamiento de respuesta, CSRF válido e inválido y borrado de cookies.
- Login real: respuesta sin `refresh token` y cookie con los atributos esperados.
- Acceso autenticado a un recurso protegido.
- Renovación real con rotación de `access token` y `refresh token`.
- Reutilización del token anterior rechazada.
- CSRF incorrecto rechazado con HTTP 403.
- Recarga completa del navegador manteniendo la sesión por renovación segura.
- Logout real, revocación y redirección de una ruta protegida al login.
- Usuario temporal de QA archivado y sesión revocada al terminar.

## Despliegue y reversión

La fase quedó desplegada en producción el 22 de julio de 2026 mediante una
promoción escalonada de `chaman-api`, `CHAMAN2026`, `chaman-datos` y
`chaman-auth`. La validación real comprobó login, carga de datos, renovación
después de una recarga completa, logout, revocación y rechazo posterior de una
ruta protegida.

Reversión inmediata:

1. Definir `CHAMAN_COOKIE_AUTH_ENABLED=false` en la web del entorno afectado.
2. Definir `COOKIE_AUTH_ENABLED=false` en la API del mismo entorno.
3. Redesplegar ambos servicios.

No requiere migración de base de datos.

## Fase 2 recomendada

- Servir autenticación bajo el mismo origen mediante BFF o proxy controlado.
- Evaluar cookie de sesión `SameSite=Lax` o `Strict` y prefijo `__Host-`.
- Evitar exponer también el `access token` a JavaScript.
- Sustituir la autenticación WebSocket con bearer en memoria por un ticket efímero de un solo uso o una sesión validada por el backend.
- Incorporar pruebas de expiración e inactividad en el pipeline de despliegue.

## Referencias

- OWASP Session Management Cheat Sheet.
- OWASP HTML5 Security Cheat Sheet.
- RFC 9700, OAuth 2.0 Security Best Current Practice.
