import { Router, Response } from 'express';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import {
  AppLockError,
  clearUserAppLock,
  setUserAppLock,
  verifyUserAppLock,
} from '../app-lock/service';

const router = Router();
const PIN_RE = /^\d{4}$/;

function sendAppLockError(res: Response, error: unknown): boolean {
  if (error instanceof AppLockError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return true;
  }
  return false;
}

router.post('/app-lock', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { secret, currentSecret } = (req.body || {}) as {
      secret?: string;
      currentSecret?: string;
    };
    if (!secret || !PIN_RE.test(secret)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }
    const type = await setUserAppLock(req.auth!.userId, secret, currentSecret);
    return res.json({ ok: true, type });
  } catch (error) {
    if (sendAppLockError(res, error)) return;
    return res.status(500).json({ error: 'Failed to save PIN' });
  }
});

router.delete('/app-lock', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    await clearUserAppLock(req.auth!.userId);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Failed to remove PIN' });
  }
});

router.post('/app-lock/verify', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { secret } = (req.body || {}) as { secret?: string };
    if (!secret) return res.status(400).json({ error: 'PIN is required' });
    await verifyUserAppLock(req.auth!.userId, secret);
    return res.json({ ok: true });
  } catch (error) {
    if (sendAppLockError(res, error)) return;
    return res.status(500).json({ error: 'Could not verify PIN' });
  }
});

export default router;
