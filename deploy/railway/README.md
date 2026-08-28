# Railway Deployment

## Estrategia recomendada

Crear un proyecto Railway con servicios separados desde el mismo repositorio `CHAMAN2026`.

Usar root directory `.` y el `railway.json` raíz para los servicios resueltos
mediante `CHAMAN_SERVICE`. La excepción preparada es `sdc-meteo-worker`: cuando
su conjunto completo forme parte del ref, usa Root Directory
`sdc-meteo-worker` y `sdc-meteo-worker/railway.json`.

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
6. `chaman-externa` con `CHAMAN_SERVICE=sdc-api-externa`
7. `chaman-lora` con `CHAMAN_SERVICE=sdc-api-lora`
8. `chaman-websocket` con `CHAMAN_SERVICE=sdc-websocket`
9. `chaman-web` con `CHAMAN_SERVICE=sdc-app-chaman`
10. `chaman-ndvi-worker` con `CHAMAN_SERVICE=sdc-ndvi-worker`
11. `chaman-meteo-worker` con `CHAMAN_SERVICE=sdc-meteo-worker` cuando el
    conjunto Chamán-Meteo completo forme parte del ref
12. MongoDB
13. Redis

## Orden de publicacion

1. MongoDB y Redis.
2. Ejecutar y revisar el plan de migraciones requerido por el release.
3. `sdc-datos`.
4. `sdc-auth`.
5. `sdc-api-clima`.
6. `sdc-api-predicciones`.
7. `sdc-api-cliente`.
8. `sdc-api-externa`.
9. `sdc-api-lora`.
10. `sdc-websocket`.
11. `sdc-app-chaman`.
12. `sdc-ndvi-worker`.
13. `sdc-meteo-worker`, con importación apagada y después de validar las APIs.

### Migracion de indices activos (release 2026-07-23)

El archivado logico necesita indices unicos parciales. Esta migracion nunca
elimina documentos y no se ejecuta automaticamente en un reinicio normal.

Primero desplegar `sdc-datos` en testing con:

```bash
DB_AUTO_INDEX_ENABLED=false
CHAMAN_RUN_ACTIVE_INDEX_MIGRATION_ON_START=true
CHAMAN_ACTIVE_INDEX_MIGRATION_MODE=plan
```

El plan es de solo lectura y puede ejecutarse durante el arranque. Revisar que
todas las colecciones informen `duplicateGroups: 0` y que `safeToApply` sea
`true`.

`apply` y `rollback` **no se ejecutan mediante `railway:start`**. Railway puede
arrancar mas de una replica y una migracion de indices no debe quedar asociada
al ciclo de vida de la aplicacion. Crear un job one-off conectado a las mismas
variables y red privada de `sdc-datos`, con una sola replica/proceso, y ejecutar:

```bash
CHAMAN_MIGRATION_CONFIRM=20260723-active-unique-indexes-v1:apply npm run migrate:active-indexes:apply
```

El script usa un lease atomico con owner, heartbeat y vencimiento, y un indice
unico parcial sobre `migrationId`: un segundo runner se bloquea y un proceso
interrumpido puede retomarse al vencer el lease. Es una defensa adicional, no
un reemplazo del job singleton.

Una vez que el log indique `status: applied`, volver
`CHAMAN_RUN_ACTIVE_INDEX_MIGRATION_ON_START=false` y redeployar el mismo commit.
Para rollback usar otro job singleton con
`CHAMAN_MIGRATION_CONFIRM=20260723-active-unique-indexes-v1:rollback npm run migrate:active-indexes:rollback`.
Repetir exactamente el procedimiento en produccion solo despues de validar ese
commit en testing. Nunca configurar `apply` o `rollback` como Start Command ni
dejarlos vinculados a reinicios, escalado o redeploys.

## Conexion entre servicios

Usar private networking para servicios internos y dominio publico solo para `chaman-api`, `chaman-websocket` y `chaman-web`.

