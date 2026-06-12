import { OAuth2Client } from 'google-auth-library';

export type GoogleProfile = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

function getGoogleClientIds(): string[] {
  const raw = process.env.GOOGLE_CLIENT_IDS || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// Verifies an ID token from Google Sign-In (received from the app)
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const clientIds = getGoogleClientIds();
  if (clientIds.length === 0) {
    throw new Error('Google sign-in is not configured on the server');
  }

  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientIds,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw new Error('Invalid Google ID token');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}
