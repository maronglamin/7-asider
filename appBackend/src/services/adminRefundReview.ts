import { prisma } from '../db/prisma';
import { getEasypayOrder, getEasypayPartnerConfig } from './easypayPartner';
import { formatBookingSlotsLabel } from './ownerBookingStatement';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function easypayFromMetadata(metadata: unknown): Record<string, unknown> {
  return asRecord(asRecord(metadata)?.easypay) || {};
}

function mergeEasypayMetadata(existing: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const meta = asRecord(existing) ? { ...asRecord(existing)! } : {};
  meta.easypay = { ...easypayFromMetadata(existing), ...patch };
  return meta;
}

function slotsFromRange(startAt: Date, endAt: Date): { date: Date; hourStart: number }[] {
  if (Number.isNaN(+startAt) || Number.isNaN(+endAt) || endAt <= startAt) return [];
  const units: { date: Date; hourStart: number }[] = [];
  const cursor = new Date(startAt);
  cursor.setUTCMinutes(0, 0, 0);
  while (cursor < endAt && units.length < 24 * 31) {
    units.push({
      date: new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate())),
      hourStart: cursor.getUTCHours(),
    });
    cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0);
  }
  return units;
}

function dashboardBaseUrl(): string | null {
  const raw = (process.env.EASYPAY_DASHBOARD_URL || process.env.EASYPAY_API_BASE_URL || '').trim().replace(/\/$/, '');
  return raw || null;
}

function mapDirectPay(ep: Record<string, unknown>, owner: { easypayBusinessId?: string | null; easypaySlug?: string | null }) {
  const businessId = pickString(ep, ['businessId']) || owner.easypayBusinessId || null;
  const base = dashboardBaseUrl();
  return {
    businessId,
    merchantSlug: owner.easypaySlug || pickString(ep, ['slug']) || null,
    orderId: pickString(ep, ['orderId']),
    orderPublicCode: pickString(ep, ['orderPublicCode', 'publicCode']),
    lastPaymentId: pickString(ep, ['lastPaymentId', 'paymentId']),
    lastPaidAt: pickString(ep, ['lastPaidAt']),
    lastPaidSource: pickString(ep, ['lastPaidSource']),
    lastWebhookEvent: pickString(ep, ['lastWebhookEvent']),
    category: pickString(ep, ['category']),
    pendingRefundAt: pickString(ep, ['pendingRefundAt']),
    refundedAt: pickString(ep, ['refundedAt']),
    refundNote: pickString(ep, ['refundNote']),
    dashboardUrl: base,
  };
}

const BOOKING_INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
  units: { select: { date: true, hourStart: true } },
  field: {
    select: {
      id: true,
      name: true,
      city: true,
      phone: true,
      user: { select: { id: true, name: true, email: true, easypayBusinessId: true, easypaySlug: true } },
    },
  },
} as const;

function toRefundItem(booking: any) {
  const ep = easypayFromMetadata(booking.metadata);
  const owner = booking.field?.user || {};
  const startAt = booking.startAt ? new Date(booking.startAt) : new Date(NaN);
  const endAt = booking.endAt ? new Date(booking.endAt) : new Date(NaN);
  return {
    id: booking.id,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    totalAmount: booking.totalAmount != null ? Number(booking.totalAmount) : 0,
    currency: booking.currency || 'GMD',
    type: booking.type,
    startAt: booking.startAt,
    endAt: booking.endAt,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    slotsLabel:
      pickString(ep, ['slotsLabel']) ||
      formatBookingSlotsLabel(booking.units, booking.type) ||
      formatBookingSlotsLabel(slotsFromRange(startAt, endAt), booking.type),
    customer: {
      id: booking.user?.id || booking.userId,
      name: booking.user?.name || null,
      email: booking.user?.email || null,
    },
    field: {
      id: booking.field?.id || booking.fieldId,
      name: booking.field?.name || 'Field',
      city: booking.field?.city || null,
      phone: booking.field?.phone || null,
    },
    owner: {
      id: owner.id || null,
      name: owner.name || null,
      email: owner.email || null,
    },
    directPay: mapDirectPay(ep, owner),
  };
}

export async function listPendingRefundBookings() {
  const rows = await prisma.booking.findMany({
    where: { status: 'PENDING_REFUND' as any },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: BOOKING_INCLUDE,
  });
  return {
    count: rows.length,
    items: rows.map(toRefundItem),
  };
}

export async function getPendingRefundBooking(id: string) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: BOOKING_INCLUDE,
  });
  if (!booking) return null;
  const item = toRefundItem(booking);
  const businessId = item.directPay.businessId;
  const orderId = item.directPay.orderId;
  let liveOrder: { status: string; paymentStatus: string; publicCode: string; paymentId: string | null } | null = null;
  let liveOrderError: string | null = null;
  if (businessId && orderId && getEasypayPartnerConfig().configured) {
    try {
      const order = await getEasypayOrder(businessId, orderId);
      liveOrder = {
        status: order.status || '',
        paymentStatus: order.paymentStatus || '',
        publicCode: order.publicCode || '',
        paymentId: order.paymentId != null ? String(order.paymentId) : null,
      };
    } catch (e: any) {
      liveOrderError = e?.message || 'Could not load the directPay order';
    }
  }
  return { ...item, liveOrder, liveOrderError };
}

export async function markBookingRefunded(opts: {
  bookingId: string;
  adminUserId: string;
  note?: string | null;
}) {
  const booking = await prisma.booking.findUnique({ where: { id: opts.bookingId } });
  if (!booking) {
    throw Object.assign(new Error('Booking not found'), { status: 404 });
  }
  if (String(booking.status).toUpperCase() !== 'PENDING_REFUND') {
    throw Object.assign(new Error('This booking is not waiting for a refund.'), { status: 409 });
  }
  const note = String(opts.note || '').trim().slice(0, 500) || null;
  const metadata = mergeEasypayMetadata(booking.metadata, {
    refundedAt: new Date().toISOString(),
    refundedByUserId: opts.adminUserId,
    refundNote: note,
  });
  const updated = await prisma.booking.update({
    where: { id: opts.bookingId },
    data: {
      status: 'CANCELLED' as any,
      paymentStatus: 'REFUNDED' as any,
      metadata: metadata as any,
    },
    include: BOOKING_INCLUDE,
  });
  return toRefundItem(updated);
}

export function stampOwnerPendingRefundMetadata(
  existing: unknown,
  extra?: { slotsLabel?: string | null; pendingRefundBy?: string | null },
): Record<string, unknown> {
  const slotsLabel = String(extra?.slotsLabel || '').trim();
  const pendingRefundBy = String(extra?.pendingRefundBy || 'owner').trim() || 'owner';
  return mergeEasypayMetadata(existing, {
    pendingRefundAt: new Date().toISOString(),
    pendingRefundBy,
    ...(slotsLabel ? { slotsLabel } : {}),
  });
}
