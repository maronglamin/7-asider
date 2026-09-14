const TOKEN_KEY = '7aside_admin_token';
const PREAUTH_KEY = '7aside_admin_preauth';

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getPreAuthToken(): string | null {
  return sessionStorage.getItem(PREAUTH_KEY);
}

export function setPreAuthToken(token: string): void {
  sessionStorage.setItem(PREAUTH_KEY, token);
}

export function clearPreAuthToken(): void {
  sessionStorage.removeItem(PREAUTH_KEY);
}

export function clearAdminSession(): void {
  clearAdminToken();
  clearPreAuthToken();
}
