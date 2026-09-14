# Admin portal deploy with Nginx

Deploy the Vite admin SPA at **admin.7a-side.phantommetrics.gm**. Keep the API on **seven-aside.phantommetrics.gm** and the consumer web app on **7a-side.phantommetrics.gm**.

## Assumptions

- DNS A/AAAA for `admin.7a-side.phantommetrics.gm` points at this server.
- Backend is already running on `127.0.0.1:4000` (your existing `seven-aside.phantommetrics.gm` Nginx site).
- Backend CORS already allows `https://admin.7a-side.phantommetrics.gm` (default in `appBackend/src/config/env.ts`). If you use a custom `CORS_ORIGINS`, add that origin.

## How traffic works

| Host | Role |
| --- | --- |
| `seven-aside.phantommetrics.gm` | API (proxy everything → `:4000`) — unchanged |
| `7a-side.phantommetrics.gm` | Consumer Expo web |
| `admin.7a-side.phantommetrics.gm` | Admin SPA + proxy `/admin/` and `/uploads/` → `:4000` |

The admin site proxies API paths so the built SPA can keep relative URLs (no `VITE_API_URL` required). Flyer deeplinks still need the consumer public URL at build time.

## 1. Build env on the server

Create `/var/www/7-aside/appAdmin/.env.production` (or export before build):

```bash
VITE_APP_PUBLIC_URL=https://7a-side.phantommetrics.gm
# Leave VITE_API_URL unset — Nginx proxies /admin and /uploads on this host.
```

## 2. Put the app on the server and build

```bash
sudo mkdir -p /var/www/7-aside/appAdmin
sudo rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  /path/to/appAdmin/ /var/www/7-aside/appAdmin/

cd /var/www/7-aside/appAdmin
npm ci
npm run build
sudo chown -R www-data:www-data /var/www/7-aside/appAdmin
```

Confirm `dist/index.html` exists.

## 3. Enable the Nginx site

```bash
sudo cp /var/www/7-aside/appAdmin/deploy/nginx/seven-aside-admin.conf \
  /etc/nginx/sites-available/seven-aside-admin.conf
sudo ln -sf /etc/nginx/sites-available/seven-aside-admin.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Do **not** change the existing API server block for `seven-aside.phantommetrics.gm`.

## 4. HTTPS

```bash
sudo certbot --nginx -d admin.7a-side.phantommetrics.gm
```

## 5. Backend one-time checks

On the API host / appBackend:

```bash
npx prisma migrate deploy
npm run admin:seed-permissions
npm run admin:set-owner -- you@example.com
```

Restart the Node process if it was already running when you added admin routes.

## 6. Verify

```bash
curl -I https://admin.7a-side.phantommetrics.gm/
curl -I https://admin.7a-side.phantommetrics.gm/admin/auth/me
curl -I https://seven-aside.phantommetrics.gm/health
```

- First: admin HTML (`200` / `index.html`)
- Second: usually `401` JSON from the admin API (proves the proxy works)
- Third: backend health as before

## Redeploy (after code updates)

```bash
cd /var/www/7-aside/appAdmin
git pull   # or rsync again
npm ci
npm run build
sudo systemctl reload nginx   # only needed if nginx config changed
```

Or use `./deploy/deploy-admin.sh` from this package (see script header for paths).

## Troubleshooting

**403 Forbidden**

```bash
ls -la /var/www/7-aside/appAdmin/dist/index.html
sudo namei -l /var/www/7-aside/appAdmin/dist/index.html
```

**Admin UI loads but login fails / CORS**

Prefer the same-origin proxy (`/admin/` on the admin host). If you set `VITE_API_URL=https://seven-aside.phantommetrics.gm` instead, rebuild and ensure that origin is in backend `CORS_ORIGINS`.

**API 404 on `/admin/...`**

Confirm the Node app serving `:4000` includes the new admin routes and was restarted after deploy.
