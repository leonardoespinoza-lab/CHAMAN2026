#!/bin/sh
set -eu

cert_dir="/run/chaman-basicstation"

: "${BASIC_STATION_TLS_CERT_B64:?missing BASIC_STATION_TLS_CERT_B64}"
: "${BASIC_STATION_TLS_KEY_B64:?missing BASIC_STATION_TLS_KEY_B64}"
: "${BASIC_STATION_CA_CERT_B64:?missing BASIC_STATION_CA_CERT_B64}"

printf '%s' "$BASIC_STATION_TLS_CERT_B64" | base64 -d > "$cert_dir/server.crt"
printf '%s' "$BASIC_STATION_TLS_KEY_B64" | base64 -d > "$cert_dir/server.key"
printf '%s' "$BASIC_STATION_CA_CERT_B64" | base64 -d > "$cert_dir/ca.crt"
chmod 0600 "$cert_dir/server.key"

exec /usr/bin/chirpstack-gateway-bridge \
  -c /etc/chirpstack-gateway-bridge/chirpstack-gateway-bridge.toml
