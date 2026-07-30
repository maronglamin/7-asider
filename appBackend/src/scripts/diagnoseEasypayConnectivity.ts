/**
 * Test outbound connectivity from THIS machine to directPay (EASYPAY_API_BASE_URL).
 * Run on the 7-aside production server — not only from your laptop.
 *
 *   npm run diagnose:easypay-connectivity
 */
import dotenv from 'dotenv';
import dns from 'node:dns/promises';
import net from 'node:net';
import https from 'node:https';
import fetch from 'node-fetch';

dotenv.config();

const baseUrl = (process.env.EASYPAY_API_BASE_URL || '').replace(/\/$/, '');
const apiSecret = (process.env.INTERNAL_PARTNER_API_SECRET || '').trim();

async function tcpProbe(host: string, port: number, ms = 8000): Promise<string> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, family: 4 });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(`timeout after ${ms}ms`);
    }, ms);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve('ok');
    });
    socket.on('error', (e) => {
      clearTimeout(timer);
      resolve(String((e as NodeJS.ErrnoException).code || e.message));
    });
  });
}

async function httpsRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; body: string; error?: string }> {
  try {
    const agent = new https.Agent({ family: 4 });
    const res = await fetch(url, {
      method: init.method || 'GET',
      headers: init.headers,
      body: init.body,
      agent: agent as any,
      timeout: 12000,
    } as any);
    const body = (await res.text()).slice(0, 200);
    return { status: res.status, body };
  } catch (e: any) {
    return { status: 0, body: '', error: String(e?.message || e) };
  }
}

async function main() {
  console.log('=== directPay connectivity (run on 7-aside server) ===\n');

  if (!baseUrl) {
    console.error('EASYPAY_API_BASE_URL is not set in .env');
    process.exit(1);
  }

  let host = '';
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    console.error('EASYPAY_API_BASE_URL is not a valid URL:', baseUrl);
    process.exit(1);
  }

  console.log('EASYPAY_API_BASE_URL:', baseUrl);
  console.log('INTERNAL_PARTNER_API_SECRET:', apiSecret ? `set (len=${apiSecret.length})` : 'MISSING');
  console.log('');

  try {
    const [aRecords, aaaaRecords] = await Promise.all([
      dns.resolve4(host).catch(() => [] as string[]),
      dns.resolve6(host).catch(() => [] as string[]),
    ]);
    console.log('DNS A:', aRecords.length ? aRecords.join(', ') : '(none)');
    console.log('DNS AAAA:', aaaaRecords.length ? aaaaRecords.join(', ') : '(none)');
  } catch (e: any) {
    console.log('DNS lookup failed:', e?.message || e);
  }

  const ip = (await dns.resolve4(host).catch(() => []))[0];
  if (ip) {
    console.log('');
    console.log(`TCP :443 → ${ip} (IPv4):`, await tcpProbe(ip, 443));
  }
  console.log(`TCP :443 → ${host} (IPv4):`, await tcpProbe(host, 443));

  console.log('');
  const health = await httpsRequest(`${baseUrl}/health`);
  if (health.error) {
    console.log('GET /health: FAILED —', health.error);
  } else {
    console.log('GET /health:', health.status, health.body.slice(0, 80));
  }

  const partnerUrl = `${baseUrl}/api/internal-partner/v1/provision`;
  const partner = await httpsRequest(partnerUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiSecret || 'missing'}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (partner.error) {
    console.log('POST partner /provision: FAILED —', partner.error);
  } else {
    console.log('POST partner /provision:', partner.status, partner.body.slice(0, 120));
    if (partner.status === 401 || partner.status === 403) {
      console.log('  ✓ TCP + HTTPS OK (401 = check INTERNAL_PARTNER_API_SECRET)');
    } else if (partner.status === 503) {
      console.log('  ✓ Connected — partner API not configured on directPay');
    }
  }

  console.log('\n--- If TCP or GET failed with ECONNREFUSED from this server ---');
  console.log('1. On directPay droplet (64.227.124.216): sudo ss -lntp | rg \':443\'');
  console.log('2. On directPay: sudo ufw allow from 165.22.77.92 to any port 443 proto tcp');
  console.log('3. DigitalOcean → directPay droplet → Networking → Firewall: allow HTTPS from 165.22.77.92');
  console.log('4. On 7-aside: pm2 restart 7-aside-backend --update-env (after .env is correct)');
  console.log('5. Confirm EASYPAY_API_BASE_URL=https://dpay.phantommetrics.gm (not localhost, not raw IP unless nginx serves it)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
