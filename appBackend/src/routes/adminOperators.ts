import { Router, Response } from 'express';
import { AdminUserStatus, AdminUserType } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../db/prisma';
import { AdminAuthedRequest, requireAdminAccess } from '../middleware/adminAuth';
import { authorize } from '../middleware/adminAuthorize';

const router = Router();

const assignOperatorSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
  groupIds: z.array(z.string()).min(1, 'At least one group is required'),
});

const updateOperatorSchema = z.object({
  groupIds: z.array(z.string()).min(1, 'At least one group is required').optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

const operatorInclude = {
  adminGroups: {
    include: {
      group: {
        include: {
          role: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;

type OperatorWithGroups = {
  id: string;
  email: string;
  name: string | null;
  adminUserType: AdminUserType | null;
  adminUserStatus: AdminUserStatus;
  adminTotpEnabledAt: Date | null;
  createdAt: Date;
  adminGroups: Array<{
    group: {
      id: string;
      name: string;
      role: { id: string; name: string };
    };
  }>;
};

function paramId(req: AdminAuthedRequest): string {
  const id = req.params.id;
  if (Array.isArray(id)) return id[0] ?? '';
  return id ?? '';
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join('; ') || 'Invalid request';
}

function operatorWhere() {
  return {
    adminUser: true,
    adminUserType: AdminUserType.OPERATOR,
  };
}

function effectiveRoles(user: OperatorWithGroups) {
  const roleMap = new Map<string, { id: string; name: string }>();
  for (const membership of user.adminGroups) {
    roleMap.set(membership.group.role.id, membership.group.role);
  }
  return [...roleMap.values()];
}

function formatOperator(user: OperatorWithGroups) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.adminUserStatus,
    totpEnrolled: Boolean(user.adminTotpEnabledAt),
    createdAt: user.createdAt,
    roles: effectiveRoles(user),
    groups: user.adminGroups.map((ug) => ({ id: ug.group.id, name: ug.group.name })),
  };
}

router.get(
  '/',
  requireAdminAccess,
  authorize('system-config-operators', 'view'),
  async (_req: AdminAuthedRequest, res: Response) => {
    const users = await prisma.user.findMany({
      where: operatorWhere(),
      include: operatorInclude,
      orderBy: [{ email: 'asc' }],
    });
    res.json(users.map(formatOperator));
  },
);

router.get(
  '/candidates',
  requireAdminAccess,
  authorize('system-config-operators', 'edit'),
  async (req: AdminAuthedRequest, res: Response) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    if (q.length < 2) {
      return res.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        adminUser: true,
        adminUserType: true,
      },
      take: 20,
      orderBy: { email: 'asc' },
    });

    return res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isAdmin: u.adminUser,
        adminUserType: u.adminUserType,
      })),
    });
  },
);

router.get(
  '/:id',
  requireAdminAccess,
  authorize('system-config-operators', 'view'),
  async (req: AdminAuthedRequest, res: Response) => {
    const user = await prisma.user.findFirst({
      where: { id: paramId(req), ...operatorWhere() },
      include: operatorInclude,
    });

    if (!user) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    return res.json(formatOperator(user));
  },
);

router.post(
  '/',
  requireAdminAccess,
  authorize('system-config-operators', 'edit'),
  async (req: AdminAuthedRequest, res: Response) => {
    const parsed = assignOperatorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }

    const { userId, email, groupIds } = parsed.data;
    if (!userId && !email) {
      return res.status(400).json({ error: 'Provide userId or email' });
    }

    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : await prisma.user.findFirst({
          where: { email: { equals: email!.toLowerCase(), mode: 'insensitive' } },
        });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.adminUser && user.adminUserType === AdminUserType.OWNER) {
      return res.status(400).json({ error: 'Cannot assign operator access to an owner account' });
    }

    const groupCount = await prisma.adminUserGroup.count({
      where: { id: { in: groupIds } },
    });
    if (groupCount !== groupIds.length) {
      return res.status(400).json({ error: 'Invalid group IDs' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          adminUser: true,
          adminUserType: AdminUserType.OPERATOR,
          adminUserStatus: AdminUserStatus.ACTIVE,
        },
      });

      await tx.adminUserGroupMember.deleteMany({ where: { userId: user.id } });
      await tx.adminUserGroupMember.createMany({
        data: groupIds.map((groupId) => ({ userId: user.id, groupId })),
      });

      return tx.user.findUnique({
        where: { id: user.id },
        include: operatorInclude,
      });
    });

    return res.status(201).json(formatOperator(updated!));
  },
);

router.patch(
  '/:id',
  requireAdminAccess,
  authorize('system-config-operators', 'edit'),
  async (req: AdminAuthedRequest, res: Response) => {
    const parsed = updateOperatorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }

    const existing = await prisma.user.findFirst({
      where: { id: paramId(req), ...operatorWhere() },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    const { groupIds, status } = parsed.data;

    try {
      await prisma.$transaction(async (tx) => {
        if (status !== undefined) {
          await tx.user.update({
            where: { id: existing.id },
            data: { adminUserStatus: status as AdminUserStatus },
          });
        }

        if (groupIds !== undefined) {
          const groupCount = await tx.adminUserGroup.count({
            where: { id: { in: groupIds } },
          });
          if (groupCount !== groupIds.length) {
            throw new Error('INVALID_GROUPS');
          }
          await tx.adminUserGroupMember.deleteMany({ where: { userId: existing.id } });
          await tx.adminUserGroupMember.createMany({
            data: groupIds.map((groupId) => ({ userId: existing.id, groupId })),
          });
        }
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'INVALID_GROUPS') {
        return res.status(400).json({ error: 'Invalid group IDs' });
      }
      throw err;
    }

    const user = await prisma.user.findUnique({
      where: { id: existing.id },
      include: operatorInclude,
    });

    return res.json(formatOperator(user!));
  },
);

router.post(
  '/:id/disable',
  requireAdminAccess,
  authorize('system-config-operators', 'edit'),
  async (req: AdminAuthedRequest, res: Response) => {
    const existing = await prisma.user.findFirst({
      where: { id: paramId(req), ...operatorWhere() },
      include: operatorInclude,
    });

    if (!existing) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { adminUserStatus: AdminUserStatus.DISABLED },
      include: operatorInclude,
    });

    return res.json(formatOperator(updated));
  },
);

router.post(
  '/:id/enable',
  requireAdminAccess,
  authorize('system-config-operators', 'edit'),
  async (req: AdminAuthedRequest, res: Response) => {
    const existing = await prisma.user.findFirst({
      where: { id: paramId(req), ...operatorWhere() },
      include: operatorInclude,
    });

    if (!existing) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { adminUserStatus: AdminUserStatus.ACTIVE },
      include: operatorInclude,
    });

    return res.json(formatOperator(updated));
  },
);

router.delete(
  '/:id',
  requireAdminAccess,
  authorize('system-config-operators', 'delete'),
  async (req: AdminAuthedRequest, res: Response) => {
    const existing = await prisma.user.findFirst({
      where: { id: paramId(req), ...operatorWhere() },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    await prisma.$transaction([
      prisma.adminUserGroupMember.deleteMany({ where: { userId: existing.id } }),
      prisma.user.update({
        where: { id: existing.id },
        data: {
          adminUser: false,
          adminUserType: null,
          adminUserStatus: AdminUserStatus.ACTIVE,
          adminTotpSecret: null,
          adminTotpEnabledAt: null,
        },
      }),
    ]);

    return res.status(204).send();
  },
);

export default router;
