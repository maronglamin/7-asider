import appleSignin from 'apple-signin-auth';

export type AppleProfile = {
  sub: string;
  email?: string;
};

// Verify an Apple identity token (JWT) from Sign in with Apple
export async function verifyAppleIdentityToken(identityToken: string, audience: string): Promise<AppleProfile> {
  const payload = await appleSignin.verifyIdToken(identityToken, {
    audience,
    ignoreExpiration: false,
  });

  return { sub: payload.sub as string, email: payload.email as string | undefined };
}


