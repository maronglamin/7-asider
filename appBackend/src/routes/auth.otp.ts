import { Router, Request, Response } from 'express';
import { randomInt } from 'crypto';
import { prisma } from '../db/prisma';
import { signJwt } from '../utils/jwt';
import { sendOtpEmail } from '../services/otpMail';
import { sendOtpRateLimiter } from '../middleware/rateLimit';
import {
  findActiveUsersByEmail,
  normalizeEmail,
  pickActiveUserForOtp,
} from '../utils/emailAuthLookup';
import { AUTH_SESSION_SELECT, toAuthUserSession } from '../utils/authUser';
import { formatDeviceForOtpEmail } from '../device/format';
import { assertExistingUserDeviceAllowed, completeDeviceLogin, sendDeviceLoginError } from '../device/login';
import { parseDeviceInfo } from '../device/service';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = 10 * 60 * 1000;

function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

router.post('/send-otp', sendOtpRateLimiter, async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail((req.body as { email?: string })?.email);
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }

    const matches = await findActiveUsersByEmail(email);
    const existing = pickActiveUserForOtp(matches);
    if (existing?.status === 'BLOCKED') {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    if (existing) {
      const full = await prisma.user.findUnique({ where: { id: existing.id } });
      if (full) {
        await assertExistingUserDeviceAllowed(req, full);
      }
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const deviceInput = parseDeviceInfo((req.body as { device?: unknown })?.device);
    const deviceSummary = deviceInput ? formatDeviceForOtpEmail(deviceInput) : undefined;
    const fullExisting = existing
      ? await prisma.user.findUnique({
          where: { id: existing.id },
          select: { deviceLockEnabled: true },
        })
      : null;

    await prisma.otpCode.deleteMany({ where: { email } });
    await prisma.otpCode.create({ data: { email, code, expiresAt } });
    await sendOtpEmail(email, code, {
      device: deviceSummary,
      accountDeviceLocked: fullExisting?.deviceLockEnabled ?? false,
    });

    return res.json({
      ok: true,
      message: 'Verification code sent',
      accountDeviceLocked: fullExisting?.deviceLockEnabled ?? false,
    });
  } catch (e: any) {
    if (sendDeviceLoginError(res, e)) return;
    return res.status(500).json({ error: e.message || 'Failed to send verification email' });
  }
});

router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail((req.body as { email?: string })?.email);
    const code = String((req.body as { code?: string })?.code || '').trim();
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Code must be 6 digits' });
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

    const matches = await findActiveUsersByEmail(email);
    let existing = pickActiveUserForOtp(matches);
    if (existing?.status === 'BLOCKED') {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    if (!existing) {
      existing = await prisma.user.create({
        data: {
          email,
          provider: 'email',
          status: 'ACTIVE' as any,
        } as any,
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          provider: true,
          supadmin: true,
          status: true,
        },
      }) as any;
    }

    if (!existing) {
      return res.status(500).json({ error: 'Failed to create account' });
    }

    const full = await prisma.user.findUnique({ where: { id: existing.id } });
    if (!full) return res.status(500).json({ error: 'Failed to create session' });

    const device = await completeDeviceLogin(req, full);

    const user = await prisma.user.findUnique({
      where: { id: existing.id },
      select: AUTH_SESSION_SELECT,
    });
    if (!user) return res.status(500).json({ error: 'Failed to create session' });

    const token = signJwt({
      userId: user.id,
      email: user.email,
      name: user.name ?? undefined,
      provider: (user.provider as any) || 'email',
    });
    await prisma.session.create({ data: { userId: user.id, token } });

    return res.json({
      token,
      user: await toAuthUserSession(user, device.id),
      device,
    });
  } catch (e: any) {
    if (sendDeviceLoginError(res, e)) return;
    return res.status(500).json({ error: e.message || 'Verification failed' });
  }
});

export default router;
