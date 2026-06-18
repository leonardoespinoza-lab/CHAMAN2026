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
| `FTP_CAMERA_PASSWORD` | Password compartido para camaras. Si esta vacio, acepta cualquier password. |
| `FTP_DATA_DIR` | Carpeta persistente. En Railway conviene montarla en un volumen. |
| `PUBLIC_BASE_URL` | URL HTTP publica del servicio, usada para guardar `foto.url`. |
| `API_DATOS` | URL interna/publica de `sdc-datos`. |

## Configuracion de camara

- Servidor FTP: host y puerto publicados por Railway TCP Proxy.
- Usuario: numero de serie de la camara, igual al `serialCamara` cargado en el lote.
- Password: valor de `FTP_CAMERA_PASSWORD`.
- Modo: probar primero pasivo. Si la camara permite activo y Railway no resuelve pasivo, usar activo.
- Carpeta remota: `/`.
- Nombre de archivo: libre; CHAMAN lo guarda con timestamp para no pisar imagenes.

## Endpoints HTTP

- `GET /health`: healthcheck.
- `GET /ftp-info`: datos no sensibles de configuracion FTP.
- `GET /uploads/latest`: ultimas 50 imagenes recibidas.
- `GET /imagenes/{serial}/{yyyy-mm-dd}/{archivo}`: imagen publica para el front.

## Nota Railway

Railway publica TCP mediante proxy. FTP clasico usa un canal de control y canales de datos pasivos, por eso debe probarse con la camara real. Si la camara exige FTP pasivo con rango fijo y Railway no permite mapearlo de forma compatible, este mismo servicio queda listo para desplegarse en una VM pequena con IP fija y rango de puertos.
