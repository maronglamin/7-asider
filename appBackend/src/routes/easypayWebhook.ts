import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../db/prisma';

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

type PartnerWebhookPayload = {
  event?: string;
  partnerExternalBookingId?: string;
  paymentId?: string;
  data?: Record<string, unknown>;
};

function pickBookingId(body: PartnerWebhookPayload): string | undefined {
  const nested = body.data && typeof body.data === 'object' ? (body.data as any).partnerExternalBookingId : undefined;
  return (body.partnerExternalBookingId || nested) as string | undefined;
}

function pickPaymentId(body: PartnerWebhookPayload): string | undefined {
  const nested = body.data && typeof body.data === 'object' ? (body.data as any).paymentId : undefined;
  return (body.paymentId || nested) as string | undefined;
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
    return res.status(401).json({ error: 'Invalid signature' });
  }
  let body: PartnerWebhookPayload = {};
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const event = String(body.event || '');
  const bookingId = pickBookingId(body);
  const paymentId = pickPaymentId(body);

  try {
    if (event === 'payment.completed' && bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, paymentStatus: true, totalAmount: true, metadata: true },
      });
      if (booking && booking.paymentStatus !== 'PAID') {
        const meta = (booking.metadata && typeof booking.metadata === 'object' ? booking.metadata : {}) as Record<string, unknown>;
        const easypay = { ...(typeof meta.easypay === 'object' && meta.easypay ? (meta.easypay as object) : {}) } as Record<string, unknown>;
        const webhookAmount = body.data && typeof body.data === 'object' ? (body.data as any).amount : undefined;
        if (webhookAmount != null && Number(webhookAmount) !== Number(booking.totalAmount)) {
          console.warn('[webhooks/easypay-partner] amount mismatch', {
            bookingId,
            expected: booking.totalAmount,
            got: webhookAmount,
          });
          return res.status(422).json({ error: 'Payment amount mismatch' });
        }
        const dedupeKey = paymentId ? `${paymentId}:${event}` : null;
        const seen: string[] = Array.isArray(easypay.webhookDedupe) ? (easypay.webhookDedupe as string[]) : [];
        if (dedupeKey && seen.includes(dedupeKey)) {
          return res.json({ ok: true, duplicate: true });
        }
        if (dedupeKey) {
          easypay.webhookDedupe = [...seen, dedupeKey].slice(-50);
        }
        easypay.lastWebhookEvent = event;
        if (paymentId) easypay.lastPaymentId = paymentId;
        meta.easypay = easypay;
        await prisma.booking.update({
          where: { id: bookingId },
          data: {
            paymentStatus: 'PAID',
            metadata: meta as any,
          },
        });
      }
    }
    // Other events: acknowledge for Easypay retries policy
    return res.json({ ok: true, received: event || 'unknown' });
  } catch (e: any) {
    console.error('[webhooks/easypay-partner] handler error', e?.message || e);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
