#!/usr/bin/env bash
# Issue Let's Encrypt certificates after DNS for the existing hostnames points here.
#
#   CERTBOT_EMAIL=you@example.com ./deploy/issue-certs.sh
#   INCLUDE_ADMIN=1 CERTBOT_EMAIL=you@example.com ./deploy/issue-certs.sh
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_sudo
require_cmd certbot

: "${CERTBOT_EMAIL:?Set CERTBOT_EMAIL to a real address for renewal notices}"

hosts=("$API_HOST" "$WEB_HOST")
if [[ "${INCLUDE_ADMIN:-0}" == "1" ]]; then
  hosts+=("$ADMIN_HOST")
fi

if [[ "${SKIP_DNS_CHECK:-0}" != "1" ]]; then
  my_ip="$(server_ipv4)"
  [[ -n "$my_ip" ]] || die "could not detect this server's public IPv4 (set SKIP_DNS_CHECK=1 to skip)"
  for host in "${hosts[@]}"; do
    resolved="$(dns_ipv4 "$host" || true)"
    if [[ "$resolved" != "$my_ip" ]]; then
      die "$host resolves to '${resolved:-<none>}', this server is $my_ip. Update the DNS A record, wait for it to propagate, then re-run."
    fi
    log "$host -> $resolved"
  done
fi

sudo mkdir -p /var/www/certbot

for host in "${hosts[@]}"; do
  log "Requesting certificate for $host"
  sudo certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email "$CERTBOT_EMAIL" \
    --redirect \
    -d "$host"
done

log "Renewal dry run"
sudo certbot renew --dry-run

log "Checking public health"
printf 'web %s\n' "$(curl -fsS -o /dev/null -w '%{http_code}' "https://${WEB_HOST}/")"
curl -fsS "https://${API_HOST}/health"
printf '\n'
if [[ "${INCLUDE_ADMIN:-0}" == "1" ]]; then
  printf 'admin %s\n' "$(curl -fsS -o /dev/null -w '%{http_code}' "https://${ADMIN_HOST}/")"
fi
