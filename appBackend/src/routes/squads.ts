import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { squadJoinRateLimiter } from '../middleware/rateLimit';
import {
  CHALLENGE_TTL_MS,
  MAX_MEMBERS_PER_SQUAD,
  MAX_SQUADS_PER_USER,
  STARTING_SIDE_SIZE,
  bookingSquadInclude,
  findMembership,
  isAllowedSquadColor,
  newChallengeToken,
  normalizeInviteCode,
  preferredInviteCodeFromName,
  sanitizeSquadEmoji,
  sanitizeSquadName,
  serializeBookingSquads,
  uniqueInviteCode,
} from '../utils/squads';
import {
  notifyChallengeAccepted,
  notifySquadChallenge,
  notifySquadFixture,
} from '../services/squadNotifications';

const db = prisma as any;

const router = Router();

function memberLabel(user: { name?: string | null; username?: string | null; email?: string | null } | null | undefined) {
  const name = String(user?.name || '').trim();
  if (name) return name;
  const username = String(user?.username || '').trim();
  if (username) return username;
  return 'Player';
}

function serializeMember(m: any) {
  return {
    id: m.id,
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt,
    name: memberLabel(m.user),
    username: m.user?.username || null,
  };
}

function serializeSquadSummary(squad: any, extras?: Record<string, unknown>) {
  const memberCount = squad._count?.members ?? squad.members?.length ?? 0;
  return {
    id: squad.id,
    name: squad.name,
    emoji: squad.emoji,
    color: squad.color,
    memberCount,
    foundedAt: squad.createdAt,
    startingSideProgress: Math.min(STARTING_SIDE_SIZE, memberCount),
    startingSideSize: STARTING_SIDE_SIZE,
    ...extras,
  };
}

async function expireChallengeIfNeeded(challenge: any) {
  if (!challenge) return challenge;
  if (challenge.status !== 'PENDING') return challenge;
  if (new Date(challenge.expiresAt).getTime() > Date.now()) return challenge;
  return db.squadChallenge.update({
    where: { id: challenge.id },
    data: { status: 'EXPIRED' },
  });
}

router.post('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const name = sanitizeSquadName((req.body || {}).name);
    if (name.length < 2) return res.status(400).json({ error: 'Give your squad a name (at least 2 characters).' });
    const emoji = sanitizeSquadEmoji((req.body || {}).emoji);
    const color = isAllowedSquadColor((req.body || {}).color) ? (req.body || {}).color : '#16a34a';

    const existingCount = await db.squadMember.count({ where: { userId } });
    if (existingCount >= MAX_SQUADS_PER_USER) {
      return res.status(409).json({ error: `You can be in at most ${MAX_SQUADS_PER_USER} squads.` });
    }

    const inviteCode = await uniqueInviteCode(preferredInviteCodeFromName(name));
    const squad = await db.squad.create({
      data: {
        name,
        emoji,
        color,
        inviteCode,
        members: {
          create: { userId, role: 'CAPTAIN' },
        },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, username: true } } } },
        _count: { select: { members: true } },
      },
    });

    res.json({
      ok: true,
      squad: serializeSquadSummary(squad, {
        role: 'CAPTAIN',
        inviteCode: squad.inviteCode,
        members: squad.members.map(serializeMember),
      }),
    });
  } catch (e: any) {
    console.error('[POST /squads]', e?.message || e);
    res.status(500).json({ error: 'Failed to create squad' });
  }
});

router.get('/mine', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const memberships = await db.squadMember.findMany({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
      include: {
        squad: { include: { _count: { select: { members: true } } } },
      },
    });
    res.json({
      items: memberships.map((m: any) =>
        serializeSquadSummary(m.squad, { role: m.role, joinedAt: m.joinedAt }),
      ),
    });
  } catch (e: any) {
    console.error('[GET /squads/mine]', e?.message || e);
    res.status(500).json({ error: 'Failed to load squads' });
  }
});

