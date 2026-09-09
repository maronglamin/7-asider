import { Router, Response } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { acceptFieldManagerInvite, previewFieldManagerInvite } from '../field/invites';

const router = Router();

function sendInviteError(res: Response, e: any) {
  const status = Number(e?.status) || 500;
  if (status < 500) return res.status(status).json({ error: e.message });
  console.error('[field-managers]', e?.message || e);
  return res.status(500).json({ error: 'Failed to process manager invite' });
}

router.get('/manage-invite/:token', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const invite = await previewFieldManagerInvite({
      token: String(req.params.token || ''),
      userId: req.auth!.userId,
    });
    res.json({ invite });
  } catch (e: any) {
    sendInviteError(res, e);
  }
});

router.post('/manage-invite/:token/accept', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const result = await acceptFieldManagerInvite({
      token: String(req.params.token || ''),
      userId: req.auth!.userId,
    });
    res.json(result);
  } catch (e: any) {
    sendInviteError(res, e);
  }
});

export default router;
