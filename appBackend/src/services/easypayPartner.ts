import fetch from 'node-fetch';

export type EasypayPartnerConfig = {
  baseUrl: string;
  apiSecret: string;
  configured: boolean;
};

export function getEasypayPartnerConfig(): EasypayPartnerConfig {
  const baseUrl = (process.env.EASYPAY_API_BASE_URL || '').replace(/\/$/, '');
  const apiSecret = (process.env.INTERNAL_PARTNER_API_SECRET || '').trim();
  return {
    baseUrl,
    apiSecret,
    configured: Boolean(baseUrl && apiSecret),
  };
}

/** HTTPS URL directPay should POST partner webhooks to (also sent on tenant provision). */
export function getEasypayPartnerWebhookUrl(): string | undefined {
  const explicit = (process.env.INTERNAL_PARTNER_WEBHOOK_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const apiBase = (process.env.API_BASE || '').trim().replace(/\/$/, '');
  if (apiBase) return `${apiBase}/webhooks/easypay-partner`;
  return undefined;
}

async function partnerJson<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { baseUrl, apiSecret, configured } = getEasypayPartnerConfig();
  if (!configured) {
    throw Object.assign(new Error('Easypay partner API is not configured'), { code: 'EASYPAY_NOT_CONFIGURED' });
  }
  const url = `${baseUrl}/api/internal-partner/v1${path.startsWith('/') ? path : `/${path}`}`;
  const method = init.method || 'GET';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiSecret}`,
    Accept: 'application/json',
  };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Easypay ${method} ${path} failed: ${res.status} ${text?.slice(0, 500)}`);
    (err as any).status = res.status;
    (err as any).body = json;
    throw err;
  }
  return json as T;
}

/** Easypay may nest wallets under different keys depending on API version. */
function extractWalletsPayload(json: any): unknown[] {
  const d = json?.data;
  if (!d) return [];
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.wallets)) return d.wallets;
  if (Array.isArray(d.checkoutWallets)) return d.checkoutWallets;
  if (Array.isArray(d.gatewayWallets)) return d.gatewayWallets;
  if (Array.isArray(d.items)) return d.items;
  if (d.data && Array.isArray((d.data as any).wallets)) return (d.data as any).wallets;
  return [];
}

export type NormalizedCheckoutWallet = {
  gatewayId: string;
  code: string;
  name: string;
  checkoutAdapter: string;
  hasStoredPayerPhone: boolean;
};

function normalizeWalletRow(raw: any): NormalizedCheckoutWallet | null {
  if (!raw || typeof raw !== 'object') return null;
  const code = String(raw.code ?? raw.gatewayCode ?? raw.gateway?.code ?? '').trim();
  if (!code) return null;
  const gatewayId = String(raw.gatewayId ?? raw.id ?? raw.gateway?.id ?? code).trim() || code;
  const name = String(raw.name ?? raw.label ?? raw.title ?? raw.displayName ?? code).trim() || code;
  const checkoutAdapter = String(raw.checkoutAdapter ?? raw.adapter ?? raw.type ?? '').trim();
  return {
    gatewayId,
    code,
    name,
    checkoutAdapter,
    hasStoredPayerPhone: Boolean(raw.hasStoredPayerPhone),
  };
}

export async function provisionEasypayTenant(input: {
  externalUserId: string;
  ownerEmail: string;
  ownerName: string;
  businessName: string;
  slug?: string;
  industry?: string;
  webhookUrl?: string | null;
}) {
  const json = await partnerJson<{ data: {
    businessId: string;
    userId: string;
    subscriptionId: string;
    slug: string;
    idempotentReplay: boolean;
  } }>('/provision', { method: 'POST', body: input });
  return json.data;
}

export type EasypayPartnerOrder = {
  id: string;
  publicCode: string;
  status: string;
  total: number;
  currency: string;
  partnerExternalBookingId: string | null;
  paymentStatus?: string;
  paymentId?: unknown;
  [key: string]: unknown;
};

function normalizeEasypayOrder(raw: unknown): EasypayPartnerOrder {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Easypay order: missing order in response');
  }
  const ro = raw as Record<string, unknown>;
  const idVal = ro.id ?? ro.orderId ?? (ro as any).order_id;
  if (idVal == null || String(idVal).trim() === '') {
    throw new Error(`Easypay order: missing order id in response: ${JSON.stringify(raw).slice(0, 400)}`);
  }
  return {
    ...ro,
    id: String(idVal),
    publicCode: String(ro.publicCode ?? ro.public_code ?? ''),
    status: String(ro.status ?? ro.orderStatus ?? ro.order_status ?? ''),
    total: Number(ro.total ?? ro.amount ?? ro.amountGmd ?? ro.amount_gmd ?? 0),
    currency: String(ro.currency ?? 'GMD'),
    partnerExternalBookingId: (ro.partnerExternalBookingId ?? ro.partner_external_booking_id ?? null) as
      | string
      | null,
    paymentStatus: String(ro.paymentStatus ?? ro.payment_status ?? ''),
    paymentId: ro.paymentId ?? ro.payment_id ?? null,
  };
}

