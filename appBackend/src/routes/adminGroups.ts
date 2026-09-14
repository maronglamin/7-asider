import { Router, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../db/prisma';
import { AdminAuthedRequest, requireAdminAccess } from '../middleware/adminAuth';
import { authorize, authorizeAny } from '../middleware/adminAuthorize';

const router = Router();

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  roleId: z.string().min(1),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  roleId: z.string().min(1).optional(),
});

const groupInclude = {
  role: { select: { id: true, name: true } },
  _count: { select: { members: true } },
} as const;

function paramId(req: AdminAuthedRequest): string {
  const id = req.params.id;
  if (Array.isArray(id)) return id[0] ?? '';
  return id ?? '';
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join('; ') || 'Invalid request';
}

function formatGroup(group: {
  id: string;
  name: string;
  description: string | null;
  roleId: string;
  role: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
  _count: { members: number };
}) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    roleId: group.roleId,
    role: group.role,
    memberCount: group._count.members,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

router.get(
  '/',
  requireAdminAccess,
  authorizeAny([
    ['system-config-groups', 'view'],
    ['system-config-operators', 'view'],
    ['system-config-operators', 'edit'],
  ]),
  async (_req: AdminAuthedRequest, res: Response) => {
    const groups = await prisma.adminUserGroup.findMany({
      include: groupInclude,
      orderBy: { name: 'asc' },
    });
    res.json(groups.map(formatGroup));
  },
);

router.get(
  '/:id',
  requireAdminAccess,
  authorize('system-config-groups', 'view'),
  async (req: AdminAuthedRequest, res: Response) => {
    const group = await prisma.adminUserGroup.findUnique({
      where: { id: paramId(req) },
      include: groupInclude,
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    return res.json(formatGroup(group));
  },
);

router.post(
  '/',
  requireAdminAccess,
  authorize('system-config-groups', 'edit'),
  async (req: AdminAuthedRequest, res: Response) => {
    const parsed = createGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }

    const role = await prisma.adminRole.findUnique({ where: { id: parsed.data.roleId } });
    if (!role) {
      return res.status(400).json({ error: 'Invalid role ID' });
    }

    try {
      const group = await prisma.adminUserGroup.create({
        data: parsed.data,
        include: groupInclude,
      });
      return res.status(201).json(formatGroup(group));
    } catch {
      return res.status(409).json({ error: 'Group name already exists' });
    }
  },
);

router.patch(
  '/:id',
  requireAdminAccess,
  authorize('system-config-groups', 'edit'),
  async (req: AdminAuthedRequest, res: Response) => {
    const parsed = updateGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }

    if (parsed.data.roleId) {
      const role = await prisma.adminRole.findUnique({ where: { id: parsed.data.roleId } });
      if (!role) {
        return res.status(400).json({ error: 'Invalid role ID' });
      }
    }

    try {
      const group = await prisma.adminUserGroup.update({
        where: { id: paramId(req) },
        data: parsed.data,
        include: groupInclude,
      });
      return res.json(formatGroup(group));
    } catch {
      return res.status(404).json({ error: 'Group not found' });
    }
  },
);

router.delete(
  '/:id',
  requireAdminAccess,
  authorize('system-config-groups', 'delete'),
  async (req: AdminAuthedRequest, res: Response) => {
    const group = await prisma.adminUserGroup.findUnique({
      where: { id: paramId(req) },
      include: { _count: { select: { members: true } } },
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    if (group._count.members > 0) {
      return res.status(400).json({ error: 'Group has members and cannot be deleted' });
    }

    await prisma.adminUserGroup.delete({ where: { id: group.id } });
    return res.status(204).send();
  },
);

export default router;
