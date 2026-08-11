# ChirpStack v4 en Railway

Infraestructura canónica para gateways Milesight SG50. Se valida primero en
testing y se despliega una única instancia operativa en production.

## Arquitectura

- `chirpstack-postgres`: PostgreSQL con `pg_trgm` y datos persistentes.
- `chirpstack-redis`: estado temporal persistente y autenticado.
- `chirpstack-mqtt`: Mosquitto privado para ChirpStack y Chaman, mas
  un listener MQTT/mTLS publico exclusivo para gateways.
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
- El listener interno conserva usuario y clave. El listener externo usa como
  identidad el Common Name del certificado cliente, que ChirpStack fija al
  Gateway EUI. La ACL restringe cada certificado a su propio topic.

## Secretos requeridos

Los secretos se cargan solamente como variables de Railway y nunca se guardan
en Git:

- PostgreSQL: `POSTGRES_PASSWORD`.
- Redis: `REDIS_PASSWORD`.
- MQTT: `MQTT_CHIRPSTACK_PASSWORD`, `MQTT_CHAMAN_PASSWORD`,
  `MQTT_GATEWAY_USERNAME`, `MQTT_GATEWAY_PASSWORD`.
- TLS MQTT: `MQTT_TLS_CA_B64`, `MQTT_TLS_CERT_B64`, `MQTT_TLS_KEY_B64`.
- Autenticacion externa: `MQTT_TLS_CLIENT_AUTH=certificate`.
- Emision por gateway en ChirpStack: `CHIRPSTACK_GATEWAY_CA_B64` y
  `CHIRPSTACK_GATEWAY_CA_KEY_B64`. La clave de CA es un secreto critico y debe
  tener un backup cifrado fuera del repositorio.
- ChirpStack: `CHIRPSTACK_API_SECRET` y URLs privadas autenticadas.

Para la inicializacion controlada del administrador se puede definir
temporalmente `CHIRPSTACK_ADMIN_PASSWORD`; el contenedor la consume mediante
un archivo efimero, cambia la clave de `admin` y elimina el archivo antes de
iniciar el servidor. La variable debe retirarse despues de verificar el login.

## Alta segura de un SG50

1. Confirmar Gateway EUI, variante `-915M` y sub-banda AU915.
2. Crear el gateway en ChirpStack con ese EUI exacto.
3. En la ficha del gateway generar el certificado TLS. ChirpStack entrega una
   CA publica, un certificado cliente y una clave cliente diferentes para ese
   EUI. Nunca se reutiliza la clave de otro gateway.
4. Configurar el SG50 como `ChirpStack v4`, habilitar TLS en modo
   `Self signed certificates` y cargar CA (`.trust`), certificado (`.crt`) y
   clave (`.key`). No cargar la clave de CA ni la clave del servidor.
5. Verificar `Last seen`, estadisticas, uplink, join OTAA y downlink.
6. Verificar que el mismo uplink llegue a `chaman-lora` y a MongoDB production.
7. Verificar que el contador de trama avance y que no se persistan duplicados.

EMQX permanece configurado como fuente primaria hasta completar esta prueba de
campo. El nuevo ChirpStack se conecta como fuente secundaria, sin duplicar el
historico agronomico. Las mediciones se conservan en MongoDB; PostgreSQL y Redis
guardan solamente el estado operativo de LoRaWAN.

## Estado operativo de production (2026-08-04)

- PostgreSQL y Redis tienen volumen persistente y una replica saludable.
- ChirpStack, Mosquitto y `chaman-lora` tienen una replica saludable.
- El listener publico MQTT/TLS valida certificado, autenticacion, ACL y
  publicacion/suscripcion. El panel de administracion permanece privado.
- `chaman-lora` conserva EMQX como fuente primaria y consume ChirpStack como
  fuente secundaria por la red privada de Railway.
- Los despliegues `testing-chirpstack-*` estan detenidos; sus volumenes y
  configuracion se conservan para una eventual recuperacion.
- El volumen de Mosquitto en production y los backups administrados estan
  pendientes por el limite de volumenes/permisos del proyecto Railway. No se
  debe eliminar ningun volumen de testing sin una autorizacion especifica.
- La aceptacion con equipo real (OTAA, FCnt, codec, persistencia y downlink)
  sigue pendiente y no puede reemplazarse por una prueba sintetica.

## Paso a produccion

1. Crear los cuatro servicios `chirpstack-*` en el ambiente `production`.
2. Montar volumenes en PostgreSQL, Redis y Mosquitto antes del alta de campo.
3. Configurar secretos independientes y referencias por red privada.
4. Mantener privado el panel HTTP y publicar solamente el listener MQTT/TLS.
5. Crear un backup manual inicial y programar respaldo diario de PostgreSQL y
   Redis desde una cuenta Railway con permisos de backup.
6. Conectar `chaman-lora` como consumidor secundario; conservar EMQX primario.
7. Detener el stack de testing cuando production este estable; borrar sus
   volumenes solo con autorizacion especifica y backup previo cuando corresponda.

La prueba OTAA, uplink, downlink y persistencia con un equipo real es un
requisito de aceptacion de campo y no se reemplaza por mensajes MQTT sinteticos.

## Incorporar gateways adicionales

La CA y el certificado del listener son comunes a la plataforma. Para cada
Gateway EUI nuevo se repiten solamente los pasos de alta y generacion de su
certificado desde ChirpStack. No se reinicia Mosquitto, no se cambia la CA y no
se comparte una clave cliente entre equipos. Los certificados vencen a los
12 meses y deben renovarse desde la misma ficha antes de su expiracion.
