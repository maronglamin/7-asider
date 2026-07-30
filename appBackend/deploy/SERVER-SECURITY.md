# Live server security guide — 7a-side

Use this after any suspected incident or when hardening production.

## Is the server compromised?

**Your UFW output looks like normal Fail2Ban behavior**, not proof of compromise:

| Signal | Usually means |
|--------|----------------|
| `REJECT IN` from random AWS/Azure IPs with `# by Fail2Ban after 10 attempts against nginx-404` | Internet bots probing for WordPress, `.env`, etc. — **expected** |
| Rules `[ 8] Nginx Full ALLOW` + `[ 9] 22/tcp ALLOW` | Normal baseline |

**Investigate further if you see any of:**

- **`Accepted password for root`** from an IP you do not recognize (see [Block a hostile IP](#block-a-hostile-ip) below)
- New users in `/root/.ssh/authorized_keys` or `/home/*/.ssh/authorized_keys` you did not add
- Unknown cron jobs: `sudo crontab -l -u root` and `/etc/cron.d/*`
- Unexpected processes: `ps aux | rg -i 'miner|xmr|kinsing|\.sh'`
- Successful SSH logins from unknown countries: `sudo grep 'Accepted' /var/log/auth.log | tail -50`
- Backend `.env` or nginx configs modified outside your deploy window
- New systemd units you did not create: `systemctl list-units --type=service --state=running`

---

## Block a hostile IP

Use when auth logs show a login you did not perform, e.g.:

```text
sshd[...]: Accepted password for root from 154.53.192.7 port 19504 ssh2
```

**Before blocking:** confirm the IP is not yours (check from another device: `curl -s ifconfig.me`). The same IP may appear in nginx logs if it was your phone/browser.

### 1. Block immediately (UFW)

```bash
sudo ufw deny from 154.53.192.7 comment 'Unauthorized root SSH 2026-07-29'
sudo ufw status numbered
```

To remove later: `sudo ufw delete allow|deny ...` using the rule number from `status numbered`.

### 2. Ban in Fail2Ban (optional, adds jail metadata)

```bash
sudo fail2ban-client set sshd banip 154.53.192.7
sudo fail2ban-client status sshd
```

### 3. Stop root password logins (do this even after blocking one IP)

Ensure you have **SSH key access** from a trusted machine before disabling passwords, or you may lock yourself out.

```bash
# Review who has keys
sudo cat /root/.ssh/authorized_keys

# Harden sshd
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%F)
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sshd -t && sudo systemctl reload sshd
```

`prohibit-password` = root may only log in with an SSH key, not a password.

### 4. Rotate root credentials and audit

```bash
sudo passwd root
sudo grep '154.53.192.7' /var/log/auth.log
sudo last -20
sudo crontab -l
ls -la /root/.ssh/
```

If anything looks wrong after that login, rotate `JWT_SECRET`, database password, and API keys (see [Rotate credentials](#7-database-and-logs) below).

---

### 1. Confirm Fail2Ban is doing its job (not blocking real users)

```bash
sudo fail2ban-client status nginx-404
sudo fail2ban-client status sshd
```

If **your office IP** is banned, unban it:

```bash
sudo fail2ban-client set nginx-404 unbanip YOUR.IP.HERE
```

### 2. Lock down SSH

```bash
# Prefer key-only auth; disable password login in /etc/ssh/sshd_config:
#   PasswordAuthentication no
#   PermitRootLogin prohibit-password
sudo systemctl reload sshd
```

Restrict SSH to your IP in UFW if you have a static IP:

```bash
sudo ufw delete allow 22/tcp
sudo ufw allow from YOUR.OFFICE.IP to any port 22 proto tcp
```

Port **2222** is also open in your rules — close it if unused:

```bash
sudo ufw delete allow 2222/tcp
```

### 3. Verify secrets are set (backend)

```bash
cd /var/www/7-aside/appBackend   # adjust path
grep -E '^JWT_SECRET=|^DATABASE_URL=|^INTERNAL_PARTNER_WEBHOOK_SECRET=' .env
```

Generate a strong JWT secret if missing:

```bash
openssl rand -base64 48
```

Set in `.env`, then restart the backend (PM2/systemd).

### 4. Deploy latest backend security patches

After pulling code with security fixes:

```bash
cd /var/www/7-aside/appBackend
npm ci          # do NOT use --omit=dev before build
npm run build
pm2 restart all   # or your process manager
```

`typescript` and `@types/*` are in **dependencies** so production `npm ci` still compiles. If you previously ran `npm ci --omit=dev`, run plain `npm ci` once to restore type packages.

Required env vars (see `.env.example`):

- `JWT_SECRET` — strong random, **never** leave default
- `JWT_EXPIRES_IN=7d`
- `CORS_ORIGINS=https://7a-side.phantommetrics.gm`
- `GOOGLE_CLIENT_IDS=...`
- `INTERNAL_PARTNER_WEBHOOK_SECRET=...`

### 5. Nginx hardening

Add to **both** API and frontend nginx `server` blocks (inside `location /` or at server level):

```nginx
client_max_body_size 10m;

add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

Rate-limit auth endpoints at nginx (in `/etc/nginx/nginx.conf` http block):

```nginx
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/m;

# In seven-aside-api server block:
location /auth/ {
    limit_req zone=auth_limit burst=20 nodelay;
    proxy_pass http://127.0.0.1:4000;
    # ... existing proxy headers ...
}
```

Reload: `sudo nginx -t && sudo systemctl reload nginx`

### 6. Fail2Ban jails (recommended)

Create `/etc/fail2ban/jail.d/7aside.local`:

```ini
[nginx-auth-401]
enabled = true
port = http,https
filter = nginx-auth-401
logpath = /var/log/nginx/access.log
maxretry = 15
findtime = 600
bantime = 3600
```

Create `/etc/fail2ban/filter.d/nginx-auth-401.conf`:

```ini
[Definition]
failregex = ^<HOST> -.*"POST /auth/(login-email|register-email|forgot-password|google).*HTTP.*" 401
ignoreregex =
```

```bash
sudo systemctl reload fail2ban
```

### 7. Database and logs

```bash
cd /var/www/7-aside/appBackend
npx ts-node src/scripts/diagnoseAuth.ts
```

Rotate credentials if you suspect leak:

- Postgres password (`DATABASE_URL`)
- `JWT_SECRET` (invalidates all sessions — users must re-login)
- `INTERNAL_PARTNER_WEBHOOK_SECRET` (coordinate with Easypay)
- `RESEND_API_KEY`
- Google OAuth client secret (if any server-side)

### 8. Keep system updated

```bash
sudo apt update && sudo apt upgrade -y
sudo unattended-upgrade --dry-run   # if unattended-upgrades enabled
```

---

## What the codebase fixes address

| Issue | Fix |
|-------|-----|
| Any user could read any owner's bank/wallet numbers | `/payouts/owner/:id` restricted to owner only |
| Default JWT secret in production | Server refuses to start without `JWT_SECRET` in production |
| Passwords logged on every POST | Production logs method/path/status only; dev redacts sensitive fields |
| No brute-force protection | `express-rate-limit` on `/auth/*` |
| Wildcard CORS | Allowlist via `CORS_ORIGINS` |
| Google token not audience-checked | `google-auth-library` + `GOOGLE_CLIENT_IDS` |
| Apple clientId trusted from client | Optional `APPLE_CLIENT_IDS` allowlist |
| Unrestricted file uploads | 5 MB limit, extension allowlist |
| Payment receipts publicly served | Only `/uploads/fields` is public static |
| Blocked users keep API access | `requireAuth` checks user status |
| Webhook marks PAID without checks | Skips if already PAID; validates amount when present |

---

## Ongoing monitoring

- Watch nginx 401/403 spikes: `sudo tail -f /var/log/nginx/access.log | rg 'POST /auth'`
- PM2/backend errors: `pm2 logs --lines 100`
- Fail2Ban bans: `sudo fail2ban-client status`
- Cert expiry: `sudo certbot certificates`

---

## Troubleshooting

### PM2: `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` → login/API returns 500

Nginx sends `X-Forwarded-For` but Express did not trust the proxy, so `express-rate-limit` threw on every `/auth/*` request.

**Fix:** deploy backend with `app.set('trust proxy', 1)` (in `src/index.ts`), then:

```bash
cd /var/www/7-asider/appBackend   # or your path
git pull && npm ci && npm run build
pm2 restart 7-aside-backend
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://seven-aside.phantommetrics.gm/auth/login-email \
  -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"x"}'
```

Expect **401** (invalid credentials), not **500**.

### Nginx 500 on `/auth/*` only

If `seven-aside-api.conf` uses `limit_req zone=7aside_auth` without defining the zone in `/etc/nginx/nginx.conf` `http { }`, nginx returns 500.

Either comment out `limit_req` in the site config, or add:

```nginx
limit_req_zone $binary_remote_addr zone=7aside_auth:10m rate=10r/m;
```

Then `sudo nginx -t && sudo systemctl reload nginx`.

### Scanner noise in logs (`GET /.env`, `GET /`)

Bots probing public servers — **harmless if they get 404**. Fail2Ban `nginx-404` jail handles this. They do not mean the backend is down unless you also see 500s on real routes (`/auth/login-email`, `/health`).

```bash
curl -s https://seven-aside.phantommetrics.gm/health
# expect: {"ok":true,...}
```

### Frontend `7a-side.phantommetrics.gm` returns nginx 500 (all pages)

The **API can be fine** while the **web app** is broken — they use different nginx `server` blocks on the same host.

```bash
curl -s -o /dev/null -w "api:%{http_code}\n" https://seven-aside.phantommetrics.gm/health
curl -s -o /dev/null -w "web:%{http_code}\n" https://7a-side.phantommetrics.gm/
sudo nginx -t
sudo tail -30 /var/log/nginx/error.log
```

#### `rewrite or internal redirection cycle ... /index.html`

This is **not an attack** — any `GET /` triggers it when the frontend build is missing or nginx `root` is wrong.

Nginx runs `try_files ... /index.html`, cannot find `index.html`, redirects internally to `/index.html` again, and loops until 500.

**Fix:**

```bash
ls -la /var/www/7-aside/appFrontend/dist/index.html
# If "No such file":
cd /var/www/7-aside/appFrontend
git pull
npm ci
npm run build:web
sudo chown -R www-data:www-data dist
sudo nginx -t && sudo systemctl reload nginx
curl -s -o /dev/null -w "web:%{http_code}\n" https://7a-side.phantommetrics.gm/
```

Update the web site config to the safer SPA fallback in `appFrontend/deploy/nginx/seven-aside-web.conf` (`@spa_fallback`) so a missing build returns **404** instead of a redirect loop.

Other common fixes:

1. **`limit_req zone=...` without a zone** in `/etc/nginx/nginx.conf` → comment out `limit_req` in the **web** site config, then `sudo nginx -t && sudo systemctl reload nginx`.
2. **Missing build** — `ls /var/www/7-aside/appFrontend/dist/index.html`; if missing: `cd /var/www/7-aside/appFrontend && npm run build:web`.
3. **Broken SSL block** after certbot — `sudo certbot certificates`; renew or re-run `sudo certbot --nginx -d 7a-side.phantommetrics.gm`.

Expect: `api:200` and `web:200` (or `web:304`).

### directPay `ECONNREFUSED 64.227.124.216:443` from 7-aside backend

The backend on **165.22.77.92** cannot open TCP to **dpay.phantommetrics.gm** (64.227.124.216). Your laptop may still reach directPay — test **from the 7-aside server**:

```bash
cd /var/www/7-aside/appBackend
npm run diagnose:easypay-connectivity
# or manually:
curl -4 -v --connect-timeout 10 https://dpay.phantommetrics.gm/health
nc -zv 64.227.124.216 443
```

| `curl` from 7-aside server | Cause |
|----------------------------|--------|
| Works | Wrong `EASYPAY_API_BASE_URL` in PM2 env — run `pm2 restart 7-aside-backend --update-env` |
| `Connection refused` | directPay not listening on :443, or firewall blocks **165.22.77.92** |

**On directPay droplet (64.227.124.216):**

```bash
sudo ss -lntp | rg ':443'
sudo ufw status verbose
curl -s http://127.0.0.1:4000/health   # or whatever port the directPay API uses
```

Allow the 7-aside server IP:

```bash
sudo ufw allow from 165.22.77.92 to any port 443 proto tcp comment '7-aside backend'
sudo ufw reload
```

**DigitalOcean cloud firewall** (Networking → Firewalls on the directPay droplet): add inbound rule **HTTPS 443** from source `165.22.77.92` (or from all IPv4 if you accept public API).

**On 7-aside** confirm `.env`:

```bash
EASYPAY_API_BASE_URL=https://dpay.phantommetrics.gm
```

Not `http://localhost`, not `http://64.227.124.216:4000` unless nginx proxies that port on 443.

After any `.env` change: `pm2 restart 7-aside-backend --update-env`

### Webhook `digest_mismatch` (body arrives, signature wrong)

Webhooks are reaching 7-aside (`bodyBytes` > 0) but `INTERNAL_PARTNER_WEBHOOK_SECRET` does **not** match what directPay used to sign.

**Regenerate and sync (both servers must use the identical new value):**

```bash
# On your dev machine or either server:
cd appBackend && npm run generate:webhook-secret
# Or: openssl rand -hex 32
```

1. **directPay** `backend/.env` — set `INTERNAL_PARTNER_WEBHOOK_SECRET=<new value>` (not `INTERNAL_PARTNER_API_SECRET`).
2. **7-aside** `appBackend/.env` — same `INTERNAL_PARTNER_WEBHOOK_SECRET=<new value>`.
3. Confirm directPay webhook URL: `INTERNAL_PARTNER_WEBHOOK_URL=https://seven-aside.phantommetrics.gm/webhooks/easypay-partner`
4. Restart **both** apps with env reload:
   ```bash
   pm2 restart all --update-env
   ```
5. Test signature locally on 7-aside:
   ```bash
   cd appBackend && npm run diagnose:easypay-webhook
   ```
6. Trigger a test payment or replay a failed webhook job on directPay.

Compare prefixes in logs (`signaturePrefix` vs `expectedSignaturePrefix`) — they should match when the secret is correct.

---

If you confirm compromise: snapshot disk for forensics, rotate all secrets, rebuild from clean image, restore DB from last known-good backup only after reviewing for tampering.
