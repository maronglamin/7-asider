import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function getWebStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (_error) {
    return null;
  }
}

export async function getAuthStorageItem(key: string): Promise<string | null> {
  const storage = getWebStorage();
  if (storage) return storage.getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function setAuthStorageItem(key: string, value: string): Promise<void> {
  const storage = getWebStorage();
  if (storage) {
    storage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteAuthStorageItem(key: string): Promise<void> {
  const storage = getWebStorage();
  if (storage) {
    storage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
