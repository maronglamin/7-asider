import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { getEasypayPartnerConfig, getEasypayPartnerWebhookUrl, provisionEasypayTenant } from '../services/easypayPartner';

const router = Router();

function slugHint(userId: string, email: string): string {
  const local = (email || '').split('@')[0] || 'owner';
  const safe = local.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 24);
  return `7aside-${safe || 'owner'}-${userId.slice(0, 6)}`.toLowerCase();
}

/** Easypay tenant display name: "{fullname}-7-aside" (whitespace → single hyphen). */
function easypayBusinessNameFromProfile(user: { name: string | null | undefined; email: string }): string {
  const fullName = (user.name || '').trim();
  const fromEmail = (user.email || '').split('@')[0]?.trim() || '';
  const baseRaw = fullName || fromEmail || 'Owner';
  const base = baseRaw
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
  const safe = base || 'Owner';
  return `${safe}-7-aside`;
}

// GET /easypay/onboarding — current Easypay link status for the logged-in user (field owner)
router.get('/onboarding', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { configured } = getEasypayPartnerConfig();
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: {
        easypayBusinessId: true,
        easypaySlug: true,
        email: true,
        name: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const approvedFields = await prisma.fieldKyc.count({
      where: { userId: req.auth!.userId, status: 'APPROVED' },
    });
    res.json({
      serverConfigured: configured,
      linked: Boolean(user.easypayBusinessId),
      businessId: user.easypayBusinessId,
      slug: user.easypaySlug,
      hasApprovedField: approvedFields > 0,
      hint:
        approvedFields === 0
          ? 'After your first field is approved, you can link directPay to receive in-app payments.'
          : user.easypayBusinessId
            ? 'Your directPay merchant is linked. Customers can pay bookings with directPay checkout.'
            : 'Complete linking to create your directPay merchant and accept wallet payments.',
    });
  } catch (e: any) {
    console.error('[GET /easypay/onboarding]', e);
    res.status(500).json({ error: e.message || 'Failed to load directPay status' });
  }
});

// POST /easypay/onboarding — idempotent provision with Easypay (persists businessId)
router.post('/onboarding', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { configured } = getEasypayPartnerConfig();
    if (!configured) {
      return res.status(503).json({ error: 'directPay partner API is not configured on this server.' });
    }
    const userId = req.auth!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, easypayBusinessId: true, easypaySlug: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.easypayBusinessId) {
      return res.json({
        ok: true,
        idempotentReplay: true,
        businessId: user.easypayBusinessId,
        slug: user.easypaySlug,
      });
    }
    const approvedFields = await prisma.fieldKyc.count({
      where: { userId, status: 'APPROVED' },
    });
    if (approvedFields === 0) {
      return res.status(400).json({
        error: 'You need at least one approved field before linking directPay.',
      });
    }
    const businessName = easypayBusinessNameFromProfile(user);
    const ownerName = (user.name || user.email.split('@')[0] || 'Owner').trim();
    const webhookUrl = getEasypayPartnerWebhookUrl();
    const data = await provisionEasypayTenant({
      externalUserId: userId,
      ownerEmail: user.email,
      ownerName,
      businessName,
      slug: slugHint(userId, user.email),
      industry: 'sports-venue',
      ...(webhookUrl ? { webhookUrl } : {}),
    });
    await prisma.user.update({
      where: { id: userId },
      data: { easypayBusinessId: data.businessId, easypaySlug: data.slug },
    });
    res.json({
      ok: true,
      idempotentReplay: data.idempotentReplay,
      businessId: data.businessId,
      slug: data.slug,
      subscriptionId: data.subscriptionId,
    });
  } catch (e: any) {
    const msg = e?.message || 'directPay provision failed';
    console.error('[POST /easypay/onboarding]', msg, e?.body || '');
    if ((e as any)?.code === 'EASYPAY_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'directPay partner API is not configured on this server.' });
    }
    res.status(502).json({ error: msg });
  }
});

export default router;
