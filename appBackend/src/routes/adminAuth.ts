import { randomInt } from 'crypto';
import { Router, Response } from 'express';
import { AdminUserStatus } from '@prisma/client';
import { z } from 'zod';

import { toAdminAuthUser } from '../admin/auth-user';
import { adminPermissionInclude } from '../admin/permissions';
import { signAdminToken, signPreAuthToken } from '../admin/tokens';
import {
  buildTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  totpQrDataUrl,
  verifyTotpCode,
} from '../admin/totp';
import { prisma } from '../db/prisma';
import {
  AdminAuthedRequest,
  PreAuthRequest,
  requireAdminJwt,
  requireAdminPreAuth,
} from '../middleware/adminAuth';
import { sendAdminOtpEmail } from '../services/adminOtpMail';
import { normalizeEmail } from '../utils/emailAuthLookup';

const router = Router();

const sendOtpSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Code must be numeric'),
});

const totpCodeSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Code must be numeric'),
});

const setupTotpSchema = z.object({
  secret: z.string().min(16).max(128),
});

function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join('; ') || 'Invalid request';
}

function toAdminProfile(user: {
  id: string;
  email: string;
  name: string | null;
  adminUser: boolean;
  adminUserType: import('@prisma/client').AdminUserType | null;
  adminUserStatus: AdminUserStatus;
  adminTotpEnabledAt: Date | null;
  adminTotpSecret: string | null;
  permissions?: string[];
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    adminUser: user.adminUser,
    adminUserType: user.adminUserType,
    adminUserStatus: user.adminUserStatus,
    totpEnrolled: Boolean(user.adminTotpEnabledAt && user.adminTotpSecret),
    permissions: user.permissions ?? [],
  };
}

router.post('/send-otp', async (req: PreAuthRequest, res: Response) => {
  const parsed = sendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
  });

  if (!user?.adminUser) {
    return res.status(403).json({ error: 'This email is not authorized for admin access' });
  }

  if (user.adminUserStatus === AdminUserStatus.DISABLED) {
    return res.status(403).json({ error: 'Admin account is disabled' });
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.otpCode.deleteMany({ where: { email } });
  await prisma.otpCode.create({ data: { email, code, expiresAt } });

  try {
    await sendAdminOtpEmail(email, code);
    return res.json({ ok: true, message: 'Verification code sent' });
  } catch (err: any) {
    console.error('[admin-auth] OTP send failed', err?.message || err);
    return res.status(500).json({ error: 'Failed to send verification email' });
  }
});

router.post('/verify-otp', async (req: PreAuthRequest, res: Response) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }

  const email = normalizeEmail(parsed.data.email);
  const { code } = parsed.data;
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
  });

  if (!user?.adminUser) {
    return res.status(403).json({ error: 'This email is not authorized for admin access' });
  }

  if (user.adminUserStatus === AdminUserStatus.DISABLED) {
    return res.status(403).json({ error: 'Admin account is disabled' });
  }

  const otp = await prisma.otpCode.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) {
    return res.status(400).json({ error: 'No verification code found. Request a new one.' });
  }

  if (otp.expiresAt < new Date()) {
    await prisma.otpCode.deleteMany({ where: { email } });
    return res.status(400).json({ error: 'Code expired. Request a new one.' });
  }

  if (otp.code !== code) {
    return res.status(400).json({ error: 'Incorrect code. Please try again.' });
  }

  await prisma.otpCode.deleteMany({ where: { email } });

  const preAuthToken = signPreAuthToken({ sub: user.id, email: user.email });
  const totpEnrolled = Boolean(user.adminTotpEnabledAt && user.adminTotpSecret);

  const userWithPerms = await prisma.user.findUnique({
    where: { id: user.id },
    include: adminPermissionInclude,
  });
  const authUser = userWithPerms ? toAdminAuthUser(userWithPerms) : null;

  return res.json({
    preAuthToken,
    totpRequired: true,
    totpEnrolled,
    admin: authUser
      ? toAdminProfile({
          ...authUser,
          adminTotpSecret: user.adminTotpSecret,
          adminTotpEnabledAt: user.adminTotpEnabledAt,
          permissions: authUser.permissions,
        })
      : toAdminProfile(user),
  });
});

