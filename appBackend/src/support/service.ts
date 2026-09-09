import { prisma } from '../db/prisma';
import { userFieldAccessFlags } from '../field/access';
import {
  createTicketingTicket,
  getTicketingConfig,
  getTicketingTicket,
  TicketingError,
} from '../ticketing/client';
import { isSupportTopic, topicLabel, type SupportKind, type SupportTopicKey } from './topics';

export { TicketingError };

export type PublicSupportComment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export type PublicSupportTicket = {
  id: string;
  ref: string;
  topic: SupportTopicKey;
  summary: string;
  message: string;
  kind: SupportKind;
  status: string;
  createdAt: string;
  comments: PublicSupportComment[];
};

type TicketRow = {
  id: string;
  ticketingId: string;
  ticketingRef: string;
  topic: string;
  summary: string;
  message: string;
  kind: string;
  status: string;
  createdAt: Date;
};

export function supportConfigured(): boolean {
  return getTicketingConfig().configured;
}

function toPublic(row: TicketRow, comments: PublicSupportComment[] = []): PublicSupportTicket {
  return {
    id: row.id,
    ref: row.ticketingRef,
    topic: isSupportTopic(row.topic) ? row.topic : 'other',
    summary: row.summary,
    message: row.message,
    kind: row.kind === 'issue' ? 'issue' : 'question',
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    comments,
  };
}

async function buildDescription(user: {
  id: string;
  name: string | null;
  email: string;
  supadmin: boolean;
  easypayBusinessId: string | null;
}, message: string): Promise<string> {
  const access = await userFieldAccessFlags(user.id);
  const role = user.supadmin
    ? 'super admin'
    : access.ownsFields
      ? 'field owner'
      : access.managesFields
        ? 'field manager'
        : 'customer';
  const lines = [
    'Customer',
    `Name: ${(user.name && user.name.trim()) || user.email}`,
    `Email: ${user.email}`,
    `Account ID: ${user.id}`,
    `Role: ${role}`,
    `directPay linked: ${user.easypayBusinessId ? 'yes' : 'no'}`,
    '',
    'Message',
    message.trim(),
  ];
  return lines.join('\n');
}

function buildSummary(topic: SupportTopicKey, summary: string): string {
  return `[${topicLabel(topic)}] ${summary.trim()}`.slice(0, 200);
}

export async function listSupportTickets(userId: string): Promise<PublicSupportTicket[]> {
  const rows = await prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  if (!rows.length || !supportConfigured()) {
    return rows.map((row) => toPublic(row));
  }

  try {
    const refreshed = await Promise.all(
      rows.map(async (row) => {
        const live = await getTicketingTicket(row.ticketingId);
        if (!live || live.status === row.status) return row;
        return prisma.supportTicket.update({
          where: { id: row.id },
          data: { status: live.status },
        });
      }),
    );
    return refreshed.map((row) => toPublic(row));
  } catch (error) {
    console.error('[support] status refresh failed', userId, error instanceof Error ? error.message : error);
    return rows.map((row) => toPublic(row));
  }
}

export async function createSupportTicket(
  user: {
    id: string;
    name: string | null;
    email: string;
    supadmin: boolean;
    easypayBusinessId: string | null;
  },
  input: { topic: SupportTopicKey; summary: string; message: string; kind: SupportKind },
): Promise<PublicSupportTicket> {
  const summary = buildSummary(input.topic, input.summary);
  const created = await createTicketingTicket({
    summary,
    description: await buildDescription(user, input.message),
    type: input.kind === 'issue' ? 'INCIDENT' : 'REQUEST',
    priority: input.kind === 'issue' ? 'HIGH' : 'MEDIUM',
  });

  const row = await prisma.supportTicket.create({
    data: {
      userId: user.id,
      ticketingId: created.id,
      ticketingRef: created.ref,
      topic: input.topic,
      summary: input.summary.trim(),
      message: input.message.trim(),
      kind: input.kind,
      status: created.status,
    },
  });

  console.log('[support] ticket created', user.id, row.id, created.ref, input.topic);
  return toPublic(row);
}

export async function getSupportTicket(
  userId: string,
  ticketId: string,
): Promise<PublicSupportTicket | null> {
  const row = await prisma.supportTicket.findFirst({
    where: { id: ticketId, userId },
  });
  if (!row) return null;

  if (!supportConfigured()) {
    return toPublic(row);
  }

  try {
    const live = await getTicketingTicket(row.ticketingId);
    const comments = live?.comments ?? [];
    if (!live || live.status === row.status) {
      return toPublic(row, comments);
    }
    const updated = await prisma.supportTicket.update({
      where: { id: row.id },
      data: { status: live.status },
    });
    return toPublic(updated, comments);
  } catch (error) {
    console.error('[support] detail refresh failed', userId, ticketId, error instanceof Error ? error.message : error);
    return toPublic(row);
  }
}
