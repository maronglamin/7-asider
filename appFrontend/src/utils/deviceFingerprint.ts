import { Platform } from 'react-native';

import { deleteAuthStorageItem, getAuthStorageItem, setAuthStorageItem } from './authStorage';
import { DEVICE_FIELD_LIMITS, truncateDeviceField } from './deviceTypes';

export const DEVICE_FINGERPRINT_KEY = '7aside_device_fingerprint';
const COOKIE_NAME = '7aside_device_fp';

function createFingerprint(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const match = document.cookie.split('; ').find((row) => row.startsWith(prefix));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return match.slice(prefix.length);
  }
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=63072000; Path=/; SameSite=Lax${secure}`;
}

export async function getOrCreateDeviceFingerprint(): Promise<string> {
  const fromStorage = await getAuthStorageItem(DEVICE_FINGERPRINT_KEY);
  const fromCookie = Platform.OS === 'web' ? readCookie(COOKIE_NAME) : null;
  const existing = fromStorage || fromCookie;
  if (existing) {
    const fingerprint =
      truncateDeviceField(existing, DEVICE_FIELD_LIMITS.fingerprint) ??
      existing.slice(0, DEVICE_FIELD_LIMITS.fingerprint);
    if (!fromStorage) {
      await setAuthStorageItem(DEVICE_FINGERPRINT_KEY, fingerprint);
    }
    if (Platform.OS === 'web') {
      writeCookie(COOKIE_NAME, fingerprint);
    }
    return fingerprint;
  }

  const fingerprint = createFingerprint();
  await setAuthStorageItem(DEVICE_FINGERPRINT_KEY, fingerprint);
  if (Platform.OS === 'web') {
    writeCookie(COOKIE_NAME, fingerprint);
  }
  return fingerprint;
}

export async function clearDeviceFingerprint(): Promise<void> {
  await deleteAuthStorageItem(DEVICE_FINGERPRINT_KEY);
}
