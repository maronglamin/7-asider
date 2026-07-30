/**
 * Verify a directPay partner webhook signature locally.
 *
 * Usage:
 *   npm run diagnose:easypay-webhook -- '{"event":"payment.completed","partnerExternalBookingId":"..."}' 'sha256=abc...'
 *
 * Omit the signature to print the expected value for the payload + INTERNAL_PARTNER_WEBHOOK_SECRET.
 */
import dotenv from 'dotenv';
import {
  easypayWebhookSignatureForBody,
  parseEasypaySignatureHeader,
  verifyEasypayPartnerWebhook,
} from '../utils/easypayWebhookVerify';

dotenv.config();

const rawBody = process.argv[2] ?? '{"event":"payment.completed","partnerExternalBookingId":"test-booking"}';
const sigArg = process.argv[3];
const secret = (process.env.INTERNAL_PARTNER_WEBHOOK_SECRET || '').trim();

if (!secret) {
  console.error('INTERNAL_PARTNER_WEBHOOK_SECRET is not set in .env');
  process.exit(1);
}

const expected = easypayWebhookSignatureForBody(rawBody, secret);
console.log('payload bytes:', Buffer.byteLength(rawBody, 'utf8'));
console.log('expected header:', expected);

if (sigArg) {
  const parsed = parseEasypaySignatureHeader(sigArg);
  const result = verifyEasypayPartnerWebhook(rawBody, sigArg, secret);
  console.log('provided header:', sigArg);
  console.log('parsed hex len:', parsed?.length ?? 0);
  console.log('verify:', result.ok ? 'OK' : result.reason);
  process.exit(result.ok ? 0 : 1);
}
