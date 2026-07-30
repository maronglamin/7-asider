import crypto from 'node:crypto';

export type EasypayWebhookVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'empty_body' | 'missing_signature' | 'digest_mismatch' | 'invalid_signature_format' };

function readRawBody(rawBody: string | Buffer | undefined | null): Buffer {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
  return Buffer.alloc(0);
}

/** Accept `sha256=<hex>`, bare hex, and case-insensitive hex digests. */
export function parseEasypaySignatureHeader(signatureHeader: string | undefined): string | null {
  const got = (signatureHeader ?? '').trim();
  if (!got) return null;
  const prefixed = got.match(/^sha256=(.+)$/i);
  const hex = (prefixed ? prefixed[1] : got).trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex)) return null;
  return hex;
}

function safeHexEqual(expectedHex: string, gotHex: string): boolean {
  const a = expectedHex.toLowerCase();
  const b = gotHex.toLowerCase();
  if (a.length !== b.length || a.length % 2 !== 0) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function verifyEasypayPartnerWebhook(
  rawBody: string | Buffer | undefined | null,
  signatureHeader: string | undefined,
  secret: string,
): EasypayWebhookVerifyResult {
  const bodyBuf = readRawBody(rawBody);
  if (bodyBuf.length === 0) {
    return { ok: false, reason: 'empty_body' };
  }
  const gotHex = parseEasypaySignatureHeader(signatureHeader);
  if (!gotHex) {
    return { ok: false, reason: signatureHeader?.trim() ? 'invalid_signature_format' : 'missing_signature' };
  }
  const expectedHex = crypto.createHmac('sha256', secret).update(bodyBuf).digest('hex');
  if (!safeHexEqual(expectedHex, gotHex)) {
    return { ok: false, reason: 'digest_mismatch' };
  }
  return { ok: true };
}

export function easypayWebhookSignatureForBody(rawBody: string | Buffer, secret: string): string {
  const bodyBuf = readRawBody(rawBody);
  const hex = crypto.createHmac('sha256', secret).update(bodyBuf).digest('hex');
  return `sha256=${hex}`;
}