export async function getEasypayOrder(businessId: string, orderId: string): Promise<EasypayPartnerOrder> {
  const json = await partnerJson<Record<string, unknown>>(
    `/businesses/${encodeURIComponent(businessId)}/orders/${encodeURIComponent(orderId)}`,
    { method: 'GET' },
  );
  const rawOrder =
    (json?.data && typeof json.data === 'object' && ((json.data as any).order ?? json.data)) || json?.order || json?.data;
  return normalizeEasypayOrder(rawOrder);
}

export async function createEasypayOrder(
  businessId: string,
  input: { partnerExternalBookingId: string; amountGmd: number; currency?: string },
): Promise<EasypayPartnerOrder> {
  const json = await partnerJson<{
    data?: {
      order?: Record<string, unknown>;
    };
  }>(`/businesses/${encodeURIComponent(businessId)}/orders`, { method: 'POST', body: input });
  const rawOrder =
    json?.data?.order ?? (json as any)?.data?.order ?? (json as any)?.data;
  return normalizeEasypayOrder(rawOrder);
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Depth-first search for http(s) or common app deep-link schemes (Wave, etc.). */
function findFirstLaunchableUrlInValue(value: unknown, depth = 0): string {
  if (depth > 8) return '';
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^https?:\/\//i.test(s) && s.length < 4096) return s;
    if (/^(wave|wv|intent|mailto):/i.test(s) && s.length < 4096) return s;
    return '';
  }
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstLaunchableUrlInValue(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    const found = findFirstLaunchableUrlInValue(v, depth + 1);
    if (found) return found;
  }
  return '';
}

/**
 * Easypay internal-partner wallet responses may use camelCase or snake_case, and may put URLs on `payment`.
 */
