import { useCallback, useMemo, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiPost } from '../api/client';
import { useAuth } from '../context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

type GoogleAuthUser = {
  id: string;
  email: string;
  name?: string | null;
  supadmin?: boolean;
  provider?: string | null;
};

type GoogleSignInResult = { ok: true } | { ok: false; error: string };

function getGoogleClientIds() {
  const extra = (Constants.expoConfig?.extra || {}) as Record<string, string>;
  return {
    webClientId: extra['GOOGLE_WEB_CLIENT_ID'] || '',
    iosClientId: extra['GOOGLE_IOS_CLIENT_ID'] || '',
    androidClientId: extra['GOOGLE_ANDROID_CLIENT_ID'] || '',
  };
}

export function useGoogleSignIn() {
  const { setAuth } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const clientIds = useMemo(() => getGoogleClientIds(), []);

  const configured = Boolean(
    clientIds.webClientId &&
      (Platform.OS === 'web' || clientIds.iosClientId || clientIds.androidClientId),
  );

  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: clientIds.iosClientId || undefined,
    androidClientId: clientIds.androidClientId || undefined,
    webClientId: clientIds.webClientId || undefined,
  });

  const signInWithGoogle = useCallback(async (): Promise<GoogleSignInResult> => {
    if (submitting) return { ok: false, error: 'Sign-in already in progress' };
    if (!configured) {
      return { ok: false, error: 'Google sign-in is not configured for this build' };
    }
    if (!request) {
      return { ok: false, error: 'Google sign-in is not ready yet. Try again in a moment.' };
    }

    setSubmitting(true);
    try {
      const result = await promptAsync();
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { ok: false, error: 'Sign-in cancelled' };
      }
      if (result.type !== 'success') {
        return { ok: false, error: 'Google sign-in failed' };
      }

      const idToken = result.params?.['id_token'];
      if (!idToken) {
        return { ok: false, error: 'No ID token received from Google' };
      }

      const res = await apiPost<{ token: string; user: GoogleAuthUser }>('/auth/google', { idToken });
      setAuth(
        {
          id: res.user.id,
          email: res.user.email,
          name: res.user.name ?? undefined,
          supadmin: res.user.supadmin,
          provider: res.user.provider,
        },
        res.token,
      );
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Google sign-in failed' };
    } finally {
      setSubmitting(false);
    }
  }, [configured, promptAsync, request, setAuth, submitting]);

  return { signInWithGoogle, submitting, configured };
}