router.post('/totp/setup', requireAdminPreAuth, async (req: PreAuthRequest, res: Response) => {
  const userId = req.preAuthUserId!;
  const email = req.preAuthEmail!;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.adminUser) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (user.adminTotpEnabledAt && user.adminTotpSecret) {
    return res.status(400).json({ error: 'Authenticator is already enrolled' });
  }

  const secret = generateTotpSecret();
  const uri = buildTotpUri(email, secret);
  const qrDataUrl = await totpQrDataUrl(uri);

  return res.json({
    secret,
    qrDataUrl,
    manualEntryKey: secret,
    issuer: process.env.ADMIN_TOTP_ISSUER?.trim() || '7-aside Admin',
  });
});

router.post('/totp/confirm', requireAdminPreAuth, async (req: PreAuthRequest, res: Response) => {
  const parsedBody = totpCodeSchema.safeParse(req.body);
  const parsedSecret = setupTotpSchema.safeParse({ secret: (req.body as any)?.secret });
  if (!parsedBody.success) {
    return res.status(400).json({ error: formatZodError(parsedBody.error) });
  }
  if (!parsedSecret.success) {
    return res.status(400).json({ error: 'Invalid authenticator setup' });
  }

  const userId = req.preAuthUserId!;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.adminUser) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (user.adminTotpEnabledAt && user.adminTotpSecret) {
    return res.status(400).json({ error: 'Authenticator is already enrolled' });
  }

  const { secret } = parsedSecret.data;
  const { code } = parsedBody.data;

  if (!verifyTotpCode(secret, code)) {
    return res.status(400).json({ error: 'Invalid authenticator code. Try again.' });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      adminTotpSecret: encryptTotpSecret(secret),
      adminTotpEnabledAt: new Date(),
    },
    include: adminPermissionInclude,
  });

  const token = signAdminToken({ sub: updated.id, email: updated.email });
  const authUser = toAdminAuthUser(updated);

  return res.json({
    token,
    admin: toAdminProfile({
      ...authUser,
      adminTotpSecret: updated.adminTotpSecret,
      adminTotpEnabledAt: updated.adminTotpEnabledAt,
      permissions: authUser.permissions,
    }),
  });
});

router.post('/totp/verify', requireAdminPreAuth, async (req: PreAuthRequest, res: Response) => {
  const parsed = totpCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }

  const userId = req.preAuthUserId!;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.adminUser) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!user.adminTotpSecret || !user.adminTotpEnabledAt) {
    return res.status(400).json({ error: 'Authenticator not enrolled. Complete setup first.' });
  }

  const secret = decryptTotpSecret(user.adminTotpSecret);
  if (!verifyTotpCode(secret, parsed.data.code)) {
    return res.status(400).json({ error: 'Invalid authenticator code. Try again.' });
  }

  const token = signAdminToken({ sub: user.id, email: user.email });
  const userWithPerms = await prisma.user.findUnique({
    where: { id: user.id },
    include: adminPermissionInclude,
  });
  const authUser = userWithPerms ? toAdminAuthUser(userWithPerms) : null;

  return res.json({
    token,
    admin: authUser
      ? toAdminProfile({
          ...authUser,
          adminTotpSecret: user.adminTotpSecret,
          adminTotpEnabledAt: user.adminTotpEnabledAt,
          permissions: authUser.permissions,
        })
      : toAdminProfile(user),
  });
});

router.get('/me', requireAdminJwt, async (req: AdminAuthedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.adminUserId! },
    include: adminPermissionInclude,
  });

  if (!user?.adminUser) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const authUser = toAdminAuthUser(user);
  return res.json({
    admin: toAdminProfile({
      ...authUser,
      adminTotpSecret: user.adminTotpSecret,
      adminTotpEnabledAt: user.adminTotpEnabledAt,
      permissions: authUser.permissions,
    }),
  });
});

export default router;
