#!/bin/sh
set -eu

: "${REDIS_PASSWORD:?REDIS_PASSWORD is required}"

umask 077
cat > /tmp/redis.conf <<EOF
bind 0.0.0.0
protected-mode yes
port 6379
appendonly yes
appendfsync everysec
dir /data
requirepass ${REDIS_PASSWORD}
EOF

unset REDIS_PASSWORD
exec redis-server /tmp/redis.conf
