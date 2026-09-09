export const DEVICE_FIELD_LIMITS = {
  fingerprint: 128,
  deviceName: 200,
  brand: 100,
  manufacturer: 100,
  modelName: 100,
  deviceType: 100,
  osName: 100,
  osVersion: 100,
  imei: 100,
  hardwareId: 128,
  appVersion: 100,
} as const;

export type DeviceInfoPayload = {
  fingerprint: string;
  deviceName: string | null;
  brand: string | null;
  manufacturer: string | null;
  modelName: string | null;
  deviceType: string | null;
  osName: string | null;
  osVersion: string | null;
  imei: string | null;
  hardwareId: string | null;
  isEmulator: boolean;
  appVersion: string | null;
};

export function truncateDeviceField(value: string | null | undefined, maxLength: number): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function sanitizeDeviceInfo(payload: DeviceInfoPayload): DeviceInfoPayload {
  return {
    fingerprint:
      truncateDeviceField(payload.fingerprint, DEVICE_FIELD_LIMITS.fingerprint) ??
      payload.fingerprint.slice(0, DEVICE_FIELD_LIMITS.fingerprint),
    deviceName: truncateDeviceField(payload.deviceName, DEVICE_FIELD_LIMITS.deviceName),
    brand: truncateDeviceField(payload.brand, DEVICE_FIELD_LIMITS.brand),
    manufacturer: truncateDeviceField(payload.manufacturer, DEVICE_FIELD_LIMITS.manufacturer),
    modelName: truncateDeviceField(payload.modelName, DEVICE_FIELD_LIMITS.modelName),
    deviceType: truncateDeviceField(payload.deviceType, DEVICE_FIELD_LIMITS.deviceType),
    osName: truncateDeviceField(payload.osName, DEVICE_FIELD_LIMITS.osName),
    osVersion: truncateDeviceField(payload.osVersion, DEVICE_FIELD_LIMITS.osVersion),
    imei: truncateDeviceField(payload.imei, DEVICE_FIELD_LIMITS.imei),
    hardwareId: truncateDeviceField(payload.hardwareId, DEVICE_FIELD_LIMITS.hardwareId),
    isEmulator: payload.isEmulator,
    appVersion: truncateDeviceField(payload.appVersion, DEVICE_FIELD_LIMITS.appVersion),
  };
}
