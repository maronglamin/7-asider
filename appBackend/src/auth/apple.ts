import appleSignin from 'apple-signin-auth';
import { getAppleClientIds } from '../config/env';

export type AppleProfile = {
  sub: string;
  email?: string;
};

export function assertAppleClientId(clientId: string): string {
  const allowed = getAppleClientIds();
  const trimmed = clientId.trim();
  if (!trimmed) {
    throw new Error('clientId is required');
  }
  if (allowed.length > 0 && !allowed.includes(trimmed)) {
    throw new Error('Invalid Apple client ID');
  }
  return trimmed;
}

export async function verifyAppleIdentityToken(identityToken: string, clientId: string): Promise<AppleProfile> {
  const audience = assertAppleClientId(clientId);
  const payload = await appleSignin.verifyIdToken(identityToken, {
    audience,
    ignoreExpiration: false,
  });

  return { sub: payload.sub as string, email: payload.email as string | undefined };
}
