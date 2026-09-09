import type { User, UserDevice } from '@prisma/client';

import { prisma } from '../db/prisma';
import { truncateOptionalString, truncateRequiredString } from './sanitize';

export type DeviceInfoInput = {
  fingerprint: string;
  deviceName?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  modelName?: string | null;
  deviceType?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  imei?: string | null;
  hardwareId?: string | null;
  isEmulator?: boolean;
  appVersion?: string | null;
};

export type PublicUserDevice = {
  id: string;
  deviceName: string | null;
  brand: string | null;
  manufacturer: string | null;
  modelName: string | null;
  deviceType: string | null;
  osName: string | null;
  osVersion: string | null;
  isEmulator: boolean;
  appVersion: string | null;
  lastSeenAt: string;
  createdAt: string;
};

export type AdminUserDevice = PublicUserDevice & {
  fingerprint: string;
  hardwareId: string | null;
  imei: string | null;
  lastIpAddress: string | null;
};

function optionalDeviceString(value: unknown, max: number): string | null | undefined {
  return truncateOptionalString(value, max);
}

export function parseDeviceInfo(raw: unknown): DeviceInfoInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const input = raw as Record<string, unknown>;
  const fingerprint = truncateRequiredString(input.fingerprint, 128);
  if (!fingerprint) {
    return null;
  }
  return {
    fingerprint,
    deviceName: optionalDeviceString(input.deviceName, 200),
    brand: optionalDeviceString(input.brand, 100),
    manufacturer: optionalDeviceString(input.manufacturer, 100),
    modelName: optionalDeviceString(input.modelName, 100),
    deviceType: optionalDeviceString(input.deviceType, 100),
    osName: optionalDeviceString(input.osName, 100),
    osVersion: optionalDeviceString(input.osVersion, 100),
    imei: optionalDeviceString(input.imei, 100),
    hardwareId: optionalDeviceString(input.hardwareId, 128),
    isEmulator: typeof input.isEmulator === 'boolean' ? input.isEmulator : undefined,
    appVersion: optionalDeviceString(input.appVersion, 100),
  };
}

function toPublicUserDevice(device: UserDevice): PublicUserDevice {
  return {
    id: device.id,
    deviceName: device.deviceName,
    brand: device.brand,
    manufacturer: device.manufacturer,
    modelName: device.modelName,
    deviceType: device.deviceType,
    osName: device.osName,
    osVersion: device.osVersion,
    isEmulator: device.isEmulator,
    appVersion: device.appVersion,
    lastSeenAt: device.lastSeenAt.toISOString(),
    createdAt: device.createdAt.toISOString(),
  };
}

export function toAdminUserDevice(device: UserDevice): AdminUserDevice {
  return {
    ...toPublicUserDevice(device),
    fingerprint: device.fingerprint,
    hardwareId: device.hardwareId,
    imei: device.imei,
    lastIpAddress: device.lastIpAddress,
  };
}

export async function listUserDevicesForAdmin(userId: string): Promise<AdminUserDevice[]> {
  const devices = await prisma.userDevice.findMany({
    where: { userId },
    orderBy: { lastSeenAt: 'desc' },
  });
  return devices.map(toAdminUserDevice);
}

export async function clearUserDeviceLock(userId: string): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: {
      deviceLockEnabled: false,
      lockedDeviceId: null,
    },
  });
}

export async function registerOrUpdateUserDevice(
  userId: string,
  input: DeviceInfoInput,
  ipAddress?: string | null,
): Promise<PublicUserDevice> {
  const now = new Date();

  const device = await prisma.userDevice.upsert({
    where: {
      userId_fingerprint: {
        userId,
        fingerprint: input.fingerprint,
      },
    },
    create: {
      userId,
      fingerprint: input.fingerprint,
      deviceName: input.deviceName ?? null,
      brand: input.brand ?? null,
      manufacturer: input.manufacturer ?? null,
      modelName: input.modelName ?? null,
      deviceType: input.deviceType ?? null,
      osName: input.osName ?? null,
      osVersion: input.osVersion ?? null,
      imei: input.imei ?? null,
      hardwareId: input.hardwareId ?? null,
      isEmulator: input.isEmulator ?? false,
      appVersion: input.appVersion ?? null,
      lastIpAddress: ipAddress ?? null,
      lastSeenAt: now,
    },
    update: {
      deviceName: input.deviceName ?? null,
      brand: input.brand ?? null,
      manufacturer: input.manufacturer ?? null,
      modelName: input.modelName ?? null,
      deviceType: input.deviceType ?? null,
      osName: input.osName ?? null,
      osVersion: input.osVersion ?? null,
      imei: input.imei ?? null,
      hardwareId: input.hardwareId ?? null,
      isEmulator: input.isEmulator ?? false,
      appVersion: input.appVersion ?? null,
      lastIpAddress: ipAddress ?? null,
      lastSeenAt: now,
    },
  });

  return toPublicUserDevice(device);
}

export async function resolveUserDeviceId(
  userId: string,
  deviceId: string | undefined,
): Promise<string | null> {
  if (!deviceId) {
    return null;
  }

  const device = await prisma.userDevice.findFirst({
    where: { id: deviceId, userId },
    select: { id: true },
  });

  return device?.id ?? null;
}

export function getClientIp(req: { headers: { [key: string]: unknown }; ip?: string }): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}

export function getRequestDeviceId(req: { headers: { [key: string]: unknown } }): string | undefined {
  const header = req.headers['x-device-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
