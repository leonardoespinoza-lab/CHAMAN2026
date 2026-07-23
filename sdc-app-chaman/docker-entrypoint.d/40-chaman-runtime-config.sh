#!/bin/sh
set -eu

# Genera la configuracion publica del navegador en el arranque. Solo se
# exponen URLs y el modo de cookie; ninguna credencial o secreto pertenece a
# este archivo.
escape_js_string() {
  printf '%s' "$1" | tr -d '\r\n' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

api="$(escape_js_string "${CHAMAN_WEB_API_URL:-}")"
ws="$(escape_js_string "${CHAMAN_WEB_WS_URL:-}")"
tiles="$(escape_js_string "${CHAMAN_WEB_TILES_URL:-}")"

case "${CHAMAN_COOKIE_AUTH_ENABLED:-false}" in
  true|TRUE|1|yes|YES) cookie_auth=true ;;
  *) cookie_auth=false ;;
esac

cat > /usr/share/nginx/html/runtime-config.bootstrap <<EOF
globalThis.__CHAMAN_CONFIG__ = Object.freeze({
  API: "$api",
  WS: "$ws",
  TILES_URL: "$tiles",
  COOKIE_AUTH: $cookie_auth
});
EOF

# Compatibilidad con instalaciones/PWA anteriores que todavía cargan el
# nombre histórico. Ambos archivos deben describir exactamente el mismo
# entorno y se entregan con Cache-Control no-store desde Nginx.
cp /usr/share/nginx/html/runtime-config.bootstrap \
  /usr/share/nginx/html/runtime-config.js
