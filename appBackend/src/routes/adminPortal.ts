import { Router } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../db/prisma';
import { AdminAuthedRequest, requireAdminAccess } from '../middleware/adminAuth';
import { authorize } from '../middleware/adminAuthorize';
import { clearUserDeviceLock } from '../device/service';
import {
  getPendingRefundBooking,
  listPendingRefundBookings,
  markBookingRefunded,
} from '../services/adminRefundReview';
import {
  CONTRACT_INVITATION_PROPOSAL_FILENAME,
  ContractInvitationTemplateType,
  getDefaultContractInvitationTemplate,
  sendContractInvitationEmail,
  textToHtml,
} from '../services/contractInvitationMail';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmailList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function validateEmailList(emails: string[]) {
  return emails.every((email) => EMAIL_RE.test(email));
}

function parsePositiveNumber(value: unknown, fallback = 100) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function periodToRange(period?: string) {
  const now = new Date();
  const end = now;
  let start: Date;
  const p = String(period || '').toLowerCase();
  if (p === 'daily') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (p === 'weekly') {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (p === 'monthly') {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

router.get('/dashboard', requireAdminAccess, authorize('dashboard', 'view'), async (_req, res) => {
  res.json({ ok: true, message: '7-aside admin portal' });
});

router.get('/users', requireAdminAccess, authorize('users', 'view'), async (req, res) => {
  try {
    const startStr = (req.query.start as string | undefined)?.trim();
    const endStr = (req.query.end as string | undefined)?.trim();
    const q = String(req.query.q || '').trim();
    const deviceLockParam = (req.query.deviceLock as string | undefined)?.toLowerCase();
    const deviceLockOnly = deviceLockParam === '1' || deviceLockParam === 'true';
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const cursor = (req.query.cursor as string | undefined) || undefined;

    let startDate: Date | undefined;
    let endDate: Date | undefined;
    if (startStr) {
      const d = new Date(startStr);
      if (!isNaN(+d)) {
        d.setHours(0, 0, 0, 0);
        startDate = d;
      }
    }
    if (endStr) {
      const d = new Date(endStr);
      if (!isNaN(+d)) {
        d.setHours(23, 59, 59, 999);
        endDate = d;
      }
    }

    const skipDateDefault = Boolean(q) || deviceLockOnly;
    if (!startDate && !endDate && !skipDateDefault) {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const where: any = { supadmin: false };
    if (deviceLockOnly) where.deviceLockEnabled = true;
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
      delete where.supadmin;
    }
    if (!skipDateDefault && (startDate || endDate)) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }

    const results = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        name: true,
        supadmin: true,
        adminUser: true,
        adminUserType: true,
        createdAt: true,
        deviceLockEnabled: true,
      },
    });
    let nextCursor: string | null = null;
    let items = results;
    if (results.length > limit) {
      nextCursor = results[results.length - 1].id;
      items = results.slice(0, limit);
    }
    const count = await prisma.user.count({ where });
    res.json({ items, nextCursor, count });
  } catch (e: any) {
    console.error('Error in GET /admin/portal/users:', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.patch(
  '/users/:id/device-lock',
  requireAdminAccess,
  authorize('users', 'edit'),
  async (req: AdminAuthedRequest, res) => {
    try {
      const userId = String(req.params.id);
      const enabled = (req.body as { enabled?: unknown })?.enabled;
      if (enabled !== false) {
        return res.status(400).json({ error: 'Admins can only turn device lock off' });
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, deviceLockEnabled: true },
      });
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (!user.deviceLockEnabled) {
        return res.status(400).json({ error: 'Device lock is not enabled for this user' });
      }
      await clearUserDeviceLock(userId);
      return res.json({ ok: true, deviceLockEnabled: false });
    } catch (e: any) {
      console.error('Error in PATCH /admin/portal/users/:id/device-lock:', e?.message || e);
      return res.status(500).json({ error: 'Failed to unlock device' });
    }
  },
);

router.get(
  '/contract-invitations/template',
  requireAdminAccess,
  authorize('contract-invitations', 'view'),
  async (req, res) => {
    const recipientName = typeof req.query.recipientName === 'string' ? req.query.recipientName : undefined;
    const businessName = typeof req.query.businessName === 'string' ? req.query.businessName : undefined;
    const platformFeePerHour = parsePositiveNumber(req.query.platformFeePerHour);
    const template = getDefaultContractInvitationTemplate(recipientName, { businessName, platformFeePerHour });
    res.json({
      ...template,
      proposalFilename: CONTRACT_INVITATION_PROPOSAL_FILENAME,
    });
  },
);

router.post(
  '/contract-invitations',
  requireAdminAccess,
  authorize('contract-invitations', 'edit'),
  async (req: AdminAuthedRequest, res) => {
    try {
      const recipientEmail = String(req.body?.recipientEmail || '').trim().toLowerCase();
      const recipientName = typeof req.body?.recipientName === 'string' ? req.body.recipientName.trim() : '';
      const businessName = typeof req.body?.businessName === 'string' ? req.body.businessName.trim() : '';
      const platformFeePerHour = parsePositiveNumber(req.body?.platformFeePerHour);
      const ccEmails = parseEmailList(req.body?.ccEmails).map((email) => email.toLowerCase());
      const templateTypeRaw = String(req.body?.templateType || 'DEFAULT').toUpperCase();
      const templateType: ContractInvitationTemplateType = templateTypeRaw === 'CUSTOM' ? 'CUSTOM' : 'DEFAULT';

      if (!EMAIL_RE.test(recipientEmail)) {
        return res.status(400).json({ error: 'Valid recipient email is required' });
      }
      if (!validateEmailList(ccEmails)) {
        return res.status(400).json({ error: 'One or more CC email addresses are invalid' });
      }
      if (!businessName) {
        return res.status(400).json({ error: 'Business name is required' });
      }

      const defaultTemplate = getDefaultContractInvitationTemplate(recipientName, {
        businessName,
        platformFeePerHour,
      });
      const subject =
        templateType === 'CUSTOM' ? String(req.body?.subject || '').trim() : defaultTemplate.subject;
      const messageText =
        templateType === 'CUSTOM'
          ? String(req.body?.messageText || '').trim()
          : defaultTemplate.messageText;

      if (!subject) return res.status(400).json({ error: 'Subject is required' });
      if (!messageText) return res.status(400).json({ error: 'Message content is required' });

      const messageHtml =
        templateType === 'CUSTOM'
          ? `<div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">${textToHtml(messageText)}</div>`
          : defaultTemplate.messageHtml;

      const resendEmailId = await sendContractInvitationEmail({
        to: recipientEmail,
        cc: ccEmails,
        subject,
        messageText,
        messageHtml,
        businessName,
        platformFeePerHour,
      });

      const invitationId = randomUUID();
      const ccEmailsJson = JSON.stringify(ccEmails);
      const createdRows = await (prisma as any).$queryRaw`
      WITH inserted AS (
        INSERT INTO "ContractInvitation" (
          "id", "recipientEmail", "recipientName", "ccEmails", "subject", "templateType",
          "messageText", "messageHtml", "proposalFilename", "resendEmailId", "sentByUserId"
        )
        VALUES (
          ${invitationId}, ${recipientEmail}, ${recipientName || null}, ${ccEmailsJson}::jsonb,
          ${subject}, ${templateType}::"ContractInvitationTemplateType", ${messageText}, ${messageHtml},
          ${CONTRACT_INVITATION_PROPOSAL_FILENAME}, ${resendEmailId}, ${req.adminUserId!}
        )
        RETURNING *
      )
      SELECT inserted.*, json_build_object('id', u.id, 'email', u.email, 'name', u.name) AS "sentBy"
      FROM inserted
      JOIN "User" u ON u.id = inserted."sentByUserId"
    `;
      res.status(201).json({ ok: true, invitation: createdRows?.[0] });
    } catch (e: any) {
      console.error('Error in POST /admin/portal/contract-invitations', e?.message || e);
      res.status(500).json({ error: e?.message || 'Failed to send contract invitation' });
    }
  },
);

router.get(
  '/contract-invitations',
  requireAdminAccess,
  authorize('contract-invitations', 'view'),
  async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
      const cursor = (req.query.cursor as string | undefined) || undefined;
      const cursorValue = cursor || null;
      const results = await (prisma as any).$queryRaw`
      SELECT ci.*, json_build_object('id', u.id, 'email', u.email, 'name', u.name) AS "sentBy"
      FROM "ContractInvitation" ci
      JOIN "User" u ON u.id = ci."sentByUserId"
      WHERE (
        ${cursorValue}::text IS NULL
        OR (ci."sentAt", ci."id") < (
          SELECT c."sentAt", c."id" FROM "ContractInvitation" c WHERE c."id" = ${cursorValue}
        )
      )
      ORDER BY ci."sentAt" DESC, ci."id" DESC
      LIMIT ${limit + 1}
    `;

      let nextCursor: string | null = null;
      let items = results;
      if (results.length > limit) {
        nextCursor = results[results.length - 1].id;
        items = results.slice(0, limit);
      }
      res.json({ items, nextCursor });
    } catch (e: any) {
      console.error('Error in GET /admin/portal/contract-invitations', e?.message || e);
      res.status(500).json({ error: 'Failed to fetch contract invitations' });
    }
  },
);

