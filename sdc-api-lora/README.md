# sdc-api-lora

Servicio NestJS de integracion LoRaWAN para CHAMAN Agro.

## Responsabilidad

- Mantener endpoints historicos de reportes ChirpStack/Sentek.
- Conectarse a un broker EMQX por MQTT.
- Suscribirse a `application/+/device/+/rx`.
- Normalizar uplinks LoRaWAN.
- Persistir cada uplink en `sdc-datos` dentro de la coleccion `lorawan_uplinks`.

## Variables principales

```bash
API_DATOS=http://127.0.0.1:5000
APIKEY_CHIRPSTACK=<api-key-webhook>

LORAWAN_MQTT_ENABLED=true
LORAWAN_MQTT_URL=mqtts://<emqx-host>:8883
LORAWAN_MQTT_USERNAME=<mqtt-user>
LORAWAN_MQTT_PASSWORD=<mqtt-password>
LORAWAN_MQTT_CLIENT_ID=chaman-lorawan-local
LORAWAN_MQTT_TOPIC=application/+/device/+/rx
LORAWAN_MQTT_QOS=0
```

Tambien acepta aliases `EMQX_MQTT_URL`, `EMQX_MQTT_USERNAME` y `EMQX_MQTT_PASSWORD`.

## Endpoint de diagnostico

```bash
GET /lorawan/uplinks/latest
```

Filtros opcionales:

- `devEUI`
- `applicationID`
- `gatewayID`
- `limit`

El servicio mantiene autenticacion por `apikey` para las rutas HTTP. El consumidor MQTT no expone credenciales en logs.

## Comandos

```bash
npm run build
npm run start:dev
npm run start:prod
```
