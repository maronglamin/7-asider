import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { getAppLockPepper } from '../config/env';

const scryptAsync = promisify(scrypt);

export async function hashAppLockSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(`${getAppLockPepper()}:${secret}`, salt, 32)) as Buffer;
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyAppLockSecret(secret: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':');
  if (!saltHex || !keyHex) return false;

  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    const key = (await scryptAsync(`${getAppLockPepper()}:${secret}`, salt, 32)) as Buffer;
    if (key.length !== expected.length) return false;
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
