import 'dotenv/config';

import { AdminUserType } from '@prisma/client';

import { MODULES, actionsForModule } from '../src/admin/permissions';
import { prisma } from '../src/db/prisma';

async function main(): Promise<void> {
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

  const allPermissions = await prisma.adminPermission.findMany();

  const ownerRole = await prisma.adminRole.upsert({
    where: { name: 'Owner' },
    update: { description: 'Full system access' },
    create: { name: 'Owner', description: 'Full system access' },
  });

  const fullAdminRole = await prisma.adminRole.upsert({
    where: { name: 'Full Admin' },
    update: {
      description: 'All operational and system-config permissions (matches prior super-admin surface)',
    },
    create: {
      name: 'Full Admin',
      description: 'All operational and system-config permissions (matches prior super-admin surface)',
    },
  });

  for (const role of [ownerRole, fullAdminRole]) {
    await prisma.adminRolePermission.deleteMany({ where: { roleId: role.id } });
    if (allPermissions.length > 0) {
      await prisma.adminRolePermission.createMany({
        data: allPermissions.map((p) => ({
          roleId: role.id,
          permissionId: p.id,
        })),
      });
    }
  }

  await prisma.adminUserGroup.upsert({
    where: { name: 'Full Admins' },
    update: { roleId: fullAdminRole.id, description: 'Operators with full admin feature access' },
    create: {
      name: 'Full Admins',
      description: 'Operators with full admin feature access',
      roleId: fullAdminRole.id,
    },
  });

  const owners = await prisma.user.findMany({
    where: { adminUser: true, adminUserType: AdminUserType.OWNER },
    select: { id: true, email: true },
  });

  for (const owner of owners) {
    await prisma.adminUserRole.upsert({
      where: { userId_roleId: { userId: owner.id, roleId: ownerRole.id } },
      update: {},
      create: { userId: owner.id, roleId: ownerRole.id },
    });
  }

  console.log(`Seeded ${allPermissions.length} permissions`);
  console.log(`Owner + Full Admin roles ready; Full Admins group ready`);
  console.log(`Owner role linked to ${owners.length} owner account(s)`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
