# Railway Deployment

## Estrategia recomendada

Crear un proyecto Railway con servicios separados desde el mismo repositorio `CHAMAN2026`.

Usar root directory `.` para todos los servicios. El repo incluye `railway.json` con builder `RAILPACK` y scripts raiz que resuelven cada subproyecto mediante la variable `CHAMAN_SERVICE`.

Build command para todos los servicios:

```bash
npm run railway:build
```

Start command para todos los servicios:

```bash
npm run railway:start
```

## Servicios minimos para staging

1. `chaman-datos` con `CHAMAN_SERVICE=sdc-datos`
2. `chaman-auth` con `CHAMAN_SERVICE=sdc-auth`
3. `chaman-clima` con `CHAMAN_SERVICE=sdc-api-clima`
4. `chaman-predicciones` con `CHAMAN_SERVICE=sdc-api-predicciones`
5. `chaman-api` con `CHAMAN_SERVICE=sdc-api-cliente`
6. `chaman-web` con `CHAMAN_SERVICE=sdc-app-chaman`
7. MongoDB
8. Redis

## Orden de publicacion

1. MongoDB y Redis.
2. `sdc-datos`.
3. `sdc-auth`.
4. `sdc-api-clima`.
5. `sdc-api-predicciones`.
6. `sdc-api-cliente`.
7. `sdc-app-chaman`.

## Conexion entre servicios

Usar private networking para servicios internos y dominio publico solo para `chaman-api` y `chaman-web`.

- `chaman-datos`: privado, `PORT=5000`.
- `chaman-auth`: privado, `API_DATOS=http://${{chaman-datos.RAILWAY_PRIVATE_DOMAIN}}:${{chaman-datos.PORT}}`.
- `chaman-clima`: privado, `API_DATOS=http://${{chaman-datos.RAILWAY_PRIVATE_DOMAIN}}:${{chaman-datos.PORT}}`.
- `chaman-predicciones`: privado, `API_DATOS=http://${{chaman-datos.RAILWAY_PRIVATE_DOMAIN}}:${{chaman-datos.PORT}}` y `API_CLIMA=http://${{chaman-clima.RAILWAY_PRIVATE_DOMAIN}}:${{chaman-clima.PORT}}/clima`.
- `chaman-api`: publico, comunica internamente con datos/auth/clima/predicciones.
- `chaman-web`: publico, lee `CHAMAN_WEB_API_URL` y `CHAMAN_WEB_TILES_URL` desde `/runtime-config.js`. En Railway debe apuntar al gateway publico con prefijo, por ejemplo `https://${{chaman-api.RAILWAY_PUBLIC_DOMAIN}}/sdc-quimica`.

Los backends aceptan `HOST` por variable de entorno. En Railway usar `HOST=::` para compatibilidad con private networking dual-stack.

## Variables principales

Usar los archivos `*.env.example` de esta carpeta como checklist. No copiar secretos reales al repositorio.

### MongoDB

`sdc-datos` acepta `MONGO_URI`, `MONGO_URL` o `DATABASE_URL`. En Railway, vincular el plugin MongoDB y mapear la connection string a `MONGO_URI`.

### Redis

`sdc-api-cliente` usa Redis para colas/cache. Vincular Redis y setear `REDIS_HOST`, `REDIS_PORT` y `REDIS_PASSWORD` segun las variables del plugin.

### Clima

`sdc-api-clima` puede funcionar con Open-Meteo sin credenciales. FieldClimate queda opcional para clientes con estacion propia.

### Google Cloud

Google Cloud no se usa en esta version. No subir service accounts ni archivos `google-credentials.json`.

## Verificacion

Antes de publicar:

```bash
npm run audit:secrets
npm run build
```

En Railway, cada servicio debe responder `GET /health`. El frontend sirve `index.html` tambien en `/health`, suficiente para healthcheck de staging.
