import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client';
import {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from '../config/oauth.generated';

export type GoogleClientIds = {
  webClientId: string;
  iosClientId: string;
  androidClientId: string;
};

function readEnv(name: string): string {
  const fromProcess = (process.env as Record<string, string | undefined>)[name];
  return (fromProcess || '').trim();
}

function getExpoExtra(): Record<string, string> {
  const constants = Constants as {
    expoConfig?: { extra?: Record<string, string> };
    manifest?: { extra?: Record<string, string> };
  };
  return (constants.expoConfig?.extra || constants.manifest?.extra || {}) as Record<string, string>;
}

function pickClientId(...candidates: Array<string | undefined>): string {
  for (const value of candidates) {
    const trimmed = (value || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/** Synchronous lookup: .env / app.config extra / build-generated file (never committed). */
export function getGoogleClientIdsSync(): GoogleClientIds {
  const extra = getExpoExtra();
  return {
    webClientId: pickClientId(
      extra['GOOGLE_WEB_CLIENT_ID'],
      readEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
      GOOGLE_WEB_CLIENT_ID,
    ),
    iosClientId: pickClientId(
      extra['GOOGLE_IOS_CLIENT_ID'],
      readEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'),
      GOOGLE_IOS_CLIENT_ID,
    ),
    androidClientId: pickClientId(
      extra['GOOGLE_ANDROID_CLIENT_ID'],
      readEnv('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'),
      GOOGLE_ANDROID_CLIENT_ID,
    ),
  };
}

export function isGoogleSignInConfiguredForIds(ids: GoogleClientIds): boolean {
  if (!ids.webClientId) return false;
  if (Platform.OS === 'web') return true;
  return Boolean(ids.iosClientId || ids.androidClientId);
}

type PublicOAuthConfig = {
  googleWebClientId: string | null;
  googleAndroidClientId?: string | null;
  googleIosClientId?: string | null;
};

/** Loads client IDs from env/build output, then GET /auth/public-config if web ID is still missing. */
export function useGoogleClientIds() {
  const syncIds = useMemo(() => getGoogleClientIdsSync(), []);
  const [clientIds, setClientIds] = useState<GoogleClientIds>(syncIds);
  const [ready, setReady] = useState(() => isGoogleSignInConfiguredForIds(syncIds));

  useEffect(() => {
    if (isGoogleSignInConfiguredForIds(syncIds)) {
      setClientIds(syncIds);
      setReady(true);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const cfg = await apiGet<PublicOAuthConfig>('/auth/public-config');
        if (cancelled) return;
        const merged: GoogleClientIds = {
          webClientId: cfg.googleWebClientId || syncIds.webClientId,
          androidClientId: cfg.googleAndroidClientId || syncIds.androidClientId,
          iosClientId: cfg.googleIosClientId || syncIds.iosClientId,
        };
        setClientIds(merged);
      } catch (e) {
        if (!cancelled) {
          console.warn('[Google sign-in] Could not load /auth/public-config', (e as Error)?.message || e);
          setClientIds(syncIds);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [syncIds]);

  return {
    clientIds,
    ready,
    configured: ready && isGoogleSignInConfiguredForIds(clientIds),
  };
}
