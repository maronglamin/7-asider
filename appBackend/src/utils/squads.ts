import crypto from 'crypto';
import { prisma } from '../db/prisma';

const db = prisma as any;

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const MAX_SQUADS_PER_USER = 5;
export const MAX_MEMBERS_PER_SQUAD = 20;
export const STARTING_SIDE_SIZE = 7;
export const CHALLENGE_TTL_MS = 72 * 60 * 60 * 1000;
export const ALLOWED_SQUAD_COLORS = [
  '#16a34a',
  '#166534',
  '#0f766e',
  '#1d4ed8',
  '#7c3aed',
  '#b45309',
  '#b91c1c',
  '#111827',
];

export function normalizeInviteCode(raw: unknown): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

export function preferredInviteCodeFromName(name: string): string {
  const letters = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (letters.length >= 4) return letters.slice(0, 8);
  return '';
}

function randomInviteCode(length = 6): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return out;
}

export async function uniqueInviteCode(preferred?: string): Promise<string> {
  const candidates: string[] = [];
  const pref = preferred ? normalizeInviteCode(preferred) : '';
  if (pref.length >= 4) candidates.push(pref);
  for (let i = 0; i < 16; i++) candidates.push(randomInviteCode(i < 8 ? 6 : 8));
  for (const code of candidates) {
    const exists = await (prisma as any).squad.findUnique({ where: { inviteCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  return `${randomInviteCode(6)}${randomInviteCode(4)}`;
}

export function newChallengeToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

export function isAllowedSquadColor(color: unknown): color is string {
  return typeof color === 'string' && ALLOWED_SQUAD_COLORS.includes(color);
}

export function sanitizeSquadName(raw: unknown): string {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 32);
}

export function sanitizeSquadEmoji(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '⚽';
  return Array.from(value).slice(0, 2).join('') || '⚽';
}

export async function findMembership(squadId: string, userId: string) {
  return db.squadMember.findUnique({
    where: { squadId_userId: { squadId, userId } },
  });
}

export async function userIsSquadMember(squadId: string, userId: string): Promise<boolean> {
  const row = await findMembership(squadId, userId);
  return Boolean(row);
}

export async function userCanViewBooking(bookingId: string, userId: string): Promise<{
  isBooker: boolean;
  isOwner: boolean;
  isSquadMember: boolean;
}> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      userId: true,
      fieldId: true,
      field: { select: { userId: true } },
      squads: { select: { squadId: true } },
    },
  });
  if (!booking) {
    return { isBooker: false, isOwner: false, isSquadMember: false };
  }
  const isBooker = booking.userId === userId;
  const isOwner = booking.field.userId === userId;
  let isManager = false;
  if (!isOwner && booking.fieldId) {
    const manager = await db.fieldManager.findUnique({
      where: { fieldId_userId: { fieldId: booking.fieldId, userId } },
      select: { id: true },
    });
    isManager = Boolean(manager);
  }
  let isSquadMember = false;
  if (booking.squads.length) {
    const membership = await db.squadMember.findFirst({
      where: {
        userId,
        squadId: { in: booking.squads.map((s: { squadId: string }) => s.squadId) },
      },
      select: { id: true },
    });
    isSquadMember = Boolean(membership);
  }
  return { isBooker, isOwner: isOwner || isManager, isSquadMember };
}

export const bookingSquadInclude = {
  squads: {
    orderBy: { side: 'asc' as const },
    include: {
      squad: {
        select: {
          id: true,
          name: true,
          emoji: true,
          color: true,
          members: {
            orderBy: { joinedAt: 'asc' as const },
            select: {
              userId: true,
              role: true,
              user: { select: { id: true, name: true, username: true } },
            },
          },
        },
      },
    },
  },
};

export function serializeBookingSquads(squads: any[] | undefined) {
  return (squads || []).map((link) => ({
    side: link.side,
    squad: {
      id: link.squad?.id,
      name: link.squad?.name,
      emoji: link.squad?.emoji,
      color: link.squad?.color,
      members: (link.squad?.members || []).map((m: any) => ({
        userId: m.userId,
        role: m.role,
        name: m.user?.name || m.user?.username || 'Player',
        username: m.user?.username || null,
      })),
    },
  }));
}