router.get(
  '/field-kyc/owners',
  requireAdminAccess,
  authorize('field-kyc', 'view'),
  async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
      const cursor = (req.query.cursor as string | undefined) || undefined;

      const owners = await prisma.user.findMany({
        where: { fieldKycs: { some: {} } },
        orderBy: { id: 'asc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          email: true,
          name: true,
          _count: { select: { fieldKycs: true } },
          fieldKycs: {
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              name: true,
              city: true,
              address: true,
              status: true,
              updatedAt: true,
              images: { select: { id: true, url: true, order: true }, orderBy: { order: 'asc' } },
            },
          },
        },
      });

      let nextCursor: string | null = null;
      let page = owners;
      if (owners.length > limit) {
        nextCursor = owners[owners.length - 1].id;
        page = owners.slice(0, limit);
      }

      const items = page.map((o) => ({
        owner: { id: o.id, email: o.email, name: o.name || null, fieldCount: o._count?.fieldKycs || 0 },
        fields: (o.fieldKycs || []).map((f) => ({
          id: f.id,
          name: f.name,
          city: f.city,
          address: f.address,
          status: f.status,
          updatedAt: f.updatedAt,
          thumbnail: f.images?.[0]?.url || null,
        })),
      }));
      res.json({ items, nextCursor });
    } catch (e: any) {
      console.error('Error in GET /admin/portal/field-kyc/owners', e?.message || e);
      res.status(500).json({ error: 'Failed to fetch owners' });
    }
  },
);

