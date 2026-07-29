import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { getJwtSecret } from '../config/env';

export type AuthedRequest = Request & { auth?: { userId: string; token: string } };

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    if (!decoded?.userId) return res.status(401).json({ error: 'Invalid token' });

    const session = await prisma.session.findUnique({
      where: { token },
      select: { userId: true, revokedAt: true },
    });
    if (!session || session.revokedAt || session.userId !== decoded.userId) {
      return res.status(401).json({ error: 'Session is no longer valid' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { status: true },
    });
    const status = (user as any)?.status;
    if (!user || status === 'TERMINATED' || status === 'BLOCKED') {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    req.auth = { userId: decoded.userId, token };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export async function requireSupadmin(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
    const user = await prisma.user.findUnique({ where: { id: req.auth.userId } });
    if (!user?.supadmin) {
      return res.status(403).json({ error: 'Forbidden: super admin required' });
    }
    next();
  } catch (e: any) {
    console.error('requireSupadmin error', e?.message || e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
