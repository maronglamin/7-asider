import { apiDeleteAuth, apiPostAuth } from '../api/client';
import { getCurrentPinSecret, validatePin, clearPinReauth } from './pin-setup';

export async function setAppLockPin(secret: string, token: string): Promise<void> {
  const validationError = validatePin(secret);
  if (validationError) throw new Error(validationError);
  await apiPostAuth('/auth/app-lock', { secret, currentSecret: getCurrentPinSecret() }, token);
  clearPinReauth();
}

export async function verifyAppLockPin(secret: string, token: string): Promise<boolean> {
  try {
    await apiPostAuth('/auth/app-lock/verify', { secret }, token);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/too many attempts/i.test(message)) throw error;
    return false;
  }
}

export async function clearAppLockPin(token: string): Promise<void> {
  await apiDeleteAuth('/auth/app-lock', token);
}
