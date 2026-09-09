import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function saveAndSharePdf(buffer: ArrayBuffer, filename: string): Promise<void> {
  const path = `${FileSystem.cacheDirectory || ''}${filename}`;
  await FileSystem.writeAsStringAsync(path, arrayBufferToBase64(buffer), {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Export booking statement',
    });
    return;
  }
  Alert.alert('Statement exported', `Saved to ${path}`);
}