router.get(
  '/field-kyc/owners/:ownerId/fields',
  requireAdminAccess,
  authorize('field-kyc', 'view'),
  async (req, res) => {
    try {
      const ownerId = String(req.params.ownerId);
      const limit = Math.max(1, Math.min(10, Number(req.query.limit) || 1));
      const cursor = (req.query.cursor as string | undefined) || undefined;

      const results = await prisma.fieldKyc.findMany({
        where: { userId: ownerId },
        orderBy: { updatedAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          name: true,
          city: true,
          address: true,
          status: true,
          updatedAt: true,
          images: { select: { id: true, url: true, order: true }, orderBy: { order: 'asc' } },
        },
      });

      let nextCursor: string | null = null;
      let items = results;
      if (results.length > limit) {
        nextCursor = results[results.length - 1].id;
        items = results.slice(0, limit);
      }

      res.json({
        items: items.map((f) => ({
          id: f.id,
          name: f.name,
          city: f.city,
          address: f.address,
          status: f.status,
          updatedAt: f.updatedAt,
          thumbnail: f.images?.[0]?.url || null,
        })),
        nextCursor,
      });
    } catch (e: any) {
      console.error('Error in GET /admin/portal/field-kyc/owners/:ownerId/fields', e?.message || e);
      res.status(500).json({ error: 'Failed to fetch fields' });
    }
  },
);

