import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { prisma } from '../db/prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { ensureUploadDirectory, uploadPath } from '../utils/uploads';
import {
  authorizeEasypayApsWallet,
  cancelEasypayOrder,
  completeEasypayApsWallet,
  createEasypayOrder,
  getEasypayPartnerConfig,
  listEasypayWallets,
  easypayGatewayCodeNeedsPayerPhone,
  startEasypayWalletCheckout,
} from '../services/easypayPartner';

const router = Router();

// Uploads: receipts
const receiptDir = ensureUploadDirectory(uploadPath('receipts'));
const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => {
    try {
      cb(null, ensureUploadDirectory(receiptDir));
    } catch (error) {
      cb(error as Error, receiptDir);
    }
  },
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '');
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${base || 'receipt'}_${unique}${ext}`);
  },
});
const upload = multer({ storage });

function imageBaseUrl(): string {
  const base = (process.env.API_BASE || '').replace(/\/$/, '');
  return base || 'https://seven-aside.phantommetrics.gm';
}

// Helpers
function toUtcMidnight(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00.000Z');
  return d;
}

function clampHour(n: any): number {
  const x = Number(n);
  if (!isFinite(x)) return 0;
  return Math.min(23, Math.max(0, Math.floor(x)));
}

function mergeBookingEasypayMetadata(existing: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const meta =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const prevEp =
    meta.easypay && typeof meta.easypay === 'object' && !Array.isArray(meta.easypay)
      ? { ...(meta.easypay as Record<string, unknown>) }
      : {};
  meta.easypay = { ...prevEp, ...patch };
  return meta;
}

/** Persist Easypay order id on booking if missing (same as wallet flow). */
async function ensureEasypayOrderIdOnBooking(
  bookingId: string,
  booking: any,
  ownerBusinessId: string,
): Promise<{ orderId: string; latestMeta: unknown }> {
  const meta = booking.metadata && typeof booking.metadata === 'object' ? booking.metadata : {};
  let orderId = (meta as any)?.easypay?.orderId as string | undefined;
  let latestMeta: unknown = booking.metadata;
  if (orderId && String(orderId).trim() !== '') {
    return { orderId: String(orderId).trim(), latestMeta };
  }
  const amountGmd = Number(booking.totalAmount);
  if (!Number.isFinite(amountGmd) || amountGmd <= 0) {
    throw new Error('Invalid booking amount for Easypay order');
  }
  const order = await createEasypayOrder(ownerBusinessId, {
    partnerExternalBookingId: bookingId,
    amountGmd,
    currency: booking.currency || 'GMD',
  });
  latestMeta = mergeBookingEasypayMetadata(booking.metadata, {
    businessId: ownerBusinessId,
    orderId: order.id,
    orderPublicCode: order.publicCode,
    orderStatus: order.status,
    lastPrepareAt: new Date().toISOString(),
  });
  await (prisma as any).booking.update({
    where: { id: bookingId },
    data: { metadata: latestMeta as any },
  });
  return { orderId: order.id, latestMeta };
}

function resolveBookingType(kind: any): 'HOURLY'|'FULL_DAY'|'MULTI_DAY'|'CUSTOM' {
  if (String(kind).toUpperCase() === 'FULL_DAY') return 'FULL_DAY';
  if (String(kind).toUpperCase() === 'MULTI_DAY') return 'MULTI_DAY';
  if (String(kind).toUpperCase() === 'CUSTOM') return 'CUSTOM';
  return 'HOURLY';
}

function buildBookingPlan(input: any, field: any, opts?: { allowNonApprovedField?: boolean }) {
  const {
    fieldId,
    kind,
    date,
    dates,
    startHour,
    hours,
    timezone,
    note,
  } = input || {};

  const resolvedFieldId = fieldId || field?.id;
  if (!resolvedFieldId) throw new Error('fieldId is required');
  if (!field) throw new Error('Field not found');
  if (!opts?.allowNonApprovedField && field.status !== 'APPROVED') throw new Error('Field not available for booking');

  const bookingType = resolveBookingType(kind);
  const pricePerHour: number = field.pricePerHour != null ? Number(field.pricePerHour) : 0;
  if (!isFinite(pricePerHour) || pricePerHour < 0) {
    throw new Error('Invalid field pricing');
  }

  const units: { date: Date; hourStart: number }[] = [];
  if (bookingType === 'FULL_DAY') {
    const ds = Array.isArray(dates) ? dates : (date ? [date] : []);
    if (ds.length < 1) throw new Error('dates required for FULL_DAY');
    for (const d of ds) {
      const day = toUtcMidnight(d);
      for (let h = 0; h < 24; h++) units.push({ date: day, hourStart: h });
    }
  } else if (bookingType === 'MULTI_DAY') {
    const ds = Array.isArray(dates) ? dates : [];
    if (ds.length < 1) throw new Error('dates required for MULTI_DAY');
    for (const d of ds) {
      const day = toUtcMidnight(d);
      for (let h = 0; h < 24; h++) units.push({ date: day, hourStart: h });
    }
  } else {
    if (!date) throw new Error('date is required');
    const start = clampHour(startHour);
    const total = Math.max(1, Math.min(24, Number(hours) || 1));
    if (start + total > 24) throw new Error('Selected range exceeds day boundary');
    const day = toUtcMidnight(date);
    for (let h = 0; h < total; h++) units.push({ date: day, hourStart: start + h });
  }

  if (units.length === 0) throw new Error('No booking units computed');

  const sorted = [...units].sort((a, b) => a.date.getTime() - b.date.getTime() || a.hourStart - b.hourStart);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const startAt = new Date(first.date);
  startAt.setUTCHours(first.hourStart, 0, 0, 0);
  const endAt = new Date(last.date);
  endAt.setUTCHours(last.hourStart + 1, 0, 0, 0);

  return {
    fieldId: resolvedFieldId,
    bookingType,
    units,
    startAt,
    endAt,
    totalAmount: pricePerHour * units.length,
    timezone,
    note,
  };
}

/** Slot conflicts use BookingUnit rows; only PENDING/CONFIRMED bookings should hold slots. */
const ACTIVE_BOOKING_STATUSES = ['PENDING', 'CONFIRMED'] as const;

/**
 * Remove BookingUnit rows for CANCELLED/COMPLETED bookings that occupy the given slots,
 * so the unique (fieldId, date, hourStart) constraint can accept a new reservation.
 */
async function deleteStaleBookingUnitsForSlots(
  tx: any,
  fieldId: string,
  units: { date: Date; hourStart: number }[],
) {
  if (!units.length) return;
  await tx.bookingUnit.deleteMany({
    where: {
      fieldId,
      booking: { status: { in: ['CANCELLED', 'COMPLETED'] } },
      OR: units.map((u) => ({ date: u.date, hourStart: u.hourStart })),
    },
  });
}

// POST /bookings - create a booking
// Body variants:
// - Hours-based: { fieldId, kind: 'HOURLY'|'CUSTOM', date: 'YYYY-MM-DD', startHour, hours, timezone? }
// - Full-day:    { fieldId, kind: 'FULL_DAY', dates: ['YYYY-MM-DD'] }
// - Multi-day:   { fieldId, kind: 'MULTI_DAY', dates: ['YYYY-MM-DD', ...] }
router.post('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { fieldId } = req.body as any;

    if (!fieldId) return res.status(400).json({ error: 'fieldId is required' });
    console.log('[POST /bookings] user:', userId, 'body:', req.body);
    const field = await (prisma as any).fieldKyc.findUnique({
      where: { id: fieldId },
      select: {
        id: true,
        name: true,
        userId: true,
        status: true,
        pricePerHour: true,
      },
    });
    if (!field) return res.status(404).json({ error: 'Field not found' });
    const {
      bookingType,
      units,
      startAt,
      endAt,
      totalAmount,
      timezone,
      note,
    } = buildBookingPlan(req.body, field);

    // Transaction with conflict safety on BookingUnit unique index
    console.log('[POST /bookings] units:', units.length, 'first:', units[0], 'last:', units[units.length - 1], 'totalAmount:', totalAmount);
    const result = await (prisma as any).$transaction(async (tx: any) => {
      const booking = await tx.booking.create({
        data: {
          userId,
          fieldId,
          type: bookingType,
          startAt,
          endAt,
          timezone: timezone || null,
          totalAmount,
          currency: 'GMD',
          status: 'CONFIRMED',
          paymentStatus: 'UNPAID',
          note: note || null,
        },
      });

      await deleteStaleBookingUnitsForSlots(tx, fieldId, units);

      await tx.bookingUnit.createMany({
        data: units.map((u) => ({
          bookingId: booking.id,
          fieldId,
          date: u.date,
          hourStart: u.hourStart,
        })),
        skipDuplicates: false, // rely on unique constraint to fail on conflict
      });

      return booking;
    });

    console.log('[POST /bookings] created booking id:', result.id);

    const booker = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const bookerLabel = (booker?.name && String(booker.name).trim()) || booker?.email || 'A customer';
    const { notifyNewBookingPushes } = await import('../services/pushNotifications');
    void notifyNewBookingPushes({
      fieldOwnerUserId: field.userId,
      bookerUserId: userId,
      fieldName: field.name || 'Your field',
      bookingId: result.id,
      bookerLabel,
    }).catch((err) => console.warn('[POST /bookings] booking push failed', err));

    res.json({ ok: true, bookingId: result.id, totalAmount });
  } catch (e: any) {
    if (e.code === 'P2002') {
      // Unique constraint failed -> time conflict
      console.warn('[POST /bookings] conflict:', e?.meta || e?.message || e);
      return res.status(409).json({ error: 'Time conflict. Some slots are already booked.' });
    }
    const message = e?.message || 'Failed to create booking';
    const badRequestMessages = new Set([
      'Field not available for booking',
      'Invalid field pricing',
      'dates required for FULL_DAY',
      'dates required for MULTI_DAY',
      'date is required',
      'Selected range exceeds day boundary',
      'No booking units computed',
    ]);
    if (badRequestMessages.has(message)) {
      return res.status(400).json({ error: message });
    }
    console.error('[POST /bookings] error:', e);
    res.status(500).json({ error: message });
  }
});

// GET /bookings/mine?limit=10&cursor=<id>
router.get('/mine', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const cursor = (req.query.cursor as string | undefined) || undefined;
    const qRaw = (req.query.q as string | undefined) || '';
    const q = qRaw.trim();
    const month = (req.query.month as string | undefined)?.trim(); // 'YYYY-MM'
    const startParam = (req.query.start as string | undefined)?.trim();
    const endParam = (req.query.end as string | undefined)?.trim();

    let timeFilter: any = {};
    // month filter
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map((s) => Number(s));
      const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
      timeFilter = { startAt: { gte: start }, endAt: { lt: end } };
    } else if (startParam || endParam) {
      const start = startParam ? new Date(startParam) : undefined;
      const end = endParam ? new Date(endParam) : undefined;
      timeFilter = {
        ...(start ? { startAt: { gte: start } } : {}),
        ...(end ? { endAt: { lte: end } } : {}),
      };
    }

    const results = await (prisma as any).booking.findMany({
        where: {
        userId,
        ...(q
          ? {
              field: { name: { contains: q, mode: 'insensitive' } },
            }
          : {}),
        ...timeFilter,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        field: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            status: true,
            rejectionReason: true,
            suspensionReason: true,
            images: { select: { url: true, order: true }, orderBy: { order: 'asc' }, take: 1 },
            pricePerHour: true,
            userId: true,
          },
        },
        _count: { select: { PaymentReceipt: true } },
      },
    });

    let nextCursor: string | null = null;
    let items = results;
    if (results.length > limit) {
      nextCursor = results[results.length - 1].id;
      items = results.slice(0, limit);
    }
    // Map response to include hasReceipt and strip prisma _count helper
    const mapped = items.map((b: any) => {
      const { _count, ...rest } = b;
      return { ...rest, hasReceipt: Boolean(_count?.PaymentReceipt && _count.PaymentReceipt > 0) };
    });
    res.json({ items: mapped, nextCursor });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch bookings' });
  }
});

// GET /bookings/availability?fieldId=...&date=YYYY-MM-DD
router.get('/availability', async (req: Request, res: Response) => {
  try {
    const fieldId = req.query.fieldId as string | undefined;
    const date = req.query.date as string | undefined;
    const excludeBookingId = req.query.excludeBookingId as string | undefined;
    if (!fieldId || !date) return res.status(400).json({ error: 'fieldId and date are required' });

    const day = toUtcMidnight(date);
    const units = await (prisma as any).bookingUnit.findMany({
      where: {
        fieldId,
        date: day,
        booking: { status: { in: [...ACTIVE_BOOKING_STATUSES] } },
        ...(excludeBookingId ? { bookingId: { not: excludeBookingId } } : {}),
      },
      select: { hourStart: true },
    });
    const booked = new Set(units.map((u: any) => u.hourStart));
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, available: !booked.has(h) }));
    console.log('[GET /bookings/availability]', { fieldId, date, bookedCount: booked.size });
    res.json({ date, hours });
  } catch (e: any) {
    console.error('[GET /bookings/availability] error:', e);
    res.status(500).json({ error: e.message || 'Failed to fetch availability' });
  }
});

// PATCH /bookings/:id/reschedule
router.patch('/:id/reschedule', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const existing = await (prisma as any).booking.findUnique({
      where: { id },
      include: {
        field: {
          select: {
            id: true,
            status: true,
            pricePerHour: true,
          },
        },
      },
    });
    if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Booking not found' });
    if (['CANCELLED', 'COMPLETED'].includes(String(existing.status).toUpperCase())) {
      return res.status(400).json({ error: 'This booking can no longer be rescheduled' });
    }

    const {
      bookingType,
      units,
      startAt,
      endAt,
      totalAmount,
      timezone,
      note,
    } = buildBookingPlan({ ...req.body, fieldId: existing.fieldId }, existing.field, { allowNonApprovedField: true });

    const updated = await (prisma as any).$transaction(async (tx: any) => {
      await tx.bookingUnit.deleteMany({ where: { bookingId: id } });
      await deleteStaleBookingUnitsForSlots(tx, existing.fieldId, units);
      await tx.bookingUnit.createMany({
        data: units.map((u) => ({
          bookingId: id,
          fieldId: existing.fieldId,
          date: u.date,
          hourStart: u.hourStart,
        })),
        skipDuplicates: false,
      });
      return tx.booking.update({
        where: { id },
        data: {
          type: bookingType,
          startAt,
          endAt,
          timezone: timezone !== undefined ? (timezone || null) : existing.timezone,
          totalAmount,
          note: note !== undefined ? (note || null) : existing.note,
          status: 'CONFIRMED',
        },
        include: {
          field: {
            select: {
              id: true,
              name: true,
              address: true,
              city: true,
              status: true,
              rejectionReason: true,
              suspensionReason: true,
              images: { select: { id: true, url: true, order: true }, orderBy: { order: 'asc' } },
              pricePerHour: true,
              userId: true,
            },
          },
          _count: { select: { PaymentReceipt: true } },
        },
      });
    });

    const { _count, ...booking } = updated;
    const fieldOwnerId = booking.field?.userId;
    const booker = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const bookerLabel = (booker?.name && String(booker.name).trim()) || booker?.email || 'A customer';
    const { notifyReschedulePushes } = await import('../services/pushNotifications');
    void notifyReschedulePushes({
      fieldOwnerUserId: fieldOwnerId,
      bookerUserId: userId,
      fieldName: booking.field?.name || 'Your field',
      bookingId: booking.id,
      bookerLabel,
    }).catch((err) => console.warn('[PATCH /bookings/:id/reschedule] booking push failed', err));

    res.json({
      ok: true,
      booking: {
        ...booking,
        hasReceipt: Boolean(_count?.PaymentReceipt && _count.PaymentReceipt > 0),
      },
    });
  } catch (e: any) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Time conflict. Some slots are already booked.' });
    }
    const message = e?.message || 'Failed to reschedule booking';
    const badRequestMessages = new Set([
      'fieldId is required',
      'Field not found',
      'Field not available for booking',
      'Invalid field pricing',
      'dates required for FULL_DAY',
      'dates required for MULTI_DAY',
      'date is required',
      'Selected range exceeds day boundary',
      'No booking units computed',
    ]);
    if (badRequestMessages.has(message)) {
      return res.status(400).json({ error: message });
    }
    console.error('[PATCH /bookings/:id/reschedule] error:', e);
    res.status(500).json({ error: message });
  }
});

// POST /bookings/:id/cancel
router.post('/:id/cancel', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const existing = await (prisma as any).booking.findUnique({
      where: { id },
      include: {
        field: { select: { userId: true, name: true } },
      },
    });
    if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Booking not found' });

    if (String(existing.status || '').toUpperCase() === 'CANCELLED') {
      await (prisma as any).bookingUnit.deleteMany({ where: { bookingId: id } });
      return res.json({ ok: true });
    }

    const meta = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
    const ep = (meta as any).easypay;
    const businessId = ep?.businessId as string | undefined;
    const orderId = ep?.orderId as string | undefined;
    const unpaid = String(existing.paymentStatus || '').toUpperCase() !== 'PAID';
    if (unpaid && businessId && orderId && getEasypayPartnerConfig().configured) {
      try {
        await cancelEasypayOrder(businessId, orderId);
      } catch (e) {
        console.warn('[POST /bookings/:id/cancel] easypay cancel', (e as any)?.message || e);
      }
    }

    await (prisma as any).$transaction(async (tx: any) => {
      await tx.bookingUnit.deleteMany({ where: { bookingId: id } });
      await tx.booking.update({ where: { id }, data: { status: 'CANCELLED' } });
    });

    const ownerId = existing.field?.userId as string | undefined;
    const fieldName = (existing.field?.name as string | undefined) || 'Your field';
    const booker = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const bookerLabel = (booker?.name && String(booker.name).trim()) || booker?.email || 'A customer';
    const { notifyBookingCancelledPushes } = await import('../services/pushNotifications');
    void notifyBookingCancelledPushes({
      fieldOwnerUserId: ownerId,
      bookerUserId: userId,
      fieldName,
      bookingId: id,
      bookerLabel,
    }).catch((err) => console.warn('[POST /bookings/:id/cancel] booking push failed', err));

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to cancel booking' });
  }
});

// GET /bookings/owner - list bookings for fields owned by current user
// ?limit=10&cursor=<id>&start=<iso>&end=<iso>&payment=all|paid|unpaid
// When start+end are provided, response includes `summary` for the same filter scope.
router.get('/owner', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const ownerId = req.auth!.userId;
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const cursor = (req.query.cursor as string | undefined) || undefined;
    const startParam = (req.query.start as string | undefined)?.trim();
    const endParam = (req.query.end as string | undefined)?.trim();
    const paymentRaw = String(req.query.payment || 'all').toLowerCase();
    const payment = paymentRaw === 'paid' ? 'paid' : paymentRaw === 'unpaid' ? 'unpaid' : 'all';

    const start = startParam ? new Date(startParam) : undefined;
    const end = endParam ? new Date(endParam) : undefined;
    const hasRange = Boolean(start && end && !Number.isNaN(+start!) && !Number.isNaN(+end!));

    const timeWhere = hasRange ? { startAt: { gte: start!, lt: end! } } : {};
    const paymentWhere =
      payment === 'paid'
        ? { paymentStatus: 'PAID' as const }
        : payment === 'unpaid'
          ? { paymentStatus: { not: 'PAID' as const } }
          : {};

    const listWhere: any = {
      field: { userId: ownerId },
      ...timeWhere,
      ...paymentWhere,
    };

    const dec = (v: any) => (v == null ? 0 : Number(v));

    let summary: any = undefined;
    if (hasRange) {
      const baseSummaryWhere: any = {
        field: { userId: ownerId },
        ...timeWhere,
        status: { not: 'CANCELLED' as const },
      };
      const [paidAgg, unpaidAgg] = await Promise.all([
        (prisma as any).booking.aggregate({
          where: { ...baseSummaryWhere, paymentStatus: 'PAID' },
          _count: { _all: true },
          _sum: { totalAmount: true },
        }),
        (prisma as any).booking.aggregate({
          where: { ...baseSummaryWhere, paymentStatus: { not: 'PAID' } },
          _count: { _all: true },
          _sum: { totalAmount: true },
        }),
      ]);

      const paidCount = paidAgg._count._all;
      const unpaidCount = unpaidAgg._count._all;
      const collectedGmd = dec(paidAgg._sum.totalAmount);
      const outstandingGmd = dec(unpaidAgg._sum.totalAmount);

      if (payment === 'paid') {
        summary = {
          bookingCount: paidCount,
          paidCount,
          unpaidCount: 0,
          collectedGmd,
          outstandingGmd: 0,
        };
      } else if (payment === 'unpaid') {
        summary = {
          bookingCount: unpaidCount,
          paidCount: 0,
          unpaidCount,
          collectedGmd: 0,
          outstandingGmd,
        };
      } else {
        summary = {
          bookingCount: paidCount + unpaidCount,
          paidCount,
          unpaidCount,
          collectedGmd,
          outstandingGmd,
        };
      }
    }

    const results = await (prisma as any).booking.findMany({
      where: listWhere,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        field: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            images: { select: { url: true, order: true }, orderBy: { order: 'asc' }, take: 1 },
          },
        },
        user: { select: { id: true, email: true, name: true } },
        _count: { select: { PaymentReceipt: true } },
        PaymentReceipt: { select: { imageUrl: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    let nextCursor: string | null = null;
    let items = results;
    if (results.length > limit) {
      nextCursor = results[results.length - 1].id;
      items = results.slice(0, limit);
    }
    const mapped = items.map((b: any) => {
      const latest = (b.PaymentReceipt && b.PaymentReceipt[0]) ? b.PaymentReceipt[0] : null;
      const { _count, PaymentReceipt, ...rest } = b;
      return {
        ...rest,
        hasReceipt: Boolean(_count?.PaymentReceipt && _count.PaymentReceipt > 0),
        latestReceiptUrl: latest?.imageUrl || null,
      };
    });
    res.json({ items: mapped, nextCursor, ...(summary ? { summary } : {}) });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch owner bookings' });
  }
});

// GET /bookings/:id — booker or field owner (refresh paymentStatus after Easypay webhook, etc.)
router.get('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    if (['mine', 'owner', 'availability'].includes(id)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const booking = await (prisma as any).booking.findUnique({
      where: { id },
      include: {
        field: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            userId: true,
            status: true,
            rejectionReason: true,
            suspensionReason: true,
            pricePerHour: true,
            images: { select: { id: true, url: true, order: true }, orderBy: { order: 'asc' } },
          },
        },
        user: { select: { id: true, email: true, name: true } },
        _count: { select: { PaymentReceipt: true } },
        PaymentReceipt: { select: { imageUrl: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const isOwner = booking.field.userId === userId;
    const isBooker = booking.userId === userId;
    if (!isOwner && !isBooker) return res.status(403).json({ error: 'Not allowed' });
    const latest = booking.PaymentReceipt?.[0] || null;
    const { _count, PaymentReceipt, ...rest } = booking;
    res.json({
      booking: {
        ...rest,
        hasReceipt: Boolean(_count?.PaymentReceipt && _count.PaymentReceipt > 0),
        latestReceiptUrl: latest?.imageUrl || null,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to load booking' });
  }
});

// PATCH /bookings/:id/status - owner can mark completed
router.patch('/:id/status', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const ownerId = req.auth!.userId;
    const id = req.params.id;
    const { status } = req.body as any;
    if (!status) return res.status(400).json({ error: 'status is required' });
    const allowed = new Set(['COMPLETED']);
    if (!allowed.has(String(status).toUpperCase())) return res.status(400).json({ error: 'Unsupported status' });

    const existing = await (prisma as any).booking.findUnique({
      where: { id },
      include: { field: { select: { userId: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Booking not found' });
    if (existing.field.userId !== ownerId) return res.status(403).json({ error: 'Not allowed' });

    const updated = await (prisma as any).booking.update({ where: { id }, data: { status: 'COMPLETED' } });
    res.json({ ok: true, id: updated.id, status: updated.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to update status' });
  }
});

// PATCH /bookings/:id/payment - owner marks booking as PAID
router.patch('/:id/payment', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const ownerId = req.auth!.userId;
    const id = req.params.id;
    const existing = await (prisma as any).booking.findUnique({
      where: { id },
      include: { field: { select: { userId: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Booking not found' });
    if (existing.field.userId !== ownerId) return res.status(403).json({ error: 'Not allowed' });
    const updated = await (prisma as any).booking.update({
      where: { id },
      data: { paymentStatus: 'PAID' },
    });
    res.json({ ok: true, id: updated.id, paymentStatus: updated.paymentStatus });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to update payment status' });
  }
});

// POST /bookings/:id/easypay/prepare — booker: create Easypay order + list checkout wallets (field owner must be linked)
router.post('/:id/easypay/prepare', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    if (!getEasypayPartnerConfig().configured) {
      return res.status(503).json({ error: 'directPay payments are not configured on this server.' });
    }
    const userId = req.auth!.userId;
    const id = req.params.id;
    const booking = await (prisma as any).booking.findUnique({
      where: { id },
      include: {
        field: {
          select: {
            userId: true,
            name: true,
          },
        },
      },
    });
    if (!booking || booking.userId !== userId) return res.status(404).json({ error: 'Booking not found' });
    if (String(booking.paymentStatus || '').toUpperCase() === 'PAID') {
      return res.status(400).json({ error: 'This booking is already paid.' });
    }
    const owner = await prisma.user.findUnique({
      where: { id: booking.field.userId },
      select: { easypayBusinessId: true },
    });
    if (!owner?.easypayBusinessId) {
      return res.status(409).json({
        error:
          'This field cannot accept directPay payments yet. Ask the field owner to open Profile → Link To directPay.',
      });
    }
    const amountGmd = Number(booking.totalAmount);
    if (!Number.isFinite(amountGmd) || amountGmd <= 0) {
      return res.status(400).json({ error: 'Invalid booking amount' });
    }
    const order = await createEasypayOrder(owner.easypayBusinessId, {
      partnerExternalBookingId: booking.id,
      amountGmd,
      currency: booking.currency || 'GMD',
    });
    const wallets = await listEasypayWallets(owner.easypayBusinessId, order.id);
    console.log('[easypay/prepare] ok', { bookingId: id, orderId: order.id, walletCount: wallets.length });
    const merged = mergeBookingEasypayMetadata(booking.metadata, {
      businessId: owner.easypayBusinessId,
      orderId: order.id,
      orderPublicCode: order.publicCode,
      orderStatus: order.status,
      lastPrepareAt: new Date().toISOString(),
    });
    await (prisma as any).booking.update({
      where: { id },
      data: { metadata: merged as any },
    });
    res.json({
      ok: true,
      businessId: owner.easypayBusinessId,
      order: {
        id: order.id,
        publicCode: order.publicCode,
        status: order.status,
        total: order.total,
        currency: order.currency,
      },
      wallets,
      ...(wallets.length === 0
        ? {
            prepareHint:
              'The field owner still needs to enable a payout option in directPay before customers can pay online for this booking.',
          }
        : {}),
    });
  } catch (e: any) {
    console.error('[POST /bookings/:id/easypay/prepare]', e?.message || e);
    res.status(502).json({ error: e?.message || 'directPay prepare failed' });
  }
});

// POST /bookings/:id/easypay/wallet — booker: start Wave/Yonna (etc.) checkout; open launchUrl on device
router.post('/:id/easypay/wallet', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    if (!getEasypayPartnerConfig().configured) {
      return res.status(503).json({ error: 'directPay payments are not configured on this server.' });
    }
    const userId = req.auth!.userId;
    const id = req.params.id;
    const { gatewayCode, payerPhone, gatewayId } = (req.body || {}) as {
      gatewayCode?: string;
      payerPhone?: string;
      gatewayId?: string;
    };
    if (!gatewayCode || typeof gatewayCode !== 'string') {
      return res.status(400).json({ error: 'gatewayCode is required' });
    }
    const booking = await (prisma as any).booking.findUnique({
      where: { id },
      include: {
        field: { select: { userId: true } },
      },
    });
    if (!booking || booking.userId !== userId) return res.status(404).json({ error: 'Booking not found' });
    if (String(booking.paymentStatus || '').toUpperCase() === 'PAID') {
      return res.status(400).json({ error: 'This booking is already paid.' });
    }
    const owner = await prisma.user.findUnique({
      where: { id: booking.field.userId },
      select: { easypayBusinessId: true },
    });
    if (!owner?.easypayBusinessId) {
      return res.status(409).json({ error: 'Field owner is not linked to directPay.' });
    }
    const meta = booking.metadata && typeof booking.metadata === 'object' ? booking.metadata : {};
    let orderId = (meta as any)?.easypay?.orderId as string | undefined;
    if (orderId != null && String(orderId).trim() !== '') orderId = String(orderId).trim();
    else orderId = undefined;
    let latestMeta: unknown = booking.metadata;
    if (!orderId) {
      const amountGmd = Number(booking.totalAmount);
      const order = await createEasypayOrder(owner.easypayBusinessId, {
        partnerExternalBookingId: booking.id,
        amountGmd,
        currency: booking.currency || 'GMD',
      });
      orderId = order.id;
      latestMeta = mergeBookingEasypayMetadata(booking.metadata, {
        businessId: owner.easypayBusinessId,
        orderId: order.id,
        orderPublicCode: order.publicCode,
        orderStatus: order.status,
        lastPrepareAt: new Date().toISOString(),
      });
      await (prisma as any).booking.update({ where: { id }, data: { metadata: latestMeta as any } });
    }
    const gc = String(gatewayCode).trim();
    const phoneRaw = payerPhone && String(payerPhone).trim() ? String(payerPhone).trim() : undefined;
    const gid = gatewayId != null && String(gatewayId).trim() !== '' ? String(gatewayId).trim() : undefined;
    const checkout = await startEasypayWalletCheckout(owner.easypayBusinessId, String(orderId).trim(), {
      gatewayCode: gc,
      ...(phoneRaw && easypayGatewayCodeNeedsPayerPhone(gc) ? { payerPhone: phoneRaw } : {}),
      ...(gid ? { gatewayId: gid } : {}),
    });
    const merged2 = mergeBookingEasypayMetadata(latestMeta, {
      businessId: owner.easypayBusinessId,
      orderId,
      lastCheckoutAdapter: checkout.checkoutAdapter,
      lastCheckoutAt: new Date().toISOString(),
    });
    await (prisma as any).booking.update({ where: { id }, data: { metadata: merged2 as any } });
    res.json({
      ok: true,
      launchUrl: checkout.launchUrl,
      qrPayload: checkout.qrPayload,
      paymentHtml: checkout.paymentHtml,
      checkoutAdapter: checkout.checkoutAdapter,
    });
  } catch (e: any) {
    console.error('[POST /bookings/:id/easypay/wallet]', e?.message || e);
    if (e?.code === 'EASYPAY_NO_LAUNCH_URL') {
      return res.status(502).json({
        error: 'We could not get a checkout link from the payment provider. Please try again or pick another method.',
      });
    }
    const upstream = typeof e?.status === 'number' ? e.status : 0;
    if (upstream >= 500) {
      return res.status(502).json({
        error: 'The payment service is temporarily unavailable. Please try again in a few moments.',
      });
    }
    res.status(502).json({
      error: 'We could not start this payment. Please try again in a moment or choose another method.',
    });
  }
});

// POST /bookings/:id/easypay/aps/authorize — APS: payer mobile → authState (+ may require OTP)
router.post('/:id/easypay/aps/authorize', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    if (!getEasypayPartnerConfig().configured) {
      return res.status(503).json({ error: 'directPay payments are not configured on this server.' });
    }
    const userId = req.auth!.userId;
    const id = req.params.id;
    const { gatewayCode, payerMobile } = (req.body || {}) as { gatewayCode?: string; payerMobile?: string };
    if (!gatewayCode || typeof gatewayCode !== 'string') {
      return res.status(400).json({ error: 'gatewayCode is required' });
    }
    const mobile = String(payerMobile || '').replace(/\D/g, '');
    if (mobile.length < 7) {
      return res.status(400).json({ error: 'payerMobile must be a valid mobile number (digits).' });
    }
    const booking = await (prisma as any).booking.findUnique({
      where: { id },
      include: { field: { select: { userId: true } } },
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (String(booking.userId) !== String(userId)) {
      return res.status(403).json({ error: 'Only the person who booked can pay for this booking.' });
    }
    if (String(booking.paymentStatus || '').toUpperCase() === 'PAID') {
      return res.status(400).json({ error: 'This booking is already paid.' });
    }
    const owner = await prisma.user.findUnique({
      where: { id: booking.field.userId },
      select: { easypayBusinessId: true },
    });
    if (!owner?.easypayBusinessId) {
      return res.status(409).json({ error: 'Field owner is not linked to directPay.' });
    }
    let orderId: string;
    try {
      const ensured = await ensureEasypayOrderIdOnBooking(id, booking, owner.easypayBusinessId);
      orderId = ensured.orderId;
    } catch (e: any) {
      console.error('[POST /bookings/:id/easypay/aps/authorize] ensure order', e?.message || e);
      return res.status(502).json({ error: e?.message || 'Could not create directPay order for this booking.' });
    }
    console.log('[POST /bookings/:id/easypay/aps/authorize]', { bookingId: id, orderId, businessId: owner.easypayBusinessId });
    const out = await authorizeEasypayApsWallet(owner.easypayBusinessId, orderId, {
      gatewayCode,
      payerMobile: mobile,
    });
    if (!out.authState) {
      return res.status(502).json({ error: 'directPay APS authorize did not return authState.' });
    }
    res.json({
      ok: true,
      authState: out.authState,
      requiresOtp: out.requiresOtp,
    });
  } catch (e: any) {
    console.error('[POST /bookings/:id/easypay/aps/authorize]', e?.message || e);
    res.status(502).json({ error: e?.message || 'directPay APS authorize failed' });
  }
});

// POST /bookings/:id/easypay/aps/complete — APS: submit OTP (if required) and complete payment
router.post('/:id/easypay/aps/complete', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    if (!getEasypayPartnerConfig().configured) {
      return res.status(503).json({ error: 'directPay payments are not configured on this server.' });
    }
    const userId = req.auth!.userId;
    const id = req.params.id;
    const { gatewayCode, authState, otp } = (req.body || {}) as {
      gatewayCode?: string;
      authState?: string;
      otp?: string;
    };
    if (!gatewayCode || typeof gatewayCode !== 'string') {
      return res.status(400).json({ error: 'gatewayCode is required' });
    }
    if (!authState || typeof authState !== 'string') {
      return res.status(400).json({ error: 'authState is required (from authorize step).' });
    }
    const booking = await (prisma as any).booking.findUnique({
      where: { id },
      include: { field: { select: { userId: true } } },
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (String(booking.userId) !== String(userId)) {
      return res.status(403).json({ error: 'Only the person who booked can pay for this booking.' });
    }
    if (String(booking.paymentStatus || '').toUpperCase() === 'PAID') {
      return res.status(400).json({ error: 'This booking is already paid.' });
    }
    const owner = await prisma.user.findUnique({
      where: { id: booking.field.userId },
      select: { easypayBusinessId: true },
    });
    if (!owner?.easypayBusinessId) {
      return res.status(409).json({ error: 'Field owner is not linked to directPay.' });
    }
    let orderId: string;
    let latestMetaForMerge: unknown;
    try {
      const ensured = await ensureEasypayOrderIdOnBooking(id, booking, owner.easypayBusinessId);
      orderId = ensured.orderId;
      latestMetaForMerge = ensured.latestMeta;
    } catch (e: any) {
      console.error('[POST /bookings/:id/easypay/aps/complete] ensure order', e?.message || e);
      return res.status(502).json({ error: e?.message || 'Could not create directPay order for this booking.' });
    }
    const body: { gatewayCode: string; authState: string; otp?: string } = { gatewayCode, authState };
    if (otp != null && String(otp).trim() !== '') body.otp = String(otp).trim();
    const data = await completeEasypayApsWallet(owner.easypayBusinessId, orderId, body);
    const merged = mergeBookingEasypayMetadata(latestMetaForMerge, {
      lastApsCompleteAt: new Date().toISOString(),
    });
    await (prisma as any).booking.update({ where: { id }, data: { metadata: merged as any } });
    res.json({ ok: true, data });
  } catch (e: any) {
    console.error('[POST /bookings/:id/easypay/aps/complete]', e?.message || e);
    res.status(502).json({ error: e?.message || 'directPay APS complete failed' });
  }
});

// POST /bookings/:id/receipt - user uploads payment receipt (does not change paymentStatus)
router.post('/:id/receipt', requireAuth, upload.single('receipt'), async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const booking = await (prisma as any).booking.findUnique({ where: { id } });
    if (!booking || booking.userId !== userId) return res.status(404).json({ error: 'Booking not found' });
    const file = (req as any).file as any | undefined;
    if (!file) return res.status(400).json({ error: 'receipt file is required' });
    const url = `${imageBaseUrl()}/uploads/receipts/${path.basename(file.path)}`;
    const note = (req.body?.note as string | undefined) || null;
    const receipt = await (prisma as any).paymentReceipt.create({
      data: {
        bookingId: id,
        userId,
        imageUrl: url,
        note,
      },
    });
    res.json({ ok: true, receipt });
  } catch (e: any) {
    console.error('[POST /bookings/:id/receipt]', e?.message || e);
    res.status(500).json({ error: 'Failed to upload receipt' });
  }
});

// GET /bookings/:id/receipts - list uploaded receipts (owner or booking user)
router.get('/:id/receipts', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const booking = await (prisma as any).booking.findUnique({
      where: { id },
      include: { field: { select: { userId: true } } },
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const isOwner = booking.field.userId === userId;
    const isBooker = booking.userId === userId;
    if (!isOwner && !isBooker) return res.status(403).json({ error: 'Not allowed' });
    const receipts = await (prisma as any).paymentReceipt.findMany({
      where: { bookingId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, imageUrl: true, note: true, createdAt: true },
    });
    res.json({ items: receipts });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch receipts' });
  }
});

export default router;


