# Web Deploy with Nginx

Deploy the Expo web build at **7a-side.phantommetrics.gm** while keeping the backend API at **seven-aside.phantommetrics.gm**.

## Assumptions

- `7a-side.phantommetrics.gm` has an A record pointing to the live server.
- The backend Nginx config remains `appBackend/deploy/nginx/seven-aside-api.conf`.
- The frontend continues to call `https://seven-aside.phantommetrics.gm` for API requests.

## 1. Build the web app

From `appFrontend`:

```bash
npm install
npm run build:web
```

This creates the static web build in `appFrontend/dist`.

## 2. Copy the build to the server web root

On the server:

```bash
sudo mkdir -p /var/www/7-aside/appFrontend
sudo rsync -a --delete /path/to/appFrontend/dist/ /var/www/7-aside/appFrontend/
sudo chown -R www-data:www-data /var/www/7-aside/appFrontend
```

Adjust `/path/to/appFrontend/dist/` to wherever the repository or build artifact exists on the server.

## 3. Enable the frontend Nginx site

```bash
sudo cp /path/to/appFrontend/deploy/nginx/seven-aside-web.conf /etc/nginx/sites-available/seven-aside-web.conf
sudo ln -sf /etc/nginx/sites-available/seven-aside-web.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Add HTTPS

Run Certbot for the frontend host only:

```bash
sudo certbot --nginx -d 7a-side.phantommetrics.gm
```

Keep the backend certificate and config separate:

```bash
sudo certbot --nginx -d seven-aside.phantommetrics.gm
```

## 5. Verify

```bash
curl -I https://7a-side.phantommetrics.gm/
curl -I https://seven-aside.phantommetrics.gm/health
```

The first command should return the web app, and the second should return the backend health response.
