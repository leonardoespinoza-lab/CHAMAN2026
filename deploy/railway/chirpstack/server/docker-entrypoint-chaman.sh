#!/bin/sh
set -eu

mkdir -p /run/chirpstack/certs
cp -R /etc/chirpstack/. /run/chirpstack/

if [ -n "${CHIRPSTACK_GATEWAY_CA_B64:-}" ] || [ -n "${CHIRPSTACK_GATEWAY_CA_KEY_B64:-}" ]; then
  : "${CHIRPSTACK_GATEWAY_CA_B64:?CHIRPSTACK_GATEWAY_CA_B64 is required when gateway certificates are enabled}"
  : "${CHIRPSTACK_GATEWAY_CA_KEY_B64:?CHIRPSTACK_GATEWAY_CA_KEY_B64 is required when gateway certificates are enabled}"

  umask 077
  printf '%s' "$CHIRPSTACK_GATEWAY_CA_B64" | base64 -d > /run/chirpstack/certs/ca.pem
  printf '%s' "$CHIRPSTACK_GATEWAY_CA_KEY_B64" | base64 -d > /run/chirpstack/certs/ca-key.pem
  chmod 0644 /run/chirpstack/certs/ca.pem
  chmod 0600 /run/chirpstack/certs/ca-key.pem

  cat >> /run/chirpstack/chirpstack.toml <<'EOF'

[gateway]
client_cert_lifetime="12months"
ca_cert="/run/chirpstack/certs/ca.pem"
ca_key="/run/chirpstack/certs/ca-key.pem"
EOF
fi

if [ -n "${CHIRPSTACK_ADMIN_PASSWORD:-}" ]; then
  umask 077
  printf '%s' "$CHIRPSTACK_ADMIN_PASSWORD" > /tmp/chirpstack-admin-password
  /usr/bin/chirpstack --config /run/chirpstack set-password \
    --email "${CHIRPSTACK_ADMIN_EMAIL:-admin}" \
    --password-file /tmp/chirpstack-admin-password
  rm -f /tmp/chirpstack-admin-password
  unset CHIRPSTACK_ADMIN_PASSWORD
fi

unset CHIRPSTACK_GATEWAY_CA_B64 CHIRPSTACK_GATEWAY_CA_KEY_B64

exec /usr/bin/chirpstack -c /run/chirpstack
