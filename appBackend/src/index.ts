import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
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

const app = express();
app.use(cors({ origin: '*', credentials: true }));
// Easypay → 7-aside webhooks require raw body bytes for HMAC (must run before express.json())
app.post('/webhooks/easypay-partner', express.raw({ type: 'application/json' }), (req: Request, res: Response) => {
  void handleEasypayPartnerWebhook(req, res);
});
app.use(express.json());
// simple request logger for debugging
app.use((req, _res, next) => {
  const { method, path: p } = req;
  const logBody = ['POST', 'PUT', 'PATCH'].includes(method) ? req.body : undefined;
  console.log(`[${new Date().toISOString()}] ${method} ${p}`, { query: req.query, body: logBody });
  next();
});
// serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: '7a-side-backend', time: new Date().toISOString() });
});

app.use('/app', appRoutes);
app.use('/auth', authRoutes);
app.use('/auth', emailAuthRoutes);
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


