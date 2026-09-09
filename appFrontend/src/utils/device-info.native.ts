import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { getOrCreateDeviceFingerprint } from './deviceFingerprint';
import { sanitizeDeviceInfo, type DeviceInfoPayload } from './deviceTypes';

export type { DeviceInfoPayload } from './deviceTypes';

const DEVICE_TYPE_LABELS: Record<number, string> = {
  0: 'unknown',
  1: 'phone',
  2: 'tablet',
  3: 'desktop',
  4: 'tv',
};

async function getHardwareId(): Promise<string | null> {
  if (Platform.OS === 'android') {
    return Application.getAndroidId();
  }
  if (Platform.OS === 'ios') {
    return Application.getIosIdForVendorAsync();
  }
  return null;
}

function getDeviceTypeLabel(): string | null {
  if (Device.deviceType == null) {
    return null;
  }
  return DEVICE_TYPE_LABELS[Device.deviceType] ?? 'unknown';
}

export async function collectDeviceInfo(): Promise<DeviceInfoPayload> {
  const [fingerprint, hardwareId] = await Promise.all([
    getOrCreateDeviceFingerprint(),
    getHardwareId(),
  ]);

  return sanitizeDeviceInfo({
    fingerprint,
    deviceName: Device.deviceName,
    brand: Device.brand,
    manufacturer: Device.manufacturer,
    modelName: Device.modelName,
    deviceType: getDeviceTypeLabel(),
    osName: Device.osName,
    osVersion: Device.osVersion,
    imei: null,
    hardwareId,
    isEmulator: Device.isDevice === false,
    appVersion: Application.nativeApplicationVersion,
  });
}
