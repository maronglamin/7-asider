import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import {
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
  supportConfigured,
  TicketingError,
} from '../support/service';
import { isSupportTopic, SUPPORT_TOPICS, type SupportKind } from '../support/topics';

const router = Router();

function sendTicketingError(res: Response, error: unknown): boolean {
  if (error instanceof TicketingError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return true;
  }
  return false;
}

router.get('/tickets', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tickets = await listSupportTickets(req.auth!.userId);
    res.json({
      configured: supportConfigured(),
      topics: SUPPORT_TOPICS,
      tickets,
    });
  } catch (error) {
    if (sendTicketingError(res, error)) return;
    console.error('[GET /support/tickets]', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Could not load your tickets. Try again shortly.' });
  }
});

router.get('/tickets/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const ticketId = String(req.params.id || '');
  if (!ticketId) return res.status(400).json({ error: 'Ticket is required' });
  try {
    const ticket = await getSupportTicket(req.auth!.userId, ticketId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ticket });
  } catch (error) {
    if (sendTicketingError(res, error)) return;
    console.error('[GET /support/tickets/:id]', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Could not load this ticket. Try again shortly.' });
  }
});

router.post('/tickets', requireAuth, async (req: AuthedRequest, res: Response) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const topic = String(body.topic || '').trim();
  const summary = String(body.summary || '').trim();
  const message = String(body.message || '').trim();
  const kindRaw = String(body.kind || 'question').trim();
  const kind: SupportKind = kindRaw === 'issue' ? 'issue' : 'question';

  if (!isSupportTopic(topic)) return res.status(400).json({ error: 'Choose a topic' });
  if (summary.length < 3) return res.status(400).json({ error: 'Subject is too short' });
  if (summary.length > 160) return res.status(400).json({ error: 'Subject is too long' });
  if (message.length < 10) return res.status(400).json({ error: 'Please describe your request in a bit more detail' });
  if (message.length > 4000) return res.status(400).json({ error: 'Message is too long' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { id: true, name: true, email: true, supadmin: true, easypayBusinessId: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ticket = await createSupportTicket(user, { topic, summary, message, kind });
    res.status(201).json({ ticket });
  } catch (error) {
    if (sendTicketingError(res, error)) return;
    console.error('[POST /support/tickets]', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Could not send your request. Try again shortly.' });
  }
});

export default router;
