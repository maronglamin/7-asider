import { Router, Request, Response } from 'express';
import { verifyGoogleIdToken } from '../auth/google';
import { verifyFacebookAccessToken } from '../auth/facebook';
import { verifyAppleIdentityToken } from '../auth/apple';
import { signJwt } from '../utils/jwt';
import { prisma } from '../db/prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();

function normalizeEmail(email?: string) {
  return String(email || '').trim().toLowerCase();
}

function toAuthUser(user: {
  id: string;
  email: string;
  name: string | null;
  supadmin: boolean;
  provider: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    supadmin: user.supadmin,
    provider: user.provider,
  };
}

router.post('/google', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body as { idToken: string };
    if (!idToken) return res.status(400).json({ error: 'idToken required' });
    const profile = await verifyGoogleIdToken(idToken);
    const email = profile.email
      ? normalizeEmail(profile.email)
      : `${profile.sub}@google.local`;
  // find non-terminated user with same email
    let user = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        NOT: { status: 'TERMINATED' as any },
      } as any,
    });
    if (user) {
      const uStatus = (user as any).status;
      if (uStatus === 'TERMINATED' || uStatus === 'BLOCKED') {
        return res.status(403).json({ error: 'Account is disabled' });
      }
      if (user.provider === 'email') {
        return res.status(409).json({
          error: 'An account with this email already exists. Sign in with email and password.',
        });
      }
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: profile.name, provider: 'google', providerId: profile.sub, email },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          name: profile.name,
          provider: 'google',
          providerId: profile.sub,
          status: 'ACTIVE' as any,
        } as any,
      });
    }
    if ((user as any).status === 'TERMINATED' || (user as any).status === 'BLOCKED') {
      return res.status(403).json({ error: 'Account is disabled' });
    }
    const jwt = signJwt({ userId: user.id, email: user.email, name: user.name ?? undefined, provider: 'google' });
    await prisma.session.create({ data: { userId: user.id, token: jwt } });
    res.json({ token: jwt, user: toAuthUser(user) });
  } catch (e: any) {
    res.status(401).json({ error: e.message || 'Google verification failed' });
  }
});

router.post('/facebook', async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body as { accessToken: string };
    if (!accessToken) return res.status(400).json({ error: 'accessToken required' });
    const profile = await verifyFacebookAccessToken(accessToken);
    const email = profile.email || `${profile.id}@facebook.local`;
    let user = await prisma.user.findFirst({ where: { email, NOT: { status: 'TERMINATED' as any } } as any });
    if (user) {
      if ((user as any).status === 'TERMINATED' || (user as any).status === 'BLOCKED') {
        return res.status(403).json({ error: 'Account is disabled' });
      }
      user = await prisma.user.update({ where: { id: user.id }, data: { name: profile.name, provider: 'facebook', providerId: profile.id } });
    } else {
      user = await prisma.user.create({ data: { email, name: profile.name, provider: 'facebook', providerId: profile.id, status: 'ACTIVE' as any } as any });
    }
    if ((user as any).status === 'TERMINATED' || (user as any).status === 'BLOCKED') {
      return res.status(403).json({ error: 'Account is disabled' });
    }
    const jwt = signJwt({ userId: user.id, email: user.email, name: user.name ?? undefined, provider: 'facebook' });
    await prisma.session.create({ data: { userId: user.id, token: jwt } });
    res.json({ token: jwt, profile });
  } catch (e: any) {
    res.status(401).json({ error: e.message || 'Facebook verification failed' });
  }
});

router.post('/apple', async (req: Request, res: Response) => {
  try {
    const { identityToken, clientId } = req.body as { identityToken: string; clientId: string };
    if (!identityToken || !clientId) return res.status(400).json({ error: 'identityToken and clientId required' });
    const profile = await verifyAppleIdentityToken(identityToken, clientId);
    const email = profile.email || `${profile.sub}@apple.local`;
    let user = await prisma.user.findFirst({ where: { email, NOT: { status: 'TERMINATED' as any } } as any });
    if (user) {
      if ((user as any).status === 'TERMINATED' || (user as any).status === 'BLOCKED') {
        return res.status(403).json({ error: 'Account is disabled' });
      }
      user = await prisma.user.update({ where: { id: user.id }, data: { provider: 'apple', providerId: profile.sub } });
    } else {
      user = await prisma.user.create({ data: { email, provider: 'apple', providerId: profile.sub, status: 'ACTIVE' as any } as any });
    }
    if ((user as any).status === 'TERMINATED' || (user as any).status === 'BLOCKED') {
      return res.status(403).json({ error: 'Account is disabled' });
    }
    const jwt = signJwt({ userId: user.id, email: user.email, provider: 'apple' });
    await prisma.session.create({ data: { userId: user.id, token: jwt } });
    res.json({ token: jwt, profile });
  } catch (e: any) {
    res.status(401).json({ error: e.message || 'Apple verification failed' });
  }
});

// Return current authenticated user details
router.get('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        supadmin: true,
        provider: true,
        providerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch user' });
  }
});

// Update current authenticated user's profile (currently supports username and name)
router.patch('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { username, name } = req.body as { username?: string; name?: string };

    const data: any = {};
    if (typeof username === 'string') {
      const trimmed = username.trim();
      if (trimmed.length === 0) return res.status(400).json({ error: 'Username cannot be empty' });
      if (!/^[-_.a-zA-Z0-9]{3,20}$/.test(trimmed)) {
        return res.status(400).json({ error: 'Username must be 3-20 chars: letters, numbers, - _ .' });
      }
      data.username = trimmed.toLowerCase();
    }
    if (typeof name === 'string') {
      const trimmedName = name.trim();
      if (trimmedName.length > 0) data.name = trimmedName;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No changes provided' });

    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          provider: true,
          providerId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return res.json(updated);
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return res.status(409).json({ error: 'Username already taken' });
      }
      throw e;
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to update profile' });
  }
});

// Update current user's account status (self-terminate)
router.patch('/me/status', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { status } = req.body as { status?: string };
    if (!status || status.toUpperCase() !== 'TERMINATED') {
      return res.status(400).json({ error: 'Only TERMINATED is allowed for self-update' });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'TERMINATED' as any },
    });
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to update status' });
  }
});

export default router;


