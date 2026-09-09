import Constants from 'expo-constants';

import { getOrCreateDeviceFingerprint } from './deviceFingerprint';
import { sanitizeDeviceInfo, type DeviceInfoPayload } from './deviceTypes';

export type { DeviceInfoPayload } from './deviceTypes';

function browserName(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}

function osFromUserAgent(ua: string): { osName: string; osVersion: string | null } {
  const win = ua.match(/Windows NT ([0-9.]+)/);
  if (win?.[1]) return { osName: 'Windows', osVersion: win[1] };
  const mac = ua.match(/Mac OS X ([0-9_]+)/);
  if (mac?.[1]) return { osName: 'macOS', osVersion: mac[1].replace(/_/g, '.') };
  const ios = ua.match(/OS ([0-9_]+) like Mac OS X/);
  if (ios?.[1]) return { osName: 'iOS', osVersion: ios[1].replace(/_/g, '.') };
  const android = ua.match(/Android ([0-9.]+)/);
  if (android?.[1]) return { osName: 'Android', osVersion: android[1] };
  if (/CrOS/.test(ua)) return { osName: 'Chrome OS', osVersion: null };
  if (/Linux/.test(ua)) return { osName: 'Linux', osVersion: null };
  return { osName: 'Web', osVersion: null };
}

export async function collectDeviceInfo(): Promise<DeviceInfoPayload> {
  const fingerprint = await getOrCreateDeviceFingerprint();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const os = osFromUserAgent(ua);
  const name = browserName(ua);
  const version = Constants.expoConfig?.version || null;

  return sanitizeDeviceInfo({
    fingerprint,
    deviceName: name,
    brand: null,
    manufacturer: null,
    modelName: name,
    deviceType: 'web',
    osName: os.osName,
    osVersion: os.osVersion,
    imei: null,
    hardwareId: `web:${fingerprint}`,
    isEmulator: false,
    appVersion: version,
  });
}