router.post('/join', requireAuth, squadJoinRateLimiter, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const code = normalizeInviteCode((req.body || {}).code);
    if (code.length < 4) return res.status(400).json({ error: 'Enter a valid invite code.' });

    const squad = await db.squad.findUnique({
      where: { inviteCode: code },
      include: { _count: { select: { members: true } } },
    });
    if (!squad) return res.status(404).json({ error: 'That invite code does not match any squad.' });

    const existing = await findMembership(squad.id, userId);
    if (existing) {
      return res.json({
        ok: true,
        alreadyMember: true,
        squad: serializeSquadSummary(squad, { role: existing.role, inviteCode: squad.inviteCode }),
      });
    }

    const myCount = await db.squadMember.count({ where: { userId } });
    if (myCount >= MAX_SQUADS_PER_USER) {
      return res.status(409).json({ error: `You can be in at most ${MAX_SQUADS_PER_USER} squads.` });
    }
    if (squad._count.members >= MAX_MEMBERS_PER_SQUAD) {
      return res.status(409).json({ error: 'This squad is full.' });
    }

    const member = await db.squadMember.create({
      data: { squadId: squad.id, userId, role: 'MEMBER' },
    });

    res.json({
      ok: true,
      alreadyMember: false,
      squad: serializeSquadSummary(squad, {
        role: member.role,
        memberCount: squad._count.members + 1,
        inviteCode: undefined,
      }),
    });
  } catch (e: any) {
    console.error('[POST /squads/join]', e?.message || e);
    res.status(500).json({ error: 'Failed to join squad' });
  }
});

router.get('/challenge/:token', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Missing challenge token' });
    let challenge = await db.squadChallenge.findUnique({
      where: { token },
      include: {
        fromSquad: { select: { id: true, name: true, emoji: true, color: true } },
        toSquad: { select: { id: true, name: true, emoji: true, color: true } },
        booking: {
          include: {
            field: { select: { id: true, name: true, city: true, address: true } },
            ...bookingSquadInclude,
          },
        },
      },
    });
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    challenge = (await expireChallengeIfNeeded(challenge)) as typeof challenge;

    const memberships = await db.squadMember.findMany({
      where: { userId: req.auth!.userId, role: 'CAPTAIN' },
      include: { squad: { select: { id: true, name: true, emoji: true, color: true } } },
    });
    const captainSquads = memberships
      .map((m: any) => m.squad)
      .filter((s: any) => s.id !== challenge!.fromSquadId);

    res.json({
      challenge: {
        id: challenge.id,
        status: challenge.status,
        expiresAt: challenge.expiresAt,
        fromSquad: challenge.fromSquad,
        toSquad: challenge.toSquad,
        booking: {
          id: challenge.booking.id,
          startAt: challenge.booking.startAt,
          endAt: challenge.booking.endAt,
          status: challenge.booking.status,
          field: challenge.booking.field,
          squads: serializeBookingSquads((challenge.booking as any).squads),
        },
        canAccept: challenge.status === 'PENDING' && captainSquads.length > 0,
        captainSquads,
      },
    });
  } catch (e: any) {
    console.error('[GET /squads/challenge/:token]', e?.message || e);
    res.status(500).json({ error: 'Failed to load challenge' });
  }
});

