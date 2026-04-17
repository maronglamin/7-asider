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

export async function createEasypayOrder(
  businessId: string,
  input: { partnerExternalBookingId: string; amountGmd: number; currency?: string },
) {
  const json = await partnerJson<{
    data?: {
      order?: Record<string, unknown>;
    };
  }>(`/businesses/${encodeURIComponent(businessId)}/orders`, { method: 'POST', body: input });
  const rawOrder =
    json?.data?.order ?? (json as any)?.data?.order ?? (json as any)?.data;
  if (!rawOrder || typeof rawOrder !== 'object') {
    throw new Error(`Easypay create order: missing order in response: ${JSON.stringify(json).slice(0, 400)}`);
  }
  const ro = rawOrder as Record<string, unknown>;
  const idVal = ro.id ?? ro.orderId ?? (ro as any).order_id;
  if (idVal == null || String(idVal).trim() === '') {
    throw new Error(`Easypay create order: missing order id in response: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return {
    ...ro,
    id: String(idVal),
    publicCode: String(ro.publicCode ?? ro.public_code ?? ''),
    status: String(ro.status ?? ''),
    total: Number(ro.total ?? 0),
    currency: String(ro.currency ?? 'GMD'),
    partnerExternalBookingId: (ro.partnerExternalBookingId ?? ro.partner_external_booking_id ?? null) as string | null,
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

export async function startEasypayWalletCheckout(
  businessId: string,
  orderId: string,
  body: { gatewayCode: string; payerPhone?: string },
) {
  const json = await partnerJson<{ data: {
    payment: Record<string, unknown>;
    qrPayload: string;
    launchUrl: string;
    paymentHtml: string | null;
    checkoutAdapter: string;
  } }>(
    `/businesses/${encodeURIComponent(businessId)}/orders/${encodeURIComponent(orderId)}/payments/wallet`,
    { method: 'POST', body },
  );
  return json.data;
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
