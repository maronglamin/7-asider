import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../db/prisma';
import { signJwt } from '../utils/jwt';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { sendForgotPasswordEmail } from '../services/passwordMail';
import { forgotPasswordRateLimiter } from '../middleware/rateLimit';
import {
  findActiveUsersByEmail,
  loginFailureReason,
  normalizeEmail,
  pickEmailPasswordUser,
} from '../utils/emailAuthLookup';

const router = Router();
const GENERIC_FORGOT_PASSWORD_MESSAGE = 'If an eligible account exists for that email, a password reset message has been sent.';

function generateTemporaryPassword() {
  let password = '';
  while (password.length < 12) {
    password += randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  }
  return password.slice(0, 12);
}

router.post('/register-email', async (req: Request, res: Response) => {
  try {
    const { fullName, email, password, confirmPassword } = req.body as {
      fullName: string; email: string; password: string; confirmPassword: string;
    };
    const normalizedEmail = normalizeEmail(email);
    if (!fullName || !normalizedEmail || !password || !confirmPassword) return res.status(400).json({ error: 'Missing fields' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match' });
    // Only block if a non-terminated account exists with same email
    const existing = await prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        NOT: { status: 'TERMINATED' as any },
      } as any,
    });
    if (existing) return res.status(409).json({ error: 'Email already in use' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email: normalizedEmail, name: fullName, passwordHash, provider: 'email', status: 'ACTIVE' as any } as any });
    // For email provider, do not auto-login; ask user to sign in
    res.json({ message: 'Registration successful. Please sign in.', next: 'email_login' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Registration failed' });
  }
});

router.post('/login-email', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) return res.status(400).json({ error: 'Missing credentials' });
    const matches = await findActiveUsersByEmail(normalizedEmail);
    const user = pickEmailPasswordUser(matches);
    if (!user?.passwordHash) {
      return res.status(401).json({ error: loginFailureReason(matches) });
    }
    const uStatus = (user as any).status;
    if (uStatus === 'TERMINATED' || uStatus === 'BLOCKED') {
      return res.status(403).json({ error: 'Account is disabled' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signJwt({ userId: user.id, email: user.email, name: user.name ?? undefined, provider: 'email' });
    // Persist session
    await prisma.session.create({ data: { userId: user.id, token } });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, supadmin: user.supadmin, provider: user.provider } });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Login failed' });
  }
});

router.post('/forgot-password', forgotPasswordRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email: string };
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return res.status(400).json({ error: 'Email is required' });

    const matches = await findActiveUsersByEmail(normalizedEmail);
    const user = pickEmailPasswordUser(matches);

    if (!user || user.provider !== 'email' || !user.passwordHash || user.status !== 'ACTIVE') {
      return res.json({ message: GENERIC_FORGOT_PASSWORD_MESSAGE });
    }

    const previousPasswordHash = user.passwordHash;
    const temporaryPassword = generateTemporaryPassword();
    const nextPasswordHash = await bcrypt.hash(temporaryPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: nextPasswordHash },
    });

    try {
      await sendForgotPasswordEmail({
        to: user.email,
        name: user.name,
        temporaryPassword,
      });
    } catch (mailError) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: previousPasswordHash },
      });
      throw mailError;
    }

    await prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return res.json({ message: GENERIC_FORGOT_PASSWORD_MESSAGE });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to reset password' });
  }
});

router.post('/change-password', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { oldPassword, newPassword, confirmNewPassword } = req.body as {
      oldPassword: string;
      newPassword: string;
      confirmNewPassword: string;
    };

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ error: 'All password fields are required' });
    }
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.provider !== 'email' || !user.passwordHash) {
      return res.status(400).json({ error: 'Password changes are only available for email sign-in accounts' });
    }
    if ((user as any).status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    const matches = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!matches) return res.status(401).json({ error: 'Current password is incorrect' });
    if (oldPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from the current password' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null, token: { not: req.auth!.token } },
      data: { revokedAt: new Date() },
    });

    return res.json({ message: 'Password updated successfully' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to change password' });
  }
});

export default router;