router.post('/challenge/:token/accept', requireAuth, squadJoinRateLimiter, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const token = String(req.params.token || '').trim();
    const squadId = String((req.body || {}).squadId || '').trim();
    if (!token) return res.status(400).json({ error: 'Missing challenge token' });
    if (!squadId) return res.status(400).json({ error: 'Pick a squad to accept with.' });

    let challenge = await db.squadChallenge.findUnique({ where: { token } });
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    challenge = (await expireChallengeIfNeeded(challenge)) as typeof challenge;
    if (challenge.status !== 'PENDING') {
      return res.status(409).json({ error: 'This challenge is no longer open.' });
    }
    if (challenge.fromSquadId === squadId) {
      return res.status(409).json({ error: 'You cannot challenge your own squad.' });
    }
    if (challenge.toSquadId && challenge.toSquadId !== squadId) {
      return res.status(403).json({ error: 'This challenge is for a different squad.' });
    }

    const membership = await findMembership(squadId, userId);
    if (!membership || membership.role !== 'CAPTAIN') {
      return res.status(403).json({ error: 'Only a captain can accept a challenge.' });
    }

    const existingAway = await db.bookingSquad.findFirst({
      where: { bookingId: challenge.bookingId, side: 'AWAY' },
    });
    if (existingAway) {
      return res.status(409).json({ error: 'This fixture already has an away squad.' });
    }

    const awaySquad = await db.squad.findUnique({ where: { id: squadId } });
    if (!awaySquad) return res.status(404).json({ error: 'Squad not found' });

    await db.$transaction(async (tx: any) => {
      await tx.bookingSquad.create({
        data: { bookingId: challenge!.bookingId, squadId, side: 'AWAY' },
      });
      await tx.squadChallenge.update({
        where: { id: challenge!.id },
        data: { status: 'ACCEPTED', toSquadId: squadId, acceptedAt: new Date() },
      });
    });

    const home = await db.squad.findUnique({ where: { id: challenge.fromSquadId } });
    void notifyChallengeAccepted({
      bookingId: challenge.bookingId,
      homeSquadId: challenge.fromSquadId,
      awaySquadId: squadId,
      homeName: home?.name || 'Home',
      awayName: awaySquad.name,
    }).catch((err) => console.warn('[challenge accept] push failed', err));

    res.json({ ok: true, bookingId: challenge.bookingId });
  } catch (e: any) {
    if (String(e?.code) === 'P2002') {
      return res.status(409).json({ error: 'This fixture already has an away squad.' });
    }
    console.error('[POST /squads/challenge/:token/accept]', e?.message || e);
    res.status(500).json({ error: 'Failed to accept challenge' });
  }
});

router.post('/challenge/:token/decline', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const token = String(req.params.token || '').trim();
    let challenge = await db.squadChallenge.findUnique({ where: { token } });
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    challenge = (await expireChallengeIfNeeded(challenge)) as typeof challenge;
    if (challenge.status !== 'PENDING') {
      return res.status(409).json({ error: 'This challenge is no longer open.' });
    }

    const fromMembership = await findMembership(challenge.fromSquadId, userId);
    const toMembership = challenge.toSquadId ? await findMembership(challenge.toSquadId, userId) : null;
    const canDecline =
      fromMembership?.role === 'CAPTAIN' || toMembership?.role === 'CAPTAIN';
    if (!canDecline) return res.status(403).json({ error: 'Not allowed' });

    await db.squadChallenge.update({
      where: { id: challenge.id },
      data: { status: 'DECLINED' },
    });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[POST /squads/challenge/:token/decline]', e?.message || e);
    res.status(500).json({ error: 'Failed to decline challenge' });
  }
});

router.get('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const squad = await db.squad.findUnique({
      where: { id },
      include: {
        members: {
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
          include: { user: { select: { id: true, name: true, username: true } } },
        },
        _count: { select: { members: true } },
      },
    });
    if (!squad) return res.status(404).json({ error: 'Squad not found' });
    const membership = squad.members.find((m: any) => m.userId === userId);
    if (!membership) return res.status(403).json({ error: 'Join this squad to see the locker room.' });

    const isCaptain = membership.role === 'CAPTAIN';
    res.json({
      squad: serializeSquadSummary(squad, {
        role: membership.role,
        inviteCode: isCaptain ? squad.inviteCode : undefined,
        members: squad.members.map(serializeMember),
        you: serializeMember(membership),
      }),
    });
  } catch (e: any) {
    console.error('[GET /squads/:id]', e?.message || e);
    res.status(500).json({ error: 'Failed to load squad' });
  }
});

router.patch('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const membership = await findMembership(id, userId);
    if (!membership || membership.role !== 'CAPTAIN') {
      return res.status(403).json({ error: 'Only the captain can edit this squad.' });
    }

    const data: { name?: string; emoji?: string; color?: string } = {};
    if ((req.body || {}).name != null) {
      const name = sanitizeSquadName((req.body || {}).name);
      if (name.length < 2) return res.status(400).json({ error: 'Give your squad a name (at least 2 characters).' });
      data.name = name;
    }
    if ((req.body || {}).emoji != null) data.emoji = sanitizeSquadEmoji((req.body || {}).emoji);
    if ((req.body || {}).color != null) {
      if (!isAllowedSquadColor((req.body || {}).color)) {
        return res.status(400).json({ error: 'Pick a kit colour from the palette.' });
      }
      data.color = (req.body || {}).color;
    }

    const squad = await db.squad.update({
      where: { id },
      data,
      include: { _count: { select: { members: true } } },
    });
    res.json({
      ok: true,
      squad: serializeSquadSummary(squad, { role: 'CAPTAIN', inviteCode: squad.inviteCode }),
    });
  } catch (e: any) {
    console.error('[PATCH /squads/:id]', e?.message || e);
    res.status(500).json({ error: 'Failed to update squad' });
  }
});