function normalizeWalletCheckoutFromPartnerResponse(json: unknown): {
  payment: Record<string, unknown>;
  qrPayload: string;
  launchUrl: string;
  paymentHtml: string | null;
  checkoutAdapter: string;
} {
  const j = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const data = j.data != null && typeof j.data === 'object' ? (j.data as Record<string, unknown>) : j;
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const paymentObj =
    root.payment && typeof root.payment === 'object'
      ? (root.payment as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const urlKeys = [
    'launchUrl',
    'launch_url',
    'checkoutUrl',
    'checkout_url',
    'redirectUrl',
    'redirect_url',
    'url',
    'paymentUrl',
    'payment_url',
    'deepLink',
    'deep_link',
    'mobileLaunchUrl',
    'mobile_launch_url',
    'waveUrl',
    'wave_url',
    'href',
    'link',
  ];
  let launchUrl = pickString(root, urlKeys) || pickString(paymentObj, urlKeys);
  const checkoutAdapter =
    pickString(root, ['checkoutAdapter', 'checkout_adapter', 'adapter']) ||
    pickString(paymentObj, ['checkoutAdapter', 'checkout_adapter', 'adapter']);
  const qrPayload =
    pickString(root, ['qrPayload', 'qr_payload', 'qr']) || pickString(paymentObj, ['qrPayload', 'qr_payload', 'qr']);
  const paymentHtmlRaw =
    pickString(root, ['paymentHtml', 'payment_html']) ||
    pickString(paymentObj, ['paymentHtml', 'payment_html']) ||
    '';
  if (!launchUrl) {
    launchUrl = findFirstLaunchableUrlInValue(root) || findFirstLaunchableUrlInValue(paymentObj) || findFirstLaunchableUrlInValue(j);
  }
  if (!launchUrl) {
    const rk = Object.keys(root).join(',');
    const pk = Object.keys(paymentObj).join(',');
    throw Object.assign(
      new Error(`Easypay wallet checkout returned no launch URL. data keys: ${rk || '(none)'}; payment keys: ${pk || '(none)'}`),
      { code: 'EASYPAY_NO_LAUNCH_URL' as const },
    );
  }
  return {
    payment: Object.keys(paymentObj).length ? paymentObj : root,
    qrPayload,
    launchUrl,
    paymentHtml: paymentHtmlRaw || null,
    checkoutAdapter,
  };
}

export async function listEasypayWallets(businessId: string, orderId: string): Promise<NormalizedCheckoutWallet[]> {
  const path = `/businesses/${encodeURIComponent(businessId)}/orders/${encodeURIComponent(orderId)}/checkout-wallets`;
  const json = await partnerJson<Record<string, unknown>>(path, { method: 'GET' });
  const rawList = extractWalletsPayload(json);
  const normalized = rawList
    .map((w) => normalizeWalletRow(w))
    .filter((w): w is NormalizedCheckoutWallet => w != null);
  if (normalized.length === 0 && rawList.length > 0) {
    const first = rawList[0];
    const keys = first && typeof first === 'object' ? Object.keys(first as object).join(',') : '';
    console.warn(
      '[easypay] checkout-wallets returned',
      rawList.length,
      'row(s) but none had a usable gateway code. First object keys:',
      keys || '(n/a)',
    );
  }
  if (normalized.length === 0 && rawList.length === 0) {
    const keys = json && typeof json === 'object' && json.data && typeof json.data === 'object'
      ? Object.keys(json.data as object).join(',')
      : '';
    console.warn(
      '[easypay] checkout-wallets returned no list or unknown shape. data keys:',
      keys || '(none)',
      'top-level keys:',
      json && typeof json === 'object' ? Object.keys(json).join(',') : '',
    );
  }
  return normalized;
}

/** Yonna checkout may require payer phone; Wave and others must not receive phone fields. */
export function easypayGatewayCodeNeedsPayerPhone(gatewayCode: string): boolean {
  return String(gatewayCode || '').toLowerCase().includes('yonna');
}

export async function startEasypayWalletCheckout(
  businessId: string,
  orderId: string,
  body: { gatewayCode: string; payerPhone?: string; gatewayId?: string },
) {
  const rawPhone = body.payerPhone && String(body.payerPhone).trim() ? String(body.payerPhone).trim() : undefined;
  const phone =
    rawPhone && easypayGatewayCodeNeedsPayerPhone(body.gatewayCode) ? rawPhone : undefined;
  const gatewayId =
    body.gatewayId && String(body.gatewayId).trim() ? String(body.gatewayId).trim() : undefined;

  const path = `/businesses/${encodeURIComponent(businessId)}/orders/${encodeURIComponent(orderId)}/payments/wallet`;

  /** Documented camelCase; some Easypay builds only bind snake_case and return 500 on camel. */
  const camel: Record<string, string> = { gatewayCode: body.gatewayCode };
  if (phone) camel.payerPhone = phone;
  if (gatewayId) camel.gatewayId = gatewayId;

  const snake: Record<string, string> = { gateway_code: body.gatewayCode };
  if (phone) snake.payer_phone = phone;
  if (gatewayId) snake.gateway_id = gatewayId;

  const attempts = [camel, snake];
  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const json = await partnerJson<unknown>(path, { method: 'POST', body: attempts[i] });
      return normalizeWalletCheckoutFromPartnerResponse(json);
    } catch (e: any) {
      lastErr = e;
      const st = e?.status;
      if (st === 500 && i < attempts.length - 1) {
        console.warn('[easypay] POST payments/wallet returned 500; retrying with alternate JSON casing', {
          businessId,
          orderId,
          gatewayCode: body.gatewayCode,
          hadGatewayId: Boolean(gatewayId),
        });
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/** APS step 1 — Easypay internal partner authorize (tries documented path, then compact path on 404). */
export async function authorizeEasypayApsWallet(
  businessId: string,
  orderId: string,
  body: { gatewayCode: string; payerMobile: string },
) {
  const b = encodeURIComponent(businessId);
  const o = encodeURIComponent(orderId);
  const paths = [
    `/businesses/${b}/orders/${o}/payments/aps-wallet/authorize`,
    `/businesses/${b}/orders/${o}/aps-wallet/authorize`,
  ];
  let lastErr: unknown;
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    try {
      const json = await partnerJson<any>(path, { method: 'POST', body });
      const d = json?.data ?? json;
      return {
        authState: String(d?.authState ?? d?.auth_state ?? ''),
        requiresOtp: Boolean(d?.requiresOtp ?? d?.requires_otp),
        raw: d,
      };
    } catch (e: any) {
      lastErr = e;
      if (e?.status === 404 && i < paths.length - 1) {
        console.warn('[easypay] APS authorize 404 on path, retrying alternate:', path);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/** APS step 2 — Easypay internal partner complete (same path fallback as authorize). */
export async function completeEasypayApsWallet(
  businessId: string,
  orderId: string,
  body: { gatewayCode: string; authState: string; otp?: string },
) {
  const b = encodeURIComponent(businessId);
  const o = encodeURIComponent(orderId);
  const paths = [
    `/businesses/${b}/orders/${o}/payments/aps-wallet/complete`,
    `/businesses/${b}/orders/${o}/aps-wallet/complete`,
  ];
  let lastErr: unknown;
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    try {
      const json = await partnerJson<any>(path, { method: 'POST', body });
      return json?.data ?? json;
    } catch (e: any) {
      lastErr = e;
      if (e?.status === 404 && i < paths.length - 1) {
        console.warn('[easypay] APS complete 404 on path, retrying alternate:', path);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export async function cancelEasypayOrder(businessId: string, orderId: string) {
  const { baseUrl, apiSecret, configured } = getEasypayPartnerConfig();
  if (!configured) return;
  const url = `${baseUrl}/api/internal-partner/v1/businesses/${encodeURIComponent(businessId)}/orders/${encodeURIComponent(orderId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiSecret}` },
  });
  if (res.status !== 204 && res.status !== 404) {
    const t = await res.text().catch(() => '');
    console.warn('[easypay] cancel order non-204', res.status, t?.slice(0, 300));
  }
}
