import fetch from 'node-fetch';

export type GoogleProfile = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

// Verifies an ID token from Google Sign-In (received from the app)
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${idToken}`);
  if (!res.ok) {
    throw new Error('Invalid Google ID token');
  }
  const data = (await res.json()) as any;
  return {
    sub: data.sub,
    email: data.email,
    name: data.name,
    picture: data.picture,
  };
}


