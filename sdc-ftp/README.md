# CHAMAN Time-lapse FTP

Servicio de ingreso para camaras de seguimiento visual de lotes. Recibe imagenes por FTP, las guarda en almacenamiento persistente y registra la foto en `sdc-datos` para que el modulo Time-lapse del admin las muestre por lote.

## Flujo

1. En el admin de CHAMAN, asignar a un lote el `serialCamara`.
2. Configurar la camara para subir por FTP usando ese serial como usuario.
3. La camara sube JPG, JPEG, PNG o WEBP.
4. El servicio guarda la imagen en `FTP_DATA_DIR/{serial}/{yyyy-mm-dd}/`.
5. El servicio consulta `API_DATOS /lotes` por `serialCamara`.
6. Si encuentra lote asociado, crea un registro en `API_DATOS /fotos`.
7. Si no encuentra lote, deja el archivo guardado y lo lista en `/uploads/latest` como pendiente.

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

## Configuracion de camara Hikvision

- Servidor FTP: host y puerto publicados por Railway TCP Proxy.
- Server Address: host publico del proxy TCP.
- Port: puerto publico del proxy TCP.
- Anonymous: activado para pruebas rapidas, con usuario/password vacios.
- Directory Structure: `Save in the root directory`.
- Picture Name: `Custom Prefix`, usando el mismo valor cargado en `serialCamara` del lote.
- Upload Picture: activado.

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
- `GET /imagenes/{serial}/{yyyy-mm-dd}/{archivo}`: imagen publica para el front.

## Nota Railway

Railway publica TCP mediante proxy. FTP clasico usa un canal de control y un canal de datos. Si la camara usa FTP activo, puede mandar `PORT/EPRT` con una IP distinta a la que ve el backend porque Railway presenta la conexion como `100.64.x.x`; para ese caso se puede activar `FTP_ALLOW_ACTIVE_BEHIND_PROXY=true`. Si la camara manda una IP privada no alcanzable, la transferencia seguira fallando y habra que usar SFTP o un destino FTP con puertos de datos publicos.
