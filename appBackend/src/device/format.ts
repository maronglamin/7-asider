import type { DeviceInfoInput } from './service';

export type OtpEmailDeviceSummary = {
  deviceLabel: string;
  systemLabel: string;
  plainLines: string[];
};

export function formatDeviceForOtpEmail(device: DeviceInfoInput): OtpEmailDeviceSummary {
  const isWeb = (device.deviceType || '').toLowerCase() === 'web';
  const deviceLabel =
    device.deviceName?.trim() ||
    [device.brand, device.modelName].filter(Boolean).join(' ').trim() ||
    (isWeb ? 'Web browser' : 'Phone or tablet');

  const systemLabel =
    [device.osName, device.osVersion].filter(Boolean).join(' ').trim() ||
    (isWeb ? 'Web browser' : 'Unknown phone system');

  const plainLines = [
    `Device: ${deviceLabel}`,
    `System: ${systemLabel}`,
  ];

  if (device.isEmulator) {
    plainLines.push('Type: Test device (emulator)');
  }

  return {
    deviceLabel,
    systemLabel,
    plainLines,
  };
}
