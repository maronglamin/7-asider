import { Router } from 'express';
import { prisma } from '../db/prisma';
import { AuthedRequest, requireAuth, requireSupadmin } from '../middleware/auth';
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

// GET /admin/users - list users with filters
// Query:
//  - supadmin=1|0 (optional)
//  - start=YYYY-MM-DD (optional)
//  - end=YYYY-MM-DD (optional)
//  - limit, cursor (optional)
// Defaults (when no filters provided): supadmin=0 and current month range
router.get('/users', requireAuth, requireSupadmin, async (req, res) => {
  try {
    console.log('[GET] /admin/users', { query: req.query });
    const supParam = (req.query.supadmin as string | undefined)?.toLowerCase();
    const supVal = supParam === '1' || supParam === 'true' ? true : supParam === '0' || supParam === 'false' ? false : undefined;
    const startStr = (req.query.start as string | undefined)?.trim();
    const endStr = (req.query.end as string | undefined)?.trim();
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

    // Defaults: when no explicit filters are provided
    if (supVal === undefined && !startDate && !endDate) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      startDate = startOfMonth;
      endDate = endOfMonth;
    }

    const where: any = {};
    if (supVal !== undefined) where.supadmin = supVal;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }

    const results = await (prisma as any).user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, email: true, name: true, supadmin: true, createdAt: true },
    });
    let nextCursor: string | null = null;
    let items = results;
    if (results.length > limit) {
      const nxt = results[results.length - 1];
      nextCursor = nxt.id;
      items = results.slice(0, limit);
    }
    const totalCount = await (prisma as any).user.count({ where });
    res.json({ items, nextCursor, count: totalCount });
  } catch (e: any) {
    console.error('Error in GET /admin/users:', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PATCH /admin/users/supadmin { email, value }
router.patch('/users/supadmin', requireAuth, requireSupadmin, async (req: AuthedRequest, res) => {
  try {
    const { email, value } = req.body || {};
    console.log('[PATCH] /admin/users/supadmin', { body: req.body });
    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (typeof value !== 'boolean') {
      return res.status(400).json({ error: 'value (boolean) is required' });
    }
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, name: true, supadmin: true },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Prevent self-demotion
    if (user.id === req.auth!.userId && value === false) {
      return res.status(400).json({ error: 'You cannot remove your own super admin role' });
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { supadmin: value },
      select: { id: true, email: true, name: true, supadmin: true },
    });
    console.log('[PATCH] /admin/users/supadmin RESULT', {
      actorUserId: req.auth!.userId,
      targetUserId: user.id,
      targetEmail: user.email,
      newSupadmin: updated.supadmin,
    });
    res.json({ ok: true, user: updated });
  } catch (e: any) {
    console.error('Error in PATCH /admin/users/supadmin:', e?.message || e);
    res.status(500).json({ error: 'Failed to update supadmin' });
  }
});

// PATCH /admin/users/:id/supadmin { value }
router.patch('/users/:id/supadmin', requireAuth, requireSupadmin, async (req: AuthedRequest, res) => {
  try {
    const userId = req.params.id;
    const { value } = req.body || {};
    console.log('[PATCH] /admin/users/:id/supadmin', { params: req.params, body: req.body });
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'User id is required' });
    }
    if (typeof value !== 'boolean') {
      return res.status(400).json({ error: 'value (boolean) is required' });
    }
    // Prevent self-demotion
    if (userId === req.auth!.userId && value === false) {
      return res.status(400).json({ error: 'You cannot remove your own super admin role' });
    }
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { supadmin: value },
      select: { id: true, email: true, name: true, supadmin: true },
    });
    console.log('[PATCH] /admin/users/:id/supadmin RESULT', {
      actorUserId: req.auth!.userId,
      targetUserId: userId,
      targetEmail: target.email,
      newSupadmin: updated.supadmin,
    });
    res.json({ ok: true, user: updated });
  } catch (e: any) {
    console.error('Error in PATCH /admin/users/:id/supadmin:', e?.message || e);
    res.status(500).json({ error: 'Failed to update supadmin' });
  }
});

