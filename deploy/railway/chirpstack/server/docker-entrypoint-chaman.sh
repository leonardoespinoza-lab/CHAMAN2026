#!/bin/sh
set -eu

if [ -n "${CHIRPSTACK_ADMIN_PASSWORD:-}" ]; then
  umask 077
  printf '%s' "$CHIRPSTACK_ADMIN_PASSWORD" > /tmp/chirpstack-admin-password
  /usr/bin/chirpstack --config /etc/chirpstack set-password \
    --email "${CHIRPSTACK_ADMIN_EMAIL:-admin}" \
    --password-file /tmp/chirpstack-admin-password
  rm -f /tmp/chirpstack-admin-password
  unset CHIRPSTACK_ADMIN_PASSWORD
fi

exec /usr/bin/chirpstack -c /etc/chirpstack
