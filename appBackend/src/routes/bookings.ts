import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../db/prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();

// Uploads: receipts
const receiptDir = path.join(process.cwd(), 'uploads', 'receipts');
if (!fs.existsSync(receiptDir)) {
  fs.mkdirSync(receiptDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, receiptDir),
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

function resolveBookingType(kind: any): 'HOURLY'|'FULL_DAY'|'MULTI_DAY'|'CUSTOM' {
  if (String(kind).toUpperCase() === 'FULL_DAY') return 'FULL_DAY';
  if (String(kind).toUpperCase() === 'MULTI_DAY') return 'MULTI_DAY';
  if (String(kind).toUpperCase() === 'CUSTOM') return 'CUSTOM';
  return 'HOURLY';
}

function buildBookingPlan(input: any, field: any) {
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
  if (field.status !== 'APPROVED') throw new Error('Field not available for booking');

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
    const field = await (prisma as any).fieldKyc.findUnique({ where: { id: fieldId } });
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
    } = buildBookingPlan({ ...req.body, fieldId: existing.fieldId }, existing.field);

    const updated = await (prisma as any).$transaction(async (tx: any) => {
      await tx.bookingUnit.deleteMany({ where: { bookingId: id } });
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
              images: { select: { url: true, order: true }, orderBy: { order: 'asc' }, take: 1 },
              pricePerHour: true,
              userId: true,
            },
          },
          _count: { select: { PaymentReceipt: true } },
        },
      });
    });

    const { _count, ...booking } = updated;
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
    const existing = await (prisma as any).booking.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Booking not found' });

    await (prisma as any).$transaction(async (tx: any) => {
      await tx.bookingUnit.deleteMany({ where: { bookingId: id } });
      await tx.booking.update({ where: { id }, data: { status: 'CANCELLED' } });
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to cancel booking' });
  }
});

// GET /bookings/owner - list bookings for fields owned by current user
// ?limit=10&cursor=<id>
router.get('/owner', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const ownerId = req.auth!.userId;
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const cursor = (req.query.cursor as string | undefined) || undefined;

    const results = await (prisma as any).booking.findMany({
      where: { field: { userId: ownerId } },
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
    res.json({ items: mapped, nextCursor });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch owner bookings' });
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


