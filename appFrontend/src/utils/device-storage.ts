import { deleteAuthStorageItem, getAuthStorageItem, setAuthStorageItem } from './authStorage';

const DEVICE_ID_KEY = '7aside_registered_device_id';

export async function getRegisteredDeviceId(): Promise<string | null> {
  return getAuthStorageItem(DEVICE_ID_KEY);
}

export async function setRegisteredDeviceId(deviceId: string): Promise<void> {
  await setAuthStorageItem(DEVICE_ID_KEY, deviceId);
}

export async function clearRegisteredDeviceId(): Promise<void> {
  await deleteAuthStorageItem(DEVICE_ID_KEY);
}
