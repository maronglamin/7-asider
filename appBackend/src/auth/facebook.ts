import fetch from 'node-fetch';

export type FacebookProfile = {
  id: string;
  email?: string;
  name?: string;
  picture?: { data?: { url?: string } };
};

// Verify a Facebook access token by calling Graph API /me
export async function verifyFacebookAccessToken(accessToken: string): Promise<FacebookProfile> {
  const fields = 'id,name,email,picture.type(large)';
  const res = await fetch(`https://graph.facebook.com/me?fields=${fields}&access_token=${accessToken}`);
  if (!res.ok) {
    throw new Error('Invalid Facebook access token');
  }
  return (await res.json()) as FacebookProfile;
}


