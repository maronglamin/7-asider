import { prisma } from '../db/prisma';

export function normalizeEmail(email?: string) {
  return String(email || '').trim().toLowerCase();
}

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  provider: string | null;
  supadmin: boolean;
  status: string;
};

/** Non-terminated users matching email (case-insensitive). */
export async function findActiveUsersByEmail(normalizedEmail: string): Promise<AuthUser[]> {
  return prisma.user.findMany({
    where: {
      email: { equals: normalizedEmail, mode: 'insensitive' },
      NOT: { status: 'TERMINATED' as any },
    } as any,
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      provider: true,
      supadmin: true,
      status: true,
    },
  }) as Promise<AuthUser[]>;
}

/** Prefer the email/password account when duplicate rows differ only by casing or provider. */
export function pickEmailPasswordUser(users: AuthUser[]): AuthUser | undefined {
  return (
    users.find((u) => u.provider === 'email' && u.passwordHash) ||
    users.find((u) => u.passwordHash) ||
    undefined
  );
}

/** Active account for passwordless email sign-in. Prefers email provider, then any ACTIVE row. */
export function pickActiveUserForOtp(users: AuthUser[]): AuthUser | undefined {
  const blocked = users.find((u) => u.status === 'BLOCKED');
  const active = users.filter((u) => u.status === 'ACTIVE');
  if (active.length === 0) return blocked;
  return active.find((u) => u.provider === 'email') || active[0];
}

export function loginFailureReason(users: AuthUser[]): string {
  if (users.length === 0) return 'Invalid credentials';
  if (users.some((u) => u.provider === 'google' || u.provider === 'apple' || u.provider === 'facebook')) {
    return 'This account uses social sign-in. Use Continue with Google.';
  }
  return 'Invalid credentials';
}
