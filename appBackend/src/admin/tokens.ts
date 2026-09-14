import jwt, { Secret } from 'jsonwebtoken';
import { getJwtSecret } from '../config/env';

const ADMIN_TOKEN_TTL = process.env.ADMIN_JWT_EXPIRES_IN?.trim() || '8h';
const PRE_AUTH_TTL = '5m';

export type AdminTokenPayload = {
  sub: string;
  email: string;
  admin: true;
  totp: true;
};

export type PreAuthTokenPayload = {
  sub: string;
  email: string;
  preAuth: true;
};

export function signAdminToken(payload: { sub: string; email: string }): string {
  const adminPayload: AdminTokenPayload = {
    ...payload,
    admin: true,
    totp: true,
  };
  return jwt.sign(adminPayload, getJwtSecret() as Secret, {
    expiresIn: ADMIN_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function signPreAuthToken(payload: { sub: string; email: string }): string {
  const preAuthPayload: PreAuthTokenPayload = {
    ...payload,
    preAuth: true,
  };
  return jwt.sign(preAuthPayload, getJwtSecret() as Secret, {
    expiresIn: PRE_AUTH_TTL,
  });
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  const payload = jwt.verify(token, getJwtSecret() as Secret) as AdminTokenPayload;
  if (!payload.admin || !payload.totp) {
    throw new Error('Invalid admin token');
  }
  return payload;
}

export function verifyPreAuthToken(token: string): PreAuthTokenPayload {
  const payload = jwt.verify(token, getJwtSecret() as Secret) as PreAuthTokenPayload;
  if (!payload.preAuth) {
    throw new Error('Invalid pre-auth token');
  }
  return payload;
}