router.post('/:id/invite/refresh', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const membership = await findMembership(id, userId);
    if (!membership || membership.role !== 'CAPTAIN') {
      return res.status(403).json({ error: 'Only the captain can refresh the invite.' });
    }
    const squad = await db.squad.findUnique({ where: { id } });
    if (!squad) return res.status(404).json({ error: 'Squad not found' });
    const inviteCode = await uniqueInviteCode(preferredInviteCodeFromName(squad.name));
    const updated = await db.squad.update({ where: { id }, data: { inviteCode } });
    res.json({ ok: true, inviteCode: updated.inviteCode });
  } catch (e: any) {
    console.error('[POST /squads/:id/invite/refresh]', e?.message || e);
    res.status(500).json({ error: 'Failed to refresh invite' });
  }
});

router.post('/:id/leave', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const squad = await db.squad.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!squad) return res.status(404).json({ error: 'Squad not found' });
    const membership = squad.members.find((m: any) => m.userId === userId);
    if (!membership) return res.status(403).json({ error: 'You are not in this squad.' });

    if (membership.role === 'CAPTAIN') {
      const others = squad.members.filter((m: any) => m.userId !== userId);
      if (others.length > 0) {
        return res.status(409).json({
          error: 'Pass the armband before you leave.',
          code: 'CAPTAIN_TRANSFER_REQUIRED',
        });
      }
      await db.squad.delete({ where: { id } });
      return res.json({ ok: true, dissolved: true });
    }

    await db.squadMember.delete({ where: { id: membership.id } });
    res.json({ ok: true, dissolved: false });
  } catch (e: any) {
    console.error('[POST /squads/:id/leave]', e?.message || e);
    res.status(500).json({ error: 'Failed to leave squad' });
  }
});

router.post('/:id/transfer-captain', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const nextUserId = String((req.body || {}).userId || '').trim();
    if (!nextUserId) return res.status(400).json({ error: 'Pick a teammate to take the armband.' });
    if (nextUserId === userId) return res.status(400).json({ error: 'You already have the armband.' });

    const membership = await findMembership(id, userId);
    if (!membership || membership.role !== 'CAPTAIN') {
      return res.status(403).json({ error: 'Only the captain can transfer the armband.' });
    }
    const next = await findMembership(id, nextUserId);
    if (!next) return res.status(404).json({ error: 'That player is not in this squad.' });

    await db.$transaction([
      db.squadMember.update({ where: { id: membership.id }, data: { role: 'MEMBER' } }),
      db.squadMember.update({ where: { id: next.id }, data: { role: 'CAPTAIN' } }),
    ]);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[POST /squads/:id/transfer-captain]', e?.message || e);
    res.status(500).json({ error: 'Failed to transfer captain' });
  }
});

