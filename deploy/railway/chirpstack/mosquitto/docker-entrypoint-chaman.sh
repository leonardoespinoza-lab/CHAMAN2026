#!/bin/sh
set -eu

: "${MQTT_CHIRPSTACK_PASSWORD:?MQTT_CHIRPSTACK_PASSWORD is required}"
: "${MQTT_CHAMAN_PASSWORD:?MQTT_CHAMAN_PASSWORD is required}"
: "${MQTT_GATEWAY_PASSWORD:?MQTT_GATEWAY_PASSWORD is required}"
: "${MQTT_GATEWAY_USERNAME:=sg50_gateway}"

case "$MQTT_GATEWAY_USERNAME" in
  ''|*[!A-Za-z0-9_.-]*)
    echo "MQTT_GATEWAY_USERNAME contains unsupported characters" >&2
    exit 1
    ;;
esac

mkdir -p /run/mosquitto
chmod 0700 /run/mosquitto
mosquitto_passwd -b -c /run/mosquitto/passwords chirpstack "$MQTT_CHIRPSTACK_PASSWORD"
mosquitto_passwd -b /run/mosquitto/passwords chaman "$MQTT_CHAMAN_PASSWORD"
mosquitto_passwd -b /run/mosquitto/passwords "$MQTT_GATEWAY_USERNAME" "$MQTT_GATEWAY_PASSWORD"
chmod 0600 /run/mosquitto/passwords

cp /etc/chaman/mosquitto.conf /run/mosquitto/mosquitto.conf
sed "s/__MQTT_GATEWAY_USERNAME__/$MQTT_GATEWAY_USERNAME/g" \
  /etc/chaman/acl > /run/mosquitto/acl
chmod 0600 /run/mosquitto/acl

if [ -n "${MQTT_TLS_CA_B64:-}" ] || [ -n "${MQTT_TLS_CERT_B64:-}" ] || [ -n "${MQTT_TLS_KEY_B64:-}" ]; then
  : "${MQTT_TLS_CA_B64:?MQTT_TLS_CA_B64 is required when TLS is enabled}"
  : "${MQTT_TLS_CERT_B64:?MQTT_TLS_CERT_B64 is required when TLS is enabled}"
  : "${MQTT_TLS_KEY_B64:?MQTT_TLS_KEY_B64 is required when TLS is enabled}"

  printf '%s' "$MQTT_TLS_CA_B64" | base64 -d > /run/mosquitto/ca.crt
  printf '%s' "$MQTT_TLS_CERT_B64" | base64 -d > /run/mosquitto/server.crt
  printf '%s' "$MQTT_TLS_KEY_B64" | base64 -d > /run/mosquitto/server.key
  chmod 0600 /run/mosquitto/server.key

  cat >> /run/mosquitto/mosquitto.conf <<'EOF'

listener 8883 0.0.0.0
protocol mqtt
cafile /run/mosquitto/ca.crt
certfile /run/mosquitto/server.crt
keyfile /run/mosquitto/server.key
tls_version tlsv1.2
require_certificate false
EOF
fi

chown -R mosquitto:mosquitto /run/mosquitto /mosquitto/data

unset MQTT_CHIRPSTACK_PASSWORD MQTT_CHAMAN_PASSWORD MQTT_GATEWAY_PASSWORD MQTT_GATEWAY_USERNAME
unset MQTT_TLS_CA_B64 MQTT_TLS_CERT_B64 MQTT_TLS_KEY_B64

exec mosquitto -c /run/mosquitto/mosquitto.conf
