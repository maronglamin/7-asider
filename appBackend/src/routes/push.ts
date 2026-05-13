import { Router, Response } from 'express';
import { Expo } from 'expo-server-sdk';
import { prisma } from '../db/prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { getWebPushPublicKey } from '../services/pushNotifications';

const router = Router();

// Public: browser needs VAPID public key before PushManager.subscribe (PWA / web).
router.get('/vapid-public-key', (_req, res: Response) => {
  const publicKey = getWebPushPublicKey();
  res.json({ publicKey: publicKey || null });
});

// Authenticated: register this device for the current user (field owners should register to receive booking alerts).
router.post('/register', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const channelRaw = String(req.body?.channel || '').toLowerCase().replace('-', '_');
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) return res.status(400).json({ error: 'token is required' });

    let channel: 'EXPO' | 'WEB_PUSH';
    if (channelRaw === 'expo') channel = 'EXPO';
    else if (channelRaw === 'web_push') channel = 'WEB_PUSH';
    else return res.status(400).json({ error: 'channel must be expo or web_push' });

    if (channel === 'EXPO') {
      if (!Expo.isExpoPushToken(token)) {
        return res.status(400).json({ error: 'Invalid Expo push token' });
      }
    } else {
      try {
        const j = JSON.parse(token) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        if (!j?.endpoint || !j?.keys?.p256dh || !j?.keys?.auth) {
          return res.status(400).json({ error: 'web_push token must be a PushSubscription JSON' });
        }
      } catch {
        return res.status(400).json({ error: 'web_push token must be valid JSON' });
      }
    }

    await prisma.pushDevice.upsert({
      where: {
        userId_channel_token: { userId, channel, token },
      },
      create: { userId, channel, token },
      update: { updatedAt: new Date() },
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[POST /push/register]', e);
    res.status(500).json({ error: e.message || 'Failed to register push device' });
  }
});

router.post('/unregister', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const channelRaw = String(req.body?.channel || '').toLowerCase().replace('-', '_');
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) return res.status(400).json({ error: 'token is required' });
    let channel: 'EXPO' | 'WEB_PUSH';
    if (channelRaw === 'expo') channel = 'EXPO';
    else if (channelRaw === 'web_push') channel = 'WEB_PUSH';
    else return res.status(400).json({ error: 'channel must be expo or web_push' });

    await prisma.pushDevice.deleteMany({ where: { userId, channel, token } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to unregister' });
  }
});

export default router;
