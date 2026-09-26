#!/usr/bin/env bash
# Build the API, apply Prisma migrations, and restart PM2.
# Safe to re-run. Nginx config is installed only when the site is not already enabled.
#
#   ./deploy/deploy-backend.sh
#   SKIP_MIGRATIONS=1 ./deploy/deploy-backend.sh
#   INSTALL_NGINX=1 ./deploy/deploy-backend.sh
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_cmd node
require_cmd npm
require_cmd pm2

[[ -f "$BACKEND_DIR/package.json" ]] || die "$BACKEND_DIR does not look like appBackend"
load_backend_env

cd "$BACKEND_DIR"

log "Installing backend dependencies"
npm ci

log "Generating Prisma client"
npx prisma generate

if [[ "${SKIP_MIGRATIONS:-0}" == "1" ]]; then
  log "Skipping Prisma migrations (SKIP_MIGRATIONS=1)"
else
  log "Applying Prisma migrations"
  npx prisma migrate deploy
fi

log "Building backend"
npm run build
[[ -f dist/index.js ]] || die "build did not produce dist/index.js"

mkdir -p "$BACKEND_DIR/uploads"
chmod 755 "$BACKEND_DIR/uploads"

API_CONF="$DEPLOY_DIR/nginx/seven-aside-api.conf"
if [[ -f "$BACKEND_DIR/deploy/nginx/seven-aside-api.conf" ]]; then
  API_CONF="$BACKEND_DIR/deploy/nginx/seven-aside-api.conf"
fi
maybe_install_nginx_site "$API_CONF" "seven-aside-api.conf"

log "Restarting $PM2_APP"
pm2 startOrReload "$DEPLOY_DIR/ecosystem.config.cjs" --update-env
pm2 save

log "Waiting for local health check"
ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://${API_UPSTREAM}/health" >/dev/null; then
    ok=1
    break
  fi
  sleep 1
done
[[ "$ok" == "1" ]] || die "backend did not answer http://${API_UPSTREAM}/health — check: pm2 logs $PM2_APP"

curl -fsS "http://${API_UPSTREAM}/health"
printf '\n'
log "Backend is up on http://${API_UPSTREAM}"
log "Public URL after DNS + certificates: https://${API_HOST}/health"
