import { Platform } from 'react-native';

function ensureManifestLink() {
  if (typeof document === 'undefined') return;

  document.title = '7a-side';

  if (!document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = '/manifest.json';
    document.head.appendChild(manifest);
  }

  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const touchIcon = document.createElement('link');
    touchIcon.rel = 'apple-touch-icon';
    touchIcon.href = '/icon.png';
    document.head.appendChild(touchIcon);
  }

  if (!document.querySelector('link[rel="icon"]')) {
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/png';
    favicon.href = '/icon.png';
    document.head.appendChild(favicon);
  }

  let theme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!theme) {
    theme = document.createElement('meta');
    theme.name = 'theme-color';
    document.head.appendChild(theme);
  }
  theme.content = '#16a34a';
}

function registerSwOnce() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('/service-worker.js', { type: 'classic', scope: '/' })
    .then(() => {
      if (__DEV__) console.log('[PWA] service worker registered (scope /)');
    })
    .catch((error) => {
      console.warn('[PWA] service worker registration failed', error?.message || error);
    });
}

export function registerServiceWorker() {
  if (Platform.OS !== 'web') return;

  ensureManifestLink();

  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // Register before `load` so pushManager.subscribe can await navigator.serviceWorker.ready reliably.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerSwOnce, { once: true });
  } else {
    registerSwOnce();
  }
}
