#!/usr/bin/env bash
# Copy secrets and uploads from the server you are leaving.
# Run this on the NEW server. DNS can still point at the old server.
#
#   OLD_HOST=user@old-server ./deploy/pull-runtime-data.sh
#
# Also dump Postgres (custom format) when the database is moving:
#   WITH_DB=1 OLD_HOST=user@old-server ./deploy/pull-runtime-data.sh
#   ./deploy/restore-database.sh
#
# Old app directory if it is not /var/www/7-aside (the live tree is sometimes /var/www/7-asider):
#   OLD_APP_ROOT=/var/www/7-asider OLD_HOST=user@old-server ./deploy/pull-runtime-data.sh
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

: "${OLD_HOST:?Set OLD_HOST=user@old-server}"
require_cmd rsync
require_cmd ssh

resolve_old_root() {
  local candidate
  if [[ -n "${OLD_APP_ROOT:-}" ]]; then
    ssh "$OLD_HOST" "test -d '$OLD_APP_ROOT/appBackend'" \
      || die "OLD_APP_ROOT=$OLD_APP_ROOT has no appBackend on $OLD_HOST"
    printf '%s\n' "$OLD_APP_ROOT"
    return 0
  fi
  for candidate in /var/www/7-aside /var/www/7-asider; do
    if ssh "$OLD_HOST" "test -d '$candidate/appBackend'"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  die "could not find appBackend on $OLD_HOST under /var/www/7-aside or /var/www/7-asider"
}

OLD_APP_ROOT="$(resolve_old_root)"
log "Old app root: $OLD_HOST:$OLD_APP_ROOT"

mkdir -p "$BACKEND_DIR"
ENV_DEST="$BACKEND_DIR/.env"
if [[ -f "$ENV_DEST" && "${FORCE:-0}" != "1" ]]; then
  die "$ENV_DEST already exists. Set FORCE=1 to overwrite it from the old server."
fi

log "Copying backend .env"
rsync -a "${OLD_HOST}:${OLD_APP_ROOT}/appBackend/.env" "$ENV_DEST"
chmod 600 "$ENV_DEST"

log "Copying uploads"
mkdir -p "$BACKEND_DIR/uploads"
rsync -a "${OLD_HOST}:${OLD_APP_ROOT}/appBackend/uploads/" "$BACKEND_DIR/uploads/"

if [[ "${WITH_DB:-0}" == "1" ]]; then
  DUMP_DIR="${DUMP_DIR:-$APP_ROOT/deploy/backups}"
  mkdir -p "$DUMP_DIR"
  DUMP_PATH="$DUMP_DIR/sevenaside.dump"
  log "Dumping database on the old server into $DUMP_PATH"
  if ! ssh "$OLD_HOST" "bash -s" -- "$OLD_APP_ROOT" <<'REMOTE' > "$DUMP_PATH"
set -euo pipefail
old_root="$1"
set -a
# shellcheck disable=SC1090
source "$old_root/appBackend/.env"
set +a
: "${DATABASE_URL:?DATABASE_URL missing on old server}"
command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is not installed on the old server" >&2; exit 1; }
exec pg_dump -Fc --no-owner --no-acl "$DATABASE_URL"
REMOTE
  then
    rm -f "$DUMP_PATH"
    die "database dump failed"
  fi
  chmod 600 "$DUMP_PATH"
  log "Dump written. If DATABASE_URL in $ENV_DEST is not localhost, point it at localhost (same user, password, and database name), then run:"
  log "  ./deploy/restore-database.sh $DUMP_PATH"
else
  log "Database was not copied. Either keep DATABASE_URL pointed at the old Postgres host, or re-run with WITH_DB=1."
fi

log "Runtime files are in $BACKEND_DIR"
log "Keep JWT_SECRET unchanged if existing mobile sessions should keep working."
