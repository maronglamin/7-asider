import { prisma } from '../db/prisma';
import { createEasypayOrder, getEasypayOrder, getEasypayPartnerConfig, type EasypayPartnerOrder } from './easypayPartner';

type JsonRecord = Record<string, unknown>;

/** Avoid hammering directPay when it is down (ECONNREFUSED from this server). */
let easypaySyncPausedUntilMs = 0;
const EASYPAY_SYNC_PAUSE_MS = 60_000;

function easypaySyncPaused(): boolean {
  return Date.now() < easypaySyncPausedUntilMs;
}

function pauseEasypaySync(reason: string): void {
  easypaySyncPausedUntilMs = Date.now() + EASYPAY_SYNC_PAUSE_MS;
  console.warn('[easypay sync] paused', { reason, resumeInSec: EASYPAY_SYNC_PAUSE_MS / 1000 });
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function pickString(obj: JsonRecord | null | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

/** Easypay partner webhooks may use camelCase or snake_case, top-level or under `data`. */
export function pickPartnerWebhookBookingId(body: JsonRecord): string | undefined {
  const data = asRecord(body.data);
  return (
    pickString(body, ['partnerExternalBookingId', 'partner_external_booking_id', 'externalBookingId']) ||
    pickString(data, ['partnerExternalBookingId', 'partner_external_booking_id', 'externalBookingId', 'bookingId'])
  );
}

export function pickPartnerWebhookPaymentId(body: JsonRecord): string | undefined {
  const data = asRecord(body.data);
  return pickString(body, ['paymentId', 'payment_id']) || pickString(data, ['paymentId', 'payment_id']);
}

export function pickPartnerWebhookAmount(body: JsonRecord): unknown {
  const data = asRecord(body.data);
  return body.amount ?? body.amountGmd ?? body.amount_gmd ?? data?.amount ?? data?.amountGmd ?? data?.amount_gmd;
}

export function normalizePartnerWebhookEvent(raw: unknown): string {
  return String(raw || '')
    .trim()
    .replace(/_/g, '.')
    .toLowerCase();
}

export function partnerWebhookAmountsMatch(expected: unknown, got: unknown): boolean {
  if (got == null) return true;
  const a = Number(expected);
  const b = Number(got);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) < 0.01;
}

function easypayMetaFromBooking(metadata: unknown): JsonRecord {
  const meta = asRecord(metadata) || {};
  const ep = asRecord(meta.easypay);
  return ep || {};
}

export function isEasypayOrderPaid(order: EasypayPartnerOrder | JsonRecord): boolean {
  const status = String(order.status ?? order.orderStatus ?? order.order_status ?? '')
    .trim()
    .toUpperCase();
  if (['PAID', 'COMPLETED', 'FULFILLED', 'SUCCESS', 'SUCCEEDED'].includes(status)) return true;
  const paymentStatus = String(order.paymentStatus ?? order.payment_status ?? '')
    .trim()
    .toUpperCase();
  if (['PAID', 'COMPLETED', 'SUCCESS', 'SUCCEEDED'].includes(paymentStatus)) return true;
  return false;
}

export async function markBookingPaidFromEasypay(
  bookingId: string,
  opts: {
    source: 'webhook' | 'sync';
    event?: string;
    paymentId?: string;
    webhookAmount?: unknown;
    dedupeKey?: string | null;
  },
): Promise<'paid' | 'already_paid' | 'amount_mismatch' | 'not_found'> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, paymentStatus: true, totalAmount: true, metadata: true },
  });
  if (!booking) return 'not_found';
  if (String(booking.paymentStatus || '').toUpperCase() === 'PAID') return 'already_paid';

  if (opts.webhookAmount != null && !partnerWebhookAmountsMatch(booking.totalAmount, opts.webhookAmount)) {
    console.warn('[easypay] amount mismatch', {
      bookingId,
      expected: booking.totalAmount,
      got: opts.webhookAmount,
      source: opts.source,
    });
    return 'amount_mismatch';
  }

  const meta = asRecord(booking.metadata) || {};
  const easypay = { ...easypayMetaFromBooking(booking.metadata) };
  const dedupeKey = opts.dedupeKey ?? (opts.paymentId && opts.event ? `${opts.paymentId}:${opts.event}` : null);
  const seen: string[] = Array.isArray(easypay.webhookDedupe) ? (easypay.webhookDedupe as string[]) : [];
  if (dedupeKey && seen.includes(dedupeKey)) {
    return 'already_paid';
  }
  if (dedupeKey) {
    easypay.webhookDedupe = [...seen, dedupeKey].slice(-50);
  }
  if (opts.event) easypay.lastWebhookEvent = opts.event;
  if (opts.paymentId) easypay.lastPaymentId = opts.paymentId;
  easypay.lastPaidSource = opts.source;
  easypay.lastPaidAt = new Date().toISOString();
  meta.easypay = easypay;

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus: 'PAID',
      metadata: meta as any,
    },
  });
  return 'paid';
}

export function isEasypayPartnerAlreadyPaidMessage(message: unknown): boolean {
  return /already paid|partner.*booking.*paid|partnerexternalbookingid.*paid/i.test(String(message || ''));
}

export async function syncBookingPaymentFromEasypay(booking: {
  id: string;
  paymentStatus: string;
  totalAmount?: unknown;
  currency?: string | null;
  metadata: unknown;
}): Promise<'paid' | 'unchanged' | 'skipped'> {
  if (String(booking.paymentStatus || '').toUpperCase() === 'PAID') return 'unchanged';
  if (!getEasypayPartnerConfig().configured) return 'skipped';
  if (easypaySyncPaused()) return 'skipped';

  const ep = easypayMetaFromBooking(booking.metadata);
  const businessId = pickString(ep, ['businessId']);
  const orderId = pickString(ep, ['orderId']);
  if (!businessId || !orderId) return 'skipped';

  try {
    let order: EasypayPartnerOrder | null = null;
    try {
      order = await getEasypayOrder(businessId, orderId);
    } catch (getErr: any) {
      const amountGmd = Number(booking.totalAmount);
      if (getErr?.status === 404 && Number.isFinite(amountGmd) && amountGmd > 0) {
        order = await createEasypayOrder(businessId, {
          partnerExternalBookingId: booking.id,
          amountGmd,
          currency: booking.currency || 'GMD',
        });
      } else {
        throw getErr;
      }
    }
    if (!order || !isEasypayOrderPaid(order)) return 'unchanged';
    const paymentId =
      pickString(order as JsonRecord, ['paymentId', 'payment_id', 'lastPaymentId']) ||
      undefined;
    const result = await markBookingPaidFromEasypay(booking.id, {
      source: 'sync',
      event: 'payment.completed',
      paymentId,
    });
    return result === 'paid' ? 'paid' : 'unchanged';
  } catch (e: any) {
    const message = String(e?.message || e);
    if (e?.code === 'EASYPAY_UNREACHABLE' || /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT/i.test(message)) {
      pauseEasypaySync(message);
    } else {
      console.warn('[easypay sync] failed', { bookingId: booking.id, message });
    }
    return 'skipped';
  }
}
