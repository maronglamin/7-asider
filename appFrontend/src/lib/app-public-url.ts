import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const PRODUCTION_APP_PUBLIC_URL = 'https://7a-side.phantommetrics.gm';
export const APP_SCHEME = 'sevenaside';

function stripSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Public HTTPS origin used in shareable invite / challenge links. */
export function getAppPublicUrl(): string {
  const extra = ((Constants?.expoConfig?.extra as any) || {}) as { APP_PUBLIC_URL?: string };
  const fromExtra = String(extra.APP_PUBLIC_URL || '').trim();
  if (fromExtra) return stripSlash(fromExtra);

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return stripSlash(window.location.origin);
  }

  return PRODUCTION_APP_PUBLIC_URL;
}

export function getAppPublicHost(): string {
  try {
    return new URL(getAppPublicUrl()).host;
  } catch {
    return '7a-side.phantommetrics.gm';
  }
}

export function publicAppPath(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${getAppPublicUrl()}${clean}`;
}

export function nativeAppPath(path: string): string {
  const clean = path.replace(/^\/+/, '');
  return `${APP_SCHEME}://${clean}`;
}
