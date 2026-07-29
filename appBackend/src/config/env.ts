const DEV_JWT_SECRET = 'dev_secret_change_me';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function assertSecurityEnv(): void {
  const jwtSecret = (process.env.JWT_SECRET || '').trim();
  if (!jwtSecret || jwtSecret === DEV_JWT_SECRET) {
    const msg = 'JWT_SECRET must be set to a strong random value (not the dev default)';
    if (isProduction()) {
      throw new Error(msg);
    }
    console.warn(`[security] ${msg} — allowed in non-production only`);
  }
  if (isProduction() && !process.env.JWT_EXPIRES_IN?.trim()) {
    console.warn('[security] JWT_EXPIRES_IN is not set — tokens may not expire');
  }
}

export function getJwtSecret(): string {
  return (process.env.JWT_SECRET || DEV_JWT_SECRET).trim() || DEV_JWT_SECRET;
}

export function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS || '';
  const fromEnv = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  if (isProduction()) {
    return ['https://7a-side.phantommetrics.gm'];
  }
  return ['http://localhost:8081', 'http://localhost:19006', 'http://127.0.0.1:8081'];
}

export function getGoogleClientIds(): string[] {
  const raw = process.env.GOOGLE_CLIENT_IDS || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function getAppleClientIds(): string[] {
  const raw = process.env.APPLE_CLIENT_IDS || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
