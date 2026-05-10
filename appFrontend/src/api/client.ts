import Constants from 'expo-constants';

// Fallback must be production HTTPS so real device builds never use localhost (which fails off-emulator)
const PRODUCTION_API_BASE = 'https://seven-aside.phantommetrics.gm';
export const API_BASE = (Constants?.expoConfig?.extra as any)?.API_BASE || PRODUCTION_API_BASE;
// Log once so you can confirm in emulator that sign-in/up hit the intended backend
if (__DEV__) console.log('[API client] API_BASE =', API_BASE);

export function resolveMediaUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  const value = String(pathOrUrl).trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_BASE}${value.startsWith('/') ? value : `/${value}`}`;
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
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
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

export async function apiPostAuth<T>(path: string, body: any, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
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
    headers: {
      // Let fetch set the correct content-type with boundary
      Authorization: `Bearer ${token}`,
    },
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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function apiDeleteAuth<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  // Some deletes return empty; try parsing JSON, fallback to ok:true
  try {
    return await res.json();
  } catch {
    return { ok: true } as any;
  }
}


