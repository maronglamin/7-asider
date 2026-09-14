import type { NextFunction, Request, Response } from 'express';
import { AdminUserStatus } from '@prisma/client';

import { loadAdminAuthUser } from '../admin/auth-user';
import { verifyAdminToken, verifyPreAuthToken } from '../admin/tokens';
import { prisma } from '../db/prisma';

export type AdminAuthedRequest = Request & {
  adminUserId?: string;
  adminEmail?: string;
  adminPermissions?: string[];
};

export type PreAuthRequest = Request & {
  preAuthUserId?: string;
  preAuthEmail?: string;
};

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

export function isAdminApiKeyValid(req: Request): boolean {
  const key = req.headers['x-admin-key'];
  const expected = process.env.ADMIN_API_KEY?.trim();
  return Boolean(expected && key === expected);
}

export async function requireAdminAccess(
  req: AdminAuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isAdminApiKeyValid(req)) {
    next();
    return;
  }

  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload = verifyAdminToken(token);
    const authUser = await loadAdminAuthUser(payload.sub);
    if (!authUser) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    if (authUser.adminUserStatus === AdminUserStatus.DISABLED) {
      res.status(403).json({ error: 'Admin account is disabled' });
      return;
    }
    req.adminUserId = authUser.id;
    req.adminEmail = authUser.email;
    req.adminPermissions = authUser.permissions;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin session' });
  }
}

export async function requireAdminJwt(
  req: AdminAuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload = verifyAdminToken(token);
    const authUser = await loadAdminAuthUser(payload.sub);
    if (!authUser) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    if (authUser.adminUserStatus === AdminUserStatus.DISABLED) {
      res.status(403).json({ error: 'Admin account is disabled' });
      return;
    }
    req.adminUserId = authUser.id;
    req.adminEmail = authUser.email;
    req.adminPermissions = authUser.permissions;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin session' });
  }
}

export async function requireAdminPreAuth(
  req: PreAuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload = verifyPreAuthToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.adminUser) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    if (user.adminUserStatus === AdminUserStatus.DISABLED) {
      res.status(403).json({ error: 'Admin account is disabled' });
      return;
    }
    req.preAuthUserId = payload.sub;
    req.preAuthEmail = payload.email;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired verification session' });
  }
}
