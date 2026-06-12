import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type GoogleClientIds = {
  webClientId: string;
  iosClientId: string;
  androidClientId: string;
};

function readEnv(name: string): string {
  const fromProcess = (process.env as Record<string, string | undefined>)[name];
  return (fromProcess || '').trim();
}

/** Client IDs from app.config.js extra, with EXPO_PUBLIC_* fallback (Metro inlines these at bundle time). */
export function getGoogleClientIds(): GoogleClientIds {
  const extra = (Constants.expoConfig?.extra || {}) as Record<string, string>;
  const ids = {
    webClientId: (extra['GOOGLE_WEB_CLIENT_ID'] || readEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID')).trim(),
    iosClientId: (extra['GOOGLE_IOS_CLIENT_ID'] || readEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID')).trim(),
    androidClientId: (extra['GOOGLE_ANDROID_CLIENT_ID'] || readEnv('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID')).trim(),
  };
  if (__DEV__ && !ids.webClientId) {
    console.warn(
      '[Google sign-in] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing. Add it to appFrontend/.env and restart Expo (npm run web).',
    );
  }
  return ids;
}

export function isGoogleSignInConfigured(): boolean {
  const ids = getGoogleClientIds();
  if (!ids.webClientId) return false;
  if (Platform.OS === 'web') return true;
  return Boolean(ids.iosClientId || ids.androidClientId);
}
