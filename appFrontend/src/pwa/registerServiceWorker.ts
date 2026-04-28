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

  let theme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!theme) {
    theme = document.createElement('meta');
    theme.name = 'theme-color';
    document.head.appendChild(theme);
  }
  theme.content = '#16a34a';
}

export function registerServiceWorker() {
  if (Platform.OS !== 'web') return;

  ensureManifestLink();

  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .catch((error) => console.log('[PWA] service worker registration skipped', error));
  });
}
