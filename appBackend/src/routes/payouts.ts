import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

// GET /payouts/banks/me - list current user's bank accounts
router.get('/banks/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const items = await (prisma as any).bankAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, bankName: true, accountName: true, accountNumber: true, createdAt: true },
    });
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch bank accounts' });
  }
});

// POST /payouts/banks - create a bank account
router.post('/banks', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { bankName, accountName, accountNumber } = (req.body || {}) as any;
    if (!bankName || !accountName || !accountNumber) {
      return res.status(400).json({ error: 'bankName, accountName and accountNumber are required' });
    }
    const created = await (prisma as any).bankAccount.create({
      data: {
        userId,
        bankName: String(bankName).trim(),
        accountName: String(accountName).trim(),
        accountNumber: String(accountNumber).trim(),
      },
      select: { id: true, bankName: true, accountName: true, accountNumber: true, createdAt: true },
    });
    res.json(created);
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ error: 'Bank account already exists' });
    }
    res.status(500).json({ error: e.message || 'Failed to create bank account' });
  }
});

// DELETE /payouts/banks/:id - delete a bank account owned by current user
router.delete('/banks/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const existing = await (prisma as any).bankAccount.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: 'Bank account not found' });
    }
    await (prisma as any).bankAccount.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to delete bank account' });
  }
});

// GET /payouts/wallets/me - list current user's wallet accounts
router.get('/wallets/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const items = await (prisma as any).walletAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, company: true, walletNumber: true, createdAt: true },
    });
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch wallet accounts' });
  }
});

// POST /payouts/wallets - create a wallet account
router.post('/wallets', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { company, walletNumber } = (req.body || {}) as any;
    if (!company || !walletNumber) {
      return res.status(400).json({ error: 'company and walletNumber are required' });
    }
    const created = await (prisma as any).walletAccount.create({
      data: {
        userId,
        company: String(company).trim(),
        walletNumber: String(walletNumber).trim(),
      },
      select: { id: true, company: true, walletNumber: true, createdAt: true },
    });
    res.json(created);
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ error: 'Wallet already exists' });
    }
    res.status(500).json({ error: e.message || 'Failed to create wallet' });
  }
});

// DELETE /payouts/wallets/:id - delete a wallet account owned by current user
router.delete('/wallets/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const existing = await (prisma as any).walletAccount.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    await (prisma as any).walletAccount.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to delete wallet' });
  }
});

// GET /payouts/owner/:ownerId - fetch both banks and wallets for a given owner (authenticated)
router.get('/owner/:ownerId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const ownerId = req.params.ownerId;
    if (!ownerId) return res.status(400).json({ error: 'ownerId is required' });
    // We don't expose sensitive data beyond numbers and labels. No extra PII.
    const [banks, wallets] = await Promise.all([
      (prisma as any).bankAccount.findMany({
        where: { userId: ownerId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, bankName: true, accountName: true, accountNumber: true },
      }),
      (prisma as any).walletAccount.findMany({
        where: { userId: ownerId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, company: true, walletNumber: true },
      }),
    ]);
    res.json({ banks, wallets });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch owner payout accounts' });
  }
});

export default router;


