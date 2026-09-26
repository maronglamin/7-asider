#!/usr/bin/env bash
# Restore a pg_dump custom-format file into local Postgres.
# Reads connection details from appBackend/.env. Refuses non-local DATABASE_URL hosts.
#
#   INSTALL_POSTGRES=1 ./deploy/bootstrap-server.sh
#   # edit DATABASE_URL so the host is localhost and the password is the new local role
#   ./deploy/restore-database.sh deploy/backups/sevenaside.dump
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

DUMP_PATH="${1:-$APP_ROOT/deploy/backups/sevenaside.dump}"
[[ -f "$DUMP_PATH" ]] || die "dump not found: $DUMP_PATH"
require_cmd node
load_backend_env
require_sudo
command -v pg_restore >/dev/null 2>&1 || die "pg_restore not found. Install postgresql-client or set INSTALL_POSTGRES=1 on bootstrap."

sql_file="$(mktemp)"
dump_copy="$(mktemp)"
cleanup() {
  rm -f "$sql_file"
  sudo rm -f "$dump_copy"
}
trap cleanup EXIT

node > "$sql_file" <<'NODE'
const u = new URL(process.env.DATABASE_URL);
const host = u.hostname;
const user = decodeURIComponent(u.username);
const password = decodeURIComponent(u.password);
const db = decodeURIComponent(u.pathname.replace(/^\//, '').split('?')[0]);

if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error(`DATABASE_URL host is ${host}. Point it at localhost before restoring.`);
  process.exit(1);
}
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(user) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(db)) {
  console.error('DATABASE_URL user or database name has unsupported characters');
  process.exit(1);
}

const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;
process.stdout.write(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${user}') THEN
    CREATE ROLE ${user} LOGIN PASSWORD ${lit(password)};
  ELSE
    ALTER ROLE ${user} WITH LOGIN PASSWORD ${lit(password)};
  END IF;
END
$$;
SELECT format('CREATE DATABASE ${db} OWNER ${user}')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db}')\\gexec
GRANT ALL PRIVILEGES ON DATABASE ${db} TO ${user};
\\connect ${db}
GRANT ALL ON SCHEMA public TO ${user};
ALTER SCHEMA public OWNER TO ${user};
`);
NODE

log "Ensuring local role and database from DATABASE_URL"
sudo -u postgres psql -v ON_ERROR_STOP=1 -f "$sql_file"

db_name="$(node -e 'const u = new URL(process.env.DATABASE_URL); process.stdout.write(decodeURIComponent(u.pathname.replace(/^\//, "").split("?")[0]))')"
db_user="$(node -e 'const u = new URL(process.env.DATABASE_URL); process.stdout.write(decodeURIComponent(u.username))')"

log "Restoring $DUMP_PATH"
sudo cp "$DUMP_PATH" "$dump_copy"
sudo chown postgres:postgres "$dump_copy"
sudo chmod 600 "$dump_copy"

set +e
sudo -u postgres pg_restore \
  --no-owner \
  --no-acl \
  --role="$db_user" \
  --dbname="$db_name" \
  "$dump_copy"
status=$?
set -e
if [[ "$status" -gt 1 ]]; then
  die "pg_restore failed with exit $status"
fi
if [[ "$status" -eq 1 ]]; then
  log "pg_restore finished with warnings (exit 1). Check the log above before continuing."
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$db_name" <<SQL
GRANT ALL ON SCHEMA public TO ${db_user};
GRANT ALL ON ALL TABLES IN SCHEMA public TO ${db_user};
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${db_user};
SQL

log "Database $db_name restored. Next: ./deploy/deploy-backend.sh"
