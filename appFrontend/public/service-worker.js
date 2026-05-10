const CACHE_NAME = '7aside-static-v5';
// Keep the install shell small: '/' + manifest only. /icon.png is large and is
// fetched when the browser/PWA needs it; precaching it slowed SW activation.
const APP_SHELL = ['/', '/manifest.json'];

/** When the PWA is served from the same origin as the API, never cache API JSON GETs. */
function isApiPath(pathname) {
  return (
    pathname.startsWith('/fields') ||
    pathname.startsWith('/bookings') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/payouts') ||
    pathname.startsWith('/easypay') ||
    pathname.startsWith('/app/')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(APP_SHELL.map((url) => cache.add(url))).then(() => undefined),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (isApiPath(requestUrl.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  );
});