// ========= Contract Invitations Admin =========
// GET /admin/contract-invitations/template?recipientName=<name>
router.get('/contract-invitations/template', requireAuth, requireSupadmin, async (req, res) => {
  const recipientName = typeof req.query.recipientName === 'string' ? req.query.recipientName : undefined;
  const template = getDefaultContractInvitationTemplate(recipientName);
  res.json({
    ...template,
    proposalFilename: CONTRACT_INVITATION_PROPOSAL_FILENAME,
  });
});

// POST /admin/contract-invitations
router.post('/contract-invitations', requireAuth, requireSupadmin, async (req: AuthedRequest, res) => {
  try {
    const recipientEmail = String(req.body?.recipientEmail || '').trim().toLowerCase();
    const recipientName = typeof req.body?.recipientName === 'string' ? req.body.recipientName.trim() : '';
    const ccEmails = parseEmailList(req.body?.ccEmails).map((email) => email.toLowerCase());
    const templateTypeRaw = String(req.body?.templateType || 'DEFAULT').toUpperCase();
    const templateType: ContractInvitationTemplateType = templateTypeRaw === 'CUSTOM' ? 'CUSTOM' : 'DEFAULT';

    if (!EMAIL_RE.test(recipientEmail)) {
      return res.status(400).json({ error: 'Valid recipient email is required' });
    }
    if (!validateEmailList(ccEmails)) {
      return res.status(400).json({ error: 'One or more CC email addresses are invalid' });
    }

    const defaultTemplate = getDefaultContractInvitationTemplate(recipientName);
    const subject = templateType === 'CUSTOM'
      ? String(req.body?.subject || '').trim()
      : defaultTemplate.subject;
    const messageText = templateType === 'CUSTOM'
      ? String(req.body?.messageText || '').trim()
      : defaultTemplate.messageText;

    if (!subject) {
      return res.status(400).json({ error: 'Subject is required' });
    }
    if (!messageText) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const messageHtml = templateType === 'CUSTOM'
      ? `<div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">${textToHtml(messageText)}</div>`
      : defaultTemplate.messageHtml;

    const resendEmailId = await sendContractInvitationEmail({
      to: recipientEmail,
      cc: ccEmails,
      subject,
      messageText,
      messageHtml,
    });

    const invitation = await (prisma as any).contractInvitation.create({
      data: {
        recipientEmail,
        recipientName: recipientName || null,
        ccEmails,
        subject,
        templateType,
        messageText,
        messageHtml,
        proposalFilename: CONTRACT_INVITATION_PROPOSAL_FILENAME,
        resendEmailId,
        sentByUserId: req.auth!.userId,
      },
      include: {
        sentBy: { select: { id: true, email: true, name: true } },
      },
    });

    res.status(201).json({ ok: true, invitation });
  } catch (e: any) {
    console.error('Error in POST /admin/contract-invitations', e?.message || e);
    res.status(500).json({ error: e?.message || 'Failed to send contract invitation' });
  }
});

// GET /admin/contract-invitations - paginated sent invitations
// Query: ?limit=20&cursor=<invitationId>
router.get('/contract-invitations', requireAuth, requireSupadmin, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const cursor = (req.query.cursor as string | undefined) || undefined;
    const results = await (prisma as any).contractInvitation.findMany({
      orderBy: { sentAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        sentBy: { select: { id: true, email: true, name: true } },
      },
    });

    let nextCursor: string | null = null;
    let items = results;
    if (results.length > limit) {
      const next = results[results.length - 1];
      nextCursor = next.id;
      items = results.slice(0, limit);
    }

    res.json({ items, nextCursor });
  } catch (e: any) {
    console.error('Error in GET /admin/contract-invitations', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch contract invitations' });
  }
});

