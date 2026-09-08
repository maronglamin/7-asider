import { prisma } from '../db/prisma';
import { sendPushToUser, type AppPushData } from './pushNotifications';

const db = prisma as any;

async function notifyMany(userIds: string[], title: string, body: string, data: AppPushData) {
  const unique = [...new Set(userIds.filter(Boolean))];
  await Promise.allSettled(unique.map((id) => sendPushToUser(id, title, body, data)));
}

export async function notifySquadFixture(params: {
  squadId: string;
  squadName: string;
  fieldName: string;
  bookingId: string;
  excludeUserId?: string;
}): Promise<void> {
  const members = await db.squadMember.findMany({
    where: { squadId: params.squadId },
    select: { userId: true },
  });
  const userIds = members.map((m: any) => m.userId).filter((id: string) => id !== params.excludeUserId);
  const name = params.squadName || 'Your squad';
  const field = params.fieldName || 'the field';
  await notifyMany(userIds, `${name} locked a pitch`, `${name} is booked at "${field}".`, {
    type: 'SQUAD_FIXTURE',
    bookingId: params.bookingId,
    openAs: 'customer',
    squadId: params.squadId,
  });
}

export async function notifySquadChallenge(params: {
  fromSquadName: string;
  bookingId: string;
  challengeToken: string;
  toSquadId?: string | null;
  excludeUserId?: string;
}): Promise<void> {
  const title = `${params.fromSquadName} wants a game`;
  const body = 'Tap to accept this 7v7 challenge.';
  const data: AppPushData = {
    type: 'SQUAD_CHALLENGE',
    bookingId: params.bookingId,
    challengeToken: params.challengeToken,
    openAs: 'challenge',
  };

  if (params.toSquadId) {
    const captains = await db.squadMember.findMany({
      where: { squadId: params.toSquadId, role: 'CAPTAIN' },
      select: { userId: true },
    });
    await notifyMany(
      captains.map((c: any) => c.userId).filter((id: string) => id !== params.excludeUserId),
      title,
      body,
      data,
    );
    return;
  }

  // Open challenge: notify the home squad so they know the link is live.
  const home = await db.bookingSquad.findFirst({
    where: { bookingId: params.bookingId, side: 'HOME' },
    select: { squadId: true },
  });
  if (!home) return;
  const members = await db.squadMember.findMany({
    where: { squadId: home.squadId },
    select: { userId: true },
  });
  await notifyMany(
    members.map((m: any) => m.userId).filter((id: string) => id !== params.excludeUserId),
    'Challenge link ready',
    `Share it so another squad can lock in vs ${params.fromSquadName}.`,
    data,
  );
}

export async function notifyChallengeAccepted(params: {
  bookingId: string;
  homeSquadId: string;
  awaySquadId: string;
  homeName: string;
  awayName: string;
}): Promise<void> {
  const members = await db.squadMember.findMany({
    where: { squadId: { in: [params.homeSquadId, params.awaySquadId] } },
    select: { userId: true, squadId: true },
  });
  await notifyMany(
    members.map((m: any) => m.userId),
    'Game on',
    `${params.homeName} vs ${params.awayName} is locked in.`,
    {
      type: 'SQUAD_CHALLENGE_ACCEPTED',
      bookingId: params.bookingId,
      openAs: 'customer',
    },
  );
}
