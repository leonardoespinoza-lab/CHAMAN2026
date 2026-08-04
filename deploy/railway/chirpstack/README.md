# ChirpStack v4 en Railway

Infraestructura canónica para gateways Milesight SG50. Se valida primero en
testing y se despliega una única instancia operativa en production.

## Arquitectura

- `chirpstack-postgres`: PostgreSQL con `pg_trgm` y datos persistentes.
- `chirpstack-redis`: estado temporal persistente y autenticado.
- `chirpstack-mqtt`: Mosquitto privado para ChirpStack y Chaman, mas
  un listener MQTT/TLS publico exclusivo para gateways.
- `chirpstack-ns`: ChirpStack 4.19.0, panel web y API.

El SG50 se configura como **ChirpStack v4 MQTT Forwarder**. Railway no publica
UDP, por lo que no se utiliza Semtech UDP. El plan regional inicial es AU915,
sub-banda 2 (`channels 8-15 + 65`), que coincide con el plan AU915 publicado
por Milesight para el SG50. Antes de incorporar un gateway se debe confirmar
que su radio LoRa sea `-915M` y que conserve ese mismo plan de canales.

## Jerarquia de fuentes

```text
SG50 -> MQTT/TLS -> Mosquitto -> ChirpStack
                              -> chaman-lora -> MongoDB production
```

Mosquitto no permite acceso anonimo. Los tres perfiles usan credenciales
independientes y ACL diferentes:

- `chirpstack`: backend de red e integracion de aplicaciones.
- `chaman`: solo lectura de eventos `application/.../event/up`.
- `MQTT_GATEWAY_USERNAME`: usuario de alta controlada, solo con trafico bajo
  `au915_0/gateway/...`. Su valor por defecto es `sg50_gateway` y debe
  reemplazarse por una identidad especifica cuando se conozca el Gateway EUI.

## Secretos requeridos

Los secretos se cargan solamente como variables de Railway y nunca se guardan
en Git:

- PostgreSQL: `POSTGRES_PASSWORD`.
- Redis: `REDIS_PASSWORD`.
- MQTT: `MQTT_CHIRPSTACK_PASSWORD`, `MQTT_CHAMAN_PASSWORD`,
  `MQTT_GATEWAY_USERNAME`, `MQTT_GATEWAY_PASSWORD`.
- TLS MQTT: `MQTT_TLS_CA_B64`, `MQTT_TLS_CERT_B64`, `MQTT_TLS_KEY_B64`.
- ChirpStack: `CHIRPSTACK_API_SECRET` y URLs privadas autenticadas.

Para la inicializacion controlada del administrador se puede definir
temporalmente `CHIRPSTACK_ADMIN_PASSWORD`; el contenedor la consume mediante
un archivo efimero, cambia la clave de `admin` y elimina el archivo antes de
iniciar el servidor. La variable debe retirarse despues de verificar el login.

## Alta segura de un SG50

1. Confirmar Gateway EUI, variante `-915M` y sub-banda AU915.
2. Crear el gateway en ChirpStack con ese EUI exacto.
3. Configurar en el SG50 el modo `ChirpStack v4` y MQTT/TLS.
4. Cargar la CA privada del listener MQTT y la credencial de gateway.
5. Verificar `Last seen`, estadisticas, uplink, join OTAA y downlink.
6. Verificar que el mismo uplink llegue a `chaman-lora` y a MongoDB production.
7. Verificar que el contador de trama avance y que no se persistan duplicados.

EMQX permanece configurado como fuente primaria hasta completar esta prueba de
campo. El nuevo ChirpStack se conecta como fuente secundaria, sin duplicar el
historico agronomico. Las mediciones se conservan en MongoDB; PostgreSQL y Redis
guardan solamente el estado operativo de LoRaWAN.

## Paso a produccion

1. Crear los cuatro servicios `chirpstack-*` en el ambiente `production`.
2. Montar volumenes en PostgreSQL, Redis y Mosquitto.
3. Configurar secretos independientes y referencias por red privada.
4. Publicar solamente el panel HTTP y el listener MQTT/TLS.
5. Crear un backup manual inicial y programar respaldo diario de PostgreSQL.
6. Conectar `chaman-lora` como consumidor secundario; conservar EMQX primario.
7. Retirar el stack de testing cuando production este estable.

La prueba OTAA, uplink, downlink y persistencia con un equipo real es un
requisito de aceptacion de campo y no se reemplaza por mensajes MQTT sinteticos.
