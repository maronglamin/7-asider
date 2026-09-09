import { toPublicAppLockType } from '../app-lock/service';
import { getUserMonthlyDeviceUsage, isDeviceLockActiveOnDevice } from '../device/limits';
import { resolveUserDeviceId } from '../device/service';

export const AUTH_SESSION_SELECT = {
  id: true,
  email: true,
  name: true,
  username: true,
  supadmin: true,
  provider: true,
  passwordHash: true,
  appLockType: true,
  deviceLockEnabled: true,
  lockedDeviceId: true,
} as const;

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  username?: string | null;
  supadmin?: boolean;
  provider: string | null;
  passwordHash?: string | null;
  appLockType?: string | null;
  deviceLockEnabled?: boolean;
  lockedDeviceId?: string | null;
};

export function toAuthUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username ?? null,
    supadmin: Boolean(user.supadmin),
    provider: user.provider,
    appLockType: toPublicAppLockType(user.appLockType),
    hasPassword: Boolean(user.passwordHash),
    deviceLockEnabled: Boolean(user.deviceLockEnabled),
  };
}

export async function toAuthUserSession(user: UserRow, currentDeviceId?: string | null) {
  const monthly = await getUserMonthlyDeviceUsage(user.id);
  return {
    ...toAuthUser(user),
    deviceLockActiveOnThisDevice: await isDeviceLockActiveOnDevice(
      {
        deviceLockEnabled: Boolean(user.deviceLockEnabled),
        lockedDeviceId: user.lockedDeviceId ?? null,
      },
      currentDeviceId,
    ),
    monthlyDevicesUsed: monthly.used,
    monthlyDevicesLimit: monthly.limit,
  };
}

export async function resolveRequestDeviceId(
  userId: string,
  req: { headers: { [key: string]: unknown } },
): Promise<string | null> {
  const header = req.headers['x-device-id'];
  const raw = Array.isArray(header) ? header[0] : header;
  const deviceId = typeof raw === 'string' ? raw.trim() : '';
  if (!deviceId) return null;
  return resolveUserDeviceId(userId, deviceId);
}
