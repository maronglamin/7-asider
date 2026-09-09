import type { User } from '@prisma/client';
import type { Request, Response } from 'express';

import { assertDeviceLoginAllowed, DeviceLoginError, recordMonthlyDeviceLogin } from './limits';
import {
  getClientIp,
  parseDeviceInfo,
  registerOrUpdateUserDevice,
  type PublicUserDevice,
} from './service';

export function sendDeviceLoginError(res: Response, err: unknown): boolean {
  if (!(err instanceof DeviceLoginError)) {
    return false;
  }
  const status = err.code === 'DEVICE_REQUIRED' ? 400 : 403;
  res.status(status).json({ error: err.message, code: err.code });
  return true;
}

export async function completeDeviceLogin(
  req: Request,
  user: User,
): Promise<PublicUserDevice> {
  const input = parseDeviceInfo((req.body as { device?: unknown })?.device);
  if (!input) {
    throw new DeviceLoginError(
      'DEVICE_REQUIRED',
      'This sign-in needs device information. Update the app or refresh the page and try again.',
    );
  }

  await assertDeviceLoginAllowed(user, input);
  const device = await registerOrUpdateUserDevice(user.id, input, getClientIp(req));
  await recordMonthlyDeviceLogin(user.id, input);
  return device;
}

export async function assertExistingUserDeviceAllowed(req: Request, user: User): Promise<void> {
  const input = parseDeviceInfo((req.body as { device?: unknown })?.device);
  if (!input) {
    throw new DeviceLoginError(
      'DEVICE_REQUIRED',
      'This sign-in needs device information. Update the app or refresh the page and try again.',
    );
  }
  await assertDeviceLoginAllowed(user, input);
}
