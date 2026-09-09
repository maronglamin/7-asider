import { prisma } from '../db/prisma';

export type FieldAccess = {
  fieldId: string;
  ownerUserId: string;
  isOwner: boolean;
  isManager: boolean;
  allowed: boolean;
};

export function managedFieldWhere(userId: string) {
  return {
    OR: [{ userId }, { managers: { some: { userId } } }],
  };
}

export function bookingManageWhere(userId: string) {
  return {
    field: managedFieldWhere(userId),
  };
}

export async function canManageField(userId: string, fieldId: string): Promise<FieldAccess> {
  const field = await prisma.fieldKyc.findUnique({
    where: { id: fieldId },
    select: { id: true, userId: true },
  });
  if (!field) {
    return { fieldId, ownerUserId: '', isOwner: false, isManager: false, allowed: false };
  }
  const isOwner = field.userId === userId;
  if (isOwner) {
    return { fieldId, ownerUserId: field.userId, isOwner: true, isManager: false, allowed: true };
  }
  const manager = await prisma.fieldManager.findUnique({
    where: { fieldId_userId: { fieldId, userId } },
    select: { id: true },
  });
  const isManager = Boolean(manager);
  return {
    fieldId,
    ownerUserId: field.userId,
    isOwner: false,
    isManager,
    allowed: isManager,
  };
}

export async function requireFieldOwner(userId: string, fieldId: string): Promise<FieldAccess> {
  const access = await canManageField(userId, fieldId);
  if (!access.isOwner) {
    throw Object.assign(new Error('Not found'), { status: 404 });
  }
  return access;
}

export async function listFieldStaffUserIds(fieldId: string, ownerUserId?: string | null): Promise<string[]> {
  const ids = new Set<string>();
  if (ownerUserId) ids.add(ownerUserId);
  const managers = await prisma.fieldManager.findMany({
    where: { fieldId },
    select: { userId: true },
  });
  for (const row of managers) ids.add(row.userId);
  return [...ids];
}

export async function userFieldAccessFlags(userId: string): Promise<{ ownsFields: boolean; managesFields: boolean }> {
  const [owned, managed] = await Promise.all([
    prisma.fieldKyc.findFirst({ where: { userId }, select: { id: true } }),
    prisma.fieldManager.findFirst({ where: { userId }, select: { id: true } }),
  ]);
  return {
    ownsFields: Boolean(owned),
    managesFields: Boolean(managed),
  };
}