router.get(
  '/fields/approved',
  requireAdminAccess,
  authorize('field-kyc', 'view'),
  async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
      const where: any = { status: 'APPROVED' };
      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
          { address: { contains: q, mode: 'insensitive' } },
        ];
      }
      const items = await prisma.fieldKyc.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          name: true,
          city: true,
          address: true,
          phone: true,
          surfaceType: true,
          size: true,
          pricePerHour: true,
          hasLights: true,
          description: true,
          status: true,
          updatedAt: true,
          images: {
            orderBy: { order: 'asc' },
            take: 4,
            select: { id: true, url: true, order: true },
          },
          user: { select: { id: true, email: true, name: true } },
        },
      });
      res.json({
        items: items.map((f) => ({
          ...f,
          pricePerHour: f.pricePerHour != null ? Number(f.pricePerHour) : null,
          thumbnail: f.images?.[0]?.url || null,
        })),
      });
    } catch (e: any) {
      console.error('Error in GET /admin/portal/fields/approved', e?.message || e);
      res.status(500).json({ error: 'Failed to fetch approved fields' });
    }
  },
);

router.get('/field-kyc/:id', requireAdminAccess, authorize('field-kyc', 'view'), async (req, res) => {
  try {
    const item = await prisma.fieldKyc.findUnique({
      where: { id: String(req.params.id) },
      include: {
        images: { orderBy: { order: 'asc' } },
        user: { select: { id: true, email: true, name: true } },
      },
    });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e: any) {
    console.error('Error in GET /admin/portal/field-kyc/:id', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch field' });
  }
});

router.patch(
  '/field-kyc/:id/status',
  requireAdminAccess,
  authorize('field-kyc', 'edit'),
  async (req, res) => {
    try {
      const id = String(req.params.id);
      const { status, reason } = req.body || {};
      const allowed = ['APPROVED', 'REJECTED', 'SUSPENDED'];
      const statusNorm = typeof status === 'string' ? status.toUpperCase() : '';
      if (!allowed.includes(statusNorm)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      const existing = await prisma.fieldKyc.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const data: any = { status: statusNorm, updatedBy: 'admin' };
      if (statusNorm === 'APPROVED') {
        data.rejectionReason = null;
        data.suspensionReason = null;
      } else if (statusNorm === 'REJECTED') {
        if (!reason || typeof reason !== 'string') {
          return res.status(400).json({ error: 'reason is required for rejection' });
        }
        data.rejectionReason = reason;
        data.suspensionReason = null;
      } else if (statusNorm === 'SUSPENDED') {
        if (!reason || typeof reason !== 'string') {
          return res.status(400).json({ error: 'reason is required for suspension' });
        }
        data.suspensionReason = reason;
        data.rejectionReason = null;
      }
      const updated = await prisma.fieldKyc.update({ where: { id }, data });
      res.json({ ok: true, id: updated.id, status: updated.status });
    } catch (e: any) {
      console.error('Error in PATCH /admin/portal/field-kyc/:id/status', e?.message || e);
      res.status(500).json({ error: 'Failed to update status' });
    }
  },
);

router.get('/bookings', requireAdminAccess, authorize('bookings', 'view'), async (req, res) => {
  try {
    const period = (req.query.period as string | undefined) || 'monthly';
    const { start, end } = periodToRange(period);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const cursor = (req.query.cursor as string | undefined) || undefined;
    const payment = (req.query.payment as string | undefined)?.toLowerCase();

    const where: any = {
      units: { some: { date: { gte: start, lte: end } } },
    };
    if (payment === 'paid') where.paymentStatus = 'PAID';
    else if (payment === 'unpaid') where.paymentStatus = { not: 'PAID' };

    const results = await prisma.booking.findMany({
      where,
      orderBy: { startAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        fieldId: true,
        startAt: true,
        endAt: true,
        totalAmount: true,
        currency: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
        field: { select: { id: true, name: true } },
      },
    });

    let nextCursor: string | null = null;
    let items = results;
    if (results.length > limit) {
      nextCursor = results[results.length - 1].id;
      items = results.slice(0, limit);
    }

    res.json({
      items: items.map((b) => ({
        id: b.id,
        fieldId: b.fieldId,
        fieldName: b.field?.name || '',
        startAt: b.startAt,
        endAt: b.endAt,
        totalAmount: b.totalAmount != null ? Number(b.totalAmount) : 0,
        currency: b.currency || 'GMD',
        status: b.status,
        paymentStatus: b.paymentStatus,
        createdAt: b.createdAt,
      })),
      nextCursor,
    });
  } catch (e: any) {
    console.error('Error in GET /admin/portal/bookings', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

router.get('/bookings/summary', requireAdminAccess, authorize('bookings', 'view'), async (req, res) => {
  try {
    const period = (req.query.period as string | undefined) || 'monthly';
    const { start, end } = periodToRange(period);
    const payment = (req.query.payment as string | undefined)?.toLowerCase();

    const where: any = {
      units: { some: { date: { gte: start, lte: end } } },
    };
    if (payment === 'paid') where.paymentStatus = 'PAID';
    else if (payment === 'unpaid') where.paymentStatus = { not: 'PAID' };

    const rows = await prisma.booking.findMany({
      where,
      select: {
        fieldId: true,
        totalAmount: true,
        field: { select: { id: true, name: true } },
      },
    });

    const byField: Record<string, { fieldId: string; fieldName: string; totalEarnings: number; numBookings: number }> =
      {};
    for (const r of rows) {
      const key = r.fieldId;
      if (!byField[key]) {
        byField[key] = {
          fieldId: r.fieldId,
          fieldName: r.field?.name || '',
          totalEarnings: 0,
          numBookings: 0,
        };
      }
      byField[key].totalEarnings += r.totalAmount != null ? Number(r.totalAmount) : 0;
      byField[key].numBookings += 1;
    }

    const items = Object.values(byField).sort((a, b) => b.totalEarnings - a.totalEarnings);
    const total = items.reduce((acc, it) => acc + it.totalEarnings, 0);
    res.json({ items, total });
  } catch (e: any) {
    console.error('Error in GET /admin/portal/bookings/summary', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

router.get(
  '/bookings/pending-refunds',
  requireAdminAccess,
  authorize('pending-refunds', 'view'),
  async (_req, res) => {
    try {
      res.json(await listPendingRefundBookings());
    } catch (e: any) {
      console.error('Error in GET /admin/portal/bookings/pending-refunds', e?.message || e);
      res.status(500).json({ error: 'Failed to fetch pending refunds' });
    }
  },
);

router.get(
  '/bookings/:id',
  requireAdminAccess,
  authorize('pending-refunds', 'view'),
  async (req, res) => {
    try {
      const booking = await getPendingRefundBooking(String(req.params.id));
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      res.json({ booking });
    } catch (e: any) {
      console.error('Error in GET /admin/portal/bookings/:id', e?.message || e);
      res.status(500).json({ error: 'Failed to load booking' });
    }
  },
);

router.post(
  '/bookings/:id/mark-refunded',
  requireAdminAccess,
  authorize('pending-refunds', 'edit'),
  async (req: AdminAuthedRequest, res) => {
    try {
      const note =
        typeof (req.body as { note?: unknown })?.note === 'string'
          ? (req.body as { note: string }).note
          : '';
      const booking = await markBookingRefunded({
        bookingId: String(req.params.id),
        adminUserId: req.adminUserId!,
        note,
      });
      res.json({ ok: true, booking });
    } catch (e: any) {
      const status = Number(e?.status) || 500;
      if (status < 500) return res.status(status).json({ error: e.message });
      console.error('Error in POST /admin/portal/bookings/:id/mark-refunded', e?.message || e);
      res.status(500).json({ error: 'Failed to mark refund complete' });
    }
  },
);

export default router;
