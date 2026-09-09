export type SupportTopicKey = 'bookings' | 'payments' | 'fields' | 'account' | 'squads' | 'other';
export type SupportKind = 'question' | 'issue';

export type SupportTopic = { key: SupportTopicKey; label: string };

export type SupportTicketComment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export type SupportTicketSummary = {
  id: string;
  ref: string;
  topic: SupportTopicKey;
  summary: string;
  message: string;
  kind: SupportKind;
  status: string;
  createdAt: string;
  comments?: SupportTicketComment[];
};

export const SUPPORT_TOPICS: SupportTopic[] = [
  { key: 'bookings', label: 'Bookings' },
  { key: 'payments', label: 'Payments & refunds' },
  { key: 'fields', label: 'My fields' },
  { key: 'account', label: 'Account' },
  { key: 'squads', label: 'Squads' },
  { key: 'other', label: 'Other' },
];

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Submitted',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
  REOPENED: 'Reopened',
  ESCALATED: 'Escalated',
};

export function supportStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ').toLowerCase();
}

export function formatSupportTicketDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatSupportTicketDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function supportTicketKindLabel(ticket: SupportTicketSummary): string {
  return ticket.kind === 'issue' ? 'Problem' : 'Question';
}

export function supportTopicLabel(topic: SupportTicketSummary['topic']): string {
  return SUPPORT_TOPICS.find((item) => item.key === topic)?.label ?? 'Other';
}
