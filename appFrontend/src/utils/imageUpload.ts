import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * On Android, content:// URIs from the image picker may fail with FormData/fetch.
 * Copy to a file:// URI in the cache directory so upload works.
 */
export async function getUploadableImageUri(uri: string): Promise<string> {
  if (Platform.OS !== 'android' || !uri.startsWith('content://')) {
    return uri;
  }
  const ext = uri.includes('.') ? uri.split('.').pop()?.split('?')[0] || 'jpg' : 'jpg';
  const dest = `${FileSystem.cacheDirectory}upload_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}
