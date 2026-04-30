import jwt, { SignOptions, Secret } from 'jsonwebtoken';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'dev_secret_change_me';
const RAW_EXPIRES = process.env.JWT_EXPIRES_IN; // e.g. '7d' or seconds

export type JwtUserPayload = {
  userId: string;
  email?: string;
  name?: string;
  provider: 'google' | 'apple' | 'facebook' | 'email';
};

export function signJwt(payload: JwtUserPayload) {
  const options: SignOptions | undefined = RAW_EXPIRES ? { expiresIn: RAW_EXPIRES as unknown as SignOptions['expiresIn'] } : undefined;
  return jwt.sign(payload, JWT_SECRET, options);
}


