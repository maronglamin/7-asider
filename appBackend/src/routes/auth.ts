import { Router, Request, Response } from 'express';
import { verifyGoogleIdToken } from '../auth/google';
import { verifyFacebookAccessToken } from '../auth/facebook';
import { verifyAppleIdentityToken } from '../auth/apple';
import { signJwt } from '../utils/jwt';
import { prisma } from '../db/prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { AUTH_SESSION_SELECT, resolveRequestDeviceId, toAuthUserSession } from '../utils/authUser';
import { completeDeviceLogin, sendDeviceLoginError } from '../device/login';
import {
  getClientIp,
  getRequestDeviceId,
  parseDeviceInfo,
  registerOrUpdateUserDevice,
  resolveUserDeviceId,
} from '../device/service';

const router = Router();

async function issueTokenWithDevice(
  req: Request,
  res: Response,
  user: { id: string; email: string; name: string | null },
  provider: 'google' | 'apple' | 'facebook' | 'email',
  extra: Record<string, unknown> = {},
) {
  const full = await prisma.user.findUnique({ where: { id: user.id } });
  if (!full) {
    res.status(500).json({ error: 'Failed to create session' });
    return;
  }
  const device = await completeDeviceLogin(req, full);
  const jwt = signJwt({
    userId: user.id,
    email: user.email,
    name: user.name ?? undefined,
    provider,
  });
  await prisma.session.create({ data: { userId: user.id, token: jwt } });
  const sessionUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: AUTH_SESSION_SELECT,
  });
  res.json({
    token: jwt,
    user: sessionUser ? await toAuthUserSession(sessionUser, device.id) : undefined,
    device,
    ...extra,
  });
}

router.post('/google', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body as { idToken: string };
    if (!idToken) return res.status(400).json({ error: 'idToken required' });
    const profile = await verifyGoogleIdToken(idToken);
    const email = profile.email || `${profile.sub}@google.local`;
    let user = await prisma.user.findFirst({ where: { email, NOT: { status: 'TERMINATED' as any } } as any });
    if (user) {
      const uStatus = (user as any).status;
      if (uStatus === 'TERMINATED' || uStatus === 'BLOCKED') {
        return res.status(403).json({ error: 'Account is disabled' });
      }
      user = await prisma.user.update({ where: { id: user.id }, data: { name: profile.name, provider: 'google', providerId: profile.sub } });
    } else {
      user = await prisma.user.create({ data: { email, name: profile.name, provider: 'google', providerId: profile.sub, status: 'ACTIVE' as any } as any });
    }
    if ((user as any).status === 'TERMINATED' || (user as any).status === 'BLOCKED') {
      return res.status(403).json({ error: 'Account is disabled' });
    }
    await issueTokenWithDevice(req, res, user, 'google', { profile });
  } catch (e: any) {
    if (sendDeviceLoginError(res, e)) return;
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
    await issueTokenWithDevice(req, res, user, 'facebook', { profile });
  } catch (e: any) {
    if (sendDeviceLoginError(res, e)) return;
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
    await issueTokenWithDevice(req, res, user, 'apple', { profile });
  } catch (e: any) {
    if (sendDeviceLoginError(res, e)) return;
    res.status(401).json({ error: e.message || 'Apple verification failed' });
  }
});

router.get('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...AUTH_SESSION_SELECT,
        providerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const deviceId = await resolveRequestDeviceId(userId, req);
    res.json({
      ...(await toAuthUserSession(user, deviceId)),
      providerId: user.providerId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch user' });
  }
});

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
      if (trimmedName.length < 2) {
        return res.status(400).json({ error: 'Enter your full name' });
      }
      if (trimmedName.length > 80) {
        return res.status(400).json({ error: 'Name is too long' });
      }
      data.name = trimmedName;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No changes provided' });

    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data,
        select: {
          ...AUTH_SESSION_SELECT,
          providerId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      const deviceId = await resolveRequestDeviceId(userId, req);
      return res.json({
        ...(await toAuthUserSession(updated, deviceId)),
        providerId: updated.providerId,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
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

router.patch('/me/status', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { status } = req.body as { status?: string };
    if (!status || status.toUpperCase() !== 'TERMINATED') {
      return res.status(400).json({ error: 'Only TERMINATED is allowed for self-update' });
    }
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'TERMINATED' as any,
        deviceLockEnabled: false,
        lockedDeviceId: null,
      },
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

router.post('/register-device', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const input = parseDeviceInfo(req.body);
    if (!input) {
      return res.status(400).json({ error: 'Device information is required', code: 'DEVICE_REQUIRED' });
    }
    const device = await registerOrUpdateUserDevice(req.auth!.userId, input, getClientIp(req));
    return res.json({ device });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Failed to register device' });
  }
});

router.patch('/device-lock', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const enabled = (req.body as { enabled?: unknown })?.enabled;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) is required' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (enabled) {
      const input = parseDeviceInfo((req.body as { device?: unknown }).device);
      if (!input) {
        return res.status(400).json({
          error: 'Device information is required to enable device lock.',
          code: 'DEVICE_REQUIRED',
        });
      }

      const device = await registerOrUpdateUserDevice(userId, input, getClientIp(req));
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          deviceLockEnabled: true,
          lockedDeviceId: device.id,
        },
        select: AUTH_SESSION_SELECT,
      });

      await prisma.session.updateMany({
        where: { userId, revokedAt: null, token: { not: req.auth!.token } },
        data: { revokedAt: new Date() },
      });

      return res.json({
        user: await toAuthUserSession(updated, device.id),
        device,
      });
    }

    const requestDeviceId = getRequestDeviceId(req);
    const resolvedDeviceId = await resolveUserDeviceId(userId, requestDeviceId);

    if (user.deviceLockEnabled && user.lockedDeviceId) {
      if (!resolvedDeviceId || resolvedDeviceId !== user.lockedDeviceId) {
        return res.status(403).json({
          error:
            'Device lock can only be turned off from your registered device. Open 7-aside on that phone, tablet, or browser to disable this setting.',
          code: 'DEVICE_LOCK_VIOLATION',
        });
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        deviceLockEnabled: false,
        lockedDeviceId: null,
      },
      select: AUTH_SESSION_SELECT,
    });

    return res.json({
      user: await toAuthUserSession(updated, resolvedDeviceId),
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Failed to update device lock' });
  }
});

export default router;
