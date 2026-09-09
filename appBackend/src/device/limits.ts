import type { User } from '@prisma/client';

import { prisma } from '../db/prisma';
import type { DeviceInfoInput } from './service';

export const MONTHLY_DEVICE_LIMIT_PER_USER = 3;
export const MONTHLY_USER_LIMIT_PER_DEVICE = 3;

export type DeviceLoginErrorCode =
  | 'USER_MONTHLY_DEVICE_LIMIT'
  | 'DEVICE_MONTHLY_USER_LIMIT'
  | 'DEVICE_LOCK_VIOLATION'
  | 'DEVICE_REQUIRED';

export class DeviceLoginError extends Error {
  readonly code: DeviceLoginErrorCode;

  constructor(code: DeviceLoginErrorCode, message: string) {
    super(message);
    this.name = 'DeviceLoginError';
    this.code = code;
  }
}

export function getDeviceGroupKey(input: Pick<DeviceInfoInput, 'hardwareId' | 'fingerprint'>): string {
  return input.hardwareId?.trim() || input.fingerprint.trim();
}

export function getCurrentYearMonth(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function isSamePhysicalDevice(
  input: DeviceInfoInput,
  locked: { fingerprint: string; hardwareId: string | null },
): boolean {
  if (locked.hardwareId && input.hardwareId) {
    return locked.hardwareId === input.hardwareId;
  }
  return locked.fingerprint === input.fingerprint;
}

export async function assertDeviceLoginAllowed(
  user: User,
  input: DeviceInfoInput,
): Promise<void> {
  const deviceGroupKey = getDeviceGroupKey(input);
  const yearMonth = getCurrentYearMonth();
  const monthLabel = formatMonthLabel(yearMonth);

  if (user.deviceLockEnabled) {
    if (!user.lockedDeviceId) {
      return;
    }

    const lockedDevice = await prisma.userDevice.findFirst({
      where: { id: user.lockedDeviceId, userId: user.id },
    });

    if (lockedDevice && !isSamePhysicalDevice(input, lockedDevice)) {
      throw new DeviceLoginError(
        'DEVICE_LOCK_VIOLATION',
        'This account only works on one phone, tablet, or web browser. Open 7-aside on your usual device. To use a new device, go to Profile on your usual device and turn off device lock.',
      );
    }
  }

  const existingUserDevice = await prisma.userMonthlyDevice.findUnique({
    where: {
      userId_deviceGroupKey_yearMonth: {
        userId: user.id,
        deviceGroupKey,
        yearMonth,
      },
    },
  });

  if (!existingUserDevice) {
    const userDeviceCount = await prisma.userMonthlyDevice.count({
      where: { userId: user.id, yearMonth },
    });

    if (userDeviceCount >= MONTHLY_DEVICE_LIMIT_PER_USER) {
      throw new DeviceLoginError(
        'USER_MONTHLY_DEVICE_LIMIT',
        `You have reached the limit of ${MONTHLY_DEVICE_LIMIT_PER_USER} devices for ${monthLabel}. Sign in from a device you have already used this month, or try again next month.`,
      );
    }
  }

  const existingDeviceUser = await prisma.deviceMonthlyUser.findUnique({
    where: {
      deviceGroupKey_userId_yearMonth: {
        deviceGroupKey,
        userId: user.id,
        yearMonth,
      },
    },
  });

  if (!existingDeviceUser) {
    const deviceUserCount = await prisma.deviceMonthlyUser.count({
      where: { deviceGroupKey, yearMonth },
    });

    if (deviceUserCount >= MONTHLY_USER_LIMIT_PER_DEVICE) {
      throw new DeviceLoginError(
        'DEVICE_MONTHLY_USER_LIMIT',
        `This device has reached its monthly limit of ${MONTHLY_USER_LIMIT_PER_DEVICE} 7-aside accounts for ${monthLabel}. Use a different device, or try again next month.`,
      );
    }
  }
}

export async function recordMonthlyDeviceLogin(
  userId: string,
  input: DeviceInfoInput,
): Promise<void> {
  const deviceGroupKey = getDeviceGroupKey(input);
  const yearMonth = getCurrentYearMonth();
  const now = new Date();

  await prisma.userMonthlyDevice.upsert({
    where: {
      userId_deviceGroupKey_yearMonth: {
        userId,
        deviceGroupKey,
        yearMonth,
      },
    },
    create: {
      userId,
      deviceGroupKey,
      yearMonth,
      firstLoginAt: now,
      lastLoginAt: now,
    },
    update: {
      lastLoginAt: now,
    },
  });

  await prisma.deviceMonthlyUser.upsert({
    where: {
      deviceGroupKey_userId_yearMonth: {
        deviceGroupKey,
        userId,
        yearMonth,
      },
    },
    create: {
      deviceGroupKey,
      userId,
      yearMonth,
      firstLoginAt: now,
      lastLoginAt: now,
    },
    update: {
      lastLoginAt: now,
    },
  });
}

export async function getUserMonthlyDeviceUsage(userId: string): Promise<{
  used: number;
  limit: number;
  yearMonth: string;
}> {
  const yearMonth = getCurrentYearMonth();
  const used = await prisma.userMonthlyDevice.count({
    where: { userId, yearMonth },
  });

  return {
    used,
    limit: MONTHLY_DEVICE_LIMIT_PER_USER,
    yearMonth,
  };
}

export async function isDeviceLockActiveOnDevice(
  user: Pick<User, 'deviceLockEnabled' | 'lockedDeviceId'>,
  deviceId: string | null | undefined,
): Promise<boolean> {
  if (!user.deviceLockEnabled || !user.lockedDeviceId || !deviceId) {
    return false;
  }
  return user.lockedDeviceId === deviceId;
}
