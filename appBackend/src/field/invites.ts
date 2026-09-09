import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { getAppPublicUrl } from '../config/env';
import { sendFieldManagerInviteEmail } from './inviteMail';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeInviteEmail(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function newInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function acceptUrl(token: string): string {
  return `${getAppPublicUrl()}/manage-invite/${encodeURIComponent(token)}`;
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

export async function listFieldManagers(fieldId: string) {
  const [managers, pendingInvites] = await Promise.all([
    prisma.fieldManager.findMany({
      where: { fieldId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.fieldManagerInvite.findMany({
      where: { fieldId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, expiresAt: true, createdAt: true },
    }),
  ]);
  return {
    managers: managers.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: row.user.name,
      email: row.user.email,
      createdAt: row.createdAt,
    })),
    pendingInvites,
  };
}

export async function inviteFieldManager(opts: { fieldId: string; ownerUserId: string; email: unknown }) {
  const email = normalizeInviteEmail(opts.email);
  if (!EMAIL_RE.test(email)) {
    throw httpError(400, 'Enter a valid email address.');
  }

  const field = await prisma.fieldKyc.findUnique({
    where: { id: opts.fieldId },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!field || field.userId !== opts.ownerUserId) {
    throw httpError(404, 'Field not found');
  }

  const ownerEmail = normalizeInviteEmail(field.user.email);
  if (email === ownerEmail) {
    throw httpError(400, 'You already own this field.');
  }

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, status: { not: 'TERMINATED' } },
    select: { id: true },
  });
  if (existingUser) {
    const already = await prisma.fieldManager.findUnique({
      where: { fieldId_userId: { fieldId: field.id, userId: existingUser.id } },
      select: { id: true },
    });
    if (already) {
      throw httpError(409, 'That person already manages this field.');
    }
  }

  const token = newInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const pending = await prisma.fieldManagerInvite.findFirst({
    where: { fieldId: field.id, email, acceptedAt: null, revokedAt: null },
  });

  if (pending) {
    await prisma.fieldManagerInvite.update({
      where: { id: pending.id },
      data: { tokenHash, expiresAt, invitedByUserId: opts.ownerUserId },
    });
  } else {
    await prisma.fieldManagerInvite.create({
      data: {
        fieldId: field.id,
        email,
        tokenHash,
        invitedByUserId: opts.ownerUserId,
        expiresAt,
      },
    });
  }

  const ownerName = (field.user.name && field.user.name.trim()) || field.user.email || 'A field owner';
  await sendFieldManagerInviteEmail({
    to: email,
    fieldName: field.name || 'a field',
    ownerName,
    acceptUrl: acceptUrl(token),
  });

  return { ok: true, email, expiresAt };
}

export async function revokeFieldManager(opts: { fieldId: string; ownerUserId: string; managerUserId: string }) {
  const field = await prisma.fieldKyc.findUnique({
    where: { id: opts.fieldId },
    select: { id: true, userId: true },
  });
  if (!field || field.userId !== opts.ownerUserId) {
    throw httpError(404, 'Field not found');
  }
  const deleted = await prisma.fieldManager.deleteMany({
    where: { fieldId: field.id, userId: opts.managerUserId },
  });
  if (!deleted.count) {
    throw httpError(404, 'That manager was not found.');
  }
  return { ok: true };
}

export async function revokeFieldManagerInvite(opts: { fieldId: string; ownerUserId: string; inviteId: string }) {
  const field = await prisma.fieldKyc.findUnique({
    where: { id: opts.fieldId },
    select: { id: true, userId: true },
  });
  if (!field || field.userId !== opts.ownerUserId) {
    throw httpError(404, 'Field not found');
  }
  const invite = await prisma.fieldManagerInvite.findFirst({
    where: { id: opts.inviteId, fieldId: field.id, acceptedAt: null, revokedAt: null },
  });
  if (!invite) {
    throw httpError(404, 'Invite not found');
  }
  await prisma.fieldManagerInvite.update({
    where: { id: invite.id },
    data: { revokedAt: new Date() },
  });
  return { ok: true };
}

async function loadInviteByToken(token: string) {
  const raw = String(token || '').trim();
  if (!raw) throw httpError(400, 'This invite link is missing a token.');
  const invite = await prisma.fieldManagerInvite.findUnique({
    where: { tokenHash: hashInviteToken(raw) },
    include: {
      field: {
        select: {
          id: true,
          name: true,
          city: true,
          userId: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!invite) throw httpError(404, 'This invite was not found.');
  return invite;
}

export async function previewFieldManagerInvite(opts: { token: string; userId: string }) {
  const invite = await loadInviteByToken(opts.token);
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { id: true, email: true },
  });
  if (!user) throw httpError(401, 'Sign in to accept this invite.');

  const emailMatches = normalizeInviteEmail(user.email) === invite.email;
  const alreadyManager = await prisma.fieldManager.findUnique({
    where: { fieldId_userId: { fieldId: invite.fieldId, userId: user.id } },
    select: { id: true },
  });

  let status: 'pending' | 'accepted' | 'revoked' | 'expired' | 'wrong_email' = 'pending';
  if (invite.revokedAt) status = 'revoked';
  else if (invite.acceptedAt || alreadyManager) status = 'accepted';
  else if (invite.expiresAt.getTime() <= Date.now()) status = 'expired';
  else if (!emailMatches) status = 'wrong_email';

  return {
    status,
    emailMatches,
    invitedEmail: invite.email,
    expiresAt: invite.expiresAt,
    field: {
      id: invite.field.id,
      name: invite.field.name,
      city: invite.field.city,
    },
    owner: {
      name: invite.field.user.name,
      email: invite.field.user.email,
    },
    canAccept: status === 'pending' && emailMatches,
  };
}

export async function acceptFieldManagerInvite(opts: { token: string; userId: string }) {
  const preview = await previewFieldManagerInvite(opts);
  if (preview.status === 'accepted') {
    return { ok: true, alreadyMember: true, fieldId: preview.field.id };
  }
  if (preview.status === 'revoked') {
    throw httpError(410, 'This invite was cancelled.');
  }
  if (preview.status === 'expired') {
    throw httpError(410, 'This invite has expired. Ask the field owner to send a new one.');
  }
  if (preview.status === 'wrong_email') {
    throw httpError(403, `Sign in with ${preview.invitedEmail} to accept this invite.`);
  }

  const invite = await loadInviteByToken(opts.token);
  if (invite.field.userId === opts.userId) {
    throw httpError(400, 'You already own this field.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.fieldManager.upsert({
      where: { fieldId_userId: { fieldId: invite.fieldId, userId: opts.userId } },
      create: {
        fieldId: invite.fieldId,
        userId: opts.userId,
        invitedByUserId: invite.invitedByUserId,
      },
      update: {},
    });
    await tx.fieldManagerInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
  });

  return { ok: true, alreadyMember: false, fieldId: invite.fieldId };
}
