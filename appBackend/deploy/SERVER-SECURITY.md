# Live server security guide — 7a-side

Use this after any suspected incident or when hardening production.

## Is the server compromised?

**Your UFW output looks like normal Fail2Ban behavior**, not proof of compromise:

| Signal | Usually means |
|--------|----------------|
| `REJECT IN` from random AWS/Azure IPs with `# by Fail2Ban after 10 attempts against nginx-404` | Internet bots probing for WordPress, `.env`, etc. — **expected** |
| Rules `[ 8] Nginx Full ALLOW` + `[ 9] 22/tcp ALLOW` | Normal baseline |

**Investigate further if you see any of:**

- New users in `/root/.ssh/authorized_keys` or `/home/*/.ssh/authorized_keys` you did not add
- Unknown cron jobs: `sudo crontab -l -u root` and `/etc/cron.d/*`
- Unexpected processes: `ps aux | rg -i 'miner|xmr|kinsing|\.sh'`
- Successful SSH logins from unknown countries: `sudo grep 'Accepted' /var/log/auth.log | tail -50`
- Backend `.env` or nginx configs modified outside your deploy window
- New systemd units you did not create: `systemctl list-units --type=service --state=running`

---

## Immediate server checklist (run on the box)

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
npm ci
npm run build
pm2 restart all   # or your process manager
```

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

If you confirm compromise: snapshot disk for forensics, rotate all secrets, rebuild from clean image, restore DB from last known-good backup only after reviewing for tampering.
