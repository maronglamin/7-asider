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

## 2. Put the frontend app on the server

Place or update the frontend app at `/var/www/7-aside/appFrontend`, then build it there:

```bash
sudo mkdir -p /var/www/7-aside/appFrontend
sudo rsync -a --delete /path/to/appFrontend/ /var/www/7-aside/appFrontend/
cd /var/www/7-aside/appFrontend
npm install
npm run build:web
sudo chown -R www-data:www-data /var/www/7-aside/appFrontend
```

Adjust `/path/to/appFrontend/` to wherever the repository or build artifact exists on the server. Nginx serves `/var/www/7-aside/appFrontend/dist`, so `index.html` must exist at `/var/www/7-aside/appFrontend/dist/index.html`.

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

## 6. Fix a 403 response

If Nginx returns `403 Forbidden`, check that the build exists and Nginx can read it:

```bash
ls -la /var/www/7-aside/appFrontend/dist/index.html
sudo namei -l /var/www/7-aside/appFrontend/dist/index.html
sudo nginx -t
sudo systemctl reload nginx
```

If `dist/index.html` is missing, rerun `npm run build:web` in `/var/www/7-aside/appFrontend`.
