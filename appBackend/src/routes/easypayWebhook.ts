import { Request, Response } from 'express';
import {
  markBookingPaidFromEasypay,
  normalizePartnerWebhookEvent,
  pickPartnerWebhookAmount,
  pickPartnerWebhookBookingId,
  pickPartnerWebhookPaymentId,
} from '../services/easypayBookingPayment';
import { verifyEasypayPartnerWebhook } from '../utils/easypayWebhookVerify';

function readWebhookRawBody(req: Request): Buffer {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  return Buffer.alloc(0);
}

export async function handleEasypayPartnerWebhook(req: Request, res: Response) {
  const secret = (process.env.INTERNAL_PARTNER_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    console.warn('[webhooks/easypay-partner] INTERNAL_PARTNER_WEBHOOK_SECRET not set');
    return res.status(503).json({ error: 'Webhook verifier not configured' });
  }
  const rawBuf = readWebhookRawBody(req);
  const raw = rawBuf.toString('utf8');
  const sig =
    (req.headers['x-easypay-signature'] as string | undefined) ||
    (req.headers['x-webhook-signature'] as string | undefined);
  const verify = verifyEasypayPartnerWebhook(rawBuf, sig, secret);
  if (!verify.ok) {
    console.warn('[webhooks/easypay-partner] invalid signature', {
      reason: verify.reason,
      bodyBytes: rawBuf.length,
      contentType: req.headers['content-type'] || null,
      signaturePrefix: sig?.slice(0, 12) || null,
      expectedSignaturePrefix: verify.ok ? null : verify.expectedSignaturePrefix ?? null,
      signatureHexLen: sig?.replace(/^sha256=/i, '').trim().length ?? 0,
      hint:
        verify.reason === 'digest_mismatch'
          ? 'INTERNAL_PARTNER_WEBHOOK_SECRET on 7-aside must exactly match directPay (not INTERNAL_PARTNER_API_SECRET)'
          : undefined,
    });
    return res.status(401).json({ error: 'Invalid signature' });
  }
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const event = normalizePartnerWebhookEvent(body.event);
  const bookingId = pickPartnerWebhookBookingId(body);
  const paymentId = pickPartnerWebhookPaymentId(body);

  console.log('[webhooks/easypay-partner] received', {
    event: event || 'unknown',
    bookingId: bookingId || null,
    paymentId: paymentId || null,
  });

  try {
    if (event === 'payment.completed' && bookingId) {
      const result = await markBookingPaidFromEasypay(bookingId, {
        source: 'webhook',
        event,
        paymentId,
        webhookAmount: pickPartnerWebhookAmount(body),
        dedupeKey: paymentId ? `${paymentId}:${event}` : null,
      });
      if (result === 'amount_mismatch') {
        return res.status(422).json({ error: 'Payment amount mismatch' });
      }
      if (result === 'not_found') {
        console.warn('[webhooks/easypay-partner] booking not found', { bookingId });
      }
      if (result === 'already_paid') {
        return res.json({ ok: true, duplicate: true });
      }
    } else if (event === 'payment.completed' && !bookingId) {
      console.warn('[webhooks/easypay-partner] payment.completed without booking id', {
        keys: Object.keys(body).join(','),
      });
    }
    return res.json({ ok: true, received: event || 'unknown' });
  } catch (e: any) {
    console.error('[webhooks/easypay-partner] handler error', e?.message || e);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
