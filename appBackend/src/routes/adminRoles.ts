import { Router, Response } from 'express';
import { z } from 'zod';

import {
  ACTIONS,
  MODULES,
  actionsForModule,
  getModuleActionsMap,
} from '../admin/permissions';
import { prisma } from '../db/prisma';
import { AdminAuthedRequest, requireAdminAccess } from '../middleware/adminAuth';
import { authorize, authorizeAny } from '../middleware/adminAuthorize';

const router = Router();

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
});

const setPermissionsSchema = z.object({
  permissionIds: z.array(z.string()),
});

function paramId(req: AdminAuthedRequest): string {
  const id = req.params.id;
  if (Array.isArray(id)) return id[0] ?? '';
  return id ?? '';
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join('; ') || 'Invalid request';
}

router.get(
  '/permissions',
  requireAdminAccess,
  authorize('system-config-roles', 'view'),
  async (_req: AdminAuthedRequest, res: Response) => {
    const permissions = await prisma.adminPermission.findMany({
      orderBy: [{ moduleKey: 'asc' }, { actionKey: 'asc' }],
    });

    res.json({
      modules: [...MODULES],
      actions: [...ACTIONS],
      moduleActions: getModuleActionsMap(),
      permissions,
    });
  },
);

router.get(
  '/',
  requireAdminAccess,
  authorizeAny([
    ['system-config-roles', 'view'],
    ['system-config-groups', 'edit'],
  ]),
  async (_req: AdminAuthedRequest, res: Response) => {
    const roles = await prisma.adminRole.findMany({
      include: {
        _count: { select: { users: true, permissions: true, groups: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json(
      roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        userCount: r._count.users,
        groupCount: r._count.groups,
        permissionCount: r._count.permissions,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    );
  },
);

router.get(
  '/:id',
  requireAdminAccess,
  authorize('system-config-roles', 'view'),
  async (req: AdminAuthedRequest, res: Response) => {
    const role = await prisma.adminRole.findUnique({
      where: { id: paramId(req) },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true, groups: true } },
      },
    });

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    return res.json({
      id: role.id,
      name: role.name,
      description: role.description,
      userCount: role._count.users,
      groupCount: role._count.groups,
      permissionIds: role.permissions.map((rp) => rp.permissionId),
      permissions: role.permissions.map((rp) => rp.permission),
    });
  },
);

router.post(
  '/',
  requireAdminAccess,
  authorize('system-config-roles', 'edit'),
  async (req: AdminAuthedRequest, res: Response) => {
    const parsed = createRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }

    try {
      const role = await prisma.adminRole.create({ data: parsed.data });
      return res.status(201).json(role);
    } catch {
      return res.status(409).json({ error: 'Role name already exists' });
    }
  },
);

router.patch(
  '/:id',
  requireAdminAccess,
  authorize('system-config-roles', 'edit'),
  async (req: AdminAuthedRequest, res: Response) => {
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }

    try {
      const role = await prisma.adminRole.update({
        where: { id: paramId(req) },
        data: parsed.data,
      });
      return res.json(role);
    } catch {
      return res.status(404).json({ error: 'Role not found' });
    }
  },
);

router.put(
  '/:id/permissions',
  requireAdminAccess,
  authorize('system-config-roles', 'edit'),
  async (req: AdminAuthedRequest, res: Response) => {
    const parsed = setPermissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }

    const role = await prisma.adminRole.findUnique({ where: { id: paramId(req) } });
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const validCount = await prisma.adminPermission.count({
      where: { id: { in: parsed.data.permissionIds } },
    });
    if (validCount !== parsed.data.permissionIds.length) {
      return res.status(400).json({ error: 'One or more permission IDs are invalid' });
    }

    await prisma.$transaction([
      prisma.adminRolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.adminRolePermission.createMany({
        data: parsed.data.permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      }),
    ]);

    const updated = await prisma.adminRole.findUnique({
      where: { id: role.id },
      include: { permissions: { include: { permission: true } } },
    });

    return res.json({
      id: updated!.id,
      permissionIds: updated!.permissions.map((rp) => rp.permissionId),
    });
  },
);

router.delete(
  '/:id',
  requireAdminAccess,
  authorize('system-config-roles', 'delete'),
  async (req: AdminAuthedRequest, res: Response) => {
    const role = await prisma.adminRole.findUnique({
      where: { id: paramId(req) },
      include: { _count: { select: { users: true, groups: true } } },
    });

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    if (role.name === 'Owner') {
      return res.status(400).json({ error: 'Cannot delete the Owner role' });
    }
    if (role._count.users > 0 || role._count.groups > 0) {
      return res.status(400).json({ error: 'Role is in use and cannot be deleted' });
    }

    await prisma.adminRole.delete({ where: { id: role.id } });
    return res.status(204).send();
  },
);

export async function ensureAdminPermissionsSeeded(): Promise<void> {
  for (const moduleKey of MODULES) {
    for (const actionKey of actionsForModule(moduleKey)) {
      await prisma.adminPermission.upsert({
        where: { moduleKey_actionKey: { moduleKey, actionKey } },
        update: {
          name: `${moduleKey}:${actionKey}`,
          description: `${actionKey} permission for ${moduleKey}`,
        },
        create: {
          moduleKey,
          actionKey,
          name: `${moduleKey}:${actionKey}`,
          description: `${actionKey} permission for ${moduleKey}`,
        },
      });
    }
  }
}

export default router;
