#!/usr/bin/env bash
# Build the Expo web app and publish it with Nginx.
# The public host stays https://7a-side.phantommetrics.gm (API: https://seven-aside.phantommetrics.gm).
#
#   ./deploy/deploy-web.sh
#   INSTALL_NGINX=1 ./deploy/deploy-web.sh
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_cmd node
require_cmd npm

[[ -f "$FRONTEND_DIR/package.json" ]] || die "$FRONTEND_DIR does not look like appFrontend"
[[ -f "$FRONTEND_DIR/deploy/nginx/seven-aside-web.conf" ]] || die "missing appFrontend nginx config"

cd "$FRONTEND_DIR"

log "Installing frontend dependencies"
npm ci

log "Building Expo web export"
export EXPO_NO_TELEMETRY=1
npm run build:web

[[ -f "$FRONTEND_DIR/dist/index.html" ]] || die "build did not produce dist/index.html"
chmod -R a+rX "$FRONTEND_DIR/dist"

maybe_install_nginx_site \
  "$FRONTEND_DIR/deploy/nginx/seven-aside-web.conf" \
  "seven-aside-web.conf"

log "Web build is in $FRONTEND_DIR/dist"
log "Public URL after DNS + certificates: https://${WEB_HOST}/"
