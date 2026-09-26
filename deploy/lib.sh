#!/usr/bin/env bash
# Shared settings for moving 7a-side onto a new server.
# Hostnames do not change. Point the existing DNS records at the new server
# before running issue-certs.sh.

if [[ -z "${DEPLOY_LIB_LOADED:-}" ]]; then
  DEPLOY_LIB_LOADED=1

  set -euo pipefail

  DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  APP_ROOT="${APP_ROOT:-$(cd "$DEPLOY_DIR/.." && pwd)}"
  BACKEND_DIR="${BACKEND_DIR:-$APP_ROOT/appBackend}"
  FRONTEND_DIR="${FRONTEND_DIR:-$APP_ROOT/appFrontend}"

  API_HOST="${API_HOST:-seven-aside.phantommetrics.gm}"
  WEB_HOST="${WEB_HOST:-7a-side.phantommetrics.gm}"
  ADMIN_HOST="${ADMIN_HOST:-admin.7a-side.phantommetrics.gm}"

  API_UPSTREAM="${API_UPSTREAM:-127.0.0.1:4000}"
  PM2_APP="${PM2_APP:-7-aside-backend}"

  NGINX_AVAILABLE="${NGINX_AVAILABLE:-/etc/nginx/sites-available}"
  NGINX_ENABLED="${NGINX_ENABLED:-/etc/nginx/sites-enabled}"
fi

log() {
  printf '==> %s\n' "$*"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

require_sudo() {
  if [[ "${EUID}" -eq 0 ]]; then
    die "run as the deploy user (with sudo), not as root, so PM2 and file ownership stay on that user"
  fi
  sudo -n true 2>/dev/null || sudo -v || die "sudo is required"
}

nginx_site_enabled() {
  [[ -e "$NGINX_ENABLED/$1" ]]
}

install_nginx_site() {
  local src="$1"
  local name="$2"
  local dest="$NGINX_AVAILABLE/$name"

  [[ -f "$src" ]] || die "nginx config not found: $src"
  require_sudo

  log "Installing nginx site $name"
  sudo cp "$src" "$dest"
  if [[ "$APP_ROOT" != "/var/www/7-aside" ]]; then
    sudo sed -i "s#/var/www/7-aside#${APP_ROOT}#g" "$dest"
  fi
  sudo ln -sf "$dest" "$NGINX_ENABLED/$name"
  sudo rm -f "$NGINX_ENABLED/default"
  sudo nginx -t
  sudo systemctl reload nginx
}

maybe_install_nginx_site() {
  local src="$1"
  local name="$2"
  local mode="${INSTALL_NGINX:-auto}"

  if [[ "$mode" == "0" || "$mode" == "skip" ]]; then
    log "Skipping nginx install for $name (INSTALL_NGINX=$mode)"
    return 0
  fi

  if [[ "$mode" == "auto" ]] && nginx_site_enabled "$name"; then
    log "Nginx site $name already enabled; leaving Certbot edits in place (INSTALL_NGINX=1 to replace)"
    return 0
  fi

  install_nginx_site "$src" "$name"
}

load_backend_env() {
  local env_file="$BACKEND_DIR/.env"
  [[ -f "$env_file" ]] || die "missing $env_file — copy it from the current server (deploy/pull-runtime-data.sh) before starting the API"
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
  [[ -n "${JWT_SECRET:-}" ]] || die "JWT_SECRET is empty in $env_file"
  [[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is empty in $env_file"
}

server_ipv4() {
  curl -4 -fsS --max-time 10 https://ifconfig.me 2>/dev/null || true
}

dns_ipv4() {
  local host="$1"
  if command -v dig >/dev/null 2>&1; then
    dig +short A "$host" | head -n 1
    return 0
  fi
  getent ahostsv4 "$host" 2>/dev/null | awk '{print $1; exit}'
}