- `chaman-datos`: privado, `PORT=5000`.
- `chaman-auth`: privado, `API_DATOS=http://${{chaman-datos.RAILWAY_PRIVATE_DOMAIN}}:${{chaman-datos.PORT}}`.
- `chaman-clima`: privado, `API_DATOS=http://${{chaman-datos.RAILWAY_PRIVATE_DOMAIN}}:${{chaman-datos.PORT}}`.
- `chaman-predicciones`: privado, `API_DATOS=http://${{chaman-datos.RAILWAY_PRIVATE_DOMAIN}}:${{chaman-datos.PORT}}` y `API_CLIMA=http://${{chaman-clima.RAILWAY_PRIVATE_DOMAIN}}:${{chaman-clima.PORT}}/clima`.
- `chaman-api`: publico, comunica internamente con datos/auth/clima/predicciones y usa `AUTH_CLIENT_ID` / `AUTH_CLIENT_SECRET` para OAuth.
- `chaman-externa`: privado, recibe callbacks internos como `/ndvi/crear-reporte` y guarda reportes en `sdc-datos`.
- `chaman-lora`: privado, se conecta a EMQX/ChirpStack por MQTT y guarda uplinks en `sdc-datos`.
- `chaman-websocket`: publico para el navegador, autentica cada conexion y distribuye eventos por Redis o MQTT; sus dependencias `auth`, `datos` y Redis permanecen privadas.
- `chaman-web`: publico, lee `CHAMAN_WEB_API_URL`, `CHAMAN_WEB_WS_URL` y `CHAMAN_WEB_TILES_URL` desde `/runtime-config.js`. En Railway debe apuntar al gateway publico con prefijo, por ejemplo `https://${{chaman-api.RAILWAY_PUBLIC_DOMAIN}}/sdc-quimica`, y al canal realtime mediante `wss://${{chaman-websocket.RAILWAY_PUBLIC_DOMAIN}}`.
- `chaman-ndvi-worker`: privado, escucha la cola Redis `REDIS_NDVI_QUEUE` y notifica reportes NDVI a `API_EXTERNA_URL`.
- `chaman-meteo-worker`: privado, con Root Directory `sdc-meteo-worker`,
  configuración `sdc-meteo-worker/railway.json`, una réplica e importación
  desactivada durante el rollout inicial.

Los backends aceptan `HOST` por variable de entorno. En Railway usar `HOST=::` para compatibilidad con private networking dual-stack.

## Variables principales

Usar los archivos `*.env.example` de esta carpeta como checklist. No copiar secretos reales al repositorio.

### MongoDB

`sdc-datos` acepta `MONGO_URI`, `MONGO_URL` o `DATABASE_URL`. En Railway, vincular el plugin MongoDB y mapear la connection string a `MONGO_URI`.

### Redis

`sdc-api-cliente` usa Redis para colas/cache. Vincular Redis y setear `REDIS_HOST`, `REDIS_PORT` y `REDIS_PASSWORD` segun las variables del plugin.

Para NDVI, `sdc-api-cliente` y `sdc-ndvi-worker` deben compartir:

```bash
REDIS_NDVI_QUEUE=tareas-ndvi
REDIS_NDVI_DB=0
```

En el worker activar:

```bash
RAILWAY_DOCKERFILE_PATH=deploy/railway/sdc-ndvi-worker.Dockerfile
ENVIAR_BACKEND=true
CLEAN_UP=true
API_EXTERNA_URL=http://${{chaman-externa.RAILWAY_PRIVATE_DOMAIN}}:${{chaman-externa.PORT}}
NDVI_WORKER_TOKEN=<mismo-secreto-largo-en-chaman-externa-y-ndvi-worker>
NDVI_STORAGE_MODE=inline
```

El worker usa un Dockerfile propio porque necesita Python, GDAL/rasterio y Node para convivir con los scripts raiz del monorepo en Railway.

