import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma';
import { signJwt } from '../utils/jwt';

const router = Router();

router.post('/register-email', async (req: Request, res: Response) => {
  try {
    const { fullName, email, password, confirmPassword } = req.body as {
      fullName: string; email: string; password: string; confirmPassword: string;
    };
    if (!fullName || !email || !password || !confirmPassword) return res.status(400).json({ error: 'Missing fields' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match' });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already in use' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, name: fullName, passwordHash, provider: 'email' } });
    // For email provider, do not auto-login; ask user to sign in
    res.json({ message: 'Registration successful. Please sign in.', next: 'email_login' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Registration failed' });
  }
});

router.post('/login-email', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signJwt({ userId: user.id, email: user.email, name: user.name ?? undefined, provider: 'email' });
    // Persist session
    await prisma.session.create({ data: { userId: user.id, token } });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Login failed' });
  }
});

export default router;


