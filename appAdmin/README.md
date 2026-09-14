# 7-aside Admin Portal

Separate web-only admin console for 7-aside. This is **not** the consumer app web build.

## Local development

1. Start the API (`appBackend`) on port 4000.
2. Apply migrations and seed permissions:

```bash
cd ../appBackend
npx prisma migrate deploy
npm run admin:seed-permissions
npm run admin:set-owner -- you@example.com
```

3. Start this portal:

```bash
npm install
npm run dev
```

Open `http://localhost:5173` (distinct from the consumer Expo web URL).

## Production URL

Deploy this SPA on a dedicated hostname:

- `https://admin.7a-side.phantommetrics.gm`

Do not serve it from the consumer app origin.

See **[WEB-DEPLOY-NGINX.md](./WEB-DEPLOY-NGINX.md)** for Nginx, Certbot, and `deploy/deploy-admin.sh`.

Nginx config: `deploy/nginx/seven-aside-admin.conf`  
- Serves `dist/`  
- Proxies `/admin/` and `/uploads/` → `127.0.0.1:4000` (same as local Vite)

Build env:

```bash
VITE_APP_PUBLIC_URL=https://7a-side.phantommetrics.gm
# Leave VITE_API_URL unset when using the Nginx proxy above
```

## Auth

1. Email OTP (must already be an admin user)
2. TOTP authenticator enrollment / verification
3. Admin JWT (8h)

Consumer app JWTs are not accepted.
