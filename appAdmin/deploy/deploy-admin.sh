#!/usr/bin/env bash
# Build and publish the admin SPA on the server.
# Run on the host (or adjust REMOTE_* / APP_DIR for your layout).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/7-asider/appAdmin}"
NGINX_SRC="${APP_DIR}/deploy/nginx/seven-aside-admin.conf"
NGINX_DEST="${NGINX_DEST:-/etc/nginx/sites-available/seven-aside-admin.conf}"

export VITE_APP_PUBLIC_URL="${VITE_APP_PUBLIC_URL:-https://7a-side.phantommetrics.gm}"
# Keep empty so the browser calls same-origin /admin and /uploads (Nginx proxy).
unset VITE_API_URL || true

cd "$APP_DIR"

if [[ ! -f package.json ]]; then
  echo "error: $APP_DIR does not look like appAdmin (missing package.json)" >&2
  exit 1
fi

echo "==> Installing dependencies"
npm ci

echo "==> Building admin SPA (VITE_APP_PUBLIC_URL=$VITE_APP_PUBLIC_URL)"
npm run build

if [[ ! -f dist/index.html ]]; then
  echo "error: build did not produce dist/index.html" >&2
  exit 1
fi

if [[ "${SKIP_NGINX:-0}" != "1" && -f "$NGINX_SRC" ]]; then
  echo "==> Installing Nginx site config"
  sudo cp "$NGINX_SRC" "$NGINX_DEST"
  sudo ln -sf "$NGINX_DEST" /etc/nginx/sites-enabled/seven-aside-admin.conf
  sudo nginx -t
  sudo systemctl reload nginx
else
  echo "==> Skipping Nginx install (SKIP_NGINX=1 or missing config)"
fi

if id www-data &>/dev/null; then
  sudo chown -R www-data:www-data "$APP_DIR/dist"
fi

echo "==> Done. Open https://admin.7a-side.phantommetrics.gm/"
