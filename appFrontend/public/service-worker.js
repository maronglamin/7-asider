const CACHE_NAME = '7aside-static-v8';
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
    pathname.startsWith('/push') ||
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

self.addEventListener('push', (event) => {
  let title = '7a-side';
  let body = '';
  let payloadData = {};
  try {
    if (event.data) {
      const parsed = JSON.parse(event.data.text());
      if (parsed.title) title = String(parsed.title);
      if (parsed.body) body = String(parsed.body);
      if (parsed.data && typeof parsed.data === 'object') payloadData = parsed.data;
    }
  } catch (_) {
    body = event.data ? String(event.data.text()) : '';
  }
  const tag = payloadData && payloadData.bookingId ? `booking-${payloadData.bookingId}` : '7aside-push';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: payloadData,
      icon: '/icon.png',
      badge: '/icon.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const bookingId = data.bookingId != null ? String(data.bookingId) : '';
  const openAs = data.openAs === 'customer' ? 'customer' : 'owner';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (bookingId) {
        clientList.forEach((client) => {
          client.postMessage({ type: 'OPEN_BOOKING_PUSH', bookingId, openAs });
        });
      }
      if (clientList.length > 0 && 'focus' in clientList[0]) {
        return clientList[0].focus();
      }
      if (bookingId && self.clients.openWindow) {
        const path =
          openAs === 'customer'
            ? `/my-booking/${encodeURIComponent(bookingId)}`
            : `/owner-booking/${encodeURIComponent(bookingId)}`;
        return self.clients.openWindow(new URL(path, self.location.origin).href);
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(new URL('/', self.location.origin).href);
      }
    }),
  );
});
