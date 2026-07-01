# Avance de hardening de seguridad

Fecha: 2026-07-01

## Cambios aplicados

- Google Login queda fuera del frontend y deshabilitado por defecto en backend con `GOOGLE_LOGIN_ENABLED=false`.
- Se retiro el componente local de debug de tokens y sus atajos de teclado.
- Se eliminaron logs que podian imprimir tokens u objetos de error completos.
- Se agrego `npm run audit:logs` para detectar logs sensibles antes de publicar.
- Se agrego `npm run audit:prod-config` para validar configuracion productiva por servicio.
- `npm run audit:secrets` ahora vuelve a cubrir `sdc-api-externa` y `sdc-ftp`.
- Se documento el protocolo seguro Codex/Git/Railway.
- Se documento que `sdc-api-admin` debe tratarse como legacy/local hasta versionarlo o retirarlo.
- Se actualizaron locks de dependencias con `npm audit fix` sin `--force`.

## Validaciones ejecutadas

- `npm run audit:logs`
- `npm run audit:secrets`
- `npm run build`
- `npm --prefix sdc-cron run build`
- `npm --prefix sdc-ftp run build`
- `npm --prefix sdc-api-externa run build`
- `npm run audit:prod-config -- sdc-api-cliente` con variables productivas simuladas validas
- `git diff --check`

## Vulnerabilidades que quedan pendientes

No se aplicaron fixes con `--force` porque implican cambios mayores o reemplazo de paquetes. Pendientes por servicio luego de los parches seguros:

| Servicio | Altas | Moderadas | Paquetes principales |
| --- | ---: | ---: | --- |
| `sdc-app-chaman` | 1 | 0 | `xlsx` |
| `sdc-auth` | 9 | 2 | `oauth2-server`, `lodash`, `bcrypt/tar`, `multer`, `uuid/gaxios` |
| `sdc-api-cliente` | 3 | 2 | `multer`, `bull/uuid`, `xlsx` |
| `sdc-datos` | 2 | 0 | `multer` |
| `sdc-api-predicciones` | 3 | 0 | `multer`, `nodemailer` |
| `sdc-api-clima` | 2 | 0 | `multer` |
| `sdc-api-lora` | 3 | 0 | `multer`, `xlsx` |
| `sdc-api-externa` | 3 | 0 | `multer`, `xlsx` |
| `sdc-cron` | 2 | 0 | `multer` |
| `sdc-ftp` | 2 | 1 | `ftp-srv`, `ip`, `uuid` |

## Decisiones recomendadas

1. Reemplazar `xlsx` por una alternativa mantenida o aislar la carga de planillas con validacion estricta, limite de tamano y procesamiento sin confianza.
2. Planificar reemplazo de `oauth2-server` por una capa OAuth mantenida o migrar a JWT propio con refresh tokens hasheados.
3. Revisar endpoints de upload y agregar limites estrictos de tamano, campos y cantidad de archivos mientras `multer` no tenga fix limpio.
4. Evaluar `nodemailer` 9 en rama controlada por el motor de notificaciones.
5. Evaluar `bcrypt` 6 en `sdc-auth` con prueba de login, refresh y reseteo de password.
6. Revisar si `sdc-ftp` sigue siendo necesario en V1; si sigue, probar migracion controlada de `ftp-srv`.

