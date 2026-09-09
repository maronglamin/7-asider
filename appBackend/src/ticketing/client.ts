import fetch from 'node-fetch';

export type TicketingConfig = {
  baseUrl: string;
  apiKey: string;
  configured: boolean;
};

export type TicketingComment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export type TicketingTicket = {
  id: string;
  ref: string;
  summary: string;
  status: string;
  comments: TicketingComment[];
};

export class TicketingError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'TicketingError';
  }
}

export function getTicketingConfig(): TicketingConfig {
  const raw = (process.env.TICKETING_API_BASE_URL || '').replace(/\/$/, '');
  const baseUrl = raw && !raw.endsWith('/api') ? `${raw}/api` : raw;
  const apiKey = (process.env.TICKETING_API_KEY || '').trim();
  return {
    baseUrl,
    apiKey,
    configured: Boolean(baseUrl && apiKey),
  };
}

function ticketingMessage(json: Record<string, unknown>, fallback: string): string {
  const message = json.message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message)) {
    const first = message.find((item) => typeof item === 'string' && item.trim());
    if (typeof first === 'string') return first;
  }
  if (typeof json.error === 'string' && json.error.trim()) return json.error;
  return fallback;
}

async function ticketingJson<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { baseUrl, apiKey, configured } = getTicketingConfig();
  if (!configured) {
    throw new TicketingError(
      'Help & support is temporarily unavailable.',
      503,
      'TICKETING_NOT_CONFIGURED',
    );
  }

  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const method = init.method || 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Api-Key': apiKey,
  };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }

  let res: { ok: boolean; status: number; text: () => Promise<string> };
  try {
    res = await fetch(url, { method, headers, body });
  } catch (error) {
    console.error('[ticketing] request failed', method, path, error instanceof Error ? error.message : error);
    throw new TicketingError(
      'Could not reach support right now. Try again shortly.',
      503,
      'TICKETING_UNREACHABLE',
    );
  }

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }

  if (!res.ok) {
    console.error('[ticketing] API error', method, path, res.status);
    const userMessage =
      res.status === 401 || res.status === 403
        ? 'Help & support is temporarily unavailable.'
        : ticketingMessage(json, 'Could not send your request. Try again shortly.');
    throw new TicketingError(
      userMessage,
      res.status >= 500 ? 503 : res.status === 401 || res.status === 403 ? 503 : res.status,
      res.status === 401 || res.status === 403 ? 'TICKETING_UNAUTHORIZED' : 'TICKETING_ERROR',
    );
  }

  return json as T;
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseComments(raw: unknown): TicketingComment[] {
  if (!Array.isArray(raw)) return [];
  const comments: TicketingComment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (row.isInternal === true) continue;
    if (typeof row.id !== 'string' || typeof row.body !== 'string' || !row.body.trim()) {
      continue;
    }
    const author =
      row.author && typeof row.author === 'object' ? (row.author as Record<string, unknown>) : null;
    const authorName =
      typeof author?.name === 'string' && author.name.trim() ? author.name.trim() : 'Support';
    comments.push({
      id: row.id,
      body: row.body.trim(),
      authorName,
      createdAt: parseIsoDate(row.createdAt) ?? new Date(0).toISOString(),
    });
  }
  return comments;
}

export async function createTicketingTicket(input: {
  summary: string;
  description: string;
  type: 'REQUEST' | 'INCIDENT';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}): Promise<TicketingTicket> {
  const created = await ticketingJson<{
    id?: unknown;
    ref?: unknown;
    summary?: unknown;
    status?: unknown;
    comments?: unknown;
  }>('/v1/tickets', {
    method: 'POST',
    body: {
      summary: input.summary,
      description: input.description,
      type: input.type,
      priority: input.priority ?? 'MEDIUM',
    },
  });

  if (typeof created.id !== 'string' || typeof created.ref !== 'string') {
    throw new TicketingError('Support did not return a ticket number.', 502, 'TICKETING_INVALID');
  }

  return {
    id: created.id,
    ref: created.ref,
    summary: typeof created.summary === 'string' ? created.summary : input.summary,
    status: typeof created.status === 'string' ? created.status : 'NEW',
    comments: parseComments(created.comments),
  };
}

export async function getTicketingTicket(id: string): Promise<TicketingTicket | null> {
  try {
    const ticket = await ticketingJson<{
      id?: unknown;
      ref?: unknown;
      summary?: unknown;
      status?: unknown;
      comments?: unknown;
    }>(`/v1/tickets/${encodeURIComponent(id)}`);
    if (typeof ticket.id !== 'string' || typeof ticket.ref !== 'string') {
      return null;
    }
    return {
      id: ticket.id,
      ref: ticket.ref,
      summary: typeof ticket.summary === 'string' ? ticket.summary : '',
      status: typeof ticket.status === 'string' ? ticket.status : 'NEW',
      comments: parseComments(ticket.comments),
    };
  } catch (error) {
    if (error instanceof TicketingError && error.code === 'TICKETING_NOT_CONFIGURED') {
      throw error;
    }
    return null;
  }
}
