# Let's Encrypt + Nginx on Live Server

Guide to install Let's Encrypt SSL and nginx for the 7-aside backend at **seven-aside.phantommetrics.gm**.

**Assumptions:** Ubuntu/Debian live server, domain already pointing to the server's IP.

---

## 1. Install Nginx and Certbot

On the **live server** (SSH in first):

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

`python3-certbot-nginx` lets Certbot configure nginx automatically.

---

## 2. Create ACME challenge directory

Let's Encrypt uses HTTP-01 challenge. Create the webroot:

```bash
sudo mkdir -p /var/www/certbot
sudo chown -R www-data:www-data /var/www/certbot
```

---

## 3. Deploy the nginx site config

Copy the project's nginx config to nginx's sites-available:

```bash
# From your repo (adjust path if you deploy from elsewhere)
sudo cp /path/to/appBackend/deploy/nginx/seven-aside-api.conf /etc/nginx/sites-available/seven-aside-api.conf
```

Enable the site and test nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/seven-aside-api.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Important:** Ensure your **backend is running** on port 4000 (e.g. `PORT=4000 node dist/index.js` or your process manager). Nginx proxies to `http://127.0.0.1:4000`.

---

## 4. Obtain Let's Encrypt certificate

Run Certbot with the nginx plugin (it will edit your nginx config and add HTTPS):

```bash
sudo certbot --nginx -d seven-aside.phantommetrics.gm
```

- Use a real email for renewal notices.
- Agree to terms of service.
- Choose whether to redirect HTTP → HTTPS (recommended: **Yes**).

Certbot will:

- Get a certificate from Let's Encrypt
- Add an HTTPS `server` block to your nginx config
- Configure the certificate paths

---

## 5. Verify HTTPS

```bash
curl -I https://seven-aside.phantommetrics.gm/health
```

You should see `200` and no certificate errors.

---

## 6. Auto-renewal

Certbot installs a cron/systemd timer. Test renewal (dry run):

```bash
sudo certbot renew --dry-run
```

Renewal runs automatically; no extra setup needed.

---

## Checklist

| Step | Command / check |
|------|------------------|
| DNS | `seven-aside.phantommetrics.gm` A record → server IP |
| Backend | Running on port 4000 (e.g. PM2, systemd) |
| Nginx | Config in `sites-enabled`, `nginx -t` OK |
| Certbot | `certbot --nginx -d seven-aside.phantommetrics.gm` |
| Renewal | `certbot renew --dry-run` succeeds |

---

## Frontend domain

Keep this backend site on `seven-aside.phantommetrics.gm`. The web frontend has a separate Nginx config at `appFrontend/deploy/nginx/seven-aside-web.conf` and should use:

```bash
sudo certbot --nginx -d 7a-side.phantommetrics.gm
```

---

## Troubleshooting

### Requests from the app don’t reach the backend

1. **App must use the live URL**  
   In `appFrontend/.env` set:
   ```bash
   API_BASE=https://seven-aside.phantommetrics.gm
   ```
   Restart Expo after changing `.env` (and use `-c` to clear cache). In the Metro log you should see: `[API client] API_BASE = https://seven-aside.phantommetrics.gm`.

2. **Nginx must listen on the right port**  
   The app uses **HTTPS** (port 443). If Certbot hasn’t been run yet, nginx only listens on 80 and requests to `https://...` will fail. Either:
   - Run Certbot so it adds HTTPS: `sudo certbot --nginx -d seven-aside.phantommetrics.gm`, or  
   - Temporarily use HTTP for testing: set `API_BASE=http://seven-aside.phantommetrics.gm` in `.env` (only for testing; use HTTPS in production).

3. **Only one server should handle this host**  
   If another site is the default, nginx might not use this config. Disable the default site if it’s in the way:
   ```bash
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. **Firewall**  
   Open 80 and 443:
   ```bash
   sudo ufw allow 80
   sudo ufw allow 443
   sudo ufw reload
   ```

### Verify request flow (run these on the server and from your PC)

```bash
# On the server: backend responding on 4000
curl -s http://127.0.0.1:4000/health

# From anywhere: nginx proxying HTTP (if Certbot not done yet)
curl -s -o /dev/null -w "%{http_code}" http://seven-aside.phantommetrics.gm/health

# From anywhere: nginx proxying HTTPS (after Certbot)
curl -s -o /dev/null -w "%{http_code}" https://seven-aside.phantommetrics.gm/health
```

You should get `200` for the last two. If the first works but the others don’t, the problem is nginx or firewall. If the first fails, start the Node backend on port 4000.

### Other issues

- **"Connection refused" to backend:** Start the Node app on port 4000 and ensure `PORT=4000` in `.env` or process manager.
- **Certbot "Failed to connect":** Ensure port 80 is open (`sudo ufw allow 80` then `sudo ufw reload` if using UFW).
- **Certificate errors in browser:** Wait a few minutes after running certbot, clear cache, or check that the nginx config reloaded (`sudo systemctl reload nginx`).
- **502 Bad Gateway:** Nginx can’t reach the backend. Check that the app is running: `curl -s http://127.0.0.1:4000/health`.
