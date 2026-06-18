# CHAMAN Time-lapse Ingest

Servicio de ingreso para camaras de seguimiento visual de lotes. Recibe imagenes por FTP y tambien puede pedir capturas por Hik-Connect for Teams OpenAPI. Guarda las imagenes en almacenamiento persistente y registra la foto en `sdc-datos` para que el modulo Time-lapse del admin las muestre por lote.

## Flujo

### FTP

1. En el admin de CHAMAN, asignar a un lote el `serialCamara`.
2. Configurar la camara para subir por FTP usando ese serial como usuario.
3. La camara sube JPG, JPEG, PNG o WEBP.
4. El servicio guarda la imagen en `FTP_DATA_DIR/{serial}/{yyyy-mm-dd}/`.
5. El servicio consulta `API_DATOS /lotes` por `serialCamara`.
6. Si encuentra lote asociado, crea un registro en `API_DATOS /fotos`.
7. Si no encuentra lote, deja el archivo guardado y lo lista en `/uploads/latest` como pendiente.

### Hik-Connect for Teams

1. Hikvision entrega `serverAddress`, `appKey` y `secretKey`.
2. El servicio obtiene token con `POST /api/hccgw/platform/v1/token/get` y lo cachea hasta su vencimiento.
3. El admin puede listar camaras con `/hik-connect/cameras`.
4. Para cada lote con `serialCamara`, el servicio llama `POST /api/hccgw/resource/v1/device/capturePic`.
5. Hik-Connect devuelve un `captureUrl` temporal, valido por 15 minutos.
6. El servicio descarga la imagen enseguida, la guarda en `FTP_DATA_DIR/{serial}/{yyyy-mm-dd}/` y crea la foto en `sdc-datos`.

## Variables

| Variable | Uso |
| --- | --- |
| `CHAMAN_SERVICE=sdc-ftp` | Selecciona este servicio en Railway. |
| `PORT` | Puerto HTTP que usa Railway para `/health`, `/ftp-info` e imagenes. |
| `FTP_PORT` | Puerto interno FTP. Default `2121`. |
| `FTP_PUBLIC_HOST` | Host publico FTP. En Railway puede venir de `RAILWAY_TCP_PROXY_DOMAIN`. |
| `FTP_PUBLIC_PORT` | Puerto publico FTP. En Railway puede venir de `RAILWAY_TCP_PROXY_PORT`. |
| `FTP_PASV_URL` | Host anunciado para modo pasivo. Default: `FTP_PUBLIC_HOST`. |
| `FTP_PASV_MIN` / `FTP_PASV_MAX` | Rango pasivo. Default `30000-30010`. |
| `FTP_ALLOW_ACTIVE_BEHIND_PROXY` | Permite FTP activo cuando el control llega por proxy TCP. Usar `true` si la Hikvision no ofrece modo pasivo/SFTP y Railway entrega la conexion como `100.64.x.x`. |
| `FTP_CAMERA_PASSWORD` | Password compartido para camaras. Si esta vacio, acepta cualquier password. |
| `FTP_DATA_DIR` | Carpeta persistente. En Railway conviene montarla en un volumen. |
| `PUBLIC_BASE_URL` | URL HTTP publica del servicio, usada para guardar `foto.url`. |
| `API_DATOS` | URL interna/publica de `sdc-datos`. |
| `TIMELAPSE_ADMIN_TOKEN` | Token opcional para proteger endpoints operativos de Hik-Connect. Enviar `Authorization: Bearer <token>` o `x-timelapse-token`. |
| `HIKCONNECT_ENABLED` | Habilita la integracion Hik-Connect. Default `false`. |
| `HIKCONNECT_SERVER_URL` | Dominio base entregado por Hikvision, por ejemplo `https://...hikcentralconnect.com`. |
| `HIKCONNECT_APP_KEY` | AK/AppKey de Hik-Connect for Teams. |
| `HIKCONNECT_SECRET_KEY` | SK/AppSecret de Hik-Connect for Teams. |
| `HIKCONNECT_DEFAULT_CHANNEL` | Canal por defecto para `capturePic`. Default `1`. |
| `HIKCONNECT_CAPTURE_ON_START` | Captura todos los lotes vinculados al iniciar. Default `false`. |
| `HIKCONNECT_CAPTURE_INTERVAL_MINUTES` | Captura periodica de todos los lotes vinculados. `0` desactiva scheduler. |

## Configuracion de camara Hikvision

- Servidor FTP: host y puerto publicados por Railway TCP Proxy.
- Server Address: host publico del proxy TCP.
- Port: puerto publico del proxy TCP.
- Anonymous: activado para pruebas rapidas, con usuario/password vacios.
- Directory Structure: `Save in the root directory`.
- Picture Name: `Custom Prefix`, usando el mismo valor cargado en `serialCamara` del lote.
- Upload Picture: activado.

Algunos firmwares crean igualmente carpetas por fecha aunque el destino sea raiz. El servicio acepta ese comportamiento y crea directorios de trabajo automaticamente dentro de `_incoming`.

El boton `Test` solo prueba la conexion FTP. Para que la camara suba imagenes periodicas:

1. Ir a `Storage > Schedule Settings > Capture`.
2. Activar `Enable Timing Snapshot`.
3. Definir dias y horarios de captura, idealmente solo con luz natural.
4. Si se usa evento, ir a `Event > Linkage Method` y activar `Upload to FTP/Memory Card/NAS`.
5. Guardar y probar con una captura manual o evento real.

Si el firmware ofrece `SFTP`, conviene preferirlo en Railway porque usa una sola conexion TCP. FTP clasico usa control + datos; el modo activo de algunas Hikvision requiere `FTP_ALLOW_ACTIVE_BEHIND_PROXY=true`.

## Endpoints HTTP

- `GET /health`: healthcheck.
- `GET /ftp-info`: datos no sensibles de configuracion FTP.
- `GET /uploads/latest`: ultimas 50 imagenes recibidas.
- `GET /hik-connect/status`: estado de configuracion Hik-Connect sin exponer secretos.
- `POST /hik-connect/token/refresh`: fuerza renovacion de token. Protegido por `TIMELAPSE_ADMIN_TOKEN` si esta configurado.
- `GET /hik-connect/cameras`: lista camaras disponibles en Hik-Connect. Protegido por `TIMELAPSE_ADMIN_TOKEN` si esta configurado.
- `POST /hik-connect/capture/{serial}?channelNo=1`: captura una foto para una camara. Protegido por `TIMELAPSE_ADMIN_TOKEN` si esta configurado.
- `POST /hik-connect/capture-linked`: captura una foto para cada `serialCamara` asignado a un lote. Protegido por `TIMELAPSE_ADMIN_TOKEN` si esta configurado.
- `GET /imagenes/{serial}/{yyyy-mm-dd}/{archivo}`: imagen publica para el front.

## Nota Railway

Railway publica TCP mediante proxy. FTP clasico usa un canal de control y un canal de datos. Si la camara usa FTP activo, puede mandar `PORT/EPRT` con una IP distinta a la que ve el backend porque Railway presenta la conexion como `100.64.x.x`; para ese caso se puede activar `FTP_ALLOW_ACTIVE_BEHIND_PROXY=true`. Si la camara manda una IP privada no alcanzable, la transferencia seguira fallando y habra que usar SFTP o un destino FTP con puertos de datos publicos.
