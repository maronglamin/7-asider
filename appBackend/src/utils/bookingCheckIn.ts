import crypto from 'crypto';

const PREFIX = '7ASIDE_CHECKIN';
const VERSION = 'v1';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

export function newCheckInToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function buildCheckInPayload(bookingId: string, token: string): string {
  return `${PREFIX}:${VERSION}:${bookingId}:${token}`;
}

export function parseCheckInPayload(raw: unknown): { bookingId: string; token: string } | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const parts = s.split(':');
  if (parts.length >= 4 && parts[0] === PREFIX && parts[1] === VERSION) {
    const bookingId = String(parts[2] || '').trim();
    const token = parts.slice(3).join(':').trim();
    if (bookingId && token) return { bookingId, token };
  }
  return null;
}

export function checkInTokenFromMetadata(metadata: unknown): string | undefined {
  const meta = asRecord(metadata);
  const checkIn = asRecord(meta?.checkIn);
  const token = checkIn?.token;
  if (typeof token === 'string' && token.trim()) return token.trim();
  return undefined;
}

export function withCheckInToken(metadata: unknown, token: string): JsonRecord {
  const meta = asRecord(metadata) ? { ...(asRecord(metadata) as JsonRecord) } : {};
  const prev = asRecord(meta.checkIn) ? { ...(asRecord(meta.checkIn) as JsonRecord) } : {};
  meta.checkIn = {
    ...prev,
    token,
    createdAt: typeof prev.createdAt === 'string' ? prev.createdAt : new Date().toISOString(),
  };
  return meta;
}

/** Never send the check-in secret to clients except the dedicated booker endpoint. */
export function sanitizeBookingMetadata(metadata: unknown): unknown {
  const meta = asRecord(metadata);
  if (!meta || !('checkIn' in meta)) return metadata ?? null;
  const { checkIn: _omit, ...rest } = meta;
  return rest;
}

export function checkInTokensMatch(expected: string, got: string): boolean {
  const a = crypto.createHash('sha256').update(String(expected || '')).digest();
  const b = crypto.createHash('sha256').update(String(got || '')).digest();
  return crypto.timingSafeEqual(a, b);
}
