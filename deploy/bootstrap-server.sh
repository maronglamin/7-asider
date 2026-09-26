#!/usr/bin/env bash
# One-time packages for a new Ubuntu/Debian server.
# Does not issue TLS certificates. Point DNS at this server, then run issue-certs.sh.
#
#   ./deploy/bootstrap-server.sh
#
# Optional local Postgres (only if the database is moving with the app):
   INSTALL_POSTGRES=1 ./deploy/bootstrap-server.sh
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_sudo

if ! command -v apt-get >/dev/null 2>&1; then
  die "this bootstrap targets Ubuntu/Debian (apt-get)"
fi

log "Installing nginx, certbot, and build tools"
sudo apt-get update
sudo apt-get install -y \
  nginx \
  certbot \
  python3-certbot-nginx \
  git \
  rsync \
  curl \
  ca-certificates \
  gnupg \
  build-essential \
  python3 \
  openssl \
  dnsutils \
  postgresql-client

if [[ "${INSTALL_POSTGRES:-0}" == "1" ]]; then
  log "Installing PostgreSQL server"
  sudo apt-get install -y postgresql postgresql-contrib
  sudo systemctl enable --now postgresql
fi

install_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [[ "$major" -ge 20 ]]; then
      log "Node $(node -v) already installed"
      return 0
    fi
    log "Node $(node -v) is older than 20; installing Node.js 22"
  else
    log "Installing Node.js 22"
  fi
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
}

install_node
require_cmd node
require_cmd npm

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2"
  sudo npm install -g pm2
fi

log "Preparing ACME webroot"
sudo mkdir -p /var/www/certbot
sudo chown www-data:www-data /var/www/certbot

sudo systemctl enable --now nginx

log "Registering PM2 to start on boot for $USER"
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" \
  || log "PM2 startup was not changed. If the API does not come back after reboot, run: pm2 startup"

cat <<EOF

Server packages are installed.
Repo: $APP_ROOT

Next, on this server:
  1. Copy runtime data from the current server:
       OLD_HOST=user@old-server ./deploy/pull-runtime-data.sh
     If Postgres moves too:
       WITH_DB=1 OLD_HOST=user@old-server ./deploy/pull-runtime-data.sh
       ./deploy/restore-database.sh
     Keep the same JWT_SECRET so existing sessions stay valid.
     If the database stays on the old host, point DATABASE_URL at it and
     allow this server's IP in Postgres.
  2. ./deploy/deploy-backend.sh
  3. ./deploy/deploy-web.sh
  4. Point these DNS records at this server (names stay the same):
       $API_HOST
       $WEB_HOST
  5. CERTBOT_EMAIL=you@example.com ./deploy/issue-certs.sh

Admin portal (same machine, optional):
  APP_DIR=$APP_ROOT/appAdmin ./appAdmin/deploy/deploy-admin.sh
  Then include $ADMIN_HOST in DNS and re-run issue-certs.sh with INCLUDE_ADMIN=1.
EOF