`NDVI_STORAGE_MODE=inline` embebe la imagen PNG como `data:image/png;base64,...` dentro del reporte. Es la opcion recomendada para Railway mientras no exista un volumen compartido o storage externo. Para una etapa con muchos reportes conviene migrar a S3/R2 o volumen persistente y usar `NDVI_PUBLIC_BASE_URL`.

### Clima

`sdc-api-clima` puede funcionar con Open-Meteo sin credenciales. FieldClimate queda opcional para clientes con estacion propia. Meteoblue tambien es opcional: al cargar `METEOBLUE_API_KEY` se habilitan `/clima/meteoblue/pronostico/:lat/:lng/:dias` y `/clima/meteoblue/comparar/:lat/:lng/:dias` para contrastar fuentes y mejorar la calidad de datos.

### LoRaWAN / EMQX

`sdc-api-lora` consume uplinks desde EMQX con el topico `application/+/device/+/rx` y persiste cada mensaje en la coleccion Mongo `lorawan_uplinks`. El payload completo se guarda en `rawPayload` para auditoria y reprocesamiento. Variables principales:

```bash
CHAMAN_SERVICE=sdc-api-lora
API_DATOS=http://${{chaman-datos.RAILWAY_PRIVATE_DOMAIN}}:${{chaman-datos.PORT}}
LORAWAN_MQTT_ENABLED=true
LORAWAN_MQTT_URL=mqtts://<emqx-host>:8883
LORAWAN_MQTT_USERNAME=<mqtt-user>
LORAWAN_MQTT_PASSWORD=<mqtt-password>
LORAWAN_MQTT_TOPICS=application/+/device/+/rx
```

Tambien puede escuchar un broker ChirpStack secundario sin reemplazar el principal. Esto permite integrar proyectos legacy como el dashboard de horas de frio de Neuquen:

```bash
LORAWAN_MQTT_SECONDARY_URL=mqtt://lora.chamanagro.ar:1883
LORAWAN_MQTT_SECONDARY_TOPICS=application/+/device/+/event/up
LORAWAN_MQTT_SECONDARY_CLIENT_ID=chaman-lorawan-legacy-frutales
```

Los uplinks MQTT se guardan crudos y, cuando tienen temperatura de aire
identificable, también generan reportes operativos y una vista previa de
Horas de Frío `0–7,2 °C`. Las Unidades Utah y las Chill Portions no se
convierten desde esa vista previa: se calculan en el motor agrometeorológico
canónico sobre la serie horaria consolidada, con cobertura y fuente informadas.

El endpoint de diagnostico del servicio es `GET /lorawan/uplinks/latest`. Si `PREFIX` esta definido, anteponer ese prefijo.

### Suelos INTA

El autocompletado de suelo consulta el WMS publico de INTA (`geo-backend.inta.gob.ar`) desde `sdc-api-cliente`. No requiere credenciales y siempre deja los campos editables en el formulario del lote.

### Datos maestros agronomicos

El script `npm run seed:agro-inputs` carga fertilizantes, principios activos y agroquimicos desde `BASE DE DATOS DE AGROQUIMICOS Y FERTILIZANTES.xlsx`. Para cargar una base remota usar:

```bash
MONGO_URI=<connection-string-mongodb> DB_NAME=chaman npm run seed:agro-inputs
```

En PowerShell:

```powershell
$env:MONGO_URI="<connection-string-mongodb>"; $env:DB_NAME="chaman"; npm run seed:agro-inputs
```

### Google Cloud

Google Cloud no se usa en esta version. No subir service accounts ni archivos `google-credentials.json`.

## Verificacion

Antes de publicar:

```bash
npm run audit:secrets
npm run build
```

En Railway, cada servicio debe responder `GET /health`. El frontend sirve `index.html` tambien en `/health`, suficiente para healthcheck de staging.
