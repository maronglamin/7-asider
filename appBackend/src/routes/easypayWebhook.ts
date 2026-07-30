import { Request, Response } from 'express';
import crypto from 'node:crypto';
import {
  markBookingPaidFromEasypay,
  normalizePartnerWebhookEvent,
  pickPartnerWebhookAmount,
  pickPartnerWebhookBookingId,
  pickPartnerWebhookPaymentId,
} from '../services/easypayBookingPayment';

function verifyEasypayPartnerWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
  const got = (signatureHeader ?? '').trim();
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  } catch {
    return false;
  }
}

export async function handleEasypayPartnerWebhook(req: Request, res: Response) {
  const secret = (process.env.INTERNAL_PARTNER_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    console.warn('[webhooks/easypay-partner] INTERNAL_PARTNER_WEBHOOK_SECRET not set');
    return res.status(503).json({ error: 'Webhook verifier not configured' });
  }
  const raw =
    typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : '';
  const sig = req.headers['x-easypay-signature'] as string | undefined;
  if (!verifyEasypayPartnerWebhook(raw, sig, secret)) {
    console.warn('[webhooks/easypay-partner] invalid signature');
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
