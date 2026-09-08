import { Platform } from 'react-native';
import { nativeAppPath } from './app-public-url';

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const media = typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false;
  const iosHomeScreen = Boolean((window.navigator as any)?.standalone);
  return media || iosHomeScreen;
}

function isMobileWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
}

/**
 * From mobile Safari/Chrome (including WhatsApp's in-app browser), try the native
 * app. If it is not installed, the custom scheme fails and this HTTPS page stays
 * open so the PWA/web invite screen can continue.
 */
export function tryOpenNativeAppForInvite(path: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (isStandalonePwa() || !isMobileWeb()) return;

  const key = `sevenaside-native-handoff:${path}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
  } catch {
    /* private mode */
  }

  const target = nativeAppPath(path);
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = target;
  document.body.appendChild(iframe);
  window.setTimeout(() => {
    iframe.remove();
  }, 1500);
}
