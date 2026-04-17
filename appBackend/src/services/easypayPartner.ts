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
  const json = await partnerJson<{ data: { order: {
    id: string;
    publicCode: string;
    status: string;
    total: number;
    currency: string;
    partnerExternalBookingId: string | null;
  } } }>(
    `/businesses/${encodeURIComponent(businessId)}/orders`,
    { method: 'POST', body: input },
  );
  return json.data.order;
}

export async function listEasypayWallets(businessId: string, orderId: string) {
  const json = await partnerJson<{ data: { wallets: Array<{
    gatewayId: string;
    code: string;
    name: string;
    checkoutAdapter: string;
    hasStoredPayerPhone: boolean;
  }> } }>(
    `/businesses/${encodeURIComponent(businessId)}/orders/${encodeURIComponent(orderId)}/checkout-wallets`,
    { method: 'GET' },
  );
  return json.data.wallets;
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