// ========= Field KYC Admin =========
// GET /admin/field-kyc/owners - paginated owners with 1 latest field each
// Query: ?limit=10&cursor=<ownerId>
router.get('/field-kyc/owners', requireAuth, requireSupadmin, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const cursor = (req.query.cursor as string | undefined) || undefined;

    const owners = await (prisma as any).user.findMany({
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
      const next = owners[owners.length - 1];
      nextCursor = next.id;
      page = owners.slice(0, limit);
    }

    const items = page.map((o: any) => ({
      owner: { id: o.id, email: o.email, name: o.name || null, fieldCount: o._count?.fieldKycs || 0 },
      fields: (o.fieldKycs || []).map((f: any) => ({
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
    console.error('Error in GET /admin/field-kyc/owners', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch owners' });
  }
});

// GET /admin/field-kyc/owners/:ownerId/fields - paginated fields for a specific owner
// Query: ?limit=1&cursor=<fieldId>
router.get('/field-kyc/owners/:ownerId/fields', requireAuth, requireSupadmin, async (req, res) => {
  try {
    const ownerId = req.params.ownerId;
    const limit = Math.max(1, Math.min(10, Number(req.query.limit) || 1));
    const cursor = (req.query.cursor as string | undefined) || undefined;

    const results = await (prisma as any).fieldKyc.findMany({
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
      const nxt = results[results.length - 1];
      nextCursor = nxt.id;
      items = results.slice(0, limit);
    }

    const mapped = items.map((f: any) => ({
      id: f.id,
      name: f.name,
      city: f.city,
      address: f.address,
      status: f.status,
      updatedAt: f.updatedAt,
      thumbnail: f.images?.[0]?.url || null,
    }));

    res.json({ items: mapped, nextCursor });
  } catch (e: any) {
    console.error('Error in GET /admin/field-kyc/owners/:ownerId/fields', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch fields' });
  }
});

// GET /admin/field-kyc/:id - fetch field detail (admin)
router.get('/field-kyc/:id', requireAuth, requireSupadmin, async (req, res) => {
  try {
    const id = req.params.id;
    const item = await prisma.fieldKyc.findUnique({
      where: { id },
      include: { images: { orderBy: { order: 'asc' } }, user: { select: { id: true, email: true, name: true } } },
    } as any);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e: any) {
    console.error('Error in GET /admin/field-kyc/:id', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch field' });
  }
});

// PATCH /admin/field-kyc/:id/status { status, reason }
// status: 'APPROVED' | 'REJECTED' | 'SUSPENDED'
router.patch('/field-kyc/:id/status', requireAuth, requireSupadmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { status, reason } = req.body || {};
    const allowed = ['APPROVED', 'REJECTED', 'SUSPENDED'];
    const statusNorm = typeof status === 'string' ? status.toUpperCase() : '';
    if (!allowed.includes(statusNorm)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const existing = await prisma.fieldKyc.findUnique({ where: { id } } as any);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const data: any = { status: statusNorm, updatedBy: 'admin' };
    if (statusNorm === 'APPROVED') {
      data.rejectionReason = null;
      data.suspensionReason = null;
    } else if (statusNorm === 'REJECTED') {
      if (!reason || typeof reason !== 'string') return res.status(400).json({ error: 'reason is required for rejection' });
      data.rejectionReason = reason;
      data.suspensionReason = null;
    } else if (statusNorm === 'SUSPENDED') {
      if (!reason || typeof reason !== 'string') return res.status(400).json({ error: 'reason is required for suspension' });
      data.suspensionReason = reason;
      data.rejectionReason = null;
    }
    const updated = await prisma.fieldKyc.update({ where: { id }, data } as any);
    res.json({ ok: true, id: updated.id, status: updated.status });
  } catch (e: any) {
    console.error('Error in PATCH /admin/field-kyc/:id/status', e?.message || e);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ========= Bookings Admin =========
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

// GET /admin/bookings - list bookings with paid amounts, filter by period, pagination
// Query: ?period=daily|weekly|monthly&limit=20&cursor=<bookingId>
router.get('/bookings', requireAuth, requireSupadmin, async (req, res) => {
  try {
    const period = (req.query.period as string | undefined) || 'monthly';
    const { start, end } = periodToRange(period);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const cursor = (req.query.cursor as string | undefined) || undefined;
    const payment = (req.query.payment as string | undefined)?.toLowerCase();
    const paidOnly = ((req.query.paidOnly as string | undefined)?.toLowerCase() ?? undefined); // legacy support

    const where: any = {
      units: { some: { date: { gte: start, lte: end } } },
    };
    if (payment === 'paid') where.paymentStatus = 'PAID';
    else if (payment === 'unpaid') where.paymentStatus = { not: 'PAID' };
    else if (paidOnly != null) {
      // fallback to legacy paidOnly flag if provided
      if (paidOnly !== '0') where.paymentStatus = 'PAID';
    }

    const results = await (prisma as any).booking.findMany({
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
      const nxt = results[results.length - 1];
      nextCursor = nxt.id;
      items = results.slice(0, limit);
    }

    const mapped = items.map((b: any) => ({
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
    }));

    res.json({ items: mapped, nextCursor });
  } catch (e: any) {
    console.error('Error in GET /admin/bookings', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// GET /admin/bookings/summary - earnings by field
// Query: ?period=daily|weekly|monthly
router.get('/bookings/summary', requireAuth, requireSupadmin, async (req, res) => {
  try {
    const period = (req.query.period as string | undefined) || 'monthly';
    const { start, end } = periodToRange(period);
    const payment = (req.query.payment as string | undefined)?.toLowerCase();
    const paidOnly = ((req.query.paidOnly as string | undefined)?.toLowerCase() ?? undefined); // legacy support

    const where: any = {
      units: { some: { date: { gte: start, lte: end } } },
    };
    if (payment === 'paid') where.paymentStatus = 'PAID';
    else if (payment === 'unpaid') where.paymentStatus = { not: 'PAID' };
    else if (paidOnly != null) {
      if (paidOnly !== '0') where.paymentStatus = 'PAID';
    }

    const rows = await (prisma as any).booking.findMany({
      where,
      select: {
        fieldId: true,
        totalAmount: true,
        field: { select: { id: true, name: true } },
      },
    });

    const byField: Record<string, { fieldId: string; fieldName: string; totalEarnings: number; numBookings: number }> = {};
    for (const r of rows as any[]) {
      const key = r.fieldId;
      if (!byField[key]) {
        byField[key] = { fieldId: r.fieldId, fieldName: r.field?.name || '', totalEarnings: 0, numBookings: 0 };
      }
      byField[key].totalEarnings += r.totalAmount != null ? Number(r.totalAmount) : 0;
      byField[key].numBookings += 1;
    }

    const items = Object.values(byField).sort((a, b) => b.totalEarnings - a.totalEarnings);
    const total = items.reduce((acc, it) => acc + it.totalEarnings, 0);
    res.json({ items, total });
  } catch (e: any) {
    console.error('Error in GET /admin/bookings/summary', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /admin/bookings/unpaid - list unpaid (non-PAID) bookings for the period
// Query: ?period=daily|weekly|monthly&limit=20&cursor=<bookingId>
router.get('/bookings/unpaid', requireAuth, requireSupadmin, async (req, res) => {
  try {
    const period = (req.query.period as string | undefined) || 'monthly';
    const { start, end } = periodToRange(period);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const cursor = (req.query.cursor as string | undefined) || undefined;

    const where: any = {
      paymentStatus: { not: 'PAID' },
      units: { some: { date: { gte: start, lte: end } } },
    };

    const results = await (prisma as any).booking.findMany({
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
      const nxt = results[results.length - 1];
      nextCursor = nxt.id;
      items = results.slice(0, limit);
    }

    const mapped = items.map((b: any) => ({
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
    }));

    res.json({ items: mapped, nextCursor });
  } catch (e: any) {
    console.error('Error in GET /admin/bookings/unpaid', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch unpaid bookings' });
  }
});

export default router;


