import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth';
import emailAuthRoutes from './routes/auth.email';
import appRoutes from './routes/app';
import fieldKycRoutes from './routes/fieldKyc';
import bookingRoutes from './routes/bookings';
import bookingsRoutes from './routes/bookings';
import adminRoutes from './routes/admin';
import payoutsRoutes from './routes/payouts';
import easypayRoutes from './routes/easypay';
import pushRoutes from './routes/push';
import { handleEasypayPartnerWebhook } from './routes/easypayWebhook';
import path from 'path';
import { assertSecurityEnv, getAllowedOrigins } from './config/env';
import { authRateLimiter } from './middleware/rateLimit';

assertSecurityEnv();

const SENSITIVE_BODY_KEYS = new Set([
  'password',
  'confirmPassword',
  'oldPassword',
  'newPassword',
  'confirmNewPassword',
  'idToken',
  'identityToken',
  'accessToken',
  'otp',
  'pin',
  'temporaryPassword',
]);

function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    out[key] = SENSITIVE_BODY_KEYS.has(key) ? '[REDACTED]' : value;
  }
  return out;
}

const app = express();
const allowedOrigins = getAllowedOrigins();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: false,
  }),
);

// Easypay → 7-aside webhooks require raw body bytes for HMAC (must run before express.json())
app.post('/webhooks/easypay-partner', express.raw({ type: 'application/json' }), (req: Request, res: Response) => {
  void handleEasypayPartnerWebhook(req, res);
});
app.use(express.json({ limit: '1mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    const { method, path: p } = req;
    const logBody = ['POST', 'PUT', 'PATCH'].includes(method) ? redactBody(req.body) : undefined;
    console.log(`[${new Date().toISOString()}] ${method} ${p}`, { query: req.query, body: logBody });
    next();
  });
} else {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`,
      );
    });
    next();
  });
}

// Public field images only — payment receipts must use authenticated routes
app.use('/uploads/fields', express.static(path.join(process.cwd(), 'uploads', 'fields')));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: '7a-side-backend', time: new Date().toISOString() });
});

app.use('/auth', authRateLimiter, authRoutes);
app.use('/auth', authRateLimiter, emailAuthRoutes);
app.use('/app', appRoutes);
app.use('/fields/kyc', fieldKycRoutes);
app.use('/bookings', bookingRoutes);
app.use('/fields/bookings', bookingsRoutes);
app.use('/admin', adminRoutes);
app.use('/payouts', payoutsRoutes);
app.use('/easypay', easypayRoutes);
app.use('/push', pushRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

export default app;
