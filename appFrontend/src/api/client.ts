import Constants from 'expo-constants';
import { getRegisteredDeviceId } from '../utils/device-storage';
import { collectDeviceInfo, type DeviceInfoPayload } from '../utils/device-info';

const PRODUCTION_API_BASE = 'https://seven-aside.phantommetrics.gm';
export const API_BASE = (Constants?.expoConfig?.extra as any)?.API_BASE || PRODUCTION_API_BASE;
if (__DEV__) console.log('[API client] API_BASE =', API_BASE);

export function resolveMediaUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  const value = String(pathOrUrl).trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_BASE}${value.startsWith('/') ? value : `/${value}`}`;
}

async function withDeviceHeaders(headers: Record<string, string> = {}): Promise<Record<string, string>> {
  const next = { ...headers };
  const deviceId = await getRegisteredDeviceId();
  if (deviceId) next['X-Device-Id'] = deviceId;
  return next;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'GET' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function apiGetAuth<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: await withDeviceHeaders({
      Authorization: `Bearer ${token}`,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function apiGetAuthPdf(
  path: string,
  token: string,
): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: await withDeviceHeaders({
      Authorization: `Bearer ${token}`,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  const disposition = res.headers.get('content-disposition') || '';
  const matched = disposition.match(/filename="([^"]+)"/);
  return {
    buffer: await res.arrayBuffer(),
    filename: matched?.[1] || '7a-side-booking-statement.pdf',
  };
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function apiPostWithDevice<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const device = await collectDeviceInfo();
  return apiPost<T>(path, { ...body, device });
}

export async function apiPostAuth<T>(path: string, body: any, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: await withDeviceHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function apiPostMultipartAuth<T>(path: string, form: FormData, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: await withDeviceHeaders({
      Authorization: `Bearer ${token}`,
    }),
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let errMsg: string = 'Request failed';
    try {
      const json = JSON.parse(errText);
      errMsg = json.error || errMsg;
    } catch (_) {
      errMsg = `${errMsg}: ${res.status}`;
    }
    throw new Error(errMsg);
  }
  const raw = await res.text().catch(() => '');
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('Invalid response from server');
  }
}

export async function apiPatchAuth<T>(path: string, body: any, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: await withDeviceHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function registerCurrentDevice(
  token: string,
): Promise<{ device: { id: string } }> {
  const device = await collectDeviceInfo();
  return apiPostAuth<{ device: { id: string } }>('/auth/register-device', device, token);
}

export async function updateDeviceLock(
  token: string,
  enabled: boolean,
  device?: DeviceInfoPayload,
): Promise<{ user: Record<string, unknown>; device?: { id: string } }> {
  return apiPatchAuth('/auth/device-lock', { enabled, device }, token);
}

export async function apiDeleteAuth<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: await withDeviceHeaders({
      Authorization: `Bearer ${token}`,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    return { ok: true } as any;
  }
}
