import 'dotenv/config';

import { AdminUserStatus, AdminUserType } from '@prisma/client';

import { prisma } from '../src/db/prisma';

async function main(): Promise<void> {
  const email = process.argv[2]?.toLowerCase().trim();
  if (!email) {
    console.error('Usage: npx ts-node --files scripts/set-admin-user.ts <email>');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (!user) {
    console.error(`No user found for email: ${email}`);
    process.exit(1);
  }

  if (user.adminUser && user.adminUserType === AdminUserType.OWNER) {
    console.log(`Already an owner admin: ${email} (${user.id})`);
    return;
  }

  const ownerRole = await prisma.adminRole.findUnique({ where: { name: 'Owner' } });
  if (!ownerRole) {
    console.error('Owner role not found. Run: npx ts-node --files scripts/seed-admin-permissions.ts');
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        adminUser: true,
        adminUserType: AdminUserType.OWNER,
        adminUserStatus: AdminUserStatus.ACTIVE,
        // Keep in-app super admin path working for owners
        supadmin: true,
      },
    }),
    prisma.adminUserRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: ownerRole.id } },
      update: {},
      create: { userId: user.id, roleId: ownerRole.id },
    }),
    prisma.adminUserGroupMember.deleteMany({ where: { userId: user.id } }),
  ]);

  console.log(`Owner admin access granted: ${email} (${user.id})`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