router.delete('/:id/members/:userId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const captainId = req.auth!.userId;
    const id = req.params.id;
    const targetUserId = req.params.userId;
    if (targetUserId === captainId) {
      return res.status(400).json({ error: 'You cannot kick yourself. Leave the squad instead.' });
    }
    const membership = await findMembership(id, captainId);
    if (!membership || membership.role !== 'CAPTAIN') {
      return res.status(403).json({ error: 'Only the captain can drop a player.' });
    }
    const target = await findMembership(id, targetUserId);
    if (!target) return res.status(404).json({ error: 'Player is not in this squad.' });
    await db.squadMember.delete({ where: { id: target.id } });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[DELETE /squads/:id/members/:userId]', e?.message || e);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

router.get('/:id/matches', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const id = req.params.id;
    const membership = await findMembership(id, userId);
    if (!membership) return res.status(403).json({ error: 'Join this squad to see fixtures.' });

    const links = await db.bookingSquad.findMany({
      where: { squadId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          include: {
            field: { select: { id: true, name: true, city: true, address: true, images: { select: { url: true, order: true }, orderBy: { order: 'asc' }, take: 1 } } },
            ...bookingSquadInclude,
            challenges: {
              where: { status: { in: ['PENDING', 'ACCEPTED'] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { id: true, token: true, status: true, expiresAt: true },
            },
          },
        },
      },
    });

    const now = Date.now();
    const items = links.map((link: any) => {
      const b = link.booking;
      const endAt = b.endAt ? new Date(b.endAt).getTime() : 0;
      const statusUpper = String(b.status || '').toUpperCase();
      const isPast = (endAt && endAt < now) || statusUpper === 'COMPLETED' || statusUpper === 'CANCELLED' || statusUpper === 'PENDING_REFUND';
      return {
        id: b.id,
        fieldId: b.fieldId,
        fieldName: b.field?.name || 'Field',
        field: b.field,
        startAt: b.startAt,
        endAt: b.endAt,
        status: b.status,
        paymentStatus: b.paymentStatus,
        type: b.type,
        totalAmount: b.totalAmount,
        userId: b.userId,
        side: link.side,
        squads: serializeBookingSquads((b as any).squads),
        challenge: (b as any).challenges?.[0] || null,
        isPast,
        canManage: b.userId === userId,
      };
    });

    res.json({
      upcoming: items.filter((i: any) => !i.isPast),
      past: items.filter((i: any) => i.isPast),
    });
  } catch (e: any) {
    console.error('[GET /squads/:id/matches]', e?.message || e);
    res.status(500).json({ error: 'Failed to load squad matches' });
  }
});

router.post('/:id/challenges', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const fromSquadId = req.params.id;
    const bookingId = String((req.body || {}).bookingId || '').trim();
    if (!bookingId) return res.status(400).json({ error: 'bookingId is required' });

    const membership = await findMembership(fromSquadId, userId);
    if (!membership) return res.status(403).json({ error: 'Join this squad first.' });

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: {
        squads: true,
        field: { select: { name: true } },
      },
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (String(booking.status).toUpperCase() === 'CANCELLED' || String(booking.status).toUpperCase() === 'PENDING_REFUND') {
      return res.status(409).json({ error: 'This booking was cancelled.' });
    }

    const home = booking.squads.find((s: any) => s.side === 'HOME');
    if (!home || home.squadId !== fromSquadId) {
      return res.status(403).json({ error: 'Challenge from the home squad on this booking.' });
    }
    if (booking.squads.some((s: any) => s.side === 'AWAY')) {
      return res.status(409).json({ error: 'This fixture already has an away squad.' });
    }

    const isBooker = booking.userId === userId;
    const isHomeCaptain = membership.role === 'CAPTAIN';
    if (!isBooker && !isHomeCaptain) {
      return res.status(403).json({ error: 'Only the booker or captain can send a challenge.' });
    }

    const existing = await db.squadChallenge.findFirst({
      where: { bookingId, status: { in: ['PENDING', 'ACCEPTED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.status === 'ACCEPTED') {
      return res.status(409).json({ error: 'This fixture already has an accepted challenge.' });
    }
    if (existing?.status === 'PENDING' && new Date(existing.expiresAt).getTime() > Date.now()) {
      return res.json({
        ok: true,
        reused: true,
        challenge: { id: existing.id, token: existing.token, expiresAt: existing.expiresAt },
      });
    }
    if (existing?.status === 'PENDING') {
      await db.squadChallenge.update({ where: { id: existing.id }, data: { status: 'EXPIRED' } });
    }

    const fromSquad = await db.squad.findUnique({ where: { id: fromSquadId } });
    const challenge = await db.squadChallenge.create({
      data: {
        bookingId,
        fromSquadId,
        token: newChallengeToken(),
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });

    void notifySquadChallenge({
      fromSquadName: fromSquad?.name || 'A squad',
      bookingId,
      challengeToken: challenge.token,
      excludeUserId: userId,
    }).catch((err) => console.warn('[challenge create] push failed', err));

    res.json({
      ok: true,
      challenge: { id: challenge.id, token: challenge.token, expiresAt: challenge.expiresAt },
    });
  } catch (e: any) {
    console.error('[POST /squads/:id/challenges]', e?.message || e);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

export default router;
