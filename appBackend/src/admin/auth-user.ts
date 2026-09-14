import { AdminUserStatus, AdminUserType } from '@prisma/client';

import { prisma } from '../db/prisma';
import {
  adminPermissionInclude,
  resolvePermissions,
  type UserWithPermissionGraph,
} from './permissions';

export type AdminAuthUser = {
  id: string;
  email: string;
  name: string | null;
  adminUser: boolean;
  adminUserType: AdminUserType | null;
  adminUserStatus: AdminUserStatus;
  totpEnrolled: boolean;
  permissions: string[];
};

export async function loadAdminAuthUser(userId: string): Promise<AdminAuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: adminPermissionInclude,
  });

  if (!user?.adminUser) return null;

  return toAdminAuthUser(user);
}

export function toAdminAuthUser(
  user: UserWithPermissionGraph & {
    id: string;
    email: string;
    name: string | null;
    adminUser: boolean;
    adminUserStatus: AdminUserStatus;
    adminTotpEnabledAt: Date | null;
    adminTotpSecret: string | null;
  },
): AdminAuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    adminUser: user.adminUser,
    adminUserType: user.adminUserType,
    adminUserStatus: user.adminUserStatus,
    totpEnrolled: Boolean(user.adminTotpEnabledAt && user.adminTotpSecret),
    permissions: resolvePermissions(user),
  };
}
