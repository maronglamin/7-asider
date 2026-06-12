import { useCallback, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { apiPost } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getGoogleClientIds, type GoogleClientIds } from './googleClientIds';

WebBrowser.maybeCompleteAuthSession();

type GoogleAuthUser = {
  id: string;
  email: string;
  name?: string | null;
  supadmin?: boolean;
  provider?: string | null;
};

export type GoogleSignInResult = { ok: true } | { ok: false; error: string };

/**
 * Only mount from a component rendered when `isGoogleSignInConfigured()` is true.
 * `webClientId` is required on every platform for `useIdTokenAuthRequest`.
 */
export function useGoogleSignIn(clientIds: GoogleClientIds) {
  const { setAuth } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const redirectUri = makeRedirectUri({ scheme: 'sevenaside' });
  if (__DEV__) {
    console.log('[Google sign-in] redirectUri =', redirectUri);
  }

  const [request, , promptAsync] = Google.useIdTokenAuthRequest(
    {
      iosClientId: clientIds.iosClientId || undefined,
      androidClientId: clientIds.androidClientId || undefined,
      webClientId: clientIds.webClientId,
      redirectUri,
    },
    { scheme: 'sevenaside' },
  );

  const signInWithGoogle = useCallback(async (): Promise<GoogleSignInResult> => {
    if (submitting) return { ok: false, error: 'Sign-in already in progress' };
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
  }, [promptAsync, request, setAuth, submitting]);

  return { signInWithGoogle, submitting };
}

/** Convenience hook for screens — reads client IDs from config/env. */
export function useGoogleSignInFromConfig() {
  return useGoogleSignIn(getGoogleClientIds());
}
